// =============================================================
//  Faux site web, pour tester l'audit SEO hors ligne
// =============================================================
//  Fixtures HTML entièrement fictives — aucun client réel, aucune
//  requête réseau. Le faux fetch sert de serveur : il répond aux
//  URLs déclarées et 404 sur le reste.
// =============================================================

const BASE = "https://exemple-fictif.invalid";

/** Page HTML complète et correcte, paramétrable. */
export function pageCorrecte(opts = {}) {
  const {
    title = "Conciergerie à Villeneuve-Fictive — Location courte durée",
    description = "Service de conciergerie à Villeneuve-Fictive pour vos locations courte durée : accueil des voyageurs, ménage, suivi du linge et coordination des prestataires.",
    h1 = "Conciergerie à Villeneuve-Fictive",
    canonical = BASE + "/",
    robots = null,
    jsonLd = true,
    liens = ["/services", "/tarifs", "/contact"],
    images = [{ src: "/img/1.jpg", alt: "Salon d'un appartement à Villeneuve-Fictive" }],
    texteSup = "",
  } = opts;

  const remplissage = (
    "Nous accompagnons les propriétaires de Villeneuve-Fictive dans la location courte durée " +
    "de leur bien. Notre conciergerie prend en charge l'accueil des voyageurs, le ménage entre " +
    "chaque séjour, le suivi du linge et la coordination des prestataires locaux. Nous intervenons " +
    "à Villeneuve-Fictive ainsi que dans les communes voisines de Bourg-Imaginaire et Saint-Exemple. " +
    "Chaque logement fait l'objet d'un suivi personnalisé, avec un état des lieux photographique " +
    "avant et après chaque location saisonnière. Notre équipe assure également la mise en valeur " +
    "de votre annonce, la prise en charge des demandes des voyageurs et le suivi de la qualité. " +
    "Nous proposons un accompagnement complet pour la location saisonnière, de la préparation du " +
    "logement jusqu'au départ des voyageurs, sans aucune contrainte pour le propriétaire. "
  ).repeat(2);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
${title === null ? "" : `<title>${title}</title>`}
${description === null ? "" : `<meta name="description" content="${description}">`}
${robots ? `<meta name="robots" content="${robots}">` : ""}
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
${jsonLd ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Conciergerie Fictive","address":{"@type":"PostalAddress","addressLocality":"Villeneuve-Fictive"}}</script>` : ""}
</head>
<body>
${Array.isArray(h1) ? h1.map((t) => `<h1>${t}</h1>`).join("\n") : (h1 === null ? "" : `<h1>${h1}</h1>`)}
<h2>Nos prestations</h2>
<p>${remplissage}</p>
<h3>Zone d'intervention</h3>
<p>${texteSup}</p>
${images.map((i) => `<img src="${i.src}"${i.alt === null ? "" : ` alt="${i.alt}"`}>`).join("\n")}
<nav>${liens.map((l) => `<a href="${l}">Lien</a>`).join(" ")}</nav>
<a href="https://site-externe.invalid/page">Lien externe</a>
</body>
</html>`;
}

/** Page volontairement pauvre : peu de contenu, pas de structure. */
export function pagePauvre() {
  return `<!doctype html><html lang="fr"><head><title>Contact</title></head>
<body><h1>Contact</h1><p>Écrivez-nous.</p></body></html>`;
}

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE}/</loc></url>
  <url><loc>${BASE}/services</loc></url>
  <url><loc>${BASE}/tarifs</loc></url>
</urlset>`;

export const ROBOTS_TXT = `User-agent: *
Disallow: /wp-admin/
Sitemap: ${BASE}/sitemap.xml`;

export const ROBOTS_BLOQUANT = `User-agent: *
Disallow: /`;

/**
 * Faux fetch faisant office de serveur.
 *
 * @param {object} routes  { "/chemin": html | {status,body,redirigeVers} }
 * @param {object} opts    { jette:"timeout"|"reseau", base, lenteurMs }
 */
export function creerFauxSite(routes = {}, opts = {}) {
  const base = opts.base || BASE;
  const requetes = [];

  const fetchImpl = async (url, options = {}) => {
    requetes.push({ url: String(url), methode: (options.method || "GET"), headers: options.headers || {} });

    if (opts.jette) {
      const e = new Error("panne simulée");
      e.name = opts.jette === "timeout" ? "AbortError" : "TypeError";
      throw e;
    }

    let u;
    try { u = new URL(String(url)); } catch { throw new TypeError("URL invalide"); }

    // Hors du ou des domaines fictifs : le crawler ne devrait jamais
    // arriver ici. Toute requête reçue ici est une fuite de périmètre.
    const origines = [base, ...(opts.originesSupplementaires || [])];
    if (!origines.includes(u.origin)) {
      return { ok: false, status: 599, url: String(url), headers: { get: () => null }, text: async () => "" };
    }

    const chemin = u.pathname.replace(/\/+$/, "") || "/";
    // Une clé « https://origine/chemin » l'emporte sur la clé « /chemin ».
    // Permet de servir un contenu différent selon l'origine (www, http…).
    const route = routes[u.origin + chemin] ?? routes[chemin];

    if (route === undefined) {
      return { ok: false, status: 404, url: String(url), headers: { get: () => null }, text: async () => "Introuvable" };
    }

    if (typeof route === "object" && route !== null) {
      const status = route.status || 200;
      // « redirigeVers » produit une VRAIE redirection HTTP : le crawler
      // doit la suivre lui-même, en repassant par ses contrôles.
      if (route.redirigeVers) {
        const cible = /^https?:\/\//i.test(route.redirigeVers)
          ? route.redirigeVers
          : base + route.redirigeVers;
        return {
          ok: false,
          status: route.status || 301,
          url: String(url),
          headers: { get: (n) => (String(n).toLowerCase() === "location" ? cible : null) },
          text: async () => "",
        };
      }
      return {
        ok: status >= 200 && status < 300,
        status,
        url: String(url),
        headers: { get: () => null },
        text: async () => route.body || "",
      };
    }

    return { ok: true, status: 200, url: String(url), headers: { get: () => null }, text: async () => route };
  };

  return {
    fetchImpl,
    requetes,
    base,
    get gets() { return requetes.filter((r) => r.methode === "GET"); },
    get urlsVisitees() { return requetes.map((r) => r.url); },
  };
}

export { BASE };
