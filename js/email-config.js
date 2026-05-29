// =============================================================
//  CONFIGURATION DES ALERTES MAIL (via EmailJS)
// =============================================================
//
//  👉 Tant que les 3 clés ci-dessous ne sont pas remplies, les
//     mails ne partent pas (le reste de l'appli marche normalement).
//
//  👉 Pour activer les mails, suis le guide GUIDE-EMAIL.md
//     (création d'un compte EmailJS gratuit, 5 minutes).
//     Tu colleras les 3 valeurs qu'EmailJS te donne.
// =============================================================

window.emailConfig = {
  // --- À remplir après création du compte EmailJS ---
  publicKey: "FKbqzbrRz6RZZ1lvb",
  serviceId: "service_fqs0q06",
  templateId: "gel7mmc",

  // --- Adresses de l'équipe (déjà remplies) ---
  team: {
    "Martin Moré": "martinmorebkk@gmail.com",
    "Sébastien Moré": "moresebastien@gmail.com",
    "Camille Fauveau": "camillefauveau.service@gmail.com"
  },

  // Recevoir aussi un mail pour ses PROPRES actions ? (false = non)
  notifySelf: false
};

// Détecte automatiquement si EmailJS est configuré.
window.emailActive = ![
  window.emailConfig.publicKey,
  window.emailConfig.serviceId,
  window.emailConfig.templateId
].includes("COLLE_ICI");
