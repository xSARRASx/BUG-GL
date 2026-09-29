// =============================================================
//  Auto-test hors ligne
// =============================================================
//  Vérifie la logique pure du robot sans aucune connexion réseau :
//  garde-fou dry-run, masquage, validation des champs, en-tête de
//  rapport, concaténation des notes.
//
//  Lancement : node robot/scripts/selftest.js
// =============================================================

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));

import { initGuard, assertWriteAllowed, assertTermineAllowed, estAutorisee, getAllowedIds,
         verifierModeAutorise, DryRunViolation, AutoTermineDisabled, FicheNonAutorisee } from "../lib/guard.js";
import { resumeAnonyme, nettoyerTexte, valeursSensiblesDe, CHAMPS_SENSIBLES } from "../lib/redact.js";
import { entete, composerNote } from "../lib/note.js";
import { traiterAvecFilet, reserverAvecFilet, libererAvecRepli, rollbackConfirme,
         normaliserClaim, ISSUES, MOTIFS } from "../lib/flow.js";
import { creerClientRest, RAISONS } from "../lib/rest.js";
import { ajouterRapport, MAX_TENTATIVES_RAPPORT } from "../lib/report.js";
import { creerFauxFetch, TOKEN_FACTICE } from "./fauxfetch.js";
import { analyser, resumeAnonymeAnalyse } from "../lib/analyse.js";
import { verifier } from "../lib/validate.js";
import { extraire, typesJsonLd } from "../lib/html.js";
import { normaliserUrl, cleUrl, analyserRobots, cheminAutorise, urlsDeSitemap } from "../lib/crawl.js";
import { creerFauxSite, pageCorrecte, pagePauvre, SITEMAP_XML, ROBOTS_TXT, BASE as BASE_SITE } from "./fauxsite.js";
import { selectionnerPourAudit, passagesPourToutCouvrir, creneauActuel, DUREE_CRENEAU_MS } from "../lib/rotation.js";
import { urlAutorisee, hoteAutorise, ipv4Privee, ipv6Privee, ipPrivee, groupesIPv6,
         memeSiteLegitime, SANS_DNS, RAISONS_REFUS } from "../lib/reseau.js";
import { creerFauxOps } from "./fauxops.js";

const CLE = "-P2atEDbwnjG7JWnxhH2";

let ok = 0;
async function testAsync(nom, fn) {
  try {
    await fn();
    console.log(`  ✅ ${nom}`);
    ok++;
  } catch (e) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}
function test(nom, fn) {
  try {
    fn();
    console.log(`  ✅ ${nom}`);
    ok++;
  } catch (e) {
    console.error(`  ❌ ${nom}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

// --- Fiche fictive complète et valide (aucune donnée réelle) ---
const ficheValide = {
  id: "-OZtestFictif001",
  _cle: "-OZtestFictif001",
  nom: "Client Fictif Démo",
  ville: "Ville-Test",
  url: "https://exemple-test.invalid",
  email: "contact@exemple-test.invalid",
  statut: "afaire",
  activite: "conciergerie",
  carte: "oui",
  zone: "Ville-Test — Commune-A, Commune-B",
  zoneNa: false,
  prestation: "seo_complet",
  prestationNa: false,
  phone: "01 23 45 67 89",
  phoneNa: false,
  adresse: "1 rue Fictive, 00000 Ville-Test",
  adresseNa: false,
  facebook: "https://facebook.invalid/demo",
  facebookNa: false,
  instagram: "",
  instagramNa: true,
  google: "demo.fictif@gmail.com",
  googleNa: false,
  adminUrl: "https://exemple-test.invalid/wp-admin",
  login: "utilisateur-fictif",
  pass: "MotDePasseFictifPourTest",
  note: "Note existante de Camille.",
  createdAt: 1774000000000,
};

console.log("\n=== GARDE-FOU DRY-RUN ===");

const ID_TEST = "-P2atEDbwnjG7JWnxhH2";
const ID_AUTRE = "-P9autreFicheXyz0001";

initGuard({ dryRun: true, autoTermine: false, allowedTestIds: [ID_TEST] });

test("une écriture est refusée en dry-run, même sur la fiche autorisée", () => {
  assert.throws(() => assertWriteAllowed("test", ID_TEST), DryRunViolation);
});

test("le dry-run prime sur la liste blanche", () => {
  // L'erreur doit être DryRunViolation, pas FicheNonAutorisee :
  // le premier verrou se ferme avant le second.
  assert.throws(() => assertWriteAllowed("test", ID_AUTRE), DryRunViolation);
});

test("le passage en terminé est refusé", () => {
  assert.throws(() => assertTermineAllowed(ID_TEST), AutoTermineDisabled);
});

test("le garde-fou ne peut pas être réinitialisé", () => {
  assert.throws(() => initGuard({ dryRun: false }), /déjà initialisé/);
});

test("la liste blanche est bien chargée", () => {
  assert.deepEqual(getAllowedIds(), [ID_TEST]);
});

test("estAutorisee reconnaît uniquement la fiche listée", () => {
  assert.equal(estAutorisee(ID_TEST), true);
  assert.equal(estAutorisee(ID_AUTRE), false);
  assert.equal(estAutorisee(""), false);
  assert.equal(estAutorisee(null), false);
  assert.equal(estAutorisee(undefined), false);
});

test("la configuration par défaut est le mode sûr", () => {
  // Reproduit la normalisation de lireConfig() dans index.js
  const cfg = { autoTermine: "oui", allowedTestIds: "pas-un-tableau" };
  const dryRun = cfg.dryRun !== false;
  const autoTermine = cfg.autoTermine === true;
  const ids = Array.isArray(cfg.allowedTestIds) ? cfg.allowedTestIds : [];
  assert.equal(dryRun, true);
  assert.equal(autoTermine, false);
  assert.deepEqual(ids, []);
});


console.log("\n=== 4e VERROU : MODE ACTIF PLANIFIÉ ===");
console.log("    (le cron ne doit JAMAIS pouvoir écrire tout seul)");

const mode = (dryRun, allowScheduledActive, evenement) =>
  verifierModeAutorise({ dryRun, allowScheduledActive, evenement });

await testAsync("dry-run : tout déclencheur est autorisé", () => {
  for (const ev of ["schedule", "workflow_dispatch", "push", "local", undefined]) {
    assert.equal(mode(true, false, ev).ok, true, `dry-run devrait passer sur « ${ev} »`);
  }
});

await testAsync("actif + cron + allowScheduledActive:false → REFUSÉ", () => {
  const r = mode(false, false, "schedule");
  assert.equal(r.ok, false);
  assert.equal(r.raison, "actif_planifie_interdit");
  assert.match(r.message, /allowScheduledActive/);
  assert.match(r.message, /Aucune écriture/);
});

await testAsync("actif + cron + allowScheduledActive:true → autorisé", () => {
  const r = mode(false, true, "schedule");
  assert.equal(r.ok, true);
  assert.equal(r.raison, "actif_planifie_autorise");
});

await testAsync("actif + lancement manuel → autorisé, sans dépendre du flag", () => {
  assert.equal(mode(false, false, "workflow_dispatch").ok, true);
  assert.equal(mode(false, true, "workflow_dispatch").ok, true);
});

await testAsync("actif + tout autre déclencheur → REFUSÉ", () => {
  for (const ev of ["push", "pull_request", "release", "", undefined]) {
    const r = mode(false, false, ev);
    assert.equal(r.ok, false, `« ${ev} » ne doit pas autoriser le mode actif`);
    assert.equal(r.raison, "declencheur_non_autorise");
  }
});

await testAsync("une valeur non booléenne ne vaut pas consentement", () => {
  for (const valeur of ["true", 1, {}, [], "oui", null, undefined]) {
    assert.equal(mode(false, valeur, "schedule").ok, false,
      `allowScheduledActive=${JSON.stringify(valeur)} ne doit pas ouvrir le verrou`);
  }
});

await testAsync("verifierModeAutorise est pure : elle n'altère pas le garde-fou", () => {
  mode(false, true, "schedule");
  // Le garde-fou de ce processus est en dry-run : il doit le rester.
  assert.throws(() => assertWriteAllowed("test", CLE), DryRunViolation);
});

console.log("\n=== VALIDATION DES CHAMPS ===");

test("une fiche complète est traitable", () => {
  const r = verifier(ficheValide);
  assert.equal(r.traitable, true, "bloquants : " + r.bloquants.join(" | "));
});

test("zoneNa=true bloque le traitement", () => {
  const r = verifier({ ...ficheValide, zone: "", zoneNa: true });
  assert.equal(r.traitable, false);
  assert.ok(r.bloquants.some((b) => /Zone non confirmée/.test(b)));
});

test("une zone vide bloque le traitement", () => {
  const r = verifier({ ...ficheValide, zone: "", zoneNa: false });
  assert.equal(r.traitable, false);
});

test("des accès WordPress incomplets bloquent", () => {
  const r = verifier({ ...ficheValide, pass: "" });
  assert.equal(r.traitable, false);
  assert.ok(r.bloquants.some((b) => /Accès WordPress/.test(b)));
});

test("un champ obligatoire ni rempli ni marqué Na bloque", () => {
  const r = verifier({ ...ficheValide, phone: "", phoneNa: false });
  assert.equal(r.traitable, false);
  assert.ok(r.bloquants.some((b) => /Téléphone/.test(b)));
});

test("un champ marqué Na ne bloque pas", () => {
  const r = verifier({ ...ficheValide, phone: "", phoneNa: true });
  assert.equal(r.traitable, true, "bloquants : " + r.bloquants.join(" | "));
});

test("l'absence de Carte G produit un avertissement Loi Hoguet", () => {
  const r = verifier({ ...ficheValide, carte: "non" });
  assert.equal(r.traitable, true);
  assert.ok(r.avertissements.some((a) => /Hoguet/.test(a)));
  assert.equal(r.contexte.loiHoguet, true);
});

test("un compte Google non-Gmail produit un avertissement non bloquant", () => {
  const r = verifier({ ...ficheValide, google: "demo@outlook.invalid" });
  assert.equal(r.traitable, true);
  assert.ok(r.avertissements.some((a) => /Gmail/.test(a)));
});

console.log("\n=== MASQUAGE ===");

test("le résumé ne contient aucune donnée client", () => {
  const resume = resumeAnonyme(ficheValide);
  const json = JSON.stringify(resume);
  for (const champ of CHAMPS_SENSIBLES) {
    const v = ficheValide[champ];
    if (typeof v === "string" && v.length >= 4) {
      assert.ok(!json.includes(v), `la valeur du champ « ${champ} » fuite dans le résumé`);
    }
  }
});

test("le résumé expose bien les états utiles", () => {
  const r = resumeAnonyme(ficheValide);
  assert.equal(r.ref, "-OZtestFictif001");
  assert.equal(r.accesWordPress, "complets");
  assert.equal(r.carteG, "oui");
});

test("les accès WordPress sont masqués dans un texte libre", () => {
  const sensibles = valeursSensiblesDe(ficheValide);
  const brut = `Echec sur ${ficheValide.adminUrl} avec ${ficheValide.login} / ${ficheValide.pass}`;
  const propre = nettoyerTexte(brut, sensibles);
  assert.ok(!propre.includes(ficheValide.pass));
  assert.ok(!propre.includes(ficheValide.login));
  assert.ok(!propre.includes(ficheValide.adminUrl));
});

test("e-mails, téléphones, URLs et base64 sont masqués même sans liste", () => {
  const propre = nettoyerTexte(
    "contact inconnu@exemple.invalid tel 06 11 22 33 44 url https://secret.invalid/x " +
    "fichier data:application/pdf;base64,QUJDREVGRw=="
  );
  assert.ok(!propre.includes("inconnu@exemple.invalid"));
  assert.ok(!propre.includes("06 11 22 33 44"));
  assert.ok(!propre.includes("secret.invalid"));
  assert.ok(!propre.includes("QUJDREVGRw=="));
});

console.log("\n=== COMPTE RENDU ===");

test("l'en-tête est daté et identifiable", () => {
  const h = entete(new Date("2026-09-27T10:00:00Z"));
  assert.equal(h, "--- Compte rendu Robot SEO — 2026-09-27 ---");
});

test("la concaténation préserve intégralement la note existante", () => {
  const existant = "Note existante de Camille.";
  const r = composerNote(existant, "Rapport du robot.", new Date("2026-09-27T10:00:00Z"));
  assert.ok(r.startsWith(existant), "la note de Camille doit rester en tête");
  assert.ok(r.includes("Rapport du robot."));
  assert.ok(r.includes("--- Compte rendu Robot SEO — 2026-09-27 ---"));
});

test("une note vide ne produit pas de saut de ligne parasite", () => {
  const r = composerNote("", "Rapport.", new Date("2026-09-27T10:00:00Z"));
  assert.ok(r.startsWith("--- Compte rendu"));
  assert.ok(!r.startsWith("\n"));
});

test("une note null ou absente est gérée", () => {
  assert.ok(composerNote(null, "R.").startsWith("--- Compte rendu"));
  assert.ok(composerNote(undefined, "R.").startsWith("--- Compte rendu"));
});

test("deux comptes rendus successifs s'empilent sans perte", () => {
  const un = composerNote("Note de Camille.", "Premier rapport.", new Date("2026-09-27T10:00:00Z"));
  const deux = composerNote(un, "Second rapport.", new Date("2026-09-28T10:00:00Z"));
  assert.ok(deux.includes("Note de Camille."));
  assert.ok(deux.includes("Premier rapport."));
  assert.ok(deux.includes("Second rapport."));
});

console.log("\n=== MODE ACTIF (processus séparés) ===");

test("mode actif : seule la fiche listée est écrivable, terminé toujours refusé", () => {
  const sortie = execFileSync(process.execPath, [resolve(ICI, "scenarios/actif-liste-blanche.js")], { encoding: "utf8" });
  assert.match(sortie, /SCENARIO_OK/);
});

test("mode actif + liste vide : aucune écriture possible", () => {
  const sortie = execFileSync(process.execPath, [resolve(ICI, "scenarios/actif-liste-vide.js")], { encoding: "utf8" });
  assert.match(sortie, /SCENARIO_OK/);
});

console.log("\n=== FLUX : ÉCHECS PARTIELS APRÈS LE CLAIM ===");
console.log("    (invariant : la fiche ne doit jamais rester en « encours »)");

await testAsync("chemin nominal V1.1 — analyse indisponible : la fiche est rendue", async () => {
  const { ops, etat } = creerFauxOps();
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ANALYSE_INDISPONIBLE);
  assert.equal(etat.statut, "afaire", "la fiche doit être rendue");
  assert.equal(etat.rapportsEcrits, 0, "aucun rapport ne doit être écrit");
  assert.equal(etat.note, "Note existante de Camille.", "la note doit être intacte");
  assert.equal(etat.seoRobot.etat, "echec");
});

await testAsync("échec de demarrerEtat : la fiche est rendue", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { demarrerEtat: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(etat.statut, "afaire", "la fiche ne doit pas rester en encours");
});

await testAsync("échec de avancerEtat : la fiche est rendue", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { avancerEtat: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(etat.statut, "afaire");
});

await testAsync("échec de analyser : la fiche est rendue", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { analyser: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(etat.statut, "afaire");
});

await testAsync("échec de ajouterRapport : la fiche est rendue, note non corrompue", async () => {
  const { ops, etat } = creerFauxOps({
    echecs: { ajouterRapport: true },
    analyse: { disponible: true, rapport: "Rapport." },
  });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(etat.statut, "afaire");
  assert.equal(etat.note, "Note existante de Camille.");
});

await testAsync("échec de tenterEtatEchec : la fiche est quand même rendue", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { demarrerEtat: true, tenterEtatEchec: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(etat.statut, "afaire", "un échec de journalisation ne doit pas bloquer la fiche");
});

await testAsync("exception à la libération normale : le repli statut-seul rend la fiche", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { demarrerEtat: true, liberer: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(etat.statut, "afaire", "le repli doit avoir fonctionné");
  assert.equal(r.libere, true);
});

await testAsync("exception à la libération ET au repli : signalé explicitement", async () => {
  const { ops, etat } = creerFauxOps({
    echecs: { demarrerEtat: true, liberer: true, remettreAFaireRepli: true },
  });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(etat.statut, "encours", "cas résiduel : la fiche reste bloquée");
  assert.equal(r.libere, false, "le flux doit le signaler pour alerte humaine");
});

console.log("\n=== RÉSERVATION : ÉCHEC DES MÉTADONNÉES ===");

await testAsync("métadonnées en échec : rollback immédiat du statut", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { ecrireMetaReservation: true } });
  const r = await reserverAvecFilet(ops, CLE, "Robot SEO");
  assert.equal(r.obtenue, false);
  assert.equal(r.motif, MOTIFS.ROLLBACK_OK);
  assert.equal(etat.statut, "afaire", "le statut doit être revenu à afaire");
});

await testAsync("métadonnées en échec + rollback en échec : signalé, non silencieux", async () => {
  const { ops, etat } = creerFauxOps({
    echecs: { ecrireMetaReservation: true, remettreAFaire: true },
  });
  const r = await reserverAvecFilet(ops, CLE, "Robot SEO");
  assert.equal(r.obtenue, false);
  assert.equal(r.motif, MOTIFS.ROLLBACK_ECHOUE);
  assert.equal(etat.statut, "encours");
  assert.ok(r.erreur && r.erreurRollback, "les deux erreurs doivent remonter");
});

await testAsync("le flux complet propage un échec de réservation sans lancer le traitement", async () => {
  const { ops, etat } = creerFauxOps({ echecs: { ecrireMetaReservation: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC_RESERVATION);
  assert.equal(etat.statut, "afaire");
  assert.ok(!etat.appels.includes("demarrerEtat"), "le traitement ne doit pas démarrer");
});

await testAsync("collision : fiche déjà prise, rien n'est touché", async () => {
  const { ops, etat } = creerFauxOps({ statutInitial: "encours" });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.COLLISION);
  assert.equal(etat.statut, "encours");
  assert.equal(etat.seoRobot, null, "aucun état ne doit être créé");
});

await testAsync("jamais de passage en « termine », quel que soit le chemin", async () => {
  for (const echecs of [{}, { demarrerEtat: true }, { analyser: true }, { ajouterRapport: true }]) {
    const { ops, etat } = creerFauxOps({ echecs, analyse: { disponible: true, rapport: "R." } });
    await traiterAvecFilet(ops, CLE, "Robot SEO", {});
    assert.notEqual(etat.statut, "termine");
  }
});

await testAsync("chemin nominal complet : la fiche reste en encours pour validation humaine", async () => {
  const { ops, etat } = creerFauxOps({ analyse: { disponible: true, rapport: "Rapport." } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.PRET_A_VALIDER);
  assert.equal(etat.statut, "encours", "elle attend une validation, elle ne doit pas être rendue");
  assert.equal(etat.seoRobot.etat, "pret_a_valider");
  assert.equal(etat.rapportsEcrits, 1);
});


console.log("\n=== RETOURS `false` : ÉCHEC SANS EXCEPTION ===");
console.log("    (une transaction non commitée n'est PAS un succès)");

await testAsync("réservation : métadonnées en échec + rollback renvoie false → non confirmé", async () => {
  const { ops, etat } = creerFauxOps({
    echecs: { ecrireMetaReservation: true },
    retoursFalse: { remettreAFaire: true },
  });
  const r = await reserverAvecFilet(ops, CLE, "Robot SEO");
  assert.equal(r.obtenue, false);
  assert.equal(r.motif, MOTIFS.ROLLBACK_NON_CONFIRME,
    "un rollback non commité ne doit jamais être annoncé comme réussi");
  assert.notEqual(r.motif, MOTIFS.ROLLBACK_OK);
  assert.equal(etat.statut, "encours", "la fiche est effectivement restée en encours");
});

await testAsync("rollbackConfirme() ne valide que le cas réellement confirmé", async () => {
  assert.equal(rollbackConfirme(MOTIFS.ROLLBACK_OK), true);
  assert.equal(rollbackConfirme(MOTIFS.ROLLBACK_NON_CONFIRME), false);
  assert.equal(rollbackConfirme(MOTIFS.ROLLBACK_ECHOUE), false);
});

await testAsync("libération normale renvoie false → repli tenté, puis confirmé", async () => {
  const { prim, etat } = creerFauxOps({ statutInitial: "encours", retoursFalse: { liberer: true } });
  etat.phase = "liberation";
  const ok = await libererAvecRepli(prim, CLE, "Robot SEO");
  assert.equal(ok, true, "le repli a commité, la libération est confirmée");
  assert.equal(etat.statut, "afaire");
  assert.ok(etat.appels.includes("remettreAFaireRepli"), "le repli doit avoir été tenté");
});

await testAsync("libération ET repli renvoient false → aucune libération annoncée", async () => {
  const { prim, etat } = creerFauxOps({
    statutInitial: "encours",
    retoursFalse: { liberer: true, remettreAFaireRepli: true },
  });
  etat.phase = "liberation";
  const ok = await libererAvecRepli(prim, CLE, "Robot SEO");
  assert.equal(ok, false, "sans confirmation, le résultat doit être false");
  assert.equal(etat.statut, "encours");
});

await testAsync("repli renvoie false après une exception : échec préservé", async () => {
  const { prim, etat } = creerFauxOps({
    statutInitial: "encours",
    echecs: { liberer: true },
    retoursFalse: { remettreAFaireRepli: true },
  });
  etat.phase = "liberation";
  const ok = await libererAvecRepli(prim, CLE, "Robot SEO");
  assert.equal(ok, false);
  assert.equal(etat.statut, "encours");
});

await testAsync("aucun message de succès n'est émis sans confirmation", async () => {
  const messages = { ok: [], alerte: [], erreur: [] };
  const { prim, etat } = creerFauxOps({
    statutInitial: "encours",
    retoursFalse: { liberer: true, remettreAFaireRepli: true },
  });
  etat.phase = "liberation";
  const ok = await libererAvecRepli(prim, CLE, "Robot SEO", {
    ok: (m) => messages.ok.push(m),
    alerte: (m) => messages.alerte.push(m),
    erreur: (m) => messages.erreur.push(m),
  });
  assert.equal(ok, false);
  assert.equal(messages.ok.length, 0, "aucun « fiche rendue » ne doit être journalisé");
  assert.ok(messages.erreur.length > 0, "l'échec doit être signalé");
});

await testAsync("flux complet : libération non confirmée remonte dans res.libere", async () => {
  const { ops, etat } = creerFauxOps({
    echecs: { demarrerEtat: true },
    retoursFalse: { liberer: true, remettreAFaireRepli: true },
  });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC);
  assert.equal(r.libere, false, "le flux doit signaler la non-confirmation");
  assert.equal(etat.statut, "encours");
});

await testAsync("analyse indisponible + libération non confirmée : res.libere vaut false", async () => {
  const { ops, etat } = creerFauxOps({
    retoursFalse: { liberer: true, remettreAFaireRepli: true },
  });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ANALYSE_INDISPONIBLE);
  assert.equal(r.libere, false, "ne pas annoncer « fiche rendue » sans confirmation");
  assert.equal(etat.statut, "encours");
});


console.log("\n=== CLAIM : MOTIFS DE REFUS ===");

await testAsync("normaliserClaim accepte l'objet détaillé et le booléen hérité", () => {
  assert.equal(normaliserClaim(true).pris, true);
  assert.equal(normaliserClaim(false).pris, false);
  assert.equal(normaliserClaim(undefined).pris, false);
  assert.equal(normaliserClaim({ pris: true, raison: "pris" }).pris, true);
  assert.equal(normaliserClaim({ pris: false, raison: "course" }).raison, "course");
});

await testAsync("fiche occupée au pré-read → collision simple", async () => {
  const { ops, etat } = creerFauxOps({ statutInitial: "encours" });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.COLLISION);
  assert.equal(r.motif, MOTIFS.COLLISION);
  assert.equal(r.detail.claim.statutLu, "encours");
  assert.equal(etat.seoRobot, null);
});

await testAsync("course entre le pré-read et le commit → motif distinct", async () => {
  const { ops, etat } = creerFauxOps({ retoursFalse: { claimTransaction: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.COLLISION);
  assert.equal(r.motif, MOTIFS.COLLISION_CONCURRENTE,
    "une course doit être distinguée d'une fiche déjà occupée");
  assert.equal(etat.statut, "afaire", "rien ne doit avoir été écrit");
  assert.equal(etat.seoRobot, null);
});

await testAsync("statut absent côté serveur → refus, aucune écriture", async () => {
  const { ops, etat } = creerFauxOps({ statutInitial: null });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.COLLISION);
  assert.equal(r.motif, MOTIFS.FICHE_DISPARUE);
  assert.equal(etat.statut, null, "la donnée ne doit surtout pas être créée");
});

await testAsync("claim nominal : pré-read afaire puis commit", async () => {
  const { ops, etat } = creerFauxOps();
  const r = await reserverAvecFilet(ops, CLE, "Robot SEO");
  assert.equal(r.obtenue, true);
  assert.equal(etat.statut, "encours");
});



await testAsync("erreur d'autorisation : classée en ÉCHEC, jamais en collision", async () => {
  const { ops, etat } = creerFauxOps({ retoursFalse: { claimAutorisation: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC_RESERVATION,
    "un refus de droits ne doit pas être banalisé en collision");
  assert.equal(r.motif, MOTIFS.ERREUR_TECHNIQUE);
  assert.equal(r.detail.claim.http, 403);
  assert.equal(etat.statut, "afaire", "rien ne doit avoir été écrit");
});

await testAsync("erreur réseau au claim : classée en ÉCHEC, jamais en collision", async () => {
  const { ops, etat } = creerFauxOps({ retoursFalse: { claimReseau: true } });
  const r = await traiterAvecFilet(ops, CLE, "Robot SEO", {});
  assert.equal(r.issue, ISSUES.ECHEC_RESERVATION);
  assert.equal(r.motif, MOTIFS.ERREUR_TECHNIQUE);
  assert.equal(etat.statut, "afaire");
  assert.equal(etat.seoRobot, null, "le traitement ne doit pas démarrer");
});

console.log("\n=== REST CONDITIONNEL (ETag / If-Match) ===");
console.log("    (remplace runTransaction pour les transitions de statut)");

const BASE = "https://exemple-test.invalid";
const clientAvec = (scenario) => {
  const faux = creerFauxFetch(scenario);
  return {
    rest: creerClientRest({ databaseURL: BASE, getIdToken: faux.getIdToken, fetchImpl: faux.fetchImpl }),
    faux,
  };
};

await testAsync("200 : transition confirmée, PUT conditionné par If-Match", async () => {
  const { rest, faux } = clientAvec({ statut: "afaire", etag: 'W/"e1"' });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, true);
  assert.equal(r.raison, RAISONS.CONFIRME);

  const put = faux.requetes.find((q) => q.methode === "PUT");
  assert.ok(put, "un PUT doit avoir été envoyé");
  assert.equal(put.headers["If-Match"], 'W/"e1"', "le PUT doit porter l'ETag reçu");
  assert.equal(put.body, JSON.stringify("encours"));

  const get = faux.requetes.find((q) => q.methode === "GET");
  assert.equal(get.headers["X-Firebase-ETag"], "true", "le GET doit demander l'ETag");
});

await testAsync("412 : course concurrente confirmée, aucune écriture retenue", async () => {
  const { rest } = clientAvec({ statut: "afaire", putStatus: 412 });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.COURSE);
  assert.equal(r.http, 412);
});

await testAsync("valeur source différente : refus sans aucun PUT", async () => {
  const { rest, faux } = clientAvec({ statut: "encours" });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.SOURCE_DIFFERENTE);
  assert.equal(r.statutLu, "encours");
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"), "aucun PUT ne doit partir");
});

await testAsync("statut absent : refus, la donnée n'est jamais créée", async () => {
  const { rest, faux } = clientAvec({ statut: null });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.ABSENT);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"));
});

await testAsync("401 au GET : erreur d'autorisation, pas une collision", async () => {
  const { rest, faux } = clientAvec({ getStatus: 401 });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.AUTORISATION);
  assert.equal(r.http, 401);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"));
});

await testAsync("403 au PUT : erreur d'autorisation", async () => {
  const { rest } = clientAvec({ statut: "afaire", putStatus: 403 });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.AUTORISATION);
  assert.equal(r.http, 403);
});

await testAsync("erreur réseau au GET : échec, jamais un succès", async () => {
  const { rest, faux } = clientAvec({ getJette: true });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.RESEAU);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"));
});

await testAsync("erreur réseau au PUT : échec", async () => {
  const { rest } = clientAvec({ statut: "afaire", putJette: true });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.RESEAU);
});

await testAsync("code HTTP inattendu : traité comme un échec, jamais un succès", async () => {
  for (const code of [500, 503, 404, 204, 301]) {
    const { rest } = clientAvec({ statut: "afaire", putStatus: code });
    const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
    assert.equal(r.ok, false, `HTTP ${code} ne doit jamais être un succès`);
  }
});

await testAsync("ETag absent : refus, plutôt qu'une écriture non atomique", async () => {
  const { rest, faux } = clientAvec({ statut: "afaire", sansEtag: true });
  const r = await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.ETAG_ABSENT);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"));
});

await testAsync("libération : déjà « afaire » → succès immédiat, aucun PUT", async () => {
  const { rest, faux } = clientAvec({ statut: "afaire" });
  const r = await rest.changerStatutConditionnel(CLE, "encours", "afaire", { dejaCibleEstSucces: true });
  assert.equal(r.ok, true);
  assert.equal(r.raison, RAISONS.DEJA_CIBLE);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"), "objectif déjà atteint : rien à écrire");
});

await testAsync("libération : « encours » → PUT conditionnel confirmé", async () => {
  const { rest, faux } = clientAvec({ statut: "encours" });
  const r = await rest.changerStatutConditionnel(CLE, "encours", "afaire", { dejaCibleEstSucces: true });
  assert.equal(r.ok, true);
  assert.equal(r.raison, RAISONS.CONFIRME);
  const put = faux.requetes.find((q) => q.methode === "PUT");
  assert.equal(put.body, JSON.stringify("afaire"));
});

await testAsync("libération : « termine » → refus, on ne touche pas une fiche terminée", async () => {
  const { rest, faux } = clientAvec({ statut: "termine" });
  const r = await rest.changerStatutConditionnel(CLE, "encours", "afaire", { dejaCibleEstSucces: true });
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.SOURCE_DIFFERENTE);
  assert.ok(!faux.requetes.some((q) => q.methode === "PUT"));
});

await testAsync("transitionConfirmee() n'accepte que ok:true", async () => {
  const { transitionConfirmee } = await import("../lib/rest.js");
  assert.equal(transitionConfirmee({ ok: true }), true);
  assert.equal(transitionConfirmee({ ok: false, raison: "course" }), false);
  assert.equal(transitionConfirmee(null), false);
  assert.equal(transitionConfirmee(undefined), false);
});

await testAsync("l'ID token ne sort jamais du client (masqué par le journal)", async () => {
  const { rest, faux } = clientAvec({ statut: "afaire" });
  await rest.changerStatutConditionnel(CLE, "afaire", "encours");
  // Le token est bien dans l'URL (l'API REST l'exige), mais aucune
  // URL n'est journalisée, et nettoyerTexte() les masque de toute façon.
  const urls = faux.requetes.map((q) => q.url).join(" ");
  assert.ok(urls.includes(TOKEN_FACTICE), "le token doit bien être transmis à Firebase");
  assert.ok(!nettoyerTexte(urls, [TOKEN_FACTICE]).includes(TOKEN_FACTICE),
    "toute journalisation doit le masquer");
});


console.log("\n=== COMPTE RENDU : ÉCRITURE CONDITIONNELLE ===");
console.log("    (remplace runTransaction sur /seo/{cle}/note)");

const NOTE_CAMILLE = "Note existante de Camille. Client sans Carte G.";
const RAPPORT = "Yoast configuré. Schema LocalBusiness ajouté.";

// Le garde-fou est en dry-run dans ce processus : on teste donc
// rest.modifierConditionnel directement, avec le même transformateur
// que report.js (composerNote), sans passer par assertWriteAllouée.
const ajout = (rest, note = NOTE_CAMILLE, corps = RAPPORT, opts = {}) =>
  rest.modifierConditionnel(
    rest.cheminNote(CLE),
    (actuelle) => composerNote(actuelle, corps, new Date("2026-09-29T10:00:00Z")),
    opts
  );

await testAsync("note vide : le rapport est écrit sans saut de ligne parasite", async () => {
  const { rest, faux } = clientAvec({ statut: null, etag: 'W/"n0"' });
  const r = await ajout(rest, null);
  assert.equal(r.ok, true);
  assert.equal(r.tentatives, 1);
  const envoye = JSON.parse(faux.puts[0].body);
  assert.ok(envoye.startsWith("--- Compte rendu Robot SEO"));
  assert.ok(!envoye.startsWith("\n"));
});

await testAsync("note existante : elle est intégralement préservée", async () => {
  const { rest, faux } = clientAvec({ statut: NOTE_CAMILLE, etag: 'W/"n1"' });
  const r = await ajout(rest);
  assert.equal(r.ok, true);
  const envoye = JSON.parse(faux.puts[0].body);
  assert.ok(envoye.startsWith(NOTE_CAMILLE), "la note de Camille doit rester en tête");
  assert.ok(envoye.includes(RAPPORT));
  assert.ok(envoye.includes("--- Compte rendu Robot SEO — 2026-09-29 ---"));
});

await testAsync("PUT 200 : conditionné par l'ETag, une seule tentative", async () => {
  const { rest, faux } = clientAvec({ statut: NOTE_CAMILLE, etag: 'W/"n1"' });
  const r = await ajout(rest);
  assert.equal(r.ok, true);
  assert.equal(r.raison, RAISONS.CONFIRME);
  assert.equal(faux.puts.length, 1);
  assert.equal(faux.puts[0].headers["If-Match"], 'W/"n1"');
  assert.equal(faux.gets[0].headers["X-Firebase-ETag"], "true");
});

await testAsync("412 puis retry réussi : recomposé sur la note À JOUR", async () => {
  const NOTE_MODIFIEE = NOTE_CAMILLE + "\n\nAjout de Camille pendant le traitement.";
  const { rest, faux } = clientAvec({
    statut: [NOTE_CAMILLE, NOTE_MODIFIEE],   // 2e lecture = texte modifié
    etag: ['W/"n1"', 'W/"n2"'],
    putStatus: [412, 200],
  });
  const r = await ajout(rest);
  assert.equal(r.ok, true);
  assert.equal(r.tentatives, 2);
  assert.equal(faux.gets.length, 2, "la note doit avoir été relue");

  const envoye = JSON.parse(faux.puts[1].body);
  assert.ok(envoye.includes("Ajout de Camille pendant le traitement."),
    "la modification concurrente ne doit JAMAIS être écrasée");
  assert.ok(envoye.includes(RAPPORT));
  assert.equal(faux.puts[1].headers["If-Match"], 'W/"n2"', "le retry doit utiliser le nouvel ETag");
});

await testAsync("conflits répétés : abandon propre, aucune écriture forcée", async () => {
  const { rest, faux } = clientAvec({
    statut: NOTE_CAMILLE,
    putStatus: 412,
  });
  const r = await ajout(rest, NOTE_CAMILLE, RAPPORT, { maxTentatives: 3 });
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.CONFLIT_PERSISTANT);
  assert.equal(r.tentatives, 3);
  assert.equal(faux.puts.length, 3, "exactement le nombre de tentatives autorisé");
  assert.ok(faux.puts.every((q) => q.headers["If-Match"]),
    "aucune écriture ne doit avoir été tentée sans condition");
});

await testAsync("401 : échec explicite, pas de retry", async () => {
  const { rest, faux } = clientAvec({ getStatus: 401 });
  const r = await ajout(rest);
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.AUTORISATION);
  assert.equal(faux.puts.length, 0);
});

await testAsync("403 au PUT : échec explicite, pas de retry", async () => {
  const { rest, faux } = clientAvec({ statut: NOTE_CAMILLE, putStatus: 403 });
  const r = await ajout(rest);
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.AUTORISATION);
  assert.equal(faux.puts.length, 1, "un 403 ne doit pas être réessayé");
});

await testAsync("erreur réseau : échec, jamais un succès", async () => {
  const a = clientAvec({ getJette: true });
  const r1 = await ajout(a.rest);
  assert.equal(r1.ok, false);
  assert.equal(r1.raison, RAISONS.RESEAU);
  assert.equal(a.faux.puts.length, 0);

  const b = clientAvec({ statut: NOTE_CAMILLE, putJette: true });
  const r2 = await ajout(b.rest);
  assert.equal(r2.ok, false);
  assert.equal(r2.raison, RAISONS.RESEAU);
});

await testAsync("ETag absent : refus, plutôt qu'une écriture non conditionnelle", async () => {
  const { rest, faux } = clientAvec({ statut: NOTE_CAMILLE, sansEtag: true });
  const r = await ajout(rest);
  assert.equal(r.ok, false);
  assert.equal(r.raison, RAISONS.ETAG_ABSENT);
  assert.equal(faux.puts.length, 0, "aucun PUT sans ETag");
});

await testAsync("code HTTP inattendu : échec, jamais un succès", async () => {
  for (const code of [500, 503, 404, 204]) {
    const { rest } = clientAvec({ statut: NOTE_CAMILLE, putStatus: code });
    const r = await ajout(rest);
    assert.equal(r.ok, false, `HTTP ${code} ne doit jamais être un succès`);
  }
});

await testAsync("le résultat ne contient jamais le contenu de la note", async () => {
  const { rest } = clientAvec({ statut: NOTE_CAMILLE, etag: 'W/"n1"' });
  const r = await ajout(rest);
  const json = JSON.stringify(r);
  assert.ok(!json.includes("Camille"), "aucun extrait de note ne doit remonter");
  assert.ok(!json.includes(RAPPORT));
  assert.ok(!json.includes(TOKEN_FACTICE));
});

await testAsync("ajouterRapport est bloqué par le garde-fou en dry-run", async () => {
  const { rest } = clientAvec({ statut: NOTE_CAMILLE });
  await assert.rejects(() => ajouterRapport(rest, CLE, RAPPORT), /DRY-RUN/);
});

await testAsync("la limite de tentatives par défaut est stricte et bornée", () => {
  assert.ok(Number.isInteger(MAX_TENTATIVES_RAPPORT));
  assert.ok(MAX_TENTATIVES_RAPPORT >= 2 && MAX_TENTATIVES_RAPPORT <= 10);
});


console.log("\n=== ANALYSE SEO PUBLIQUE ===");
console.log("    (lecture seule — aucun OpenAI, aucun WordPress)");

const CTX = {
  url: BASE_SITE + "/",
  ville: "Villeneuve-Fictive",
  zone: "Villeneuve-Fictive, Bourg-Imaginaire, Saint-Exemple",
  zoneConfirmee: true,
  prestation: "seo_complet",
  activite: "conciergerie",
  carteG: false,
  loiHoguet: true,
};

const siteComplet = (extra = {}) => ({
  "/": pageCorrecte(),
  "/services": pageCorrecte({ title: "Nos services de conciergerie à Villeneuve-Fictive", canonical: BASE_SITE + "/services", liens: ["/", "/contact"] }),
  "/tarifs": pageCorrecte({ title: "Tarifs conciergerie Villeneuve-Fictive et Bourg-Imaginaire", canonical: BASE_SITE + "/tarifs", liens: ["/"] }),
  "/contact": pageCorrecte({ title: "Contact conciergerie Villeneuve-Fictive Saint-Exemple", canonical: BASE_SITE + "/contact", liens: ["/"] }),
  "/robots.txt": ROBOTS_TXT,
  "/sitemap.xml": SITEMAP_XML,
  ...extra,
});

const auditer1 = async (routes, ctx = CTX, opts = {}) => {
  const site = creerFauxSite(routes, opts.siteOpts);
  const r = await analyser(ctx, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, ...opts.analyse });
  return { r, site, codes: (r.constats || []).map((c) => c.code) };
};

await testAsync("1. site correct : audité, peu de critiques", async () => {
  const { r, codes } = await auditer1(siteComplet());
  assert.equal(r.disponible, true);
  assert.ok(r.pagesAnalysees >= 3, "au moins 3 pages analysées");
  assert.ok(codes.includes("https-ok"));
  assert.ok(codes.includes("ville-accueil-ok"), "la ville doit être détectée sur l'accueil");
  assert.ok(codes.includes("vocabulaire-ok"), "aucun terme Hoguet ne doit être trouvé");
  assert.ok(!codes.includes("title-absent"));
  assert.ok(!codes.includes("h1-absent"));
});

await testAsync("2. title absent → critique", async () => {
  const { codes } = await auditer1(siteComplet({ "/": pageCorrecte({ title: null }) }));
  assert.ok(codes.includes("title-absent"));
});

await testAsync("3. meta description absente → avertissement", async () => {
  const { r, codes } = await auditer1(siteComplet({ "/": pageCorrecte({ description: null }) }));
  assert.ok(codes.includes("description-absente"));
  const c = r.constats.find((x) => x.code === "description-absente");
  assert.equal(c.niveau, "avertissement");
});

await testAsync("4. title et meta dupliqués entre pages", async () => {
  const meme = pageCorrecte({ canonical: null });
  const { codes } = await auditer1(siteComplet({ "/": meme, "/services": meme, "/tarifs": meme }));
  assert.ok(codes.includes("title-duplique"), "titres identiques非 détectés");
  assert.ok(codes.includes("description-dupliquee"));
});

await testAsync("5. plusieurs H1 → avertissement", async () => {
  const { codes } = await auditer1(siteComplet({ "/": pageCorrecte({ h1: ["Premier", "Deuxième"] }) }));
  assert.ok(codes.includes("h1-multiple"));
});

await testAsync("6. H1 absent → critique", async () => {
  const { r, codes } = await auditer1(siteComplet({ "/": pageCorrecte({ h1: null }) }));
  assert.ok(codes.includes("h1-absent"));
  assert.equal(r.constats.find((x) => x.code === "h1-absent").niveau, "critique");
});

await testAsync("7. noindex → critique", async () => {
  const { r, codes } = await auditer1(siteComplet({ "/": pageCorrecte({ robots: "noindex, follow" }) }));
  assert.ok(codes.includes("noindex"));
  assert.equal(r.constats.find((x) => x.code === "noindex").niveau, "critique");
});

await testAsync("8. image sans alt → avertissement", async () => {
  const { codes } = await auditer1(siteComplet({
    "/": pageCorrecte({ images: [{ src: "/a.jpg", alt: null }, { src: "/b.jpg", alt: "" }] }),
  }));
  assert.ok(codes.includes("images-sans-alt"));
});

await testAsync("9. lien interne cassé → critique", async () => {
  const { codes } = await auditer1(siteComplet({
    "/": pageCorrecte({ liens: ["/services", "/page-qui-nexiste-pas"] }),
  }));
  assert.ok(codes.includes("lien-interne-casse"), "un 404 interne doit être signalé");
});

await testAsync("10. terme Loi Hoguet interdit → critique, sans Carte G", async () => {
  const { r, codes } = await auditer1(siteComplet({
    "/": pageCorrecte({ texteSup: "Nous assurons la gestion locative de votre bien et savons gérer votre annonce." }),
  }));
  assert.ok(codes.includes("vocabulaire-interdit"));
  const c = r.constats.find((x) => x.code === "vocabulaire-interdit");
  assert.equal(c.niveau, "critique");
  assert.match(c.message, /gestion locative/);
  assert.match(c.message, /conciergerie/, "le remplacement doit être proposé");
  assert.ok(!/\bproposer « gestion/.test(c.message));
});

await testAsync("10 bis. avec Carte G, le vocabulaire n'est plus contrôlé", async () => {
  const ctx = { ...CTX, carteG: true, loiHoguet: false };
  const { codes } = await auditer1(siteComplet({
    "/": pageCorrecte({ texteSup: "Nous assurons la gestion locative de votre bien." }),
  }), ctx);
  assert.ok(!codes.includes("vocabulaire-interdit"));
  assert.ok(!codes.includes("vocabulaire-ok"));
});

await testAsync("11. sitemap absent → avertissement", async () => {
  const routes = siteComplet();
  delete routes["/sitemap.xml"];
  routes["/robots.txt"] = "User-agent: *\nDisallow: /wp-admin/";
  const { codes } = await auditer1(routes);
  assert.ok(codes.includes("sitemap-absent"));
});

await testAsync("12. sitemap présent → point conforme", async () => {
  const { codes } = await auditer1(siteComplet());
  assert.ok(codes.includes("sitemap-present"));
});

await testAsync("13. robots.txt présent, absent, et bloquant", async () => {
  const avec = await auditer1(siteComplet());
  assert.ok(avec.codes.includes("robots-present"));

  const routes = siteComplet();
  delete routes["/robots.txt"];
  const sans = await auditer1(routes);
  assert.ok(sans.codes.includes("robots-absent"));

  // Analyse pure du parseur : Disallow: / bloque tout.
  const r = analyserRobots("User-agent: *\nDisallow: /");
  assert.equal(r.bloqueTout, true);
  assert.equal(cheminAutorise(r, "/services"), false);
  const r2 = analyserRobots("User-agent: *\nDisallow: /wp-admin/");
  assert.equal(cheminAutorise(r2, "/services"), true);
  assert.equal(cheminAutorise(r2, "/wp-admin/options.php"), false);
});

await testAsync("14. timeout réseau : audit impossible, jamais d'exception", async () => {
  const { r } = await auditer1(siteComplet(), CTX, { siteOpts: { jette: "timeout" } });
  assert.equal(r.disponible, false);
  assert.match(r.motif, /aucune page|impossible/i);
  assert.equal(r.rapport, null);
});

await testAsync("15. page 404 : l'audit continue sur les autres pages", async () => {
  const routes = siteComplet();
  routes["/tarifs"] = { status: 404, body: "Introuvable" };
  const { r, codes } = await auditer1(routes);
  assert.equal(r.disponible, true, "une page en échec ne doit pas faire tomber l'audit");
  assert.ok(r.pagesAnalysees >= 2);
  assert.ok(codes.includes("page-inaccessible"));
});

await testAsync("16. redirection de la page d'accueil détectée", async () => {
  const routes = siteComplet();
  routes["/"] = { status: 301, redirigeVers: "/accueil" };   // vraie redirection HTTP
  routes["/accueil"] = pageCorrecte();
  const { codes } = await auditer1(routes);
  assert.ok(codes.includes("redirection-accueil"));
});

await testAsync("17. limitation au même domaine : aucun lien externe visité", async () => {
  const { site } = await auditer1(siteComplet());
  const externes = site.urlsVisitees.filter((u) => !u.startsWith(BASE_SITE));
  assert.equal(externes.length, 0, "aucune requête hors du domaine : " + externes.join(", "));
});

await testAsync("18. limite maximale de pages respectée", async () => {
  const routes = siteComplet();
  for (let i = 0; i < 30; i++) {
    routes["/page-" + i] = pageCorrecte({ canonical: null, liens: ["/page-" + (i + 1), "/"] });
  }
  routes["/"] = pageCorrecte({ liens: ["/page-0", "/services"] });
  const { r } = await auditer1(routes, CTX, { analyse: { maxPages: 5, maxLiensVerifies: 0 } });
  assert.ok(r.pagesAnalysees <= 5, `${r.pagesAnalysees} pages analysées alors que la limite est 5`);
  assert.equal(r.limiteAtteinte, true);
});

await testAsync("19. JSON-LD / LocalBusiness présent puis absent", async () => {
  const avec = await auditer1(siteComplet());
  assert.ok(avec.codes.includes("jsonld-present"));
  assert.ok(avec.codes.includes("localbusiness-present"));

  const sans = await auditer1(siteComplet({
    "/": pageCorrecte({ jsonLd: false }),
    "/services": pageCorrecte({ jsonLd: false, canonical: BASE_SITE + "/services" }),
    "/tarifs": pageCorrecte({ jsonLd: false, canonical: BASE_SITE + "/tarifs" }),
    "/contact": pageCorrecte({ jsonLd: false, canonical: BASE_SITE + "/contact" }),
  }));
  assert.ok(sans.codes.includes("jsonld-absent"));
  assert.ok(sans.codes.includes("localbusiness-absent"));
});

await testAsync("20. confidentialité : le résumé des logs ne fuit rien", async () => {
  const { r } = await auditer1(siteComplet({
    "/": pageCorrecte({ texteSup: "Nous assurons la gestion locative." }),
  }));
  const resume = resumeAnonymeAnalyse(r);
  const json = JSON.stringify(resume);

  // Ni URL, ni ville, ni zone, ni contenu de page, ni rapport.
  for (const interdit of [BASE_SITE, "Villeneuve-Fictive", "Bourg-Imaginaire", "conciergerie", "gestion locative", "Audit SEO"]) {
    assert.ok(!json.includes(interdit), `« ${interdit} » ne doit pas apparaître dans les logs`);
  }
  // Mais les compteurs utiles sont bien là.
  assert.equal(typeof resume.pagesAnalysees, "number");
  assert.equal(typeof resume.erreursCritiques, "number");
  assert.ok(Array.isArray(resume.categories));
});

console.log("\n=== ANALYSE : CONTEXTE ET CONFIDENTIALITÉ ===");

await testAsync("le contexte transmis ne contient AUCUNE donnée sensible", () => {
  const ctx = verifier(ficheValide).contexte;
  const json = JSON.stringify(ctx);
  for (const champ of ["adminUrl", "login", "pass", "email", "google", "phone", "adresse", "files"]) {
    assert.ok(!(champ in ctx), `le champ « ${champ} » ne doit pas être transmis à l'analyse`);
  }
  for (const valeur of [ficheValide.adminUrl, ficheValide.login, ficheValide.pass,
                        ficheValide.email, ficheValide.google, ficheValide.phone, ficheValide.adresse]) {
    assert.ok(!json.includes(valeur), "une valeur sensible fuite dans le contexte");
  }
});

await testAsync("le contexte fournit bien ce dont l'analyse a besoin", () => {
  const ctx = verifier(ficheValide).contexte;
  assert.equal(ctx.url, ficheValide.url);
  assert.equal(ctx.ville, ficheValide.ville);
  assert.equal(ctx.zone, ficheValide.zone);
  assert.equal(ctx.zoneConfirmee, true);
  assert.equal(ctx.prestation, "seo_complet");
  assert.equal(ctx.activite, "conciergerie");
  assert.equal(ctx.carteG, true);
  assert.equal(ctx.loiHoguet, false);
});

await testAsync("une zone non confirmée n'est jamais transmise comme base", () => {
  const ctx = verifier({ ...ficheValide, zoneNa: true, zone: "Zone à confirmer" }).contexte;
  assert.equal(ctx.zone, null);
  assert.equal(ctx.zoneConfirmee, false);
});

await testAsync("sans URL publique : analyse indisponible, rien n'est tenté", async () => {
  const r = await analyser({ ...CTX, url: null });
  assert.equal(r.disponible, false);
  assert.match(r.motif, /URL publique/i);
  assert.equal(r.rapport, null);
});

await testAsync("le rapport reste exploitable et rappelle la Loi Hoguet", async () => {
  const { r } = await auditer1(siteComplet({
    "/": pageCorrecte({ texteSup: "Nous assurons la gestion locative." }),
  }));
  assert.equal(typeof r.rapport, "string");
  assert.ok(r.rapport.includes("À CORRIGER EN PRIORITÉ"));
  assert.ok(r.rapport.includes("RAPPELS"));
  assert.match(r.rapport, /SANS Carte G/);
  assert.match(r.rapport, /conciergerie/);
});

console.log("\n=== OUTILS D'ANALYSE (unitaires) ===");

await testAsync("extraction HTML : title, meta, H1, alt, JSON-LD", () => {
  const d = extraire(pageCorrecte());
  assert.ok(d.title.includes("Villeneuve-Fictive"));
  assert.ok(d.metaDescription.length > 50);
  assert.equal(d.h1.length, 1);
  assert.ok(d.h2.length >= 1);
  assert.ok(d.nbMots > 150);
  assert.deepEqual(typesJsonLd(d.jsonLd), ["LocalBusiness"]);
  assert.equal(d.images.filter((i) => !i.alt).length, 0);
});

await testAsync("le texte ignore le contenu des balises script et style", () => {
  const d = extraire('<html><head><title>T</title><style>.a{color:red}</style></head>' +
    '<body><script>var motInterdit="gestion locative";</script><h1>Bonjour</h1></body></html>');
  assert.ok(!d.texte.includes("gestion locative"), "le JS ne doit pas être lu comme du contenu");
  assert.ok(!d.texte.includes("color"));
  assert.ok(d.texte.includes("Bonjour"));
});

await testAsync("normalisation d'URL et déduplication des paramètres", () => {
  assert.equal(normaliserUrl("exemple.invalid").href, "https://exemple.invalid/");
  assert.equal(normaliserUrl("http://exemple.invalid/a#b").href, "http://exemple.invalid/a");
  assert.equal(normaliserUrl(""), null);
  // normaliserUrl ne juge que la syntaxe : c'est le garde-fou réseau
  // qui refuse un hôte sans domaine public.
  assert.equal(hoteAutorise("pas-un-domaine").ok, false);
  // Les paramètres ne créent pas une nouvelle page.
  assert.equal(cleUrl("https://x.invalid/a?utm=1"), cleUrl("https://x.invalid/a"));
  assert.equal(cleUrl("https://x.invalid/a/"), cleUrl("https://x.invalid/a"));
});

await testAsync("lecture d'un sitemap XML", () => {
  const urls = urlsDeSitemap(SITEMAP_XML);
  assert.equal(urls.length, 3);
  assert.ok(urls[0].startsWith("https://"));
  assert.deepEqual(urlsDeSitemap("<pas>du xml</pas>"), []);
});

await testAsync("le User-Agent du robot est identifiable", async () => {
  const { site } = await auditer1(siteComplet());
  const ua = site.requetes[0].headers["User-Agent"];
  assert.match(ua, /GuestLuckyRobotSEO/);
  assert.match(ua, /BUG-GL/, "l'UA doit dire qui passe");
});

await testAsync("robots.txt respecté : les chemins interdits ne sont pas visités", async () => {
  const routes = siteComplet({
    "/": pageCorrecte({ liens: ["/services", "/prive/secret"] }),
    "/prive/secret": pageCorrecte(),
  });
  routes["/robots.txt"] = "User-agent: *\nDisallow: /prive/";
  const { site } = await auditer1(routes, CTX, { analyse: { maxLiensVerifies: 0 } });
  const interdits = site.urlsVisitees.filter((u) => u.includes("/prive/"));
  assert.equal(interdits.length, 0, "le robot doit respecter Disallow");
});

await testAsync("SEO local : ville absente de l'accueil signalée", async () => {
  const sansVille = pageCorrecte({
    title: "Conciergerie et location courte durée",
    h1: "Notre conciergerie",
    description: "Service de conciergerie pour vos locations courte durée : accueil des voyageurs, ménage et suivi du linge tout au long de la saison.",
  }).replace(/Villeneuve-Fictive/g, "Ailleurs-Ville");
  const { codes } = await auditer1(siteComplet({ "/": sansVille }));
  assert.ok(codes.includes("ville-absente-accueil"));
});

await testAsync("SEO local : commune de la zone jamais mentionnée signalée", async () => {
  const ctx = { ...CTX, zone: "Villeneuve-Fictive, Commune-Jamais-Citee" };
  const { codes } = await auditer1(siteComplet(), ctx);
  assert.ok(codes.includes("zone-incomplete"));
});

await testAsync("contenu trop pauvre signalé", async () => {
  const { codes } = await auditer1(siteComplet({ "/contact": pagePauvre() }));
  assert.ok(codes.includes("contenu-pauvre"));
});


console.log("\n=== ROTATION DES AUDITS (round-robin) ===");

await testAsync("6 fiches, limite 2 : toutes couvertes en 3 passages", () => {
  const fiches = ["f1", "f2", "f3", "f4", "f5", "f6"];
  const vues = new Set();
  for (let i = 0; i < 3; i++) {
    const lot = selectionnerPourAudit(fiches, 2, 100 + i);
    assert.equal(lot.length, 2, `passage ${i} : 2 fiches attendues`);
    lot.forEach((f) => vues.add(f));
  }
  assert.equal(vues.size, 6, "les 6 fiches doivent avoir été auditées : " + [...vues].join(", "));
  assert.equal(passagesPourToutCouvrir(6, 2), 3);
});

await testAsync("la fenêtre avance bien d'un lot à chaque créneau", () => {
  const f = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(selectionnerPourAudit(f, 2, 0), ["a", "b"]);
  assert.deepEqual(selectionnerPourAudit(f, 2, 1), ["c", "d"]);
  assert.deepEqual(selectionnerPourAudit(f, 2, 2), ["e", "f"]);
  assert.deepEqual(selectionnerPourAudit(f, 2, 3), ["a", "b"], "et ça reboucle");
});

await testAsync("déterministe : même créneau → même sélection", () => {
  const f = ["a", "b", "c", "d", "e"];
  assert.deepEqual(selectionnerPourAudit(f, 2, 42), selectionnerPourAudit(f, 2, 42));
});

await testAsync("aucune fiche oubliée, quelles que soient les tailles", () => {
  for (const n of [1, 2, 3, 5, 6, 7, 11, 20]) {
    for (const max of [1, 2, 3, 5]) {
      const fiches = Array.from({ length: n }, (_, i) => "f" + i);
      const vues = new Set();
      const passages = passagesPourToutCouvrir(n, max);
      for (let i = 0; i < passages; i++) {
        selectionnerPourAudit(fiches, max, i).forEach((f) => vues.add(f));
      }
      assert.equal(vues.size, n, `${n} fiches / max ${max} : ${vues.size} couvertes en ${passages} passages`);
    }
  }
});

await testAsync("cas limites : liste vide, max 0, liste plus courte que max", () => {
  assert.deepEqual(selectionnerPourAudit([], 2, 0), []);
  assert.deepEqual(selectionnerPourAudit(["a"], 0, 0), []);
  assert.deepEqual(selectionnerPourAudit(["a", "b"], 5, 0), ["a", "b"]);
  assert.deepEqual(selectionnerPourAudit(null, 2, 0), []);
});

await testAsync("un créneau négatif ou énorme reste dans les bornes", () => {
  const f = ["a", "b", "c", "d"];
  assert.equal(selectionnerPourAudit(f, 2, -1).length, 2);
  assert.equal(selectionnerPourAudit(f, 2, 999999).length, 2);
});

await testAsync("le créneau change toutes les 15 minutes", () => {
  // Timestamp aligné sur un début de créneau, sinon le test ne prouve rien.
  const t = Math.floor(1790000000000 / DUREE_CRENEAU_MS) * DUREE_CRENEAU_MS;
  assert.equal(creneauActuel(t), creneauActuel(t + DUREE_CRENEAU_MS - 1), "même tranche");
  assert.equal(creneauActuel(t + DUREE_CRENEAU_MS), creneauActuel(t) + 1, "tranche suivante");
});

console.log("\n=== PÉRIMÈTRE RÉSEAU : MÊME SITE UNIQUEMENT ===");

const SITE_A = "https://exemple-fictif.invalid";
const EXTERNE = "https://site-externe.invalid";

await testAsync("memeSiteLegitime : variantes acceptées, reste refusé", () => {
  assert.equal(memeSiteLegitime("https://a.invalid/x", "https://a.invalid"), true);
  assert.equal(memeSiteLegitime("http://a.invalid/x", "https://a.invalid"), true, "http↔https du même site");
  assert.equal(memeSiteLegitime("https://www.a.invalid/x", "https://a.invalid"), true, "variante www");
  assert.equal(memeSiteLegitime("https://a.invalid/x", "https://www.a.invalid"), true, "et l'inverse");
  assert.equal(memeSiteLegitime("https://autre.invalid/x", "https://a.invalid"), false);
  assert.equal(memeSiteLegitime("https://sous.a.invalid/x", "https://a.invalid"), false, "un sous-domaine est un autre hôte");
  assert.equal(memeSiteLegitime("https://a.invalid:8443/x", "https://a.invalid"), false, "autre port");
  assert.equal(memeSiteLegitime("pas-une-url", "https://a.invalid"), false);
});

await testAsync("lien externe → aucune requête émise", async () => {
  const site = creerFauxSite({
    "/": pageCorrecte({ liens: ["/services", EXTERNE + "/piege"] }),
    "/services": pageCorrecte({ canonical: SITE_A + "/services", liens: ["/"] }),
    "/robots.txt": ROBOTS_TXT,
  });
  await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 5 });
  const fuites = site.urlsVisitees.filter((u) => !u.startsWith(SITE_A));
  assert.equal(fuites.length, 0, "requêtes hors périmètre : " + fuites.join(", "));
});

await testAsync("sitemap externe déclaré dans robots.txt → aucune requête", async () => {
  const site = creerFauxSite({
    "/": pageCorrecte({ liens: ["/"] }),
    "/robots.txt": `User-agent: *\nSitemap: ${EXTERNE}/sitemap.xml`,
  });
  await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  const fuites = site.urlsVisitees.filter((u) => !u.startsWith(SITE_A));
  assert.equal(fuites.length, 0, "le sitemap externe ne doit JAMAIS être requêté : " + fuites.join(", "));
});

await testAsync("sous-sitemap externe dans un sitemapindex → aucune requête", async () => {
  const site = creerFauxSite({
    "/": pageCorrecte({ liens: ["/"] }),
    "/robots.txt": "User-agent: *\nDisallow:",
    "/sitemap.xml": `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>${EXTERNE}/sitemap-1.xml</loc></sitemap></sitemapindex>`,
  });
  await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  const fuites = site.urlsVisitees.filter((u) => !u.startsWith(SITE_A));
  assert.equal(fuites.length, 0, "le sous-sitemap externe ne doit pas être ouvert : " + fuites.join(", "));
});

await testAsync("redirection vers un domaine externe → non suivie", async () => {
  const site = creerFauxSite({
    "/": { status: 302, redirigeVers: EXTERNE + "/ailleurs" },
    "/robots.txt": "User-agent: *\nDisallow:",
  }, { originesSupplementaires: [EXTERNE] });

  const r = await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  const fuites = site.urlsVisitees.filter((u) => u.startsWith(EXTERNE));
  assert.equal(fuites.length, 0, "la redirection externe ne doit pas être suivie : " + fuites.join(", "));
  assert.equal(r.disponible, false, "sans page accessible, l'audit est indisponible");
});

await testAsync("redirection HTTP → HTTPS du même site : correctement suivie", async () => {
  const siteHttp = "http://exemple-fictif.invalid";
  const site = creerFauxSite({
    "/": pageCorrecte(),
    "/robots.txt": "User-agent: *\nDisallow:",
  }, { base: SITE_A, originesSupplementaires: [siteHttp] });

  // Le faux serveur répond sur les deux origines ; on part en http.
  const r = await analyser({ ...CTX, url: siteHttp + "/" }, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  assert.equal(r.disponible, true, "le même site en http doit rester analysable");
});

await testAsync("variante www légitime : correctement gérée", async () => {
  const www = "https://www.exemple-fictif.invalid";
  const site = creerFauxSite({
    "/": { status: 301, redirigeVers: www + "/" },   // le nu redirige vers www
    [www + "/"]: pageCorrecte(),                     // et www sert la vraie page
    [www + "/robots.txt"]: "User-agent: *\nDisallow:",
    "/robots.txt": "User-agent: *\nDisallow:",
  }, { originesSupplementaires: [www] });

  const r = await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  const visitesWww = site.urlsVisitees.filter((u) => u.startsWith(www));
  assert.ok(visitesWww.length > 0, "la redirection vers www doit être suivie");
  assert.equal(r.disponible, true);
});

await testAsync("chaîne de redirections trop longue : abandon propre", async () => {
  const routes = { "/robots.txt": "User-agent: *\nDisallow:" };
  for (let i = 0; i < 10; i++) routes["/r" + i] = { status: 302, redirigeVers: "/r" + (i + 1) };
  routes["/"] = { status: 302, redirigeVers: "/r0" };
  const site = creerFauxSite(routes);
  const r = await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  assert.equal(r.disponible, false);
  assert.ok(site.urlsVisitees.length < 20, "la chaîne doit être coupée court");
});

console.log("\n=== GARDE-FOU ANTI-SSRF (hôtes locaux et privés) ===");

await testAsync("IPv4 privées, loopback, link-local et réservées refusées", () => {
  for (const ip of ["127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.5", "172.16.0.1",
                    "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
                    "192.0.0.1", "198.18.0.1", "224.0.0.1"]) {
    assert.equal(ipv4Privee(ip), true, `${ip} doit être refusée`);
  }
});

await testAsync("IPv4 publiques acceptées", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "51.15.1.1", "172.32.0.1", "192.167.1.1", "99.99.99.99"]) {
    assert.equal(ipv4Privee(ip), false, `${ip} devrait être acceptée`);
  }
});

await testAsync("IPv6 loopback, link-local et ULA refusées", () => {
  for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1"]) {
    assert.equal(ipv6Privee(ip), true, `${ip} doit être refusée`);
  }
  assert.equal(ipv6Privee("2001:4860:4860::8888"), false, "une IPv6 publique est acceptée");
});

await testAsync("noms d'hôtes locaux et internes refusés", () => {
  for (const h of ["localhost", "LOCALHOST", "monserveur.local", "api.internal",
                   "truc.intranet", "machine.localdomain", "routeur.home.arpa",
                   "metadata.google.internal", "instance-data", "serveur"]) {
    const v = hoteAutorise(h);
    assert.equal(v.ok, false, `« ${h} » doit être refusé`);
  }
  assert.equal(hoteAutorise("exemple-fictif.invalid").ok, true);
  assert.equal(hoteAutorise("www.site-client.fr").ok, true);
});

await testAsync("adresses de métadonnées cloud refusées explicitement", async () => {
  for (const h of ["169.254.169.254", "metadata.google.internal", "100.100.100.200"]) {
    const v = await urlAutorisee("http://" + h + "/latest/meta-data/");
    assert.equal(v.ok, false, `${h} doit être refusé`);
    assert.ok([RAISONS_REFUS.METADONNEES_CLOUD, RAISONS_REFUS.HOTE_LOCAL, RAISONS_REFUS.IP_PRIVEE].includes(v.raison));
  }
});

await testAsync("protocoles autres que http/https refusés", async () => {
  for (const u of ["file:///etc/passwd", "ftp://exemple.fr/x", "gopher://exemple.fr"]) {
    const v = await urlAutorisee(u);
    assert.equal(v.ok, false, `${u} doit être refusé`);
  }
});

await testAsync("un domaine public résolvant vers une IP privée est refusé", async () => {
  // Cas classique de contournement : le nom est public, le DNS pointe ailleurs.
  const resolveurPiege = async () => ["192.168.1.50"];
  const v = await urlAutorisee("https://site-client.fr/", { resolveur: resolveurPiege });
  assert.equal(v.ok, false);
  assert.equal(v.raison, RAISONS_REFUS.IP_PRIVEE);
});

await testAsync("un domaine résolvant vers une IP publique est accepté", async () => {
  const v = await urlAutorisee("https://site-client.fr/", { resolveur: async () => ["93.184.216.34"] });
  assert.equal(v.ok, true);
});

await testAsync("si une SEULE adresse est privée, tout est refusé", async () => {
  const v = await urlAutorisee("https://site-client.fr/", {
    resolveur: async () => ["93.184.216.34", "10.0.0.1"],
  });
  assert.equal(v.ok, false, "une seule IP privée suffit à refuser");
  assert.equal(v.raison, RAISONS_REFUS.IP_PRIVEE);
});

await testAsync("une résolution DNS impossible refuse l'URL", async () => {
  const v1 = await urlAutorisee("https://site-client.fr/", { resolveur: async () => { throw new Error("NXDOMAIN"); } });
  assert.equal(v1.ok, false);
  assert.equal(v1.raison, RAISONS_REFUS.DNS);
  const v2 = await urlAutorisee("https://site-client.fr/", { resolveur: async () => [] });
  assert.equal(v2.ok, false);
});

await testAsync("une URL interdite n'est JAMAIS requêtée, même une fois", async () => {
  for (const mauvaise of ["http://localhost:8080/", "http://127.0.0.1/", "http://169.254.169.254/",
                          "http://192.168.1.1/", "http://api.internal/"]) {
    const site = creerFauxSite({ "/": pageCorrecte() });
    const r = await analyser({ ...CTX, url: mauvaise }, { fetchImpl: site.fetchImpl, resolveur: site.resolveur });
    assert.equal(r.disponible, false, `${mauvaise} ne doit pas être analysée`);
    assert.match(r.motif, /garde-fou réseau/i);
    assert.equal(site.requetes.length, 0, `AUCUNE requête ne doit partir vers ${mauvaise}`);
  }
});

await testAsync("le garde-fou est réappliqué à chaque redirection", async () => {
  // Redirection du site client vers un hôte local : doit être refusée.
  const site = creerFauxSite({
    "/": { status: 302, redirigeVers: "http://169.254.169.254/latest/meta-data/" },
    "/robots.txt": "User-agent: *\nDisallow:",
  }, { originesSupplementaires: ["http://169.254.169.254"] });

  const r = await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur: site.resolveur, maxLiensVerifies: 0 });
  const fuites = site.urlsVisitees.filter((u) => u.includes("169.254.169.254"));
  assert.equal(fuites.length, 0, "la redirection vers les métadonnées doit être bloquée");
  assert.equal(r.disponible, false);
});


console.log("\n=== DNS : ACTIF PAR DÉFAUT (fail-safe) ===");

await testAsync("sans resolver fourni, la vérification DNS s'applique quand même", async () => {
  // Domaine réservé qui ne résout jamais : le resolver système échoue,
  // donc l'URL doit être refusée. Si le DNS était court-circuité, elle
  // passerait — c'est exactement la faille qu'on ferme.
  const v = await urlAutorisee("https://domaine-qui-ne-resout-jamais.invalid/");
  assert.equal(v.ok, false, "une URL non résolvable ne doit jamais être acceptée");
  assert.equal(v.raison, RAISONS_REFUS.DNS);
});

await testAsync("un resolver nul ou invalide ne désactive PAS la vérification", async () => {
  for (const valeur of [null, undefined, 0, "", "resolveurSysteme", {}, []]) {
    const v = await urlAutorisee("https://domaine-qui-ne-resout-jamais.invalid/", { resolveur: valeur });
    assert.equal(v.ok, false,
      `resolveur=${JSON.stringify(valeur)} ne doit pas ouvrir une brèche`);
  }
});

await testAsync("seul le jeton SANS_DNS désactive la vérification", async () => {
  const v = await urlAutorisee("https://domaine-qui-ne-resout-jamais.invalid/", { resolveur: SANS_DNS });
  assert.equal(v.ok, true, "l'exemption explicite doit fonctionner, pour les tests");
});

await testAsync("le crawler branche le resolver système par défaut", async () => {
  const { creerCrawler } = await import("../lib/crawl.js");
  const site = creerFauxSite({ "/": pageCorrecte() });
  // Aucun resolveur fourni : le crawler doit utiliser le resolver système,
  // qui échouera sur ce domaine réservé — donc aucune requête ne part.
  const c = creerCrawler({ fetchImpl: site.fetchImpl });
  const r = await c.explorer(BASE_SITE + "/");
  assert.equal(r.ok, false, "sans DNS valide, l'exploration doit être refusée");
  assert.equal(site.requetes.length, 0, "aucune requête ne doit partir");
});

console.log("\n=== DOMAINE PUBLIC → IP PRIVÉE : REFUS ET ZÉRO FETCH ===");

/** Construit un faux site dont le DNS ment : nom public, IP interne. */
const resolveurMenteur = (ip) => async () => [ip];

for (const [etiquette, ip] of [
  ["IP privée RFC1918", "192.168.1.20"],
  ["loopback IPv4", "127.0.0.1"],
  ["métadonnées cloud", "169.254.169.254"],
  ["loopback IPv6", "::1"],
  ["IPv6 ULA", "fd00:dead:beef::1"],
  ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
  ["IPv4-mapped hexadécimal", "::ffff:7f00:1"],
  ["link-local IPv4", "169.254.1.1"],
  ["CGNAT", "100.64.0.1"],
]) {
  await testAsync(`site-public.example → ${etiquette} (${ip}) : refusé, 0 fetch`, async () => {
    const site = creerFauxSite({ "/": pageCorrecte() });
    const r = await analyser(
      { ...CTX, url: "https://site-public.example/" },
      { fetchImpl: site.fetchImpl, resolveur: resolveurMenteur(ip) }
    );
    assert.equal(r.disponible, false, `${ip} ne doit pas être analysée`);
    assert.match(r.motif, /garde-fou réseau/i);
    assert.equal(site.requetes.length, 0, `AUCUN fetch ne doit partir (${ip})`);
  });
}

await testAsync("contrôle positif : IP publique seule → requête autorisée", async () => {
  const site = creerFauxSite({
    "/": pageCorrecte(),
    "/robots.txt": ROBOTS_TXT,
    "/sitemap.xml": SITEMAP_XML,
  });
  const r = await analyser(CTX, {
    fetchImpl: site.fetchImpl,
    resolveur: async () => ["93.184.216.34"],   // IP publique
  });
  assert.equal(r.disponible, true, "une IP publique doit laisser passer");
  assert.ok(site.requetes.length > 0, "les requêtes doivent bien partir");
});

await testAsync("une seule IP privée parmi des publiques suffit à refuser", async () => {
  const site = creerFauxSite({ "/": pageCorrecte() });
  const r = await analyser(
    { ...CTX, url: "https://site-public.example/" },
    { fetchImpl: site.fetchImpl, resolveur: async () => ["93.184.216.34", "8.8.8.8", "10.0.0.7"] }
  );
  assert.equal(r.disponible, false);
  assert.equal(site.requetes.length, 0);
});

await testAsync("la validation DNS est refaite à chaque redirection", async () => {
  const PIEGE = "https://piege.example";
  const site = creerFauxSite({
    "/": { status: 302, redirigeVers: PIEGE + "/interne" },
    "/robots.txt": "User-agent: *\nDisallow:",
  }, { originesSupplementaires: [PIEGE] });

  // Le domaine de départ est public ; la cible de redirection, elle,
  // résout vers une IP privée.
  const resolveur = async (hote) =>
    hote === "piege.example" ? ["192.168.50.1"] : ["93.184.216.34"];

  const r = await analyser(CTX, { fetchImpl: site.fetchImpl, resolveur, maxLiensVerifies: 0 });
  const fuites = site.urlsVisitees.filter((u) => u.startsWith(PIEGE));
  assert.equal(fuites.length, 0, "la redirection vers une IP privée doit être bloquée");
  assert.equal(r.disponible, false);
});

console.log("\n=== IPv6 : FORMES ÉQUIVALENTES D'UNE MÊME ADRESSE ===");

await testAsync("toutes les notations de ::ffff:127.0.0.1 sont refusées", () => {
  for (const a of ["::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:7f00:0001",
                   "0:0:0:0:0:ffff:7f00:1", "0000:0000:0000:0000:0000:ffff:7f00:0001"]) {
    assert.equal(ipv6Privee(a), true, `${a} désigne 127.0.0.1 et doit être refusée`);
  }
});

await testAsync("IPv4 privées encapsulées en IPv6, pointées ou hexadécimales", () => {
  for (const a of ["::ffff:192.168.1.1", "::ffff:c0a8:101",
                   "::ffff:10.0.0.1", "::ffff:a00:1",
                   "::ffff:169.254.169.254", "::ffff:a9fe:a9fe",
                   "::ffff:172.16.0.1", "::ffff:ac10:1",
                   "64:ff9b::192.168.1.1", "::192.168.1.1"]) {
    assert.equal(ipv6Privee(a), true, `${a} doit être refusée`);
  }
});

await testAsync("IPv6 publiques et IPv4 publiques encapsulées acceptées", () => {
  for (const a of ["2001:4860:4860::8888", "2a00:1450:4007:80f::200e",
                   "::ffff:8.8.8.8", "::ffff:808:808", "::ffff:93.184.216.34"]) {
    assert.equal(ipv6Privee(a), false, `${a} devrait être acceptée`);
  }
});

await testAsync("une adresse illisible est refusée par défaut", () => {
  for (const a of ["pas-une-ip", "::ffff:999.1.1.1", "1:2:3::4::5", "gggg::1", "", null]) {
    assert.equal(ipPrivee(a), true, `${JSON.stringify(a)} doit être refusée au bénéfice du doute`);
  }
  assert.equal(groupesIPv6("1:2:3::4::5"), null);
});

await testAsync("hoteAutorise refuse les IP littérales encapsulées", () => {
  for (const h of ["[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[::1]", "[fd00::1]", "[::ffff:192.168.1.1]"]) {
    assert.equal(hoteAutorise(h).ok, false, `${h} doit être refusé`);
  }
  assert.equal(hoteAutorise("[2001:4860:4860::8888]").ok, true);
});

await testAsync("une IP littérale privée dans l'URL n'émet aucun fetch", async () => {
  for (const hote of ["[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[fd00::1]", "[::1]"]) {
    const site = creerFauxSite({ "/": pageCorrecte() });
    const r = await analyser({ ...CTX, url: `http://${hote}/` }, { fetchImpl: site.fetchImpl });
    assert.equal(r.disponible, false, `${hote} ne doit pas être analysé`);
    assert.equal(site.requetes.length, 0, `AUCUN fetch vers ${hote}`);
  }
});

console.log(`\n${ok} test(s) réussi(s).${process.exitCode ? " ⚠️ Des tests ont échoué." : " Tout est vert."}\n`);
