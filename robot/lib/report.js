// =============================================================
//  Écriture du compte rendu — sans jamais écraser les notes
// =============================================================
//  Le champ `note` est unique et remplacé en entier par l'app.
//  Un simple lire-puis-écrire perdrait le texte que Camille aurait
//  saisi entre-temps. On passe donc par une TRANSACTION sur
//  /seo/{cle}/note : la lecture et la concaténation sont atomiques,
//  et Firebase rejoue l'opération si la valeur a changé.
//
//  ⚠️ INACTIF EN DRY-RUN.
// =============================================================

import { ref, runTransaction } from "firebase/database";
import { assertWriteAllowed } from "./guard.js";

/** En-tête qui identifie clairement un ajout du robot. */
export function entete(date = new Date()) {
  const jour = date.toISOString().slice(0, 10);
  return `--- Compte rendu Robot SEO — ${jour} ---`;
}

/**
 * Ajoute un compte rendu à la fin de la note existante.
 * La note précédente est intégralement préservée.
 */
export async function ajouterRapport(db, cle, corps, date = new Date()) {
  assertWriteAllowed(`ajout d'un compte rendu sur /seo/${cle}/note`);

  const bloc = `${entete(date)}\n${String(corps).trim()}`;

  const res = await runTransaction(ref(db, `seo/${cle}/note`), (noteActuelle) => {
    const existant = typeof noteActuelle === "string" ? noteActuelle : "";
    if (existant.trim() === "") return bloc;
    return `${existant.trimEnd()}\n\n${bloc}`;
  });

  return res.committed;
}
