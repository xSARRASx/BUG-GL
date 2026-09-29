// =============================================================
//  Faux fetch, pour tester le client REST hors ligne
// =============================================================
//  Simule les réponses de l'API REST Firebase (ETag / If-Match)
//  sans aucun accès réseau. Mémorise les requêtes reçues afin de
//  vérifier ce qui a — ou n'a pas — été envoyé.
//
//  Le scénario peut varier d'une tentative à l'autre : `putStatus`
//  et `statut` acceptent un tableau, consommé dans l'ordre, ce qui
//  permet de simuler « 412 puis 200 » et la relecture qui va avec.
// =============================================================

const TOKEN_FACTICE = "jeton-factice-pour-les-tests-0000";

/** Réponse minimale compatible avec ce que lit lib/rest.js. */
function reponse({ status = 200, body = null, etag = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nom) => (String(nom).toLowerCase() === "etag" ? etag : null) },
    text: async () => (body === undefined ? "null" : JSON.stringify(body)),
  };
}

/** Renvoie l'élément d'un tableau pour l'appel n°i, ou la valeur telle quelle. */
function pourAppel(valeur, i) {
  if (!Array.isArray(valeur)) return valeur;
  return valeur[Math.min(i, valeur.length - 1)];
}

/**
 * @param {object} scenario
 * @param {*|Array}      scenario.statut     valeur(s) renvoyée(s) par le GET (null = absent)
 * @param {string|Array} [scenario.etag]     ETag(s) renvoyé(s) par le GET
 * @param {number}       [scenario.getStatus]
 * @param {number|Array} [scenario.putStatus] code(s) HTTP du PUT
 * @param {boolean}      [scenario.getJette]
 * @param {boolean}      [scenario.putJette]
 * @param {boolean}      [scenario.sansEtag]
 */
export function creerFauxFetch(scenario = {}) {
  const {
    statut = "afaire",
    etag = 'W/"abc123"',
    getStatus = 200,
    putStatus = 200,
    getJette = false,
    putJette = false,
    sansEtag = false,
  } = scenario;

  const requetes = [];
  let nbGet = 0;
  let nbPut = 0;

  const fetchImpl = async (url, options = {}) => {
    const methode = options.method || "GET";
    requetes.push({
      methode,
      url,
      headers: options.headers || {},
      body: options.body,
    });

    if (methode === "GET") {
      const i = nbGet++;
      if (getJette) throw new Error("panne réseau simulée (GET)");
      const code = pourAppel(getStatus, i);
      if (code !== 200) return reponse({ status: code });
      return reponse({
        status: 200,
        body: pourAppel(statut, i),
        etag: sansEtag ? null : pourAppel(etag, i),
      });
    }

    const i = nbPut++;
    if (putJette) throw new Error("panne réseau simulée (PUT)");
    return reponse({ status: pourAppel(putStatus, i) });
  };

  const getIdToken = async () => TOKEN_FACTICE;

  return {
    fetchImpl,
    getIdToken,
    requetes,
    TOKEN_FACTICE,
    get gets() { return requetes.filter((q) => q.methode === "GET"); },
    get puts() { return requetes.filter((q) => q.methode === "PUT"); },
  };
}

export { TOKEN_FACTICE };
