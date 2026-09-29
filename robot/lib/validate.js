// =============================================================
//  Vérification des champs obligatoires et des garde-fous métier
// =============================================================
//  Reproduit les règles du formulaire (js/seo.js, REQ_FIELDS) et y
//  ajoute les garde-fous décrits dans HANDOFF-AUTOMATISATION-SEO.md.
//
//  Aucune valeur client n'est renvoyée : uniquement des libellés de
//  champs et des motifs, sûrs à journaliser.
// =============================================================

// Paires « valeur + drapeau Na » du formulaire SEO.
export const CHAMPS_OBLIGATOIRES = [
  { cle: "zone",       na: "zoneNa",       libelle: "Zone exacte confirmée" },
  { cle: "prestation", na: "prestationNa", libelle: "Prestation commandée" },
  { cle: "phone",      na: "phoneNa",      libelle: "Téléphone" },
  { cle: "adresse",    na: "adresseNa",    libelle: "Adresse" },
  { cle: "facebook",   na: "facebookNa",   libelle: "Page Facebook" },
  { cle: "instagram",  na: "instagramNa",  libelle: "Compte Instagram" },
  { cle: "google",     na: "googleNa",     libelle: "Compte Google" },
];

const rempli = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Évalue une fiche.
 * @returns {{traitable: boolean, bloquants: string[], avertissements: string[], contexte: object}}
 */
export function verifier(site) {
  const bloquants = [];
  const avertissements = [];

  // --- 1. Champs de base ---
  if (!rempli(site.nom))   bloquants.push("Nom du client absent");
  if (!rempli(site.ville)) bloquants.push("Ville absente");

  // --- 2. Champs obligatoires du formulaire ---
  for (const champ of CHAMPS_OBLIGATOIRES) {
    if (!rempli(site[champ.cle]) && site[champ.na] !== true) {
      bloquants.push(`${champ.libelle} : ni renseigné, ni marqué « rien à remplir »`);
    }
  }

  // --- 3. Garde-fou n°1 : la zone doit être CONFIRMÉE ---
  //     C'est le piège identifié par Camille : sans zone confirmée,
  //     tout le SEO local serait à refaire.
  if (site.zoneNa === true) {
    bloquants.push("Zone non confirmée par le client (case « à confirmer » cochée) — SEO local impossible");
  } else if (!rempli(site.zone)) {
    bloquants.push("Zone exacte vide — SEO local impossible");
  }

  // --- 4. Accès WordPress ---
  const accesComplets = rempli(site.adminUrl) && rempli(site.login) && rempli(site.pass);
  if (!accesComplets) {
    bloquants.push("Accès WordPress incomplets (lien admin, identifiant ou mot de passe manquant)");
  }

  // --- 5. Prestation ---
  if (!rempli(site.prestation) && site.prestationNa !== true) {
    bloquants.push("Prestation commandée non définie");
  }

  // --- 6. Avertissements (non bloquants) ---
  if (site.carte !== "oui") {
    avertissements.push("Sans Carte G — vocabulaire Loi Hoguet obligatoire (jamais « gestion »)");
  }
  if (site.googleNa === true) {
    avertissements.push("Aucun compte Google — transfert de propriété impossible");
  } else if (rempli(site.google) && !/@gmail\.com$/i.test(site.google.trim())) {
    avertissements.push("Le compte Google n'est pas un Gmail — transfert de propriété impossible");
  }
  if (!rempli(site.url)) {
    avertissements.push("Aucune URL de site renseignée");
  }

  return {
    traitable: bloquants.length === 0,
    bloquants,
    avertissements,
    // Contexte transmis à l'analyse publique.
    //
    // ⚠️ LISTE BLANCHE STRICTE : on n'y met QUE ce dont l'audit a besoin.
    // Sont volontairement exclus, et doivent le rester : adminUrl, login,
    // pass, email, google, phone, adresse, files. L'analyse travaille
    // uniquement sur l'URL publique.
    contexte: {
      url: rempli(site.url) ? site.url.trim() : null,
      ville: rempli(site.ville) ? site.ville.trim() : null,
      // Une zone non confirmée ne doit jamais servir de base au contenu.
      zone: (site.zoneNa !== true && rempli(site.zone)) ? site.zone.trim() : null,
      zoneConfirmee: site.zoneNa !== true && rempli(site.zone),
      prestation: site.prestation || null,
      activite: site.activite || null,
      carteG: site.carte === "oui",
      loiHoguet: site.carte !== "oui",
    },
  };
}
