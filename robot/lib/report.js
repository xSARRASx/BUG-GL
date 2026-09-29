// =============================================================
//  Écriture du compte rendu — sans jamais écraser les notes
// =============================================================
//  Le champ `note` est unique et remplacé en entier par l'app. Un
//  simple lire-puis-écrire perdrait le texte que Camille aurait saisi
//  entre-temps.
//
//  On passe donc par une écriture conditionnelle REST
//  (ETag / If-Match) via lib/rest.js. Si la note a changé entre la
//  lecture et l'écriture, Firebase renvoie 412 : rest.js relit alors
//  le texte à jour, ce module le recompose, et l'écriture est
//  retentée. La modification de Camille est ainsi toujours conservée.
//
//  L'ancienne implémentation utilisait runTransaction(), qui ne
//  fonctionne pas dans un processus Node court — voir l'en-tête de
//  lib/rest.js.
//
//  La composition du texte vit dans lib/note.js, sans aucune
//  dépendance, ce qui la rend testable hors ligne.
//
//  ⚠️ Le contenu de la note ne doit JAMAIS être journalisé : le
//  résultat renvoyé ici ne contient que des états et des compteurs.
//  ⚠️ INACTIF EN DRY-RUN et hors liste blanche.
// =============================================================

import { assertWriteAllowed } from "./guard.js";
import { composerNote } from "./note.js";

export { entete, composerNote } from "./note.js";

/** Nombre de recompositions tentées avant d'abandonner proprement. */
export const MAX_TENTATIVES_RAPPORT = 4;

/**
 * Ajoute un compte rendu à la fin de la note existante.
 * La note précédente est intégralement préservée, y compris si elle
 * est modifiée pendant l'opération.
 *
 * @param {object} rest   client créé par creerClientRest()
 * @param {string} cle    clé Firebase de la fiche
 * @param {string} corps  texte du compte rendu
 * @param {Date}   [date]
 * @param {object} [options]
 * @param {number} [options.maxTentatives]
 * @returns {Promise<{ok: boolean, raison: string, tentatives: number, http?: number}>}
 *   ok:true uniquement sur un 200 confirmé. Aucun contenu de note dans le retour.
 */
export async function ajouterRapport(rest, cle, corps, date = new Date(), options = {}) {
  assertWriteAllowed(`ajout d'un compte rendu sur /seo/${cle}/note`, cle);

  return rest.modifierConditionnel(
    rest.cheminNote(cle),
    // Recomposé à CHAQUE tentative, à partir de la note la plus récente.
    (noteActuelle) => composerNote(noteActuelle, corps, date),
    { maxTentatives: options.maxTentatives || MAX_TENTATIVES_RAPPORT }
  );
}
