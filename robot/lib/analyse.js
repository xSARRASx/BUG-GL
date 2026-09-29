// =============================================================
//  Analyse SEO — STUB
// =============================================================
//  ⚠️ Ce module ne fait VOLONTAIREMENT rien.
//
//  Ni OpenAI ni OpenSEO ne sont branchés, et WordPress n'est jamais
//  touché. Tant que ce stub est en place, le flux s'arrête à
//  « analyse indisponible » et la fiche est rendue telle qu'elle a
//  été prise : aucun compte rendu n'est écrit.
//
//  L'analyse fictive qui a servi à valider l'écriture du compte
//  rendu en conditions réelles (commit 31e1ad2) a été retirée. La
//  chaîne complète est donc vérifiée : détection, vérification,
//  verrou REST conditionnel, état /seoRobot, écriture du rapport
//  avec ETag / If-Match, et préservation de la note existante.
//
//  Quand le moment viendra, c'est le SEUL fichier à remplacer :
//  tout le reste de la chaîne est déjà en place et éprouvé.
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
    motif: "Analyse réelle non encore branchée (stub volontaire).",
  };
}
