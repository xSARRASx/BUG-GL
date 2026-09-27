// =============================================================
//  Journalisation sûre
// =============================================================
//  Toute sortie console passe par ici. Les valeurs sensibles
//  enregistrées via enregistrerSecret() sont masquées dans TOUT
//  ce qui est journalisé, y compris les messages d'erreur du SDK.
// =============================================================

import { nettoyerTexte } from "./redact.js";

const secrets = new Set();

/** Enregistre une valeur à masquer systématiquement dans les logs. */
export function enregistrerSecret(valeur) {
  if (typeof valeur === "string" && valeur.length >= 4) secrets.add(valeur);
}

function sortie(prefixe, args) {
  const liste = [...secrets];
  const texte = args
    .map((a) => (typeof a === "string" ? a : safeStringify(a)))
    .join(" ");
  console.log(prefixe + nettoyerTexte(texte, liste));
}

function safeStringify(valeur) {
  try {
    return JSON.stringify(valeur, null, 2);
  } catch {
    return String(valeur);
  }
}

export const log = {
  info:    (...a) => sortie("",        a),
  etape:   (...a) => sortie("▶ ",      a),
  ok:      (...a) => sortie("✅ ",     a),
  alerte:  (...a) => sortie("⚠️  ",    a),
  erreur:  (...a) => sortie("❌ ",     a),
  ignore:  (...a) => sortie("⏭️  ",    a),
  titre:   (t)    => sortie("\n=== ", [t + " ==="]),
};

/** Formate une erreur sans jamais divulguer son contenu brut. */
export function erreurLisible(e) {
  const code = e && e.code ? String(e.code) : "";
  const msg = e && e.message ? String(e.message) : String(e);
  return nettoyerTexte(code ? `${code} — ${msg}` : msg, [...secrets]);
}
