// =============================================================
//  Masquage des données sensibles
// =============================================================
//  ⚠️ Le repo xSARRASx/BUG-GL est PUBLIC, donc les logs GitHub
//  Actions sont PUBLICS eux aussi. Rien d'identifiable ne doit
//  sortir d'ici : ni nom de client, ni e-mail, ni téléphone,
//  ni adresse, ni accès WordPress, ni pièce jointe.
//
//  Seule la clé Firebase de la fiche (push id) est affichée en
//  clair : c'est un identifiant opaque, et /seo n'est plus
//  lisible que par Martin et Camille.
// =============================================================

// Champs dont la VALEUR ne doit jamais apparaître dans un log.
export const CHAMPS_SENSIBLES = [
  "adminUrl", "login", "pass",      // accès WordPress
  "email", "google", "phone",       // contacts
  "adresse", "zone", "ville",       // localisation
  "nom",                            // nom du client
  "facebook", "instagram", "gmb", "drive", "url",
  "note",                           // peut contenir n'importe quoi
  "files",                          // pièces jointes (base64)
  "createdBy", "updatedBy",
];

/** Remplace une valeur par un marqueur qui n'apprend rien sur son contenu. */
export function masquer(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return "(vide)";
  const s = String(valeur);
  return `(masqué, ${s.length} car.)`;
}

/** Indique seulement si un champ est rempli ou non. */
export function presence(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return "non";
  return "oui";
}

/**
 * Construit le résumé anonymisé d'une fiche.
 * Ne contient AUCUNE donnée client : uniquement des états et des booléens.
 */
export function resumeAnonyme(site) {
  return {
    ref: site.id || "(sans id)",
    statut: site.statut || "(aucun)",
    activite: site.activite || "(aucune)",
    carteG: site.carte === "oui" ? "oui" : "non",
    prestation: site.prestation || "(non renseignée)",
    zoneConfirmee: site.zoneNa === true ? "NON — à confirmer" : (site.zone ? "oui" : "NON — vide"),
    accesWordPress: (site.adminUrl && site.login && site.pass) ? "complets" : "incomplets",
    pieceJointes: site.files ? Object.keys(site.files).length : 0,
    noteRemplie: presence(site.note),
    creeLe: site.createdAt ? new Date(site.createdAt).toISOString().slice(0, 10) : "(inconnu)",
  };
}

/**
 * Nettoie un texte libre (message d'erreur, trace) de toute valeur sensible connue.
 * Utilisé avant d'écrire quoi que ce soit dans les logs.
 */
export function nettoyerTexte(texte, valeursSensibles = []) {
  let out = String(texte === undefined || texte === null ? "" : texte);

  // 1. Valeurs explicitement connues comme sensibles (identifiants du robot, champs clients…)
  for (const v of valeursSensibles) {
    if (typeof v === "string" && v.length >= 4) {
      out = out.split(v).join("[masqué]");
    }
  }

  // 2. Filets de sécurité génériques
  out = out
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail masqué]")
    .replace(/(?:\+\d{1,3}[\s.-]?)?(?:\d{2}[\s.-]?){4}\d{2}/g, "[téléphone masqué]")
    .replace(/data:[\w/+-]+;base64,[A-Za-z0-9+/=]+/g, "[fichier masqué]")
    .replace(/https?:\/\/[^\s"']+/g, "[url masquée]");

  return out;
}

/** Collecte les valeurs sensibles d'une fiche, pour alimenter nettoyerTexte(). */
export function valeursSensiblesDe(site) {
  const out = [];
  for (const champ of CHAMPS_SENSIBLES) {
    const v = site[champ];
    if (typeof v === "string" && v.length >= 4) out.push(v);
  }
  return out;
}
