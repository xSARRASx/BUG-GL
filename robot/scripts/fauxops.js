// =============================================================
//  Faux magasin Firebase, pour tester le flux hors ligne
// =============================================================
//  Simule une fiche /seo et son entrée /seoRobot.
//
//  Deux façons de faire échouer une opération, car les primitives
//  réelles échouent de deux manières différentes :
//    • echecs[nom]      → l'opération LÈVE une exception
//    • retoursFalse[nom] → l'opération renvoie false (transaction
//                          non commitée), ce qui n'est PAS un succès
//
//  libererSurement n'est pas simulé : il délègue au VRAI
//  libererAvecRepli de lib/flow.js, pour que les tests couvrent le
//  code réellement exécuté en production.
// =============================================================

import { libererAvecRepli } from "../lib/flow.js";

export function creerFauxOps(options = {}) {
  const {
    statutInitial = "afaire",
    echecs = {},        // ex. { ecrireMetaReservation: true }
    retoursFalse = {},  // ex. { liberer: true, remettreAFaireRepli: true }
    analyse = { disponible: false, motif: "Analyse non branchée (stub)" },
  } = options;

  const etat = {
    statut: statutInitial,
    meta: null,
    seoRobot: null,
    note: "Note existante de Camille.",
    rapportsEcrits: 0,
    appels: [],
    // « reservation » tant que la fiche n'est pas libérée, puis « liberation ».
    // Permet de distinguer le rollback de réservation du repli de libération,
    // qui appellent tous deux remettreAFaire.
    phase: "reservation",
  };

  const peutLever = (nom) => {
    etat.appels.push(nom);
    if (echecs[nom]) throw new Error(`échec simulé : ${nom}`);
  };

  // --- Primitives de libération (celles que libererAvecRepli reçoit) ---
  const prim = {
    async liberer(cle, identite) {
      peutLever("liberer");
      if (retoursFalse.liberer) return false;      // transaction non commitée
      if (etat.statut !== "encours") return false;
      etat.statut = "afaire";
      etat.meta = { updatedBy: identite, updatedAt: 2, termineAt: null };
      return true;
    },

    async remettreAFaire(cle) {
      // Le repli de libération et le rollback de réservation sont la même
      // primitive : on les distingue par la phase en cours.
      const nom = etat.phase === "liberation" ? "remettreAFaireRepli" : "remettreAFaire";
      peutLever(nom);
      if (retoursFalse[nom]) return false;         // transaction non commitée
      if (etat.statut !== "encours") return false;
      etat.statut = "afaire";
      return true;
    },
  };

  const ops = {
    async claimStatut() {
      peutLever("claimStatut");
      // Reproduit le contrat reel : pre-lecture puis transaction.
      const statutLu = etat.statut === undefined ? null : etat.statut;
      if (statutLu === null) return { pris: false, raison: "disparue", statutLu: null };
      if (statutLu !== "afaire") return { pris: false, raison: "occupee", statutLu };
      if (retoursFalse.claimTransaction) {
        // Le pre-read voyait afaire mais le commit echoue : course.
        return { pris: false, raison: "course", statutLu, statutApres: etat.statut };
      }
      etat.statut = "encours";
      return { pris: true, raison: "pris", statutLu };
    },

    async ecrireMetaReservation(cle, identite) {
      peutLever("ecrireMetaReservation");
      etat.meta = { updatedBy: identite, updatedAt: 1, termineAt: null };
    },

    remettreAFaire: (cle) => prim.remettreAFaire(cle),

    async demarrerEtat(cle, identite) {
      peutLever("demarrerEtat");
      etat.seoRobot = { etat: "reserve", parQui: identite };
    },

    async avancerEtat(cle, e) {
      peutLever("avancerEtat");
      etat.seoRobot = { ...(etat.seoRobot || {}), etat: e };
    },

    async analyser() {
      peutLever("analyser");
      return analyse;
    },

    async ajouterRapport(cle, corps) {
      peutLever("ajouterRapport");
      etat.rapportsEcrits++;
      etat.note = `${etat.note}\n\n${corps}`;
    },

    // Best effort : ne lève jamais.
    async tenterEtatEchec(cle, motif) {
      etat.appels.push("tenterEtatEchec");
      if (echecs.tenterEtatEchec) return;
      etat.seoRobot = { ...(etat.seoRobot || {}), etat: "echec", derniereErreur: String(motif) };
    },

    // Délègue au VRAI filet de lib/flow.js.
    async libererSurement(cle, identite) {
      etat.phase = "liberation";
      etat.appels.push("libererSurement");
      return libererAvecRepli(prim, cle, identite);
    },
  };

  return { ops, etat, prim };
}
