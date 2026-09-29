// =============================================================
//  Garde-fou réseau — anti-SSRF
// =============================================================
//  Les URL auditées viennent de Firebase : elles sont saisies à la
//  main par Camille, mais rien ne garantit qu'elles pointent vers un
//  site public. Une faute de frappe — ou une saisie malveillante si
//  le compte était un jour compromis — pourrait diriger le robot
//  vers un service interne.
//
//  Ce module décide, AVANT toute requête, si une URL a le droit
//  d'être contactée. Il est appliqué :
//    • à l'URL de départ ;
//    • à chaque redirection acceptée ;
//    • aux sitemaps déclarés dans robots.txt ;
//    • aux sous-sitemaps d'un sitemapindex.
//
//  Module PUR quand le resolver est injecté : entièrement testable
//  hors ligne, sans DNS.
// =============================================================

export const RAISONS_REFUS = {
  URL_INVALIDE: "url-invalide",
  PROTOCOLE: "protocole-non-autorise",
  HOTE_LOCAL: "hote-local",
  IP_PRIVEE: "ip-privee",
  METADONNEES_CLOUD: "metadonnees-cloud",
  DNS: "resolution-impossible",
};

// Noms d'hôtes toujours refusés, quelle que soit la résolution DNS.
const HOTES_INTERDITS = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal", "metadata.goog",
  "instance-data", "instance-data.ec2.internal",
]);

// Suffixes désignant un RÉSEAU INTERNE (RFC 6761, RFC 8375…).
//
// Volontairement absents : .test, .example et .invalid. Ce sont des
// noms réservés qui ne résolvent JAMAIS — ils ne peuvent donc pointer
// vers aucun service, et ne présentent aucun risque SSRF. Les bloquer
// n'apporterait rien et empêcherait d'utiliser les domaines de test
// standards dans nos propres fixtures.
const SUFFIXES_INTERDITS = [
  ".localhost", ".local", ".internal", ".intranet", ".localdomain",
  ".home.arpa",
];

// Hôtes de métadonnées des principaux clouds.
const HOTES_METADONNEES = new Set([
  "169.254.169.254",   // AWS, GCP, Azure, DigitalOcean…
  "169.254.170.2",     // AWS ECS
  "fd00:ec2::254",     // AWS IPv6
  "100.100.100.200",   // Alibaba Cloud
]);

const estIPv4 = (h) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(h);

/** Vrai si l'adresse IPv4 n'est pas routable sur l'internet public. */
export function ipv4Privee(ip) {
  const p = String(ip).split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;

  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 10) return true;                           // 10.0.0.0/8      RFC1918
  if (a === 127) return true;                          // 127.0.0.0/8     loopback
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16  link-local
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12   RFC1918
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16  RFC1918
  if (a === 192 && b === 0) return true;               // 192.0.0.0/24    IETF
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10   CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15  bancs de test
  if (a >= 224) return true;                           // multicast et réservé
  return false;
}

/** Vrai si l'adresse IPv6 n'est pas routable sur l'internet public. */
export function ipv6Privee(ip) {
  const s = String(ip).toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];

  if (s === "::" || s === "::1") return true;                       // non spécifié, loopback
  if (s.startsWith("fe80") || s.startsWith("fe9") ||
      s.startsWith("fea") || s.startsWith("feb")) return true;      // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return true;                                // fc00::/7 unique local
  if (s.startsWith("ff")) return true;                              // multicast

  // IPv4 encapsulée : ::ffff:127.0.0.1
  const m = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (m) return ipv4Privee(m[1]);

  return false;
}

/** Contrôle du nom d'hôte seul, sans DNS. */
export function hoteAutorise(hostname) {
  const h = String(hostname || "").toLowerCase().trim().replace(/\.$/, "");
  if (!h) return { ok: false, raison: RAISONS_REFUS.URL_INVALIDE };

  if (HOTES_METADONNEES.has(h)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD };
  if (HOTES_INTERDITS.has(h)) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };
  if (SUFFIXES_INTERDITS.some((s) => h.endsWith(s))) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };

  // Hôte écrit directement en IP.
  const sansCrochets = h.replace(/^\[|\]$/g, "");
  if (estIPv4(sansCrochets)) {
    if (HOTES_METADONNEES.has(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD };
    if (ipv4Privee(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE };
    return { ok: true };
  }
  if (sansCrochets.includes(":")) {
    if (HOTES_METADONNEES.has(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD };
    if (ipv6Privee(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE };
    return { ok: true };
  }

  // Un vrai domaine public a forcément un point et un TLD alphabétique.
  if (!h.includes(".")) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };
  if (!/\.[a-z]{2,}$/.test(h)) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };

  return { ok: true };
}

/**
 * Contrôle complet d'une URL, avec résolution DNS optionnelle.
 *
 * @param {string|URL} url
 * @param {object} [options]
 * @param {Function} [options.resolveur]  async (hostname) => string[] d'adresses IP.
 *                                        Injectable pour les tests ; si absent,
 *                                        seul le nom d'hôte est contrôlé.
 * @returns {Promise<{ok: boolean, raison?: string, adresses?: string[]}>}
 */
export async function urlAutorisee(url, options = {}) {
  let u;
  try {
    u = typeof url === "string" ? new URL(url) : url;
  } catch {
    return { ok: false, raison: RAISONS_REFUS.URL_INVALIDE };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, raison: RAISONS_REFUS.PROTOCOLE };
  }

  const nom = hoteAutorise(u.hostname);
  if (!nom.ok) return nom;

  // Sans resolver, on s'arrête au contrôle du nom.
  if (typeof options.resolveur !== "function") return { ok: true };

  // Un domaine public peut pointer vers une IP privée : on vérifie
  // ce que le DNS renvoie réellement.
  let adresses;
  try {
    adresses = await options.resolveur(u.hostname);
  } catch {
    return { ok: false, raison: RAISONS_REFUS.DNS };
  }
  if (!Array.isArray(adresses) || adresses.length === 0) {
    return { ok: false, raison: RAISONS_REFUS.DNS };
  }

  for (const adresse of adresses) {
    const a = String(adresse);
    if (HOTES_METADONNEES.has(a)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD, adresses };
    const privee = a.includes(":") ? ipv6Privee(a) : ipv4Privee(a);
    if (privee) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE, adresses };
  }

  return { ok: true, adresses };
}

/** Resolver DNS réel, construit à la demande pour ne pas charger `dns` inutilement. */
export async function resolveurSysteme(hostname) {
  const { lookup } = await import("node:dns/promises");
  const res = await lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => r.address);
}

// -------------------------------------------------------------
//  Même site
// -------------------------------------------------------------
const sansWww = (h) => String(h || "").toLowerCase().replace(/^www\./, "");

/**
 * Vrai si `candidate` est le MÊME site que `origine`, à une variante
 * légitime près : http↔https et www↔sans-www.
 *
 * Tout le reste — autre domaine, sous-domaine différent, autre port —
 * est refusé. C'est ce qui empêche une redirection de faire sortir le
 * robot du domaine du client.
 */
export function memeSiteLegitime(candidate, origine) {
  let a, b;
  try {
    a = typeof candidate === "string" ? new URL(candidate) : candidate;
    b = typeof origine === "string" ? new URL(origine) : origine;
  } catch {
    return false;
  }
  if (a.port !== b.port) return false;
  return sansWww(a.hostname) === sansWww(b.hostname);
}
