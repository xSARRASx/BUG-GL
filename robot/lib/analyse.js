// =============================================================
//  Analyse SEO — ANALYSE FICTIVE TEMPORAIRE
// =============================================================
//  🚧 CE FICHIER EST TEMPORAIRE — À REMETTRE EN STUB APRÈS LE TEST
//
//  Il ne réalise AUCUNE analyse SEO. Il renvoie un rapport factice
//  dont le seul but est d'exercer la chaîne d'écriture du compte
//  rendu en conditions réelles :
//     lecture GET avec X-Firebase-ETag
//     recomposition par composerNote()
//     PUT conditionné par If-Match
//     préservation intégrale de la note existante
//
//  Ni OpenAI, ni OpenSEO, ni WordPress ne sont sollicités.
//  Aucune requête sortante n'est émise depuis ce module.
//
//  PORTÉE DE L'ÉCRITURE
//  --------------------
//  Ce module ne choisit PAS quelle fiche est écrite. Deux verrous en
//  amont s'en chargent, et aucun ne dépend de ce fichier :
//    1. index.js ignore toute fiche absente de allowedTestIds avant
//       même de tenter la réservation ;
//    2. guard.assertWriteAllowed(cle) lève sur toute clé hors liste.
//  Seule la fiche -P2atEDbwnjG7JWnxhH2 peut donc être touchée.
//
//  APRÈS LE TEST
//  -------------
//  Restaurer le stub : { disponible: false, rapport: null }.
// =============================================================

/** Texte écrit dans la note. Volontairement explicite et inoffensif. */
export const RAPPORT_FICTIF =
  "TEST TECHNIQUE ROBOT SEO — rapport fictif — aucune analyse SEO réelle n'a été exécutée.";

/**
 * Point d'entrée de l'analyse.
 * @param {object} _contexte  contexte non identifiant issu de validate.verifier()
 * @returns {Promise<{disponible: boolean, rapport: string|null, fictif: boolean}>}
 */
export async function analyser(_contexte) {
  return {
    disponible: true,
    rapport: RAPPORT_FICTIF,
    fictif: true,
  };
}
