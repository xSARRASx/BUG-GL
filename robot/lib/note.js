// =============================================================
//  Composition du compte rendu — logique PURE
// =============================================================
//  Aucune dépendance : ni Firebase, ni réseau. Ce module contient
//  la seule logique qui décide du texte final de la note, ce qui
//  la rend testable hors ligne (voir scripts/selftest.js).
//
//  report.js se contente de l'appeler à l'intérieur de sa
//  transaction Firebase.
// =============================================================

/** En-tête qui identifie clairement un ajout du robot. */
export function entete(date = new Date()) {
  const jour = date.toISOString().slice(0, 10);
  return `--- Compte rendu Robot SEO — ${jour} ---`;
}

/**
 * Calcule la nouvelle valeur du champ `note`.
 * La note existante est TOUJOURS préservée : on ajoute à la fin.
 *
 * @param {string|null|undefined} noteActuelle  valeur lue dans Firebase
 * @param {string} corps                        texte du compte rendu
 * @param {Date}   date
 * @returns {string} la note complète à écrire
 */
export function composerNote(noteActuelle, corps, date = new Date()) {
  const bloc = `${entete(date)}\n${String(corps).trim()}`;
  const existant = typeof noteActuelle === "string" ? noteActuelle : "";
  if (existant.trim() === "") return bloc;
  return `${existant.trimEnd()}\n\n${bloc}`;
}
