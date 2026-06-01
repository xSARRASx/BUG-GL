// =============================================================
//  Suivi des bugs & améliorations — Guest Lucky
//  Fonctionne en 2 modes :
//   - Mode LOCAL (par défaut) : données dans le navigateur.
//   - Mode FIREBASE : temps réel partagé (voir GUIDE.md).
//
//  NOTE : ce fichier est un script "classique" (pas un module)
//  pour qu'il fonctionne même en double-cliquant sur index.html.
// =============================================================

(function () {
  "use strict";

  // -------------------------------------------------------------
  //  Petits utilitaires
  // -------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Numéro de ticket lisible : 7 -> "#007"
  const fmtTicket = (n) => (n ? "#" + String(n).padStart(3, "0") : "");

  const STATUS_LABEL = { nontraite: "Pas traité", encours: "En cours", traite: "Traité" };
  const TYPE_LABEL = { bug: "🐞 Bug", amelioration: "✨ Amélioration", developpement: "🛠️ Développement" };
  const PRIO_LABEL = { tres_urgente: "🚨 TRÈS URGENTE", haute: "🔥 Haute", moyenne: "Moyenne", basse: "Basse" };
  const PRIO_ORDER = { tres_urgente: 0, haute: 1, moyenne: 2, basse: 3 };

  const AVATAR_COLORS = ["#6c5ce7", "#2ecc8f", "#ffa630", "#ff5c7a", "#00b8d9", "#e056fd"];
  const colorFor = (name) => {
    let h = 0;
    for (const ch of name) h = ch.charCodeAt(0) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  };
  const initials = (name) =>
    name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // Compression d'image dans le navigateur -> dataURL légère
  function compressImage(file, maxSize = 1200, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            const ratio = Math.min(maxSize / width, maxSize / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // -------------------------------------------------------------
  //  Identité de l'utilisateur (qui modifie ?)
  // -------------------------------------------------------------
  let me = localStorage.getItem("bugtracker_user") || "";

  // -------------------------------------------------------------
  //  Couche de stockage : LocalStore ou FirebaseStore
  // -------------------------------------------------------------
  class LocalStore {
    constructor() {
      this.key = "bugtracker_data";
      this.listeners = [];
    }
    _read() {
      try { return JSON.parse(localStorage.getItem(this.key)) || {}; }
      catch { return {}; }
    }
    _write(data) {
      localStorage.setItem(this.key, JSON.stringify(data));
      this._emit();
    }
    _emit() { this.listeners.forEach((cb) => cb(this._read())); }
    subscribe(cb) { this.listeners.push(cb); cb(this._read()); }
    add(bug) { const d = this._read(); const id = uid(); d[id] = { ...bug, id }; this._write(d); }
    update(id, patch) { const d = this._read(); if (d[id]) { d[id] = { ...d[id], ...patch }; this._write(d); } }
    remove(id) { const d = this._read(); delete d[id]; this._write(d); }
    setPresence() {}
    subscribePresence() {}
  }

  class FirebaseStore {
    constructor(db, fns) { this.db = db; this.fns = fns; }
    subscribe(cb) {
      const { ref, onValue } = this.fns;
      onValue(ref(this.db, "bugs"), (snap) => cb(snap.val() || {}));
    }
    add(bug) {
      const { ref, push, set } = this.fns;
      const r = push(ref(this.db, "bugs"));
      set(r, { ...bug, id: r.key });
    }
    update(id, patch) {
      const { ref, update } = this.fns;
      update(ref(this.db, "bugs/" + id), patch);
    }
    remove(id) {
      const { ref, remove } = this.fns;
      remove(ref(this.db, "bugs/" + id));
    }
    setPresence(name) {
      const { ref, push, set, onDisconnect, serverTimestamp } = this.fns;
      const r = push(ref(this.db, "presence"));
      set(r, { name, at: serverTimestamp() });
      onDisconnect(r).remove();
      this._presenceRef = r;
    }
    subscribePresence(cb) {
      const { ref, onValue } = this.fns;
      onValue(ref(this.db, "presence"), (snap) => cb(snap.val() || {}));
    }
  }

  // -------------------------------------------------------------
  //  Initialisation du stockage
  // -------------------------------------------------------------
  let store;
  const banner = $("#status-banner");

  async function initStore() {
    if (window.firebaseActive) {
      try {
        // Import dynamique du SDK Firebase (uniquement si configuré)
        const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
        const app = appMod.initializeApp(window.firebaseConfig);
        const db = dbMod.getDatabase(app);
        const fns = {
          ref: dbMod.ref, onValue: dbMod.onValue, push: dbMod.push,
          set: dbMod.set, update: dbMod.update, remove: dbMod.remove,
          onDisconnect: dbMod.onDisconnect, serverTimestamp: dbMod.serverTimestamp,
        };
        store = new FirebaseStore(db, fns);
        banner.className = "status-banner live";
        banner.textContent = "🟢 Connecté en temps réel — tout le monde voit les mêmes données.";
        return;
      } catch (e) {
        console.error(e);
        banner.className = "status-banner error";
        banner.textContent = "⚠️ Connexion Firebase impossible. Vérifie ta config (voir GUIDE.md). On reste en mode local.";
        store = new LocalStore();
        return;
      }
    }
    store = new LocalStore();
    banner.className = "status-banner local";
    banner.textContent = "💡 Mode local : les données restent sur cet ordinateur (non partagées). Branche Firebase pour le partage — voir GUIDE.md.";
  }

  // -------------------------------------------------------------
  //  Alertes par email (via EmailJS)
  // -------------------------------------------------------------
  function initEmail() {
    if (window.emailActive && window.emailjs) {
      try { window.emailjs.init({ publicKey: window.emailConfig.publicKey }); }
      catch (e) { console.error("Init EmailJS impossible :", e); }
    }
  }

  const TYPE_UPPER = { bug: "BUG", amelioration: "AMÉLIORATION", developpement: "DÉVELOPPEMENT" };

  // Bouton « Test mail » : diagnostic visible à l'écran
  function testMail() {
    if (!window.emailActive) {
      alert("⚠️ La configuration des mails n'est pas active (clés manquantes dans email-config.js).");
      return;
    }
    if (!window.emailjs) {
      alert("⚠️ La librairie d'envoi de mails n'est pas chargée.\n\nRecharge la page (idéalement en navigation privée : Cmd+Shift+N).");
      return;
    }
    const cfg = window.emailConfig;
    const dest = cfg.team[me] || "martinmorebkk@gmail.com";
    window.emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: dest,
      to_name: me || "Test",
      subject: "🔔 Test — Suivi Guest Lucky",
      message: "Ceci est un mail de test. Si tu le reçois, les alertes fonctionnent ! 🎉",
    })
      .then(() => alert("✅ Mail de test ENVOYÉ à " + dest + "\n\nVérifie ta boîte de réception (et les spams)."))
      .catch((e) => alert("❌ Échec de l'envoi :\n\n" + (e && (e.text || e.message) ? (e.text || e.message) : JSON.stringify(e))));
  }

  // kind : "new" (nouvelle fiche) ou "traite" (passée en traité)
  function notify(kind, bug, actor) {
    if (!window.emailActive || !window.emailjs) return;
    const cfg = window.emailConfig;
    let recipients = Object.entries(cfg.team || {});
    recipients = recipients.filter(([, email]) => email && email.trim()); // ignore les personnes sans email
    if (!cfg.notifySelf) recipients = recipients.filter(([name]) => name !== actor);
    if (recipients.length === 0) return;

    const prio = PRIO_LABEL[bug.priority] || bug.priority;
    let subject, message;
    if (kind === "new") {
      subject = `🆕 Nouveau ${TYPE_UPPER[bug.type] || "ÉLÉMENT"} — Priorité : ${prio}`;
      message = `Une nouvelle fiche vient d'être ajoutée dans le suivi Guest Lucky.\n\n`
        + `• Type : ${TYPE_UPPER[bug.type] || bug.type}\n`
        + `• Priorité : ${prio}\n`
        + `• Ajoutée par : ${actor}\n\n`
        + `Connecte-toi à l'outil pour voir le détail :\nhttps://xsarrasx.github.io/BUG-GL/`;
    } else {
      const tick = fmtTicket(bug.ticket);
      subject = `✅ Ticket ${tick} traité par ${actor}`;
      message = `Une fiche vient d'être marquée comme TRAITÉE.\n\n`
        + `• Ticket : ${tick}\n`
        + `• Type : ${TYPE_UPPER[bug.type] || bug.type}\n`
        + `• Priorité : ${prio}\n`
        + `• Traitée par : ${actor}\n\n`
        + `Pour la retrouver : tape "${tick}" dans la barre de recherche de l'outil.\n`
        + `https://xsarrasx.github.io/BUG-GL/`;
    }

    recipients.forEach(([name, email]) => {
      window.emailjs.send(cfg.serviceId, cfg.templateId, {
        to_email: email,
        to_name: name,
        subject,
        message,
      }).catch((e) => console.error("Échec envoi mail à " + email, e));
    });
  }

  // -------------------------------------------------------------
  //  État de l'affichage
  // -------------------------------------------------------------
  let bugs = {};
  let filterStatus = "all";
  let filterType = "all";
  let filterPriority = "all";
  let searchText = "";
  let sortMode = "recent";
  let editingPhotos = [];

  // -------------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------------
  // Prochain numéro de ticket disponible
  function nextTicket() {
    const nums = Object.values(bugs).map((b) => b.ticket || 0);
    return (nums.length ? Math.max(...nums) : 0) + 1;
  }

  // Attribue un numéro aux anciennes fiches qui n'en ont pas (une seule fois)
  function maybeBackfillTickets() {
    const missing = Object.values(bugs).filter((b) => !b.ticket);
    if (missing.length === 0) return;
    let max = Math.max(0, ...Object.values(bugs).map((b) => b.ticket || 0));
    missing.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    missing.forEach((b) => { max += 1; store.update(b.id, { ticket: max }); });
  }

  function render() {
    const list = $("#list");
    let arr = Object.values(bugs);

    if (filterStatus !== "all") arr = arr.filter((b) => b.status === filterStatus);
    if (filterType !== "all") arr = arr.filter((b) => b.type === filterType);
    if (filterPriority !== "all") arr = arr.filter((b) => b.priority === filterPriority);
    if (searchText) {
      const q = searchText.toLowerCase().trim();
      arr = arr.filter((b) => {
        const hay = [
          b.title, b.description, b.listings,
          fmtTicket(b.ticket), "#" + (b.ticket || ""), b.ticket || ""
        ].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    arr.sort((a, b) => {
      // Les fiches traitées descendent toujours tout en bas de la liste
      const at = a.status === "traite" ? 1 : 0;
      const bt = b.status === "traite" ? 1 : 0;
      if (at !== bt) return at - bt;
      // Ensuite, le tri choisi s'applique normalement
      if (sortMode === "recent") return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortMode === "ancien") return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortMode === "priorite") return PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority];
      return 0;
    });

    renderStats();

    const total = Object.keys(bugs).length;
    const emptyEl = $("#empty");
    if (arr.length === 0) {
      if (total === 0) {
        emptyEl.innerHTML = `<p>Aucune fiche pour l'instant.</p>
          <button class="btn btn-primary" onclick="document.getElementById('btn-add').click()">Créer la première fiche</button>`;
      } else {
        emptyEl.innerHTML = `<p>Aucun résultat ne correspond à ta recherche ou à tes filtres.</p>
          <button class="btn btn-ghost" id="reset-filters">Réinitialiser la recherche et les filtres</button>`;
      }
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
    }

    list.innerHTML = arr.map(cardHtml).join("");

    const resetBtn = $("#reset-filters");
    if (resetBtn) resetBtn.addEventListener("click", resetFilters);

    $$(".card").forEach((el) => {
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".card-photos img")) return;
        const bug = bugs[el.dataset.id];
        const actBtn = ev.target.closest("[data-act]");
        if (actBtn && actBtn.dataset.act === "edit") openModal(bug);
        else openDetail(bug);
      });
    });
    $$(".card-photos img").forEach((img) => {
      img.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openLightbox(img.dataset.full);
      });
    });
  }

  function resetFilters() {
    filterStatus = "all";
    filterType = "all";
    filterPriority = "all";
    searchText = "";
    $("#search").value = "";
    $$("#filter-status .chip").forEach((x) => x.classList.toggle("active", x.dataset.status === "all"));
    $$("#filter-type .chip").forEach((x) => x.classList.toggle("active", x.dataset.type === "all"));
    $$("#filter-priority .chip").forEach((x) => x.classList.toggle("active", x.dataset.priority === "all"));
    render();
  }

  function renderStats() {
    const arr = Object.values(bugs);
    const nb = (s) => arr.filter((b) => b.status === s).length;
    $("#stats").innerHTML = `
      <div class="stat-card"><div class="num">${arr.length}</div><div class="lbl">Total</div></div>
      <div class="stat-card red"><div class="num">${nb("nontraite")}</div><div class="lbl">🔴 Pas traité</div></div>
      <div class="stat-card orange"><div class="num">${nb("encours")}</div><div class="lbl">🟠 En cours</div></div>
      <div class="stat-card green"><div class="num">${nb("traite")}</div><div class="lbl">🟢 Traité</div></div>`;
  }

  function cardHtml(b) {
    const photos = b.photos ? Object.values(b.photos) : [];
    const photoHtml = photos.slice(0, 4)
      .map((p) => `<img src="${p}" data-full="${p}" alt="photo" />`).join("");
    const date = b.createdAt ? new Date(b.createdAt).toLocaleDateString("fr-FR") : "";
    return `
      <article class="card s-${b.status} ${b.priority === "tres_urgente" ? "urgent" : ""}" data-id="${b.id}">
        <div class="card-top">
          <div class="badges">
            ${b.ticket ? `<span class="ticket">${fmtTicket(b.ticket)}</span>` : ""}
            <span class="badge type-${b.type}">${TYPE_LABEL[b.type]}</span>
            <span class="badge prio-${b.priority}">${PRIO_LABEL[b.priority]}</span>
          </div>
        </div>
        <h3>${escapeHtml(b.title)}</h3>
        ${b.listings ? `<div class="card-listings">🏠 ${escapeHtml(b.listings)}</div>` : ""}
        <p class="desc">${escapeHtml(b.description || "")}</p>
        ${photos.length ? `<div class="card-photos">${photoHtml}</div>` : ""}
        <div class="card-foot">
          <span>${b.createdBy ? "par " + escapeHtml(b.createdBy) : ""} ${date ? "· " + date : ""}</span>
          <span class="status-pill ${b.status}">${STATUS_LABEL[b.status]}</span>
        </div>
        <div class="card-actions">
          <button type="button" class="btn-card" data-act="view">👁 Voir</button>
          <button type="button" class="btn-card" data-act="edit">✏️ Modifier</button>
        </div>
      </article>`;
  }

  // -------------------------------------------------------------
  //  Modale d'ajout / édition
  // -------------------------------------------------------------
  function setSeg(groupId, val) {
    $$(`#${groupId} button`).forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.val === val));
  }
  function getSeg(groupId) {
    const active = $(`#${groupId} button.active`);
    return active ? active.dataset.val : null;
  }

  function renderPhotosPreview() {
    $("#f-photos-preview").innerHTML = editingPhotos.map((p, i) => `
      <div class="photo-thumb">
        <img src="${p}" alt="photo" />
        <button type="button" class="rm" data-i="${i}">&times;</button>
      </div>`).join("");
    $$("#f-photos-preview .rm").forEach((btn) =>
      btn.addEventListener("click", () => {
        editingPhotos.splice(Number(btn.dataset.i), 1);
        renderPhotosPreview();
      }));
  }

  function openModal(bug) {
    const isEdit = !!bug;
    $("#modal-title").textContent = isEdit ? "Modifier la fiche" : "Nouvelle fiche";
    $("#f-id").value = isEdit ? bug.id : "";
    $("#f-title").value = isEdit ? bug.title : "";
    $("#f-desc").value = isEdit ? bug.description : "";
    setSeg("f-type", isEdit ? bug.type : "bug");
    setSeg("f-priority", isEdit ? bug.priority : "moyenne");
    setSeg("f-status", isEdit ? bug.status : "nontraite");
    $("#f-listings").value = isEdit ? (bug.listings || "") : "";
    $("#f-client-name").value = isEdit ? (bug.clientName || "") : "";
    $("#f-client-email").value = isEdit ? (bug.clientEmail || "") : "";
    $("#f-client-phone").value = isEdit ? (bug.clientPhone || "") : "";
    editingPhotos = isEdit && bug.photos ? Object.values(bug.photos) : [];
    renderPhotosPreview();
    $("#btn-delete").classList.toggle("hidden", !isEdit);
    $("#modal").classList.remove("hidden");
    $("#f-title").focus();
  }

  function closeModal() { $("#modal").classList.add("hidden"); }

  // -------------------------------------------------------------
  //  Fenêtre de lecture (Voir) — affiche tout en entier
  // -------------------------------------------------------------
  let detailBugId = null;

  function openDetail(bug) {
    if (!bug) return;
    detailBugId = bug.id;
    const photos = bug.photos ? Object.values(bug.photos) : [];
    const date = bug.createdAt
      ? new Date(bug.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : "";
    $("#detail-title").textContent = (bug.ticket ? fmtTicket(bug.ticket) + " · " : "") + bug.title;
    $("#detail-body").innerHTML = `
      <div class="badges detail-badges">
        <span class="badge type-${bug.type}">${TYPE_LABEL[bug.type]}</span>
        <span class="badge prio-${bug.priority}">${PRIO_LABEL[bug.priority]}</span>
        <span class="status-pill ${bug.status}">${STATUS_LABEL[bug.status]}</span>
      </div>
      <h4 class="detail-label">Description</h4>
      <div class="detail-desc">${escapeHtml(bug.description || "")}</div>
      ${bug.listings ? `
        <h4 class="detail-label">🏠 Annonce(s) concernée(s)</h4>
        <div class="detail-listings">${escapeHtml(bug.listings)}</div>` : ""}
      ${(bug.clientName || bug.clientEmail || bug.clientPhone) ? `
        <h4 class="detail-label">Client</h4>
        <div class="detail-client">
          ${bug.clientName ? `<div>👤 ${escapeHtml(bug.clientName)}</div>` : ""}
          ${bug.clientEmail ? `<div>✉️ <a href="mailto:${escapeHtml(bug.clientEmail)}">${escapeHtml(bug.clientEmail)}</a></div>` : ""}
          ${bug.clientPhone ? `<div>📞 <a href="tel:${escapeHtml(bug.clientPhone)}">${escapeHtml(bug.clientPhone)}</a></div>` : ""}
        </div>` : ""}
      ${photos.length ? `
        <h4 class="detail-label">Photos</h4>
        <div class="detail-photos">${photos.map((p) => `<img src="${p}" data-full="${p}" alt="photo" />`).join("")}</div>` : ""}
      <div class="detail-meta">${bug.createdBy ? "Créé par " + escapeHtml(bug.createdBy) : ""}${date ? " · le " + date : ""}</div>`;

    $$("#detail-body .detail-photos img").forEach((img) =>
      img.addEventListener("click", () => openLightbox(img.dataset.full)));

    // Boutons de changement de statut rapide
    const statuses = [
      ["nontraite", "🔴 Pas traité"],
      ["encours", "🟠 En cours"],
      ["traite", "🟢 Traité"],
    ];
    $("#detail-status-actions").innerHTML = `
      <span class="detail-status-label">Changer le statut :</span>
      <div class="detail-status-btns">
        ${statuses.map(([v, l]) =>
          `<button type="button" class="status-btn ${v} ${bug.status === v ? "active" : ""}" data-status="${v}">${l}</button>`
        ).join("")}
      </div>`;
    $$("#detail-status-actions .status-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const newStatus = btn.dataset.status;
        store.update(detailBugId, { status: newStatus, updatedAt: Date.now(), updatedBy: me });
        if (newStatus === "traite" && bug.status !== "traite") notify("traite", bug, me);
        closeDetail(); // on ferme et on revient à la liste
      }));

    $("#detail-modal").classList.remove("hidden");
  }

  function closeDetail() { $("#detail-modal").classList.add("hidden"); }

  async function handlePhotoUpload(ev) {
    const files = Array.from(ev.target.files || []);
    for (const file of files) {
      try { editingPhotos.push(await compressImage(file)); }
      catch (e) { console.error("Image illisible", e); }
    }
    renderPhotosPreview();
    ev.target.value = "";
  }

  function submitForm(ev) {
    ev.preventDefault();
    const id = $("#f-id").value;
    const clientName = $("#f-client-name").value.trim();
    const clientEmail = $("#f-client-email").value.trim();
    const clientPhone = $("#f-client-phone").value.trim();
    const data = {
      title: $("#f-title").value.trim(),
      description: $("#f-desc").value.trim(),
      type: getSeg("f-type"),
      priority: getSeg("f-priority"),
      status: getSeg("f-status"),
      listings: $("#f-listings").value.trim(),
      clientName, clientEmail, clientPhone,
      photos: editingPhotos.reduce((acc, p) => { acc[uid()] = p; return acc; }, {}),
      updatedAt: Date.now(),
      updatedBy: me,
    };
    if (!data.title || !data.description) return;

    // Aucune info client renseignée -> on demande confirmation
    if (!clientName && !clientEmail && !clientPhone) {
      const ok = confirm(
        "Vous n'avez renseigné aucune info client (nom, email, téléphone).\n\n" +
        "Êtes-vous sûr de vouloir enregistrer cette fiche quand même ?"
      );
      if (!ok) return;
    }

    if (id) {
      const wasTraite = bugs[id] && bugs[id].status === "traite";
      store.update(id, data);
      if (data.status === "traite" && !wasTraite) notify("traite", { ...bugs[id], ...data }, me);
    } else {
      store.add({ ...data, ticket: nextTicket(), createdAt: Date.now(), createdBy: me });
    }
    closeModal();
  }

  function deleteBug() {
    const id = $("#f-id").value;
    if (id && confirm("Supprimer définitivement cette fiche ?")) {
      store.remove(id);
      closeModal();
    }
  }

  // -------------------------------------------------------------
  //  Lightbox
  // -------------------------------------------------------------
  function openLightbox(src) {
    $("#lightbox-img").src = src;
    $("#lightbox").classList.remove("hidden");
  }

  // -------------------------------------------------------------
  //  Présence (qui est connecté)
  // -------------------------------------------------------------
  function renderPresence(presence) {
    const names = [...new Set(Object.values(presence).map((p) => p.name))];
    $("#presence").innerHTML = names.map((n) =>
      `<div class="avatar" style="background:${colorFor(n)}" title="${escapeHtml(n)}">${initials(n)}</div>`
    ).join("");
  }

  // -------------------------------------------------------------
  //  Identité
  // -------------------------------------------------------------
  function askIdentity() {
    $("#who-modal").classList.remove("hidden");
  }
  function setIdentity(name) {
    if (!name) return;
    me = name;
    localStorage.setItem("bugtracker_user", name);
    $("#me").innerHTML = `Connecté en tant que <b>${escapeHtml(name)}</b>`;
    $("#who-modal").classList.add("hidden");
    if (store && store.setPresence) store.setPresence(name);
  }

  // -------------------------------------------------------------
  //  Branchement des événements
  // -------------------------------------------------------------
  function wireEvents() {
    $("#btn-add").addEventListener("click", () => openModal(null));
    $("#btn-switch").addEventListener("click", askIdentity);
    $("#modal-close").addEventListener("click", closeModal);
    $("#btn-cancel").addEventListener("click", closeModal);
    $("#btn-delete").addEventListener("click", deleteBug);
    $("#form").addEventListener("submit", submitForm);
    $("#f-photos").addEventListener("change", handlePhotoUpload);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

    $("#lightbox").addEventListener("click", () => $("#lightbox").classList.add("hidden"));

    // Fenêtre de lecture (Voir)
    $("#detail-close").addEventListener("click", closeDetail);
    $("#detail-edit").addEventListener("click", () => { closeDetail(); openModal(bugs[detailBugId]); });
    $("#detail-modal").addEventListener("click", (e) => { if (e.target.id === "detail-modal") closeDetail(); });

    ["f-type", "f-priority", "f-status"].forEach((gid) => {
      $$(`#${gid} button`).forEach((btn) =>
        btn.addEventListener("click", () => setSeg(gid, btn.dataset.val)));
    });

    $$("#filter-status .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#filter-status .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active"); filterStatus = c.dataset.status; render();
    }));
    $$("#filter-type .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#filter-type .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active"); filterType = c.dataset.type; render();
    }));
    $$("#filter-priority .chip").forEach((c) => c.addEventListener("click", () => {
      $$("#filter-priority .chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active"); filterPriority = c.dataset.priority; render();
    }));
    $("#search").addEventListener("input", (e) => { searchText = e.target.value; render(); });
    $("#sort").addEventListener("change", (e) => { sortMode = e.target.value; render(); });

    $$("#who-buttons button").forEach((b) =>
      b.addEventListener("click", () => setIdentity(b.dataset.name)));
    $("#who-ok").addEventListener("click", () => {
      const other = $("#who-other").value.trim();
      if (other) setIdentity(other);
    });
  }

  // -------------------------------------------------------------
  //  Démarrage
  // -------------------------------------------------------------
  async function start() {
    await initStore();
    initEmail();
    banner.classList.remove("hidden");
    wireEvents();

    store.subscribe((data) => { bugs = data || {}; maybeBackfillTickets(); render(); });
    if (store.subscribePresence) store.subscribePresence(renderPresence);

    if (me) setIdentity(me);
    else askIdentity();

    render();
  }

  // On attend que la page soit prête avant de démarrer.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
