// Scénario : mode ACTIF avec liste blanche contenant une seule fiche.
// Lancé dans un processus séparé par selftest.js (initGuard n'est appelable qu'une fois).

import assert from "node:assert/strict";
import {
  initGuard, assertWriteAllowed, assertTermineAllowed,
  estAutorisee, FicheNonAutorisee, AutoTermineDisabled,
} from "../../lib/guard.js";

const ID_TEST = "-P2atEDbwnjG7JWnxhH2";
const ID_AUTRE = "-P9autreFicheXyz0001";

initGuard({ dryRun: false, autoTermine: false, allowedTestIds: [ID_TEST] });

// La fiche listée est écrivable…
assert.doesNotThrow(() => assertWriteAllowed("réservation", ID_TEST));
assert.equal(estAutorisee(ID_TEST), true);

// …toutes les autres sont refusées.
assert.throws(() => assertWriteAllowed("réservation", ID_AUTRE), FicheNonAutorisee);

// Une écriture sans clé est refusée (aucun angle mort possible).
assert.throws(() => assertWriteAllowed("écriture sans clé"), FicheNonAutorisee);
assert.throws(() => assertWriteAllowed("écriture clé vide", ""), FicheNonAutorisee);
assert.throws(() => assertWriteAllowed("écriture clé nulle", null), FicheNonAutorisee);

// Le passage en « terminé » reste refusé même sur la fiche autorisée.
assert.throws(() => assertTermineAllowed(ID_TEST), AutoTermineDisabled);

console.log("SCENARIO_OK");
