// =============================================================
//  Suivi Clients Web — Guest Lucky
//  Accès restreint : Martin Moré & Camille Fauveau (mot de passe)
//  Stockage : Firebase /clients (partagé en temps réel)
// =============================================================

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // --- Accès & mots de passe ---
  const EDITORS = ["Martin Moré", "Camille Fauveau"];
  const PASSWORDS = { "Martin Moré": "martin@", "Camille Fauveau": "camille@" };

  // --- Données de départ (reprises du fichier de Camille) ---
  const SEED = [{"priorite":1,"client":"GuestChamp","domaine":"guestchamp.fr","type":"Reprise + SEO","statut":"en_cours","seo_statut":"fait","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"https://guestchamp.fr/wp-admin","wp_login":"camille","date_formulaire":"2026-07-28","date_debut":"2026-07-28","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"guestchamp.conciergerie@gmail.com / 06 64 30 59 89","prochaine_action":"Recuperer SIRET+adresse (mentions legales), FB/Insta, photo dirigeant. Fiche Google Business + avis (cote client).","notes":"Liens repares, Loi Hoguet OK, Yoast+titres/meta+schema local, H1 repares, Site Kit/Analytics (G-90YHBWJT8G), photos remplacees."},{"priorite":2,"client":"Lucky Conciergerie","domaine":"luckyconciergerie.fr","type":"Creation (lead gen)","statut":"en_cours","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"camille","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Kit + montage landing 11 blocs + formulaire/tracking.","notes":"Marque nationale conciergerie, capte des leads Google Ads dispatches par ville. Debloque (Safe Browsing/CMS N0C off)."},{"priorite":3,"client":"Joy","domaine":"elyras.fr","type":"Corrections","statut":"en_cours","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Responsive mobile toutes pages + footer (bandeau bleu marine colonne Contact).","notes":"Conciergerie Airbnb Poitiers/Limoges. Acces via Notion WEBSITE PROJECT."},{"priorite":4,"client":"ORELYZEN","domaine":"","type":"Ajustements","statut":"en_cours","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Alignements, couleurs/onglets, contenu par familles, tarifs, 3 articles, page Maroc, simulateur.","notes":"Conciergerie cliente GuestLucky. Ajustements suite reunion 20/07. URL/acces a recuperer."},{"priorite":null,"client":"Leandro Conciergerie","domaine":"leandroconciergerie.fr","type":"Reprise + SEO","statut":"termine","seo_statut":"fait","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"https://leandroconciergerie.fr/wp-admin","wp_login":"camille","date_formulaire":"","date_debut":"2026-07-16","date_fin":"2026-07-23","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"contact@leandroconciergerie.fr","prochaine_action":"URL Facebook exacte ; photos services ; harmonie titres.","notes":"Charte, Loi Hoguet, zones, formules, logo, Pixel Meta, formulaire, SEO Yoast complet, schema local, alt."},{"priorite":null,"client":"Le Nid Mousin","domaine":"lenidmousin.com","type":"Reprise","statut":"termine","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"https://lenidmousin.com/wp-admin","wp_login":"camille","date_formulaire":"","date_debut":"2026-07-23","date_fin":"2026-07-23","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"hello@lenidmousin.com","prochaine_action":"Proposer le SEO (pas encore fait).","notes":"3 modifs faites : blocs accueil retires, footer 'Contact' + liens cliquables, photo menage remplacee."},{"priorite":null,"client":"Nele Conciergerie","domaine":"","type":"Creation","statut":"termine_modifs","seo_statut":"en_cours","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Photos reelles, Calendly, og:image.","notes":"Site vitrine construit & en ligne (Cannes, noir/or, WP+Elementor Pro)."},{"priorite":null,"client":"Inscape","domaine":"inscape-gestion.fr","type":"Embellissement","statut":"attente_client","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Attend Drive/logo/brief. Photos IA moches -> jolies, design releve.","notes":"Sous-location pro. Charte cuivre. Loi Hoguet a confirmer."},{"priorite":null,"client":"Julienne","domaine":"","type":"Refonte","statut":"a_faire","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"","prochaine_action":"Recuperer URL/acces + codes couleurs.","notes":"Sous-location pro Tours (modele Inscape). Charte beige/marron/dore. Blog SEO, Calendly."},{"priorite":null,"client":"KeyParino","domaine":"keyparino.com","type":"Refonte","statut":"a_faire","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"Pascal & Nora","prochaine_action":"Recon a faire. Modele kbgconciergerie.com (13 points + composants interactifs).","notes":"Conciergerie immobiliere Paris IDF. NON COMMENCE."},{"priorite":null,"client":"Les Jardins Seine Eure","domaine":"lesjardinsseineeure.fr","type":"Creation + SEO","statut":"a_faire","seo_statut":"a_faire","seo_par":"moi","martin_montant":40,"martin_paye":false,"wp_url":"","wp_login":"","date_formulaire":"2026-07-30","date_debut":"","date_fin":"","mois":"2026-07","montant":0,"facture_a":"Maindustry","couts":[],"paiement":"a_facturer","contact":"conciergerie.seineure27@gmail.com / 06 10 69 66 62","prochaine_action":"Trancher nom de domaine .fr/.com + creer sur Hostinger. Recuperer SIRET+adresse, photo pro, photos logements. Rediger textes (desamorcer 'gestion').","notes":"Nouvelle cliente Loubna George, SASU. Conciergerie prestige Louviers/Vernon/Evreux/Rouen (40km). Charte vert foret #1C3B2B + dore #C5A059 + fond ecru #F4F0EA. Commission 25%. Logo fourni (Downloads). Formulaire complet recu, voir memoire reference_lesjardinsseineeure_site."}];

  let DATA = [];
  let me = localStorage.getItem("clients_user") || "";

  // -------------------------------------------------------
  //  Stores
  // -------------------------------------------------------
  class LocalStore {
    constructor() { this.key = "clients_data"; this.cb = null; }
    _read() { try { return JSON.parse(localStorage.getItem(this.key)) || {}; } catch { return {}; } }
    _write(d) { localStorage.setItem(this.key, JSON.stringify(d)); if (this.cb) this.cb(d); }
    async seed() {
      if (Object.keys(this._read()).length) return;
      const d = {};
      SEED.forEach((item, i) => {
        const id = "seed" + i;
        d[id] = Object.assign({}, item, { _id: id, _ord: i });
      });
      this._write(d);
    }
    subscribe(cb) { this.cb = cb; cb(this._read()); }
    save(item) { const d = this._read(); d[item._id] = item; this._write(d); return Promise.resolve(); }
    remove(id) { const d = this._read(); delete d[id]; this._write(d); return Promise.resolve(); }
    newId() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  }

  class FirebaseStore {
    constructor(db, fns) { this.db = db; this.fns = fns; }
    async seed() {
      const { ref, get, set, push } = this.fns;
      const flag = await get(ref(this.db, "meta/clientsSeeded"));
      if (flag.exists() && flag.val()) return;
      await set(ref(this.db, "meta/clientsSeeded"), true);
      for (let i = 0; i < SEED.length; i++) {
        const r = push(ref(this.db, "clients"));
        await set(r, Object.assign({}, SEED[i], { _id: r.key, _ord: i }));
      }
    }
    subscribe(cb) {
      const { ref, onValue } = this.fns;
      onValue(ref(this.db, "clients"), (snap) => cb(snap.val() || {}));
    }
    save(item) {
      const { ref, set } = this.fns;
      return set(ref(this.db, "clients/" + item._id), item);
    }
    remove(id) {
      const { ref, remove } = this.fns;
      return remove(ref(this.db, "clients/" + id));
    }
    newId() {
      const { ref, push } = this.fns;
      return push(ref(this.db, "clients")).key;
    }
  }

  let store;
  const banner = $("status-banner");

  async function initStore() {
    if (window.firebaseActive) {
      try {
        const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
        const dbMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js");
        const apps = appMod.getApps ? appMod.getApps() : [];
        const app = apps.length ? apps[0] : appMod.initializeApp(window.firebaseConfig);
        const db = dbMod.getDatabase(app);
        store = new FirebaseStore(db, {
          ref: dbMod.ref, onValue: dbMod.onValue, push: dbMod.push,
          set: dbMod.set, get: dbMod.get, remove: dbMod.remove,
        });
        banner.className = "status-banner live";
        banner.textContent = "🟢 Connecté en temps réel — Martin et Camille voient les mêmes données.";
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

  function saveItem(p, msg) {
    store.save(p).then(() => showToast(msg || "Enregistré")).catch(() => showToast("ERREUR d'enregistrement"));
  }
  function deleteItem(id) {
    store.remove(id).then(() => showToast("Supprimé")).catch(() => showToast("ERREUR de suppression"));
  }

  // -------------------------------------------------------
  //  Constantes d'affichage
  // -------------------------------------------------------
  const STATUTS = {
    a_faire: { lab: "À faire", c: "var(--dot-a-faire)" },
    en_cours: { lab: "En cours", c: "var(--dot-en_cours)" },
    attente_client: { lab: "Attente client", c: "var(--dot-attente_client)" },
    termine_modifs: { lab: "Terminé · modifs", c: "var(--dot-termine_modifs)" },
    termine: { lab: "Terminé", c: "var(--dot-termine)" },
  };
  const SEO = {
    fait: { lab: "SEO fait", c: "var(--dot-termine)" },
    en_cours: { lab: "SEO en cours", c: "var(--dot-en_cours)" },
    a_faire: { lab: "SEO à faire", c: "var(--neg)" },
    non: { lab: "Pas de SEO", c: "var(--muted)" },
  };
  const PAY = {
    a_facturer: { lab: "À facturer", c: "var(--dot-en_cours)" },
    en_attente: { lab: "En attente", c: "var(--dot-attente_client)" },
    paye: { lab: "Payé", c: "var(--dot-termine)" },
  };
  const IC = {
    users: '<svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 19c.8-3 3.4-4.5 6.5-4.5s5.7 1.5 6.5 4.5"/><path d="M15.5 5.1a3.5 3.5 0 0 1 0 5.8"/><path d="M17.5 14.7c2 .6 3.5 2 4 4.3"/></svg>',
    clock: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    list: '<svg class="ic" viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    check: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.3 2.3 4.7-5"/></svg>',
    wallet: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h1.5"/></svg>',
    receipt: '<svg class="ic" viewBox="0 0 24 24"><path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M9.5 8.5h5M9.5 12h5"/></svg>',
    trend: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 7-8"/><path d="M14.5 7H20v5.5"/></svg>',
    user: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.8"/><path d="M4.5 19.5c1-3.4 4-5 7.5-5s6.5 1.6 7.5 5"/></svg>',
    ext: '<svg class="ic" viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M14 5h5v5M19 5l-8 8"/><path d="M19 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6.5A1.5 1.5 0 0 1 6 5h4.5"/></svg>',
  };
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const eur = (n) => (n || 0).toLocaleString("fr-FR") + " €";
  const martinCost = (p) => (p.seo_par === "martin" && p.seo_statut === "fait") ? (+p.martin_montant || 40) : 0;
  const martinDue = (p) => p.martin_paye ? 0 : martinCost(p);
  const coutsListe = (p) => (p.couts || []).reduce((s, c) => s + (+c.montant || 0), 0);
  const totalCouts = (p) => coutsListe(p) + martinCost(p);
  const marge = (p) => (+p.montant || 0) - totalCouts(p);
  const esc = (s) => (s === null || s === undefined ? "" : String(s)).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const dfmt = (d) => d ? d.split("-").reverse().join("/") : "—";
  const moisLabel = (m) => { if (!m) return "Sans mois"; const [y, mo] = m.split("-"); return (MOIS[+mo - 1] || "") + " " + y; };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  let filter = "all", q = "", monthFilter = "all";

  let toastT = null;
  function showToast(t) {
    const el = $("toast"); el.textContent = t; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // -------------------------------------------------------
  //  Rendu
  // -------------------------------------------------------
  function statusHtml(p) {
    const s = STATUTS[p.statut] || STATUTS.a_faire;
    return `<span class="status"><span class="dot" style="background:${s.c}"></span>${s.lab}</span>`;
  }
  function seoTag(p) {
    const s = SEO[p.seo_statut] || SEO.a_faire;
    const par = p.seo_par ? ` · ${p.seo_par === "moi" ? "moi" : cap(p.seo_par)}` : "";
    return `<span class="tag" style="color:${s.c};border-color:${s.c}">${s.lab}${par}</span>`;
  }
  function payTag(p) {
    const s = PAY[p.paiement] || PAY.a_facturer;
    return `<span class="tag" style="color:${s.c};border-color:${s.c}">${s.lab}</span>`;
  }

  function render() {
    fillMonths();

    const ms = DATA.filter((p) => {
      const okM = monthFilter === "all" || p.mois === monthFilter;
      const okQ = !q || (p.client + " " + (p.domaine || "") + " " + (p.type || "")).toLowerCase().includes(q);
      return okM && okQ;
    });
    const rows = ms.filter((p) => filter === "all" || p.statut === filter);

    const cnt = (s) => ms.filter((p) => p.statut === s).length;
    const ca = ms.reduce((s, p) => s + (+p.montant || 0), 0);
    const co = ms.reduce((s, p) => s + totalCouts(p), 0);
    const mg = ca - co;
    const mdue = ms.reduce((s, p) => s + martinDue(p), 0);
    const kpiBtn = (f, ic, lab, val) => `<div class="kpi click ${filter === f ? "active" : ""}" data-kpi="${f}">
        <div class="lab">${ic} ${lab}</div><div class="val">${val}</div></div>`;
    $("kpis").innerHTML =
        kpiBtn("all", IC.users, "Clients", ms.length)
      + kpiBtn("en_cours", IC.clock, "En cours", cnt("en_cours"))
      + kpiBtn("a_faire", IC.list, "À faire", cnt("a_faire"))
      + kpiBtn("termine", IC.check, "Terminés", cnt("termine") + cnt("termine_modifs"))
      + `<div class="kpi"><div class="lab">${IC.wallet} Rapporté</div><div class="val">${eur(ca)}</div></div>`
      + `<div class="kpi"><div class="lab">${IC.receipt} Coûts</div><div class="val ${co ? "neg" : ""}">${eur(co)}</div></div>`
      + `<div class="kpi"><div class="lab">${IC.trend} Marge</div><div class="val ${mg > 0 ? "pos" : (mg < 0 ? "neg" : "")}">${eur(mg)}</div></div>`
      + `<div class="kpi"><div class="lab">${IC.user} À payer Martin</div><div class="val ${mdue ? "neg" : ""}">${eur(mdue)}</div></div>`;

    const prios = DATA.filter((p) => p.priorite).sort((a, b) => a.priorite - b.priorite);
    $("boardSec").innerHTML = prios.length
      ? `<h2 class="sec">Priorités</h2><div class="board">` + prios.map((p) => `
        <div class="pcard" data-open="${DATA.indexOf(p)}">
          <div class="rank">PRIORITÉ ${p.priorite}</div>
          <h3>${esc(p.client)}</h3>
          <div class="dom">${esc(p.domaine || "—")}</div>
          <div class="meta">${statusHtml(p)} ${seoTag(p)}</div>
          ${p.prochaine_action ? `<div class="next"><b>Prochaine action</b> — ${esc(p.prochaine_action)}</div>` : ""}
        </div>`).join("") + `</div>`
      : "";

    const groups = {};
    rows.forEach((p) => { (groups[p.mois] = groups[p.mois] || []).push(p); });
    const keys = Object.keys(groups).sort().reverse();
    $("months").innerHTML = keys.length ? keys.map((m) => {
      const g = groups[m];
      const gca = g.reduce((s, p) => s + (+p.montant || 0), 0);
      const gco = g.reduce((s, p) => s + totalCouts(p), 0);
      const md = g.reduce((s, p) => s + martinDue(p), 0);
      const martinB = md > 0
        ? `<div class="b"><span class="t">Martin</span><span class="neg">${eur(md)}</span>
             <button class="btn sm primary" data-paym="${m}">Marquer payé</button></div>`
        : (g.some((p) => p.martin_paye && martinCost(p) > 0) ? `<div class="b"><span class="t">Martin</span><span class="pos">payé</span></div>` : "");
      return `<div class="month">
        <div class="mhead"><h2>${moisLabel(m)}</h2>
          <div class="pnl">
            <div class="b"><span class="t">Rapporté</span>${eur(gca)}</div>
            <div class="b"><span class="t">Coûté</span><span class="${gco ? "neg" : ""}">${eur(gco)}</span></div>
            <div class="b"><span class="t">Marge</span><span class="${gca - gco > 0 ? "pos" : (gca - gco < 0 ? "neg" : "")}">${eur(gca - gco)}</span></div>
            ${martinB}
          </div></div>
        <div class="tblwrap"><table>
          <thead><tr>
            <th></th><th>Client</th><th>Type</th><th>Statut</th><th>SEO</th>
            <th>Formulaire</th><th>Début</th><th>Deadline</th><th>WordPress</th>
            <th style="text-align:right">Facturé</th><th style="text-align:right">Coûts</th><th style="text-align:right">Marge</th>
            <th>Paiement</th><th>Prochaine action</th>
          </tr></thead>
          <tbody>${g.map(rowHtml).join("")}</tbody>
        </table></div>
      </div>`;
    }).join("") : `<div class="empty">Aucun projet ne correspond. Clique sur « Nouveau client » pour en ajouter un.</div>`;

    document.querySelectorAll(".kpi[data-kpi]").forEach((k) => k.onclick = () => { filter = k.dataset.kpi; syncSeg(); render(); });
    document.querySelectorAll("[data-open]").forEach((el) => el.onclick = (e) => {
      if (e.target.closest("a,button")) return;
      openModal(+el.dataset.open);
    });
    document.querySelectorAll("[data-paym]").forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const m = b.dataset.paym;
      DATA.forEach((p) => {
        if (p.mois === m && martinDue(p) > 0) { p.martin_paye = true; store.save(p); }
      });
      showToast("Martin marqué payé pour " + moisLabel(m));
      render();
    });
  }

  function rowHtml(p) {
    const idx = DATA.indexOf(p);
    const co = totalCouts(p), mg = marge(p);
    const parts = (p.couts || []).map((c) => c.label + " : " + eur(c.montant));
    if (martinCost(p)) parts.push("SEO Martin : " + eur(martinCost(p)) + (p.martin_paye ? " (payé)" : " (à payer)"));
    const wp = p.wp_url ? `<a class="wpbtn" href="${esc(p.wp_url)}" target="_blank">wp-admin ${IC.ext}</a>` : `<span class="sub">—</span>`;
    return `<tr data-open="${idx}">
      <td>${p.priorite ? `<span class="prio-b">${p.priorite}</span>` : ""}</td>
      <td><div class="cl">${esc(p.client)}</div>
          <div class="dom">${p.domaine ? `<a href="https://${esc(p.domaine)}" target="_blank">${esc(p.domaine)}</a>` : '<span class="sub">domaine à définir</span>'}</div></td>
      <td>${esc(p.type || "—")}</td>
      <td>${statusHtml(p)}</td>
      <td>${seoTag(p)}</td>
      <td>${dfmt(p.date_formulaire)}</td>
      <td>${dfmt(p.date_debut)}</td>
      <td>${p.date_fin ? `<b>${dfmt(p.date_fin)}</b>` : '<span class="sub">—</span>'}</td>
      <td>${wp}${p.wp_login ? `<div class="sub">login : ${esc(p.wp_login)}</div>` : ""}</td>
      <td class="num">${(+p.montant) ? eur(+p.montant) : '<span class="sub">—</span>'}${p.facture_a ? `<div class="sub" style="text-align:right;font-weight:400">→ ${esc(p.facture_a)}</div>` : ""}</td>
      <td class="num ${co ? "neg" : ""}" title="${esc(parts.join(" | "))}">${co ? eur(co) : '<span class="sub">—</span>'}</td>
      <td class="num ${mg > 0 ? "pos" : (mg < 0 ? "neg" : "")}">${((+p.montant) || co) ? eur(mg) : '<span class="sub">—</span>'}</td>
      <td>${payTag(p)}</td>
      <td class="notes">${p.prochaine_action ? `<div class="act">${esc(p.prochaine_action)}</div>` : '<span class="sub">—</span>'}<div class="more">Ouvrir la fiche</div></td>
    </tr>`;
  }

  // -------------------------------------------------------
  //  Fiche
  // -------------------------------------------------------
  let editIndex = -1;

  function openModal(idx) {
    editIndex = idx;
    const p = idx >= 0 ? DATA[idx] : {
      priorite: null, client: "", domaine: "", type: "", statut: "a_faire", seo_statut: "a_faire", seo_par: "",
      martin_montant: 40, martin_paye: false, wp_url: "", wp_login: "",
      date_formulaire: "", date_debut: "", date_fin: "",
      mois: new Date().toISOString().slice(0, 7),
      montant: 0, facture_a: "Maindustry", couts: [], paiement: "a_facturer",
      contact: "", prochaine_action: "", notes: "",
    };
    $("mTitle").textContent = idx >= 0 ? (p.client || "Fiche client") : "Nouveau client";
    $("btnDel").style.display = idx >= 0 ? "" : "none";
    $("f_client").value = p.client || ""; $("f_domaine").value = p.domaine || "";
    $("f_type").value = p.type || ""; $("f_priorite").value = p.priorite || "";
    $("f_statut").value = p.statut || "a_faire"; $("f_mois").value = p.mois || "";
    $("f_dform").value = p.date_formulaire || ""; $("f_ddeb").value = p.date_debut || "";
    $("f_dfin").value = p.date_fin || ""; $("f_contact").value = p.contact || "";
    $("f_seo").value = p.seo_statut || "a_faire"; $("f_seopar").value = p.seo_par || "";
    $("f_martin_m").value = (p.martin_montant === 0 || p.martin_montant) ? p.martin_montant : 40;
    $("f_martin_p").checked = !!p.martin_paye;
    $("f_wpurl").value = p.wp_url || ""; $("f_wplogin").value = p.wp_login || "";
    $("f_montant").value = p.montant || 0; $("f_factura").value = p.facture_a || "";
    $("f_paiement").value = p.paiement || "a_facturer";
    $("f_couts").value = (p.couts || []).map((c) => c.label + " = " + c.montant).join("\n");
    $("f_action").value = p.prochaine_action || ""; $("f_notes").value = p.notes || "";
    $("ov").classList.add("open");
  }
  function closeModal() { $("ov").classList.remove("open"); editIndex = -1; }

  function parseCouts(txt) {
    return txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.lastIndexOf("=");
      if (i < 0) return { label: l, montant: 0 };
      return { label: l.slice(0, i).trim(), montant: parseFloat(l.slice(i + 1).replace(",", ".").replace(/[^0-9.\-]/g, "")) || 0 };
    });
  }

  function wireEvents() {
    $("btnSave").onclick = () => {
      const isNew = editIndex < 0;
      const p = isNew ? {} : DATA[editIndex];
      p.client = $("f_client").value.trim();
      p.domaine = $("f_domaine").value.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
      p.type = $("f_type").value.trim();
      p.priorite = $("f_priorite").value ? +$("f_priorite").value : null;
      p.statut = $("f_statut").value; p.mois = $("f_mois").value;
      p.date_formulaire = $("f_dform").value; p.date_debut = $("f_ddeb").value; p.date_fin = $("f_dfin").value;
      p.contact = $("f_contact").value.trim();
      p.seo_statut = $("f_seo").value; p.seo_par = $("f_seopar").value;
      p.martin_montant = parseFloat($("f_martin_m").value) || 0;
      p.martin_paye = $("f_martin_p").checked;
      p.wp_url = $("f_wpurl").value.trim(); p.wp_login = $("f_wplogin").value.trim();
      p.montant = parseFloat($("f_montant").value) || 0; p.facture_a = $("f_factura").value.trim();
      p.paiement = $("f_paiement").value; p.couts = parseCouts($("f_couts").value);
      p.prochaine_action = $("f_action").value.trim(); p.notes = $("f_notes").value.trim();
      if (!p.client) { showToast("Le nom du client est obligatoire"); return; }
      if (isNew) { p._id = store.newId(); p._ord = Date.now(); DATA.push(p); }
      saveItem(p);
      closeModal(); render();
    };

    $("btnDel").onclick = () => {
      if (editIndex < 0) return;
      const p = DATA[editIndex];
      if (confirm("Supprimer définitivement « " + (p.client || "ce client") + " » ?")) {
        deleteItem(p._id);
        DATA.splice(editIndex, 1);
        closeModal(); render();
      }
    };

    $("btnCancel").onclick = closeModal;
    $("ov").addEventListener("click", (e) => { if (e.target.id === "ov") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
    $("btnNew").onclick = () => openModal(-1);

    document.querySelectorAll("#seg button").forEach((b) => b.onclick = () => { filter = b.dataset.f; syncSeg(); render(); });
    $("search").oninput = (e) => { q = e.target.value.toLowerCase().trim(); render(); };
    $("monthSel").onchange = (e) => { monthFilter = e.target.value; render(); };

    $("btnSwitch").onclick = () => {
      me = "";
      localStorage.removeItem("clients_user");
      $("app").classList.add("hidden");
      askIdentity();
    };
  }

  function syncSeg() {
    document.querySelectorAll("#seg button").forEach((b) => b.classList.toggle("active", b.dataset.f === filter));
  }

  function fillMonths() {
    const sel = $("monthSel");
    const cur = sel.value;
    sel.innerHTML = '<option value="all">Tous les mois</option>';
    [...new Set(DATA.map((p) => p.mois).filter(Boolean))].sort().reverse().forEach((m) => {
      const o = document.createElement("option");
      o.value = m; o.textContent = cap(moisLabel(m));
      sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "all";
  }

  // -------------------------------------------------------
  //  Identité & mot de passe
  // -------------------------------------------------------
  let pendingName = null;

  function askIdentity() {
    pendingName = null;
    $("gate-pwd").classList.add("hidden");
    $("gate-pwd-input").value = "";
    $("gate-err").style.display = "none";
    document.querySelectorAll("#gate-names button").forEach((b) => b.classList.remove("selected"));
    $("gate").classList.remove("hidden");
  }

  function setIdentity(name) {
    me = name;
    localStorage.setItem("clients_user", name);
    $("who").innerHTML = `Connecté : <b>${esc(name)}</b>`;
    $("gate").classList.add("hidden");
    $("app").classList.remove("hidden");
  }

  function tryPassword() {
    if (!pendingName) return;
    if ($("gate-pwd-input").value === PASSWORDS[pendingName]) {
      $("gate-err").style.display = "none";
      setIdentity(pendingName);
    } else {
      $("gate-err").style.display = "block";
      $("gate-pwd-input").value = "";
      $("gate-pwd-input").focus();
    }
  }

  function wireGate() {
    document.querySelectorAll("#gate-names button").forEach((b) => {
      b.onclick = () => {
        pendingName = b.dataset.name;
        document.querySelectorAll("#gate-names button").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        $("gate-pwd-input").value = "";
        $("gate-err").style.display = "none";
        $("gate-pwd").classList.remove("hidden");
        setTimeout(() => $("gate-pwd-input").focus(), 50);
      };
    });
    $("gate-ok").onclick = tryPassword;
    $("gate-pwd-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryPassword(); });
  }

  // -------------------------------------------------------
  //  Démarrage
  // -------------------------------------------------------
  (async function start() {
    wireGate();
    wireEvents();
    syncSeg();

    await initStore();
    try { await store.seed(); } catch (e) { console.error(e); }

    store.subscribe((obj) => {
      DATA = Object.values(obj || {}).sort((a, b) => (a._ord || 0) - (b._ord || 0));
      render();
    });

    if (me && EDITORS.includes(me)) setIdentity(me);
    else askIdentity();
  })();
})();
