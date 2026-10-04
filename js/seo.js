// =============================================================
//  Suivi SEO — Guest Lucky
//  Accès restreint : Martin Moré & Camille Fauveau (avec mot de passe)
//  Stockage : Firebase /seo (partagé en temps réel)
// =============================================================

(function () {
  "use strict";

  // --- Utilitaires ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // --- Accès ---
  //  L'accès est géré par Firebase Authentication (e-mail / mot de passe).
  //  Les comptes sont créés UNIQUEMENT depuis la console Firebase :
  //  aucune inscription n'est possible depuis le site.
  //  Aucun mot de passe n'est stocké ici ni dans localStorage.

  // --- Labels ---
  const STATUT_LABEL = { afaire: "🔴 À faire", encours: "🟠 En cours", termine: "🟢 Terminé" };
  const ACTIVITE_LABEL = { conciergerie: "🏨 Conciergerie", sous_location: "🏠 Sous-location", les_deux: "🏨🏠 Conciergerie + Sous-location" };
  const PRESTATION_LABEL = { seo_complet: "SEO complet (tout à faire)", seo_local: "SEO local uniquement (base déjà faite)" };
  // Mapping statut → classe CSS pill existante
  const PILL_CLASS = { afaire: "nontraite", encours: "encours", termine: "traite" };

  // --- Identité (remplie par Firebase Auth, jamais par localStorage) ---
  let me = "";
  let currentUser = null;

  // --- Conversion fichier → base64 ---
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  // -------------------------------------------------------
  //  Store
  //  ⚠️ Volontairement PAS de LocalStore de secours pour le SEO :
  //     en cas d'échec Firebase, on bloque les modifications plutôt
  //     que de créer des données locales jamais synchronisées.
  // -------------------------------------------------------
  class FirebaseStore {
    constructor(db, fns) { this.db = db; this.fns = fns; }
    subscribe(cb) {
      const { ref, onValue } = this.fns;
      onValue(ref(this.db, "seo"), (snap) => cb(snap.val() || {}));
    }
    add(item) {
      const { ref, push, set } = this.fns;
      const r = push(ref(this.db, "seo"));
      set(r, { ...item, id: r.key });
    }
    update(id, patch) {
      const { ref, update } = this.fns;
      update(ref(this.db, "seo/" + id), patch);
    }
    remove(id) {
      const { ref, remove } = this.fns;
      remove(ref(this.db, "seo/" + id));
    }
  }

  // -------------------------------------------------------
  //  Initialisation Firebase (base + authentification)
  // -------------------------------------------------------
  let store = null;
  let auth = null;
  let authFns = null;
  const banner = $("#status-banner");

  // Affiche l'écran d'erreur bloquant (aucune modification possible)
  function showFatal(title, text) {
    $("#seo-app").classList.add("hidden");
    $("#login-screen").classList.add("hidden");
    $("#access-title").textContent = title;
    $("#access-text").textContent = text;
    $("#access-denied").classList.remove("hidden");
    banner.className = "status-banner error";
    banner.textContent = "⛔ " + title + " — modifications désactivées.";
    banner.classList.remove("hidden");
  }

  // Initialise l'app Firebase, la base et l'authentification.
  // Retourne true si tout est prêt, false sinon (aucun repli local).
  async function initFirebase() {
    if (!window.firebaseActive) {
      showFatal(
        "Firebase non configuré",
        "La configuration Firebase est absente. Le Suivi SEO ne peut pas fonctionner sans connexion à la base partagée."
      );
      return false;
    }
    try {
      const appMod  = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
      const dbMod   = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
      const authMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");

      const apps = appMod.getApps ? appMod.getApps() : [];
      const app = apps.length ? apps[0] : appMod.initializeApp(window.firebaseConfig);

      const db = dbMod.getDatabase(app);
      store = new FirebaseStore(db, {
        ref: dbMod.ref, onValue: dbMod.onValue, push: dbMod.push,
        set: dbMod.set, update: dbMod.update, remove: dbMod.remove,
      });

      auth = authMod.getAuth(app);
      authFns = {
        signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
        onAuthStateChanged: authMod.onAuthStateChanged,
        signOut: authMod.signOut,
      };
      return true;
    } catch (e) {
      console.error(e);
      showFatal(
        "Connexion impossible",
        "Le Suivi SEO n'a pas pu joindre Firebase. Les modifications sont désactivées pour éviter de créer des données non synchronisées. Vérifie ta connexion internet puis réessaie."
      );
      return false;
    }
  }

  // -------------------------------------------------------
  //  État
  // -------------------------------------------------------
  let sites = {};
  let filterStatus = "all";
  let searchText = "";
  let editingFiles = [];
  let detailSiteId = null;
  let revFrom = null; // index de mois (année*12+mois)
  let revTo = null;

  // --- Mois : conversions ---
  function ymToIndex(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
    const [y, m] = ym.split("-").map(Number);
    return y * 12 + (m - 1);
  }
  function dateToIndex(ts) { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); }
  function currentIndex() { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); }
  function indexToYm(idx) { const y = Math.floor(idx / 12), m = (idx % 12) + 1; return `${y}-${String(m).padStart(2, "0")}`; }

  // Date à laquelle un site a été marqué « terminé »
  function termineIndex(s) {
    return dateToIndex(s.termineAt || s.updatedAt || s.createdAt || Date.now());
  }

  // -------------------------------------------------------
  //  Suivi des revenus et des encaissements
  // -------------------------------------------------------
  //  Chaque site terminé vaut TARIF_DEFAUT, sauf si un montant
  //  particulier a été saisi sur la fiche. Le paiement se suit site
  //  par site : « payé » signifie encaissé, pas seulement facturé.

  const TARIF_DEFAUT = 50;
  const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin",
                   "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  /** Montant facturé pour un site. */
  function montantDe(s) {
    const m = Number(s && s.montant);
    return Number.isFinite(m) && m >= 0 ? m : TARIF_DEFAUT;
  }

  const estPaye = (s) => Boolean(s && s.paye);

  function euros(n) {
    const v = Number(n) || 0;
    const entier = Math.abs(v % 1) < 0.005;
    return v.toLocaleString("fr-FR", {
      minimumFractionDigits: entier ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " €";
  }

  function libelleMois(idx) {
    const y = Math.floor(idx / 12), m = idx % 12;
    return `${MOIS_FR[m]} ${y}`;
  }

  function dateCourte(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  /** Sites terminés sur une plage de mois, groupés par mois. */
  function termineSurPeriode(lo, hi) {
    return Object.values(sites)
      .filter((s) => s.statut === "termine")
      .map((s) => ({ site: s, mois: termineIndex(s) }))
      .filter((e) => e.mois >= lo && e.mois <= hi);
  }

  function renderRevenue() {
    const from = revFrom != null ? revFrom : currentIndex();
    const to   = revTo   != null ? revTo   : currentIndex();
    const lo = Math.min(from, to), hi = Math.max(from, to);

    const entrees = termineSurPeriode(lo, hi);

    let facture = 0, encaisse = 0;
    const parMois = new Map();

    for (const { site, mois } of entrees) {
      const m = montantDe(site);
      const paye = estPaye(site);
      facture += m;
      if (paye) encaisse += m;

      const bloc = parMois.get(mois) || { sites: 0, facture: 0, encaisse: 0 };
      bloc.sites += 1;
      bloc.facture += m;
      if (paye) bloc.encaisse += m;
      parMois.set(mois, bloc);
    }

    const reste = facture - encaisse;
    const pct = facture > 0 ? (encaisse / facture) * 100 : 0;

    $("#rev-total").textContent = euros(facture);
    $("#rev-encaisse").textContent = euros(encaisse);
    $("#rev-reste").textContent = euros(reste);
    $("#rev-count").textContent = entrees.length;

    $("#rev-jauge").style.width = pct + "%";
    $("#rev-jauge-lbl").textContent = facture > 0
      ? `${pct.toFixed(pct % 1 === 0 ? 0 : 1)} % encaissé sur la période`
      : "Aucun site terminé sur cette période.";

    // --- Rappel des sites non encaissés ---
    const impayes = entrees.filter((e) => !estPaye(e.site))
      .sort((a, b) => a.mois - b.mois);
    const boite = $("#rev-impayes");
    if (impayes.length === 0) {
      boite.classList.add("hidden");
      boite.innerHTML = "";
    } else {
      boite.classList.remove("hidden");
      boite.innerHTML = `
        <div class="imp-titre">⏳ ${impayes.length} site${impayes.length > 1 ? "s" : ""} terminé${impayes.length > 1 ? "s" : ""} mais pas encore encaissé${impayes.length > 1 ? "s" : ""} — ${euros(reste)}</div>
        <ul>
          ${impayes.map(({ site, mois }) => `
            <li>
              <a href="#" onclick="event.preventDefault();window._seoDetail('${escapeHtml(site.id)}')">${escapeHtml(site.nom || "Sans nom")}</a>
              — ${euros(montantDe(site))} · terminé en ${libelleMois(mois)}
            </li>`).join("")}
        </ul>`;
    }

    // --- Tableau mois par mois ---
    const moisTries = [...parMois.keys()].sort((a, b) => b - a);
    const table = $("#rev-mois");
    if (moisTries.length === 0) {
      table.innerHTML = `<tbody><tr><td class="mois-vide">Aucun site terminé sur cette période.</td></tr></tbody>`;
    } else {
      table.innerHTML = `
        <thead>
          <tr>
            <th>Mois</th>
            <th class="num">Sites</th>
            <th class="num">Facturé</th>
            <th class="num">Encaissé</th>
            <th class="num">Reste</th>
          </tr>
        </thead>
        <tbody>
          ${moisTries.map((m) => {
            const b = parMois.get(m);
            const r = b.facture - b.encaisse;
            return `
              <tr>
                <td class="m-nom">${libelleMois(m)}</td>
                <td class="num">${b.sites}</td>
                <td class="num">${euros(b.facture)}</td>
                <td class="num m-paye">${euros(b.encaisse)}</td>
                <td class="num ${r > 0 ? "m-reste" : "m-solde"}">${r > 0 ? euros(r) : "soldé"}</td>
              </tr>`;
          }).join("")}
          <tr class="total">
            <td>Total</td>
            <td class="num">${entrees.length}</td>
            <td class="num">${euros(facture)}</td>
            <td class="num m-paye">${euros(encaisse)}</td>
            <td class="num ${reste > 0 ? "m-reste" : "m-solde"}">${reste > 0 ? euros(reste) : "soldé"}</td>
          </tr>
        </tbody>`;
    }
  }

  function setRevenueRange(kind) {
    const now = new Date();
    if (kind === "mois") {
      revFrom = revTo = currentIndex();
    } else if (kind === "moisdernier") {
      revFrom = revTo = currentIndex() - 1;
    } else if (kind === "annee") {
      revFrom = now.getFullYear() * 12 + 0;
      revTo = currentIndex();
    } else if (kind === "tout") {
      let min = currentIndex();
      Object.values(sites).forEach((s) => { if (s.statut === "termine") { const i = termineIndex(s); if (i < min) min = i; } });
      revFrom = min; revTo = currentIndex();
    }
    $("#rev-from").value = indexToYm(revFrom);
    $("#rev-to").value = indexToYm(revTo);
    renderRevenue();
  }

  /** Bascule l'état d'encaissement d'un site. */
  function basculerPaiement(id) {
    const s = sites[id];
    if (!s) return;
    const devientPaye = !estPaye(s);
    if (devientPaye) {
      store.update(id, { paye: true, payeAt: Date.now(), updatedAt: Date.now(), updatedBy: me });
    } else {
      store.update(id, { paye: false, payeAt: null, updatedAt: Date.now(), updatedBy: me });
    }
  }
  window._seoPaiement = basculerPaiement;

  // -------------------------------------------------------
  //  Stats (avec suivi mensuel)
  // -------------------------------------------------------
  function renderStats() {
    const arr = Object.values(sites);
    const total    = arr.length;
    const afaire   = arr.filter((s) => s.statut === "afaire").length;
    const encours  = arr.filter((s) => s.statut === "encours").length;
    const termine  = arr.filter((s) => s.statut === "termine").length;

    $("#stats").innerHTML = `
      <div class="stat-card">
        <div class="num">${total}</div>
        <div class="lbl">Total sites</div>
      </div>
      <div class="stat-card red">
        <div class="num">${afaire}</div>
        <div class="lbl">À faire</div>
      </div>
      <div class="stat-card orange">
        <div class="num">${encours}</div>
        <div class="lbl">En cours</div>
      </div>
      <div class="stat-card green">
        <div class="num">${termine}</div>
        <div class="lbl">Terminés</div>
      </div>
    `;
  }

  // -------------------------------------------------------
  //  Rendu des cartes
  // -------------------------------------------------------
  function render() {
    let arr = Object.values(sites);

    if (filterStatus !== "all") arr = arr.filter((s) => s.statut === filterStatus);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      arr = arr.filter((s) =>
        [s.nom, s.url, s.ville, s.email, s.note, s.login, s.gmb, s.drive, s.adminUrl].join(" ").toLowerCase().includes(q));
    }

    // Terminés en bas
    arr.sort((a, b) => {
      const at = a.statut === "termine" ? 1 : 0;
      const bt = b.statut === "termine" ? 1 : 0;
      if (at !== bt) return at - bt;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    renderStats();
    renderRevenue();

    const emptyEl = $("#empty");
    const list = $("#list");

    if (arr.length === 0) {
      list.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    list.innerHTML = arr.map((s) => {
      const cardClass = s.statut === "termine" ? "seo-termine" : s.statut === "encours" ? "seo-encours" : "seo-afaire";
      const files = s.files ? Object.values(s.files) : [];
      return `
        <div class="card ${cardClass}" data-id="${s.id}">
          <div class="card-top">
            <div class="badges">
              <span class="badge activite-${s.activite}">${ACTIVITE_LABEL[s.activite] || ""}</span>
              <span class="badge ${s.carte === "oui" ? "carte-oui" : "carte-non"}">${s.carte === "oui" ? "✅ Carte G" : "❌ Sans Carte G"}</span>
              ${s.statut === "termine"
                ? `<span class="badge ${estPaye(s) ? "paye-oui" : "paye-non"}">${estPaye(s) ? "💶 Payé" : "⏳ À encaisser"} · ${euros(montantDe(s))}</span>`
                : ""}
            </div>
            <span class="status-pill ${PILL_CLASS[s.statut] || "nontraite"}">${STATUT_LABEL[s.statut] || ""}</span>
          </div>
          <h3>${escapeHtml(s.nom || "")}</h3>
          ${s.url ? `<div class="card-url"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🌐 ${escapeHtml(s.url)}</a></div>` : ""}
          ${s.ville ? `<div class="card-ville">📍 ${escapeHtml(s.ville)}</div>` : ""}
          ${s.note ? `<div class="seo-note">${escapeHtml(s.note)}</div>` : ""}
          <div class="card-foot">
            <span>${s.email ? `<a href="mailto:${escapeHtml(s.email)}" onclick="event.stopPropagation()">✉️ ${escapeHtml(s.email)}</a>` : ""}</span>
            ${files.length ? `<span>📎 ${files.length} fichier${files.length > 1 ? "s" : ""}</span>` : ""}
          </div>
          <div class="card-actions">
            <button class="btn-card" onclick="event.stopPropagation();window._seoDetail('${s.id}')">👁 Voir</button>
            <button class="btn-card" onclick="event.stopPropagation();window._seoEdit('${s.id}')">✏️ Modifier</button>
            ${s.statut === "termine"
              ? `<button class="btn-card" onclick="event.stopPropagation();window._seoPaiement('${s.id}')">${estPaye(s) ? "↩️ Pas payé" : "💶 Marquer payé"}</button>`
              : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // -------------------------------------------------------
  //  Fenêtre de lecture (Voir)
  // -------------------------------------------------------
  // Affiche un champ obligatoire dans la fiche (ou son état « rien à remplir »)
  function detailReq(s, key, label, opt) {
    opt = opt || {};
    const val = s[key];
    const na = s[key + "Na"];
    if (!val && !na) return "";
    let body;
    if (!val) {
      const txt = opt.naLabel || "Rien à remplir";
      body = `<span class="badge ${opt.naWarn ? "badge-warn" : "badge-na"}">${escapeHtml(txt)}</span>`;
    } else if (opt.map) {
      body = escapeHtml(opt.map[val] || val);
    } else if (opt.link) {
      const href = /^https?:\/\//i.test(val) ? val : "https://" + val;
      body = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(val)}</a>`;
    } else if (opt.tel) {
      body = `<a href="tel:${escapeHtml(val.replace(/\s/g, ""))}" style="color:#a99bff">${escapeHtml(val)}</a>`;
    } else if (opt.gmailCheck) {
      const ok = /@gmail\.com$/i.test(val);
      body = `<a href="mailto:${escapeHtml(val)}" style="color:#a99bff">${escapeHtml(val)}</a>`
        + (ok ? "" : ` <span class="badge badge-warn">⚠️ pas un Gmail</span>`);
    } else {
      body = escapeHtml(val);
    }
    return `<h4 class="detail-label">${label}</h4><div class="detail-desc">${body}</div>`;
  }

  function openDetail(id) {
    const s = sites[id];
    if (!s) return;
    detailSiteId = id;
    const files = s.files ? Object.values(s.files) : [];
    const date = s.createdAt
      ? new Date(s.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "";

    $("#detail-title").textContent = s.nom || "Site";
    $("#detail-body").innerHTML = `
      <div class="badges detail-badges">
        <span class="badge activite-${s.activite}">${ACTIVITE_LABEL[s.activite] || ""}</span>
        <span class="badge ${s.carte === "oui" ? "carte-oui" : "carte-non"}">${s.carte === "oui" ? "✅ Carte G" : "❌ Sans Carte G"}</span>
        <span class="status-pill ${PILL_CLASS[s.statut] || "nontraite"}">${STATUT_LABEL[s.statut] || ""}</span>
      </div>
      ${s.url ? `<h4 class="detail-label">🌐 URL</h4><div class="detail-url detail-desc"><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a></div>` : ""}
      ${s.ville ? `<h4 class="detail-label">📍 Ville</h4><div class="detail-desc">${escapeHtml(s.ville)}</div>` : ""}
      ${s.email ? `<h4 class="detail-label">✉️ E-mail</h4><div class="detail-desc"><a href="mailto:${escapeHtml(s.email)}" style="color:#a99bff">${escapeHtml(s.email)}</a></div>` : ""}
      ${detailReq(s, "zone", "📍 Zone exacte confirmée", { naLabel: "⚠️ À confirmer avec le client", naWarn: true })}
      ${detailReq(s, "prestation", "🛠️ Prestation commandée", { map: PRESTATION_LABEL })}
      ${detailReq(s, "phone", "📞 Téléphone", { tel: true })}
      ${detailReq(s, "adresse", "🏠 Adresse")}
      ${detailReq(s, "facebook", "📘 Facebook", { link: true })}
      ${detailReq(s, "instagram", "📷 Instagram", { link: true })}
      ${detailReq(s, "google", "🔵 Compte Google", { gmailCheck: true })}
      ${(s.adminUrl || s.login || s.pass) ? `
        <h4 class="detail-label">🔑 Accès au site</h4>
        <div class="creds-box">
          ${s.adminUrl ? `<div class="cred-line"><span class="cred-label">Lien admin</span><span class="cred-val"><a href="${escapeHtml(s.adminUrl)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.adminUrl)}</a></span><button class="btn-copy" data-copy="${escapeHtml(s.adminUrl)}">📋 Copier</button></div>` : ""}
          ${s.login ? `<div class="cred-line"><span class="cred-label">Identifiant</span><span class="cred-val">${escapeHtml(s.login)}</span><button class="btn-copy" data-copy="${escapeHtml(s.login)}">📋 Copier</button></div>` : ""}
          ${s.pass ? `<div class="cred-line"><span class="cred-label">Mot de passe</span><span class="cred-val">${escapeHtml(s.pass)}</span><button class="btn-copy" data-copy="${escapeHtml(s.pass)}">📋 Copier</button></div>` : ""}
        </div>` : ""}
      ${s.gmb ? `<h4 class="detail-label">🗺️ Google My Business</h4><div class="detail-desc"><a href="${escapeHtml(s.gmb)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.gmb)}</a></div>` : ""}
      ${s.drive ? `<h4 class="detail-label">🔗 Lien Drive / fichier</h4><div class="detail-desc"><a href="${escapeHtml(s.drive)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.drive)}</a></div>` : ""}
      ${s.statut === "termine" ? `
        <h4 class="detail-label">💶 Facturation</h4>
        <div class="paiement-box">
          <div class="pb-etat">
            <div class="pb-montant" style="color:${estPaye(s) ? "var(--green)" : "#ff8095"}">
              ${euros(montantDe(s))} — ${estPaye(s) ? "encaissé" : "à encaisser"}
            </div>
            <div class="pb-date">
              ${estPaye(s) && s.payeAt
                ? "Marqué payé le " + dateCourte(s.payeAt)
                : "Terminé en " + libelleMois(termineIndex(s))}
            </div>
          </div>
          <button class="btn ${estPaye(s) ? "btn-ghost" : "btn-primary"}"
                  onclick="window._seoPaiement('${escapeHtml(s.id)}')">
            ${estPaye(s) ? "↩️ Marquer non payé" : "💶 Marquer payé"}
          </button>
        </div>` : ""}
      ${s.note ? `<h4 class="detail-label">📝 Note</h4><div class="detail-desc">${escapeHtml(s.note)}</div>` : ""}
      ${files.length ? `
        <h4 class="detail-label">📎 Fichiers joints</h4>
        <div class="detail-files">
          ${files.map((f) => `
            <div class="file-chip">
              <span>📄</span>
              <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
              <button class="btn-dl" data-fid="${escapeHtml(f.id)}" data-sid="${escapeHtml(s.id)}">⬇️ Télécharger</button>
            </div>
          `).join("")}
        </div>` : ""}
      <div class="detail-meta">${s.createdBy ? "Ajouté par " + escapeHtml(s.createdBy) : ""}${date ? " · le " + date : ""}</div>
    `;

    // Boutons de statut rapides
    $("#detail-status-actions").innerHTML = `
      <div class="detail-status-label">Changer le statut rapidement</div>
      <div class="detail-status-btns">
        <button class="status-btn ${s.statut === "afaire"  ? "active nontraite" : ""}" data-s="afaire"  data-id="${s.id}">🔴 À faire</button>
        <button class="status-btn ${s.statut === "encours" ? "active encours"   : ""}" data-s="encours" data-id="${s.id}">🟠 En cours</button>
        <button class="status-btn ${s.statut === "termine" ? "active traite"    : ""}" data-s="termine" data-id="${s.id}">🟢 Terminé</button>
      </div>
    `;

    $("#detail-modal").classList.remove("hidden");
  }

  function closeDetail() { $("#detail-modal").classList.add("hidden"); }

  // Exposés globalement pour les onclick inline des cartes
  window._seoDetail = openDetail;
  window._seoEdit   = function (id) { openModal(sites[id]); };

  // -------------------------------------------------------
  //  Formulaire (ajout / édition)
  // -------------------------------------------------------
  function getSeg(gid) {
    const active = $(`#${gid} button.active`);
    return active ? active.dataset.val : null;
  }
  function setSeg(gid, val) {
    $$(`#${gid} button`).forEach((b) => b.classList.toggle("active", b.dataset.val === val));
  }

  // --- Champs obligatoires avec case « Rien à remplir » ---
  //  key : nom du champ · id : id de l'input · label : message d'alerte
  const REQ_FIELDS = [
    { key: "zone",      id: "f-zone",      label: "📍 La zone exacte (ville principale + communes)" },
    { key: "prestation", id: "f-prestation", label: "🛠️ La prestation commandée" },
    { key: "phone",     id: "f-phone",     label: "📞 Le téléphone du client" },
    { key: "adresse",   id: "f-adresse",   label: "🏠 L'adresse du client" },
    { key: "facebook",  id: "f-facebook",  label: "📘 La page Facebook" },
    { key: "instagram", id: "f-instagram", label: "📷 Le compte Instagram" },
    { key: "google",    id: "f-google",    label: "🔵 Le compte Google (Gmail) du client" },
  ];

  // Grise / dégrise le champ quand on coche « Rien à remplir »
  function syncNa(f) {
    const box = $("#na-" + f.key);
    const wrap = $("#" + f.id).closest(".req-field");
    wrap.classList.toggle("is-na", box.checked);
    box.closest(".na-check").classList.toggle("checked", box.checked);
    if (box.checked) wrap.classList.remove("missing");
  }

  function wireNaChecks() {
    REQ_FIELDS.forEach((f) => {
      $("#na-" + f.key).addEventListener("change", () => syncNa(f));
    });
  }

  function openModal(site) {
    const isEdit = Boolean(site);
    $("#modal-title").textContent = isEdit ? "Modifier le site" : "Nouveau site";
    $("#f-id").value = isEdit ? site.id : "";
    setSeg("f-activite", isEdit ? (site.activite || "conciergerie") : "conciergerie");
    setSeg("f-carte",    isEdit ? (site.carte    || "non")           : "non");
    setSeg("f-status",   isEdit ? (site.statut   || "afaire")        : "afaire");
    $("#f-nom").value   = isEdit ? (site.nom    || "") : "";
    $("#f-url").value   = isEdit ? (site.url    || "") : "";
    $("#f-ville").value = isEdit ? (site.ville  || "") : "";
    $("#f-email").value = isEdit ? (site.email  || "") : "";
    $("#f-admin-url").value = isEdit ? (site.adminUrl || "") : "";
    $("#f-login").value = isEdit ? (site.login  || "") : "";
    $("#f-pass").value  = isEdit ? (site.pass   || "") : "";
    $("#f-gmb").value   = isEdit ? (site.gmb    || "") : "";
    $("#f-drive").value = isEdit ? (site.drive  || "") : "";
    $("#f-note").value  = isEdit ? (site.note   || "") : "";
    $("#f-montant").value = isEdit ? (site.montant === 0 || site.montant ? site.montant : TARIF_DEFAUT) : TARIF_DEFAUT;
    $("#f-paye").checked = isEdit ? Boolean(site.paye) : false;
    // Champs obligatoires + leurs cases « Rien à remplir »
    REQ_FIELDS.forEach((f) => {
      $("#" + f.id).value = isEdit ? (site[f.key] || "") : "";
      $("#na-" + f.key).checked = isEdit ? Boolean(site[f.key + "Na"]) : false;
      $("#" + f.id).closest(".req-field").classList.remove("missing");
      syncNa(f);
    });
    editingFiles = isEdit && site.files ? Object.values(site.files) : [];
    renderFilesPreview();
    $("#btn-delete").classList.toggle("hidden", !isEdit);
    $("#modal").classList.remove("hidden");
    setTimeout(() => $("#f-nom").focus(), 50);
  }

  function closeModal() { $("#modal").classList.add("hidden"); }

  function renderFilesPreview() {
    const el = $("#f-files-preview");
    el.innerHTML = editingFiles.map((f) => `
      <div class="file-chip">
        <span>📄</span>
        <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <button type="button" class="rm-file" data-fid="${f.id}" title="Retirer">×</button>
      </div>
    `).join("");
    $$(".rm-file").forEach((btn) => btn.addEventListener("click", () => {
      editingFiles = editingFiles.filter((f) => f.id !== btn.dataset.fid);
      renderFilesPreview();
    }));
  }

  // Ajoute une liste de fichiers (depuis l'input OU le glisser-déposer)
  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (file.size > 3 * 1024 * 1024) {
        const go = confirm(`"${file.name}" fait ${(file.size / 1024 / 1024).toFixed(1)} Mo.\nC'est lourd pour Firebase (risque de lenteur). Continuer quand même ?`);
        if (!go) continue;
      }
      const data = await fileToBase64(file);
      editingFiles.push({ id: uid(), name: file.name, type: file.type, data });
    }
    renderFilesPreview();
  }
  async function handleFileUpload(ev) {
    await addFiles(ev.target.files);
    ev.target.value = "";
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const id = $("#f-id").value;
    const data = {
      activite: getSeg("f-activite"),
      carte:    getSeg("f-carte"),
      statut:   getSeg("f-status"),
      nom:      $("#f-nom").value.trim(),
      url:      $("#f-url").value.trim(),
      ville:    $("#f-ville").value.trim(),
      email:    $("#f-email").value.trim(),
      adminUrl: $("#f-admin-url").value.trim(),
      login:    $("#f-login").value.trim(),
      pass:     $("#f-pass").value,
      gmb:      $("#f-gmb").value.trim(),
      drive:    $("#f-drive").value.trim(),
      note:     $("#f-note").value.trim(),
      montant:  (() => { const v = parseFloat($("#f-montant").value); return Number.isFinite(v) && v >= 0 ? v : TARIF_DEFAUT; })(),
      paye:     $("#f-paye").checked,
      files:    editingFiles.reduce((acc, f) => { acc[f.id] = f; return acc; }, {}),
      updatedAt: Date.now(),
      updatedBy: me,
    };
    // Champs obligatoires : soit remplis, soit cochés « Rien à remplir »
    REQ_FIELDS.forEach((f) => {
      data[f.key] = $("#" + f.id).value.trim();
      data[f.key + "Na"] = $("#na-" + f.key).checked;
    });

    if (!data.nom) return;
    if (!data.ville) {
      alert("📍 La ville est obligatoire. Merci de la renseigner.");
      $("#f-ville").focus();
      return;
    }

    const manquants = REQ_FIELDS.filter((f) => !data[f.key] && !data[f.key + "Na"]);
    REQ_FIELDS.forEach((f) => {
      $("#" + f.id).closest(".req-field").classList.toggle("missing", manquants.includes(f));
    });
    if (manquants.length) {
      alert(
        "Il manque " + manquants.length + " information" + (manquants.length > 1 ? "s" : "") + " :\n\n"
        + manquants.map((f) => "• " + f.label).join("\n")
        + "\n\nSi tu n'as vraiment rien à mettre, coche la case « Rien à remplir » à côté du champ."
      );
      const first = manquants[0];
      $("#" + first.id).focus();
      $("#" + first.id).scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    // Avertissement (non bloquant) si le compte Google n'est pas un Gmail
    if (data.google && !/@gmail\.com$/i.test(data.google)) {
      const go = confirm(
        "⚠️ « " + data.google + " » n'est pas une adresse Gmail.\n\n"
        + "Le transfert de propriété Google sera impossible (comme chez Léandro avec Outlook).\n\n"
        + "Enregistrer quand même ?"
      );
      if (!go) { $("#f-google").focus(); return; }
    }

    // Date d'encaissement : posée au moment où la case est cochée,
    // effacée si on la décoche.
    const avant = id ? sites[id] : null;
    if (data.paye && !(avant && avant.paye)) data.payeAt = Date.now();
    if (!data.paye) data.payeAt = null;

    if (id) {
      const wasTermine = sites[id] && sites[id].statut === "termine";
      // Mémorise la date de passage en « terminé » (sert au calcul des revenus)
      if (data.statut === "termine" && !wasTermine) data.termineAt = Date.now();
      if (data.statut !== "termine") data.termineAt = null;
      store.update(id, data);
    } else {
      if (data.statut === "termine") data.termineAt = Date.now();
      store.add({ ...data, createdAt: Date.now(), createdBy: me });
    }
    closeModal();
  }

  function deleteSite() {
    const id = $("#f-id").value;
    if (id && confirm("Supprimer définitivement ce site ?")) {
      store.remove(id);
      closeModal();
    }
  }

  // -------------------------------------------------------
  //  Authentification (Firebase Auth — e-mail / mot de passe)
  // -------------------------------------------------------

  // Affiche l'écran de connexion
  function showLogin() {
    $("#seo-app").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#login-screen").classList.remove("hidden");
    $("#login-password").value = "";
    hideLoginError();
    setTimeout(() => {
      const email = $("#login-email");
      (email.value ? $("#login-password") : email).focus();
    }, 50);
  }

  // Affiche l'application, une fois connecté
  function showApp(user) {
    currentUser = user;
    me = user.displayName || user.email;
    $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(me)}</b>`;
    $("#login-screen").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#seo-app").classList.remove("hidden");
    banner.className = "status-banner live";
    banner.textContent = "🟢 Connecté en temps réel — Camille et Martin voient les mêmes données.";
    banner.classList.remove("hidden");
  }

  function showLoginError(msg) {
    const el = $("#login-error");
    el.textContent = msg;
    el.classList.add("show");
  }
  function hideLoginError() {
    $("#login-error").classList.remove("show");
  }

  // Traduit les codes d'erreur Firebase en messages lisibles
  function authErrorMessage(code) {
    switch (code) {
      case "auth/invalid-email":
        return "❌ Cette adresse e-mail n'est pas valide.";
      case "auth/user-disabled":
        return "❌ Ce compte a été désactivé. Contacte l'administrateur.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "❌ E-mail ou mot de passe incorrect.";
      case "auth/too-many-requests":
        return "❌ Trop de tentatives. Patiente quelques minutes avant de réessayer.";
      case "auth/network-request-failed":
        return "❌ Pas de connexion internet. Vérifie ton réseau puis réessaie.";
      case "auth/operation-not-allowed":
        return "❌ La connexion par e-mail n'est pas activée côté Firebase.";
      default:
        return "❌ Connexion impossible. Réessaie ou contacte l'administrateur.";
    }
  }

  async function doLogin(ev) {
    if (ev) ev.preventDefault();
    if (!auth || !authFns) return;

    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    if (!email || !password) {
      showLoginError("❌ Remplis l'adresse e-mail et le mot de passe.");
      return;
    }

    const btn = $("#login-submit");
    btn.disabled = true;
    btn.textContent = "Connexion…";
    hideLoginError();

    try {
      await authFns.signInWithEmailAndPassword(auth, email, password);
      // La suite est gérée par onAuthStateChanged.
      $("#login-password").value = "";
    } catch (e) {
      console.error(e);
      showLoginError(authErrorMessage(e && e.code));
      $("#login-password").value = "";
      $("#login-password").focus();
    } finally {
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  }

  async function doLogout() {
    if (!auth || !authFns) return;
    try {
      await authFns.signOut(auth);
      // onAuthStateChanged réaffichera l'écran de connexion.
    } catch (e) {
      console.error(e);
      alert("Déconnexion impossible. Réessaie.");
    }
  }

  // -------------------------------------------------------
  //  Branchement des événements
  // -------------------------------------------------------
  function wireEvents() {
    // Header
    $("#btn-add").addEventListener("click", () => openModal(null));
    $("#btn-switch").addEventListener("click", doLogout);

    // Formulaire
    $("#modal-close").addEventListener("click", closeModal);
    $("#btn-cancel").addEventListener("click", closeModal);
    $("#btn-delete").addEventListener("click", deleteSite);
    $("#form").addEventListener("submit", submitForm);
    wireNaChecks();
    $("#f-files").addEventListener("change", handleFileUpload);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

    // Glisser-déposer de fichiers (plusieurs à la fois)
    const dz = $("#f-dropzone");
    if (dz) {
      ["dragenter", "dragover"].forEach((evt) =>
        dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.add("dragover"); }));
      ["dragleave", "dragend"].forEach((evt) =>
        dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); dz.classList.remove("dragover"); }));
      dz.addEventListener("drop", (e) => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove("dragover");
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
      });
    }

    // Segs du formulaire
    ["f-activite", "f-carte", "f-status"].forEach((gid) => {
      $$(`#${gid} button`).forEach((btn) =>
        btn.addEventListener("click", () => setSeg(gid, btn.dataset.val)));
    });

    // Détail
    $("#detail-close").addEventListener("click", closeDetail);
    $("#detail-modal").addEventListener("click", (e) => { if (e.target.id === "detail-modal") closeDetail(); });
    $("#detail-edit").addEventListener("click", () => {
      closeDetail();
      openModal(sites[detailSiteId]);
    });

    // Copier identifiants + télécharger les fichiers (délégation sur detail-body)
    $("#detail-body").addEventListener("click", (e) => {
      const copyBtn = e.target.closest(".btn-copy");
      if (copyBtn) {
        const txt = copyBtn.dataset.copy;
        navigator.clipboard.writeText(txt).then(() => {
          const old = copyBtn.textContent;
          copyBtn.textContent = "✅ Copié";
          setTimeout(() => { copyBtn.textContent = old; }, 1200);
        }).catch(() => alert("Copie impossible : " + txt));
        return;
      }
      const btn = e.target.closest(".btn-dl");
      if (!btn) return;
      const s = sites[btn.dataset.sid];
      if (!s || !s.files) return;
      const f = s.files[btn.dataset.fid];
      if (!f) return;
      const a = document.createElement("a");
      a.href = f.data;
      a.download = f.name;
      a.click();
    });

    // Boutons de statut rapides (délégation sur detail-status-actions)
    $("#detail-status-actions").addEventListener("click", (e) => {
      const btn = e.target.closest(".status-btn");
      if (!btn || !btn.dataset.s) return;
      const id = btn.dataset.id;
      const wasTermine = sites[id] && sites[id].statut === "termine";
      const patch = { statut: btn.dataset.s, updatedAt: Date.now(), updatedBy: me };
      if (btn.dataset.s === "termine" && !wasTermine) patch.termineAt = Date.now();
      if (btn.dataset.s !== "termine") patch.termineAt = null;
      store.update(id, patch);
      closeDetail();
    });

    // Revenus : sélecteur de dates
    $("#rev-from").addEventListener("change", () => { revFrom = ymToIndex($("#rev-from").value); renderRevenue(); });
    $("#rev-to").addEventListener("change", () => { revTo = ymToIndex($("#rev-to").value); renderRevenue(); });
    $$(".revenue-quick .chip").forEach((b) => b.addEventListener("click", () => setRevenueRange(b.dataset.range)));

    // Filtres
    $$("#filter-status .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#filter-status .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      filterStatus = c.dataset.status;
      render();
    }));
    $("#search").addEventListener("input", (e) => { searchText = e.target.value; render(); });

    // Formulaire de connexion
    $("#login-form").addEventListener("submit", doLogin);
    ["#login-email", "#login-password"].forEach((sel) =>
      $(sel).addEventListener("input", hideLoginError));
  }

  // -------------------------------------------------------
  //  Démarrage
  // -------------------------------------------------------
  async function start() {
    // Nettoyage : ancienne identité stockée par la version pré-Firebase Auth.
    try { localStorage.removeItem("seo_user"); localStorage.removeItem("seo_data"); } catch (e) { /* ignoré */ }

    const ok = await initFirebase();
    if (!ok) return; // écran d'erreur déjà affiché, rien n'est branché

    wireEvents();

    // Sélecteur de revenus : ce mois-ci par défaut
    revFrom = revTo = currentIndex();
    $("#rev-from").value = indexToYm(revFrom);
    $("#rev-to").value = indexToYm(revTo);

    let subscribed = false;

    // Firebase restaure tout seul la session au rechargement de la page.
    authFns.onAuthStateChanged(auth, (user) => {
      if (user) {
        showApp(user);
        if (!subscribed) {
          subscribed = true;
          store.subscribe((data) => { sites = data || {}; render(); });
        } else {
          render();
        }
      } else {
        currentUser = null;
        me = "";
        sites = {};
        $("#me").textContent = "";
        banner.classList.add("hidden");
        showLogin();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
