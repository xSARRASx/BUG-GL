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

  // --- Accès & mots de passe ---
  const SEO_EDITORS = ["Martin Moré", "Camille Fauveau", "Sébastien Moré", "Pierre Moré"];
  const SEO_PASSWORDS = { "Martin Moré": "martin@", "Camille Fauveau": "camille@", "Sébastien Moré": "sebastien@", "Pierre Moré": "pierre@" };

  // --- Labels ---
  const STATUT_LABEL = { afaire: "🔴 À faire", encours: "🟠 En cours", termine: "🟢 Terminé" };
  const ACTIVITE_LABEL = { conciergerie: "🏨 Conciergerie", sous_location: "🏠 Sous-location" };
  // Mapping statut → classe CSS pill existante
  const PILL_CLASS = { afaire: "nontraite", encours: "encours", termine: "traite" };

  // --- Identité ---
  let me = localStorage.getItem("seo_user") || "";

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
  //  Stores
  // -------------------------------------------------------
  class LocalStore {
    constructor() { this.key = "seo_data"; this.listeners = []; }
    _read() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } }
    _write(d) { localStorage.setItem(this.key, JSON.stringify(d)); this._emit(); }
    _emit() { this.listeners.forEach((cb) => cb(this._read())); }
    subscribe(cb) { this.listeners.push(cb); cb(this._read()); }
    add(item) { const d = this._read(); const id = uid(); d[id] = { ...item, id }; this._write(d); }
    update(id, patch) { const d = this._read(); if (d[id]) { d[id] = { ...d[id], ...patch }; this._write(d); } }
    remove(id) { const d = this._read(); delete d[id]; this._write(d); }
  }

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
  //  Initialisation du store
  // -------------------------------------------------------
  let store;
  const banner = $("#status-banner");

  async function initStore() {
    if (window.firebaseActive) {
      try {
        const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const dbMod  = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
        const apps = appMod.getApps ? appMod.getApps() : [];
        const app = apps.length ? apps[0] : appMod.initializeApp(window.firebaseConfig);
        const db = dbMod.getDatabase(app);
        const fns = {
          ref: dbMod.ref, onValue: dbMod.onValue, push: dbMod.push,
          set: dbMod.set, update: dbMod.update, remove: dbMod.remove,
        };
        store = new FirebaseStore(db, fns);
        banner.className = "status-banner live";
        banner.textContent = "🟢 Connecté en temps réel — Camille et Martin voient les mêmes données.";
        banner.classList.remove("hidden");
        return;
      } catch (e) {
        console.error(e);
        banner.className = "status-banner error";
        banner.textContent = "⚠️ Connexion Firebase impossible. Les données restent sur cet appareil.";
        banner.classList.remove("hidden");
      }
    }
    store = new LocalStore();
    banner.className = "status-banner local";
    banner.textContent = "💡 Mode local : données non partagées (Firebase non configuré).";
    banner.classList.remove("hidden");
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
  //  Panneau revenus (50 € par site terminé)
  // -------------------------------------------------------
  function renderRevenue() {
    const from = revFrom != null ? revFrom : currentIndex();
    const to   = revTo   != null ? revTo   : currentIndex();
    const lo = Math.min(from, to), hi = Math.max(from, to);
    let count = 0;
    Object.values(sites).forEach((s) => {
      if (s.statut !== "termine") return;
      const idx = termineIndex(s);
      if (idx >= lo && idx <= hi) count++;
    });
    $("#rev-total").textContent = (count * 40) + " €";
    $("#rev-count").textContent = count;
  }

  function setRevenueRange(kind) {
    const now = new Date();
    if (kind === "mois") {
      revFrom = revTo = currentIndex();
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
          </div>
        </div>
      `;
    }).join("");
  }

  // -------------------------------------------------------
  //  Fenêtre de lecture (Voir)
  // -------------------------------------------------------
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
      ${(s.adminUrl || s.login || s.pass) ? `
        <h4 class="detail-label">🔑 Accès au site</h4>
        <div class="creds-box">
          ${s.adminUrl ? `<div class="cred-line"><span class="cred-label">Lien admin</span><span class="cred-val"><a href="${escapeHtml(s.adminUrl)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.adminUrl)}</a></span><button class="btn-copy" data-copy="${escapeHtml(s.adminUrl)}">📋 Copier</button></div>` : ""}
          ${s.login ? `<div class="cred-line"><span class="cred-label">Identifiant</span><span class="cred-val">${escapeHtml(s.login)}</span><button class="btn-copy" data-copy="${escapeHtml(s.login)}">📋 Copier</button></div>` : ""}
          ${s.pass ? `<div class="cred-line"><span class="cred-label">Mot de passe</span><span class="cred-val">${escapeHtml(s.pass)}</span><button class="btn-copy" data-copy="${escapeHtml(s.pass)}">📋 Copier</button></div>` : ""}
        </div>` : ""}
      ${s.gmb ? `<h4 class="detail-label">🗺️ Google My Business</h4><div class="detail-desc"><a href="${escapeHtml(s.gmb)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.gmb)}</a></div>` : ""}
      ${s.drive ? `<h4 class="detail-label">🔗 Lien Drive / fichier</h4><div class="detail-desc"><a href="${escapeHtml(s.drive)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(s.drive)}</a></div>` : ""}
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
      files:    editingFiles.reduce((acc, f) => { acc[f.id] = f; return acc; }, {}),
      updatedAt: Date.now(),
      updatedBy: me,
    };
    if (!data.nom) return;
    if (!data.ville) {
      alert("📍 La ville est obligatoire. Merci de la renseigner.");
      $("#f-ville").focus();
      return;
    }

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
  //  Identité + mot de passe
  // -------------------------------------------------------
  let pendingName = null;

  function askIdentity() {
    pendingName = null;
    $("#pwd-box").classList.add("hidden");
    $("#pwd-input").value = "";
    $("#pwd-error").style.display = "none";
    $$(".who-buttons button").forEach((b) => b.classList.remove("selected"));
    $("#who-modal").classList.remove("hidden");
  }

  function setIdentity(name) {
    me = name;
    localStorage.setItem("seo_user", name);
    $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(name)}</b>`;
    $("#who-modal").classList.add("hidden");
    $("#seo-app").classList.remove("hidden");
    $("#access-denied").classList.add("hidden");
  }

  function tryPassword() {
    if (!pendingName) return;
    const val = $("#pwd-input").value;
    if (val === SEO_PASSWORDS[pendingName]) {
      $("#pwd-error").style.display = "none";
      setIdentity(pendingName);
    } else {
      $("#pwd-error").style.display = "block";
      $("#pwd-input").value = "";
      $("#pwd-input").focus();
    }
  }

  // -------------------------------------------------------
  //  Branchement des événements
  // -------------------------------------------------------
  function wireEvents() {
    // Header
    $("#btn-add").addEventListener("click", () => openModal(null));
    $("#btn-switch").addEventListener("click", () => {
      me = "";
      localStorage.removeItem("seo_user");
      $("#seo-app").classList.add("hidden");
      $("#access-denied").classList.add("hidden");
      askIdentity();
    });

    // Formulaire
    $("#modal-close").addEventListener("click", closeModal);
    $("#btn-cancel").addEventListener("click", closeModal);
    $("#btn-delete").addEventListener("click", deleteSite);
    $("#form").addEventListener("submit", submitForm);
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

    // Who-modal : clic sur nom → affiche champ mot de passe
    $$("#who-buttons button").forEach((b) => {
      b.addEventListener("click", () => {
        pendingName = b.dataset.name;
        $$(".who-buttons button").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        $("#pwd-input").value = "";
        $("#pwd-error").style.display = "none";
        $("#pwd-box").classList.remove("hidden");
        setTimeout(() => $("#pwd-input").focus(), 50);
      });
    });

    $("#pwd-ok").addEventListener("click", tryPassword);
    $("#pwd-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryPassword(); });
  }

  // -------------------------------------------------------
  //  Démarrage
  // -------------------------------------------------------
  async function start() {
    await initStore();
    wireEvents();

    // Sélecteur de revenus : ce mois-ci par défaut
    revFrom = revTo = currentIndex();
    $("#rev-from").value = indexToYm(revFrom);
    $("#rev-to").value = indexToYm(revTo);

    store.subscribe((data) => { sites = data || {}; render(); });

    if (me && SEO_EDITORS.includes(me)) {
      // Déjà connecté (localStorage) → affiche directement
      $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(me)}</b>`;
      $("#seo-app").classList.remove("hidden");
      $("#access-denied").classList.add("hidden");
    } else {
      me = "";
      localStorage.removeItem("seo_user");
      askIdentity();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
