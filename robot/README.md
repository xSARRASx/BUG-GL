# Robot SEO — V1.1 (dry-run, prêt pour un test actif ciblé)

Robot de détection des fiches SEO à traiter, pour le projet
[Suivi SEO Guest Lucky](https://xsarrasx.github.io/BUG-GL/seo.html).

> ## 🔒 État actuel : DRY-RUN STRICT
>
> **Le robot ne modifie rien.** Il lit, vérifie, affiche un résumé anonymisé,
> et s'arrête.
>
> Quatre verrous indépendants, tous fermés par défaut :
>
> | Verrou | Valeur | Effet |
> |---|---|---|
> | `dryRun` | `true` | aucune écriture, quelle que soit la fiche |
> | `allowedTestIds` | 1 fiche | seule cette clé Firebase pourra être écrite |
> | `autoTermine` | `false` | le passage en « terminé » reste humain |
> | `allowScheduledActive` | `false` | le mode actif ne peut jamais venir du cron |
>
> WordPress n'est jamais touché. Ni OpenAI ni OpenSEO ne sont branchés.

---

## Ce que fait le robot aujourd'hui

1. S'authentifie auprès de Firebase avec un **compte robot dédié** (SDK client,
   pas Admin SDK — il est donc soumis aux mêmes règles que Martin et Camille).
2. Lit les fiches au statut `afaire` via la **requête indexée**
   (`orderBy="statut"&equalTo="afaire"`), pour ne pas télécharger tout `/seo`.
3. Vérifie les champs obligatoires et les garde-fous métier.
4. Affiche un **résumé anonymisé** de chaque fiche.
5. S'arrête. **Aucune écriture.**

## Ce qui est déjà codé mais inactif

Le mode actif est entièrement écrit et protégé par le garde-fou :

| Module | Rôle | Statut |
|---|---|---|
| `lib/claim.js` | Primitives de réservation atomique par transaction | inactif |
| `lib/flow.js` | Enchaînement + filets : la fiche ne reste jamais en `encours` | pur |
| `lib/state.js` | État du traitement dans `/seoRobot` | inactif |
| `lib/report.js` | Ajout du compte rendu par transaction, sans écraser la note | inactif |
| `lib/analyse.js` | Analyse SEO | **stub volontaire** |

Le passage en `termine` est verrouillé par `"autoTermine": false` — la validation
finale reste humaine.

---

## Secrets GitHub requis

À créer dans **Settings → Secrets and variables → Actions → New repository secret** :

| Nom du secret | Contenu |
|---|---|
| `SEO_ROBOT_EMAIL` | adresse e-mail du compte robot Firebase |
| `SEO_ROBOT_PASSWORD` | mot de passe de ce compte |

C'est tout. La configuration Firebase (`apiKey`, `databaseURL`…) **n'est pas un
secret** : elle est déjà publique dans `js/firebase-config.js`, servie en clair
par GitHub Pages. Le robot la lit directement depuis ce fichier.

Si un secret manque, le workflow **échoue proprement** sans rien révéler et sans
rien exécuter.

---

## Lancer le robot

### Depuis GitHub (recommandé)

Onglet **Actions** → **Robot SEO (dry-run)** → **Run workflow**.

Il tourne aussi **automatiquement toutes les 15 minutes** : Camille ajoute une
fiche dans le Suivi SEO, le robot la détecte au passage suivant, sans aucune
intervention de Martin.

Le cron GitHub est *best effort* : un retard de quelques minutes est normal, et
l'intervalle réel peut dépasser 15 minutes aux heures chargées. Le déclenchement
manuel reste disponible comme bouton de secours / debug — et c'est le **seul**
moyen de lancer un mode actif tant que `allowScheduledActive` vaut `false`.

En dry-run, **toutes** les fiches au statut « à faire » sont examinées et
affichées, pas seulement celle de la liste blanche : rien n'étant écrit, autant
voir l'état réel de la file d'attente. La limite `maxFichesParPassage` ne
protège que les écritures, donc elle ne s'applique qu'en mode actif.

### En local

```bash
cd robot
npm ci
SEO_ROBOT_EMAIL="..." SEO_ROBOT_PASSWORD="..." node index.js
```

⚠️ Ne jamais écrire ces valeurs dans un fichier du dépôt.

### Auto-test (aucun réseau, aucun secret)

```bash
cd robot
node scripts/selftest.js
```

---

## Confidentialité des logs

⚠️ **Le dépôt est public, donc les logs GitHub Actions sont publics.**

Rien d'identifiable ne doit en sortir. Le robot masque systématiquement :
nom du client, e-mail, téléphone, adresse, ville, zone, URL, réseaux sociaux,
**accès WordPress** (`adminUrl`, `login`, `pass`) et pièces jointes.

Seule la **clé Firebase de la fiche** est affichée : c'est un identifiant opaque,
et `/seo` n'est lisible que par Martin et Camille.

Trois protections se cumulent :

1. `lib/redact.js` — ne construit qu'un résumé d'états, jamais de valeurs ;
2. `lib/log.js` — masque les valeurs enregistrées comme sensibles dans **toute**
   sortie, y compris les messages d'erreur du SDK ;
3. `nettoyerTexte()` — filet générique qui masque e-mails, téléphones, URLs et
   base64, même inconnus.

---

## Lancer LE test actif ciblé

Prérequis : publier les règles Firebase (`/seo` + `/seoRobot`).

`firebase-rules.json` à la racine est un fichier de règles **directement
déployable** : son contenu se copie tel quel dans Firebase Console →
Realtime Database → Règles → Publier. Les UID qu'il contient sont ceux de
Martin, Camille et du compte Robot SEO.

Un seul changement : dans `robot/config.json`, passer

```json
"dryRun": false
```

`allowedTestIds` contient déjà uniquement la fiche de test, et `autoTermine`
reste à `false`. **Ne toucher à rien d'autre.**

Puis lancer **manuellement** : Actions → Robot SEO → Run workflow.

Le contrôle pré-vol du workflow refuse le mode actif :

* sur un déclenchement **cron**, tant que `allowScheduledActive` vaut `false`
  (le test ne peut donc pas se répéter tout seul, 96 fois par jour) ;
* sur tout autre déclencheur que le lancement manuel ;
* si `allowedTestIds` est **vide** ;
* si `autoTermine` est à **true**.

Le robot lui-même refait ce contrôle (`verifierModeAutorise`), pour que la
protection ne dépende pas du seul fichier de workflow.

### Déroulé attendu du test actif

| Étape | Attendu |
|---|---|
| Réservation | `afaire` → `encours` par transaction |
| `/seoRobot/{id}` | créé, `etat: "reserve"` |
| État | passe à `analyse` |
| Analyse | **indisponible** (stub) |
| Libération | `encours` → `afaire` |
| `/seoRobot/{id}` | `etat: "echec"`, motif renseigné |
| Compte rendu | **aucun** — `note` non modifiée |
| Statut `termine` | **jamais** |

### État de la fiche après le test

Son **statut** revient à `afaire` et sa **note** est intacte, mais la fiche
n'est pas identique à ce qu'elle était :

* `updatedAt` a été réécrit (deux fois : réservation, puis libération) ;
* `updatedBy` porte désormais le nom du compte robot ;
* `termineAt` a été explicitement remis à `null`.

Ces trois champs sont ceux que l'app écrit elle-même à chaque modification.
Aucune donnée client n'est touchée.

Une entrée `/seoRobot/{id}` subsiste, avec `etat: "echec"` et le motif —
c'est la trace du passage, à consulter dans la console Firebase.

### Garantie en cas d'erreur

Si n'importe quelle étape échoue après la réservation, la fiche est **toujours**
remise en `afaire` :

1. libération normale (statut + métadonnées) ;
2. si elle échoue → repli sur le statut seul, qui a plus de chances d'aboutir ;
3. si les deux échouent → le robot l'écrit en rouge dans les logs et demande
   une intervention manuelle. Ce cas résiduel est couvert par un test.

Le statut `termine` n'est écrit sur aucun de ces chemins.

**Après le test : remettre `"dryRun": true`.**

---

## Arborescence

```
robot/
├── index.js              Orchestrateur
├── config.json           dryRun, autoTermine, limites
├── package.json
├── lib/
│   ├── guard.js          🔒 Garde-fou des écritures (point de passage unique)
│   ├── redact.js         Masquage et résumé anonymisé
│   ├── log.js            Journalisation sûre
│   ├── firebase.js       Connexion + authentification du compte robot
│   ├── detect.js         Requête indexée statut=afaire
│   ├── validate.js       Champs obligatoires et garde-fous métier
│   ├── claim.js          Réservation atomique (inactif)
│   ├── state.js          État /seoRobot (inactif)
│   ├── flow.js           🧷 Flux + filets de sécurité (pur, testable hors ligne)
│   ├── note.js           Composition du compte rendu (pur, testable hors ligne)
│   ├── report.js         Ajout du compte rendu (inactif)
│   └── analyse.js        Analyse SEO (stub)
└── scripts/
    ├── selftest.js       90 tests, sans dépendance ni réseau
    ├── fauxops.js        Faux magasin Firebase pour tester les échecs partiels
    └── scenarios/        Scénarios de mode actif (processus séparés)
```

Voir aussi [`HANDOFF-AUTOMATISATION-SEO.md`](../HANDOFF-AUTOMATISATION-SEO.md)
à la racine du dépôt.
