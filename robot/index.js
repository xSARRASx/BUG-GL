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

import { initGuard, isDryRun, isAutoTermineAllowed, DryRunViolation } from "./lib/guard.js";
import { log, erreurLisible, enregistrerSecret } from "./lib/log.js";
import { connecter, deconnecter, ConfigurationManquante } from "./lib/firebase.js";
import { listerAFaire } from "./lib/detect.js";
import { verifier } from "./lib/validate.js";
import { resumeAnonyme, valeursSensiblesDe } from "./lib/redact.js";
import { analyser } from "./lib/analyse.js";

import { reserver, liberer } from "./lib/claim.js";
import { demarrer, avancer, echouer, lireEtat, verrouPerime, ETATS } from "./lib/state.js";
import { ajouterRapport } from "./lib/report.js";

const ICI = dirname(fileURLToPath(import.meta.url));

function lireConfig() {
  const brut = readFileSync(resolve(ICI, "config.json"), "utf8");
  const cfg = JSON.parse(brut);
  // Sécurité : toute valeur autre que false explicite = dry-run.
  if (cfg.dryRun !== false) cfg.dryRun = true;
  if (cfg.autoTermine !== true) cfg.autoTermine = false;
  return cfg;
}

// -------------------------------------------------------------
//  Traitement d'une fiche (mode actif — inerte en dry-run)
// -------------------------------------------------------------
async function traiterFiche(db, fiche, identite, controle) {
  const cle = fiche._cle;

  const obtenue = await reserver(db, cle, identite);
  if (!obtenue) return "collision";

  await demarrer(db, cle, identite);

  try {
    await avancer(db, cle, ETATS.ANALYSE);
    const resultat = await analyser(controle.contexte);

    if (!resultat.disponible) {
      // V1 : l'analyse n'est pas branchée → on rend la fiche telle qu'on l'a prise.
      log.alerte(`Fiche ${cle} : ${resultat.motif} — fiche libérée.`);
      await liberer(db, cle, identite);
      await avancer(db, cle, ETATS.ECHEC, { derniereErreur: resultat.motif });
      return "analyse_indisponible";
    }

    await ajouterRapport(db, cle, resultat.rapport);
    await avancer(db, cle, ETATS.RAPPORT_ECRIT);

    // 🔒 On s'arrête ici. Le passage en « terminé » reste humain
    //    tant que autoTermine vaut false.
    await avancer(db, cle, ETATS.PRET_A_VALIDER);
    return "pret_a_valider";
  } catch (e) {
    const msg = erreurLisible(e);
    log.erreur(`Fiche ${cle} : ${msg}`);
    try {
      await echouer(db, cle, msg);
      await liberer(db, cle, identite);
    } catch (e2) {
      log.erreur(`Fiche ${cle} : libération impossible — ${erreurLisible(e2)}`);
    }
    return "echec";
  }
}

// -------------------------------------------------------------
//  Boucle principale
// -------------------------------------------------------------
async function main() {
  const config = lireConfig();
  const { dryRun, autoTermine } = initGuard(config);

  log.titre("ROBOT SEO — V1");
  log.info(`Mode          : ${dryRun ? "DRY-RUN (aucune écriture)" : "ACTIF (écritures autorisées)"}`);
  log.info(`autoTermine   : ${autoTermine ? "ACTIVÉ" : "désactivé"}`);
  log.info(`Max par passage : ${config.maxFichesParPassage}`);

  let session = null;
  let codeSortie = 0;

  try {
    session = await connecter();
    const { db, identite: identiteCompte, auth } = session;
    const identite = identiteCompte || config.identiteParDefaut;

    log.titre("DÉTECTION");
    const fiches = await listerAFaire(db);

    if (fiches.length === 0) {
      log.ok("Rien à traiter.");
      await deconnecter(auth);
      return 0;
    }

    const aTraiter = fiches.slice(0, config.maxFichesParPassage);
    if (fiches.length > aTraiter.length) {
      log.info(`Limité à ${aTraiter.length} fiche(s) pour ce passage.`);
    }

    log.titre("VÉRIFICATION");
    const bilan = { traitables: 0, bloquees: 0, collisions: 0, echecs: 0, pretes: 0 };

    for (const fiche of aTraiter) {
      // Toute valeur sensible de cette fiche est masquée dans la suite des logs.
      valeursSensiblesDe(fiche).forEach(enregistrerSecret);

      const resume = resumeAnonyme(fiche);
      log.info("");
      log.etape(`Fiche ${resume.ref}`);
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
        continue;
      }

      // --- Mode actif uniquement ---
      const etatExistant = await lireEtat(db, fiche._cle);
      if (etatExistant && !verrouPerime(etatExistant, config.verrouPerimeMinutes * 60000)) {
        log.ignore("   Verrou encore actif, on passe.");
        bilan.collisions++;
        continue;
      }

      const issue = await traiterFiche(db, fiche, identite, controle);
      if (issue === "collision") bilan.collisions++;
      else if (issue === "pret_a_valider") bilan.pretes++;
      else bilan.echecs++;
    }

    log.titre("BILAN");
    log.info(`Fiches examinées ....... ${aTraiter.length}`);
    log.info(`Traitables ............. ${bilan.traitables}`);
    log.info(`Bloquées ............... ${bilan.bloquees}`);
    if (!dryRun) {
      log.info(`Prêtes à valider ....... ${bilan.pretes}`);
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
