// =============================================================
//  CONFIGURATION FIREBASE
// =============================================================
//
//  👉 Tant que tu n'as RIEN changé ici, la page marche en
//     "mode local" : elle fonctionne sur ton ordinateur mais
//     les données ne sont PAS partagées avec ton père / Camille.
//
//  👉 Pour activer le PARTAGE EN TEMPS RÉEL, suis le guide
//     dans le fichier GUIDE.md (étape par étape, très simple).
//     Tu colleras les valeurs que Firebase te donne ci-dessous.
//
//  Remplace UNIQUEMENT les valeurs entre guillemets "...".
// =============================================================

export const firebaseConfig = {
  apiKey: "COLLE_ICI",
  authDomain: "COLLE_ICI",
  databaseURL: "COLLE_ICI",
  projectId: "COLLE_ICI",
  storageBucket: "COLLE_ICI",
  messagingSenderId: "COLLE_ICI",
  appId: "COLLE_ICI"
};

// Ne touche pas à cette ligne : elle détecte automatiquement si
// tu as déjà branché Firebase ou si on reste en mode local.
export const firebaseActive = !Object.values(firebaseConfig).includes("COLLE_ICI");
