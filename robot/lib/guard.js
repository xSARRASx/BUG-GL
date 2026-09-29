// =============================================================
//  Garde-fou des écritures
// =============================================================
//  Point de passage UNIQUE et obligatoire de toute écriture Firebase.
//  Trois verrous indépendants, dans cet ordre :
//
//    1. dryRun          → aucune écriture, quelle que soit la fiche
//    2. allowedTestIds  → seules les fiches explicitement listées
//                         peuvent être écrites (liste blanche stricte)
//    3. autoTermine     → le passage en statut « terminé » reste humain
//
//  Chaque verrou est fermé par défaut. Une configuration absente,
//  vide ou invalide aboutit toujours au comportement le plus sûr.
//
//  Règle : aucun module ne doit appeler set/update/remove/runTransaction
//  sans avoir appelé assertWriteAllowed(operation, cle) juste avant.
// =============================================================

let dryRun = true;        // par défaut : le mode le plus sûr
let autoTermine = false;  // par défaut : jamais de passage automatique en « terminé »
let allowedIds = [];      // par défaut : AUCUNE fiche autorisée
let locked = false;       // une fois verrouillé, la config ne peut plus changer

export class DryRunViolation extends Error {
  constructor(operation) {
    super(`[DRY-RUN] Écriture refusée : « ${operation} ». Aucune donnée n'a été modifiée.`);
    this.name = "DryRunViolation";
    this.operation = operation;
  }
}

export class FicheNonAutorisee extends Error {
  constructor(cle, operation) {
    super(
      `[LISTE BLANCHE] Écriture refusée sur la fiche ${cle || "(clé absente)"} : ` +
      `elle ne figure pas dans allowedTestIds. Opération : « ${operation} ».`
    );
    this.name = "FicheNonAutorisee";
    this.cle = cle;
  }
}

export class AutoTermineDisabled extends Error {
  constructor() {
    super("Passage en « terminé » refusé : autoTermine est désactivé.");
    this.name = "AutoTermineDisabled";
  }
}

/** Initialise le garde-fou depuis la configuration. Ne peut être appelé qu'une fois. */
export function initGuard(config) {
  if (locked) throw new Error("Le garde-fou est déjà initialisé et ne peut plus être modifié.");

  // Tout ce qui n'est pas explicitement false reste en dry-run.
  dryRun = config.dryRun !== false;
  // Tout ce qui n'est pas explicitement true reste désactivé.
  autoTermine = config.autoTermine === true;
  // Liste blanche : seules des chaînes non vides sont retenues.
  allowedIds = Array.isArray(config.allowedTestIds)
    ? config.allowedTestIds.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    : [];

  locked = true;
  return { dryRun, autoTermine, allowedIds: [...allowedIds] };
}

export function isDryRun() { return dryRun; }
export function isAutoTermineAllowed() { return autoTermine; }
export function getAllowedIds() { return [...allowedIds]; }

/** true si la fiche figure dans la liste blanche. */
export function estAutorisee(cle) {
  return typeof cle === "string" && cle.trim() !== "" && allowedIds.includes(cle.trim());
}

/**
 * À appeler AVANT toute écriture Firebase.
 * @param {string} operation description lisible, sans donnée sensible
 * @param {string} cle        clé Firebase de la fiche concernée (obligatoire)
 */
export function assertWriteAllowed(operation, cle) {
  if (dryRun) throw new DryRunViolation(operation);
  // Une écriture doit toujours nommer la fiche qu'elle vise : sans clé, pas d'écriture.
  if (!estAutorisee(cle)) throw new FicheNonAutorisee(cle, operation);
}

/**
 * 4ᵉ verrou, indépendant des trois autres : le mode ACTIF ne doit
 * jamais pouvoir se déclencher tout seul.
 *
 * Le robot tourne en cron toutes les 15 minutes. Si quelqu'un passait
 * `dryRun` à false sans y penser, chaque passage écrirait en base sans
 * qu'aucun humain ne l'ait demandé. On exige donc un consentement
 * explicite et distinct : `allowScheduledActive`.
 *
 * Fonction PURE : elle ne lit ni n'altère l'état du garde-fou, ce qui
 * la rend testable sans initGuard().
 *
 * @param {object} p
 * @param {boolean} p.dryRun
 * @param {boolean} p.allowScheduledActive
 * @param {string}  p.evenement  nom de l'événement GitHub (schedule, workflow_dispatch…)
 * @returns {{ok: boolean, raison: string, message?: string}}
 */
export function verifierModeAutorise({ dryRun, allowScheduledActive, evenement }) {
  // En dry-run, aucune écriture n'est possible : tout déclencheur est sûr.
  if (dryRun !== false) return { ok: true, raison: "dry_run" };

  // Mode actif demandé.
  if (evenement === "workflow_dispatch") {
    // Lancement manuel : un humain a cliqué, c'est le cas prévu.
    return { ok: true, raison: "actif_manuel" };
  }

  if (evenement === "schedule") {
    if (allowScheduledActive === true) {
      return { ok: true, raison: "actif_planifie_autorise" };
    }
    return {
      ok: false,
      raison: "actif_planifie_interdit",
      message:
        "Mode actif refusé sur un déclenchement planifié : allowScheduledActive vaut false. " +
        "Aucune écriture n'a été tentée.",
    };
  }

  // Tout autre déclencheur (push, pull_request…) : refus par défaut.
  return {
    ok: false,
    raison: "declencheur_non_autorise",
    message:
      `Mode actif refusé sur un déclenchement « ${evenement || "inconnu"} ». ` +
      "Seul un lancement manuel est autorisé. Aucune écriture n'a été tentée.",
  };
}

/** À appeler avant un passage en statut « terminé ». */
export function assertTermineAllowed(cle) {
  if (!autoTermine) throw new AutoTermineDisabled();
  assertWriteAllowed("passage en statut terminé", cle);
}
