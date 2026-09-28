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
//  Si Camille modifie la fiche au même instant, un seul des deux
//  gagne : l'autre voit statut ≠ "afaire" et abandonne proprement.
//
//  ⚠️ INACTIF EN DRY-RUN : assertWriteAllowed() lève avant toute
//  écriture.
// =============================================================

import { ref, runTransaction, update } from "firebase/database";
import { assertWriteAllowed, assertTermineAllowed } from "./guard.js";
import { STATUT_A_FAIRE, STATUT_EN_COURS, STATUT_TERMINE } from "./detect.js";
import { log } from "./log.js";

/**
 * Tente de réserver une fiche : « afaire » → « encours ».
 * @returns {Promise<boolean>} true si le robot a obtenu la fiche
 */
export async function reserver(db, cle, identite) {
  assertWriteAllowed(`réservation de la fiche ${cle} (afaire → encours)`, cle);

  const cible = ref(db, `seo/${cle}/statut`);
  const res = await runTransaction(cible, (statutActuel) => {
    // undefined = on abandonne la transaction sans rien écrire
    if (statutActuel !== STATUT_A_FAIRE) return;
    return STATUT_EN_COURS;
  });

  if (!res.committed) {
    log.ignore(`Fiche ${cle} : déjà prise par quelqu'un d'autre, on passe.`);
    return false;
  }

  // Métadonnées, dans un second temps : le verrou est déjà acquis.
  // On reproduit exactement la logique de l'app (js/seo.js) pour ne pas
  // fausser le calcul des revenus.
  await update(ref(db, `seo/${cle}`), {
    termineAt: null,
    updatedAt: Date.now(),
    updatedBy: identite,
  });

  log.ok(`Fiche ${cle} réservée (encours).`);
  return true;
}

/**
 * Rend une fiche au pot commun : « encours » → « afaire ».
 * Utilisé en cas d'échec, ou pour libérer un verrou périmé.
 */
export async function liberer(db, cle, identite) {
  assertWriteAllowed(`libération de la fiche ${cle} (encours → afaire)`, cle);

  const res = await runTransaction(ref(db, `seo/${cle}/statut`), (statutActuel) => {
    if (statutActuel !== STATUT_EN_COURS) return;
    return STATUT_A_FAIRE;
  });

  if (res.committed) {
    await update(ref(db, `seo/${cle}`), {
      termineAt: null,
      updatedAt: Date.now(),
      updatedBy: identite,
    });
    log.ok(`Fiche ${cle} libérée (afaire).`);
  }
  return res.committed;
}

/**
 * Passage en « terminé ».
 * 🔒 Refusé tant que autoTermine vaut false dans robot/config.json.
 *    C'est volontaire : la validation finale reste humaine.
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
