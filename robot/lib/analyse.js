// =============================================================
//  Analyse SEO — STUB (V1)
// =============================================================
//  ⚠️ Ce module ne fait VOLONTAIREMENT rien en V1.
//
//  Ni OpenAI ni OpenSEO ne sont branchés, et WordPress n'est jamais
//  touché. L'objectif de la V1 est de valider la mécanique complète
//  — détection, vérification, verrou, état, rapport — avant d'y
//  connecter une véritable analyse.
//
//  Quand le moment viendra, c'est le SEUL fichier à remplacer :
//  tout le reste de la chaîne est déjà en place.
// =============================================================

/**
 * Point d'entrée de l'analyse.
 * @param {object} _contexte  contexte non identifiant issu de validate.verifier()
 * @returns {Promise<{disponible: boolean, rapport: string|null}>}
 */
export async function analyser(_contexte) {
  return {
    disponible: false,
    rapport: null,
    motif: "Analyse non branchée en V1 (stub volontaire).",
  };
}
