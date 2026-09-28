// Scénario : mode ACTIF mais liste blanche VIDE.
// Aucune écriture ne doit être possible, sur aucune fiche.

import assert from "node:assert/strict";
import { initGuard, assertWriteAllowed, estAutorisee, FicheNonAutorisee } from "../../lib/guard.js";

const ID_TEST = "-P2atEDbwnjG7JWnxhH2";

initGuard({ dryRun: false, autoTermine: false, allowedTestIds: [] });

assert.equal(estAutorisee(ID_TEST), false);
assert.throws(() => assertWriteAllowed("réservation", ID_TEST), FicheNonAutorisee);

console.log("SCENARIO_OK");
