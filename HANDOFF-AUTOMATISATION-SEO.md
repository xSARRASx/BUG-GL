# HANDOFF TECHNIQUE — Automatisation du Suivi SEO

> Document de passation destiné à un agent externe (ChatGPT) qui doit automatiser le
> workflow SEO : Camille ajoute un site → l'agent récupère la fiche et les accès →
> fait le SEO → met à jour le statut et le compte rendu.
>
> **Ce document ne fait que décrire l'existant.** Aucun comportement de production n'a
> été modifié, aucune automatisation n'a été lancée, rien n'a été supprimé.
>
> ⚠️ **Aucun mot de passe, clé API, token ou URL de base de données n'est écrit ici.**
> Seuls les noms de variables et les emplacements des fichiers sont donnés.
> Voir la section 7 pour savoir où récupérer ces valeurs.

Dernière mise à jour : 2026-09-27

---

## 1. Repo, branche, commit

| | |
|---|---|
| **Repo** | `https://github.com/xSARRASx/BUG-GL` (propriétaire : `xSARRASx`) |
| **Branche de travail** | `claude/amazing-euler-U7YqQ` |
| **Commit au moment de la rédaction** | `71b3678` — *Retire le bouton Clients Web du menu principal* (2026-09-03) |

⚠️ **Il n'y a pas de branche `main` utilisée.** Tout le développement ET la production
vivent sur `claude/amazing-euler-U7YqQ`. Un push sur cette branche part directement en
production. Il n'y a ni environnement de préprod, ni PR, ni review.

### Commits pertinents pour le Suivi SEO

| Commit | Date | Objet |
|---|---|---|
| `71b3678` | 2026-09-03 | Retire le bouton « Clients Web » du menu |
| `2b417d5` | 2026-08-28 | Tarif SEO remis à 50 €/site terminé |
| `2ddce3e` | 2026-08-11 | **Ajout des champs obligatoires** (zone, prestation, téléphone, adresse, réseaux, compte Google) + case « Rien à remplir » |
| `0b1df5b` | 2026-07-23 | Tarif SEO passé 50 € → 40 € (annulé depuis par `2b417d5`) |

Le commit le plus important à comprendre est **`2ddce3e`** : il introduit le mécanisme
des champs obligatoires et des drapeaux `*Na` décrits en section 4.

---

## 2. Fichiers qui font fonctionner `seo.html`

La page SEO ne charge que **3 fichiers** en plus des polices Google :

| Fichier | Rôle | Taille indicative |
|---|---|---|
| `seo.html` | Structure HTML + CSS spécifique à la page (bloc `<style>` en tête) | ~490 lignes |
| `js/firebase-config.js` | Objet de configuration Firebase (`window.firebaseConfig`) + drapeau `window.firebaseActive` | ~26 lignes |
| `js/seo.js` | **Toute la logique** : store, rendu, formulaire, validation, auth, revenus | ~735 lignes |
| `css/style.css` | Feuille de style commune à toutes les pages du site | partagée |

Chargement, en bas de `seo.html` :

```html
<script src="js/firebase-config.js?v=22"></script>
<script src="js/seo.js?v=22"></script>
```

**Points importants :**

- `js/seo.js` est un **script classique (IIFE)**, pas un module ES. Tout est encapsulé
  dans `(function () { ... })()`. Ce choix est volontaire : il permet d'ouvrir la page
  en `file://` (double-clic) sans serveur.
- Le SDK Firebase est chargé **dynamiquement** via `await import(...)` depuis
  `https://www.gstatic.com/firebasejs/10.12.2/` uniquement si `window.firebaseActive`
  est vrai (voir `initStore()`, `js/seo.js` ~ligne 82).
- Le `?v=22` est un **cache-buster manuel**. Il doit être incrémenté à chaque
  modification de `seo.js` ou `style.css`, sinon GitHub Pages / le navigateur servent
  l'ancienne version. C'est une source récurrente de « ça n'a pas changé ».
- `seo.html` **ne charge ni `js/app.js`, ni `js/email-config.js`**. La page SEO
  n'envoie donc **aucun e-mail** (contrairement à la page bugs `index.html`).

### Fichiers NON impliqués dans le Suivi SEO

`index.html` + `js/app.js` (suivi des bugs), `blog.html` + `js/blog.js` (suivi blog),
`clients.html` + `js/clients.js` (suivi clients web de Camille),
`js/email-config.js` (EmailJS, utilisé uniquement par la page bugs).

---

## 3. Stack technique

| Couche | Technologie |
|---|---|
| **Frontend** | HTML5 + CSS3 + JavaScript vanilla (ES2020, IIFE). **Aucun framework**, aucun build, aucun bundler, aucun `package.json`, aucune dépendance npm. |
| **Backend** | ❌ **Aucun.** Il n'y a pas de serveur applicatif, pas d'API maison, pas de fonctions cloud. Le navigateur parle directement à Firebase. |
| **Base de données** | **Firebase Realtime Database** (pas Firestore), région `europe-west1`. |
| **SDK** | Firebase JS SDK **v10.12.2**, modules `firebase-app.js` et `firebase-database.js`, chargés par import dynamique depuis le CDN gstatic. |
| **Hébergement** | **GitHub Pages**, servi depuis la branche `claude/amazing-euler-U7YqQ` du repo `xSARRASx/BUG-GL`. |
| **Authentification** | ❌ **Aucune authentification Firebase.** Voir section 8. |
| **CI / CD** | ❌ Aucun workflow GitHub Actions. Le déploiement est le push lui-même. |

### Conséquence majeure pour l'automatisation

Puisqu'il n'y a **pas de backend**, il n'existe **aucun endpoint applicatif** à appeler.
Un agent externe doit parler **directement à la Realtime Database**, soit :

- via l'**API REST** de Firebase RTDB (le plus simple pour un agent) — section 6 ;
- soit via le **SDK Firebase Admin** (Node/Python) avec un compte de service — recommandé,
  section 13.

---

## 4. Stockage et schéma des fiches SEO

### Emplacement réel

Toutes les fiches SEO vivent dans **un seul nœud** de la Realtime Database :

```
/seo/{pushId}
```

- `{pushId}` est une clé générée par `push()` de Firebase (format `-OXxxxxxxxxxxxxxxxxx`,
  triable chronologiquement).
- Le champ `id` **à l'intérieur** de l'objet duplique cette clé (`set(r, { ...item, id: r.key })`,
  `js/seo.js` ~ligne 61). Les deux doivent rester cohérents.
- Il n'y a **ni sous-collection, ni index, ni jointure**. Tout est plat.

Autres nœuds de la même base, **à ne pas toucher** pour ce projet :
`/bugs`, `/archive`, `/presence`, `/meta`, `/blog`, `/clients`.

### Schéma complet des champs

#### Identité et métadonnées

| Champ | Type | Écrit par | Notes |
|---|---|---|---|
| `id` | string | app | Copie de la clé Firebase |
| `createdAt` | number (ms epoch) | app | À la création seulement |
| `createdBy` | string | app | Nom affiché (`"Camille Fauveau"`…) |
| `updatedAt` | number (ms epoch) | app | À chaque `update` |
| `updatedBy` | string | app | Nom affiché |
| `termineAt` | number \| null | app | **Horodatage du passage en `termine`**. Mis à `null` dès que le statut repasse à autre chose. Sert **au calcul des revenus** — voir section 11. |

#### Champs principaux

| Champ | Type | Valeurs | Obligatoire |
|---|---|---|---|
| `nom` | string | Nom du client | ✅ oui (bloquant) |
| `ville` | string | Ville | ✅ oui (bloquant, `alert()`) |
| `url` | string | URL du site | non |
| `email` | string | E-mail du client | non |
| `statut` | enum | `afaire` \| `encours` \| `termine` | ✅ (défaut `afaire`) |
| `activite` | enum | `conciergerie` \| `sous_location` \| `les_deux` | ✅ (défaut `conciergerie`) |
| `carte` | enum | `oui` \| `non` | ✅ (défaut `non`) — **Carte G**, détermine le vocabulaire Loi Hoguet |
| `note` | string | Note libre / **compte rendu** | non |

#### Accès au site (⚠️ voir section 7)

| Champ | Type | Contenu |
|---|---|---|
| `adminUrl` | string | Lien wp-admin |
| `login` | string | Identifiant WordPress |
| `pass` | string | **Mot de passe WordPress en clair** |
| `gmb` | string | Lien Google My Business |
| `drive` | string | Lien Drive / fichiers en ligne |

#### Champs obligatoires avec drapeau « Rien à remplir » (commit `2ddce3e`)

Sept champs fonctionnent par **paire** : une valeur + un booléen `…Na`.

| Champ valeur | Drapeau | Signification du drapeau |
|---|---|---|
| `zone` | `zoneNa` | **⚠️ Zone à confirmer avec le client** (libellé différent des autres) |
| `prestation` | `prestationNa` | Rien à remplir |
| `phone` | `phoneNa` | Rien à remplir |
| `adresse` | `adresseNa` | Rien à remplir |
| `facebook` | `facebookNa` | Rien à remplir |
| `instagram` | `instagramNa` | Rien à remplir |
| `google` | `googleNa` | Rien à remplir |

**Règle de validation (`submitForm`, `js/seo.js` ~ligne 500) :**
pour chaque paire, il faut **soit une valeur non vide, soit `…Na === true`**.
Sinon l'enregistrement est bloqué avec la liste des manques.

`prestation` est une énumération : `seo_complet` | `seo_local` | `""`.

- `seo_complet` = tout à faire (ex. Yoast même pas installé)
- `seo_local` = SEO local uniquement, base déjà faite

**Interprétation pour l'agent :** `zoneNa === true` signifie **« la zone n'est pas
confirmée »**, donc **le SEO local ne doit pas être lancé** — c'est le piège n°1
identifié par Camille (cas Valse de Lin, Les Clefs du Rivage).

#### Fichiers joints

| Champ | Type |
|---|---|
| `files` | objet `{ [fileId]: { id, name, type, data } }` |

`data` est une **data-URL base64 complète** (`data:application/pdf;base64,...`), stockée
**directement dans la base**. Il n'y a pas de Firebase Storage. Avertissement à 3 Mo,
mais aucun blocage dur. Voir les limites en section 11.

---

## 5. Fonctionnement du temps réel

Il n'y a **ni WebSocket maison, ni polling, ni webhook**. Tout repose sur le listener
natif de Firebase RTDB :

```js
// js/seo.js, classe FirebaseStore
subscribe(cb) {
  const { ref, onValue } = this.fns;
  onValue(ref(this.db, "seo"), (snap) => cb(snap.val() || {}));
}
```

- `onValue` ouvre une connexion WebSocket persistante vers Firebase.
- **À chaque écriture, par n'importe qui**, Firebase renvoie **l'intégralité du nœud
  `/seo`** à tous les clients connectés, et `render()` redessine toute la liste.
- Martin et Camille voient donc les mêmes données en quelques centaines de ms, sans
  rafraîchir la page.
- Le bandeau vert « 🟢 Connecté en temps réel » confirme que le listener est actif.

**Mode dégradé :** si Firebase est injoignable ou non configuré, `initStore()` bascule
sur une classe `LocalStore` qui écrit dans `localStorage` (clé `seo_data`). Les données
ne sont alors **plus partagées** et le bandeau devient jaune ou rouge. C'est silencieux —
l'utilisateur peut travailler sans s'apercevoir que rien n'est synchronisé.

**Conséquence pour l'agent :** toute écriture faite par un agent externe sur `/seo`
apparaîtra **instantanément** chez Camille et Martin. Il n'y a aucun mécanisme de
brouillon, de validation ou d'annulation.

---

## 6. « API » disponible — lecture et écriture

⚠️ Rappel : **il n'y a pas d'API applicative.** Les fonctions ci-dessous sont les
méthodes JS internes de la page. Un agent externe doit passer par l'API REST de
Firebase RTDB ou par le SDK Admin.

Dans les exemples, `<DATABASE_URL>` désigne la valeur de `databaseURL` définie dans
`js/firebase-config.js` (voir section 7 pour la récupérer — elle n'est pas écrite ici).

### 6.1 Lire la liste des sites

**Dans l'app :** `store.subscribe(cb)` → `onValue(ref(db, "seo"))`

**En REST :**
```http
GET <DATABASE_URL>/seo.json
```
Retourne un objet `{ pushId: fiche, ... }` (pas un tableau).

Lister uniquement les clés (léger) :
```http
GET <DATABASE_URL>/seo.json?shallow=true
```

### 6.2 Lire une fiche complète

**Dans l'app :** `sites[id]` (cache mémoire alimenté par le listener)

**En REST :**
```http
GET <DATABASE_URL>/seo/<pushId>.json
```

### 6.3 Créer une fiche

**Dans l'app :** `store.add(item)` →
```js
const r = push(ref(this.db, "seo"));
set(r, { ...item, id: r.key });
```

**En REST :**
```http
POST <DATABASE_URL>/seo.json
Content-Type: application/json

{ "nom": "...", "ville": "...", "statut": "afaire", ... }
```
La réponse renvoie `{"name": "-OXxxxx"}`. ⚠️ **Il faut ensuite écrire ce `name` dans le
champ `id`** pour rester cohérent avec l'app :
```http
PATCH <DATABASE_URL>/seo/-OXxxxx.json
{ "id": "-OXxxxx" }
```

### 6.4 Modifier une fiche

**Dans l'app :** `store.update(id, patch)` → `update(ref(db, "seo/" + id), patch)`
(fusion partielle, pas un remplacement)

**En REST :**
```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "note": "...", "updatedAt": 1774000000000, "updatedBy": "ChatGPT" }
```

⚠️ Ne **jamais** utiliser `PUT` : cela remplace toute la fiche et efface les champs
non fournis (dont les accès WordPress et les fichiers).

### 6.5 Changer le statut

La logique exacte de l'app (`js/seo.js` ~ligne 660) est :

```js
const wasTermine = sites[id] && sites[id].statut === "termine";
const patch = { statut: nouveau, updatedAt: Date.now(), updatedBy: me };
if (nouveau === "termine" && !wasTermine) patch.termineAt = Date.now();
if (nouveau !== "termine")                patch.termineAt = null;
store.update(id, patch);
```

**Un agent DOIT reproduire cette logique à l'identique**, sinon le calcul des revenus
(50 €/site terminé) sera faux.

`afaire` → `encours` :
```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "statut": "encours", "termineAt": null, "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

`encours` → `termine` :
```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "statut": "termine", "termineAt": <ms>, "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

### 6.6 Ajouter / modifier notes et comptes rendus

Il n'existe **qu'un seul champ de texte libre : `note`** (string). Il n'y a pas
d'historique, pas de fil de commentaires, pas de champ « compte rendu » séparé.

```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "note": "<texte complet, ancien + nouveau>", "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

⚠️ **`note` est remplacé en entier.** Pour ajouter sans écraser le travail de Camille,
il faut **lire la valeur actuelle, concaténer, puis écrire**. Recommandation : préfixer
l'ajout, par exemple :

```
--- Compte rendu ChatGPT — 2026-09-27 ---
...
```

### 6.7 Supprimer

**Dans l'app :** `store.remove(id)` (bouton Supprimer, avec `confirm()`)
**En REST :** `DELETE <DATABASE_URL>/seo/<pushId>.json`

🚫 **À ne pas automatiser.** Aucune corbeille n'existe pour `/seo` (contrairement aux
bugs qui ont `/archive`). Une suppression est définitive et irrécupérable.

---

## 7. Accès WordPress des clients — stockage et protection

### État réel

Les identifiants WordPress sont stockés **en clair, non chiffrés**, dans les champs
`adminUrl`, `login` et `pass` de chaque fiche, dans la Realtime Database.

L'interface propose un bouton « 📋 Copier » à côté de chaque identifiant
(`js/seo.js` ~ligne 637, `navigator.clipboard.writeText`).

### 🔴 Niveau de protection réel : AUCUN

C'est le point le plus important de ce document.

`firebase-rules.json` :
```json
"seo": { ".read": true, ".write": true }
```

Cela signifie que **n'importe qui sur Internet**, connaissant l'URL de la base, peut
**lire et écrire** toutes les fiches — y compris tous les mots de passe WordPress —
**sans aucune authentification**.

Et cette URL **est publique** : le fichier `js/firebase-config.js` est commité dans le
repo et servi en clair par GitHub Pages. Toute personne qui ouvre le code source de
`seo.html` l'obtient en deux clics.

### ❌ Il n'y a AUCUNE variable d'environnement

Le projet n'a ni `.env`, ni `.env.example`, ni secrets GitHub Actions, ni configuration
serveur. **Tout est en dur dans le code commité** :

| Donnée | Emplacement | Statut |
|---|---|---|
| `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` | `js/firebase-config.js` (objet `window.firebaseConfig`) | **en dur, public** |
| Mots de passe d'accès aux pages | `js/seo.js`, constante `SEO_PASSWORDS` | **en dur, public** |
| Mots de passe WordPress clients | Firebase RTDB, champ `pass` | **en clair, lisible par tous** |

**Pour récupérer les valeurs** (à ne jamais coller dans un chat ni dans un document) :
ouvrir `js/firebase-config.js` dans le repo, ou la console Firebase du projet
(Paramètres du projet → Vos applications).

### Recommandations (non appliquées — rien n'a été modifié)

1. **Priorité absolue** : restreindre les règles Firebase et n'autoriser l'écriture
   qu'à des utilisateurs authentifiés (Firebase Auth).
2. Ne plus stocker les mots de passe WordPress dans la base. Utiliser un gestionnaire
   dédié (Bitwarden, 1Password) et ne garder dans la fiche qu'une référence.
3. Considérer **tous les mots de passe WordPress actuellement en base comme
   compromis** et les faire tourner.
4. Pour l'agent : utiliser un **compte de service Firebase Admin** dont la clé JSON est
   stockée hors du repo, dans une variable d'environnement (nom suggéré :
   `FIREBASE_SERVICE_ACCOUNT_JSON`) — et non la config publique.

---

## 8. Authentification et rôles Martin / Camille

### Mécanisme réel

```js
// js/seo.js, lignes 18-19
const SEO_EDITORS   = ["Martin Moré", "Camille Fauveau", "Sébastien Moré", "Pierre Moré"];
const SEO_PASSWORDS = { /* 4 paires nom → mot de passe, EN CLAIR */ };
```

Déroulé :
1. L'utilisateur clique sur son nom dans une modale.
2. Un champ mot de passe apparaît.
3. `tryPassword()` compare la saisie à `SEO_PASSWORDS[nom]` — **comparaison en clair,
   côté navigateur**.
4. Si OK, le nom est écrit dans `localStorage` (clé `seo_user`) et l'app s'affiche.
5. Au rechargement, si `localStorage.seo_user` est dans `SEO_EDITORS`, **l'accès est
   redonné sans redemander le mot de passe**.

### 🔴 Ce n'est PAS de la sécurité

- Les mots de passe sont **dans le code source JavaScript public**.
- La vérification est **100 % côté client** : `localStorage.setItem("seo_user", "Martin Moré")`
  dans la console du navigateur suffit à entrer.
- Surtout : **cette porte ne protège rien**. Les données sont accessibles directement
  via l'API REST Firebase sans jamais passer par la page.

C'est un **garde-fou d'affichage** (éviter qu'un collègue ouvre la mauvaise page),
pas un contrôle d'accès.

### Rôles

Il n'y a **aucune notion de rôle** dans le code de la page SEO. Les 4 personnes
autorisées ont **exactement les mêmes droits** : lire, créer, modifier, supprimer.

| Personne | Accès page SEO | Droits |
|---|---|---|
| Martin Moré | ✅ | tous |
| Camille Fauveau | ✅ | tous |
| Sébastien Moré | ✅ | tous |
| Pierre Moré | ✅ | tous |

Le seul champ qui trace « qui a fait quoi » est `updatedBy` / `createdBy` — **purement
déclaratif**, non vérifié.

Pour l'agent : écrire `"ChatGPT"` (ou `"ChatGPT — SEO auto"`) dans `updatedBy` afin que
Camille distingue les modifications automatiques des siennes.

---

## 9. Déploiement et URL de production

### URLs

| Page | URL |
|---|---|
| **Suivi SEO (production)** | `https://xsarrasx.github.io/BUG-GL/seo.html` |
| Suivi des bugs | `https://xsarrasx.github.io/BUG-GL/index.html` |
| Suivi blog | `https://xsarrasx.github.io/BUG-GL/blog.html` |
| Suivi clients web | `https://xsarrasx.github.io/BUG-GL/clients.html` (plus lié dans le menu) |

### Procédure

```bash
git fetch origin claude/amazing-euler-U7YqQ
git reset --hard origin/claude/amazing-euler-U7YqQ   # repartir du réel
# ... modifications ...
# incrémenter le ?v=N dans seo.html si seo.js ou style.css a changé
git add -A
git commit -m "..."
git push -u origin claude/amazing-euler-U7YqQ
```

**C'est tout.** Le push déclenche la publication GitHub Pages (1 à 2 minutes). Il n'y a
ni build, ni test, ni Action, ni étape de validation.

### Pièges connus

- **Le cache-buster `?v=N`** : si on modifie `js/seo.js` sans incrémenter le `?v=` dans
  `seo.html`, les navigateurs servent l'ancien fichier. Symptôme classique : « ta
  modification n'est pas passée ».
- **`seo.html` lui-même est mis en cache** par le navigateur et n'a pas de cache-buster.
  Un rechargement forcé (`Ctrl/⌘ + Maj + R`) est parfois nécessaire.
- Le conteneur de développement est éphémère : **toujours** `git fetch` + `git reset --hard`
  avant d'éditer, sinon on travaille sur une copie obsolète et le push est rejeté.
- **À confirmer** : le réglage exact GitHub Pages (Settings → Pages) n'a pas pu être
  vérifié depuis l'environnement de rédaction. Le comportement observé est que la
  branche `claude/amazing-euler-U7YqQ` est bien la source publiée.

---

## 10. Webhooks, cron, automatisations, services externes

### Automatisations existantes sur la page SEO

**Aucune.** Ni webhook, ni cron, ni tâche planifiée, ni GitHub Action, ni fonction cloud.
Tout est déclenché par une action humaine dans le navigateur.

### Services externes appelés par `seo.html`

| Service | Usage | Authentification |
|---|---|---|
| Firebase Realtime Database | stockage + temps réel | ❌ aucune (règles publiques) |
| `gstatic.com` | CDN du SDK Firebase v10.12.2 | — |
| `fonts.googleapis.com` | police Inter | — |
| GitHub Pages | hébergement statique | — |

### À savoir (hors page SEO)

- **EmailJS** est utilisé, mais **uniquement par la page bugs** (`index.html` →
  `js/email-config.js` + `js/app.js`). Un e-mail part quand un bug passe en « traité »,
  vers le créateur du bug. **La page SEO n'envoie aucun e-mail.**
- **Auto-archivage** : mécanisme existant uniquement pour les bugs (`/archive`, 7 jours).
  Il n'y a **pas d'équivalent pour le SEO** — les fiches terminées restent indéfiniment.

---

## 11. Limites, bugs connus et points de sécurité

### 🔴 Sécurité (critique)

| # | Problème | Impact |
|---|---|---|
| S1 | **Règles Firebase `.read`/`.write` = `true` sur `/seo`** | Lecture et écriture publiques sans authentification, sur tout Internet |
| S2 | **Mots de passe WordPress clients en clair** dans la base | Compromission directe des sites clients |
| S3 | **Config Firebase en dur dans le repo public** | L'URL de la base est trivialement récupérable |
| S4 | **Mots de passe d'accès aux pages en dur dans `js/seo.js`** | Lisibles dans le code source |
| S5 | **Auth 100 % côté client** | Contournable via la console, et inutile puisque l'API REST est ouverte |

S1 + S2 combinés constituent une **fuite de données clients réelle et exploitable
aujourd'hui**. C'est à traiter avant toute automatisation.

### 🟠 Limites techniques

| # | Limite | Conséquence |
|---|---|---|
| L1 | **Fichiers en base64 dans la base** | Une fiche avec pièces jointes peut peser plusieurs Mo. `onValue` recharge **tout `/seo`** à chaque écriture → ralentissement croissant. |
| L2 | **Pas de pagination** | Tout `/seo` est chargé en mémoire à chaque modification. |
| L3 | **Dernier qui écrit gagne** | Si Camille et l'agent modifient la même fiche en même temps, une des deux versions est perdue sans avertissement. |
| L4 | **`note` est un champ unique remplacé en entier** | Risque d'écraser le compte rendu de Camille. Toujours lire → concaténer → écrire. |
| L5 | **Pas de corbeille pour `/seo`** | Une suppression est définitive. |
| L6 | **Pas d'historique / audit** | Seuls `updatedAt` et `updatedBy` existent, écrasés à chaque modification. |
| L7 | **Basculement silencieux en mode local** | Si Firebase est injoignable, l'app écrit dans `localStorage` sans alerte bloquante. Travail perdu pour les autres. |
| L8 | **Cohérence `id` / clé Firebase** | Une création REST mal faite (sans réécrire `id`) casse les boutons Voir/Modifier de l'interface. |
| L9 | **Cache-buster manuel** | Oubli fréquent → déploiement invisible. |

### 🟡 Comportements à connaître

- `termineAt` est **remis à `null`** dès qu'une fiche quitte le statut `termine`.
  Un aller-retour `termine` → `encours` → `termine` **réinitialise la date**, ce qui
  déplace le revenu d'un mois à l'autre.
- Le calcul des revenus (50 €/site terminé) utilise
  `termineAt || updatedAt || createdAt` — donc une fiche `termine` sans `termineAt`
  retombe sur `updatedAt`, ce qui peut fausser le mois.
- La validation de `ville` et `nom` est **uniquement côté formulaire**. Une écriture
  REST peut créer une fiche sans `nom` ni `ville` — l'app l'affichera vide.
- Le contrôle « compte Google doit être un Gmail » est un simple `confirm()`
  **non bloquant** (cas Léandro en Outlook).

---

## 12. Exemple de fiche SEO complète (fictive)

⚠️ **Données entièrement inventées.** Aucun client réel, aucun identifiant réel.

```json
{
  "-OZexempleFictif001": {
    "id": "-OZexempleFictif001",

    "nom": "Mme Exemple — Conciergerie Démo",
    "url": "https://exemple-demo.fr",
    "ville": "Ville-Exemple",
    "email": "contact@exemple-demo.fr",

    "statut": "encours",
    "activite": "les_deux",
    "carte": "non",

    "zone": "Ville-Exemple (principale) — Commune-A, Commune-B, Commune-C",
    "zoneNa": false,
    "prestation": "seo_complet",
    "prestationNa": false,
    "phone": "00 00 00 00 00",
    "phoneNa": false,
    "adresse": "1 rue de l'Exemple, 00000 Ville-Exemple",
    "adresseNa": false,
    "facebook": "https://www.facebook.com/exemple-demo",
    "facebookNa": false,
    "instagram": "",
    "instagramNa": true,
    "google": "exemple.demo@gmail.com",
    "googleNa": false,

    "adminUrl": "https://exemple-demo.fr/wp-admin",
    "login": "utilisateur-demo",
    "pass": "REMPLACE_PAR_LA_VRAIE_VALEUR",
    "gmb": "https://maps.google.com/?cid=000000000000000000",
    "drive": "https://drive.google.com/drive/folders/EXEMPLE",

    "note": "Client sans Carte G → vocabulaire Loi Hoguet obligatoire : jamais 'gestion' / 'gestionnaire' / 'gestion locative'. Autorisé : conciergerie, location courte durée, location saisonnière, sous-location.\n\n--- Compte rendu ChatGPT — 2026-09-27 ---\nYoast installé et configuré. Titres et meta-descriptions rédigés sur les 6 pages. Schema LocalBusiness ajouté avec NAP. Reste : photos réelles et fiche Google Business côté client.",

    "files": {
      "exfile001": {
        "id": "exfile001",
        "name": "brief-client-exemple.pdf",
        "type": "application/pdf",
        "data": "data:application/pdf;base64,JVBERi0xLjQKJSVFT0Y="
      }
    },

    "createdAt": 1774000000000,
    "createdBy": "Camille Fauveau",
    "updatedAt": 1774600000000,
    "updatedBy": "ChatGPT",
    "termineAt": null
  }
}
```

**Notes sur cet exemple :**
- `instagramNa: true` avec `instagram: ""` → cas « Rien à remplir » coché.
- `termineAt: null` car `statut` vaut `encours`.
- Le champ `pass` est un **placeholder** — jamais de vraie valeur dans un document.
- `data` est tronqué : une vraie pièce jointe fait des centaines de Ko.

---

## 13. Workflow recommandé pour l'agent

> Rien de ce qui suit n'a été implémenté. Ce sont des recommandations.

### 13.1 Prérequis — à faire AVANT toute automatisation

1. **Corriger les règles Firebase** (section 7). Tant que `/seo` est en écriture
   publique, ajouter un agent automatique augmente la surface de risque.
2. **Créer un compte de service Firebase Admin** dédié à l'agent (console Firebase →
   Paramètres → Comptes de service → Générer une clé privée). Stocker le JSON dans une
   variable d'environnement côté agent — nom suggéré `FIREBASE_SERVICE_ACCOUNT_JSON` —
   **jamais dans le repo**.
3. **Prévenir Camille** que `updatedBy: "ChatGPT"` signalera les écritures automatiques.

### 13.2 Boucle de travail

#### Étape 1 — Détecter un nouveau site `À faire`

**Méthode recommandée (push, pas de polling) :** un listener `child_changed` /
`child_added` sur `/seo` via le SDK Admin, filtrant `statut === "afaire"`.

**Méthode simple (polling REST)**, toutes les 5-10 minutes :
```http
GET <DATABASE_URL>/seo.json?orderBy="statut"&equalTo="afaire"
```
> ⚠️ Cette requête nécessite un index. À ajouter dans les règles :
> `"seo": { ".indexOn": ["statut"] }`. **Non présent aujourd'hui** — sans lui, il faut
> faire un `GET /seo.json` complet et filtrer côté agent.

**Garde-fous avant de traiter une fiche :**

| Condition | Action |
|---|---|
| `zoneNa === true` ou `zone` vide | ❌ **Ne pas traiter.** La zone n'est pas confirmée → tout le SEO local serait à refaire. Signaler à Camille. |
| `carte === "non"` | ⚠️ Vocabulaire Loi Hoguet obligatoire : bannir *gestion / gestionnaire / gestion locative*. Utiliser *conciergerie, location courte durée, location saisonnière, sous-location*. |
| `prestation === "seo_local"` | Base déjà faite → SEO local uniquement. |
| `prestation === "seo_complet"` | Tout à faire (Yoast, titres, meta, schema…). |
| `adminUrl` / `login` / `pass` vides | ❌ Pas d'accès → demander à Camille avant de commencer. |
| `googleNa === true` ou `google` sans `@gmail.com` | ⚠️ Transfert de propriété Google impossible. Signaler. |

#### Étape 2 — Récupérer la fiche

```http
GET <DATABASE_URL>/seo/<pushId>.json
```
Conserver localement `note` et `updatedAt` (utile pour l'étape 5).

#### Étape 3 — Passer en `En cours` (verrou implicite)

```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "statut": "encours", "termineAt": null,
  "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

⚠️ **Faire ce passage immédiatement**, avant de travailler. C'est le seul signal visible
par Camille indiquant que la fiche est prise en charge. Il n'existe pas de vrai verrou
(voir L3).

**Anti-collision recommandé** : relire la fiche juste avant d'écrire et vérifier que
`statut` vaut toujours `afaire` et que `updatedAt` n'a pas bougé. Sinon, abandonner —
quelqu'un d'autre est dessus.

#### Étape 4 — Travailler

Hors périmètre de ce document (WordPress, Yoast, schema, GMB…).

#### Étape 5 — Enregistrer le compte rendu

**Toujours lire avant d'écrire**, `note` étant remplacé en entier :

```
1. GET  /seo/<pushId>.json        → récupérer note_actuelle
2. note_finale = note_actuelle + "\n\n--- Compte rendu ChatGPT — <date> ---\n" + rapport
3. PATCH /seo/<pushId>.json  { "note": note_finale, "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

#### Étape 6 — Passer en `Terminé`

```http
PATCH <DATABASE_URL>/seo/<pushId>.json
{ "statut": "termine", "termineAt": <ms>,
  "updatedAt": <ms>, "updatedBy": "ChatGPT" }
```

⚠️ `termineAt` doit être renseigné **au moment du passage en `termine`** et jamais
réécrit ensuite : il pilote le calcul des revenus (50 €/site terminé) de Martin.

### 13.3 Évolutions à envisager (aucune n'a été faite)

Ces changements toucheraient la production et n'ont donc **pas** été implémentés :

1. **Statut de verrou explicite** : un champ `lockedBy` + `lockedAt` pour éviter
   qu'agent et humain travaillent sur la même fiche.
2. **Historique des comptes rendus** : remplacer `note` (string) par
   `comptesRendus: { [id]: { date, auteur, texte } }` — élimine le risque L4.
3. **Index Firebase** : `".indexOn": ["statut"]` sur `/seo` pour permettre les requêtes
   filtrées.
4. **Pièces jointes dans Firebase Storage** plutôt qu'en base64 (résout L1 et L2).
5. **Statut intermédiaire** `en_revue` : l'agent finit son travail, Camille valide avant
   passage en `termine`.

---

## Résumé pour démarrer vite

| Question | Réponse |
|---|---|
| Où sont les fiches ? | Firebase RTDB, nœud `/seo/{pushId}` |
| Comment lire ? | `GET <DATABASE_URL>/seo.json` |
| Comment écrire ? | `PATCH <DATABASE_URL>/seo/<pushId>.json` (jamais `PUT`) |
| Statuts | `afaire` / `encours` / `termine` |
| Compte rendu | champ `note` (unique, remplacé en entier → lire-concaténer-écrire) |
| Auth | aucune côté base — **règles publiques** |
| Blocage n°1 | `zoneNa === true` → zone non confirmée, ne pas traiter |
| Risque n°1 | mots de passe WordPress en clair, base ouverte à tous |
