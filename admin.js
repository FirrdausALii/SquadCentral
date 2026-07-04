/* eslint-disable no-alert */
(() => {
const $ = (s, r = document) => r.querySelector(s);

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "leagues", label: "Leagues" },
  { id: "stadiums", label: "Stadiums" },
  { id: "league", label: "Matchweek" },
  { id: "teams", label: "Teams" },
  { id: "squaddepth", label: "Squad depth" },
  { id: "nationalduty", label: "National duty" },
  { id: "players", label: "Players" },
  { id: "matches", label: "Matches" },
  { id: "standings", label: "Standings" },
  { id: "scorers", label: "Top scorers" },
  { id: "transfers", label: "Transfers" },
  { id: "settings", label: "Settings" },
];

let activeTab = "overview";
let leagueFilter = "epl";
let leagueEditId = "";
let playerTeamFilter = "";
let playerTransferPickId = "";
let playerSearchQuery = "";
let squadDepthTeamFilter = "";
let nationalDutyTeamFilter = "";
let transferTeamFilter = "";
let matchEditId = "";
let stadiumEditName = "";
/** Preserves matchweek editor fields across renderPanel() (DOM is rebuilt each time). */
let mwEditorDraft = null;
/** Preserves squad depth editor across formation change re-renders. */
let squadDepthDraft = null;
const LINEUP_SLOTS = 11;

function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("admin-hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("admin-hidden"), 2600);
}

function state() {
  return FCDataStore.getState();
}

function leagues() {
  return state().leagues ?? [];
}

function leagueName(id) {
  return leagues().find((l) => l.id === id)?.name ?? id;
}

function teamsForLeague(leagueId) {
  return state().teams.filter((t) => t.leagueId === leagueId);
}

function stadiumsForLeague(leagueId) {
  return FCDataStore.getLeagueStadiums(leagueId);
}

function stadiumSelectField(leagueId, selected, opts = {}) {
  const { id = "matchStadium", label = "Stadium", note = "" } = opts;
  const list = stadiumsForLeague(leagueId);
  const val = String(selected ?? "").trim();
  const normalized = val && val !== "—" ? val : "";
  const options = ['<option value="">— Select stadium —</option>'];
  const seen = new Set();
  for (const s of list) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const sel = s === normalized ? " selected" : "";
    options.push(`<option value="${esc(s)}"${sel}>${esc(s)}</option>`);
  }
  if (normalized && !seen.has(normalized)) {
    options.push(`<option value="${esc(normalized)}" selected>${esc(normalized)} (not in list)</option>`);
  }
  const noteHtml = note ? `<p class="mw-field-note admin-muted">${note}</p>` : "";
  return `<div class="mw-field"><label for="${id}">${label}</label><div class="mw-select-wrap"><select id="${id}" class="mw-select">${options.join("")}</select></div>${noteHtml}</div>`;
}

function ensureStadiumSelectOption(selectEl, value) {
  const v = String(value ?? "").trim();
  if (!selectEl || !v || v === "—") return;
  if ([...selectEl.options].some((o) => o.value === v)) {
    selectEl.value = v;
    return;
  }
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = `${v} (not in list)`;
  opt.selected = true;
  selectEl.appendChild(opt);
  selectEl.value = v;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function adminPlayerInstagramBadge(p) {
  if (!playerInstagramUrl(p)) return "";
  return `<span class="admin-player-ig" title="Instagram linked" aria-label="Instagram linked">${instagramIconSvg()}</span>`;
}

function adminPlayerSearchHaystack(p) {
  return [p.number, p.name, p.pos, p.role, p.nationality, p.club]
    .filter((x) => x != null && String(x).trim())
    .join(" ")
    .toLowerCase();
}

function applyPlayerRosterSearch() {
  const q = playerSearchQuery.trim().toLowerCase();
  const list = $("#playersSortTbody");
  if (!list) return;

  let visible = 0;
  for (const card of list.querySelectorAll(".player-roster-card")) {
    const hay = card.getAttribute("data-search") ?? "";
    const show = !q || hay.includes(q);
    card.classList.toggle("admin-hidden", !show);
    if (show) visible += 1;
  }

  const total = list.querySelectorAll(".player-roster-card").length;
  const empty = $("#playersRosterEmpty");
  if (empty) empty.classList.toggle("admin-hidden", visible > 0 || !q);

  const meta = $("#playersSearchMeta");
  if (meta) {
    meta.textContent = q ? `${visible} of ${total} players` : "";
    meta.classList.toggle("admin-hidden", !q);
  }

  const clearBtn = $("#btnClearPlayerSearch");
  if (clearBtn) clearBtn.classList.toggle("admin-hidden", !q);
}

function playerRosterCardHtml(p, isWorldCup) {
  const clubMeta =
    isWorldCup && p.club
      ? `<span class="player-roster-club">${esc(p.club)}</span>`
      : "";
  const metaParts = [
    `<span class="player-roster-pos">${esc(p.pos)}</span>`,
    `<span class="player-roster-role">${esc(p.role ?? "")}</span>`,
    clubMeta,
  ].filter(Boolean);
  return `<article class="player-roster-card player-sort-row" draggable="true" data-player-id="${esc(p.id)}" data-search="${esc(adminPlayerSearchHaystack(p))}">
    <span class="player-drag-handle" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span>
    <div class="player-roster-body">
      <div class="player-roster-line">
        <span class="player-roster-num">${esc(p.number)}</span>
        <div class="player-roster-copy">
          <div class="admin-player-name-inner">
            <strong class="admin-player-name">${esc(p.name)}</strong>${adminPlayerInstagramBadge(p)}
          </div>
          <div class="player-roster-meta">${metaParts.join('<span class="player-roster-meta-sep" aria-hidden="true">·</span>')}</div>
        </div>
      </div>
      <div class="admin-row-actions player-roster-actions">
        <button type="button" class="mw-btn-ghost players-row-btn" data-edit-player="${esc(p.id)}">Edit</button>
        <button type="button" class="mw-btn-ghost players-row-btn players-row-btn--transfer" data-transfer-player="${esc(p.id)}" title="Transfer to another club"><span class="players-row-btn-long">Transfer</span><span class="players-row-btn-short">Move</span></button>
        <button type="button" class="mw-btn-danger players-row-btn" data-del-player="${esc(p.id)}">Remove</button>
      </div>
    </div>
  </article>`;
}

function showLogin(show) {
  const login = $("#loginView");
  const app = $("#appView");
  if (login) login.classList.toggle("admin-hidden", !show);
  if (app) app.classList.toggle("admin-hidden", show);
}

function setSeedLoading(on) {
  $("#seedLoading")?.classList.toggle("admin-hidden", !on);
}

function renderNav() {
  const nav = $("#adminNav");
  if (!nav) return;
  nav.innerHTML = TABS.map(
    (t) =>
      `<button type="button" data-tab="${t.id}" aria-current="${activeTab === t.id ? "page" : "false"}">${esc(t.label)}</button>`,
  ).join("");
  for (const b of nav.querySelectorAll("[data-tab]")) {
    b.addEventListener("click", () => {
      activeTab = b.getAttribute("data-tab");
      renderNav();
      renderPanel();
    });
  }
  updateAdminNavArrows();
  requestAnimationFrame(() => {
    updateAdminNavArrows();
    nav.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "nearest", block: "nearest" });
  });
}

function updateAdminNavArrows() {
  const nav = $("#adminNav");
  const prev = $("#adminNavPrev");
  const next = $("#adminNavNext");
  const wrap = $(".admin-nav-wrap");
  if (!nav || !prev || !next || !wrap) return;

  const desktop = window.matchMedia("(min-width: 992px)").matches;
  wrap.classList.toggle("admin-nav-wrap--scrollable", !desktop);

  if (desktop) {
    prev.disabled = true;
    next.disabled = true;
    return;
  }

  const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
  const canScroll = maxScroll > 4;
  wrap.classList.toggle("admin-nav-wrap--overflow", canScroll);

  if (!canScroll) {
    prev.disabled = true;
    next.disabled = true;
    return;
  }

  prev.disabled = nav.scrollLeft <= 2;
  next.disabled = nav.scrollLeft >= maxScroll - 2;
}

function bindAdminNavScroll() {
  const nav = $("#adminNav");
  const prev = $("#adminNavPrev");
  const next = $("#adminNavNext");
  if (!nav || nav.dataset.scrollBound === "1") return;
  nav.dataset.scrollBound = "1";

  const scrollStep = () => Math.max(140, Math.round(nav.clientWidth * 0.65));

  prev?.addEventListener("click", () => {
    nav.scrollBy({ left: -scrollStep(), behavior: "smooth" });
  });
  next?.addEventListener("click", () => {
    nav.scrollBy({ left: scrollStep(), behavior: "smooth" });
  });
  nav.addEventListener("scroll", () => updateAdminNavArrows(), { passive: true });
  window.addEventListener("resize", () => updateAdminNavArrows());
  updateAdminNavArrows();
}

function leagueSelect(id = "leagueFilter", value = leagueFilter, fieldClass = "admin-field") {
  const opts = leagues()
    .map((l) => `<option value="${esc(l.id)}"${l.id === value ? " selected" : ""}>${esc(l.name)}</option>`)
    .join("");
  const modern = fieldClass.includes("mw-field");
  if (modern) {
    return `<div class="${fieldClass}"><label for="${id}">League</label><div class="mw-select-wrap"><select id="${id}" class="mw-select">${opts}</select></div></div>`;
  }
  return `<div class="${fieldClass}"><label for="${id}">League</label><div class="mw-select-wrap"><select id="${id}" class="mw-select">${opts}</select></div></div>`;
}

function panelOverview() {
  const s = state();
  const leagueCount = new Set(s.teams.map((t) => t.leagueId)).size;
  const rev = s.dataRevision ? new Date(s.dataRevision).toLocaleString() : "Built-in seed";
  const storageNote = "Saved in this browser (localStorage) until you export or publish.";
  const firebaseReady = typeof FCFirebase !== "undefined" && FCFirebase.isConfigured();
  const firebaseSignedIn = firebaseReady && FCFirebase.isSignedIn();
  const firebaseStatus = typeof FCFirebase !== "undefined" ? FCFirebase.statusLabel() : "Firebase module not loaded";

  return `
    <div class="overview-page">
      <header class="overview-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 overview-hero-text">
            <p class="overview-eyebrow">Dashboard</p>
            <h2 class="overview-heading">Overview</h2>
            <p class="overview-lead">${storageNote} Publish live with <strong>Firebase</strong> or commit <code>data.json</code> to GitHub.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="overview-hero-badge w-100">
              <span class="overview-hero-badge-label">Last data revision</span>
              <span class="overview-hero-badge-value">${esc(String(rev))}</span>
            </div>
          </div>
        </div>
      </header>

      <div class="row g-2 g-md-3 overview-stats">
        <div class="col-6 col-lg-3">
          <article class="overview-stat overview-stat--teams h-100">
            <span class="overview-stat-icon" aria-hidden="true">⚽</span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.teams.length}</span>
              <span class="overview-stat-label">Teams</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="overview-stat overview-stat--players h-100">
            <span class="overview-stat-icon" aria-hidden="true">👤</span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.players.length}</span>
              <span class="overview-stat-label">Players</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="overview-stat overview-stat--matches h-100">
            <span class="overview-stat-icon" aria-hidden="true">📅</span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.matches.length}</span>
              <span class="overview-stat-label">Matches</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="overview-stat overview-stat--leagues h-100">
            <span class="overview-stat-icon" aria-hidden="true">🏆</span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${leagueCount}</span>
              <span class="overview-stat-label">Leagues active</span>
            </div>
          </article>
        </div>
      </div>

      <section class="overview-card overview-publish">
        <div class="overview-card-head">
          <h3>Publish to GitHub</h3>
          <p>Visitors load <code>data.json</code> from your repo — not <code>app.js</code>.</p>
        </div>
        <ol class="overview-steps">
          <li><span class="overview-step-n">1</span><span>Edit squads, matchweek &amp; transfers in admin tabs</span></li>
          <li><span class="overview-step-n">2</span><span>Download <strong>data.json</strong> below</span></li>
          <li><span class="overview-step-n">3</span><span>Upload or <code>git push</code> to SquadCentral repo</span></li>
          <li><span class="overview-step-n">4</span><span>Wait 2–5 min · test live site in Incognito</span></li>
        </ol>
        <a class="overview-doc-link" href="./DATA.md" target="_blank" rel="noopener">Read DATA.md guide →</a>
      </section>

      <section class="overview-card overview-publish" id="firebasePublishCard">
        <div class="overview-card-head">
          <h3>Publish to Firebase</h3>
          <p>Push live data to Firestore — visitors sync instantly without a git deploy.</p>
        </div>
        <p class="overview-firebase-status" id="firebaseStatus">${esc(firebaseStatus)}</p>
        ${
          firebaseReady
            ? `
        <div class="row g-2 mb-3${firebaseSignedIn ? " admin-hidden" : ""}" id="firebaseSignInBlock">
          <div class="col-12 col-md-6">
            <div class="mw-field">
              <label for="firebaseEmail">Firebase admin email</label>
              <input id="firebaseEmail" class="mw-input" type="email" autocomplete="username" placeholder="admin@example.com" />
            </div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field">
              <label for="firebasePassword">Password</label>
              <input id="firebasePassword" class="mw-input" type="password" autocomplete="current-password" placeholder="••••••••" />
            </div>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnFirebaseSignIn">Sign in to Firebase</button>
          </div>
        </div>
        <div class="row g-2 overview-actions${firebaseSignedIn ? "" : " admin-hidden"}" id="firebaseSignedInBlock">
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action overview-action--primary w-100" id="btnPublishFirebase">
              <span class="overview-action-icon" aria-hidden="true">☁</span>
              <span class="overview-action-text">
                <strong>Publish live to Firebase</strong>
                <small>Updates Firestore published/site</small>
              </span>
            </button>
          </div>
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action w-100" id="btnFirebaseSignOut">
              <span class="overview-action-icon" aria-hidden="true">⎋</span>
              <span class="overview-action-text">
                <strong>Sign out of Firebase</strong>
                <small>${esc(FCFirebase.currentUser()?.email ?? "")}</small>
              </span>
            </button>
          </div>
        </div>`
            : `
        <ol class="overview-steps">
          <li><span class="overview-step-n">1</span><span>Register the web app in Firebase Console (project <strong>squadcentral-12a3d</strong>)</span></li>
          <li><span class="overview-step-n">2</span><span>Paste config into <code>firebase-config.js</code> and set <code>enabled: true</code></span></li>
          <li><span class="overview-step-n">3</span><span>Enable Firestore + Email/Password auth</span></li>
        </ol>
        <a class="overview-doc-link" href="./FIREBASE.md" target="_blank" rel="noopener">Read FIREBASE.md setup guide →</a>`
        }
      </section>

      <section class="overview-card">
        <div class="overview-card-head">
          <h3>Data actions</h3>
          <p>Export, import, or reset your local copy.</p>
        </div>
        <div class="row g-2 overview-actions">
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action overview-action--primary w-100" id="btnExport">
              <span class="overview-action-icon" aria-hidden="true">↓</span>
              <span class="overview-action-text">
                <strong>Download data.json</strong>
                <small>For GitHub Pages &amp; backup</small>
              </span>
            </button>
          </div>
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action w-100" id="btnExportCopy">
              <span class="overview-action-icon" aria-hidden="true">⎘</span>
              <span class="overview-action-text">
                <strong>Copy JSON</strong>
                <small>Paste into data.json manually</small>
              </span>
            </button>
          </div>
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action w-100" id="btnImport">
              <span class="overview-action-icon" aria-hidden="true">↑</span>
              <span class="overview-action-text">
                <strong>Import JSON</strong>
                <small>Restore from a backup file</small>
              </span>
            </button>
          </div>
          <div class="col-12 col-md-6">
            <button type="button" class="overview-action overview-action--danger w-100" id="btnReset">
              <span class="overview-action-icon" aria-hidden="true">↺</span>
              <span class="overview-action-text">
                <strong>Reset to published seed</strong>
                <small>Clears local overrides</small>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section class="overview-card overview-import admin-hidden" id="importCard">
        <div class="overview-card-head">
          <h3>Import JSON</h3>
          <p>Paste exported data below. This replaces your local database.</p>
        </div>
        <div class="admin-field">
          <textarea id="importText" class="overview-import-area" placeholder='{ "version": 1, "teams": […], … }'></textarea>
        </div>
        <div class="overview-import-actions">
          <button type="button" class="admin-btn primary" id="btnImportConfirm">Apply import</button>
          <button type="button" class="admin-btn ghost" id="btnImportCancel">Cancel</button>
        </div>
      </section>
    </div>
  `;
}

const PLAYER_ROLE_ORDER = ["GK", "CB", "RB", "LB", "RM", "LM", "DM", "CM", "AM", "RAM", "LAM", "RW", "LW", "CF"];

function playerRoleRank(p) {
  const role = String(p.role ?? "").trim().toUpperCase();
  const idx = PLAYER_ROLE_ORDER.indexOf(role);
  if (idx !== -1) return idx;
  const pos = String(p.pos ?? "").trim().toUpperCase();
  const posFallback = { GK: 0, DF: 3, MF: 8, FW: 10 };
  return posFallback[pos] ?? PLAYER_ROLE_ORDER.length;
}

function comparePlayerOrder(a, b) {
  const ao = a.sortOrder ?? 1e9;
  const bo = b.sortOrder ?? 1e9;
  if (ao !== bo) return ao - bo;
  const roleCmp = playerRoleRank(a) - playerRoleRank(b);
  if (roleCmp !== 0) return roleCmp;
  return Number(a.number) - Number(b.number) || String(a.name).localeCompare(b.name);
}

function playersForTeam(teamId) {
  return state().players.filter((p) => p.teamId === teamId).sort(comparePlayerOrder);
}

function playerNameOptions(teamId, selectedName, emptyLabel = "— Player —") {
  if (!teamId) return `<option value="">— Select team first —</option>`;
  const opts = playersForTeam(teamId).map((p) => {
    const label = `${p.number} · ${p.name}`;
    const sel = p.name === selectedName ? " selected" : "";
    return `<option value="${esc(p.name)}"${sel}>${esc(label)}</option>`;
  });
  return `<option value="">${esc(emptyLabel)}</option>${opts.join("")}`;
}

function readMwEditorDraft() {
  const idEl = $("#matchEditId");
  if (!idEl) return null;
  const formId = idEl.value;
  if (matchEditId && formId !== matchEditId) return null;
  if (!matchEditId && formId) return null;

  const home = $("#matchHome")?.value;
  const away = $("#matchAway")?.value;
  if (!home || !away) return null;

  return {
    id: matchEditId || "",
    time: $("#matchTime")?.value ?? "",
    stadium: $("#matchStadium")?.value ?? "",
    homeTeamId: home,
    awayTeamId: away,
    score: [Number($("#matchHomeScore")?.value) || 0, Number($("#matchAwayScore")?.value) || 0],
    formation: [$("#matchFormHome")?.value?.trim() || "4-2-3-1", $("#matchFormAway")?.value?.trim() || "4-3-3"],
    goalEvents: readGoalEventsFromDom(),
    lineups: {
      home: readLineupFromDom("home"),
      away: readLineupFromDom("away"),
    },
  };
}

function rosterHasPlayerName(teamId, name) {
  const n = String(name ?? "").trim();
  if (!n || !teamId) return false;
  return playersForTeam(teamId).some((p) => p.name === n);
}

function goalEventPlayerChoices(teamId, emptyLabel) {
  if (!teamId) return [{ name: "", label: "— Select team first —" }];
  return [
    { name: "", label: emptyLabel },
    ...playersForTeam(teamId).map((p) => ({
      name: p.name,
      label: `${p.number} · ${p.name}`,
    })),
  ];
}

function goalEventEmptyLabel(kind) {
  return kind === "assist" ? "— No assist —" : "— Player —";
}

function renderGoalEventPlayerPickHtml(kind, teamId, selectedName, emptyLabel) {
  const selected = String(selectedName ?? "").trim();
  const options = goalEventPlayerChoices(teamId, emptyLabel)
    .map((c) => {
      const sel = c.name === selected ? " selected" : "";
      return `<option value="${esc(c.name)}"${sel}>${esc(c.label)}</option>`;
    })
    .join("");
  const ariaLabel = kind === "assist" ? "Assist" : "Scorer";
  return `
    <div class="mw-select-wrap mw-select-wrap--compact">
      <select class="ge-${kind}-pick mw-select" aria-label="${ariaLabel}">${options}</select>
    </div>`;
}

const GOAL_EVENT_TYPES = ["Own Goal", "Penalty", "Free kick", "Free Kick", "Header"];

function normalizeGoalEventType(type) {
  const t = String(type ?? "").trim();
  if (!t) return "";
  if (t === "Free Kick") return "Free kick";
  return t;
}

function renderGoalEventTypeField(type) {
  const raw = String(type ?? "").trim();
  const val = normalizeGoalEventType(raw);
  const known = new Set(["", ...GOAL_EVENT_TYPES.map(normalizeGoalEventType)]);
  const isKnown = known.has(val);
  const opts = ["Own Goal", "Penalty", "Free kick", "Header"]
    .map(
      (t) =>
        `<option value="${esc(t)}"${val === t ? " selected" : ""}>${esc(t)}</option>`,
    )
    .join("");

  return `
    <div class="ge-type-wrap">
      <div class="mw-select-wrap mw-select-wrap--compact">
        <select class="ge-type-select mw-select" aria-label="Goal type">
          <option value=""${!val ? " selected" : ""}>— Normal —</option>
          ${opts}
          <option value="__custom__"${val && !isKnown ? " selected" : ""}>Other…</option>
        </select>
      </div>
      <input class="ge-type-custom mw-input${val && !isKnown ? "" : " admin-hidden"}" value="${esc(val && !isKnown ? raw : "")}" placeholder="Custom type" />
    </div>`;
}

function readGoalEventTypeFromDom(row) {
  const sel = row.querySelector(".ge-type-select")?.value ?? "";
  if (sel === "__custom__") {
    return row.querySelector(".ge-type-custom")?.value.trim() || undefined;
  }
  const type = sel.trim();
  return type || undefined;
}

function renderGoalEventPlayerFields(kind, teamId, value) {
  const isAssist = kind === "assist";
  const emptyLabel = isAssist ? "— No assist —" : "— Player —";
  const label = isAssist ? "Assist" : "Scorer";
  const useManual = Boolean(String(value ?? "").trim()) && !rosterHasPlayerName(teamId, value);

  return `
    <div class="ge-player-col ge-player-col--${kind}">
      <div class="mw-select-wrap mw-select-wrap--compact ge-mode-wrap">
        <select class="ge-${kind}-mode mw-select" aria-label="${label} source">
          <option value="roster"${useManual ? "" : " selected"}>From roster</option>
          <option value="manual"${useManual ? " selected" : ""}>Manual</option>
        </select>
      </div>
      <div class="ge-${kind}-roster${useManual ? " admin-hidden" : ""}">
        ${renderGoalEventPlayerPickHtml(kind, teamId, value ?? "", emptyLabel)}
      </div>
      <div class="ge-${kind}-manual${useManual ? "" : " admin-hidden"}">
        <input class="ge-${kind}-man mw-input" type="text" value="${esc(useManual ? value ?? "" : "")}" placeholder="${isAssist ? "Assist name" : "Scorer name"}" />
      </div>
    </div>`;
}

function goalScorerSideForEditor(ev, homeTeamId, awayTeamId, lineups) {
  const stored = ev?.side === "away" ? "away" : "home";
  if (!isOwnGoalType(ev?.type)) return stored;
  const scorerSide = findScorerSideForGoal(ev?.scorer, homeTeamId, awayTeamId, lineups);
  if (scorerSide) return scorerSide;
  return stored === "home" ? "away" : "home";
}

function renderGoalEventRowHtml(ev, index, homeTeamId, awayTeamId, lineups) {
  const data = ev ?? {};
  const side = goalScorerSideForEditor(data, homeTeamId, awayTeamId, lineups);
  const teamId = side === "home" ? homeTeamId : awayTeamId;
  return `<tr class="ge-row" data-i="${index}">
    <td><input class="ge-min" type="number" min="0" max="120" value="${esc(data.minute ?? "")}" placeholder="min" style="width:64px" /></td>
    <td><div class="mw-select-wrap mw-select-wrap--compact"><select class="ge-side mw-select">
      <option value="home"${side === "home" ? " selected" : ""}>Home</option>
      <option value="away"${side === "away" ? " selected" : ""}>Away</option>
    </select></div></td>
    <td>${renderGoalEventPlayerFields("scorer", teamId, data.scorer ?? "")}</td>
    <td>${renderGoalEventPlayerFields("assist", teamId, data.assist ?? "")}</td>
    <td>${renderGoalEventTypeField(data.type ?? "")}</td>
    <td><button type="button" class="admin-btn danger ge-del" title="Remove">×</button></td>
  </tr>`;
}

function readGoalEventPlayerFromDom(row, kind) {
  const mode = row.querySelector(`.ge-${kind}-mode`)?.value === "manual" ? "manual" : "roster";
  if (mode === "roster") {
    return row.querySelector(`.ge-${kind}-pick`)?.value?.trim() ?? "";
  }
  return row.querySelector(`.ge-${kind}-man`)?.value?.trim() ?? "";
}

function refreshGoalEventRowPlayers(row) {
  if (!row) return;
  const side = row.querySelector(".ge-side")?.value === "away" ? "away" : "home";
  const teamId = side === "away" ? $("#matchAway")?.value : $("#matchHome")?.value;

  for (const kind of ["scorer", "assist"]) {
    if (row.querySelector(`.ge-${kind}-mode`)?.value === "manual") continue;
    const rosterEl = row.querySelector(`.ge-${kind}-roster`);
    const pick = row.querySelector(`.ge-${kind}-pick`);
    const val = pick?.value ?? "";
    if (rosterEl) {
      rosterEl.innerHTML = renderGoalEventPlayerPickHtml(kind, teamId, val, goalEventEmptyLabel(kind));
    }
  }
}

function renderGoalEventsEditor(events, homeTeamId, awayTeamId, lineups) {
  const list = events?.length ? events : [{}];
  const rows = list.map((ev, i) => renderGoalEventRowHtml(ev, i, homeTeamId, awayTeamId, lineups)).join("");

  return `
    <div class="mw-goals-wrap">
      <table class="admin-table admin-table-compact mw-goals-table">
        <thead><tr><th>Min</th><th>Side</th><th>Scorer</th><th>Assist</th><th>Type</th><th></th></tr></thead>
        <tbody id="goalEventsBody">${rows}</tbody>
      </table>
    </div>
    <button type="button" class="mw-btn-add-row" id="btnAddGoal">+ Add goal event</button>
  `;
}

function stripCaptainSuffix(name) {
  return String(name ?? "").replace(/\s*\(C\)\s*$/i, "").trim();
}

function playerNameMarksCaptain(name) {
  return /\s*\(C\)\s*$/i.test(String(name ?? "").trim());
}

function lineupSlotIsCaptain(data, rosterPlayer) {
  if (data?.captain) return true;
  if (playerNameMarksCaptain(data?.name)) return true;
  if (playerNameMarksCaptain(rosterPlayer?.name)) return true;
  return false;
}

function inferPosFromTag(tag) {
  const t = String(tag ?? "")
    .trim()
    .toUpperCase();
  if (!t) return "MF";
  if (t === "GK" || t.startsWith("G")) return "GK";
  if (["CB", "RB", "LB", "DF", "WB", "RWB", "LWB"].some((x) => t.includes(x))) return "DF";
  if (["CM", "DM", "AM", "MF", "RM", "LM", "CDM", "CAM", "CMF", "DMF", "AMF"].some((x) => t.includes(x)))
    return "MF";
  if (["FW", "CF", "ST", "RW", "LW", "SS"].some((x) => t.includes(x))) return "FW";
  return "MF";
}

function findRosterPlayerForLineupSlot(teamId, slot) {
  if (!slot?.name) return null;
  const num = Number(slot.number);
  const slotName = stripCaptainSuffix(slot.name);
  return (
    playersForTeam(teamId).find(
      (p) => stripCaptainSuffix(p.name) === slotName && Number(p.number) === num,
    ) ??
    playersForTeam(teamId).find((p) => stripCaptainSuffix(p.name) === slotName || p.name === slot.name)
  );
}

function renderLineupSlot(side, teamId, index, slot) {
  const data = slot ?? {};
  const matched = findRosterPlayerForLineupSlot(teamId, data);
  const useManual = Boolean(data.name && !matched);
  const pickId = matched?.id ?? "";
  const isCap = lineupSlotIsCaptain(data, matched);
  const playerPick = playersForTeam(teamId)
    .map((p) => {
      const sel = p.id === pickId ? " selected" : "";
      return `<option value="${esc(p.id)}"${sel}>${esc(p.number)} · ${esc(p.name)}</option>`;
    })
    .join("");
  const flagVal = data.flag ?? (typeof NationalityFlags !== "undefined" ? NationalityFlags.getFlag(data.nationality) : "") ?? "";

  return `
    <div class="admin-lineup-slot" data-side="${side}" data-i="${index}">
      <div class="lineup-slot-head">
        <span class="lineup-slot-idx">#${index + 1}</span>
        <div class="mw-select-wrap mw-select-wrap--compact lineup-mode-wrap">
          <select class="lineup-mode mw-select" aria-label="Lineup entry source">
            <option value="roster"${useManual ? "" : " selected"}>From roster</option>
            <option value="manual"${useManual ? " selected" : ""}>Manual</option>
          </select>
        </div>
      </div>
      <div class="lineup-roster-fields${useManual ? " admin-hidden" : ""}">
        <div class="mw-select-wrap mw-select-wrap--compact">
          <select class="lineup-pick mw-select"><option value="">— Pick player —</option>${playerPick}</select>
        </div>
      </div>
      <div class="lineup-manual-fields${useManual ? "" : " admin-hidden"}">
        <input class="lineup-man-num" type="number" min="0" max="99" value="${esc(data.number ?? "")}" placeholder="#" title="Shirt number" />
        <input class="lineup-man-name" type="text" value="${esc(data.name ?? "")}" placeholder="Player name" />
        <input class="lineup-man-nat" type="text" value="${esc(data.nationality ?? "")}" placeholder="Nationality" list="nationalityList" />
        <input class="lineup-man-flag" type="text" value="${esc(flagVal)}" placeholder="Flag 🇫🇷" title="Flag emoji (optional)" />
      </div>
      <div class="lineup-slot-meta">
        <input class="lineup-tag" value="${esc(data.tag ?? "")}" placeholder="GK" title="Position tag" />
        <label class="lineup-cap-label" title="Captain (or mark captain in roster name)"><input type="checkbox" class="lineup-cap"${isCap ? " checked" : ""} /> C</label>
      </div>
      <label class="lineup-add-roster-wrap${useManual ? "" : " admin-hidden"}" title="Save this player to the team squad">
        <input type="checkbox" class="lineup-add-roster" />
        <span>Add to squad roster</span>
      </label>
    </div>
  `;
}

function parseMwNumber(matchday) {
  const m = String(matchday ?? "").match(/MW\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}

function cloneLineupSlots(lineup) {
  return JSON.parse(JSON.stringify(lineup ?? []));
}

/** Earlier matchweek lineups for this team (newest first). */
function listLineupSources(leagueId, teamId, currentMw, excludeMatchId) {
  if (!teamId) return [];
  const candidates = [];

  for (const m of state().matches) {
    if (m.leagueId !== leagueId) continue;
    if (excludeMatchId && m.id === excludeMatchId) continue;
    const side = m.homeTeamId === teamId ? "home" : m.awayTeamId === teamId ? "away" : null;
    if (!side) continue;
    const lineup = m.lineups?.[side];
    if (!lineup?.length) continue;

    const mw = parseMwNumber(m.matchday);
    const oppId = side === "home" ? m.awayTeamId : m.homeTeamId;
    const opp = state().teams.find((t) => t.id === oppId);
    const venue = side === "home" ? "Home" : "Away";
    candidates.push({
      matchId: m.id,
      mw,
      lineup: cloneLineupSlots(lineup),
      label: `MW ${mw || "?"} vs ${opp?.name ?? "—"} (${venue})`,
      isEarlierMw: mw > 0 && mw < currentMw,
    });
  }

  candidates.sort((a, b) => {
    if (a.isEarlierMw !== b.isEarlierMw) return a.isEarlierMw ? -1 : 1;
    return b.mw - a.mw;
  });
  return candidates;
}

function getLineupSourceByMatchId(sources, matchId) {
  return sources.find((s) => s.matchId === matchId) ?? sources[0];
}

function renderLineupEditor(side, teamId, lineup, editorOpts = {}) {
  const label = side === "home" ? "Home lineup" : "Away lineup";
  const team = state().teams.find((t) => t.id === teamId);
  const currentMw = editorOpts.currentMw ?? 36;
  const excludeMatchId = editorOpts.excludeMatchId ?? "";
  const sources = listLineupSources(leagueFilter, teamId, currentMw, excludeMatchId);
  const slots = Array.from({ length: LINEUP_SLOTS }, (_, i) => renderLineupSlot(side, teamId, i, lineup?.[i])).join("");

  const sourceSelect =
    sources.length > 0
      ? `<div class="mw-select-wrap mw-select-wrap--compact mw-lineup-source-wrap">
          <select class="mw-lineup-source mw-select" data-lineup-source="${side}" aria-label="Lineup source for ${esc(label)}">
            ${sources.map((s, i) => `<option value="${esc(s.matchId)}"${i === 0 ? " selected" : ""}>${esc(s.label)}</option>`).join("")}
          </select>
        </div>`
      : "";

  const copyTools = sources.length
    ? `<div class="mw-lineup-tools">
        ${sourceSelect}
        <button type="button" class="mw-btn-ghost mw-btn-copy-lineup" data-copy-lineup="${side}">Copy lineup</button>
      </div>`
    : `<p class="mw-lineup-no-copy admin-muted">No saved lineup for ${esc(team?.name ?? "this team")} in an earlier matchweek yet.</p>`;

  return `
    <div class="mw-lineup-block h-100" data-lineup-side="${side}">
      <div class="mw-lineup-head row g-2 align-items-start">
        <div class="col-12">
          <h4 class="mw-lineup-title">${label}${team ? ` · ${esc(team.name)}` : ""}</h4>
        </div>
        <div class="col-12">${copyTools}</div>
      </div>
      <p class="mw-lineup-hint admin-muted">Pick from squad or enter manually. Use <strong>Copy lineup</strong> to pull the last XI from a previous matchweek, then edit and save.</p>
      <div class="admin-lineup-grid mw-lineup-grid">${slots}</div>
    </div>
  `;
}

function applyCopiedLineupToEditor(side, lineup, sourceLabel) {
  const existing = readMwEditorDraft();
  const home = $("#matchHome")?.value;
  const away = $("#matchAway")?.value;
  const draft = existing ?? {
    id: matchEditId || "",
    time: $("#matchTime")?.value ?? "",
    stadium: $("#matchStadium")?.value ?? "",
    homeTeamId: home,
    awayTeamId: away,
    score: [Number($("#matchHomeScore")?.value) || 0, Number($("#matchAwayScore")?.value) || 0],
    formation: [$("#matchFormHome")?.value?.trim() || "4-2-3-1", $("#matchFormAway")?.value?.trim() || "4-3-3"],
    goalEvents: readGoalEventsFromDom(),
    lineups: { home: readLineupFromDom("home"), away: readLineupFromDom("away") },
  };

  draft.lineups = draft.lineups ?? { home: [], away: [] };
  draft.lineups[side] = cloneLineupSlots(lineup);
  mwEditorDraft = draft;
  renderPanel();
  toast(`Copied ${lineup.length} players — ${sourceLabel}`);
}

function renderFixtureCards(matches) {
  if (!matches.length) {
    return `
      <div class="mw-empty">
        <span class="mw-empty-icon" aria-hidden="true">📅</span>
        <p class="mw-empty-title">No fixtures yet</p>
        <p class="mw-empty-text">Add matches for this gameweek — they appear in the public Match Center.</p>
        <button type="button" class="mw-btn-primary mw-btn-primary--sm w-100 w-sm-auto" id="btnNewMwMatchEmpty">+ Add first fixture</button>
      </div>`;
  }

  return `<div class="row g-2 g-md-3 mw-fixture-list">${matches
    .map((match) => {
      const ht = state().teams.find((t) => t.id === match.homeTeamId);
      const at = state().teams.find((t) => t.id === match.awayTeamId);
      const hName = ht?.name ?? "Home";
      const aName = at?.name ?? "Away";
      const goals = (match.goalEvents ?? []).length;
      const lineupN = (match.lineups?.home?.length ?? 0) + (match.lineups?.away?.length ?? 0);
      const active = matchEditId === match.id;
      const crestStyle = (logo) =>
        logo
          ? `style="background-color:#eef2f7;background-image:url('${esc(logo)}');background-size:68% auto;background-position:center;background-repeat:no-repeat"`
          : "";
      const hLogo = crestStyle(ht?.logo);
      const aLogo = crestStyle(at?.logo);

      return `
        <div class="col-12 col-lg-6">
        <article class="mw-fixture-card h-100${active ? " is-active" : ""}">
          <div class="mw-fixture-top">
            <span class="mw-fixture-day">${esc(match.time ?? "—")}</span>
            ${active ? '<span class="mw-fixture-editing">Editing</span>' : ""}
          </div>
          <div class="mw-fixture-scoreline">
            <div class="mw-fixture-club home">
              <span class="mw-fixture-crest" ${hLogo} aria-hidden="true"></span>
              <span class="mw-fixture-name">${esc(hName)}</span>
            </div>
            <div class="mw-fixture-result">
              <span class="mw-fixture-goals">${esc(match.score?.[0] ?? 0)}</span>
              <span class="mw-fixture-sep">–</span>
              <span class="mw-fixture-goals">${esc(match.score?.[1] ?? 0)}</span>
            </div>
            <div class="mw-fixture-club away">
              <span class="mw-fixture-crest" ${aLogo} aria-hidden="true"></span>
              <span class="mw-fixture-name">${esc(aName)}</span>
            </div>
          </div>
          <div class="mw-fixture-meta">
            ${match.matchday && typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter) ? `<span class="mw-pill">${esc(match.matchday)}</span>` : ""}
            ${goals ? `<span class="mw-pill mw-pill--goals">${goals} goal${goals === 1 ? "" : "s"}</span>` : ""}
            ${lineupN ? `<span class="mw-pill mw-pill--lineup">${lineupN} in lineup</span>` : ""}
            ${match.stadium ? `<span class="mw-pill mw-pill--venue">${esc(match.stadium)}</span>` : ""}
          </div>
          <div class="mw-fixture-actions">
            <button type="button" class="mw-btn-ghost" data-edit-mw-match="${esc(match.id)}">Edit</button>
            <button type="button" class="mw-btn-danger" data-del-mw-match="${esc(match.id)}">Remove</button>
          </div>
        </article>
        </div>`;
    })
    .join("")}</div>`;
}

function nationalityDatalistHtml() {
  const names = new Set(typeof NationalityFlags !== "undefined" ? NationalityFlags.listNationalities() : []);
  for (const p of state().players) {
    if (p.nationality?.trim()) names.add(p.nationality.trim());
  }
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${esc(n)}"></option>`)
    .join("");
}

function leagueUiValue(id) {
  const fallback = { c1: "#2de2e6", c2: "#7c5cff", mask: "trophy" };
  return { ...fallback, ...(state().leagueUi?.[id] ?? {}) };
}

function leagueFeatureValue(id, fid) {
  const stored = state().leagueFeatures?.[id];
  if (stored && Object.prototype.hasOwnProperty.call(stored, fid)) return stored[fid] !== false;
  const defaults = typeof defaultLeagueFeatures === "function" ? defaultLeagueFeatures(id) : {};
  return defaults[fid] !== false;
}

function panelLeagues() {
  const all = leagues();
  const editing = !!leagueEditId && all.some((l) => l.id === leagueEditId);
  const editLeague = editing ? all.find((l) => l.id === leagueEditId) : null;
  const ui = leagueUiValue(editing ? leagueEditId : "__new__");
  const maskKeys = typeof LEAGUE_MASKS !== "undefined" ? Object.keys(LEAGUE_MASKS) : ["trophy"];
  const schema = typeof LEAGUE_FEATURE_SCHEMA !== "undefined" ? LEAGUE_FEATURE_SCHEMA : [];

  const featureRefId = editing ? leagueEditId : "__new__";
  const groups = {};
  for (const f of schema) (groups[f.group] ??= []).push(f);
  const featureGroupsHtml = Object.entries(groups)
    .map(
      ([group, items]) => `
        <div class="col-12 col-md-6">
          <div class="lg-feature-group">
            <p class="lg-feature-group-title">${esc(group)}</p>
            ${items
              .map(
                (f) => `
                  <label class="lg-toggle">
                    <input type="checkbox" class="lg-feature" data-feature="${esc(f.id)}" ${leagueFeatureValue(featureRefId, f.id) ? "checked" : ""} />
                    <span>${esc(f.label)}</span>
                  </label>
                `,
              )
              .join("")}
          </div>
        </div>
      `,
    )
    .join("");

  const listRows = all.length
    ? all
        .map((l) => {
          const lui = leagueUiValue(l.id);
          const teamCount = state().teams.filter((t) => t.leagueId === l.id).length;
          return `
            <div class="lg-row row align-items-center g-2 mx-0 py-2">
              <div class="col-auto">
                <span class="lg-swatch" style="background:linear-gradient(135deg, ${esc(lui.c1)}, ${esc(lui.c2)})" aria-hidden="true"></span>
              </div>
              <div class="col min-w-0">
                <div class="lg-row-name">${esc(l.name)}</div>
                <div class="lg-row-meta admin-muted">${esc(l.id)} · ${teamCount} team${teamCount === 1 ? "" : "s"}</div>
              </div>
              <div class="col-12 col-sm-auto">
                <div class="d-grid d-sm-flex gap-2">
                  <button type="button" class="mw-btn-ghost mw-btn-primary--sm" data-edit-league="${esc(l.id)}">Edit</button>
                  <button type="button" class="mw-btn-ghost mw-btn-primary--sm lg-danger" data-del-league="${esc(l.id)}">Delete</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="admin-muted mb-0">No leagues yet. Add one below.</p>`;

  return `
    <div class="mw-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Competitions</p>
            <h2 class="mw-heading">Leagues</h2>
            <p class="mw-lead">Create a league, set its accent + icon, then build its teams, players, and matchweeks using the same editors. Turn sections and fields on or off per league.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">Total leagues</span>
              <strong class="mw-hero-preview-title">${all.length}</strong>
              <span class="mw-hero-preview-range">${esc(all.map((l) => l.name).slice(0, 3).join(", "))}${all.length > 3 ? "…" : ""}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>All leagues</h3>
          <p>Edit accents/features or remove a league (this also deletes its teams, players, and fixtures).</p>
        </div>
        <div class="lg-list">${listRows}</div>
      </section>

      <section class="mw-card mw-editor is-open" id="leagueEditor">
        <div class="mw-editor-head">
          <div>
            <p class="mw-eyebrow">${editing ? "Editing league" : "New league"}</p>
            <h3 class="mw-editor-title">${editing ? esc(editLeague?.name ?? "") : "Add a league"}</h3>
          </div>
          ${editing ? `<button type="button" class="mw-btn-ghost mw-btn-primary--sm" id="btnNewLeague">+ New league</button>` : ""}
        </div>

        <input type="hidden" id="leagueEditId" value="${esc(editing ? leagueEditId : "")}" />

        <div class="mw-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">①</span> Identity</h4>
          <div class="row g-2 g-md-3 mw-field-grid">
            <div class="col-12 col-md-6"><div class="mw-field"><label for="lgName">League name</label><input id="lgName" class="mw-input" type="text" value="${esc(editLeague?.name ?? "")}" placeholder="Eredivisie" /></div></div>
            <div class="col-12 col-md-6"><div class="mw-field"><label for="lgId">League ID</label><input id="lgId" class="mw-input" type="text" value="${esc(editing ? leagueEditId : "")}" placeholder="auto from name" ${editing ? "disabled" : ""} /><p class="mw-field-note admin-muted">${editing ? "ID can't change after creation." : "Leave blank to auto-generate from the name."}</p></div></div>
            <div class="col-6 col-md-3"><div class="mw-field"><label for="lgC1">Accent 1</label><input id="lgC1" class="mw-input lg-color" type="color" value="${esc(ui.c1)}" /></div></div>
            <div class="col-6 col-md-3"><div class="mw-field"><label for="lgC2">Accent 2</label><input id="lgC2" class="mw-input lg-color" type="color" value="${esc(ui.c2)}" /></div></div>
            <div class="col-12 col-md-6"><div class="mw-field"><label for="lgMask">Icon style</label><div class="mw-select-wrap"><select id="lgMask" class="mw-select">${maskKeys
              .map((k) => `<option value="${esc(k)}"${k === ui.mask ? " selected" : ""}>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</option>`)
              .join("")}</select></div></div>
          </div>
        </div>

        <div class="mw-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">②</span> Sections &amp; fields</h4>
          <p class="mw-section-hint">Uncheck anything you don't want shown on the public site for this league.</p>
          <div class="row g-3">${featureGroupsHtml}</div>
        </div>

        <button type="button" class="mw-btn-primary w-100 w-sm-auto" id="btnSaveLeague">${editing ? "Save league" : "Create league"}</button>
      </section>
    </div>
  `;
}

function bindLeagues() {
  $("#btnNewLeague")?.addEventListener("click", () => {
    leagueEditId = "";
    renderPanel();
  });

  document.querySelectorAll("[data-edit-league]").forEach((btn) => {
    btn.addEventListener("click", () => {
      leagueEditId = btn.getAttribute("data-edit-league") || "";
      renderPanel();
      $("#leagueEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-del-league]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-league");
      if (!id) return;
      const lg = leagues().find((l) => l.id === id);
      if (!confirm(`Delete "${lg?.name ?? id}" and ALL its teams, players, fixtures, standings, scorers and transfers? This cannot be undone.`)) return;
      FCDataStore.removeLeague(id);
      if (leagueFilter === id) leagueFilter = leagues()[0]?.id ?? "";
      if (leagueEditId === id) leagueEditId = "";
      afterLeagueChange();
      toast("League deleted");
      renderPanel();
    });
  });

  $("#btnSaveLeague")?.addEventListener("click", () => {
    const name = $("#lgName")?.value.trim();
    if (!name) return alert("League name required");

    const editing = !!$("#leagueEditId")?.value;
    let id = $("#leagueEditId")?.value || $("#lgId")?.value.trim() || FCDataStore.slugify(name);
    id = FCDataStore.slugify(id) || FCDataStore.slugify(name);
    if (!id) return alert("Could not build a valid league ID — use letters or numbers in the name.");

    if (!editing && leagues().some((l) => l.id === id)) {
      let n = 2;
      while (leagues().some((l) => l.id === `${id}_${n}`)) n += 1;
      id = `${id}_${n}`;
    }

    const ui = {
      c1: $("#lgC1")?.value || "#2de2e6",
      c2: $("#lgC2")?.value || "#7c5cff",
      mask: $("#lgMask")?.value || "trophy",
    };

    const features = {};
    document.querySelectorAll(".lg-feature").forEach((cb) => {
      const fid = cb.getAttribute("data-feature");
      if (fid) features[fid] = cb.checked;
    });

    FCDataStore.upsertLeague({ id, name }, ui, features);
    leagueEditId = id;
    leagueFilter = id;
    afterLeagueChange();
    toast(editing ? "League saved" : "League created — now add its teams & players");
    renderPanel();
    renderNav();
  });
}

/** Refresh app-side arrays + league config after a league create/edit/delete. */
function afterLeagueChange() {
  syncToAppArrays();
  if (typeof syncLeagueConfigFromStore === "function") syncLeagueConfigFromStore();
}

function panelLeague() {
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
  const mw = meta.matchweek ?? 36;
  const mwTag = `MW ${mw}`;
  const mwTitle = meta.matchweekTitle ?? (isWc ? "Group Stage" : `Matchweek ${mw}`);
  const teams = teamsForLeague(leagueFilter);
  const list =
    typeof filterMatchesForLeagueWeek === "function"
      ? filterMatchesForLeagueWeek(state().matches, leagueFilter, mw)
      : state().matches.filter((m) => m.leagueId === leagueFilter && (m.matchday === mwTag || !m.matchday));
  const m = matchEditId ? state().matches.find((x) => x.id === matchEditId) : null;
  const src = mwEditorDraft ?? m;
  const homeId = src?.homeTeamId ?? teams[0]?.id ?? "";
  const awayId = src?.awayTeamId ?? teams[1]?.id ?? teams[0]?.id ?? "";
  const teamOpts = (sel) => teamOptionTags(teams, sel);
  const ht = state().teams.find((t) => t.id === homeId);
  const at = state().teams.find((t) => t.id === awayId);
  const previewH = src?.score?.[0] ?? 0;
  const previewA = src?.score?.[1] ?? 0;
  const stadiumVal = src?.stadium ?? "";
  const stageField = isWc
    ? `<div class="col-12 col-md-6"><div class="mw-field"><label for="matchStage">Round / stage</label><input id="matchStage" class="mw-input" value="${esc(src?.matchday ?? meta.matchweekTitle ?? "Group Stage")}" placeholder="Group A · MD 1 / Round of 16" /><p class="mw-field-note admin-muted">All World Cup games stay on the site — use this label for each round.</p></div></div>`
    : "";
  const mwNumField = isWc
    ? ""
    : `<div class="col-6 col-md-4">
            <div class="mw-field">
              <label for="mwNum">Gameweek number</label>
              <input id="mwNum" class="mw-input" type="number" min="1" max="50" value="${esc(meta.matchweek ?? 36)}" />
            </div>
          </div>`;
  const settingsHint = isWc
    ? "Tournament title and dates shown above the full fixture list on the site."
    : "Title and range shown above the fixture list on the site.";
  const fixturesTitle = isWc ? "All fixtures" : `Fixtures <span class="mw-badge">MW ${mw}</span>`;
  const fixturesHint = isWc
    ? `${list.length} match${list.length === 1 ? "" : "es"} · every round is kept`
    : `${list.length} match${list.length === 1 ? "" : "es"} in this gameweek`;

  return `
    <div class="mw-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Match Center</p>
            <h2 class="mw-heading">Matchweek</h2>
            <p class="mw-lead">${isWc ? "Set the tournament header and every fixture — scores, goals, and lineups. All games stay visible on the site." : "Set the public gameweek title, dates, and every fixture — scores, goals, and lineups."}</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">Live preview</span>
              <strong class="mw-hero-preview-title">${esc(mwTitle)}</strong>
              <span class="mw-hero-preview-range">${esc(meta.dateRange ?? "—")}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card mw-card--header">
        <div class="mw-card-head">
          <h3>${isWc ? "Tournament header" : "Gameweek settings"}</h3>
          <p>${settingsHint}</p>
        </div>
        <div class="row g-2 g-md-3 mw-field-grid">
          <div class="col-12">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
          ${mwNumField}
          <div class="col-12 col-md-4">
            <div class="mw-field">
              <label for="mwTitle">${isWc ? "Tournament title" : "Gameweek title"}</label>
              <input id="mwTitle" class="mw-input" type="text" value="${esc(mwTitle)}" placeholder="${isWc ? "Group Stage" : "Gameweek 36"}" />
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="mw-field">
              <label for="mwRange">Date range</label>
              <input id="mwRange" class="mw-input" type="text" value="${esc(meta.dateRange ?? "")}" placeholder="12 May – 15 May" />
            </div>
          </div>
        </div>
        <button type="button" class="mw-btn-primary w-100 w-sm-auto" id="btnSaveMeta">${isWc ? "Save tournament header" : "Save matchweek header"}</button>
      </section>

      <section class="mw-card">
        <div class="mw-card-head mw-card-head--row row g-2 align-items-start">
          <div class="col-12 col-sm">
            <h3>${fixturesTitle}</h3>
            <p>${fixturesHint}</p>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary mw-btn-primary--sm w-100 w-sm-auto" id="btnNewMwMatch">+ Add fixture</button>
          </div>
        </div>
        ${renderFixtureCards(list)}
      </section>

      <section class="mw-card mw-editor is-open" id="mwMatchEditor">
        <div class="mw-editor-head">
          <div>
            <p class="mw-eyebrow">${src ? (matchEditId ? "Editing fixture" : "New fixture") : "New fixture"}</p>
            <h3 class="mw-editor-title">${esc(ht?.name ?? "Home")} <span class="mw-editor-score">${previewH} – ${previewA}</span> ${esc(at?.name ?? "Away")}</h3>
          </div>
        </div>

        <input type="hidden" id="matchEditId" value="${esc(src?.id ?? matchEditId ?? "")}" />

        <div class="mw-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">①</span> Match details</h4>
          <div class="row g-2 g-md-3 mw-field-grid mw-field-grid--2">
            <div class="col-12 col-md-6"><div class="mw-field"><label>Match day</label><input id="matchTime" class="mw-input" value="${esc(src?.time ?? "")}" placeholder="Sunday 12 May" /></div></div>
            ${stageField}
            <div class="col-12 col-md-6">${stadiumSelectField(leagueFilter, stadiumVal, { note: "Choose from this league’s stadium list. Add venues in the <strong>Stadiums</strong> tab." })}</div>
            <div class="col-12 col-md-6"><div class="mw-field"><label>Home team</label><div class="mw-select-wrap"><select id="matchHome" class="mw-select">${teamOpts(homeId)}</select></div></div></div>
            <div class="col-12 col-md-6"><div class="mw-field"><label>Away team</label><div class="mw-select-wrap"><select id="matchAway" class="mw-select">${teamOpts(awayId)}</select></div></div></div>
            <div class="col-6 col-md-6"><div class="mw-field"><label>Home goals</label><input id="matchHomeScore" class="mw-input mw-input--score" type="number" min="0" value="${esc(src?.score?.[0] ?? 0)}" /></div></div>
            <div class="col-6 col-md-6"><div class="mw-field"><label>Away goals</label><input id="matchAwayScore" class="mw-input mw-input--score" type="number" min="0" value="${esc(src?.score?.[1] ?? 0)}" /></div></div>
            <div class="col-12 col-md-6"><div class="mw-field"><label>Home formation</label><input id="matchFormHome" class="mw-input" value="${esc(src?.formation?.[0] ?? "4-2-3-1")}" placeholder="4-2-3-1" /></div></div>
            <div class="col-12 col-md-6"><div class="mw-field"><label>Away formation</label><input id="matchFormAway" class="mw-input" value="${esc(src?.formation?.[1] ?? "4-3-3")}" placeholder="4-3-3" /></div></div>
          </div>
        </div>

        <div class="mw-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">②</span> Goal events</h4>
          <p class="mw-section-hint">Minute and side — pick scorer and assist from the squad or enter names manually. For <strong>own goals</strong>, set <strong>Side</strong> to the scorer’s team, pick the scorer, leave assist blank, and choose <strong>Own Goal</strong>. The goal is credited to the other team on the site.</p>
          ${renderGoalEventsEditor(src?.goalEvents, homeId, awayId, src?.lineups)}
        </div>

        <div class="mw-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">③</span> Lineups</h4>
          <p class="mw-section-hint">Use <strong>Copy lineup</strong> per team to reuse a previous matchweek XI, then adjust and save.</p>
          <div class="row g-3 mw-lineups-grid">
            <div class="col-12 col-xl-6">${renderLineupEditor("home", homeId, src?.lineups?.home, { currentMw: mw, excludeMatchId: matchEditId })}</div>
            <div class="col-12 col-xl-6">${renderLineupEditor("away", awayId, src?.lineups?.away, { currentMw: mw, excludeMatchId: matchEditId })}</div>
          </div>
        </div>

        <div class="mw-editor-footer row g-2">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveMwMatch">Save fixture</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnCancelMwMatch">Cancel</button>
          </div>
        </div>
      </section>
      <datalist id="nationalityList">${nationalityDatalistHtml()}</datalist>
    </div>
  `;
}

function panelStadiums() {
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const list = stadiumsForLeague(leagueFilter);
  const editing = Boolean(stadiumEditName);

  return `
    <div class="mw-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Venues</p>
            <h2 class="mw-heading">Stadiums</h2>
            <p class="mw-lead">Define the stadium list for each league or tournament. Matchweek and Matches editors pick from this list when assigning a venue.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">In this league</span>
              <strong class="mw-hero-preview-title">${list.length} stadium${list.length === 1 ? "" : "s"}</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>League stadiums</h3>
          <p>${list.length} venue${list.length === 1 ? "" : "s"} available when creating fixtures.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        <div class="teams-table-wrap admin-table-wrap">
          <table class="admin-table admin-table-compact teams-table">
            <thead>
              <tr>
                <th>Stadium</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${
              list.length
                ? list
                    .map(
                      (s) => `<tr>
                <td><strong>${esc(s)}</strong></td>
                <td class="admin-row-actions">
                  <button type="button" class="mw-btn-ghost teams-row-btn" data-edit-stadium="${esc(s)}">Edit</button>
                  <button type="button" class="mw-btn-danger teams-row-btn" data-del-stadium="${esc(s)}">Remove</button>
                </td></tr>`,
                    )
                    .join("")
                : `<tr><td colspan="2" class="admin-muted">No stadiums yet — add one below.</td></tr>`
            }</tbody>
          </table>
        </div>
      </section>

      <section class="mw-card" id="stadiumFormCard">
        <div class="mw-card-head">
          <h3 id="stadiumFormTitle">${editing ? "Edit stadium" : "Add stadium"}</h3>
          <p>${editing ? `Renaming updates fixtures that use “${esc(stadiumEditName)}”.` : "New venues appear in the Matchweek stadium dropdown."}</p>
        </div>
        <input type="hidden" id="stadiumEditName" value="${esc(stadiumEditName)}" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-8">
            <div class="mw-field"><label for="stadiumName">Stadium name</label><input id="stadiumName" class="mw-input" value="${editing ? esc(stadiumEditName) : ""}" placeholder="Emirates Stadium" /></div>
          </div>
        </div>
        <div class="teams-form-footer row g-2 mt-1">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveStadium">${editing ? "Save changes" : "Add stadium"}</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnNewStadium">Clear form</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function panelTeams() {
  const list = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const teamCount = list.length;

  return `
    <div class="mw-page teams-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Squad setup</p>
            <h2 class="mw-heading">Teams</h2>
            <p class="mw-lead">Manage clubs for each league — formation, coach, and branding used across matchweek and squads.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">In this league</span>
              <strong class="mw-hero-preview-title">${teamCount} team${teamCount === 1 ? "" : "s"}</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Club roster</h3>
          <p>${teamCount} team${teamCount === 1 ? "" : "s"} · edit or remove existing clubs below.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        <div class="teams-table-wrap admin-table-wrap">
          <table class="admin-table admin-table-compact teams-table">
            <thead>
              <tr>
                <th>Name</th>
                <th class="d-none d-sm-table-cell">ID</th>
                <th class="d-none d-md-table-cell">Formation</th>
                <th class="d-none d-xl-table-cell">Coach</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${list
              .map(
                (t) => `<tr>
              <td><strong>${esc(t.name)}</strong></td>
              <td class="d-none d-sm-table-cell"><code>${esc(t.id)}</code></td>
              <td class="d-none d-md-table-cell">${esc(t.formation ?? "—")}</td>
              <td class="d-none d-xl-table-cell">${esc(t.coach ?? "—")}</td>
              <td class="admin-row-actions">
                <button type="button" class="mw-btn-ghost teams-row-btn" data-edit-team="${esc(t.id)}">Edit</button>
                <button type="button" class="mw-btn-danger teams-row-btn" data-del-team="${esc(t.id)}">Remove</button>
              </td></tr>`,
              )
              .join("")}</tbody>
          </table>
        </div>
      </section>

      <section class="mw-card" id="teamFormCard">
        <div class="mw-card-head">
          <h3 id="teamFormTitle">Add team</h3>
          <p>Formation is used in Club Spotlight and squad depth on the site. Stadiums are managed per league in the <strong>Stadiums</strong> tab.</p>
        </div>
        <input type="hidden" id="teamEditId" value="" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamName">Name</label><input id="teamName" class="mw-input" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamCity">City</label><input id="teamCity" class="mw-input" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamFormation">Formation</label><input id="teamFormation" class="mw-input" placeholder="4-3-3" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamCoach">Coach</label><input id="teamCoach" class="mw-input" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamLogo">Logo path</label><input id="teamLogo" class="mw-input" placeholder="./images/seriea/club.png" /></div>
          </div>
          <div class="col-6 col-md-6 col-lg-3">
            <div class="mw-field"><label for="teamC1">Color 1</label><input id="teamC1" class="mw-input mw-input--color" type="color" value="#2de2e6" /></div>
          </div>
          <div class="col-6 col-md-6 col-lg-3">
            <div class="mw-field"><label for="teamC2">Color 2</label><input id="teamC2" class="mw-input mw-input--color" type="color" value="#111827" /></div>
          </div>
        </div>
        <div class="teams-form-footer row g-2 mt-1">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveTeam">Save team</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnNewTeam">Clear form</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function squadDepthRoster(teamId) {
  if (typeof playersForTeam === "function") return playersForTeam(teamId);
  return state()
    .players.filter((p) => p.teamId === teamId)
    .sort((a, b) => Number(a.number) - Number(b.number) || String(a.name).localeCompare(b.name));
}

function squadDepthPickOptions(roster, selectedId) {
  const opts = [`<option value="">— Pick —</option>`];
  for (const p of roster) {
    const sel = p.id === selectedId ? " selected" : "";
    opts.push(
      `<option value="${esc(p.id)}"${sel}>#${esc(p.number)} ${esc(p.name)} · ${esc(p.role ?? p.pos ?? "—")}</option>`,
    );
  }
  return opts.join("");
}

function squadDepthFieldValue(depth, fieldId) {
  const gkMatch = fieldId.match(/^sdGk(\d+)$/);
  if (gkMatch) return depth.goalkeepers[Number(gkMatch[1])] ?? "";
  const slotMatch = fieldId.match(/^sdSlot(\d+)([AB])$/);
  if (slotMatch) {
    const idx = Number(slotMatch[1]);
    const which = slotMatch[2] === "A" ? 0 : 1;
    return depth.slots[idx]?.players[which] ?? "";
  }
  return "";
}

/** When a player is picked in one slot, remove them from any other slot (move, not duplicate). */
function dedupeSquadDepthPicks(depth, keepFieldId) {
  const next = SquadDepth.normalizeSquadDepth(depth);
  const keepVal = squadDepthFieldValue(next, keepFieldId);
  if (!keepVal) return next;

  for (let i = 0; i < SquadDepth.DEPTH_GK_COUNT; i++) {
    const fid = `sdGk${i}`;
    if (fid !== keepFieldId && next.goalkeepers[i] === keepVal) next.goalkeepers[i] = "";
  }
  for (let i = 0; i < SquadDepth.DEPTH_OUTFIELD_SLOTS; i++) {
    const fidA = `sdSlot${i}A`;
    if (fidA !== keepFieldId && next.slots[i].players[0] === keepVal) next.slots[i].players[0] = "";
    const fidB = `sdSlot${i}B`;
    if (fidB !== keepFieldId && next.slots[i].players[1] === keepVal) next.slots[i].players[1] = "";
  }
  return next;
}

function applySquadDepthEditorChange(changedFieldId) {
  if (!changedFieldId) return;
  squadDepthDraft = dedupeSquadDepthPicks(readSquadDepthFromDom(), changedFieldId);
  renderPanel();
}

function readSquadDepthFromDom() {
  const formation = $("#sdFormation")?.value?.trim() || "4-2-3-1";
  const goalkeepers = Array.from({ length: SquadDepth.DEPTH_GK_COUNT }, (_, i) =>
    String($(`#sdGk${i}`)?.value ?? "").trim(),
  );
  const slots = Array.from({ length: SquadDepth.DEPTH_OUTFIELD_SLOTS }, (_, i) => ({
    tag: String($(`#sdTag${i}`)?.value ?? "").trim() || `S${i + 1}`,
    players: [
      String($(`#sdSlot${i}A`)?.value ?? "").trim(),
      String($(`#sdSlot${i}B`)?.value ?? "").trim(),
    ],
  }));
  return SquadDepth.normalizeSquadDepth({ formation, goalkeepers, slots }, formation);
}

function panelSquadDepth() {
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const teams = teamsForLeague(leagueFilter);
  const teamId = squadDepthTeamFilter || teams[0]?.id || "";
  const team = teams.find((t) => t.id === teamId);
  const roster = team ? squadDepthRoster(team.id) : [];
  const depth = squadDepthDraft ?? SquadDepth.normalizeSquadDepth(team?.squadDepth, team?.formation);
  const gkRows = Array.from({ length: SquadDepth.DEPTH_GK_COUNT }, (_, i) => {
    return `
      <div class="sd-gk-row">
        <label class="sd-gk-label" for="sdGk${i}">GK ${i + 1}</label>
        <div class="mw-select-wrap mw-select-wrap--compact sd-pick-wrap">
          <select id="sdGk${i}" class="sd-pick mw-select" aria-label="Goalkeeper ${i + 1}">
            ${squadDepthPickOptions(roster, depth.goalkeepers[i])}
          </select>
        </div>
      </div>`;
  }).join("");

  const slotSummary = SquadDepth.formationSlotSummary(depth.formation);
  const templateLocked = SquadDepth.hasFormationTemplate(depth.formation);

  const slotRows = depth.slots
    .map((slot, i) => {
      return `
        <div class="sd-slot-row">
          <div class="sd-slot-head">
            <span class="sd-slot-num">${i + 1}</span>
            <input id="sdTag${i}" class="sd-tag mw-input${templateLocked ? " sd-tag--locked" : ""}" value="${esc(slot.tag)}" placeholder="LB" aria-label="Slot ${i + 1} tag"${templateLocked ? " readonly" : ""} />
          </div>
          <div class="sd-slot-picks">
            <div class="mw-select-wrap mw-select-wrap--compact sd-pick-wrap">
              <select id="sdSlot${i}A" class="sd-pick mw-select" aria-label="Slot ${i + 1} starter">
                ${squadDepthPickOptions(roster, slot.players[0])}
              </select>
            </div>
            <div class="mw-select-wrap mw-select-wrap--compact sd-pick-wrap">
              <select id="sdSlot${i}B" class="sd-pick mw-select" aria-label="Slot ${i + 1} depth">
                ${squadDepthPickOptions(roster, slot.players[1])}
              </select>
            </div>
          </div>
        </div>`;
    })
    .join("");

  const validation = SquadDepth.validateSquadDepth(depth);
  const chartCount = SquadDepth.countDepthPlayers(depth);
  const statusClass = validation.ok ? (chartCount > 0 ? "sd-status--ok" : "sd-status--warn") : "sd-status--warn";
  const statusText = !validation.ok
    ? validation.errors[0]
    : chartCount > 0
      ? `${chartCount} player${chartCount === 1 ? "" : "s"} on chart (up to ${SquadDepth.DEPTH_CHART_SIZE}). Save anytime — picks are optional.`
      : "No players picked yet. Save formation and fill slots when ready.";

  const emptyTeam = !team
    ? `<p class="admin-muted">Add teams in the <strong>Teams</strong> tab first.</p>`
    : !roster.length
      ? `<p class="admin-muted">Add players for <strong>${esc(team.name)}</strong> in the <strong>Players</strong> tab first.</p>`
      : "";

  return `
    <div class="mw-page squaddepth-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Squad setup</p>
            <h2 class="mw-heading">Squad depth</h2>
            <p class="mw-lead">Set the formation and pick players for the public depth chart — up to <strong>3 goalkeepers</strong> and <strong>10 positions × 2</strong>. Every pick is optional; save with 2 GK, one player per slot, or a partial chart.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">League</span>
              <strong class="mw-hero-preview-title">${esc(leagueName)}</strong>
              <span class="mw-hero-preview-range">${teams.length} team${teams.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Depth chart editor</h3>
          <p>Formation drives the 10 outfield slots. Change any pick after saving — selecting a player in a new slot moves them automatically.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="sdTeam">Team</label>
              <div class="mw-select-wrap">
                <select id="sdTeam" class="mw-select"${teams.length ? "" : " disabled"}>
                  ${teamOptionTags(teams, teamId)}
                </select>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="sdFormation">Formation</label>
              <input id="sdFormation" class="mw-input" value="${esc(depth.formation)}" placeholder="4-2-3-1" list="sdFormationList" />
              <datalist id="sdFormationList">
                <option value="4-3-3"></option>
                <option value="4-4-2"></option>
                <option value="4-2-3-1"></option>
                <option value="4-1-4-1"></option>
                <option value="3-5-2"></option>
                <option value="3-4-3"></option>
                <option value="3-4-2-1"></option>
                <option value="5-4-1"></option>
                <option value="5-3-2"></option>
              </datalist>
              <p class="mw-field-note admin-muted" id="sdFormationHint">Slots: ${esc(slotSummary.label)}</p>
            </div>
          </div>
        </div>
        ${emptyTeam}
        ${
          team && roster.length
            ? `
          <p class="sd-status ${statusClass}" id="sdStatus" aria-live="polite">${esc(statusText)}</p>
          <div class="sd-editor-grid">
            <section class="sd-block sd-block--gk">
              <h4 class="sd-block-title">Goalkeepers <span class="sd-block-count">up to 3</span></h4>
              <div class="sd-gk-grid">${gkRows}</div>
            </section>
            <section class="sd-block sd-block--slots">
              <h4 class="sd-block-title">Outfield slots <span class="sd-block-count">10 × 2 (optional)</span></h4>
              <div class="sd-slot-grid">${slotRows}</div>
            </section>
          </div>
          <div class="sd-actions row g-2 mt-3">
            <div class="col-12 col-sm-auto">
              <button type="button" class="mw-btn-primary w-100" id="btnSaveSquadDepth">Save depth chart</button>
            </div>
            <div class="col-12 col-sm-auto">
              <button type="button" class="mw-btn-ghost w-100" id="btnResetSquadDepth">Reset picks</button>
            </div>
          </div>`
            : ""
        }
      </section>
    </div>
  `;
}

function nationalDutyRowKey(entry, index) {
  return String(entry?.playerId ?? "").trim() || `nd-row-${index}`;
}

function nationalDutyRowHtml(teamId, entry, rowKey) {
  const roster = squadDepthRoster(teamId);
  const playerOpts = squadDepthPickOptions(roster, entry.playerId);
  const key = rowKey ?? nationalDutyRowKey(entry, 0);
  return `<tr class="nd-row nd-sort-row" draggable="true" data-nd-row-key="${esc(key)}">
    <td class="admin-drag-cell"><span class="player-drag-handle" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span></td>
    <td class="nd-player-col">
      <div class="mw-select-wrap mw-select-wrap--compact nd-player-wrap">
        <select class="nd-player mw-select" aria-label="Player">${playerOpts}</select>
      </div>
    </td>
    <td class="nd-country-col"><input class="nd-country mw-input" value="${esc(entry.country ?? "")}" placeholder="Ecuador" aria-label="Country" /></td>
    <td class="nd-note-col d-none d-md-table-cell"><input class="nd-note mw-input" value="${esc(entry.note ?? "")}" placeholder="FIFA window, friendly…" aria-label="Note" /></td>
    <td class="nd-until-col"><input class="nd-until mw-input" type="date" value="${esc(transferDateToInputValue(entry.until))}" aria-label="Until date" /></td>
    <td class="nd-del-col"><button type="button" class="mw-btn-danger nd-del" title="Remove row">×</button></td>
  </tr>`;
}

function readNationalDutyFromDom() {
  const tbody = $("#ndTable tbody");
  if (!tbody) return [];
  return [...tbody.querySelectorAll(".nd-row")]
    .map((row) => ({
      playerId: row.querySelector(".nd-player")?.value?.trim() ?? "",
      country: row.querySelector(".nd-country")?.value?.trim() ?? "",
      note: row.querySelector(".nd-note")?.value?.trim() ?? "",
      until:
        transferDateFromInputValue(row.querySelector(".nd-until")?.value?.trim() ?? "") ||
        row.querySelector(".nd-until")?.value?.trim() ||
        "",
    }))
    .filter((e) => e.playerId);
}

function panelNationalDuty() {
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const isWorldCup = leagueFilter === "worldcup";
  const teams = teamsForLeague(leagueFilter);
  if (!teams.length) nationalDutyTeamFilter = "";
  else if (!teams.some((t) => t.id === nationalDutyTeamFilter)) nationalDutyTeamFilter = teams[0].id;

  const teamId = nationalDutyTeamFilter;
  const team = teams.find((t) => t.id === teamId);
  const teamOpts = teamOptionTags(teams, teamId);
  const roster = team ? squadDepthRoster(team.id) : [];
  const entries =
    typeof NationalDuty !== "undefined"
      ? NationalDuty.normalizeNationalDuty(team?.nationalDuty)
      : (team?.nationalDuty ?? []);
  const count = entries.length;

  if (isWorldCup) {
    return `
      <div class="mw-page nationalduty-page">
        <header class="mw-hero">
          <div class="mw-hero-text">
            <p class="mw-eyebrow">International windows</p>
            <h2 class="mw-heading">National duty</h2>
            <p class="mw-lead">Track club players away on international duty. This applies to <strong>club leagues</strong> only — not the World Cup tournament squads.</p>
          </div>
        </header>
        <section class="mw-card">
          <p class="admin-muted mb-0">Switch to a club league (Premier League, La Liga, etc.) to manage national duty lists.</p>
        </section>
      </div>`;
  }

  const emptyTeam = !team
    ? `<p class="admin-muted mb-0">Add teams in the <strong>Teams</strong> tab first.</p>`
    : !roster.length
      ? `<p class="admin-muted mb-0">Add players for <strong>${esc(team.name)}</strong> in the <strong>Players</strong> tab first.</p>`
      : "";

  const tableBody = entries.length
    ? entries.map((e, i) => nationalDutyRowHtml(teamId, e, nationalDutyRowKey(e, i))).join("")
    : `<tr class="nd-empty-row"><td colspan="6" class="admin-muted">No players on national duty yet. Add a row below.</td></tr>`;

  return `
    <div class="mw-page nationalduty-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">International windows</p>
            <h2 class="mw-heading">National duty</h2>
            <p class="mw-lead">List squad players away with their national team (e.g. Piero Hincapie · Ecuador). Shown on the public <strong>Squads</strong> page for the selected club.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(team?.name ?? "Club")}</span>
              <strong class="mw-hero-preview-title">${count} on duty</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Duty list${team ? ` · ${esc(team.name)}` : ""}</h3>
          <p>Pick a player from the club squad and set their national team. Drag rows to arrange display order. Country defaults from the player profile when you select them.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="ndTeam">Club</label>
              <div class="mw-select-wrap">
                <select id="ndTeam" class="mw-select"${teams.length ? "" : " disabled"}>${teamOpts}</select>
              </div>
            </div>
          </div>
        </div>
        ${
          emptyTeam
            ? emptyTeam
            : `<div class="nd-table-wrap admin-table-wrap">
          <table class="admin-table admin-table-compact nd-table" id="ndTable">
            <thead>
              <tr>
                <th class="admin-drag-col" aria-label="Reorder"></th>
                <th>Player</th>
                <th>Country</th>
                <th class="d-none d-md-table-cell">Note</th>
                <th>Until</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${tableBody}</tbody>
          </table>
        </div>
        <div class="nd-actions row g-2 mt-3">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnNdAdd">Add player</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveNationalDuty">Save for ${esc(team.name)}</button>
          </div>
        </div>`
        }
      </section>
    </div>
  `;
}

function teamOptionTags(teams, selectedId) {
  return teams
    .map((t) => `<option value="${esc(t.id)}"${t.id === selectedId ? " selected" : ""}>${esc(t.name)}</option>`)
    .join("");
}

function playerTransferPickOptions(teamId, selectedId) {
  const roster = teamId ? playersForTeam(teamId) : [];
  if (!roster.length) return `<option value="">— No players —</option>`;
  return (
    `<option value="">— Select player —</option>` +
    roster
      .map((p) => {
        const sel = p.id === selectedId ? " selected" : "";
        return `<option value="${esc(p.id)}"${sel}>${esc(p.number)} · ${esc(p.name)}</option>`;
      })
      .join("")
  );
}

function transferDestTeamOptions(teams, fromTeamId, selectedId = "") {
  const dest = teams.filter((t) => t.id !== fromTeamId);
  if (!dest.length) return `<option value="">— No other teams —</option>`;
  return (
    `<option value="">— Select club —</option>` +
    dest
      .map((t) => {
        const sel = t.id === selectedId ? " selected" : "";
        return `<option value="${esc(t.id)}"${sel}>${esc(t.name)}</option>`;
      })
      .join("")
  );
}

function standingsClubSelectHtml(clubName, teams) {
  const trimmed = String(clubName ?? "").trim();
  const opts = teams
    .map((t) => {
      const sel = t.name === trimmed ? " selected" : "";
      return `<option value="${esc(t.name)}"${sel}>${esc(t.name)}</option>`;
    })
    .join("");
  const legacy =
    trimmed && !teams.some((t) => t.name === trimmed)
      ? `<option value="${esc(trimmed)}" selected>${esc(trimmed)} (not in Teams)</option>`
      : "";
  return `<div class="mw-select-wrap mw-select-wrap--compact st-club-wrap"><select class="st-club mw-select" aria-label="Club">
    <option value="">— Select club —</option>${opts}${legacy}
  </select></div>`;
}

function teamIdForClubName(leagueId, clubName) {
  const trimmed = String(clubName ?? "").trim();
  if (!trimmed) return "";
  return teamsForLeague(leagueId).find((t) => t.name === trimmed)?.id ?? "";
}

function scorersPlayerSelectHtml(teamId, selectedPlayerName) {
  const trimmed = String(selectedPlayerName ?? "").trim();
  if (!teamId) {
    return `<div class="mw-select-wrap mw-select-wrap--compact sc-player-wrap"><select class="sc-name mw-select" disabled aria-label="Player">
      <option value="">Select club first</option>
    </select></div>`;
  }
  const players = playersForTeam(teamId);
  const opts = players
    .map((p) => {
      const sel = p.name === trimmed ? " selected" : "";
      return `<option value="${esc(p.name)}"${sel}>${esc(p.number)} · ${esc(p.name)}</option>`;
    })
    .join("");
  const legacy =
    trimmed && !players.some((p) => p.name === trimmed)
      ? `<option value="${esc(trimmed)}" selected>${esc(trimmed)} (not in squad)</option>`
      : "";
  return `<div class="mw-select-wrap mw-select-wrap--compact sc-player-wrap"><select class="sc-name mw-select" aria-label="Player">
    <option value="">— Select player —</option>${opts}${legacy}
  </select></div>`;
}

function renderScorerRowHtml(name, club, goals, index, teams) {
  const teamId = teamIdForClubName(leagueFilter, club);
  return `<tr class="scorer-row" data-i="${index}">
    <td class="scorers-club-col">${standingsClubSelectHtml(club, teams)}</td>
    <td class="sc-player-cell scorers-player-col">${scorersPlayerSelectHtml(teamId, name)}</td>
    <td class="scorers-goals-col"><input class="sc-goals scorers-input scorers-input--goals mw-input" type="number" min="0" value="${esc(goals)}" /></td>
    <td class="scorers-del-col"><button type="button" class="mw-btn-danger scorers-del-btn sc-del" title="Remove row">×</button></td>
  </tr>`;
}

function panelPlayers() {
  const teams = teamsForLeague(leagueFilter);
  const isWorldCup = leagueFilter === "worldcup";
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  if (!teams.length) {
    playerTeamFilter = "";
    playerTransferPickId = "";
  } else if (!teams.some((t) => t.id === playerTeamFilter)) {
    playerTeamFilter = teams[0].id;
    playerTransferPickId = "";
    playerSearchQuery = "";
  } else if (
    playerTransferPickId &&
    !playersForTeam(playerTeamFilter).some((p) => p.id === playerTransferPickId)
  ) {
    playerTransferPickId = "";
  }
  const teamId = playerTeamFilter;
  const teamOpts = teamOptionTags(teams, teamId);
  const addTeamId = $("#playerEditId")?.value ? $("#playerTeam")?.value || teamId : teamId;
  const addTeamOpts = teamOptionTags(teams, addTeamId);
  const players = teamId ? playersForTeam(teamId) : [];
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "—";
  const playerCount = players.length;
  const dragHint = isWorldCup
    ? " Drag the <strong>⋮⋮</strong> handle to reorder. For World Cup squads, set each player’s <strong>club</strong> (domestic team)."
    : " Drag the <strong>⋮⋮</strong> handle to reorder the squad list. Order saves when you drop a row and appears on the public site.";

  const rosterBody = !teams.length
    ? `<p class="admin-muted mb-0">Add teams in the <strong>Teams</strong> tab first, then return here to manage squads.</p>`
    : `<div class="players-roster-wrap admin-table-wrap admin-table-wrap--sort">
          <div class="players-roster-list" id="playersSortTbody">${players.map((p) => playerRosterCardHtml(p, isWorldCup)).join("")}</div>
          <p class="players-roster-empty admin-hidden" id="playersRosterEmpty">No players match your search.</p>
        </div>`;

  return `
    <div class="mw-page players-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Squad roster</p>
            <h2 class="mw-heading">Players</h2>
            <p class="mw-lead">Edit squad members, drag to set list order, and manage nationality flags for the public site.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(teamName)}</span>
              <strong class="mw-hero-preview-title">${playerCount} player${playerCount === 1 ? "" : "s"}</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Squad list</h3>
          <p>${teams.length ? `${playerCount} in ${esc(teamName)}` : "No teams in this league yet"}.${dragHint}</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="playerTeamFilter">Team</label>
              <div class="mw-select-wrap">
                <select id="playerTeamFilter" class="mw-select"${teams.length ? "" : " disabled"}>${teamOpts}</select>
              </div>
            </div>
          </div>
          ${
            teams.length && teamId
              ? `<div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field players-search-field mb-0">
              <label for="playerRosterSearch">Search squad</label>
              <div class="players-search-wrap">
                <span class="players-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="playerRosterSearch"
                  class="mw-input players-search-input"
                  type="search"
                  inputmode="search"
                  placeholder="Name, number, role…"
                  value="${esc(playerSearchQuery)}"
                  autocomplete="off"
                  aria-describedby="playersSearchMeta"
                />
                <button type="button" class="players-search-clear${playerSearchQuery.trim() ? "" : " admin-hidden"}" id="btnClearPlayerSearch" aria-label="Clear search">×</button>
              </div>
              <p class="players-search-meta admin-muted${playerSearchQuery.trim() ? "" : " admin-hidden"}" id="playersSearchMeta" aria-live="polite"></p>
            </div>
          </div>`
              : ""
          }
        </div>
        ${
          playerCount > 1
            ? `<div class="players-toolbar mb-3">
                <button type="button" class="mw-btn-primary" id="btnAutoArrange">Auto-arrange by position</button>
                <span class="admin-muted players-toolbar-hint">Sorts GK → CB → RB → LB → RM → LM → DM → CM → AM → RAM → LAM → RW → LW → CF. Works on mobile.</span>
              </div>`
            : ""
        }
        ${rosterBody}
      </section>

      <section class="mw-card" id="playerTransferCard">
        <div class="mw-card-head">
          <h3>Transfer player</h3>
          <p>Move a squad member to another club in this league. They are removed from the current team and added to the destination roster. Squad depth picks on the old team are cleared automatically.</p>
        </div>
        ${
          !teams.length || !teamId
            ? `<p class="admin-muted mb-0">Select a team above to transfer players.</p>`
            : `<div class="row g-2 g-md-3 align-items-end">
          <div class="col-12 col-md-4">
            <div class="mw-field">
              <label for="playerTransferPick">Player · ${esc(teamName)}</label>
              <div class="mw-select-wrap">
                <select id="playerTransferPick" class="mw-select">${playerTransferPickOptions(teamId, playerTransferPickId)}</select>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <div class="mw-field">
              <label for="playerTransferDest">Transfer to</label>
              <div class="mw-select-wrap">
                <select id="playerTransferDest" class="mw-select">${transferDestTeamOptions(teams, teamId)}</select>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-4">
            <button type="button" class="mw-btn-primary w-100" id="btnExecuteTransfer">Transfer player</button>
          </div>
        </div>`
        }
      </section>

      <section class="mw-card" id="playerFormCard">
        <div class="mw-card-head">
          <h3 id="playerFormTitle">Add player</h3>
          <p>Role controls default sort order on the public squad page (GK → CB → … → CF).</p>
        </div>
        <input type="hidden" id="playerEditId" value="" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="playerTeam">Team</label>
              <div class="mw-select-wrap">
                <select id="playerTeam" class="mw-select"${teams.length ? "" : " disabled"}>${addTeamOpts}</select>
              </div>
            </div>
          </div>
          <div class="col-6 col-md-6 col-lg-4">
            <div class="mw-field"><label for="playerNumber">Number</label><input id="playerNumber" class="mw-input" type="number" /></div>
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field"><label for="playerName">Name</label><input id="playerName" class="mw-input" /></div>
          </div>
          <div class="col-6 col-md-6 col-lg-4">
            <div class="mw-field"><label for="playerPos">Pos (GK/DF/MF/FW)</label><input id="playerPos" class="mw-input" /></div>
          </div>
          <div class="col-6 col-md-6 col-lg-4">
            <div class="mw-field"><label for="playerRole">Role</label><input id="playerRole" class="mw-input" placeholder="CB, CM, CF…" /></div>
          </div>
          ${isWorldCup ? `<div class="col-12 col-md-6 col-lg-4"><div class="mw-field"><label for="playerClub">Club</label><input id="playerClub" class="mw-input" placeholder="e.g. Barcelona, Chelsea" /></div></div>` : ""}
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="playerNat">Nationality</label>
              <input id="playerNat" class="mw-input" list="nationalityList" placeholder="e.g. Italy" autocomplete="off" />
              <datalist id="nationalityList">${(() => {
                const names = new Set(
                  typeof NationalityFlags !== "undefined" ? NationalityFlags.listNationalities() : [],
                );
                for (const p of state().players) {
                  if (p.nationality?.trim()) names.add(p.nationality.trim());
                }
                return [...names]
                  .sort((a, b) => a.localeCompare(b))
                  .map((n) => `<option value="${esc(n)}"></option>`)
                  .join("");
              })()}</datalist>
              <p class="player-flag-hint" id="playerFlagHint">Type nationality — flag fills automatically when known.</p>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field players-form-flag">
              <label for="playerFlag">Flag emoji</label>
              <div class="player-flag-row">
                <span class="player-flag-preview" id="playerFlagPreview" aria-hidden="true">—</span>
                <input id="playerFlag" class="mw-input" placeholder="🇮🇹" autocomplete="off" />
                <button type="button" class="mw-btn-ghost players-fill-btn" id="btnFillFlag" title="Fill from nationality">Fill</button>
              </div>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="playerInstagram">Instagram <span class="admin-muted">(optional)</span></label>
              <input id="playerInstagram" class="mw-input" type="url" inputmode="url" placeholder="@username or https://instagram.com/…" autocomplete="off" />
              <p class="mw-field-note admin-muted">Shows an Instagram icon on the public player profile when set.</p>
            </div>
          </div>
        </div>
        <div class="players-form-footer row g-2 mt-1">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSavePlayer">Save player</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function panelMatches() {
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
  const mw = meta.matchweek ?? 36;
  const mwTitle = meta.matchweekTitle ?? (isWc ? "Group Stage" : `Matchweek ${mw}`);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const list =
    typeof filterMatchesForLeagueWeek === "function"
      ? filterMatchesForLeagueWeek(state().matches, leagueFilter, mw)
      : state().matches.filter((m) => m.leagueId === leagueFilter && (m.matchday === `MW ${mw}` || !m.matchday));
  const teams = teamsForLeague(leagueFilter);
  const teamOpts = (sel) => teamOptionTags(teams, sel);
  const defaultHome = teams[0]?.id ?? "";
  const defaultAway = teams[1]?.id ?? teams[0]?.id ?? "";

  const rosterBody =
    list.length === 0
      ? `<div class="matches-empty">
          <p class="matches-empty-text">No matches yet. Add one below or use the <strong>Matchweek</strong> tab for full fixture editing.</p>
        </div>`
      : `<div class="matches-table-wrap admin-table-wrap">
          <table class="admin-table admin-table-compact matches-table">
            <thead>
              <tr>
                <th class="d-none d-sm-table-cell">Day</th>
                <th>Fixture</th>
                <th>Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${list
              .map((m) => {
                const h = state().teams.find((t) => t.id === m.homeTeamId)?.name ?? m.homeTeamId;
                const a = state().teams.find((t) => t.id === m.awayTeamId)?.name ?? m.awayTeamId;
                return `<tr>
              <td class="d-none d-sm-table-cell">${esc(m.time ?? "—")}</td>
              <td>
                <strong>${esc(h)} vs ${esc(a)}</strong>
                <span class="matches-fixture-day d-sm-none">${esc(m.time ?? "—")}</span>
              </td>
              <td class="matches-score">${esc(m.score?.[0] ?? 0)}–${esc(m.score?.[1] ?? 0)}</td>
              <td class="admin-row-actions">
                <button type="button" class="mw-btn-ghost matches-row-btn" data-edit-match="${esc(m.id)}">Edit</button>
                <button type="button" class="mw-btn-danger matches-row-btn" data-del-match="${esc(m.id)}">Remove</button>
              </td></tr>`;
              })
              .join("")}</tbody>
          </table>
        </div>`;

  return `
    <div class="mw-page matches-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Quick fixtures</p>
            <h2 class="mw-heading">Matches</h2>
            <p class="mw-lead">${isWc ? "Add or edit basic scores for any World Cup fixture. For goals, assists, and lineups use the <strong>Matchweek</strong> tab." : "Add or edit basic scores for the current gameweek. For goals, assists, and lineups use the <strong>Matchweek</strong> tab."}</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(mwTitle)}</span>
              <strong class="mw-hero-preview-title">${list.length} match${list.length === 1 ? "" : "es"}</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>${isWc ? "All fixtures" : `MW ${mw} fixtures`}</h3>
          <p>${list.length} match${list.length === 1 ? "" : "es"}${isWc ? " · every round is kept" : " in this gameweek"} · quick edit only.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        ${rosterBody}
      </section>

      <section class="mw-card" id="matchFormCard">
        <div class="mw-card-head">
          <h3 id="matchFormTitle">Add match</h3>
          <p>${isWc ? "Creates a World Cup fixture. Set the round/stage label below." : `Creates a fixture for MW ${mw}.`} Stadiums are chosen from the <strong>Stadiums</strong> tab list.</p>
        </div>
        <input type="hidden" id="matchEditId" value="" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="matchTime">Match day label</label><input id="matchTime" class="mw-input" placeholder="Sunday 10 May" /></div>
          </div>
          ${
            isWc
              ? `<div class="col-12 col-md-6"><div class="mw-field"><label for="matchStage">Round / stage</label><input id="matchStage" class="mw-input" value="${esc(meta.matchweekTitle ?? "Group Stage")}" placeholder="Group A · MD 1" /></div></div>`
              : ""
          }
          <div class="col-12 col-md-6">
            ${stadiumSelectField(leagueFilter, "", { note: "Manage venues in the Stadiums tab." })}
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="matchHome">Home team</label><div class="mw-select-wrap"><select id="matchHome" class="mw-select">${teamOpts(defaultHome)}</select></div></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="matchAway">Away team</label><div class="mw-select-wrap"><select id="matchAway" class="mw-select">${teamOpts(defaultAway)}</select></div></div>
          </div>
          <div class="col-6 col-md-6">
            <div class="mw-field"><label for="matchHomeScore">Home goals</label><input id="matchHomeScore" class="mw-input mw-input--score" type="number" min="0" value="0" /></div>
          </div>
          <div class="col-6 col-md-6">
            <div class="mw-field"><label for="matchAwayScore">Away goals</label><input id="matchAwayScore" class="mw-input mw-input--score" type="number" min="0" value="0" /></div>
          </div>
        </div>
        <div class="matches-form-footer row g-2 mt-1">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveMatch">Save match</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function standingsRows(leagueId) {
  return state().miniStandings.find((x) => x.leagueId === leagueId)?.rows ?? [];
}

function standingsGroups(leagueId) {
  const block = state().miniStandings.find((x) => x.leagueId === leagueId);
  if (!block) return [];
  if (block.groups?.length) return block.groups;
  if (leagueId === "worldcup" && block.rows?.length && typeof migrateFlatRowsToWorldCupGroups === "function") {
    return migrateFlatRowsToWorldCupGroups(block.rows);
  }
  return [];
}

function wcGroupRowHtml(groupId, rowIndex, rk, club, pts, teams) {
  return `<tr data-group="${esc(groupId)}" data-slot="${rowIndex}">
    <td class="standings-rk-col"><input class="st-rk standings-input standings-input--rk mw-input" type="number" value="${esc(rk)}" /></td>
    <td class="standings-club-col">${standingsClubSelectHtml(club, teams)}</td>
    <td class="standings-pts-col"><input class="st-pts standings-input standings-input--pts mw-input" type="number" value="${esc(pts)}" /></td>
  </tr>`;
}

function panelWorldCupStandings() {
  const teams = teamsForLeague(leagueFilter);
  const groups = standingsGroups(leagueFilter);
  const groupMap = new Map(groups.map((g) => [g.id, g.rows ?? []]));
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? "World Cup";

  const groupIds =
    typeof WORLD_CUP_GROUP_IDS !== "undefined"
      ? WORLD_CUP_GROUP_IDS
      : "ABCDEFGHIJKL".split("");
  const groupSize = typeof WORLD_CUP_GROUP_SIZE !== "undefined" ? WORLD_CUP_GROUP_SIZE : 4;

  const sections = groupIds
    .map((gid) => {
      const rows = [...(groupMap.get(gid) ?? [])];
      while (rows.length < groupSize) rows.push([rows.length + 1, "", 0]);
      const body = rows
        .slice(0, groupSize)
        .map(([rk, club, pts], i) => wcGroupRowHtml(gid, i, rk ?? i + 1, club, pts ?? 0, teams))
        .join("");
      return `
      <div class="col-12 col-md-6 col-xl-4">
        <section class="wc-group-card h-100" data-wc-group="${esc(gid)}">
          <h4 class="wc-group-card__title">Group ${esc(gid)}</h4>
          <div class="standings-table-wrap standings-table-wrap--compact">
            <table class="admin-table admin-table-compact standings-table wc-group-table" id="wcGroup${esc(gid)}">
              <thead><tr><th>#</th><th>Country</th><th>Pts</th></tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </section>
      </div>`;
    })
    .join("");

  return `
    <div class="mw-page standings-page standings-page--wc">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Group stage</p>
            <h2 class="mw-heading">Standings</h2>
            <p class="mw-lead">Assign countries to groups A–L (4 per group). Change a country’s group by picking a different group slot.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(leagueName)}</span>
              <strong class="mw-hero-preview-title">${groupIds.length} groups</strong>
              <span class="mw-hero-preview-range">${groupSize} teams each</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Group standings</h3>
          <p>Countries are chosen from the <strong>Teams</strong> list. Save when all groups are set.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        <div class="row g-3 wc-groups-grid">${sections}</div>
        <div class="standings-form-footer row g-2 mt-3">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveStandings">Save group standings</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function scorersRows(leagueId) {
  return state().topScorers.find((x) => x.leagueId === leagueId)?.rows ?? [];
}

function transfersBlock(leagueId) {
  const block = state().transfers?.find((x) => x.leagueId === leagueId);
  return typeof FCDataStore !== "undefined"
    ? FCDataStore.normalizeTransfersBlock(block ?? { leagueId })
    : { leagueId, in: [], out: [], loanReturn: [], loanRecall: [] };
}

function transferDirectionIncoming(mode) {
  return mode === "in" || mode === "loanReturn";
}

function transferDateToInputValue(dateStr) {
  const s = String(dateStr ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return "";
  const d = new Date(parsed);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function transferDateFromInputValue(iso) {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function transfersForTeam(leagueId, teamId) {
  const team = state().teams.find((t) => t.id === teamId);
  const club = team?.name ?? "";
  const block = transfersBlock(leagueId);
  const match = (t) => t.club === club;
  return {
    in: (block.in ?? []).filter(match),
    out: (block.out ?? []).filter(match),
    loanReturn: (block.loanReturn ?? []).filter(match),
    loanRecall: (block.loanRecall ?? []).filter(match),
  };
}

function mergeTeamTransfersIntoLeague(leagueId, teamId, teamLists) {
  const teamName = state().teams.find((t) => t.id === teamId)?.name ?? "";
  const block = transfersBlock(leagueId);
  const keys = FCDataStore?.TRANSFER_LIST_KEYS ?? ["in", "out", "loanReturn", "loanRecall"];
  const stamp = (rows) => rows.map((t) => ({ ...t, club: teamName }));
  const merged = { leagueId };
  for (const key of keys) {
    const others = (block[key] ?? []).filter((t) => t.club !== teamName);
    merged[key] = [...others, ...stamp(teamLists[key] ?? [])];
  }
  return merged;
}

function rosterPlayerByName(teamId, name) {
  const n = stripCaptainSuffix(String(name ?? "").trim());
  if (!n || !teamId) return null;
  return (
    playersForTeam(teamId).find((p) => stripCaptainSuffix(p.name) === n || p.name === n) ?? null
  );
}

function nextSquadShirtNumber(teamId) {
  const nums = playersForTeam(teamId)
    .map((p) => Number(p.number))
    .filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function transferPlayerFieldHtml(mode, teamId, playerName) {
  const name = String(playerName ?? "").trim();
  const onSquad = Boolean(teamId && name && rosterPlayerByName(teamId, name));
  const isIncoming = transferDirectionIncoming(mode);
  const btnLabel = isIncoming ? (onSquad ? "Already on squad" : "Add to squad") : onSquad ? "Remove from squad" : "Not on squad";
  const disabled = isIncoming ? !name || onSquad : !name || !onSquad;
  return `
    <div class="tr-player-field">
      <input class="tr-player transfers-input mw-input" value="${esc(name)}" placeholder="Player name" aria-label="Player" />
      <button type="button" class="mw-btn-ghost tr-roster-btn ${isIncoming ? "tr-add-squad" : "tr-remove-squad"}" title="${esc(btnLabel)}"${disabled ? " disabled" : ""}>${isIncoming ? "+ Squad" : "− Squad"}</button>
    </div>`;
}

function syncTransferRosterBtn(row, teamId, mode) {
  if (!row) return;
  const input = row.querySelector(".tr-player");
  const btn = row.querySelector(".tr-roster-btn");
  if (!input || !btn) return;
  const name = input.value.trim();
  const onSquad = Boolean(name && rosterPlayerByName(teamId, name));
  const isIncoming = transferDirectionIncoming(mode);
  if (isIncoming) {
    btn.disabled = !name || onSquad;
    btn.textContent = onSquad ? "On squad" : "+ Squad";
    btn.title = onSquad ? "Already on squad" : "Add to squad";
  } else {
    btn.disabled = !name || !onSquad;
    btn.textContent = "− Squad";
    btn.title = onSquad ? "Remove from squad" : "Not on squad";
  }
}

function addTransferPlayerToSquad(teamId, playerName) {
  const name = String(playerName ?? "").trim();
  if (!teamId) return toast("Choose a club first");
  if (!name) return toast("Enter a player name first");
  if (rosterPlayerByName(teamId, name)) return toast("Player is already on the squad");
  const number = nextSquadShirtNumber(teamId);
  const maxOrder = playersForTeam(teamId).reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  FCDataStore.upsertPlayer({
    id: FCDataStore.makePlayerId(teamId, number, name),
    teamId,
    number,
    name,
    pos: "MF",
    role: "CM",
    flag: "",
    nationality: "",
    sortOrder: maxOrder + 1,
  });
  syncToAppArrays();
  toast(`${name} added to squad`);
}

function removeTransferPlayerFromSquad(teamId, playerName) {
  const name = String(playerName ?? "").trim();
  if (!teamId) return toast("Choose a club first");
  if (!name) return toast("Enter a player name first");
  const player = rosterPlayerByName(teamId, name);
  if (!player) return toast("Player not found on this squad");
  if (!confirm(`Remove ${player.name} from the squad?`)) return;
  FCDataStore.removePlayer(player.id);
  syncToAppArrays();
  toast(`${player.name} removed from squad`);
}

const ADMIN_TRANSFER_SECTIONS = [
  {
    key: "in",
    title: "Transfers In",
    hint: "Type the incoming player name. Use <strong>+ Squad</strong> to add them to the club roster (edit details later in Players).",
    tableId: "transfersInTable",
    btnId: "btnAddTransferIn",
    btnLabel: "+ In",
    clubHeader: "From",
    clubPlaceholder: "Previous club",
    feePlaceholder: "€5m / Free",
  },
  {
    key: "out",
    title: "Transfers Out",
    hint: "Type the outgoing player name. Use <strong>− Squad</strong> to remove them from the club roster.",
    tableId: "transfersOutTable",
    btnId: "btnAddTransferOut",
    btnLabel: "+ Out",
    clubHeader: "To",
    clubPlaceholder: "Destination club",
    feePlaceholder: "€5m / Loan",
  },
  {
    key: "loanReturn",
    title: "Loan Return",
    hint: "Player returning from a loan spell elsewhere. Use <strong>+ Squad</strong> when they rejoin the roster.",
    tableId: "transfersLoanReturnTable",
    btnId: "btnAddTransferLoanReturn",
    btnLabel: "+ Loan Return",
    clubHeader: "From",
    clubPlaceholder: "Loan club",
    feePlaceholder: "Loan / Free",
  },
  {
    key: "loanRecall",
    title: "Recall",
    hint: "Player loaned to this club sent back to their parent club. Use <strong>− Squad</strong> to remove them from the roster.",
    tableId: "transfersLoanRecallTable",
    btnId: "btnAddTransferLoanRecall",
    btnLabel: "+ Recall",
    clubHeader: "To",
    clubPlaceholder: "Parent club",
    feePlaceholder: "Loan / Free",
  },
];

function transferTableRowHtml(mode, teamId, t, i) {
  const isIncoming = transferDirectionIncoming(mode);
  const clubInput = isIncoming
    ? `<input class="tr-from transfers-input mw-input" value="${esc(t.otherClub ?? "")}" placeholder="${esc(ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode)?.clubPlaceholder ?? "Club")}" />`
    : `<input class="tr-to transfers-input mw-input" value="${esc(t.otherClub ?? "")}" placeholder="${esc(ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode)?.clubPlaceholder ?? "Club")}" />`;
  const feePlaceholder = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode)?.feePlaceholder ?? "Fee";
  return `<tr data-i="${i}" data-dir="${esc(mode)}" data-id="${esc(t.id ?? "")}">
    <td class="transfers-player-col">${transferPlayerFieldHtml(mode, teamId, t.player)}</td>
    <td class="transfers-club-col">${clubInput}</td>
    <td class="transfers-fee-col d-none d-sm-table-cell"><input class="tr-fee transfers-input mw-input" value="${esc(t.fee ?? "")}" placeholder="${esc(feePlaceholder)}" /></td>
    <td class="transfers-date-col"><input class="tr-date transfers-input transfers-input--date mw-input" type="date" value="${esc(transferDateToInputValue(t.date))}" /></td>
    <td class="transfers-del-col"><button type="button" class="mw-btn-danger transfers-del-btn tr-del" title="Remove row">×</button></td>
  </tr>`;
}

function transferInRowHtml(teamId, t, i) {
  return transferTableRowHtml("in", teamId, t, i);
}

function transferOutRowHtml(t, i) {
  return transferTableRowHtml("out", transferTeamFilter, t, i);
}

function panelTransfers() {
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;

  if (leagueFilter === "worldcup") {
    return `
      <div class="mw-page transfers-page">
        <header class="mw-hero">
          <div class="row g-3 align-items-start">
            <div class="col-12 col-lg-8 mw-hero-text">
              <p class="mw-eyebrow">Market moves</p>
              <h2 class="mw-heading">Transfers</h2>
              <p class="mw-lead">Transfers are not used for the <strong>World Cup</strong>. Switch to a club league to manage market moves.</p>
            </div>
            <div class="col-12 col-sm-8 col-lg-4">
              <div class="mw-hero-preview w-100">
                <span class="mw-hero-preview-label">${esc(leagueName)}</span>
                <strong class="mw-hero-preview-title">Not available</strong>
                <span class="mw-hero-preview-range">Club leagues only</span>
              </div>
            </div>
          </div>
        </header>
        <section class="mw-card">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  const teams = teamsForLeague(leagueFilter);
  if (!teams.length) transferTeamFilter = "";
  else if (!teams.some((t) => t.id === transferTeamFilter)) transferTeamFilter = teams[0].id;

  const team = state().teams.find((t) => t.id === transferTeamFilter);
  const teamOpts = teamOptionTags(teams, transferTeamFilter);
  const scoped = transferTeamFilter ? transfersForTeam(leagueFilter, transferTeamFilter) : { in: [], out: [], loanReturn: [], loanRecall: [] };
  const inCount = scoped.in.length;
  const outCount = scoped.out.length;
  const loanReturnCount = scoped.loanReturn.length;
  const loanRecallCount = scoped.loanRecall.length;

  const transferSectionsHtml = ADMIN_TRANSFER_SECTIONS.map((section) => {
    const rows = scoped[section.key] ?? [];
    const rowHtml =
      section.key === "in"
        ? rows.map((t, i) => transferInRowHtml(transferTeamFilter, t, i)).join("")
        : rows.map((t, i) => transferTableRowHtml(section.key, transferTeamFilter, t, i)).join("");
    return `
        <div class="transfers-section">
          <h4 class="transfers-section-title">${esc(section.title)}${team ? ` · ${esc(team.name)}` : ""}</h4>
          <p class="transfers-section-hint">${section.hint}</p>
          <div class="transfers-table-wrap">
            <table class="admin-table admin-table-compact transfers-table" id="${esc(section.tableId)}">
              <thead><tr><th>Player</th><th>${esc(section.clubHeader)}</th><th class="d-none d-sm-table-cell">Fee</th><th>Date</th><th></th></tr></thead>
              <tbody>${rowHtml}</tbody>
            </table>
          </div>
          <div class="transfers-section-actions row g-2 mt-2">
            <div class="col-12 col-sm-auto">
              <button type="button" class="mw-btn-ghost w-100" id="${esc(section.btnId)}">${esc(section.btnLabel)}</button>
            </div>
          </div>
        </div>`;
  }).join("");

  return `
    <div class="mw-page transfers-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Market moves</p>
            <h2 class="mw-heading">Transfers</h2>
            <p class="mw-lead">Choose league and club — set <strong>In</strong>, <strong>Out</strong>, <strong>Loan Return</strong>, and <strong>Recall</strong> for that team. Use <strong>+ Squad</strong> / <strong>− Squad</strong> to update the roster.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(team?.name ?? "Select club")}</span>
              <strong class="mw-hero-preview-title">${inCount} in · ${outCount} out · ${loanReturnCount} return · ${loanRecallCount} recall</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Club transfers</h3>
          <p>Edits apply to the selected club only. Save when all four lists are ready.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field">
              <label for="transferTeamFilter">Club</label>
              <div class="mw-select-wrap">
                <select id="transferTeamFilter" class="mw-select"${teams.length ? "" : " disabled"}>${teamOpts}</select>
              </div>
            </div>
          </div>
        </div>

        ${transferSectionsHtml}

        <div class="transfers-form-footer row g-2 mt-3">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveTransfers">Save transfers for ${esc(team?.name ?? "club")}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function standingsRowHtml(rk, club, pts, i, teams) {
  return `<tr data-i="${i}">
        <td class="standings-rk-col"><input class="st-rk standings-input standings-input--rk mw-input" type="number" value="${esc(rk)}" /></td>
        <td class="standings-club-col">${standingsClubSelectHtml(club, teams)}</td>
        <td class="standings-pts-col"><input class="st-pts standings-input standings-input--pts mw-input" type="number" value="${esc(pts)}" /></td>
        <td class="standings-del-col"><button type="button" class="mw-btn-danger standings-del-btn st-del" title="Remove row">×</button></td>
      </tr>`;
}

function panelStandings() {
  if (leagueFilter === "worldcup") return panelWorldCupStandings();

  const teams = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const rows = standingsRows(leagueFilter);
  const body = rows.map(([rk, club, pts], i) => standingsRowHtml(rk, club, pts, i, teams)).join("");

  return `
    <div class="mw-page standings-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">League table</p>
            <h2 class="mw-heading">Standings</h2>
            <p class="mw-lead">Edit the mini table shown on the public site. Clubs are chosen from the <strong>Teams</strong> list for this league.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(leagueName)}</span>
              <strong class="mw-hero-preview-title">${rows.length} club${rows.length === 1 ? "" : "s"}</strong>
              <span class="mw-hero-preview-range">Top ${rows.length || 10} table</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Top ${rows.length || 10} standings</h3>
          <p>Set rank, club, and points for each row. Add or remove rows as needed.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        <div class="standings-table-wrap">
          <table class="admin-table admin-table-compact standings-table" id="standingsTable">
            <thead><tr><th>#</th><th>Club</th><th>Pts</th><th></th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="standings-form-footer row g-2 mt-3">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnAddStandRow">+ Row</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveStandings">Save standings</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function panelScorers() {
  const teams = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const rows = scorersRows(leagueFilter);
  const body = rows.map(([name, club, goals], i) => renderScorerRowHtml(name, club, goals, i, teams)).join("");
  const leader = rows[0];
  const leaderLine = leader?.[0] ? `${leader[0]} · ${leader[2]} goal${Number(leader[2]) === 1 ? "" : "s"}` : "No scorers yet";

  return `
    <div class="mw-page scorers-page">
      <header class="mw-hero">
        <div class="row g-3 align-items-start">
          <div class="col-12 col-lg-8 mw-hero-text">
            <p class="mw-eyebrow">Goal charts</p>
            <h2 class="mw-heading">Top scorers</h2>
            <p class="mw-lead">Pick a <strong>club</strong> first — the <strong>player</strong> list fills from that team’s squad.</p>
          </div>
          <div class="col-12 col-sm-8 col-lg-4">
            <div class="mw-hero-preview w-100">
              <span class="mw-hero-preview-label">${esc(leagueName)}</span>
              <strong class="mw-hero-preview-title">${rows.length} scorer${rows.length === 1 ? "" : "s"}</strong>
              <span class="mw-hero-preview-range">${esc(leaderLine)}</span>
            </div>
          </div>
        </div>
      </header>

      <section class="mw-card">
        <div class="mw-card-head">
          <h3>Scorer list</h3>
          <p>${rows.length} row${rows.length === 1 ? "" : "s"} · shown on the public top scorers widget.</p>
        </div>
        <div class="row g-2 g-md-3 mb-3">
          <div class="col-12 col-md-6 col-lg-4">
            ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
          </div>
        </div>
        <div class="scorers-table-wrap">
          <table class="admin-table admin-table-compact scorers-table" id="scorersTable">
            <thead><tr><th>Club</th><th>Player</th><th class="scorers-goals-head">Goals</th><th></th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="scorers-form-footer row g-2 mt-3">
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-ghost w-100" id="btnAddScorerRow">+ Row</button>
          </div>
          <div class="col-12 col-sm-auto">
            <button type="button" class="mw-btn-primary w-100" id="btnSaveScorers">Save scorers</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function panelSettings() {
  return `
    <section class="admin-card">
      <h2>Security</h2>
      <p class="admin-muted">PIN is stored locally (not encrypted). Use a private device only.</p>
      <div class="admin-field"><label>New PIN</label><input id="newPin" type="password" /></div>
      <div class="admin-actions"><button type="button" class="admin-btn primary" id="btnChangePin">Update PIN</button></div>
    </section>
  `;
}

function renderPanel() {
  const main = $("#adminMain");
  if (!main) return;

  const map = {
    overview: panelOverview,
    leagues: panelLeagues,
    stadiums: panelStadiums,
    league: panelLeague,
    teams: panelTeams,
    squaddepth: panelSquadDepth,
    nationalduty: panelNationalDuty,
    players: panelPlayers,
    matches: panelMatches,
    standings: panelStandings,
    scorers: panelScorers,
    transfers: panelTransfers,
    settings: panelSettings,
  };

  mwEditorDraft = activeTab === "league" ? readMwEditorDraft() : null;
  if (activeTab !== "squaddepth") squadDepthDraft = null;
  main.innerHTML = map[activeTab]?.() ?? "";
  mwEditorDraft = null;
  squadDepthDraft = null;
  bindLeagueSelect();
  bindPanelHandlers();
}

function bindLeagueSelect() {
  const sel = $("#leagueFilter");
  if (!sel) return;
  sel.value = leagueFilter;
  sel.addEventListener("change", () => {
    leagueFilter = sel.value;
    playerTeamFilter = "";
    playerTransferPickId = "";
    playerSearchQuery = "";
    squadDepthTeamFilter = "";
    nationalDutyTeamFilter = "";
    transferTeamFilter = "";
    matchEditId = "";
    stadiumEditName = "";
    renderPanel();
  });
}

function bindPanelHandlers() {
  $("#btnExport")?.addEventListener("click", () => {
    const blob = new Blob([FCDataStore.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
    toast("Saved as data.json — commit this file for GitHub");
  });

  $("#btnExportCopy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(FCDataStore.exportJson());
      toast("Copied — paste into data.json in the project folder");
    } catch {
      alert("Copy failed — use Download data.json instead");
    }
  });

  $("#btnImport")?.addEventListener("click", () => {
    const card = $("#importCard");
    card?.classList.remove("admin-hidden");
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#importText")?.focus();
  });
  $("#btnImportCancel")?.addEventListener("click", () => $("#importCard")?.classList.add("admin-hidden"));
  $("#btnImportConfirm")?.addEventListener("click", () => {
    try {
      FCDataStore.importJson($("#importText").value);
      syncToAppArrays();
      toast("Import applied — reload main site");
      renderPanel();
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  });

  $("#btnReset")?.addEventListener("click", () => {
    if (!confirm("Reset ALL data to the built-in seed from app.js?")) return;
    FCDataStore.resetToSeed();
    syncToAppArrays();
    toast("Reset complete");
    renderPanel();
  });

  $("#btnFirebaseSignIn")?.addEventListener("click", async () => {
    if (typeof FCFirebase === "undefined") return toast("Firebase module not loaded");
    const email = $("#firebaseEmail")?.value ?? "";
    const password = $("#firebasePassword")?.value ?? "";
    if (!email || !password) return toast("Enter Firebase email and password");
    try {
      await FCFirebase.signIn(email, password);
      toast("Signed in to Firebase");
      renderPanel();
    } catch (err) {
      alert(err?.message || "Firebase sign-in failed");
    }
  });

  $("#btnFirebaseSignOut")?.addEventListener("click", async () => {
    try {
      await FCFirebase?.signOut?.();
      toast("Signed out of Firebase");
      renderPanel();
    } catch (err) {
      alert(err?.message || "Sign-out failed");
    }
  });

  $("#btnPublishFirebase")?.addEventListener("click", async () => {
    if (typeof FCFirebase === "undefined" || !FCFirebase.isConfigured()) {
      return toast("Configure firebase-config.js first");
    }
    if (!FCFirebase.isSignedIn()) return toast("Sign in to Firebase first");
    const btn = $("#btnPublishFirebase");
    if (btn) btn.disabled = true;
    try {
      const payload = JSON.parse(FCDataStore.exportJson());
      await FCFirebase.publishState(payload);
      toast("Published to Firebase — live site will pick up on refresh");
      renderPanel();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Firebase publish failed");
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  if (typeof FCFirebase !== "undefined" && FCFirebase.isConfigured() && !globalThis.__FC_FIREBASE_AUTH_BOUND__) {
    globalThis.__FC_FIREBASE_AUTH_BOUND__ = true;
    FCFirebase.onAuthChange(() => {
      if (activeTab === "overview") renderPanel();
    });
  }

  $("#btnSaveMeta")?.addEventListener("click", () => {
    const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
    const num = Number($("#mwNum")?.value) || 36;
    const title = $("#mwTitle")?.value.trim() || (isWc ? "Group Stage" : `Matchweek ${num}`);
    FCDataStore.setLeagueMeta(leagueFilter, {
      matchweek: isWc ? 1 : num,
      matchweekTitle: title,
      dateRange: $("#mwRange")?.value.trim() ?? "",
    });
    syncToAppArrays();
    toast(isWc ? "Tournament header saved" : "Matchweek saved");
    renderPanel();
  });

  bindLeagues();
  bindMatchweek();
  bindStadiums();
  bindTeams();
  bindSquadDepth();
  bindNationalDuty();
  bindPlayers();
  bindMatches();
  bindStandings();
  bindScorers();
  bindTransfers();

  $("#btnChangePin")?.addEventListener("click", () => {
    const p = $("#newPin").value;
    if (!p || p.length < 4) {
      alert("PIN must be at least 4 characters");
      return;
    }
    FCDataStore.setPin(p);
    toast("PIN updated");
  });
}

function isOwnGoalType(type) {
  const t = String(type ?? "").trim().toLowerCase();
  return t === "own goal" || t === "own-goal" || t === "og";
}

function findScorerSideForGoal(scorer, homeTeamId, awayTeamId, lineups) {
  const name = String(scorer ?? "").trim();
  if (!name) return null;
  const inList = (list) => (list ?? []).some((p) => String(p.name ?? "").trim() === name);
  if (inList(lineups?.home)) return "home";
  if (inList(lineups?.away)) return "away";
  if (homeTeamId && playersForTeam(homeTeamId).some((p) => p.name === name)) return "home";
  if (awayTeamId && playersForTeam(awayTeamId).some((p) => p.name === name)) return "away";
  return null;
}

function goalCreditedSideForSave(ev, homeTeamId, awayTeamId, lineups) {
  const stored = ev?.side === "away" ? "away" : "home";
  if (!isOwnGoalType(ev?.type)) return stored;
  const scorerSide = findScorerSideForGoal(ev?.scorer, homeTeamId, awayTeamId, lineups);
  if (scorerSide) return scorerSide === "home" ? "away" : "home";
  return stored === "home" ? "away" : "home";
}

function normalizeGoalEventsForSave(events, homeTeamId, awayTeamId, lineups) {
  return (events ?? []).map((ev) => ({
    ...ev,
    side: goalCreditedSideForSave(ev, homeTeamId, awayTeamId, lineups),
  }));
}

function readGoalEventsFromDom() {
  return Array.from(document.querySelectorAll(".ge-row"))
    .map((row) => {
      const assist = readGoalEventPlayerFromDom(row, "assist");
      const type = readGoalEventTypeFromDom(row);
      return {
        minute: Number(row.querySelector(".ge-min")?.value) || 0,
        side: row.querySelector(".ge-side")?.value === "away" ? "away" : "home",
        scorer: readGoalEventPlayerFromDom(row, "scorer"),
        assist: assist || null,
        type: type || undefined,
      };
    })
    .filter((g) => g.scorer);
}

function readLineupSlotFromDom(slot) {
  const tag = slot.querySelector(".lineup-tag")?.value.trim() ?? "";
  const captain = !!slot.querySelector(".lineup-cap")?.checked;
  const mode = slot.querySelector(".lineup-mode")?.value === "manual" ? "manual" : "roster";

  if (mode === "roster") {
    const pid = slot.querySelector(".lineup-pick")?.value;
    if (!pid) return null;
    const p = state().players.find((x) => x.id === pid);
    if (!p) return null;
    const isCap = captain || playerNameMarksCaptain(p.name);
    return {
      tag: tag || p.role || p.pos,
      number: p.number,
      name: stripCaptainSuffix(p.name),
      flag: p.flag ?? "",
      nationality: p.nationality ?? "",
      captain: isCap,
    };
  }

  const name = stripCaptainSuffix(slot.querySelector(".lineup-man-name")?.value.trim() ?? "");
  const number = Number(slot.querySelector(".lineup-man-num")?.value);
  if (!name || !Number.isFinite(number)) return null;

  const nationality = slot.querySelector(".lineup-man-nat")?.value.trim() ?? "";
  let flag = slot.querySelector(".lineup-man-flag")?.value.trim() ?? "";
  if (!flag && nationality && typeof NationalityFlags !== "undefined") {
    flag = NationalityFlags.getFlag(nationality) || "";
  }

  const roleTag = tag || inferPosFromTag(tag);

  const isCap = captain || playerNameMarksCaptain(slot.querySelector(".lineup-man-name")?.value);

  return {
    tag: roleTag,
    number,
    name,
    flag,
    nationality,
    captain: isCap,
  };
}

function readLineupFromDom(side) {
  return Array.from(document.querySelectorAll(`.admin-lineup-slot[data-side="${side}"]`))
    .map((slot) => readLineupSlotFromDom(slot))
    .filter(Boolean);
}

function applyLineupRosterAdds(homeTeamId, awayTeamId) {
  let added = 0;
  for (const side of ["home", "away"]) {
    const teamId = side === "home" ? homeTeamId : awayTeamId;
    for (const slot of document.querySelectorAll(`.admin-lineup-slot[data-side="${side}"]`)) {
      if (slot.querySelector(".lineup-mode")?.value !== "manual") continue;
      if (!slot.querySelector(".lineup-add-roster")?.checked) continue;

      const name = slot.querySelector(".lineup-man-name")?.value.trim() ?? "";
      const number = Number(slot.querySelector(".lineup-man-num")?.value);
      if (!name || !Number.isFinite(number)) continue;

      const tag = slot.querySelector(".lineup-tag")?.value.trim() ?? "";
      const pos = inferPosFromTag(tag);
      const nationality = slot.querySelector(".lineup-man-nat")?.value.trim() ?? "";
      let flag = slot.querySelector(".lineup-man-flag")?.value.trim() ?? "";
      if (!flag && nationality && typeof NationalityFlags !== "undefined") {
        flag = NationalityFlags.getFlag(nationality) || "";
      }

      const id = FCDataStore.makePlayerId(teamId, number, name);
      const existing = state().players.find((p) => p.id === id);
      FCDataStore.upsertPlayer({
        id,
        teamId,
        number,
        name,
        pos: existing?.pos ?? pos,
        role: tag || existing?.role || pos,
        flag: flag || existing?.flag || "",
        nationality: nationality || existing?.nationality || "",
      });
      added += 1;
    }
  }
  if (added) syncToAppArrays();
  return added;
}

function bindGoalEventDeletes() {
  document.querySelectorAll(".ge-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".ge-row")?.remove();
    });
  });
}

function bindGoalEventRowHandlers() {
  document.querySelectorAll(".ge-row").forEach((row) => {
    for (const kind of ["scorer", "assist"]) {
      const modeSel = row.querySelector(`.ge-${kind}-mode`);
      const rosterEl = row.querySelector(`.ge-${kind}-roster`);
      const manualEl = row.querySelector(`.ge-${kind}-manual`);
      const pick = row.querySelector(`.ge-${kind}-pick`);
      const man = row.querySelector(`.ge-${kind}-man`);
      const emptyLabel = goalEventEmptyLabel(kind);

      const syncMode = () => {
        const manual = modeSel?.value === "manual";
        rosterEl?.classList.toggle("admin-hidden", manual);
        manualEl?.classList.toggle("admin-hidden", !manual);
        if (!manual && man?.value.trim() && pick) {
          const teamId = row.querySelector(".ge-side")?.value === "away" ? $("#matchAway")?.value : $("#matchHome")?.value;
          const match = goalEventPlayerChoices(teamId, emptyLabel).find((c) => c.name === man.value.trim());
          if (match) pick.value = match.name;
        }
      };

      modeSel?.addEventListener("change", () => {
        if (modeSel.value === "roster" && man?.value.trim() && pick) {
          const teamId = row.querySelector(".ge-side")?.value === "away" ? $("#matchAway")?.value : $("#matchHome")?.value;
          const match = goalEventPlayerChoices(teamId, emptyLabel).find((c) => c.name === man.value.trim());
          if (match) pick.value = match.name;
        } else if (modeSel.value === "manual" && pick?.value && man) {
          man.value = pick.value;
        }
        syncMode();
      });

      syncMode();
    }

    const typeSel = row.querySelector(".ge-type-select");
    const typeCustom = row.querySelector(".ge-type-custom");
    typeSel?.addEventListener("change", () => {
      const custom = typeSel.value === "__custom__";
      typeCustom?.classList.toggle("admin-hidden", !custom);
      if (!custom) typeCustom && (typeCustom.value = "");
    });
  });
}

function bindMatchweek() {
  if (activeTab !== "league") return;

  const refreshForTeams = () => renderPanel();

  $("#matchHome")?.addEventListener("change", () => {
    const homeId = $("#matchHome")?.value;
    const draft =
      readMwEditorDraft() ?? {
        id: matchEditId || "",
        time: $("#matchTime")?.value ?? "",
        stadium: $("#matchStadium")?.value ?? "",
        homeTeamId: homeId,
        awayTeamId: $("#matchAway")?.value,
        score: [Number($("#matchHomeScore")?.value) || 0, Number($("#matchAwayScore")?.value) || 0],
        formation: [$("#matchFormHome")?.value?.trim() || "4-2-3-1", $("#matchFormAway")?.value?.trim() || "4-3-3"],
        goalEvents: readGoalEventsFromDom(),
        lineups: { home: readLineupFromDom("home"), away: readLineupFromDom("away") },
      };
    draft.homeTeamId = homeId;
    mwEditorDraft = draft;
    renderPanel();
  });
  $("#matchAway")?.addEventListener("change", refreshForTeams);

  $("#goalEventsBody")?.addEventListener("change", (e) => {
    const t = e.target;
    if (t instanceof HTMLElement && t.classList.contains("ge-side")) {
      refreshGoalEventRowPlayers(t.closest(".ge-row"));
      return;
    }
  });

  $("#btnAddGoal")?.addEventListener("click", () => {
    const tbody = $("#goalEventsBody");
    const homeId = $("#matchHome")?.value;
    const awayId = $("#matchAway")?.value;
    if (!tbody || !homeId) return toast("Choose home team first");
    const i = tbody.querySelectorAll(".ge-row").length;
    tbody.insertAdjacentHTML("beforeend", renderGoalEventRowHtml({}, i, homeId, awayId, null));
    bindGoalEventDeletes();
    bindGoalEventRowHandlers();
  });

  bindGoalEventDeletes();
  bindGoalEventRowHandlers();
  bindCopyLineupHandlers();

  bindLineupSlotHandlers();

  const startNewFixture = () => {
    matchEditId = "";
    renderPanel();
    $("#mwMatchEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("#btnNewMwMatch")?.addEventListener("click", startNewFixture);
  $("#btnNewMwMatchEmpty")?.addEventListener("click", startNewFixture);

  $("#btnCancelMwMatch")?.addEventListener("click", () => {
    matchEditId = "";
    renderPanel();
  });

  document.querySelectorAll("[data-edit-mw-match]").forEach((btn) => {
    btn.addEventListener("click", () => {
      matchEditId = btn.getAttribute("data-edit-mw-match") || "";
      renderPanel();
      $("#mwMatchEditor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-del-mw-match]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Remove this fixture?")) return;
      const id = btn.getAttribute("data-del-mw-match");
      FCDataStore.removeMatch(id);
      if (matchEditId === id) matchEditId = "";
      syncToAppArrays();
      toast("Fixture removed");
      renderPanel();
    });
  });

  $("#btnSaveMwMatch")?.addEventListener("click", () => {
    const meta = FCDataStore.getLeagueMeta(leagueFilter);
    const mw = meta.matchweek ?? 36;
    const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
    const home = $("#matchHome")?.value;
    const away = $("#matchAway")?.value;
    if (!home || !away) return alert("Choose home and away teams");
    if (home === away) return alert("Home and away must differ");

    const editId = $("#matchEditId")?.value;
    const prev = editId ? state().matches.find((x) => x.id === editId) : null;
    const stageSlug = isWc
      ? FCDataStore.slugify($("#matchStage")?.value || meta.matchweekTitle || "stage")
      : `mw${mw}`;
    const id =
      editId ||
      `${leagueFilter}_${stageSlug}_${FCDataStore.slugify(state().teams.find((t) => t.id === home)?.name ?? "h")}_${FCDataStore.slugify(state().teams.find((t) => t.id === away)?.name ?? "a")}`;

    const rosterAdded = applyLineupRosterAdds(home, away);

    const lineups = {
      home: readLineupFromDom("home"),
      away: readLineupFromDom("away"),
    };
    const hasLineup = lineups.home.length > 0 || lineups.away.length > 0;
    const goalEvents = normalizeGoalEventsForSave(readGoalEventsFromDom(), home, away, hasLineup ? lineups : prev?.lineups);
    const matchday =
      typeof matchdayForSavedFixture === "function"
        ? matchdayForSavedFixture(leagueFilter, meta, isWc ? $("#matchStage")?.value : null)
        : isWc
          ? $("#matchStage")?.value.trim() || meta.matchweekTitle || "Group Stage"
          : `MW ${mw}`;

    FCDataStore.upsertMatch({
      id,
      leagueId: leagueFilter,
      matchday,
      status: prev?.status ?? "FT",
      time: $("#matchTime")?.value.trim() || "—",
      stadium: $("#matchStadium")?.value.trim() || "—",
      homeTeamId: home,
      awayTeamId: away,
      score: [Number($("#matchHomeScore")?.value) || 0, Number($("#matchAwayScore")?.value) || 0],
      scorers: prev?.scorers ?? [],
      goalEvents,
      possession: prev?.possession ?? [],
      momentum: prev?.momentum ?? 0.5,
      formation: [$("#matchFormHome")?.value.trim() || "—", $("#matchFormAway")?.value.trim() || "—"],
      lineups: hasLineup ? lineups : prev?.lineups,
    });

    matchEditId = id;
    syncToAppArrays();
    toast(rosterAdded ? `Fixture saved · ${rosterAdded} player${rosterAdded === 1 ? "" : "s"} added to roster` : "Fixture saved");
    renderPanel();
  });
}

function bindCopyLineupHandlers() {
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const currentMw = meta.matchweek ?? 36;

  document.querySelectorAll("[data-copy-lineup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.getAttribute("data-copy-lineup");
      if (side !== "home" && side !== "away") return;
      const teamId = side === "home" ? $("#matchHome")?.value : $("#matchAway")?.value;
      if (!teamId) return toast("Choose the team first");

      const sources = listLineupSources(leagueFilter, teamId, currentMw, matchEditId || "");
      if (!sources.length) return toast("No earlier lineup found for this team");

      const sel = document.querySelector(`[data-lineup-source="${side}"]`);
      const source = getLineupSourceByMatchId(sources, sel?.value ?? "");
      if (!source?.lineup?.length) return toast("Selected match has no lineup");

      applyCopiedLineupToEditor(side, source.lineup, source.label);
    });
  });
}

function bindLineupSlotHandlers() {
  document.querySelectorAll(".admin-lineup-slot").forEach((slot) => {
    const modeSel = slot.querySelector(".lineup-mode");
    const rosterFields = slot.querySelector(".lineup-roster-fields");
    const manualFields = slot.querySelector(".lineup-manual-fields");
    const addWrap = slot.querySelector(".lineup-add-roster-wrap");

    const syncMode = () => {
      const manual = modeSel?.value === "manual";
      rosterFields?.classList.toggle("admin-hidden", manual);
      manualFields?.classList.toggle("admin-hidden", !manual);
      addWrap?.classList.toggle("admin-hidden", !manual);
    };

    modeSel?.addEventListener("change", syncMode);
    syncMode();
  });

  document.querySelectorAll(".lineup-pick").forEach((sel) => {
    sel.addEventListener("change", () => {
      const p = state().players.find((x) => x.id === sel.value);
      const slot = sel.closest(".admin-lineup-slot");
      const tag = slot?.querySelector(".lineup-tag");
      if (p && tag && !tag.value.trim()) tag.value = p.role || p.pos;
      const capBox = slot?.querySelector(".lineup-cap");
      if (capBox && p) capBox.checked = playerNameMarksCaptain(p.name) || capBox.checked;
    });
  });

  document.querySelectorAll(".lineup-man-nat").forEach((natInput) => {
    natInput.addEventListener("change", () => {
      if (typeof NationalityFlags === "undefined") return;
      const slot = natInput.closest(".admin-lineup-slot");
      const flagInput = slot?.querySelector(".lineup-man-flag");
      const nat = natInput.value.trim();
      const suggested = NationalityFlags.getFlag(nat);
      if (suggested && flagInput && !flagInput.value.trim()) flagInput.value = suggested;
    });
  });
}

function syncToAppArrays() {
  if (typeof TEAMS === "undefined") return;
  const s = state();
  const replace = (arr, next) => {
    arr.length = 0;
    arr.push(...next);
  };
  replace(TEAMS, s.teams);
  replace(PLAYERS, s.players);
  replace(MATCHES, s.matches);
  replace(MINI_STANDINGS, s.miniStandings);
  replace(TOP_SCORERS, s.topScorers);
  if (typeof TRANSFERS !== "undefined") replace(TRANSFERS, s.transfers ?? []);
  if (typeof rebuildTeamIndex === "function") rebuildTeamIndex();
}

function bindStadiums() {
  if (activeTab !== "stadiums") return;

  $("#btnNewStadium")?.addEventListener("click", () => {
    stadiumEditName = "";
    renderPanel();
  });

  $("#btnSaveStadium")?.addEventListener("click", () => {
    const name = $("#stadiumName")?.value.trim();
    if (!name) return alert("Stadium name required");
    const prev = $("#stadiumEditName")?.value.trim();
    if (prev) {
      if (prev === name) {
        stadiumEditName = "";
        renderPanel();
        return toast("No changes");
      }
      if (!FCDataStore.renameLeagueStadium(leagueFilter, prev, name)) {
        return alert("Could not rename — check the name is unique");
      }
      syncToAppArrays();
      stadiumEditName = "";
      toast("Stadium updated");
      renderPanel();
      return;
    }
    if (!FCDataStore.addLeagueStadium(leagueFilter, name)) {
      return alert("That stadium already exists");
    }
    toast("Stadium added");
    renderPanel();
  });

  document.querySelectorAll("[data-edit-stadium]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stadiumEditName = btn.getAttribute("data-edit-stadium") || "";
      renderPanel();
      $("#stadiumName")?.focus();
    });
  });

  document.querySelectorAll("[data-del-stadium]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-del-stadium");
      if (!name || !confirm(`Remove “${name}” from this league?`)) return;
      FCDataStore.removeLeagueStadium(leagueFilter, name);
      if (stadiumEditName === name) stadiumEditName = "";
      toast("Stadium removed");
      renderPanel();
    });
  });
}

function bindTeams() {
  $("#btnNewTeam")?.addEventListener("click", () => {
    $("#teamEditId").value = "";
    $("#teamFormTitle").textContent = "Add team";
    $("#teamName").value = "";
    $("#teamCity").value = "";
    $("#teamFormation").value = "";
    $("#teamCoach").value = "";
    $("#teamLogo").value = "";
  });

  $("#btnSaveTeam")?.addEventListener("click", () => {
    const editId = $("#teamEditId").value;
    const name = $("#teamName").value.trim();
    if (!name) return alert("Name required");
    const id = editId || `${leagueFilter}_${FCDataStore.slugify(name)}`;
    const formation = $("#teamFormation").value.trim();
    const prev = editId ? state().teams.find((t) => t.id === editId) : null;
    const team = {
      id,
      leagueId: leagueFilter,
      name,
      city: $("#teamCity").value.trim() || name,
      formation: formation || undefined,
      coach: $("#teamCoach").value.trim() || "—",
      colors: [$("#teamC1").value, $("#teamC2").value],
      logo: $("#teamLogo").value.trim() || undefined,
    };
    if (prev?.squadDepth) team.squadDepth = prev.squadDepth;
    FCDataStore.upsertTeam(team);
    syncToAppArrays();
    toast("Team saved");
    renderPanel();
  });

  document.querySelectorAll("[data-edit-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = state().teams.find((x) => x.id === btn.getAttribute("data-edit-team"));
      if (!t) return;
      $("#teamEditId").value = t.id;
      $("#teamFormTitle").textContent = "Edit team";
      $("#teamName").value = t.name;
      $("#teamCity").value = t.city ?? "";
      $("#teamFormation").value = t.formation ?? "";
      $("#teamCoach").value = t.coach ?? "";
      $("#teamLogo").value = t.logo ?? "";
      $("#teamC1").value = t.colors?.[0] ?? "#2de2e6";
      $("#teamC2").value = t.colors?.[1] ?? "#111827";
    });
  });

  document.querySelectorAll("[data-del-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-team");
      if (!confirm("Remove team and its players/matches?")) return;
      FCDataStore.removeTeam(id);
      syncToAppArrays();
      toast("Team removed");
      renderPanel();
    });
  });
}

function bindSquadDepth() {
  document.querySelectorAll(".sd-pick").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      applySquadDepthEditorChange(e.target?.id ?? "");
    });
  });

  document.querySelectorAll(".sd-tag").forEach((input) => {
    input.addEventListener("change", () => {
      squadDepthDraft = readSquadDepthFromDom();
    });
  });

  $("#sdTeam")?.addEventListener("change", () => {
    squadDepthTeamFilter = $("#sdTeam")?.value ?? "";
    squadDepthDraft = null;
    renderPanel();
  });

  $("#sdFormation")?.addEventListener("change", () => {
    squadDepthDraft = SquadDepth.syncDepthFormation(
      readSquadDepthFromDom(),
      $("#sdFormation")?.value?.trim() || "4-2-3-1",
    );
    renderPanel();
  });

  $("#btnSaveSquadDepth")?.addEventListener("click", () => {
    const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
    const team = state().teams.find((t) => t.id === teamId);
    if (!team) return alert("Select a team");
    const depth = readSquadDepthFromDom();
    const check = SquadDepth.validateSquadDepth(depth);
    if (!check.ok) {
      alert(check.errors.join("\n"));
      return;
    }
    FCDataStore.upsertTeam({ ...team, squadDepth: depth, formation: depth.formation });
    syncToAppArrays();
    squadDepthDraft = SquadDepth.normalizeSquadDepth(depth, depth.formation);
    toast("Squad depth saved");
    renderPanel();
  });

  $("#btnResetSquadDepth")?.addEventListener("click", () => {
    const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
    const team = state().teams.find((t) => t.id === teamId);
    if (!team) return;
    if (!confirm(`Clear depth chart picks for ${team.name}?`)) return;
    const formation = $("#sdFormation")?.value?.trim() || team.formation || "4-2-3-1";
    squadDepthDraft = null;
    FCDataStore.upsertTeam({ ...team, squadDepth: SquadDepth.emptySquadDepth(formation) });
    syncToAppArrays();
    toast("Depth chart cleared");
    renderPanel();
  });
}

function bindNationalDutyPlayerAuto(selectEl) {
  selectEl?.addEventListener("change", () => {
    const row = selectEl.closest(".nd-row");
    const countryInput = row?.querySelector(".nd-country");
    if (!countryInput || countryInput.value.trim()) return;
    const p = state().players.find((x) => x.id === selectEl.value);
    if (p?.nationality?.trim()) countryInput.value = p.nationality.trim();
  });
}

function bindNationalDutyRowDragSort() {
  const tbody = $("#ndTable tbody");
  if (!tbody || tbody.dataset.ndDragBound === "1") return;
  tbody.dataset.ndDragBound = "1";

  let draggedKey = null;
  let touchRow = null;
  let touchMoved = false;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".nd-sort-row") : null;
  };

  tbody.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".nd-sort-row");
    if (!row) return;
    draggedKey = row.getAttribute("data-nd-row-key");
    row.classList.add("is-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedKey ?? "");
    }
  });

  tbody.addEventListener("dragend", (e) => {
    const row = e.target.closest(".nd-sort-row");
    row?.classList.remove("is-dragging");
    draggedKey = null;
    tbody.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  });

  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".nd-sort-row");
    if (!target || !draggedKey || target.getAttribute("data-nd-row-key") === draggedKey) return;

    const dragged = tbody.querySelector(`[data-nd-row-key="${CSS.escape(draggedKey)}"]`);
    if (!dragged) return;

    tbody.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) tbody.insertBefore(dragged, target);
    else tbody.insertBefore(dragged, target.nextSibling);
  });

  tbody.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".nd-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    tbody.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  });

  tbody.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".player-drag-handle");
      if (!handle || !tbody.contains(handle)) return;
      touchRow = handle.closest(".nd-sort-row");
      touchMoved = false;
      touchRow?.classList.add("is-dragging");
    },
    { passive: true },
  );

  tbody.addEventListener(
    "touchmove",
    (e) => {
      if (!touchRow) return;
      e.preventDefault();
      touchMoved = true;
      const touch = e.touches[0];
      const target = rowFromPoint(touch.clientX, touch.clientY);
      if (!target || target === touchRow) return;

      const rect = target.getBoundingClientRect();
      const before = touch.clientY < rect.top + rect.height / 2;
      if (before) tbody.insertBefore(touchRow, target);
      else tbody.insertBefore(touchRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!touchRow) return;
    touchRow.classList.remove("is-dragging");
    touchRow = null;
    touchMoved = false;
  };

  tbody.addEventListener("touchend", endTouch);
  tbody.addEventListener("touchcancel", endTouch);
}

function bindNationalDutyTableHandlers() {
  document.querySelectorAll(".nd-player").forEach((sel) => bindNationalDutyPlayerAuto(sel));
  bindNationalDutyRowDragSort();

  document.querySelectorAll(".nd-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".nd-row")?.remove();
      const tbody = $("#ndTable tbody");
      if (tbody && !tbody.querySelector(".nd-row")) {
        tbody.innerHTML = `<tr class="nd-empty-row"><td colspan="6" class="admin-muted">No players on national duty yet. Add a row below.</td></tr>`;
      }
    });
  });
}

function bindNationalDuty() {
  $("#ndTeam")?.addEventListener("change", () => {
    nationalDutyTeamFilter = $("#ndTeam")?.value ?? "";
    renderPanel();
  });

  bindNationalDutyTableHandlers();

  $("#btnNdAdd")?.addEventListener("click", () => {
    const teamId = $("#ndTeam")?.value ?? nationalDutyTeamFilter;
    if (!teamId) return toast("Choose a club first");
    const tbody = $("#ndTable tbody");
    if (!tbody) return;
    tbody.querySelector(".nd-empty-row")?.remove();
    tbody.insertAdjacentHTML("beforeend", nationalDutyRowHtml(teamId, {}, `nd-row-${Date.now()}`));
    const rows = tbody.querySelectorAll(".nd-row");
    const lastSel = rows[rows.length - 1]?.querySelector(".nd-player");
    bindNationalDutyPlayerAuto(lastSel);
    rows[rows.length - 1]?.querySelector(".nd-del")?.addEventListener("click", () => {
      rows[rows.length - 1]?.remove();
      if (!tbody.querySelector(".nd-row")) {
        tbody.innerHTML = `<tr class="nd-empty-row"><td colspan="6" class="admin-muted">No players on national duty yet. Add a row below.</td></tr>`;
      }
    });
  });

  $("#btnSaveNationalDuty")?.addEventListener("click", () => {
    const teamId = $("#ndTeam")?.value ?? nationalDutyTeamFilter;
    const team = state().teams.find((t) => t.id === teamId);
    if (!team) return alert("Select a club");
    const raw = readNationalDutyFromDom();
    const entries = typeof NationalDuty !== "undefined" ? NationalDuty.normalizeNationalDuty(raw) : raw;
    const rosterIds = squadDepthRoster(teamId).map((p) => p.id);
    const check =
      typeof NationalDuty !== "undefined"
        ? NationalDuty.validateNationalDuty(entries, rosterIds)
        : { ok: true, errors: [] };
    if (!check.ok) {
      alert(check.errors.join("\n"));
      return;
    }
    FCDataStore.upsertTeam({ ...team, nationalDuty: entries });
    syncToAppArrays();
    toast(entries.length ? `National duty saved (${entries.length})` : "National duty cleared");
    renderPanel();
  });
}

function setupPlayerFlagAuto() {
  const nat = $("#playerNat");
  const flag = $("#playerFlag");
  const hint = $("#playerFlagHint");
  const preview = $("#playerFlagPreview");
  if (!nat || !flag || typeof NationalityFlags === "undefined") return;

  NationalityFlags.learnFromPlayers(state().players);

  const updatePreview = () => {
    if (preview) preview.textContent = flag.value.trim() || "—";
  };

  const applyFlagFromNationality = (force) => {
    const n = nat.value.trim();
    const suggested = NationalityFlags.getFlag(n);
    const flagEmpty = !flag.value.trim();
    const wasAuto = flag.dataset.auto === "1";

    if (suggested && (force || flagEmpty || wasAuto)) {
      flag.value = suggested;
      flag.dataset.auto = "1";
    } else if (!suggested && wasAuto) {
      flag.value = "";
      flag.dataset.auto = "0";
    }

    updatePreview();

    if (!hint) return;
    if (!n) {
      hint.textContent = "Type nationality — flag fills automatically when known.";
      hint.classList.remove("player-flag-hint--warn");
    } else if (suggested && flag.dataset.auto === "1") {
      hint.textContent = `Auto-filled ${suggested} — change flag manually anytime.`;
      hint.classList.remove("player-flag-hint--warn");
    } else if (suggested) {
      hint.textContent = `Known: ${suggested} — click Fill or edit flag manually.`;
      hint.classList.remove("player-flag-hint--warn");
    } else {
      hint.textContent = "Not in database — enter flag emoji manually (e.g. 🇮🇹).";
      hint.classList.add("player-flag-hint--warn");
    }
  };

  nat.addEventListener("input", () => applyFlagFromNationality(false));
  nat.addEventListener("change", () => applyFlagFromNationality(true));
  flag.addEventListener("input", () => {
    if (flag.value.trim()) flag.dataset.auto = "0";
    updatePreview();
  });
  $("#btnFillFlag")?.addEventListener("click", () => applyFlagFromNationality(true));

  applyFlagFromNationality(false);
}

function bindPlayerRowDragSort() {
  const tbody = $("#playersSortTbody");
  if (!tbody) return;

  let draggedId = null;

  for (const row of tbody.querySelectorAll(".player-sort-row")) {
    row.addEventListener("dragstart", (e) => {
      draggedId = row.getAttribute("data-player-id");
      row.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggedId ?? "");
      }
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      draggedId = null;
      tbody.querySelectorAll(".player-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    });
  }

  tbody.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".player-sort-row");
    if (!target || !draggedId || target.getAttribute("data-player-id") === draggedId) return;

    const dragged = tbody.querySelector(`[data-player-id="${CSS.escape(draggedId)}"]`);
    if (!dragged) return;

    tbody.querySelectorAll(".player-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) tbody.insertBefore(dragged, target);
    else tbody.insertBefore(dragged, target.nextSibling);
  });

  tbody.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".player-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  const persistOrder = () => {
    const teamId = playerTeamFilter;
    if (!teamId) return;
    const ids = [...tbody.querySelectorAll(".player-sort-row")]
      .map((r) => r.getAttribute("data-player-id"))
      .filter(Boolean);
    FCDataStore.reorderTeamPlayers(teamId, ids);
    syncToAppArrays();
    toast("Player order saved");
    tbody.querySelectorAll(".player-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  };

  tbody.addEventListener("drop", (e) => {
    e.preventDefault();
    persistOrder();
  });

  bindPlayerRowTouchSort(tbody, persistOrder);
}

/** Touch-based reordering for mobile (iOS Safari etc.), where HTML5 drag events don't fire. */
function bindPlayerRowTouchSort(tbody, persistOrder) {
  let dragRow = null;
  let moved = false;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".player-sort-row") : null;
  };

  for (const handle of tbody.querySelectorAll(".player-drag-handle")) {
    handle.addEventListener(
      "touchstart",
      (e) => {
        dragRow = handle.closest(".player-sort-row");
        moved = false;
        if (dragRow) dragRow.classList.add("is-dragging");
      },
      { passive: true },
    );
  }

  tbody.addEventListener(
    "touchmove",
    (e) => {
      if (!dragRow) return;
      e.preventDefault();
      moved = true;
      const touch = e.touches[0];
      const target = rowFromPoint(touch.clientX, touch.clientY);
      if (!target || target === dragRow) return;

      const rect = target.getBoundingClientRect();
      const before = touch.clientY < rect.top + rect.height / 2;
      if (before) tbody.insertBefore(dragRow, target);
      else tbody.insertBefore(dragRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!dragRow) return;
    dragRow.classList.remove("is-dragging");
    if (moved) persistOrder();
    dragRow = null;
    moved = false;
  };

  tbody.addEventListener("touchend", endTouch);
  tbody.addEventListener("touchcancel", endTouch);
}

function bindPlayers() {
  bindPlayerRowDragSort();

  $("#playerRosterSearch")?.addEventListener("input", (e) => {
    playerSearchQuery = e.target.value;
    applyPlayerRosterSearch();
  });

  $("#btnClearPlayerSearch")?.addEventListener("click", () => {
    playerSearchQuery = "";
    const input = $("#playerRosterSearch");
    if (input) input.value = "";
    applyPlayerRosterSearch();
    input?.focus();
  });

  applyPlayerRosterSearch();

  $("#btnAutoArrange")?.addEventListener("click", () => {
    const teamId = playerTeamFilter;
    if (!teamId) return;
    const ids = playersForTeam(teamId)
      .slice()
      .sort((a, b) => {
        const roleCmp = playerRoleRank(a) - playerRoleRank(b);
        if (roleCmp !== 0) return roleCmp;
        return Number(a.number) - Number(b.number) || String(a.name).localeCompare(b.name);
      })
      .map((p) => p.id);
    if (!ids.length) return;
    FCDataStore.reorderTeamPlayers(teamId, ids);
    syncToAppArrays();
    toast("Squad arranged by position");
    renderPanel();
  });

  $("#playerTeamFilter")?.addEventListener("change", (e) => {
    playerTeamFilter = e.target.value;
    playerSearchQuery = "";
    if (playerTransferPickId && !playersForTeam(playerTeamFilter).some((p) => p.id === playerTransferPickId)) {
      playerTransferPickId = "";
    }
    renderPanel();
  });

  $("#playerTeam")?.addEventListener("change", (e) => {
    playerTeamFilter = e.target.value;
    playerTransferPickId = "";
    playerSearchQuery = "";
    renderPanel();
  });

  $("#playerTransferPick")?.addEventListener("change", (e) => {
    playerTransferPickId = e.target.value;
  });

  $("#btnExecuteTransfer")?.addEventListener("click", () => {
    const fromTeamId = playerTeamFilter;
    const playerId = $("#playerTransferPick")?.value;
    const toTeamId = $("#playerTransferDest")?.value;
    if (!fromTeamId) return toast("Choose a team first");
    if (!playerId) return alert("Choose a player to transfer.");
    if (!toTeamId) return alert("Choose a destination club.");
    const p = state().players.find((x) => x.id === playerId);
    if (!p) return alert("Player not found.");
    const fromName = state().teams.find((t) => t.id === fromTeamId)?.name ?? fromTeamId;
    const toName = state().teams.find((t) => t.id === toTeamId)?.name ?? toTeamId;
    if (
      !confirm(
        `Transfer ${p.name} from ${fromName} to ${toName}?\n\nThey will be removed from ${fromName}'s squad and squad depth chart.`,
      )
    ) {
      return;
    }
    const r = FCDataStore.transferPlayer(playerId, toTeamId, { fromTeamId });
    if (!r.ok) return alert(r.error);
    syncToAppArrays();
    playerTransferPickId = "";
    playerTeamFilter = toTeamId;
    toast(`${p.name} → ${toName}`);
    renderPanel();
  });

  document.querySelectorAll("[data-transfer-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playerTransferPickId = btn.getAttribute("data-transfer-player");
      const pick = $("#playerTransferPick");
      if (pick) pick.value = playerTransferPickId;
      $("#playerTransferCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#playerTransferDest")?.focus();
    });
  });

  setupPlayerFlagAuto();

  $("#btnSavePlayer")?.addEventListener("click", () => {
    const teamId = $("#playerTeam").value;
    const number = Number($("#playerNumber").value);
    const name = $("#playerName").value.trim();
    if (!teamId || !name) return alert("Team and name required");
    const editId = $("#playerEditId").value;
    const id = editId || FCDataStore.makePlayerId(teamId, number, name);
    const existing = state().players.find((x) => x.id === id);
    let sortOrder = existing?.sortOrder;
    if (!editId) {
      const maxOrder = playersForTeam(teamId).reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
      sortOrder = maxOrder + 1;
    }
    const playerPayload = {
      id,
      teamId,
      number,
      name,
      pos: $("#playerPos").value.trim() || "MF",
      role: $("#playerRole").value.trim() || "CM",
      flag: $("#playerFlag").value.trim(),
      nationality: $("#playerNat").value.trim(),
      sortOrder,
    };
    if (teamId.startsWith("worldcup_")) {
      playerPayload.club = $("#playerClub")?.value.trim() || undefined;
    }
    const igRaw = $("#playerInstagram")?.value?.trim() ?? "";
    const ig = normalizeInstagramUrl(igRaw);
    if (igRaw && !ig) return alert("Invalid Instagram — use @username or a full instagram.com link.");
    playerPayload.instagram = ig;
    FCDataStore.upsertPlayer(playerPayload);
    syncToAppArrays();
    toast("Player saved");
    renderPanel();
  });

  document.querySelectorAll("[data-edit-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = state().players.find((x) => x.id === btn.getAttribute("data-edit-player"));
      if (!p) return;
      $("#playerEditId").value = p.id;
      $("#playerFormTitle").textContent = "Edit player";
      $("#playerTeam").value = p.teamId;
      $("#playerNumber").value = p.number;
      $("#playerName").value = p.name;
      $("#playerPos").value = p.pos;
      $("#playerRole").value = p.role ?? "";
      $("#playerNat").value = p.nationality ?? "";
      if ($("#playerClub")) $("#playerClub").value = p.club ?? "";
      if ($("#playerInstagram")) $("#playerInstagram").value = p.instagram ?? "";
      const flagEl = $("#playerFlag");
      if (flagEl) {
        flagEl.value = p.flag ?? "";
        flagEl.dataset.auto = p.flag ? "0" : "1";
      }
      setupPlayerFlagAuto();
    });
  });

  document.querySelectorAll("[data-del-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Remove player?")) return;
      FCDataStore.removePlayer(btn.getAttribute("data-del-player"));
      syncToAppArrays();
      toast("Player removed");
      renderPanel();
    });
  });
}

function bindMatches() {
  $("#btnSaveMatch")?.addEventListener("click", () => {
    const meta = FCDataStore.getLeagueMeta(leagueFilter);
    const mw = meta.matchweek ?? 36;
    const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
    const home = $("#matchHome").value;
    const away = $("#matchAway").value;
    if (home === away) return alert("Home and away must differ");
    const editId = $("#matchEditId").value;
    const stageSlug = isWc ? FCDataStore.slugify($("#matchStage")?.value || meta.matchweekTitle || "stage") : `mw${mw}`;
    const id =
      editId ||
      `${leagueFilter}_${stageSlug}_${FCDataStore.slugify(state().teams.find((t) => t.id === home)?.name ?? "h")}_${FCDataStore.slugify(state().teams.find((t) => t.id === away)?.name ?? "a")}`;
    const matchday =
      typeof matchdayForSavedFixture === "function"
        ? matchdayForSavedFixture(leagueFilter, meta, isWc ? $("#matchStage")?.value : null)
        : isWc
          ? $("#matchStage")?.value.trim() || meta.matchweekTitle || "Group Stage"
          : `MW ${mw}`;
    FCDataStore.upsertMatch({
      id,
      leagueId: leagueFilter,
      matchday,
      status: "FT",
      time: $("#matchTime").value.trim() || "—",
      stadium: $("#matchStadium").value.trim() || "—",
      homeTeamId: home,
      awayTeamId: away,
      score: [Number($("#matchHomeScore").value) || 0, Number($("#matchAwayScore").value) || 0],
      scorers: [],
      goalEvents: [],
      possession: [],
      momentum: 0.5,
      formation: ["—", "—"],
    });
    syncToAppArrays();
    toast("Match saved");
    renderPanel();
  });

  document.querySelectorAll("[data-edit-match]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = state().matches.find((x) => x.id === btn.getAttribute("data-edit-match"));
      if (!m) return;
      $("#matchEditId").value = m.id;
      $("#matchFormTitle").textContent = "Edit match";
      $("#matchTime").value = m.time ?? "";
      ensureStadiumSelectOption($("#matchStadium"), m.stadium);
      $("#matchHome").value = m.homeTeamId;
      $("#matchAway").value = m.awayTeamId;
      $("#matchHomeScore").value = m.score?.[0] ?? 0;
      $("#matchAwayScore").value = m.score?.[1] ?? 0;
    });
  });

  document.querySelectorAll("[data-del-match]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Remove match?")) return;
      FCDataStore.removeMatch(btn.getAttribute("data-del-match"));
      syncToAppArrays();
      toast("Match removed");
      renderPanel();
    });
  });
}

function readWorldCupGroupsFromDom() {
  const groupIds =
    typeof WORLD_CUP_GROUP_IDS !== "undefined"
      ? WORLD_CUP_GROUP_IDS
      : "ABCDEFGHIJKL".split("");
  const groupSize = typeof WORLD_CUP_GROUP_SIZE !== "undefined" ? WORLD_CUP_GROUP_SIZE : 4;
  const seen = new Set();

  return groupIds.map((gid) => {
    const tbody = $(`#wcGroup${gid} tbody`);
    const rows = [];
    if (!tbody) {
      return { id: gid, rows: Array.from({ length: groupSize }, (_, i) => [i + 1, "", 0]) };
    }
    tbody.querySelectorAll("tr").forEach((tr, i) => {
      if (i >= groupSize) return;
      const club = tr.querySelector(".st-club")?.value.trim() ?? "";
      if (club) {
        if (seen.has(club)) return;
        seen.add(club);
      }
      rows.push([
        Number(tr.querySelector(".st-rk")?.value) || i + 1,
        club,
        Number(tr.querySelector(".st-pts")?.value) || 0,
      ]);
    });
    while (rows.length < groupSize) rows.push([rows.length + 1, "", 0]);
    return { id: gid, rows: rows.slice(0, groupSize) };
  });
}

function bindStandings() {
  if (leagueFilter === "worldcup") {
    $("#btnSaveStandings")?.addEventListener("click", () => {
      FCDataStore.setStandings(leagueFilter, { groups: readWorldCupGroupsFromDom(), rows: [] });
      syncToAppArrays();
      toast("World Cup group standings saved");
    });
    return;
  }

  $("#btnAddStandRow")?.addEventListener("click", () => {
    const tbody = $("#standingsTable tbody");
    const i = tbody.querySelectorAll("tr").length;
    const teams = teamsForLeague(leagueFilter);
    tbody.insertAdjacentHTML(
      "beforeend",
      standingsRowHtml(i + 1, "", 0, i, teams),
    );
    bindStandDel();
  });

  function readStandings() {
    return Array.from($("#standingsTable tbody").querySelectorAll("tr")).map((tr) => [
      Number(tr.querySelector(".st-rk").value) || 0,
      tr.querySelector(".st-club")?.value.trim() ?? "",
      Number(tr.querySelector(".st-pts").value) || 0,
    ]);
  }

  $("#btnSaveStandings")?.addEventListener("click", () => {
    FCDataStore.setStandings(leagueFilter, readStandings());
    syncToAppArrays();
    toast("Standings saved");
  });

  bindStandDel();
}

function bindStandDel() {
  document.querySelectorAll(".st-del").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("tr")?.remove());
  });
}

function refreshScorerPlayerCell(row, clubName) {
  const cell = row?.querySelector(".sc-player-cell");
  if (!cell) return;
  const teamId = teamIdForClubName(leagueFilter, clubName);
  cell.innerHTML = scorersPlayerSelectHtml(teamId, "");
}

function bindScorers() {
  const tbody = $("#scorersTable tbody");

  $("#btnAddScorerRow")?.addEventListener("click", () => {
    if (!tbody) return;
    const teams = teamsForLeague(leagueFilter);
    const i = tbody.querySelectorAll(".scorer-row").length;
    tbody.insertAdjacentHTML("beforeend", renderScorerRowHtml("", "", 0, i, teams));
    bindScorerDel();
  });

  tbody?.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains("sc-club")) return;
    refreshScorerPlayerCell(t.closest("tr"), t.value);
  });

  $("#btnSaveScorers")?.addEventListener("click", () => {
    const rows = Array.from($("#scorersTable tbody").querySelectorAll("tr")).map((tr) => [
      tr.querySelector(".sc-name")?.value.trim() ?? "",
      tr.querySelector(".sc-club")?.value.trim() ?? "",
      Number(tr.querySelector(".sc-goals")?.value) || 0,
    ]);
    FCDataStore.setTopScorers(leagueFilter, rows);
    syncToAppArrays();
    toast("Top scorers saved");
  });

  bindScorerDel();
}

function bindScorerDel() {
  document.querySelectorAll(".sc-del").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest("tr")?.remove());
  });
}

function bindTransferRosterActions() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    const table = $(`#${section.tableId}`);
    const mode = section.key;
    const isIncoming = transferDirectionIncoming(mode);

    table?.querySelectorAll("tbody tr").forEach((row) => syncTransferRosterBtn(row, transferTeamFilter, mode));

    if (!table || table.dataset.trRosterBound === "1") continue;
    table.dataset.trRosterBound = "1";
    table.addEventListener("input", (e) => {
      if (!(e.target instanceof HTMLElement) || !e.target.classList.contains("tr-player")) return;
      syncTransferRosterBtn(e.target.closest("tr"), transferTeamFilter, mode);
    });
    table.addEventListener("click", (e) => {
      const selector = isIncoming ? ".tr-add-squad" : ".tr-remove-squad";
      const btn = e.target instanceof Element ? e.target.closest(selector) : null;
      if (!btn || btn.disabled) return;
      const row = btn.closest("tr");
      const name = row?.querySelector(".tr-player")?.value ?? "";
      if (isIncoming) {
        addTransferPlayerToSquad(transferTeamFilter, name);
      } else {
        removeTransferPlayerFromSquad(transferTeamFilter, name);
      }
      syncTransferRosterBtn(row, transferTeamFilter, mode);
    });
  }
}

function bindTransferDel() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    const table = $(`#${section.tableId}`);
    if (!table || table.dataset.trDelBound === "1") continue;
    table.dataset.trDelBound = "1";
    table.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".tr-del") : null;
      if (!btn) return;
      btn.closest("tr")?.remove();
    });
  }
}

function readTransfersTable(tableId, dir, clubName) {
  const tbody = $(tableId)?.querySelector("tbody");
  if (!tbody) return [];
  const isIncoming = transferDirectionIncoming(dir);
  return Array.from(tbody.querySelectorAll("tr"))
    .map((tr, i) => {
      const playerEl = tr.querySelector(".tr-player");
      const player = playerEl?.value.trim() ?? "";
      const otherClub =
        (isIncoming ? tr.querySelector(".tr-from") : tr.querySelector(".tr-to"))?.value.trim() ?? "";
      const fee = tr.querySelector(".tr-fee")?.value.trim() ?? "";
      const dateRaw = tr.querySelector(".tr-date")?.value.trim() ?? "";
      const date = transferDateFromInputValue(dateRaw) || dateRaw || undefined;
      const id =
        tr.getAttribute("data-id")?.trim() ||
        `${leagueFilter}_${dir}_${FCDataStore.slugify(player || "row")}_${i}`;
      return {
        id,
        player,
        club: clubName,
        otherClub,
        fee: fee || undefined,
        date,
      };
    })
    .filter((t) => t.player && t.club);
}

function bindTransfers() {
  $("#transferTeamFilter")?.addEventListener("change", (e) => {
    transferTeamFilter = e.target.value;
    renderPanel();
  });

  for (const section of ADMIN_TRANSFER_SECTIONS) {
    $(`#${section.btnId}`)?.addEventListener("click", () => {
      const tbody = $(`#${section.tableId} tbody`);
      if (!tbody || !transferTeamFilter) return toast("Choose a club first");
      const i = tbody.querySelectorAll("tr").length;
      tbody.insertAdjacentHTML(
        "beforeend",
        transferTableRowHtml(section.key, transferTeamFilter, {}, i),
      );
      syncTransferRosterBtn(tbody.lastElementChild, transferTeamFilter, section.key);
    });
  }

  $("#btnSaveTransfers")?.addEventListener("click", () => {
    if (!transferTeamFilter) return toast("Choose a club first");
    const teamName = state().teams.find((t) => t.id === transferTeamFilter)?.name ?? "";
    const teamLists = {};
    for (const section of ADMIN_TRANSFER_SECTIONS) {
      teamLists[section.key] = readTransfersTable(`#${section.tableId}`, section.key, teamName);
    }
    const merged = mergeTeamTransfersIntoLeague(leagueFilter, transferTeamFilter, teamLists);
    FCDataStore.setTransfers(leagueFilter, merged);
    syncToAppArrays();
    toast(`Transfers saved for ${teamName}`);
  });

  bindTransferTableHandlers();
}

function bindTransferTableHandlers() {
  bindTransferDel();
  bindTransferRosterActions();
}

function setLoginError(msg) {
  const el = $("#loginError");
  const card = $("#loginCard");
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.classList.remove("admin-hidden");
    card?.classList.add("login-shake");
    setTimeout(() => card?.classList.remove("login-shake"), 500);
  } else {
    el.textContent = "";
    el.classList.add("admin-hidden");
  }
}

function tryLogin() {
  setLoginError("");
  if (typeof FCDataStore === "undefined") {
    setLoginError("Data store failed to load. Refresh the page.");
    return;
  }
  if (!FCDataStore.getState()) {
    setLoginError("Squad data is still loading. Wait a few seconds.");
    return;
  }
  const pin = ($("#pinInput")?.value ?? "").trim();
  const btn = $("#loginBtn");
  btn?.classList.add("is-loading");
  btn?.querySelector(".login-submit-text") &&
    (btn.querySelector(".login-submit-text").textContent = "Signing in…");

  window.setTimeout(() => {
    if (FCDataStore.login(pin)) {
      showLogin(false);
      renderNav();
      renderPanel();
      toast("Signed in");
    } else {
      setLoginError(`Incorrect PIN. Try "${FCDataStore.DEFAULT_PIN}" or your custom PIN.`);
      $("#pinInput")?.focus();
    }
    btn?.classList.remove("is-loading");
    const label = btn?.querySelector(".login-submit-text");
    if (label) label.textContent = "Sign in";
  }, 280);
}

function initAuth() {
  const loginBtn = $("#loginBtn");
  const pinInput = $("#pinInput");
  if (!loginBtn) {
    console.error("Admin: #loginBtn not found");
    return;
  }
  loginBtn.addEventListener("click", tryLogin);
  pinInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryLogin();
    }
  });
  pinInput?.addEventListener("input", () => setLoginError(""));

  $("#pinToggle")?.addEventListener("click", () => {
    if (!pinInput) return;
    const show = pinInput.type === "password";
    pinInput.type = show ? "text" : "password";
    const toggle = $("#pinToggle");
    toggle?.querySelector(".ico-show")?.classList.toggle("admin-hidden", show);
    toggle?.querySelector(".ico-hide")?.classList.toggle("admin-hidden", !show);
    toggle?.setAttribute("aria-label", show ? "Hide PIN" : "Show PIN");
  });

  $("#fillDefaultPin")?.addEventListener("click", () => {
    if (pinInput && typeof FCDataStore !== "undefined") {
      pinInput.value = FCDataStore.DEFAULT_PIN;
      pinInput.focus();
      setLoginError("");
    }
  });

  if ($("#loginView") && !$("#loginView").classList.contains("admin-hidden")) {
    window.setTimeout(() => pinInput?.focus(), 400);
  }
  $("#logoutBtn")?.addEventListener("click", () => {
    FCDataStore.logout();
    showLogin(true);
    toast("Logged out");
  });
}

function finishBoot() {
  setSeedLoading(false);
  initAuth();
  bindAdminNavScroll();
  if (FCDataStore.isAuthed()) {
    showLogin(false);
    renderNav();
    renderPanel();
  } else {
    showLogin(true);
  }
}

function boot(attempt = 0) {
  if (typeof FCDataStore === "undefined") {
    setSeedLoading(true);
    if (attempt < 40) setTimeout(() => boot(attempt + 1), 250);
    else alert("Could not load data-store.js — run serve.bat and open the URL it shows.");
    return;
  }

  if (window.__FC_SEED_READY__ && FCDataStore.getState()) {
    finishBoot();
    return;
  }

  setSeedLoading(true);
  if (attempt === 0) {
    document.addEventListener("fc-data-ready", () => finishBoot(), { once: true });
  }
  if (attempt < 240) setTimeout(() => boot(attempt + 1), 250);
  else {
    setSeedLoading(false);
    alert("app.js did not finish loading. Press F12 → Console, copy any red errors, and refresh.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
})();
