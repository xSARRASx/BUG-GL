// =============================================================
//  Faux magasin Firebase, pour tester le flux hors ligne
// =============================================================
//  Simule une fiche /seo et son entrée /seoRobot, et permet de faire
//  échouer n'importe quelle opération à la demande, afin de vérifier
//  que la fiche ne reste jamais bloquée en « encours ».
// =============================================================

export function creerFauxOps(options = {}) {
  const {
    statutInitial = "afaire",
    echecs = {},          // ex. { ecrireMetaReservation: true, remettreAFaire: true }
    analyse = { disponible: false, motif: "Analyse non branchée (stub)" },
  } = options;

  const etat = {
    statut: statutInitial,
    meta: null,
    seoRobot: null,
    note: "Note existante de Camille.",
    rapportsEcrits: 0,
    appels: [],
  };

  const peutEchouer = (nom) => {
    etat.appels.push(nom);
    if (echecs[nom]) throw new Error(`échec simulé : ${nom}`);
  };

  const ops = {
    async claimStatut() {
      peutEchouer("claimStatut");
      if (etat.statut !== "afaire") return false;
      etat.statut = "encours";
      return true;
    },

    async ecrireMetaReservation(cle, identite) {
      peutEchouer("ecrireMetaReservation");
      etat.meta = { updatedBy: identite, updatedAt: 1, termineAt: null };
    },

    async remettreAFaire() {
      peutEchouer("remettreAFaire");
      if (etat.statut !== "encours") return false;
      etat.statut = "afaire";
      return true;
    },

    async demarrerEtat(cle, identite) {
      peutEchouer("demarrerEtat");
      etat.seoRobot = { etat: "reserve", parQui: identite };
    },

    async avancerEtat(cle, e) {
      peutEchouer("avancerEtat");
      etat.seoRobot = { ...(etat.seoRobot || {}), etat: e };
    },

    async analyser() {
      peutEchouer("analyser");
      return analyse;
    },

    async ajouterRapport(cle, corps) {
      peutEchouer("ajouterRapport");
      etat.rapportsEcrits++;
      etat.note = `${etat.note}\n\n${corps}`;
    },

    // Best effort : ne lève jamais.
    async tenterEtatEchec(cle, motif) {
      etat.appels.push("tenterEtatEchec");
      if (echecs.tenterEtatEchec) return;
      etat.seoRobot = { ...(etat.seoRobot || {}), etat: "echec", derniereErreur: String(motif) };
    },

    // Filet final : ne lève jamais, renvoie true/false.
    async libererSurement(cle, identite) {
      etat.appels.push("libererSurement");
      try {
        if (echecs.liberer) throw new Error("échec simulé : liberer");
        if (etat.statut === "encours") {
          etat.statut = "afaire";
          etat.meta = { updatedBy: identite, updatedAt: 2, termineAt: null };
        }
        return true;
      } catch {
        try {
          if (echecs.remettreAFaireFinal) throw new Error("échec simulé : repli");
          if (etat.statut === "encours") etat.statut = "afaire";
          return true;
        } catch {
          return false;
        }
      }
    },
  };

  return { ops, etat };
}
