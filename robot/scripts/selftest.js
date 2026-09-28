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

import { initGuard, assertWriteAllowed, assertTermineAllowed, estAutorisee, getAllowedIds, DryRunViolation, AutoTermineDisabled, FicheNonAutorisee } from "../lib/guard.js";
import { verifier } from "../lib/validate.js";
import { resumeAnonyme, nettoyerTexte, valeursSensiblesDe, CHAMPS_SENSIBLES } from "../lib/redact.js";
import { entete, composerNote } from "../lib/note.js";
import { traiterAvecFilet, reserverAvecFilet, libererAvecRepli, rollbackConfirme,
         normaliserClaim, ISSUES, MOTIFS } from "../lib/flow.js";
import { creerClientRest, RAISONS } from "../lib/rest.js";
import { creerFauxFetch, TOKEN_FACTICE } from "./fauxfetch.js";
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

console.log(`\n${ok} test(s) réussi(s).${process.exitCode ? " ⚠️ Des tests ont échoué." : " Tout est vert."}\n`);
