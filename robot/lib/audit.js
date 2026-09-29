// =============================================================
//  Contrôles SEO — module PUR
// =============================================================
//  Prend le résultat d'un crawl déjà effectué et produit des
//  constats. Aucune requête réseau ici : tout est testable hors
//  ligne avec des fixtures HTML.
//
//  Un constat :
//    { code, niveau: "critique"|"avertissement"|"ok",
//      categorie, message, page? }
//
//  Le message PEUT contenir l'URL publique et la ville — le rapport
//  finit dans la note Firebase du client. Ce sont les LOGS qui ne
//  doivent rien laisser filtrer, et index.js n'y affiche que des
//  compteurs et des catégories.
// =============================================================

export const NIVEAUX = { CRITIQUE: "critique", AVERTISSEMENT: "avertissement", OK: "ok" };

export const CATEGORIES = {
  TECHNIQUE: "technique",
  INDEXATION: "indexation",
  TITRE: "titre",
  DESCRIPTION: "description",
  STRUCTURE: "structure",
  IMAGES: "images",
  LIENS: "liens",
  CONTENU: "contenu",
  DONNEES_STRUCTUREES: "donnees-structurees",
  SEO_LOCAL: "seo-local",
  LOI_HOGUET: "loi-hoguet",
};

// Seuils usuels. Volontairement indulgents : un audit qui crie au
// loup partout n'est pas exploitable.
export const SEUILS = {
  titreMin: 30, titreMax: 65,
  descMin: 70, descMax: 160,
  motsMin: 150,
};

// --- Loi Hoguet : vocabulaire interdit sans Carte G ---
export const TERMES_HOGUET = [
  { motif: /\bgestions?\s+locatives?\b/gi, terme: "gestion locative" },
  { motif: /\bgestion\s+airbnb\b/gi, terme: "gestion Airbnb" },
  { motif: /\bgestionnaires?\b/gi, terme: "gestionnaire" },
  { motif: /\bgestions?\b/gi, terme: "gestion" },
  { motif: /\bg[ée]r(?:er|ons|ez|e|ent|é|ée|és|ées)\b/gi, terme: "gérer" },
];

export const REMPLACEMENTS_HOGUET = [
  "conciergerie", "coordination", "suivi", "prise en charge",
  "location courte durée", "location saisonnière", "accompagnement",
];

const constat = (niveau, categorie, code, message, page) => ({ niveau, categorie, code, message, page });
const critique = (...a) => constat(NIVEAUX.CRITIQUE, ...a);
const avert = (...a) => constat(NIVEAUX.AVERTISSEMENT, ...a);
const ok = (...a) => constat(NIVEAUX.OK, ...a);

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cherche les termes interdits par la Loi Hoguet dans un texte. */
export function termesHoguet(texte) {
  const trouves = new Set();
  const t = String(texte || "");
  for (const { motif, terme } of TERMES_HOGUET) {
    motif.lastIndex = 0;
    if (motif.test(t)) trouves.add(terme);
  }
  // « gestion locative » implique « gestion » : on ne garde que le plus précis.
  if (trouves.has("gestion locative") || trouves.has("gestion Airbnb")) trouves.delete("gestion");
  return [...trouves];
}

/** Découpe une zone confirmée en communes exploitables. */
export function communesDeZone(zone) {
  return String(zone || "")
    .split(/[,;/|\n]|\s[-–—]\s/)
    .map((s) => s.replace(/\(.*?\)/g, "").trim())
    .filter((s) => s.length >= 3 && !/^(principale|environs?|etc\.?)$/i.test(s));
}

/** Vrai si le texte mentionne le lieu (comparaison sans accents ni casse). */
export function mentionne(texte, lieu) {
  if (!lieu) return false;
  return sansAccents(texte).includes(sansAccents(lieu));
}

// -------------------------------------------------------------
//  Audit complet
// -------------------------------------------------------------
/**
 * @param {object} crawl     résultat de lib/crawl.js
 * @param {object} contexte  { url, ville, zone, zoneConfirmee, prestation, activite, carteG, loiHoguet }
 * @returns {{constats: Array, compteurs: object, categories: string[]}}
 */
export function auditer(crawl, contexte = {}) {
  const constats = [];
  const pages = (crawl.pages || []).filter((p) => p && p.ok);
  const echecs = (crawl.pages || []).filter((p) => p && !p.ok);
  const accueil = pages[0] || null;

  // ---------- 1. Technique ----------
  if (crawl.httpsOk === false) {
    constats.push(critique(CATEGORIES.TECHNIQUE, "https-absent",
      "Le site n'est pas servi en HTTPS. C'est un critère de classement et un signal de confiance."));
  } else if (crawl.httpsOk === true) {
    constats.push(ok(CATEGORIES.TECHNIQUE, "https-ok", "Le site est bien servi en HTTPS."));
  }

  if (crawl.redirectionAccueil) {
    constats.push(avert(CATEGORIES.TECHNIQUE, "redirection-accueil",
      `L'adresse demandée redirige vers ${crawl.redirectionAccueil}. Vérifier que c'est voulu et qu'il n'y a pas de chaîne de redirections.`));
  }

  for (const p of echecs) {
    constats.push(critique(CATEGORIES.TECHNIQUE, "page-inaccessible",
      `Page inaccessible (${p.motif || "erreur"}${p.status ? ", HTTP " + p.status : ""}).`, p.url));
  }

  // ---------- 2. robots.txt & sitemap ----------
  if (crawl.robotsTxt && crawl.robotsTxt.present) {
    constats.push(ok(CATEGORIES.INDEXATION, "robots-present", "Un fichier robots.txt est présent."));
    if (crawl.robotsTxt.bloqueTout) {
      constats.push(critique(CATEGORIES.INDEXATION, "robots-bloque-tout",
        "Le robots.txt interdit l'exploration de tout le site (Disallow: /). Le site ne peut pas être indexé."));
    }
  } else {
    constats.push(avert(CATEGORIES.INDEXATION, "robots-absent",
      "Aucun fichier robots.txt. Ce n'est pas bloquant, mais il est recommandé d'en publier un et d'y déclarer le sitemap."));
  }

  if (crawl.sitemap && crawl.sitemap.present) {
    constats.push(ok(CATEGORIES.INDEXATION, "sitemap-present",
      `Sitemap XML présent (${crawl.sitemap.urls.length} URL déclarée${crawl.sitemap.urls.length > 1 ? "s" : ""}).`));
  } else {
    constats.push(avert(CATEGORIES.INDEXATION, "sitemap-absent",
      "Aucun sitemap XML trouvé. À générer et à déclarer dans le robots.txt et la Search Console."));
  }

  // ---------- 3. Page par page ----------
  const titres = new Map();
  const descriptions = new Map();
  let totalImagesSansAlt = 0;

  for (const p of pages) {
    const d = p.donnees || {};

    // --- title ---
    if (!d.title) {
      constats.push(critique(CATEGORIES.TITRE, "title-absent", "Balise <title> absente.", p.url));
    } else {
      const n = d.title.length;
      if (n < SEUILS.titreMin) {
        constats.push(avert(CATEGORIES.TITRE, "title-court",
          `Titre trop court (${n} caractères, viser ${SEUILS.titreMin}-${SEUILS.titreMax}).`, p.url));
      } else if (n > SEUILS.titreMax) {
        constats.push(avert(CATEGORIES.TITRE, "title-long",
          `Titre trop long (${n} caractères, il sera tronqué dans Google).`, p.url));
      }
      const cle = d.title.trim().toLowerCase();
      titres.set(cle, [...(titres.get(cle) || []), p.url]);
    }

    // --- meta description ---
    if (!d.metaDescription) {
      constats.push(avert(CATEGORIES.DESCRIPTION, "description-absente",
        "Meta description absente. Google en rédigera une à sa place.", p.url));
    } else {
      const n = d.metaDescription.length;
      if (n < SEUILS.descMin) {
        constats.push(avert(CATEGORIES.DESCRIPTION, "description-courte",
          `Meta description trop courte (${n} caractères, viser ${SEUILS.descMin}-${SEUILS.descMax}).`, p.url));
      } else if (n > SEUILS.descMax) {
        constats.push(avert(CATEGORIES.DESCRIPTION, "description-longue",
          `Meta description trop longue (${n} caractères, elle sera tronquée).`, p.url));
      }
      const cle = d.metaDescription.trim().toLowerCase();
      descriptions.set(cle, [...(descriptions.get(cle) || []), p.url]);
    }

    // --- H1 / structure ---
    if (!d.h1 || d.h1.length === 0) {
      constats.push(critique(CATEGORIES.STRUCTURE, "h1-absent", "Aucun H1 sur la page.", p.url));
    } else if (d.h1.length > 1) {
      constats.push(avert(CATEGORIES.STRUCTURE, "h1-multiple",
        `${d.h1.length} balises H1 sur la même page. Il n'en faut qu'une.`, p.url));
    }
    if ((d.nbMots || 0) >= SEUILS.motsMin && (!d.h2 || d.h2.length === 0)) {
      constats.push(avert(CATEGORIES.STRUCTURE, "h2-absent",
        "Page longue sans aucun H2 : la hiérarchie du contenu n'est pas lisible.", p.url));
    }

    // --- indexation ---
    const robots = (d.metaRobots || "").toLowerCase();
    if (robots.includes("noindex")) {
      constats.push(critique(CATEGORIES.INDEXATION, "noindex",
        "La page porte une balise meta robots « noindex » : elle ne sera pas indexée.", p.url));
    }
    if (!d.canonical) {
      constats.push(avert(CATEGORIES.INDEXATION, "canonical-absent",
        "Aucune balise canonical.", p.url));
    } else if (crawl.origine && !String(d.canonical).startsWith(crawl.origine) && /^https?:\/\//i.test(d.canonical)) {
      constats.push(avert(CATEGORIES.INDEXATION, "canonical-externe",
        `La canonical pointe vers un autre domaine (${d.canonical}).`, p.url));
    }

    // --- images ---
    const sansAlt = (d.images || []).filter((i) => i.alt === null || i.alt === undefined || i.alt.trim() === "").length;
    if (sansAlt > 0) {
      totalImagesSansAlt += sansAlt;
      constats.push(avert(CATEGORIES.IMAGES, "images-sans-alt",
        `${sansAlt} image${sansAlt > 1 ? "s" : ""} sans attribut alt.`, p.url));
    }

    // --- contenu pauvre ---
    if ((d.nbMots || 0) < SEUILS.motsMin) {
      constats.push(avert(CATEGORIES.CONTENU, "contenu-pauvre",
        `Contenu très court (${d.nbMots || 0} mots). Viser au moins ${SEUILS.motsMin} mots utiles.`, p.url));
    }
  }

  if (totalImagesSansAlt === 0 && pages.length > 0) {
    constats.push(ok(CATEGORIES.IMAGES, "images-alt-ok", "Toutes les images analysées ont un attribut alt."));
  }

  // ---------- 4. Doublons ----------
  for (const [, urls] of titres) {
    if (urls.length > 1) {
      constats.push(avert(CATEGORIES.TITRE, "title-duplique",
        `Titre identique sur ${urls.length} pages : ${urls.join(", ")}.`));
    }
  }
  for (const [, urls] of descriptions) {
    if (urls.length > 1) {
      constats.push(avert(CATEGORIES.DESCRIPTION, "description-dupliquee",
        `Meta description identique sur ${urls.length} pages : ${urls.join(", ")}.`));
    }
  }

  // ---------- 5. Liens internes cassés ----------
  for (const l of crawl.liensCasses || []) {
    constats.push(critique(CATEGORIES.LIENS, "lien-interne-casse",
      `Lien interne cassé vers ${l.url}${l.status ? ` (HTTP ${l.status})` : ""}, depuis ${l.depuis}.`));
  }
  if ((crawl.liensCasses || []).length === 0 && pages.length > 1) {
    constats.push(ok(CATEGORIES.LIENS, "liens-ok", "Aucun lien interne cassé détecté."));
  }

  // ---------- 6. Pages orphelines ----------
  for (const u of crawl.orphelines || []) {
    constats.push(avert(CATEGORIES.LIENS, "page-orpheline",
      `Page déclarée au sitemap mais liée depuis aucune page explorée : ${u}.`));
  }

  // ---------- 7. Données structurées ----------
  const tousTypes = new Set();
  pages.forEach((p) => (p.typesJsonLd || []).forEach((t) => tousTypes.add(t)));

  if (tousTypes.size === 0) {
    constats.push(avert(CATEGORIES.DONNEES_STRUCTUREES, "jsonld-absent",
      "Aucune donnée structurée JSON-LD. C'est ce qui permet les résultats enrichis dans Google."));
  } else {
    constats.push(ok(CATEGORIES.DONNEES_STRUCTUREES, "jsonld-present",
      `Données structurées présentes : ${[...tousTypes].join(", ")}.`));
    if (tousTypes.has("__INVALIDE__")) {
      constats.push(avert(CATEGORIES.DONNEES_STRUCTUREES, "jsonld-invalide",
        "Au moins un bloc JSON-LD n'est pas du JSON valide : il sera ignoré par Google."));
    }
  }

  const localPertinent = ["conciergerie", "sous_location", "les_deux"].includes(contexte.activite);
  const aLocalBusiness = [...tousTypes].some((t) => /LocalBusiness|Organization|LodgingBusiness|RealEstateAgent/i.test(t));
  if (localPertinent && !aLocalBusiness) {
    constats.push(avert(CATEGORIES.DONNEES_STRUCTUREES, "localbusiness-absent",
      "Pas de schema LocalBusiness alors que l'activité est locale. À ajouter avec le NAP (nom, adresse, téléphone)."));
  } else if (aLocalBusiness) {
    constats.push(ok(CATEGORIES.DONNEES_STRUCTUREES, "localbusiness-present", "Un schema d'entreprise locale est présent."));
  }
  if ([...tousTypes].some((t) => /FAQPage/i.test(t))) {
    constats.push(ok(CATEGORIES.DONNEES_STRUCTUREES, "faq-present", "Un schema FAQ est présent."));
  }

  // ---------- 8. SEO local ----------
  const texteGlobal = pages.map((p) => (p.donnees && p.donnees.texte) || "").join(" ");
  const texteAccueil = (accueil && accueil.donnees && accueil.donnees.texte) || "";

  if (contexte.ville) {
    if (!mentionne(texteAccueil, contexte.ville)) {
      const niveau = contexte.prestation === "seo_local" ? critique : avert;
      constats.push(niveau(CATEGORIES.SEO_LOCAL, "ville-absente-accueil",
        `La ville principale « ${contexte.ville} » n'apparaît pas sur la page d'accueil. C'est le signal local le plus important.`));
    } else {
      constats.push(ok(CATEGORIES.SEO_LOCAL, "ville-accueil-ok",
        `La ville principale « ${contexte.ville} » est bien présente sur la page d'accueil.`));
    }
  }

  if (contexte.zoneConfirmee && contexte.zone) {
    const communes = communesDeZone(contexte.zone);
    const absentes = communes.filter((c) => !mentionne(texteGlobal, c));
    if (communes.length && absentes.length) {
      constats.push(avert(CATEGORIES.SEO_LOCAL, "zone-incomplete",
        `${absentes.length} commune(s) de la zone confirmée n'apparaissent nulle part : ${absentes.join(", ")}.`));
    } else if (communes.length) {
      constats.push(ok(CATEGORIES.SEO_LOCAL, "zone-ok",
        "Toutes les communes de la zone confirmée sont représentées dans le contenu."));
    }
  } else if (contexte.ville) {
    constats.push(avert(CATEGORIES.SEO_LOCAL, "zone-non-confirmee",
      "La zone exacte n'est pas confirmée par le client : aucune commune supplémentaire ne doit être ajoutée au contenu tant qu'elle ne l'est pas."));
  }

  // ---------- 9. Loi Hoguet ----------
  if (contexte.loiHoguet) {
    const trouves = termesHoguet(texteGlobal);
    if (trouves.length) {
      constats.push(critique(CATEGORIES.LOI_HOGUET, "vocabulaire-interdit",
        `Client SANS Carte G, mais le site emploie : ${trouves.join(", ")}. ` +
        "Ces termes sont juridiquement interdits ici et doivent être reformulés. " +
        `Vocabulaire à utiliser : ${REMPLACEMENTS_HOGUET.join(", ")}.`));
    } else {
      constats.push(ok(CATEGORIES.LOI_HOGUET, "vocabulaire-ok",
        "Aucun terme interdit par la Loi Hoguet détecté dans le contenu public."));
    }
  }

  // ---------- Compteurs ----------
  const compteurs = {
    pagesAnalysees: pages.length,
    pagesEnEchec: echecs.length,
    erreursCritiques: constats.filter((c) => c.niveau === NIVEAUX.CRITIQUE).length,
    avertissements: constats.filter((c) => c.niveau === NIVEAUX.AVERTISSEMENT).length,
    pointsOk: constats.filter((c) => c.niveau === NIVEAUX.OK).length,
  };

  const categories = [...new Set(
    constats.filter((c) => c.niveau !== NIVEAUX.OK).map((c) => c.categorie)
  )].sort();

  return { constats, compteurs, categories };
}
