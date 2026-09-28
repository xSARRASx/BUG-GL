// =============================================================
//  Transitions de statut par requêtes REST conditionnelles
// =============================================================
//  POURQUOI ABANDONNER runTransaction()
//  ------------------------------------
//  Dans un processus Node court, le SDK client n'a pas de cache
//  peuplé : le callback de runTransaction() est appelé avec `null`,
//  la transaction est avortée et n'est jamais rejouée avec la valeur
//  serveur. Un get() préalable ne suffit pas — il alimente le cache
//  de la couche Database, pas celui utilisé par la transaction. Le
//  test actif #8 l'a confirmé : pré-read « afaire », puis snapshot de
//  transaction `null` et commit refusé.
//
//  LA PARADE
//  ---------
//  L'API REST de Firebase expose l'équivalent officiel des
//  transactions : les requêtes conditionnelles.
//    1. GET  avec l'en-tête `X-Firebase-ETag: true` → renvoie un ETag
//    2. PUT  avec l'en-tête `If-Match: <ETag>` → n'écrit que si la
//       valeur n'a pas changé entre-temps
//  Un 412 signifie « quelqu'un est passé avant », sans aucune écriture.
//  C'est atomique côté serveur, sans dépendre d'un cache local.
//
//  ⚠️ L'ID token transite en paramètre d'URL (`?auth=`), comme le veut
//  l'API REST. Aucune URL n'est donc journalisée telle quelle, et le
//  token est enregistré comme secret pour être masqué partout.
// =============================================================

export const RAISONS = {
  CONFIRME: "confirme",                 // 200 : transition écrite
  DEJA_CIBLE: "deja_cible",             // la valeur était déjà celle visée
  SOURCE_DIFFERENTE: "source_differente", // le GET ne voit pas le statut source
  ABSENT: "absent",                     // le champ n'existe pas côté serveur
  COURSE: "course",                     // 412 : modifié entre le GET et le PUT
  AUTORISATION: "autorisation",         // 401 / 403
  ETAG_ABSENT: "etag_absent",           // réponse sans ETag : écriture impossible
  RESEAU: "reseau",                     // fetch a échoué
  HTTP: "http",                         // tout autre code
};

/** Une raison qui n'est pas celle-ci n'autorise jamais à conclure au succès. */
export function transitionConfirmee(resultat) {
  return Boolean(resultat) && resultat.ok === true;
}

/**
 * @param {object} cfg
 * @param {string}   cfg.databaseURL  URL de la Realtime Database
 * @param {Function} cfg.getIdToken   () => Promise<string> — jamais journalisé
 * @param {Function} [cfg.fetchImpl]  injectable pour les tests hors ligne
 */
export function creerClientRest({ databaseURL, getIdToken, fetchImpl }) {
  const base = String(databaseURL || "").replace(/\/+$/, "");
  const http = fetchImpl || globalThis.fetch;

  if (!base) throw new Error("databaseURL manquante pour le client REST.");
  if (typeof http !== "function") throw new Error("Aucune implémentation de fetch disponible.");

  const urlStatut = (cle, token) =>
    `${base}/seo/${encodeURIComponent(cle)}/statut.json?auth=${encodeURIComponent(token)}`;

  /**
   * Lecture du statut, avec son ETag.
   * @returns {Promise<{ok: boolean, raison: string, statut?: *, etag?: string, http?: number}>}
   */
  async function lireStatutAvecEtag(cle) {
    let token;
    let rep;
    try {
      token = await getIdToken();
      rep = await http(urlStatut(cle, token), {
        method: "GET",
        headers: { "X-Firebase-ETag": "true" },
      });
    } catch {
      // Le message d'erreur réseau peut contenir l'URL, donc le token :
      // on ne le propage jamais.
      return { ok: false, raison: RAISONS.RESEAU };
    }

    if (rep.status === 401 || rep.status === 403) {
      return { ok: false, raison: RAISONS.AUTORISATION, http: rep.status };
    }
    if (!rep.ok) {
      return { ok: false, raison: RAISONS.HTTP, http: rep.status };
    }

    let statut;
    try {
      const texte = await rep.text();
      statut = texte === "" ? null : JSON.parse(texte);
    } catch {
      return { ok: false, raison: RAISONS.HTTP, http: rep.status };
    }

    const etag = rep.headers && typeof rep.headers.get === "function" ? rep.headers.get("ETag") : null;
    return { ok: true, raison: "lu", statut, etag, http: rep.status };
  }

  /**
   * Transition de statut atomique, équivalent REST d'une transaction.
   *
   * @param {string} cle           clé Firebase de la fiche
   * @param {string} statutSource  valeur attendue avant écriture
   * @param {string} statutCible   valeur à écrire
   * @param {object} [options]
   * @param {boolean} [options.dejaCibleEstSucces]
   *        si le GET voit déjà `statutCible`, considérer l'objectif
   *        atteint et renvoyer un succès sans écrire (utilisé pour la
   *        libération : une fiche déjà « afaire » est bien libérée).
   *
   * @returns {Promise<{ok: boolean, raison: string, statutLu?: *, http?: number}>}
   *   ok:true UNIQUEMENT sur 200 (ou objectif déjà atteint).
   *   Toute autre réponse est un échec — jamais un succès par défaut.
   */
  async function changerStatutConditionnel(cle, statutSource, statutCible, options = {}) {
    const lecture = await lireStatutAvecEtag(cle);
    if (!lecture.ok) return { ok: false, raison: lecture.raison, http: lecture.http };

    const statutLu = lecture.statut;

    // Objectif déjà atteint (libération d'une fiche déjà rendue).
    if (options.dejaCibleEstSucces && statutLu === statutCible) {
      return { ok: true, raison: RAISONS.DEJA_CIBLE, statutLu };
    }

    // Jamais d'écriture sur une donnée absente : on ne crée rien.
    if (statutLu === null || statutLu === undefined) {
      return { ok: false, raison: RAISONS.ABSENT, statutLu: null };
    }

    if (statutLu !== statutSource) {
      return { ok: false, raison: RAISONS.SOURCE_DIFFERENTE, statutLu };
    }

    if (!lecture.etag) {
      // Sans ETag, l'écriture ne serait pas conditionnelle : on refuse
      // plutôt que d'écrire sans garantie d'atomicité.
      return { ok: false, raison: RAISONS.ETAG_ABSENT, statutLu };
    }

    let token;
    let rep;
    try {
      token = await getIdToken();
      rep = await http(urlStatut(cle, token), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": lecture.etag,
        },
        body: JSON.stringify(statutCible),
      });
    } catch {
      return { ok: false, raison: RAISONS.RESEAU, statutLu };
    }

    if (rep.status === 200) return { ok: true, raison: RAISONS.CONFIRME, statutLu, http: 200 };
    if (rep.status === 412) return { ok: false, raison: RAISONS.COURSE, statutLu, http: 412 };
    if (rep.status === 401 || rep.status === 403) {
      return { ok: false, raison: RAISONS.AUTORISATION, statutLu, http: rep.status };
    }
    // Tout le reste est une erreur, jamais un succès.
    return { ok: false, raison: RAISONS.HTTP, statutLu, http: rep.status };
  }

  return { lireStatutAvecEtag, changerStatutConditionnel };
}
