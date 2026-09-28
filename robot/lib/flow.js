// =============================================================
//  Flux de traitement avec filet de sécurité — logique PURE
// =============================================================
//  Aucune dépendance : ni Firebase, ni réseau. Toutes les écritures
//  passent par l'objet `ops` injecté, ce qui rend ce flux testable
//  hors ligne, y compris ses cas d'échec partiel.
//
//  INVARIANT CENTRAL
//  -----------------
//  Dès lors que le claim « afaire → encours » a réussi, la fiche ne
//  doit JAMAIS rester bloquée en « encours » à cause d'une erreur.
//  Seul le chemin nominal (rapport écrit, prêt à valider) la laisse
//  volontairement en « encours », en attente d'une validation humaine.
//
//  Le statut « termine » n'est jamais écrit ici.
// =============================================================

export const ISSUES = {
  COLLISION: "collision",
  ECHEC_RESERVATION: "echec_reservation",
  ANALYSE_INDISPONIBLE: "analyse_indisponible",
  PRET_A_VALIDER: "pret_a_valider",
  ECHEC: "echec",
};

/**
 * Réserve une fiche, en garantissant qu'un échec partiel ne la laisse
 * pas en « encours ».
 *
 * Le point délicat : la transaction de statut peut réussir alors que
 * l'écriture des métadonnées qui suit échoue. Sans filet, la fiche
 * resterait bloquée. On la remet donc immédiatement en « afaire ».
 *
 * ops requis : claimStatut, ecrireMetaReservation, remettreAFaire
 */
export async function reserverAvecFilet(ops, cle, identite) {
  const pris = await ops.claimStatut(cle);
  if (!pris) return { obtenue: false, motif: "collision" };

  try {
    await ops.ecrireMetaReservation(cle, identite);
  } catch (erreur) {
    // Statut déjà passé en « encours » mais métadonnées en échec :
    // on rend la fiche sans attendre.
    try {
      await ops.remettreAFaire(cle);
      return { obtenue: false, motif: "meta_echec_rollback_ok", erreur };
    } catch (erreurRollback) {
      // Cas le plus grave : la fiche reste en « encours ». Signalé
      // explicitement pour que l'appelant l'affiche en alerte.
      return { obtenue: false, motif: "meta_echec_rollback_echoue", erreur, erreurRollback };
    }
  }

  return { obtenue: true };
}

/**
 * Traite une fiche de bout en bout, avec libération garantie.
 *
 * ops requis :
 *   claimStatut, ecrireMetaReservation, remettreAFaire   (réservation)
 *   demarrerEtat, avancerEtat, tenterEtatEchec           (/seoRobot)
 *   analyser, ajouterRapport                             (traitement)
 *   libererSurement                                      (filet final)
 *
 * `tenterEtatEchec` et `libererSurement` sont « best effort » :
 * ils ne doivent jamais lever d'exception.
 */
export async function traiterAvecFilet(ops, cle, identite, contexte) {
  const reservation = await reserverAvecFilet(ops, cle, identite);

  if (!reservation.obtenue) {
    return {
      issue: reservation.motif === "collision" ? ISSUES.COLLISION : ISSUES.ECHEC_RESERVATION,
      detail: reservation,
    };
  }

  // À partir d'ici la fiche est en « encours » : tout chemin de sortie
  // doit passer par le bloc finally.
  let issue = ISSUES.ECHEC;
  let resultatFinal;

  try {
    await ops.demarrerEtat(cle, identite);
    await ops.avancerEtat(cle, "analyse");

    const analyse = await ops.analyser(contexte);

    if (!analyse || !analyse.disponible) {
      issue = ISSUES.ANALYSE_INDISPONIBLE;
      await ops.tenterEtatEchec(cle, (analyse && analyse.motif) || "Analyse indisponible");
      resultatFinal = { issue, motif: analyse && analyse.motif };
      return resultatFinal;
    }

    await ops.ajouterRapport(cle, analyse.rapport);
    await ops.avancerEtat(cle, "rapport_ecrit");
    await ops.avancerEtat(cle, "pret_a_valider");

    issue = ISSUES.PRET_A_VALIDER;
    resultatFinal = { issue };
    return resultatFinal;
  } catch (erreur) {
    issue = ISSUES.ECHEC;
    await ops.tenterEtatEchec(cle, erreur);
    resultatFinal = { issue, erreur };
    return resultatFinal;
  } finally {
    // Seul le chemin nominal laisse la fiche en « encours » : elle attend
    // alors une validation humaine. Tous les autres chemins la rendent.
    if (issue !== ISSUES.PRET_A_VALIDER) {
      const libere = await ops.libererSurement(cle, identite);
      if (resultatFinal) resultatFinal.libere = libere;
    }
  }
}
