# 🐞 Suivi des bugs & améliorations — Guest Lucky

Page web interactive pour lister, suivre et traiter en équipe les bugs et
améliorations de l'application **Guest Lucky** (Channel Manager).

## Ce que ça fait

- ➕ Créer des fiches **bug** ou **amélioration**
- 📝 Titre + **description détaillée**
- 📷 Ajouter des **photos / captures** (compressées automatiquement)
- 🔴🟠🟢 Statut : **Pas traité / En cours / Traité**
- 🔥 Priorité (haute / moyenne / basse) + qui a créé la fiche
- 👥 **Temps réel** : ton père et Camille modifient, tu vois en direct (via Firebase)
- 🟢 Indicateur des personnes **connectées**
- 🔎 Filtres, recherche, tri

## Démarrage

👉 **Tu débutes ? Lis `GUIDE.md`** : tout est expliqué pas à pas, sans jargon.

En résumé :
1. Ouvre `index.html` pour tester (mode local).
2. Mets en ligne via **GitHub Pages** pour avoir un lien partageable.
3. Branche **Firebase** (clés à coller dans `js/firebase-config.js`) pour le temps réel.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page |
| `css/style.css` | Le design |
| `js/app.js` | La logique (affichage, photos, temps réel) |
| `js/firebase-config.js` | **Là où tu colles tes clés Firebase** |
| `firebase-rules.json` | Règles de sécurité à copier dans Firebase |
| `GUIDE.md` | Guide pas-à-pas pour débutant |

## Technique

Page statique (HTML/CSS/JS), aucune installation. Données et temps réel via
**Firebase Realtime Database**. Sans config Firebase, repli automatique en
mode local (`localStorage`).
