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
/** @type {{ tmPlayers: object[], diff: object, clubId: number } | null} */
let tmSyncState = null;
let squadDepthTeamFilter = "";
let nationalDutyTeamFilter = "";
let transferTeamFilter = "";
/** Unsaved per-club transfer rows (key: leagueId|teamId) — never written to store until Save. */
const transferEditsByTeam = new Map();
const currentSeasonStartYear = () => {
  const now = new Date();
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
};
let tmTransferSeason = currentSeasonStartYear();
/** @type {{ tmLists: object, diff: object, clubId: number, season: number, ignoredAdd: Set<string>, ignoredRemove: Set<string>, ignoredUpdate: Set<string>, ignoredMove: Set<string> } | null} */
let tmTransferSyncState = null;
/** Filter for Transfermarkt transfer suggestions (add / sync / remove lists). */
let tmTransferSearchQuery = "";
/** Prefill for + Squad after Transfermarkt Add — key: normalizeNameKey(player). */
const tmTransferSquadPrefillByName = new Map();
let matchEditId = "";
let stadiumEditName = "";
/** @type {{ leagueId: string, diff: object, tmByTeamId: object, ignoredAdd: Set<string>, ignoredLink: Set<string>, ignoredRename: Set<string>, ignoredRemove: Set<string> } | null} */
let tmStadiumSyncState = null;
let tmMatchdaySeason = currentSeasonStartYear();
/** @type {{ leagueId: string, matchweek: number, season: number, tmFixtures: object[], diff: object, ignoredAdd: Set<string>, ignoredUpdate: Set<string>, ignoredRemove: Set<string> } | null} */
let tmMatchdaySyncState = null;
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
  return state().teams.filter((t) => t.leagueId === leagueId).sort(compareTeamOrder);
}

function compareTeamOrder(a, b) {
  const ao = a.sortOrder ?? 1e9;
  const bo = b.sortOrder ?? 1e9;
  if (ao !== bo) return ao - bo;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
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
  return [p.number, p.name, p.displayLastName, p.pos, p.role, p.nationality, p.club]
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

function squadPositionBreakdown(players) {
  const counts = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const p of players) {
    const pos = String(p.pos ?? "").trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(counts, pos)) counts[pos]++;
  }
  return counts;
}

function adminTeamCrestHtml(team) {
  if (!team) {
    return `<span class="players-team-crest players-team-crest--empty" aria-hidden="true">?</span>`;
  }
  const logo = team.logo ? String(team.logo).trim() : "";
  if (logo) {
    return `<span class="players-team-crest" aria-hidden="true"><img src="${esc(logo)}" alt="" width="48" height="48" loading="lazy" decoding="async" /></span>`;
  }
  const initials = String(team.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `<span class="players-team-crest players-team-crest--fallback" aria-hidden="true">${esc(initials)}</span>`;
}

function playerRosterCardHtml(p, isWorldCup) {
  const clubMeta =
    isWorldCup && p.club
      ? `<span class="player-roster-club">${esc(p.club)}</span>`
      : "";
  const posKey = String(p.pos ?? "").trim().toUpperCase();
  const posClass =
    posKey === "GK"
      ? "player-roster-card--gk"
      : posKey === "DF"
        ? "player-roster-card--df"
        : posKey === "MF"
          ? "player-roster-card--mf"
          : posKey === "FW"
            ? "player-roster-card--fw"
            : "";
  const metaParts = [
    `<span class="player-roster-pos player-roster-pos--${esc(posKey.toLowerCase() || "na")}">${esc(p.pos)}</span>`,
    `<span class="player-roster-role">${esc(p.role ?? "")}</span>`,
    p.displayLastName
      ? `<span class="player-roster-pitch-label" title="Pitch label">Pitch: ${esc(p.displayLastName)}</span>`
      : "",
    clubMeta,
  ].filter(Boolean);
  const capBadge = rosterPlayerIsCaptain(p)
    ? `<span class="player-roster-cap" title="Club captain">C</span>`
    : "";
  const flag = p.flag ? `<span class="player-roster-flag" aria-hidden="true">${esc(p.flag)}</span>` : "";
  return `<article class="player-roster-card player-sort-row ${posClass}" draggable="true" data-player-id="${esc(p.id)}" data-search="${esc(adminPlayerSearchHaystack(p))}">
    <span class="player-drag-handle" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span>
    <div class="player-roster-body">
      <div class="player-roster-line">
        <span class="player-roster-num">${esc(p.number)}</span>
        <div class="player-roster-copy">
          <div class="admin-player-name-inner">
            ${flag}<strong class="admin-player-name">${esc(stripCaptainSuffix(p.name))}</strong>${capBadge}${adminPlayerInstagramBadge(p)}
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
        <div class="overview-hero__atmosphere" aria-hidden="true">
          <div class="overview-hero__glow"></div>
          <div class="overview-hero__pitch"></div>
          <div class="overview-hero__markings"></div>
        </div>
        <div class="overview-hero__grid">
          <div class="overview-hero__copy">
            <p class="overview-eyebrow">Matchday control room</p>
            <h2 class="overview-heading">Overview</h2>
            <p class="overview-lead">${storageNote} Publish live with <strong>Firebase</strong> or commit <code>data.json</code> to GitHub.</p>
            <nav class="overview-quicknav" aria-label="Jump to admin section">
              <button type="button" class="overview-quicknav__btn" data-overview-tab="teams">Teams</button>
              <button type="button" class="overview-quicknav__btn" data-overview-tab="players">Players</button>
              <button type="button" class="overview-quicknav__btn" data-overview-tab="matches">Matches</button>
              <button type="button" class="overview-quicknav__btn" data-overview-tab="transfers">Transfers</button>
              <button type="button" class="overview-quicknav__btn" data-overview-tab="settings">Settings</button>
            </nav>
          </div>
          <aside class="overview-hero__aside">
            <div class="overview-hero-badge">
              <span class="overview-hero-badge-label">Last data revision</span>
              <span class="overview-hero-badge-value">${esc(String(rev))}</span>
            </div>
            <div class="overview-status-row">
              <span class="overview-status-chip overview-status-chip--local">Local storage active</span>
              <span class="overview-status-chip overview-status-chip--firebase${firebaseSignedIn ? " is-live" : ""}">${esc(firebaseSignedIn ? "Firebase connected" : "Firebase offline")}</span>
            </div>
          </aside>
        </div>
      </header>

      <div class="row g-2 g-md-3 overview-stats">
        <div class="col-6 col-xl-3">
          <article class="overview-stat overview-stat--teams h-100">
            <span class="overview-stat-icon overview-stat-icon--teams" aria-hidden="true"></span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.teams.length}</span>
              <span class="overview-stat-label">Teams</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-xl-3">
          <article class="overview-stat overview-stat--players h-100">
            <span class="overview-stat-icon overview-stat-icon--players" aria-hidden="true"></span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.players.length}</span>
              <span class="overview-stat-label">Players</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-xl-3">
          <article class="overview-stat overview-stat--matches h-100">
            <span class="overview-stat-icon overview-stat-icon--matches" aria-hidden="true"></span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${s.matches.length}</span>
              <span class="overview-stat-label">Matches</span>
            </div>
          </article>
        </div>
        <div class="col-6 col-xl-3">
          <article class="overview-stat overview-stat--leagues h-100">
            <span class="overview-stat-icon overview-stat-icon--leagues" aria-hidden="true"></span>
            <div class="overview-stat-body">
              <span class="overview-stat-num">${leagueCount}</span>
              <span class="overview-stat-label">Leagues active</span>
            </div>
          </article>
        </div>
      </div>

      <div class="overview-layout">
        <section class="overview-card overview-publish">
          <div class="overview-card__stripe" aria-hidden="true"></div>
          <div class="overview-card-head">
            <div class="overview-card-head__icon overview-card-head__icon--github" aria-hidden="true"></div>
            <div>
              <h3>Publish to GitHub</h3>
              <p>Visitors load <code>data.json</code> from your repo — not <code>app.js</code>.</p>
            </div>
          </div>
          <ol class="overview-steps">
            <li><span class="overview-step-n">1</span><span>Edit squads, matchweek &amp; transfers in admin tabs</span></li>
            <li><span class="overview-step-n">2</span><span>Download <strong>data.json</strong> below</span></li>
            <li><span class="overview-step-n">3</span><span>Upload or <code>git push</code> to SquadCentral repo</span></li>
            <li><span class="overview-step-n">4</span><span>Wait 2–5 min · test live site in Incognito</span></li>
          </ol>
          <a class="overview-doc-link" href="./DATA.md" target="_blank" rel="noopener">Read DATA.md guide →</a>
        </section>

        <section class="overview-card overview-publish overview-publish--firebase" id="firebasePublishCard">
          <div class="overview-card__stripe overview-card__stripe--firebase" aria-hidden="true"></div>
          <div class="overview-card-head">
            <div class="overview-card-head__icon overview-card-head__icon--cloud" aria-hidden="true"></div>
            <div>
              <h3>Publish to Firebase</h3>
              <p>Push live data to Firestore — visitors sync instantly without a git deploy.</p>
            </div>
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
                <span class="overview-action-icon overview-action-icon--cloud" aria-hidden="true"></span>
                <span class="overview-action-text">
                  <strong>Publish live to Firebase</strong>
                  <small>Updates Firestore published/site</small>
                </span>
              </button>
            </div>
            <div class="col-12 col-md-6">
              <button type="button" class="overview-action w-100" id="btnFirebaseSignOut">
                <span class="overview-action-icon overview-action-icon--signout" aria-hidden="true"></span>
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

        <section class="overview-card overview-data">
          <div class="overview-card__stripe overview-card__stripe--data" aria-hidden="true"></div>
          <div class="overview-card-head">
            <div class="overview-card-head__icon overview-card-head__icon--data" aria-hidden="true"></div>
            <div>
              <h3>Data actions</h3>
              <p>Export, import, or reset your local copy.</p>
            </div>
          </div>
          <div class="row g-2 overview-actions">
            <div class="col-12 col-md-6">
              <button type="button" class="overview-action overview-action--primary w-100" id="btnExport">
                <span class="overview-action-icon overview-action-icon--download" aria-hidden="true"></span>
                <span class="overview-action-text">
                  <strong>Download data.json</strong>
                  <small>For GitHub Pages &amp; backup</small>
                </span>
              </button>
            </div>
            <div class="col-12 col-md-6">
              <button type="button" class="overview-action w-100" id="btnExportCopy">
                <span class="overview-action-icon overview-action-icon--copy" aria-hidden="true"></span>
                <span class="overview-action-text">
                  <strong>Copy JSON</strong>
                  <small>Paste into data.json manually</small>
                </span>
              </button>
            </div>
            <div class="col-12 col-md-6">
              <button type="button" class="overview-action w-100" id="btnImport">
                <span class="overview-action-icon overview-action-icon--upload" aria-hidden="true"></span>
                <span class="overview-action-text">
                  <strong>Import JSON</strong>
                  <small>Restore from a backup file</small>
                </span>
              </button>
            </div>
            <div class="col-12 col-md-6">
              <button type="button" class="overview-action overview-action--danger w-100" id="btnReset">
                <span class="overview-action-icon overview-action-icon--reset" aria-hidden="true"></span>
                <span class="overview-action-text">
                  <strong>Reset to published seed</strong>
                  <small>Clears local overrides</small>
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>

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

function clearTmSyncState() {
  tmSyncState = null;
}

function tmSyncNameKey(name) {
  return typeof TransfermarktSync !== "undefined"
    ? TransfermarktSync.normalizeNameKey(name)
    : String(name ?? "")
        .toLowerCase()
        .trim();
}

function getTmSyncVisibleDiff() {
  if (!tmSyncState?.diff) return null;
  const ignoreAdd = tmSyncState.ignoredAdd ?? new Set();
  const ignoreRemove = tmSyncState.ignoredRemove ?? new Set();
  const ignoreUpdate = tmSyncState.ignoredUpdate ?? new Set();
  const toAdd = tmSyncState.diff.toAdd.filter((tm) => !ignoreAdd.has(tmSyncNameKey(tm.name)));
  const toRemove = tmSyncState.diff.toRemove.filter((p) => !ignoreRemove.has(p.id));
  const toUpdate = (tmSyncState.diff.toUpdate ?? []).filter(
    (row) => !ignoreUpdate.has(row.local?.id),
  );
  return { ...tmSyncState.diff, toAdd, toRemove, toUpdate };
}

function tmSyncAvailableForTeam(team) {
  return typeof TransfermarktTeams !== "undefined" && TransfermarktTeams.hasMapping(team);
}

function tmSyncLocalProxyReady() {
  return typeof TransfermarktSync !== "undefined" && TransfermarktSync.isLocalProxyHost?.();
}

function looksLikeHtmlToast(msg) {
  const s = String(msg ?? "").trim().slice(0, 80).toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head");
}

function tmUrlValueForTeam(team) {
  if (!team) return "";
  if (team.transfermarktUrl) return String(team.transfermarktUrl);
  const id = typeof TransfermarktTeams !== "undefined" ? TransfermarktTeams.clubIdForTeam(team) : null;
  return id ? `https://www.transfermarkt.com/-/startseite/verein/${id}` : "";
}

function saveTeamTransfermarktLink(team, urlRaw) {
  if (!team?.id) return { ok: false, message: "Select a team first" };
  if (typeof TransfermarktTeams === "undefined") {
    return { ok: false, message: "Transfermarkt module failed to load" };
  }
  const stored = state().teams.find((t) => t.id === team.id);
  if (!stored) return { ok: false, message: "Team not found" };
  const url = String(urlRaw ?? "").trim();
  if (!url) {
    delete stored.transfermarktUrl;
    delete stored.transfermarktId;
    FCDataStore.upsertTeam(stored);
    syncToAppArrays();
    return { ok: true, message: "Custom Transfermarkt link cleared", clubId: null };
  }
  const clubId = TransfermarktTeams.parseClubIdFromUrl(url);
  if (!clubId) {
    return {
      ok: false,
      message: "Paste a Transfermarkt club URL that contains /verein/123 (or just the club id number)",
    };
  }
  stored.transfermarktUrl = url;
  stored.transfermarktId = clubId;
  FCDataStore.upsertTeam(stored);
  syncToAppArrays();
  return { ok: true, message: `Saved Transfermarkt club #${clubId}`, clubId };
}

function tmSyncUpdateMeta(row) {
  const tm = row?.tm ?? {};
  const changes = (row?.changes ?? []).join(", ");
  return [
    tm.number != null ? `#${tm.number}` : "No #",
    tm.role || tm.pos || "",
    tm.nationality || "",
    changes ? `update ${changes}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function tmSyncStatusHtml(team, teamId) {
  if (!teamId || !team) {
    return `<span class="players-tm-sync__hint admin-muted">Select a team to compare with Transfermarkt.</span>`;
  }
  if (!tmSyncAvailableForTeam(team)) {
    return `<span class="players-tm-sync__hint admin-muted">Paste a Transfermarkt club link below (page with <code>/verein/…</code>), then Save link.</span>`;
  }
  if (!tmSyncLocalProxyReady()) {
    return `<span class="players-tm-sync__hint admin-muted">Use <strong>serve.bat</strong> on your computer for Transfermarkt Refresh — it cannot run on phone / GitHub Pages.</span>`;
  }
  if (!tmSyncState) {
    return `<span class="players-tm-sync__hint admin-muted">Compare your squad with Transfermarkt and apply add/remove/sync suggestions.</span>`;
  }
  const diff = getTmSyncVisibleDiff() ?? tmSyncState.diff;
  const parts = [
    `${diff.tmTotal} on Transfermarkt`,
    `${diff.localTotal} in Squad Central`,
    `${diff.matched} matched`,
  ];
  if (diff.toAdd.length) parts.push(`${diff.toAdd.length} to add`);
  if (diff.toRemove.length) parts.push(`${diff.toRemove.length} to remove`);
  if ((diff.toUpdate ?? []).length) parts.push(`${diff.toUpdate.length} details to sync`);
  const ignored =
    (tmSyncState.ignoredAdd?.size ?? 0) +
    (tmSyncState.ignoredRemove?.size ?? 0) +
    (tmSyncState.ignoredUpdate?.size ?? 0);
  if (ignored) parts.push(`${ignored} ignored`);
  return `<span class="players-tm-sync__hint">${esc(parts.join(" · "))}</span>`;
}

function tmSyncPanelHtml(team, teamId) {
  if (!teamId || !team) return "";

  const diff = getTmSyncVisibleDiff();
  const hasDiff =
    diff && (diff.toAdd.length || diff.toRemove.length || (diff.toUpdate ?? []).length);
  const emptyMsg =
    tmSyncState && !hasDiff
      ? `<p class="players-tm-sync__empty admin-muted mb-0">${
          (tmSyncState.ignoredAdd?.size ?? 0) +
          (tmSyncState.ignoredRemove?.size ?? 0) +
          (tmSyncState.ignoredUpdate?.size ?? 0)
            ? "No open suggestions — ignored items are hidden until you refresh."
            : "Squad matches Transfermarkt — no changes suggested."
        }</p>`
      : "";

  const addRows =
    diff?.toAdd
      .map(
        (tm) => {
          const key = tmSyncNameKey(tm.name);
          return `<li class="players-tm-sync__item players-tm-sync__item--add">
        <div class="players-tm-sync__copy">
          <strong>${esc(tm.name)}</strong>
          <span class="players-tm-sync__meta">${tm.number != null ? `#${esc(tm.number)}` : "No #"} · ${esc(tm.role)} · ${esc(tm.nationality || "—")}</span>
        </div>
        <div class="players-tm-sync__actions">
          <button type="button" class="mw-btn-primary players-tm-sync__apply" data-tm-add-key="${esc(key)}">Add</button>
          <button type="button" class="players-tm-sync__dismiss" data-tm-ignore-add="${esc(key)}" title="Ignore" aria-label="Ignore add suggestion">×</button>
        </div>
      </li>`;
        },
      )
      .join("") ?? "";

  const removeRows =
    diff?.toRemove
      .map(
        (p) => `<li class="players-tm-sync__item players-tm-sync__item--remove">
        <div class="players-tm-sync__copy">
          <strong>${esc(stripCaptainSuffix(p.name))}</strong>
          <span class="players-tm-sync__meta">#${esc(p.number)} · ${esc(p.role ?? p.pos)}</span>
        </div>
        <div class="players-tm-sync__actions">
          <button type="button" class="mw-btn-danger players-tm-sync__apply" data-tm-remove="${esc(p.id)}">Remove</button>
          <button type="button" class="players-tm-sync__dismiss" data-tm-ignore-remove="${esc(p.id)}" title="Ignore" aria-label="Ignore remove suggestion">×</button>
        </div>
      </li>`,
      )
      .join("") ?? "";

  const updateRows =
    (diff?.toUpdate ?? [])
      .map(
        (row) => `<li class="players-tm-sync__item players-tm-sync__item--update">
        <div class="players-tm-sync__copy">
          <strong>${esc(stripCaptainSuffix(row.local.name))}</strong>
          <span class="players-tm-sync__meta">${esc(tmSyncUpdateMeta(row))}</span>
        </div>
        <div class="players-tm-sync__actions">
          <button type="button" class="mw-btn-ghost players-tm-sync__apply" data-tm-sync-id="${esc(row.local.id)}">Sync</button>
          <button type="button" class="players-tm-sync__dismiss" data-tm-ignore-update="${esc(row.local.id)}" title="Ignore" aria-label="Ignore detail sync">×</button>
        </div>
      </li>`,
      )
      .join("") ?? "";

  const localReady = tmSyncLocalProxyReady();
  const canRefresh = localReady && tmSyncAvailableForTeam(team);
  const savedUrl = esc(tmUrlValueForTeam(team));
  const bulkBar =
    hasDiff
      ? `<div class="players-tm-sync__bulk">
          ${diff.toAdd.length ? `<button type="button" class="mw-btn-primary players-auto-btn" id="btnTmAddAll">Add all (${diff.toAdd.length})</button>` : ""}
          ${(diff.toUpdate ?? []).length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmSyncAll">Sync details (${diff.toUpdate.length})</button>` : ""}
          ${diff.toRemove.length ? `<button type="button" class="mw-btn-danger players-auto-btn" id="btnTmRemoveAll">Remove all (${diff.toRemove.length})</button>` : ""}
        </div>`
      : "";

  return `
    <div class="players-tm-sync" id="playersTmSync">
      <div class="players-tm-sync__link-row">
        <div class="mw-field players-tm-sync__link-field">
          <label for="teamTmUrl">Transfermarkt club link</label>
          <input id="teamTmUrl" class="mw-input" type="url" inputmode="url" placeholder="https://www.transfermarkt.com/…/verein/11" value="${savedUrl}" autocomplete="off" />
        </div>
        <button type="button" class="mw-btn-ghost players-auto-btn" id="btnSaveTmUrl">Save link</button>
      </div>
      <div class="players-tm-sync__head">
        <div class="players-toolbar-actions">
          <button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmRefresh"${canRefresh ? "" : " disabled"} title="${canRefresh ? "Fetch Transfermarkt squad" : localReady ? "Save a valid Transfermarkt link first" : "Only available via serve.bat on your computer"}">Refresh from Transfermarkt</button>
        </div>
        <span class="players-tm-sync__status" id="playersTmSyncStatus">${tmSyncStatusHtml(team, teamId)}</span>
      </div>
      ${bulkBar}
      <div class="players-tm-sync__body${hasDiff || emptyMsg ? "" : " admin-hidden"}" id="playersTmSyncBody">
        ${
          hasDiff
            ? `<div class="players-tm-sync__cols${(diff.toUpdate ?? []).length ? " players-tm-sync__cols--3" : ""}">
          <div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">On Transfermarkt — add to squad</h4>
            <ul class="players-tm-sync__list">${addRows || `<li class="players-tm-sync__none admin-muted">None</li>`}</ul>
          </div>
          ${
            (diff.toUpdate ?? []).length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Matched — sync details</h4>
            <ul class="players-tm-sync__list">${updateRows || `<li class="players-tm-sync__none admin-muted">None</li>`}</ul>
          </div>`
              : ""
          }
          <div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Not on Transfermarkt — remove from squad</h4>
            <ul class="players-tm-sync__list">${removeRows || `<li class="players-tm-sync__none admin-muted">None</li>`}</ul>
          </div>
        </div>`
            : emptyMsg
        }
      </div>
    </div>`;
}

function nextFreeJerseyNumber(teamId, excludePlayerId = null) {
  const used = new Set(
    playersForTeam(teamId)
      .filter((p) => p.id !== excludePlayerId)
      .map((p) => Number(p.number))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  for (let n = 1; n <= 99; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

function rosterPlayerByLooseName(teamId, name) {
  const exact = rosterPlayerByName(teamId, name);
  if (exact) return exact;
  if (!teamId || !name || typeof TransfermarktSync === "undefined") return null;
  return (
    playersForTeam(teamId).find((p) => TransfermarktSync.namesLooselyMatch?.(p.name, name)) ?? null
  );
}

function addPlayerFromTransfermarkt(teamId, tmPlayer, { quiet = false } = {}) {
  const raw = stripCaptainSuffix(String(tmPlayer?.name ?? "").trim());
  const name =
    typeof TransfermarktSync !== "undefined" && TransfermarktSync.toAsciiName
      ? TransfermarktSync.toAsciiName(raw)
      : raw;
  if (!teamId || !name) return null;
  if (rosterPlayerByLooseName(teamId, name)) {
    if (!quiet) toast("Player is already on the squad (close name match)");
    return null;
  }
  let number = Number(tmPlayer.number);
  let reassigned = false;
  if (!Number.isFinite(number) || number < 1) {
    number = nextFreeJerseyNumber(teamId);
    reassigned = true;
  } else if (playersForTeam(teamId).some((p) => Number(p.number) === number)) {
    number = nextFreeJerseyNumber(teamId);
    reassigned = true;
  }
  if (number == null) {
    if (!quiet) toast("No free jersey number left (1–99) — set one manually");
    return null;
  }
  const pos = String(tmPlayer.pos ?? "MF").trim().toUpperCase();
  const role = String(tmPlayer.role ?? "CM").trim().toUpperCase();
  const nationality = String(tmPlayer.nationality ?? "").trim();
  let flag = "";
  if (typeof NationalityFlags !== "undefined" && nationality) {
    flag = NationalityFlags.getFlag(nationality) || "";
  }
  const maxOrder = playersForTeam(teamId).reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  FCDataStore.upsertPlayer({
    id: FCDataStore.makePlayerId(teamId, number, name),
    teamId,
    number,
    name,
    pos: ["GK", "DF", "MF", "FW"].includes(pos) ? pos : "MF",
    role: role || "CM",
    flag,
    nationality,
    sortOrder: maxOrder + 1,
  });
  syncToAppArrays();
  return { number, reassigned, name };
}

function syncPlayerDetailsFromTransfermarkt(teamId, updateRow, { quiet = false } = {}) {
  const local = updateRow?.local;
  const tm = updateRow?.tm;
  if (!teamId || !local?.id || !tm) return { ok: false, skippedNumber: false };
  const live = state().players.find((p) => p.id === local.id);
  if (!live || live.teamId !== teamId) return { ok: false, skippedNumber: false };

  const next = { ...live };
  let skippedNumber = false;
  const tmNumber = Number(tm.number);
  if (Number.isFinite(tmNumber) && tmNumber > 0 && Number(live.number) !== tmNumber) {
    const taken = playersForTeam(teamId).some(
      (p) => p.id !== live.id && Number(p.number) === tmNumber,
    );
    if (taken) skippedNumber = true;
    else next.number = tmNumber;
  }
  const pos = String(tm.pos ?? "").trim().toUpperCase();
  if (["GK", "DF", "MF", "FW"].includes(pos)) next.pos = pos;
  const role = String(tm.role ?? "").trim().toUpperCase();
  if (role) next.role = role;
  const nationality = String(tm.nationality ?? "").trim();
  if (nationality) {
    next.nationality = nationality;
    if (typeof NationalityFlags !== "undefined") {
      next.flag = NationalityFlags.getFlag(nationality) || next.flag || "";
    }
  }
  FCDataStore.upsertPlayer(next);
  syncToAppArrays();
  if (!quiet && skippedNumber) {
    toast(`Synced ${stripCaptainSuffix(live.name)} — jersey #${tmNumber} already used, number left unchanged`);
  }
  return { ok: true, skippedNumber, name: stripCaptainSuffix(live.name) };
}

function recalculateTmSquadDiff(teamId) {
  if (!tmSyncState || typeof TransfermarktSync === "undefined") return;
  const local = playersForTeam(teamId);
  tmSyncState.diff = TransfermarktSync.compareSquads(local, tmSyncState.tmPlayers);
}

async function refreshTransfermarktSquad(team) {
  if (!team) {
    toast("Select a team first");
    return;
  }
  if (typeof TransfermarktSync === "undefined" || typeof TransfermarktTeams === "undefined") {
    toast("Transfermarkt sync module failed to load");
    return;
  }
  const liveTeam = state().teams.find((t) => t.id === team.id) || team;
  const clubId = TransfermarktTeams.clubIdForTeam(liveTeam);
  if (!clubId) {
    toast("Paste and save a Transfermarkt club link first");
    return;
  }
  if (!tmSyncLocalProxyReady()) {
    toast("Run serve.bat locally — Transfermarkt sync needs the local server proxy");
    return;
  }
  const btn = $("#btnTmRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Refreshing…";
  }
  try {
    const local = playersForTeam(liveTeam.id);
    const result = await TransfermarktSync.fetchAndCompare(local, clubId);
    tmSyncState = {
      ...result,
      clubId,
      ignoredAdd: new Set(),
      ignoredRemove: new Set(),
      ignoredUpdate: new Set(),
    };
    const visible = getTmSyncVisibleDiff();
    const updateCount = visible.toUpdate?.length ?? 0;
    toast(
      visible.toAdd.length || visible.toRemove.length || updateCount
        ? `Transfermarkt: ${visible.toAdd.length} to add, ${updateCount} to sync, ${visible.toRemove.length} to remove`
        : "Squad matches Transfermarkt",
    );
    renderPanel();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message ?? err);
    if (looksLikeHtmlToast(msg)) {
      toast("Transfermarkt Refresh only works with serve.bat on your computer");
    } else if (/failed to fetch|networkerror/i.test(msg)) {
      toast("Run serve.bat locally — Transfermarkt sync needs the local server proxy");
    } else {
      toast(msg.slice(0, 160));
    }
  } finally {
    if (btn) {
      const still =
        tmSyncLocalProxyReady() &&
        tmSyncAvailableForTeam(state().teams.find((t) => t.id === team.id) || team);
      btn.disabled = !still;
      btn.textContent = "Refresh from Transfermarkt";
    }
  }
}

function applyTransfermarktSuggestion(teamId, { addKey = null, removeId = null, syncId = null } = {}) {
  if (!teamId || !tmSyncState?.diff) return;
  if (addKey) {
    const tm = tmSyncState.diff.toAdd.find((t) => tmSyncNameKey(t.name) === addKey);
    if (!tm) return;
    const added = addPlayerFromTransfermarkt(teamId, tm);
    if (!added) return;
    toast(
      added.reassigned
        ? `${added.name} added as #${added.number}`
        : `${added.name} added`,
    );
  } else if (removeId) {
    if (!confirm("Remove this player from the squad?")) return;
    FCDataStore.removePlayer(removeId);
    syncToAppArrays();
    toast("Player removed");
  } else if (syncId) {
    const row = (tmSyncState.diff.toUpdate ?? []).find((u) => u.local?.id === syncId);
    if (!row) return;
    const result = syncPlayerDetailsFromTransfermarkt(teamId, row);
    if (!result.ok) return;
    if (!result.skippedNumber) toast(`${result.name} details synced`);
  } else {
    return;
  }
  recalculateTmSquadDiff(teamId);
  renderPanel();
}

function applyAllTransfermarktAdds(teamId) {
  const diff = getTmSyncVisibleDiff();
  if (!teamId || !diff?.toAdd?.length) return;
  let added = 0;
  let reassigned = 0;
  let failed = 0;
  for (const tm of [...diff.toAdd]) {
    const result = addPlayerFromTransfermarkt(teamId, tm, { quiet: true });
    if (!result) {
      failed += 1;
      continue;
    }
    added += 1;
    if (result.reassigned) reassigned += 1;
  }
  recalculateTmSquadDiff(teamId);
  const bits = [`Added ${added}`];
  if (reassigned) bits.push(`${reassigned} got a free jersey #`);
  if (failed) bits.push(`${failed} skipped`);
  toast(bits.join(" · "));
  renderPanel();
}

function applyAllTransfermarktRemoves(teamId) {
  const diff = getTmSyncVisibleDiff();
  if (!teamId || !diff?.toRemove?.length) return;
  if (
    !confirm(
      `Remove ${diff.toRemove.length} player${diff.toRemove.length === 1 ? "" : "s"} not on Transfermarkt from this squad?`,
    )
  ) {
    return;
  }
  for (const p of [...diff.toRemove]) {
    FCDataStore.removePlayer(p.id);
  }
  syncToAppArrays();
  recalculateTmSquadDiff(teamId);
  toast(`Removed ${diff.toRemove.length} player${diff.toRemove.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTransfermarktUpdates(teamId) {
  const diff = getTmSyncVisibleDiff();
  if (!teamId || !diff?.toUpdate?.length) return;
  let synced = 0;
  let skippedNumber = 0;
  for (const row of [...diff.toUpdate]) {
    const result = syncPlayerDetailsFromTransfermarkt(teamId, row, { quiet: true });
    if (!result.ok) continue;
    synced += 1;
    if (result.skippedNumber) skippedNumber += 1;
  }
  recalculateTmSquadDiff(teamId);
  const bits = [`Synced ${synced}`];
  if (skippedNumber) bits.push(`${skippedNumber} jersey # left unchanged (already used)`);
  toast(bits.join(" · "));
  renderPanel();
}

function ignoreTransfermarktSuggestion({
  addKey = null,
  removeId = null,
  updateId = null,
} = {}) {
  if (!tmSyncState) return;
  if (!tmSyncState.ignoredAdd) tmSyncState.ignoredAdd = new Set();
  if (!tmSyncState.ignoredRemove) tmSyncState.ignoredRemove = new Set();
  if (!tmSyncState.ignoredUpdate) tmSyncState.ignoredUpdate = new Set();
  if (addKey) tmSyncState.ignoredAdd.add(addKey);
  if (removeId) tmSyncState.ignoredRemove.add(removeId);
  if (updateId) tmSyncState.ignoredUpdate.add(updateId);
  toast("Suggestion ignored");
  renderPanel();
}

function bindTransfermarktSync(team) {
  $("#btnSaveTmUrl")?.addEventListener("click", () => {
    const result = saveTeamTransfermarktLink(team, $("#teamTmUrl")?.value);
    toast(result.message);
    if (result.ok) {
      tmSyncState = null;
      renderPanel();
    }
  });
  $("#teamTmUrl")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    $("#btnSaveTmUrl")?.click();
  });
  $("#btnTmRefresh")?.addEventListener("click", () => refreshTransfermarktSquad(team));
  $("#btnTmAddAll")?.addEventListener("click", () => applyAllTransfermarktAdds(team?.id));
  $("#btnTmRemoveAll")?.addEventListener("click", () => applyAllTransfermarktRemoves(team?.id));
  $("#btnTmSyncAll")?.addEventListener("click", () => applyAllTransfermarktUpdates(team?.id));
  $("#playersTmSync")?.addEventListener("click", (e) => {
    const addBtn = e.target instanceof Element ? e.target.closest("[data-tm-add-key]") : null;
    if (addBtn) {
      applyTransfermarktSuggestion(team?.id, { addKey: addBtn.getAttribute("data-tm-add-key") });
      return;
    }
    const removeBtn = e.target instanceof Element ? e.target.closest("[data-tm-remove]") : null;
    if (removeBtn && !removeBtn.hasAttribute("data-tm-ignore-remove")) {
      applyTransfermarktSuggestion(team?.id, { removeId: removeBtn.getAttribute("data-tm-remove") });
      return;
    }
    const syncBtn = e.target instanceof Element ? e.target.closest("[data-tm-sync-id]") : null;
    if (syncBtn) {
      applyTransfermarktSuggestion(team?.id, { syncId: syncBtn.getAttribute("data-tm-sync-id") });
      return;
    }
    const ignoreAddBtn = e.target instanceof Element ? e.target.closest("[data-tm-ignore-add]") : null;
    if (ignoreAddBtn) {
      ignoreTransfermarktSuggestion({ addKey: ignoreAddBtn.getAttribute("data-tm-ignore-add") });
      return;
    }
    const ignoreRemoveBtn = e.target instanceof Element ? e.target.closest("[data-tm-ignore-remove]") : null;
    if (ignoreRemoveBtn) {
      ignoreTransfermarktSuggestion({ removeId: ignoreRemoveBtn.getAttribute("data-tm-ignore-remove") });
      return;
    }
    const ignoreUpdateBtn = e.target instanceof Element ? e.target.closest("[data-tm-ignore-update]") : null;
    if (ignoreUpdateBtn) {
      ignoreTransfermarktSuggestion({
        updateId: ignoreUpdateBtn.getAttribute("data-tm-ignore-update"),
      });
    }
  });
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

function rosterPlayerIsCaptain(p) {
  if (!p) return false;
  if (p.captain) return true;
  return playerNameMarksCaptain(p.name);
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
      <div class="matchweek-empty">
        <div class="matchweek-empty__icon" aria-hidden="true"></div>
        <p class="matchweek-empty__title">No fixtures yet</p>
        <p class="matchweek-empty__text">Add matches for this gameweek — they appear in the public Match Center.</p>
        <button type="button" class="mw-btn-primary mw-btn-primary--sm matchweek-empty__btn" id="btnNewMwMatchEmpty">+ Add first fixture</button>
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
          ? `style="background-color:#fff;background-image:url('${esc(logo)}');background-size:68% auto;background-position:center;background-repeat:no-repeat"`
          : 'style="background-color:#fff"';

      return `
        <div class="col-12 col-lg-6">
        <article class="mw-fixture-card h-100${active ? " is-active" : ""}">
          <div class="mw-fixture-card__stripe" aria-hidden="true"></div>
          <div class="mw-fixture-top">
            <span class="mw-fixture-day">${esc(match.time ?? "—")}</span>
            ${active ? '<span class="mw-fixture-editing">Editing</span>' : ""}
          </div>
          <div class="mw-fixture-scoreline">
            <div class="mw-fixture-club home">
              <span class="mw-fixture-crest" ${crestStyle(ht?.logo)} aria-hidden="true"></span>
              <span class="mw-fixture-name">${esc(hName)}</span>
            </div>
            <div class="mw-fixture-result">
              <span class="mw-fixture-goals">${esc(match.score?.[0] ?? 0)}</span>
              <span class="mw-fixture-sep">–</span>
              <span class="mw-fixture-goals">${esc(match.score?.[1] ?? 0)}</span>
            </div>
            <div class="mw-fixture-club away">
              <span class="mw-fixture-crest" ${crestStyle(at?.logo)} aria-hidden="true"></span>
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

function leaguesStats(all) {
  const teamCount = state().teams.length;
  const matchCount = state().matches.length;
  const playerCount = state().players.length;
  return {
    leagues: all.length,
    teams: teamCount,
    matches: matchCount,
    players: playerCount,
  };
}

function leaguesStatChipsHtml(stats) {
  return `<div class="leagues-stat-row" aria-label="Leagues summary">
    <span class="leagues-stat-chip leagues-stat-chip--leagues"><span class="leagues-stat-chip__label">Leagues</span><span class="leagues-stat-chip__val">${stats.leagues}</span></span>
    <span class="leagues-stat-chip leagues-stat-chip--teams"><span class="leagues-stat-chip__label">Teams</span><span class="leagues-stat-chip__val">${stats.teams}</span></span>
    <span class="leagues-stat-chip leagues-stat-chip--matches"><span class="leagues-stat-chip__label">Matches</span><span class="leagues-stat-chip__val">${stats.matches}</span></span>
    <span class="leagues-stat-chip leagues-stat-chip--players"><span class="leagues-stat-chip__label">Players</span><span class="leagues-stat-chip__val">${stats.players}</span></span>
  </div>`;
}

function leaguesEmptyListHtml() {
  return `<div class="leagues-empty-list">
    <p class="leagues-empty-list__text">No leagues yet — create one in the editor below.</p>
  </div>`;
}

function leagueEmblemStyle(ui) {
  const mask =
    typeof LEAGUE_MASKS !== "undefined" && LEAGUE_MASKS[ui.mask]
      ? `--lg-mask:${LEAGUE_MASKS[ui.mask]};`
      : "";
  return `--lg-c1:${ui.c1};--lg-c2:${ui.c2};${mask}`;
}

function leagueCardHtml(l) {
  const lui = leagueUiValue(l.id);
  const teamCount = state().teams.filter((t) => t.leagueId === l.id).length;
  const matchCount = state().matches.filter((m) => m.leagueId === l.id).length;
  const playerCount = state().players.filter((p) => {
    const team = state().teams.find((t) => t.id === p.teamId);
    return team?.leagueId === l.id;
  }).length;
  const isActive = leagueFilter === l.id;
  return `<article class="lg-card${isActive ? " lg-card--active" : ""}" data-league-id="${esc(l.id)}">
    <div class="lg-card__stripe" style="background:linear-gradient(90deg, ${esc(lui.c1)} 0%, ${esc(lui.c2)} 100%)" aria-hidden="true"></div>
    <div class="lg-card__brand">
      <span class="lg-card__emblem" style="${leagueEmblemStyle(lui)}" aria-hidden="true"></span>
      <div class="lg-card__copy">
        <h4 class="lg-card__name">${esc(l.name)}</h4>
        <p class="lg-card__meta">${esc(l.id)} · ${teamCount} team${teamCount === 1 ? "" : "s"}${isActive ? ' · <span class="lg-card__active-tag">Active</span>' : ""}</p>
      </div>
    </div>
    <div class="lg-card__stats">
      <span class="lg-card__stat"><span class="lg-card__stat-val">${matchCount}</span><span class="lg-card__stat-label">Matches</span></span>
      <span class="lg-card__stat"><span class="lg-card__stat-val">${playerCount}</span><span class="lg-card__stat-label">Players</span></span>
    </div>
    <div class="lg-card__actions">
      <button type="button" class="mw-btn-ghost lg-card__edit" data-edit-league="${esc(l.id)}">Edit</button>
      <button type="button" class="mw-btn-danger lg-card__del lg-danger" data-del-league="${esc(l.id)}">Delete</button>
    </div>
  </article>`;
}

function panelLeagues() {
  const all = leagues();
  const editing = !!leagueEditId && all.some((l) => l.id === leagueEditId);
  const editLeague = editing ? all.find((l) => l.id === leagueEditId) : null;
  const ui = leagueUiValue(editing ? leagueEditId : "__new__");
  const maskKeys = typeof LEAGUE_MASKS !== "undefined" ? Object.keys(LEAGUE_MASKS) : ["trophy"];
  const schema = typeof LEAGUE_FEATURE_SCHEMA !== "undefined" ? LEAGUE_FEATURE_SCHEMA : [];
  const stats = leaguesStats(all);

  const featureRefId = editing ? leagueEditId : "__new__";
  const groups = {};
  for (const f of schema) (groups[f.group] ??= []).push(f);
  const featureGroupsHtml = Object.entries(groups)
    .map(
      ([group, items]) => `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="lg-feature-group">
            <p class="lg-feature-group-title">${esc(group)}</p>
            ${items
              .map(
                (f) => `
                  <label class="lg-toggle">
                    <input type="checkbox" class="lg-feature" data-feature="${esc(f.id)}" ${leagueFeatureValue(featureRefId, f.id) ? "checked" : ""} />
                    <span class="lg-toggle__box" aria-hidden="true"></span>
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

  const listBody = all.length
    ? all.map((l) => leagueCardHtml(l)).join("")
    : leaguesEmptyListHtml();

  return `
    <div class="mw-page leagues-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Competitions</p>
            <h2 class="mw-heading">Leagues</h2>
            <p class="mw-lead">Create a league, set its accent and icon, then build its teams, players, and matchweeks. Turn sections and fields on or off per league.</p>
            ${all.length ? leaguesStatChipsHtml(stats) : ""}
          </div>
          <aside class="mw-hero__aside">
            <div class="mw-hero-preview leagues-hero-preview__box">
              <span class="mw-hero-preview-label">Total leagues</span>
              <strong class="mw-hero-preview-title">${all.length}</strong>
              <span class="mw-hero-preview-range">${esc(all.map((l) => l.name).slice(0, 3).join(", "))}${all.length > 3 ? "…" : all.length ? "" : "None yet"}</span>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--leagues" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--leagues" aria-hidden="true"></div>
          <div>
            <h3>All leagues</h3>
            <p>Edit accents and features or remove a league. Deleting also removes its teams, players, fixtures, and all related data.</p>
          </div>
        </div>
        <div class="leagues-list-wrap">
          <div class="leagues-list" id="leaguesList">${listBody}</div>
        </div>
      </section>

      <section class="mw-card mw-card--striped mw-editor leagues-editor is-open" id="leagueEditor">
        <div class="mw-card__stripe mw-card__stripe--leagues" aria-hidden="true"></div>
        <div class="mw-editor-head leagues-editor-head">
          <div class="mw-card-head mw-card-head--icon mb-0">
            <div class="mw-card-head__icon mw-card-head__icon--leagues-edit" aria-hidden="true"></div>
            <div>
              <p class="mw-eyebrow mb-1">${editing ? "Editing league" : "New league"}</p>
              <h3 class="mw-editor-title mb-0">${editing ? esc(editLeague?.name ?? "") : "Add a league"}</h3>
            </div>
          </div>
          ${editing ? `<button type="button" class="mw-btn-ghost leagues-new-btn" id="btnNewLeague">New league</button>` : ""}
        </div>

        <input type="hidden" id="leagueEditId" value="${esc(editing ? leagueEditId : "")}" />

        <div class="mw-editor-section leagues-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">①</span> Identity</h4>
          <p class="mw-section-hint">These colours and the icon style appear on the public site for this competition.</p>
          <div class="lg-identity-preview">
            <span class="lg-identity-preview__emblem" id="lgPreviewEmblem" style="${leagueEmblemStyle(ui)}" aria-hidden="true"></span>
            <div class="lg-identity-preview__copy">
              <strong class="lg-identity-preview__title">${esc(editLeague?.name || "New league preview")}</strong>
              <p class="lg-identity-preview__hint">Live preview of accent gradient and icon mask.</p>
            </div>
          </div>
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

        <div class="mw-editor-section leagues-editor-section">
          <h4 class="mw-section-label"><span class="mw-section-icon">②</span> Sections &amp; fields</h4>
          <p class="mw-section-hint">Uncheck anything you don't want shown on the public site for this league.</p>
          <div class="row g-3">${featureGroupsHtml}</div>
        </div>

        <div class="leagues-form-footer">
          <button type="button" class="mw-btn-primary leagues-save-btn" id="btnSaveLeague">${editing ? "Save league" : "Create league"}</button>
        </div>
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

  const updatePreview = () => {
    const emblem = $("#lgPreviewEmblem");
    if (!emblem) return;
    const c1 = $("#lgC1")?.value || "#2de2e6";
    const c2 = $("#lgC2")?.value || "#7c5cff";
    const mask = $("#lgMask")?.value || "trophy";
    emblem.style.setProperty("--lg-c1", c1);
    emblem.style.setProperty("--lg-c2", c2);
    if (typeof LEAGUE_MASKS !== "undefined" && LEAGUE_MASKS[mask]) {
      emblem.style.setProperty("--lg-mask", LEAGUE_MASKS[mask]);
    }
    const title = emblem.closest(".lg-identity-preview")?.querySelector(".lg-identity-preview__title");
    const name = $("#lgName")?.value.trim();
    if (title && name) title.textContent = name;
  };

  $("#lgC1")?.addEventListener("input", updatePreview);
  $("#lgC2")?.addEventListener("input", updatePreview);
  $("#lgMask")?.addEventListener("change", updatePreview);
  $("#lgName")?.addEventListener("input", updatePreview);

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

function tmMatchdayFixtureKey(row) {
  if (row?.local?.id) return `id:${row.local.id}`;
  if (row?.id) return `id:${row.id}`;
  const home = row?.homeTeamId || row?.tm?.homeTeamId || "";
  const away = row?.awayTeamId || row?.tm?.awayTeamId || "";
  return `pair:${home}|${away}`;
}

function tmMatchdayVisibleDiff() {
  if (!tmMatchdaySyncState?.diff) return null;
  const ignoreAdd = tmMatchdaySyncState.ignoredAdd ?? new Set();
  const ignoreUpdate = tmMatchdaySyncState.ignoredUpdate ?? new Set();
  const ignoreRemove = tmMatchdaySyncState.ignoredRemove ?? new Set();
  const diff = tmMatchdaySyncState.diff;
  return {
    ...diff,
    toAdd: (diff.toAdd ?? []).filter((row) => !ignoreAdd.has(tmMatchdayFixtureKey(row))),
    toUpdate: (diff.toUpdate ?? []).filter((row) => !ignoreUpdate.has(tmMatchdayFixtureKey(row))),
    toRemove: (diff.toRemove ?? []).filter((row) => !ignoreRemove.has(tmMatchdayFixtureKey(row))),
  };
}

function tmMatchdaySyncStatusHtml(matchweek) {
  if (typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter)) {
    return `<span class="players-tm-sync__hint admin-muted">World Cup fixtures are managed manually.</span>`;
  }
  if (!tmSyncLocalProxyReady()) {
    return `<span class="players-tm-sync__hint admin-muted">Use <strong>serve.bat</strong> on your computer — Transfermarkt comparison cannot run on phone / GitHub Pages.</span>`;
  }
  const compId =
    typeof TransfermarktTeams !== "undefined"
      ? TransfermarktTeams.competitionIdForLeague?.(leagueFilter)
      : null;
  if (!compId) {
    return `<span class="players-tm-sync__hint admin-muted">No Transfermarkt competition mapping for this league yet.</span>`;
  }
  if (
    !tmMatchdaySyncState ||
    tmMatchdaySyncState.leagueId !== leagueFilter ||
    tmMatchdaySyncState.matchweek !== matchweek
  ) {
    return `<span class="players-tm-sync__hint admin-muted">Compare MW ${matchweek} with Transfermarkt (${compId}) for the selected season.</span>`;
  }
  const diff = tmMatchdayVisibleDiff() ?? tmMatchdaySyncState.diff;
  const parts = [
    `${diff.tmTotal} on Transfermarkt`,
    `${diff.localTotal} local`,
    `${diff.matched} matched`,
  ];
  if (diff.toAdd?.length) parts.push(`${diff.toAdd.length} to add`);
  if (diff.toUpdate?.length) parts.push(`${diff.toUpdate.length} to sync`);
  if (diff.toRemove?.length) parts.push(`${diff.toRemove.length} to remove`);
  if (diff.skipped?.length) parts.push(`${diff.skipped.length} skipped`);
  const ignored =
    (tmMatchdaySyncState.ignoredAdd?.size ?? 0) +
    (tmMatchdaySyncState.ignoredUpdate?.size ?? 0) +
    (tmMatchdaySyncState.ignoredRemove?.size ?? 0);
  if (ignored) parts.push(`${ignored} ignored`);
  return `<span class="players-tm-sync__hint">${esc(parts.join(" · "))}</span>`;
}

function tmMatchdayScoreLabel(score) {
  if (!score) return "No score";
  return `${score[0]}–${score[1]}`;
}

function tmMatchdaySyncPanelHtml(matchweek) {
  if (typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter)) return "";
  if (
    tmMatchdaySyncState &&
    (tmMatchdaySyncState.leagueId !== leagueFilter || tmMatchdaySyncState.matchweek !== matchweek)
  ) {
    tmMatchdaySyncState = null;
  }
  const localReady = tmSyncLocalProxyReady();
  const compId =
    typeof TransfermarktTeams !== "undefined"
      ? TransfermarktTeams.competitionIdForLeague?.(leagueFilter)
      : null;
  const canCompare = localReady && Boolean(compId);
  const diff = tmMatchdayVisibleDiff();
  const hasOpen =
    diff && (diff.toAdd.length || diff.toUpdate.length || diff.toRemove.length);
  const ignoredTotal =
    (tmMatchdaySyncState?.ignoredAdd?.size ?? 0) +
    (tmMatchdaySyncState?.ignoredUpdate?.size ?? 0) +
    (tmMatchdaySyncState?.ignoredRemove?.size ?? 0);
  const emptyMsg =
    tmMatchdaySyncState && !hasOpen
      ? `<p class="players-tm-sync__empty admin-muted mb-0">${
          ignoredTotal
            ? "No open suggestions — ignored items are hidden until you compare again."
            : "This matchweek matches Transfermarkt."
        }</p>`
      : "";

  const addRows =
    diff?.toAdd
      .map((row) => {
        const key = tmMatchdayFixtureKey(row);
        return `<li class="players-tm-sync__item players-tm-sync__item--add">
      <div class="players-tm-sync__copy">
        <strong>${esc(row.homeTeamName)} vs ${esc(row.awayTeamName)}</strong>
        <span class="players-tm-sync__meta">${esc(
          [row.timeLabel || "", tmMatchdayScoreLabel(row.score), `${(row.goals ?? []).length} goals`]
            .filter(Boolean)
            .join(" · "),
        )}</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-primary players-tm-sync__apply" data-tm-matchday-add="${esc(key)}">Add</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-matchday-ignore-add="${esc(key)}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`;
      })
      .join("") ?? "";

  const updateRows =
    diff?.toUpdate
      .map((row) => {
        const key = tmMatchdayFixtureKey(row);
        const tm = row.tm;
        return `<li class="players-tm-sync__item players-tm-sync__item--update">
      <div class="players-tm-sync__copy">
        <strong>${esc(tm.homeTeamName)} vs ${esc(tm.awayTeamName)}</strong>
        <span class="players-tm-sync__meta">${esc(
          [tmMatchdayScoreLabel(tm.score), tm.timeLabel || "", `update ${(row.changes ?? []).join(", ")}`]
            .filter(Boolean)
            .join(" · "),
        )}</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-ghost players-tm-sync__apply" data-tm-matchday-sync="${esc(key)}">Sync</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-matchday-ignore-update="${esc(key)}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`;
      })
      .join("") ?? "";

  const removeRows =
    diff?.toRemove
      .map((row) => {
        const key = tmMatchdayFixtureKey(row);
        const home = state().teams.find((t) => t.id === row.homeTeamId)?.name ?? row.homeTeamId;
        const away = state().teams.find((t) => t.id === row.awayTeamId)?.name ?? row.awayTeamId;
        return `<li class="players-tm-sync__item players-tm-sync__item--remove">
      <div class="players-tm-sync__copy">
        <strong>${esc(home)} vs ${esc(away)}</strong>
        <span class="players-tm-sync__meta">Only in Squad Central</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-danger players-tm-sync__apply" data-tm-matchday-remove="${esc(key)}">Remove</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-matchday-ignore-remove="${esc(key)}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`;
      })
      .join("") ?? "";

  const bulkBar = hasOpen
    ? `<div class="players-tm-sync__bulk">
        ${diff.toAdd.length ? `<button type="button" class="mw-btn-primary players-auto-btn" id="btnTmMatchdayAddAll">Add all (${diff.toAdd.length})</button>` : ""}
        ${diff.toUpdate.length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmMatchdaySyncAll">Sync details (${diff.toUpdate.length})</button>` : ""}
        ${diff.toRemove.length ? `<button type="button" class="mw-btn-danger players-auto-btn" id="btnTmMatchdayRemoveAll">Remove all (${diff.toRemove.length})</button>` : ""}
      </div>`
    : "";

  const colCount =
    (diff?.toAdd.length ? 1 : 0) +
    (diff?.toUpdate.length ? 1 : 0) +
    (diff?.toRemove.length ? 1 : 0);

  return `
    <div class="players-tm-sync matchweek-tm-sync" id="matchweekTmSync">
      <div class="players-tm-sync__link-row matchweek-tm-sync__controls">
        <div class="mw-field matchweek-tm-sync__season">
          <label for="tmMatchdaySeason">Season starts</label>
          <input id="tmMatchdaySeason" class="mw-input" type="number" min="1900" max="2100" step="1" value="${esc(tmMatchdaySeason)}" />
        </div>
        <button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmMatchdayRefresh"${canCompare ? "" : " disabled"} title="${canCompare ? "Compare this matchweek with Transfermarkt" : localReady ? "No competition mapping for this league" : "Only available via serve.bat on your computer"}">Compare with Transfermarkt</button>
      </div>
      <div class="players-tm-sync__head">
        <span class="players-tm-sync__status" id="matchweekTmSyncStatus">${tmMatchdaySyncStatusHtml(matchweek)}</span>
      </div>
      ${bulkBar}
      <div class="players-tm-sync__body${tmMatchdaySyncState || emptyMsg ? "" : " admin-hidden"}">
        ${
          hasOpen
            ? `<div class="players-tm-sync__cols${colCount >= 3 ? " players-tm-sync__cols--3" : ""}">
          ${
            diff.toAdd.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">On Transfermarkt — add fixtures</h4>
            <ul class="players-tm-sync__list">${addRows}</ul>
          </div>`
              : ""
          }
          ${
            diff.toUpdate.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Matched — sync details</h4>
            <ul class="players-tm-sync__list">${updateRows}</ul>
          </div>`
              : ""
          }
          ${
            diff.toRemove.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Only in Squad Central — remove</h4>
            <ul class="players-tm-sync__list">${removeRows}</ul>
          </div>`
              : ""
          }
        </div>`
            : emptyMsg
        }
      </div>
    </div>`;
}

function leagueMatchweekCeiling(leagueId) {
  let max = 38;
  for (const m of state().matches ?? []) {
    if (m.leagueId !== leagueId) continue;
    const n =
      typeof parseMatchweekNumber === "function"
        ? parseMatchweekNumber(m.matchday)
        : Number(String(m.matchday ?? "").match(/MW\s*(\d+)/i)?.[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Math.min(Math.max(max, 1), 50);
}

function matchweekFixtureCount(leagueId, weekNum) {
  const list =
    typeof filterMatchesForLeagueWeek === "function"
      ? filterMatchesForLeagueWeek(state().matches, leagueId, weekNum)
      : (state().matches ?? []).filter(
          (m) => m.leagueId === leagueId && (m.matchday === `MW ${weekNum}` || !m.matchday),
        );
  return list.length;
}

function matchweekSelectField(leagueId, selected, opts = {}) {
  const { id = "mwNum", label = "Matchweek", fieldClass = "mw-field mb-0" } = opts;
  const sel = Number(selected);
  const current = Number.isInteger(sel) && sel > 0 ? sel : 1;
  const max = Math.max(leagueMatchweekCeiling(leagueId), current);
  const options = [];
  for (let n = 1; n <= max; n++) {
    const count = matchweekFixtureCount(leagueId, n);
    const countLabel = count ? ` · ${count}` : "";
    options.push(
      `<option value="${n}"${n === current ? " selected" : ""}>Matchweek ${n}${countLabel}</option>`,
    );
  }
  return `<div class="${fieldClass}">
    <label for="${id}">${label}</label>
    <div class="mw-select-wrap">
      <select id="${id}" class="mw-select" aria-label="${esc(label)}">${options.join("")}</select>
    </div>
  </div>`;
}

function applySelectedMatchweek(num, { toastMsg = false } = {}) {
  if (!Number.isInteger(num) || num < 1) return false;
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const prev = Number(meta.matchweek) || 0;
  const prevTitle = String(meta.matchweekTitle ?? "").trim();
  const autoTitle =
    !prevTitle ||
    /^Matchweek\s+\d+$/i.test(prevTitle) ||
    /^Gameweek\s+\d+$/i.test(prevTitle);
  FCDataStore.setLeagueMeta(leagueFilter, {
    ...meta,
    matchweek: num,
    matchweekTitle: autoTitle ? `Matchweek ${num}` : prevTitle,
  });
  matchEditId = "";
  mwEditorDraft = null;
  if (tmMatchdaySyncState && tmMatchdaySyncState.matchweek !== num) tmMatchdaySyncState = null;
  syncToAppArrays();
  if (toastMsg && prev !== num) toast(`Showing Matchweek ${num}`);
  renderPanel();
  return true;
}

function bindMatchweekFilterSelect() {
  $("#mwNum")?.addEventListener("change", () => {
    const num = Number($("#mwNum")?.value);
    applySelectedMatchweek(num, { toastMsg: true });
  });
}

function matchweekStats(matches) {
  let goals = 0;
  let withLineups = 0;
  for (const m of matches) {
    goals += (m.goalEvents ?? []).length;
    if ((m.lineups?.home?.length ?? 0) + (m.lineups?.away?.length ?? 0) > 0) withLineups++;
  }
  return { fixtures: matches.length, goals, withLineups };
}

function matchweekStatChipsHtml(stats, isWc) {
  const fixtureLabel = isWc ? "Matches" : "Fixtures";
  return `<div class="matchweek-stat-row" aria-label="Gameweek summary">
    <span class="matchweek-stat-chip matchweek-stat-chip--fixtures"><span class="matchweek-stat-chip__label">${fixtureLabel}</span><span class="matchweek-stat-chip__val">${stats.fixtures}</span></span>
    <span class="matchweek-stat-chip matchweek-stat-chip--goals"><span class="matchweek-stat-chip__label">Goals</span><span class="matchweek-stat-chip__val">${stats.goals}</span></span>
    <span class="matchweek-stat-chip matchweek-stat-chip--lineups"><span class="matchweek-stat-chip__label">Lineups</span><span class="matchweek-stat-chip__val">${stats.withLineups}</span></span>
  </div>`;
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
    : `<div class="col-12 col-md-4">
            ${matchweekSelectField(leagueFilter, meta.matchweek ?? 36, {
              id: "mwNum",
              label: "Select matchweek",
            })}
          </div>`;
  const settingsHint = isWc
    ? "Tournament title and dates shown above the full fixture list on the site."
    : "Pick a matchweek to filter fixtures. Title and date range are shown on the public site.";
  const fixturesTitle = isWc ? "All fixtures" : `Fixtures <span class="mw-badge">MW ${mw}</span>`;
  const fixturesHint = isWc
    ? `${list.length} match${list.length === 1 ? "" : "es"} · every round is kept`
    : `${list.length} match${list.length === 1 ? "" : "es"} in this gameweek`;
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const stats = matchweekStats(list);
  const mwBadge = isWc ? "" : `<span class="matchweek-broadcast__badge">MW ${mw}</span>`;

  return `
    <div class="mw-page matchweek-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Match center</p>
            <h2 class="mw-heading">Matchweek</h2>
            <p class="mw-lead">${isWc ? "Set the tournament header and every fixture — scores, goals, and lineups. All games stay visible on the site." : "Set the public gameweek title, dates, and every fixture — scores, goals, and lineups."}</p>
            ${matchweekStatChipsHtml(stats, isWc)}
          </div>
          <aside class="mw-hero__aside">
            <div class="matchweek-broadcast">
              <span class="matchweek-broadcast__eyebrow">Live preview</span>
              <strong class="matchweek-broadcast__title">${esc(mwTitle)}</strong>
              <span class="matchweek-broadcast__range">${esc(meta.dateRange ?? "—")}</span>
              ${mwBadge}
              <span class="matchweek-broadcast__league">${esc(leagueName)}</span>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped matchweek-settings-card">
        <div class="mw-card__stripe" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--matchweek" aria-hidden="true"></div>
          <div>
            <h3>${isWc ? "Tournament header" : "Gameweek settings"}</h3>
            <p>${settingsHint}</p>
          </div>
        </div>
        <div class="matchweek-filter-bar">
          <div class="row g-2 g-md-3 mw-field-grid">
            <div class="col-12">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
            ${mwNumField}
            <div class="col-12 col-md-4">
              <div class="mw-field mb-0">
                <label for="mwTitle">${isWc ? "Tournament title" : "Gameweek title"}</label>
                <input id="mwTitle" class="mw-input" type="text" value="${esc(mwTitle)}" placeholder="${isWc ? "Group Stage" : "Gameweek 36"}" />
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="mw-field mb-0">
                <label for="mwRange">Date range</label>
                <input id="mwRange" class="mw-input" type="text" value="${esc(meta.dateRange ?? "")}" placeholder="12 May – 15 May" />
              </div>
            </div>
          </div>
        </div>
        <div class="matchweek-settings-footer">
          <button type="button" class="mw-btn-primary matchweek-save-meta-btn" id="btnSaveMeta">${isWc ? "Save tournament header" : "Save matchweek header"}</button>
        </div>
        ${tmMatchdaySyncPanelHtml(mw)}
      </section>

      <section class="mw-card mw-card--striped matchweek-fixtures-card">
        <div class="mw-card__stripe mw-card__stripe--form" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon matchweek-fixtures-head">
          <div class="mw-card-head__icon mw-card-head__icon--fixtures" aria-hidden="true"></div>
          <div class="matchweek-fixtures-head__copy">
            <h3>${fixturesTitle}</h3>
            <p>${fixturesHint}</p>
          </div>
          <button type="button" class="mw-btn-primary mw-btn-primary--sm matchweek-add-fixture-btn" id="btnNewMwMatch">+ Add fixture</button>
        </div>
        ${renderFixtureCards(list)}
      </section>

      <section class="mw-card mw-card--striped mw-editor matchweek-editor is-open" id="mwMatchEditor">
        <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
        <div class="mw-editor-head matchweek-editor-head">
          <div class="mw-card-head__icon mw-card-head__icon--editor" aria-hidden="true"></div>
          <div class="matchweek-editor-head__copy">
            <p class="mw-eyebrow mw-eyebrow--live">${src ? (matchEditId ? "Editing fixture" : "New fixture") : "New fixture"}</p>
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

        <div class="mw-editor-footer matchweek-editor-footer">
          <button type="button" class="mw-btn-primary matchweek-save-fixture-btn" id="btnSaveMwMatch">Save fixture</button>
          <button type="button" class="mw-btn-ghost matchweek-cancel-fixture-btn" id="btnCancelMwMatch">Cancel</button>
        </div>
      </section>
      <datalist id="nationalityList">${nationalityDatalistHtml()}</datalist>
    </div>
  `;
}

function teamsForStadium(leagueId, stadiumName) {
  const name = String(stadiumName ?? "").trim();
  if (!name) return [];
  return teamsForLeague(leagueId).filter((t) => String(t.stadium ?? "").trim() === name);
}

function stadiumsLeagueStats(leagueId, list) {
  const teams = teamsForLeague(leagueId);
  const linked = teams.filter((t) => list.includes(String(t.stadium ?? "").trim())).length;
  return { total: list.length, linked, teams: teams.length };
}

function stadiumsStatChipsHtml(stats) {
  return `<div class="stadiums-stat-row" aria-label="Stadium summary">
    <span class="stadiums-stat-chip stadiums-stat-chip--venues"><span class="stadiums-stat-chip__label">Venues</span><span class="stadiums-stat-chip__val">${stats.total}</span></span>
    <span class="stadiums-stat-chip stadiums-stat-chip--linked"><span class="stadiums-stat-chip__label">Linked clubs</span><span class="stadiums-stat-chip__val">${stats.linked}</span></span>
    <span class="stadiums-stat-chip stadiums-stat-chip--teams"><span class="stadiums-stat-chip__label">Teams</span><span class="stadiums-stat-chip__val">${stats.teams}</span></span>
  </div>`;
}

function stadiumCardHtml(name, leagueId) {
  const homeTeams = teamsForStadium(leagueId, name);
  const homeMeta = homeTeams.length
    ? `<span class="stadium-card__home">${homeTeams.map((t) => esc(t.name)).join(", ")}</span>`
    : `<span class="stadium-card__home stadium-card__home--none">No team linked yet</span>`;
  return `<article class="stadium-card">
    <div class="stadium-card__stripe" aria-hidden="true"></div>
    <div class="stadium-card__icon" aria-hidden="true"></div>
    <div class="stadium-card__body">
      <strong class="stadium-card__name">${esc(name)}</strong>
      ${homeMeta}
    </div>
    <div class="stadium-card__actions admin-row-actions">
      <button type="button" class="mw-btn-ghost stadiums-row-btn" data-edit-stadium="${esc(name)}">Edit</button>
      <button type="button" class="mw-btn-danger stadiums-row-btn" data-del-stadium="${esc(name)}">Remove</button>
    </div>
  </article>`;
}

function tmStadiumNameKey(name) {
  return typeof TransfermarktSync !== "undefined"
    ? TransfermarktSync.normalizeNameKey(name)
    : String(name ?? "")
        .toLowerCase()
        .trim();
}

function tmStadiumVisibleDiff() {
  if (!tmStadiumSyncState?.diff) return null;
  const ignoreAdd = tmStadiumSyncState.ignoredAdd ?? new Set();
  const ignoreLink = tmStadiumSyncState.ignoredLink ?? new Set();
  const ignoreRename = tmStadiumSyncState.ignoredRename ?? new Set();
  const ignoreRemove = tmStadiumSyncState.ignoredRemove ?? new Set();
  const diff = tmStadiumSyncState.diff;
  return {
    ...diff,
    toAdd: (diff.toAdd ?? []).filter((row) => !ignoreAdd.has(tmStadiumNameKey(row.name))),
    toLink: (diff.toLink ?? []).filter((row) => !ignoreLink.has(row.teamId)),
    toRename: (diff.toRename ?? []).filter(
      (row) => !ignoreRename.has(`${row.teamId}:${tmStadiumNameKey(row.from)}:${tmStadiumNameKey(row.to)}`),
    ),
    toRemove: (diff.toRemove ?? []).filter((row) => !ignoreRemove.has(tmStadiumNameKey(row.name))),
  };
}

function tmStadiumSyncStatusHtml() {
  if (leagueFilter === "worldcup") {
    return `<span class="players-tm-sync__hint admin-muted">World Cup venues are managed manually — Transfermarkt club grounds do not apply.</span>`;
  }
  if (!tmSyncLocalProxyReady()) {
    return `<span class="players-tm-sync__hint admin-muted">Use <strong>serve.bat</strong> on your computer — Transfermarkt comparison cannot run on phone / GitHub Pages.</span>`;
  }
  const teams = teamsForLeague(leagueFilter);
  const withTm = teams.filter((t) => tmSyncAvailableForTeam(t)).length;
  if (!withTm) {
    return `<span class="players-tm-sync__hint admin-muted">Save Transfermarkt club links on the Teams (or Players) tab first.</span>`;
  }
  if (!tmStadiumSyncState || tmStadiumSyncState.leagueId !== leagueFilter) {
    return `<span class="players-tm-sync__hint admin-muted">Compare this league’s stadiums and club links with Transfermarkt (${withTm} club${withTm === 1 ? "" : "s"} linked).</span>`;
  }
  const diff = tmStadiumVisibleDiff() ?? tmStadiumSyncState.diff;
  const parts = [
    `${diff.tmTotal} on Transfermarkt`,
    `${diff.localTotal} in list`,
    `${diff.matched} matched`,
  ];
  if (diff.toAdd?.length) parts.push(`${diff.toAdd.length} to add`);
  if (diff.toLink?.length) parts.push(`${diff.toLink.length} to link`);
  if (diff.toRename?.length) parts.push(`${diff.toRename.length} to rename`);
  if (diff.toRemove?.length) parts.push(`${diff.toRemove.length} unused`);
  if (diff.skipped?.length) parts.push(`${diff.skipped.length} skipped`);
  if (diff.failed?.length) parts.push(`${diff.failed.length} failed`);
  const ignored =
    (tmStadiumSyncState.ignoredAdd?.size ?? 0) +
    (tmStadiumSyncState.ignoredLink?.size ?? 0) +
    (tmStadiumSyncState.ignoredRename?.size ?? 0) +
    (tmStadiumSyncState.ignoredRemove?.size ?? 0);
  if (ignored) parts.push(`${ignored} ignored`);
  return `<span class="players-tm-sync__hint">${esc(parts.join(" · "))}</span>`;
}

function tmStadiumSyncPanelHtml() {
  if (leagueFilter === "worldcup") return "";
  if (tmStadiumSyncState && tmStadiumSyncState.leagueId !== leagueFilter) tmStadiumSyncState = null;
  const localReady = tmSyncLocalProxyReady();
  const teams = teamsForLeague(leagueFilter);
  const withTm = teams.filter((t) => tmSyncAvailableForTeam(t)).length;
  const canCompare = localReady && withTm > 0;
  const diff = tmStadiumVisibleDiff();
  const hasOpen =
    diff &&
    (diff.toAdd.length || diff.toLink.length || diff.toRename.length || diff.toRemove.length);
  const ignoredTotal =
    (tmStadiumSyncState?.ignoredAdd?.size ?? 0) +
    (tmStadiumSyncState?.ignoredLink?.size ?? 0) +
    (tmStadiumSyncState?.ignoredRename?.size ?? 0) +
    (tmStadiumSyncState?.ignoredRemove?.size ?? 0);
  const emptyMsg =
    tmStadiumSyncState && !hasOpen
      ? `<p class="players-tm-sync__empty admin-muted mb-0">${
          ignoredTotal
            ? "No open suggestions — ignored items are hidden until you compare again."
            : "Stadiums and club links match Transfermarkt."
        }</p>`
      : "";

  const addRows =
    diff?.toAdd
      .map(
        (row) => `<li class="players-tm-sync__item players-tm-sync__item--add">
      <div class="players-tm-sync__copy">
        <strong>${esc(row.name)}</strong>
        <span class="players-tm-sync__meta">Add to league list</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-primary players-tm-sync__apply" data-tm-stadium-add="${esc(tmStadiumNameKey(row.name))}">Add</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-stadium-ignore-add="${esc(tmStadiumNameKey(row.name))}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`,
      )
      .join("") ?? "";

  const linkRows =
    diff?.toLink
      .map(
        (row) => `<li class="players-tm-sync__item players-tm-sync__item--update">
      <div class="players-tm-sync__copy">
        <strong>${esc(row.teamName)}</strong>
        <span class="players-tm-sync__meta">${esc(
          row.from ? `${row.from} → ${row.to}` : `Set ${row.to}`,
        )}</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-ghost players-tm-sync__apply" data-tm-stadium-link="${esc(row.teamId)}">Link</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-stadium-ignore-link="${esc(row.teamId)}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`,
      )
      .join("") ?? "";

  const renameRows =
    diff?.toRename
      .map((row) => {
        const key = `${row.teamId}:${tmStadiumNameKey(row.from)}:${tmStadiumNameKey(row.to)}`;
        return `<li class="players-tm-sync__item players-tm-sync__item--move">
      <div class="players-tm-sync__copy">
        <strong>${esc(row.teamName)}</strong>
        <span class="players-tm-sync__meta">${esc(`${row.from} → ${row.to}`)}</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-ghost players-tm-sync__apply" data-tm-stadium-rename="${esc(key)}">Rename</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-stadium-ignore-rename="${esc(key)}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`;
      })
      .join("") ?? "";

  const removeRows =
    diff?.toRemove
      .map(
        (row) => `<li class="players-tm-sync__item players-tm-sync__item--remove">
      <div class="players-tm-sync__copy">
        <strong>${esc(row.name)}</strong>
        <span class="players-tm-sync__meta">Unused in this league</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="mw-btn-danger players-tm-sync__apply" data-tm-stadium-remove="${esc(tmStadiumNameKey(row.name))}">Remove</button>
        <button type="button" class="players-tm-sync__dismiss" data-tm-stadium-ignore-remove="${esc(tmStadiumNameKey(row.name))}" title="Ignore" aria-label="Ignore">×</button>
      </div>
    </li>`,
      )
      .join("") ?? "";

  const bulkBar = hasOpen
    ? `<div class="players-tm-sync__bulk">
        ${diff.toAdd.length ? `<button type="button" class="mw-btn-primary players-auto-btn" id="btnTmStadiumAddAll">Add all (${diff.toAdd.length})</button>` : ""}
        ${diff.toLink.length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmStadiumLinkAll">Link all (${diff.toLink.length})</button>` : ""}
        ${diff.toRename.length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmStadiumRenameAll">Apply renames (${diff.toRename.length})</button>` : ""}
        ${diff.toRemove.length ? `<button type="button" class="mw-btn-danger players-auto-btn" id="btnTmStadiumRemoveAll">Remove unused (${diff.toRemove.length})</button>` : ""}
      </div>`
    : "";

  const colCount =
    (diff?.toAdd.length ? 1 : 0) +
    (diff?.toLink.length || diff?.toRename.length ? 1 : 0) +
    (diff?.toRemove.length ? 1 : 0);

  const middleCol =
    diff?.toLink.length || diff?.toRename.length
      ? `<div class="players-tm-sync__col">
          <h4 class="players-tm-sync__title">Clubs — link / rename</h4>
          <ul class="players-tm-sync__list">${linkRows}${renameRows}</ul>
        </div>`
      : "";

  return `
    <div class="players-tm-sync stadiums-tm-sync" id="stadiumsTmSync">
      <div class="players-tm-sync__head">
        <div class="players-toolbar-actions">
          <button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmStadiumRefresh"${canCompare ? "" : " disabled"} title="${canCompare ? "Compare stadiums with Transfermarkt" : localReady ? "Save Transfermarkt club links on Teams first" : "Only available via serve.bat on your computer"}">Compare with Transfermarkt</button>
        </div>
        <span class="players-tm-sync__status" id="stadiumsTmSyncStatus">${tmStadiumSyncStatusHtml()}</span>
      </div>
      ${bulkBar}
      <div class="players-tm-sync__body${tmStadiumSyncState || emptyMsg ? "" : " admin-hidden"}">
        ${
          hasOpen
            ? `<div class="players-tm-sync__cols${colCount >= 3 ? " players-tm-sync__cols--3" : ""}">
          ${
            diff.toAdd.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">On Transfermarkt — add to list</h4>
            <ul class="players-tm-sync__list">${addRows}</ul>
          </div>`
              : ""
          }
          ${middleCol}
          ${
            diff.toRemove.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Unused in Squad Central</h4>
            <ul class="players-tm-sync__list">${removeRows}</ul>
          </div>`
              : ""
          }
        </div>`
            : emptyMsg
        }
      </div>
    </div>`;
}

function panelStadiums() {
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const list = stadiumsForLeague(leagueFilter);
  const editing = Boolean(stadiumEditName);
  const stats = stadiumsLeagueStats(leagueFilter, list);
  const listBody = list.length
    ? `<div class="stadiums-list">${list.map((s) => stadiumCardHtml(s, leagueFilter)).join("")}</div>`
    : `<div class="stadiums-empty">
        <div class="stadiums-empty__icon" aria-hidden="true"></div>
        <p class="stadiums-empty__title">No stadiums yet</p>
        <p class="stadiums-empty__text">Add your first venue below — it will appear in Matchweek and Matches dropdowns.</p>
      </div>`;

  return `
    <div class="mw-page stadiums-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Venues</p>
            <h2 class="mw-heading">Stadiums</h2>
            <p class="mw-lead">Define the stadium list for each league or tournament. Matchweek and Matches editors pick from this list when assigning a venue.</p>
            ${stadiumsStatChipsHtml(stats)}
          </div>
          <aside class="mw-hero__aside">
            <div class="stadiums-hero-preview">
              <div class="stadiums-hero-preview__icon" aria-hidden="true"></div>
              <div class="mw-hero-preview stadiums-hero-preview__box">
                <span class="mw-hero-preview-label">${esc(leagueName)}</span>
                <strong class="mw-hero-preview-title">${list.length} stadium${list.length === 1 ? "" : "s"}</strong>
                <span class="mw-hero-preview-range">${stats.linked} club${stats.linked === 1 ? "" : "s"} linked</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--form" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--stadium" aria-hidden="true"></div>
          <div>
            <h3>League stadiums</h3>
            <p>${list.length} venue${list.length === 1 ? "" : "s"} available when creating fixtures. Linked clubs show the team that uses each ground on the public site.</p>
          </div>
        </div>
        <div class="stadiums-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
          </div>
        </div>
        ${tmStadiumSyncPanelHtml()}
        ${listBody}
      </section>

      <section class="mw-card mw-card--striped" id="stadiumFormCard">
        <div class="mw-card__stripe" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--stadium-add" aria-hidden="true"></div>
          <div>
            <h3 id="stadiumFormTitle">${editing ? "Edit stadium" : "Add stadium"}</h3>
            <p>${editing ? `Renaming updates fixtures and clubs that use “${esc(stadiumEditName)}”.` : "New venues appear in the Matchweek stadium dropdown."}</p>
          </div>
        </div>
        <input type="hidden" id="stadiumEditName" value="${esc(stadiumEditName)}" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-8 col-lg-6">
            <div class="mw-field mb-0">
              <label for="stadiumName">Stadium name</label>
              <input id="stadiumName" class="mw-input stadiums-name-input" value="${editing ? esc(stadiumEditName) : ""}" placeholder="Emirates Stadium" autocomplete="off" />
            </div>
          </div>
        </div>
        <div class="stadiums-form-footer">
          <button type="button" class="mw-btn-primary stadiums-save-btn" id="btnSaveStadium">${editing ? "Save changes" : "Add stadium"}</button>
          <button type="button" class="mw-btn-ghost stadiums-clear-btn" id="btnNewStadium">Clear form</button>
        </div>
      </section>
    </div>
  `;
}

function teamAccentColors(team) {
  const c1 = String(team?.colors?.[0] ?? "#378add").trim();
  const c2 = String(team?.colors?.[1] ?? "#4ade80").trim();
  return { c1, c2 };
}

function teamsLeagueStats(list) {
  let withLogo = 0;
  let withFormation = 0;
  for (const t of list) {
    if (String(t.logo ?? "").trim()) withLogo++;
    if (String(t.formation ?? "").trim()) withFormation++;
  }
  return { total: list.length, withLogo, withFormation };
}

function teamsStatChipsHtml(stats) {
  return `<div class="teams-stat-row" aria-label="League teams summary">
    <span class="teams-stat-chip teams-stat-chip--clubs"><span class="teams-stat-chip__label">Clubs</span><span class="teams-stat-chip__val">${stats.total}</span></span>
    <span class="teams-stat-chip teams-stat-chip--logos"><span class="teams-stat-chip__label">With crest</span><span class="teams-stat-chip__val">${stats.withLogo}</span></span>
    <span class="teams-stat-chip teams-stat-chip--formations"><span class="teams-stat-chip__label">Formations</span><span class="teams-stat-chip__val">${stats.withFormation}</span></span>
  </div>`;
}

function teamCardHtml(t) {
  const { c1, c2 } = teamAccentColors(t);
  const coach = t.coach && t.coach !== "—" ? esc(t.coach) : "—";
  const formation = t.formation?.trim() ? esc(t.formation) : "—";
  const stadium = t.stadium?.trim()
    ? `<span class="team-card__stadium">${esc(t.stadium)}</span>`
    : "";
  return `<article class="team-card team-sort-row" data-team-id="${esc(t.id)}">
    <div class="team-card__stripe" style="background: linear-gradient(90deg, ${c1} 0%, ${c2} 100%)" aria-hidden="true"></div>
    <span class="player-drag-handle team-card__drag" draggable="true" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span>
    ${adminTeamCrestHtml(t)}
    <div class="team-card__body">
      <strong class="team-card__name">${esc(t.name)}</strong>
      <div class="team-card__meta">
        <span class="team-card__formation">${formation}</span>
        <span class="team-card__meta-sep" aria-hidden="true">·</span>
        <span class="team-card__coach">${coach}</span>
      </div>
      ${stadium}
      <code class="team-card__id">${esc(t.id)}</code>
    </div>
    <div class="team-card__actions admin-row-actions">
      <button type="button" class="mw-btn-ghost teams-row-btn" data-edit-team="${esc(t.id)}">Edit</button>
      <button type="button" class="mw-btn-danger teams-row-btn" data-del-team="${esc(t.id)}">Remove</button>
    </div>
  </article>`;
}

function panelTeams() {
  const list = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const teamCount = list.length;
  const stats = teamsLeagueStats(list);
  const featuredTeam = list[0];
  const rosterBody = teamCount
    ? `<div class="teams-roster-wrap admin-table-wrap admin-table-wrap--sort">
        <div class="teams-list" id="teamsSortList">${list.map((t) => teamCardHtml(t)).join("")}</div>
      </div>`
    : `<div class="teams-empty">
        <div class="teams-empty__icon" aria-hidden="true"></div>
        <p class="teams-empty__title">No teams yet</p>
        <p class="teams-empty__text">Add your first club below — it will appear on the public site and in matchweek editors.</p>
      </div>`;

  return `
    <div class="mw-page teams-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Squad setup</p>
            <h2 class="mw-heading">Teams</h2>
            <p class="mw-lead">Manage clubs for each league — formation, coach, and branding used across matchweek and squads.</p>
            ${teamsStatChipsHtml(stats)}
          </div>
          <aside class="mw-hero__aside">
            <div class="teams-hero-preview">
              ${adminTeamCrestHtml(featuredTeam)}
              <div class="mw-hero-preview teams-hero-preview__box">
                <span class="mw-hero-preview-label">${esc(leagueName)}</span>
                <strong class="mw-hero-preview-title">${teamCount} team${teamCount === 1 ? "" : "s"}</strong>
                <span class="mw-hero-preview-range">${stats.withLogo} with crest${stats.withLogo === 1 ? "" : "s"}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--form" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--teams" aria-hidden="true"></div>
          <div>
            <h3>Club roster</h3>
            <p>${teamCount} team${teamCount === 1 ? "" : "s"} · drag the <strong>⋮⋮</strong> handle to set list order on the public site.</p>
          </div>
        </div>
        <div class="teams-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
          </div>
        </div>
        ${rosterBody}
      </section>

      <section class="mw-card mw-card--striped" id="teamFormCard">
        <div class="mw-card__stripe" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--team-add" aria-hidden="true"></div>
          <div>
            <h3 id="teamFormTitle">Add team</h3>
            <p>Formation is used in Club Spotlight and squad depth on the site. Home stadium links appear on the Stadiums tab.</p>
          </div>
        </div>
        <input type="hidden" id="teamEditId" value="" />
        <div class="row g-2 g-md-3">
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamName">Name</label><input id="teamName" class="mw-input" autocomplete="off" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamCity">City</label><input id="teamCity" class="mw-input" autocomplete="off" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamFormation">Formation</label><input id="teamFormation" class="mw-input" placeholder="4-3-3" autocomplete="off" /></div>
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamCoach">Coach</label><input id="teamCoach" class="mw-input" autocomplete="off" /></div>
          </div>
          <div class="col-12 col-md-6">
            ${stadiumSelectField(leagueFilter, "", { id: "teamStadium", label: "Home stadium", note: "Optional. Manage the league list in the Stadiums tab, or use Compare with Transfermarkt there." })}
          </div>
          <div class="col-12 col-md-6">
            <div class="mw-field"><label for="teamLogo">Logo path</label><input id="teamLogo" class="mw-input" placeholder="./images/premierleague/arsenal.png" autocomplete="off" /></div>
          </div>
          <div class="col-12">
            <div class="mw-field"><label for="teamTmUrlForm">Transfermarkt club link</label><input id="teamTmUrlForm" class="mw-input" type="url" inputmode="url" placeholder="https://www.transfermarkt.com/…/verein/11" autocomplete="off" /><span class="admin-muted" style="display:block;margin-top:6px;font-size:12px">Optional. Used by Players / Transfers / Stadiums Transfermarkt tools (needs serve.bat).</span></div>
          </div>
          <div class="col-6 col-md-6 col-lg-3">
            <div class="mw-field"><label for="teamC1">Color 1</label><input id="teamC1" class="mw-input mw-input--color" type="color" value="#2de2e6" /></div>
          </div>
          <div class="col-6 col-md-6 col-lg-3">
            <div class="mw-field"><label for="teamC2">Color 2</label><input id="teamC2" class="mw-input mw-input--color" type="color" value="#111827" /></div>
          </div>
        </div>
        <div class="teams-form-footer">
          <button type="button" class="mw-btn-primary teams-save-btn" id="btnSaveTeam">Save team</button>
          <button type="button" class="mw-btn-ghost teams-clear-btn" id="btnNewTeam">Clear form</button>
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

function writeSquadDepthPicksToDom(depth) {
  for (let i = 0; i < SquadDepth.DEPTH_GK_COUNT; i++) {
    const el = $(`#sdGk${i}`);
    if (el) el.value = depth.goalkeepers[i] ?? "";
  }
  for (let i = 0; i < SquadDepth.DEPTH_OUTFIELD_SLOTS; i++) {
    const tagEl = $(`#sdTag${i}`);
    if (tagEl && !tagEl.readOnly) tagEl.value = depth.slots[i]?.tag ?? "";
    const a = $(`#sdSlot${i}A`);
    const b = $(`#sdSlot${i}B`);
    if (a) a.value = depth.slots[i]?.players[0] ?? "";
    if (b) b.value = depth.slots[i]?.players[1] ?? "";
  }
  const formEl = $("#sdFormation");
  if (formEl && depth.formation) formEl.value = depth.formation;
}

function squadDepthShortName(player) {
  if (!player) return "";
  if (typeof playerDisplayLastName === "function") return playerDisplayLastName({ player });
  if (typeof deriveLastNameFromFullName === "function") return deriveLastNameFromFullName(player.name);
  return String(player.name ?? "");
}

function renderAdminDepthPosNode(tag, players, focusFieldId, isGk = false) {
  const label = esc(String(tag ?? "—").toUpperCase());
  const namesHtml = players.length
    ? players
        .map((p) => {
          const short = squadDepthShortName(p);
          return `<span class="depth-pos-name depth-pos-name--static">${esc(short)}</span>`;
        })
        .join("")
    : `<span class="depth-empty muted">—</span>`;
  const focusAttr = focusFieldId ? ` data-sd-focus="${esc(focusFieldId)}"` : "";
  return `
    <button type="button" class="depth-pos-node${isGk ? " is-gk" : ""} sd-depth-node"${focusAttr} title="Edit ${label}">
      <div class="player-circle pitch-token depth-pos-badge">${label}</div>
      <div class="depth-pos-names">${namesHtml}</div>
    </button>
  `;
}

/** Full pitch preview (includes empty slots) for admin editing. */
function renderAdminSquadDepthPitch(team, depth, roster) {
  if (typeof SquadDepth === "undefined") return `<p class="admin-muted mb-0">Pitch preview unavailable.</p>`;
  const normalized = SquadDepth.normalizeSquadDepth(depth, team?.formation);
  const formation = normalized.formation || team?.formation || "4-2-3-1";
  const playerMap = new Map((roster ?? []).map((p) => [p.id, p]));
  const gks = normalized.goalkeepers.map((id) => playerMap.get(id)).filter(Boolean);
  const outfieldTopStart = 72;
  const outfieldTopEnd = 12;
  const markings = typeof pitchMarkingsSvg === "function" ? pitchMarkingsSvg() : "";

  const lines = SquadDepth.parseFormationLines(formation);
  const sum = lines.reduce((a, b) => a + b, 0);
  const useLines = lines.length && sum === SquadDepth.DEPTH_OUTFIELD_SLOTS;

  let builtOutfield = "";
  if (useLines) {
    let idx = 0;
    builtOutfield = lines
      .map((n, r) => {
        const row = SquadDepth.centerDmInPitchRow(
          normalized.slots.slice(idx, idx + n).map((s, j) => ({
            tag: s.tag,
            players: s.players.map((id) => playerMap.get(id)).filter(Boolean),
            slotIndex: idx + j,
          })),
        );
        idx += n;
        const top = lines.length > 1 ? outfieldTopStart - (r / (lines.length - 1)) * (outfieldTopStart - outfieldTopEnd) : 50;
        return row
          .map((slot, c) => {
            const left = ((c + 1) / (row.length + 1)) * 100;
            return `
              <div class="depth-slot" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">
                ${renderAdminDepthPosNode(slot.tag, slot.players, `sdSlot${slot.slotIndex}A`)}
              </div>`;
          })
          .join("");
      })
      .join("");
  } else {
    builtOutfield = normalized.slots
      .map((s, i) => {
        const left = ((i + 1) / (normalized.slots.length + 1)) * 100;
        const players = s.players.map((id) => playerMap.get(id)).filter(Boolean);
        return `
          <div class="depth-slot" style="left:${left.toFixed(1)}%;top:50%">
            ${renderAdminDepthPosNode(s.tag, players, `sdSlot${i}A`)}
          </div>`;
      })
      .join("");
  }

  const chartCount = SquadDepth.countDepthPlayers(normalized);
  const teamName = team?.name ?? "Team";

  return `
    <section class="lineup-block pitch-side squad-depth-side sd-pitch-preview-side">
      <div class="lineup-team-header pitch-side-head">
        <h3 class="lineup-team-name pitch-team">${esc(teamName)}</h3>
        <span class="lineup-formation-badge">${esc(formation)}</span>
      </div>
      <div class="pitch squad-depth-pitch sd-pitch-preview">
        ${markings}
        <div class="pitch-players">
          <div class="depth-slot depth-slot--gk" style="left:50%;top:86%">${renderAdminDepthPosNode("GK", gks, "sdGk0", true)}</div>
          ${builtOutfield}
        </div>
      </div>
      <p class="sd-preview-footnote admin-muted mb-0">${chartCount} on chart · click a badge to jump to its pick</p>
    </section>
  `;
}

function squadDepthStatusMeta(depth, roster) {
  const validation = SquadDepth.validateSquadDepth(depth);
  const chartCount = SquadDepth.countDepthPlayers(depth);
  const statusClass = validation.ok ? (chartCount > 0 ? "sd-status--ok" : "sd-status--warn") : "sd-status--warn";
  const statusText = !validation.ok
    ? validation.errors[0]
    : chartCount > 0
      ? `${chartCount} player${chartCount === 1 ? "" : "s"} on chart (up to ${SquadDepth.DEPTH_CHART_SIZE}). Save anytime — picks are optional.`
      : "No players picked yet. Use Auto-fill or Seed from last XI, or pick manually.";
  return { validation, chartCount, statusClass, statusText, stats: squadDepthStats(depth, roster) };
}

function refreshSquadDepthUiFromDraft() {
  const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
  const team = state().teams.find((t) => t.id === teamId);
  const roster = team ? squadDepthRoster(team.id) : [];
  const depth = squadDepthDraft ?? readSquadDepthFromDom();
  writeSquadDepthPicksToDom(depth);

  const pitchHost = $("#sdPitchPreview");
  if (pitchHost && team) pitchHost.innerHTML = renderAdminSquadDepthPitch(team, depth, roster);

  const meta = squadDepthStatusMeta(depth, roster);
  const statusEl = $("#sdStatus");
  if (statusEl) {
    statusEl.className = `sd-status ${meta.statusClass}`;
    statusEl.textContent = meta.statusText;
  }

  const chipsHost = $("#sdStatChips");
  if (chipsHost) chipsHost.innerHTML = squadDepthStatChipsHtml(meta.stats);

  const heroMeta = $("#sdHeroMeta");
  if (heroMeta) {
    heroMeta.innerHTML = `
      <span class="mw-hero-preview-label">${esc(team?.name ?? "—")}</span>
      <strong class="mw-hero-preview-title">${esc(depth.formation)}</strong>
      <span class="mw-hero-preview-range">${meta.chartCount} on chart · ${roster.length} in squad</span>
    `;
  }

  const hint = $("#sdFormationHint");
  if (hint) {
    const summary = SquadDepth.formationSlotSummary(depth.formation);
    hint.textContent = `Slots: ${summary.label}`;
  }
}

function applySquadDepthEditorChange(changedFieldId) {
  if (!changedFieldId) return;
  squadDepthDraft = dedupeSquadDepthPicks(readSquadDepthFromDom(), changedFieldId);
  refreshSquadDepthUiFromDraft();
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

function squadDepthStats(depth, roster) {
  const chartCount = SquadDepth.countDepthPlayers(depth);
  let gkFilled = 0;
  for (const id of depth.goalkeepers ?? []) {
    if (id) gkFilled++;
  }
  let slotFilled = 0;
  for (const slot of depth.slots ?? []) {
    if (slot.players?.[0]) slotFilled++;
    if (slot.players?.[1]) slotFilled++;
  }
  return {
    chartCount,
    gkFilled,
    slotFilled,
    roster: roster.length,
    maxChart: SquadDepth.DEPTH_CHART_SIZE,
  };
}

function squadDepthStatChipsHtml(stats) {
  return `<div class="squaddepth-stat-row" aria-label="Depth chart summary">
    <span class="squaddepth-stat-chip squaddepth-stat-chip--chart"><span class="squaddepth-stat-chip__label">On chart</span><span class="squaddepth-stat-chip__val">${stats.chartCount}/${stats.maxChart}</span></span>
    <span class="squaddepth-stat-chip squaddepth-stat-chip--gk"><span class="squaddepth-stat-chip__label">Keepers</span><span class="squaddepth-stat-chip__val">${stats.gkFilled}/3</span></span>
    <span class="squaddepth-stat-chip squaddepth-stat-chip--slots"><span class="squaddepth-stat-chip__label">Outfield picks</span><span class="squaddepth-stat-chip__val">${stats.slotFilled}</span></span>
    <span class="squaddepth-stat-chip squaddepth-stat-chip--squad"><span class="squaddepth-stat-chip__label">Squad</span><span class="squaddepth-stat-chip__val">${stats.roster}</span></span>
  </div>`;
}

function sdSlotPosClass(tag) {
  const t = String(tag ?? "").trim().toUpperCase();
  if (t === "GK") return "sd-slot-row--gk";
  if (["CB", "RB", "LB", "RCB", "LCB", "RWB", "LWB", "SW"].includes(t)) return "sd-slot-row--df";
  if (["CM", "DM", "AM", "CDM", "CAM", "RM", "LM", "RAM", "LAM", "RCM", "LCM"].includes(t)) return "sd-slot-row--mf";
  if (["CF", "ST", "RW", "LW", "SS", "RF", "LF"].includes(t)) return "sd-slot-row--fw";
  return "sd-slot-row--na";
}

function confirmReplaceDepthPicks(depth) {
  const count = SquadDepth.countDepthPlayers(depth);
  if (!count) return true;
  return confirm(`Replace current ${count} depth pick${count === 1 ? "" : "s"}?`);
}

function applySquadDepthAutoFill() {
  const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
  const team = state().teams.find((t) => t.id === teamId);
  if (!team) return;
  const roster = squadDepthRoster(team.id);
  if (!roster.length) {
    alert("Add players for this team first.");
    return;
  }
  const current = readSquadDepthFromDom();
  if (!confirmReplaceDepthPicks(current)) return;
  squadDepthDraft = SquadDepth.autoFillDepthFromRoster(current, roster, { replaceExisting: true });
  writeSquadDepthPicksToDom(squadDepthDraft);
  refreshSquadDepthUiFromDraft();
  toast(`Auto-filled ${SquadDepth.countDepthPlayers(squadDepthDraft)} players by role`);
}

function applySquadDepthSeedFromLineup() {
  const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
  const team = state().teams.find((t) => t.id === teamId);
  if (!team) return;
  const sources = listLineupSources(leagueFilter, teamId, 9999, "");
  if (!sources.length) {
    alert("No saved match lineup for this team yet. Enter a lineup in Matches first.");
    return;
  }
  const source = sources[0];
  const current = readSquadDepthFromDom();
  if (!confirmReplaceDepthPicks(current)) return;

  squadDepthDraft = SquadDepth.seedDepthFromLineup(current, source.lineup, (slot) => {
    const byRoster = findRosterPlayerForLineupSlot(teamId, slot);
    if (byRoster) return byRoster;
    const id = String(slot?.playerId ?? slot?.id ?? "").trim();
    if (id) return playersForTeam(teamId).find((p) => p.id === id) ?? null;
    return null;
  });
  writeSquadDepthPicksToDom(squadDepthDraft);
  refreshSquadDepthUiFromDraft();
  const n = SquadDepth.countDepthPlayers(squadDepthDraft);
  toast(n ? `Seeded ${n} from ${source.label}` : `No roster matches from ${source.label}`);
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
      <div class="sd-gk-row sd-gk-row--item">
        <label class="sd-gk-label" for="sdGk${i}"><span class="sd-gk-badge">GK</span> ${i + 1}</label>
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
      const posClass = sdSlotPosClass(slot.tag);
      return `
        <div class="sd-slot-row ${posClass}" id="sdSlotRow${i}">
          <div class="sd-slot-row__stripe" aria-hidden="true"></div>
          <div class="sd-slot-head">
            <span class="sd-slot-num">${i + 1}</span>
            <input id="sdTag${i}" class="sd-tag mw-input${templateLocked ? " sd-tag--locked" : ""}" value="${esc(slot.tag)}" placeholder="LB" aria-label="Slot ${i + 1} tag"${templateLocked ? " readonly" : ""} />
          </div>
          <div class="sd-slot-picks">
            <label class="sd-pick-label" for="sdSlot${i}A">Starter</label>
            <div class="mw-select-wrap mw-select-wrap--compact sd-pick-wrap">
              <select id="sdSlot${i}A" class="sd-pick mw-select" aria-label="Slot ${i + 1} starter">
                ${squadDepthPickOptions(roster, slot.players[0])}
              </select>
            </div>
            <label class="sd-pick-label" for="sdSlot${i}B">Depth</label>
            <div class="mw-select-wrap mw-select-wrap--compact sd-pick-wrap">
              <select id="sdSlot${i}B" class="sd-pick mw-select" aria-label="Slot ${i + 1} depth">
                ${squadDepthPickOptions(roster, slot.players[1])}
              </select>
            </div>
          </div>
        </div>`;
    })
    .join("");

  const meta = squadDepthStatusMeta(depth, roster);
  const chartCount = meta.chartCount;
  const stats = meta.stats;

  const emptyTeam = !team
    ? `<div class="squaddepth-empty">
        <div class="squaddepth-empty__icon" aria-hidden="true"></div>
        <p class="squaddepth-empty__title">No teams yet</p>
        <p class="squaddepth-empty__text">Add teams in the <strong>Teams</strong> tab first, then return here to build depth charts.</p>
      </div>`
    : !roster.length
      ? `<div class="squaddepth-empty">
          <div class="squaddepth-empty__icon" aria-hidden="true"></div>
          <p class="squaddepth-empty__title">No squad yet</p>
          <p class="squaddepth-empty__text">Add players for <strong>${esc(team.name)}</strong> in the <strong>Players</strong> tab first.</p>
        </div>`
      : "";

  const lineupSources = team ? listLineupSources(leagueFilter, team.id, 9999, "") : [];
  const seedHint = lineupSources[0]?.label ? `Latest: ${lineupSources[0].label}` : "Needs a saved match XI";

  return `
    <div class="mw-page squaddepth-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Squad setup</p>
            <h2 class="mw-heading">Squad depth</h2>
            <p class="mw-lead">Set the formation and pick players for the public depth chart — up to <strong>3 goalkeepers</strong> and <strong>10 positions × 2</strong>. Use <strong>Auto-fill</strong> or <strong>Seed from last XI</strong>, then check the pitch preview.</p>
            <div id="sdStatChips">${team && roster.length ? squadDepthStatChipsHtml(stats) : ""}</div>
          </div>
          <aside class="mw-hero__aside">
            <div class="squaddepth-hero-preview">
              ${adminTeamCrestHtml(team)}
              <div class="mw-hero-preview squaddepth-hero-preview__box" id="sdHeroMeta">
                <span class="mw-hero-preview-label">${esc(team?.name ?? leagueName)}</span>
                <strong class="mw-hero-preview-title">${esc(depth.formation)}</strong>
                <span class="mw-hero-preview-range">${chartCount} on chart · ${roster.length} in squad</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--form" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--depth" aria-hidden="true"></div>
          <div>
            <h3>Depth chart editor</h3>
            <p>Formation drives the 10 outfield slots. The pitch on the right mirrors the live site — edits update instantly before you save.</p>
          </div>
        </div>
        <div class="squaddepth-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
            <div class="col-12 col-md-6 col-lg-4">
              <div class="mw-field mb-0">
                <label for="sdTeam">Team</label>
                <div class="mw-select-wrap">
                  <select id="sdTeam" class="mw-select"${teams.length ? "" : " disabled"}>
                    ${teamOptionTags(teams, teamId)}
                  </select>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
              <div class="mw-field mb-0">
                <label for="sdFormation">Formation</label>
                <input id="sdFormation" class="mw-input squaddepth-formation-input" value="${esc(depth.formation)}" placeholder="4-2-3-1" list="sdFormationList" autocomplete="off" />
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
        </div>
        ${emptyTeam}
        ${
          team && roster.length
            ? `
          <p class="sd-status ${meta.statusClass}" id="sdStatus" aria-live="polite">${esc(meta.statusText)}</p>
          <div class="sd-toolbar">
            <button type="button" class="mw-btn-ghost sd-tool-btn" id="btnSdAutoFill" title="Place squad by position/role">Auto-fill by role</button>
            <button type="button" class="mw-btn-ghost sd-tool-btn" id="btnSdSeedLineup" title="${esc(seedHint)}">Seed from last XI</button>
            <span class="sd-toolbar__hint admin-muted">${esc(seedHint)}</span>
          </div>
          <div class="sd-workspace">
            <div class="sd-editor-grid">
              <section class="sd-block sd-block--gk">
                <div class="sd-block__stripe sd-block__stripe--gk" aria-hidden="true"></div>
                <h4 class="sd-block-title"><span class="sd-block-title__icon sd-block-title__icon--gk" aria-hidden="true"></span>Goalkeepers <span class="sd-block-count">up to 3</span></h4>
                <div class="sd-gk-grid">${gkRows}</div>
              </section>
              <section class="sd-block sd-block--slots">
                <div class="sd-pitch-bg" aria-hidden="true">
                  <div class="sd-pitch-bg__stripes"></div>
                  <div class="sd-pitch-bg__circle"></div>
                </div>
                <div class="sd-block__stripe sd-block__stripe--outfield" aria-hidden="true"></div>
                <h4 class="sd-block-title"><span class="sd-block-title__icon sd-block-title__icon--outfield" aria-hidden="true"></span>Outfield slots <span class="sd-block-count">10 × 2 (optional)</span></h4>
                <div class="sd-slot-grid">${slotRows}</div>
              </section>
            </div>
            <aside class="sd-preview-panel" aria-label="Depth chart pitch preview">
              <div class="sd-preview-panel__head">
                <h4 class="sd-preview-panel__title">Pitch preview</h4>
                <span class="sd-preview-panel__live">Live layout</span>
              </div>
              <div class="sd-preview-panel__body" id="sdPitchPreview">
                ${renderAdminSquadDepthPitch(team, depth, roster)}
              </div>
            </aside>
          </div>
          <div class="squaddepth-form-footer">
            <button type="button" class="mw-btn-primary squaddepth-save-btn" id="btnSaveSquadDepth">Save depth chart</button>
            <button type="button" class="mw-btn-ghost squaddepth-reset-btn" id="btnResetSquadDepth">Reset picks</button>
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

function nationalDutyStats(entries, roster) {
  const countries = new Set(entries.map((e) => String(e.country ?? "").trim()).filter(Boolean));
  const withUntil = entries.filter((e) => String(e.until ?? "").trim()).length;
  return {
    onDuty: entries.length,
    countries: countries.size,
    withUntil,
    squad: roster.length,
  };
}

function nationalDutyStatChipsHtml(stats) {
  return `<div class="nationalduty-stat-row" aria-label="National duty summary">
    <span class="nationalduty-stat-chip nationalduty-stat-chip--duty"><span class="nationalduty-stat-chip__label">On duty</span><span class="nationalduty-stat-chip__val">${stats.onDuty}</span></span>
    <span class="nationalduty-stat-chip nationalduty-stat-chip--countries"><span class="nationalduty-stat-chip__label">Countries</span><span class="nationalduty-stat-chip__val">${stats.countries}</span></span>
    <span class="nationalduty-stat-chip nationalduty-stat-chip--until"><span class="nationalduty-stat-chip__label">With return date</span><span class="nationalduty-stat-chip__val">${stats.withUntil}</span></span>
    <span class="nationalduty-stat-chip nationalduty-stat-chip--squad"><span class="nationalduty-stat-chip__label">Squad</span><span class="nationalduty-stat-chip__val">${stats.squad}</span></span>
  </div>`;
}

function nationalDutyEmptyListHtml() {
  return `<div class="nationalduty-empty-list">
    <p class="nationalduty-empty-list__text">No players on national duty yet — use <strong>Add player</strong> or <strong>Add by nationality</strong> below.</p>
  </div>`;
}

function nationalDutyWindowFromMeta(meta) {
  if (typeof NationalDuty !== "undefined") {
    return NationalDuty.normalizeWindow({
      from: meta?.nationalDutyFrom,
      until: meta?.nationalDutyUntil,
    });
  }
  return {
    from: String(meta?.nationalDutyFrom ?? "").trim(),
    until: String(meta?.nationalDutyUntil ?? "").trim(),
  };
}

function nationalDutyWindowStatus(meta) {
  const window = nationalDutyWindowFromMeta(meta);
  if (typeof NationalDuty !== "undefined") return NationalDuty.windowStatus(window);
  if (!window.from && !window.until) {
    return { key: "missing", label: "Missing dates", active: false, window };
  }
  return { key: "inactive", label: "Not active", active: false, window };
}

function nationalDutyWindowBarHtml(meta) {
  const status = nationalDutyWindowStatus(meta);
  const { from, until } = status.window;
  return `<section class="mw-card mw-card--striped nationalduty-window-card">
    <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
    <div class="mw-card-head mw-card-head--icon">
      <div class="mw-card-head__icon mw-card-head__icon--duty" aria-hidden="true"></div>
      <div>
        <h3>Live window</h3>
        <p>Live Squads only shows national duty inside this date range. Leave both blank to hide duty on the public site.</p>
      </div>
    </div>
    <div class="nationalduty-window-bar">
      <div class="row g-2 g-md-3 align-items-end">
        <div class="col-6 col-md-3 col-lg-2">
          <div class="mw-field mb-0">
            <label for="ndWindowFrom">From</label>
            <input id="ndWindowFrom" class="mw-input" type="date" value="${esc(from)}" />
          </div>
        </div>
        <div class="col-6 col-md-3 col-lg-2">
          <div class="mw-field mb-0">
            <label for="ndWindowUntil">Until</label>
            <input id="ndWindowUntil" class="mw-input" type="date" value="${esc(until)}" />
          </div>
        </div>
        <div class="col-12 col-md-6 col-lg-4">
          <div class="nationalduty-window-status nationalduty-window-status--${esc(status.key)}" id="ndWindowStatus">
            <span class="nationalduty-window-status__label">${esc(status.label)}</span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function nationalDutyNationalityOptions(roster, selected = []) {
  const counts = new Map();
  for (const p of roster ?? []) {
    const nat = String(p.nationality ?? "").trim();
    if (!nat) continue;
    counts.set(nat, (counts.get(nat) || 0) + 1);
  }
  const selectedSet = new Set(selected);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nat, n]) => {
      const sel = selectedSet.has(nat) ? " selected" : "";
      return `<option value="${esc(nat)}"${sel}>${esc(nat)} · ${n}</option>`;
    })
    .join("");
}

function nationalDutyBulkBarHtml(roster) {
  const natOpts = nationalDutyNationalityOptions(roster);
  return `<div class="nationalduty-bulk-bar">
    <div class="nationalduty-bulk-bar__row">
      <div class="mw-field mb-0 nationalduty-bulk-bar__nats">
        <label for="ndBulkNats">Add by nationality</label>
        <div class="mw-select-wrap">
          <select id="ndBulkNats" class="mw-select" multiple size="4" aria-label="Nationalities to add"${
            natOpts ? "" : " disabled"
          }>
            ${natOpts || `<option value="">No nationalities on squad</option>`}
          </select>
        </div>
        <p class="mw-field-note admin-muted">Hold Ctrl/Cmd to pick several. Adds roster players not already on duty.</p>
      </div>
      <div class="nationalduty-bulk-bar__actions">
        <button type="button" class="mw-btn-ghost" id="btnNdAddByNat"${natOpts ? "" : " disabled"}>Add selected</button>
        <button type="button" class="mw-btn-ghost" id="btnNdApplyUntil">Apply window until</button>
        <button type="button" class="mw-btn-danger" id="btnNdClearAll">Clear all</button>
      </div>
    </div>
  </div>`;
}

function nationalDutyPlayerFlagHtml(playerId) {
  const player = state().players.find((p) => p.id === playerId);
  const flag =
    player?.flag ||
    (player?.nationality?.trim() && typeof NationalityFlags !== "undefined"
      ? NationalityFlags.getFlag(player.nationality)
      : "") ||
    "";
  if (!flag) {
    return `<span class="nd-card__flag nd-card__flag--empty" aria-hidden="true"></span>`;
  }
  return `<span class="nd-card__flag" aria-hidden="true">${esc(flag)}</span>`;
}

function nationalDutyRowHtml(teamId, entry, rowKey) {
  const roster = squadDepthRoster(teamId);
  const playerOpts = squadDepthPickOptions(roster, entry.playerId);
  const key = rowKey ?? nationalDutyRowKey(entry, 0);
  return `<article class="nd-card nd-row nd-sort-row" draggable="true" data-nd-row-key="${esc(key)}">
    <div class="nd-card__stripe" aria-hidden="true"></div>
    <span class="player-drag-handle nd-card__drag" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span>
    ${nationalDutyPlayerFlagHtml(entry.playerId)}
    <div class="nd-card__grid">
      <div class="nd-field nd-field--player">
        <label class="nd-field-label">Player</label>
        <div class="mw-select-wrap mw-select-wrap--compact nd-player-wrap">
          <select class="nd-player mw-select" aria-label="Player">${playerOpts}</select>
        </div>
      </div>
      <div class="nd-field nd-field--country">
        <label class="nd-field-label">Country</label>
        <input class="nd-country mw-input" value="${esc(entry.country ?? "")}" placeholder="Ecuador" aria-label="Country" autocomplete="off" />
      </div>
      <div class="nd-field nd-field--note">
        <label class="nd-field-label">Note</label>
        <input class="nd-note mw-input" value="${esc(entry.note ?? "")}" placeholder="FIFA window, friendly…" aria-label="Note" autocomplete="off" />
      </div>
      <div class="nd-field nd-field--until">
        <label class="nd-field-label">Until</label>
        <input class="nd-until mw-input" type="date" value="${esc(transferDateToInputValue(entry.until))}" aria-label="Until date" />
      </div>
    </div>
    <button type="button" class="mw-btn-danger nd-del" title="Remove row">×</button>
  </article>`;
}

function readNationalDutyFromDom() {
  const list = $("#ndList");
  if (!list) return [];
  return [...list.querySelectorAll(".nd-row")]
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
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
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
  const stats = nationalDutyStats(entries, roster);
  const windowStatus = nationalDutyWindowStatus(meta);

  if (isWorldCup) {
    return `
      <div class="mw-page nationalduty-page">
        <header class="mw-hero mw-hero--stadium">
          <div class="mw-hero__atmosphere" aria-hidden="true">
            <div class="mw-hero__glow"></div>
            <div class="mw-hero__pitch"></div>
            <div class="mw-hero__markings"></div>
          </div>
          <div class="mw-hero__grid">
            <div class="mw-hero__copy">
              <p class="mw-eyebrow mw-eyebrow--live">International windows</p>
              <h2 class="mw-heading">National duty</h2>
              <p class="mw-lead">Track club players away on international duty. This applies to <strong>club leagues</strong> only — not the World Cup tournament squads.</p>
            </div>
            <aside class="mw-hero__aside">
              <div class="mw-hero-preview nationalduty-hero-preview__box nationalduty-hero-preview--empty">
                <span class="mw-hero-preview-label">World Cup</span>
                <strong class="mw-hero-preview-title">Not available</strong>
                <span class="mw-hero-preview-range">Club leagues only</span>
              </div>
            </aside>
          </div>
        </header>
        <section class="mw-card mw-card--striped">
          <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
          <div class="mw-card-head mw-card-head--icon">
            <div class="mw-card-head__icon mw-card-head__icon--duty" aria-hidden="true"></div>
            <div>
              <h3>Switch league</h3>
              <p>Choose a domestic league below to manage national duty lists.</p>
            </div>
          </div>
          <div class="nationalduty-filter-bar">
            <div class="row g-2 g-md-3">
              <div class="col-12 col-md-6 col-lg-4">
                ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
              </div>
            </div>
          </div>
        </section>
      </div>`;
  }

  const emptyTeam = !team
    ? `<div class="nationalduty-empty">
        <div class="nationalduty-empty__icon" aria-hidden="true"></div>
        <p class="nationalduty-empty__title">No teams yet</p>
        <p class="nationalduty-empty__text">Add teams in the <strong>Teams</strong> tab first, then return here to track international duty.</p>
      </div>`
    : !roster.length
      ? `<div class="nationalduty-empty">
          <div class="nationalduty-empty__icon" aria-hidden="true"></div>
          <p class="nationalduty-empty__title">No squad yet</p>
          <p class="nationalduty-empty__text">Add players for <strong>${esc(team.name)}</strong> in the <strong>Players</strong> tab first.</p>
        </div>`
      : "";

  const listBody = entries.length
    ? entries.map((e, i) => nationalDutyRowHtml(teamId, e, nationalDutyRowKey(e, i))).join("")
    : nationalDutyEmptyListHtml();

  return `
    <div class="mw-page nationalduty-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">International windows</p>
            <h2 class="mw-heading">National duty</h2>
            <p class="mw-lead">List squad players away with their national team. Live Squads shows duty only when the league window status is <strong>Active now</strong>${
              windowStatus.key === "active" ? "" : ` (currently <strong>${esc(windowStatus.label)}</strong>)`
            }.</p>
            ${team && roster.length ? nationalDutyStatChipsHtml(stats) : ""}
          </div>
          <aside class="mw-hero__aside">
            <div class="nationalduty-hero-preview">
              ${adminTeamCrestHtml(team)}
              <div class="mw-hero-preview nationalduty-hero-preview__box">
                <span class="mw-hero-preview-label">${esc(team?.name ?? "Club")}</span>
                <strong class="mw-hero-preview-title">${count} on duty</strong>
                <span class="mw-hero-preview-range">${esc(leagueName)} · ${esc(windowStatus.label)}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      ${nationalDutyWindowBarHtml(meta)}

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--duty" aria-hidden="true"></div>
          <div>
            <h3>Duty list${team ? ` · ${esc(team.name)}` : ""}</h3>
            <p>Pick players from the club squad or bulk-add by nationality. Drag rows to arrange display order. Country defaults from the player profile when you select them.</p>
          </div>
        </div>
        <div class="nationalduty-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
            <div class="col-12 col-md-6 col-lg-4">
              <div class="mw-field mb-0">
                <label for="ndTeam">Club</label>
                <div class="mw-select-wrap">
                  <select id="ndTeam" class="mw-select"${teams.length ? "" : " disabled"}>${teamOpts}</select>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${
          emptyTeam
            ? emptyTeam
            : `${nationalDutyBulkBarHtml(roster)}
        <div class="nd-list-wrap admin-table-wrap admin-table-wrap--sort">
          <div class="nd-list" id="ndList">${listBody}</div>
        </div>
        <div class="nationalduty-form-footer">
          <button type="button" class="mw-btn-ghost nationalduty-add-btn" id="btnNdAdd">Add player</button>
          <button type="button" class="mw-btn-primary nationalduty-save-btn" id="btnSaveNationalDuty">Save for ${esc(team.name)}</button>
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

function scorersStats(rows, teams) {
  const filled = rows.filter(([name, club]) => String(name ?? "").trim() && String(club ?? "").trim()).length;
  const totalGoals = rows.reduce((s, [, , g]) => s + (Number(g) || 0), 0);
  const maxGoals = rows.reduce((m, [, , g]) => Math.max(m, Number(g) || 0), 0);
  const leader = rows.find(([name]) => String(name ?? "").trim()) ?? rows[0];
  const leaderName = leader ? String(leader[0] ?? "").trim() : "";
  const leaderClub = leader ? String(leader[1] ?? "").trim() : "";
  const leaderGoals = leader ? Number(leader[2]) || 0 : 0;
  return {
    count: rows.length,
    filled,
    totalGoals,
    maxGoals,
    leaderName,
    leaderClub,
    leaderGoals,
    teams: teams.length,
  };
}

function scorersStatChipsHtml(stats) {
  return `<div class="scorers-stat-row" aria-label="Top scorers summary">
    <span class="scorers-stat-chip scorers-stat-chip--rows"><span class="scorers-stat-chip__label">Scorers</span><span class="scorers-stat-chip__val">${stats.count}</span></span>
    <span class="scorers-stat-chip scorers-stat-chip--total"><span class="scorers-stat-chip__label">Total goals</span><span class="scorers-stat-chip__val">${stats.totalGoals}</span></span>
    <span class="scorers-stat-chip scorers-stat-chip--leader"><span class="scorers-stat-chip__label">Golden boot</span><span class="scorers-stat-chip__val">${stats.leaderGoals}</span></span>
    <span class="scorers-stat-chip scorers-stat-chip--teams"><span class="scorers-stat-chip__label">In league</span><span class="scorers-stat-chip__val">${stats.teams}</span></span>
  </div>`;
}

function scorersEmptyListHtml() {
  return `<div class="scorers-empty-list">
    <p class="scorers-empty-list__text">No scorers yet — use <strong>Add row</strong> below.</p>
  </div>`;
}

function scorersGoalsMeterHtml(goals, maxGoals) {
  const goalsNum = Number(goals) || 0;
  const max = Number(maxGoals) || 0;
  const pct = max > 0 ? Math.round((goalsNum / max) * 100) : 0;
  return `<div class="sc-goals-meter" aria-hidden="true"><span class="sc-goals-meter__fill" style="width:${pct}%"></span></div>`;
}

function scorersRankHtml(index, goals) {
  const rank = index + 1;
  const boot = rank === 1 && Number(goals) > 0 ? `<span class="sc-card__boot" title="Golden boot leader" aria-hidden="true"></span>` : "";
  return `<div class="sc-card__rank">
    <span class="sc-card__rank-num">${rank}</span>${boot}
  </div>`;
}

function renderScorerRowHtml(name, club, goals, index, teams, maxGoals = 0) {
  const team = standingsTeamForClub(club, teams);
  const teamId = team?.id ?? teamIdForClubName(leagueFilter, club);
  const tier = standingsRankTierClass(index + 1);
  return `<article class="sc-card sc-row scorer-row ${tier}" data-i="${index}">
    <div class="sc-card__stripe" aria-hidden="true"></div>
    ${scorersRankHtml(index, goals)}
    <div class="sc-card__crest" data-sc-crest>${adminTeamCrestHtml(team)}</div>
    <div class="sc-card__grid">
      <div class="sc-field sc-field--club">
        <label class="sc-field-label">Club</label>
        ${standingsClubSelectHtml(club, teams)}
      </div>
      <div class="sc-field sc-field--player sc-player-cell">
        <label class="sc-field-label">Player</label>
        ${scorersPlayerSelectHtml(teamId, name)}
      </div>
      <div class="sc-field sc-field--goals">
        <label class="sc-field-label">Goals</label>
        <input class="sc-goals scorers-input scorers-input--goals mw-input" type="number" min="0" value="${esc(goals)}" aria-label="Goals" data-sc-max="${esc(maxGoals)}" />
        ${scorersGoalsMeterHtml(goals, maxGoals)}
      </div>
    </div>
    <button type="button" class="mw-btn-danger scorers-del-btn sc-del" title="Remove row">×</button>
  </article>`;
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
    clearTmSyncState();
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
  const team = teams.find((t) => t.id === teamId);
  const teamName = team?.name ?? "—";
  const playerCount = players.length;
  const posBreak = squadPositionBreakdown(players);
  const dragHint = isWorldCup
    ? " Drag the <strong>⋮⋮</strong> handle to reorder. For World Cup squads, set each player’s <strong>club</strong> (domestic team)."
    : " Drag the <strong>⋮⋮</strong> handle to reorder the squad list. Order saves when you drop a row and appears on the public site.";
  const posChipsHtml =
    teamId && playerCount
      ? `<div class="players-pos-breakdown" aria-label="Squad by position">
          ${["GK", "DF", "MF", "FW"]
            .map(
              (k) =>
                `<span class="players-pos-chip players-pos-chip--${k.toLowerCase()}"><span class="players-pos-chip__key">${k}</span><span class="players-pos-chip__val">${posBreak[k]}</span></span>`,
            )
            .join("")}
        </div>`
      : "";

  const rosterBody = !teams.length
    ? `<p class="admin-muted mb-0">Add teams in the <strong>Teams</strong> tab first, then return here to manage squads.</p>`
    : `<div class="players-roster-wrap admin-table-wrap admin-table-wrap--sort">
          <div class="players-roster-list" id="playersSortTbody">${players.map((p) => playerRosterCardHtml(p, isWorldCup)).join("")}</div>
          <p class="players-roster-empty admin-hidden" id="playersRosterEmpty">No players match your search.</p>
        </div>`;

  return `
    <div class="mw-page players-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Squad roster</p>
            <h2 class="mw-heading">Players</h2>
            <p class="mw-lead">Edit squad members, drag to set list order, and manage nationality flags for the public site.</p>
            ${posChipsHtml}
          </div>
          <aside class="mw-hero__aside">
            <div class="players-team-preview">
              ${adminTeamCrestHtml(team)}
              <div class="mw-hero-preview players-hero-preview">
                <span class="mw-hero-preview-label">${esc(teamName)}</span>
                <strong class="mw-hero-preview-title">${playerCount} player${playerCount === 1 ? "" : "s"}</strong>
                <span class="mw-hero-preview-range">${esc(leagueName)}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--squad" aria-hidden="true"></div>
          <div>
            <h3>Squad list</h3>
            <p>${teams.length ? `${playerCount} in ${esc(teamName)}` : "No teams in this league yet"}.${dragHint}</p>
          </div>
        </div>
        <div class="players-filter-bar">
          <div class="row g-2 g-md-3 players-filter-row">
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
                  <span class="players-search-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                  </span>
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
        </div>
        ${teamId ? tmSyncPanelHtml(team, teamId) : ""}
        ${
          playerCount > 0
            ? `<div class="players-toolbar">
                <div class="players-toolbar-actions">
                  ${
                    playerCount > 1
                      ? `<button type="button" class="mw-btn-primary players-auto-btn" id="btnAutoArrange">Auto-arrange by position</button>
                  <button type="button" class="mw-btn-ghost players-auto-btn" id="btnSortByNumber">Sort by jersey #</button>`
                      : ""
                  }
                  <button type="button" class="mw-btn-ghost players-auto-btn" id="btnFillBlankPitchLabels">Fill blank pitch labels</button>
                </div>
                <span class="admin-muted players-toolbar-hint">${
                  playerCount > 1
                    ? "Position / jersey tools reorder the squad. Pitch labels: one click fills empty short names from each player’s full name (keeps custom labels)."
                    : "Pitch labels: fill empty short names from the player’s full name (keeps a custom label if set)."
                }</span>
              </div>`
            : ""
        }
        ${rosterBody}
      </section>

      <section class="mw-card mw-card--striped" id="playerTransferCard">
        <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--transfer" aria-hidden="true"></div>
          <div>
            <h3>Transfer player</h3>
            <p>Move a squad member to another club in this league. They are removed from the current team and added to the destination roster. Squad depth picks on the old team are cleared automatically.</p>
          </div>
        </div>
        ${
          !teams.length || !teamId
            ? `<p class="admin-muted mb-0">Select a team above to transfer players.</p>`
            : `<div class="row g-2 g-md-3 align-items-end players-transfer-row">
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
            <button type="button" class="mw-btn-primary w-100 players-transfer-btn" id="btnExecuteTransfer">Transfer player</button>
          </div>
        </div>`
        }
      </section>

      <section class="mw-card mw-card--striped" id="playerFormCard">
        <div class="mw-card__stripe mw-card__stripe--form" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--player" aria-hidden="true"></div>
          <div>
            <h3 id="playerFormTitle">Add player</h3>
            <p>Role controls default sort order on the public squad page (GK → CB → … → CF). Mark <strong>Captain</strong> with the toggle — do not add (C) to the name.</p>
          </div>
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
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field players-form-pitch">
              <label for="playerDisplayLastName">Pitch label <span class="admin-muted">(short)</span></label>
              <div class="player-flag-row">
                <input
                  id="playerDisplayLastName"
                  class="mw-input"
                  maxlength="20"
                  placeholder="e.g. Foden — leave blank to auto-derive"
                  autocomplete="off"
                />
                <button type="button" class="mw-btn-ghost players-fill-btn" id="btnFillPitchLabel" title="Fill from player name">Fill</button>
              </div>
              <p class="mw-field-note admin-muted">Shown on pitch lineups. Blank = auto from last name. Max 20 characters.</p>
            </div>
          </div>
          <div class="col-12 col-md-6 col-lg-4">
            <div class="mw-field players-captain-field">
              <span class="mw-field-label">Captain</span>
              <label class="players-captain-toggle" for="playerCaptain">
                <input id="playerCaptain" type="checkbox" />
                <span class="players-captain-badge" aria-hidden="true">C</span>
                <span class="players-captain-text">Club captain</span>
              </label>
              <p class="mw-field-note admin-muted">Only one captain per team. Others are cleared automatically.</p>
            </div>
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

function matchesStats(list) {
  const totalGoals = list.reduce(
    (s, m) => s + (Number(m.score?.[0]) || 0) + (Number(m.score?.[1]) || 0),
    0,
  );
  const homeWins = list.filter((m) => (Number(m.score?.[0]) || 0) > (Number(m.score?.[1]) || 0)).length;
  const awayWins = list.filter((m) => (Number(m.score?.[1]) || 0) > (Number(m.score?.[0]) || 0)).length;
  const draws = list.filter((m) => (Number(m.score?.[0]) || 0) === (Number(m.score?.[1]) || 0)).length;
  return { count: list.length, totalGoals, homeWins, awayWins, draws };
}

function matchesStatChipsHtml(stats) {
  return `<div class="matches-stat-row" aria-label="Matchweek summary">
    <span class="matches-stat-chip matches-stat-chip--fixtures"><span class="matches-stat-chip__label">Fixtures</span><span class="matches-stat-chip__val">${stats.count}</span></span>
    <span class="matches-stat-chip matches-stat-chip--goals"><span class="matches-stat-chip__label">Goals</span><span class="matches-stat-chip__val">${stats.totalGoals}</span></span>
    <span class="matches-stat-chip matches-stat-chip--home"><span class="matches-stat-chip__label">Home wins</span><span class="matches-stat-chip__val">${stats.homeWins}</span></span>
    <span class="matches-stat-chip matches-stat-chip--draws"><span class="matches-stat-chip__label">Draws</span><span class="matches-stat-chip__val">${stats.draws}</span></span>
  </div>`;
}

function matchCardHtml(m) {
  const homeTeam = state().teams.find((t) => t.id === m.homeTeamId);
  const awayTeam = state().teams.find((t) => t.id === m.awayTeamId);
  const homeName = homeTeam?.name ?? m.homeTeamId;
  const awayName = awayTeam?.name ?? m.awayTeamId;
  const hScore = m.score?.[0] ?? 0;
  const aScore = m.score?.[1] ?? 0;
  const homeWin = hScore > aScore;
  const awayWin = aScore > hScore;
  const status = String(m.status ?? "FT").trim() || "FT";
  return `<article class="match-card" data-match-id="${esc(m.id)}">
    <div class="match-card__stripe" aria-hidden="true"></div>
    <div class="match-card__meta">
      <span class="match-card__day">${esc(m.time ?? "—")}</span>
      <span class="match-card__status match-card__status--${esc(status.toLowerCase().replace(/\s+/g, ""))}">${esc(status)}</span>
    </div>
    <div class="match-card__fixture">
      <div class="match-card__team match-card__team--home${homeWin ? " match-card__team--win" : ""}">
        <span class="match-card__crest">${adminTeamCrestHtml(homeTeam)}</span>
        <span class="match-card__name">${esc(homeName)}</span>
      </div>
      <div class="match-card__scoreboard" aria-label="Score ${hScore} to ${aScore}">
        <span class="match-card__score-num${homeWin ? " match-card__score-num--win" : ""}">${esc(hScore)}</span>
        <span class="match-card__score-sep">–</span>
        <span class="match-card__score-num${awayWin ? " match-card__score-num--win" : ""}">${esc(aScore)}</span>
      </div>
      <div class="match-card__team match-card__team--away${awayWin ? " match-card__team--win" : ""}">
        <span class="match-card__crest">${adminTeamCrestHtml(awayTeam)}</span>
        <span class="match-card__name">${esc(awayName)}</span>
      </div>
    </div>
    ${
      m.stadium && m.stadium !== "—"
        ? `<p class="match-card__venue">${esc(m.stadium)}</p>`
        : ""
    }
    <div class="match-card__actions">
      <button type="button" class="mw-btn-ghost matches-row-btn match-card__edit" data-edit-match="${esc(m.id)}">Edit</button>
      <button type="button" class="mw-btn-danger matches-row-btn match-card__del" data-del-match="${esc(m.id)}">Remove</button>
    </div>
  </article>`;
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
  const stats = matchesStats(list);

  const rosterBody =
    list.length === 0
      ? `<div class="matches-empty">
          <div class="matches-empty__icon" aria-hidden="true"></div>
          <p class="matches-empty__title">No matches yet</p>
          <p class="matches-empty__text">Add one below or use the <strong>Matchweek</strong> tab for full fixture editing with goals, assists, and lineups.</p>
        </div>`
      : `<div class="matches-list-wrap">
          <div class="matches-list" id="matchesList">${list.map((m) => matchCardHtml(m)).join("")}</div>
        </div>`;

  return `
    <div class="mw-page matches-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Quick fixtures</p>
            <h2 class="mw-heading">Matches</h2>
            <p class="mw-lead">${isWc ? "Add or edit basic scores for any World Cup fixture. For goals, assists, and lineups use the <strong>Matchweek</strong> tab." : "Add or edit basic scores for the current gameweek. For goals, assists, and lineups use the <strong>Matchweek</strong> tab."}</p>
            ${list.length ? matchesStatChipsHtml(stats) : ""}
          </div>
          <aside class="mw-hero__aside">
            <div class="mw-hero-preview matches-hero-preview__box">
              <span class="mw-hero-preview-label">${esc(mwTitle)}</span>
              <strong class="mw-hero-preview-title">${list.length} match${list.length === 1 ? "" : "es"}</strong>
              <span class="mw-hero-preview-range">${esc(leagueName)}</span>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--matches" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--matches-fixtures" aria-hidden="true"></div>
          <div>
            <h3>${isWc ? "All fixtures" : `MW ${mw} fixtures`}</h3>
            <p>${list.length} match${list.length === 1 ? "" : "es"}${isWc ? " · every round is kept" : " in this gameweek"} · quick edit only.</p>
          </div>
        </div>
        <div class="matches-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
            ${
              isWc
                ? ""
                : `<div class="col-12 col-md-6 col-lg-4">
              ${matchweekSelectField(leagueFilter, mw, {
                id: "mwNum",
                label: "Filter by matchweek",
              })}
            </div>`
            }
          </div>
        </div>
        ${rosterBody}
      </section>

      <section class="mw-card mw-card--striped" id="matchFormCard">
        <div class="mw-card__stripe mw-card__stripe--matches" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--matches-add" aria-hidden="true"></div>
          <div>
            <h3 id="matchFormTitle">Add match</h3>
            <p>${isWc ? "Creates a World Cup fixture. Set the round/stage label below." : `Creates a fixture for MW ${mw}.`} Stadiums are chosen from the <strong>Stadiums</strong> tab list.</p>
          </div>
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
        </div>
        <div class="matches-scoreboard-form">
          <div class="matches-scoreboard-form__pitch" aria-hidden="true">
            <div class="matches-scoreboard-form__stripes"></div>
            <div class="matches-scoreboard-form__circle"></div>
          </div>
          <div class="matches-scoreboard-form__grid">
            <div class="matches-scoreboard-form__side">
              <span class="matches-scoreboard-form__label">Home</span>
              <input id="matchHomeScore" class="mw-input mw-input--score matches-scoreboard-form__input" type="number" min="0" value="0" aria-label="Home goals" />
            </div>
            <span class="matches-scoreboard-form__vs" aria-hidden="true">VS</span>
            <div class="matches-scoreboard-form__side matches-scoreboard-form__side--away">
              <span class="matches-scoreboard-form__label">Away</span>
              <input id="matchAwayScore" class="mw-input mw-input--score matches-scoreboard-form__input" type="number" min="0" value="0" aria-label="Away goals" />
            </div>
          </div>
        </div>
        <div class="matches-form-footer">
          <button type="button" class="mw-btn-primary matches-save-btn" id="btnSaveMatch">Save match</button>
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
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Group stage</p>
            <h2 class="mw-heading">Standings</h2>
            <p class="mw-lead">Assign countries to groups A–L (4 per group). Change a country’s group by picking a different group slot.</p>
            <div class="standings-stat-row" aria-label="World Cup groups summary">
              <span class="standings-stat-chip standings-stat-chip--rows"><span class="standings-stat-chip__label">Groups</span><span class="standings-stat-chip__val">${groupIds.length}</span></span>
              <span class="standings-stat-chip standings-stat-chip--filled"><span class="standings-stat-chip__label">Per group</span><span class="standings-stat-chip__val">${groupSize}</span></span>
              <span class="standings-stat-chip standings-stat-chip--teams"><span class="standings-stat-chip__label">Countries</span><span class="standings-stat-chip__val">${teams.length}</span></span>
            </div>
          </div>
          <aside class="mw-hero__aside">
            <div class="mw-hero-preview standings-hero-preview__box standings-hero-preview--wc">
              <span class="mw-hero-preview-label">${esc(leagueName)}</span>
              <strong class="mw-hero-preview-title">${groupIds.length} groups</strong>
              <span class="mw-hero-preview-range">${groupSize} teams each</span>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--standings" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--standings" aria-hidden="true"></div>
          <div>
            <h3>Group standings</h3>
            <p>Countries are chosen from the <strong>Teams</strong> list. Save when all groups are set.</p>
          </div>
        </div>
        <div class="standings-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
          </div>
        </div>
        <div class="row g-3 wc-groups-grid">${sections}</div>
        <div class="standings-form-footer">
          <button type="button" class="mw-btn-primary standings-save-btn" id="btnSaveStandings">Save group standings</button>
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
    : { leagueId, in: [], out: [], promoted: [], loanReturn: [], loanRecall: [] };
}

function transferDirectionIncoming(mode) {
  return mode === "in" || mode === "loanReturn" || mode === "promoted";
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

/** Prefer the visible panel on new DB/manual cards so hidden sibling fields are not read. */
function transferCardActiveRoot(card) {
  if (!card) return null;
  const manual = card.querySelector(".tr-manual-panel");
  const db = card.querySelector(".tr-db-panel");
  if (manual && !manual.classList.contains("admin-hidden")) return manual;
  if (db && !db.classList.contains("admin-hidden")) return db;
  return card;
}

function transferCardQuery(card, selector) {
  const root = transferCardActiveRoot(card) || card;
  return root?.querySelector(selector) ?? null;
}

function transferCardInputValue(card, selector) {
  return transferCardQuery(card, selector)?.value?.trim() ?? "";
}

function transfersForTeam(leagueId, teamId) {
  const team = state().teams.find((t) => t.id === teamId);
  const club = team?.name ?? "";
  const block = transfersBlock(leagueId);
  const match = (t) => transferRowBelongsToTeam(leagueId, teamId, t);
  return {
    in: (block.in ?? []).filter(match),
    out: (block.out ?? []).filter(match),
    promoted: (block.promoted ?? []).filter(match),
    loanReturn: (block.loanReturn ?? []).filter(match),
    loanRecall: (block.loanRecall ?? []).filter(match),
  };
}

/** Trust the saved club stamp — rows stay valid after squad changes (recall, transfer out, etc.). */
function transferRowBelongsToTeam(leagueId, teamId, row) {
  const team = state().teams.find((t) => t.id === teamId);
  const club = team?.name ?? "";
  return Boolean(row?.player && row.club === club);
}

function mergeTeamTransfersIntoLeague(leagueId, teamId, teamLists) {
  const teamName = state().teams.find((t) => t.id === teamId)?.name ?? "";
  const block = transfersBlock(leagueId);
  const keys = FCDataStore?.TRANSFER_LIST_KEYS ?? ["in", "out", "promoted", "loanReturn", "loanRecall"];
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

function stashTmTransferSquadPrefill(row) {
  const player = String(row?.player ?? "").trim();
  if (!player || typeof TransfermarktSync === "undefined") return;
  const pos = String(row?.pos ?? "").trim().toUpperCase();
  const role = String(row?.role ?? "").trim().toUpperCase();
  const nationality = String(row?.nationality ?? "").trim();
  if (!pos && !role && !nationality) return;
  tmTransferSquadPrefillByName.set(TransfermarktSync.normalizeNameKey(player), {
    name: player,
    pos,
    role,
    nationality,
  });
}

function lookupTmTransferSquadPrefill(playerName) {
  const name = String(playerName ?? "").trim();
  if (!name || typeof TransfermarktSync === "undefined") return null;
  const key = TransfermarktSync.normalizeNameKey(name);
  if (tmTransferSquadPrefillByName.has(key)) return tmTransferSquadPrefillByName.get(key);
  for (const entry of tmTransferSquadPrefillByName.values()) {
    if (TransfermarktSync.namesLooselyMatch?.(name, entry.name)) return entry;
  }
  return null;
}

function transferSquadDetailsHtml(teamId, playerName) {
  const name = String(playerName ?? "").trim();
  const suggestedNum = teamId ? nextSquadShirtNumber(teamId) : "";
  const sample = teamId ? playersForTeam(teamId).find((p) => p.nationality?.trim()) : null;
  const prefill = lookupTmTransferSquadPrefill(name);
  const suggestedNat = prefill?.nationality || sample?.nationality?.trim() || "";
  const suggestedPos = prefill?.pos || "";
  const suggestedRole = prefill?.role || "";
  return `
    <div class="tr-squad-details admin-hidden" aria-label="Squad details for ${esc(name || "player")}">
      <p class="tr-squad-details-lead">Complete roster details before adding to the squad.</p>
      <div class="tr-squad-details-grid">
        <label class="tr-squad-field">
          <span class="tr-squad-label">#</span>
          <input class="tr-squad-num transfers-input mw-input" type="number" min="1" max="99" value="${esc(suggestedNum)}" placeholder="#" />
        </label>
        <label class="tr-squad-field">
          <span class="tr-squad-label">Pos</span>
          <input class="tr-squad-pos transfers-input mw-input" placeholder="GK/DF/MF/FW" value="${esc(suggestedPos)}" />
        </label>
        <label class="tr-squad-field">
          <span class="tr-squad-label">Role</span>
          <input class="tr-squad-role transfers-input mw-input" placeholder="CB, CM, CF…" value="${esc(suggestedRole)}" />
        </label>
        <label class="tr-squad-field tr-squad-field--wide">
          <span class="tr-squad-label">Country</span>
          <input class="tr-squad-nat transfers-input mw-input" value="${esc(suggestedNat)}" placeholder="Nationality" list="trNationalityList" autocomplete="off" />
        </label>
      </div>
      <div class="tr-squad-details-actions">
        <button type="button" class="mw-btn-primary tr-squad-confirm">Add to squad</button>
        <button type="button" class="mw-btn-ghost tr-squad-cancel">Cancel</button>
      </div>
    </div>`;
}

function transferPlayerFieldHtml(mode, teamId, playerName) {
  const name = String(playerName ?? "").trim();
  const onSquad = Boolean(teamId && name && rosterPlayerByName(teamId, name));
  const isIncoming = transferDirectionIncoming(mode);
  const btnLabel = isIncoming ? (onSquad ? "Already on squad" : "Add to squad") : onSquad ? "Remove from squad" : "Not on squad";
  const disabled = isIncoming ? !name || onSquad : !name || !onSquad;
  const detailsHtml = isIncoming && !onSquad ? transferSquadDetailsHtml(teamId, name) : "";
  return `
    <div class="tr-player-field">
      <input class="tr-player transfers-input mw-input" value="${esc(name)}" placeholder="Player name" aria-label="Player" />
      <button type="button" class="mw-btn-ghost tr-roster-btn ${isIncoming ? "tr-add-squad" : "tr-remove-squad"}" title="${esc(btnLabel)}"${disabled ? " disabled" : ""}>${isIncoming ? "+ Squad" : "− Squad"}</button>
      ${detailsHtml}
    </div>`;
}

function syncTransferRosterBtn(row, teamId, mode) {
  if (!row) return;
  const input = transferCardQuery(row, ".tr-player");
  const btn = transferCardQuery(row, ".tr-roster-btn") || row.querySelector(".tr-roster-btn");
  const details = transferCardQuery(row, ".tr-squad-details") || row.querySelector(".tr-squad-details");
  if (!input || !btn) return;
  const name = input.value.trim();
  const onSquad = Boolean(name && rosterPlayerByName(teamId, name));
  const isIncoming = transferDirectionIncoming(mode);
  if (isIncoming) {
    btn.disabled = !name || onSquad;
    btn.textContent = onSquad ? "On squad" : "+ Squad";
    btn.title = onSquad ? "Already on squad" : "Add to squad — fill in number, position, role, country";
    if (onSquad) {
      details?.classList.add("admin-hidden");
      btn.classList.remove("admin-hidden");
    }
  } else {
    btn.disabled = !name || !onSquad;
    btn.textContent = "− Squad";
    btn.title = onSquad ? "Remove from squad" : "Not on squad";
  }
  syncTransferSquadStatus(row, teamId, mode);
}

function transferSquadStatusInfo(teamId, playerName, mode) {
  const name = String(playerName ?? "").trim();
  if (!name) {
    return {
      state: "empty",
      label: "Enter a player name",
      done: false,
      onSquad: false,
    };
  }
  const onSquad = Boolean(teamId && rosterPlayerByName(teamId, name));
  const isIncoming = transferDirectionIncoming(mode);
  if (isIncoming) {
    return onSquad
      ? { state: "on", label: "On squad", done: true, onSquad: true }
      : { state: "missing", label: "Not on squad — use + Squad", done: false, onSquad: false };
  }
  return onSquad
    ? { state: "still", label: "Still on squad — use − Squad", done: false, onSquad: true }
    : { state: "off", label: "Removed from squad", done: true, onSquad: false };
}

function transferSquadStatusIconSvg(state) {
  if (state === "on" || state === "off") {
    // Check mark — expected roster action done
    return `<svg class="transfers-card__squad-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>`;
  }
  if (state === "still") {
    // Person still present — needs removal
    return `<svg class="transfers-card__squad-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>`;
  }
  if (state === "missing") {
    // Person with plus — needs add
    return `<svg class="transfers-card__squad-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`;
  }
  return `<svg class="transfers-card__squad-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>`;
}

function transferSquadStatusHtml(teamId, playerName, mode) {
  const info = transferSquadStatusInfo(teamId, playerName, mode);
  const tone = info.state === "empty" ? "empty" : info.done ? "done" : "needed";
  return `<span class="transfers-card__squad-status transfers-card__squad-status--${tone} transfers-card__squad-status--${info.state}" title="${esc(info.label)}" aria-label="${esc(info.label)}">${transferSquadStatusIconSvg(info.state)}</span>`;
}

function syncTransferSquadStatus(row, teamId, mode) {
  if (!row) return;
  const el = row.querySelector(".transfers-card__squad-status");
  if (!el) return;
  const name = transferCardInputValue(row, ".tr-player");
  const next = document.createElement("template");
  next.innerHTML = transferSquadStatusHtml(teamId ?? transferTeamFilter, name, mode || row.getAttribute("data-dir") || "in").trim();
  const fresh = next.content.firstElementChild;
  if (fresh) el.replaceWith(fresh);
}

function openTransferSquadForm(row, teamId) {
  const name = transferCardInputValue(row, ".tr-player");
  if (!teamId) return toast("Choose a club first");
  if (!name) return toast("Enter a player name first");
  if (rosterPlayerByName(teamId, name)) return toast("Player is already on the squad");

  let details = row?.querySelector(".tr-squad-details");
  if (!details) {
    row?.querySelector(".tr-player-field")?.insertAdjacentHTML("beforeend", transferSquadDetailsHtml(teamId, name));
    details = row?.querySelector(".tr-squad-details");
  }
  if (!details) return;

  const numInput = details.querySelector(".tr-squad-num");
  if (numInput && !String(numInput.value ?? "").trim()) numInput.value = String(nextSquadShirtNumber(teamId));

  const prefill = lookupTmTransferSquadPrefill(name);
  if (prefill) {
    const posInput = details.querySelector(".tr-squad-pos");
    const roleInput = details.querySelector(".tr-squad-role");
    const natInput = details.querySelector(".tr-squad-nat");
    if (posInput && prefill.pos && !String(posInput.value ?? "").trim()) posInput.value = prefill.pos;
    if (roleInput && prefill.role && !String(roleInput.value ?? "").trim()) roleInput.value = prefill.role;
    if (natInput && prefill.nationality && !String(natInput.value ?? "").trim()) {
      natInput.value = prefill.nationality;
    }
  }

  details.classList.remove("admin-hidden");
  row?.querySelector(".tr-add-squad")?.classList.add("admin-hidden");
  details.querySelector(".tr-squad-pos")?.focus();
}

function closeTransferSquadForm(row) {
  const details = row?.querySelector(".tr-squad-details");
  details?.classList.add("admin-hidden");
  row?.querySelector(".tr-add-squad")?.classList.remove("admin-hidden");
}

function readTransferSquadDetails(row) {
  const details = row?.querySelector(".tr-squad-details");
  return {
    number: Number(details?.querySelector(".tr-squad-num")?.value),
    pos: details?.querySelector(".tr-squad-pos")?.value?.trim() ?? "",
    role: details?.querySelector(".tr-squad-role")?.value?.trim() ?? "",
    nationality: details?.querySelector(".tr-squad-nat")?.value?.trim() ?? "",
  };
}

function addTransferPlayerToSquad(teamId, playerName, details = {}) {
  const name = stripCaptainSuffix(String(playerName ?? "").trim());
  if (!teamId) return toast("Choose a club first");
  if (!name) return toast("Enter a player name first");
  if (rosterPlayerByName(teamId, name)) return toast("Player is already on the squad");

  const number = Number(details.number);
  const pos = String(details.pos ?? "").trim().toUpperCase();
  const role = String(details.role ?? "").trim().toUpperCase();
  const nationality = String(details.nationality ?? "").trim();

  if (!Number.isFinite(number) || number < 1) return toast("Enter a valid jersey number");
  if (playersForTeam(teamId).some((p) => Number(p.number) === number)) {
    return toast(`Jersey #${number} is already used on this squad`);
  }
  if (!pos) return toast("Enter position (GK, DF, MF, or FW)");
  if (!["GK", "DF", "MF", "FW"].includes(pos)) return toast("Position must be GK, DF, MF, or FW");
  if (!role) return toast("Enter role (e.g. CB, CM, CF)");
  if (!nationality) return toast("Enter nationality / country");

  let flag = "";
  if (typeof NationalityFlags !== "undefined") flag = NationalityFlags.getFlag(nationality) || "";

  const maxOrder = playersForTeam(teamId).reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  FCDataStore.upsertPlayer({
    id: FCDataStore.makePlayerId(teamId, number, name),
    teamId,
    number,
    name,
    pos,
    role,
    flag,
    nationality,
    sortOrder: maxOrder + 1,
  });
  syncToAppArrays();
  toast(`${name} added to squad (#${number})`);
  saveTransfersFromDom({ silent: true });
  return true;
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
  saveTransfersFromDom({ silent: true });
}

const ADMIN_TRANSFER_SECTIONS = [
  {
    key: "in",
    title: "Transfers In",
    hint: "External signings only. Academy / U21 promotions belong in <strong>Promoted</strong>. Prefer <strong>Yes, player exists</strong> to pick League → Team → Player (moves the roster and creates the paired Transfer Out). Or enter manually and use <strong>+ Squad</strong>.",
    tableId: "transfersInTable",
    btnId: "btnAddTransferIn",
    btnLabel: "+ In",
    clubHeader: "From",
    clubPlaceholder: "Previous club",
    feePlaceholder: "€5m / Free",
    showFee: true,
  },
  {
    key: "promoted",
    title: "Promoted",
    hint: "Players stepped up from this club’s academy, U21, or B team (not a market transfer). Use <strong>+ Squad</strong> and complete number, position, role, and country before adding.",
    tableId: "transfersPromotedTable",
    btnId: "btnAddTransferPromoted",
    btnLabel: "+ Promoted",
    clubHeader: "From",
    clubPlaceholder: "Academy / U21 / B team",
    feePlaceholder: "Internal",
    showFee: true,
  },
  {
    key: "out",
    title: "Transfers Out",
    hint: "Prefer <strong>Yes, player exists</strong> to pick the player and destination (moves the roster and creates the paired Transfer In). Or enter manually and use <strong>− Squad</strong>.",
    tableId: "transfersOutTable",
    btnId: "btnAddTransferOut",
    btnLabel: "+ Out",
    clubHeader: "To",
    clubPlaceholder: "Destination club",
    feePlaceholder: "€5m / Loan / Released",
    showFee: true,
  },
  {
    key: "loanReturn",
    title: "Loan Return",
    hint: "Prefer <strong>Yes, player exists</strong> to pick the player at the loan club (returns them here and creates the paired Recall). Or enter manually and use <strong>+ Squad</strong>.",
    tableId: "transfersLoanReturnTable",
    btnId: "btnAddTransferLoanReturn",
    btnLabel: "+ Loan Return",
    clubHeader: "From",
    clubPlaceholder: "Loan club",
    showFee: false,
  },
  {
    key: "loanRecall",
    title: "Recall",
    hint: "Prefer <strong>Yes, player exists</strong> to pick the player and parent club (moves them back and creates the paired Loan Return). Or enter manually and use <strong>− Squad</strong>.",
    tableId: "transfersLoanRecallTable",
    btnId: "btnAddTransferLoanRecall",
    btnLabel: "+ Recall",
    clubHeader: "To",
    clubPlaceholder: "Parent club",
    showFee: false,
  },
];

function transferCategoryLabel(key) {
  return (
    ADMIN_TRANSFER_SECTIONS.find((section) => section.key === key)?.title ??
    String(key ?? "")
  );
}

function tmTransferSuggestionKey(category, row) {
  const nameKey =
    typeof TransfermarktSync !== "undefined"
      ? TransfermarktSync.normalizeNameKey(row?.player)
      : String(row?.player ?? "").toLowerCase().trim();
  return `${category}:${nameKey}`;
}

function tmTransferLocalRowKey(category, local) {
  const id = String(local?.id ?? "").trim();
  if (id) return `${category}:id:${id}`;
  return tmTransferSuggestionKey(category, local);
}

function tmTransferUpdateKey(item) {
  return `update:${tmTransferLocalRowKey(item.category ?? item.local?.category, item.local)}`;
}

function tmTransferMoveKey(item) {
  return `move:${item.fromCategory}:${item.toCategory}:${tmTransferLocalRowKey(item.fromCategory, item.local)}`;
}

function transferPlayersMatch(a, b) {
  if (!a || !b) return false;
  if (typeof TransfermarktSync === "undefined") {
    return String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
  }
  return (
    TransfermarktSync.normalizeNameKey(a) === TransfermarktSync.normalizeNameKey(b) ||
    Boolean(TransfermarktSync.namesLooselyMatch?.(a, b))
  );
}

function tmTransferDiffEntries(kind) {
  if (!tmTransferSyncState?.diff?.byCategory) return [];
  const ignored =
    kind === "toAdd"
      ? tmTransferSyncState.ignoredAdd
      : kind === "toRemove"
        ? tmTransferSyncState.ignoredRemove
        : kind === "toUpdate"
          ? tmTransferSyncState.ignoredUpdate
          : tmTransferSyncState.ignoredMove;
  const entries = [];
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    for (const item of tmTransferSyncState.diff.byCategory[section.key]?.[kind] ?? []) {
      if (kind === "toAdd" || kind === "toRemove") {
        const key = tmTransferSuggestionKey(section.key, item);
        if (!ignored?.has(key)) entries.push({ category: section.key, row: item, key });
        continue;
      }
      if (kind === "toUpdate") {
        const key = tmTransferUpdateKey(item);
        if (!ignored?.has(key)) {
          entries.push({ ...item, category: section.key, row: item.tm, key });
        }
        continue;
      }
      const key = tmTransferMoveKey(item);
      if (!ignored?.has(key)) {
        entries.push({ ...item, category: section.key, row: item.tm, key });
      }
    }
  }
  return entries;
}

function tmTransferSuggestionMeta(entry) {
  const row = entry.row ?? {};
  return [
    transferCategoryLabel(entry.category),
    row.otherClub || "",
    row.fee || "",
    row.date ? transferDateFromInputValue(row.date) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function tmTransferUpdateMeta(entry) {
  const tm = entry.tm ?? entry.row ?? {};
  const changes = (entry.changes ?? []).join(", ");
  return [
    transferCategoryLabel(entry.category),
    tm.otherClub || "",
    tm.fee || "",
    tm.date ? transferDateFromInputValue(tm.date) : "",
    changes ? `update ${changes}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function tmTransferMoveMeta(entry) {
  const tm = entry.tm ?? entry.row ?? {};
  return [
    `${transferCategoryLabel(entry.fromCategory)} → ${transferCategoryLabel(entry.toCategory)}`,
    tm.otherClub || "",
    tm.fee || "",
    tm.date ? transferDateFromInputValue(tm.date) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function tmTransferSyncStatusHtml(team) {
  if (!team) return `<span class="players-tm-sync__hint admin-muted">Select a club first.</span>`;
  if (!tmSyncAvailableForTeam(team)) {
    return `<span class="players-tm-sync__hint admin-muted">Paste and save the club’s Transfermarkt link above.</span>`;
  }
  if (!tmSyncLocalProxyReady()) {
    return `<span class="players-tm-sync__hint admin-muted">Use <strong>serve.bat</strong> on your computer — Transfermarkt comparison cannot run on phone / GitHub Pages.</span>`;
  }
  if (!tmTransferSyncState) {
    return `<span class="players-tm-sync__hint admin-muted">Compare this editor with Transfermarkt for the selected season.</span>`;
  }
  const addCount = tmTransferDiffEntries("toAdd").length;
  const removeCount = tmTransferDiffEntries("toRemove").length;
  const updateCount = tmTransferDiffEntries("toUpdate").length;
  const moveCount = tmTransferDiffEntries("toReclassify").length;
  const diff = tmTransferSyncState.diff;
  const parts = [
    `${diff.tmTotal} on Transfermarkt`,
    `${diff.localTotal} in Squad Central`,
    `${diff.matched} matched`,
  ];
  if (addCount) parts.push(`${addCount} to add`);
  if (updateCount) parts.push(`${updateCount} to sync`);
  if (moveCount) parts.push(`${moveCount} to move`);
  if (removeCount) parts.push(`${removeCount} to remove`);
  const ignored =
    (tmTransferSyncState.ignoredAdd?.size ?? 0) +
    (tmTransferSyncState.ignoredRemove?.size ?? 0) +
    (tmTransferSyncState.ignoredUpdate?.size ?? 0) +
    (tmTransferSyncState.ignoredMove?.size ?? 0);
  if (ignored) parts.push(`${ignored} ignored`);
  return `<span class="players-tm-sync__hint">${esc(parts.join(" · "))}</span>`;
}

function tmTransferSyncPanelHtml(team) {
  if (!team) return "";
  if (tmTransferSyncState?.teamId !== team.id) {
    tmTransferSyncState = null;
    tmTransferSearchQuery = "";
  }
  const localReady = tmSyncLocalProxyReady();
  const canRefresh = localReady && tmSyncAvailableForTeam(team);
  const addEntries = tmTransferDiffEntries("toAdd");
  const removeEntries = tmTransferDiffEntries("toRemove");
  const updateEntries = tmTransferDiffEntries("toUpdate");
  const moveEntries = tmTransferDiffEntries("toReclassify");
  const hasOpen =
    addEntries.length || removeEntries.length || updateEntries.length || moveEntries.length;
  const suggestionHtml = (entry, kind) => {
    const itemClass =
      kind === "add"
        ? "add"
        : kind === "remove"
          ? "remove"
          : kind === "update"
            ? "update"
            : "move";
    const meta =
      kind === "update"
        ? tmTransferUpdateMeta(entry)
        : kind === "move"
          ? tmTransferMoveMeta(entry)
          : tmTransferSuggestionMeta(entry);
    const label =
      kind === "add" ? "Add" : kind === "remove" ? "Remove" : kind === "update" ? "Sync" : "Move";
    const btnClass =
      kind === "add"
        ? "mw-btn-primary"
        : kind === "remove"
          ? "mw-btn-danger"
          : "mw-btn-ghost";
    const dataAttr =
      kind === "add"
        ? "data-tm-transfer-add"
        : kind === "remove"
          ? "data-tm-transfer-remove"
          : kind === "update"
            ? "data-tm-transfer-sync"
            : "data-tm-transfer-move";
    const ignoreAttr =
      kind === "add"
        ? "data-tm-transfer-ignore-add"
        : kind === "remove"
          ? "data-tm-transfer-ignore-remove"
          : kind === "update"
            ? "data-tm-transfer-ignore-update"
            : "data-tm-transfer-ignore-move";
    const playerName = entry.local?.player || entry.row?.player || "";
    const searchHay = `${playerName} ${meta}`.toLowerCase();
    return `
    <li class="players-tm-sync__item players-tm-sync__item--${itemClass}" data-tm-search="${esc(searchHay)}">
      <div class="players-tm-sync__copy">
        <strong>${esc(playerName)}</strong>
        <span class="players-tm-sync__meta">${esc(meta)}</span>
      </div>
      <div class="players-tm-sync__actions">
        <button type="button" class="${btnClass} players-tm-sync__apply" ${dataAttr}="${esc(entry.key)}">${label}</button>
        <button type="button" class="players-tm-sync__dismiss" ${ignoreAttr}="${esc(entry.key)}" title="Ignore" aria-label="Ignore suggestion">×</button>
      </div>
    </li>`;
  };
  const hasResult = Boolean(tmTransferSyncState);
  const ignoredTotal =
    (tmTransferSyncState?.ignoredAdd?.size ?? 0) +
    (tmTransferSyncState?.ignoredRemove?.size ?? 0) +
    (tmTransferSyncState?.ignoredUpdate?.size ?? 0) +
    (tmTransferSyncState?.ignoredMove?.size ?? 0);
  const noOpenSuggestions =
    hasResult && !hasOpen
      ? `<p class="players-tm-sync__empty admin-muted mb-0">${
          ignoredTotal
            ? "No open suggestions — ignored items are hidden until you compare again."
            : "No open suggestions — these transfer lists match Transfermarkt."
        }</p>`
      : "";
  const colCount =
    (addEntries.length ? 1 : 0) +
    (updateEntries.length || moveEntries.length ? 1 : 0) +
    (removeEntries.length ? 1 : 0);
  const bulkBar = hasOpen
    ? `<div class="players-tm-sync__bulk">
          ${addEntries.length ? `<button type="button" class="mw-btn-primary players-auto-btn" id="btnTmTransferAddAll">Add all (${addEntries.length})</button>` : ""}
          ${updateEntries.length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmTransferSyncAll">Sync details (${updateEntries.length})</button>` : ""}
          ${moveEntries.length ? `<button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmTransferMoveAll">Apply moves (${moveEntries.length})</button>` : ""}
          ${removeEntries.length ? `<button type="button" class="mw-btn-danger players-auto-btn" id="btnTmTransferRemoveAll">Remove all (${removeEntries.length})</button>` : ""}
        </div>`
    : "";
  const searchBar = hasOpen
    ? `<div class="players-search-field transfers-tm-search">
        <div class="players-search-wrap">
          <span class="players-search-icon" aria-hidden="true">⌕</span>
          <input
            id="tmTransferSearch"
            class="players-search-input mw-input"
            type="search"
            placeholder="Search fetched players…"
            value="${esc(tmTransferSearchQuery)}"
            autocomplete="off"
            enterkeyhint="search"
            aria-label="Search Transfermarkt transfer suggestions"
          />
          <button type="button" class="players-search-clear${tmTransferSearchQuery.trim() ? "" : " admin-hidden"}" id="btnClearTmTransferSearch" aria-label="Clear search">×</button>
        </div>
        <p class="players-search-meta admin-muted${tmTransferSearchQuery.trim() ? "" : " admin-hidden"}" id="tmTransferSearchMeta" aria-live="polite"></p>
      </div>`
    : "";
  const middleCol =
    updateEntries.length || moveEntries.length
      ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Matched — sync / move</h4>
            <ul class="players-tm-sync__list">${[
              ...updateEntries.map((entry) => suggestionHtml(entry, "update")),
              ...moveEntries.map((entry) => suggestionHtml(entry, "move")),
            ].join("")}</ul>
          </div>`
      : "";

  return `
    <div class="players-tm-sync transfers-tm-sync" id="transfersTmSync">
      <div class="players-tm-sync__link-row transfers-tm-sync__controls">
        <div class="mw-field players-tm-sync__link-field">
          <label for="teamTmTransferUrl">Transfermarkt club link</label>
          <input id="teamTmTransferUrl" class="mw-input" type="url" inputmode="url" placeholder="https://www.transfermarkt.com/…/verein/11" value="${esc(tmUrlValueForTeam(team))}" autocomplete="off" />
        </div>
        <button type="button" class="mw-btn-ghost players-auto-btn" id="btnSaveTmTransferUrl">Save link</button>
        <div class="mw-field transfers-tm-sync__season">
          <label for="tmTransferSeason">Season starts</label>
          <input id="tmTransferSeason" class="mw-input" type="number" min="1900" max="2100" step="1" value="${esc(tmTransferSeason)}" />
        </div>
        <button type="button" class="mw-btn-ghost players-auto-btn" id="btnTmTransferRefresh"${canRefresh ? "" : " disabled"} title="${canRefresh ? "Compare transfers with Transfermarkt" : localReady ? "Save a valid Transfermarkt link first" : "Only available via serve.bat on your computer"}">Compare with Transfermarkt</button>
      </div>
      <div class="players-tm-sync__head">
        <span class="players-tm-sync__status" id="transfersTmSyncStatus">${tmTransferSyncStatusHtml(team)}</span>
      </div>
      ${bulkBar}
      ${searchBar}
      <div class="players-tm-sync__body${hasResult ? "" : " admin-hidden"}">
        ${
          hasOpen
            ? `<div class="players-tm-sync__cols${colCount >= 3 ? " players-tm-sync__cols--3" : ""}">
          ${
            addEntries.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">On Transfermarkt — add here</h4>
            <ul class="players-tm-sync__list" id="tmTransferAddList">${addEntries.map((entry) => suggestionHtml(entry, "add")).join("")}</ul>
            <p class="players-tm-sync__none admin-muted admin-hidden" id="tmTransferSearchEmpty">No players match your search.</p>
          </div>`
              : ""
          }
          ${middleCol}
          ${
            removeEntries.length
              ? `<div class="players-tm-sync__col">
            <h4 class="players-tm-sync__title">Only in Squad Central — remove here</h4>
            <ul class="players-tm-sync__list">${removeEntries.map((entry) => suggestionHtml(entry, "remove")).join("")}</ul>
          </div>`
              : ""
          }
        </div>`
            : noOpenSuggestions
        }
      </div>
    </div>`;
}

function applyTmTransferSearch() {
  const root = $("#transfersTmSync");
  if (!root) return;
  const q = tmTransferSearchQuery.trim().toLowerCase();
  const items = root.querySelectorAll(".players-tm-sync__item[data-tm-search]");
  let visible = 0;
  for (const item of items) {
    const hay = item.getAttribute("data-tm-search") ?? "";
    const show = !q || hay.includes(q);
    item.classList.toggle("admin-hidden", !show);
    if (show) visible += 1;
  }

  const meta = $("#tmTransferSearchMeta");
  if (meta) {
    meta.textContent = q ? `${visible} of ${items.length} suggestions` : "";
    meta.classList.toggle("admin-hidden", !q);
  }

  const clearBtn = $("#btnClearTmTransferSearch");
  if (clearBtn) clearBtn.classList.toggle("admin-hidden", !q);

  const addList = $("#tmTransferAddList");
  const addEmpty = $("#tmTransferSearchEmpty");
  if (addEmpty && addList) {
    const addVisible = [...addList.querySelectorAll(".players-tm-sync__item")].filter(
      (el) => !el.classList.contains("admin-hidden"),
    ).length;
    addEmpty.classList.toggle("admin-hidden", !q || addVisible > 0);
  }
}

function transferTeamKey(leagueId, teamId) {
  return `${leagueId}|${teamId}`;
}

function transferRowKey(row) {
  const id = String(row?.id ?? "").trim();
  if (id) return `id:${id}`;
  const player = stripCaptainSuffix(String(row?.player ?? "").trim());
  const other = String(row?.otherClub ?? "").trim();
  return `p:${player}|o:${other}`;
}

function mergeTransferDirectionLists(storeRows, cachedRows, leagueId, teamId) {
  const store = storeRows ?? [];
  const cached = (cachedRows ?? []).filter((row) => transferRowBelongsToTeam(leagueId, teamId, row));
  if (!cached.length) return store;

  const seen = new Set(cached.map(transferRowKey));
  const merged = [...cached];
  for (const row of store) {
    const key = transferRowKey(row);
    if (!seen.has(key)) merged.push(row);
  }
  return merged;
}

function stashTransferEditsFromDom() {
  if (!transferTeamFilter || leagueFilter === "worldcup" || !$("#transfersInTable")) return;
  const sel = $("#transferTeamFilter");
  if (sel && sel.value !== transferTeamFilter) return;
  const draft = readTransfersDraftFromDom();
  if (!draft?.teamId || !draft.lists) return;
  transferEditsByTeam.set(transferTeamKey(draft.leagueId, draft.teamId), draft.lists);
}

function transferListsForEditor(leagueId, teamId) {
  const fromStore = transfersForTeam(leagueId, teamId);
  const cached = transferEditsByTeam.get(transferTeamKey(leagueId, teamId));
  if (!cached) return fromStore;

  const keys = FCDataStore?.TRANSFER_LIST_KEYS ?? ["in", "out", "promoted", "loanReturn", "loanRecall"];
  const merged = {};
  for (const key of keys) {
    merged[key] = mergeTransferDirectionLists(fromStore[key], cached[key], leagueId, teamId);
  }
  return merged;
}

function clearTransferEditsForTeam(leagueId, teamId) {
  transferEditsByTeam.delete(transferTeamKey(leagueId, teamId));
}

async function restoreLeagueTransfersFromSite(leagueId) {
  try {
    const res = await fetch(`data.json?cache=${Date.now()}`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    const block = (data.transfers ?? []).find((x) => x.leagueId === leagueId);
    if (!block) return toast("No transfers found in data.json for this league");
    FCDataStore.setTransfers(leagueId, block);
    for (const key of [...transferEditsByTeam.keys()]) {
      if (key.startsWith(`${leagueId}|`)) transferEditsByTeam.delete(key);
    }
    syncToAppArrays();
    renderPanel();
    toast(`Transfers restored from data.json — ${leagueName(leagueId)}`);
  } catch (err) {
    console.error(err);
    alert("Could not restore transfers from data.json. Check your connection and try again.");
  }
}

function readTransfersDraftFromDom() {
  if (!transferTeamFilter || leagueFilter === "worldcup") return null;
  const teamName = state().teams.find((t) => t.id === transferTeamFilter)?.name ?? "";
  if (!teamName) return null;
  const lists = {};
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    lists[section.key] = readTransfersTable(`#${section.tableId}`, section.key, teamName);
  }
  return { leagueId: leagueFilter, teamId: transferTeamFilter, lists };
}

function saveTransfersFromDom(options = {}) {
  const { silent = false } = options;
  if (!transferTeamFilter || leagueFilter === "worldcup") return false;
  const teamName = state().teams.find((t) => t.id === transferTeamFilter)?.name ?? "";
  if (!teamName) return false;
  const teamLists = {};
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    teamLists[section.key] = readTransfersTable(`#${section.tableId}`, section.key, teamName);
  }
  const merged = mergeTeamTransfersIntoLeague(leagueFilter, transferTeamFilter, teamLists);
  FCDataStore.setTransfers(leagueFilter, merged);
  syncToAppArrays();
  clearTransferEditsForTeam(leagueFilter, transferTeamFilter);
  if (!silent) toast(`Transfers saved for ${teamName}`);
  return true;
}

function transfersStatChipsHtml(inCount, promotedCount, outCount, loanReturnCount, loanRecallCount) {
  return `<div class="transfers-stat-row" aria-label="Transfer summary">
    <span class="transfers-stat-chip transfers-stat-chip--in"><span class="transfers-stat-chip__label">In</span><span class="transfers-stat-chip__val">${inCount}</span></span>
    <span class="transfers-stat-chip transfers-stat-chip--promoted"><span class="transfers-stat-chip__label">Promoted</span><span class="transfers-stat-chip__val">${promotedCount}</span></span>
    <span class="transfers-stat-chip transfers-stat-chip--out"><span class="transfers-stat-chip__label">Out</span><span class="transfers-stat-chip__val">${outCount}</span></span>
    <span class="transfers-stat-chip transfers-stat-chip--return"><span class="transfers-stat-chip__label">Return</span><span class="transfers-stat-chip__val">${loanReturnCount}</span></span>
    <span class="transfers-stat-chip transfers-stat-chip--recall"><span class="transfers-stat-chip__label">Recall</span><span class="transfers-stat-chip__val">${loanRecallCount}</span></span>
  </div>`;
}

function transferCardSummaryParts(t, clubLabel, { showFee = true } = {}) {
  const player = String(t?.player ?? "").trim() || "New entry";
  const club = String(t?.otherClub ?? "").trim();
  const fee = showFee ? String(t?.fee ?? "").trim() : "";
  const date = String(t?.date ?? "").trim() || transferDateFromInputValue(transferDateToInputValue(t?.date));
  const meta = [
    club ? `${clubLabel} ${club}` : "",
    fee || "",
    date || "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { player, meta: meta || "Tap to edit details" };
}

function transferCardSummaryHtml(t, clubLabel, opts) {
  const { player, meta } = transferCardSummaryParts(t, clubLabel, opts);
  return `
    <span class="transfers-card__summary-title">${esc(player)}</span>
    <span class="transfers-card__summary-meta">${esc(meta)}</span>`;
}

function syncTransferCardSummary(card) {
  if (!card) return;
  const mode = card.getAttribute("data-dir") || "in";
  const section = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode);
  const clubLabel = section?.clubHeader ?? (transferDirectionIncoming(mode) ? "From" : "To");
  const showFee = section?.showFee !== false;
  const isIncoming = transferDirectionIncoming(mode);
  const player = transferCardInputValue(card, ".tr-player");
  const otherClub = transferCardInputValue(card, isIncoming ? ".tr-from" : ".tr-to");
  const fee = showFee ? transferCardInputValue(card, ".tr-fee") : "";
  const dateRaw = transferCardInputValue(card, ".tr-date");
  const date = transferDateFromInputValue(dateRaw) || dateRaw || "";
  const summary = card.querySelector(".transfers-card__summary");
  if (!summary) return;
  summary.innerHTML = transferCardSummaryHtml({ player, otherClub, fee, date }, clubLabel, { showFee });
}

function setTransferCardFolded(card, folded) {
  if (!card) return;
  card.classList.toggle("is-folded", folded);
  const foldBtn = card.querySelector(".transfers-card__fold");
  if (foldBtn) {
    foldBtn.setAttribute("aria-expanded", folded ? "false" : "true");
    foldBtn.title = folded ? "Expand entry" : "Collapse entry";
  }
  syncTransferCardSummary(card);
}

function transferFeeFieldHtml(mode, fee) {
  const section = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode);
  const feePlaceholder = section?.feePlaceholder ?? "Fee";
  const feeVal = String(fee ?? "").trim();
  const freeOn = /^free(\s+transfer)?$/i.test(feeVal);
  const loanOn = /^loan$/i.test(feeVal);
  const releasedOn = /^released$/i.test(feeVal);
  return `
    <div class="tr-fee-field">
      <div class="tr-fee-presets" role="group" aria-label="Fee quick select">
        <button type="button" class="tr-fee-preset${freeOn ? " is-active" : ""}" data-fee="Free">Free</button>
        <button type="button" class="tr-fee-preset${loanOn ? " is-active" : ""}" data-fee="Loan">Loan</button>
        <button type="button" class="tr-fee-preset${releasedOn ? " is-active" : ""}" data-fee="Released">Released</button>
      </div>
      <input class="tr-fee transfers-input mw-input" value="${esc(feeVal)}" placeholder="${esc(feePlaceholder)}" aria-label="Fee" inputmode="text" autocomplete="off" />
    </div>`;
}

const TRANSFER_DB_PICK_MODES = new Set(["in", "out", "loanReturn", "loanRecall"]);

function transferSupportsDbPick(mode) {
  return TRANSFER_DB_PICK_MODES.has(mode);
}

function transferClubLeagues() {
  return leagues().filter((l) => l.id !== "worldcup");
}

function transferLeagueOptionTags(selectedId = "") {
  const opts = transferClubLeagues()
    .map((l) => `<option value="${esc(l.id)}"${l.id === selectedId ? " selected" : ""}>${esc(l.name)}</option>`)
    .join("");
  return `<option value="">— Select league —</option>${opts}`;
}

function transferTeamOptionTags(leagueId, selectedId = "", { excludeTeamId = "" } = {}) {
  const teams = teamsForLeague(leagueId).filter((t) => t.id !== excludeTeamId);
  if (!leagueId) return `<option value="">— Select league first —</option>`;
  if (!teams.length) return `<option value="">— No teams —</option>`;
  return `<option value="">— Select team —</option>${teamOptionTags(teams, selectedId)}`;
}

function makeTransferEventId() {
  return `tr_evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function transferPairDirection(mode) {
  if (mode === "in") return "out";
  if (mode === "out") return "in";
  if (mode === "loanReturn") return "loanRecall";
  if (mode === "loanRecall") return "loanReturn";
  return "";
}

/** Append one transfer row for a club without wiping other clubs in that league. */
function appendClubTransferRow(leagueId, teamId, direction, rowFields) {
  const team = state().teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, error: "Team not found." };
  if (!leagueId) return { ok: false, error: "League is required." };
  const clubName = team.name;
  const row = {
    id:
      rowFields.id ||
      `${leagueId}_${direction}_${FCDataStore.slugify(rowFields.player || "row")}_${Date.now().toString(36)}`,
    player: rowFields.player,
    club: clubName,
    otherClub: rowFields.otherClub ?? "",
    date: rowFields.date || undefined,
  };
  if (rowFields.fee) row.fee = rowFields.fee;
  if (rowFields.playerId) row.playerId = rowFields.playerId;
  if (rowFields.eventId) row.eventId = rowFields.eventId;

  const cacheKey = transferTeamKey(leagueId, teamId);
  const baseLists = transferEditsByTeam.has(cacheKey)
    ? transferEditsByTeam.get(cacheKey)
    : transfersForTeam(leagueId, teamId);
  const keys = FCDataStore?.TRANSFER_LIST_KEYS ?? ["in", "out", "promoted", "loanReturn", "loanRecall"];
  const lists = {};
  for (const key of keys) lists[key] = [...(baseLists?.[key] ?? [])];
  lists[direction] = [...lists[direction], row];
  const merged = mergeTeamTransfersIntoLeague(leagueId, teamId, lists);
  FCDataStore.setTransfers(leagueId, merged);
  transferEditsByTeam.set(cacheKey, transfersForTeam(leagueId, teamId));
  return { ok: true, row };
}

function resolveJerseyBeforeMove(player, toTeamId) {
  if (!player || !toTeamId) return { ok: false, error: "Missing player or destination." };
  const num = Number(player.number);
  const taken = playersForTeam(toTeamId).some(
    (p) => p.id !== player.id && Number(p.number) === num,
  );
  if (!taken) return { ok: true, playerId: player.id };
  const suggested = nextSquadShirtNumber(toTeamId);
  const raw = prompt(
    `${player.name}: jersey #${player.number} is already used at the destination club. Enter a free number:`,
    String(suggested),
  );
  if (raw == null) return { ok: false, error: "Cancelled." };
  const nextNum = Number(raw);
  if (!Number.isFinite(nextNum) || nextNum < 1 || nextNum > 99) {
    return { ok: false, error: "Enter a jersey number between 1 and 99." };
  }
  if (playersForTeam(toTeamId).some((p) => Number(p.number) === nextNum)) {
    return { ok: false, error: `Jersey #${nextNum} is still taken.` };
  }
  FCDataStore.upsertPlayer({ ...player, number: nextNum });
  return { ok: true, playerId: player.id };
}

function transferDbPickerLabels(mode) {
  if (mode === "in") {
    return {
      pickTitle: "Select the player’s current club (source)",
      pickLeague: "Source league",
      pickTeam: "Source team",
      pickPlayer: "Player",
      needDest: false,
      destLeague: "",
      destTeam: "",
      applyLabel: "Apply transfer in",
    };
  }
  if (mode === "out") {
    return {
      pickTitle: "Select the player leaving this club",
      pickLeague: "Current league",
      pickTeam: "Current team",
      pickPlayer: "Player",
      needDest: true,
      destLeague: "Destination league",
      destTeam: "Destination team",
      applyLabel: "Apply transfer out",
    };
  }
  if (mode === "loanReturn") {
    return {
      pickTitle: "Select the player currently on loan (loan club)",
      pickLeague: "Loan league",
      pickTeam: "Loan team",
      pickPlayer: "Player",
      needDest: false,
      destLeague: "",
      destTeam: "",
      applyLabel: "Apply loan return",
    };
  }
  return {
    pickTitle: "Select the player to recall from this club",
    pickLeague: "Current league",
    pickTeam: "Current team",
    pickPlayer: "Player",
    needDest: true,
    destLeague: "Parent league",
    destTeam: "Parent team",
    applyLabel: "Apply loan recall",
  };
}

function transferDbPickerHtml(mode, homeTeamId, homeLeagueId) {
  const labels = transferDbPickerLabels(mode);
  const homeIsSource = mode === "out" || mode === "loanRecall";
  const defaultLeague = homeIsSource ? homeLeagueId : "";
  const defaultTeam = homeIsSource ? homeTeamId : "";
  const destDefaultLeague = labels.needDest ? homeLeagueId : "";
  const radioName = `tr-src-${mode}-${Math.random().toString(36).slice(2, 9)}`;
  return `
    <div class="tr-source-chooser" role="radiogroup" aria-label="Player source">
      <p class="tr-source-chooser__lead">Is this player already in our database?</p>
      <div class="tr-source-chooser__options">
        <label class="tr-source-option">
          <input type="radio" class="tr-src-mode" name="${esc(radioName)}" value="db" checked />
          <span>Yes, player exists in database</span>
        </label>
        <label class="tr-source-option">
          <input type="radio" class="tr-src-mode" name="${esc(radioName)}" value="manual" />
          <span>No, enter details manually</span>
        </label>
      </div>
    </div>
    <div class="tr-db-panel">
      <p class="tr-db-panel__hint">${esc(labels.pickTitle)}</p>
      <div class="tr-db-grid">
        <div class="transfers-card__field">
          <span class="transfers-card__label">${esc(labels.pickLeague)}</span>
          <div class="mw-select-wrap"><select class="tr-db-league mw-select" aria-label="${esc(labels.pickLeague)}">${transferLeagueOptionTags(defaultLeague)}</select></div>
        </div>
        <div class="transfers-card__field">
          <span class="transfers-card__label">${esc(labels.pickTeam)}</span>
          <div class="mw-select-wrap"><select class="tr-db-team mw-select" aria-label="${esc(labels.pickTeam)}">${transferTeamOptionTags(defaultLeague, defaultTeam)}</select></div>
        </div>
        <div class="transfers-card__field">
          <span class="transfers-card__label">${esc(labels.pickPlayer)}</span>
          <div class="mw-select-wrap"><select class="tr-db-player mw-select" aria-label="${esc(labels.pickPlayer)}">${playerTransferPickOptions(defaultTeam, "")}</select></div>
        </div>
        ${
          labels.needDest
            ? `<div class="transfers-card__field">
          <span class="transfers-card__label">${esc(labels.destLeague)}</span>
          <div class="mw-select-wrap"><select class="tr-db-dest-league mw-select" aria-label="${esc(labels.destLeague)}">${transferLeagueOptionTags(destDefaultLeague)}</select></div>
        </div>
        <div class="transfers-card__field">
          <span class="transfers-card__label">${esc(labels.destTeam)}</span>
          <div class="mw-select-wrap"><select class="tr-db-dest-team mw-select" aria-label="${esc(labels.destTeam)}">${transferTeamOptionTags(destDefaultLeague, "", { excludeTeamId: defaultTeam })}</select></div>
        </div>`
            : ""
        }
        ${
          ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode)?.showFee !== false
            ? `<div class="transfers-card__field">
          <span class="transfers-card__label">Fee</span>
          ${transferFeeFieldHtml(mode, "")}
        </div>`
            : ""
        }
        <div class="transfers-card__field">
          <span class="transfers-card__label">Date</span>
          <input class="tr-db-date tr-date transfers-input transfers-input--date mw-input" type="date" value="${esc(new Date().toISOString().slice(0, 10))}" aria-label="Transfer date" />
        </div>
      </div>
      <div class="tr-db-actions">
        <button type="button" class="mw-btn-primary mw-btn-primary--sm tr-db-apply">${esc(labels.applyLabel)}</button>
      </div>
    </div>`;
}

function transferManualFieldsHtml(mode, teamId, t) {
  const section = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode);
  const isIncoming = transferDirectionIncoming(mode);
  const clubClass = isIncoming ? "tr-from" : "tr-to";
  const clubLabel = section?.clubHeader ?? (isIncoming ? "From" : "To");
  const clubPlaceholder = section?.clubPlaceholder ?? "Club";
  const showFee = section?.showFee !== false;
  return `
    <div class="transfers-card__field">
      <span class="transfers-card__label">Player</span>
      ${transferPlayerFieldHtml(mode, teamId, t.player)}
    </div>
    <div class="transfers-card__field">
      <span class="transfers-card__label">${esc(clubLabel)}</span>
      <input class="${clubClass} transfers-input mw-input" value="${esc(t.otherClub ?? "")}" placeholder="${esc(clubPlaceholder)}" aria-label="${esc(clubLabel)}" />
    </div>
    ${
      showFee
        ? `<div class="transfers-card__field">
      <span class="transfers-card__label">Fee</span>
      ${transferFeeFieldHtml(mode, t.fee)}
    </div>`
        : ""
    }
    <div class="transfers-card__field">
      <span class="transfers-card__label">Date</span>
      <input class="tr-date transfers-input transfers-input--date mw-input" type="date" value="${esc(transferDateToInputValue(t.date))}" aria-label="Transfer date" />
    </div>`;
}

function setTransferCardSourceMode(card, mode) {
  if (!card) return;
  const useDb = mode === "db";
  card.classList.toggle("transfers-card--db", useDb);
  card.classList.toggle("transfers-card--manual", !useDb);
  card.querySelector(".tr-db-panel")?.classList.toggle("admin-hidden", !useDb);
  card.querySelector(".tr-manual-panel")?.classList.toggle("admin-hidden", useDb);
  syncTransferCardSummary(card);
}

function refreshTransferDbTeamSelect(card) {
  const leagueSel = card.querySelector(".tr-db-league");
  const teamSel = card.querySelector(".tr-db-team");
  const playerSel = card.querySelector(".tr-db-player");
  if (!teamSel || !leagueSel) return;
  const leagueId = leagueSel.value;
  teamSel.innerHTML = transferTeamOptionTags(leagueId, "");
  if (playerSel) playerSel.innerHTML = playerTransferPickOptions("", "");
}

function refreshTransferDbPlayerSelect(card) {
  const teamSel = card.querySelector(".tr-db-team");
  const playerSel = card.querySelector(".tr-db-player");
  if (!playerSel) return;
  playerSel.innerHTML = playerTransferPickOptions(teamSel?.value ?? "", "");
}

function refreshTransferDbDestTeamSelect(card) {
  const destLeagueSel = card.querySelector(".tr-db-dest-league");
  const destTeamSel = card.querySelector(".tr-db-dest-team");
  const sourceTeamId = card.querySelector(".tr-db-team")?.value ?? "";
  if (!destTeamSel || !destLeagueSel) return;
  destTeamSel.innerHTML = transferTeamOptionTags(destLeagueSel.value, "", {
    excludeTeamId: sourceTeamId,
  });
}

function applyDbLinkedTransferFromCard(card) {
  const mode = card.getAttribute("data-dir") || "in";
  if (!transferSupportsDbPick(mode)) return;
  const homeTeamId = transferTeamFilter;
  const homeLeagueId = leagueFilter;
  const homeTeam = state().teams.find((t) => t.id === homeTeamId);
  if (!homeTeam || !homeTeamId) return toast("Choose a club first");

  const playerId = card.querySelector(".tr-db-player")?.value?.trim() ?? "";
  if (!playerId) return toast("Select a player");

  const player = state().players.find((p) => p.id === playerId);
  if (!player) return toast("Player not found in database");

  const sourceTeamId = card.querySelector(".tr-db-team")?.value?.trim() ?? "";
  const sourceLeagueId = card.querySelector(".tr-db-league")?.value?.trim() ?? "";
  const destTeamId = card.querySelector(".tr-db-dest-team")?.value?.trim() ?? "";
  const destLeagueId = card.querySelector(".tr-db-dest-league")?.value?.trim() ?? "";

  let fromTeamId = "";
  let toTeamId = "";
  let otherTeamId = "";
  let otherLeagueId = "";
  let homeDirection = mode;
  let otherDirection = transferPairDirection(mode);

  if (mode === "in" || mode === "loanReturn") {
    fromTeamId = sourceTeamId;
    toTeamId = homeTeamId;
    otherTeamId = sourceTeamId;
    otherLeagueId = sourceLeagueId || state().teams.find((t) => t.id === sourceTeamId)?.leagueId || "";
    if (!fromTeamId) return toast("Select the player’s current team");
    if (fromTeamId === homeTeamId) return toast("Player is already on this club");
  } else {
    fromTeamId = sourceTeamId || homeTeamId;
    toTeamId = destTeamId;
    otherTeamId = destTeamId;
    otherLeagueId = destLeagueId || state().teams.find((t) => t.id === destTeamId)?.leagueId || "";
    if (!toTeamId) return toast(mode === "out" ? "Select the destination team" : "Select the parent team");
    if (fromTeamId === toTeamId) return toast("Source and destination must differ");
    if (fromTeamId !== homeTeamId) {
      return toast(
        `Select a player currently at ${homeTeam.name} (the club you are editing).`,
      );
    }
  }

  if (player.teamId !== fromTeamId) {
    return toast("Selected player is not on the chosen source team — refresh and try again");
  }

  const otherTeam = state().teams.find((t) => t.id === otherTeamId);
  if (!otherTeam || !otherLeagueId) {
    return toast("The other club must exist in the database to create the paired transfer record");
  }

  const feeInput = card.querySelector(".tr-db-panel .tr-fee")?.value?.trim() || "";
  const dateRaw = card.querySelector(".tr-db-panel .tr-db-date, .tr-db-panel .tr-date")?.value?.trim() || "";
  const date =
    transferDateFromInputValue(dateRaw) ||
    dateRaw ||
    transferDateFromInputValue(new Date().toISOString().slice(0, 10));
  const showFee = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode)?.showFee !== false;
  const fee = showFee ? feeInput || undefined : undefined;
  const defaultLoanFee = mode === "loanReturn" || mode === "loanRecall" ? "Loan" : undefined;
  const feeFinal = fee || defaultLoanFee;

  const fromName = state().teams.find((t) => t.id === fromTeamId)?.name ?? fromTeamId;
  const toName = state().teams.find((t) => t.id === toTeamId)?.name ?? toTeamId;
  const pairLabel = otherDirection === "out" || otherDirection === "in"
    ? `Transfer ${otherDirection === "out" ? "Out" : "In"}`
    : otherDirection === "loanRecall"
      ? "Loan Recall"
      : "Loan Return";

  if (
    !confirm(
      `${player.name}: ${fromName} → ${toName}\n\nThis will:\n• Move the existing player record (no duplicate)\n• Add ${transferCategoryLabel(homeDirection)} for ${homeTeam.name}\n• Add ${pairLabel} for ${otherTeam.name}\n\nContinue?`,
    )
  ) {
    return;
  }

  stashTransferEditsFromDom();

  const jersey = resolveJerseyBeforeMove(
    state().players.find((p) => p.id === playerId) || player,
    toTeamId,
  );
  if (!jersey.ok) return toast(jersey.error || "Could not resolve jersey number");

  const moved = FCDataStore.transferPlayer(jersey.playerId, toTeamId, { fromTeamId });
  if (!moved.ok) return alert(moved.error);

  const eventId = makeTransferEventId();
  const finalPlayerId = moved.player?.id || jersey.playerId;
  const playerName = moved.player?.name || player.name;

  const homeRow = {
    player: playerName,
    otherClub: otherTeam.name,
    fee: feeFinal,
    date,
    playerId: finalPlayerId,
    eventId,
  };
  const otherRow = {
    player: playerName,
    otherClub: homeTeam.name,
    fee: feeFinal,
    date,
    playerId: finalPlayerId,
    eventId,
  };

  const homeAdd = appendClubTransferRow(homeLeagueId, homeTeamId, homeDirection, homeRow);
  if (!homeAdd.ok) return alert(homeAdd.error || "Failed to save home transfer row");

  const otherAdd = appendClubTransferRow(otherLeagueId, otherTeamId, otherDirection, otherRow);
  if (!otherAdd.ok) return alert(otherAdd.error || "Failed to save paired transfer row");

  syncToAppArrays();
  clearTransferEditsForTeam(homeLeagueId, homeTeamId);
  clearTransferEditsForTeam(otherLeagueId, otherTeamId);
  toast(`${playerName} moved · paired ${transferCategoryLabel(homeDirection)} / ${pairLabel} saved`);
  renderPanel();
}

function transferTableRowHtml(mode, teamId, t, i, { folded = true } = {}) {
  const section = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === mode);
  const isIncoming = transferDirectionIncoming(mode);
  const clubLabel = section?.clubHeader ?? (isIncoming ? "From" : "To");
  const showFee = section?.showFee !== false;
  const sortKey = t.id || `${mode}-${i}`;
  const foldedClass = folded ? " is-folded" : "";
  const hasPlayer = Boolean(String(t.player ?? "").trim());
  const showDbChooser = transferSupportsDbPick(mode) && !hasPlayer;
  const linkedBadge =
    t.eventId || t.playerId
      ? `<span class="transfers-card__linked" title="Linked database transfer">Linked</span>`
      : "";
  const summary = transferCardSummaryHtml(
    {
      player: t.player,
      otherClub: t.otherClub,
      fee: showFee ? t.fee : "",
      date: t.date || transferDateFromInputValue(transferDateToInputValue(t.date)),
    },
    clubLabel,
    { showFee },
  );
  const homeLeagueId = state().teams.find((x) => x.id === teamId)?.leagueId || leagueFilter;
  return `
    <article
      class="tr-sort-row transfers-card transfers-row transfers-row--${esc(mode)}${foldedClass}${showDbChooser ? " transfers-card--db" : ""}"
      role="listitem"
      data-i="${i}"
      data-dir="${esc(mode)}"
      data-id="${esc(t.id ?? "")}"
      data-player-id="${esc(t.playerId ?? "")}"
      data-event-id="${esc(t.eventId ?? "")}"
      data-tr-sort-key="${esc(sortKey)}"
    >
      <div class="transfers-card__top">
        <span class="player-drag-handle transfers-drag-handle" draggable="true" title="Drag to reorder" tabindex="-1" aria-hidden="true">⋮⋮</span>
        <button
          type="button"
          class="transfers-card__fold"
          aria-expanded="${folded ? "false" : "true"}"
          title="${folded ? "Expand entry" : "Collapse entry"}"
        >
          <span class="transfers-card__chevron" aria-hidden="true"></span>
          <span class="transfers-card__summary">${summary}</span>
        </button>
        ${linkedBadge}
        ${transferSquadStatusHtml(teamId, t.player, mode)}
        <button type="button" class="mw-btn-danger transfers-del-btn tr-del" title="Remove entry" aria-label="Remove entry">×</button>
      </div>
      <div class="transfers-card__body">
        ${
          showDbChooser
            ? `${transferDbPickerHtml(mode, teamId, homeLeagueId)}
        <div class="tr-manual-panel admin-hidden">
          ${transferManualFieldsHtml(mode, teamId, t)}
        </div>`
            : transferManualFieldsHtml(mode, teamId, t)
        }
      </div>
    </article>`;
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
        <header class="mw-hero mw-hero--stadium">
          <div class="mw-hero__atmosphere" aria-hidden="true">
            <div class="mw-hero__glow"></div>
            <div class="mw-hero__pitch"></div>
            <div class="mw-hero__markings"></div>
          </div>
          <div class="mw-hero__grid">
            <div class="mw-hero__copy">
              <p class="mw-eyebrow mw-eyebrow--live">Market moves</p>
              <h2 class="mw-heading">Transfers</h2>
              <p class="mw-lead">Transfers are not used for the <strong>World Cup</strong>. Switch to a club league to manage market moves.</p>
            </div>
            <aside class="mw-hero__aside">
              <div class="mw-hero-preview transfers-hero-preview transfers-hero-preview--empty">
                <span class="mw-hero-preview-label">${esc(leagueName)}</span>
                <strong class="mw-hero-preview-title">Not available</strong>
                <span class="mw-hero-preview-range">Club leagues only</span>
              </div>
            </aside>
          </div>
        </header>
        <section class="mw-card mw-card--striped">
          <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
          <div class="mw-card-head mw-card-head--icon">
            <div class="mw-card-head__icon mw-card-head__icon--transfer" aria-hidden="true"></div>
            <div>
              <h3>Switch league</h3>
              <p>Choose a domestic league below to edit incoming, outgoing, loan return, and recall lists.</p>
            </div>
          </div>
          <div class="transfers-filter-bar">
            <div class="row g-2 g-md-3">
              <div class="col-12 col-md-6 col-lg-4">
                ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
              </div>
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
  const scoped = transferTeamFilter
    ? transferListsForEditor(leagueFilter, transferTeamFilter)
    : { in: [], out: [], promoted: [], loanReturn: [], loanRecall: [] };
  const inCount = scoped.in.length;
  const promotedCount = scoped.promoted.length;
  const outCount = scoped.out.length;
  const loanReturnCount = scoped.loanReturn.length;
  const loanRecallCount = scoped.loanRecall.length;

  const transferSectionsHtml = ADMIN_TRANSFER_SECTIONS.map((section) => {
    const rows = scoped[section.key] ?? [];
    const rowHtml =
      section.key === "in"
        ? rows.map((t, i) => transferInRowHtml(transferTeamFilter, t, i)).join("")
        : rows.map((t, i) => transferTableRowHtml(section.key, transferTeamFilter, t, i)).join("");
    const emptyRow =
      rows.length === 0
        ? `<div class="transfers-empty-row" role="status"><span class="transfers-empty-msg">No ${esc(section.title.toLowerCase())} yet — use <strong>${esc(section.btnLabel)}</strong> below.</span></div>`
        : "";
    return `
        <section class="transfers-section transfers-section--${esc(section.key)}">
          <div class="transfers-section__stripe" aria-hidden="true"></div>
          <div class="transfers-section__head">
            <div class="transfers-section__icon transfers-section__icon--${esc(section.key)}" aria-hidden="true"></div>
            <div class="transfers-section__copy">
              <h4 class="transfers-section-title">${esc(section.title)}${team ? ` · ${esc(team.name)}` : ""}</h4>
              <p class="transfers-section-hint">${section.hint}</p>
            </div>
            <span class="transfers-section-count" aria-label="${rows.length} entries">${rows.length}</span>
          </div>
          <div class="transfers-list-wrap">
            <div class="transfers-card-list" id="${esc(section.tableId)}" role="list">${rowHtml}${emptyRow}</div>
          </div>
          <div class="transfers-section-actions">
            <button type="button" class="mw-btn-ghost transfers-add-btn transfers-add-btn--${esc(section.key)}" id="${esc(section.btnId)}">${esc(section.btnLabel)}</button>
          </div>
        </section>`;
  }).join("");

  return `
    <div class="mw-page transfers-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Market moves</p>
            <h2 class="mw-heading">Transfers</h2>
            <p class="mw-lead">Choose league and club — set <strong>In</strong>, <strong>Promoted</strong>, <strong>Out</strong>, <strong>Loan Return</strong>, and <strong>Recall</strong> for that team. For market moves, pick an existing player (League → Team → Player) to reuse the roster record and auto-create the paired opposite entry.</p>
            ${transfersStatChipsHtml(inCount, promotedCount, outCount, loanReturnCount, loanRecallCount)}
          </div>
          <aside class="mw-hero__aside">
            <div class="transfers-team-preview">
              ${adminTeamCrestHtml(team)}
              <div class="mw-hero-preview transfers-hero-preview">
                <span class="mw-hero-preview-label">${esc(team?.name ?? "Select club")}</span>
                <strong class="mw-hero-preview-title">${inCount + promotedCount + outCount + loanReturnCount + loanRecallCount} move${inCount + promotedCount + outCount + loanReturnCount + loanRecallCount === 1 ? "" : "s"}</strong>
                <span class="mw-hero-preview-range">${esc(leagueName)}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--transfer" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--transfer" aria-hidden="true"></div>
          <div>
            <h3>Club transfers</h3>
            <p>Edits apply to the selected club only. Save when all lists are ready — or restore from <code>data.json</code> to undo local changes.</p>
          </div>
        </div>
        <div class="transfers-filter-bar">
          <div class="row g-2 g-md-3 transfers-filter-row">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league")}
            </div>
            <div class="col-12 col-md-6 col-lg-4">
              <div class="mw-field mb-0">
                <label for="transferTeamFilter">Club</label>
                <div class="mw-select-wrap">
                  <select id="transferTeamFilter" class="mw-select"${teams.length ? "" : " disabled"}>${teamOpts}</select>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${tmTransferSyncPanelHtml(team)}

        <div class="transfers-sections">${transferSectionsHtml}</div>

        <div class="transfers-form-footer">
          <button type="button" class="mw-btn-primary transfers-save-btn" id="btnSaveTransfers">Save transfers for ${esc(team?.name ?? "club")}</button>
          <button type="button" class="mw-btn-ghost transfers-restore-btn" id="btnRestoreTransfers">Restore from data.json</button>
        </div>
      </section>
      <datalist id="trNationalityList">${nationalityDatalistHtml()}</datalist>
    </div>
  `;
}

function standingsStats(rows, teams) {
  const filled = rows.filter(([, club]) => String(club ?? "").trim()).length;
  const withPts = rows.filter(([, , pts]) => Number(pts) > 0).length;
  const sorted = [...rows].sort((a, b) => (Number(b[2]) || 0) - (Number(a[2]) || 0));
  const leader = sorted.find(([, club]) => String(club ?? "").trim()) ?? sorted[0];
  const leaderClub = leader ? String(leader[1] ?? "").trim() : "";
  const leaderPts = leader ? Number(leader[2]) || 0 : 0;
  const maxPts = rows.reduce((m, [, , pts]) => Math.max(m, Number(pts) || 0), 0);
  return {
    count: rows.length,
    filled,
    withPts,
    leaderClub,
    leaderPts,
    maxPts,
    teams: teams.length,
  };
}

function standingsStatChipsHtml(stats) {
  return `<div class="standings-stat-row" aria-label="Standings summary">
    <span class="standings-stat-chip standings-stat-chip--rows"><span class="standings-stat-chip__label">Rows</span><span class="standings-stat-chip__val">${stats.count}</span></span>
    <span class="standings-stat-chip standings-stat-chip--filled"><span class="standings-stat-chip__label">Clubs set</span><span class="standings-stat-chip__val">${stats.filled}</span></span>
    <span class="standings-stat-chip standings-stat-chip--leader"><span class="standings-stat-chip__label">Leader</span><span class="standings-stat-chip__val">${stats.leaderPts} pts</span></span>
    <span class="standings-stat-chip standings-stat-chip--teams"><span class="standings-stat-chip__label">In league</span><span class="standings-stat-chip__val">${stats.teams}</span></span>
  </div>`;
}

function standingsEmptyListHtml() {
  return `<div class="standings-empty-list">
    <p class="standings-empty-list__text">No standings rows yet — use <strong>Add row</strong> below.</p>
  </div>`;
}

function standingsRankTierClass(rk) {
  const n = Number(rk) || 0;
  if (n === 1) return "st-card--gold";
  if (n === 2) return "st-card--silver";
  if (n === 3) return "st-card--bronze";
  return "";
}

function standingsTeamForClub(clubName, teams) {
  const trimmed = String(clubName ?? "").trim();
  if (!trimmed) return null;
  return teams.find((t) => t.name === trimmed) ?? null;
}

function standingsRowHtml(rk, club, pts, i, teams) {
  const team = standingsTeamForClub(club, teams);
  const tier = standingsRankTierClass(rk);
  const key = `st-row-${i}-${String(club || "empty").replace(/\s+/g, "_")}`;
  return `<article class="st-card st-row st-sort-row ${tier}" data-i="${i}" data-st-row-key="${esc(key)}">
    <div class="st-card__stripe" aria-hidden="true"></div>
    <span class="player-drag-handle st-card__drag" draggable="true" title="Drag to set table position" tabindex="-1" aria-hidden="true">⋮⋮</span>
    <div class="st-field st-field--rank">
      <label class="st-field-label">#</label>
      <input class="st-rk standings-input standings-input--rk mw-input" type="number" value="${esc(rk)}" aria-label="Rank" min="1" />
    </div>
    <div class="st-card__crest" data-st-crest>${adminTeamCrestHtml(team)}</div>
    <div class="st-card__grid">
      <div class="st-field st-field--club">
        <label class="st-field-label">Club</label>
        ${standingsClubSelectHtml(club, teams)}
      </div>
      <div class="st-field st-field--pts">
        <label class="st-field-label">Pts</label>
        <input class="st-pts standings-input standings-input--pts mw-input" type="number" value="${esc(pts)}" aria-label="Points" min="0" />
      </div>
    </div>
    <button type="button" class="mw-btn-danger standings-del-btn st-del" title="Remove row">×</button>
  </article>`;
}

function panelStandings() {
  if (leagueFilter === "worldcup") return panelWorldCupStandings();

  const teams = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const rows = standingsRows(leagueFilter);
  const stats = standingsStats(rows, teams);
  const leaderTeam = standingsTeamForClub(stats.leaderClub, teams);
  const listBody = rows.length
    ? rows.map(([rk, club, pts], i) => standingsRowHtml(rk, club, pts, i, teams)).join("")
    : standingsEmptyListHtml();

  const emptyTeams = !teams.length
    ? `<div class="standings-empty">
        <div class="standings-empty__icon" aria-hidden="true"></div>
        <p class="standings-empty__title">No teams yet</p>
        <p class="standings-empty__text">Add teams in the <strong>Teams</strong> tab first, then return here to build the league table.</p>
      </div>`
    : "";

  return `
    <div class="mw-page standings-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">League table</p>
            <h2 class="mw-heading">Standings</h2>
            <p class="mw-lead">Edit the mini table shown on the public site. Clubs are chosen from the <strong>Teams</strong> list for this league.</p>
            ${rows.length ? standingsStatChipsHtml(stats) : ""}
          </div>
          <aside class="mw-hero__aside">
            <div class="standings-hero-preview">
              ${adminTeamCrestHtml(leaderTeam)}
              <div class="mw-hero-preview standings-hero-preview__box">
                <span class="mw-hero-preview-label">${esc(stats.leaderClub || leagueName)}</span>
                <strong class="mw-hero-preview-title">${stats.leaderClub ? `${stats.leaderPts} pts` : `${rows.length} club${rows.length === 1 ? "" : "s"}`}</strong>
                <span class="mw-hero-preview-range">${stats.leaderClub ? "Table leader" : `Top ${rows.length || 10} table`}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--standings" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--standings" aria-hidden="true"></div>
          <div>
            <h3>Top ${rows.length || 10} standings</h3>
            <p>Drag the <strong>⋮⋮</strong> handle to set table position, or edit rank numbers. Top three rows get gold, silver, and bronze styling on the public widget.</p>
          </div>
        </div>
        <div class="standings-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
          </div>
        </div>
        ${
          emptyTeams
            ? emptyTeams
            : `<div class="standings-list-wrap admin-table-wrap--sort">
          <div class="standings-list" id="standingsList">${listBody}</div>
        </div>
        <div class="standings-form-footer">
          <button type="button" class="mw-btn-ghost standings-add-btn" id="btnAddStandRow">Add row</button>
          <button type="button" class="mw-btn-primary standings-save-btn" id="btnSaveStandings">Save standings</button>
        </div>`
        }
      </section>
    </div>
  `;
}

function panelScorers() {
  const teams = teamsForLeague(leagueFilter);
  const leagueName = leagues().find((l) => l.id === leagueFilter)?.name ?? leagueFilter;
  const rows = scorersRows(leagueFilter);
  const stats = scorersStats(rows, teams);
  const leaderTeam = standingsTeamForClub(stats.leaderClub, teams);
  const listBody = rows.length
    ? rows.map(([name, club, goals], i) => renderScorerRowHtml(name, club, goals, i, teams, stats.maxGoals)).join("")
    : scorersEmptyListHtml();

  const emptyTeams = !teams.length
    ? `<div class="scorers-empty">
        <div class="scorers-empty__icon" aria-hidden="true"></div>
        <p class="scorers-empty__title">No teams yet</p>
        <p class="scorers-empty__text">Add teams in the <strong>Teams</strong> tab first, then return here to build the top scorers chart.</p>
      </div>`
    : "";

  const leaderLine = stats.leaderName
    ? `${stats.leaderName} · ${stats.leaderGoals} goal${stats.leaderGoals === 1 ? "" : "s"}`
    : "No scorers yet";

  return `
    <div class="mw-page scorers-page">
      <header class="mw-hero mw-hero--stadium">
        <div class="mw-hero__atmosphere" aria-hidden="true">
          <div class="mw-hero__glow"></div>
          <div class="mw-hero__pitch"></div>
          <div class="mw-hero__markings"></div>
        </div>
        <div class="mw-hero__grid">
          <div class="mw-hero__copy">
            <p class="mw-eyebrow mw-eyebrow--live">Goal charts</p>
            <h2 class="mw-heading">Top scorers</h2>
            <p class="mw-lead">Pick a <strong>club</strong> first — the <strong>player</strong> list fills from that team’s squad. Row order is the public chart order.</p>
            ${rows.length ? scorersStatChipsHtml(stats) : ""}
          </div>
          <aside class="mw-hero__aside">
            <div class="scorers-hero-preview">
              ${adminTeamCrestHtml(leaderTeam)}
              <div class="mw-hero-preview scorers-hero-preview__box">
                <span class="mw-hero-preview-label">${esc(stats.leaderClub || leagueName)}</span>
                <strong class="mw-hero-preview-title">${stats.leaderName ? esc(stats.leaderName) : `${rows.length} scorer${rows.length === 1 ? "" : "s"}`}</strong>
                <span class="mw-hero-preview-range">${esc(leaderLine)}</span>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <section class="mw-card mw-card--striped">
        <div class="mw-card__stripe mw-card__stripe--scorers" aria-hidden="true"></div>
        <div class="mw-card-head mw-card-head--icon">
          <div class="mw-card-head__icon mw-card-head__icon--scorers" aria-hidden="true"></div>
          <div>
            <h3>Scorer list</h3>
            <p>${rows.length} row${rows.length === 1 ? "" : "s"} · shown on the public top scorers widget. Top three rows get gold, silver, and bronze styling.</p>
          </div>
        </div>
        <div class="scorers-filter-bar">
          <div class="row g-2 g-md-3">
            <div class="col-12 col-md-6 col-lg-4">
              ${leagueSelect("leagueFilter", leagueFilter, "mw-field mw-field--league mb-0")}
            </div>
          </div>
        </div>
        ${
          emptyTeams
            ? emptyTeams
            : `<div class="scorers-list-wrap">
          <div class="scorers-list" id="scorersList">${listBody}</div>
        </div>
        <div class="scorers-form-footer">
          <button type="button" class="mw-btn-ghost scorers-add-btn" id="btnAddScorerRow">Add row</button>
          <button type="button" class="mw-btn-primary scorers-save-btn" id="btnSaveScorers">Save scorers</button>
        </div>`
        }
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
    clearTmSyncState();
    squadDepthTeamFilter = "";
    nationalDutyTeamFilter = "";
    if (activeTab === "transfers") stashTransferEditsFromDom();
    transferTeamFilter = "";
    matchEditId = "";
    stadiumEditName = "";
    tmStadiumSyncState = null;
    tmMatchdaySyncState = null;
    renderPanel();
  });
}

function bindPanelHandlers() {
  for (const btn of document.querySelectorAll("[data-overview-tab]")) {
    btn.addEventListener("click", () => {
      activeTab = btn.getAttribute("data-overview-tab");
      renderNav();
      renderPanel();
    });
  }

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
      const text =
        typeof FCFirebase.formatAuthError === "function"
          ? FCFirebase.formatAuthError(err)
          : err?.message || "Firebase sign-in failed";
      alert(text);
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

  bindMatchweekFilterSelect();

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

function recalculateTmMatchdayDiff() {
  if (!tmMatchdaySyncState || typeof TransfermarktSync === "undefined") return;
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const mw = tmMatchdaySyncState.matchweek || meta.matchweek || 36;
  const mwTag = `MW ${mw}`;
  const localMatches =
    typeof filterMatchesForLeagueWeek === "function"
      ? filterMatchesForLeagueWeek(state().matches, leagueFilter, mw)
      : state().matches.filter((m) => m.leagueId === leagueFilter && (m.matchday === mwTag || !m.matchday));
  const teams = teamsForLeague(leagueFilter).map((t) => ({
    id: t.id,
    name: t.name,
    stadium: t.stadium,
    clubId: typeof TransfermarktTeams !== "undefined" ? TransfermarktTeams.clubIdForTeam(t) : null,
  }));
  tmMatchdaySyncState.diff = TransfermarktSync.compareMatchday({
    localMatches,
    tmFixtures: tmMatchdaySyncState.tmFixtures,
    teams,
  });
}

function tmGoalsForSave(goals) {
  return (goals ?? []).map((g) => ({
    minute: Number(g.minute) || 0,
    side: g.side === "away" ? "away" : "home",
    scorer: String(g.scorer ?? "").trim(),
    assist: null,
  })).filter((g) => g.scorer);
}

function buildMatchFromTmFixture(tm, matchweek) {
  const home = state().teams.find((t) => t.id === tm.homeTeamId);
  const away = state().teams.find((t) => t.id === tm.awayTeamId);
  const stadium = String(home?.stadium ?? "").trim() || "—";
  if (stadium && stadium !== "—") FCDataStore.addLeagueStadium(leagueFilter, stadium);
  const id = `${leagueFilter}_mw${matchweek}_${FCDataStore.slugify(home?.name ?? "h")}_${FCDataStore.slugify(away?.name ?? "a")}`;
  return {
    id,
    leagueId: leagueFilter,
    matchday: `MW ${matchweek}`,
    status: tm.score ? "FT" : "NS",
    time: tm.timeLabel || "—",
    stadium,
    homeTeamId: tm.homeTeamId,
    awayTeamId: tm.awayTeamId,
    score: tm.score ? [tm.score[0], tm.score[1]] : [0, 0],
    scorers: [],
    goalEvents: tmGoalsForSave(tm.goals),
    possession: [],
    momentum: 0.5,
    formation: ["—", "—"],
    lineups: { home: [], away: [] },
  };
}

function patchMatchFromTm(local, tm, changes) {
  const next = { ...local };
  const changeSet = new Set(changes ?? []);
  if (changeSet.has("score") && tm.score) {
    next.score = [tm.score[0], tm.score[1]];
    next.status = "FT";
  }
  if (changeSet.has("time") && tm.timeLabel) next.time = tm.timeLabel;
  if (changeSet.has("goals") && (tm.goals ?? []).length) {
    next.goalEvents = tmGoalsForSave(tm.goals);
  }
  return next;
}

function maybeUpdateMatchweekDateRangeFromTm() {
  const dates = (tmMatchdaySyncState?.tmFixtures ?? [])
    .map((f) => f.dateIso)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!dates.length) return;
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  if (String(meta.dateRange ?? "").trim()) return;
  const fmt = (iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  const range =
    dates[0] === dates[dates.length - 1]
      ? fmt(dates[0])
      : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
  FCDataStore.setLeagueMeta(leagueFilter, { ...meta, dateRange: range });
}

async function refreshTransfermarktMatchday() {
  if (typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter)) {
    return toast("World Cup fixtures are managed manually");
  }
  if (typeof TransfermarktSync === "undefined" || typeof TransfermarktTeams === "undefined") {
    return toast("Transfermarkt sync module failed to load");
  }
  if (!tmSyncLocalProxyReady()) {
    return toast("Run serve.bat locally — Transfermarkt comparison needs the local server proxy");
  }
  const compId = TransfermarktTeams.competitionIdForLeague?.(leagueFilter);
  if (!compId) return toast("No Transfermarkt competition mapping for this league");

  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const mwFromInput = Number($("#mwNum")?.value);
  const matchweek = Number.isInteger(mwFromInput) && mwFromInput > 0 ? mwFromInput : meta.matchweek ?? 36;
  const season = Number($("#tmMatchdaySeason")?.value ?? tmMatchdaySeason);
  if (!Number.isInteger(season) || season < 1900 || season > 2100) {
    return toast("Enter a valid season start year, for example 2025");
  }
  tmMatchdaySeason = season;

  const btn = $("#btnTmMatchdayRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Comparing…";
  }
  try {
    const mwTag = `MW ${matchweek}`;
    const localMatches =
      typeof filterMatchesForLeagueWeek === "function"
        ? filterMatchesForLeagueWeek(state().matches, leagueFilter, matchweek)
        : state().matches.filter((m) => m.leagueId === leagueFilter && (m.matchday === mwTag || !m.matchday));
    const teams = teamsForLeague(leagueFilter).map((t) => ({
      id: t.id,
      name: t.name,
      stadium: t.stadium,
      clubId: TransfermarktTeams.clubIdForTeam(t),
    }));
    const result = await TransfermarktSync.fetchAndCompareMatchday({
      localMatches,
      teams,
      compId,
      season,
      matchday: matchweek,
    });
    tmMatchdaySyncState = {
      ...result,
      leagueId: leagueFilter,
      matchweek,
      season,
      ignoredAdd: new Set(),
      ignoredUpdate: new Set(),
      ignoredRemove: new Set(),
    };
    const diff = tmMatchdayVisibleDiff();
    toast(
      diff.toAdd.length || diff.toUpdate.length || diff.toRemove.length
        ? `Transfermarkt: ${diff.toAdd.length} to add · ${diff.toUpdate.length} to sync · ${diff.toRemove.length} to remove`
        : "Matchweek matches Transfermarkt",
    );
    renderPanel();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message ?? err);
    if (looksLikeHtmlToast(msg)) {
      toast("Transfermarkt comparison only works with serve.bat on your computer");
    } else {
      toast(msg.slice(0, 180));
    }
  } finally {
    if (btn) {
      const ready =
        tmSyncLocalProxyReady() && Boolean(TransfermarktTeams.competitionIdForLeague?.(leagueFilter));
      btn.disabled = !ready;
      btn.textContent = "Compare with Transfermarkt";
    }
  }
}

function maybeAdvanceLiveMatchweek(week) {
  const n = Number(week);
  if (!Number.isInteger(n) || n < 1) return;
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  const cur = Number(meta.matchweek) || 0;
  if (n > cur) applySelectedMatchweek(n);
}

function applyTmMatchdayAdd(key) {
  const entry = tmMatchdayVisibleDiff()?.toAdd?.find((row) => tmMatchdayFixtureKey(row) === key);
  if (!entry || !tmMatchdaySyncState) return;
  FCDataStore.upsertMatch(buildMatchFromTmFixture(entry, tmMatchdaySyncState.matchweek));
  maybeUpdateMatchweekDateRangeFromTm();
  maybeAdvanceLiveMatchweek(tmMatchdaySyncState.matchweek);
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast(`${entry.homeTeamName} vs ${entry.awayTeamName} added`);
  renderPanel();
}

function applyTmMatchdaySync(key) {
  const entry = tmMatchdayVisibleDiff()?.toUpdate?.find((row) => tmMatchdayFixtureKey(row) === key);
  if (!entry) return;
  FCDataStore.upsertMatch(patchMatchFromTm(entry.local, entry.tm, entry.changes));
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast(`Synced ${entry.tm.homeTeamName} vs ${entry.tm.awayTeamName}`);
  renderPanel();
}

function applyTmMatchdayRemove(key) {
  const entry = tmMatchdayVisibleDiff()?.toRemove?.find((row) => tmMatchdayFixtureKey(row) === key);
  if (!entry) return;
  if (!confirm("Remove this fixture?")) return;
  FCDataStore.removeMatch(entry.id);
  if (matchEditId === entry.id) matchEditId = "";
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast("Fixture removed");
  renderPanel();
}

function applyAllTmMatchdayAdds() {
  const entries = tmMatchdayVisibleDiff()?.toAdd ?? [];
  if (!entries.length || !tmMatchdaySyncState) return;
  for (const entry of entries) {
    FCDataStore.upsertMatch(buildMatchFromTmFixture(entry, tmMatchdaySyncState.matchweek));
  }
  maybeUpdateMatchweekDateRangeFromTm();
  maybeAdvanceLiveMatchweek(tmMatchdaySyncState.matchweek);
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast(`Added ${entries.length} fixture${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTmMatchdaySyncs() {
  const entries = tmMatchdayVisibleDiff()?.toUpdate ?? [];
  if (!entries.length) return;
  for (const entry of entries) {
    FCDataStore.upsertMatch(patchMatchFromTm(entry.local, entry.tm, entry.changes));
  }
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast(`Synced ${entries.length} fixture${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTmMatchdayRemoves() {
  const entries = tmMatchdayVisibleDiff()?.toRemove ?? [];
  if (!entries.length) return;
  if (!confirm(`Remove ${entries.length} fixture${entries.length === 1 ? "" : "s"} only in Squad Central?`)) {
    return;
  }
  for (const entry of entries) {
    FCDataStore.removeMatch(entry.id);
    if (matchEditId === entry.id) matchEditId = "";
  }
  syncToAppArrays();
  recalculateTmMatchdayDiff();
  toast(`Removed ${entries.length} fixture${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function ignoreTmMatchdaySuggestion(kind, key) {
  if (!tmMatchdaySyncState) return;
  if (!tmMatchdaySyncState.ignoredAdd) tmMatchdaySyncState.ignoredAdd = new Set();
  if (!tmMatchdaySyncState.ignoredUpdate) tmMatchdaySyncState.ignoredUpdate = new Set();
  if (!tmMatchdaySyncState.ignoredRemove) tmMatchdaySyncState.ignoredRemove = new Set();
  const map = {
    add: tmMatchdaySyncState.ignoredAdd,
    update: tmMatchdaySyncState.ignoredUpdate,
    remove: tmMatchdaySyncState.ignoredRemove,
  };
  map[kind]?.add(key);
  toast("Suggestion ignored");
  renderPanel();
}

function bindTmMatchdaySync() {
  $("#tmMatchdaySeason")?.addEventListener("change", (e) => {
    const season = Number(e.target.value);
    if (Number.isInteger(season)) tmMatchdaySeason = season;
  });
  $("#btnTmMatchdayRefresh")?.addEventListener("click", refreshTransfermarktMatchday);
  $("#btnTmMatchdayAddAll")?.addEventListener("click", applyAllTmMatchdayAdds);
  $("#btnTmMatchdaySyncAll")?.addEventListener("click", applyAllTmMatchdaySyncs);
  $("#btnTmMatchdayRemoveAll")?.addEventListener("click", applyAllTmMatchdayRemoves);
  $("#matchweekTmSync")?.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const add = target?.closest("[data-tm-matchday-add]");
    if (add) return applyTmMatchdayAdd(add.getAttribute("data-tm-matchday-add"));
    const sync = target?.closest("[data-tm-matchday-sync]");
    if (sync) return applyTmMatchdaySync(sync.getAttribute("data-tm-matchday-sync"));
    const remove = target?.closest("[data-tm-matchday-remove]");
    if (remove) return applyTmMatchdayRemove(remove.getAttribute("data-tm-matchday-remove"));
    const ignoreAdd = target?.closest("[data-tm-matchday-ignore-add]");
    if (ignoreAdd) {
      return ignoreTmMatchdaySuggestion("add", ignoreAdd.getAttribute("data-tm-matchday-ignore-add"));
    }
    const ignoreUpdate = target?.closest("[data-tm-matchday-ignore-update]");
    if (ignoreUpdate) {
      return ignoreTmMatchdaySuggestion(
        "update",
        ignoreUpdate.getAttribute("data-tm-matchday-ignore-update"),
      );
    }
    const ignoreRemove = target?.closest("[data-tm-matchday-ignore-remove]");
    if (ignoreRemove) {
      return ignoreTmMatchdaySuggestion(
        "remove",
        ignoreRemove.getAttribute("data-tm-matchday-ignore-remove"),
      );
    }
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

  bindTmMatchdaySync();
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
  if (typeof rebuildLineupRosterIndex === "function") rebuildLineupRosterIndex();
}

function recalculateTmStadiumDiff() {
  if (!tmStadiumSyncState || typeof TransfermarktSync === "undefined") return;
  const teams = teamsForLeague(leagueFilter).map((t) => ({
    id: t.id,
    name: t.name,
    stadium: t.stadium,
    clubId: typeof TransfermarktTeams !== "undefined" ? TransfermarktTeams.clubIdForTeam(t) : null,
  }));
  tmStadiumSyncState.diff = TransfermarktSync.compareLeagueStadiums({
    localNames: stadiumsForLeague(leagueFilter),
    teams,
    tmByTeamId: tmStadiumSyncState.tmByTeamId,
  });
}

function retargetStadiumName(from, to) {
  const fromN = String(from ?? "").trim();
  const toN = String(to ?? "").trim();
  if (!toN) return false;
  const list = stadiumsForLeague(leagueFilter);
  const hasFrom = Boolean(fromN && list.includes(fromN));
  const hasTo = list.includes(toN);

  if (hasFrom && fromN !== toN) {
    if (!hasTo) {
      FCDataStore.renameLeagueStadium(leagueFilter, fromN, toN);
      return true;
    }
    for (const t of teamsForLeague(leagueFilter)) {
      if (String(t.stadium ?? "").trim() === fromN) {
        FCDataStore.upsertTeam({ ...t, stadium: toN });
      }
    }
    for (const m of state().matches ?? []) {
      if (m.leagueId === leagueFilter && String(m.stadium ?? "").trim() === fromN) {
        FCDataStore.upsertMatch({ ...m, stadium: toN });
      }
    }
    FCDataStore.removeLeagueStadium(leagueFilter, fromN);
    return true;
  }

  FCDataStore.addLeagueStadium(leagueFilter, toN);
  return true;
}

function linkTeamStadium(teamId, stadiumName) {
  const team = state().teams.find((t) => t.id === teamId);
  const name = String(stadiumName ?? "").trim();
  if (!team || !name) return false;
  FCDataStore.addLeagueStadium(leagueFilter, name);
  FCDataStore.upsertTeam({ ...team, stadium: name });
  return true;
}

async function refreshTransfermarktStadiums() {
  if (leagueFilter === "worldcup") return toast("World Cup venues are managed manually");
  if (typeof TransfermarktSync === "undefined" || typeof TransfermarktTeams === "undefined") {
    return toast("Transfermarkt sync module failed to load");
  }
  if (!tmSyncLocalProxyReady()) {
    return toast("Run serve.bat locally — Transfermarkt comparison needs the local server proxy");
  }
  const teams = teamsForLeague(leagueFilter).map((t) => ({
    id: t.id,
    name: t.name,
    stadium: t.stadium,
    clubId: TransfermarktTeams.clubIdForTeam(t),
  }));
  if (!teams.some((t) => t.clubId)) {
    return toast("Save Transfermarkt club links on Teams first");
  }
  const btn = $("#btnTmStadiumRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Comparing…";
  }
  try {
    const result = await TransfermarktSync.fetchAndCompareLeagueStadiums({
      localNames: stadiumsForLeague(leagueFilter),
      teams,
    });
    tmStadiumSyncState = {
      ...result,
      leagueId: leagueFilter,
      ignoredAdd: new Set(),
      ignoredLink: new Set(),
      ignoredRename: new Set(),
      ignoredRemove: new Set(),
    };
    const diff = tmStadiumVisibleDiff();
    toast(
      diff.toAdd.length || diff.toLink.length || diff.toRename.length || diff.toRemove.length
        ? `Transfermarkt: ${diff.toAdd.length} to add · ${diff.toLink.length} to link · ${diff.toRename.length} to rename · ${diff.toRemove.length} unused`
        : "Stadiums match Transfermarkt",
    );
    renderPanel();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message ?? err);
    if (looksLikeHtmlToast(msg)) {
      toast("Transfermarkt comparison only works with serve.bat on your computer");
    } else {
      toast(msg.slice(0, 180));
    }
  } finally {
    if (btn) {
      const withTm = teamsForLeague(leagueFilter).some((t) => tmSyncAvailableForTeam(t));
      btn.disabled = !tmSyncLocalProxyReady() || !withTm;
      btn.textContent = "Compare with Transfermarkt";
    }
  }
}

function applyTmStadiumAdd(nameKey) {
  const entry = tmStadiumVisibleDiff()?.toAdd?.find((row) => tmStadiumNameKey(row.name) === nameKey);
  if (!entry) return;
  FCDataStore.addLeagueStadium(leagueFilter, entry.name);
  recalculateTmStadiumDiff();
  toast(`${entry.name} added`);
  renderPanel();
}

function applyTmStadiumLink(teamId) {
  const entry = tmStadiumVisibleDiff()?.toLink?.find((row) => row.teamId === teamId);
  if (!entry) return;
  if (!linkTeamStadium(teamId, entry.to)) return;
  syncToAppArrays();
  recalculateTmStadiumDiff();
  toast(`${entry.teamName} → ${entry.to}`);
  renderPanel();
}

function applyTmStadiumRename(renameKey) {
  const entry = tmStadiumVisibleDiff()?.toRename?.find(
    (row) => `${row.teamId}:${tmStadiumNameKey(row.from)}:${tmStadiumNameKey(row.to)}` === renameKey,
  );
  if (!entry) return;
  retargetStadiumName(entry.from, entry.to);
  linkTeamStadium(entry.teamId, entry.to);
  syncToAppArrays();
  recalculateTmStadiumDiff();
  toast(`${entry.from} → ${entry.to}`);
  renderPanel();
}

function applyTmStadiumRemove(nameKey) {
  const entry = tmStadiumVisibleDiff()?.toRemove?.find((row) => tmStadiumNameKey(row.name) === nameKey);
  if (!entry) return;
  if (!confirm(`Remove unused stadium “${entry.name}”?`)) return;
  FCDataStore.removeLeagueStadium(leagueFilter, entry.name);
  recalculateTmStadiumDiff();
  toast(`${entry.name} removed`);
  renderPanel();
}

function applyAllTmStadiumAdds() {
  const entries = tmStadiumVisibleDiff()?.toAdd ?? [];
  if (!entries.length) return;
  for (const entry of entries) FCDataStore.addLeagueStadium(leagueFilter, entry.name);
  recalculateTmStadiumDiff();
  toast(`Added ${entries.length} stadium${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTmStadiumLinks() {
  const entries = tmStadiumVisibleDiff()?.toLink ?? [];
  if (!entries.length) return;
  for (const entry of entries) linkTeamStadium(entry.teamId, entry.to);
  syncToAppArrays();
  recalculateTmStadiumDiff();
  toast(`Linked ${entries.length} club${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTmStadiumRenames() {
  const entries = tmStadiumVisibleDiff()?.toRename ?? [];
  if (!entries.length) return;
  const seen = new Set();
  for (const entry of entries) {
    const pair = `${tmStadiumNameKey(entry.from)}→${tmStadiumNameKey(entry.to)}`;
    if (!seen.has(pair)) {
      seen.add(pair);
      retargetStadiumName(entry.from, entry.to);
    }
    linkTeamStadium(entry.teamId, entry.to);
  }
  syncToAppArrays();
  recalculateTmStadiumDiff();
  toast(`Applied ${entries.length} rename${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function applyAllTmStadiumRemoves() {
  const entries = tmStadiumVisibleDiff()?.toRemove ?? [];
  if (!entries.length) return;
  if (!confirm(`Remove ${entries.length} unused stadium${entries.length === 1 ? "" : "s"}?`)) return;
  for (const entry of entries) FCDataStore.removeLeagueStadium(leagueFilter, entry.name);
  recalculateTmStadiumDiff();
  toast(`Removed ${entries.length} stadium${entries.length === 1 ? "" : "s"}`);
  renderPanel();
}

function ignoreTmStadiumSuggestion(kind, key) {
  if (!tmStadiumSyncState) return;
  if (!tmStadiumSyncState.ignoredAdd) tmStadiumSyncState.ignoredAdd = new Set();
  if (!tmStadiumSyncState.ignoredLink) tmStadiumSyncState.ignoredLink = new Set();
  if (!tmStadiumSyncState.ignoredRename) tmStadiumSyncState.ignoredRename = new Set();
  if (!tmStadiumSyncState.ignoredRemove) tmStadiumSyncState.ignoredRemove = new Set();
  const map = {
    add: tmStadiumSyncState.ignoredAdd,
    link: tmStadiumSyncState.ignoredLink,
    rename: tmStadiumSyncState.ignoredRename,
    remove: tmStadiumSyncState.ignoredRemove,
  };
  map[kind]?.add(key);
  toast("Suggestion ignored");
  renderPanel();
}

function bindTmStadiumSync() {
  $("#btnTmStadiumRefresh")?.addEventListener("click", refreshTransfermarktStadiums);
  $("#btnTmStadiumAddAll")?.addEventListener("click", applyAllTmStadiumAdds);
  $("#btnTmStadiumLinkAll")?.addEventListener("click", applyAllTmStadiumLinks);
  $("#btnTmStadiumRenameAll")?.addEventListener("click", applyAllTmStadiumRenames);
  $("#btnTmStadiumRemoveAll")?.addEventListener("click", applyAllTmStadiumRemoves);
  $("#stadiumsTmSync")?.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const add = target?.closest("[data-tm-stadium-add]");
    if (add) return applyTmStadiumAdd(add.getAttribute("data-tm-stadium-add"));
    const link = target?.closest("[data-tm-stadium-link]");
    if (link) return applyTmStadiumLink(link.getAttribute("data-tm-stadium-link"));
    const rename = target?.closest("[data-tm-stadium-rename]");
    if (rename) return applyTmStadiumRename(rename.getAttribute("data-tm-stadium-rename"));
    const remove = target?.closest("[data-tm-stadium-remove]");
    if (remove) return applyTmStadiumRemove(remove.getAttribute("data-tm-stadium-remove"));
    const ignoreAdd = target?.closest("[data-tm-stadium-ignore-add]");
    if (ignoreAdd) {
      return ignoreTmStadiumSuggestion("add", ignoreAdd.getAttribute("data-tm-stadium-ignore-add"));
    }
    const ignoreLink = target?.closest("[data-tm-stadium-ignore-link]");
    if (ignoreLink) {
      return ignoreTmStadiumSuggestion("link", ignoreLink.getAttribute("data-tm-stadium-ignore-link"));
    }
    const ignoreRename = target?.closest("[data-tm-stadium-ignore-rename]");
    if (ignoreRename) {
      return ignoreTmStadiumSuggestion(
        "rename",
        ignoreRename.getAttribute("data-tm-stadium-ignore-rename"),
      );
    }
    const ignoreRemove = target?.closest("[data-tm-stadium-ignore-remove]");
    if (ignoreRemove) {
      return ignoreTmStadiumSuggestion(
        "remove",
        ignoreRemove.getAttribute("data-tm-stadium-ignore-remove"),
      );
    }
  });
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
      if (tmStadiumSyncState?.leagueId === leagueFilter) recalculateTmStadiumDiff();
      toast("Stadium updated");
      renderPanel();
      return;
    }
    if (!FCDataStore.addLeagueStadium(leagueFilter, name)) {
      return alert("That stadium already exists");
    }
    if (tmStadiumSyncState?.leagueId === leagueFilter) recalculateTmStadiumDiff();
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
      if (tmStadiumSyncState?.leagueId === leagueFilter) recalculateTmStadiumDiff();
      toast("Stadium removed");
      renderPanel();
    });
  });

  bindTmStadiumSync();
}

function bindTeamRowDragSort() {
  const list = $("#teamsSortList");
  if (!list || list.dataset.teamDragBound === "1") return;
  list.dataset.teamDragBound = "1";

  let draggedId = null;
  let touchRow = null;
  let touchMoved = false;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".team-sort-row") : null;
  };

  const persistOrder = () => {
    const ids = [...list.querySelectorAll(".team-sort-row")]
      .map((r) => r.getAttribute("data-team-id"))
      .filter(Boolean);
    if (!ids.length || !leagueFilter) return;
    FCDataStore.reorderLeagueTeams(leagueFilter, ids);
    syncToAppArrays();
    toast("Club order saved");
    list.querySelectorAll(".team-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  };

  list.addEventListener("dragstart", (e) => {
    const handle = e.target.closest(".player-drag-handle");
    if (!handle) return;
    const row = handle.closest(".team-sort-row");
    if (!row) return;
    draggedId = row.getAttribute("data-team-id");
    row.classList.add("is-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId ?? "");
    }
  });

  list.addEventListener("dragend", (e) => {
    const row = e.target.closest(".team-sort-row");
    row?.classList.remove("is-dragging");
    draggedId = null;
    list.querySelectorAll(".team-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".team-sort-row");
    if (!target || !draggedId || target.getAttribute("data-team-id") === draggedId) return;

    const dragged = list.querySelector(`[data-team-id="${CSS.escape(draggedId)}"]`);
    if (!dragged) return;

    list.querySelectorAll(".team-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) list.insertBefore(dragged, target);
    else list.insertBefore(dragged, target.nextSibling);
  });

  list.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".team-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  list.addEventListener("drop", (e) => {
    e.preventDefault();
    persistOrder();
  });

  list.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".player-drag-handle");
      if (!handle || !list.contains(handle)) return;
      touchRow = handle.closest(".team-sort-row");
      touchMoved = false;
      touchRow?.classList.add("is-dragging");
    },
    { passive: true },
  );

  list.addEventListener(
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
      if (before) list.insertBefore(touchRow, target);
      else list.insertBefore(touchRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!touchRow) return;
    touchRow.classList.remove("is-dragging");
    if (touchMoved) persistOrder();
    touchRow = null;
    touchMoved = false;
  };

  list.addEventListener("touchend", endTouch);
  list.addEventListener("touchcancel", endTouch);
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
    if ($("#teamStadium")) $("#teamStadium").value = "";
    if ($("#teamTmUrlForm")) $("#teamTmUrlForm").value = "";
  });

  $("#btnSaveTeam")?.addEventListener("click", () => {
    const editId = $("#teamEditId").value;
    const name = $("#teamName").value.trim();
    if (!name) return alert("Name required");
    const id = editId || `${leagueFilter}_${FCDataStore.slugify(name)}`;
    const formation = $("#teamFormation").value.trim();
    const prev = editId ? state().teams.find((t) => t.id === editId) : null;
    let sortOrder = prev?.sortOrder;
    if (sortOrder == null && !editId) {
      const maxOrder = teamsForLeague(leagueFilter).reduce((m, t) => Math.max(m, t.sortOrder ?? -1), -1);
      sortOrder = maxOrder + 1;
    }
    const tmUrl = $("#teamTmUrlForm")?.value?.trim() || "";
    const tmId =
      typeof TransfermarktTeams !== "undefined" ? TransfermarktTeams.parseClubIdFromUrl(tmUrl) : null;
    if (tmUrl && !tmId) {
      return alert("Transfermarkt link must include /verein/123 (or be just the club id number)");
    }
    const stadium = $("#teamStadium")?.value?.trim() || "";
    const team = {
      id,
      leagueId: leagueFilter,
      name,
      city: $("#teamCity").value.trim() || name,
      formation: formation || undefined,
      coach: $("#teamCoach").value.trim() || "—",
      colors: [$("#teamC1").value, $("#teamC2").value],
      logo: $("#teamLogo").value.trim() || undefined,
      stadium: stadium || undefined,
    };
    if (sortOrder != null) team.sortOrder = sortOrder;
    if (prev?.squadDepth) team.squadDepth = prev.squadDepth;
    if (tmId) {
      team.transfermarktUrl = tmUrl;
      team.transfermarktId = tmId;
    }
    FCDataStore.upsertTeam(team);
    if (stadium) FCDataStore.addLeagueStadium(leagueFilter, stadium);
    if (!stadium && prev?.stadium) {
      const stored = state().teams.find((t) => t.id === id);
      if (stored) {
        delete stored.stadium;
        FCDataStore.upsertTeam(stored);
      }
    }
    if (!tmId) {
      const stored = state().teams.find((t) => t.id === id);
      if (stored) {
        delete stored.transfermarktUrl;
        delete stored.transfermarktId;
        FCDataStore.upsertTeam(stored);
      }
    }
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
      if ($("#teamStadium")) {
        ensureStadiumSelectOption($("#teamStadium"), t.stadium);
        $("#teamStadium").value = String(t.stadium ?? "").trim() || "";
      }
      if ($("#teamTmUrlForm")) $("#teamTmUrlForm").value = tmUrlValueForTeam(t);
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

  bindTeamRowDragSort();
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
      refreshSquadDepthUiFromDraft();
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

  $("#btnSdAutoFill")?.addEventListener("click", () => applySquadDepthAutoFill());
  $("#btnSdSeedLineup")?.addEventListener("click", () => applySquadDepthSeedFromLineup());

  $("#sdPitchPreview")?.addEventListener("click", (e) => {
    const node = e.target.closest("[data-sd-focus]");
    if (!node) return;
    const fieldId = node.getAttribute("data-sd-focus");
    const field = fieldId ? document.getElementById(fieldId) : null;
    if (!field) return;
    field.focus();
    field.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const row = field.closest(".sd-slot-row, .sd-gk-row");
    row?.classList.add("sd-row--flash");
    setTimeout(() => row?.classList.remove("sd-row--flash"), 900);
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
    refreshSquadDepthUiFromDraft();
  });

  $("#btnResetSquadDepth")?.addEventListener("click", () => {
    const teamId = $("#sdTeam")?.value ?? squadDepthTeamFilter;
    const team = state().teams.find((t) => t.id === teamId);
    if (!team) return;
    if (!confirm(`Clear depth chart picks for ${team.name}?`)) return;
    const formation = $("#sdFormation")?.value?.trim() || team.formation || "4-2-3-1";
    squadDepthDraft = SquadDepth.emptySquadDepth(formation);
    FCDataStore.upsertTeam({ ...team, squadDepth: squadDepthDraft });
    syncToAppArrays();
    toast("Depth chart cleared");
    writeSquadDepthPicksToDom(squadDepthDraft);
    refreshSquadDepthUiFromDraft();
  });
}

function bindNationalDutyPlayerAuto(selectEl) {
  selectEl?.addEventListener("change", () => {
    const row = selectEl.closest(".nd-row");
    const countryInput = row?.querySelector(".nd-country");
    if (!countryInput || countryInput.value.trim()) return;
    const p = state().players.find((x) => x.id === selectEl.value);
    if (p?.nationality?.trim()) countryInput.value = p.nationality.trim();
    const flagEl = row?.querySelector(".nd-card__flag");
    if (flagEl && p) {
      const flag =
        p.flag ||
        (p.nationality?.trim() && typeof NationalityFlags !== "undefined"
          ? NationalityFlags.getFlag(p.nationality)
          : "") ||
        "";
      if (flag) {
        flagEl.textContent = flag;
        flagEl.classList.remove("nd-card__flag--empty");
      }
    }
  });
}

function bindNationalDutyRowDragSort() {
  const list = $("#ndList");
  if (!list || list.dataset.ndDragBound === "1") return;
  list.dataset.ndDragBound = "1";

  let draggedKey = null;
  let touchRow = null;
  let touchMoved = false;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".nd-sort-row") : null;
  };

  list.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".nd-sort-row");
    if (!row) return;
    draggedKey = row.getAttribute("data-nd-row-key");
    row.classList.add("is-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedKey ?? "");
    }
  });

  list.addEventListener("dragend", (e) => {
    const row = e.target.closest(".nd-sort-row");
    row?.classList.remove("is-dragging");
    draggedKey = null;
    list.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".nd-sort-row");
    if (!target || !draggedKey || target.getAttribute("data-nd-row-key") === draggedKey) return;

    const dragged = list.querySelector(`[data-nd-row-key="${CSS.escape(draggedKey)}"]`);
    if (!dragged) return;

    list.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) list.insertBefore(dragged, target);
    else list.insertBefore(dragged, target.nextSibling);
  });

  list.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".nd-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  list.addEventListener("drop", (e) => {
    e.preventDefault();
    list.querySelectorAll(".nd-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
  });

  list.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".player-drag-handle");
      if (!handle || !list.contains(handle)) return;
      touchRow = handle.closest(".nd-sort-row");
      touchMoved = false;
      touchRow?.classList.add("is-dragging");
    },
    { passive: true },
  );

  list.addEventListener(
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
      if (before) list.insertBefore(touchRow, target);
      else list.insertBefore(touchRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!touchRow) return;
    touchRow.classList.remove("is-dragging");
    touchRow = null;
    touchMoved = false;
  };

  list.addEventListener("touchend", endTouch);
  list.addEventListener("touchcancel", endTouch);
}

function bindNationalDutyTableHandlers() {
  document.querySelectorAll(".nd-player").forEach((sel) => bindNationalDutyPlayerAuto(sel));
  bindNationalDutyRowDragSort();

  document.querySelectorAll(".nd-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest(".nd-row")?.remove();
      const list = $("#ndList");
      if (list && !list.querySelector(".nd-row")) {
        list.innerHTML = nationalDutyEmptyListHtml();
      }
    });
  });
}

function appendNationalDutyRows(teamId, entries) {
  const list = $("#ndList");
  if (!list || !entries?.length) return 0;
  list.querySelector(".nationalduty-empty-list")?.remove();
  let added = 0;
  for (const entry of entries) {
    const key = `nd-row-${Date.now()}-${added}`;
    list.insertAdjacentHTML("beforeend", nationalDutyRowHtml(teamId, entry, key));
    const row = list.querySelector(`[data-nd-row-key="${CSS.escape(key)}"]`);
    const sel = row?.querySelector(".nd-player");
    bindNationalDutyPlayerAuto(sel);
    row?.querySelector(".nd-del")?.addEventListener("click", () => {
      row.remove();
      if (!list.querySelector(".nd-row")) list.innerHTML = nationalDutyEmptyListHtml();
    });
    added += 1;
  }
  return added;
}

function saveNationalDutyWindowFromInputs({ toastMsg = true } = {}) {
  const fromRaw = $("#ndWindowFrom")?.value?.trim() ?? "";
  const untilRaw = $("#ndWindowUntil")?.value?.trim() ?? "";
  const from =
    typeof NationalDuty !== "undefined" ? NationalDuty.normalizeIsoDate(fromRaw) : fromRaw;
  const until =
    typeof NationalDuty !== "undefined" ? NationalDuty.normalizeIsoDate(untilRaw) : untilRaw;
  if (from && until && from > until) {
    toast("Window From must be on or before Until");
    return false;
  }
  const meta = FCDataStore.getLeagueMeta(leagueFilter);
  FCDataStore.setLeagueMeta(leagueFilter, {
    ...meta,
    nationalDutyFrom: from,
    nationalDutyUntil: until,
  });
  const status = nationalDutyWindowStatus({ nationalDutyFrom: from, nationalDutyUntil: until });
  const statusEl = $("#ndWindowStatus");
  if (statusEl) {
    statusEl.className = `nationalduty-window-status nationalduty-window-status--${status.key}`;
    const label = statusEl.querySelector(".nationalduty-window-status__label");
    if (label) label.textContent = status.label;
  }
  if (toastMsg) toast(`Live window · ${status.label}`);
  return true;
}

function bindNationalDutyWindow() {
  const onChange = () => saveNationalDutyWindowFromInputs({ toastMsg: true });
  $("#ndWindowFrom")?.addEventListener("change", onChange);
  $("#ndWindowUntil")?.addEventListener("change", onChange);
}

function bindNationalDutyBulk() {
  $("#btnNdAddByNat")?.addEventListener("click", () => {
    const teamId = $("#ndTeam")?.value ?? nationalDutyTeamFilter;
    if (!teamId) return toast("Choose a club first");
    const select = $("#ndBulkNats");
    const picked = [...(select?.selectedOptions ?? [])]
      .map((o) => o.value.trim())
      .filter(Boolean);
    if (!picked.length) return toast("Select one or more nationalities");
    const pickedSet = new Set(picked.map((n) => n.toLowerCase()));
    const onDuty = new Set(readNationalDutyFromDom().map((e) => e.playerId));
    const roster = squadDepthRoster(teamId);
    const toAdd = [];
    for (const p of roster) {
      if (onDuty.has(p.id)) continue;
      const nat = String(p.nationality ?? "").trim();
      if (!nat || !pickedSet.has(nat.toLowerCase())) continue;
      toAdd.push({
        playerId: p.id,
        country: nat,
        note: "",
        until: "",
      });
      onDuty.add(p.id);
    }
    if (!toAdd.length) return toast("No new players for those nationalities");
    const n = appendNationalDutyRows(teamId, toAdd);
    toast(`Added ${n} player${n === 1 ? "" : "s"} by nationality`);
  });

  $("#btnNdApplyUntil")?.addEventListener("click", () => {
    const untilIso =
      typeof NationalDuty !== "undefined"
        ? NationalDuty.normalizeIsoDate($("#ndWindowUntil")?.value?.trim() ?? "")
        : ($("#ndWindowUntil")?.value?.trim() ?? "");
    if (!untilIso) return toast("Set the league Until date first");
    const displayUntil = transferDateFromInputValue(untilIso) || untilIso;
    const rows = [...document.querySelectorAll("#ndList .nd-row")];
    if (!rows.length) return toast("No duty rows to update");
    let filled = 0;
    for (const row of rows) {
      const input = row.querySelector(".nd-until");
      if (!input) continue;
      if (String(input.value ?? "").trim()) continue;
      input.value = untilIso;
      filled += 1;
    }
    toast(
      filled
        ? `Applied until ${displayUntil} to ${filled} row${filled === 1 ? "" : "s"}`
        : "Every row already has an until date",
    );
  });

  $("#btnNdClearAll")?.addEventListener("click", () => {
    const teamId = $("#ndTeam")?.value ?? nationalDutyTeamFilter;
    const team = state().teams.find((t) => t.id === teamId);
    if (!team) return toast("Choose a club first");
    const list = $("#ndList");
    const count = list?.querySelectorAll(".nd-row").length ?? 0;
    if (!count) return toast("Duty list is already empty");
    if (!confirm(`Clear all ${count} national duty row${count === 1 ? "" : "s"} for ${team.name}?`)) {
      return;
    }
    if (list) list.innerHTML = nationalDutyEmptyListHtml();
    toast("Duty list cleared — Save to keep");
  });
}

function bindNationalDuty() {
  $("#ndTeam")?.addEventListener("change", () => {
    nationalDutyTeamFilter = $("#ndTeam")?.value ?? "";
    renderPanel();
  });

  bindNationalDutyWindow();
  bindNationalDutyBulk();
  bindNationalDutyTableHandlers();

  $("#btnNdAdd")?.addEventListener("click", () => {
    const teamId = $("#ndTeam")?.value ?? nationalDutyTeamFilter;
    if (!teamId) return toast("Choose a club first");
    appendNationalDutyRows(teamId, [{}]);
  });

  $("#btnSaveNationalDuty")?.addEventListener("click", () => {
    saveNationalDutyWindowFromInputs({ toastMsg: false });
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

function fillPitchLabelFromName({ force = false } = {}) {
  const nameInput = $("#playerName");
  const pitchInput = $("#playerDisplayLastName");
  if (!nameInput || !pitchInput) return;
  const max = typeof DISPLAY_LAST_NAME_MAX === "number" ? DISPLAY_LAST_NAME_MAX : 20;
  const derive =
    typeof deriveLastNameFromFullName === "function"
      ? deriveLastNameFromFullName
      : (name) => {
          const clean = typeof stripCaptainSuffix === "function" ? stripCaptainSuffix(name) : String(name ?? "");
          const parts = String(clean).split(/\s+/).filter(Boolean);
          return parts.length > 1 ? parts[parts.length - 1] : clean;
        };
  const suggested = String(derive(nameInput.value) ?? "").trim().slice(0, max);
  if (!suggested) {
    if (force) toast("Enter a player name first");
    return;
  }
  const empty = !pitchInput.value.trim();
  const wasAuto = pitchInput.dataset.auto === "1";
  if (force || empty || wasAuto) {
    pitchInput.value = suggested;
    pitchInput.dataset.auto = "1";
    if (force) toast(`Pitch label · ${suggested}`);
  }
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

  $("#btnSortByNumber")?.addEventListener("click", () => {
    const teamId = playerTeamFilter;
    if (!teamId) return;
    const ids = playersForTeam(teamId)
      .slice()
      .sort((a, b) => {
        const numA = Number(a.number);
        const numB = Number(b.number);
        const hasA = Number.isFinite(numA);
        const hasB = Number.isFinite(numB);
        if (hasA && hasB && numA !== numB) return numA - numB;
        if (hasA !== hasB) return hasA ? -1 : 1;
        return String(a.name).localeCompare(b.name);
      })
      .map((p) => p.id);
    if (!ids.length) return;
    FCDataStore.reorderTeamPlayers(teamId, ids);
    syncToAppArrays();
    toast("Squad sorted by jersey number");
    renderPanel();
  });

  $("#btnFillPitchLabel")?.addEventListener("click", () => {
    fillPitchLabelFromName({ force: true });
  });

  $("#playerName")?.addEventListener("change", () => {
    fillPitchLabelFromName({ force: false });
  });

  $("#btnFillBlankPitchLabels")?.addEventListener("click", () => {
    const teamId = playerTeamFilter;
    if (!teamId) return toast("Choose a team first");
    const max =
      typeof DISPLAY_LAST_NAME_MAX === "number" ? DISPLAY_LAST_NAME_MAX : 20;
    const derive =
      typeof deriveLastNameFromFullName === "function"
        ? deriveLastNameFromFullName
        : (name) => {
            const clean = stripCaptainSuffix(name);
            const parts = clean.split(/\s+/).filter(Boolean);
            return parts.length > 1 ? parts[parts.length - 1] : clean;
          };
    const roster = playersForTeam(teamId);
    let filled = 0;
    for (const p of roster) {
      if (String(p.displayLastName ?? "").trim()) continue;
      const label = String(derive(p.name) ?? "").trim().slice(0, max);
      if (!label) continue;
      FCDataStore.upsertPlayer({ ...p, displayLastName: label });
      filled += 1;
    }
    if (!filled) {
      toast("Every player already has a pitch label (or no name to derive)");
      return;
    }
    syncToAppArrays();
    toast(`Filled ${filled} pitch label${filled === 1 ? "" : "s"}`);
    renderPanel();
  });

  $("#playerTeamFilter")?.addEventListener("change", (e) => {
    playerTeamFilter = e.target.value;
    playerSearchQuery = "";
    clearTmSyncState();
    if (playerTransferPickId && !playersForTeam(playerTeamFilter).some((p) => p.id === playerTransferPickId)) {
      playerTransferPickId = "";
    }
    renderPanel();
  });

  $("#playerTeam")?.addEventListener("change", (e) => {
    playerTeamFilter = e.target.value;
    playerTransferPickId = "";
    playerSearchQuery = "";
    clearTmSyncState();
    renderPanel();
  });

  const tmTeam = state().teams.find((t) => t.id === playerTeamFilter);
  bindTransfermarktSync(tmTeam);

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

  const pitchEl = $("#playerDisplayLastName");
  if (pitchEl && pitchEl.dataset.pitchBound !== "1") {
    pitchEl.dataset.pitchBound = "1";
    pitchEl.addEventListener("input", () => {
      pitchEl.dataset.auto = "0";
    });
  }

  setupPlayerFlagAuto();

  $("#btnSavePlayer")?.addEventListener("click", () => {
    const teamId = $("#playerTeam").value;
    const number = Number($("#playerNumber").value);
    const name = stripCaptainSuffix($("#playerName").value.trim());
    if (!teamId || !name) return alert("Team and name required");
    const editId = $("#playerEditId").value;
    const id = editId || FCDataStore.makePlayerId(teamId, number, name);
    const existing = state().players.find((x) => x.id === id);
    let sortOrder = existing?.sortOrder;
    if (!editId) {
      const maxOrder = playersForTeam(teamId).reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
      sortOrder = maxOrder + 1;
    }
    const isCaptain = !!$("#playerCaptain")?.checked;
    const playerPayload = {
      id,
      teamId,
      number,
      name,
      displayLastName: $("#playerDisplayLastName")?.value?.trim().slice(0, 20) ?? "",
      pos: $("#playerPos").value.trim() || "MF",
      role: $("#playerRole").value.trim() || "CM",
      flag: $("#playerFlag").value.trim(),
      nationality: $("#playerNat").value.trim(),
      sortOrder,
      captain: isCaptain,
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
      $("#playerName").value = stripCaptainSuffix(p.name);
      if ($("#playerDisplayLastName")) {
        $("#playerDisplayLastName").value = p.displayLastName ?? "";
        $("#playerDisplayLastName").dataset.auto = p.displayLastName ? "0" : "1";
      }
      if ($("#playerCaptain")) $("#playerCaptain").checked = rosterPlayerIsCaptain(p);
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
      const meta = FCDataStore.getLeagueMeta(leagueFilter);
      const isWc = typeof isWorldCupLeague === "function" && isWorldCupLeague(leagueFilter);
      $("#matchEditId").value = m.id;
      $("#matchFormTitle").textContent = "Edit match";
      $("#matchTime").value = m.time ?? "";
      ensureStadiumSelectOption($("#matchStadium"), m.stadium);
      $("#matchHome").value = m.homeTeamId;
      $("#matchAway").value = m.awayTeamId;
      $("#matchHomeScore").value = m.score?.[0] ?? 0;
      $("#matchAwayScore").value = m.score?.[1] ?? 0;
      if (isWc && $("#matchStage")) $("#matchStage").value = m.matchday ?? meta.matchweekTitle ?? "";
      $("#matchFormCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function renumberStandingsRows() {
  const list = $("#standingsList");
  if (!list) return;
  [...list.querySelectorAll(".st-row")].forEach((row, index) => {
    const rk = index + 1;
    const input = row.querySelector(".st-rk");
    if (input) input.value = String(rk);
    row.setAttribute("data-i", String(index));
    row.classList.remove("st-card--gold", "st-card--silver", "st-card--bronze");
    const tier = standingsRankTierClass(rk);
    if (tier) row.classList.add(tier);
  });
}

function bindStandingsRowDragSort() {
  const list = $("#standingsList");
  if (!list || list.dataset.stDragBound === "1") return;
  list.dataset.stDragBound = "1";

  let draggedKey = null;
  let touchRow = null;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".st-sort-row") : null;
  };

  list.addEventListener("dragstart", (e) => {
    const handle = e.target.closest(".player-drag-handle");
    if (!handle || !list.contains(handle)) return;
    const row = handle.closest(".st-sort-row");
    if (!row) return;
    draggedKey = row.getAttribute("data-st-row-key");
    row.classList.add("is-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedKey ?? "");
    }
  });

  list.addEventListener("dragend", () => {
    list.querySelector(".st-sort-row.is-dragging")?.classList.remove("is-dragging");
    draggedKey = null;
    list.querySelectorAll(".st-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    renumberStandingsRows();
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".st-sort-row");
    if (!target || !draggedKey || target.getAttribute("data-st-row-key") === draggedKey) return;

    const dragged = list.querySelector(`[data-st-row-key="${CSS.escape(draggedKey)}"]`);
    if (!dragged) return;

    list.querySelectorAll(".st-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) list.insertBefore(dragged, target);
    else list.insertBefore(dragged, target.nextSibling);
  });

  list.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".st-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  list.addEventListener("drop", (e) => {
    e.preventDefault();
    list.querySelectorAll(".st-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    renumberStandingsRows();
  });

  list.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".player-drag-handle");
      if (!handle || !list.contains(handle)) return;
      touchRow = handle.closest(".st-sort-row");
      touchRow?.classList.add("is-dragging");
    },
    { passive: true },
  );

  list.addEventListener(
    "touchmove",
    (e) => {
      if (!touchRow) return;
      e.preventDefault();
      const touch = e.touches[0];
      const target = rowFromPoint(touch.clientX, touch.clientY);
      if (!target || target === touchRow) return;
      const rect = target.getBoundingClientRect();
      const before = touch.clientY < rect.top + rect.height / 2;
      if (before) list.insertBefore(touchRow, target);
      else list.insertBefore(touchRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!touchRow) return;
    touchRow.classList.remove("is-dragging");
    touchRow = null;
    list.querySelectorAll(".st-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    renumberStandingsRows();
  };

  list.addEventListener("touchend", endTouch);
  list.addEventListener("touchcancel", endTouch);
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
    const list = $("#standingsList");
    if (!list) return;
    const teams = teamsForLeague(leagueFilter);
    const i = list.querySelectorAll(".st-row").length;
    list.querySelector(".standings-empty-list")?.remove();
    const key = `st-row-${Date.now()}`;
    list.insertAdjacentHTML("beforeend", standingsRowHtml(i + 1, "", 0, i, teams).replace(
      /data-st-row-key="[^"]*"/,
      `data-st-row-key="${key}"`,
    ));
    bindStandDel();
    bindStandingsClubChange();
    bindStandingsRankChange();
    renumberStandingsRows();
  });

  function readStandings() {
    const list = $("#standingsList");
    if (!list) return [];
    renumberStandingsRows();
    return Array.from(list.querySelectorAll(".st-row")).map((row, index) => [
      index + 1,
      row.querySelector(".st-club")?.value.trim() ?? "",
      Number(row.querySelector(".st-pts")?.value) || 0,
    ]);
  }

  $("#btnSaveStandings")?.addEventListener("click", () => {
    FCDataStore.setStandings(leagueFilter, readStandings());
    syncToAppArrays();
    toast("Standings saved");
  });

  bindStandDel();
  bindStandingsClubChange();
  bindStandingsRankChange();
  bindStandingsRowDragSort();
}

function bindStandingsRankChange() {
  document.querySelectorAll(".st-rk").forEach((input) => {
    if (input.dataset.stRkBound === "1") return;
    input.dataset.stRkBound = "1";
    input.addEventListener("change", () => {
      const row = input.closest(".st-row");
      if (!row) return;
      row.classList.remove("st-card--gold", "st-card--silver", "st-card--bronze");
      const tier = standingsRankTierClass(input.value);
      if (tier) row.classList.add(tier);
    });
  });
}

function bindStandingsClubChange() {
  document.querySelectorAll(".st-club").forEach((sel) => {
    if (sel.dataset.stClubBound === "1") return;
    sel.dataset.stClubBound = "1";
    sel.addEventListener("change", () => {
      const row = sel.closest(".st-row");
      const crestEl = row?.querySelector("[data-st-crest]");
      if (!crestEl) return;
      const teams = teamsForLeague(leagueFilter);
      const team = standingsTeamForClub(sel.value, teams);
      crestEl.innerHTML = adminTeamCrestHtml(team);
      const rk = Number(row.querySelector(".st-rk")?.value) || 0;
      row.classList.remove("st-card--gold", "st-card--silver", "st-card--bronze");
      const tier = standingsRankTierClass(rk);
      if (tier) row.classList.add(tier);
    });
  });
}

function bindStandDel() {
  document.querySelectorAll(".st-del").forEach((btn) => {
    if (btn.dataset.stDelBound === "1") return;
    btn.dataset.stDelBound = "1";
    btn.addEventListener("click", () => {
      btn.closest(".st-row")?.remove();
      const list = $("#standingsList");
      if (list && !list.querySelector(".st-row")) {
        list.innerHTML = standingsEmptyListHtml();
      } else {
        renumberStandingsRows();
      }
    });
  });
}

function refreshScorerPlayerCell(row, clubName) {
  const cell = row?.querySelector(".sc-player-cell");
  if (!cell) return;
  const teamId = teamIdForClubName(leagueFilter, clubName);
  cell.innerHTML = `<label class="sc-field-label">Player</label>${scorersPlayerSelectHtml(teamId, "")}`;
  const crestEl = row?.querySelector("[data-sc-crest]");
  if (crestEl) {
    const teams = teamsForLeague(leagueFilter);
    crestEl.innerHTML = adminTeamCrestHtml(standingsTeamForClub(clubName, teams));
  }
}

function updateScorerGoalsMeter(input) {
  const row = input?.closest(".sc-row");
  if (!row) return;
  const meter = row.querySelector(".sc-goals-meter__fill");
  if (!meter) return;
  const max = Math.max(
    Number(input.dataset.scMax) || 0,
    ...[...document.querySelectorAll("#scorersList .sc-goals")].map((el) => Number(el.value) || 0),
  );
  const goals = Number(input.value) || 0;
  const pct = max > 0 ? Math.round((goals / max) * 100) : 0;
  meter.style.width = `${pct}%`;
  document.querySelectorAll("#scorersList .sc-goals").forEach((el) => {
    el.dataset.scMax = String(max);
    const m = el.closest(".sc-row")?.querySelector(".sc-goals-meter__fill");
    if (m && el !== input) {
      const g = Number(el.value) || 0;
      m.style.width = max > 0 ? `${Math.round((g / max) * 100)}%` : "0%";
    }
  });
}

function bindScorers() {
  const list = $("#scorersList");

  $("#btnAddScorerRow")?.addEventListener("click", () => {
    if (!list) return;
    const teams = teamsForLeague(leagueFilter);
    const i = list.querySelectorAll(".sc-row").length;
    const maxGoals = Math.max(
      0,
      ...[...list.querySelectorAll(".sc-goals")].map((el) => Number(el.value) || 0),
    );
    list.querySelector(".scorers-empty-list")?.remove();
    list.insertAdjacentHTML("beforeend", renderScorerRowHtml("", "", 0, i, teams, maxGoals));
    bindScorerDel();
  });

  list?.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains("sc-club")) return;
    refreshScorerPlayerCell(t.closest(".sc-row"), t.value);
  });

  list?.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || !t.classList.contains("sc-goals")) return;
    updateScorerGoalsMeter(t);
  });

  $("#btnSaveScorers")?.addEventListener("click", () => {
    const rows = Array.from(list?.querySelectorAll(".sc-row") ?? []).map((row) => [
      row.querySelector(".sc-name")?.value.trim() ?? "",
      row.querySelector(".sc-club")?.value.trim() ?? "",
      Number(row.querySelector(".sc-goals")?.value) || 0,
    ]);
    FCDataStore.setTopScorers(leagueFilter, rows);
    syncToAppArrays();
    toast("Top scorers saved");
  });

  bindScorerDel();
}

function bindScorerDel() {
  document.querySelectorAll(".sc-del").forEach((btn) => {
    if (btn.dataset.scDelBound === "1") return;
    btn.dataset.scDelBound = "1";
    btn.addEventListener("click", () => {
      btn.closest(".sc-row")?.remove();
      const list = $("#scorersList");
      if (list && !list.querySelector(".sc-row")) {
        list.innerHTML = scorersEmptyListHtml();
      }
    });
  });
}

function bindTransferRosterActions() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    const list = $(`#${section.tableId}`);
    const mode = section.key;
    const isIncoming = transferDirectionIncoming(mode);

    list?.querySelectorAll(".transfers-card").forEach((row) => syncTransferRosterBtn(row, transferTeamFilter, mode));

    if (!list || list.dataset.trRosterBound === "1") continue;
    list.dataset.trRosterBound = "1";
    list.addEventListener("input", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      const row = e.target.closest(".transfers-card");
      if (!row) return;
      if (e.target.classList.contains("tr-player")) {
        closeTransferSquadForm(row);
        syncTransferRosterBtn(row, transferTeamFilter, mode);
      }
      if (
        e.target.classList.contains("tr-player") ||
        e.target.classList.contains("tr-from") ||
        e.target.classList.contains("tr-to") ||
        e.target.classList.contains("tr-fee") ||
        e.target.classList.contains("tr-date")
      ) {
        syncTransferCardSummary(row);
      }
      if (e.target.classList.contains("tr-fee")) {
        const val = e.target.value.trim().toLowerCase();
        e.target.closest(".tr-fee-field")?.querySelectorAll(".tr-fee-preset").forEach((btn) => {
          const preset = String(btn.getAttribute("data-fee") ?? "").toLowerCase();
          btn.classList.toggle("is-active", Boolean(preset) && preset === val);
        });
      }
    });
    // Date pickers often commit on change rather than input in some browsers
    list.addEventListener("change", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.classList.contains("tr-date") && !e.target.classList.contains("tr-fee")) return;
      const row = e.target.closest(".transfers-card");
      if (!row) return;
      syncTransferCardSummary(row);
    });
    list.addEventListener("click", (e) => {
      const foldBtn = e.target instanceof Element ? e.target.closest(".transfers-card__fold") : null;
      if (foldBtn) {
        const card = foldBtn.closest(".transfers-card");
        if (!card) return;
        const nextFolded = !card.classList.contains("is-folded");
        setTransferCardFolded(card, nextFolded);
        if (!nextFolded) queueMicrotask(() => transferCardQuery(card, ".tr-player")?.focus?.());
        return;
      }

      const confirmBtn = e.target instanceof Element ? e.target.closest(".tr-squad-confirm") : null;
      if (confirmBtn) {
        const row = confirmBtn.closest(".transfers-card");
        const name = transferCardInputValue(row, ".tr-player");
        const ok = addTransferPlayerToSquad(transferTeamFilter, name, readTransferSquadDetails(row));
        if (ok) {
          closeTransferSquadForm(row);
          syncTransferRosterBtn(row, transferTeamFilter, mode);
          syncTransferCardSummary(row);
        }
        return;
      }

      const cancelBtn = e.target instanceof Element ? e.target.closest(".tr-squad-cancel") : null;
      if (cancelBtn) {
        closeTransferSquadForm(cancelBtn.closest(".transfers-card"));
        return;
      }

      const feePreset = e.target instanceof Element ? e.target.closest(".tr-fee-preset") : null;
      if (feePreset) {
        const card = feePreset.closest(".transfers-card");
        const feeInput = feePreset.closest(".tr-fee-field")?.querySelector(".tr-fee");
        if (feeInput) {
          feeInput.value = feePreset.getAttribute("data-fee") ?? "";
          feePreset.closest(".tr-fee-field")?.querySelectorAll(".tr-fee-preset").forEach((btn) => {
            btn.classList.toggle("is-active", btn === feePreset);
          });
          syncTransferCardSummary(card);
        }
        return;
      }

      const selector = isIncoming ? ".tr-add-squad" : ".tr-remove-squad";
      const btn = e.target instanceof Element ? e.target.closest(selector) : null;
      if (!btn || btn.disabled) return;
      const row = btn.closest(".transfers-card");
      const name = transferCardInputValue(row, ".tr-player");
      if (isIncoming) {
        openTransferSquadForm(row, transferTeamFilter);
      } else {
        removeTransferPlayerFromSquad(transferTeamFilter, name);
        syncTransferRosterBtn(row, transferTeamFilter, mode);
      }
    });
  }
}

function bindTransferRowDragSort(listSelector) {
  const list = $(listSelector);
  if (!list || list.dataset.trDragBound === "1") return;
  list.dataset.trDragBound = "1";

  let draggedRow = null;
  let touchRow = null;

  const rowFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest(".tr-sort-row") : null;
  };

  const finishDrag = () => {
    if (draggedRow) draggedRow.classList.remove("is-dragging");
    draggedRow = null;
    list.querySelectorAll(".tr-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    stashTransferEditsFromDom();
  };

  list.addEventListener("dragstart", (e) => {
    const handle = e.target.closest(".player-drag-handle");
    if (!handle) return;
    const row = handle.closest(".tr-sort-row");
    if (!row) return;
    draggedRow = row;
    row.classList.add("is-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.getAttribute("data-tr-sort-key") ?? "");
    }
  });

  list.addEventListener("dragend", finishDrag);

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const target = e.target.closest(".tr-sort-row");
    if (!target || !draggedRow || target === draggedRow) return;

    list.querySelectorAll(".tr-sort-row").forEach((r) => r.classList.remove("is-drag-over"));
    target.classList.add("is-drag-over");

    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    if (before) list.insertBefore(draggedRow, target);
    else list.insertBefore(draggedRow, target.nextSibling);
  });

  list.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".tr-sort-row");
    if (row) row.classList.remove("is-drag-over");
  });

  list.addEventListener("drop", (e) => {
    e.preventDefault();
    finishDrag();
  });

  list.addEventListener(
    "touchstart",
    (e) => {
      const handle = e.target.closest(".player-drag-handle");
      if (!handle || !list.contains(handle)) return;
      touchRow = handle.closest(".tr-sort-row");
      touchRow?.classList.add("is-dragging");
    },
    { passive: true },
  );

  list.addEventListener(
    "touchmove",
    (e) => {
      if (!touchRow) return;
      e.preventDefault();
      const touch = e.touches[0];
      const target = rowFromPoint(touch.clientX, touch.clientY);
      if (!target || target === touchRow) return;

      const rect = target.getBoundingClientRect();
      const before = touch.clientY < rect.top + rect.height / 2;
      if (before) list.insertBefore(touchRow, target);
      else list.insertBefore(touchRow, target.nextSibling);
    },
    { passive: false },
  );

  const endTouch = () => {
    if (!touchRow) return;
    touchRow.classList.remove("is-dragging");
    touchRow = null;
    stashTransferEditsFromDom();
  };

  list.addEventListener("touchend", endTouch);
  list.addEventListener("touchcancel", endTouch);
}

function bindTransferDel() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    const list = $(`#${section.tableId}`);
    if (!list || list.dataset.trDelBound === "1") continue;
    list.dataset.trDelBound = "1";
    list.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest(".tr-del") : null;
      if (!btn) return;
      const card = btn.closest(".transfers-card");
      card?.remove();
      if (list && !list.querySelector(".transfers-card")) {
        list.innerHTML = `<div class="transfers-empty-row" role="status"><span class="transfers-empty-msg">No ${esc(section.title.toLowerCase())} yet — use <strong>${esc(section.btnLabel)}</strong> below.</span></div>`;
      }
    });
  }
}

function readTransfersTable(tableId, dir, clubName) {
  const list = $(tableId);
  if (!list) return [];
  const isIncoming = transferDirectionIncoming(dir);
  const showFee = ADMIN_TRANSFER_SECTIONS.find((s) => s.key === dir)?.showFee !== false;
  return Array.from(list.querySelectorAll(".transfers-card"))
    .map((tr, i) => {
      // Prefer the visible panel (manual vs DB); ignore unfinished DB-picker cards with no player name
      const player = transferCardInputValue(tr, ".tr-player");
      if (!player) return null;
      const otherClub = transferCardInputValue(tr, isIncoming ? ".tr-from" : ".tr-to");
      const fee = showFee ? transferCardInputValue(tr, ".tr-fee") : "";
      const dateRaw = transferCardInputValue(tr, ".tr-date");
      const date = transferDateFromInputValue(dateRaw) || dateRaw || undefined;
      const id =
        tr.getAttribute("data-id")?.trim() ||
        `${leagueFilter}_${dir}_${FCDataStore.slugify(player || "row")}_${i}`;
      const playerId = tr.getAttribute("data-player-id")?.trim() || undefined;
      const eventId = tr.getAttribute("data-event-id")?.trim() || undefined;
      const row = {
        id,
        player,
        club: clubName,
        otherClub,
        fee: fee || undefined,
        date,
      };
      if (playerId) row.playerId = playerId;
      if (eventId) row.eventId = eventId;
      return row;
    })
    .filter((t) => t && t.player && t.club);
}

function currentTransferEditorLists() {
  return (
    readTransfersDraftFromDom()?.lists ??
    transferListsForEditor(leagueFilter, transferTeamFilter)
  );
}

function recalculateTmTransferDiff(lists) {
  if (!tmTransferSyncState || typeof TransfermarktSync === "undefined") return;
  tmTransferSyncState.diff = TransfermarktSync.compareTransferLists(
    lists,
    tmTransferSyncState.tmLists,
  );
}

function cloneTransferEditorLists(lists) {
  const next = {};
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    next[section.key] = [...(lists?.[section.key] ?? [])];
  }
  return next;
}

function mergeTmFieldsOntoLocal(local, tm, category) {
  const next = { ...local };
  const otherClub = String(tm?.otherClub ?? "").trim();
  if (otherClub) next.otherClub = otherClub;
  if (category !== "loanReturn" && category !== "loanRecall") {
    const fee = String(tm?.fee ?? "").trim();
    if (fee) next.fee = fee;
    else if (tm?.fee === "" || tm?.fee == null) {
      /* keep local fee when TM has none */
    }
  } else {
    delete next.fee;
  }
  const date = String(tm?.date ?? "").trim();
  if (date) next.date = date;
  return next;
}

function findLocalTransferIndex(list, local) {
  if (!list?.length || !local) return -1;
  const localId = String(local.id ?? "").trim();
  if (localId) {
    const byId = list.findIndex((row) => String(row?.id ?? "").trim() === localId);
    if (byId >= 0) return byId;
  }
  return list.findIndex((row) => transferPlayersMatch(row?.player, local.player));
}

function removeLocalTransferRow(list, local) {
  const idx = findLocalTransferIndex(list, local);
  if (idx < 0) return list;
  return list.filter((_, i) => i !== idx);
}

function applyTmTransferAddRow(next, category, row) {
  next[category].push({
    id: `${leagueFilter}_${transferTeamFilter}_${category}_${FCDataStore.slugify(row.player)}_${tmTransferSeason}_${next[category].length}`,
    player: row.player,
    otherClub: row.otherClub || "",
    fee: row.fee || undefined,
    date: row.date || undefined,
  });
  stashTmTransferSquadPrefill(row);
}

function commitTransferEditorLists(next, toastMsg) {
  transferEditsByTeam.set(transferTeamKey(leagueFilter, transferTeamFilter), next);
  recalculateTmTransferDiff(next);
  if (toastMsg) toast(toastMsg);
  renderPanel();
}

async function refreshTransfermarktTransfers() {
  const team = state().teams.find((t) => t.id === transferTeamFilter);
  if (!team) return toast("Choose a club first");
  if (typeof TransfermarktSync === "undefined" || typeof TransfermarktTeams === "undefined") {
    return toast("Transfermarkt sync module failed to load");
  }
  const clubId = TransfermarktTeams.clubIdForTeam(team);
  if (!clubId) return toast("Paste and save a Transfermarkt club link first");
  if (!tmSyncLocalProxyReady()) {
    return toast("Run serve.bat locally — Transfermarkt comparison needs the local server proxy");
  }
  const season = Number($("#tmTransferSeason")?.value ?? tmTransferSeason);
  if (!Number.isInteger(season) || season < 1900 || season > 2100) {
    return toast("Enter a valid season start year, for example 2026");
  }
  tmTransferSeason = season;
  stashTransferEditsFromDom();
  const btn = $("#btnTmTransferRefresh");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Comparing…";
  }
  try {
    const localLists = transferListsForEditor(leagueFilter, team.id);
    const result = await TransfermarktSync.fetchAndCompareTransfers(
      localLists,
      clubId,
      season,
      team.name,
    );
    tmTransferSyncState = {
      ...result,
      clubId,
      season,
      teamId: team.id,
      ignoredAdd: new Set(),
      ignoredRemove: new Set(),
      ignoredUpdate: new Set(),
      ignoredMove: new Set(),
    };
    const addCount = tmTransferDiffEntries("toAdd").length;
    const removeCount = tmTransferDiffEntries("toRemove").length;
    const updateCount = tmTransferDiffEntries("toUpdate").length;
    const moveCount = tmTransferDiffEntries("toReclassify").length;
    toast(
      addCount || removeCount || updateCount || moveCount
        ? `Transfermarkt: ${addCount} to add · ${updateCount} to sync · ${moveCount} to move · ${removeCount} to remove`
        : "Transfer lists match Transfermarkt",
    );
    renderPanel();
  } catch (err) {
    console.error(err);
    const msg = String(err?.message ?? err);
    if (looksLikeHtmlToast(msg)) {
      toast("Transfermarkt comparison only works with serve.bat on your computer");
    } else {
      toast(msg.slice(0, 180));
    }
  } finally {
    if (btn) {
      btn.disabled = !tmSyncLocalProxyReady() || !tmSyncAvailableForTeam(team);
      btn.textContent = "Compare with Transfermarkt";
    }
  }
}

function applyTmTransferSuggestion(kind, suggestionKey) {
  if (!tmTransferSyncState || !transferTeamFilter) return false;
  const sourceKind =
    kind === "add"
      ? "toAdd"
      : kind === "remove"
        ? "toRemove"
        : kind === "update"
          ? "toUpdate"
          : "toReclassify";
  const entry = tmTransferDiffEntries(sourceKind).find((item) => item.key === suggestionKey);
  if (!entry) return false;
  const next = cloneTransferEditorLists(currentTransferEditorLists());
  let msg = "";

  if (kind === "add") {
    applyTmTransferAddRow(next, entry.category, entry.row);
    msg = `${entry.row.player} added to ${transferCategoryLabel(entry.category)}`;
  } else if (kind === "remove") {
    next[entry.category] = removeLocalTransferRow(next[entry.category], entry.row);
    msg = `${entry.row.player} removed from ${transferCategoryLabel(entry.category)}`;
  } else if (kind === "update") {
    const idx = findLocalTransferIndex(next[entry.category], entry.local);
    if (idx < 0) return false;
    next[entry.category][idx] = mergeTmFieldsOntoLocal(
      next[entry.category][idx],
      entry.tm,
      entry.category,
    );
    msg = `Synced details for ${entry.local.player}`;
  } else {
    const from = entry.fromCategory;
    const to = entry.toCategory;
    next[from] = removeLocalTransferRow(next[from], entry.local);
    const moved = mergeTmFieldsOntoLocal(
      {
        id:
          entry.local?.id ||
          `${leagueFilter}_${transferTeamFilter}_${to}_${FCDataStore.slugify(entry.local.player)}_${tmTransferSeason}`,
        player: entry.local.player,
        otherClub: entry.local.otherClub || "",
        fee: entry.local.fee,
        date: entry.local.date,
      },
      entry.tm,
      to,
    );
    next[to].push(moved);
    stashTmTransferSquadPrefill({ ...entry.tm, player: entry.local.player });
    msg = `${entry.local.player} moved to ${transferCategoryLabel(to)}`;
  }

  commitTransferEditorLists(next, msg);
  return true;
}

function applyAllTmTransferAdds() {
  const entries = tmTransferDiffEntries("toAdd");
  if (!entries.length) return;
  const next = cloneTransferEditorLists(currentTransferEditorLists());
  for (const entry of entries) applyTmTransferAddRow(next, entry.category, entry.row);
  commitTransferEditorLists(next, `Added ${entries.length} transfer${entries.length === 1 ? "" : "s"}`);
}

function applyAllTmTransferRemoves() {
  const entries = tmTransferDiffEntries("toRemove");
  if (!entries.length) return;
  if (
    !confirm(
      `Remove ${entries.length} transfer${entries.length === 1 ? "" : "s"} that are only in Squad Central?`,
    )
  ) {
    return;
  }
  const next = cloneTransferEditorLists(currentTransferEditorLists());
  for (const entry of entries) {
    next[entry.category] = removeLocalTransferRow(next[entry.category], entry.row);
  }
  commitTransferEditorLists(
    next,
    `Removed ${entries.length} transfer${entries.length === 1 ? "" : "s"}`,
  );
}

function applyAllTmTransferSyncs() {
  const entries = tmTransferDiffEntries("toUpdate");
  if (!entries.length) return;
  const next = cloneTransferEditorLists(currentTransferEditorLists());
  let count = 0;
  for (const entry of entries) {
    const idx = findLocalTransferIndex(next[entry.category], entry.local);
    if (idx < 0) continue;
    next[entry.category][idx] = mergeTmFieldsOntoLocal(
      next[entry.category][idx],
      entry.tm,
      entry.category,
    );
    count += 1;
  }
  commitTransferEditorLists(next, `Synced details for ${count} transfer${count === 1 ? "" : "s"}`);
}

function applyAllTmTransferMoves() {
  const entries = tmTransferDiffEntries("toReclassify");
  if (!entries.length) return;
  const next = cloneTransferEditorLists(currentTransferEditorLists());
  let count = 0;
  for (const entry of entries) {
    const from = entry.fromCategory;
    const to = entry.toCategory;
    next[from] = removeLocalTransferRow(next[from], entry.local);
    const moved = mergeTmFieldsOntoLocal(
      {
        id:
          entry.local?.id ||
          `${leagueFilter}_${transferTeamFilter}_${to}_${FCDataStore.slugify(entry.local.player)}_${tmTransferSeason}`,
        player: entry.local.player,
        otherClub: entry.local.otherClub || "",
        fee: entry.local.fee,
        date: entry.local.date,
      },
      entry.tm,
      to,
    );
    next[to].push(moved);
    stashTmTransferSquadPrefill({ ...entry.tm, player: entry.local.player });
    count += 1;
  }
  commitTransferEditorLists(next, `Moved ${count} transfer${count === 1 ? "" : "s"}`);
}

function ignoreTmTransferSuggestion(kind, suggestionKey) {
  if (!tmTransferSyncState) return;
  if (!tmTransferSyncState.ignoredUpdate) tmTransferSyncState.ignoredUpdate = new Set();
  if (!tmTransferSyncState.ignoredMove) tmTransferSyncState.ignoredMove = new Set();
  const ignored =
    kind === "add"
      ? tmTransferSyncState.ignoredAdd
      : kind === "remove"
        ? tmTransferSyncState.ignoredRemove
        : kind === "update"
          ? tmTransferSyncState.ignoredUpdate
          : tmTransferSyncState.ignoredMove;
  ignored.add(suggestionKey);
  toast("Suggestion ignored");
  renderPanel();
}

function bindTmTransferSync() {
  const team = state().teams.find((t) => t.id === transferTeamFilter);
  $("#btnSaveTmTransferUrl")?.addEventListener("click", () => {
    const result = saveTeamTransfermarktLink(team, $("#teamTmTransferUrl")?.value);
    toast(result.message);
    if (result.ok) {
      tmTransferSyncState = null;
      tmTransferSearchQuery = "";
      renderPanel();
    }
  });
  $("#teamTmTransferUrl")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    $("#btnSaveTmTransferUrl")?.click();
  });
  $("#tmTransferSeason")?.addEventListener("change", (e) => {
    const season = Number(e.target.value);
    if (Number.isInteger(season)) tmTransferSeason = season;
  });
  $("#btnTmTransferRefresh")?.addEventListener("click", refreshTransfermarktTransfers);
  $("#btnTmTransferAddAll")?.addEventListener("click", applyAllTmTransferAdds);
  $("#btnTmTransferRemoveAll")?.addEventListener("click", applyAllTmTransferRemoves);
  $("#btnTmTransferSyncAll")?.addEventListener("click", applyAllTmTransferSyncs);
  $("#btnTmTransferMoveAll")?.addEventListener("click", applyAllTmTransferMoves);
  $("#tmTransferSearch")?.addEventListener("input", (e) => {
    tmTransferSearchQuery = e.target.value;
    applyTmTransferSearch();
  });
  $("#btnClearTmTransferSearch")?.addEventListener("click", () => {
    tmTransferSearchQuery = "";
    const input = $("#tmTransferSearch");
    if (input) input.value = "";
    applyTmTransferSearch();
    input?.focus();
  });
  applyTmTransferSearch();
  $("#transfersTmSync")?.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const add = target?.closest("[data-tm-transfer-add]");
    if (add) return applyTmTransferSuggestion("add", add.getAttribute("data-tm-transfer-add"));
    const remove = target?.closest("[data-tm-transfer-remove]");
    if (remove) {
      return applyTmTransferSuggestion("remove", remove.getAttribute("data-tm-transfer-remove"));
    }
    const sync = target?.closest("[data-tm-transfer-sync]");
    if (sync) return applyTmTransferSuggestion("update", sync.getAttribute("data-tm-transfer-sync"));
    const move = target?.closest("[data-tm-transfer-move]");
    if (move) return applyTmTransferSuggestion("move", move.getAttribute("data-tm-transfer-move"));
    const ignoreAdd = target?.closest("[data-tm-transfer-ignore-add]");
    if (ignoreAdd) {
      return ignoreTmTransferSuggestion(
        "add",
        ignoreAdd.getAttribute("data-tm-transfer-ignore-add"),
      );
    }
    const ignoreRemove = target?.closest("[data-tm-transfer-ignore-remove]");
    if (ignoreRemove) {
      return ignoreTmTransferSuggestion(
        "remove",
        ignoreRemove.getAttribute("data-tm-transfer-ignore-remove"),
      );
    }
    const ignoreUpdate = target?.closest("[data-tm-transfer-ignore-update]");
    if (ignoreUpdate) {
      return ignoreTmTransferSuggestion(
        "update",
        ignoreUpdate.getAttribute("data-tm-transfer-ignore-update"),
      );
    }
    const ignoreMove = target?.closest("[data-tm-transfer-ignore-move]");
    if (ignoreMove) {
      return ignoreTmTransferSuggestion(
        "move",
        ignoreMove.getAttribute("data-tm-transfer-ignore-move"),
      );
    }
  });
}

function bindTransfers() {
  const teamSel = $("#transferTeamFilter");
  if (teamSel && teamSel.dataset.trBound !== "1") {
    teamSel.dataset.trBound = "1";
    teamSel.addEventListener("change", (e) => {
      stashTransferEditsFromDom();
      const nextTeamId = e.target.value;
      clearTransferEditsForTeam(leagueFilter, nextTeamId);
      transferTeamFilter = nextTeamId;
      tmTransferSyncState = null;
      tmTransferSearchQuery = "";
      renderPanel();
    });
  }

  for (const section of ADMIN_TRANSFER_SECTIONS) {
    const btn = $(`#${section.btnId}`);
    if (btn && btn.dataset.trAddBound !== "1") {
      btn.dataset.trAddBound = "1";
      btn.addEventListener("click", () => {
        const list = $(`#${section.tableId}`);
        if (!list || !transferTeamFilter) return toast("Choose a club first");
        list.querySelector(".transfers-empty-row")?.remove();
        const i = list.querySelectorAll(".transfers-card").length;
        list.insertAdjacentHTML(
          "beforeend",
          transferTableRowHtml(section.key, transferTeamFilter, {}, i, { folded: false }),
        );
        const card = list.querySelector(".transfers-card:last-of-type");
        syncTransferRosterBtn(card, transferTeamFilter, section.key);
        syncTransferCardSummary(card);
        if (card?.classList.contains("transfers-card--db")) {
          setTransferCardSourceMode(card, "db");
        }
        card?.scrollIntoView({ behavior: "smooth", block: "center" });
        queueMicrotask(() => {
          if (card?.classList.contains("transfers-card--db")) {
            card.querySelector(".tr-db-league")?.focus?.();
          } else {
            card?.querySelector(".tr-player")?.focus?.();
          }
        });
      });
    }
  }

  const saveBtn = $("#btnSaveTransfers");
  if (saveBtn && saveBtn.dataset.trSaveBound !== "1") {
    saveBtn.dataset.trSaveBound = "1";
    saveBtn.addEventListener("click", () => {
      if (!transferTeamFilter) return toast("Choose a club first");
      saveTransfersFromDom();
    });
  }

  const restoreBtn = $("#btnRestoreTransfers");
  if (restoreBtn && restoreBtn.dataset.trRestoreBound !== "1") {
    restoreBtn.dataset.trRestoreBound = "1";
    restoreBtn.addEventListener("click", () => {
      if (!confirm(`Restore ${leagueName(leagueFilter)} transfers from data.json? This replaces saved transfer lists for every club in this league.`)) {
        return;
      }
      restoreLeagueTransfersFromSite(leagueFilter);
    });
  }

  bindTransferTableHandlers();
  bindTmTransferSync();
}

function bindTransferDbPickers() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    if (!transferSupportsDbPick(section.key)) continue;
    const list = $(`#${section.tableId}`);
    if (!list || list.dataset.trDbBound === "1") continue;
    list.dataset.trDbBound = "1";

    list.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const card = target.closest(".transfers-card");
      if (!card || !list.contains(card)) return;

      if (target.classList.contains("tr-src-mode")) {
        setTransferCardSourceMode(card, target.value === "db" ? "db" : "manual");
        if (target.value === "manual") {
          queueMicrotask(() => card.querySelector(".tr-manual-panel .tr-player")?.focus?.());
        }
        return;
      }
      if (target.classList.contains("tr-db-league")) {
        refreshTransferDbTeamSelect(card);
        refreshTransferDbDestTeamSelect(card);
        return;
      }
      if (target.classList.contains("tr-db-team")) {
        refreshTransferDbPlayerSelect(card);
        refreshTransferDbDestTeamSelect(card);
        return;
      }
      if (target.classList.contains("tr-db-dest-league")) {
        refreshTransferDbDestTeamSelect(card);
      }
    });

    list.addEventListener("click", (e) => {
      const applyBtn = e.target instanceof Element ? e.target.closest(".tr-db-apply") : null;
      if (!applyBtn) return;
      const card = applyBtn.closest(".transfers-card");
      if (!card || !list.contains(card)) return;
      applyDbLinkedTransferFromCard(card);
    });
  }
}

function bindTransferTableHandlers() {
  for (const section of ADMIN_TRANSFER_SECTIONS) {
    bindTransferRowDragSort(`#${section.tableId}`);
  }
  bindTransferDel();
  bindTransferRosterActions();
  bindTransferDbPickers();
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
