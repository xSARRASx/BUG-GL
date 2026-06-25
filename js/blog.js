// =============================================================
//  Articles de blog — Guest Lucky
//  Accès : Martin Moré, Pierre Moré, Sébastien Moré (mot de passe)
//  Revenus : 50 € / mois / client (récurrent)
//  Stockage : Firebase /blog (partagé en temps réel)
// =============================================================

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // --- Accès & mots de passe ---
  const EDITORS = ["Martin Moré", "Pierre Moré", "Sébastien Moré", "Camille Fauveau"];
  const PASSWORDS = { "Martin Moré": "martin@", "Pierre Moré": "pierre@", "Sébastien Moré": "sebastien@", "Camille Fauveau": "camille@" };
  const ADMIN = "Martin Moré"; // seul à voir les revenus

  const PRIX_MOIS = 50; // € par mois par client

  const STATUT_LABEL = { actif: "🟢 Actif", termine: "⚫ Terminé" };

  let me = localStorage.getItem("blog_user") || "";

  // --- Mois : conversions ---
  // "YYYY-MM" -> index de mois absolu (année*12 + mois)
  function ymToIndex(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
    const [y, m] = ym.split("-").map(Number);
    return y * 12 + (m - 1);
  }
  function dateToIndex(ts) {
    const d = new Date(ts);
    return d.getFullYear() * 12 + d.getMonth();
  }
  function currentIndex() {
    const d = new Date();
    return d.getFullYear() * 12 + d.getMonth();
  }
  function indexToYm(idx) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

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
    constructor() { this.key = "blog_data"; this.listeners = []; }
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
      onValue(ref(this.db, "blog"), (snap) => cb(snap.val() || {}));
    }
    add(item) {
      const { ref, push, set } = this.fns;
      const r = push(ref(this.db, "blog"));
      set(r, { ...item, id: r.key });
    }
    update(id, patch) {
      const { ref, update } = this.fns;
      update(ref(this.db, "blog/" + id), patch);
    }
    remove(id) {
      const { ref, remove } = this.fns;
      remove(ref(this.db, "blog/" + id));
    }
  }

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
        banner.textContent = "🟢 Connecté en temps réel — tout le monde voit les mêmes données.";
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
  let clients = {};
  let filterStatus = "all";
  let searchText = "";
  let editingFiles = [];
  let detailId = null;
  let revFrom = null; // index de mois
  let revTo = null;

  // Liste visible : les non-admins ne voient que leurs propres fiches
  function isAdmin() { return me === ADMIN; }
  function visibleClients() {
    const all = Object.values(clients);
    if (isAdmin()) return all;
    return all.filter((c) => c.createdBy === me);
  }

  // -------------------------------------------------------
  //  Calcul des revenus (50 € / mois / client)
  // -------------------------------------------------------
  // Nombre de mois facturés pour un client entre deux index de mois (inclus)
  function monthsBilled(c, fromIdx, toIdx) {
    let start = ymToIndex(c.debut);
    if (start == null) start = dateToIndex(c.createdAt || Date.now());
    let end;
    if (c.statut === "termine") {
      end = ymToIndex(c.fin);
      if (end == null) end = dateToIndex(c.finAt || c.updatedAt || c.createdAt || Date.now());
    } else {
      // Client actif : on projette dans le futur (on suppose qu'il continue).
      // La borne réelle est imposée par la fin de la période choisie (toIdx).
      end = Number.MAX_SAFE_INTEGER;
    }
    const a = Math.max(start, fromIdx);
    const b = Math.min(end, toIdx);
    return Math.max(0, b - a + 1);
  }

  function renderRevenue() {
    if (!isAdmin()) { $("#revenue-panel").classList.add("hidden"); return; }
    $("#revenue-panel").classList.remove("hidden");

    const from = revFrom != null ? revFrom : currentIndex();
    const to   = revTo   != null ? revTo   : currentIndex();
    const lo = Math.min(from, to), hi = Math.max(from, to);

    let totalMonths = 0, clientsCount = 0;
    Object.values(clients).forEach((c) => {
      const m = monthsBilled(c, lo, hi);
      if (m > 0) { totalMonths += m; clientsCount++; }
    });

    $("#rev-total").textContent = (totalMonths * PRIX_MOIS) + " €";
    $("#rev-months").textContent = totalMonths;
    $("#rev-clients").textContent = clientsCount;
  }

  // -------------------------------------------------------
  //  Stats du haut
  // -------------------------------------------------------
  function renderStats() {
    const arr = visibleClients();
    const total   = arr.length;
    const actifs  = arr.filter((c) => c.statut === "actif").length;
    const termine = arr.filter((c) => c.statut === "termine").length;

    let html = `
      <div class="stat-card"><div class="num">${total}</div><div class="lbl">Total clients</div></div>
      <div class="stat-card green"><div class="num">${actifs}</div><div class="lbl">Actifs</div></div>
      <div class="stat-card"><div class="num" style="color:var(--muted)">${termine}</div><div class="lbl">Terminés</div></div>
    `;
    if (isAdmin()) {
      // Revenus récurrents du mois en cours
      const cur = currentIndex();
      let moisCourant = 0;
      Object.values(clients).forEach((c) => { if (monthsBilled(c, cur, cur) > 0) moisCourant++; });
      html += `<div class="stat-card" style="border-color:rgba(108,92,231,0.5)">
        <div class="num" style="color:#a99bff">${moisCourant * PRIX_MOIS} €</div><div class="lbl">Revenus ce mois-ci</div></div>`;
    }
    $("#stats").innerHTML = html;
  }

  // -------------------------------------------------------
  //  Rendu des cartes
  // -------------------------------------------------------
  function render() {
    let arr = visibleClients();

    if (filterStatus !== "all") arr = arr.filter((c) => c.statut === filterStatus);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      arr = arr.filter((c) =>
        [c.nom, c.url, c.email, c.note, c.wpLogin, c.secteur, c.ville, c.motsCles].join(" ").toLowerCase().includes(q));
    }

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

    list.innerHTML = arr.map((c) => {
      const cardClass = c.statut === "termine" ? "b-termine" : "b-actif";
      const files = c.files ? Object.values(c.files) : [];
      return `
        <div class="card ${cardClass}" data-id="${c.id}">
          <div class="card-top">
            <div class="badges">
              <span class="badge statut-${c.statut}">${STATUT_LABEL[c.statut] || ""}</span>
            </div>
            ${c.debut ? `<span class="card-ville">📅 ${escapeHtml(c.debut)}</span>` : ""}
          </div>
          <h3>${escapeHtml(c.nom || "")}</h3>
          ${c.url ? `<div class="card-url"><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🌐 ${escapeHtml(c.url)}</a></div>` : ""}
          ${c.wpLogin ? `<div class="card-ville">🔑 ${escapeHtml(c.wpLogin)}</div>` : ""}
          ${c.note ? `<div class="blog-note">${escapeHtml(c.note)}</div>` : ""}
          <div class="card-foot">
            <span>${c.email ? `<a href="mailto:${escapeHtml(c.email)}" onclick="event.stopPropagation()">✉️ ${escapeHtml(c.email)}</a>` : ""}</span>
            ${files.length ? `<span>📎 ${files.length}</span>` : ""}
          </div>
          <div class="card-actions">
            <button class="btn-card" onclick="event.stopPropagation();window._blogDetail('${c.id}')">👁 Voir</button>
            <button class="btn-card" onclick="event.stopPropagation();window._blogEdit('${c.id}')">✏️ Modifier</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // -------------------------------------------------------
  //  Détail (Voir)
  // -------------------------------------------------------
  function openDetail(id) {
    const c = clients[id];
    if (!c) return;
    detailId = id;
    const files = c.files ? Object.values(c.files) : [];
    const articles = c.articles
      ? Object.values(c.articles).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      : [];
    const date = c.createdAt
      ? new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "";

    $("#detail-title").textContent = c.nom || "Client";
    $("#detail-body").innerHTML = `
      <div class="badges detail-badges">
        <span class="badge statut-${c.statut}">${STATUT_LABEL[c.statut] || ""}</span>
        ${c.debut ? `<span class="badge" style="background:rgba(108,92,231,0.15);color:#a99bff">📅 depuis ${escapeHtml(c.debut)}</span>` : ""}
      </div>
      ${c.url ? `<h4 class="detail-label">🌐 Site internet</h4><div class="detail-desc"><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" style="color:#a99bff">${escapeHtml(c.url)}</a></div>` : ""}
      <h4 class="detail-label">🔑 Accès WordPress</h4>
      <div class="creds-box">
        ${c.wpLogin ? `<div class="cred-line"><span class="cred-label">Identifiant</span><span class="cred-val" id="cv-login">${escapeHtml(c.wpLogin)}</span><button class="btn-copy" data-copy="${escapeHtml(c.wpLogin)}">📋 Copier</button></div>` : `<div class="cred-line"><span class="cred-label">Identifiant</span><span class="cred-val" style="color:var(--muted)">— non renseigné —</span></div>`}
        ${c.wpPass ? `<div class="cred-line"><span class="cred-label">Mot de passe</span><span class="cred-val" id="cv-pass">${escapeHtml(c.wpPass)}</span><button class="btn-copy" data-copy="${escapeHtml(c.wpPass)}">📋 Copier</button></div>` : `<div class="cred-line"><span class="cred-label">Mot de passe</span><span class="cred-val" style="color:var(--muted)">— non renseigné —</span></div>`}
      </div>
      ${(c.email || c.phone) ? `<h4 class="detail-label">📇 Contact</h4>
        <div class="detail-client">
          ${c.email ? `<div>✉️ <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></div>` : ""}
          ${c.phone ? `<div>📞 <a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></div>` : ""}
        </div>` : ""}
      ${(c.secteur || c.ville || c.motsCles || c.ton || c.publicCible) ? `
        <h4 class="detail-label">🎯 Brief SEO</h4>
        <div class="detail-client">
          ${c.secteur ? `<div>🏷️ <b>Secteur :</b> ${escapeHtml(c.secteur)}</div>` : ""}
          ${c.ville ? `<div>📍 <b>Zone :</b> ${escapeHtml(c.ville)}</div>` : ""}
          ${c.motsCles ? `<div>🔑 <b>Mots-clés :</b> ${escapeHtml(c.motsCles)}</div>` : ""}
          ${c.ton ? `<div>🗣️ <b>Ton :</b> ${escapeHtml(c.ton)}</div>` : ""}
          ${c.publicCible ? `<div>👥 <b>Public :</b> ${escapeHtml(c.publicCible)}</div>` : ""}
        </div>` : ""}
      ${c.note ? `<h4 class="detail-label">📝 Note</h4><div class="detail-desc">${escapeHtml(c.note)}</div>` : ""}
      <h4 class="detail-label">📰 Journal des articles${articles.length ? ` (${articles.length})` : ""}</h4>
      <div class="articles-journal">
        ${articles.length ? articles.map((a) => `
          <div class="article-row">
            <div class="article-main">
              <span class="article-mois">${escapeHtml(a.mois || "")}</span>
              <span class="article-titre" title="${escapeHtml(a.titre || "")}">${escapeHtml(a.titre || "")}</span>
            </div>
            <div class="article-side">
              ${a.lien ? `<a href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">🔗 voir</a>` : ""}
              <button class="rm-article" data-aid="${escapeHtml(a.id)}" title="Supprimer">×</button>
            </div>
          </div>`).join("") : `<div class="article-empty">Aucun article enregistré pour l'instant.</div>`}
      </div>
      <div class="article-add">
        <button type="button" class="btn btn-ghost" id="article-add-toggle">+ Ajouter un article</button>
        <div class="article-form hidden" id="article-form">
          <input type="month" id="art-mois" />
          <input type="text" id="art-titre" placeholder="Titre de l'article" />
          <input type="text" id="art-lien" placeholder="Lien (facultatif)" />
          <button type="button" class="btn btn-primary" id="art-save">Enregistrer</button>
        </div>
      </div>
      ${files.length ? `
        <h4 class="detail-label">📎 Fichiers joints</h4>
        <div class="detail-files">
          ${files.map((f) => `
            <div class="file-chip">
              <span>📄</span>
              <span class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
              <button class="btn-dl" data-fid="${escapeHtml(f.id)}" data-sid="${escapeHtml(c.id)}">⬇️ Télécharger</button>
            </div>`).join("")}
        </div>` : ""}
      <div class="detail-meta">${c.createdBy ? "Ajouté par " + escapeHtml(c.createdBy) : ""}${date ? " · le " + date : ""}</div>
    `;

    $("#detail-status-actions").innerHTML = `
      <div class="detail-status-label">Changer le statut rapidement</div>
      <div class="detail-status-btns">
        <button class="status-btn ${c.statut === "actif"   ? "active traite"  : ""}" data-s="actif"   data-id="${c.id}">🟢 Actif</button>
        <button class="status-btn ${c.statut === "termine" ? "active nontraite" : ""}" data-s="termine" data-id="${c.id}">⚫ Terminé</button>
      </div>
    `;

    $("#detail-modal").classList.remove("hidden");
  }
  function closeDetail() { $("#detail-modal").classList.add("hidden"); }

  window._blogDetail = openDetail;
  window._blogEdit = function (id) { openModal(clients[id]); };

  // -------------------------------------------------------
  //  Formulaire
  // -------------------------------------------------------
  function getSeg(gid) { const a = $(`#${gid} button.active`); return a ? a.dataset.val : null; }
  function setSeg(gid, val) { $$(`#${gid} button`).forEach((b) => b.classList.toggle("active", b.dataset.val === val)); }

  function openModal(c) {
    const isEdit = Boolean(c);
    $("#modal-title").textContent = isEdit ? "Modifier le client" : "Nouveau client";
    $("#f-id").value = isEdit ? c.id : "";
    setSeg("f-status", isEdit ? (c.statut || "actif") : "actif");
    $("#f-debut").value = isEdit ? (c.debut || indexToYm(currentIndex())) : indexToYm(currentIndex());
    $("#f-nom").value      = isEdit ? (c.nom || "") : "";
    $("#f-email").value    = isEdit ? (c.email || "") : "";
    $("#f-phone").value    = isEdit ? (c.phone || "") : "";
    $("#f-url").value      = isEdit ? (c.url || "") : "";
    $("#f-wp-login").value = isEdit ? (c.wpLogin || "") : "";
    $("#f-wp-pass").value  = isEdit ? (c.wpPass || "") : "";
    $("#f-secteur").value  = isEdit ? (c.secteur || "") : "";
    $("#f-ville").value    = isEdit ? (c.ville || "") : "";
    $("#f-motscles").value = isEdit ? (c.motsCles || "") : "";
    $("#f-ton").value      = isEdit ? (c.ton || "") : "";
    $("#f-public").value   = isEdit ? (c.publicCible || "") : "";
    $("#f-note").value     = isEdit ? (c.note || "") : "";
    editingFiles = isEdit && c.files ? Object.values(c.files) : [];
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
      </div>`).join("");
    $$(".rm-file").forEach((btn) => btn.addEventListener("click", () => {
      editingFiles = editingFiles.filter((f) => f.id !== btn.dataset.fid);
      renderFilesPreview();
    }));
  }

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
    const statut = getSeg("f-status");
    const data = {
      statut,
      debut:   $("#f-debut").value,
      nom:     $("#f-nom").value.trim(),
      email:   $("#f-email").value.trim(),
      phone:   $("#f-phone").value.trim(),
      url:     $("#f-url").value.trim(),
      wpLogin: $("#f-wp-login").value.trim(),
      wpPass:  $("#f-wp-pass").value,
      secteur:     $("#f-secteur").value.trim(),
      ville:       $("#f-ville").value.trim(),
      motsCles:    $("#f-motscles").value.trim(),
      ton:         $("#f-ton").value,
      publicCible: $("#f-public").value.trim(),
      note:    $("#f-note").value.trim(),
      files:   editingFiles.reduce((acc, f) => { acc[f.id] = f; return acc; }, {}),
      updatedAt: Date.now(),
      updatedBy: me,
    };
    if (!data.nom) return;

    if (id) {
      const wasTermine = clients[id] && clients[id].statut === "termine";
      // Mémorise le mois de fin quand on passe en « terminé »
      if (statut === "termine" && !wasTermine) { data.finAt = Date.now(); data.fin = indexToYm(currentIndex()); }
      if (statut === "actif") { data.fin = null; data.finAt = null; }
      store.update(id, data);
    } else {
      store.add({ ...data, createdAt: Date.now(), createdBy: me });
    }
    closeModal();
  }

  function deleteClient() {
    const id = $("#f-id").value;
    if (id && confirm("Supprimer définitivement ce client ?")) {
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
    $("#blog-app").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#who-modal").classList.remove("hidden");
  }

  function setIdentity(name) {
    me = name;
    localStorage.setItem("blog_user", name);
    $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(name)}</b>`;
    $("#who-modal").classList.add("hidden");
    $("#access-denied").classList.add("hidden");
    $("#blog-app").classList.remove("hidden");
    render();
  }

  function tryPassword() {
    if (!pendingName) return;
    if ($("#pwd-input").value === PASSWORDS[pendingName]) {
      $("#pwd-error").style.display = "none";
      setIdentity(pendingName);
    } else {
      $("#pwd-error").style.display = "block";
      $("#pwd-input").value = "";
      $("#pwd-input").focus();
    }
  }

  // -------------------------------------------------------
  //  Revenus : contrôles
  // -------------------------------------------------------
  function applyRevenueInputs() {
    revFrom = ymToIndex($("#rev-from").value);
    revTo   = ymToIndex($("#rev-to").value);
    renderRevenue();
  }
  function setRevenueRange(kind) {
    const now = new Date();
    if (kind === "mois") {
      revFrom = revTo = currentIndex();
    } else if (kind === "annee") {
      revFrom = now.getFullYear() * 12 + 0;   // janvier
      revTo = currentIndex();
    } else if (kind === "annee-proj") {
      revFrom = now.getFullYear() * 12 + 0;    // janvier
      revTo = now.getFullYear() * 12 + 11;     // décembre (projection)
    } else if (kind === "fin-annee") {
      revFrom = currentIndex();                // ce mois-ci
      revTo = now.getFullYear() * 12 + 11;     // jusqu'à décembre (projection)
    } else if (kind === "tout") {
      let min = currentIndex();
      Object.values(clients).forEach((c) => {
        let s = ymToIndex(c.debut);
        if (s == null) s = dateToIndex(c.createdAt || Date.now());
        if (s < min) min = s;
      });
      revFrom = min;
      revTo = currentIndex();
    }
    $("#rev-from").value = indexToYm(revFrom);
    $("#rev-to").value = indexToYm(revTo);
    renderRevenue();
  }

  // -------------------------------------------------------
  //  Événements
  // -------------------------------------------------------
  function wireEvents() {
    $("#btn-add").addEventListener("click", () => openModal(null));
    $("#btn-switch").addEventListener("click", () => {
      me = "";
      localStorage.removeItem("blog_user");
      askIdentity();
    });

    $("#modal-close").addEventListener("click", closeModal);
    $("#btn-cancel").addEventListener("click", closeModal);
    $("#btn-delete").addEventListener("click", deleteClient);
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

    $$("#f-status button").forEach((btn) => btn.addEventListener("click", () => setSeg("f-status", btn.dataset.val)));

    $("#detail-close").addEventListener("click", closeDetail);
    $("#detail-modal").addEventListener("click", (e) => { if (e.target.id === "detail-modal") closeDetail(); });
    $("#detail-edit").addEventListener("click", () => { closeDetail(); openModal(clients[detailId]); });

    // Copier identifiants + télécharger fichiers (délégation)
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
      const dl = e.target.closest(".btn-dl");
      if (dl) {
        const c = clients[dl.dataset.sid];
        if (!c || !c.files) return;
        const f = c.files[dl.dataset.fid];
        if (!f) return;
        const a = document.createElement("a");
        a.href = f.data; a.download = f.name; a.click();
        return;
      }

      // --- Journal des articles ---
      const toggle = e.target.closest("#article-add-toggle");
      if (toggle) {
        const form = $("#article-form");
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden")) {
          if (!$("#art-mois").value) $("#art-mois").value = indexToYm(currentIndex());
          $("#art-titre").focus();
        }
        return;
      }

      const saveBtn = e.target.closest("#art-save");
      if (saveBtn) {
        const c = clients[detailId];
        if (!c) return;
        const titre = $("#art-titre").value.trim();
        if (!titre) { $("#art-titre").focus(); return; }
        const aid = uid();
        const articles = Object.assign({}, c.articles || {});
        articles[aid] = {
          id: aid,
          mois: $("#art-mois").value || indexToYm(currentIndex()),
          titre,
          lien: $("#art-lien").value.trim(),
          createdAt: Date.now(),
          createdBy: me,
        };
        clients[detailId] = Object.assign({}, c, { articles });
        store.update(detailId, { articles });
        openDetail(detailId);
        return;
      }

      const rmA = e.target.closest(".rm-article");
      if (rmA) {
        const c = clients[detailId];
        if (!c || !c.articles) return;
        if (!confirm("Supprimer cet article du journal ?")) return;
        const articles = Object.assign({}, c.articles);
        delete articles[rmA.dataset.aid];
        clients[detailId] = Object.assign({}, c, { articles });
        store.update(detailId, { articles });
        openDetail(detailId);
        return;
      }
    });

    $("#detail-status-actions").addEventListener("click", (e) => {
      const btn = e.target.closest(".status-btn");
      if (!btn || !btn.dataset.s) return;
      const id = btn.dataset.id;
      const wasTermine = clients[id] && clients[id].statut === "termine";
      const patch = { statut: btn.dataset.s, updatedAt: Date.now(), updatedBy: me };
      if (btn.dataset.s === "termine" && !wasTermine) { patch.finAt = Date.now(); patch.fin = indexToYm(currentIndex()); }
      if (btn.dataset.s === "actif") { patch.fin = null; patch.finAt = null; }
      store.update(id, patch);
      closeDetail();
    });

    $$("#filter-status .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#filter-status .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active"); filterStatus = c.dataset.status; render();
    }));
    $("#search").addEventListener("input", (e) => { searchText = e.target.value; render(); });

    // Revenus
    $("#rev-from").addEventListener("change", applyRevenueInputs);
    $("#rev-to").addEventListener("change", applyRevenueInputs);
    $$(".revenue-quick .chip").forEach((b) => b.addEventListener("click", () => setRevenueRange(b.dataset.range)));

    // Identité
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

    // valeurs par défaut du sélecteur de revenus : ce mois-ci
    revFrom = revTo = currentIndex();
    $("#rev-from").value = indexToYm(revFrom);
    $("#rev-to").value = indexToYm(revTo);

    store.subscribe((data) => { clients = data || {}; render(); });

    if (me && EDITORS.includes(me)) {
      $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(me)}</b>`;
      $("#blog-app").classList.remove("hidden");
      $("#access-denied").classList.add("hidden");
      render();
    } else {
      me = "";
      localStorage.removeItem("blog_user");
      askIdentity();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
