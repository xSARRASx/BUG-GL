// =============================================================
//  Extraction HTML — module PUR
// =============================================================
//  Aucune dépendance : pas de cheerio ni de parseur DOM. Les
//  contrôles SEO dont nous avons besoin (title, meta, H1, alt,
//  liens, JSON-LD) se lisent très bien par expressions régulières,
//  et cela évite d'embarquer une grosse bibliothèque dans un job
//  qui tourne 96 fois par jour.
//
//  Limite assumée : un HTML volontairement malformé peut tromper
//  cette extraction. C'est acceptable pour un audit indicatif ;
//  ce n'est pas un validateur W3C.
// =============================================================

const ENTITES = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&#39;": "'", "&apos;": "'", "&eacute;": "é",
  "&egrave;": "è", "&agrave;": "à", "&ccedil;": "ç", "&ocirc;": "ô",
};

function decoder(s) {
  return String(s || "").replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e.toLowerCase()] || e);
}

/** Retire scripts, styles et commentaires avant toute lecture de texte. */
function sansBruit(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/** Contenu textuel visible, espaces normalisés. */
export function texteVisible(html) {
  return decoder(sansBruit(html).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attribut(balise, nom) {
  const re = new RegExp(`\\b${nom}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(balise);
  if (!m) return null;
  return decoder(m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] || "");
}

function balisesMeta(html) {
  return String(html || "").match(/<meta\b[^>]*>/gi) || [];
}

function contenuMeta(html, nomAttendu) {
  for (const balise of balisesMeta(html)) {
    const nom = (attribut(balise, "name") || attribut(balise, "property") || "").toLowerCase();
    if (nom === nomAttendu) return (attribut(balise, "content") || "").trim();
  }
  return null;
}

function titresDeNiveau(html, n) {
  const re = new RegExp(`<h${n}\\b[^>]*>([\\s\\S]*?)<\\/h${n}>`, "gi");
  const propre = sansBruit(html);
  const out = [];
  let m;
  while ((m = re.exec(propre)) !== null) {
    const t = decoder(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    out.push(t);
  }
  return out;
}

/**
 * Extrait tout ce dont l'audit a besoin.
 * @returns {{title, metaDescription, metaRobots, canonical, langue,
 *            h1: string[], h2: string[], h3: string[],
 *            images: Array<{src,alt}>, liens: string[],
 *            jsonLd: object[], texte: string, nbMots: number}}
 */
export function extraire(html) {
  const brut = String(html || "");
  const propre = sansBruit(brut);

  // --- title ---
  const mTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(propre);
  const title = mTitle ? decoder(mTitle[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : null;

  // --- canonical ---
  let canonical = null;
  for (const lien of brut.match(/<link\b[^>]*>/gi) || []) {
    if ((attribut(lien, "rel") || "").toLowerCase().trim() === "canonical") {
      canonical = (attribut(lien, "href") || "").trim() || null;
      break;
    }
  }

  // --- langue ---
  const mHtml = /<html\b[^>]*>/i.exec(brut);
  const langue = mHtml ? attribut(mHtml[0], "lang") : null;

  // --- images ---
  const images = (propre.match(/<img\b[^>]*>/gi) || []).map((b) => ({
    src: attribut(b, "src") || attribut(b, "data-src") || "",
    alt: attribut(b, "alt"),
  }));

  // --- liens ---
  const liens = [];
  for (const a of propre.match(/<a\b[^>]*>/gi) || []) {
    const href = attribut(a, "href");
    if (href) liens.push(href.trim());
  }

  // --- JSON-LD ---
  const jsonLd = [];
  const reLd = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = reLd.exec(brut)) !== null) {
    try {
      const v = JSON.parse(m[1].trim());
      if (Array.isArray(v)) jsonLd.push(...v);
      else jsonLd.push(v);
    } catch {
      // JSON-LD invalide : on le signale via un marqueur plutôt que d'échouer.
      jsonLd.push({ "@type": "__INVALIDE__" });
    }
  }

  const texte = texteVisible(brut);

  return {
    title,
    metaDescription: contenuMeta(brut, "description"),
    metaRobots: contenuMeta(brut, "robots"),
    canonical,
    langue,
    h1: titresDeNiveau(brut, 1),
    h2: titresDeNiveau(brut, 2),
    h3: titresDeNiveau(brut, 3),
    images,
    liens,
    jsonLd,
    texte,
    nbMots: texte ? texte.split(/\s+/).filter(Boolean).length : 0,
  };
}

/** Aplatit les @type d'un bloc JSON-LD, y compris les @graph. */
export function typesJsonLd(blocs) {
  const types = new Set();
  const visiter = (n, profondeur = 0) => {
    if (!n || typeof n !== "object" || profondeur > 6) return;
    if (Array.isArray(n)) return n.forEach((x) => visiter(x, profondeur + 1));
    const t = n["@type"];
    if (typeof t === "string") types.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
    if (Array.isArray(n["@graph"])) n["@graph"].forEach((x) => visiter(x, profondeur + 1));
  };
  (blocs || []).forEach((b) => visiter(b));
  return [...types];
}
