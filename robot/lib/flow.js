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
//  ⚠️ DEUX FAÇONS D'ÉCHOUER
//  Les primitives de transaction ne lèvent pas toujours : elles
//  renvoient `false` quand la transaction n'a pas été commitée (le
//  statut n'était pas celui attendu). Un `false` n'est donc PAS un
//  succès — c'est une libération NON CONFIRMÉE, traitée ici avec la
//  même gravité qu'une exception. Ne jamais annoncer « fiche rendue »
//  sans avoir reçu `true`.
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

export const MOTIFS = {
  COLLISION: "collision",
  ROLLBACK_OK: "meta_echec_rollback_ok",
  ROLLBACK_NON_CONFIRME: "meta_echec_rollback_non_confirme",
  ROLLBACK_ECHOUE: "meta_echec_rollback_echoue",
};

/** Vrai seulement si le rollback laisse la fiche dans un état sûr. */
export function rollbackConfirme(motif) {
  return motif === MOTIFS.ROLLBACK_OK;
}

function journalSur(journal = {}) {
  const rien = () => {};
  return {
    ok: journal.ok || rien,
    alerte: journal.alerte || rien,
    erreur: journal.erreur || rien,
    format: journal.format || ((e) => (e && e.message ? e.message : String(e))),
  };
}

/**
 * Libère une fiche « encours » → « afaire », avec repli.
 *
 * prim.liberer(cle, identite)  → true si statut ET métadonnées écrits
 * prim.remettreAFaire(cle)     → true si le statut seul a été commité
 *
 * Les deux peuvent lever OU renvoyer false : les deux cas sont des
 * échecs. Seul un `true` autorise à annoncer une libération.
 *
 * @returns {Promise<boolean>} true uniquement si la libération est CONFIRMÉE
 */
export async function libererAvecRepli(prim, cle, identite, journal) {
  const dire = journalSur(journal);

  // --- 1. Libération normale : statut + métadonnées ---
  try {
    const rendue = await prim.liberer(cle, identite);
    if (rendue === true) {
      dire.ok(`Fiche ${cle} rendue (afaire).`);
      return true;
    }
    dire.alerte(`Fiche ${cle} : libération non confirmée (transaction non commitée) — tentative de repli.`);
  } catch (e) {
    dire.alerte(`Fiche ${cle} : libération impossible (${dire.format(e)}) — tentative de repli.`);
  }

  // --- 2. Repli : statut seul, plus de chances d'aboutir ---
  try {
    const repliee = await prim.remettreAFaire(cle);
    if (repliee === true) {
      dire.ok(`Fiche ${cle} rendue par repli (statut seul).`);
      return true;
    }
    dire.erreur(`⛔ Fiche ${cle} : libération NON CONFIRMÉE — le statut n'a pas pu être ramené à « afaire ».`);
    dire.erreur("   Vérification manuelle nécessaire dans la console Firebase.");
    return false;
  } catch (e2) {
    dire.erreur(`⛔ Fiche ${cle} LAISSÉE EN « encours » : ${dire.format(e2)}`);
    dire.erreur("   Intervention manuelle nécessaire dans la console Firebase.");
    return false;
  }
}

/**
 * Réserve une fiche, en garantissant qu'un échec partiel ne la laisse
 * pas en « encours ».
 *
 * Le point délicat : la transaction de statut peut réussir alors que
 * l'écriture des métadonnées qui suit échoue. Sans filet, la fiche
 * resterait bloquée. On la remet donc immédiatement en « afaire » —
 * et on VÉRIFIE que ce rollback a bien été commité.
 *
 * ops requis : claimStatut, ecrireMetaReservation, remettreAFaire
 */
export async function reserverAvecFilet(ops, cle, identite) {
  const pris = await ops.claimStatut(cle);
  if (pris !== true) return { obtenue: false, motif: MOTIFS.COLLISION };

  try {
    await ops.ecrireMetaReservation(cle, identite);
  } catch (erreur) {
    // Statut déjà passé en « encours » mais métadonnées en échec :
    // on rend la fiche sans attendre.
    try {
      const rendue = await ops.remettreAFaire(cle);
      if (rendue === true) {
        return { obtenue: false, motif: MOTIFS.ROLLBACK_OK, erreur };
      }
      // Transaction non commitée : le rollback n'est PAS confirmé.
      // Traité avec la même gravité qu'une exception.
      return { obtenue: false, motif: MOTIFS.ROLLBACK_NON_CONFIRME, erreur };
    } catch (erreurRollback) {
      return { obtenue: false, motif: MOTIFS.ROLLBACK_ECHOUE, erreur, erreurRollback };
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
 * `tenterEtatEchec` ne doit jamais lever.
 * `libererSurement` ne doit jamais lever et renvoie true UNIQUEMENT
 * si la libération est confirmée.
 */
export async function traiterAvecFilet(ops, cle, identite, contexte) {
  const reservation = await reserverAvecFilet(ops, cle, identite);

  if (!reservation.obtenue) {
    return {
      issue: reservation.motif === MOTIFS.COLLISION ? ISSUES.COLLISION : ISSUES.ECHEC_RESERVATION,
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
      // `libere` vaut true UNIQUEMENT si la libération est confirmée.
      if (resultatFinal) resultatFinal.libere = libere === true;
    }
  }
}
