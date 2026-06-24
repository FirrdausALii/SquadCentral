/**
 * Squad Central — data layer.
 * Load order: app.js seed → data.json (GitHub) → localStorage (local admin edits).
 */
(function (global) {
  const STORAGE_KEY = "fc_data_v1";
  const AUTH_KEY = "fc_admin_session";
  const PIN_KEY = "fc_admin_pin";
  const DEFAULT_PIN = "squadcentral";
  const DATA_JSON_PATH = "./data.json";
  const FETCH_TIMEOUT_MS = 30000;
  const FETCH_MAX_ATTEMPTS = 3;

  let state = null;
  let seedSnapshot = null;

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function defaultLeagueMeta() {
    return {
      epl: { matchweek: 36, matchweekTitle: "Matchweek 36", dateRange: "Saturday 9 May – Tuesday 12 May" },
      laliga: { matchweek: 36, matchweekTitle: "Matchweek 36", dateRange: "Saturday 10 May – Tuesday 12 May" },
      seriea: { matchweek: 36, matchweekTitle: "Matchweek 36", dateRange: "Saturday 9 May – Tuesday 12 May" },
      bundesliga: { matchweek: 1, dateRange: "Set date range in admin" },
      ligue1: { matchweek: 1, dateRange: "Set date range in admin" },
      msl: { matchweek: 1, dateRange: "Set date range in admin" },
      worldcup: {
        matchweek: 1,
        matchweekTitle: "Group Stage",
        dateRange: "Set date range in admin",
      },
    };
  }

  function buildStateFromSeed(seed) {
    return {
      version: 1,
      dataRevision: seed.dataRevision ?? 0,
      leagues: clone(seed.leagues ?? []),
      heroLeagueTabs: clone(seed.heroLeagueTabs ?? []),
      leagueUi: clone(seed.leagueUi ?? {}),
      leagueFeatures: clone(seed.leagueFeatures ?? {}),
      teams: clone(seed.teams ?? []),
      players: clone(seed.players ?? []),
      matches: clone(seed.matches ?? []),
      miniStandings: clone(seed.miniStandings ?? []),
      topScorers: clone(seed.topScorers ?? []),
      transfers: clone(seed.transfers ?? []),
      leagueMeta: { ...defaultLeagueMeta(), ...(seed.leagueMeta ?? {}) },
      deleted: emptyTombstones(seed.deleted),
    };
  }

  /** Tombstones record ids removed in admin so published data can't resurrect them. */
  function emptyTombstones(src) {
    return {
      leagues: clone(src?.leagues ?? []),
      teams: clone(src?.teams ?? []),
      players: clone(src?.players ?? []),
      matches: clone(src?.matches ?? []),
    };
  }

  function ensureTombstones() {
    if (!state.deleted) state.deleted = emptyTombstones();
    for (const k of ["leagues", "teams", "players", "matches"]) {
      if (!Array.isArray(state.deleted[k])) state.deleted[k] = [];
    }
    return state.deleted;
  }

  function tombstone(type, ids) {
    const t = ensureTombstones();
    const list = Array.isArray(ids) ? ids : [ids];
    for (const id of list) {
      if (id != null && !t[type].includes(id)) t[type].push(id);
    }
  }

  function untombstone(type, id) {
    const t = ensureTombstones();
    t[type] = t[type].filter((x) => x !== id);
  }

  function mergeState(base, patch) {
    if (!patch) return clone(base);
    return {
      ...base,
      ...patch,
      dataRevision: patch.dataRevision ?? base.dataRevision ?? 0,
      leagues: patch.leagues ?? base.leagues,
      heroLeagueTabs: patch.heroLeagueTabs ?? base.heroLeagueTabs,
      leagueUi: patch.leagueUi ?? base.leagueUi,
      leagueFeatures: patch.leagueFeatures ?? base.leagueFeatures,
      teams: patch.teams ?? base.teams,
      players: patch.players ?? base.players,
      matches: patch.matches ?? base.matches,
      miniStandings: patch.miniStandings ?? base.miniStandings,
      topScorers: patch.topScorers ?? base.topScorers,
      transfers: patch.transfers ?? base.transfers,
      leagueMeta: { ...base.leagueMeta, ...(patch.leagueMeta ?? {}) },
      deleted: emptyTombstones(patch.deleted ?? base.deleted),
    };
  }

  async function fetchPublishedDataOnce() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${DATA_JSON_PATH}?v=${Date.now()}`, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.warn("data.json fetch attempt failed:", err?.name || err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchPublishedData() {
    if (global.location?.protocol === "file:") return null;
    for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt += 1) {
      const data = await fetchPublishedDataOnce();
      if (data) return data;
      if (attempt < FETCH_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    return null;
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function save() {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function replaceArray(target, next) {
    target.length = 0;
    target.push(...next);
  }

  function pickState(publishedBase, saved, options = {}) {
    if (!saved) return clone(publishedBase);
    const pubRev = publishedBase.dataRevision ?? 0;
    const savedRev = saved.dataRevision ?? 0;
    // Admin always prefers localStorage; public site uses revision unless preferLocal.
    if (options.preferLocal || savedRev > pubRev) return mergeState(publishedBase, saved);
    const next = clone(publishedBase);
    state = next;
    save();
    return next;
  }

  function init(seed) {
    seedSnapshot = buildStateFromSeed(seed);
    const saved = loadFromStorage();
    state = pickState(seedSnapshot, saved, { preferLocal: !isPublicSite() });
    return state;
  }

  async function bootstrapSeed(seed, arrays, options = {}) {
    const builtIn = buildStateFromSeed(seed);
    seedSnapshot = clone(builtIn);
    const saved = loadFromStorage();
    const pickOpts = { preferLocal: !isPublicSite() };
    state = pickState(seedSnapshot, saved, pickOpts);
    if (arrays) hydrateInPlace(arrays);

    const published = await fetchPublishedData();
    if (published) {
      seedSnapshot = mergeState(builtIn, published);
      state = pickState(seedSnapshot, loadFromStorage(), pickOpts);
      if (options.preferPublishedCatalog !== false && isPublicSite()) {
        applyPublishedCatalog(seedSnapshot);
      }
      if (arrays) hydrateInPlace(arrays);
      global.document?.dispatchEvent(new CustomEvent("fc-data-updated"));
    } else if (isPublicSite()) {
      global.document?.dispatchEvent(new CustomEvent("fc-data-missing"));
      console.warn(
        "Squad Central: data.json was not loaded. MSL squads, logos, and fixtures need a local server (not file://).",
      );
    }
    return state;
  }

  function hydrateInPlace(arrays) {
    if (!state) return;
    if (arrays.teams) replaceArray(arrays.teams, state.teams);
    if (arrays.players) replaceArray(arrays.players, state.players);
    if (arrays.matches) replaceArray(arrays.matches, state.matches);
    if (arrays.miniStandings) replaceArray(arrays.miniStandings, state.miniStandings);
    if (arrays.topScorers) replaceArray(arrays.topScorers, state.topScorers);
    if (arrays.transfers) replaceArray(arrays.transfers, state.transfers);
  }

  function preferNonPlaceholder(value, fallback) {
    const s = String(value ?? "").trim();
    if (s && s !== "—") return value;
    return fallback;
  }

  /** Keep admin-edited player fields when merging published catalog. */
  function mergePlayerDetails(published, local) {
    if (!local) return clone(published);
    const out = clone(published);
    out.name = preferNonPlaceholder(local.name, out.name);
    if (local.number != null && local.number !== "") out.number = local.number;
    out.pos = preferNonPlaceholder(local.pos, out.pos);
    out.role = preferNonPlaceholder(local.role, out.role);
    out.club = preferNonPlaceholder(local.club, out.club);
    out.nationality = preferNonPlaceholder(local.nationality, out.nationality);
    out.flag = preferNonPlaceholder(local.flag, out.flag);
    if (local.captain != null) out.captain = local.captain;
    if (local.sortOrder != null) out.sortOrder = local.sortOrder;
    return out;
  }

  /** Keep admin-edited team fields (formation, stadium, etc.) when merging published catalog. */
  function mergeTeamDetails(published, local) {
    if (!local) return clone(published);
    const out = clone(published);
    for (const key of ["name", "city", "coach", "stadium", "formation", "logo"]) {
      out[key] = preferNonPlaceholder(local[key], out[key]);
    }
    if (local.colors?.length) out.colors = clone(local.colors);
    if (local.group) out.group = local.group;
    if (local.squadDepth) out.squadDepth = clone(local.squadDepth);
    return out;
  }

  /** Keep admin-edited scores, goals, and lineups when merging a published fixture row. */
  function mergeFixtureDetails(published, local) {
    if (!local) return clone(published);
    const pub = clone(published);
    const loc = local;
    if (loc.score) pub.score = clone(loc.score);
    pub.time = preferNonPlaceholder(loc.time, pub.time);
    pub.stadium = preferNonPlaceholder(loc.stadium, pub.stadium);
    if (loc.formation?.length) pub.formation = clone(loc.formation);
    if (loc.goalEvents?.length) pub.goalEvents = clone(loc.goalEvents);
    else if (!pub.goalEvents?.length) pub.goalEvents = [];
    if (loc.lineups) pub.lineups = clone(loc.lineups);
    if (loc.scorers?.length) pub.scorers = clone(loc.scorers);
    if (loc.status) pub.status = loc.status;
    return pub;
  }

  /** Teams/players from data.json; fixture rows merge in local admin edits (goals, lineups, scores). */
  function applyPublishedCatalog(published) {
    if (!state || !published) return;
    const saved = loadFromStorage();
    const localTeamsSource = saved?.teams?.length ? saved.teams : state.teams;
    const localPlayersSource = saved?.players?.length ? saved.players : state.players;
    const localTeamsById = new Map(localTeamsSource.map((t) => [t.id, t]));
    const localPlayersById = new Map(localPlayersSource.map((p) => [p.id, p]));
    const localMatchesById = new Map(state.matches.map((m) => [m.id, m]));
    const pubRev = published.dataRevision ?? 0;
    const savedRev = state.dataRevision ?? 0;

    // Tombstones: ids the admin deleted locally must not be resurrected from data.json.
    const del = emptyTombstones(saved?.deleted ?? state.deleted);
    const delLeagues = new Set(del.leagues);
    const delTeams = new Set(del.teams);
    const delPlayers = new Set(del.players);
    const delMatches = new Set(del.matches);
    state.deleted = del;
    const teamDeleted = (t) => delTeams.has(t.id) || delLeagues.has(t.leagueId);
    const playerDeleted = (p) => delPlayers.has(p.id) || delTeams.has(p.teamId);
    const matchDeleted = (m) => delMatches.has(m.id) || delLeagues.has(m.leagueId);

    state.leagues = clone(published.leagues ?? state.leagues).filter((l) => !delLeagues.has(l.id));
    state.heroLeagueTabs = clone(published.heroLeagueTabs ?? state.heroLeagueTabs).filter((id) => !delLeagues.has(id));
    state.leagueUi = clone(published.leagueUi ?? state.leagueUi);
    state.leagueFeatures = clone(published.leagueFeatures ?? state.leagueFeatures ?? {});

    const publishedTeams = (published.teams ?? []).filter((pt) => !teamDeleted(pt));
    state.teams = publishedTeams.map((pt) => mergeTeamDetails(pt, localTeamsById.get(pt.id)));
    const mergedTeamIds = new Set(state.teams.map((t) => t.id));
    for (const lt of localTeamsById.values()) {
      if (!mergedTeamIds.has(lt.id) && !teamDeleted(lt)) state.teams.push(clone(lt));
    }

    const publishedPlayers = (published.players ?? []).filter((pp) => !playerDeleted(pp));
    state.players = publishedPlayers.map((pp) => mergePlayerDetails(pp, localPlayersById.get(pp.id)));
    const mergedPlayerIds = new Set(state.players.map((p) => p.id));
    for (const lp of localPlayersById.values()) {
      if (!mergedPlayerIds.has(lp.id) && !playerDeleted(lp)) state.players.push(clone(lp));
    }

    const publishedMatches = (published.matches ?? []).filter((pm) => !matchDeleted(pm));
    state.matches = publishedMatches.map((pm) => mergeFixtureDetails(pm, localMatchesById.get(pm.id)));
    const mergedIds = new Set(state.matches.map((m) => m.id));
    for (const lm of localMatchesById.values()) {
      if (!mergedIds.has(lm.id) && !matchDeleted(lm)) state.matches.push(clone(lm));
    }

    if (savedRev > pubRev) {
      state.miniStandings = clone(state.miniStandings);
      state.topScorers = clone(state.topScorers);
      state.transfers = clone(state.transfers);
      state.leagueMeta = { ...defaultLeagueMeta(), ...state.leagueMeta, ...(published.leagueMeta ?? {}) };
    } else {
      const keepLeague = (x) => !delLeagues.has(x.leagueId);
      state.miniStandings = clone(published.miniStandings ?? state.miniStandings).filter(keepLeague);
      state.topScorers = clone(published.topScorers ?? state.topScorers).filter(keepLeague);
      state.transfers = clone(published.transfers ?? state.transfers).filter(keepLeague);
      state.leagueMeta = { ...defaultLeagueMeta(), ...(published.leagueMeta ?? state.leagueMeta) };
      if (published.dataRevision != null) state.dataRevision = published.dataRevision;
    }
    save();
  }

  function isPublicSite() {
    return global.document?.body?.dataset?.page !== "admin";
  }

  function getState() {
    return state;
  }

  function getLeagueMeta(leagueId) {
    return state?.leagueMeta?.[leagueId] ?? { matchweek: 36, dateRange: "—" };
  }

  function setLeagueMeta(leagueId, patch) {
    if (!state.leagueMeta) state.leagueMeta = {};
    state.leagueMeta[leagueId] = { ...getLeagueMeta(leagueId), ...patch };
    touchRevision();
    save();
  }

  /** Create or update a league entry (id/name) plus its accent UI and feature flags. */
  function upsertLeague(league, ui, features) {
    if (!league || !league.id) return;
    const id = league.id;
    untombstone("leagues", id);
    if (!Array.isArray(state.leagues)) state.leagues = [];
    const i = state.leagues.findIndex((l) => l.id === id);
    if (i >= 0) state.leagues[i] = { ...state.leagues[i], id, name: league.name };
    else state.leagues.push({ id, name: league.name });

    if (!Array.isArray(state.heroLeagueTabs)) state.heroLeagueTabs = [];
    if (!state.heroLeagueTabs.includes(id)) state.heroLeagueTabs.push(id);

    if (ui) {
      if (!state.leagueUi) state.leagueUi = {};
      state.leagueUi[id] = { ...state.leagueUi[id], ...ui };
    }
    if (features) {
      if (!state.leagueFeatures) state.leagueFeatures = {};
      state.leagueFeatures[id] = { ...state.leagueFeatures[id], ...features };
    }
    if (!state.leagueMeta) state.leagueMeta = {};
    if (!state.leagueMeta[id]) state.leagueMeta[id] = { matchweek: 1, dateRange: "Set date range in admin" };

    touchRevision();
    save();
  }

  /** Remove a league and cascade-delete its teams, players, matches, and tables. */
  function removeLeague(id) {
    if (!id) return;
    const teamIds = (state.teams ?? []).filter((t) => t.leagueId === id).map((t) => t.id);
    const teamIdSet = new Set(teamIds);
    const playerIds = (state.players ?? []).filter((p) => teamIdSet.has(p.teamId)).map((p) => p.id);
    const matchIds = (state.matches ?? []).filter((m) => m.leagueId === id).map((m) => m.id);
    state.leagues = (state.leagues ?? []).filter((l) => l.id !== id);
    state.heroLeagueTabs = (state.heroLeagueTabs ?? []).filter((x) => x !== id);
    if (state.leagueUi) delete state.leagueUi[id];
    if (state.leagueFeatures) delete state.leagueFeatures[id];
    if (state.leagueMeta) delete state.leagueMeta[id];
    state.teams = (state.teams ?? []).filter((t) => t.leagueId !== id);
    state.players = (state.players ?? []).filter((p) => !teamIdSet.has(p.teamId));
    state.matches = (state.matches ?? []).filter((m) => m.leagueId !== id);
    state.miniStandings = (state.miniStandings ?? []).filter((x) => x.leagueId !== id);
    state.topScorers = (state.topScorers ?? []).filter((x) => x.leagueId !== id);
    state.transfers = (state.transfers ?? []).filter((x) => x.leagueId !== id);
    tombstone("leagues", id);
    tombstone("teams", teamIds);
    tombstone("players", playerIds);
    tombstone("matches", matchIds);
    touchRevision();
    save();
  }

  function setLeagueUi(leagueId, ui) {
    if (!leagueId) return;
    if (!state.leagueUi) state.leagueUi = {};
    state.leagueUi[leagueId] = { ...state.leagueUi[leagueId], ...ui };
    touchRevision();
    save();
  }

  function setLeagueFeatures(leagueId, features) {
    if (!leagueId) return;
    if (!state.leagueFeatures) state.leagueFeatures = {};
    state.leagueFeatures[leagueId] = { ...state.leagueFeatures[leagueId], ...features };
    touchRevision();
    save();
  }

  function touchRevision() {
    state.dataRevision = Date.now();
  }

  function slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function makePlayerId(teamId, number, name) {
    return `${teamId}_${number}_${String(name).replaceAll(" ", "_")}`;
  }

  function upsertTeam(team) {
    const i = state.teams.findIndex((t) => t.id === team.id);
    if (i >= 0) state.teams[i] = { ...state.teams[i], ...team };
    else state.teams.push(team);
    untombstone("teams", team.id);
    touchRevision();
    save();
  }

  function removeTeam(teamId) {
    const playerIds = state.players.filter((p) => p.teamId === teamId).map((p) => p.id);
    const matchIds = state.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId).map((m) => m.id);
    state.teams = state.teams.filter((t) => t.id !== teamId);
    state.players = state.players.filter((p) => p.teamId !== teamId);
    state.matches = state.matches.filter((m) => m.homeTeamId !== teamId && m.awayTeamId !== teamId);
    tombstone("teams", teamId);
    tombstone("players", playerIds);
    tombstone("matches", matchIds);
    touchRevision();
    save();
  }

  function upsertPlayer(player) {
    const i = state.players.findIndex((p) => p.id === player.id);
    if (i >= 0) state.players[i] = { ...state.players[i], ...player };
    else state.players.push(player);
    untombstone("players", player.id);
    touchRevision();
    save();
  }

  function removePlayer(playerId) {
    state.players = state.players.filter((p) => p.id !== playerId);
    tombstone("players", playerId);
    touchRevision();
    save();
  }

  /** Persist drag-and-drop order for a team’s squad list (Players tab + public roster). */
  function reorderTeamPlayers(teamId, orderedPlayerIds) {
    if (!teamId || !orderedPlayerIds?.length) return;
    const orderMap = new Map(orderedPlayerIds.map((id, i) => [id, i]));
    for (const p of state.players) {
      if (p.teamId !== teamId) continue;
      if (orderMap.has(p.id)) p.sortOrder = orderMap.get(p.id);
    }
    touchRevision();
    save();
  }

  function upsertMatch(match) {
    const i = state.matches.findIndex((m) => m.id === match.id);
    if (i >= 0) state.matches[i] = match;
    else state.matches.push(match);
    untombstone("matches", match.id);
    touchRevision();
    save();
  }

  function removeMatch(matchId) {
    state.matches = state.matches.filter((m) => m.id !== matchId);
    tombstone("matches", matchId);
    touchRevision();
    save();
  }

  function setStandings(leagueId, rowsOrPayload) {
    const block = state.miniStandings.find((x) => x.leagueId === leagueId);
    if (rowsOrPayload && typeof rowsOrPayload === "object" && !Array.isArray(rowsOrPayload) && rowsOrPayload.groups) {
      const payload = rowsOrPayload;
      if (block) {
        block.groups = payload.groups;
        block.rows = payload.rows ?? [];
      } else {
        state.miniStandings.push({ leagueId, groups: payload.groups, rows: payload.rows ?? [] });
      }
    } else {
      const rows = rowsOrPayload;
      if (block) {
        block.rows = rows;
        if (leagueId === "worldcup") delete block.groups;
      } else state.miniStandings.push({ leagueId, rows });
    }
    touchRevision();
    save();
  }

  function setTopScorers(leagueId, rows) {
    const block = state.topScorers.find((x) => x.leagueId === leagueId);
    if (block) block.rows = rows;
    else state.topScorers.push({ leagueId, rows });
    touchRevision();
    save();
  }

  function setTransfers(leagueId, { in: ins, out: outs }) {
    const block = state.transfers.find((x) => x.leagueId === leagueId);
    if (block) {
      if (ins != null) block.in = ins;
      if (outs != null) block.out = outs;
    } else {
      state.transfers.push({ leagueId, in: ins ?? [], out: outs ?? [] });
    }
    touchRevision();
    save();
  }

  function resetToSeed() {
    if (!seedSnapshot) return;
    state = clone(seedSnapshot);
    save();
  }

  function exportJson() {
    const payload = { ...state, dataRevision: Date.now() };
    return JSON.stringify(payload, null, 2);
  }

  function importJson(text) {
    const parsed = JSON.parse(text);
    state = mergeState(seedSnapshot ?? buildStateFromSeed(parsed), parsed);
    touchRevision();
    save();
    return state;
  }

  function getPin() {
    try {
      return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
    } catch {
      return DEFAULT_PIN;
    }
  }

  function setPin(pin) {
    localStorage.setItem(PIN_KEY, String(pin));
  }

  function isAuthed() {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch {
      return false;
    }
  }

  function login(pin) {
    if (String(pin) === getPin()) {
      sessionStorage.setItem(AUTH_KEY, "1");
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem(AUTH_KEY);
  }

  global.FCDataStore = {
    DATA_JSON_PATH,
    init,
    bootstrapSeed,
    hydrateInPlace,
    applyPublishedCatalog,
    fetchPublishedData,
    getState,
    getLeagueMeta,
    setLeagueMeta,
    upsertLeague,
    removeLeague,
    setLeagueUi,
    setLeagueFeatures,
    defaultLeagueMeta,
    slugify,
    makePlayerId,
    upsertTeam,
    removeTeam,
    upsertPlayer,
    removePlayer,
    reorderTeamPlayers,
    upsertMatch,
    removeMatch,
    setStandings,
    setTopScorers,
    setTransfers,
    resetToSeed,
    exportJson,
    importJson,
    save,
    getPin,
    setPin,
    login,
    logout,
    isAuthed,
    DEFAULT_PIN,
  };
})(typeof window !== "undefined" ? window : globalThis);
