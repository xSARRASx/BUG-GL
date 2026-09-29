// =============================================================
//  Crawl public — lecture SEULE
// =============================================================
//  Ne visite QUE les pages publiques du domaine de la fiche.
//  N'utilise JAMAIS les identifiants WordPress : ni l'URL admin,
//  ni le login, ni le mot de passe ne sont transmis ici.
//
//  Le crawl est volontairement bridé — ce robot tourne toutes les
//  15 minutes et visite des sites de clients, pas les nôtres :
//    • même origine uniquement, jamais de lien externe
//    • nombre de pages plafonné
//    • timeout par requête ET budget global
//    • les paramètres d'URL sont ignorés pour la découverte
//    • robots.txt respecté
//    • User-Agent identifiable, pour que le client sache qui passe
//
//  `fetchImpl` est injectable : tous les tests tournent hors ligne.
// =============================================================

import { extraire, typesJsonLd } from "./html.js";
import { urlAutorisee, memeSiteLegitime, RAISONS_REFUS } from "./reseau.js";

export const USER_AGENT =
  "GuestLuckyRobotSEO/1.0 (+https://xsarrasx.github.io/BUG-GL/ ; audit SEO en lecture seule)";

export const DEFAUTS = {
  maxPages: 15,
  maxRedirections: 3,
  maxLiensVerifies: 10,   // liens internes non explorés, vérifiés en plus
  timeoutMs: 10000,
  budgetMs: 60000,
  maxUrlsSitemap: 50,
};

// -------------------------------------------------------------
//  URL
// -------------------------------------------------------------
/** Ajoute https:// si besoin et renvoie une URL exploitable, ou null. */
export function normaliserUrl(brut) {
  const s = String(brut || "").trim();
  if (!s) return null;
  const avecSchema = /^https?:\/\//i.test(s) ? s : "https://" + s.replace(/^\/+/, "");
  try {
    const u = new URL(avecSchema);
    if (!/^https?:$/.test(u.protocol)) return null;
    // On ne juge PAS ici si l'hôte est légitime : c'est le rôle de
    // lib/reseau.js. Rejeter « localhost » dès ici donnerait un message
    // d'erreur trompeur (« URL invalide ») au lieu du vrai motif de refus.
    if (!u.hostname) return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/**
 * Clé de déduplication : origine + chemin, sans paramètres ni ancre.
 * Deux URLs qui ne diffèrent que par « ?utm_source=... » sont la même page.
 */
export function cleUrl(u) {
  try {
    const url = typeof u === "string" ? new URL(u) : u;
    const chemin = url.pathname.replace(/\/+$/, "") || "/";
    return (url.origin + chemin).toLowerCase();
  } catch {
    return String(u || "").toLowerCase();
  }
}

/** Extensions qu'il est inutile de crawler comme des pages. */
const EXT_IGNOREES = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|zip|rar|mp4|mp3|avi|docx?|xlsx?|pptx?)$/i;

// -------------------------------------------------------------
//  robots.txt
// -------------------------------------------------------------
/** Analyse un robots.txt : règles applicables à notre agent. */
export function analyserRobots(texte) {
  const lignes = String(texte || "").split(/\r?\n/);
  const disallow = [];
  const allow = [];
  const sitemaps = [];
  let groupeActif = false;

  for (const ligne of lignes) {
    const l = ligne.replace(/#.*$/, "").trim();
    if (!l) continue;
    const sep = l.indexOf(":");
    if (sep < 0) continue;
    const cle = l.slice(0, sep).trim().toLowerCase();
    const val = l.slice(sep + 1).trim();

    if (cle === "sitemap") { sitemaps.push(val); continue; }
    if (cle === "user-agent") {
      const ua = val.toLowerCase();
      groupeActif = ua === "*" || ua.includes("guestlucky");
      continue;
    }
    if (!groupeActif) continue;
    if (cle === "disallow" && val) disallow.push(val);
    if (cle === "allow" && val) allow.push(val);
  }

  return {
    present: true,
    disallow,
    allow,
    sitemaps,
    bloqueTout: disallow.includes("/"),
  };
}

/** Vrai si le chemin est autorisé par le robots.txt analysé. */
export function cheminAutorise(robots, chemin) {
  if (!robots || !robots.present) return true;
  const c = String(chemin || "/");
  const correspond = (regle) => c.startsWith(regle.replace(/\*$/, ""));
  // Allow l'emporte sur Disallow, comme chez Google.
  if (robots.allow.some(correspond)) return true;
  return !robots.disallow.some(correspond);
}

// -------------------------------------------------------------
//  sitemap
// -------------------------------------------------------------
/** Extrait les <loc> d'un sitemap (y compris un index de sitemaps). */
export function urlsDeSitemap(xml, max = DEFAUTS.maxUrlsSitemap) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(String(xml || ""))) !== null && out.length < max) {
    out.push(m[1].trim());
  }
  return out;
}

const estIndexSitemap = (xml) => /<sitemapindex[\s>]/i.test(String(xml || ""));

// -------------------------------------------------------------
//  Crawler
// -------------------------------------------------------------
export function creerCrawler(options = {}) {
  const cfg = { ...DEFAUTS, ...options };
  const http = options.fetchImpl || globalThis.fetch;
  if (typeof http !== "function") throw new Error("Aucune implémentation de fetch disponible.");

  const debut = Date.now();
  const budgetEpuise = () => Date.now() - debut > cfg.budgetMs;
  const resolveur = options.resolveur;   // injectable ; absent = contrôle du nom seul

  // Origine de référence du site audité. Tout ce qui n'en relève pas
  // est refusé — y compris au milieu d'une chaîne de redirections.
  let origineReference = null;

  /** Une URL a-t-elle le droit d'être contactée ? Deux contrôles cumulés. */
  async function contactAutorise(url) {
    // 1. Garde-fou réseau : jamais d'hôte local, privé ou de métadonnées.
    const verdict = await urlAutorisee(url, { resolveur });
    if (!verdict.ok) return verdict;

    // 2. Périmètre : le même site, à une variante légitime près.
    if (origineReference && !memeSiteLegitime(url, origineReference)) {
      return { ok: false, raison: "hors-perimetre" };
    }
    return { ok: true };
  }

  /** Une seule requête HTTP, sans suivre les redirections. */
  async function requeteBrute(url, methode) {
    const controleur = typeof AbortController === "function" ? new AbortController() : null;
    const minuteur = controleur ? setTimeout(() => controleur.abort(), cfg.timeoutMs) : null;
    try {
      const rep = await http(url, {
        method: methode,
        // ⚠️ JAMAIS "follow" : une redirection doit repasser par nos
        // contrôles avant d'être suivie. C'est ce qui empêche une URL
        // du domaine client d'emmener le robot ailleurs.
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controleur ? controleur.signal : undefined,
      });
      return { rep };
    } catch (e) {
      const motif = e && (e.name === "AbortError" || /abort/i.test(e.message || "")) ? "timeout" : "reseau";
      return { erreur: motif };
    } finally {
      if (minuteur) clearTimeout(minuteur);
    }
  }

  const EST_REDIRECTION = (s) => s === 301 || s === 302 || s === 303 || s === 307 || s === 308;

  /**
   * Requête avec redirections suivies À LA MAIN.
   * Chaque saut est revalidé : garde-fou réseau + périmètre du site.
   * Ne lève jamais : renvoie un objet d'échec.
   */
  async function recuperer(urlDemandee, methode = "GET") {
    if (budgetEpuise()) return { ok: false, motif: "budget-epuise", url: urlDemandee };

    // Contrôle AVANT la toute première requête : aucune URL interdite
    // ne doit être contactée, même une seule fois.
    const permis = await contactAutorise(urlDemandee);
    if (!permis.ok) {
      return { ok: false, motif: "refuse", raison: permis.raison, url: urlDemandee };
    }

    let url = String(urlDemandee);
    let redirections = 0;

    while (true) {
      if (budgetEpuise()) return { ok: false, motif: "budget-epuise", url };

      const { rep, erreur } = await requeteBrute(url, methode);
      if (erreur) return { ok: false, motif: erreur, url };

      if (EST_REDIRECTION(rep.status)) {
        if (++redirections > cfg.maxRedirections) {
          return { ok: false, motif: "trop-de-redirections", url };
        }
        const cible = rep.headers && typeof rep.headers.get === "function" ? rep.headers.get("location") : null;
        if (!cible) return { ok: false, motif: "redirection-sans-cible", url };

        let suivante;
        try { suivante = new URL(cible, url).href; } catch { return { ok: false, motif: "redirection-invalide", url }; }

        // Chaque saut est revalidé : c'est ici que se joue la sécurité.
        const okSaut = await contactAutorise(suivante);
        if (!okSaut.ok) {
          return { ok: false, motif: "redirection-refusee", raison: okSaut.raison, url, cible: suivante };
        }
        url = suivante;
        continue;
      }

      if (!rep.ok) return { ok: false, motif: "http", status: rep.status, url: urlDemandee, urlFinale: url };
      const corps = methode === "HEAD" ? "" : await rep.text();
      return { ok: true, status: rep.status, url: urlDemandee, urlFinale: url, corps };
    }
  }

  /**
   * Audite un site public.
   * @param {string} urlPublique
   * @returns {Promise<object>} résultat brut, à passer à lib/audit.js
   */
  async function explorer(urlPublique) {
    const depart = normaliserUrl(urlPublique);
    if (!depart) return { ok: false, motif: "url-invalide", pages: [] };

    // Origine de référence : tout le reste de l'exploration s'y
    // rapporte, y compris les redirections et les sitemaps.
    origineReference = depart.origin;

    // L'URL de départ elle-même doit passer le garde-fou réseau.
    const departPermis = await urlAutorisee(depart, { resolveur });
    if (!departPermis.ok) {
      return { ok: false, motif: "url-refusee", raison: departPermis.raison, pages: [] };
    }

    const origine = depart.origin;
    const resultat = {
      ok: true,
      origine,
      urlDepart: depart.href,
      httpsOk: depart.protocol === "https:",
      redirectionAccueil: null,
      robotsTxt: { present: false, disallow: [], allow: [], sitemaps: [], bloqueTout: false },
      sitemap: { present: false, urls: [] },
      pages: [],
      liensCasses: [],
      orphelines: [],
      limiteAtteinte: false,
    };

    // --- 1. robots.txt ---
    const rRobots = await recuperer(origine + "/robots.txt");
    if (rRobots.ok && /disallow|user-agent|sitemap/i.test(rRobots.corps)) {
      resultat.robotsTxt = analyserRobots(rRobots.corps);
    }

    // --- 2. sitemap ---
    // ⚠️ Un robots.txt peut déclarer un sitemap sur un AUTRE domaine.
    // On les filtre AVANT toute requête : aucune URL externe ne doit
    // être contactée, même une seule fois.
    const candidats = [
      ...resultat.robotsTxt.sitemaps.filter((u) => memeSiteLegitime(u, origine)),
      origine + "/sitemap.xml",
      origine + "/sitemap_index.xml",
    ];
    resultat.sitemapsExternesIgnores = resultat.robotsTxt.sitemaps
      .filter((u) => !memeSiteLegitime(u, origine)).length;

    for (const candidat of candidats) {
      if (resultat.sitemap.present || budgetEpuise()) break;
      const r = await recuperer(candidat);
      if (!r.ok || !/<(urlset|sitemapindex)[\s>]/i.test(r.corps)) continue;

      let urls = urlsDeSitemap(r.corps);
      if (estIndexSitemap(r.corps) && urls.length) {
        // Index : on ouvre le premier sous-sitemap DU MÊME SITE, pas tous.
        const interne = urls.find((u) => memeSiteLegitime(u, origine));
        if (interne) {
          const sous = await recuperer(interne);
          urls = sous.ok ? urlsDeSitemap(sous.corps) : [];
        } else {
          urls = [];
        }
      }
      resultat.sitemap = {
        present: true,
        source: candidat,
        urls: urls.filter((u) => memeSiteLegitime(u, origine)),
      };
    }

    // --- 3. File d'attente ---
    const vus = new Set();
    const file = [];
    const ajouter = (u) => {
      const url = typeof u === "string" ? normaliserUrl(u) : u;
      if (!url || !memeSiteLegitime(url, origine)) return;
      if (EXT_IGNOREES.test(url.pathname)) return;
      const cle = cleUrl(url);
      if (vus.has(cle)) return;
      if (!cheminAutorise(resultat.robotsTxt, url.pathname)) return;
      vus.add(cle);
      file.push(url);
    };

    ajouter(depart);
    resultat.sitemap.urls.forEach(ajouter);

    // --- 4. Exploration ---
    const liensRencontres = new Map();  // cléUrl -> page source
    let premier = true;

    while (file.length && resultat.pages.length < cfg.maxPages && !budgetEpuise()) {
      const url = file.shift();
      const r = await recuperer(url.href);

      if (!r.ok) {
        resultat.pages.push({ ok: false, url: url.href, motif: r.motif, status: r.status });
        continue;  // une page qui échoue ne fait pas tomber l'audit
      }

      if (premier) {
        premier = false;
        if (cleUrl(r.urlFinale) !== cleUrl(url)) resultat.redirectionAccueil = r.urlFinale;
        try { resultat.httpsOk = new URL(r.urlFinale).protocol === "https:"; } catch { /* garde la valeur */ }
      }

      const donnees = extraire(r.corps);
      resultat.pages.push({
        ok: true,
        url: url.href,
        status: r.status,
        donnees,
        typesJsonLd: typesJsonLd(donnees.jsonLd),
      });

      for (const href of donnees.liens) {
        if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
        let abs;
        try { abs = new URL(href, r.urlFinale); } catch { continue; }
        if (!memeSiteLegitime(abs, origine)) continue;   // jamais de lien externe
        if (EXT_IGNOREES.test(abs.pathname)) continue;
        abs.hash = "";
        if (!liensRencontres.has(cleUrl(abs))) liensRencontres.set(cleUrl(abs), { url: abs, depuis: url.href });
        ajouter(abs);
      }
    }

    resultat.limiteAtteinte = file.length > 0;

    // --- 5. Liens internes non explorés : vérification bornée ---
    const explores = new Set(resultat.pages.map((p) => cleUrl(p.url)));
    const aVerifier = [...liensRencontres.values()]
      .filter((l) => !explores.has(cleUrl(l.url)))
      // Le robots.txt vaut aussi pour ces vérifications : un chemin
      // interdit ne doit être touché par AUCUNE requête, même un HEAD.
      .filter((l) => cheminAutorise(resultat.robotsTxt, l.url.pathname))
      .slice(0, cfg.maxLiensVerifies);

    for (const l of aVerifier) {
      if (budgetEpuise()) break;
      const r = await recuperer(l.url.href, "HEAD");
      if (!r.ok && r.motif === "http" && r.status >= 400) {
        resultat.liensCasses.push({ url: l.url.href, depuis: l.depuis, status: r.status });
      }
    }
    // Les 404 rencontrés pendant l'exploration comptent aussi.
    for (const p of resultat.pages) {
      if (!p.ok && p.status >= 400) {
        const src = liensRencontres.get(cleUrl(p.url));
        if (src) resultat.liensCasses.push({ url: p.url, depuis: src.depuis, status: p.status });
      }
    }

    // --- 6. Pages orphelines ---
    if (resultat.sitemap.present && resultat.pages.length > 1) {
      const lies = new Set([...liensRencontres.keys(), cleUrl(depart)]);
      resultat.orphelines = resultat.sitemap.urls
        .filter((u) => !lies.has(cleUrl(u)))
        .slice(0, 5);
    }

    return resultat;
  }

  return { explorer, recuperer };
}
