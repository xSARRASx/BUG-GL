// =============================================================
//  Transport HTTP avec adresse ÉPINGLÉE
// =============================================================
//  PROBLÈME RÉSOLU ICI : le TOCTOU DNS (DNS rebinding)
//
//  Jusqu'ici, urlAutorisee() résolvait le nom et validait les IP,
//  puis fetch() recevait de nouveau le HOSTNAME et effectuait sa
//  PROPRE résolution. Rien ne garantissait que l'adresse validée et
//  l'adresse réellement contactée soient la même : un DNS hostile
//  pouvait répondre 93.184.216.34 à la validation, puis 192.168.1.20
//  à la connexion.
//
//  PARADE
//  Une seule résolution, contrôlée, puis connexion vers l'une des
//  adresses DÉJÀ VALIDÉES, via l'option `lookup` de node:http(s) —
//  qui court-circuite toute nouvelle résolution.
//
//  Ce qui est conservé, parce que la sécurité TLS en dépend :
//    • l'en-tête Host porte le nom d'origine
//    • le SNI porte le nom d'origine
//    • le certificat est validé contre le nom d'origine
//    • rejectUnauthorized reste à true — JAMAIS désactivé
//
//  Les réponses sont lues en flux, avec une limite stricte : on ne
//  charge jamais un corps de taille inconnue en mémoire.
// =============================================================

import http from "node:http";
import https from "node:https";
import { urlAutorisee } from "./reseau.js";

/** Limites de taille, par nature de ressource. */
export const LIMITES = {
  html: 3 * 1024 * 1024,      // 3 Mo — une page très lourde reste sous cette barre
  robots: 128 * 1024,         // 128 Ko — un robots.txt normal fait quelques lignes
  sitemap: 8 * 1024 * 1024,   // 8 Mo — un sitemap peut légitimement être gros
  defaut: 3 * 1024 * 1024,
};

export class TransportRefuse extends Error {
  constructor(raison) {
    super(`Requête refusée par le garde-fou réseau (${raison}).`);
    this.name = "TransportRefuse";
    this.raison = raison;
  }
}

export class ReponseTropVolumineuse extends Error {
  constructor(limite) {
    super(`Réponse abandonnée : elle dépasse la limite de ${limite} octets.`);
    this.name = "ReponseTropVolumineuse";
    this.limite = limite;
  }
}

/**
 * Construit le `lookup` épinglé passé à node:http(s).
 *
 * Il IGNORE le hostname qu'on lui passe et renvoie toujours les
 * adresses déjà validées. Aucune résolution DNS ne peut donc avoir
 * lieu au moment de la connexion : une seconde réponse DNS, même
 * hostile, n'a aucun effet.
 *
 * @param {string[]} adresses adresses validées, dans l'ordre d'essai
 */
export function creerLookupEpingle(adresses) {
  const liste = (adresses || []).map((a) => {
    const ip = String(a).replace(/^\[|\]$/g, "").split("%")[0];
    return { address: ip, family: ip.includes(":") ? 6 : 4 };
  });

  return function lookupEpingle(_hostname, options, callback) {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : (options || {});

    if (liste.length === 0) {
      cb(new TransportRefuse("aucune-adresse-validee"));
      return;
    }
    if (opts.all) {
      cb(null, liste.map((e) => ({ ...e })));
      return;
    }
    // Node attend (err, address, family) dans ce mode.
    cb(null, liste[0].address, liste[0].family);
  };
}

/**
 * Lit un flux en s'arrêtant net au-delà de `limite` octets.
 *
 * La limite s'applique aux octets RÉELLEMENT reçus : un Content-Length
 * absent ou mensonger ne permet pas de la contourner.
 *
 * @returns {Promise<Buffer>}
 * @throws {ReponseTropVolumineuse}
 */
export function lireAvecLimite(flux, limite) {
  return new Promise((resolve, reject) => {
    const morceaux = [];
    let recus = 0;
    let abandonne = false;

    flux.on("data", (morceau) => {
      if (abandonne) return;
      recus += morceau.length;
      if (recus > limite) {
        abandonne = true;
        flux.destroy();
        reject(new ReponseTropVolumineuse(limite));
        return;
      }
      morceaux.push(morceau);
    });

    flux.on("end", () => { if (!abandonne) resolve(Buffer.concat(morceaux)); });
    flux.on("close", () => { if (!abandonne) resolve(Buffer.concat(morceaux)); });
    flux.on("error", (e) => { if (!abandonne) reject(e); });
  });
}

/**
 * Essaie chaque adresse validée, dans l'ordre, jusqu'à ce qu'une
 * réponde. Ne retombe JAMAIS sur une adresse hors de la liste : si
 * toutes échouent, on abandonne.
 *
 * @param {string[]} adresses
 * @param {Function} essai  async (adresse) => résultat
 */
export async function essayerAdresses(adresses, essai) {
  const liste = adresses || [];
  if (liste.length === 0) throw new TransportRefuse("aucune-adresse-validee");

  let derniere;
  for (const adresse of liste) {
    try {
      return await essai(adresse);
    } catch (e) {
      derniere = e;
      // On passe à l'adresse validée suivante — jamais à une autre.
    }
  }
  throw derniere || new TransportRefuse("toutes-adresses-en-echec");
}

/** Une requête unique vers UNE adresse épinglée. */
function requeteVersAdresse(u, adresse, { methode, entetes, limite, signal }) {
  return new Promise((resolve, reject) => {
    const securise = u.protocol === "https:";
    const module = securise ? https : http;

    const requete = module.request(
      {
        protocol: u.protocol,
        // hostname conservé : il sert au Host, au SNI et au certificat.
        hostname: u.hostname,
        port: u.port || (securise ? 443 : 80),
        path: u.pathname + u.search,
        method: methode,
        headers: { ...entetes, Host: u.host },
        // ⚠️ Le cœur de la parade : la connexion va vers l'adresse déjà
        // validée, sans nouvelle résolution.
        lookup: creerLookupEpingle([adresse]),
        // TLS : validation complète, jamais désactivée.
        servername: securise ? u.hostname : undefined,
        rejectUnauthorized: true,
        signal,
      },
      async (reponse) => {
        try {
          const corps = await lireAvecLimite(reponse, limite);
          resolve({ reponse, corps });
        } catch (e) {
          reponse.destroy();
          reject(e);
        }
      }
    );

    requete.on("error", reject);
    requete.end();
  });
}

/**
 * Fabrique une fonction compatible `fetch` dont l'adresse de connexion
 * est épinglée sur une IP validée.
 *
 * L'appelant fournit les adresses déjà validées via
 * `options.adressesEpinglees`. Si elles manquent, la validation est
 * refaite ici : on ne contacte jamais un hôte non vérifié.
 *
 * @param {object} cfg
 * @param {Function|symbol} [cfg.resolveur]
 */
export function creerFetchEpingle(cfg = {}) {
  return async function fetchEpingle(url, options = {}) {
    let u;
    try { u = new URL(String(url)); } catch { throw new TransportRefuse("url-invalide"); }

    // Adresses validées par l'appelant, sinon on valide ici même.
    let adresses = options.adressesEpinglees;
    if (!Array.isArray(adresses) || adresses.length === 0) {
      const verdict = await urlAutorisee(u, { resolveur: cfg.resolveur });
      if (!verdict.ok) throw new TransportRefuse(verdict.raison);
      adresses = verdict.adresses;
    }
    if (!Array.isArray(adresses) || adresses.length === 0) {
      throw new TransportRefuse("aucune-adresse-validee");
    }

    const limite = Number(options.limiteOctets) || LIMITES.defaut;

    const { reponse, corps } = await essayerAdresses(adresses, (adresse) =>
      requeteVersAdresse(u, adresse, {
        methode: options.method || "GET",
        entetes: options.headers || {},
        limite,
        signal: options.signal,
      })
    );

    const statut = reponse.statusCode;
    const texte = options.method === "HEAD" ? "" : corps.toString("utf8");

    // Forme compatible avec ce qu'attend lib/crawl.js.
    return {
      ok: statut >= 200 && statut < 300,
      status: statut,
      url: String(url),
      headers: {
        get: (nom) => {
          const v = reponse.headers[String(nom).toLowerCase()];
          return Array.isArray(v) ? v[0] : (v === undefined ? null : v);
        },
      },
      text: async () => texte,
    };
  };
}
