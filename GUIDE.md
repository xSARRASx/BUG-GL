# 📘 Guide complet — pour débutant total

Salut Martin ! Ce guide est écrit pour quelqu'un qui **n'y connaît rien**.
On y va doucement, étape par étape. Prends ton temps. ☕

Il y a **3 grandes parties** :

1. **Tester la page tout de suite** (mode local, juste pour voir)
2. **Mettre la page en ligne** pour qu'elle ait un lien (GitHub Pages)
3. **Activer le partage en temps réel** (Firebase) → c'est ça qui permet à ton père et Camille de modifier et que tu voies en direct

---

## 🟢 Partie 1 — Voir la page tout de suite (sans rien installer)

1. Sur la page GitHub de ton projet, télécharge le dossier (bouton vert **« Code »** → **« Download ZIP »**).
2. Ouvre le ZIP, puis double-clique sur le fichier **`index.html`**.
3. Ça s'ouvre dans ton navigateur (Chrome, Safari…). 🎉

👉 À ce stade, **les données restent sur ton ordi**. Ton père ne les verra pas
encore. C'est normal, c'est juste pour voir à quoi ça ressemble. Un petit
bandeau orange te le rappelle en haut.

---

## 🌍 Partie 2 — Mettre la page en ligne (avoir un vrai lien)

On va utiliser **GitHub Pages**, c'est gratuit et inclus dans GitHub.

1. Va sur la page de ton projet sur **github.com**.
2. Clique sur l'onglet **« Settings »** (Réglages), en haut.
3. Dans le menu de gauche, clique sur **« Pages »**.
4. Sous **« Branch »**, choisis la branche `claude/amazing-euler-U7YqQ`
   (ou `main` si tu as fusionné), dossier **`/ (root)`**, puis **Save**.
5. Attends 1-2 minutes, recharge la page. GitHub t'affiche un lien du style :
   `https://TON-NOM.github.io/bug-gl/`
6. **C'est ce lien que tu envoies à ton père et Camille !** 📩

⚠️ Mais attention : à cette étape, le partage temps réel n'est **pas encore**
actif. Chacun verrait ses propres données. Pour le vrai partage, fais la Partie 3.

---

## 🔥 Partie 3 — Activer le partage en temps réel (Firebase)

C'est LA partie qui rend le truc magique : ton père coche « traité », et toi tu
le vois apparaître en direct. C'est gratuit. Compte ~10 minutes.

### Étape A — Créer le projet Firebase

1. Va sur **https://console.firebase.google.com** et connecte-toi avec un
   compte Google (Gmail). *(Tu peux utiliser le tien : martinmorebkk@gmail.com)*
2. Clique sur **« Créer un projet »**.
3. Donne un nom, par ex. **`guestlucky-bugs`**. Clique **Continuer**.
4. On te propose Google Analytics → tu peux **désactiver**, ce n'est pas utile ici. **Créer le projet**.
5. Attends quelques secondes → **Continuer**.

### Étape B — Créer la base de données temps réel

1. Dans le menu de gauche, clique sur **« Création »** puis **« Realtime Database »**.
   *(ATTENTION : bien « Realtime Database », PAS « Firestore ».)*
2. Clique **« Créer une base de données »**.
3. Choisis un emplacement (par ex. *Belgium / Europe*). **Suivant**.
4. On te demande les règles de sécurité → choisis **« Démarrer en mode test »**. **Activer**.
   *(On mettra de vraies règles à l'étape E.)*

### Étape C — Récupérer ta « config » (les clés à coller)

1. Clique sur la petite **roue dentée ⚙️** (en haut à gauche) → **« Paramètres du projet »**.
2. Descends jusqu'à **« Vos applications »** et clique sur l'icône **`</>`** (Web).
3. Donne un surnom (ex. `page-bugs`) puis **« Enregistrer l'application »**.
4. Firebase affiche un bloc de code avec `const firebaseConfig = { ... }`.
   **C'est ce qu'il nous faut !** Il ressemble à ça :

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy....",
     authDomain: "guestlucky-bugs.firebaseapp.com",
     databaseURL: "https://guestlucky-bugs-default-rtdb.europe-west1.firebasedatabase.app",
     projectId: "guestlucky-bugs",
     storageBucket: "guestlucky-bugs.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef..."
   };
   ```

   ⚠️ Si tu ne vois PAS la ligne `databaseURL`, retourne dans Realtime Database :
   l'adresse en haut (commençant par `https://...firebasedatabase.app`) **est**
   ta `databaseURL`, recopie-la.

### Étape D — Coller la config dans notre fichier

1. Dans ton projet, ouvre le fichier **`js/firebase-config.js`**.
   *(Sur github.com : clique le fichier → l'icône crayon ✏️ pour éditer.)*
2. Remplace chaque `"COLLE_ICI"` par la **vraie valeur** de Firebase.
   Recopie exactement, en gardant les guillemets `"..."`.
3. Enregistre (sur GitHub : **« Commit changes »**).

✅ Dès que les 7 valeurs sont remplies, la page passe **automatiquement** en
mode temps réel (bandeau vert en haut).

### Étape E — Sécuriser la base (important !)

Par défaut le « mode test » se bloque au bout de 30 jours. On met de vraies règles :

1. Retourne dans **Realtime Database** → onglet **« Règles »**.
2. Remplace tout par le contenu du fichier **`firebase-rules.json`** (dans ce projet).
3. **Publier**.

Ces règles autorisent la lecture/écriture pour ta petite équipe sans bloquer.
*(Si tu veux plus tard restreindre par mot de passe / compte, dis-le moi, on ajoutera ça.)*

---

## ✅ C'est fini !

- Envoie le lien GitHub Pages à ton père et Camille.
- Chacun ouvre le lien, choisit son nom, et hop : tout est partagé en direct. 🥳
- Quand quelqu'un coche « traité », tout le monde le voit en quelques secondes.

---

## 🆘 Questions fréquentes

**« Le bandeau reste orange / mode local »**
→ Une des 7 valeurs n'est pas bien collée. Revérifie l'étape D (pas d'espace, garde les guillemets).

**« Erreur de connexion Firebase »**
→ Vérifie surtout la ligne `databaseURL` (étape C). C'est la plus souvent oubliée.

**« Les photos prennent trop de place ? »**
→ Non, on les compresse automatiquement avant de les envoyer. Tu peux en mettre plein.

**« Je veux changer / ajouter quelque chose »**
→ Écris-moi ici, je m'en occupe.

N'hésite vraiment pas à me demander si un mot n'est pas clair. On le fait ensemble. 🤝
