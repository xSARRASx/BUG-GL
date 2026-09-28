// =============================================================
//  Connexion Firebase (SDK CLIENT, pas Admin SDK)
// =============================================================
//  Le robot s'authentifie comme un utilisateur normal, avec un
//  compte dédié créé dans la console Firebase. Il est donc soumis
//  aux MÊMES règles de sécurité que Martin et Camille — il ne peut
//  rien faire de plus qu'eux.
//
//  Secrets attendus (variables d'environnement, jamais dans le repo) :
//    SEO_ROBOT_EMAIL
//    SEO_ROBOT_PASSWORD
//
//  La configuration Firebase (apiKey, databaseURL…) n'est PAS un
//  secret : elle est déjà publique dans js/firebase-config.js,
//  servie en clair par GitHub Pages à chaque visiteur. On la lit
//  donc directement depuis ce fichier, ce qui évite d'avoir à la
//  dupliquer dans 7 secrets GitHub.
// =============================================================

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getDatabase } from "firebase/database";

import { log, enregistrerSecret, erreurLisible } from "./log.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const CONFIG_PAR_DEFAUT = resolve(ICI, "../../js/firebase-config.js");

export class ConfigurationManquante extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationManquante";
  }
}

/** Lit window.firebaseConfig depuis js/firebase-config.js. */
export function lireConfigFirebase(chemin = process.env.FIREBASE_CONFIG_PATH || CONFIG_PAR_DEFAUT) {
  let source;
  try {
    source = readFileSync(chemin, "utf8");
  } catch {
    throw new ConfigurationManquante(
      "Impossible de lire js/firebase-config.js. Le robot doit être lancé depuis la racine du dépôt."
    );
  }

  // Le fichier est un script navigateur : on lui fournit un faux « window ».
  const faketWindow = {};
  try {
    new Function("window", source)(faketWindow);
  } catch {
    throw new ConfigurationManquante("js/firebase-config.js est illisible ou a changé de format.");
  }

  const cfg = faketWindow.firebaseConfig;
  if (!cfg || !cfg.databaseURL || !cfg.apiKey) {
    throw new ConfigurationManquante("js/firebase-config.js ne contient pas de configuration exploitable.");
  }
  if (Object.values(cfg).includes("COLLE_ICI")) {
    throw new ConfigurationManquante("js/firebase-config.js contient encore des valeurs de remplissage.");
  }
  return cfg;
}

/** Vérifie la présence des secrets, sans jamais révéler leur contenu. */
export function lireIdentifiantsRobot() {
  const email = process.env.SEO_ROBOT_EMAIL;
  const password = process.env.SEO_ROBOT_PASSWORD;

  const manquants = [];
  if (!email || !email.trim()) manquants.push("SEO_ROBOT_EMAIL");
  if (!password) manquants.push("SEO_ROBOT_PASSWORD");

  if (manquants.length) {
    throw new ConfigurationManquante(
      `Secret(s) absent(s) : ${manquants.join(", ")}. ` +
      "À créer dans GitHub → Settings → Secrets and variables → Actions."
    );
  }

  // À masquer dans tous les logs à partir de maintenant.
  enregistrerSecret(email.trim());
  enregistrerSecret(password);

  return { email: email.trim(), password };
}

/**
 * Se connecte à Firebase et authentifie le compte robot.
 * @returns {Promise<{app, db, auth, user, identite: string}>}
 */
export async function connecter() {
  const config = lireConfigFirebase();
  const { email, password } = lireIdentifiantsRobot();

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  const db = getDatabase(app);
  const auth = getAuth(app);

  log.etape("Authentification du compte robot…");
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    throw new ConfigurationManquante(
      "Authentification du compte robot refusée (" + erreurLisible(e) + "). " +
      "Vérifie que le compte existe dans Firebase Console et que les secrets sont à jour."
    );
  }

  const user = cred.user;
  const identite = user.displayName || "Robot SEO";
  log.ok(`Connecté — uid ${user.uid}`);

  // ID token pour les requêtes REST conditionnelles (ETag / If-Match).
  // Il est enregistré comme secret à chaque obtention : le SDK le
  // renouvelle tout seul, et aucune de ses versions ne doit fuiter.
  const getIdToken = async () => {
    const jeton = await user.getIdToken();
    enregistrerSecret(jeton);
    return jeton;
  };

  // On en récupère un tout de suite : si les droits sont mauvais,
  // autant le savoir avant de commencer.
  await getIdToken();

  return {
    app, db, auth, user, identite,
    getIdToken,
    databaseURL: config.databaseURL,
  };
}

export async function deconnecter(auth) {
  try {
    await signOut(auth);
  } catch {
    /* sans conséquence : le processus se termine de toute façon */
  }
}
