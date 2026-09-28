// =============================================================
//  Verrouillage atomique d'une fiche (anti-collision avec Camille)
// =============================================================
//  La transaction porte sur /seo/{cle}/statut uniquement — et non
//  sur la fiche entière — pour deux raisons :
//    • l'atomicité ne concerne que le statut : c'est lui qui décide
//      qui « prend » la fiche ;
//    • une transaction sur la fiche entière re-téléchargerait puis
//      ré-enverrait les pièces jointes base64 à chaque tentative.
//
//  Ce module ne fournit que des PRIMITIVES. L'enchaînement et les
//  filets de sécurité vivent dans lib/flow.js, qui est pur et donc
//  testable hors ligne (y compris ses échecs partiels).
//
//  ⚠️ INACTIF EN DRY-RUN et hors liste blanche.
// =============================================================

import { ref, runTransaction, update, get } from "firebase/database";
import { assertWriteAllowed, assertTermineAllowed } from "./guard.js";
import { STATUT_A_FAIRE, STATUT_EN_COURS, STATUT_TERMINE } from "./statuts.js";
import { decisionClaim, decisionLiberation } from "./flow.js";

/**
 * Réserve une fiche : « afaire » → « encours ».
 *
 * ⚠️ POURQUOI UNE PRÉ-LECTURE AVANT LA TRANSACTION
 * Firebase peut appeler le callback d'une transaction avec `null`
 * alors que la donnée existe sur le serveur, simplement parce que le
 * cache local n'est pas encore rempli — ce qui est systématiquement
 * le cas au tout premier accès d'un processus court comme le nôtre.
 * Le callback avortait alors la transaction, et le robot concluait à
 * tort « déjà prise par quelqu'un d'autre » : une FAUSSE collision.
 *
 * Le `get()` préalable remplit le cache local, si bien que le callback
 * reçoit la vraie valeur dès son premier appel. La transaction reste
 * indispensable : elle garantit qu'un changement survenu entre le
 * `get()` et le commit fait échouer le claim proprement.
 *
 * @returns {Promise<{pris: boolean, raison: string, statutLu?: *, statutApres?: *}>}
 *   raison : "pris" | "occupee" | "course" | "disparue"
 */
export async function claimStatut(db, cle) {
  assertWriteAllowed(`réservation de la fiche ${cle} (afaire → encours)`, cle);

  const cible = ref(db, `seo/${cle}/statut`);

  // --- 1. Pré-lecture directe (remplit aussi le cache local) ---
  const snap = await get(cible);
  const statutLu = snap.exists() ? snap.val() : null;

  if (statutLu === null) {
    // Fiche ou champ absent : on ne crée jamais la donnée.
    return { pris: false, raison: "disparue", statutLu: null };
  }
  if (statutLu !== STATUT_A_FAIRE) {
    // Vraie occupation, constatée avant toute tentative d'écriture.
    return { pris: false, raison: "occupee", statutLu };
  }

  // --- 2. Transaction atomique, pour le cas d'un changement concurrent ---
  const res = await runTransaction(cible, decisionClaim);

  if (res.committed) return { pris: true, raison: "pris", statutLu };

  // Le pré-read voyait « afaire » mais le commit a échoué : quelqu'un
  // est passé entre les deux. Cas distinct d'une fiche déjà occupée.
  const statutApres = res.snapshot && res.snapshot.exists() ? res.snapshot.val() : null;
  return { pris: false, raison: "course", statutLu, statutApres };
}

/**
 * Métadonnées écrites juste après un claim réussi.
 * Reproduit exactement la logique de l'app (js/seo.js) pour ne pas
 * fausser le calcul des revenus.
 */
export async function ecrireMetaReservation(db, cle, identite) {
  assertWriteAllowed(`métadonnées de réservation de la fiche ${cle}`, cle);
  await update(ref(db, `seo/${cle}`), {
    termineAt: null,
    updatedAt: Date.now(),
    updatedBy: identite,
  });
}

/**
 * Repli d'urgence : « encours » → « afaire ».
 * N'écrit aucune métadonnée, pour maximiser ses chances d'aboutir
 * quand une écriture vient déjà d'échouer.
 *
 * Même pré-lecture que claimStatut, pour la même raison : sans elle,
 * un cache local vide ferait avorter la transaction et le robot
 * annoncerait à tort une libération non confirmée.
 *
 * @returns {Promise<boolean>} true si la fiche est bien en « afaire » à l'arrivée
 */
export async function remettreAFaire(db, cle) {
  assertWriteAllowed(`repli de la fiche ${cle} (encours → afaire)`, cle);

  const cible = ref(db, `seo/${cle}/statut`);

  const snap = await get(cible);
  const statutLu = snap.exists() ? snap.val() : null;

  // Objectif déjà atteint : la fiche est rendue. Ce n'est pas une erreur.
  if (statutLu === STATUT_A_FAIRE) return true;

  // Champ absent, ou fiche passée en « terminé » : on ne touche à rien
  // et on ne peut pas confirmer la libération.
  if (statutLu !== STATUT_EN_COURS) return false;

  const res = await runTransaction(cible, decisionLiberation);
  return res.committed === true;
}

/**
 * Libération normale : « encours » → « afaire » + métadonnées.
 */
export async function liberer(db, cle, identite) {
  const rendue = await remettreAFaire(db, cle);
  if (!rendue) return false;

  assertWriteAllowed(`métadonnées de libération de la fiche ${cle}`, cle);
  await update(ref(db, `seo/${cle}`), {
    termineAt: null,
    updatedAt: Date.now(),
    updatedBy: identite,
  });
  return true;
}

/**
 * Passage en « terminé ».
 * 🔒 Refusé tant que autoTermine vaut false dans robot/config.json.
 *    C'est volontaire : la validation finale reste humaine.
 *    Ce chemin n'est JAMAIS emprunté par lib/flow.js.
 */
export async function marquerTermine(db, cle, identite) {
  assertTermineAllowed(cle);

  const cible = ref(db, `seo/${cle}/statut`);

  // Même pré-lecture que claimStatut : sans elle, un cache local vide
  // ferait avorter la transaction et signalerait un faux échec.
  const snap = await get(cible);
  const statutLu = snap.exists() ? snap.val() : null;
  if (statutLu !== STATUT_EN_COURS) return false;

  const res = await runTransaction(cible, (statutActuel) => {
    if (statutActuel === null || statutActuel === undefined) return;
    if (statutActuel !== STATUT_EN_COURS) return;
    return STATUT_TERMINE;
  });

  if (res.committed) {
    const maintenant = Date.now();
    await update(ref(db, `seo/${cle}`), {
      termineAt: maintenant,   // pilote le calcul des revenus — ne jamais réécrire ensuite
      updatedAt: maintenant,
      updatedBy: identite,
    });
  }
  return res.committed;
}
