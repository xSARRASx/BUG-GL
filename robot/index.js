// =============================================================
//  Robot SEO — orchestrateur (V1, dry-run strict)
// =============================================================
//  En dry-run :
//    • authentifie le compte robot ;
//    • lit les fiches « à faire » via la requête indexée ;
//    • vérifie les champs obligatoires ;
//    • affiche un résumé ANONYMISÉ ;
//    • n'écrit strictement rien (ni statut, ni note, ni /seoRobot).
//
//  Le code du futur mode actif est déjà présent et testé par les
//  garde-fous : il se déclenchera lorsque dryRun passera à false.
// =============================================================

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { initGuard, isDryRun, isAutoTermineAllowed, estAutorisee, getAllowedIds,
         verifierModeAutorise, DryRunViolation, FicheNonAutorisee } from "./lib/guard.js";
import { log, erreurLisible, enregistrerSecret } from "./lib/log.js";
import { connecter, deconnecter, ConfigurationManquante } from "./lib/firebase.js";
import { listerAFaire } from "./lib/detect.js";
import { verifier } from "./lib/validate.js";
import { resumeAnonyme, valeursSensiblesDe } from "./lib/redact.js";
import { analyser, resumeAnonymeAnalyse } from "./lib/analyse.js";

import { claimStatut, ecrireMetaReservation, remettreAFaire, liberer } from "./lib/claim.js";
import { demarrer, avancer, echouer, lireEtat, verrouPerime } from "./lib/state.js";
import { ajouterRapport } from "./lib/report.js";
import { traiterAvecFilet, libererAvecRepli, ISSUES, MOTIFS } from "./lib/flow.js";
import { creerClientRest } from "./lib/rest.js";

const ICI = dirname(fileURLToPath(import.meta.url));

function lireConfig() {
  const brut = readFileSync(resolve(ICI, "config.json"), "utf8");
  const cfg = JSON.parse(brut);
  // Sécurité : toute valeur autre que false explicite = dry-run.
  if (cfg.dryRun !== false) cfg.dryRun = true;
  if (cfg.autoTermine !== true) cfg.autoTermine = false;
  // Le mode actif planifié doit être un consentement EXPLICITE.
  if (cfg.allowScheduledActive !== true) cfg.allowScheduledActive = false;
  // Liste blanche absente ou invalide = aucune fiche autorisée.
  if (!Array.isArray(cfg.allowedTestIds)) cfg.allowedTestIds = [];
  if (cfg.analyserEnDryRun !== false) cfg.analyserEnDryRun = true;
  const maxA = Number(cfg.maxAnalysesParPassage);
  cfg.maxAnalysesParPassage = Number.isFinite(maxA) && maxA >= 0 ? Math.floor(maxA) : 2;
  return cfg;
}

// -------------------------------------------------------------
//  Analyse publique en dry-run — lecture seule
// -------------------------------------------------------------
//  ⚠️ Rien de ce qui est journalisé ici ne doit permettre
//  d'identifier le client : uniquement des compteurs et des
//  catégories de problèmes. Jamais d'URL, de ville, de contenu
//  de page ni de rapport.
async function analyserEtJournaliser(contexte, bilan) {
  let resultat;
  try {
    resultat = await analyser(contexte);
  } catch (e) {
    bilan.auditsImpossibles++;
    log.alerte(`   Audit impossible : ${erreurLisible(e)}`);
    return;
  }

  const r = resumeAnonymeAnalyse(resultat);

  if (!r.disponible) {
    bilan.auditsImpossibles++;
    log.alerte(`   Audit impossible : ${r.motif}`);
    return;
  }

  bilan.auditees++;
  log.ok(`   Audit public terminé (lecture seule) :`);
  log.info(`      pages analysées ..... ${r.pagesAnalysees}${r.pagesEnEchec ? ` (+${r.pagesEnEchec} en échec)` : ""}`);
  log.info(`      problèmes critiques . ${r.erreursCritiques}`);
  log.info(`      avertissements ...... ${r.avertissements}`);
  log.info(`      points conformes .... ${r.pointsOk}`);
  log.info(`      catégories .......... ${r.categories.length ? r.categories.join(", ") : "aucune"}`);
  log.info("      [DRY-RUN] Rapport NON écrit en base.");
}

// -------------------------------------------------------------
//  Opérations réelles injectées dans le flux (lib/flow.js)
//  Les deux dernières sont « best effort » : elles ne lèvent jamais,
//  car ce sont elles qui protègent la fiche d'un blocage.
// -------------------------------------------------------------
function creerOperations(db, rest) {
  return {
    claimStatut: (cle) => claimStatut(rest, cle),
    ecrireMetaReservation: (cle, identite) => ecrireMetaReservation(db, cle, identite),
    remettreAFaire: (cle) => remettreAFaire(rest, cle),

    demarrerEtat: (cle, identite) => demarrer(db, cle, identite),
    avancerEtat: (cle, etat) => avancer(db, cle, etat),

    analyser: (contexte) => analyser(contexte),
    // Le résultat n'est jamais journalisé tel quel : il ne contient
    // que des états, mais on lève sur échec pour que le filet agisse.
    ajouterRapport: async (cle, rapport) => {
      const res = await ajouterRapport(rest, cle, rapport);
      if (!res.ok) {
        throw new Error(`compte rendu non écrit (${res.raison}, ${res.tentatives} tentative(s))`);
      }
      return res;
    },

    // Best effort : trace l'échec dans /seoRobot sans jamais faire échouer le flux.
    tenterEtatEchec: async (cle, motif) => {
      try {
        await echouer(db, cle, erreurLisible(motif));
      } catch (e) {
        log.alerte(`   État d'échec non enregistré : ${erreurLisible(e)}`);
      }
    },

    // Filet final : la fiche ne doit jamais rester en « encours ».
    // Renvoie true UNIQUEMENT si la libération est confirmée (voir lib/flow.js).
    libererSurement: (cle, identite) =>
      libererAvecRepli(
        {
          liberer: (c, id) => liberer(db, rest, c, id),
          remettreAFaire: (c) => remettreAFaire(rest, c),
        },
        cle,
        identite,
        {
          ok: (m) => log.ok(`   ${m}`),
          alerte: (m) => log.alerte(`   ${m}`),
          erreur: (m) => log.erreur(`   ${m}`),
          format: erreurLisible,
        }
      ),
  };
}

// -------------------------------------------------------------
//  Traitement d'une fiche (mode actif — inerte en dry-run)
// -------------------------------------------------------------
async function traiterFiche(db, rest, fiche, identite, controle) {
  const cle = fiche._cle;
  const ops = creerOperations(db, rest);

  const res = await traiterAvecFilet(ops, cle, identite, controle.contexte);

  switch (res.issue) {
    case ISSUES.COLLISION: {
      const claim = (res.detail && res.detail.claim) || {};
      if (res.motif === MOTIFS.COLLISION_CONCURRENTE) {
        log.ignore(`   Fiche ${cle} : prise entre la lecture et le commit (statut lu « ${claim.statutLu} », devenu « ${claim.statutApres} »).`);
      } else if (res.motif === MOTIFS.FICHE_DISPARUE) {
        log.alerte(`   Fiche ${cle} : statut absent côté serveur — aucune écriture tentée.`);
      } else {
        log.ignore(`   Fiche ${cle} : déjà au statut « ${claim.statutLu} », non disponible.`);
      }
      return "collision";
    }

    case ISSUES.ECHEC_RESERVATION: {
      const motif = res.detail && res.detail.motif;
      const claim = (res.detail && res.detail.claim) || {};
      if (motif === MOTIFS.ERREUR_TECHNIQUE) {
        if (claim.raison === "autorisation") {
          log.erreur(`   ⛔ Fiche ${cle} : accès refusé par Firebase (HTTP ${claim.http}).`);
          log.erreur("      Vérifie les règles /seo et l'UID du compte robot.");
        } else if (claim.raison === "reseau") {
          log.erreur(`   ⛔ Fiche ${cle} : requête réseau en échec — aucune écriture tentée.`);
        } else {
          log.erreur(`   ⛔ Fiche ${cle} : réponse inattendue (${claim.raison}${claim.http ? ", HTTP " + claim.http : ""}) — traitée comme un échec.`);
        }
        return "echec";
      }
      if (motif === MOTIFS.ROLLBACK_OK) {
        log.alerte(`   Fiche ${cle} : métadonnées en échec, fiche remise en « afaire » (confirmé).`);
      } else if (motif === MOTIFS.ROLLBACK_NON_CONFIRME) {
        log.erreur(`   ⛔ Fiche ${cle} : métadonnées en échec et rollback NON CONFIRMÉ.`);
        log.erreur("      Le statut n'a pas pu être ramené à « afaire » — à vérifier dans la console Firebase.");
      } else {
        log.erreur(`   ⛔ Fiche ${cle} : métadonnées en échec ET repli impossible — fiche en « encours ».`);
        log.erreur("      Intervention manuelle nécessaire dans la console Firebase.");
      }
      return "echec";
    }

    case ISSUES.ANALYSE_INDISPONIBLE:
      // res.libere n'est true que si la libération a été CONFIRMÉE.
      if (res.libere === true) {
        log.alerte(`   Fiche ${cle} : ${res.motif || "analyse indisponible"} — fiche rendue.`);
      } else {
        log.erreur(`   ⛔ Fiche ${cle} : ${res.motif || "analyse indisponible"}, et libération NON CONFIRMÉE.`);
      }
      return "analyse_indisponible";

    case ISSUES.PRET_A_VALIDER:
      log.ok(`   Fiche ${cle} : compte rendu écrit, en attente de validation humaine.`);
      return "pret_a_valider";

    default:
      log.erreur(`   Fiche ${cle} : ${erreurLisible(res.erreur)}`);
      if (res.libere !== true) {
        log.erreur(`   ⛔ Fiche ${cle} : libération NON CONFIRMÉE après cet échec.`);
      }
      return "echec";
  }
}

// -------------------------------------------------------------
//  Boucle principale
// -------------------------------------------------------------
async function main() {
  const config = lireConfig();
  const { dryRun, autoTermine, allowedIds } = initGuard(config);

  // GitHub Actions renseigne GITHUB_EVENT_NAME automatiquement.
  const evenement = process.env.GITHUB_EVENT_NAME || process.env.EVENEMENT || "local";

  log.titre("ROBOT SEO — V1.2");
  log.info(`Mode ................. ${dryRun ? "DRY-RUN (aucune écriture)" : "ACTIF (écritures autorisées)"}`);
  log.info(`Déclencheur .......... ${evenement}`);
  log.info(`autoTermine .......... ${autoTermine ? "ACTIVÉ" : "désactivé"}`);
  log.info(`allowScheduledActive . ${config.allowScheduledActive ? "ACTIVÉ" : "désactivé"}`);
  log.info(`Liste blanche ........ ${allowedIds.length ? allowedIds.join(", ") : "VIDE — aucune écriture possible"}`);
  log.info(`Max par passage ...... ${dryRun ? "sans objet (dry-run)" : config.maxFichesParPassage}`);
  log.info(`Audit public ......... ${config.analyserEnDryRun ? `oui, max ${config.maxAnalysesParPassage} par passage (lecture seule)` : "désactivé"}`);

  // 4ᵉ verrou : le mode actif ne doit jamais se déclencher tout seul.
  const mode = verifierModeAutorise({
    dryRun,
    allowScheduledActive: config.allowScheduledActive,
    evenement,
  });
  if (!mode.ok) {
    log.erreur(mode.message);
    log.info("Le robot s'arrête sans rien modifier.");
    return 1;
  }

  if (!dryRun && allowedIds.length === 0) {
    log.erreur("Mode actif demandé mais allowedTestIds est vide : aucune fiche ne peut être écrite.");
    log.info("Le robot s'arrête sans rien modifier.");
    return 1;
  }

  let session = null;
  let codeSortie = 0;

  try {
    session = await connecter();
    const { db, identite: identiteCompte, auth, getIdToken, databaseURL } = session;
    const identite = identiteCompte || config.identiteParDefaut;

    // Les transitions de statut passent par des requêtes REST
    // conditionnelles (ETag / If-Match), pas par runTransaction().
    const rest = creerClientRest({ databaseURL, getIdToken });

    log.titre("DÉTECTION");
    const fiches = await listerAFaire(db);

    if (fiches.length === 0) {
      log.ok("Rien à traiter.");
      await deconnecter(auth);
      return 0;
    }

    // En dry-run rien n'est écrit : on examine TOUTES les fiches « à faire »,
    // pour que Camille voie l'état réel de sa file d'attente.
    // La limite ne protège que les écritures, donc elle ne s'applique
    // qu'en mode actif.
    const aTraiter = dryRun ? fiches : fiches.slice(0, config.maxFichesParPassage);
    if (fiches.length > aTraiter.length) {
      log.info(`Limité à ${aTraiter.length} fiche(s) traitée(s) pour ce passage.`);
    }

    log.titre("VÉRIFICATION");
    let analysesFaites = 0;
    const bilan = { traitables: 0, bloquees: 0, horsListe: 0, collisions: 0, echecs: 0, pretes: 0,
                    analyseIndispo: 0, auditees: 0, auditsImpossibles: 0 };

    for (const fiche of aTraiter) {
      // Toute valeur sensible de cette fiche est masquée dans la suite des logs.
      valeursSensiblesDe(fiche).forEach(enregistrerSecret);

      const resume = resumeAnonyme(fiche);
      const dansListe = estAutorisee(fiche._cle);

      log.info("");
      log.etape(`Fiche ${resume.ref}`);
      log.info(`   liste blanche ..... ${dansListe ? "OUI — écriture permise" : "non — fiche ignorée"}`);
      log.info(`   statut ............ ${resume.statut}`);
      log.info(`   activité .......... ${resume.activite}`);
      log.info(`   Carte G ........... ${resume.carteG}`);
      log.info(`   prestation ........ ${resume.prestation}`);
      log.info(`   zone confirmée .... ${resume.zoneConfirmee}`);
      log.info(`   accès WordPress ... ${resume.accesWordPress}`);
      log.info(`   pièces jointes .... ${resume.pieceJointes}`);
      log.info(`   note remplie ...... ${resume.noteRemplie}`);
      log.info(`   créée le .......... ${resume.creeLe}`);

      const controle = verifier(fiche);

      for (const a of controle.avertissements) log.alerte(`   ${a}`);

      if (!controle.traitable) {
        bilan.bloquees++;
        log.ignore(`   NON TRAITABLE — ${controle.bloquants.length} point(s) bloquant(s) :`);
        for (const b of controle.bloquants) log.info(`      • ${b}`);
        continue;
      }

      bilan.traitables++;
      log.ok("   Traitable.");

      if (dryRun) {
        log.info("   [DRY-RUN] Aucune réservation, aucune écriture.");
        // L'analyse publique est en LECTURE SEULE : elle peut donc tourner
        // en dry-run sans risque. Elle ne touche ni Firebase, ni le site.
        if (config.analyserEnDryRun && analysesFaites < config.maxAnalysesParPassage) {
          analysesFaites++;
          await analyserEtJournaliser(controle.contexte, bilan);
        } else if (config.analyserEnDryRun) {
          log.ignore(`   Analyse non lancée : limite de ${config.maxAnalysesParPassage} par passage atteinte.`);
        }
        continue;
      }

      // --- Mode actif uniquement ---

      // Verrou n°2 : hors liste blanche, on ne touche à rien, même si la fiche est parfaite.
      if (!dansListe) {
        bilan.horsListe++;
        log.ignore("   Hors liste blanche — aucune écriture, fiche laissée intacte.");
        continue;
      }

      const etatExistant = await lireEtat(db, fiche._cle);
      if (etatExistant && !verrouPerime(etatExistant, config.verrouPerimeMinutes * 60000)) {
        log.ignore("   Verrou encore actif, on passe.");
        bilan.collisions++;
        continue;
      }

      const issue = await traiterFiche(db, rest, fiche, identite, controle);
      if (issue === "collision") bilan.collisions++;
      else if (issue === "pret_a_valider") bilan.pretes++;
      else if (issue === "analyse_indisponible") bilan.analyseIndispo++;
      else bilan.echecs++;
    }

    log.titre("BILAN");
    log.info(`Fiches détectées ....... ${fiches.length}`);
    log.info(`Fiches examinées ....... ${aTraiter.length}`);
    log.info(`Traitables ............. ${bilan.traitables}`);
    log.info(`Bloquées ............... ${bilan.bloquees}`);
    if (config.analyserEnDryRun) {
      log.info(`Sites audités .......... ${bilan.auditees}`);
      log.info(`Audits impossibles ..... ${bilan.auditsImpossibles}`);
    }
    if (!dryRun) {
      log.info(`Hors liste blanche ..... ${bilan.horsListe}`);
      log.info(`Prêtes à valider ....... ${bilan.pretes}`);
      log.info(`Analyse indisponible ... ${bilan.analyseIndispo}`);
      log.info(`Collisions ............. ${bilan.collisions}`);
      log.info(`Échecs ................. ${bilan.echecs}`);
    }
    if (dryRun) {
      log.ok("DRY-RUN terminé — aucune donnée Firebase n'a été modifiée.");
    }

    await deconnecter(auth);
  } catch (e) {
    if (e instanceof ConfigurationManquante) {
      log.erreur(e.message);
      log.info("Le robot s'arrête sans rien modifier.");
      codeSortie = 1;
    } else if (e instanceof DryRunViolation) {
      // Ne devrait jamais arriver : signalerait un chemin d'écriture non protégé.
      log.erreur("Tentative d'écriture en dry-run interceptée : " + e.message);
      codeSortie = 1;
    } else if (e instanceof FicheNonAutorisee) {
      // Ne devrait jamais arriver : le filtrage a lieu en amont.
      log.erreur("Tentative d'écriture hors liste blanche interceptée : " + e.message);
      codeSortie = 1;
    } else {
      log.erreur("Erreur inattendue : " + erreurLisible(e));
      codeSortie = 1;
    }
    if (session && session.auth) await deconnecter(session.auth);
  }

  return codeSortie;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // Filet ultime : on ne laisse jamais une trace brute s'afficher.
    log.erreur("Arrêt anormal : " + erreurLisible(e));
    process.exit(1);
  });
