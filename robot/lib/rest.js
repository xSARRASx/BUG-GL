// =============================================================
//  Écritures conditionnelles REST (ETag / If-Match)
// =============================================================
//  POURQUOI PAS runTransaction()
//  -----------------------------
//  Dans un processus Node court, le SDK client n'a pas de cache
//  peuplé : le callback de runTransaction() est appelé avec `null`,
//  la transaction est avortée et n'est jamais rejouée avec la valeur
//  serveur. Un get() préalable n'y change rien — il alimente le cache
//  de la couche Database, pas celui de la transaction. Confirmé par le
//  test actif #8 : pré-read « afaire », puis snapshot de transaction
//  `null` et commit refusé.
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
//  DEUX USAGES, DEUX POLITIQUES SUR LE 412
//  ---------------------------------------
//  • Transition de statut : un 412 est une vraie collision. Réessayer
//    serait faux — quelqu'un a pris la fiche. On abandonne.
//  • Ajout au compte rendu : un 412 signifie que la note a été éditée
//    entre-temps. On RELIT, on recompose à partir du texte à jour, et
//    on retente — c'est ce qui garantit qu'une modification de Camille
//    n'est jamais écrasée.
//
//  ⚠️ L'ID token transite en paramètre d'URL (`?auth=`), comme le veut
//  l'API REST. Aucune URL n'est donc journalisée telle quelle, et le
//  token est enregistré comme secret pour être masqué partout.
//  ⚠️ Aucune valeur lue ou écrite (note, données client) ne remonte
//  dans les messages de retour.
// =============================================================

export const RAISONS = {
  CONFIRME: "confirme",                   // 200 : écriture effectuée
  DEJA_CIBLE: "deja_cible",               // la valeur était déjà celle visée
  SOURCE_DIFFERENTE: "source_differente", // le GET ne voit pas la valeur source
  ABSENT: "absent",                       // le champ n'existe pas côté serveur
  COURSE: "course",                       // 412 : modifié entre le GET et le PUT
  CONFLIT_PERSISTANT: "conflit_persistant", // 412 répétés, tentatives épuisées
  ABANDON: "abandon",                     // le transformateur a renoncé
  AUTORISATION: "autorisation",           // 401 / 403
  ETAG_ABSENT: "etag_absent",             // réponse sans ETag : écriture impossible
  RESEAU: "reseau",                       // fetch a échoué
  HTTP: "http",                           // tout autre code
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

  const url = (chemin, token) => `${base}/${chemin}.json?auth=${encodeURIComponent(token)}`;

  // --- Chemins connus ---
  const cheminStatut = (cle) => `seo/${encodeURIComponent(cle)}/statut`;
  const cheminNote = (cle) => `seo/${encodeURIComponent(cle)}/note`;

  /**
   * Lecture d'un chemin, avec son ETag.
   * @returns {Promise<{ok: boolean, raison: string, valeur?: *, etag?: string, http?: number}>}
   */
  async function lireAvecEtag(chemin) {
    let rep;
    try {
      const token = await getIdToken();
      rep = await http(url(chemin, token), {
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

    let valeur;
    try {
      const texte = await rep.text();
      valeur = texte === "" ? null : JSON.parse(texte);
    } catch {
      return { ok: false, raison: RAISONS.HTTP, http: rep.status };
    }

    const etag = rep.headers && typeof rep.headers.get === "function" ? rep.headers.get("ETag") : null;
    return { ok: true, raison: "lu", valeur, etag, http: rep.status };
  }

  /**
   * Écriture conditionnée par un ETag.
   * @returns {Promise<{ok: boolean, raison: string, http?: number}>}
   */
  async function ecrireConditionnel(chemin, valeur, etag) {
    if (!etag) {
      // Sans ETag, l'écriture ne serait pas conditionnelle : on refuse
      // plutôt que d'écrire sans garantie d'atomicité.
      return { ok: false, raison: RAISONS.ETAG_ABSENT };
    }

    let rep;
    try {
      const token = await getIdToken();
      rep = await http(url(chemin, token), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": etag },
        body: JSON.stringify(valeur),
      });
    } catch {
      return { ok: false, raison: RAISONS.RESEAU };
    }

    if (rep.status === 200) return { ok: true, raison: RAISONS.CONFIRME, http: 200 };
    if (rep.status === 412) return { ok: false, raison: RAISONS.COURSE, http: 412 };
    if (rep.status === 401 || rep.status === 403) {
      return { ok: false, raison: RAISONS.AUTORISATION, http: rep.status };
    }
    // Tout le reste est une erreur, jamais un succès.
    return { ok: false, raison: RAISONS.HTTP, http: rep.status };
  }

  /**
   * Transition de statut atomique, équivalent REST d'une transaction.
   *
   * ⚠️ Un 412 n'est PAS réessayé : sur un statut, il signifie que
   * quelqu'un d'autre a pris la fiche. Réessayer la lui volerait.
   *
   * @param {object} [options]
   * @param {boolean} [options.dejaCibleEstSucces]
   *        si le GET voit déjà `statutCible`, considérer l'objectif
   *        atteint et renvoyer un succès sans écrire (libération).
   */
  async function changerStatutConditionnel(cle, statutSource, statutCible, options = {}) {
    const chemin = cheminStatut(cle);
    const lecture = await lireAvecEtag(chemin);
    if (!lecture.ok) return { ok: false, raison: lecture.raison, http: lecture.http };

    const statutLu = lecture.valeur;

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

    const ecriture = await ecrireConditionnel(chemin, statutCible, lecture.etag);
    return { ...ecriture, statutLu };
  }

  /**
   * Lecture-modification-écriture atomique sur un chemin quelconque.
   *
   * Sur 412, RELIT la valeur à jour, réapplique le transformateur et
   * retente — jusqu'à `maxTentatives`. C'est ce qui garantit qu'une
   * modification concurrente n'est jamais écrasée : la nouvelle valeur
   * est toujours recomposée à partir du texte le plus récent.
   *
   * @param {string}   chemin
   * @param {Function} transformer  (valeurActuelle) => nouvelleValeur
   *                                renvoyer `undefined` pour abandonner
   * @param {object}   [options]
   * @param {number}   [options.maxTentatives=3]
   * @returns {Promise<{ok: boolean, raison: string, tentatives: number, http?: number}>}
   *   Aucune valeur lue ou écrite n'est incluse dans le retour.
   */
  async function modifierConditionnel(chemin, transformer, options = {}) {
    const maxTentatives = Math.max(1, Number(options.maxTentatives) || 3);

    for (let tentative = 1; tentative <= maxTentatives; tentative++) {
      const lecture = await lireAvecEtag(chemin);
      if (!lecture.ok) {
        return { ok: false, raison: lecture.raison, tentatives: tentative, http: lecture.http };
      }

      let nouvelleValeur;
      try {
        nouvelleValeur = transformer(lecture.valeur);
      } catch {
        return { ok: false, raison: RAISONS.ABANDON, tentatives: tentative };
      }
      if (nouvelleValeur === undefined) {
        return { ok: false, raison: RAISONS.ABANDON, tentatives: tentative };
      }

      const ecriture = await ecrireConditionnel(chemin, nouvelleValeur, lecture.etag);

      if (ecriture.ok) return { ok: true, raison: RAISONS.CONFIRME, tentatives: tentative, http: 200 };

      // 412 : la valeur a bougé. On relit et on recompose au tour suivant.
      if (ecriture.raison === RAISONS.COURSE) continue;

      // Autorisation, réseau, ETag absent, autre HTTP : échec immédiat.
      return { ok: false, raison: ecriture.raison, tentatives: tentative, http: ecriture.http };
    }

    // Tentatives épuisées : échec explicite, aucune écriture retenue.
    return { ok: false, raison: RAISONS.CONFLIT_PERSISTANT, tentatives: maxTentatives, http: 412 };
  }

  return {
    lireAvecEtag,
    ecrireConditionnel,
    changerStatutConditionnel,
    modifierConditionnel,
    cheminStatut,
    cheminNote,
  };
}
