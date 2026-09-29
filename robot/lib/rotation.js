// =============================================================
//  Sélection des fiches à auditer — module PUR
// =============================================================
//  PROBLÈME RÉSOLU ICI
//  listerAFaire() trie les fiches de la plus ancienne à la plus
//  récente, et le robot n'en audite que `max` par passage. Sans
//  rotation, ce sont toujours les mêmes fiches qui passent, et les
//  suivantes ne sont jamais auditées.
//
//  SOLUTION : une rotation déterministe basée sur le TEMPS, sans
//  écrire le moindre état en base. Chaque créneau de 15 minutes
//  décale la fenêtre de sélection de `max` fiches.
//
//  Déterministe et testable : le créneau est injectable.
// =============================================================

/** Durée d'un créneau : la période du cron. */
export const DUREE_CRENEAU_MS = 15 * 60 * 1000;

/** Numéro du créneau courant. Deux exécutions de la même tranche de 15 min le partagent. */
export function creneauActuel(maintenant = Date.now()) {
  return Math.floor(maintenant / DUREE_CRENEAU_MS);
}

/**
 * Choisit les fiches à auditer pour ce passage.
 *
 * La fenêtre glisse de `max` fiches à chaque créneau, en boucle sur
 * la liste. Avec 6 fiches et max=2 : créneau n → [0,1], n+1 → [2,3],
 * n+2 → [4,5], n+3 → [0,1]… Les 6 sont donc couvertes en 3 passages.
 *
 * ⚠️ Seules les fiches TRAITABLES entrent ici : une fiche bloquée ne
 * doit pas consommer une place d'audit.
 *
 * @param {Array} traitables  fiches déjà filtrées, dans un ordre stable
 * @param {number} max        nombre d'audits autorisés par passage
 * @param {number} [creneau]  injectable pour les tests
 * @returns {Array} sous-ensemble de `traitables`
 */
export function selectionnerPourAudit(traitables, max, creneau = creneauActuel()) {
  const liste = Array.isArray(traitables) ? traitables : [];
  const n = liste.length;
  const m = Math.max(0, Math.floor(Number(max) || 0));

  if (n === 0 || m === 0) return [];
  if (n <= m) return [...liste];   // tout tient dans un passage

  // Nombre de fenêtres nécessaires pour couvrir toute la liste.
  const nbFenetres = Math.ceil(n / m);
  const fenetre = ((Math.floor(creneau) % nbFenetres) + nbFenetres) % nbFenetres;
  const debut = fenetre * m;

  const choisies = [];
  for (let i = 0; i < m && choisies.length < n; i++) {
    choisies.push(liste[(debut + i) % n]);
  }
  // Une fenêtre qui déborde peut reprendre le début : on dédoublonne.
  return [...new Set(choisies)];
}

/**
 * Nombre de passages nécessaires pour que toutes les fiches soient
 * auditées au moins une fois. Sert aux tests et aux logs.
 */
export function passagesPourToutCouvrir(nbFiches, max) {
  const m = Math.max(1, Math.floor(Number(max) || 0));
  return Math.ceil(Math.max(0, nbFiches) / m);
}
