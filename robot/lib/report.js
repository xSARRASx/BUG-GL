// =============================================================
//  Écriture du compte rendu — sans jamais écraser les notes
// =============================================================
//  Le champ `note` est unique et remplacé en entier par l'app.
//  Un simple lire-puis-écrire perdrait le texte que Camille aurait
//  saisi entre-temps. On passe donc par une TRANSACTION sur
//  /seo/{cle}/note : la lecture et la concaténation sont atomiques,
//  et Firebase rejoue l'opération si la valeur a changé.
//
//  La logique de composition du texte vit dans lib/note.js, sans
//  aucune dépendance, ce qui la rend testable hors ligne.
//
//  🚨 DETTE CONNUE — À CORRIGER AVANT DE BRANCHER L'ANALYSE
//  Cette transaction souffre du MÊME défaut que celles qui ont été
//  retirées de claim.js : dans un processus Node court, le callback
//  reçoit `null`, la transaction est avortée et n'est jamais rejouée.
//  Le compte rendu ne serait donc pas écrit.
//
//  Ce chemin est aujourd'hui INATTEIGNABLE — analyse.js est un stub,
//  donc ajouterRapport() n'est jamais appelé. Il faudra le porter sur
//  une requête REST conditionnelle (voir lib/rest.js) au moment de
//  brancher une vraie analyse.
//
//  ⚠️ INACTIF EN DRY-RUN et hors liste blanche.
// =============================================================

import { ref, runTransaction } from "firebase/database";
import { assertWriteAllowed } from "./guard.js";
import { composerNote } from "./note.js";

export { entete, composerNote } from "./note.js";

/**
 * Ajoute un compte rendu à la fin de la note existante.
 * La note précédente est intégralement préservée.
 */
export async function ajouterRapport(db, cle, corps, date = new Date()) {
  assertWriteAllowed(`ajout d'un compte rendu sur /seo/${cle}/note`, cle);

  const res = await runTransaction(ref(db, `seo/${cle}/note`), (noteActuelle) =>
    composerNote(noteActuelle, corps, date)
  );

  return res.committed;
}
