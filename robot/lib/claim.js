// =============================================================
//  Transitions de statut du robot (anti-collision avec Camille)
// =============================================================
//  Les transitions passent par des requêtes REST conditionnelles
//  (ETag / If-Match), et NON par runTransaction() : voir l'en-tête de
//  lib/rest.js pour le détail du problème de cache constaté lors du
//  test actif #8.
//
//  Ce module ne fournit que des PRIMITIVES. L'enchaînement et les
//  filets de sécurité vivent dans lib/flow.js, qui est pur et donc
//  testable hors ligne.
//
//  ⚠️ INACTIF EN DRY-RUN et hors liste blanche : assertWriteAllowed()
//  lève avant toute requête.
// =============================================================

import { ref, update } from "firebase/database";
import { assertWriteAllowed, assertTermineAllowed } from "./guard.js";
import { STATUT_A_FAIRE, STATUT_EN_COURS, STATUT_TERMINE } from "./statuts.js";
import { RAISONS } from "./rest.js";

/**
 * Réserve une fiche : « afaire » → « encours ».
 *
 * Refus sans aucune écriture si le GET voit « encours », « termine »
 * ou rien du tout.
 *
 * @returns {Promise<{pris: boolean, raison: string, statutLu?: *, http?: number}>}
 *   raison : "pris" | "occupee" | "course" | "disparue" | "autorisation" | "reseau" | "http"
 */
export async function claimStatut(rest, cle) {
  assertWriteAllowed(`réservation de la fiche ${cle} (afaire → encours)`, cle);

  const res = await rest.changerStatutConditionnel(cle, STATUT_A_FAIRE, STATUT_EN_COURS);

  if (res.ok) return { pris: true, raison: "pris", statutLu: res.statutLu };

  switch (res.raison) {
    case RAISONS.COURSE:
      // 412 : la fiche a changé entre le GET et le PUT. Vraie course.
      return { pris: false, raison: "course", statutLu: res.statutLu, http: res.http };
    case RAISONS.SOURCE_DIFFERENTE:
      return { pris: false, raison: "occupee", statutLu: res.statutLu };
    case RAISONS.ABSENT:
      return { pris: false, raison: "disparue", statutLu: null };
    default:
      // autorisation, réseau, etag absent, http : erreurs, pas des collisions.
      return { pris: false, raison: res.raison, statutLu: res.statutLu, http: res.http };
  }
}

/**
 * Métadonnées écrites juste après un claim réussi.
 * Écriture simple (pas de condition) : l'atomicité portait sur le statut.
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
 * Repli d'urgence : « encours » → « afaire », statut seul.
 *
 * Une fiche déjà en « afaire » compte comme un succès : l'objectif est
 * atteint. En revanche, un statut absent ou « termine » est un refus :
 * on ne peut pas confirmer la libération, et on ne touche jamais à une
 * fiche terminée.
 *
 * @returns {Promise<boolean>} true si la fiche est bien en « afaire » à l'arrivée
 */
export async function remettreAFaire(rest, cle) {
  assertWriteAllowed(`repli de la fiche ${cle} (encours → afaire)`, cle);

  const res = await rest.changerStatutConditionnel(cle, STATUT_EN_COURS, STATUT_A_FAIRE, {
    dejaCibleEstSucces: true,
  });

  return res.ok === true;
}

/**
 * Libération normale : « encours » → « afaire » + métadonnées.
 */
export async function liberer(db, rest, cle, identite) {
  const rendue = await remettreAFaire(rest, cle);
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
 *    Ce chemin n'est JAMAIS emprunté par lib/flow.js.
 */
export async function marquerTermine(db, rest, cle, identite) {
  assertTermineAllowed(cle);

  const res = await rest.changerStatutConditionnel(cle, STATUT_EN_COURS, STATUT_TERMINE);
  if (!res.ok) return false;

  const maintenant = Date.now();
  await update(ref(db, `seo/${cle}`), {
    termineAt: maintenant,   // pilote le calcul des revenus — ne jamais réécrire ensuite
    updatedAt: maintenant,
    updatedBy: identite,
  });
  return true;
}
