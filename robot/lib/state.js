// =============================================================
//  État du traitement — nœud /seoRobot
// =============================================================
//  Volontairement SÉPARÉ de /seo :
//    • le schéma des fiches SEO reste intact ;
//    • l'app fait un onValue sur tout /seo — chaque battement de
//      cœur du robot provoquerait un re-render chez Camille ;
//    • ce nœud peut recevoir ses propres règles Firebase.
//
//  ⚠️ INACTIF EN DRY-RUN.
//  ⚠️ N'écrire ici AUCUNE donnée client : uniquement des états.
// =============================================================

import { ref, get, set, update, remove } from "firebase/database";
import { assertWriteAllowed } from "./guard.js";

export const ETATS = {
  RESERVE: "reserve",               // fiche verrouillée, traitement non commencé
  ANALYSE: "analyse",               // analyse SEO en cours
  RAPPORT_ECRIT: "rapport_ecrit",   // compte rendu ajouté à la note
  PRET_A_VALIDER: "pret_a_valider", // terminé côté robot, attend une validation humaine
  ECHEC: "echec",                   // erreur, fiche libérée
};

const chemin = (cle) => `seoRobot/${cle}`;

export async function lireEtat(db, cle) {
  const snap = await get(ref(db, chemin(cle)));
  return snap.val() || null;
}

/** Crée l'entrée d'état au moment de la réservation. */
export async function demarrer(db, cle, identite) {
  assertWriteAllowed(`création de l'état /seoRobot/${cle}`);
  const maintenant = Date.now();
  await set(ref(db, chemin(cle)), {
    etat: ETATS.RESERVE,
    parQui: identite,
    startedAt: maintenant,
    heartbeat: maintenant,
    tentatives: 1,
    derniereErreur: null,
  });
}

/** Met à jour l'état et rafraîchit le battement de cœur. */
export async function avancer(db, cle, etat, extra = {}) {
  assertWriteAllowed(`mise à jour de l'état /seoRobot/${cle} → ${etat}`);
  await update(ref(db, chemin(cle)), {
    etat,
    heartbeat: Date.now(),
    ...extra,
  });
}

/** Signale un échec. Le message est déjà nettoyé par l'appelant. */
export async function echouer(db, cle, messageNettoye) {
  assertWriteAllowed(`enregistrement d'un échec sur /seoRobot/${cle}`);
  await update(ref(db, chemin(cle)), {
    etat: ETATS.ECHEC,
    heartbeat: Date.now(),
    derniereErreur: messageNettoye,
  });
}

export async function effacer(db, cle) {
  assertWriteAllowed(`suppression de l'état /seoRobot/${cle}`);
  await remove(ref(db, chemin(cle)));
}

/**
 * Un verrou est périmé si son battement de cœur date de plus de
 * `maxAgeMs`. Permet de récupérer une fiche laissée en « encours »
 * par un job qui a planté.
 */
export function verrouPerime(etat, maxAgeMs) {
  if (!etat || !etat.heartbeat) return false;
  return (Date.now() - etat.heartbeat) > maxAgeMs;
}
