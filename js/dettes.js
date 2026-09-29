// =============================================================
//  Mes dettes — suivi personnel des remboursements
// =============================================================
//  ESPACE STRICTEMENT PRIVÉ
//  L'accès n'est pas garanti par cette page mais par les règles
//  Firebase : le nœud /dettes n'est lisible et modifiable que par
//  l'UID de Martin. Même en connaissant l'URL, personne d'autre ne
//  peut voir ces données — pas plus Camille qu'un inconnu.
//
//  Structure dans Firebase :
//    /dettes/creanciers/{id} = { id, nom, montantInitial, note, createdAt }
//    /dettes/versements/{id} = { id, creancierId, montant, date, note, createdAt }
//    /dettes/_seeded         = true  (évite de recréer les données de départ)
// =============================================================

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const escapeHtml = (s) => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // --- Données de départ, créées une seule fois ---
  const DEPART = [
    { nom: "Papa",  montantInitial: 4600, note: "" },
    { nom: "Tom",   montantInitial: 300,  note: "" },
    { nom: "Jules", montantInitial: 300,  note: "" },
  ];

  // -------------------------------------------------------
  //  Formatage
  // -------------------------------------------------------
  function euros(n) {
    const v = Number(n) || 0;
    const entier = Math.abs(v % 1) < 0.005;
    return v.toLocaleString("fr-FR", {
      minimumFractionDigits: entier ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " €";
  }

  function dateCourte(iso) {
    if (!iso) return "—";
    const [a, m, j] = String(iso).split("-");
    if (!a || !m || !j) return iso;
    return `${j}/${m}/${a.slice(2)}`;
  }

  function aujourdhui() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const jj = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${jj}`;
  }

  // -------------------------------------------------------
  //  État
  // -------------------------------------------------------
  let db = null, auth = null, authFns = null, dbFns = null;
  let creanciers = {};
  let versements = {};
  let ouverts = {};   // historiques dépliés, par créancier

  const banner = $("#status-banner");

  // -------------------------------------------------------
  //  Firebase
  // -------------------------------------------------------
  function ecranErreur(titre, texte) {
    $("#app").classList.add("hidden");
    $("#login-screen").classList.add("hidden");
    $("#access-title").textContent = titre;
    $("#access-text").textContent = texte;
    $("#access-denied").classList.remove("hidden");
    banner.className = "status-banner error";
    banner.textContent = "⛔ " + titre;
    banner.classList.remove("hidden");
  }

  async function initFirebase() {
    if (!window.firebaseActive) {
      ecranErreur("Firebase non configuré",
        "La configuration Firebase est absente. Cette page ne peut pas fonctionner sans elle.");
      return false;
    }
    try {
      const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
      const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

      const apps = appMod.getApps ? appMod.getApps() : [];
      const app = apps.length ? apps[0] : appMod.initializeApp(window.firebaseConfig);

      db = dbMod.getDatabase(app);
      dbFns = {
        ref: dbMod.ref, onValue: dbMod.onValue, push: dbMod.push,
        set: dbMod.set, update: dbMod.update, remove: dbMod.remove, get: dbMod.get,
      };

      auth = authMod.getAuth(app);
      authFns = {
        signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
        onAuthStateChanged: authMod.onAuthStateChanged,
        signOut: authMod.signOut,
      };
      return true;
    } catch (e) {
      console.error(e);
      ecranErreur("Connexion impossible",
        "Impossible de joindre Firebase. Vérifie ta connexion internet puis réessaie.");
      return false;
    }
  }

  // Crée les données de départ au tout premier accès.
  async function amorcer() {
    const { ref, get, set, push } = dbFns;
    const flag = await get(ref(db, "dettes/_seeded"));
    if (flag.exists() && flag.val()) return;
    await set(ref(db, "dettes/_seeded"), true);
    for (let i = 0; i < DEPART.length; i++) {
      const r = push(ref(db, "dettes/creanciers"));
      await set(r, { ...DEPART[i], id: r.key, ordre: i, createdAt: Date.now() });
    }
  }

  // -------------------------------------------------------
  //  Calculs
  // -------------------------------------------------------
  function versementsDe(creancierId) {
    return Object.values(versements)
      .filter((v) => v.creancierId === creancierId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
  }

  function totalVerse(creancierId) {
    return Object.values(versements)
      .filter((v) => v.creancierId === creancierId)
      .reduce((s, v) => s + (Number(v.montant) || 0), 0);
  }

  function listeCreanciers() {
    return Object.values(creanciers).sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || (a.createdAt || 0) - (b.createdAt || 0));
  }

  // -------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------
  function render() {
    const liste = listeCreanciers();

    // --- Récapitulatif global ---
    const totalDu = liste.reduce((s, c) => s + (Number(c.montantInitial) || 0), 0);
    const totalPaye = liste.reduce((s, c) => s + totalVerse(c.id), 0);
    const reste = Math.max(0, totalDu - totalPaye);
    const pct = totalDu > 0 ? Math.min(100, (totalPaye / totalDu) * 100) : 0;
    const soldees = liste.filter((c) => totalVerse(c.id) >= (Number(c.montantInitial) || 0)).length;

    $("#recap").innerHTML = `
      <div class="recap-card reste">
        <div class="lbl">Reste à rembourser</div>
        <div class="val">${euros(reste)}</div>
        <div class="sub">sur ${euros(totalDu)} au total</div>
      </div>
      <div class="recap-card paye">
        <div class="lbl">Déjà remboursé</div>
        <div class="val">${euros(totalPaye)}</div>
        <div class="jauge ${pct >= 100 ? "pleine" : ""}"><span style="width:${pct}%"></span></div>
        <div class="sub">${pct.toFixed(pct % 1 === 0 ? 0 : 1)} % du total</div>
      </div>
      <div class="recap-card">
        <div class="lbl">Personnes</div>
        <div class="val">${liste.length}</div>
        <div class="sub">${soldees} soldée${soldees > 1 ? "s" : ""}</div>
      </div>
    `;

    // --- Cartes ---
    const vide = $("#empty");
    if (liste.length === 0) {
      $("#liste").innerHTML = "";
      vide.classList.remove("hidden");
      return;
    }
    vide.classList.add("hidden");

    $("#liste").innerHTML = liste.map((c) => {
      const initial = Number(c.montantInitial) || 0;
      const verse = totalVerse(c.id);
      const restant = Math.max(0, initial - verse);
      const p = initial > 0 ? Math.min(100, (verse / initial) * 100) : 0;
      const soldee = restant < 0.005;
      const vs = versementsDe(c.id);
      const ouvert = Boolean(ouverts[c.id]);

      return `
        <div class="dette-card ${soldee ? "soldee" : ""}">
          <div class="dette-head">
            <div>
              <div class="dette-nom">${soldee ? "✅ " : ""}${escapeHtml(c.nom)}</div>
              ${c.note ? `<div class="dette-note">${escapeHtml(c.note)}</div>` : ""}
            </div>
            <div class="dette-reste">
              <div class="n">${soldee ? "Soldé" : euros(restant)}</div>
              <div class="l">${soldee ? "plus rien à devoir" : "reste à payer"}</div>
            </div>
          </div>

          <div class="jauge ${p >= 100 ? "pleine" : ""}"><span style="width:${p}%"></span></div>
          <div class="dette-pct">${p.toFixed(p % 1 === 0 ? 0 : 1)} % remboursé</div>

          <div class="dette-chiffres">
            <div><div class="c-lbl">Total dû</div><b>${euros(initial)}</b></div>
            <div><div class="c-lbl">Versé</div><b style="color:var(--green)">${euros(verse)}</b></div>
            <div><div class="c-lbl">Versements</div><b>${vs.length}</b></div>
          </div>

          <div class="dette-actions">
            <button class="btn btn-primary" data-verser="${escapeHtml(c.id)}">+ Versement</button>
            <button class="btn btn-ghost" data-histo="${escapeHtml(c.id)}">
              ${ouvert ? "▲ Masquer" : "▼ Historique"}${vs.length ? ` (${vs.length})` : ""}
            </button>
            <button class="btn btn-ghost" data-editer="${escapeHtml(c.id)}">✏️ Modifier</button>
          </div>

          ${ouvert ? `
            <div class="histo">
              <div class="histo-titre">Historique des versements</div>
              ${vs.length ? vs.map((v) => `
                <div class="versement">
                  <span class="v-date">${dateCourte(v.date)}</span>
                  <span class="v-montant">+ ${euros(v.montant)}</span>
                  <span class="v-note">${escapeHtml(v.note || "")}</span>
                  <button class="v-del" data-suppr-versement="${escapeHtml(v.id)}" title="Supprimer ce versement">×</button>
                </div>
              `).join("") : `<div class="histo-vide">Aucun versement pour l'instant.</div>`}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");

    brancherCartes();
  }

  function brancherCartes() {
    $$("[data-verser]").forEach((b) => b.onclick = () => ouvrirVersement(b.dataset.verser));
    $$("[data-editer]").forEach((b) => b.onclick = () => ouvrirCreancier(creanciers[b.dataset.editer]));
    $$("[data-histo]").forEach((b) => b.onclick = () => {
      const id = b.dataset.histo;
      ouverts[id] = !ouverts[id];
      render();
    });
    $$("[data-suppr-versement]").forEach((b) => b.onclick = () => {
      const v = versements[b.dataset.supprVersement];
      if (!v) return;
      if (confirm(`Supprimer le versement de ${euros(v.montant)} du ${dateCourte(v.date)} ?`)) {
        dbFns.remove(dbFns.ref(db, "dettes/versements/" + v.id));
      }
    });
  }

  // -------------------------------------------------------
  //  Modale créancier
  // -------------------------------------------------------
  function ouvrirCreancier(c) {
    const edition = Boolean(c);
    $("#mc-titre").textContent = edition ? "Modifier" : "Nouvelle personne";
    $("#mc-id").value = edition ? c.id : "";
    $("#mc-nom").value = edition ? (c.nom || "") : "";
    $("#mc-montant").value = edition ? (c.montantInitial || "") : "";
    $("#mc-note").value = edition ? (c.note || "") : "";
    $("#mc-delete").classList.toggle("hidden", !edition);
    $("#modal-creancier").classList.remove("hidden");
    setTimeout(() => $("#mc-nom").focus(), 50);
  }
  const fermerCreancier = () => $("#modal-creancier").classList.add("hidden");

  function enregistrerCreancier(ev) {
    ev.preventDefault();
    const id = $("#mc-id").value;
    const nom = $("#mc-nom").value.trim();
    const montant = parseFloat($("#mc-montant").value);
    if (!nom || !(montant >= 0)) return;

    const donnees = { nom, montantInitial: montant, note: $("#mc-note").value.trim() };

    if (id) {
      dbFns.update(dbFns.ref(db, "dettes/creanciers/" + id), donnees);
    } else {
      const r = dbFns.push(dbFns.ref(db, "dettes/creanciers"));
      dbFns.set(r, { ...donnees, id: r.key, ordre: Object.keys(creanciers).length, createdAt: Date.now() });
    }
    fermerCreancier();
  }

  function supprimerCreancier() {
    const id = $("#mc-id").value;
    const c = creanciers[id];
    if (!c) return;
    const n = versementsDe(id).length;
    const msg = n
      ? `Supprimer « ${c.nom} » ET ses ${n} versement(s) ? C'est définitif.`
      : `Supprimer « ${c.nom} » ? C'est définitif.`;
    if (!confirm(msg)) return;

    versementsDe(id).forEach((v) => dbFns.remove(dbFns.ref(db, "dettes/versements/" + v.id)));
    dbFns.remove(dbFns.ref(db, "dettes/creanciers/" + id));
    fermerCreancier();
  }

  // -------------------------------------------------------
  //  Modale versement
  // -------------------------------------------------------
  function ouvrirVersement(creancierId) {
    const c = creanciers[creancierId];
    if (!c) return;
    const restant = Math.max(0, (Number(c.montantInitial) || 0) - totalVerse(creancierId));
    $("#mv-titre").textContent = `Versement à ${c.nom}`;
    $("#mv-contexte").textContent = restant > 0
      ? `Il te reste ${euros(restant)} à rembourser à ${c.nom}.`
      : `Tu as déjà tout remboursé à ${c.nom}.`;
    $("#mv-creancier").value = creancierId;
    $("#mv-montant").value = "";
    $("#mv-date").value = aujourdhui();
    $("#mv-note").value = "";
    $("#modal-versement").classList.remove("hidden");
    setTimeout(() => $("#mv-montant").focus(), 50);
  }
  const fermerVersement = () => $("#modal-versement").classList.add("hidden");

  function enregistrerVersement(ev) {
    ev.preventDefault();
    const creancierId = $("#mv-creancier").value;
    const montant = parseFloat($("#mv-montant").value);
    const date = $("#mv-date").value;
    if (!creancierId || !(montant > 0) || !date) return;

    const c = creanciers[creancierId];
    const restant = Math.max(0, (Number(c.montantInitial) || 0) - totalVerse(creancierId));
    if (montant > restant + 0.005) {
      const go = confirm(
        `Tu verses ${euros(montant)} alors qu'il ne reste que ${euros(restant)} à devoir à ${c.nom}.\n\n` +
        "Enregistrer quand même ?"
      );
      if (!go) return;
    }

    const r = dbFns.push(dbFns.ref(db, "dettes/versements"));
    dbFns.set(r, {
      id: r.key,
      creancierId,
      montant,
      date,
      note: $("#mv-note").value.trim(),
      createdAt: Date.now(),
    });
    ouverts[creancierId] = true;  // on déplie pour voir le versement arriver
    fermerVersement();
  }

  // -------------------------------------------------------
  //  Connexion
  // -------------------------------------------------------
  function afficherLogin() {
    $("#app").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#login-screen").classList.remove("hidden");
    $("#login-password").value = "";
    $("#login-error").classList.remove("show");
    setTimeout(() => {
      const email = $("#login-email");
      (email.value ? $("#login-password") : email).focus();
    }, 50);
  }

  function afficherApp(user) {
    $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(user.displayName || user.email)}</b>`;
    $("#login-screen").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#app").classList.remove("hidden");
    banner.className = "status-banner live";
    banner.textContent = "🔒 Espace privé — visible uniquement par toi.";
    banner.classList.remove("hidden");
  }

  function messageErreurAuth(code) {
    switch (code) {
      case "auth/invalid-email": return "❌ Cette adresse e-mail n'est pas valide.";
      case "auth/user-disabled": return "❌ Ce compte a été désactivé.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "❌ E-mail ou mot de passe incorrect.";
      case "auth/too-many-requests": return "❌ Trop de tentatives. Patiente quelques minutes.";
      case "auth/network-request-failed": return "❌ Pas de connexion internet.";
      default: return "❌ Connexion impossible. Réessaie.";
    }
  }

  async function seConnecter(ev) {
    ev.preventDefault();
    const email = $("#login-email").value.trim();
    const mdp = $("#login-password").value;
    if (!email || !mdp) return;

    const btn = $("#login-submit");
    btn.disabled = true; btn.textContent = "Connexion…";
    $("#login-error").classList.remove("show");
    try {
      await authFns.signInWithEmailAndPassword(auth, email, mdp);
      $("#login-password").value = "";
    } catch (e) {
      console.error(e);
      const el = $("#login-error");
      el.textContent = messageErreurAuth(e && e.code);
      el.classList.add("show");
      $("#login-password").value = "";
      $("#login-password").focus();
    } finally {
      btn.disabled = false; btn.textContent = "Se connecter";
    }
  }

  // -------------------------------------------------------
  //  Événements
  // -------------------------------------------------------
  function brancherEvenements() {
    $("#btn-add-creancier").onclick = () => ouvrirCreancier(null);
    $("#btn-logout").onclick = () => authFns.signOut(auth).catch(console.error);

    $("#mc-close").onclick = fermerCreancier;
    $("#mc-cancel").onclick = fermerCreancier;
    $("#mc-delete").onclick = supprimerCreancier;
    $("#form-creancier").onsubmit = enregistrerCreancier;
    $("#modal-creancier").addEventListener("click", (e) => { if (e.target.id === "modal-creancier") fermerCreancier(); });

    $("#mv-close").onclick = fermerVersement;
    $("#mv-cancel").onclick = fermerVersement;
    $("#form-versement").onsubmit = enregistrerVersement;
    $("#modal-versement").addEventListener("click", (e) => { if (e.target.id === "modal-versement") fermerVersement(); });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      fermerCreancier();
      fermerVersement();
    });

    $("#login-form").onsubmit = seConnecter;
    ["#login-email", "#login-password"].forEach((s) =>
      $(s).addEventListener("input", () => $("#login-error").classList.remove("show")));
  }

  // -------------------------------------------------------
  //  Démarrage
  // -------------------------------------------------------
  async function demarrer() {
    const ok = await initFirebase();
    if (!ok) return;

    brancherEvenements();

    let abonne = false;

    authFns.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        creanciers = {}; versements = {};
        $("#me").textContent = "";
        banner.classList.add("hidden");
        afficherLogin();
        return;
      }

      afficherApp(user);
      if (abonne) { render(); return; }
      abonne = true;

      try {
        await amorcer();
      } catch (e) {
        console.error(e);
        // Le plus probable : les règles Firebase ne sont pas encore publiées.
        ecranErreur("Accès refusé",
          "Ton compte n'a pas accès à cet espace. Les règles Firebase du nœud /dettes doivent être publiées.");
        return;
      }

      const { ref, onValue } = dbFns;
      onValue(ref(db, "dettes/creanciers"), (snap) => { creanciers = snap.val() || {}; render(); });
      onValue(ref(db, "dettes/versements"), (snap) => { versements = snap.val() || {}; render(); });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
