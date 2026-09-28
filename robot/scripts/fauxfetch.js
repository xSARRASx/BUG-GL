// =============================================================
//  Faux fetch, pour tester le client REST hors ligne
// =============================================================
//  Simule les réponses de l'API REST Firebase (ETag / If-Match)
//  sans aucun accès réseau. Mémorise les requêtes reçues afin de
//  vérifier ce qui a — ou n'a pas — été envoyé.
// =============================================================

const TOKEN_FACTICE = "jeton-factice-pour-les-tests-0000";

/** Réponse minimale compatible avec ce que lit lib/rest.js. */
function reponse({ status = 200, body = null, etag = null } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nom) => (String(nom).toLowerCase() === "etag" ? etag : null) },
    text: async () => (body === null ? "null" : JSON.stringify(body)),
  };
}

/**
 * @param {object} scenario
 * @param {*}       scenario.statut       valeur renvoyée par le GET (null = absent)
 * @param {string}  [scenario.etag]       ETag renvoyé par le GET
 * @param {number}  [scenario.getStatus]  code HTTP du GET
 * @param {number}  [scenario.putStatus]  code HTTP du PUT
 * @param {boolean} [scenario.getJette]   le GET lève (panne réseau)
 * @param {boolean} [scenario.putJette]   le PUT lève (panne réseau)
 * @param {boolean} [scenario.sansEtag]   le GET ne renvoie pas d'ETag
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

  const fetchImpl = async (url, options = {}) => {
    const methode = options.method || "GET";
    requetes.push({
      methode,
      url,
      headers: options.headers || {},
      body: options.body,
    });

    if (methode === "GET") {
      if (getJette) throw new Error("panne réseau simulée (GET)");
      if (getStatus !== 200) return reponse({ status: getStatus });
      return reponse({ status: 200, body: statut, etag: sansEtag ? null : etag });
    }

    if (putJette) throw new Error("panne réseau simulée (PUT)");
    return reponse({ status: putStatus });
  };

  const getIdToken = async () => TOKEN_FACTICE;

  return { fetchImpl, getIdToken, requetes, TOKEN_FACTICE };
}

export { TOKEN_FACTICE };
