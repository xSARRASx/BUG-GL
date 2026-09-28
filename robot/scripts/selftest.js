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

let ok = 0;
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

console.log(`\n${ok} test(s) réussi(s).${process.exitCode ? " ⚠️ Des tests ont échoué." : " Tout est vert."}\n`);
