# 📧 Activer les alertes par mail — guide pas à pas (débutant)

Ce guide branche l'envoi automatique de mails quand une fiche est **ajoutée**
ou **traitée**. On utilise **EmailJS** (gratuit). Compte ~5-10 minutes.

> Tant que ce n'est pas fait, l'appli marche normalement — il n'y a juste
> pas de mails.

---

## Étape A — Créer le compte EmailJS

1. Va sur 👉 **https://www.emailjs.com** et clique **« Sign Up »**.
2. Inscris-toi (tu peux utiliser `martinmorebkk@gmail.com`). Confirme ton mail si demandé.

## Étape B — Connecter une adresse d'envoi (le « service »)

1. Dans le menu de gauche, clique **« Email Services »** → **« Add New Service »**.
2. Choisis **« Gmail »** (le plus simple).
3. Clique **« Connect Account »** et connecte le Gmail qui **enverra** les mails
   (ex. `martinmorebkk@gmail.com`). Autorise.
4. Clique **« Create Service »**.
5. 📋 **Note le `Service ID`** affiché (du genre `service_xxxxxxx`).

## Étape C — Créer le modèle de mail (le « template »)

1. Menu de gauche → **« Email Templates »** → **« Create New Template »**.
2. Remplis les champs **exactement** comme ceci :
   - **Subject** (objet) : `{{subject}}`
   - **Content** (contenu du mail) : `{{message}}`
   - **To Email** (destinataire) : `{{to_email}}`
   - **To Name** (facultatif) : `{{to_name}}`
   - **From Name** (facultatif) : `Suivi Guest Lucky`
3. Clique **« Save »**.
4. 📋 **Note le `Template ID`** (du genre `template_xxxxxxx`).

## Étape D — Récupérer ta clé publique

1. Menu de gauche → **« Account »** (ou la roue dentée) → section **« General »** / **« API Keys »**.
2. 📋 **Note la `Public Key`** (du genre `xxxxxxxxxxxxxxx`).

## Étape E — Me donner les 3 valeurs

Tu as maintenant 3 infos :
- `Public Key`
- `Service ID`
- `Template ID`

👉 **Envoie-les moi**, je les colle dans le code et je mets à jour le site.
*(Ou, si tu veux le faire toi-même : ouvre `js/email-config.js`, remplace les
trois `"COLLE_ICI"` par tes valeurs, et enregistre.)*

---

## ✅ C'est tout !

Une fois les 3 valeurs en place :
- **Ajout d'une fiche** → mail court à l'équipe (type + priorité + qui l'a ajoutée)
- **Fiche passée en « Traité »** → mail court à l'équipe (qui l'a traitée)

Les mails ne contiennent **ni le titre ni la description** (juste l'alerte),
comme demandé. La personne qui fait l'action ne se reçoit pas elle-même.

### 🆘 Souci ?
- Aucun mail reçu → vérifie les 3 valeurs (étape E) et regarde dans les **spams**.
- EmailJS gratuit = ~200 mails/mois (large pour une petite équipe).
