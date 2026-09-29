// =============================================================
//  Analyse SEO publique — en LECTURE SEULE
// =============================================================
//  Remplace le stub. Le robot analyse désormais réellement les
//  sites publics des fiches « à faire », mais il ne modifie
//  toujours RIEN : ni le site, ni Firebase.
//
//  CE QUI N'EST PAS UTILISÉ ICI, ET NE DOIT JAMAIS L'ÊTRE
//    • les identifiants WordPress (adminUrl, login, pass)
//    • l'e-mail, le téléphone, l'adresse du client
//    • les pièces jointes
//    • le token Firebase
//  Le contexte reçu (lib/validate.js) ne contient volontairement
//  aucune de ces données.
//
//  NI OPENAI, NI OPENSEO. L'audit est entièrement déterministe :
//  des règles SEO explicites, aucun appel à un modèle, aucun coût.
//
//  Le `rapport` produit est destiné à la note Firebase du client :
//  il peut donc citer l'URL, la ville et les pages. Les LOGS, eux,
//  ne reçoivent que des compteurs — voir le résumé anonymisé en bas.
// =============================================================

import { creerCrawler, DEFAUTS } from "./crawl.js";
import { RAISONS_REFUS } from "./reseau.js";
import { auditer, NIVEAUX, REMPLACEMENTS_HOGUET } from "./audit.js";

const LABEL_PRESTATION = {
  seo_complet: "SEO complet",
  seo_local: "SEO local uniquement",
};

const LABEL_ACTIVITE = {
  conciergerie: "conciergerie",
  sous_location: "sous-location",
  les_deux: "conciergerie + sous-location",
};

/**
 * Compose le rapport texte ajouté à la note.
 * Lisible tel quel par Camille, sans jargon inutile.
 */
export function composerRapport(audit, contexte, crawl) {
  const L = [];
  const { constats, compteurs } = audit;

  const critiques = constats.filter((c) => c.niveau === NIVEAUX.CRITIQUE);
  const avertissements = constats.filter((c) => c.niveau === NIVEAUX.AVERTISSEMENT);
  const bons = constats.filter((c) => c.niveau === NIVEAUX.OK);

  L.push(`Audit SEO automatique — ${contexte.url || "site"}`);
  const meta = [];
  if (contexte.ville) meta.push(`ville : ${contexte.ville}`);
  if (contexte.activite) meta.push(`activité : ${LABEL_ACTIVITE[contexte.activite] || contexte.activite}`);
  if (contexte.prestation) meta.push(`prestation : ${LABEL_PRESTATION[contexte.prestation] || contexte.prestation}`);
  meta.push(contexte.carteG ? "Carte G : oui" : "SANS Carte G — Loi Hoguet applicable");
  L.push(meta.join(" · "));
  L.push(`${compteurs.pagesAnalysees} page(s) analysée(s)` +
    (crawl.limiteAtteinte ? " (limite d'exploration atteinte, le site est plus grand)" : "") +
    ` — ${compteurs.erreursCritiques} problème(s) critique(s), ${compteurs.avertissements} avertissement(s).`);
  L.push("");

  const bloc = (titre, liste) => {
    if (!liste.length) return;
    L.push(titre);
    for (const c of liste) {
      L.push(`  • ${c.message}${c.page ? `  [${c.page}]` : ""}`);
    }
    L.push("");
  };

  bloc("🔴 À CORRIGER EN PRIORITÉ", critiques);
  bloc("🟠 À AMÉLIORER", avertissements);
  bloc("✅ CE QUI VA BIEN", bons);

  // Rappels métier, toujours utiles à Camille.
  const rappels = [];
  if (contexte.loiHoguet) {
    rappels.push(
      "Client SANS Carte G : ne jamais employer « gestion », « gestionnaire », " +
      "« gérer » ni « gestion locative ». Vocabulaire autorisé : " +
      REMPLACEMENTS_HOGUET.join(", ") + "."
    );
  }
  if (!contexte.zoneConfirmee) {
    rappels.push(
      "La zone exacte n'est pas confirmée par le client : n'ajouter aucune commune " +
      "au contenu tant qu'elle ne l'est pas."
    );
  } else {
    rappels.push("N'ajouter aucune ville hors de la zone confirmée par le client.");
  }
  if (rappels.length) {
    L.push("📌 RAPPELS");
    rappels.forEach((r) => L.push(`  • ${r}`));
    L.push("");
  }

  L.push("Audit automatique, sans intervention humaine : à relire avant de l'envoyer au client.");
  return L.join("\n").trim();
}

/**
 * Résumé destiné aux LOGS PUBLICS.
 * Uniquement des nombres et des catégories — jamais d'URL, de ville,
 * de contenu de page ni de donnée client.
 */
export function resumeAnonymeAnalyse(resultat) {
  if (!resultat || !resultat.disponible) {
    return { disponible: false, motif: (resultat && resultat.motif) || "indisponible" };
  }
  return {
    disponible: true,
    pagesAnalysees: resultat.pagesAnalysees,
    pagesEnEchec: resultat.pagesEnEchec,
    erreursCritiques: resultat.erreursCritiques,
    avertissements: resultat.avertissements,
    pointsOk: resultat.pointsOk,
    categories: resultat.categories,
  };
}

/**
 * Point d'entrée de l'analyse.
 *
 * @param {object} contexte  issu de validate.verifier() — sans aucune donnée sensible
 * @param {object} [options] { fetchImpl, maxPages, timeoutMs, budgetMs }
 * @returns {Promise<{disponible, motif?, pagesAnalysees, pagesEnEchec,
 *                    erreursCritiques, avertissements, pointsOk,
 *                    categories, constats, rapport}>}
 */
export async function analyser(contexte = {}, options = {}) {
  const url = contexte.url;

  if (!url) {
    return {
      disponible: false,
      motif: "Aucune URL publique renseignée sur la fiche : rien à analyser.",
      rapport: null,
    };
  }

  // ?? et non || : 0 est une valeur volontaire (« ne vérifie aucun lien »).
  //
  // Le resolveur n'est transmis que si l'appelant en fournit un.
  // Sinon creerCrawler() branche le resolver système : la vérification
  // DNS est active par défaut, sans dépendre de la présence de fetchImpl.
  const crawler = creerCrawler({
    fetchImpl: options.fetchImpl,
    ...(options.resolveur !== undefined ? { resolveur: options.resolveur } : {}),
    maxPages: options.maxPages ?? DEFAUTS.maxPages,
    timeoutMs: options.timeoutMs ?? DEFAUTS.timeoutMs,
    budgetMs: options.budgetMs ?? DEFAUTS.budgetMs,
    maxLiensVerifies: options.maxLiensVerifies ?? DEFAUTS.maxLiensVerifies,
  });

  let crawl;
  try {
    crawl = await crawler.explorer(url);
  } catch {
    // Aucune exception ne doit remonter : un site en panne ne casse pas le job.
    return { disponible: false, motif: "Erreur inattendue pendant l'exploration du site.", rapport: null };
  }

  if (!crawl.ok) {
    if (crawl.motif === "url-refusee") {
      const details = {
        [RAISONS_REFUS.HOTE_LOCAL]: "l'adresse désigne un hôte local ou interne",
        [RAISONS_REFUS.IP_PRIVEE]: "l'adresse pointe vers une IP privée, non publique",
        [RAISONS_REFUS.METADONNEES_CLOUD]: "l'adresse vise un service de métadonnées cloud",
        [RAISONS_REFUS.PROTOCOLE]: "le protocole n'est ni http ni https",
        [RAISONS_REFUS.DNS]: "le domaine n'a pas pu être résolu",
      };
      return {
        disponible: false,
        motif: `URL refusée par le garde-fou réseau : ${details[crawl.raison] || crawl.raison}.`,
        rapport: null,
      };
    }
    return { disponible: false, motif: "URL publique invalide ou inexploitable.", rapport: null };
  }

  const reussies = crawl.pages.filter((p) => p.ok);
  if (reussies.length === 0) {
    return {
      disponible: false,
      motif: "Le site n'a répondu sur aucune page : audit impossible.",
      rapport: null,
    };
  }

  const audit = auditer(crawl, contexte);

  return {
    disponible: true,
    pagesAnalysees: audit.compteurs.pagesAnalysees,
    pagesEnEchec: audit.compteurs.pagesEnEchec,
    erreursCritiques: audit.compteurs.erreursCritiques,
    avertissements: audit.compteurs.avertissements,
    pointsOk: audit.compteurs.pointsOk,
    categories: audit.categories,
    constats: audit.constats,
    limiteAtteinte: crawl.limiteAtteinte,
    rapport: composerRapport(audit, contexte, crawl),
  };
}
