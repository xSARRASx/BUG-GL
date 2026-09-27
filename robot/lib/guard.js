// =============================================================
//  Garde-fou des écritures
// =============================================================
//  Point de passage UNIQUE et obligatoire de toute écriture Firebase.
//  Tant que dryRun vaut true, aucune écriture ne peut aboutir :
//  assertWriteAllowed() lève une exception avant même que le SDK
//  Firebase soit sollicité.
//
//  Règle : aucun module ne doit appeler set/update/remove/runTransaction
//  sans avoir appelé assertWriteAllowed() juste avant.
// =============================================================

let dryRun = true;        // par défaut : le mode le plus sûr
let autoTermine = false;  // par défaut : jamais de passage automatique en « terminé »
let locked = false;       // une fois verrouillé, la config ne peut plus changer

export class DryRunViolation extends Error {
  constructor(operation) {
    super(`[DRY-RUN] Écriture refusée : « ${operation} ». Aucune donnée n'a été modifiée.`);
    this.name = "DryRunViolation";
    this.operation = operation;
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
  dryRun = config.dryRun !== false;          // tout ce qui n'est pas explicitement false = dry-run
  autoTermine = config.autoTermine === true; // tout ce qui n'est pas explicitement true = désactivé
  locked = true;
  return { dryRun, autoTermine };
}

export function isDryRun() { return dryRun; }
export function isAutoTermineAllowed() { return autoTermine; }

/**
 * À appeler AVANT toute écriture Firebase.
 * @param {string} operation description lisible, sans donnée sensible
 */
export function assertWriteAllowed(operation) {
  if (dryRun) throw new DryRunViolation(operation);
}

/** À appeler avant un passage en statut « terminé ». */
export function assertTermineAllowed() {
  if (!autoTermine) throw new AutoTermineDisabled();
  assertWriteAllowed("passage en statut terminé");
}
