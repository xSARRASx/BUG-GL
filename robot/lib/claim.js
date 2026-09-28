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

import { ref, runTransaction, update } from "firebase/database";
import { assertWriteAllowed, assertTermineAllowed } from "./guard.js";
import { STATUT_A_FAIRE, STATUT_EN_COURS, STATUT_TERMINE } from "./detect.js";

/**
 * Transaction seule : « afaire » → « encours ».
 * N'écrit AUCUNE métadonnée : c'est le point d'atomicité, rien d'autre.
 * @returns {Promise<boolean>} true si le robot a obtenu la fiche
 */
export async function claimStatut(db, cle) {
  assertWriteAllowed(`réservation de la fiche ${cle} (afaire → encours)`, cle);

  const res = await runTransaction(ref(db, `seo/${cle}/statut`), (statutActuel) => {
    // undefined = on abandonne la transaction sans rien écrire
    if (statutActuel !== STATUT_A_FAIRE) return;
    return STATUT_EN_COURS;
  });

  return res.committed;
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
 * Repli d'urgence : transaction seule « encours » → « afaire ».
 * N'écrit aucune métadonnée, pour maximiser ses chances d'aboutir
 * quand une écriture vient déjà d'échouer.
 */
export async function remettreAFaire(db, cle) {
  assertWriteAllowed(`repli de la fiche ${cle} (encours → afaire)`, cle);

  const res = await runTransaction(ref(db, `seo/${cle}/statut`), (statutActuel) => {
    if (statutActuel !== STATUT_EN_COURS) return;
    return STATUT_A_FAIRE;
  });

  return res.committed;
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

  const res = await runTransaction(ref(db, `seo/${cle}/statut`), (statutActuel) => {
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
