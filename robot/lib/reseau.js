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

import { isIPv4, isIPv6 } from "node:net";

/**
 * Jeton d'exemption explicite, réservé aux tests.
 * Il n'existe AUCUN autre moyen de désactiver la vérification DNS :
 * une valeur absente, nulle ou invalide active le resolver système.
 * On ne peut donc pas perdre la protection par inadvertance.
 */
export const SANS_DNS = Symbol("sans-verification-dns");

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

/** Reconstitue une IPv4 pointée à partir des deux derniers groupes IPv6. */
function groupesVersIPv4(g6, g7) {
  return [(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff].join(".");
}

/**
 * Développe une IPv6 en ses 8 groupes de 16 bits.
 *
 * Gère les formes équivalentes d'une même adresse :
 *   ::ffff:127.0.0.1   (IPv4-mapped, notation pointée)
 *   ::ffff:7f00:1      (IPv4-mapped, notation hexadécimale)
 *   0:0:0:0:0:ffff:7f00:1  (forme développée)
 * Les trois désignent 127.0.0.1 et doivent toutes être refusées.
 *
 * @returns {number[]|null} 8 entiers, ou null si l'adresse est illisible
 */
export function groupesIPv6(adresse) {
  let s = String(adresse || "").toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!s) return null;

  // Queue en notation pointée → deux groupes hexadécimaux.
  const pointee = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (pointee) {
    const o = pointee[2].split(".").map(Number);
    if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = pointee[1] + (((o[0] << 8) | o[1]).toString(16)) + ":" + (((o[2] << 8) | o[3]).toString(16));
  }

  const moities = s.split("::");
  if (moities.length > 2) return null;

  const gauche = moities[0] ? moities[0].split(":").filter((x) => x !== "") : [];
  const droite = moities.length === 2 && moities[1] ? moities[1].split(":").filter((x) => x !== "") : [];

  let groupes;
  if (moities.length === 1) {
    if (gauche.length !== 8) return null;
    groupes = gauche;
  } else {
    const manquants = 8 - gauche.length - droite.length;
    if (manquants < 0) return null;
    groupes = [...gauche, ...Array(manquants).fill("0"), ...droite];
  }

  const nombres = groupes.map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  if (nombres.some((n) => !Number.isInteger(n))) return null;
  return nombres;
}

/**
 * Vrai si l'adresse IPv6 n'est pas routable sur l'internet public.
 * Au moindre doute — adresse illisible — on refuse.
 */
export function ipv6Privee(adresse) {
  const g = groupesIPv6(adresse);
  if (!g) return true;   // illisible ⇒ refus

  const sixPremiersNuls = g.slice(0, 6).every((x) => x === 0);

  // ::  et  ::1
  if (sixPremiersNuls && g[6] === 0 && g[7] <= 1) return true;

  // IPv4-mapped ::ffff:0:0/96 — quelle que soit sa notation.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return ipv4Privee(groupesVersIPv4(g[6], g[7]));
  }
  // IPv4-compatible ::a.b.c.d (obsolète mais accepté par des piles réseau).
  if (sixPremiersNuls) return ipv4Privee(groupesVersIPv4(g[6], g[7]));

  // NAT64 64:ff9b::/96 — encapsule aussi une IPv4.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return ipv4Privee(groupesVersIPv4(g[6], g[7]));
  }

  const tete = g[0];
  if ((tete & 0xffc0) === 0xfe80) return true;   // fe80::/10  link-local
  if ((tete & 0xfe00) === 0xfc00) return true;   // fc00::/7   unique local
  if ((tete & 0xff00) === 0xff00) return true;   // ff00::/8   multicast

  return false;
}

/** Vrai si la chaîne est une IP non routable publiquement, quelle que soit sa famille. */
export function ipPrivee(adresse) {
  const a = String(adresse || "").replace(/^\[|\]$/g, "").split("%")[0];
  if (isIPv4(a)) return ipv4Privee(a);
  if (isIPv6(a)) return ipv6Privee(a);
  // Ni IPv4 ni IPv6 valide : on ne sait pas ce que c'est, donc on refuse.
  return true;
}

/** Contrôle du nom d'hôte seul, sans DNS. */
export function hoteAutorise(hostname) {
  const h = String(hostname || "").toLowerCase().trim().replace(/\.$/, "");
  if (!h) return { ok: false, raison: RAISONS_REFUS.URL_INVALIDE };

  if (HOTES_METADONNEES.has(h)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD };
  if (HOTES_INTERDITS.has(h)) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };
  if (SUFFIXES_INTERDITS.some((s) => h.endsWith(s))) return { ok: false, raison: RAISONS_REFUS.HOTE_LOCAL };

  // Hôte écrit directement en IP : on s'appuie sur node:net plutôt que
  // sur des heuristiques de chaîne.
  const sansCrochets = h.replace(/^\[|\]$/g, "");
  if (isIPv4(sansCrochets) || isIPv6(sansCrochets)) {
    if (HOTES_METADONNEES.has(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD };
    if (ipPrivee(sansCrochets)) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE };
    return { ok: true };
  }
  // Une chaîne qui ressemble à une IPv6 sans en être une valide : refus.
  if (sansCrochets.includes(":")) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE };

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
 * @param {Function|symbol} [options.resolveur]
 *        async (hostname) => string[] d'adresses IP. Injectable pour les
 *        tests. ABSENT ⇒ le resolver système est utilisé : la vérification
 *        DNS est active par défaut. Seul le jeton SANS_DNS la désactive,
 *        et il est réservé aux tests.
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

  // Exemption explicite, réservée aux tests.
  if (options.resolveur === SANS_DNS) return { ok: true };

  // ⚠️ FAIL-SAFE : toute autre valeur (absente, nulle, invalide) retombe
  // sur le resolver système. On ne peut pas perdre la vérification DNS
  // par oubli — seul SANS_DNS la désactive.
  const resolveur = typeof options.resolveur === "function" ? options.resolveur : resolveurSysteme;

  // Un domaine public peut pointer vers une IP privée : on vérifie
  // ce que le DNS renvoie réellement.
  let adresses;
  try {
    adresses = await resolveur(u.hostname);
  } catch {
    return { ok: false, raison: RAISONS_REFUS.DNS };
  }
  if (!Array.isArray(adresses) || adresses.length === 0) {
    return { ok: false, raison: RAISONS_REFUS.DNS };
  }

  // TOUTES les adresses sont contrôlées : une seule non publique suffit
  // à refuser l'URL.
  for (const adresse of adresses) {
    const a = String(adresse).replace(/^\[|\]$/g, "").split("%")[0];
    if (HOTES_METADONNEES.has(a)) return { ok: false, raison: RAISONS_REFUS.METADONNEES_CLOUD, adresses };
    if (ipPrivee(a)) return { ok: false, raison: RAISONS_REFUS.IP_PRIVEE, adresses };
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
