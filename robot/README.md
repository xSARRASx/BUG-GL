# Robot SEO — V1 (dry-run)

Robot de détection des fiches SEO à traiter, pour le projet
[Suivi SEO Guest Lucky](https://xsarrasx.github.io/BUG-GL/seo.html).

> ## 🔒 État actuel : DRY-RUN STRICT
>
> **Le robot ne modifie rien.** Il lit, vérifie, affiche un résumé anonymisé,
> et s'arrête. Aucune écriture Firebase n'est possible : `robot/config.json`
> est en `"dryRun": true`, et `lib/guard.js` bloque toute tentative d'écriture
> avant même que le SDK Firebase soit sollicité.
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
| `lib/claim.js` | Réservation atomique `afaire → encours` par transaction | inactif |
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

Il tourne aussi automatiquement toutes les 6 heures. Le cron GitHub est
*best effort* : un retard de 5 à 20 minutes est normal.

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

## Passer en mode actif (plus tard)

Ne pas faire avant d'avoir relu plusieurs exécutions en dry-run.

1. Créer le compte robot dans Firebase Console (et lui donner un `displayName`,
   par exemple « Robot SEO »).
2. Ajouter son UID aux règles `/seo` **et** créer les règles du nœud `/seoRobot`.
3. Passer `"dryRun": false` dans `robot/config.json`.
4. Retirer l'étape « Vérifier que le dry-run est bien actif » du workflow, qui
   refuse volontairement de s'exécuter si `dryRun` n'est plus à `true`.

`"autoTermine"` doit rester à `false`.

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
│   ├── report.js         Ajout du compte rendu (inactif)
│   └── analyse.js        Analyse SEO (stub)
└── scripts/
    └── selftest.js       19 tests hors ligne
```

Voir aussi [`HANDOFF-AUTOMATISATION-SEO.md`](../HANDOFF-AUTOMATISATION-SEO.md)
à la racine du dépôt.
