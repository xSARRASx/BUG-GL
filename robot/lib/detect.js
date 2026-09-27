// =============================================================
//  Détection des fiches à traiter
// =============================================================
//  Lecture SEULE. Utilise l'index .indexOn: ["statut"] afin de ne
//  télécharger que les fiches « à faire » — et surtout pas tout
//  /seo, dont les pièces jointes base64 consommeraient le quota
//  Spark (10 Go/mois) très vite.
// =============================================================

import { ref, query, orderByChild, equalTo, get } from "firebase/database";
import { log } from "./log.js";

export const STATUT_A_FAIRE = "afaire";
export const STATUT_EN_COURS = "encours";
export const STATUT_TERMINE = "termine";

/**
 * Récupère les fiches dont le statut vaut « afaire ».
 * @returns {Promise<Array<object>>} fiches, chacune avec son id garanti
 */
export async function listerAFaire(db) {
  const requete = query(ref(db, "seo"), orderByChild("statut"), equalTo(STATUT_A_FAIRE));
  const snap = await get(requete);
  const brut = snap.val() || {};

  const fiches = Object.entries(brut).map(([cle, fiche]) => ({
    ...fiche,
    id: fiche && fiche.id ? fiche.id : cle,
    _cle: cle, // clé Firebase réelle, seule source de vérité pour écrire
  }));

  // Les plus anciennes d'abord : on traite dans l'ordre d'arrivée.
  fiches.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  log.info(`${fiches.length} fiche(s) au statut « à faire ».`);
  return fiches;
}

/** Relit une fiche unique (utile juste avant un claim, pour vérifier qu'elle n'a pas bougé). */
export async function lireFiche(db, cle) {
  const snap = await get(ref(db, "seo/" + cle));
  const fiche = snap.val();
  if (!fiche) return null;
  return { ...fiche, id: fiche.id || cle, _cle: cle };
}
