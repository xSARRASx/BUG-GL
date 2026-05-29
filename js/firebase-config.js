// =============================================================
//  CONFIGURATION FIREBASE
// =============================================================
//
//  ✅ Firebase est branché : la page fonctionne en TEMPS RÉEL
//     partagé. Toute modif (statut, photo, nouvelle fiche) est
//     visible par tout le monde en direct.
//
//  Si un jour tu changes de projet Firebase, remplace les
//     valeurs ci-dessous par celles données par Firebase.
// =============================================================

window.firebaseConfig = {
  apiKey: "AIzaSyA9az_-bXlzb4vFvsvx8n8pHpqtFV76oRQ",
  authDomain: "guestlucky-bugs.firebaseapp.com",
  databaseURL: "https://guestlucky-bugs-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "guestlucky-bugs",
  storageBucket: "guestlucky-bugs.firebasestorage.app",
  messagingSenderId: "629553269666",
  appId: "1:629553269666:web:6947c1751ca6cc2204c0fb"
};

// Ne touche pas à cette ligne : elle détecte automatiquement si
// tu as déjà branché Firebase ou si on reste en mode local.
window.firebaseActive = !Object.values(window.firebaseConfig).includes("COLLE_ICI");
