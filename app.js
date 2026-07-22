/* eslint-disable no-alert */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STORAGE_THEME_KEY = "fc_theme";

const LEAGUES = [
  { id: "epl", name: "Premier League" },
  { id: "laliga", name: "La Liga" },
  { id: "seriea", name: "Serie A" },
  { id: "bundesliga", name: "Bundesliga" },
  { id: "ligue1", name: "Ligue 1" },
  { id: "msl", name: "Malaysia Super League" },
  { id: "worldcup", name: "World Cup" },
];

const HERO_LEAGUE_TABS = LEAGUES.map((l) => l.id);
const LEAGUE_UI = {
  epl: { c1: "#2de2e6", c2: "#7c5cff", mask: "trophy" },
  laliga: { c1: "#ff4d6d", c2: "#ffd166", mask: "sun" },
  seriea: { c1: "#1fe4a5", c2: "#2de2e6", mask: "boot" },
  bundesliga: { c1: "#ffd166", c2: "#ff4d6d", mask: "eagle" },
  ligue1: { c1: "#7c5cff", c2: "#2de2e6", mask: "hex" },
  msl: { c1: "#ffd166", c2: "#ff4d6d", mask: "sun" },
  worldcup: { c1: "#1fe4a5", c2: "#ffd166", mask: "trophy" },
};

const WORLD_CUP_GROUP_IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const WORLD_CUP_GROUP_SIZE = 4;

/**
 * Per-league feature toggles. `default` is the value used when a league has not
 * been configured in the admin Leagues tab. Grouped for the admin UI.
 */
const LEAGUE_FEATURE_SCHEMA = [
  { id: "matchCenter", label: "Match Center section", group: "Sections", default: true },
  { id: "standings", label: "Standings table", group: "Sections", default: true },
  { id: "topScorers", label: "Top scorers", group: "Sections", default: true },
  { id: "transfers", label: "Transfers section", group: "Sections", default: true },
  { id: "nationalDuty", label: "National duty (squads)", group: "Sections", default: true },
  { id: "squads", label: "Squads / roster", group: "Sections", default: true },
  { id: "spotlight", label: "Club spotlight (home)", group: "Sections", default: true },
  { id: "groupStandings", label: "Use group-stage standings", group: "Standings", default: false },
  { id: "matchStatus", label: "Status badge (FT / live)", group: "Match fields", default: true },
  { id: "matchStadium", label: "Stadium / venue", group: "Match fields", default: true },
  { id: "matchCoaches", label: "Coaches", group: "Match fields", default: true },
  { id: "matchFormation", label: "Formations", group: "Match fields", default: true },
  { id: "matchGoalEvents", label: "Goal events", group: "Match fields", default: true },
  { id: "matchLineups", label: "Lineups", group: "Match fields", default: true },
  { id: "matchPitchView", label: "Pitch view", group: "Match fields", default: true },
  { id: "matchPossession", label: "Possession / momentum", group: "Match fields", default: true },
  { id: "playerNumber", label: "Shirt number", group: "Player fields", default: true },
  { id: "playerPosition", label: "Position tag", group: "Player fields", default: true },
  { id: "playerNationality", label: "Nationality / flag", group: "Player fields", default: true },
  { id: "playerStarts", label: "Starts (XI count)", group: "Player fields", default: false },
  { id: "playerClub", label: "Club (national teams)", group: "Player fields", default: true },
];

const LEAGUE_FEATURE_IDS = LEAGUE_FEATURE_SCHEMA.map((f) => f.id);

/** Built-in defaults that differ from the schema baseline for specific leagues. */
const LEAGUE_FEATURE_PRESETS = {
  worldcup: { transfers: false, nationalDuty: false, groupStandings: true },
};

function defaultLeagueFeatures(leagueId) {
  const out = {};
  for (const f of LEAGUE_FEATURE_SCHEMA) out[f.id] = f.default;
  return { ...out, ...(LEAGUE_FEATURE_PRESETS[leagueId] ?? {}) };
}

/** Resolved on/off state for a league feature: stored config → preset → schema default. */
function leagueFeatureOn(leagueId, featureId) {
  const state = typeof FCDataStore !== "undefined" ? FCDataStore.getState?.() : null;
  const stored = state?.leagueFeatures?.[leagueId];
  if (stored && Object.prototype.hasOwnProperty.call(stored, featureId)) {
    return stored[featureId] !== false;
  }
  const defaults = defaultLeagueFeatures(leagueId);
  return defaults[featureId] !== false;
}

function leagueHasTransfers(leagueId) {
  return leagueFeatureOn(leagueId, "transfers");
}

function leagueHasNationalDuty(leagueId) {
  return leagueFeatureOn(leagueId, "nationalDuty") && !isWorldCupLeague(leagueId);
}

function leagueUsesGroupStandings(leagueId) {
  return leagueFeatureOn(leagueId, "groupStandings");
}

/** Pull league list / accents / hero tabs from the data store into the live consts. */
function syncLeagueConfigFromStore() {
  const state = typeof FCDataStore !== "undefined" ? FCDataStore.getState?.() : null;
  if (!state) return;

  if (Array.isArray(state.leagues) && state.leagues.length) {
    LEAGUES.length = 0;
    LEAGUES.push(...state.leagues.map((l) => ({ id: l.id, name: l.name })));
  }

  if (state.leagueUi && typeof state.leagueUi === "object") {
    for (const k of Object.keys(LEAGUE_UI)) delete LEAGUE_UI[k];
    for (const [k, v] of Object.entries(state.leagueUi)) LEAGUE_UI[k] = { ...v };
  }

  HERO_LEAGUE_TABS.length = 0;
  if (Array.isArray(state.heroLeagueTabs) && state.heroLeagueTabs.length) {
    HERO_LEAGUE_TABS.push(...state.heroLeagueTabs.filter((id) => LEAGUES.some((l) => l.id === id)));
  } else {
    HERO_LEAGUE_TABS.push(...LEAGUES.map((l) => l.id));
  }
}

function isWorldCupLeague(leagueId) {
  return leagueId === "worldcup";
}

function parseMatchweekNumber(matchday) {
  const m = String(matchday ?? "").match(/MW\s*(\d+)/i);
  return m ? Number(m[1]) : 0;
}

/** World Cup lists every fixture; club leagues filter by gameweek tag. */
function leagueShowsAllFixtures(leagueId) {
  return isWorldCupLeague(leagueId);
}

function filterMatchesForLeagueWeek(matches, leagueId, weekNum) {
  const list = (matches ?? []).filter((m) => m.leagueId === leagueId);
  if (leagueShowsAllFixtures(leagueId)) return list;
  const mwLabel = `MW ${weekNum ?? 36}`;
  return list.filter((m) => m.matchday === mwLabel || !m.matchday);
}

function matchListDateKey(match, showAll) {
  const time = String(match?.time ?? "").trim() || "—";
  if (!showAll) return time;
  const stage = String(match?.matchday ?? "").trim();
  return stage && stage !== "—" ? `${stage}|${time}` : time;
}

function matchListDateLabel(key, showAll) {
  const raw = String(key ?? "");
  if (showAll && raw.includes("|")) {
    const [stage, time] = raw.split("|");
    return [stage, time].filter((x) => x && x !== "—").join(" · ") || raw;
  }
  return raw || "—";
}

function parseMatchListDateSortValue(key) {
  const timePart = String(key ?? "").includes("|") ? String(key).split("|").pop() : String(key ?? "");
  const cleaned = timePart.trim();
  if (!cleaned || cleaned === "—") return 0;
  for (const year of [2026, 2025, 2027]) {
    const ts = Date.parse(`${cleaned} ${year}`);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function groupMatchesByListDate(matches, showAll) {
  const groups = new Map();
  for (const m of matches) {
    const key = matchListDateKey(m, showAll);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .map(([key, items]) => ({
      key,
      label: matchListDateLabel(key, showAll),
      sortValue: parseMatchListDateSortValue(key),
      items,
    }))
    .sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label));
}

function defaultMatchListDateKey(groups) {
  if (!groups.length) return "";
  return groups[groups.length - 1].key;
}

function matchCenterDateStorageKey(leagueId, viewWeek) {
  return `${leagueId}:${viewWeek}`;
}

function resolveMatchCenterDateView(leagueId, viewWeek, matches, showAll) {
  if (!renderMatchCenter._viewDateByWeek) renderMatchCenter._viewDateByWeek = {};
  const dateGroups = groupMatchesByListDate(matches, showAll);
  const storageKey = matchCenterDateStorageKey(leagueId, viewWeek);
  let viewDateKey = renderMatchCenter._viewDateByWeek[storageKey];
  if (!viewDateKey || !dateGroups.some((g) => g.key === viewDateKey)) {
    viewDateKey = defaultMatchListDateKey(dateGroups);
    renderMatchCenter._viewDateByWeek[storageKey] = viewDateKey;
  }
  const activeIndex = dateGroups.findIndex((g) => g.key === viewDateKey);
  const activeGroup = activeIndex >= 0 ? dateGroups[activeIndex] : null;
  return { dateGroups, viewDateKey, activeIndex, activeGroup };
}

function matchdayForSavedFixture(leagueId, meta, stageLabel) {
  if (leagueShowsAllFixtures(leagueId)) {
    return String(stageLabel ?? "").trim() || meta.matchweekTitle?.trim() || "Group Stage";
  }
  return `MW ${meta.matchweek ?? 36}`;
}

const LEAGUE_MASKS = {
  trophy:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M8 4h8v2h3a1 1 0 0 1 1 1c0 4.418-2.239 7-6 7a6.2 6.2 0 0 1-3 1.3V18h4v2H8v-2h4v-2.7A6.2 6.2 0 0 1 9 14c-3.761 0-6-2.582-6-7a1 1 0 0 1 1-1h3V4Zm-3 4c.2 2.9 1.8 4 4 4V8H5Zm14 0h-4v4c2.2 0 3.8-1.1 4-4Z'/%3E%3C/svg%3E\")",
  sun:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 18a6 6 0 1 0 0-12a6 6 0 0 0 0 12Zm0-16h1v3h-2V2h1Zm0 17h1v3h-2v-3h1ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM4.2 4.2l2.1 2.1L4.9 7.7L2.8 5.6L4.2 4.2Zm13.5 13.5l2.1 2.1l-1.4 1.4l-2.1-2.1l1.4-1.4ZM19.8 4.2l1.4 1.4l-2.1 2.1l-1.4-1.4l2.1-2.1ZM6.3 17.7l1.4 1.4l-2.1 2.1l-1.4-1.4l2.1-2.1Z'/%3E%3C/svg%3E\")",
  boot:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M8 3h9v5c0 1.1.9 2 2 2h2v2c0 4.4-3.6 8-8 8H9c-3.3 0-6-2.7-6-6V9h5V3Zm2 2v4H5v7c0 2.2 1.8 4 4 4h6c3.3 0 6-2.7 6-6v-2h-2c-2.2 0-4-1.8-4-4V5h-5Z'/%3E%3C/svg%3E\")",
  eagle:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2c3 0 6 2 6 6c0 2-1 3-2 4l3 1v2l-5-1c-1 1-2 2-2 4v4h-2v-4c0-2-1-3-2-4l-5 1v-2l3-1c-1-1-2-2-2-4c0-4 3-6 6-6Zm0 2c-2.2 0-4 1.4-4 4c0 1.2.6 2 1.5 2.8l.9.8l-.6 1c-.7 1.2-1.8 2-3.3 2.4l2.7-.5l.6.7c1 1.1 1.6 2.3 1.7 3.8c.1-1.5.7-2.7 1.7-3.8l.6-.7l2.7.5c-1.5-.4-2.6-1.2-3.3-2.4l-.6-1l.9-.8C15.4 10 16 9.2 16 8c0-2.6-1.8-4-4-4Z'/%3E%3C/svg%3E\")",
  hex:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M7 2h10l5 10l-5 10H7L2 12L7 2Zm1.2 2L4.3 12l3.9 8h7.6l3.9-8l-3.9-8H8.2Z'/%3E%3C/svg%3E\")",
};

const MATCHES = [
  {
    id: "epl_mw36_liv_che",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Anfield",
    homeTeamId: "epl_liverpool",
    awayTeamId: "epl_chelsea",
    score: [1, 1],
    scorers: [],
    goalEvents: [
      { minute: 6, side: "home", scorer: "Ryan Gravenberch", assist: "Rio Ngumoha" },
      { minute: 35, side: "away", scorer: "Enzo Fernandez", assist: null, type: "Free kick" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 25, name: "Giorgi Mamardashvili", flag: "", nationality: "Georgia" },
        { tag: "RB", number: 17, name: "Curtis Jones", flag: "", nationality: "England" },
        { tag: "CB", number: 5, name: "Ibrahima Konate", flag: "", nationality: "France" },
{ tag: "CB", number: 4, name: "Virgil Van Dijk", flag: "", nationality: "Netherlands", captain: true },
{ tag: "LB", number: 6, name: "Milos Kerkez", flag: "", nationality: "Hungary" },
{ tag: "CM", number: 38, name: "Ryan Gravenberch", flag: "", nationality: "Netherlands" },
{ tag: "CM", number: 10, name: "Alexis Mac Allister", flag: "", nationality: "Argentina" },
{ tag: "RW", number: 30, name: "Jeremie Frimpong", flag: "", nationality: "Netherlands" },
{ tag: "AM", number: 8, name: "Dominik Szoboszlai", flag: "", nationality: "Hungary" },
{ tag: "LW", number: 73, name: "Rio Ngumoha", flag: "", nationality: "England" },
{ tag: "CF", number: 18, name: "Cody Gakpo", flag: "", nationality: "Netherlands" },
      ],
      away: [
        { tag: "GK", number: 12, name: "Filip Jorgensen", flag: "", nationality: "Denmark" },
{ tag: "RB", number: 27, name: "Malo Gusto", flag: "", nationality: "France" },
{ tag: "CB", number: 29, name: "Wesley Fofana", flag: "", nationality: "France" },
{ tag: "CB", number: 6, name: "Levi Colwill", flag: "", nationality: "England" },
{ tag: "LB", number: 21, name: "Jorrel Hato", flag: "", nationality: "Netherlands" },
{ tag: "CM", number: 17, name: "Andrey Santos", flag: "", nationality: "Brazil" },
{ tag: "CM", number: 25, name: "Moises Caicedo", flag: "", nationality: "Ecuador" },
{ tag: "RW", number: 10, name: "Cole Palmer", flag: "", nationality: "England" },
{ tag: "AM", number: 8, name: "Enzo Fernandez", flag: "", nationality: "Argentina", captain: true },
{ tag: "LW", number: 3, name: "Marc Cucurella", flag: "", nationality: "Spain" },
{ tag: "CF", number: 20, name: "Joao Pedro", flag: "", nationality: "Brazil" },
      ],
    },
  },
  {
    id: "epl_mw36_bri_wol",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Amex Stadium",
    homeTeamId: "epl_brighton",
    awayTeamId: "epl_hull_city",
    score: [3, 0],
    scorers: [],
    goalEvents: [
      { minute: 1, side: "home", scorer: "Jack Hinshelwood", assist: "Maxim De Cuyper" },
      { minute: 5, side: "home", scorer: "Lewis Dunk", assist: "Maxim De Cuyper" },
{ minute: 86, side: "home", scorer: "Yankuba Minteh", assist: null },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "3-4-2-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Bart Verbruggen", flag: "", nationality: "Netherlands" },
        { tag: "RB", number: 24, name: "Ferdi Kadioglu", flag: "", nationality: "Turkey" },
        { tag: "CB", number: 6, name: "Jan Paul Van Hecke", flag: "", nationality: "Netherlands" },
{ tag: "CB", number: 5, name: "Lewis Dunk", flag: "", nationality: "England", captain: true },
{ tag: "LB", number: 29, name: "Maxim De Cuyper", flag: "", nationality: "Belgium" },
{ tag: "CM", number: 17, name: "Carlos Baleba", flag: "", nationality: "Cameroon" },
{ tag: "CM", number: 30, name: "Pascal Gross", flag: "", nationality: "Germany" },
{ tag: "RW", number: 11, name: "Yankuba Minteh", flag: "", nationality: "Gambia" },
{ tag: "AM", number: 13, name: "Jack Hinshelwood", flag: "", nationality: "England" },
{ tag: "LW", number: 22, name: "Kaoru Mitoma", flag: "", nationality: "Japan" },
{ tag: "CF", number: 18, name: "Danny Welbeck", flag: "", nationality: "England" },
      ],
      away: [
        { tag: "GK", number: 25, name: "Daniel Bentley", flag: "", nationality: "England" },
{ tag: "CB", number: 15, name: "Yerson Mosquera", flag: "", nationality: "Colombia" },
{ tag: "CB", number: 4, name: "Santi Bueno", flag: "", nationality: "Uruguay" },
{ tag: "CB", number: 24, name: "Toti Gomis", flag: "", nationality: "Portugal", captain: true },
{ tag: "RM", number: 17, name: "Pedro Lima", flag: "", nationality: "Brazil" },
{ tag: "CM", number: 7, name: "Andre", flag: "", nationality: "Brazil" },
{ tag: "CM", number: 8, name: "Joao Gomes", flag: "", nationality: "Brazil" },
{ tag: "LM", number: 3, name: "Hugo Bueno", flag: "", nationality: "Spain" },
{ tag: "AM", number: 9, name: "Adam Armstrong", flag: "", nationality: "England", },
{ tag: "AM", number: 36, name: "Mateus Mane", flag: "", nationality: "England" },
{ tag: "CF", number: 11, name: "Hwang Hee Chan", flag: "", nationality: "South Korea" },
      ],
    },
  },
  {
    id: "epl_mw36_ful_bou",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Craven Cottage",
    homeTeamId: "epl_fulham",
    awayTeamId: "epl_bournemouth",
    score: [0, 1],
    scorers: [],
    goalEvents: [
      { minute: 53, side: "away", scorer: "Rayan", assist: "Adam Smith" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Bernd Leno", flag: "", nationality: "Germany" },
        { tag: "RB", number: 21, name: "Timothy Castagne", flag: "", nationality: "Belgium" },
        { tag: "CB", number: 5, name: "Joachim Andersen", flag: "", nationality: "Denmark" },
{ tag: "CB", number: 3, name: "Calvin Bassey", flag: "", nationality: "Nigeria" },
{ tag: "LB", number: 33, name: "Antonee Robinson", flag: "", nationality: "USA" },
{ tag: "CM", number: 20, name: "Sasa Lukic", flag: "", nationality: "Serbia" },
{ tag: "CM", number: 10, name: "Tom Cairney", flag: "", nationality: "Scotland", captain: true },
{ tag: "RW", number: 8, name: "Harry Wilson", flag: "", nationality: "Wales" },
{ tag: "AM", number: 32, name: "Emile Smith Rowe", flag: "", nationality: "England" },
{ tag: "LW", number: 19, name: "Samuel Chukwueze", flag: "", nationality: "Nigeria" },
{ tag: "CF", number: 9, name: "Rodrigo Muniz", flag: "", nationality: "Brazil" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Djordje Petrovic", flag: "", nationality: "Serbia" },
{ tag: "RB", number: 15, name: "Adam Smith", flag: "", nationality: "England", captain: true },
{ tag: "CB", number: 23, name: "James Hill", flag: "", nationality: "England" },
{ tag: "CB", number: 5, name: "Marcos Senesi", flag: "", nationality: "Argentina" },
{ tag: "LB", number: 3, name: "Adrien Truffert", flag: "", nationality: "France" },
{ tag: "CM", number: 8, name: "Alex Scott", flag: "", nationality: "England" },
{ tag: "CM", number: 10, name: "Ryan Christie", flag: "", nationality: "Scotland" },
{ tag: "RW", number: 37, name: "Rayan", flag: "", nationality: "Brazil" },
{ tag: "AM", number: 22, name: "Junior Kroupi", flag: "", nationality: "France", },
{ tag: "LW", number: 16, name: "Marcus Tavernier", flag: "", nationality: "England" },
{ tag: "CF", number: 9, name: "Evanilson", flag: "", nationality: "Brazil" },
      ],
    },
  },
  {
    id: "epl_mw36_sun_mun",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Stadium of Light",
    homeTeamId: "epl_sunderland",
    awayTeamId: "epl_united",
    score: [0, 0],
    scorers: [],
    goalEvents: [
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 22, name: "Robin Roefs", flag: "", nationality: "Netherlands" },
        { tag: "RB", number: 6, name: "Lutsharel Geertruida", flag: "", nationality: "Netherlands" },
        { tag: "CB", number: 20, name: "Nordi Mukiele", flag: "", nationality: "France" },
{ tag: "CB", number: 15, name: "Omar Alderete", flag: "", nationality: "Paraguay" },
{ tag: "LB", number: 17, name: "Reinildo Mandava", flag: "", nationality: "Mozambique" },
{ tag: "CM", number: 34, name: "Granit Xhaka", flag: "", nationality: "Switzerland", captain: true },
{ tag: "CM", number: 27, name: "Noah Sadiki", flag: "", nationality: "DR Congo" },
{ tag: "RW", number: 32, name: "Trai Hume", flag: "", nationality: "Northern Ireland" },
{ tag: "AM", number: 28, name: "Enzo Le Fee", flag: "", nationality: "France" },
{ tag: "LW", number: 7, name: "Chemsdine Talbi", flag: "", nationality: "Morocco" },
{ tag: "CF", number: 9, name: "Brian Brobbey", flag: "", nationality: "Netherlands" },
      ],
      away: [
        { tag: "GK", number: 31, name: "Senne Lammens", flag: "", nationality: "Belgium" },
{ tag: "RB", number: 3, name: "Noussair Mazraoui", flag: "", nationality: "Morocco" },
{ tag: "CB", number: 5, name: "Harry Maguire", flag: "", nationality: "England" },
{ tag: "CB", number: 6, name: "Lisandro Martinez", flag: "", nationality: "Argentina" },
{ tag: "LB", number: 23, name: "Luke Shaw", flag: "", nationality: "England" },
{ tag: "CM", number: 7, name: "Mason Mount", flag: "", nationality: "England" },
{ tag: "CM", number: 37, name: "Kobbie Mainoo", flag: "", nationality: "England" },
{ tag: "RW", number: 16, name: "Amad Diallo", flag: "", nationality: "Ivory Coast" },
{ tag: "AM", number: 8, name: "Bruno Fernandes", flag: "", nationality: "Portugal", captain: true },
{ tag: "LW", number: 10, name: "Matheus Cunha", flag: "", nationality: "Brazil" },
{ tag: "CF", number: 11, name: "Joshua Zirkzee", flag: "", nationality: "Netherlands" },
      ],
    },
  },
  {
    id: "epl_mw36_mci_bre",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Etihad Stadium",
    homeTeamId: "epl_city",
    awayTeamId: "epl_brentford",
    score: [3, 0],
    scorers: [],
    goalEvents: [
{ minute: 60, side: "home", scorer: "Jeremy Doku", assist: null },
{ minute: 75, side: "home", scorer: "Erling Haaland", assist: null },
{ minute: 90+2, side: "home", scorer: "Omar Marmoush", assist: "Erling Haaland"},
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-4-2"],
    lineups: {
      home: [
        { tag: "GK", number: 25, name: "Gianluigi Donnarumma", flag: "", nationality: "Italy" },
        { tag: "RB", number: 27, name: "Matheus Nunes", flag: "", nationality: "Portugal" },
        { tag: "CB", number: 15, name: "Marc Guehi", flag: "", nationality: "England" },
{ tag: "CB", number: 6, name: "Nathan Ake", flag: "", nationality: "Netherlands" },
{ tag: "LB", number: 33, name: "Nico O’Reilly", flag: "", nationality: "England" },
{ tag: "CM", number: 20, name: "Bernardo Silva", flag: "", nationality: "Portugal", captain: true },
{ tag: "CM", number: 4, name: "Tijjani Reijnders", flag: "", nationality: "Netherlands" },
{ tag: "RW", number: 42, name: "Antoine Semenyo", flag: "", nationality: "Ghana" },
{ tag: "AM", number: 10, name: "Rayan Cherki", flag: "", nationality: "France" },
{ tag: "LW", number: 11, name: "Jeremy Doku", flag: "", nationality: "Belgium" },
{ tag: "CF", number: 9, name: "Erling Haaland", flag: "", nationality: "Norway" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Caoimhin Kelleher", flag: "", nationality: "Ireland" },
{ tag: "RB", number: 33, name: "Michael Kayode", flag: "", nationality: "Italy" },
{ tag: "CB", number: 20, name: "Kristoffer Ajer", flag: "", nationality: "Norway" },
{ tag: "CB", number: 22, name: "Nathan Collins", flag: "", nationality: "Ireland", captain: true },
{ tag: "LB", number: 23, name: "Keane Lewis-Potter", flag: "", nationality: "England" },
{ tag: "RM", number: 18, name: "Yegor Yarmolyuk", flag: "", nationality: "Ukraine" },
{ tag: "CM", number: 8, name: "Mathias Jensen", flag: "", nationality: "Denmark" },
{ tag: "CM", number: 2, name: "Aaron Hickey", flag: "", nationality: "Scotland" },
{ tag: "LM", number: 24, name: "Mikkel Damsgaard", flag: "", nationality: "Denmark" },
{ tag: "CF", number: 9, name: "Igor Thiago", flag: "", nationality: "Brazil" },
{ tag: "CF", number: 7, name: "Kevin Schade", flag: "", nationality: "Germany" },
      ],
    },
  },
  {
    id: "epl_mw36_bur_avi",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Turf Moor",
    homeTeamId: "epl_coventry_city",
    awayTeamId: "epl_aston_villa",
    score: [2, 2],
    scorers: [],
   goalEvents: [
{ minute: 8, side: "home", scorer: "Jaidon Anthony", assist: null },
{ minute: 42, side: "away", scorer: "Ross Barkley", assist: "John McGinn" },
{ minute: 56, side: "away", scorer: "Ollie Watkins", assist: "Emiliano Martinez"},
{ minute: 58, side: "home", scorer: "Zian Flemming", assist: "Hannibal Mejbri"},
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Max Weiss", flag: "", nationality: "Germany" },
        { tag: "RB", number: 2, name: "Kyle Walker", flag: "", nationality: "England", captain: true },
        { tag: "CB", number: 6, name: "Axel Tuanzebe", flag: "", nationality: "DR Congo" },
{ tag: "CB", number: 5, name: "Maxime Esteve", flag: "", nationality: "France" },
{ tag: "LB", number: 23, name: "Lucas Pires", flag: "", nationality: "Brazil" },
{ tag: "CM", number: 16, name: "Florentino Luis", flag: "", nationality: "Portugal" },
{ tag: "CM", number: 8, name: "Lesley Ugochukwu", flag: "", nationality: "France" },
{ tag: "RW", number: 17, name: "Loum Tchaouna", flag: "", nationality: "France" },
{ tag: "AM", number: 28, name: "Hannibal Mejbri", flag: "", nationality: "Tunisia" },
{ tag: "LW", number: 11, name: "Jaidon Anthony", flag: "", nationality: "England" },
{ tag: "CF", number: 19, name: "Zian Flemming", flag: "", nationality: "Netherlands" },
      ],
      away: [
        { tag: "GK", number: 23, name: "Emiliano Martinez", flag: "", nationality: "Argentina" },
{ tag: "RB", number: 2, name: "Matty Cash", flag: "", nationality: "Poland" },
{ tag: "CB", number: 4, name: "Ezri Konsa", flag: "", nationality: "England" },
{ tag: "CB", number: 5, name: "Tyrone Mings", flag: "", nationality: "England" },
{ tag: "LB", number: 22, name: "Ian Maatsen", flag: "", nationality: "Netherlands" },
{ tag: "CM", number: 3, name: "Victor Lindelof", flag: "", nationality: "Sweden" },
{ tag: "CM", number: 8, name: "Youri Tielemans", flag: "", nationality: "Belgium" },
{ tag: "RW", number: 7, name: "John McGinn", flag: "", nationality: "Scotland", captain: true },
{ tag: "AM", number: 6, name: "Ross Barkley", flag: "", nationality: "England" },
{ tag: "LW", number: 27, name: "Morgan Rogers", flag: "", nationality: "England" },
{ tag: "CF", number: 11, name: "Ollie Watkins", flag: "", nationality: "England" },
      ],
    },
  },
  {
    id: "epl_mw36_cpa_eve",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Selhurst Park",
    homeTeamId: "epl_crystal_palace",
    awayTeamId: "epl_everton",
    score: [2, 2],
    scorers: [],
    goalEvents: [
{ minute: 6, side: "away", scorer: "James Tarkowski", assist: null },
{ minute: 34, side: "home", scorer: "Ismaila Sarr", assist: null },
{ minute: 47, side: "away", scorer: "Beto", assist: "James Tarkowski"},
{ minute: 77, side: "home", scorer: "Jean Philippe-Mateta", assist: null },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["3-4-2-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Dean Henderson", flag: "", nationality: "England", captain: true },
        { tag: "CB", number: 26, name: "Chris Richards", flag: "", nationality: "USA" },
        { tag: "CB", number: 5, name: "Maxence Lacroix", flag: "", nationality: "France" },
{ tag: "CB", number: 23, name: "Jaydee Canvot", flag: "", nationality: "France" },
{ tag: "RM", number: 2, name: "Daniel Munoz", flag: "", nationality: "Colombia" },
{ tag: "CM", number: 20, name: "Adam Wharton", flag: "", nationality: "England" },
{ tag: "CM", number: 18, name: "Daichi Kamada", flag: "", nationality: "Japan" },
{ tag: "LM", number: 3, name: "Tyrick Mitchell", flag: "", nationality: "England" },
{ tag: "AM", number: 11, name: "Brennan Johnson", flag: "", nationality: "Wales" },
{ tag: "AM", number: 7, name: "Ismaila Sarr", flag: "", nationality: "Senegal" },
{ tag: "CF", number: 22, name: "Jorgen Strand Larsen", flag: "", nationality: "Norway" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Jordan Pickford", flag: "", nationality: "England" },
{ tag: "RB", number: 15, name: "Jake O’Brien", flag: "", nationality: "Ireland" },
{ tag: "CB", number: 6, name: "James Tarkowski", flag: "", nationality: "England", captain: true },
{ tag: "CB", number: 5, name: "Michael Keane", flag: "", nationality: "England" },
{ tag: "LB", number: 16, name: "Vitaly Mykolenko", flag: "", nationality: "Ukraine" },
{ tag: "CM", number: 42, name: "Tim Iroegbunam", flag: "", nationality: "England" },
{ tag: "CM", number: 37, name: "James Garner", flag: "", nationality: "England" },
{ tag: "RW", number: 34, name: "Merlin Rohl", flag: "", nationality: "Germany" },
{ tag: "AM", number: 22, name: "Kiernan Dewsbury-Hall", flag: "", nationality: "England" },
{ tag: "LW", number: 10, name: "Iliman Ndiaye", flag: "", nationality: "Senegal" },
{ tag: "CF", number: 9, name: "Beto", flag: "", nationality: "Guinea-Bissau" },
      ],
    },
  },
  {
    id: "epl_mw36_not_new",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "The City Ground",
    homeTeamId: "epl_nottingham",
    awayTeamId: "epl_newcastle",
    score: [1, 1],
    scorers: [],
   goalEvents: [
{ minute: 74, side: "away", scorer: "Harvey Barnes", assist: "Jacob Ramsey" },
{ minute: 88, side: "home", scorer: "Elliot Anderson", assist: "James McAtee" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["3-4-2-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 26, name: "Matz Sels", flag: "", nationality: "Belgium" },
        { tag: "CB", number: 23, name: "Jair Cunha", flag: "", nationality: "Brazil" },
        { tag: "CB", number: 31, name: "Nikola Milenkovic", flag: "", nationality: "Serbia" },
{ tag: "CB", number: 4, name: "Morato", flag: "", nationality: "Brazil" },
{ tag: "RM", number: 3, name: "Neco Williams", flag: "", nationality: "Wales", captain: true },
{ tag: "CM", number: 16, name: "Nico Dominguez", flag: "", nationality: "Argentina" },
{ tag: "CM", number: 8, name: "Elliot Anderson", flag: "", nationality: "England" },
{ tag: "LM", number: 25, name: "Luca Netz", flag: "", nationality: "Germany" },
{ tag: "AM", number: 29, name: "Dilane Bakwa", flag: "", nationality: "France" },
{ tag: "AM", number: 19, name: "Igor Jesus", flag: "", nationality: "Brazil" },
{ tag: "CF", number: 9, name: "Taiwo Awoniyi", flag: "", nationality: "Nigeria" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Nick Pope", flag: "", nationality: "England" },
{ tag: "RB", number: 3, name: "Lewis Hall", flag: "", nationality: "England" },
{ tag: "CB", number: 12, name: "Malick Thiaw", flag: "", nationality: "Germany" },
{ tag: "CB", number: 4, name: "Sven Botman", flag: "", nationality: "Netherlands" },
{ tag: "LB", number: 33, name: "Dan Burn", flag: "", nationality: "England" },
{ tag: "CM", number: 8, name: "Sandro Tonali", flag: "", nationality: "Italy" },
{ tag: "CM", number: 39, name: "Bruno Guimaraes", flag: "", nationality: "Brazil", captain: true },
{ tag: "RW", number: 23, name: "Jacob Murphy", flag: "", nationality: "England" },
{ tag: "AM", number: 27, name: "Nick Woltemade", flag: "", nationality: "Germany" },
{ tag: "LW", number: 7, name: "Joelinton", flag: "", nationality: "Brazil" },
{ tag: "CF", number: 18, name: "William Osula", flag: "", nationality: "Denmark" },
      ],
    },
  },
  {
    id: "epl_mw36_wha_ars",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "London Stadium",
    homeTeamId: "epl_ipswich_town",
    awayTeamId: "epl_arsenal",
    score: [0, 1],
    scorers: [],
    goalEvents: [
{ minute: 83, side: "away", scorer: "Leandro Trossard", assist: "Martin Odegaard" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["3-4-2-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Mads Hermansen", flag: "", nationality: "Denmark" },
        { tag: "CB", number: 25, name: "Jean Clair-Todibo", flag: "", nationality: "France" },
        { tag: "CB", number: 15, name: "Kostas Mavropanos", flag: "", nationality: "Greece" },
{ tag: "CB", number: 4, name: "Axel Disasi", flag: "", nationality: "France" },
{ tag: "RM", number: 29, name: "Aaron Wan-Bissaka", flag: "", nationality: "DR Congo" },
{ tag: "CM", number: 28, name: "Tomas Soucek", flag: "", nationality: "Czech Republic" },
{ tag: "CM", number: 18, name: "Mateus Fernandes", flag: "", nationality: "Portugal" },
{ tag: "LM", number: 12, name: "Malick Diouf", flag: "", nationality: "Senegal" },
{ tag: "AM", number: 20, name: "Jarrod Bowen", flag: "", nationality: "England", captain: true },
{ tag: "AM", number: 7, name: "Crysencio Summerville", flag: "", nationality: "Netherlands" },
{ tag: "CF", number: 11, name: "Taty Castellanos", flag: "", nationality: "Argentina" },
      ],
      away: [
        { tag: "GK", number: 1, name: "David Raya", flag: "", nationality: "Spain" },
{ tag: "RB", number: 4, name: "Ben White", flag: "", nationality: "England" },
{ tag: "CB", number: 2, name: "William Saliba", flag: "", nationality: "France" },
{ tag: "CB", number: 6, name: "Gabriel Magalhaes", flag: "", nationality: "Brazil" },
{ tag: "LB", number: 33, name: "Riccardo Calafiori", flag: "", nationality: "Italy" },
{ tag: "CM", number: 41, name: "Declan Rice", flag: "", nationality: "England" },
{ tag: "CM", number: 49, name: "Myles Lewis-Skelly", flag: "", nationality: "England" },
{ tag: "RW", number: 7, name: "Bukayo Saka", flag: "", nationality: "England", captain: true },
{ tag: "AM", number: 10, name: "Eberechi Eze", flag: "", nationality: "England" },
{ tag: "LW", number: 19, name: "Leandro Trossard", flag: "", nationality: "Belgium" },
{ tag: "CF", number: 14, name: "Viktor Gyokeres", flag: "", nationality: "Sweden" },
      ],
    },
  },
  {
    id: "epl_mw36_tot_lee",
    leagueId: "epl",
    matchday: "MW 36",
    status: "FT",
    time: "Tuesday 12 May",
    stadium: "Tottenham Hotspur Stadium",
    homeTeamId: "epl_tottenham",
    awayTeamId: "epl_leeds",
    score: [1, 1],
    scorers: [],
   goalEvents: [
{ minute: 50, side: "home", scorer: "Mathys Tel", assist: null },
{ minute: 74, side: "away", scorer: "Dominic Calvert-Lewin", assist: null, type: "Penalty" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "3-4-2-1"],
    lineups: {
      home: [
        { tag: "GK", number: 31, name: "Antonin Kinsky", flag: "", nationality: "Czech Republic" },
        { tag: "RB", number: 23, name: "Pedro Porro", flag: "", nationality: "Spain" },
        { tag: "CB", number: 4, name: "Kevin Danso", flag: "", nationality: "Austria" },
{ tag: "CB", number: 37, name: "Micky Van De Ven", flag: "", nationality: "Netherlands", captain: true },
{ tag: "LB", number: 13, name: "Destiny Udogie", flag: "", nationality: "Italy" },
{ tag: "CM", number: 6, name: "Joao Palhinha", flag: "", nationality: "Portugal" },
{ tag: "CM", number: 30, name: "Rodrigo Bentancur", flag: "", nationality: "Uruguay" },
{ tag: "RW", number: 39, name: "Randal Kolo Muani", flag: "", nationality: "France" },
{ tag: "AM", number: 22, name: "Conor Gallagher", flag: "", nationality: "England" },
{ tag: "LW", number: 11, name: "Mathys Tel", flag: "", nationality: "France" },
{ tag: "CF", number: 9, name: "Richarlison", flag: "", nationality: "Brazil" },
      ],
      away: [
        { tag: "GK", number: 26, name: "Karl Darlow", flag: "", nationality: "Wales" },
{ tag: "CB", number: 6, name: "Joe Rodon", flag: "", nationality: "Wales" },
{ tag: "CB", number: 15, name: "Jaka Bijol", flag: "", nationality: "Slovenia" },
{ tag: "CB", number: 5, name: "Pascal Struijk", flag: "", nationality: "Netherlands" },
{ tag: "RM", number: 7, name: "Daniel James", flag: "", nationality: "Wales" },
{ tag: "CM", number: 4, name: "Ethan Ampadu", flag: "", nationality: "Wales", captain: true },
{ tag: "CM", number: 22, name: "Ao Tanaka", flag: "", nationality: "Japan" },
{ tag: "LM", number: 24, name: "James Justin", flag: "", nationality: "England" },
{ tag: "AM", number: 18, name: "Anton Stach", flag: "", nationality: "Germany" },
{ tag: "AM", number: 11, name: "Brenden Aaronson", flag: "", nationality: "USA" },
{ tag: "CF", number: 9, name: "Dominic Calvert-Lewin", flag: "", nationality: "England" },
      ],
    },
  },
  {
    id: "laliga_mw36_lev_osa",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Ciudad de Valencia",
    homeTeamId: "laliga_levante",
    awayTeamId: "laliga_osasuna",
    score: [3, 2],
    scorers: [],
    goalEvents: [
      { minute: 3, side: "away", scorer: "Jeremy Toljan", assist: null, type: "Own Goal" },
      { minute: 11, side: "away", scorer: "Ante Budimir", assist: "Abel Bretones" },
      { minute: 35, side: "home", scorer: "Victor Garcia", assist: "Pablo Martinez" },
      { minute: 37, side: "home", scorer: "Victor Garcia", assist: "Oriol Rey" },
      { minute: 90, side: "home", scorer: "Etta Eyong", assist: "Alan Matturro" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Mathew Ryan", flag: "", nationality: "Australia" },
        { tag: "RB", number: 22, name: "Jeremy Toljan", flag: "", nationality: "Germany" },
        { tag: "CB", number: 4, name: "Adrian Dela", flag: "", nationality: "Spain" },
        { tag: "CB", number: 2, name: "Matias Moreno", flag: "", nationality: "Argentina" },
        { tag: "LB", number: 23, name: "Manu Sanchez", flag: "", nationality: "Spain" },
        { tag: "CM", number: 20, name: "Oriol Rey", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Jon Olasagasti", flag: "", nationality: "Spain" },
        { tag: "RW", number: 26, name: "Kareem Tunde", flag: "", nationality: "Spain" },
        { tag: "AM", number: 10, name: "Pablo Martinez", flag: "", nationality: "Spain", captain: true },
        { tag: "LW", number: 17, name: "Victor Garcia", flag: "", nationality: "Spain" },
        { tag: "CF", number: 19, name: "Carlos Espi", flag: "", nationality: "Spain" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Sergio Herrera", flag: "", nationality: "Spain" },
        { tag: "RB", number: 19, name: "Valentin Rosier", flag: "", nationality: "France" },
        { tag: "CB", number: 24, name: "Alejandro Catena", flag: "", nationality: "Spain" },
        { tag: "CB", number: 22, name: "Enzo Boyomo", flag: "", nationality: "Cameroon" },
        { tag: "LB", number: 23, name: "Abel Bretones", flag: "", nationality: "Spain" },
        { tag: "CM", number: 7, name: "Jon Moncayola", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Iker Munoz", flag: "", nationality: "Spain" },
        { tag: "RW", number: 14, name: "Ruben Garcia", flag: "", nationality: "Spain", captain: true },
        { tag: "AM", number: 10, name: "Aimar Oroz", flag: "", nationality: "Spain" },
        { tag: "LW", number: 18, name: "Raul Moro", flag: "", nationality: "Spain" },
        { tag: "CF", number: 17, name: "Ante Budimir", flag: "", nationality: "Croatia" },
      ],
    },
  },
  {
    id: "laliga_mw36_elc_ala",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Estadio Martinez Valero",
    homeTeamId: "laliga_elche",
    awayTeamId: "laliga_alaves",
    score: [1, 1],
    scorers: [],
    goalEvents: [
      { minute: 51, side: "away", scorer: "Toni Martinez", assist: null, type: "Penalty" },
      { minute: 72, side: "home", scorer: "Alvaro Rodriguez", assist: "Josan" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["3-5-2", "5-3-2"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Matias Dituro", flag: "", nationality: "Argentina" },
        { tag: "CB", number: 23, name: "Victor Chust", flag: "", nationality: "Spain" },
        { tag: "CB", number: 22, name: "David Affengruber", flag: "", nationality: "Austria" },
        { tag: "CB", number: 6, name: "Pedro Bigas", flag: "", nationality: "Spain", captain: true },
        { tag: "RM", number: 15, name: "Tete Morente", flag: "", nationality: "Spain" },
        { tag: "CM", number: 12, name: "Gonzalo Villar", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Marc Aguado", flag: "", nationality: "Spain" },
        { tag: "CM", number: 14, name: "Aleix Febas", flag: "", nationality: "Spain" },
        { tag: "LM", number: 11, name: "German Valera", flag: "", nationality: "Spain" },
        { tag: "CF", number: 20, name: "Alvaro Rodriguez", flag: "", nationality: "Uruguay" },
        { tag: "CF", number: 9, name: "Andre Silva", flag: "", nationality: "Portugal" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Antonio Sivera", flag: "", nationality: "Spain" },
        { tag: "RB", number: 7, name: "Angel Perez", flag: "", nationality: "Spain" },
        { tag: "CB", number: 17, name: "Jonny Otto", flag: "", nationality: "Spain" },
        { tag: "CB", number: 14, name: "Nahuel Tenaglia", flag: "", nationality: "Argentina" },
        { tag: "CB", number: 24, name: "Victor Parada", flag: "", nationality: "Spain" },
        { tag: "LB", number: 21, name: "Abde Rebbach", flag: "", nationality: "Algeria" },
        { tag: "CM", number: 19, name: "Pablo Ibanez", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Antonio Blanco", flag: "", nationality: "Spain", captain: true },
        { tag: "CM", number: 18, name: "Jon Guridi", flag: "", nationality: "Spain" },
        { tag: "CF", number: 11, name: "Toni Martinez", flag: "", nationality: "Spain" },
        { tag: "CF", number: 22, name: "Ibrahim Diabate", flag: "", nationality: "Ivory Coast" },
      ],
    },
  },
  {
    id: "laliga_mw36_sev_esp",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Ramon Sanchez Pizjuan",
    homeTeamId: "laliga_sevilla",
    awayTeamId: "laliga_espanyol",
    score: [2, 1],
    scorers: [],
    goalEvents: [
      { minute: 56, side: "away", scorer: "Tyrhys Dolan", assist: "Roberto Fernandez" },
      { minute: 82, side: "home", scorer: "Andres Lopez", assist: "Djibril Sow" },
      { minute: 90+1, side: "home", scorer: "Akor Adams", assist: "Alexis Sanchez" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-4-2", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Odysseas Vlachodimos", flag: "", nationality: "Greece" },
        { tag: "RB", number: 2, name: "Jose Carmona", flag: "", nationality: "Spain" },
        { tag: "CB", number: 32, name: "Andres Lopez", flag: "", nationality: "Spain" },
        { tag: "CB", number: 4, name: "Kike Salas", flag: "", nationality: "Spain" },
        { tag: "LB", number: 12, name: "Gabriel Suazo", flag: "", nationality: "Chile" },
        { tag: "RM", number: 11, name: "Ruben Vargas", flag: "", nationality: "Switzerland" },
        { tag: "CM", number: 18, name: "Lucien Agoume", flag: "", nationality: "France" },
        { tag: "CM", number: 6, name: "Nemanja Gudelj", flag: "", nationality: "Serbia", captain: true },
        { tag: "LM", number: 21, name: "Chidera Ejuke", flag: "", nationality: "Nigeria" },
        { tag: "CF", number: 17, name: "Neal Maupay", flag: "", nationality: "France" },
        { tag: "CF", number: 7, name: "Isaac Romero", flag: "", nationality: "Spain" },
      ],
      away: [
        { tag: "GK", number: 13, name: "Marko Dmitrovic", flag: "", nationality: "Serbia" },
        { tag: "RB", number: 23, name: "Omar El Hilali", flag: "", nationality: "Morocco" },
        { tag: "CB", number: 5, name: "Fernando Calero", flag: "", nationality: "Spain" },
        { tag: "CB", number: 6, name: "Leandro Cabrera", flag: "", nationality: "Uruguay", captain: true },
        { tag: "LB", number: 22, name: "Carlos Romero", flag: "", nationality: "Spain" },
        { tag: "CM", number: 4, name: "Urko Gonzalez", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Edu Exposito", flag: "", nationality: "Spain" },
        { tag: "RW", number: 2, name: "Ruben Sanchez", flag: "", nationality: "Spain" },
        { tag: "AM", number: 14, name: "Ramon Terrats", flag: "", nationality: "Spain" },
        { tag: "LW", number: 24, name: "Tyrhys Dolan", flag: "", nationality: "England" },
        { tag: "CF", number: 9, name: "Roberto Fernandez", flag: "", nationality: "Spain" },
      ],
    },
  },
  {
    id: "laliga_mw36_ama_cvi",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Metropolitano Stadium",
    homeTeamId: "laliga_atletico_madrid",
    awayTeamId: "laliga_celta_vigo",
    score: [0, 1],
    scorers: [],
    goalEvents: [{ minute: 62, side: "away", scorer: "Borja Iglesias", assist: "Williot Swedberg" }],
    possession: [],
    momentum: 0.58,
    formation: ["4-4-2", "3-4-2-1"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Jan Oblak", flag: "", nationality: "Slovenia" },
        { tag: "RB", number: 18, name: "Marc Pubill", flag: "", nationality: "Spain" },
        { tag: "CB", number: 2, name: "Jose Gimenez", flag: "", nationality: "Uruguay" },
        { tag: "CB", number: 17, name: "David Hancko", flag: "", nationality: "Slovakia" },
        { tag: "LB", number: 3, name: "Matteo Ruggeri", flag: "", nationality: "Italy" },
        { tag: "RM", number: 14, name: "Marcos Llorente", flag: "", nationality: "Spain" },
        { tag: "CM", number: 6, name: "Koke", flag: "", nationality: "Spain", captain: true },
        { tag: "CM", number: 10, name: "Alex Baena", flag: "", nationality: "Spain" },
        { tag: "LM", number: 22, name: "Ademola Lookman", flag: "", nationality: "Nigeria" },
        { tag: "CF", number: 7, name: "Antoine Griezmann", flag: "", nationality: "France" },
        { tag: "CF", number: 9, name: "Alexander Sorloth", flag: "", nationality: "Norway" },
      ],
      away: [
        { tag: "GK", number: 13, name: "Ionut Radu", flag: "", nationality: "Romania" },
        { tag: "CB", number: 32, name: "Javi Rodriguez", flag: "", nationality: "Spain" },
        { tag: "CB", number: 29, name: "Yoel Lago", flag: "", nationality: "Spain" },
        { tag: "CB", number: 20, name: "Marcos Alonso", flag: "", nationality: "Spain" },
        { tag: "RM", number: 14, name: "Alvaro Nunez", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Fer Lopez", flag: "", nationality: "Spain" },
        { tag: "CM", number: 6, name: "Ilaix Moriba", flag: "", nationality: "Guinea" },
        { tag: "LM", number: 3, name: "Oscar Mingueza", flag: "", nationality: "Spain"},
        { tag: "AM", number: 18, name: "Pablo Duran", flag: "", nationality: "Spain" },
        { tag: "AM", number: 19, name: "Williot Swedberg", flag: "", nationality: "Sweden" },
        { tag: "CF", number: 7, name: "Borja Iglesias", flag: "", nationality: "Spain", captain: true },
      ],
    },
  },
  {
    id: "laliga_mw36_rso_rbe",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Reale Arena",
    homeTeamId: "laliga_real_sociedad",
    awayTeamId: "laliga_real_betis",
    score: [2, 2],
    scorers: [],
    goalEvents: [
      { minute: 39, side: "away", scorer: "Antony", assist: "Sergi Altimira" },
      { minute: 47, side: "away", scorer: "Ez Abde", assist: null },
      { minute: 79, side: "home", scorer: "Orri Oskarsson", assist: "Sergio Gomez" },
      { minute: 90+1, side: "home", scorer: "Mikel Oyarzabal", assist: null, type: "Penalty" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-4-2", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Alex Remiro", flag: "", nationality: "Spain" },
        { tag: "RB", number: 6, name: "Aritz Elustondo", flag: "", nationality: "Spain" },
        { tag: "CB", number: 31, name: "Jon Martin", flag: "", nationality: "Spain" },
        { tag: "CB", number: 16, name: "Duje Caleta-Car", flag: "", nationality: "Croatia" },
        { tag: "LB", number: 17, name: "Sergio Gomez", flag: "", nationality: "Spain" },
        { tag: "RM", number: 14, name: "Takefusa Kubo", flag: "", nationality: "Japan" },
        { tag: "CM", number: 4, name: "Jon Gorrotxategi", flag: "", nationality: "Spain" },
        { tag: "CM", number: 18, name: "Carlos Soler", flag: "", nationality: "Spain" },
        { tag: "LM", number: 7, name: "Ander Barrenetxea", flag: "", nationality: "Spain" },
        { tag: "CF", number: 10, name: "Mikel Oyarzabal", flag: "", nationality: "Spain", captain: true },
        { tag: "CF", number: 9, name: "Orri Oskarsson", flag: "", nationality: "Iceland" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Alvaro Valles", flag: "", nationality: "Spain" },
        { tag: "RB", number: 24, name: "Aitor Ruibal", flag: "", nationality: "Spain", captain: true },
        { tag: "CB", number: 3, name: "Diego Llorente", flag: "", nationality: "Spain" },
        { tag: "CB", number: 16, name: "Valentin Gomez", flag: "", nationality: "Argentina" },
        { tag: "LB", number: 12, name: "Ricardo Rodriguez", flag: "", nationality: "Switzerland" },
        { tag: "CM", number: 6, name: "Sergi Altimira", flag: "", nationality: "Spain" },
        { tag: "CM", number: 21, name: "Marc Roca", flag: "", nationality: "Spain" },
        { tag: "RW", number: 7, name: "Antony", flag: "", nationality: "Brazil" },
        { tag: "AM", number: 8, name: "Pablo Fornals", flag: "", nationality: "Spain" },
        { tag: "LW", number: 10, name: "Ez Abde", flag: "", nationality: "Morocco" },
        { tag: "CF", number: 19, name: "Cucho Hernandez", flag: "", nationality: "Colombia" },
      ],
    },
  },
  {
    id: "laliga_mw36_mal_vil",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Estadi Mallorca Son Moix",
    homeTeamId: "laliga_mallorca",
    awayTeamId: "laliga_villarreal",
    score: [1, 1],
    scorers: [],
    goalEvents: [
      { minute: 31, side: "away", scorer: "Ayoze Perez", assist: null, type: "Penalty" },
      { minute: 45+2, side: "home", scorer: "Vedat Muriqi", assist: null },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-3-1-2", "4-4-2"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Leo Roman", flag: "", nationality: "Spain" },
        { tag: "RB", number: 2, name: "Mateu Morey", flag: "", nationality: "Spain" },
        { tag: "CB", number: 24, name: "Martin Valjent", flag: "", nationality: "Slovakia", captain: true },
        { tag: "CB", number: 5, name: "Omar Mascarell", flag: "", nationality: "Equatorial Guinea" },
        { tag: "LB", number: 22, name: "Johan Mojica", flag: "", nationality: "Colombia" },
        { tag: "CM", number: 12, name: "Samu Costa", flag: "", nationality: "Portugal" },
        { tag: "CM", number: 10, name: "Sergi Darder", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Manu Morlanes", flag: "", nationality: "Spain" },
        { tag: "AM", number: 20, name: "Pablo Torre", flag: "", nationality: "Spain" },
        { tag: "CF", number: 7, name: "Vedat Muriqi", flag: "", nationality: "Kosovo" },
        { tag: "CF", number: 15, name: "Zito Luvumbo", flag: "", nationality: "Angola" },
      ],
      away: [
        { tag: "GK", number: 25, name: "Arnau Tenas", flag: "", nationality: "Spain" },
        { tag: "RB", number: 15, name: "Santiago Mourino", flag: "", nationality: "Uruguay" },
        { tag: "CB", number: 4, name: "Rafa Marin", flag: "", nationality: "Spain" },
        { tag: "CB", number: 12, name: "Renato Veiga", flag: "", nationality: "Portugal" },
        { tag: "LB", number: 23, name: "Sergi Cardona", flag: "", nationality: "Spain" },
        { tag: "RM", number: 17, name: "Tajon Buchanan", flag: "", nationality: "Canada" },
        { tag: "CM", number: 14, name: "Santi Comesana", flag: "", nationality: "Spain", captain: true },
        { tag: "CM", number: 16, name: "Thomas Partey", flag: "", nationality: "Ghana" },
        { tag: "LM", number: 11, name: "Alfon Gonzalez", flag: "", nationality: "Spain" },
        { tag: "CF", number: 22, name: "Ayoze Perez", flag: "", nationality: "Spain" },
        { tag: "CF", number: 21, name: "Tani Oluwaseyi", flag: "", nationality: "Canada" },
      ],
    },
  },
  {
    id: "laliga_mw36_abi_val",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "San Mames",
    homeTeamId: "laliga_athletic_bilbao",
    awayTeamId: "laliga_valencia",
    score: [0, 1],
    scorers: [],
    goalEvents: [{ minute: 72, side: "away", scorer: "Umar Sadiq", assist: "Luis Rioja" }],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 1, name: "Unai Simon", flag: "", nationality: "Spain" },
        { tag: "RB", number: 2, name: "Andoni Gorosabel", flag: "", nationality: "Spain" },
        { tag: "CB", number: 5, name: "Yeray Alvarez", flag: "", nationality: "Spain", captain: true },
        { tag: "CB", number: 14, name: "Aymeric Laporte", flag: "", nationality: "Spain" },
        { tag: "LB", number: 17, name: "Yuri Berchiche", flag: "", nationality: "Spain" },
        { tag: "CM", number: 30, name: "Alejandro Rego", flag: "", nationality: "Spain" },
        { tag: "CM", number: 18, name: "Mikel Jauregizar", flag: "", nationality: "Spain" },
        { tag: "RW", number: 23, name: "Robert Navarro", flag: "", nationality: "Spain" },
        { tag: "AM", number: 8, name: "Oihan Sancet", flag: "", nationality: "Spain" },
        { tag: "LW", number: 10, name: "Nico Williams", flag: "", nationality: "Spain" },
        { tag: "CF", number: 11, name: "Gorka Guruzeta", flag: "", nationality: "Spain" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Stole Dimitrievski", flag: "", nationality: "Macedonia" },
        { tag: "RB", number: 20, name: "Renzo Saravia", flag: "", nationality: "Argentina" },
        { tag: "CB", number: 5, name: "Cesar Tarrega", flag: "", nationality: "Spain" },
        { tag: "CB", number: 24, name: "Eray Comert", flag: "", nationality: "Switzerland" },
        { tag: "LB", number: 14, name: "Jose Gaya", flag: "", nationality: "Spain", captain: true },
        { tag: "CM", number: 2, name: "Guido Rodriguez", flag: "", nationality: "Argentina" },
        { tag: "CM", number: 18, name: "Pepelu", flag: "", nationality: "Spain" },
        { tag: "RW", number: 16, name: "Diego Lopez", flag: "", nationality: "Spain" },
        { tag: "AM", number: 8, name: "Javi Guerra", flag: "", nationality: "Spain" },
        { tag: "LW", number: 11, name: "Luis Rioja", flag: "", nationality: "Spain" },
        { tag: "CF", number: 9, name: "Hugo Duro", flag: "", nationality: "Spain" },
      ],
    },
  },
  {
    id: "laliga_mw36_rov_get",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Estadio Carlos Tartiere",
    homeTeamId: "laliga_real_oviedo",
    awayTeamId: "laliga_getafe",
    score: [0, 0],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.58,
    formation: ["4-4-2", "5-3-2"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Aaron Escandell", flag: "", nationality: "Spain" },
        { tag: "RB", number: 22, name: "Nacho Vidal", flag: "", nationality: "Spain" },
        { tag: "CB", number: 2, name: "Eric Bailly", flag: "", nationality: "Ivory Coast" },
        { tag: "CB", number: 12, name: "Dani Calvo", flag: "", nationality: "Spain", captain: true },
        { tag: "LB", number: 25, name: "Javi Lopez", flag: "", nationality: "Spain" },
        { tag: "RM", number: 10, name: "Haissem Hassan", flag: "", nationality: "Egypt" },
        { tag: "CM", number: 6, name: "Kwasi Sibo", flag: "", nationality: "Ghana" },
        { tag: "CM", number: 5, name: "Alberto Reina", flag: "", nationality: "Spain" },
        { tag: "LM", number: 15, name: "Thiago Fernandez", flag: "", nationality: "Argentina" },
        { tag: "CF", number: 7, name: "Ilyas Chaira", flag: "", nationality: "Morocco" },
        { tag: "CF", number: 9, name: "Federico Vinas", flag: "", nationality: "Uruguay" },
      ],
      away: [
        { tag: "GK", number: 13, name: "David Soria", flag: "", nationality: "Spain" },
        { tag: "RB", number: 21, name: "Juan Iglesias", flag: "", nationality: "Spain" },
        { tag: "CB", number: 3, name: "Abdel Abqar", flag: "", nationality: "Morocco" },
        { tag: "CB", number: 22, name: "Domingos Duarte", flag: "", nationality: "Portugal" },
        { tag: "CB", number: 24, name: "Zaid Romero", flag: "", nationality: "Argentina" },
        { tag: "LB", number: 26, name: "Davinchi", flag: "", nationality: "Spain" },
        { tag: "CM", number: 5, name: "Luis Milla", flag: "", nationality: "Spain" },
        { tag: "CM", number: 2, name: "Djene Dakonam", flag: "", nationality: "Togo", captain: true },
        { tag: "CM", number: 8, name: "Mauro Arambarri", flag: "", nationality: "Uruguay" },
        { tag: "CF", number: 6, name: "Mario Martin", flag: "", nationality: "Spain" },
        { tag: "CF", number: 10, name: "Martin Satriano", flag: "", nationality: "Uruguay" },
      ],
    },
  },
  {
    id: "laliga_mw36_bar_rma",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Camp Nou",
    homeTeamId: "laliga_barcelona",
    awayTeamId: "laliga_real_madrid",
    score: [2, 0],
    scorers: [],
    goalEvents: [
      { minute: 9, side: "home", scorer: "Marcus Rashford", assist: null, type: "Free Kick" },
      { minute: 18, side: "home", scorer: "Ferran Torres", assist: "Dani Olmo" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-2-3-1", "4-4-2"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Joan Garcia", flag: "", nationality: "Spain" },
        { tag: "RB", number: 24, name: "Eric Garcia", flag: "", nationality: "Spain" },
        { tag: "CB", number: 5, name: "Pau Cubarsi", flag: "", nationality: "Spain" },
        { tag: "CB", number: 18, name: "Gerard Martin", flag: "", nationality: "Spain" },
        { tag: "LB", number: 2, name: "Joao Cancelo", flag: "", nationality: "Portugal" },
        { tag: "CM", number: 6, name: "Gavi", flag: "", nationality: "Spain" },
        { tag: "CM", number: 8, name: "Pedri", flag: "", nationality: "Spain", captain: true },
        { tag: "RW", number: 14, name: "Marcus Rashford", flag: "", nationality: "England" },
        { tag: "AM", number: 20, name: "Dani Olmo", flag: "", nationality: "Spain" },
        { tag: "LW", number: 16, name: "Fermin Lopez", flag: "", nationality: "Spain" },
        { tag: "CF", number: 7, name: "Ferran Torres", flag: "", nationality: "Spain" },
      ],
      away: [
        { tag: "GK", number: 1, name: "Thibaut Courtois", flag: "", nationality: "Belgium" },
        { tag: "RB", number: 12, name: "Trent Alexander-Arnold", flag: "", nationality: "England" },
        { tag: "CB", number: 17, name: "Raul Asencio", flag: "", nationality: "Spain" },
        { tag: "CB", number: 22, name: "Antonio Rudiger", flag: "", nationality: "Germany" },
        { tag: "LB", number: 20, name: "Fran Garcia", flag: "", nationality: "Spain" },
        { tag: "RM", number: 21, name: "Brahim Diaz", flag: "", nationality: "Morocco" },
        { tag: "CM", number: 14, name: "Aurelien Tchouameni", flag: "", nationality: "France" },
        { tag: "CM", number: 6, name: "Eduardo Camavinga", flag: "", nationality: "France" },
        { tag: "LM", number: 5, name: "Jude Bellingham", flag: "", nationality: "England" },
        { tag: "CF", number: 16, name: "Gonzalo Garcia", flag: "", nationality: "Spain" },
        { tag: "CF", number: 7, name: "Vinicius Jr", flag: "", nationality: "Brazil", captain: true },
      ],
    },
  },
  {
    id: "laliga_mw36_rva_gir",
    leagueId: "laliga",
    matchday: "MW 36",
    status: "FT",
    time: "Monday 11 May",
    stadium: "Estadio de Vallecas",
    homeTeamId: "laliga_rayo_vallecano",
    awayTeamId: "laliga_girona",
    score: [1, 1],
    scorers: [],
    goalEvents: [
      { minute: 86, side: "home", scorer: "Alemao", assist: "Unai Lopez" },
      { minute: 90, side: "away", scorer: "Cristhian Stuani", assist: "Viktor Tsygankov" },
    ],
    possession: [],
    momentum: 0.58,
    formation: ["4-3-3", "4-2-3-1"],
    lineups: {
      home: [
        { tag: "GK", number: 13, name: "Augusto Batalla", flag: "", nationality: "Argentina" },
        { tag: "RB", number: 2, name: "Andrei Ratiu", flag: "", nationality: "Romania" },
        { tag: "CB", number: 6, name: "Pathe Ciss", flag: "", nationality: "Senegal" },
        { tag: "CB", number: 24, name: "Florian Lejeune", flag: "", nationality: "France" },
        { tag: "LB", number: 3, name: "Pep Chavarria", flag: "", nationality: "Spain" },
        { tag: "CM", number: 4, name: "Pedro Diaz", flag: "", nationality: "Spain" },
        { tag: "CM", number: 23, name: "Oscar Valentin", flag: "", nationality: "Spain", captain: true },
        { tag: "CM", number: 17, name: "Unai Lopez", flag: "", nationality: "Spain" },
        { tag: "RW", number: 19, name: "Jorge De Frutos", flag: "", nationality: "Spain" },
        { tag: "CF", number: 10, name: "Sergio Camello", flag: "", nationality: "Spain" },
        { tag: "LW", number: 21, name: "Fran Perez", flag: "", nationality: "Spain" },
      ],
      away: [
        { tag: "GK", number: 13, name: "Paulo Gazzaniga", flag: "", nationality: "Argentina" },
        { tag: "RB", number: 4, name: "Arnau Martinez", flag: "", nationality: "Spain", captain: true },
        { tag: "CB", number: 16, name: "Alejandro Frances", flag: "", nationality: "Spain" },
        { tag: "CB", number: 12, name: "Vitor Reis", flag: "", nationality: "Brazil" },
        { tag: "LB", number: 24, name: "Alex Moreno", flag: "", nationality: "Spain" },
        { tag: "CM", number: 20, name: "Axel Witsel", flag: "", nationality: "Belgium" },
        { tag: "CM", number: 8, name: "Fran Beltran", flag: "", nationality: "Spain" },
        { tag: "RW", number: 15, name: "Viktor Tsygankov", flag: "", nationality: "Ukraine" },
        { tag: "AM", number: 11, name: "Thomas Lemar", flag: "", nationality: "France" },
        { tag: "LW", number: 3, name: "Joel Roca", flag: "", nationality: "Spain" },
        { tag: "CF", number: 18, name: "Azzedine Ounahi", flag: "", nationality: "Morocco" },
      ],
    },
  },
  {
    id: "seriea_mw36_tor_sas",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Stadio Olimpico Grande Torino",
    homeTeamId: "seriea_torino",
    awayTeamId: "seriea_sassuolo",
    score: [2, 1],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.52,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_cag_udi",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Saturday 9 May",
    stadium: "Unipol Domus",
    homeTeamId: "seriea_cagliari",
    awayTeamId: "seriea_udinese",
    score: [0, 2],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.48,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_laz_int",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Stadio Olimpico",
    homeTeamId: "seriea_lazio",
    awayTeamId: "seriea_inter",
    score: [0, 3],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.45,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_lec_juv",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Via del Mare",
    homeTeamId: "seriea_lecce",
    awayTeamId: "seriea_juve",
    score: [0, 1],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.42,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_ver_com",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Marcantonio Bentegodi",
    homeTeamId: "seriea_hellas_verona",
    awayTeamId: "seriea_como",
    score: [0, 1],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.44,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_cre_pis",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Zini",
    homeTeamId: "seriea_cremonese",
    awayTeamId: "seriea_pisa",
    score: [3, 0],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.55,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_fio_gen",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Sunday 10 May",
    stadium: "Artemio Franchi",
    homeTeamId: "seriea_fiorentina",
    awayTeamId: "seriea_genoa",
    score: [0, 0],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.5,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_par_rom",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Monday 11 May",
    stadium: "Ennio Tardini",
    homeTeamId: "seriea_parma",
    awayTeamId: "seriea_as_roma",
    score: [2, 3],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.5,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_mil_ata",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Monday 11 May",
    stadium: "San Siro",
    homeTeamId: "seriea_ac_milan",
    awayTeamId: "seriea_atalanta",
    score: [2, 3],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.52,
    formation: ["—", "—"],
  },
  {
    id: "seriea_mw36_nap_bol",
    leagueId: "seriea",
    matchday: "MW 36",
    status: "FT",
    time: "Tuesday 12 May",
    stadium: "Diego Armando Maradona",
    homeTeamId: "seriea_napoli",
    awayTeamId: "seriea_bologna",
    score: [2, 3],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.5,
    formation: ["—", "—"],
  },
];

/** Rows: [rank, clubName, points, played?, won?, drawn?, lost?, gd?, form?] */
const MINI_STANDINGS = [
  {
    leagueId: "epl",
    rows: [
      [1, "Arsenal", 79],
      [2, "Man City", 74],
      [3, "Man United", 65],
      [4, "Liverpool", 59],
      [5, "Aston Villa", 59],
      [6, "Bournemouth", 55],
      [7, "Brighton", 53],
      [8, "Brentford", 51],
      [9, "Chelsea", 49],
      [10, "Everton", 49],
    ],
  },
  {
    leagueId: "laliga",
    rows: [
      [1, "Barcelona", 91],
      [2, "Real Madrid", 80],
      [3, "Villarreal", 69],
      [4, "Atletico Madrid", 66],
      [5, "Real Betis", 57],
      [6, "Celta Vigo", 50],
      [7, "Getafe", 48],
      [8, "Real Sociedad", 45],
      [9, "Athletic Bilbao", 44],
      [10, "Rayo Vallecano", 44],
    ],
  },
  {
    leagueId: "seriea",
    rows: [
      [1, "Inter Milan", 86],
      [2, "Napoli", 73],
      [3, "AC Milan", 70],
      [4, "AS Roma", 70],
      [5, "Como", 68],
      [6, "Juventus", 68],
      [7, "Atalanta", 58],
      [8, "Bologna", 55],
      [9, "Lazio", 51],
      [10, "Udinese", 50],
    ],
  },
  {
    leagueId: "worldcup",
    rows: [
      [1, "Argentina", 0],
      [2, "France", 0],
      [3, "Brazil", 0],
      [4, "England", 0],
      [5, "Spain", 0],
      [6, "Germany", 0],
      [7, "Portugal", 0],
      [8, "Netherlands", 0],
    ],
  },
];

/** Rows: [playerName, clubShortName, goals] */
const TOP_SCORERS = [
  {
    leagueId: "epl",
    rows: [
      ["Erling Haaland", "Man City", 26],
      ["Igor Thiago", "Brentford", 22],
      ["Joao Pedro", "Chelsea", 15],
      ["Antoine Semenyo", "Man City", 15],
      ["Viktor Gyokeres", "Arsenal", 14],
    ],
  },
  {
    leagueId: "laliga",
    rows: [
      ["Kylian Mbappe", "Real Madrid", 24],
      ["Vedat Muriqi", "Mallorca", 22],
      ["Ante Budimir", "Osasuna", 17],
      ["Ferran Torres", "Barcelona", 16],
      ["Lamine Yamal", "Barcelona", 16],
    ],
  },
  {
    leagueId: "seriea",
    rows: [
      ["Lautaro Martinez", "Inter Milan", 17],
      ["Marcus Thuram", "Inter Milan", 13],
      ["Anastasios Douvikas", "Como", 13],
      ["Donyell Malen", "AS Roma", 13],
      ["Nico Paz", "Como", 12],
    ],
  },
  {
    leagueId: "worldcup",
    rows: [],
  },
];

/** Per league: { leagueId, in, out, loanReturn, loanRecall: Transfer[] } */
function emptyTransfersBlock(leagueId) {
  return { leagueId, in: [], out: [], loanReturn: [], loanRecall: [] };
}

const TRANSFER_PANELS = [
  { key: "in", label: "In", badge: "badge-green", card: "transfer-card--in", elId: "transferIn", symbol: "↓", dirClass: "in" },
  { key: "out", label: "Out", badge: "badge-blue", card: "transfer-card--out", elId: "transferOut", symbol: "↑", dirClass: "out" },
  {
    key: "loanReturn",
    label: "Loan Return",
    badge: "badge-amber",
    card: "transfer-card--loan-return",
    elId: "transferLoanReturn",
    symbol: "↩",
    dirClass: "loan-return",
  },
  {
    key: "loanRecall",
    label: "Recall",
    badge: "badge-purple",
    card: "transfer-card--loan-recall",
    elId: "transferLoanRecall",
    symbol: "↪",
    dirClass: "loan-recall",
  },
];

/** @typedef {{ id: string, player: string, club: string, otherClub: string, fee?: string, date?: string }} Transfer */
const TRANSFERS = [
  {
    leagueId: "epl",
    in: [
      {
        id: "epl_in_demo_1",
        player: "Sample Signing",
        club: "Arsenal",
        otherClub: "Real Sociedad",
        fee: "€30m",
        date: "Jun 2025",
      },
    ],
    out: [
      {
        id: "epl_out_demo_1",
        player: "Sample Exit",
        club: "Chelsea",
        otherClub: "AC Milan",
        fee: "Loan",
        date: "Jul 2025",
      },
    ],
  },
  emptyTransfersBlock("laliga"),
  emptyTransfersBlock("seriea"),
  emptyTransfersBlock("bundesliga"),
  emptyTransfersBlock("ligue1"),
  emptyTransfersBlock("msl"),
  emptyTransfersBlock("worldcup"),
];

/**
 * Demo-only data (offline).
 * Replace this with a real API or local JSON later.
 */
const TEAMS = [
  // Premier League
  { id: "epl_arsenal", leagueId: "epl", name: "Arsenal", city: "London", coach: "Mikel Arteta", colors: ["#ff4d6d", "#ffd166"], logo: "./images/premierleague/arsenal.png" },
  { id: "epl_aston_villa", leagueId: "epl", name: "Aston Villa", city: "Birmingham", coach: "Unai Emery", colors: ["#7c5cff", "#ff4d6d"], logo: "./images/premierleague/astonvilla.png" },
  { id: "epl_bournemouth", leagueId: "epl", name: "Bournemouth", city: "Bournemouth", coach: "Andoni Iraola", colors: ["#ff4d6d", "#111827"], logo: "./images/premierleague/bournemouth.png" },
  { id: "epl_brentford", leagueId: "epl", name: "Brentford", city: "London", coach: "Keith Andrews", colors: ["#ff4d6d", "#ffd166"], logo: "./images/premierleague/brentford.png" },
  { id: "epl_brighton", leagueId: "epl", name: "Brighton", city: "Brighton", coach: "Fabian Hurzeler", colors: ["#2de2e6", "#ffd166"], logo: "./images/premierleague/brighton.png" },
  { id: "epl_coventry_city", leagueId: "epl", name: "Coventry City", city: "Coventry", coach: "Frank Lampard", colors: ["#69b3e7", "#111827"], logo: "./images/premierleague/coventry_city.png" },
  { id: "epl_chelsea", leagueId: "epl", name: "Chelsea", city: "London", coach: "Calum McFarlane", colors: ["#2de2e6", "#7c5cff"], logo: "./images/premierleague/chelsea.png" },
  { id: "epl_crystal_palace", leagueId: "epl", name: "Crystal Palace", city: "London", coach: "Oliver Glasner", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/premierleague/crystalpalace.png" },
  { id: "epl_everton", leagueId: "epl", name: "Everton", city: "Liverpool", coach: "David Moyes", colors: ["#2de2e6", "#7c5cff"], logo: "./images/premierleague/everton.png" },
  { id: "epl_fulham", leagueId: "epl", name: "Fulham", city: "London", coach: "Marco Silva", colors: ["#111827", "#ffd166"], logo: "./images/premierleague/fulham.png" },
  { id: "epl_leeds", leagueId: "epl", name: "Leeds", city: "Leeds", coach: "Daniel Farke", colors: ["#ffd166", "#2de2e6"], logo: "./images/premierleague/leeds.png" },
  { id: "epl_liverpool", leagueId: "epl", name: "Liverpool", city: "Liverpool", coach: "Arne Slot", colors: ["#ff4d6d", "#ffd166"], logo: "./images/premierleague/liverpool.png" },
  { id: "epl_city", leagueId: "epl", name: "Man City", city: "Manchester", coach: "Pep Guardiola", colors: ["#2de2e6", "#7c5cff"], logo: "./images/premierleague/mancity.png" },
  { id: "epl_united", leagueId: "epl", name: "Man United", city: "Manchester", coach: "Michael Carrick", colors: ["#ff4d6d", "#111827"], logo: "./images/premierleague/manunited.png" },
  { id: "epl_newcastle", leagueId: "epl", name: "Newcastle", city: "Newcastle", coach: "Eddie Howe", colors: ["#111827", "#2de2e6"], logo: "./images/premierleague/newcastle.png" },
  { id: "epl_nottingham", leagueId: "epl", name: "Nottingham", city: "Nottingham", coach: "Vitor Pereira", colors: ["#ff4d6d", "#ffd166"], logo: "./images/premierleague/nottingham.png" },
  { id: "epl_sunderland", leagueId: "epl", name: "Sunderland", city: "Sunderland", coach: "Regis Le Bris", colors: ["#ff4d6d", "#ffd166"], logo: "./images/premierleague/sunderland.png" },
  { id: "epl_tottenham", leagueId: "epl", name: "Tottenham", city: "London", coach: "Roberto De Zerbi", colors: ["#2de2e6", "#111827"], logo: "./images/premierleague/tottenham.png" },
  { id: "epl_ipswich_town", leagueId: "epl", name: "Ipswich Town", city: "Ipswich", coach: "Kieran McKenna", colors: ["#003399", "#ffffff"], logo: "./images/premierleague/ipswich_town.png" },
  { id: "epl_hull_city", leagueId: "epl", name: "Hull City", city: "Hull", coach: "Ruben Selles", colors: ["#f5a623", "#111827"], logo: "./images/premierleague/hull_city.png" },

  // La Liga
  { id: "laliga_athletic_bilbao", leagueId: "laliga", name: "Athletic Bilbao", city: "Bilbao", coach: "Ernesto Valverde", colors: ["#ff4d6d", "#ffd166"], logo: "./images/laliga/athletic_bilbao.png" },
  { id: "laliga_atletico_madrid", leagueId: "laliga", name: "Atletico Madrid", city: "Madrid", coach: "Diego Simeone", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/laliga/atletico_madrid.png" },
  { id: "laliga_barcelona", leagueId: "laliga", name: "Barcelona", city: "Barcelona", coach: "Hansi Flick", colors: ["#ff4d6d", "#7c5cff"], logo: "./images/laliga/barcelona.png" },
  { id: "laliga_celta_vigo", leagueId: "laliga", name: "Celta Vigo", city: "Vigo", coach: "Claudio Giraldez", colors: ["#2de2e6", "#7c5cff"], logo: "./images/laliga/celta_vigo.png" },
  { id: "laliga_alaves", leagueId: "laliga", name: "Alaves", city: "Vitoria-Gasteiz", coach: "Quique Sanchez Flores", colors: ["#2de2e6", "#ffd166"], logo: "./images/laliga/alaves.png" },
  { id: "laliga_elche", leagueId: "laliga", name: "Elche", city: "Elche", coach: "Eder Sarabia", colors: ["#1fe4a5", "#ffd166"], logo: "./images/laliga/elche.png" },
  { id: "laliga_espanyol", leagueId: "laliga", name: "Espanyol", city: "Barcelona", coach: "Manolo Gonzalez", colors: ["#2de2e6", "#ffd166"], logo: "./images/laliga/espanyol.png" },
  { id: "laliga_getafe", leagueId: "laliga", name: "Getafe", city: "Getafe", coach: "Jose Bordalas", colors: ["#7c5cff", "#2de2e6"], logo: "./images/laliga/getafe.png" },
  { id: "laliga_girona", leagueId: "laliga", name: "Girona", city: "Girona", coach: "Michel", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/laliga/girona.png" },
  { id: "laliga_levante", leagueId: "laliga", name: "Levante", city: "Valencia", coach: "Luis Castro", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/laliga/levante.png" },
  { id: "laliga_mallorca", leagueId: "laliga", name: "Mallorca", city: "Palma", coach: "Martin Demichelis", colors: ["#ff4d6d", "#111827"], logo: "./images/laliga/mallorca.png" },
  { id: "laliga_osasuna", leagueId: "laliga", name: "Osasuna", city: "Pamplona", coach: "Alessio Lisci", colors: ["#ff4d6d", "#7c5cff"], logo: "./images/laliga/osasuna.png" },
  { id: "laliga_rayo_vallecano", leagueId: "laliga", name: "Rayo Vallecano", city: "Madrid", coach: "Inigo Perez", colors: ["#ffd166", "#ff4d6d"], logo: "./images/laliga/rayo_vallecano.png" },
  { id: "laliga_real_betis", leagueId: "laliga", name: "Real Betis", city: "Sevilla", coach: "Manuel Pellegrini", colors: ["#1fe4a5", "#ffd166"], logo: "./images/laliga/real_betis.png" },
  { id: "laliga_real_madrid", leagueId: "laliga", name: "Real Madrid", city: "Madrid", coach: "Alvaro Arbeloa", colors: ["#7c5cff", "#2de2e6"], logo: "./images/laliga/real_madrid.png" },
  { id: "laliga_real_oviedo", leagueId: "laliga", name: "Real Oviedo", city: "Oviedo", coach: "Guillermo Almada", colors: ["#2de2e6", "#7c5cff"], logo: "./images/laliga/real_oviedo.png" },
  { id: "laliga_real_sociedad", leagueId: "laliga", name: "Real Sociedad", city: "San Sebastián", coach: "Pellegrino Matarazzo", colors: ["#2de2e6", "#ffd166"], logo: "./images/laliga/real_sociedad.png" },
  { id: "laliga_sevilla", leagueId: "laliga", name: "Sevilla", city: "Sevilla", coach: "Luis Garcia", colors: ["#ff4d6d", "#111827"], logo: "./images/laliga/sevilla.png" },
  { id: "laliga_valencia", leagueId: "laliga", name: "Valencia", city: "Valencia", coach: "Carlos Corberan", colors: ["#111827", "#ffd166"], logo: "./images/laliga/valencia.png" },
  { id: "laliga_villarreal", leagueId: "laliga", name: "Villarreal", city: "Villarreal", coach: "Marcelino", colors: ["#ffd166", "#2de2e6"], logo: "./images/laliga/villarreal.png" },

  // Serie A
  { id: "seriea_atalanta", leagueId: "seriea", name: "Atalanta", city: "Bergamo", coach: "Raffaele Palladino", colors: ["#2de2e6", "#111827"], logo: "./images/seriea/atalanta.png" },
  { id: "seriea_bologna", leagueId: "seriea", name: "Bologna", city: "Bologna", coach: "Vincenzo Italiano", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/seriea/bologna.png" },
  { id: "seriea_cagliari", leagueId: "seriea", name: "Cagliari", city: "Cagliari", coach: "Fabio Pisacane", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/seriea/cagliari.png" },
  { id: "seriea_como", leagueId: "seriea", name: "Como", city: "Como", coach: "Cesc Fabregas", colors: ["#2de2e6", "#7c5cff"], logo: "./images/seriea/como.png" },
  { id: "seriea_cremonese", leagueId: "seriea", name: "Cremonese", city: "Cremona", coach: "Marco Giampaolo", colors: ["#ff4d6d", "#ffd166"], logo: "./images/seriea/cremonese.png" },
  { id: "seriea_fiorentina", leagueId: "seriea", name: "Fiorentina", city: "Firenze", coach: "Paolo Vanoli", colors: ["#7c5cff", "#2de2e6"], logo: "./images/seriea/fiorentina.png" },
  { id: "seriea_genoa", leagueId: "seriea", name: "Genoa", city: "Genova", coach: "Daniele De Rossi", colors: ["#ff4d6d", "#2de2e6"], logo: "./images/seriea/genoa.png" },
  { id: "seriea_hellas_verona", leagueId: "seriea", name: "Hellas Verona", city: "Verona", coach: "Paolo Sammarco", colors: ["#ffd166", "#2de2e6"], logo: "./images/seriea/hellasverona.png" },
  { id: "seriea_inter", leagueId: "seriea", name: "Inter Milan", city: "Milano", coach: "Cristian Chivu", colors: ["#2de2e6", "#1fe4a5"], logo: "./images/seriea/intermilan.png" },
  { id: "seriea_juve", leagueId: "seriea", name: "Juventus", city: "Torino", coach: "Luciano Spalletti", colors: ["#ffd166", "#7c5cff"], logo: "./images/seriea/juventus.png" },
  { id: "seriea_lazio", leagueId: "seriea", name: "Lazio", city: "Roma", coach: "Maurizio Sarri", colors: ["#2de2e6", "#ffd166"], logo: "./images/seriea/lazio.png" },
  { id: "seriea_lecce", leagueId: "seriea", name: "Lecce", city: "Lecce", coach: "Eusebio Di Francesco", colors: ["#ffd166", "#ff4d6d"], logo: "./images/seriea/lecce.png" },
  { id: "seriea_ac_milan", leagueId: "seriea", name: "AC Milan", city: "Milano", coach: "Massimiliano Allegri", colors: ["#ff4d6d", "#111827"], logo: "./images/seriea/acmilan.webp" },
  { id: "seriea_napoli", leagueId: "seriea", name: "Napoli", city: "Napoli", coach: "Antonio Conte", colors: ["#2de2e6", "#7c5cff"], logo: "./images/seriea/napoli.png" },
  { id: "seriea_parma", leagueId: "seriea", name: "Parma", city: "Parma", coach: "Carlos Cuesta", colors: ["#ffd166", "#2de2e6"], logo: "./images/seriea/parma.png" },
  { id: "seriea_pisa", leagueId: "seriea", name: "Pisa", city: "Pisa", coach: "Oscar Hiljemark", colors: ["#2de2e6", "#111827"], logo: "./images/seriea/pisa.png" },
  { id: "seriea_as_roma", leagueId: "seriea", name: "AS Roma", city: "Roma", coach: "Gian Piero Gasperini", colors: ["#ff4d6d", "#ffd166"], logo: "./images/seriea/asroma.png" },
  { id: "seriea_sassuolo", leagueId: "seriea", name: "Sassuolo", city: "Sassuolo", coach: "Fabio Grosso", colors: ["#1fe4a5", "#111827"], logo: "./images/seriea/sassuolo.png" },
  { id: "seriea_torino", leagueId: "seriea", name: "Torino", city: "Torino", coach: "Roberto D'Aversa", colors: ["#7c5cff", "#ff4d6d"], logo: "./images/seriea/torino.png" },
  { id: "seriea_udinese", leagueId: "seriea", name: "Udinese", city: "Udine", coach: "Kosta Runjaic", colors: ["#111827", "#ffd166"], logo: "./images/seriea/udinese.png" },

  // Bundesliga
  { id: "bundesliga_augsburg", leagueId: "bundesliga", name: "Augsburg", city: "Augsburg", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_bayer_leverkusen", leagueId: "bundesliga", name: "Bayer Leverkusen", city: "Leverkusen", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_bayern", leagueId: "bundesliga", name: "Bayern Munich", city: "Munich", coach: "V. Kompany", colors: ["#ff4d6d", "#ffd166"] },
  { id: "bundesliga_dortmund", leagueId: "bundesliga", name: "Borussia Dortmund", city: "Dortmund", coach: "N. Şahin", colors: ["#ffd166", "#ff4d6d"] },
  { id: "bundesliga_monchengladbach", leagueId: "bundesliga", name: "Borussia Monchengladbach", city: "Monchengladbach", coach: "—", colors: ["#1fe4a5", "#111827"] },
  { id: "bundesliga_eintracht_frankfurt", leagueId: "bundesliga", name: "Eintracht Frankfurt", city: "Frankfurt", coach: "—", colors: ["#111827", "#ff4d6d"] },
  { id: "bundesliga_freiburg", leagueId: "bundesliga", name: "Freiburg", city: "Freiburg", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_hamburg", leagueId: "bundesliga", name: "Hamburg", city: "Hamburg", coach: "—", colors: ["#2de2e6", "#111827"] },
  { id: "bundesliga_heidenheim", leagueId: "bundesliga", name: "Heidenheim", city: "Heidenheim", coach: "—", colors: ["#ff4d6d", "#2de2e6"] },
  { id: "bundesliga_hoffenheim", leagueId: "bundesliga", name: "Hoffenheim", city: "Sinsheim", coach: "—", colors: ["#2de2e6", "#7c5cff"] },
  { id: "bundesliga_koln", leagueId: "bundesliga", name: "Koln", city: "Cologne", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_mainz", leagueId: "bundesliga", name: "Mainz", city: "Mainz", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_rb_leipzig", leagueId: "bundesliga", name: "RB Leipzig", city: "Leipzig", coach: "—", colors: ["#ff4d6d", "#2de2e6"] },
  { id: "bundesliga_st_pauli", leagueId: "bundesliga", name: "St Pauli", city: "Hamburg", coach: "—", colors: ["#ffd166", "#111827"] },
  { id: "bundesliga_stuttgart", leagueId: "bundesliga", name: "Stuttgart", city: "Stuttgart", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_union_berlin", leagueId: "bundesliga", name: "Union Berlin", city: "Berlin", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "bundesliga_werder_bremen", leagueId: "bundesliga", name: "Werder Bremen", city: "Bremen", coach: "—", colors: ["#1fe4a5", "#111827"] },
  { id: "bundesliga_wolfsburg", leagueId: "bundesliga", name: "Wolfsburg", city: "Wolfsburg", coach: "—", colors: ["#1fe4a5", "#2de2e6"] },

  // Ligue 1
  { id: "ligue1_angers", leagueId: "ligue1", name: "Angers", city: "Angers", coach: "—", colors: ["#111827", "#2de2e6"] },
  { id: "ligue1_auxerre", leagueId: "ligue1", name: "Auxerre", city: "Auxerre", coach: "—", colors: ["#2de2e6", "#ffd166"] },
  { id: "ligue1_brest", leagueId: "ligue1", name: "Brest", city: "Brest", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "ligue1_le_havre", leagueId: "ligue1", name: "Le Havre", city: "Le Havre", coach: "—", colors: ["#2de2e6", "#111827"] },
  { id: "ligue1_lens", leagueId: "ligue1", name: "Lens", city: "Lens", coach: "—", colors: ["#ffd166", "#ff4d6d"] },
  { id: "ligue1_lille", leagueId: "ligue1", name: "Lille", city: "Lille", coach: "—", colors: ["#ff4d6d", "#2de2e6"] },
  { id: "ligue1_lorient", leagueId: "ligue1", name: "Lorient", city: "Lorient", coach: "—", colors: ["#ffd166", "#1fe4a5"] },
  { id: "ligue1_lyon", leagueId: "ligue1", name: "Lyon", city: "Lyon", coach: "—", colors: ["#2de2e6", "#ff4d6d"] },
  { id: "ligue1_marseille", leagueId: "ligue1", name: "Marseille", city: "Marseille", coach: "—", colors: ["#2de2e6", "#7c5cff"] },
  { id: "ligue1_metz", leagueId: "ligue1", name: "Metz", city: "Metz", coach: "—", colors: ["#7c5cff", "#ffd166"] },
  { id: "ligue1_as_monaco", leagueId: "ligue1", name: "AS Monaco", city: "Monaco", coach: "—", colors: ["#ff4d6d", "#ffd166"] },
  { id: "ligue1_nantes", leagueId: "ligue1", name: "Nantes", city: "Nantes", coach: "—", colors: ["#1fe4a5", "#ffd166"] },
  { id: "ligue1_nice", leagueId: "ligue1", name: "Nice", city: "Nice", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "ligue1_paris", leagueId: "ligue1", name: "Paris", city: "Paris", coach: "—", colors: ["#7c5cff", "#2de2e6"] },
  { id: "ligue1_psg", leagueId: "ligue1", name: "PSG", city: "Paris", coach: "—", colors: ["#7c5cff", "#ff4d6d"] },
  { id: "ligue1_rennes", leagueId: "ligue1", name: "Rennes", city: "Rennes", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "ligue1_strasbourg", leagueId: "ligue1", name: "Strasbourg", city: "Strasbourg", coach: "—", colors: ["#2de2e6", "#ffd166"] },
  { id: "ligue1_toulouse", leagueId: "ligue1", name: "Toulouse", city: "Toulouse", coach: "—", colors: ["#7c5cff", "#ff4d6d"] },

  // Malaysia Super League
  { id: "msl_dpmm", leagueId: "msl", name: "DPMM", city: "Bandar Seri Begawan", coach: "—", colors: ["#ffd166", "#111827"] },
  { id: "msl_imigresen", leagueId: "msl", name: "Imigresen", city: "—", coach: "—", colors: ["#2de2e6", "#111827"] },
  { id: "msl_johor_dt", leagueId: "msl", name: "Johor DT", city: "Johor Bahru", coach: "—", colors: ["#2de2e6", "#7c5cff"] },
  { id: "msl_kelantan_united", leagueId: "msl", name: "Kelantan United", city: "Kota Bharu", coach: "—", colors: ["#ff4d6d", "#111827"] },
  { id: "msl_kuala_lumpur", leagueId: "msl", name: "Kuala Lumpur", city: "Kuala Lumpur", coach: "—", colors: ["#ff4d6d", "#ffd166"] },
  { id: "msl_kuching_city", leagueId: "msl", name: "Kuching City", city: "Kuching", coach: "—", colors: ["#ffd166", "#2de2e6"] },
  { id: "msl_melaka", leagueId: "msl", name: "Melaka", city: "Melaka", coach: "—", colors: ["#7c5cff", "#ff4d6d"] },
  { id: "msl_negeri_sembilan", leagueId: "msl", name: "Negeri Sembilan", city: "Seremban", coach: "—", colors: ["#ff4d6d", "#2de2e6"] },
  { id: "msl_pdrm", leagueId: "msl", name: "PDRM", city: "—", coach: "—", colors: ["#111827", "#ffd166"] },
  { id: "msl_penang", leagueId: "msl", name: "Penang", city: "George Town", coach: "—", colors: ["#2de2e6", "#ffd166"] },
  { id: "msl_sabah", leagueId: "msl", name: "Sabah", city: "Kota Kinabalu", coach: "—", colors: ["#ff4d6d", "#2de2e6"] },
  { id: "msl_selangor", leagueId: "msl", name: "Selangor", city: "Shah Alam", coach: "—", colors: ["#ff4d6d", "#ffd166"] },
  { id: "msl_terengganu", leagueId: "msl", name: "Terengganu", city: "Kuala Terengganu", coach: "—", colors: ["#2de2e6", "#7c5cff"] },
];

/** @type {{ slug: string, name: string, city: string, coach: string, colors: [string, string], flag: string, nationality: string }[]} */
const WORLD_CUP_NATIONS = [
  { slug: "argentina", name: "Argentina", city: "Buenos Aires", coach: "Lionel Scaloni", colors: ["#75aadb", "#ffffff"], flag: "🇦🇷", nationality: "Argentina" },
  { slug: "australia", name: "Australia", city: "Sydney", coach: "Graham Arnold", colors: ["#ffd166", "#2de2e6"], flag: "🇦🇺", nationality: "Australia" },
  { slug: "austria", name: "Austria", city: "Vienna", coach: "Ralf Rangnick", colors: ["#ff4d6d", "#ffffff"], flag: "🇦🇹", nationality: "Austria" },
  { slug: "belgium", name: "Belgium", city: "Brussels", coach: "Domenico Tedesco", colors: ["#ffd166", "#ff4d6d"], flag: "🇧🇪", nationality: "Belgium" },
  { slug: "brazil", name: "Brazil", city: "Rio de Janeiro", coach: "Dorival Júnior", colors: ["#1fe4a5", "#ffd166"], flag: "🇧🇷", nationality: "Brazil" },
  { slug: "canada", name: "Canada", city: "Toronto", coach: "Jesse Marsch", colors: ["#ff4d6d", "#ffffff"], flag: "🇨🇦", nationality: "Canada" },
  { slug: "colombia", name: "Colombia", city: "Bogotá", coach: "Néstor Lorenzo", colors: ["#ffd166", "#2de2e6"], flag: "🇨🇴", nationality: "Colombia" },
  { slug: "croatia", name: "Croatia", city: "Zagreb", coach: "Zlatko Dalić", colors: ["#ff4d6d", "#ffffff"], flag: "🇭🇷", nationality: "Croatia" },
  { slug: "denmark", name: "Denmark", city: "Copenhagen", coach: "Brian Riemer", colors: ["#ff4d6d", "#ffffff"], flag: "🇩🇰", nationality: "Denmark" },
  { slug: "ecuador", name: "Ecuador", city: "Quito", coach: "Sebastián Beccacece", colors: ["#ffd166", "#2de2e6"], flag: "🇪🇨", nationality: "Ecuador" },
  { slug: "england", name: "England", city: "London", coach: "Thomas Tuchel", colors: ["#ffffff", "#ff4d6d"], flag: "🏴", nationality: "England" },
  { slug: "france", name: "France", city: "Paris", coach: "Didier Deschamps", colors: ["#2de2e6", "#ff4d6d"], flag: "🇫🇷", nationality: "France" },
  { slug: "germany", name: "Germany", city: "Berlin", coach: "Julian Nagelsmann", colors: ["#111827", "#ffd166"], flag: "🇩🇪", nationality: "Germany" },
  { slug: "iran", name: "Iran", city: "Tehran", coach: "Amir Ghalenoei", colors: ["#ffffff", "#ff4d6d"], flag: "🇮🇷", nationality: "Iran" },
  { slug: "italy", name: "Italy", city: "Rome", coach: "Luciano Spalletti", colors: ["#2de2e6", "#ffffff"], flag: "🇮🇹", nationality: "Italy" },
  { slug: "japan", name: "Japan", city: "Tokyo", coach: "Hajime Moriyasu", colors: ["#2de2e6", "#ffffff"], flag: "🇯🇵", nationality: "Japan" },
  { slug: "mexico", name: "Mexico", city: "Mexico City", coach: "Javier Aguirre", colors: ["#1fe4a5", "#ff4d6d"], flag: "🇲🇽", nationality: "Mexico" },
  { slug: "morocco", name: "Morocco", city: "Rabat", coach: "Walid Regragui", colors: ["#ff4d6d", "#1fe4a5"], flag: "🇲🇦", nationality: "Morocco" },
  { slug: "netherlands", name: "Netherlands", city: "Amsterdam", coach: "Ronald Koeman", colors: ["#ff4d6d", "#ffffff"], flag: "🇳🇱", nationality: "Netherlands" },
  { slug: "poland", name: "Poland", city: "Warsaw", coach: "Michał Probierz", colors: ["#ffffff", "#ff4d6d"], flag: "🇵🇱", nationality: "Poland" },
  { slug: "portugal", name: "Portugal", city: "Lisbon", coach: "Roberto Martínez", colors: ["#1fe4a5", "#ff4d6d"], flag: "🇵🇹", nationality: "Portugal" },
  { slug: "qatar", name: "Qatar", city: "Doha", coach: "Carlos Queiroz", colors: ["#7c1d2e", "#ffffff"], flag: "🇶🇦", nationality: "Qatar" },
  { slug: "saudi_arabia", name: "Saudi Arabia", city: "Riyadh", coach: "Hervé Renard", colors: ["#1fe4a5", "#ffffff"], flag: "🇸🇦", nationality: "Saudi Arabia" },
  { slug: "senegal", name: "Senegal", city: "Dakar", coach: "Pape Thiaw", colors: ["#1fe4a5", "#ffd166"], flag: "🇸🇳", nationality: "Senegal" },
  { slug: "south_korea", name: "South Korea", city: "Seoul", coach: "Hong Myung-bo", colors: ["#ff4d6d", "#2de2e6"], flag: "🇰🇷", nationality: "South Korea" },
  { slug: "spain", name: "Spain", city: "Madrid", coach: "Luis de la Fuente", colors: ["#ff4d6d", "#ffd166"], flag: "🇪🇸", nationality: "Spain" },
  { slug: "switzerland", name: "Switzerland", city: "Bern", coach: "Murat Yakin", colors: ["#ff4d6d", "#ffffff"], flag: "🇨🇭", nationality: "Switzerland" },
  { slug: "uruguay", name: "Uruguay", city: "Montevideo", coach: "Marcelo Bielsa", colors: ["#2de2e6", "#ffffff"], flag: "🇺🇾", nationality: "Uruguay" },
  { slug: "usa", name: "United States", city: "Los Angeles", coach: "Mauricio Pochettino", colors: ["#2de2e6", "#ff4d6d"], flag: "🇺🇸", nationality: "United States" },
];

function buildWorldCupGroupsSeed() {
  const groups = WORLD_CUP_GROUP_IDS.map((id) => ({ id, rows: [] }));
  WORLD_CUP_NATIONS.forEach((n, i) => {
    const g = groups[i % WORLD_CUP_GROUP_IDS.length];
    g.rows.push([g.rows.length + 1, n.name, 0]);
  });
  for (const g of groups) {
    while (g.rows.length < WORLD_CUP_GROUP_SIZE) {
      g.rows.push([g.rows.length + 1, "", 0]);
    }
  }
  return groups;
}

function miniStandingsBlock(leagueId) {
  return MINI_STANDINGS.find((x) => x.leagueId === leagueId);
}

function groupStandingsForLeague(leagueId) {
  const block = miniStandingsBlock(leagueId);
  if (!block) return [];
  if (block.groups?.length) return block.groups;
  if (leagueId === "worldcup" && block.rows?.length) {
    return migrateFlatRowsToWorldCupGroups(block.rows);
  }
  return [];
}

function migrateFlatRowsToWorldCupGroups(rows) {
  const groups = WORLD_CUP_GROUP_IDS.map((id) => ({ id, rows: [] }));
  rows.forEach(([rk, club, pts], i) => {
    const g = groups[i % WORLD_CUP_GROUP_IDS.length];
    g.rows.push([g.rows.length + 1, club, pts ?? 0]);
  });
  for (const g of groups) {
    while (g.rows.length < WORLD_CUP_GROUP_SIZE) {
      g.rows.push([g.rows.length + 1, "", 0]);
    }
  }
  return groups;
}

function sortStandingsRows(rows) {
  return [...rows]
    .filter(([, club]) => String(club ?? "").trim())
    .sort((a, b) => (Number(b[2]) || 0) - (Number(a[2]) || 0) || (Number(a[0]) || 0) - (Number(b[0]) || 0))
    .map((row, i) => [i + 1, row[1], row[2] ?? 0, ...row.slice(3)]);
}

function standingsMatchesPlayed(leagueId) {
  if (leagueId === "msl") return 22;
  if (leagueId === "bundesliga") return 34;
  if (leagueId === "worldcup") return 3;
  return 38;
}

function enrichStandingsRow(row, rank, total, leagueId) {
  const rk = Number(row[0] ?? rank) || rank;
  const club = row[1];
  const pts = Number(row[2] ?? 0) || 0;
  if (row.length >= 8 && row[3] != null && row[4] != null) {
    return [rk, club, pts, row[3], row[4], row[5], row[6], row[7], row[8]];
  }

  const played = Number(row[3]) || standingsMatchesPlayed(leagueId);
  let won = Math.min(Math.floor(pts / 3), played);
  let drawn = pts - won * 3;
  let lost = played - won - drawn;
  if (lost < 0) {
    won += lost;
    lost = 0;
    drawn = Math.max(0, played - won);
  }
  const gd =
    row[7] != null && row[7] !== ""
      ? Number(row[7])
      : Math.round((won - lost) * 1.1 + (pts - played * 1.05) * 0.25);
  return [rk, club, pts, played, won, drawn, lost, gd, row[8]];
}

function standingsZoneClass(rank, totalTeams) {
  if (rank <= 4) return "zone-champions";
  if (rank <= 6) return "zone-europa";
  if (rank === 7) return "zone-conference";
  if (totalTeams >= 10 && rank >= totalTeams - 2) return "zone-relegation";
  return "";
}

function teamForStandingClub(clubName, leagueId) {
  const name = String(clubName ?? "").trim();
  if (!name) return null;
  return TEAMS.find((t) => t.leagueId === leagueId && t.name === name) ?? null;
}

function normalizeClubKey(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Resolve a club crest for any club label (league short names, U21 sides, cross-league clubs). */
function resolveTeamByClubName(clubName, preferredLeagueId) {
  const raw = String(clubName ?? "").trim();
  if (!raw) return null;
  const candidates = [raw];
  const stripped = raw
    .replace(/\s+u\d+$/i, "")
    .replace(/\s+b$/i, "")
    .replace(/\s+ii$/i, "")
    .trim();
  if (stripped && stripped !== raw) candidates.push(stripped);

  const tryMatch = (pool) => {
    for (const c of candidates) {
      const exact = pool.find((t) => t.name === c);
      if (exact) return exact;
      const key = normalizeClubKey(c);
      if (!key) continue;
      const ci = pool.find((t) => normalizeClubKey(t.name) === key);
      if (ci) return ci;
      const partial = pool.find((t) => {
        const tk = normalizeClubKey(t.name);
        return Boolean(tk) && (key.startsWith(`${tk} `) || tk.startsWith(`${key} `));
      });
      if (partial) return partial;
    }
    return null;
  };

  if (preferredLeagueId) {
    const local = tryMatch(TEAMS.filter((t) => t.leagueId === preferredLeagueId));
    if (local) return local;
  }
  return tryMatch(TEAMS);
}

function clubCrestFromName(clubName, preferredLeagueId, classes = "squad-crest") {
  const team = resolveTeamByClubName(clubName, preferredLeagueId);
  if (team) return clubLogoHtml(team, classes);
  const label = String(clubName ?? "").trim();
  if (!label) return teamCrestHtml(null, { className: classes, size: 24 });
  return teamCrestHtml(
    { name: label, colors: ["#1e2d45", "#253d5e"] },
    { className: classes, size: 24 },
  );
}

function playerInitialsAvatarHtml(playerName, classes = "player-avatar") {
  const name = String(playerName ?? "").trim();
  const initials = name
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";
  return `<span class="${escapeHtml(classes)}" aria-hidden="true">${escapeHtml(initials || "?")}</span>`;
}

function standingsCrestHtml(team, clubName) {
  if (team?.logo) {
    return `<div class="club-cell-crest" style="background-image:url('${escapeHtml(team.logo)}')" aria-hidden="true"></div>`;
  }
  const abbr = String(clubName ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase();
  return `<div class="club-cell-crest" aria-hidden="true">${escapeHtml(abbr || "?")}</div>`;
}

function pseudoFormDots(seed) {
  const vals = ["W", "D", "L"];
  const n = Array.from(String(seed)).reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: 5 }, (_, i) => vals[(n + i * 7) % vals.length]);
}

function standingsFormDotsHtml(form, seed) {
  if (Array.isArray(form) && form.length) {
    return form
      .slice(0, 5)
      .map((v) => `<span class="form-dot ${String(v).toLowerCase()}" title="${escapeHtml(String(v))}"></span>`)
      .join("");
  }
  if (typeof form === "string" && form.trim()) {
    return form
      .trim()
      .slice(0, 5)
      .split("")
      .map((v) => `<span class="form-dot ${v.toLowerCase()}" title="${escapeHtml(v)}"></span>`)
      .join("");
  }
  return pseudoFormDots(seed)
    .map((v) => `<span class="form-dot ${v.toLowerCase()}" data-v="${v}" title="${v}"></span>`)
    .join("");
}

function standingsLeagueBadge(leagueId) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  if (!league) return "";
  const short =
    {
      epl: "EPL",
      laliga: "La Liga",
      seriea: "Serie A",
      bundesliga: "BL",
      ligue1: "L1",
      msl: "MSL",
      worldcup: "WC",
    }[leagueId] ?? league.name.slice(0, 8);
  return `<span class="standings-league-badge">${escapeHtml(short)}</span>`;
}

function standingsShortClubName(clubName) {
  const raw = String(clubName ?? "").trim();
  if (!raw) return "";
  const aliases = {
    "AFC Bournemouth": "Bournemouth",
    "Manchester United": "Man United",
    "Manchester City": "Man City",
    "Tottenham Hotspur": "Tottenham",
    "Wolverhampton Wanderers": "Wolves",
    "Nottingham Forest": "Nott'm Forest",
    "Brighton & Hove Albion": "Brighton",
    "West Ham United": "West Ham",
    "Newcastle United": "Newcastle",
    "Leicester City": "Leicester",
    "Crystal Palace": "C Palace",
    "Atletico Madrid": "Atletico",
    "Athletic Bilbao": "Athletic",
    "Real Sociedad": "Sociedad",
    "Rayo Vallecano": "Rayo",
    "Bayer Leverkusen": "Leverkusen",
    "Borussia Dortmund": "Dortmund",
    "Borussia Mönchengladbach": "Gladbach",
    "Borussia Monchengladbach": "Gladbach",
    "Eintracht Frankfurt": "Frankfurt",
    "Paris Saint-Germain": "PSG",
    "Olympique Marseille": "Marseille",
    "Olympique Lyonnais": "Lyon",
  };
  if (aliases[raw]) return aliases[raw];
  if (raw.length <= 12) return raw;
  // Drop common prefixes/suffixes that burn width without aiding recognition
  return raw
    .replace(/^AFC\s+/i, "")
    .replace(/\s+(FC|CF|SC)$/i, "")
    .trim();
}

function standingsClubCode(clubName) {
  const name = String(clubName ?? "").trim();
  if (!name) return "?";
  const known = {
    Arsenal: "ARS",
    "Man City": "MCI",
    "Man United": "MUN",
    Liverpool: "LIV",
    Chelsea: "CHE",
    Tottenham: "TOT",
    Bournemouth: "BOU",
    Brighton: "BHA",
    "Aston Villa": "AVL",
    "Crystal Palace": "CRY",
    Newcastle: "NEW",
    "West Ham": "WHU",
    Fulham: "FUL",
    Everton: "EVE",
    Brentford: "BRE",
    Wolves: "WOL",
    Nottingham: "NFO",
    Leeds: "LEE",
  };
  if (known[name]) return known[name];
  const words = name.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0] + (words[1][1] || words[0][1] || "")).toUpperCase().slice(0, 3);
  }
  return name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "?";
}

function standingsLegendHtml(showLegend, { zones } = {}) {
  if (!showLegend) return "";
  const items = [
    { key: "champions", color: "#378ADD", label: "Champions League" },
    { key: "europa", color: "#a78bfa", label: "Europa League" },
    { key: "conference", color: "#4ade80", label: "Conference League" },
    { key: "relegation", color: "#f87171", label: "Relegation" },
  ];
  const list = Array.isArray(zones) && zones.length
    ? items.filter((i) => zones.includes(i.key))
    : items;
  if (!list.length) return "";
  return `
    <div class="standings-legend" aria-label="Qualification zones">
      ${list
        .map(
          (i) =>
            `<div class="legend-item"><span class="legend-dot" style="background:${i.color}" aria-hidden="true"></span>${escapeHtml(i.label)}</div>`,
        )
        .join("")}
    </div>`;
}

/** Zones that apply to a full league table (not just the visible preview rows). */
function standingsLeagueLegendZones(leagueId, totalTeams) {
  if (leagueId === "worldcup") return ["champions"];
  const zones = ["champions", "europa", "conference"];
  if (totalTeams >= 10) zones.push("relegation");
  return zones;
}

function standingsZonesPresent(rows, totalTeams) {
  const zones = new Set();
  for (const row of rows) {
    const rk = Number(row[0]);
    const z = standingsZoneClass(rk, totalTeams);
    if (z === "zone-champions") zones.add("champions");
    else if (z === "zone-europa") zones.add("europa");
    else if (z === "zone-conference") zones.add("conference");
    else if (z === "zone-relegation") zones.add("relegation");
  }
  return [...zones];
}

function renderMiniStandingsTableHtml(rows, options = {}) {
  const {
    leagueId = "",
    emptyLabel = "No standings yet.",
    compact = false,
    title = "Standings",
    showLegend = !compact,
    limit,
    highlightClub = "",
    wrapCard = true,
    fullStats = true,
    // Compact previews default to condensed (Pos/Club/P/Pts); full tables stay expanded.
    expanded = !compact,
    fullLegend = false,
  } = typeof options === "string" ? { emptyLabel: options } : options;

  const sorted = sortStandingsRows(rows);
  const totalTeams = sorted.length;
  const list = limit ? sorted.slice(0, limit) : sorted;
  if (!list.length) {
    return `<div class="standings-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  const enriched = fullStats
    ? list.map((row, i) => enrichStandingsRow(row, i + 1, totalTeams, leagueId))
    : list;
  const showFullColumns = fullStats && enriched.some((row) => row.length >= 8);
  // Condensed = Pos / Club / P / Pts. Expanded = full W/D/L/GD (+ Form when not compact).
  const showExpandedCols = showFullColumns && expanded;
  const showPlayedOnly = showFullColumns && !expanded;

  const thead = showExpandedCols
    ? `<thead><tr>
        <th class="col-pos">#</th>
        <th class="col-club">Club</th>
        <th class="col-stat">P</th><th class="col-stat">W</th><th class="col-stat">D</th><th class="col-stat">L</th><th class="col-stat">GD</th>
        <th class="col-pts">Pts</th>
        ${compact ? "" : `<th class="col-form">Form</th>`}
      </tr></thead>`
    : showPlayedOnly
      ? `<thead><tr>
        <th class="col-pos">#</th>
        <th class="col-club">Club</th>
        <th class="col-stat col-played">P</th>
        <th class="col-pts">Pts</th>
      </tr></thead>`
      : `<thead><tr>
        <th class="col-pos">#</th>
        <th class="col-club">Club</th>
        <th class="col-pts">Pts</th>
        ${compact ? "" : `<th class="col-form">Form</th>`}
      </tr></thead>`;

  const body = enriched
    .map((row, i) => {
      const [rk, club, pts, played, won, drawn, lost, gd, form] = row;
      const team = teamForStandingClub(club, leagueId);
      const zone = standingsZoneClass(Number(rk), totalTeams);
      const highlight =
        highlightClub && String(club).trim().toLowerCase() === String(highlightClub).trim().toLowerCase()
          ? " highlight-team"
          : "";
      const stat = (v) => (v == null || v === "" ? "—" : escapeHtml(String(v)));
      const gdText = gd == null || gd === "" ? "—" : gd > 0 ? `+${gd}` : String(gd);
      const shortName = standingsShortClubName(club);
      const code = standingsClubCode(shortName || club);
      const clubCell = `
            <div class="club-cell">
              ${standingsCrestHtml(team, club)}
              <span class="club-cell-name" title="${escapeHtml(String(club))}">
                <span class="club-cell-name__full">${escapeHtml(shortName || String(club))}</span>
                <span class="club-cell-name__code">${escapeHtml(code)}</span>
              </span>
            </div>`;

      if (showExpandedCols) {
        return `
        <tr class="${zone}${highlight}">
          <td class="col-pos">${escapeHtml(String(rk))}</td>
          <td class="col-club">${clubCell}</td>
          <td class="col-stat">${stat(played)}</td>
          <td class="col-stat">${stat(won)}</td>
          <td class="col-stat">${stat(drawn)}</td>
          <td class="col-stat">${stat(lost)}</td>
          <td class="col-stat col-gd">${gdText === "—" ? "—" : escapeHtml(gdText)}</td>
          <td class="col-pts">${escapeHtml(String(pts))}</td>
          ${
            compact
              ? ""
              : `<td class="col-form"><div class="form-dots">${standingsFormDotsHtml(form, team?.id ?? club)}</div></td>`
          }
        </tr>`;
      }

      if (showPlayedOnly) {
        return `
        <tr class="${zone}${highlight}">
          <td class="col-pos">${escapeHtml(String(rk))}</td>
          <td class="col-club">${clubCell}</td>
          <td class="col-stat col-played">${stat(played)}</td>
          <td class="col-pts">${escapeHtml(String(pts))}</td>
        </tr>`;
      }

      return `
        <tr class="${zone}${highlight}">
          <td class="col-pos">${escapeHtml(String(rk))}</td>
          <td class="col-club">${clubCell}</td>
          <td class="col-pts">${escapeHtml(String(pts))}</td>
          ${
            compact
              ? ""
              : `<td class="col-form"><div class="form-dots">${standingsFormDotsHtml(form, team?.id ?? club)}</div></td>`
          }
        </tr>`;
    })
    .join("");

  const modeClass = showExpandedCols
    ? " standings-table--full standings-table--expanded"
    : showPlayedOnly
      ? " standings-table--condensed"
      : showFullColumns
        ? " standings-table--full"
        : "";

  const tableHtml = showExpandedCols
    ? `
      <div class="standings-scroll" data-standings-scroll>
        <div class="standings-table-wrap standings-table-wrap--compact standings-table-wrap--scroll">
          <table class="standings-table${modeClass}">
            ${thead}
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="standings-scroll__fade" aria-hidden="true"></div>
        <p class="standings-scroll__hint">Swipe for more →</p>
      </div>`
    : `
      <div class="standings-table-wrap${compact ? " standings-table-wrap--compact" : ""}">
        <table class="standings-table${modeClass}">
          ${thead}
          <tbody>${body}</tbody>
        </table>
      </div>`;

  const legendZones = fullLegend
    ? standingsLeagueLegendZones(leagueId, totalTeams)
    : standingsZonesPresent(enriched, totalTeams);
  const legend = standingsLegendHtml(showLegend, { zones: legendZones });

  if (!wrapCard) return `${tableHtml}${legend}`;

  return `
    <div class="standings-card${compact ? " standings-card--compact" : ""}">
      <div class="standings-header">
        <h3 class="panel-title standings-title">${escapeHtml(title)}</h3>
        ${leagueId ? standingsLeagueBadge(leagueId) : ""}
      </div>
      ${tableHtml}
      ${legend}
    </div>`;
}

function renderGroupStandingsHtml(groups, leagueId = "worldcup") {
  if (!groups?.length) {
    return "<div class='standings-empty'>No group standings configured.</div>";
  }
  return `<div class="mc-stand-groups">${groups
    .map((g) => {
      const rows = g.rows ?? [];
      const hasTeams = rows.some(([, club]) => String(club ?? "").trim());
      return `
      <section class="standings-card standings-card--compact" aria-label="Group ${escapeHtml(g.id)}">
        <div class="standings-header">
          <h3 class="panel-title standings-title">Group ${escapeHtml(g.id)}</h3>
        </div>
        ${
          hasTeams
            ? renderMiniStandingsTableHtml(rows, { leagueId, compact: true, showLegend: false, wrapCard: false })
            : `<div class="standings-empty">No teams assigned.</div>`
        }
      </section>`;
    })
    .join("")}</div>`;
}

const POS_LABEL = { GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" };

const SQUAD_POS_GROUPS = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DF", label: "Defenders" },
  { key: "MF", label: "Midfielders" },
  { key: "FW", label: "Forwards" },
];

function isUsableFlagEmoji(flag) {
  const s = String(flag ?? "").trim();
  if (!s) return false;
  // Generic black flag (🏴) often renders blank on Windows — skip unless explicitly stored.
  if (s === "\u{1F3F4}") return false;
  return true;
}

function playerFlagEmoji(p) {
  const nat = String(p?.nationality ?? "").trim();
  const stored = String(p?.flag ?? "").trim();
  if (isUsableFlagEmoji(stored)) return stored;

  const uk = flagForNationality(nat);
  if (uk) return uk;

  if (typeof NationalityFlags !== "undefined") {
    const fromLib = NationalityFlags.getFlag(nat);
    if (isUsableFlagEmoji(fromLib)) return fromLib;
  }

  return "";
}

function squadFlagHtml(p) {
  const nat = String(p?.nationality ?? "").trim();
  if (!nat) {
    return `<span class="squad-flag squad-flag--empty" aria-hidden="true">—</span>`;
  }
  const imgUrl =
    typeof NationalityFlags !== "undefined" ? NationalityFlags.getFlagImageUrl(nat, 40) : "";
  if (imgUrl) {
    const imgUrl2x =
      typeof NationalityFlags !== "undefined" ? NationalityFlags.getFlagImageUrl(nat, 80) : imgUrl;
    return `<img class="squad-flag-img" src="${escapeHtml(imgUrl)}" srcset="${escapeHtml(imgUrl2x)} 2x" width="20" height="15" alt="" loading="lazy" decoding="async" title="${escapeHtml(nat)}" />`;
  }
  return `<span class="squad-flag squad-flag--code" aria-hidden="true" title="${escapeHtml(nat)}">${escapeHtml(nat.slice(0, 3).toUpperCase())}</span>`;
}

function refreshNationalityFlagsLearn() {
  if (typeof NationalityFlags !== "undefined") {
    NationalityFlags.learnFromPlayers(PLAYERS);
  }
}

function flagForNationality(nationality) {
  if (!nationality) return null;
  const nat = String(nationality).trim().toLowerCase();

  // Use explicit Unicode tag sequences for reliability across platforms.
  const ENGLAND = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
  const SCOTLAND = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
  const WALES = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}";

  if (nat === "england") return ENGLAND;
  if (nat === "scotland") return SCOTLAND;
  if (nat === "wales") return WALES;

  // No official NI flag emoji exists; use UK flag as a practical fallback.
  if (nat === "northern ireland" || nat === "north ireland") return "🇬🇧";

  return null;
}

function makePlayer({ teamId, number, name, pos, role, flag, nationality, age, heightCm, foot }) {
  return {
    id: `${teamId}_${number}_${name.replaceAll(" ", "_")}`,
    teamId,
    number,
    name,
    pos,
    role,
    flag,
    nationality,
    age,
    heightCm,
    foot,
  };
}

function buildWorldCupSeed() {
  const teams = [];
  const players = [];
  const squadTemplate = [
    { number: 1, pos: "GK", role: "GK" },
    { number: 12, pos: "GK", role: "GK" },
    { number: 2, pos: "DF", role: "CB" },
    { number: 3, pos: "DF", role: "CB" },
    { number: 4, pos: "DF", role: "LB" },
    { number: 5, pos: "DF", role: "RB" },
    { number: 6, pos: "MF", role: "CM" },
    { number: 8, pos: "MF", role: "CM" },
    { number: 10, pos: "MF", role: "AM" },
    { number: 9, pos: "FW", role: "CF" },
    { number: 11, pos: "FW", role: "CF" },
  ];

  for (const n of WORLD_CUP_NATIONS) {
    const teamId = `worldcup_${n.slug}`;
    teams.push({
      id: teamId,
      leagueId: "worldcup",
      name: n.name,
      city: n.city,
      coach: n.coach,
      colors: n.colors,
    });
    squadTemplate.forEach((slot, i) => {
      players.push(
        makePlayer({
          teamId,
          number: slot.number,
          name: `${n.name} Player ${i + 1}`,
          pos: slot.pos,
          role: slot.role,
          flag: n.flag,
          nationality: n.nationality,
        }),
      );
    });
  }
  return { teams, players };
}

/**
 * =========================
 * SQUAD DATA TEMPLATE GUIDE
 * =========================
 *
 * - Add/edit squads inside `PLAYERS` using `makePlayer({ ... })`.
 * - **Manager** is not a player: set it on the team in `TEAMS` via `coach: "Name"`.
 *
 * Required fields per player:
 * - teamId: must match a team `id` in `TEAMS` (example: "epl_arsenal")
 * - number: shirt number (number)
 * - name: player name (string)
 * - pos: one of "GK" | "DF" | "MF" | "FW"  (used for the Position filter)
 *
 * Optional (recommended for your template):
 * - role: displayed on the card pill (examples: GK, CB, RB, LB, CM, AM, RW, LW, CF)
 * - flag: emoji flag (example: "🇪🇸")
 * - nationality: text (example: "Spain")
 *
 * Copy/paste block starter:
 *   // TEAM NAME 25/26
 *   // (Set manager in TEAMS: coach: "Manager Name")
 *   makePlayer({ teamId: "TEAM_ID_HERE", number: 1, name: "Player Name", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
 *   // ...add the rest
 */
const PLAYERS = [
  // Arsenal 25/26
  makePlayer({ teamId: "epl_arsenal", number: 1, name: "David Raya", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_arsenal", number: 13, name: "Kepa Arrizabalaga", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "epl_arsenal", number: 2, name: "William Saliba", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_arsenal", number: 3, name: "Cristhian Mosquera", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_arsenal", number: 5, name: "Piero Hincapie", pos: "DF", role: "CB", flag: "🇪🇨", nationality: "Ecuador" }),
  makePlayer({ teamId: "epl_arsenal", number: 6, name: "Gabriel Magalhaes", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_arsenal", number: 4, name: "Ben White", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_arsenal", number: 12, name: "Jurrien Timber", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_arsenal", number: 33, name: "Riccardo Calafiori", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "epl_arsenal", number: 49, name: "Myles Lewis-Skelly", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_arsenal", number: 16, name: "Christian Norgaard", pos: "MF", role: "CM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_arsenal", number: 23, name: "Mikel Merino", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_arsenal", number: 36, name: "Martin Zubimendi", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_arsenal", number: 41, name: "Declan Rice", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_arsenal", number: 8, name: "Martin Odegaard (C)", pos: "MF", role: "AM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "epl_arsenal", number: 10, name: "Eberechi Eze", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_arsenal", number: 7, name: "Bukayo Saka", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_arsenal", number: 20, name: "Noni Madueke", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_arsenal", number: 56, name: "Max Dowman", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_arsenal", number: 11, name: "Gabriel Martinelli", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_arsenal", number: 19, name: "Leandro Trossard", pos: "FW", role: "LW", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_arsenal", number: 9, name: "Gabriel Jesus", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_arsenal", number: 14, name: "Viktor Gyökeres", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_arsenal", number: 29, name: "Kai Havertz", pos: "FW", role: "CF", flag: "🇩🇪", nationality: "Germany" }),

  // Aston Villa 25/26
  makePlayer({ teamId: "epl_aston_villa", number: 23, name: "Emiliano Martinez", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_aston_villa", number: 40, name: "Marco Bizot", pos: "GK", role: "GK", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_aston_villa", number: 3, name: "Victor Lindelof", pos: "DF", role: "CB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_aston_villa", number: 4, name: "Ezri Konsa", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_aston_villa", number: 5, name: "Tyrone Mings", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_aston_villa", number: 14, name: "Pau Torres", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "epl_aston_villa", number: 2, name: "Matty Cash", pos: "DF", role: "RB", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "epl_aston_villa", number: 16, name: "Andres Garcia", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_aston_villa", number: 26, name: "Lamare Bogarde", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_aston_villa", number: 12, name: "Lucas Digne", pos: "DF", role: "LB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_aston_villa", number: 22, name: "Ian Maatsen", pos: "DF", role: "LB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_aston_villa", number: 6, name: "Ross Barkley", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_aston_villa", number: 8, name: "Youri Tielemans", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "epl_aston_villa", number: 21, name: "Douglas Luiz", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_aston_villa", number: 24, name: "Amadou Onana", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "epl_aston_villa", number: 44, name: "Boubacar Kamara", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_aston_villa", number: 9, name: "Harvey Elliott", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_aston_villa", number: 27, name: "Morgan Rogers", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_aston_villa", number: 7, name: "John McGinn (C)", pos: "FW", role: "RW", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_aston_villa", number: 31, name: "Leon Bailey", pos: "FW", role: "RW", flag: "🇯🇲", nationality: "Jamaica" }),
  makePlayer({ teamId: "epl_aston_villa", number: 47, name: "Alysson", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_aston_villa", number: 10, name: "Emiliano Buendia", pos: "FW", role: "LW", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_aston_villa", number: 19, name: "Jadon Sancho", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_aston_villa", number: 11, name: "Ollie Watkins", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_aston_villa", number: 18, name: "Tammy Abraham", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),

  // Bournemouth 25/26
  makePlayer({ teamId: "epl_bournemouth", number: 1, name: "Djordje Petrovic", pos: "GK", role: "GK", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "epl_bournemouth", number: 17, name: "Fraser Forster", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 29, name: "Christos Mandas", pos: "GK", role: "GK", flag: "🇬🇷", nationality: "Greece" }),

  makePlayer({ teamId: "epl_bournemouth", number: 5, name: "Marcos Senesi", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_bournemouth", number: 18, name: "Bafode Diakite", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_bournemouth", number: 23, name: "James Hill", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 44, name: "Veljko Milosavljevic", pos: "DF", role: "CB", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "epl_bournemouth", number: 45, name: "Matai Akinmboni", pos: "DF", role: "CB", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "epl_bournemouth", number: 15, name: "Adam Smith (C)", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 20, name: "Alex Jimenez", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "epl_bournemouth", number: 3, name: "Adrien Truffert", pos: "DF", role: "LB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_bournemouth", number: 6, name: "Julio Soler", pos: "DF", role: "LB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "epl_bournemouth", number: 4, name: "Lewis Cook", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 8, name: "Alex Scott", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 10, name: "Ryan Christie", pos: "MF", role: "CM", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_bournemouth", number: 12, name: "Tyler Adams", pos: "MF", role: "CM", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "epl_bournemouth", number: 27, name: "Alex Toth", pos: "MF", role: "CM", flag: "🇭🇺", nationality: "Hungary" }),

  makePlayer({ teamId: "epl_bournemouth", number: 19, name: "Justin Kluivert", pos: "MF", role: "AM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_bournemouth", number: 22, name: "Junior Kroupi", pos: "MF", role: "AM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_bournemouth", number: 7, name: "David Brooks", pos: "FW", role: "RW", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_bournemouth", number: 11, name: "Ben Doak", pos: "FW", role: "RW", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_bournemouth", number: 37, name: "Rayan", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_bournemouth", number: 16, name: "Marcus Tavernier", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_bournemouth", number: 21, name: "Amine Adli", pos: "FW", role: "LW", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "epl_bournemouth", number: 9, name: "Evanilson", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_bournemouth", number: 26, name: "Enes Unal", pos: "FW", role: "CF", flag: "🇹🇷", nationality: "Turkey" }),

  // Brentford 25/26
  makePlayer({ teamId: "epl_brentford", number: 1, name: "Caoimhin Kelleher", pos: "GK", role: "GK", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "epl_brentford", number: 12, name: "Hakon Valdimarsson", pos: "GK", role: "GK", flag: "🇮🇸", nationality: "Iceland" }),
  makePlayer({ teamId: "epl_brentford", number: 31, name: "Ellery Balcombe", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_brentford", number: 4, name: "Sepp Van Den Berg", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_brentford", number: 5, name: "Ethan Pinnock", pos: "DF", role: "CB", flag: "🇯🇲", nationality: "Jamaica" }),
  makePlayer({ teamId: "epl_brentford", number: 20, name: "Kristoffer Ajer", pos: "DF", role: "CB", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "epl_brentford", number: 22, name: "Nathan Collins (C)", pos: "DF", role: "CB", flag: "🇮🇪", nationality: "Ireland" }),

  makePlayer({ teamId: "epl_brentford", number: 2, name: "Aaron Hickey", pos: "DF", role: "RB", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_brentford", number: 33, name: "Michael Kayode", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "epl_brentford", number: 3, name: "Rico Henry", pos: "DF", role: "LB", flag: "🇯🇲", nationality: "Jamaica" }),
  makePlayer({ teamId: "epl_brentford", number: 23, name: "Keane Lewis Potter", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_brentford", number: 6, name: "Jordan Henderson", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brentford", number: 8, name: "Mathias Jensen", pos: "MF", role: "CM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_brentford", number: 10, name: "Josh Dasilva", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brentford", number: 18, name: "Yegor Yarmolyuk", pos: "MF", role: "CM", flag: "🇺🇦", nationality: "Ukraine" }),
  makePlayer({ teamId: "epl_brentford", number: 27, name: "Vitaly Janelt", pos: "MF", role: "CM", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "epl_brentford", number: 14, name: "Fabio Carvalho", pos: "MF", role: "AM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_brentford", number: 17, name: "Antoni Milambo", pos: "MF", role: "AM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_brentford", number: 24, name: "Mikkel Damsgaard", pos: "MF", role: "AM", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "epl_brentford", number: 19, name: "Dango Ouattara", pos: "FW", role: "RW", flag: "🇧🇫", nationality: "Burkina Faso" }),
  makePlayer({ teamId: "epl_brentford", number: 45, name: "Romelle Donovan", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_brentford", number: 7, name: "Kevin Schade", pos: "FW", role: "LW", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_brentford", number: 11, name: "Reiss Nelson", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_brentford", number: 9, name: "Igor Thiago", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_brentford", number: 47, name: "Kaye Furo", pos: "FW", role: "CF", flag: "🇧🇪", nationality: "Belgium" }),

  // Brighton 25/26
  makePlayer({ teamId: "epl_brighton", number: 1, name: "Bart Verbruggen", pos: "GK", role: "GK", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_brighton", number: 23, name: "Jason Steele", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 38, name: "Tom McGill", pos: "GK", role: "GK", flag: "🇨🇦", nationality: "Canada" }),

  makePlayer({ teamId: "epl_brighton", number: 3, name: "Igor Julio", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_brighton", number: 4, name: "Adam Webster", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 5, name: "Lewis Dunk (C)", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 6, name: "Jan Paul Van Hecke", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_brighton", number: 21, name: "Olivier Boscagli", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_brighton", number: 27, name: "Mats Wieffer", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_brighton", number: 34, name: "Joel Veltman", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_brighton", number: 24, name: "Ferdi Kadioglu", pos: "DF", role: "LB", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "epl_brighton", number: 29, name: "Maxim De Cuyper", pos: "DF", role: "LB", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_brighton", number: 17, name: "Carlos Baleba", pos: "MF", role: "CM", flag: "🇨🇲", nationality: "Cameroon" }),
  makePlayer({ teamId: "epl_brighton", number: 20, name: "James Milner", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 26, name: "Yasin Ayari", pos: "MF", role: "CM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_brighton", number: 30, name: "Pascal Gross", pos: "MF", role: "CM", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "epl_brighton", number: 13, name: "Jack Hinshelwood", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 33, name: "Matt O’Riley", pos: "MF", role: "AM", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "epl_brighton", number: 7, name: "Solly March", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_brighton", number: 11, name: "Yankuba Minteh", pos: "FW", role: "RW", flag: "🇬🇲", nationality: "Gambia" }),
  makePlayer({ teamId: "epl_brighton", number: 25, name: "Diego Gomez", pos: "FW", role: "RW", flag: "🇵🇾", nationality: "Paraguay" }),

  makePlayer({ teamId: "epl_brighton", number: 19, name: "Charalampos Kostoulas", pos: "FW", role: "LW", flag: "🇬🇷", nationality: "Greece" }),
  makePlayer({ teamId: "epl_brighton", number: 22, name: "Kaoru Mitoma", pos: "FW", role: "LW", flag: "🇯🇵", nationality: "Japan" }),

  makePlayer({ teamId: "epl_brighton", number: 9, name: "Stefanos Tzimas", pos: "FW", role: "CF", flag: "🇬🇷", nationality: "Greece" }),
  makePlayer({ teamId: "epl_brighton", number: 10, name: "Georginio Rutter", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_brighton", number: 18, name: "Danny Welbeck", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),

  // Burnley 25/26
  makePlayer({ teamId: "epl_burnley", number: 1, name: "Martin Dubravka", pos: "GK", role: "GK", flag: "🇸🇰", nationality: "Slovakia" }),
  makePlayer({ teamId: "epl_burnley", number: 13, name: "Max Weiss", pos: "GK", role: "GK", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_burnley", number: 32, name: "Vaclav Hladky", pos: "GK", role: "GK", flag: "🇨🇿", nationality: "Czech Republic" }),

  makePlayer({ teamId: "epl_burnley", number: 4, name: "Joe Worrall", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 5, name: "Maxime Esteve", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_burnley", number: 6, name: "Axel Tuanzebe", pos: "DF", role: "CB", flag: "🇨🇩", nationality: "DR Congo" }),
  makePlayer({ teamId: "epl_burnley", number: 12, name: "Bashir Humphreys", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 18, name: "Hjalmar Ekdal", pos: "DF", role: "CB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_burnley", number: 29, name: "Josh Laurent", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 36, name: "Jordan Beyer", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "epl_burnley", number: 2, name: "Kyle Walker", pos: "DF", role: "RM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 14, name: "Connor Roberts", pos: "DF", role: "RM", flag: "🏴", nationality: "Wales" }),

  makePlayer({ teamId: "epl_burnley", number: 3, name: "Quilindschy Hartman", pos: "DF", role: "LM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_burnley", number: 23, name: "Lucas Pires", pos: "DF", role: "LM", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_burnley", number: 8, name: "Lesley Ugochukwu", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_burnley", number: 16, name: "Florentino Luis", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_burnley", number: 20, name: "James Ward Prowse", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 24, name: "Josh Cullen (C)", pos: "MF", role: "CM", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "epl_burnley", number: 28, name: "Hannibal Mejbri", pos: "MF", role: "CM", flag: "🇹🇳", nationality: "Tunisia" }),

  makePlayer({ teamId: "epl_burnley", number: 10, name: "Marcus Edwards", pos: "FW", role: "RAM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_burnley", number: 17, name: "Loum Tchaouna", pos: "FW", role: "RAM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_burnley", number: 31, name: "Mike Tresor", pos: "FW", role: "RAM", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_burnley", number: 7, name: "Jacob Bruun Larsen", pos: "FW", role: "LAM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_burnley", number: 11, name: "Jaidon Anthony", pos: "FW", role: "LAM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_burnley", number: 9, name: "Lyle Foster", pos: "FW", role: "CF", flag: "🇿🇦", nationality: "South Africa" }),
  makePlayer({ teamId: "epl_burnley", number: 19, name: "Zian Flemming", pos: "FW", role: "CF", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_burnley", number: 25, name: "Zeki Amdouni", pos: "FW", role: "CF", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "epl_burnley", number: 27, name: "Armando Broja", pos: "FW", role: "CF", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "epl_burnley", number: 35, name: "Ashley Barnes", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),

  // Chelsea 25/26
  makePlayer({ teamId: "epl_chelsea", number: 1, name: "Robert Sanchez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_chelsea", number: 12, name: "Filip Jorgensen", pos: "GK", role: "GK", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_chelsea", number: 28, name: "Teddy Sharman Lowe", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 44, name: "Gabriel Slonina", pos: "GK", role: "GK", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "epl_chelsea", number: 4, name: "Tosin Adarabioyo", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 5, name: "Benoit Badiashile", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_chelsea", number: 6, name: "Levi Colwill", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 19, name: "Mamadou Sarr", pos: "DF", role: "CB", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_chelsea", number: 23, name: "Trevoh Chalobah", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 29, name: "Wesley Fofana", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_chelsea", number: 24, name: "Reece James (C)", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 27, name: "Malo Gusto", pos: "DF", role: "RB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_chelsea", number: 34, name: "Josh Acheampong", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_chelsea", number: 3, name: "Marc Cucurella", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_chelsea", number: 21, name: "Jorrel Hato", pos: "DF", role: "LB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_chelsea", number: 14, name: "Dario Essugo", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_chelsea", number: 17, name: "Andrey Santos", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_chelsea", number: 25, name: "Moises Caicedo", pos: "MF", role: "CM", flag: "🇪🇨", nationality: "Ecuador" }),
  makePlayer({ teamId: "epl_chelsea", number: 45, name: "Romeo Lavia", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_chelsea", number: 8, name: "Enzo Fernandez", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_chelsea", number: 10, name: "Cole Palmer", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_chelsea", number: 7, name: "Pedro Neto", pos: "FW", role: "RW", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_chelsea", number: 41, name: "Estevao", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_chelsea", number: 11, name: "Jamie Gittens", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 49, name: "Alejandro Garnacho", pos: "FW", role: "LW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "epl_chelsea", number: 9, name: "Liam Delap", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_chelsea", number: 20, name: "Joao Pedro", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_chelsea", number: 38, name: "Marc Guiu", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Crystal Palace 25/26
  makePlayer({ teamId: "epl_crystal_palace", number: 1, name: "Dean Henderson (C)", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 31, name: "Remi Matthews", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 44, name: "Walter Benitez", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 5, name: "Maxence Lacroix", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 8, name: "Jefferson Lerma", pos: "DF", role: "CB", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 17, name: "Nathaniel Clyne", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 23, name: "Jaydee Canvot", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 26, name: "Chris Richards", pos: "DF", role: "CB", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 34, name: "Chadi Riad", pos: "DF", role: "CB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 2, name: "Daniel Munoz", pos: "DF", role: "RM", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 55, name: "Justin Devenny", pos: "DF", role: "RM", flag: "🇬🇬", nationality: "Northern Ireland" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 58, name: "Caleb Kporha", pos: "DF", role: "RM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 3, name: "Tyrick Mitchell", pos: "DF", role: "LM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 24, name: "Borna Sosa", pos: "DF", role: "LM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 59, name: "Rio Cardines", pos: "DF", role: "LM", flag: "🇹🇹", nationality: "Trinidad and Tobago" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 18, name: "Daichi Kamada", pos: "MF", role: "CM", flag: "🇯🇵", nationality: "Japan" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 19, name: "Will Hughes", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 20, name: "Adam Wharton", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 28, name: "Cheick Doucoure", pos: "MF", role: "CM", flag: "🇲🇱", nationality: "Mali" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 42, name: "Kaden Rodney", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 7, name: "Ismaila Sarr", pos: "FW", role: "RAM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 11, name: "Brennan Johnson", pos: "FW", role: "RAM", flag: "🏴", nationality: "Wales" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 10, name: "Yeremy Pino", pos: "FW", role: "LAM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 29, name: "Evann Guessand", pos: "FW", role: "LAM", flag: "🇨🇮", nationality: "Côte d’Ivoire" }),

  makePlayer({ teamId: "epl_crystal_palace", number: 9, name: "Eddie Nketiah", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 12, name: "Christantus Uche", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 14, name: "Jean Philippe Mateta", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_crystal_palace", number: 22, name: "Jorgen Strand Larsen", pos: "FW", role: "CF", flag: "🇳🇴", nationality: "Norway" }),

  // Everton 25/26
  makePlayer({ teamId: "epl_everton", number: 1, name: "Jordan Pickford", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 12, name: "Mark Travers", pos: "GK", role: "GK", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "epl_everton", number: 31, name: "Tom King", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 5, name: "Michael Keane", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 6, name: "James Tarkowski", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 15, name: "Jake O’Brien", pos: "DF", role: "CB", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "epl_everton", number: 32, name: "Jarrad Branthwaite", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 2, name: "Nathan Patterson", pos: "DF", role: "RB", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_everton", number: 23, name: "Seamus Coleman (C)", pos: "DF", role: "RB", flag: "🇮🇪", nationality: "Ireland" }),

  makePlayer({ teamId: "epl_everton", number: 16, name: "Vitaly Mykolenko", pos: "DF", role: "LB", flag: "🇺🇦", nationality: "Ukraine" }),
  makePlayer({ teamId: "epl_everton", number: 39, name: "Adam Aznou", pos: "DF", role: "LB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "epl_everton", number: 27, name: "Idrissa Gueye", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_everton", number: 34, name: "Merlin Rohl", pos: "MF", role: "CM", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_everton", number: 37, name: "James Garner", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 42, name: "Tim Iroegbunam", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 22, name: "Kiernan Dewsbury Hall", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 24, name: "Carlos Alcaraz", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_everton", number: 45, name: "Harrison Armstrong", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 10, name: "Iliman Ndiaye", pos: "FW", role: "RW", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_everton", number: 20, name: "Tyler Dibling", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 7, name: "Dwight McNeil", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 18, name: "Jack Grealish", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_everton", number: 19, name: "Tyrique George", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_everton", number: 9, name: "Beto", pos: "FW", role: "CF", flag: "🇬🇼", nationality: "Guinea-Bissau" }),
  makePlayer({ teamId: "epl_everton", number: 11, name: "Thierno Barry", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Fulham 25/26
  makePlayer({ teamId: "epl_fulham", number: 1, name: "Bernd Leno", pos: "GK", role: "GK", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_fulham", number: 23, name: "Benjamin Lecomte", pos: "GK", role: "GK", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_fulham", number: 3, name: "Calvin Bassey", pos: "DF", role: "CB", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_fulham", number: 5, name: "Joachim Andersen", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_fulham", number: 15, name: "Jorge Cuenca", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_fulham", number: 31, name: "Issa Diop", pos: "DF", role: "CB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "epl_fulham", number: 2, name: "Kenny Tete", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_fulham", number: 21, name: "Timothy Castagne", pos: "DF", role: "RB", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_fulham", number: 30, name: "Ryan Sessegnon", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_fulham", number: 33, name: "Antonee Robinson", pos: "DF", role: "LB", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "epl_fulham", number: 6, name: "Harrison Reed", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_fulham", number: 10, name: "Tom Cairney (C)", pos: "MF", role: "CM", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_fulham", number: 16, name: "Sander Berge", pos: "MF", role: "CM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "epl_fulham", number: 17, name: "Alex Iwobi", pos: "MF", role: "CM", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_fulham", number: 20, name: "Sasa Lukic", pos: "MF", role: "CM", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "epl_fulham", number: 24, name: "Josh King", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_fulham", number: 32, name: "Emile Smith Rowe", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_fulham", number: 8, name: "Harry Wilson", pos: "FW", role: "RW", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_fulham", number: 14, name: "Oscar Bobb", pos: "FW", role: "RW", flag: "🇳🇴", nationality: "Norway" }),

  makePlayer({ teamId: "epl_fulham", number: 19, name: "Samuel Chukwueze", pos: "FW", role: "LW", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_fulham", number: 22, name: "Kevin", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_fulham", number: 7, name: "Raul Jimenez", pos: "FW", role: "CF", flag: "🇲🇽", nationality: "Mexico" }),
  makePlayer({ teamId: "epl_fulham", number: 9, name: "Rodrigo Muniz", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_fulham", number: 18, name: "Jonah Kusi Asare", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),

  // Leeds United 25/26
  makePlayer({ teamId: "epl_leeds", number: 1, name: "Lucas Perri", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_leeds", number: 16, name: "Illan Meslier", pos: "GK", role: "GK", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_leeds", number: 21, name: "Alex Cairns", pos: "GK", role: "GK", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_leeds", number: 26, name: "Karl Darlow", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_leeds", number: 5, name: "Pascal Struijk", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_leeds", number: 6, name: "Joe Rodon", pos: "DF", role: "CB", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_leeds", number: 15, name: "Jaka Bijol", pos: "DF", role: "CB", flag: "🇸🇮", nationality: "Slovenia" }),
  makePlayer({ teamId: "epl_leeds", number: 23, name: "Sebastiaan Bornauw", pos: "DF", role: "CB", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_leeds", number: 2, name: "Jayden Bogle", pos: "DF", role: "RM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_leeds", number: 24, name: "James Justin", pos: "DF", role: "RM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_leeds", number: 3, name: "Gabriel Gudmundsson", pos: "DF", role: "LM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_leeds", number: 25, name: "Sam Byram", pos: "DF", role: "LM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_leeds", number: 4, name: "Ethan Ampadu (C)", pos: "MF", role: "CM", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_leeds", number: 8, name: "Sean Longstaff", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_leeds", number: 18, name: "Anton Stach", pos: "MF", role: "CM", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_leeds", number: 22, name: "Ao Tanaka", pos: "MF", role: "CM", flag: "🇯🇵", nationality: "Japan" }),
  makePlayer({ teamId: "epl_leeds", number: 44, name: "Ilia Gruev", pos: "MF", role: "CM", flag: "🇧🇬", nationality: "Bulgaria" }),
  makePlayer({ teamId: "epl_leeds", number: 50, name: "Charlie Crew", pos: "MF", role: "CM", flag: "🏴", nationality: "Wales" }),

  makePlayer({ teamId: "epl_leeds", number: 7, name: "Daniel James", pos: "FW", role: "RAM", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_leeds", number: 11, name: "Brenden Aaronson", pos: "FW", role: "RAM", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "epl_leeds", number: 40, name: "Facundo Buonanotte", pos: "FW", role: "RAM", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "epl_leeds", number: 19, name: "Noah Okafor", pos: "FW", role: "LAM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "epl_leeds", number: 29, name: "Wilfried Gnonto", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "epl_leeds", number: 9, name: "Dominic Calvert Lewin", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_leeds", number: 10, name: "Joel Piroe", pos: "FW", role: "CF", flag: "🇸🇷", nationality: "Suriname" }),
  makePlayer({ teamId: "epl_leeds", number: 14, name: "Lukas Nmecha", pos: "FW", role: "CF", flag: "🇩🇪", nationality: "Germany" }),

  // Liverpool 25/26
  makePlayer({ teamId: "epl_liverpool", number: 1, name: "Alisson", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_liverpool", number: 25, name: "Giorgi Mamardashvili", pos: "GK", role: "GK", flag: "🇬🇪", nationality: "Georgia" }),
  makePlayer({ teamId: "epl_liverpool", number: 28, name: "Freddie Woodman", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_liverpool", number: 95, name: "Harvey Davies", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_liverpool", number: 2, name: "Joe Gomez", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_liverpool", number: 4, name: "Virgil Van Dijk (C)", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_liverpool", number: 5, name: "Ibrahima Konate", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_liverpool", number: 15, name: "Giovanni Leoni", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "epl_liverpool", number: 46, name: "Rhys Williams", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_liverpool", number: 12, name: "Conor Bradley", pos: "DF", role: "RB", flag: "🇬🇬", nationality: "Northern Ireland" }),
  makePlayer({ teamId: "epl_liverpool", number: 30, name: "Jeremie Frimpong", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_liverpool", number: 47, name: "Calvin Ramsay", pos: "DF", role: "RB", flag: "🏴", nationality: "Scotland" }),

  makePlayer({ teamId: "epl_liverpool", number: 6, name: "Milos Kerkez", pos: "DF", role: "LB", flag: "🇭🇺", nationality: "Hungary" }),
  makePlayer({ teamId: "epl_liverpool", number: 26, name: "Andrew Robertson", pos: "DF", role: "LB", flag: "🏴", nationality: "Scotland" }),

  makePlayer({ teamId: "epl_liverpool", number: 3, name: "Wataru Endo", pos: "MF", role: "CM", flag: "🇯🇵", nationality: "Japan" }),
  makePlayer({ teamId: "epl_liverpool", number: 10, name: "Alexis Mac Allister", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_liverpool", number: 17, name: "Curtis Jones", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_liverpool", number: 38, name: "Ryan Gravenberch", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_liverpool", number: 42, name: "Trey Nyoni", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_liverpool", number: 43, name: "Stefan Bajcetic", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "epl_liverpool", number: 7, name: "Florian Wirtz", pos: "MF", role: "AM", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_liverpool", number: 8, name: "Dominik Szoboszlai", pos: "MF", role: "AM", flag: "🇭🇺", nationality: "Hungary" }),

  makePlayer({ teamId: "epl_liverpool", number: 11, name: "Mohamed Salah", pos: "FW", role: "RW", flag: "🇪🇬", nationality: "Egypt" }),
  makePlayer({ teamId: "epl_liverpool", number: 14, name: "Federico Chiesa", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "epl_liverpool", number: 18, name: "Cody Gakpo", pos: "FW", role: "LW", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_liverpool", number: 73, name: "Rio Ngumoha", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_liverpool", number: 9, name: "Alexander Isak", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_liverpool", number: 22, name: "Hugo Ekitike", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Man City 25/26
  makePlayer({ teamId: "epl_city", number: 1, name: "James Trafford", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_city", number: 13, name: "Marcus Bettinelli", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_city", number: 25, name: "Gianluigi Donnarumma", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "epl_city", number: 3, name: "Ruben Dias", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_city", number: 5, name: "John Stones", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_city", number: 6, name: "Nathan Ake", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_city", number: 15, name: "Marc Guehi", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_city", number: 24, name: "Josko Gvardiol", pos: "DF", role: "CB", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "epl_city", number: 45, name: "Abdukodir Khusanov", pos: "DF", role: "CB", flag: "🇺🇿", nationality: "Uzbekistan" }),
  makePlayer({ teamId: "epl_city", number: 68, name: "Max Alleyne", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_city", number: 27, name: "Matheus Nunes", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_city", number: 82, name: "Rico Lewis", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_city", number: 21, name: "Rayan Ait Nouri", pos: "DF", role: "LB", flag: "🇩🇿", nationality: "Algeria" }),
  makePlayer({ teamId: "epl_city", number: 33, name: "Nico O’Reilly", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_city", number: 14, name: "Nico Gonzalez", pos: "MF", role: "DM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_city", number: 16, name: "Rodri", pos: "MF", role: "DM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "epl_city", number: 4, name: "Tijjani Reijnders", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_city", number: 8, name: "Mateo Kovacic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "epl_city", number: 20, name: "Bernardo Silva (C)", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_city", number: 41, name: "Sverre Nypan", pos: "MF", role: "CM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "epl_city", number: 47, name: "Phil Foden", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_city", number: 10, name: "Rayan Cherki", pos: "FW", role: "RW", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_city", number: 26, name: "Savinho", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_city", number: 11, name: "Jeremy Doku", pos: "FW", role: "LW", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "epl_city", number: 42, name: "Antoine Semenyo", pos: "FW", role: "LW", flag: "🇬🇭", nationality: "Ghana" }),

  makePlayer({ teamId: "epl_city", number: 7, name: "Omar Marmoush", pos: "FW", role: "CF", flag: "🇪🇬", nationality: "Egypt" }),
  makePlayer({ teamId: "epl_city", number: 9, name: "Erling Haaland", pos: "FW", role: "CF", flag: "🇳🇴", nationality: "Norway" }),

  // Man United 25/26
  makePlayer({ teamId: "epl_united", number: 1, name: "Altay Bayindir", pos: "GK", role: "GK", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "epl_united", number: 22, name: "Tom Heaton", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_united", number: 31, name: "Senne Lammens", pos: "GK", role: "GK", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "epl_united", number: 4, name: "Matthijs De Ligt", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_united", number: 5, name: "Harry Maguire", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_united", number: 6, name: "Lisandro Martinez", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_united", number: 15, name: "Leny Yoro", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_united", number: 26, name: "Ayden Heaven", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_united", number: 2, name: "Diogo Dalot", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_united", number: 3, name: "Noussair Mazraoui", pos: "DF", role: "RB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "epl_united", number: 12, name: "Tyrell Malacia", pos: "DF", role: "LB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_united", number: 23, name: "Luke Shaw", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_united", number: 18, name: "Casemiro", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_united", number: 25, name: "Manuel Ugarte", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "epl_united", number: 37, name: "Kobbie Mainoo", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_united", number: 7, name: "Mason Mount", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_united", number: 8, name: "Bruno Fernandes (C)", pos: "MF", role: "AM", flag: "🇵🇹", nationality: "Portugal" }),

  makePlayer({ teamId: "epl_united", number: 16, name: "Amad Diallo", pos: "FW", role: "RW", flag: "🇨🇮", nationality: "Côte d’Ivoire" }),
  makePlayer({ teamId: "epl_united", number: 19, name: "Bryan Mbeumo", pos: "FW", role: "RW", flag: "🇨🇲", nationality: "Cameroon" }),

  makePlayer({ teamId: "epl_united", number: 10, name: "Matheus Cunha", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_united", number: 13, name: "Patrick Dorgu", pos: "FW", role: "LW", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "epl_united", number: 11, name: "Joshua Zirkzee", pos: "FW", role: "CF", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_united", number: 30, name: "Benjamin Sesko", pos: "FW", role: "CF", flag: "🇸🇮", nationality: "Slovenia" }),
  makePlayer({ teamId: "epl_united", number: 32, name: "Chido Obi", pos: "FW", role: "CF", flag: "🇩🇰", nationality: "Denmark" }),

  // Newcastle 25/26
  makePlayer({ teamId: "epl_newcastle", number: 1, name: "Nick Pope", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 26, name: "John Ruddy", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 29, name: "Mark Gillespie", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 32, name: "Aaron Ramsdale", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 4, name: "Sven Botman", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_newcastle", number: 5, name: "Fabian Schar", pos: "DF", role: "CB", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "epl_newcastle", number: 12, name: "Malick Thiaw", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_newcastle", number: 33, name: "Dan Burn", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 2, name: "Kieran Trippier", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 17, name: "Emil Krafth", pos: "DF", role: "RB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_newcastle", number: 21, name: "Tino Livramento", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 3, name: "Lewis Hall", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 37, name: "Alex Murphy", pos: "DF", role: "LB", flag: "🇮🇪", nationality: "Ireland" }),

  makePlayer({ teamId: "epl_newcastle", number: 8, name: "Sandro Tonali", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "epl_newcastle", number: 67, name: "Lewis Miley", pos: "MF", role: "DM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 7, name: "Joelinton", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_newcastle", number: 28, name: "Joe Willock", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 39, name: "Bruno Guimaraes (C)", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_newcastle", number: 41, name: "Jacob Ramsey", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 20, name: "Anthony Elanga", pos: "FW", role: "RW", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "epl_newcastle", number: 23, name: "Jacob Murphy", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 10, name: "Anthony Gordon", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_newcastle", number: 11, name: "Harvey Barnes", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_newcastle", number: 9, name: "Yoane Wissa", pos: "FW", role: "CF", flag: "🇨🇩", nationality: "DR Congo" }),
  makePlayer({ teamId: "epl_newcastle", number: 18, name: "William Osula", pos: "FW", role: "CF", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_newcastle", number: 27, name: "Nick Woltemade", pos: "FW", role: "CF", flag: "🇩🇪", nationality: "Germany" }),

  // Nottingham 25/26
  makePlayer({ teamId: "epl_nottingham", number: 13, name: "John Victor", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_nottingham", number: 18, name: "Angus Gunn", pos: "GK", role: "GK", flag: "🏴", nationality: "Scotland" }),
  makePlayer({ teamId: "epl_nottingham", number: 26, name: "Matz Sels", pos: "GK", role: "GK", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "epl_nottingham", number: 27, name: "Stefan Ortega", pos: "GK", role: "GK", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "epl_nottingham", number: 4, name: "Morato", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_nottingham", number: 5, name: "Murillo", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_nottingham", number: 23, name: "Jair Cunha", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_nottingham", number: 30, name: "Willy Boly", pos: "DF", role: "CB", flag: "🇨🇮", nationality: "Côte d’Ivoire" }),
  makePlayer({ teamId: "epl_nottingham", number: 31, name: "Nikola Milenkovic", pos: "DF", role: "CB", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "epl_nottingham", number: 44, name: "Zach Abbott", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_nottingham", number: 17, name: "Eric Da Silva Moreira", pos: "DF", role: "RB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "epl_nottingham", number: 34, name: "Ola Aina", pos: "DF", role: "RB", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_nottingham", number: 37, name: "Nicolo Savona", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "epl_nottingham", number: 3, name: "Neco Williams", pos: "DF", role: "LB", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_nottingham", number: 25, name: "Luca Netz", pos: "DF", role: "LB", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "epl_nottingham", number: 6, name: "Ibrahim Sangare", pos: "MF", role: "CM", flag: "🇨🇮", nationality: "Côte d’Ivoire" }),
  makePlayer({ teamId: "epl_nottingham", number: 8, name: "Elliot Anderson", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_nottingham", number: 16, name: "Nico Dominguez", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_nottingham", number: 22, name: "Ryan Yates (C)", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_nottingham", number: 10, name: "Morgan Gibbs White", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_nottingham", number: 24, name: "James McAtee", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_nottingham", number: 21, name: "Omari Hutchinson", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_nottingham", number: 29, name: "Dilane Bakwa", pos: "FW", role: "RW", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_nottingham", number: 7, name: "Callum Hudson Odoi", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_nottingham", number: 14, name: "Dan Ndoye", pos: "FW", role: "LW", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "epl_nottingham", number: 9, name: "Taiwo Awoniyi", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_nottingham", number: 11, name: "Chris Wood", pos: "FW", role: "CF", flag: "🇳🇿", nationality: "New Zealand" }),
  makePlayer({ teamId: "epl_nottingham", number: 19, name: "Igor Jesus", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_nottingham", number: 20, name: "Lorenzo Lucca", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Sunderland 25/26
  makePlayer({ teamId: "epl_sunderland", number: 21, name: "Simon Moore", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_sunderland", number: 22, name: "Robin Roefs", pos: "GK", role: "GK", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_sunderland", number: 31, name: "Melker Ellborg", pos: "GK", role: "GK", flag: "🇸🇪", nationality: "Sweden" }),

  makePlayer({ teamId: "epl_sunderland", number: 5, name: "Dan Ballard", pos: "DF", role: "CB", flag: "🇬🇬", nationality: "Northern Ireland" }),
  makePlayer({ teamId: "epl_sunderland", number: 6, name: "Lutsharel Geertruida", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_sunderland", number: 13, name: "Luke O’Nien", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_sunderland", number: 15, name: "Omar Alderete", pos: "DF", role: "CB", flag: "🇵🇾", nationality: "Paraguay" }),

  makePlayer({ teamId: "epl_sunderland", number: 20, name: "Nordi Mukiele", pos: "DF", role: "RB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_sunderland", number: 32, name: "Trai Hume", pos: "DF", role: "RB", flag: "🇬🇬", nationality: "Northern Ireland" }),

  makePlayer({ teamId: "epl_sunderland", number: 3, name: "Dennis Cirkin", pos: "DF", role: "LB", flag: "🇱🇻", nationality: "Latvia" }),
  makePlayer({ teamId: "epl_sunderland", number: 17, name: "Reinildo Mandava", pos: "DF", role: "LB", flag: "🇲🇿", nationality: "Mozambique" }),

  makePlayer({ teamId: "epl_sunderland", number: 27, name: "Noah Sadiki", pos: "MF", role: "DM", flag: "🇨🇩", nationality: "DR Congo" }),
  makePlayer({ teamId: "epl_sunderland", number: 34, name: "Granit Xhaka (C)", pos: "MF", role: "DM", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "epl_sunderland", number: 11, name: "Chris Rigg", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_sunderland", number: 19, name: "Habib Diarra", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_sunderland", number: 28, name: "Enzo Le Fee", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_sunderland", number: 30, name: "Milan Aleksic", pos: "MF", role: "CM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "epl_sunderland", number: 46, name: "Abdoullah Ba", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_sunderland", number: 50, name: "Harrison Jones", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_sunderland", number: 7, name: "Chemsdine Talbi", pos: "FW", role: "RW", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "epl_sunderland", number: 25, name: "Bertrand Traore", pos: "FW", role: "RW", flag: "🇧🇫", nationality: "Burkina Faso" }),
  makePlayer({ teamId: "epl_sunderland", number: 37, name: "Jocelin Ta Bi", pos: "FW", role: "RW", flag: "🇨🇮", nationality: "Côte d’Ivoire" }),

  makePlayer({ teamId: "epl_sunderland", number: 10, name: "Nilson Angulo", pos: "FW", role: "LW", flag: "🇪🇨", nationality: "Ecuador" }),
  makePlayer({ teamId: "epl_sunderland", number: 14, name: "Romain Mundle", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_sunderland", number: 9, name: "Brian Brobbey", pos: "FW", role: "CF", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_sunderland", number: 12, name: "Eliezer Mayenda", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_sunderland", number: 18, name: "Wilson Isidor", pos: "FW", role: "CF", flag: "🇭🇹", nationality: "Haiti" }),
  makePlayer({ teamId: "epl_sunderland", number: 29, name: "Ahmed Abdullahi", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),

  // Tottenham 25/26
  makePlayer({ teamId: "epl_tottenham", number: 1, name: "Guglielmo Vicario", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "epl_tottenham", number: 31, name: "Antonin Kinsky", pos: "GK", role: "GK", flag: "🇨🇿", nationality: "Czech Republic" }),
  makePlayer({ teamId: "epl_tottenham", number: 40, name: "Brandon Austin", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_tottenham", number: 3, name: "Radu Dragusin", pos: "DF", role: "CB", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "epl_tottenham", number: 4, name: "Kevin Danso", pos: "DF", role: "CB", flag: "🇦🇹", nationality: "Austria" }),
  makePlayer({ teamId: "epl_tottenham", number: 17, name: "Cristian Romero (C)", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "epl_tottenham", number: 33, name: "Ben Davies", pos: "DF", role: "CB", flag: "🏴", nationality: "Wales" }),
  makePlayer({ teamId: "epl_tottenham", number: 37, name: "Micky Van De Ven", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "epl_tottenham", number: 23, name: "Pedro Porro", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_tottenham", number: 24, name: "Djed Spence", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_tottenham", number: 13, name: "Destiny Udogie", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "epl_tottenham", number: 38, name: "Souza", pos: "DF", role: "LB", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "epl_tottenham", number: 6, name: "Joao Palhinha", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_tottenham", number: 8, name: "Yves Bissouma", pos: "MF", role: "CM", flag: "🇲🇱", nationality: "Mali" }),
  makePlayer({ teamId: "epl_tottenham", number: 14, name: "Archie Gray", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_tottenham", number: 22, name: "Conor Gallagher", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_tottenham", number: 29, name: "Pape Sarr", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_tottenham", number: 30, name: "Rodrigo Bentancur", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "epl_tottenham", number: 7, name: "Xavi Simons", pos: "MF", role: "AM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_tottenham", number: 10, name: "James Maddison", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_tottenham", number: 15, name: "Lucas Bergvall", pos: "MF", role: "AM", flag: "🇸🇪", nationality: "Sweden" }),

  makePlayer({ teamId: "epl_tottenham", number: 20, name: "Mohammed Kudus", pos: "FW", role: "RW", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "epl_tottenham", number: 21, name: "Dejan Kulusevski", pos: "FW", role: "RW", flag: "🇸🇪", nationality: "Sweden" }),

  makePlayer({ teamId: "epl_tottenham", number: 11, name: "Mathys Tel", pos: "FW", role: "LW", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_tottenham", number: 28, name: "Wilson Odobert", pos: "FW", role: "LW", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_tottenham", number: 9, name: "Richarlison", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_tottenham", number: 19, name: "Dominic Solanke", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_tottenham", number: 39, name: "Randal Kolo Muani", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // West Ham 25/26
  makePlayer({ teamId: "epl_west_ham", number: 1, name: "Mads Hermansen", pos: "GK", role: "GK", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "epl_west_ham", number: 22, name: "Lukasz Fabianski", pos: "GK", role: "GK", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "epl_west_ham", number: 23, name: "Alphonse Areola", pos: "GK", role: "GK", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_west_ham", number: 3, name: "Max Kilman", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_west_ham", number: 4, name: "Axel Disasi", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_west_ham", number: 15, name: "Kostas Mavropanos", pos: "DF", role: "CB", flag: "🇬🇷", nationality: "Greece" }),
  makePlayer({ teamId: "epl_west_ham", number: 25, name: "Jean Clair Todibo", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_west_ham", number: 63, name: "Ezra Mayers", pos: "DF", role: "CB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_west_ham", number: 2, name: "Kyle Walker Peters", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_west_ham", number: 29, name: "Aaron Wan Bissaka", pos: "DF", role: "RB", flag: "🇨🇩", nationality: "DR Congo" }),

  makePlayer({ teamId: "epl_west_ham", number: 12, name: "Malick Diouf", pos: "DF", role: "LB", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "epl_west_ham", number: 30, name: "Oliver Scarles", pos: "DF", role: "LB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_west_ham", number: 18, name: "Mateus Fernandes", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_west_ham", number: 27, name: "Soungoutou Magassa", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "epl_west_ham", number: 32, name: "Freddie Potts", pos: "MF", role: "CM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_west_ham", number: 55, name: "Mohamadou Kante", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "epl_west_ham", number: 19, name: "Pablo", pos: "MF", role: "AM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_west_ham", number: 28, name: "Tomas Soucek", pos: "MF", role: "AM", flag: "🇨🇿", nationality: "Czech Republic" }),

  makePlayer({ teamId: "epl_west_ham", number: 17, name: "Adama Traore", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_west_ham", number: 20, name: "Jarrod Bowen (C)", pos: "FW", role: "RW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_west_ham", number: 7, name: "Crysencio Summerville", pos: "FW", role: "LW", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "epl_west_ham", number: 21, name: "Keiber Lamadrid", pos: "FW", role: "LW", flag: "🇻🇪", nationality: "Venezuela" }),

  makePlayer({ teamId: "epl_west_ham", number: 9, name: "Callum Wilson", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_west_ham", number: 11, name: "Taty Castellanos", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),

  // Wolves 25/26
  makePlayer({ teamId: "epl_wolves", number: 1, name: "Jose Sa", pos: "GK", role: "GK", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_wolves", number: 25, name: "Daniel Bentley", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_wolves", number: 31, name: "Sam Johnstone", pos: "GK", role: "GK", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_wolves", number: 4, name: "Santi Bueno", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "epl_wolves", number: 15, name: "Yerson Mosquera", pos: "DF", role: "CB", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "epl_wolves", number: 24, name: "Toti Gomes (C)", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_wolves", number: 37, name: "Ladislav Krejci", pos: "DF", role: "CB", flag: "🇨🇿", nationality: "Czech Republic" }),

  makePlayer({ teamId: "epl_wolves", number: 2, name: "Matt Doherty", pos: "DF", role: "RM", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "epl_wolves", number: 17, name: "Pedro Lima", pos: "DF", role: "RM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_wolves", number: 38, name: "Jackson Tchatchoua", pos: "DF", role: "RM", flag: "🇨🇲", nationality: "Cameroon" }),

  makePlayer({ teamId: "epl_wolves", number: 3, name: "Hugo Bueno", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "epl_wolves", number: 6, name: "David Moller Wolfe", pos: "DF", role: "LM", flag: "🇳🇴", nationality: "Norway" }),

  makePlayer({ teamId: "epl_wolves", number: 7, name: "Andre", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_wolves", number: 8, name: "Joao Gomes", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "epl_wolves", number: 27, name: "Jean Ricner Bellegarde", pos: "MF", role: "CM", flag: "🇭🇹", nationality: "Haiti" }),

  makePlayer({ teamId: "epl_wolves", number: 21, name: "Rodrigo Gomes", pos: "FW", role: "RAM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "epl_wolves", number: 36, name: "Mateus Mane", pos: "FW", role: "RAM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_wolves", number: 30, name: "Enso Gonzalez", pos: "FW", role: "LAM", flag: "🇵🇾", nationality: "Paraguay" }),
  makePlayer({ teamId: "epl_wolves", number: 47, name: "Angel Gomes", pos: "FW", role: "LAM", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "epl_wolves", number: 9, name: "Adam Armstrong", pos: "FW", role: "CF", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "epl_wolves", number: 11, name: "Hwang Hee Chan", pos: "FW", role: "CF", flag: "🇰🇷", nationality: "South Korea" }),
  makePlayer({ teamId: "epl_wolves", number: 14, name: "Tolu Arokodare", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "epl_wolves", number: 63, name: "Nathan Fraser", pos: "FW", role: "CF", flag: "🇮🇪", nationality: "Ireland" }),

  // Athletic Bilbao (25/26)
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 1, name: "Unai Simon", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 27, name: "Alex Padilla", pos: "GK", role: "GK", flag: "🇲🇽", nationality: "Mexico" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 3, name: "Dani Vivian", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 4, name: "Aitor Paredes", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 5, name: "Yeray Alvarez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 13, name: "Unai Egiluz", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 14, name: "Aymeric Laporte", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 2, name: "Andoni Gorosabel", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 12, name: "Jesus Areso", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 15, name: "Inigo Lekue", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 17, name: "Yuri Berchiche", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 19, name: "Adama Boiro", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 6, name: "Mikel Vesga", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 16, name: "Inigo Ruiz De Galarreta", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 18, name: "Mikel Jauregizar", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 24, name: "Benat Prados", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 30, name: "Alejandro Rego", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 44, name: "Selton Sanchez", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 8, name: "Oihan Sancet", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 20, name: "Unai Gomez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 9, name: "Inaki Williams (C)", pos: "FW", role: "RW", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 23, name: "Robert Navarro", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 7, name: "Alex Berenguer", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 10, name: "Nico Williams", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 22, name: "Nico Serrano", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_athletic_bilbao", number: 11, name: "Gorka Guruzeta", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 21, name: "Maroan Sannadi", pos: "FW", role: "CF", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_athletic_bilbao", number: 25, name: "Urko Izeta", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Atletico Madrid (25/26)
  makePlayer({ teamId: "laliga_atletico_madrid", number: 1, name: "Juan Musso", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 13, name: "Jan Oblak", pos: "GK", role: "GK", flag: "🇸🇮", nationality: "Slovenia" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 2, name: "Jose Gimenez", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 15, name: "Clement Lenglet", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 17, name: "David Hancko", pos: "DF", role: "CB", flag: "🇸🇰", nationality: "Slovakia" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 18, name: "Marc Pubill", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 24, name: "Robin Le Normand", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 14, name: "Marcos Llorente", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 16, name: "Nahuel Molina", pos: "DF", role: "RB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 3, name: "Matteo Ruggeri", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 4, name: "Rodrigo Mendoza", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 5, name: "Johnny Cardoso", pos: "MF", role: "CM", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 6, name: "Koke (C)", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 8, name: "Pablo Barrios", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 21, name: "Obed Vargas", pos: "MF", role: "CM", flag: "🇲🇽", nationality: "Mexico" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 11, name: "Thiago Almada", pos: "FW", role: "RW", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 20, name: "Giuliano Simeone", pos: "FW", role: "RW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 10, name: "Alex Baena", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 23, name: "Nico Gonzalez", pos: "FW", role: "LW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_atletico_madrid", number: 7, name: "Antoine Griezmann", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 9, name: "Alexander Sorloth", pos: "FW", role: "CF", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 19, name: "Julian Alvarez", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_atletico_madrid", number: 22, name: "Ademola Lookman", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),

  // Real Madrid (25/26)
  makePlayer({ teamId: "laliga_real_madrid", number: 1, name: "Thibaut Courtois", pos: "GK", role: "GK", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 13, name: "Andriy Lunin", pos: "GK", role: "GK", flag: "🇺🇦", nationality: "Ukraine" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 26, name: "Fran Gonzalez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 3, name: "Eder Militao", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 4, name: "David Alaba", pos: "DF", role: "CB", flag: "🇦🇹", nationality: "Austria" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 17, name: "Raul Asencio", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 22, name: "Antonio Rudiger", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 24, name: "Dean Huijsen", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 2, name: "Dani Carvajal (C)", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 12, name: "Trent Alexander Arnold", pos: "DF", role: "RB", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 18, name: "Alvaro Carreras", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 20, name: "Fran Garcia", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 23, name: "Ferland Mendy", pos: "DF", role: "LB", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 6, name: "Eduardo Camavinga", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 8, name: "Federico Valverde", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 14, name: "Aurelien Tchouameni", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 19, name: "Dani Ceballos", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 28, name: "Jorge Cestero", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 37, name: "Manuel Angel", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 45, name: "Thiago Pitarch", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 5, name: "Jude Bellingham", pos: "MF", role: "AM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 15, name: "Arda Guler", pos: "MF", role: "AM", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 38, name: "Cesar Palacios", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 21, name: "Brahim Diaz", pos: "FW", role: "RW", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 30, name: "Franco Mastantuono", pos: "FW", role: "RW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 7, name: "Vinicius Jr", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 11, name: "Rodrigo", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "laliga_real_madrid", number: 10, name: "Kylian Mbappe", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_real_madrid", number: 16, name: "Gonzalo Garcia", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Barcelona (25/26)
  makePlayer({ teamId: "laliga_barcelona", number: 13, name: "Joan Garcia", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 25, name: "Wojciech Szczesny", pos: "GK", role: "GK", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "laliga_barcelona", number: 31, name: "Diego Kochen", pos: "GK", role: "GK", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "laliga_barcelona", number: 4, name: "Ronald Araujo (C)", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_barcelona", number: 5, name: "Pau Cubarsi", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 15, name: "Andreas Christensen", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "laliga_barcelona", number: 24, name: "Eric Garcia", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_barcelona", number: 2, name: "Joao Cancelo", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_barcelona", number: 23, name: "Jules Kounde", pos: "DF", role: "RB", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "laliga_barcelona", number: 3, name: "Alejandro Balde", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 18, name: "Gerard Martin", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_barcelona", number: 6, name: "Gavi", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 8, name: "Pedri", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 17, name: "Marc Casado", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 21, name: "Frenkie De Jong", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "laliga_barcelona", number: 22, name: "Marc Bernal", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_barcelona", number: 16, name: "Fermin Lopez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 20, name: "Dani Olmo", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_barcelona", number: 10, name: "Lamine Yamal", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 19, name: "Roony Bardghji", pos: "FW", role: "RW", flag: "🇸🇪", nationality: "Sweden" }),

  makePlayer({ teamId: "laliga_barcelona", number: 11, name: "Raphinha", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_barcelona", number: 14, name: "Marcus Rashford", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "laliga_barcelona", number: 7, name: "Ferran Torres", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_barcelona", number: 9, name: "Robert Lewandowski", pos: "FW", role: "CF", flag: "🇵🇱", nationality: "Poland" }),

  // Celta Vigo (25/26) — note: Matias Vecino listed #15 in source clashed with Nunez; using #14 for Vecino.
  makePlayer({ teamId: "laliga_celta_vigo", number: 1, name: "Ivan Villar", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 13, name: "Ionut Radu", pos: "GK", role: "GK", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 25, name: "Marc Vidal", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 2, name: "Carl Starfelt", pos: "DF", role: "CB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 4, name: "Joseph Aidoo", pos: "DF", role: "CB", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 12, name: "Manu Fernandez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 20, name: "Marcos Alonso", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 24, name: "Carlos Dominguez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 29, name: "Yoel Lago", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 32, name: "Javi Rodriguez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 15, name: "Alvaro Nunez", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 17, name: "Javi Rueda", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 39, name: "Jones El Abdellaoui", pos: "DF", role: "RM", flag: "🇳🇴", nationality: "Norway" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 3, name: "Oscar Mingueza", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 5, name: "Sergio Carreira", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 21, name: "Mihailo Ristic", pos: "DF", role: "LM", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 6, name: "Ilaix Moriba", pos: "MF", role: "CM", flag: "🇬🇳", nationality: "Guinea" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 14, name: "Matias Vecino", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 16, name: "Miguel Roman", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 22, name: "Hugo Sotelo", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 8, name: "Fer Lopez", pos: "FW", role: "RAM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 9, name: "Ferran Jutgla", pos: "FW", role: "RAM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 11, name: "Franco Cervi", pos: "FW", role: "LAM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 19, name: "Williot Swedberg", pos: "FW", role: "LAM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 23, name: "Hugo Alvarez", pos: "FW", role: "LAM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_celta_vigo", number: 7, name: "Borja Iglesias", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 10, name: "Iago Aspas (C)", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_celta_vigo", number: 18, name: "Pablo Duran", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Alaves (25/26)
  makePlayer({ teamId: "laliga_alaves", number: 1, name: "Antonio Sivera (C)", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 13, name: "Raul Fernandez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_alaves", number: 5, name: "Jon Pacheco", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 16, name: "Ville Koski", pos: "DF", role: "CB", flag: "🇫🇮", nationality: "Finland" }),
  makePlayer({ teamId: "laliga_alaves", number: 24, name: "Victor Parada", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_alaves", number: 14, name: "Nahuel Tenaglia", pos: "DF", role: "RB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_alaves", number: 17, name: "Jonny Otto", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_alaves", number: 3, name: "Yusi Enriquez", pos: "DF", role: "LB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "laliga_alaves", number: 6, name: "Ander Guevara", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 8, name: "Antonio Blanco", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 19, name: "Pablo Ibanez", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 23, name: "Carlos Protesoni", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "laliga_alaves", number: 4, name: "Denis Suarez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 18, name: "Jon Guridi", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_alaves", number: 7, name: "Angel Perez", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 20, name: "Calebe", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "laliga_alaves", number: 10, name: "Carles Alena", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 21, name: "Abde Rebbach", pos: "FW", role: "LW", flag: "🇩🇿", nationality: "Algeria" }),

  makePlayer({ teamId: "laliga_alaves", number: 9, name: "Mariano Diaz", pos: "FW", role: "CF", flag: "🇩🇴", nationality: "Dominican Republic" }),
  makePlayer({ teamId: "laliga_alaves", number: 11, name: "Toni Martinez", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_alaves", number: 15, name: "Lucas Boye", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_alaves", number: 22, name: "Ibrahim Diabate", pos: "FW", role: "CF", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "laliga_alaves", number: 34, name: "Aitor Manas", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Elche (25/26)
  makePlayer({ teamId: "laliga_elche", number: 1, name: "Matias Dituro", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_elche", number: 13, name: "Inaki Pena", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 45, name: "Alejandro Iturbe", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_elche", number: 6, name: "Pedro Bigas (C)", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 18, name: "John Donald", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 21, name: "Leo Petrot", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_elche", number: 22, name: "David Affengruber", pos: "DF", role: "CB", flag: "🇦🇹", nationality: "Austria" }),
  makePlayer({ teamId: "laliga_elche", number: 23, name: "Victor Chust", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 42, name: "Buba Sangare", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_elche", number: 15, name: "Tete Morente", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 17, name: "Josan", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 39, name: "Hector Fort", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_elche", number: 3, name: "Adria Pedrosa", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 7, name: "Yago Santiago", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 11, name: "German Valera", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_elche", number: 5, name: "Federico Redondo", pos: "MF", role: "DM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_elche", number: 8, name: "Marc Aguado", pos: "MF", role: "DM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_elche", number: 12, name: "Gonzalo Villar", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 14, name: "Aleix Febas", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 16, name: "Martim Neto", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_elche", number: 19, name: "Grady Diangana", pos: "MF", role: "CM", flag: "🇨🇩", nationality: "DR Congo" }),
  makePlayer({ teamId: "laliga_elche", number: 24, name: "Lucas Cepeda", pos: "MF", role: "CM", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "laliga_elche", number: 32, name: "Adam Boayar", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "laliga_elche", number: 9, name: "Andre Silva", pos: "FW", role: "CF", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_elche", number: 10, name: "Rafa Mir", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_elche", number: 20, name: "Alvaro Rodriguez", pos: "FW", role: "CF", flag: "🇺🇾", nationality: "Uruguay" }),

  // Espanyol (25/26)
  makePlayer({ teamId: "laliga_espanyol", number: 1, name: "Angel Fortuno", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 13, name: "Marko Dmitrovic", pos: "GK", role: "GK", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "laliga_espanyol", number: 5, name: "Fernando Calero", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 6, name: "Leandro Cabrera", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_espanyol", number: 15, name: "Miguel Rubio", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 38, name: "Clemens Riedel", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "laliga_espanyol", number: 2, name: "Ruben Sanchez", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 23, name: "Omar El Hilali", pos: "DF", role: "RB", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "laliga_espanyol", number: 12, name: "Jose Salinas", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 22, name: "Carlos Romero", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_espanyol", number: 4, name: "Urko Gonzalez", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 10, name: "Pol Lozano", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 14, name: "Ramon Terrats", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 18, name: "Charles Pickel", pos: "MF", role: "CM", flag: "🇨🇩", nationality: "DR Congo" }),

  makePlayer({ teamId: "laliga_espanyol", number: 7, name: "Javi Puado (C)", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 8, name: "Edu Exposito", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_espanyol", number: 16, name: "Cyril Ngonge", pos: "FW", role: "RW", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "laliga_espanyol", number: 17, name: "Jofre Carreras", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 20, name: "Antoniu Roca", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_espanyol", number: 11, name: "Pere Milla", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 24, name: "Tyrhys Dolan", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),

  makePlayer({ teamId: "laliga_espanyol", number: 9, name: "Roberto Fernandez", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_espanyol", number: 19, name: "Kike Garcia", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Getafe (25/26)
  makePlayer({ teamId: "laliga_getafe", number: 1, name: "Jiri Letacek", pos: "GK", role: "GK", flag: "🇨🇿", nationality: "Czech Republic" }),
  makePlayer({ teamId: "laliga_getafe", number: 13, name: "David Soria", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_getafe", number: 3, name: "Abdel Abqar", pos: "DF", role: "CB", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_getafe", number: 12, name: "Allan Nyom", pos: "DF", role: "CB", flag: "🇨🇲", nationality: "Cameroon" }),
  makePlayer({ teamId: "laliga_getafe", number: 15, name: "Sebastian Boselli", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_getafe", number: 22, name: "Domingos Duarte", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_getafe", number: 24, name: "Zaid Romero", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_getafe", number: 11, name: "Abu Kamara", pos: "DF", role: "RM", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "laliga_getafe", number: 17, name: "Kiko Femenia", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 18, name: "Alex Sancris", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 31, name: "Ismael Bekhouca", pos: "DF", role: "RM", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "laliga_getafe", number: 16, name: "Diego Rico", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 21, name: "Juan Iglesias", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 26, name: "Davinchi", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_getafe", number: 2, name: "Djene Dakonam (C)", pos: "MF", role: "DM", flag: "🇹🇬", nationality: "Togo" }),
  makePlayer({ teamId: "laliga_getafe", number: 6, name: "Mario Martin", pos: "MF", role: "DM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_getafe", number: 5, name: "Luis Milla", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 8, name: "Mauro Arambarri", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_getafe", number: 14, name: "Javi Munoz", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_getafe", number: 7, name: "Juanmi", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 9, name: "Borja Mayoral", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_getafe", number: 10, name: "Martin Satriano", pos: "FW", role: "CF", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_getafe", number: 19, name: "Luis Vazquez", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_getafe", number: 20, name: "Veljko Birmancevic", pos: "FW", role: "CF", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "laliga_getafe", number: 23, name: "Adrian Liso", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Girona (25/26)
  makePlayer({ teamId: "laliga_girona", number: 1, name: "Ruben Blanco", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 13, name: "Paulo Gazzaniga", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_girona", number: 22, name: "Marc Andre Ter Stegen", pos: "GK", role: "GK", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "laliga_girona", number: 25, name: "Vladyslav Krapyvtsov", pos: "GK", role: "GK", flag: "🇺🇦", nationality: "Ukraine" }),

  makePlayer({ teamId: "laliga_girona", number: 5, name: "David Lopez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 12, name: "Vitor Reis", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_girona", number: 16, name: "Alejandro Frances", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 17, name: "Daley Blind", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "laliga_girona", number: 2, name: "Hugo Rincon", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 4, name: "Arnau Martinez", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_girona", number: 24, name: "Alex Moreno", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_girona", number: 6, name: "Donny Van De Beek", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "laliga_girona", number: 8, name: "Fran Beltran", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 20, name: "Axel Witsel", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "laliga_girona", number: 23, name: "Ivan Martin", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 29, name: "Lass Kourouma", pos: "MF", role: "CM", flag: "🇬🇳", nationality: "Guinea" }),

  makePlayer({ teamId: "laliga_girona", number: 11, name: "Thomas Lemar", pos: "MF", role: "AM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_girona", number: 14, name: "Claudio Echeverri", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_girona", number: 18, name: "Azzedine Ounahi", pos: "MF", role: "AM", flag: "🇲🇦", nationality: "Morocco" }),

  makePlayer({ teamId: "laliga_girona", number: 15, name: "Viktor Tsygankov", pos: "FW", role: "RW", flag: "🇺🇦", nationality: "Ukraine" }),

  makePlayer({ teamId: "laliga_girona", number: 3, name: "Joel Roca", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 21, name: "Bryan Gil", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_girona", number: 7, name: "Cristhian Stuani (C)", pos: "FW", role: "CF", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_girona", number: 9, name: "Abel Ruiz", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_girona", number: 19, name: "Vladyslav Vanat", pos: "FW", role: "CF", flag: "🇺🇦", nationality: "Ukraine" }),

  // Levante (25/26)
  makePlayer({ teamId: "laliga_levante", number: 1, name: "Pablo Campos", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 13, name: "Mathew Ryan", pos: "GK", role: "GK", flag: "🇦🇺", nationality: "Australia" }),

  makePlayer({ teamId: "laliga_levante", number: 2, name: "Matias Moreno", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_levante", number: 3, name: "Alan Matturro", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_levante", number: 4, name: "Adrian Dela", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 5, name: "Unai Elgezabal", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_levante", number: 17, name: "Victor Garcia", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 22, name: "Jeremy Toljan", pos: "DF", role: "RB", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "laliga_levante", number: 6, name: "Diego Pampin", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 23, name: "Manu Sanchez", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_levante", number: 8, name: "Jon Olasagasti", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 10, name: "Pablo Martinez (C)", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 12, name: "Unai Vencedor", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 14, name: "Ugo Raghouber", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_levante", number: 16, name: "Kervin Arriaga", pos: "MF", role: "CM", flag: "🇭🇳", nationality: "Honduras" }),
  makePlayer({ teamId: "laliga_levante", number: 20, name: "Oriol Rey", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_levante", number: 18, name: "Iker Losada", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 24, name: "Carlos Alvarez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_levante", number: 26, name: "Kareem Tunde", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 55, name: "Tay Abed", pos: "FW", role: "RW", flag: "🇮🇱", nationality: "Israel" }),

  makePlayer({ teamId: "laliga_levante", number: 7, name: "Roger Brugue", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 9, name: "Ivan Romero", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 27, name: "Paco Cortes", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_levante", number: 11, name: "Jose Luis Morales", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 19, name: "Carlos Espi", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_levante", number: 21, name: "Etta Eyong", pos: "FW", role: "CF", flag: "🇨🇲", nationality: "Cameroon" }),

  // Mallorca (25/26)
  makePlayer({ teamId: "laliga_mallorca", number: 1, name: "Leo Roman", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 13, name: "Lucas Bergstrom", pos: "GK", role: "GK", flag: "🇫🇮", nationality: "Finland" }),
  makePlayer({ teamId: "laliga_mallorca", number: 25, name: "Ivan Cuellar", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_mallorca", number: 4, name: "Marash Kumbulla", pos: "DF", role: "CB", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "laliga_mallorca", number: 21, name: "Antonio Raillo (C)", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 24, name: "Martin Valjent", pos: "DF", role: "CB", flag: "🇸🇰", nationality: "Slovakia" }),
  makePlayer({ teamId: "laliga_mallorca", number: 27, name: "David Lopez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_mallorca", number: 2, name: "Mateu Morey", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 23, name: "Pablo Maffeo", pos: "DF", role: "RB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_mallorca", number: 3, name: "Toni Lato", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 22, name: "Johan Mojica", pos: "DF", role: "LB", flag: "🇨🇴", nationality: "Colombia" }),

  makePlayer({ teamId: "laliga_mallorca", number: 5, name: "Omar Mascarell", pos: "MF", role: "CM", flag: "🇬🇶", nationality: "Equatorial Guinea" }),
  makePlayer({ teamId: "laliga_mallorca", number: 6, name: "Antonio Sanchez", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 8, name: "Manu Morlanes", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 12, name: "Samu Costa", pos: "MF", role: "CM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_mallorca", number: 41, name: "Jan Salas", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_mallorca", number: 10, name: "Sergi Darder", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 20, name: "Pablo Torre", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_mallorca", number: 11, name: "Takuma Asano", pos: "FW", role: "RW", flag: "🇯🇵", nationality: "Japan" }),
  makePlayer({ teamId: "laliga_mallorca", number: 30, name: "Justin Kalumba", pos: "FW", role: "RW", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "laliga_mallorca", number: 17, name: "Jan Virgili", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 19, name: "Javi Llabres", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_mallorca", number: 7, name: "Vedat Muriqi", pos: "FW", role: "CF", flag: "🇽🇰", nationality: "Kosovo" }),
  makePlayer({ teamId: "laliga_mallorca", number: 9, name: "Abdon Prats", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_mallorca", number: 15, name: "Zito Luvumbo", pos: "FW", role: "CF", flag: "🇦🇴", nationality: "Angola" }),
  makePlayer({ teamId: "laliga_mallorca", number: 18, name: "Mateo Joseph", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Osasuna (25/26)
  makePlayer({ teamId: "laliga_osasuna", number: 1, name: "Sergio Herrera", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 13, name: "Aitor Fernandez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 5, name: "Jorge Herrando", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 22, name: "Enzo Boyomo", pos: "DF", role: "CB", flag: "🇨🇲", nationality: "Cameroon" }),
  makePlayer({ teamId: "laliga_osasuna", number: 24, name: "Alejandro Catena", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 19, name: "Valentin Rosier", pos: "DF", role: "RB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_osasuna", number: 41, name: "Inigo Arguibide", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 3, name: "Juan Cruz", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 20, name: "Javi Galan", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 23, name: "Abel Bretones", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 6, name: "Lucas Torro", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 7, name: "Jon Moncayola", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 8, name: "Iker Munoz", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 29, name: "Asier Osambela", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 10, name: "Aimar Oroz", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 16, name: "Moi Gomez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 2, name: "Iker Benito", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 11, name: "Kike Barja (C)", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 14, name: "Ruben Garcia", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 15, name: "Raul Moro", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 21, name: "Victor Munoz", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_osasuna", number: 9, name: "Raul Garcia", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_osasuna", number: 17, name: "Ante Budimir", pos: "FW", role: "CF", flag: "🇭🇷", nationality: "Croatia" }),

  // Rayo Vallecano (25/26)
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 1, name: "Dani Cardenas", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 13, name: "Augusto Batalla", pos: "GK", role: "GK", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 5, name: "Luiz Felipe", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 16, name: "Abdul Mumin", pos: "DF", role: "CB", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 24, name: "Florian Lejeune", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 32, name: "Nobel Mendy", pos: "DF", role: "CB", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 33, name: "Jozhua Vertrouwd", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 2, name: "Andrei Ratiu", pos: "DF", role: "RB", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 20, name: "Ivan Balliu", pos: "DF", role: "RB", flag: "🇦🇱", nationality: "Albania" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 3, name: "Pep Chavarria", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 22, name: "Alfonso Espino", pos: "DF", role: "LB", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 4, name: "Pedro Diaz", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 6, name: "Pathe Ciss", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 15, name: "Gerard Gumbau", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 17, name: "Unai Lopez", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 23, name: "Oscar Valentin (C)", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 28, name: "Samu Becerra", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 7, name: "Isi Palazon", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 8, name: "Oscar Trejo", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 11, name: "Randy Nteka", pos: "MF", role: "AM", flag: "🇦🇴", nationality: "Angola" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 12, name: "Ilias Akhomach", pos: "FW", role: "RW", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 21, name: "Fran Perez", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 14, name: "Carlos Martin", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 18, name: "Alvaro Garcia", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_rayo_vallecano", number: 9, name: "Alemao", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 10, name: "Sergio Camello", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_rayo_vallecano", number: 19, name: "Jorge De Frutos", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Real Betis (25/26)
  makePlayer({ teamId: "laliga_real_betis", number: 1, name: "Alvaro Valles", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 13, name: "Adrian", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 25, name: "Pau Lopez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 3, name: "Diego Llorente", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 4, name: "Natan", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_real_betis", number: 5, name: "Marc Bartra", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 16, name: "Valentin Gomez", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_real_betis", number: 2, name: "Hector Bellerin", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 40, name: "Angel Ortiz", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 12, name: "Ricardo Rodriguez", pos: "DF", role: "LB", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "laliga_real_betis", number: 23, name: "Junior Firpo", pos: "DF", role: "LB", flag: "🇩🇴", nationality: "Dominican Republic" }),

  makePlayer({ teamId: "laliga_real_betis", number: 6, name: "Sergi Altimira", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 8, name: "Pablo Fornals", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 14, name: "Sofyan Amrabat", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_real_betis", number: 15, name: "Alvaro Fidalgo", pos: "MF", role: "CM", flag: "🇲🇽", nationality: "Mexico" }),
  makePlayer({ teamId: "laliga_real_betis", number: 18, name: "Nelson Deossa", pos: "MF", role: "CM", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "laliga_real_betis", number: 21, name: "Marc Roca", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 20, name: "Giovanni Lo Celso", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_real_betis", number: 22, name: "Isco (C)", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 7, name: "Antony", pos: "FW", role: "RW", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_real_betis", number: 24, name: "Aitor Ruibal", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_betis", number: 52, name: "Pablo Garcia", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 10, name: "Ez Abde", pos: "FW", role: "LW", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_real_betis", number: 17, name: "Rodrigo Riquelme", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_betis", number: 9, name: "Chimy Avila", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_real_betis", number: 11, name: "Cedric Bakambu", pos: "FW", role: "CF", flag: "🇨🇩", nationality: "DR Congo" }),
  makePlayer({ teamId: "laliga_real_betis", number: 19, name: "Cucho Hernandez", pos: "FW", role: "CF", flag: "🇨🇴", nationality: "Colombia" }),

  // Real Oviedo (25/26)
  makePlayer({ teamId: "laliga_real_oviedo", number: 1, name: "Horatiu Moldovan", pos: "GK", role: "GK", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 13, name: "Aaron Escandell", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 2, name: "Eric Bailly", pos: "DF", role: "CB", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 4, name: "David Costas", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 12, name: "Dani Calvo", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 16, name: "David Carmo", pos: "DF", role: "CB", flag: "🇦🇴", nationality: "Angola" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 22, name: "Nacho Vidal", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 24, name: "Lucas Ahijado", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 3, name: "Rahim Alhassane", pos: "DF", role: "LB", flag: "🇳🇪", nationality: "Niger" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 25, name: "Javi Lopez", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 6, name: "Kwasi Sibo", pos: "MF", role: "CM", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 8, name: "Santi Cazorla (C)", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 11, name: "Santiago Colombatto", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 20, name: "Leander Dendoncker", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 23, name: "Nicolas Fonseca", pos: "MF", role: "CM", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 5, name: "Alberto Reina", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 21, name: "Luka Ilic", pos: "MF", role: "AM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 27, name: "Pablo Agudin", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 7, name: "Ilyas Chaira", pos: "FW", role: "RW", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 10, name: "Haissem Hassan", pos: "FW", role: "RW", flag: "🇪🇬", nationality: "Egypt" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 14, name: "Ovie Ejaria", pos: "FW", role: "LW", flag: "🏴", nationality: "England" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 15, name: "Thiago Fernandez", pos: "FW", role: "LW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_real_oviedo", number: 9, name: "Federico Vinas", pos: "FW", role: "CF", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 17, name: "Thiago Borbas", pos: "FW", role: "CF", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "laliga_real_oviedo", number: 19, name: "Alex Fores", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Real Sociedad (25/26)
  makePlayer({ teamId: "laliga_real_sociedad", number: 1, name: "Alex Remiro", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 13, name: "Unai Marrero", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 5, name: "Igor Zubeldia", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 6, name: "Aritz Elustondo", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 16, name: "Duje Caleta Car", pos: "DF", role: "CB", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 31, name: "Jon Martin", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 2, name: "Jon Aramburu", pos: "DF", role: "RB", flag: "🇻🇪", nationality: "Venezuela" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 20, name: "Alvaro Odriozola", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 3, name: "Aihen Munoz", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 17, name: "Sergio Gomez", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 4, name: "Jon Gorrotxategi", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 8, name: "Benat Turrientes", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 12, name: "Yangel Herrera", pos: "MF", role: "CM", flag: "🇻🇪", nationality: "Venezuela" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 18, name: "Carlos Soler", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 24, name: "Luka Sucic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 15, name: "Pablo Marin", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 21, name: "Arsen Zakharyan", pos: "MF", role: "AM", flag: "🇷🇺", nationality: "Russia" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 23, name: "Brais Mendez", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 11, name: "Goncalo Guedes", pos: "FW", role: "RW", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 14, name: "Takefusa Kubo", pos: "FW", role: "RW", flag: "🇯🇵", nationality: "Japan" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 7, name: "Ander Barrenetxea", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 22, name: "Wesley", pos: "FW", role: "LW", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "laliga_real_sociedad", number: 9, name: "Orri Oskarsson", pos: "FW", role: "CF", flag: "🇮🇸", nationality: "Iceland" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 10, name: "Mikel Oyarzabal (C)", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_real_sociedad", number: 19, name: "Jon Karrikaburu", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Sevilla (25/26)
  makePlayer({ teamId: "laliga_sevilla", number: 1, name: "Odysseas Vlachodimos", pos: "GK", role: "GK", flag: "🇬🇷", nationality: "Greece" }),
  makePlayer({ teamId: "laliga_sevilla", number: 13, name: "Orjan Nyland", pos: "GK", role: "GK", flag: "🇳🇴", nationality: "Norway" }),

  makePlayer({ teamId: "laliga_sevilla", number: 3, name: "Cesar Azpilicueta", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 4, name: "Kike Salas", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 5, name: "Tanguy Nianzou", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_sevilla", number: 15, name: "Fabio Cardoso", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_sevilla", number: 22, name: "Federico Gattoni", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_sevilla", number: 23, name: "Marcao", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_sevilla", number: 32, name: "Andres Castrin", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_sevilla", number: 2, name: "Jose Carmona", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 16, name: "Juanlu Sanchez", pos: "DF", role: "RM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_sevilla", number: 12, name: "Gabriel Suazo", pos: "DF", role: "LM", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "laliga_sevilla", number: 36, name: "Oso", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_sevilla", number: 6, name: "Nemanja Gudelj (C)", pos: "MF", role: "CM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "laliga_sevilla", number: 8, name: "Joan Jordan", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 18, name: "Lucien Agoume", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_sevilla", number: 19, name: "Batista Mendy", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_sevilla", number: 20, name: "Djibril Sow", pos: "MF", role: "CM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "laliga_sevilla", number: 28, name: "Manu Bueno", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_sevilla", number: 14, name: "Peque Fernandez", pos: "FW", role: "RAM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 24, name: "Adnan Januzaj", pos: "FW", role: "RAM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "laliga_sevilla", number: 29, name: "Miguel Sierra", pos: "FW", role: "RAM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_sevilla", number: 11, name: "Ruben Vargas", pos: "FW", role: "LAM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "laliga_sevilla", number: 21, name: "Chidera Ejuke", pos: "FW", role: "LAM", flag: "🇳🇬", nationality: "Nigeria" }),

  makePlayer({ teamId: "laliga_sevilla", number: 7, name: "Isaac Romero", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_sevilla", number: 9, name: "Akor Adams", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "laliga_sevilla", number: 10, name: "Alexis Sanchez", pos: "FW", role: "CF", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "laliga_sevilla", number: 17, name: "Neal Maupay", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Valencia (25/26)
  makePlayer({ teamId: "laliga_valencia", number: 1, name: "Stole Dimitrievski", pos: "GK", role: "GK", flag: "🇲🇰", nationality: "Macedonia" }),
  makePlayer({ teamId: "laliga_valencia", number: 13, name: "Cristian Rivero", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 25, name: "Julen Agirrezabala", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_valencia", number: 3, name: "Jose Copete", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 4, name: "Unai Nunez", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 5, name: "Cesar Tarrega", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 24, name: "Eray Comert", pos: "DF", role: "CB", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "laliga_valencia", number: 12, name: "Thierry Correia", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_valencia", number: 20, name: "Renzo Saravia", pos: "DF", role: "RB", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "laliga_valencia", number: 14, name: "Jose Gaya (C)", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 21, name: "Jesus Vazquez", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_valencia", number: 2, name: "Guido Rodriguez", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_valencia", number: 18, name: "Pepelu", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 22, name: "Baptiste Santamaria", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_valencia", number: 23, name: "Filip Ugrinic", pos: "MF", role: "CM", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "laliga_valencia", number: 8, name: "Javi Guerra", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 10, name: "Andre Almeida", pos: "MF", role: "AM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "laliga_valencia", number: 19, name: "Dani Raba", pos: "MF", role: "AM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_valencia", number: 11, name: "Luis Rioja", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 16, name: "Diego Lopez", pos: "FW", role: "RW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_valencia", number: 7, name: "Arnaut Danjuma", pos: "FW", role: "LW", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "laliga_valencia", number: 17, name: "Largie Ramazani", pos: "FW", role: "LW", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "laliga_valencia", number: 6, name: "Umar Sadiq", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "laliga_valencia", number: 9, name: "Hugo Duro", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_valencia", number: 15, name: "Lucas Beltran", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),

  // Villarreal (25/26)
  makePlayer({ teamId: "laliga_villarreal", number: 1, name: "Luiz Junior", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "laliga_villarreal", number: 13, name: "Diego Conde", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 25, name: "Arnau Tenas", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_villarreal", number: 2, name: "Logan Costa", pos: "DF", role: "CB", flag: "🇨🇻", nationality: "Cape Verde" }),
  makePlayer({ teamId: "laliga_villarreal", number: 4, name: "Rafa Marin", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 5, name: "Willy Kambwala", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "laliga_villarreal", number: 6, name: "Pau Navarro", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 8, name: "Juan Foyth", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "laliga_villarreal", number: 12, name: "Renato Veiga", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),

  makePlayer({ teamId: "laliga_villarreal", number: 3, name: "Alex Freeman", pos: "DF", role: "RB", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "laliga_villarreal", number: 15, name: "Santiago Mourino", pos: "DF", role: "RB", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "laliga_villarreal", number: 23, name: "Sergi Cardona", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 24, name: "Alfonso Pedraza", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_villarreal", number: 10, name: "Dani Parejo", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 14, name: "Santi Comesana", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 16, name: "Thomas Partey", pos: "MF", role: "CM", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "laliga_villarreal", number: 18, name: "Pape Gueye", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "laliga_villarreal", number: 37, name: "Carlos Macia", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_villarreal", number: 17, name: "Tajon Buchanan", pos: "FW", role: "RW", flag: "🇨🇦", nationality: "Canada" }),
  makePlayer({ teamId: "laliga_villarreal", number: 19, name: "Nicolas Pepe", pos: "FW", role: "RW", flag: "🇨🇮", nationality: "Ivory Coast" }),

  makePlayer({ teamId: "laliga_villarreal", number: 11, name: "Alfon Gonzalez", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 20, name: "Alberto Moleiro", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 32, name: "Hugo Lopez", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "laliga_villarreal", number: 7, name: "Gerard Moreno (C)", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "laliga_villarreal", number: 9, name: "Georges Mikautadze", pos: "FW", role: "CF", flag: "🇬🇪", nationality: "Georgia" }),
  makePlayer({ teamId: "laliga_villarreal", number: 21, name: "Tani Oluwaseyi", pos: "FW", role: "CF", flag: "🇨🇦", nationality: "Canada" }),
  makePlayer({ teamId: "laliga_villarreal", number: 22, name: "Ayoze Perez", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),

  // Atalanta (25/26)
  makePlayer({ teamId: "seriea_atalanta", number: 29, name: "Marco Carnesecchi", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 31, name: "Francesco Rossi", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 57, name: "Marco Sportiello", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_atalanta", number: 3, name: "Odilon Kossounou", pos: "DF", role: "CB", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_atalanta", number: 4, name: "Isak Hien", pos: "DF", role: "CB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_atalanta", number: 19, name: "Berat Djimsiti", pos: "DF", role: "CB", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_atalanta", number: 23, name: "Sead Kolasinac", pos: "DF", role: "CB", flag: "🇧🇦", nationality: "Bosnia" }),
  makePlayer({ teamId: "seriea_atalanta", number: 42, name: "Giorgio Scalvini", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 69, name: "Honest Ahanor", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_atalanta", number: 16, name: "Raoul Bellanova", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 77, name: "Davide Zappacosta", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_atalanta", number: 5, name: "Mitchel Bakker", pos: "DF", role: "LM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_atalanta", number: 47, name: "Lorenzo Bernasconi", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 59, name: "Nicola Zalewski", pos: "DF", role: "LM", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "seriea_atalanta", number: 6, name: "Yunus Musah", pos: "MF", role: "CM", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "seriea_atalanta", number: 8, name: "Mario Pasalic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_atalanta", number: 13, name: "Ederson", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_atalanta", number: 15, name: "Marten De Roon (C)", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "seriea_atalanta", number: 10, name: "Lazar Samardzic", pos: "FW", role: "RAM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_atalanta", number: 17, name: "Charles De Ketelaere", pos: "FW", role: "RAM", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "seriea_atalanta", number: 7, name: "Kamaldeen Sulemana", pos: "FW", role: "LAM", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "seriea_atalanta", number: 18, name: "Giacomo Raspadori", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_atalanta", number: 9, name: "Gianluca Scamacca", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_atalanta", number: 90, name: "Nikola Krstovic", pos: "FW", role: "CF", flag: "🇲🇪", nationality: "Montenegro" }),

  // Bologna (25/26)
  makePlayer({ teamId: "seriea_bologna", number: 1, name: "Lukasz Skorupski", pos: "GK", role: "GK", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_bologna", number: 13, name: "Federico Ravaglia", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 25, name: "Massimo Pessina", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_bologna", number: 5, name: "Eivind Helland", pos: "DF", role: "CB", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_bologna", number: 14, name: "Torbjorn Heggem", pos: "DF", role: "CB", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_bologna", number: 16, name: "Nicolo Casale", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 26, name: "Jhon Lucumi", pos: "DF", role: "CB", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_bologna", number: 41, name: "Martin Vitik", pos: "DF", role: "CB", flag: "🇨🇿", nationality: "Czech Republic" }),

  makePlayer({ teamId: "seriea_bologna", number: 17, name: "Joao Mario", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "seriea_bologna", number: 20, name: "Nadir Zortea", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 29, name: "Lorenzo De Silvestri (C)", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_bologna", number: 22, name: "Charalampos Lykogiannis", pos: "DF", role: "LB", flag: "🇬🇷", nationality: "Greece" }),
  makePlayer({ teamId: "seriea_bologna", number: 33, name: "Juan Miranda", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "seriea_bologna", number: 4, name: "Tommaso Pobega", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 6, name: "Nikola Moro", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_bologna", number: 8, name: "Remo Freuler", pos: "MF", role: "CM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_bologna", number: 19, name: "Lewis Ferguson", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),

  makePlayer({ teamId: "seriea_bologna", number: 21, name: "Jens Odgaard", pos: "MF", role: "AM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_bologna", number: 23, name: "Simon Sohm", pos: "MF", role: "AM", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "seriea_bologna", number: 7, name: "Riccardo Orsolini", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 10, name: "Federico Bernardeschi", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_bologna", number: 11, name: "Jonathan Rowe", pos: "FW", role: "LW", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_bologna", number: 28, name: "Nicolo Cambiaghi", pos: "FW", role: "LW", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_bologna", number: 30, name: "Benja Dominguez", pos: "FW", role: "LW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "seriea_bologna", number: 9, name: "Santiago Castro", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_bologna", number: 24, name: "Thijs Dallinga", pos: "FW", role: "CF", flag: "🇳🇱", nationality: "Netherlands" }),

  // Cremonese (25/26)
  makePlayer({ teamId: "seriea_cremonese", number: 1, name: "Emil Audero", pos: "GK", role: "GK", flag: "🇮🇩", nationality: "Indonesia" }),
  makePlayer({ teamId: "seriea_cremonese", number: 16, name: "Marco Silvestri", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 69, name: "Lapo Nava", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cremonese", number: 5, name: "Sebastiano Luperto", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 6, name: "Federico Baschirotto", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 15, name: "Matteo Bianchetti (C)", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 23, name: "Federico Ceccherini", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 30, name: "Mikayil Faye", pos: "DF", role: "CB", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "seriea_cremonese", number: 55, name: "Francesco Folino", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cremonese", number: 4, name: "Tommaso Barbieri", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 24, name: "Filippo Terracciano", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cremonese", number: 3, name: "Giuseppe Pezella", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cremonese", number: 2, name: "Morten Thorsby", pos: "MF", role: "CM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_cremonese", number: 18, name: "Michele Collocolo", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 29, name: "Youssef Maleh", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_cremonese", number: 32, name: "Martin Payero", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_cremonese", number: 33, name: "Alberto Grassi", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 38, name: "Warren Bondo", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_cremonese", number: 7, name: "Alessio Zerbin", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 22, name: "Romano Floriani", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cremonese", number: 27, name: "Jari Vandeputte", pos: "FW", role: "LW", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "seriea_cremonese", number: 9, name: "Milan Djuric", pos: "FW", role: "CF", flag: "🇧🇦", nationality: "Bosnia" }),
  makePlayer({ teamId: "seriea_cremonese", number: 10, name: "Jamie Vardy", pos: "FW", role: "CF", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_cremonese", number: 14, name: "Faris Moumbagna", pos: "FW", role: "CF", flag: "🇨🇲", nationality: "Cameroon" }),
  makePlayer({ teamId: "seriea_cremonese", number: 77, name: "David Okereke", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_cremonese", number: 90, name: "Federico Bonazzoli", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cremonese", number: 99, name: "Antonio Sanabria", pos: "FW", role: "CF", flag: "🇵🇾", nationality: "Paraguay" }),

  // Cagliari (25/26)
  makePlayer({ teamId: "seriea_cagliari", number: 1, name: "Elia Caprile", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 12, name: "Alen Sherri", pos: "GK", role: "GK", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_cagliari", number: 24, name: "Giuseppe Ciocci", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cagliari", number: 15, name: "Juan Rodriguez", pos: "DF", role: "CB", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "seriea_cagliari", number: 22, name: "Alberto Dossena", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 26, name: "Yerry Mina", pos: "DF", role: "CB", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_cagliari", number: 32, name: "Ze Pedro", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "seriea_cagliari", number: 33, name: "Adam Obert", pos: "DF", role: "CB", flag: "🇸🇰", nationality: "Slovakia" }),

  makePlayer({ teamId: "seriea_cagliari", number: 2, name: "Marco Palestra", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 18, name: "Othniel Raterink", pos: "DF", role: "RB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_cagliari", number: 28, name: "Gabriele Zappa", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cagliari", number: 3, name: "Riyad Idrissi", pos: "DF", role: "LB", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_cagliari", number: 17, name: "Mattia Felici", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 20, name: "Agustin Albarracin", pos: "DF", role: "LB", flag: "🇺🇾", nationality: "Uruguay" }),

  makePlayer({ teamId: "seriea_cagliari", number: 4, name: "Luca Mazzitelli", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 8, name: "Michel Adopo", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_cagliari", number: 10, name: "Gianluca Gaetano", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 14, name: "Alessandro Deiola", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 25, name: "Ibrahim Sulemana", pos: "MF", role: "CM", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "seriea_cagliari", number: 27, name: "Joseph Liteta", pos: "MF", role: "CM", flag: "🇿🇲", nationality: "Zambia" }),
  makePlayer({ teamId: "seriea_cagliari", number: 90, name: "Michael Folorunsho", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_cagliari", number: 9, name: "Semih Kilicsoy", pos: "FW", role: "CF", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "seriea_cagliari", number: 19, name: "Andrea Belotti", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 29, name: "Gennaro Borrelli", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 30, name: "Leonardo Pavoletti (C)", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_cagliari", number: 31, name: "Paul Mendy", pos: "FW", role: "CF", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "seriea_cagliari", number: 37, name: "Yael Trepy", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_cagliari", number: 94, name: "Sebastiano Esposito", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Como (25/26)
  makePlayer({ teamId: "seriea_como", number: 1, name: "Jean Butez", pos: "GK", role: "GK", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_como", number: 12, name: "Henrique Menke", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_como", number: 21, name: "Noel Tornqvist", pos: "GK", role: "GK", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_como", number: 22, name: "Mauro Vigorito", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_como", number: 44, name: "Nikola Cavlina", pos: "GK", role: "GK", flag: "🇭🇷", nationality: "Croatia" }),

  makePlayer({ teamId: "seriea_como", number: 2, name: "Marc Oliver Kempf", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_como", number: 5, name: "Edoardo Goldaniga", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_como", number: 14, name: "Jacobo Ramon", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_como", number: 34, name: "Diego Carlos", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "seriea_como", number: 28, name: "Ivan Smolcic", pos: "DF", role: "RB", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_como", number: 31, name: "Mergim Vojvoda", pos: "DF", role: "RB", flag: "🇽🇰", nationality: "Kosovo" }),
  makePlayer({ teamId: "seriea_como", number: 77, name: "Ignace Van Der Brempt", pos: "DF", role: "RB", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "seriea_como", number: 3, name: "Alex Valle", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_como", number: 18, name: "Alberto Moreno", pos: "DF", role: "LB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "seriea_como", number: 6, name: "Maxence Caqueret", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_como", number: 8, name: "Sergi Roberto", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_como", number: 15, name: "Adrian Lahdo", pos: "MF", role: "CM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_como", number: 23, name: "Maximo Perrone", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_como", number: 33, name: "Lucas Da Cunha (C)", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_como", number: 10, name: "Nico Paz", pos: "MF", role: "AM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_como", number: 20, name: "Martin Baturina", pos: "MF", role: "AM", flag: "🇭🇷", nationality: "Croatia" }),

  makePlayer({ teamId: "seriea_como", number: 19, name: "Nicolas Kuhn", pos: "FW", role: "RW", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_como", number: 42, name: "Jayden Addai", pos: "FW", role: "RW", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "seriea_como", number: 17, name: "Jesus Rodriguez", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_como", number: 38, name: "Assane Diao", pos: "FW", role: "LW", flag: "🇸🇳", nationality: "Senegal" }),

  makePlayer({ teamId: "seriea_como", number: 7, name: "Alvaro Morata", pos: "FW", role: "CF", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_como", number: 11, name: "Anastasios Douvikas", pos: "FW", role: "CF", flag: "🇬🇷", nationality: "Greece" }),

  // Fiorentina (25/26)
  makePlayer({ teamId: "seriea_fiorentina", number: 1, name: "Luca Lezzerini", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 43, name: "David De Gea (C)", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 53, name: "Oliver Christensen", pos: "GK", role: "GK", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 3, name: "Daniele Rugani", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 5, name: "Marin Pongracic", pos: "DF", role: "CB", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 6, name: "Luca Ranieri", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 15, name: "Pietro Comuzzo", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 23, name: "Eman Kospo", pos: "DF", role: "CB", flag: "🇧🇦", nationality: "Bosnia" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 60, name: "Eddy Kouadio", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 2, name: "Dodo", pos: "DF", role: "RB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 65, name: "Fabiano Parisi", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 21, name: "Robin Gosens", pos: "DF", role: "LB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 29, name: "Niccolo Fortini", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 62, name: "Luis Balbo", pos: "DF", role: "LB", flag: "🇻🇪", nationality: "Venezuela" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 8, name: "Rolando Mandragora", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 44, name: "Nicolo Fagioli", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 4, name: "Marco Brescianini", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 11, name: "Abdelhamid Sabiri", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 22, name: "Jacopo Fazzini", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 27, name: "Cher Ndour", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 80, name: "Giovanni Fabbian", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 17, name: "Jack Harrison", pos: "FW", role: "RW", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 10, name: "Albert Gudmundsson", pos: "FW", role: "LW", flag: "🇮🇸", nationality: "Iceland" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 19, name: "Manor Solomon", pos: "FW", role: "LW", flag: "🇮🇱", nationality: "Israel" }),

  makePlayer({ teamId: "seriea_fiorentina", number: 20, name: "Moise Kean", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 61, name: "Riccardo Braschi", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_fiorentina", number: 91, name: "Roberto Piccoli", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Genoa (25/26)
  makePlayer({ teamId: "seriea_genoa", number: 1, name: "Nicola Leali", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_genoa", number: 16, name: "Justin Bijlow", pos: "GK", role: "GK", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_genoa", number: 31, name: "Benjamin Siegrist", pos: "GK", role: "GK", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_genoa", number: 35, name: "Ernestas Lysionok", pos: "GK", role: "GK", flag: "🇱🇹", nationality: "Lithuania" }),
  makePlayer({ teamId: "seriea_genoa", number: 39, name: "Daniele Sommariva", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_genoa", number: 5, name: "Leo Ostigard", pos: "DF", role: "CB", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_genoa", number: 13, name: "Nils Zatterstrom", pos: "DF", role: "CB", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_genoa", number: 22, name: "Johan Vasquez (C)", pos: "DF", role: "CB", flag: "🇲🇽", nationality: "Mexico" }),
  makePlayer({ teamId: "seriea_genoa", number: 27, name: "Alessandro Marcandalli", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_genoa", number: 34, name: "Sebastian Otoa", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "seriea_genoa", number: 15, name: "Brooke Norton-Cuffy", pos: "DF", role: "RM", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_genoa", number: 20, name: "Stefano Sabelli", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_genoa", number: 77, name: "Mikael Ellertsson", pos: "DF", role: "RM", flag: "🇮🇸", nationality: "Iceland" }),

  makePlayer({ teamId: "seriea_genoa", number: 3, name: "Aaron Martin", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_genoa", number: 70, name: "Maxwel Cornet", pos: "DF", role: "LM", flag: "🇨🇮", nationality: "Ivory Coast" }),

  makePlayer({ teamId: "seriea_genoa", number: 4, name: "Amorim", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_genoa", number: 14, name: "Jean Onana", pos: "MF", role: "CM", flag: "🇨🇲", nationality: "Cameroon" }),
  makePlayer({ teamId: "seriea_genoa", number: 17, name: "Ruslan Malinovskyi", pos: "MF", role: "CM", flag: "🇺🇦", nationality: "Ukraine" }),
  makePlayer({ teamId: "seriea_genoa", number: 32, name: "Morten Frendrup", pos: "MF", role: "CM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_genoa", number: 73, name: "Patrizio Masini", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_genoa", number: 8, name: "Tommaso Baldanzi", pos: "MF", role: "AM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_genoa", number: 10, name: "Junior Messias", pos: "MF", role: "AM", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "seriea_genoa", number: 9, name: "Vitinha", pos: "FW", role: "CF", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "seriea_genoa", number: 18, name: "Caleb Ekuban", pos: "FW", role: "CF", flag: "🇬🇭", nationality: "Ghana" }),
  makePlayer({ teamId: "seriea_genoa", number: 21, name: "Jeff Ekhator", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_genoa", number: 29, name: "Lorenzo Colombo", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Hellas Verona (25/26)
  makePlayer({ teamId: "seriea_hellas_verona", number: 1, name: "Lorenzo Montipo", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 34, name: "Simone Perilli", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 94, name: "Giacomo Toniolo", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 5, name: "Andrias Edmundsson", pos: "DF", role: "CB", flag: "🇫🇴", nationality: "Faroe Islands" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 6, name: "Nicolas Valentini", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 15, name: "Victor Nelsson", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 19, name: "Tobias Slotsager", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 37, name: "Armel Bella Kotchap", pos: "DF", role: "CB", flag: "🇬🇭", nationality: "Ghana" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 2, name: "Daniel Oyegoke", pos: "DF", role: "RB", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 7, name: "Rafik Belghali", pos: "DF", role: "RB", flag: "🇩🇿", nationality: "Algeria" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 14, name: "Pol Lirola", pos: "DF", role: "RB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 70, name: "Fallou Cham", pos: "DF", role: "RB", flag: "🇬🇲", nationality: "Gambia" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 3, name: "Martin Frese", pos: "DF", role: "LB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 12, name: "Domagoj Bradaric", pos: "DF", role: "LB", flag: "🇭🇷", nationality: "Croatia" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 63, name: "Roberto Gagliardini", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 73, name: "Moatasem Al Musrati", pos: "MF", role: "DM", flag: "🇱🇾", nationality: "Libya" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 4, name: "Sandi Lovric", pos: "MF", role: "CM", flag: "🇸🇮", nationality: "Slovenia" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 8, name: "Suat Serdar (C)", pos: "MF", role: "CM", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 10, name: "Tomas Suslov", pos: "MF", role: "CM", flag: "🇸🇰", nationality: "Slovakia" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 11, name: "Jean Akpa Akpro", pos: "MF", role: "CM", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 21, name: "Abdou Harroui", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 24, name: "Antoine Bernede", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 36, name: "Cheikh Niasse", pos: "MF", role: "CM", flag: "🇸🇳", nationality: "Senegal" }),

  makePlayer({ teamId: "seriea_hellas_verona", number: 9, name: "Amin Sarr", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 16, name: "Gift Orban", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 18, name: "Kieron Bowie", pos: "FW", role: "CF", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 25, name: "Daniel Mosquera", pos: "FW", role: "CF", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 41, name: "Isaac", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_hellas_verona", number: 72, name: "Junior Ajayi", pos: "FW", role: "CF", flag: "🇨🇮", nationality: "Ivory Coast" }),

  // Inter Milan (25/26)
  makePlayer({ teamId: "seriea_inter", number: 1, name: "Yann Sommer", pos: "GK", role: "GK", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_inter", number: 12, name: "Raffaele Di Gennaro", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_inter", number: 13, name: "Josep Martinez", pos: "GK", role: "GK", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "seriea_inter", number: 6, name: "Stefan De Vrij", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_inter", number: 15, name: "Francesco Acerbi", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_inter", number: 25, name: "Manuel Akanji", pos: "DF", role: "CB", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_inter", number: 31, name: "Yann Bisseck", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_inter", number: 95, name: "Alessandro Bastoni", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_inter", number: 2, name: "Denzel Dumfries", pos: "DF", role: "RM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_inter", number: 11, name: "Luis Henrique", pos: "DF", role: "RM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_inter", number: 36, name: "Matteo Darmian", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_inter", number: 30, name: "Carlos Augusto", pos: "DF", role: "LM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_inter", number: 32, name: "Federico Dimarco", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_inter", number: 7, name: "Piotr Zielinski", pos: "MF", role: "DM", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_inter", number: 20, name: "Hakan Calhanoglu", pos: "MF", role: "DM", flag: "🇹🇷", nationality: "Turkey" }),

  makePlayer({ teamId: "seriea_inter", number: 8, name: "Petar Sucic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_inter", number: 16, name: "Davide Frattesi", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_inter", number: 17, name: "Andy Diouf", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_inter", number: 22, name: "Henrikh Mkhitaryan", pos: "MF", role: "CM", flag: "🇦🇲", nationality: "Armenia" }),
  makePlayer({ teamId: "seriea_inter", number: 23, name: "Nicolo Barella", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_inter", number: 9, name: "Marcus Thuram", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_inter", number: 10, name: "Lautaro Martinez (C)", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_inter", number: 14, name: "Yoan Ange Bonny", pos: "FW", role: "CF", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_inter", number: 94, name: "Pio Esposito", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Juventus (25/26)
  makePlayer({ teamId: "seriea_juve", number: 1, name: "Mattia Perin", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_juve", number: 16, name: "Michele Di Gregorio", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_juve", number: 23, name: "Carlo Pinsoglio", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_juve", number: 3, name: "Bremer", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_juve", number: 4, name: "Federico Gatti", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_juve", number: 6, name: "Lloyd Kelly", pos: "DF", role: "CB", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_juve", number: 15, name: "Pierre Kalulu", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_juve", number: 2, name: "Em Holm", pos: "DF", role: "RM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_juve", number: 22, name: "Weston McKennie", pos: "DF", role: "RM", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "seriea_juve", number: 18, name: "Filip Kostic", pos: "DF", role: "LM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_juve", number: 27, name: "Andrea Cambiaso", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_juve", number: 32, name: "Juan Cabal", pos: "DF", role: "LM", flag: "🇨🇴", nationality: "Colombia" }),

  makePlayer({ teamId: "seriea_juve", number: 5, name: "Manuel Locatelli (C)", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_juve", number: 8, name: "Teun Koopmeiners", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_juve", number: 19, name: "Khephren Thuram", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_juve", number: 21, name: "Fabio Miretti", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_juve", number: 7, name: "Francisco Conceicao", pos: "FW", role: "RAM", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "seriea_juve", number: 11, name: "Edon Zhegrova", pos: "FW", role: "RAM", flag: "🇽🇰", nationality: "Kosovo" }),

  makePlayer({ teamId: "seriea_juve", number: 10, name: "Kenan Yildiz", pos: "FW", role: "LAM", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "seriea_juve", number: 13, name: "Jeremie Boga", pos: "FW", role: "LAM", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_juve", number: 17, name: "Vasilije Adzic", pos: "FW", role: "LAM", flag: "🇲🇪", nationality: "Montenegro" }),

  makePlayer({ teamId: "seriea_juve", number: 9, name: "Dusan Vlahovic", pos: "FW", role: "CF", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_juve", number: 14, name: "Arkadiusz Milik", pos: "FW", role: "CF", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_juve", number: 20, name: "Lois Openda", pos: "FW", role: "CF", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_juve", number: 30, name: "Jonathan David", pos: "FW", role: "CF", flag: "🇨🇦", nationality: "Canada" }),

  // Lazio (25/26)
  makePlayer({ teamId: "seriea_lazio", number: 40, name: "Edoardo Motta", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 55, name: "Alessio Furlanetto", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 94, name: "Ivan Provedel", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lazio", number: 2, name: "Samuel Gigot", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_lazio", number: 4, name: "Patric", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_lazio", number: 13, name: "Alessio Romagnoli", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 25, name: "Oliver Provstgaard", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_lazio", number: 34, name: "Mario Gila", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "seriea_lazio", number: 23, name: "Elseid Hysaj", pos: "DF", role: "RB", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_lazio", number: 29, name: "Manuel Lazzari", pos: "DF", role: "RB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 77, name: "Adam Marusic", pos: "DF", role: "RB", flag: "🇲🇪", nationality: "Montenegro" }),

  makePlayer({ teamId: "seriea_lazio", number: 3, name: "Luca Pellegrini", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 17, name: "Nuno Tavares", pos: "DF", role: "LB", flag: "🇵🇹", nationality: "Portugal" }),

  makePlayer({ teamId: "seriea_lazio", number: 6, name: "Nicolo Rovella", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lazio", number: 32, name: "Danilo Cataldi", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lazio", number: 7, name: "Fisayo Dele Bashiru", pos: "MF", role: "CM", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_lazio", number: 21, name: "Reda Belahyane", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_lazio", number: 24, name: "Kenneth Taylor", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_lazio", number: 26, name: "Toma Basic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_lazio", number: 28, name: "Adrian Przyborek", pos: "MF", role: "CM", flag: "🇵🇱", nationality: "Poland" }),

  makePlayer({ teamId: "seriea_lazio", number: 14, name: "Tijjani Noslin", pos: "FW", role: "RW", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_lazio", number: 18, name: "Gustav Isaksen", pos: "FW", role: "RW", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_lazio", number: 22, name: "Matteo Cancellieri", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lazio", number: 9, name: "Pedro", pos: "FW", role: "LW", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_lazio", number: 10, name: "Mattia Zaccagni (C)", pos: "FW", role: "LW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lazio", number: 19, name: "Boulaye Dia", pos: "FW", role: "CF", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "seriea_lazio", number: 20, name: "Petar Ratkov", pos: "FW", role: "CF", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_lazio", number: 27, name: "Daniel Maldini", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Lecce (25/26)
  makePlayer({ teamId: "seriea_lecce", number: 1, name: "Christian Fruchtl", pos: "GK", role: "GK", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_lecce", number: 30, name: "Wladimiro Falcone (C)", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lecce", number: 32, name: "Jasper Samooja", pos: "GK", role: "GK", flag: "🇫🇮", nationality: "Finland" }),

  makePlayer({ teamId: "seriea_lecce", number: 4, name: "Gaspar", pos: "DF", role: "CB", flag: "🇦🇴", nationality: "Angola" }),
  makePlayer({ teamId: "seriea_lecce", number: 5, name: "Jamil Siebert", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_lecce", number: 13, name: "Matias Perez", pos: "DF", role: "CB", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "seriea_lecce", number: 18, name: "Gaby Jean", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_lecce", number: 44, name: "Tiago Gabriel", pos: "DF", role: "CB", flag: "🇵🇹", nationality: "Portugal" }),

  makePlayer({ teamId: "seriea_lecce", number: 17, name: "Danilo Veiga", pos: "DF", role: "RB", flag: "🇵🇹", nationality: "Portugal" }),

  makePlayer({ teamId: "seriea_lecce", number: 3, name: "Corrie Ndaba", pos: "DF", role: "LB", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "seriea_lecce", number: 25, name: "Antonino Gallo", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lecce", number: 6, name: "Alex Sala", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_lecce", number: 8, name: "Sadik Fofana", pos: "MF", role: "CM", flag: "🇹🇬", nationality: "Togo" }),
  makePlayer({ teamId: "seriea_lecce", number: 14, name: "Thorir Helgason", pos: "MF", role: "CM", flag: "🇮🇸", nationality: "Iceland" }),
  makePlayer({ teamId: "seriea_lecce", number: 20, name: "Ylber Ramadani", pos: "MF", role: "CM", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_lecce", number: 29, name: "Lassana Coulibaly", pos: "MF", role: "CM", flag: "🇲🇱", nationality: "Mali" }),
  makePlayer({ teamId: "seriea_lecce", number: 79, name: "Oumar Ngom", pos: "MF", role: "CM", flag: "🇲🇷", nationality: "Mauritania" }),

  makePlayer({ teamId: "seriea_lecce", number: 10, name: "Medon Berisha", pos: "MF", role: "AM", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_lecce", number: 16, name: "Omri Gandelman", pos: "MF", role: "AM", flag: "🇮🇱", nationality: "Israel" }),
  makePlayer({ teamId: "seriea_lecce", number: 36, name: "Filip Marchwinski", pos: "MF", role: "AM", flag: "🇵🇱", nationality: "Poland" }),

  makePlayer({ teamId: "seriea_lecce", number: 11, name: "Konan N'Dri", pos: "FW", role: "RW", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_lecce", number: 50, name: "Santiago Pierotti", pos: "FW", role: "RW", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "seriea_lecce", number: 19, name: "Lameck Banda", pos: "FW", role: "LW", flag: "🇿🇲", nationality: "Zambia" }),
  makePlayer({ teamId: "seriea_lecce", number: 23, name: "Riccardo Sottil", pos: "FW", role: "LW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_lecce", number: 9, name: "Nikola Stulic", pos: "FW", role: "CF", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_lecce", number: 22, name: "Francesco Camarda", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_lecce", number: 99, name: "Walid Cheddira", pos: "FW", role: "CF", flag: "🇲🇦", nationality: "Morocco" }),

  // AC Milan (25/26)
  makePlayer({ teamId: "seriea_ac_milan", number: 1, name: "Pietro Terracciano", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 16, name: "Mike Maignan (C)", pos: "GK", role: "GK", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 96, name: "Lorenzo Torriani", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 5, name: "Koni De Winter", pos: "DF", role: "CB", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 23, name: "Fikayo Tomori", pos: "DF", role: "CB", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 27, name: "David Odogu", pos: "DF", role: "CB", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 31, name: "Strahinja Pavlovic", pos: "DF", role: "CB", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 46, name: "Matteo Gabbia", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 24, name: "Zachary Athekame", pos: "DF", role: "RM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 56, name: "Alexis Saelemaekers", pos: "DF", role: "RM", flag: "🇧🇪", nationality: "Belgium" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 2, name: "Pervis Estupinan", pos: "DF", role: "LM", flag: "🇪🇨", nationality: "Ecuador" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 33, name: "Davide Bartesaghi", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 4, name: "Samuele Ricci", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 30, name: "Ardon Jashari", pos: "MF", role: "DM", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 8, name: "Ruben Loftus Cheek", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 12, name: "Adrien Rabiot", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 14, name: "Luka Modric", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 19, name: "Youssouf Fofana", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_ac_milan", number: 7, name: "Santiago Gimenez", pos: "FW", role: "CF", flag: "🇲🇽", nationality: "Mexico" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 9, name: "Niclas Fullkrug", pos: "FW", role: "CF", flag: "🇩🇪", nationality: "Germany" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 10, name: "Rafael Leao", pos: "FW", role: "CF", flag: "🇵🇹", nationality: "Portugal" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 11, name: "Christian Pulisic", pos: "FW", role: "CF", flag: "🇺🇸", nationality: "USA" }),
  makePlayer({ teamId: "seriea_ac_milan", number: 18, name: "Christopher Nkunku", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Napoli (25/26)
  makePlayer({ teamId: "seriea_napoli", number: 1, name: "Alex Meret", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 14, name: "Nikita Contini", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 25, name: "Mathias Ferrante", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 32, name: "Vanja Milinkovic Savic", pos: "GK", role: "GK", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "seriea_napoli", number: 4, name: "Alessandro Buongiorno", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 5, name: "Juan Jesus", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_napoli", number: 13, name: "Amir Rrahmani", pos: "DF", role: "CB", flag: "🇽🇰", nationality: "Kosovo" }),
  makePlayer({ teamId: "seriea_napoli", number: 31, name: "Sam Beukema", pos: "DF", role: "CB", flag: "🇳🇱", nationality: "Netherlands" }),

  makePlayer({ teamId: "seriea_napoli", number: 21, name: "Matteo Politano", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 22, name: "Giovanni Di Lorenzo (C)", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 30, name: "Pasquale Mazzocchi", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_napoli", number: 3, name: "Miguel Gutierrez", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_napoli", number: 17, name: "Mathias Olivera", pos: "DF", role: "LM", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "seriea_napoli", number: 37, name: "Leonardo Spinazzola", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_napoli", number: 6, name: "Billy Gilmour", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),
  makePlayer({ teamId: "seriea_napoli", number: 8, name: "Scott McTominay", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),
  makePlayer({ teamId: "seriea_napoli", number: 68, name: "Stanislav Lobotka", pos: "MF", role: "CM", flag: "🇸🇰", nationality: "Slovakia" }),
  makePlayer({ teamId: "seriea_napoli", number: 99, name: "Andre Anguissa", pos: "MF", role: "CM", flag: "🇨🇲", nationality: "Cameroon" }),

  makePlayer({ teamId: "seriea_napoli", number: 7, name: "David Neres", pos: "FW", role: "RAM", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_napoli", number: 11, name: "Kevin De Bruyne", pos: "FW", role: "RAM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_napoli", number: 20, name: "Eljif Elmas", pos: "FW", role: "RAM", flag: "🇲🇰", nationality: "North Macedonia" }),

  makePlayer({ teamId: "seriea_napoli", number: 26, name: "Antonio Vergara", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_napoli", number: 27, name: "Alisson Santos", pos: "FW", role: "LAM", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "seriea_napoli", number: 9, name: "Romelu Lukaku", pos: "FW", role: "CF", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_napoli", number: 19, name: "Rasmus Hojlund", pos: "FW", role: "CF", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_napoli", number: 23, name: "Giovane", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),

  // Parma (25/26)
  makePlayer({ teamId: "seriea_parma", number: 31, name: "Zion Suzuki", pos: "GK", role: "GK", flag: "🇯🇵", nationality: "Japan" }),
  makePlayer({ teamId: "seriea_parma", number: 40, name: "Edoardo Corvi", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_parma", number: 66, name: "Filippo Rinaldi", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_parma", number: 3, name: "Abdoulaye Ndiaye", pos: "DF", role: "CB", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "seriea_parma", number: 5, name: "Lautaro Valenti", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_parma", number: 37, name: "Mariano Troilo", pos: "DF", role: "CB", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_parma", number: 39, name: "Alessandro Circati", pos: "DF", role: "CB", flag: "🇦🇺", nationality: "Australia" }),

  makePlayer({ teamId: "seriea_parma", number: 15, name: "Enrico Delprato (C)", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_parma", number: 27, name: "Sascha Britschgi", pos: "DF", role: "RM", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "seriea_parma", number: 14, name: "Emanuele Valeri", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_parma", number: 29, name: "Franco Carboni", pos: "DF", role: "LM", flag: "🇦🇷", nationality: "Argentina" }),

  makePlayer({ teamId: "seriea_parma", number: 8, name: "Nahuel Estevez", pos: "MF", role: "DM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_parma", number: 41, name: "Hans Nicolussi", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_parma", number: 10, name: "Adrian Bernabe", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_parma", number: 11, name: "Pontus Almqvist", pos: "MF", role: "CM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_parma", number: 16, name: "Mandela Keita", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_parma", number: 22, name: "Oliver Sorensen", pos: "MF", role: "CM", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_parma", number: 24, name: "Christian Ordonez", pos: "MF", role: "CM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_parma", number: 25, name: "Benja Cremaschi", pos: "MF", role: "CM", flag: "🇺🇸", nationality: "USA" }),

  makePlayer({ teamId: "seriea_parma", number: 7, name: "Gabriel Strefezza", pos: "FW", role: "CF", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_parma", number: 9, name: "Mateo Pellegrino", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_parma", number: 17, name: "Jacob Ondrejka", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_parma", number: 20, name: "Matija Frigan", pos: "FW", role: "CF", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_parma", number: 21, name: "Gaetano Oristanio", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_parma", number: 23, name: "Nesta Elphege", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Pisa (25/26)
  makePlayer({ teamId: "seriea_pisa", number: 1, name: "Adrian Semper", pos: "GK", role: "GK", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_pisa", number: 12, name: "Nicolas", pos: "GK", role: "GK", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_pisa", number: 22, name: "Simone Scuffet", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_pisa", number: 2, name: "Rosen Bozhinov", pos: "DF", role: "CB", flag: "🇧🇬", nationality: "Bulgaria" }),
  makePlayer({ teamId: "seriea_pisa", number: 4, name: "Antonio Caracciolo (C)", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 5, name: "Simone Canestrelli", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 26, name: "Francesco Coppola", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 33, name: "Arturo Calabresi", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 39, name: "Raul Albiol", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_pisa", number: 44, name: "Daniel Denoon", pos: "DF", role: "CB", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "seriea_pisa", number: 11, name: "Juan Cuadrado", pos: "DF", role: "RM", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_pisa", number: 15, name: "Idrissa Toure", pos: "DF", role: "RM", flag: "🇩🇪", nationality: "Germany" }),

  makePlayer({ teamId: "seriea_pisa", number: 3, name: "Samuele Angori", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 7, name: "Mehdi Leris", pos: "DF", role: "LM", flag: "🇩🇿", nationality: "Algeria" }),
  makePlayer({ teamId: "seriea_pisa", number: 19, name: "Samuel Iling Junior", pos: "DF", role: "LM", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),

  makePlayer({ teamId: "seriea_pisa", number: 6, name: "Marius Marin", pos: "MF", role: "DM", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "seriea_pisa", number: 8, name: "Malthe Hojholt", pos: "MF", role: "DM", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "seriea_pisa", number: 14, name: "Ebenezer Akinsanmiro", pos: "MF", role: "CM", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_pisa", number: 20, name: "Michel Aebischer", pos: "MF", role: "CM", flag: "🇨🇭", nationality: "Switzerland" }),
  makePlayer({ teamId: "seriea_pisa", number: 21, name: "Isak Vural", pos: "MF", role: "CM", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "seriea_pisa", number: 23, name: "Calvin Stengs", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_pisa", number: 35, name: "Felipe Loyola", pos: "MF", role: "CM", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "seriea_pisa", number: 36, name: "Gabriele Piccinini", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 99, name: "Lorran", pos: "MF", role: "CM", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "seriea_pisa", number: 9, name: "Henrik Meister", pos: "FW", role: "CF", flag: "🇩🇰", nationality: "Denmark" }),
  makePlayer({ teamId: "seriea_pisa", number: 10, name: "Matteo Tramoni", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_pisa", number: 17, name: "Rafiu Durosinmi", pos: "FW", role: "CF", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_pisa", number: 32, name: "Stefano Moreo", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_pisa", number: 81, name: "Filip Stojilkovic", pos: "FW", role: "CF", flag: "🇨🇭", nationality: "Switzerland" }),

  // AS Roma (25/26)
  makePlayer({ teamId: "seriea_as_roma", number: 91, name: "Radoslaw Zelezny", pos: "GK", role: "GK", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_as_roma", number: 95, name: "Pierluigi Gollini", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_as_roma", number: 99, name: "Mile Svilar", pos: "GK", role: "GK", flag: "🇷🇸", nationality: "Serbia" }),

  makePlayer({ teamId: "seriea_as_roma", number: 5, name: "Evan Ndicka", pos: "DF", role: "CB", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_as_roma", number: 22, name: "Mario Hermoso", pos: "DF", role: "CB", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_as_roma", number: 23, name: "Gianluca Mancini", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_as_roma", number: 24, name: "Jan Ziolkowski", pos: "DF", role: "CB", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_as_roma", number: 87, name: "Daniele Ghilardi", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_as_roma", number: 2, name: "Devyne Rensch", pos: "DF", role: "RM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_as_roma", number: 19, name: "Zeki Celik", pos: "DF", role: "RM", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "seriea_as_roma", number: 43, name: "Wesley", pos: "DF", role: "RM", flag: "🇧🇷", nationality: "Brazil" }),

  makePlayer({ teamId: "seriea_as_roma", number: 3, name: "Angelino", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_as_roma", number: 12, name: "Kostas Tsimikas", pos: "DF", role: "LM", flag: "🇬🇷", nationality: "Greece" }),

  makePlayer({ teamId: "seriea_as_roma", number: 4, name: "Bryan Cristante (C)", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_as_roma", number: 8, name: "Neil El Aynaoui", pos: "MF", role: "CM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_as_roma", number: 17, name: "Manu Kone", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_as_roma", number: 61, name: "Niccolo Pisilli", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_as_roma", number: 18, name: "Matias Soule", pos: "FW", role: "RAM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_as_roma", number: 21, name: "Paulo Dybala", pos: "FW", role: "RAM", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_as_roma", number: 97, name: "Bryan Zaragoza", pos: "FW", role: "RAM", flag: "🇪🇸", nationality: "Spain" }),

  makePlayer({ teamId: "seriea_as_roma", number: 7, name: "Lorenzo Pellegrini", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_as_roma", number: 20, name: "Lorenzo Venturino", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_as_roma", number: 92, name: "Stephan El Shaarawy", pos: "FW", role: "LAM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_as_roma", number: 9, name: "Artem Dovbyk", pos: "FW", role: "CF", flag: "🇺🇦", nationality: "Ukraine" }),
  makePlayer({ teamId: "seriea_as_roma", number: 11, name: "Evan Ferguson", pos: "FW", role: "CF", flag: "🇮🇪", nationality: "Ireland" }),
  makePlayer({ teamId: "seriea_as_roma", number: 14, name: "Donyell Malen", pos: "FW", role: "CF", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_as_roma", number: 78, name: "Robinio Vaz", pos: "FW", role: "CF", flag: "🇫🇷", nationality: "France" }),

  // Sassuolo (25/26)
  makePlayer({ teamId: "seriea_sassuolo", number: 12, name: "Giacomo Satalino", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 13, name: "Stefano Turati", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 16, name: "Gioele Zacchi", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 49, name: "Arijanet Muric", pos: "GK", role: "GK", flag: "🇽🇰", nationality: "Kosovo" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 5, name: "Fali Cande", pos: "DF", role: "CB", flag: "🇬🇼", nationality: "Guinea-Bissau" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 19, name: "Filippo Romagna (C)", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 21, name: "Jay Idzes", pos: "DF", role: "CB", flag: "🇮🇩", nationality: "Indonesia" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 66, name: "Pedro Felipe", pos: "DF", role: "CB", flag: "🇧🇷", nationality: "Brazil" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 80, name: "Tarik Muharemovic", pos: "DF", role: "CB", flag: "🇧🇦", nationality: "Bosnia" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 6, name: "Sebastian Walukiewicz", pos: "DF", role: "RB", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 25, name: "Woyo Coulibaly", pos: "DF", role: "RB", flag: "🇲🇱", nationality: "Mali" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 3, name: "Josh Doig", pos: "DF", role: "LB", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 15, name: "Edoardo Pieragnolo", pos: "DF", role: "LB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 23, name: "Ulisses Garcia", pos: "DF", role: "LB", flag: "🇨🇭", nationality: "Switzerland" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 18, name: "Nemanja Matic", pos: "MF", role: "DM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 35, name: "Luca Lipani", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 11, name: "Daniel Boloca", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 40, name: "Aster Vranckx", pos: "MF", role: "CM", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 42, name: "Kristian Thorstvedt", pos: "MF", role: "CM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 44, name: "Edoardo Iannoni", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 50, name: "Darryl Bakola", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 90, name: "Ismael Kone", pos: "MF", role: "CM", flag: "🇨🇦", nationality: "Canada" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 7, name: "Cristian Volpato", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 10, name: "Domenico Berardi (C)", pos: "FW", role: "RW", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 20, name: "Alieu Fadera", pos: "FW", role: "LW", flag: "🇬🇲", nationality: "Gambia" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 45, name: "Armand Lauriente", pos: "FW", role: "LW", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_sassuolo", number: 8, name: "M'Bala Nzola", pos: "FW", role: "CF", flag: "🇦🇴", nationality: "Angola" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 24, name: "Luca Moro", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_sassuolo", number: 99, name: "Andrea Pinamonti", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),

  // Torino (25/26)
  makePlayer({ teamId: "seriea_torino", number: 1, name: "Alberto Paleari", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_torino", number: 81, name: "Franco Israel", pos: "GK", role: "GK", flag: "🇺🇾", nationality: "Uruguay" }),
  makePlayer({ teamId: "seriea_torino", number: 99, name: "Lapo Siviero", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_torino", number: 13, name: "Guillermo Maripan", pos: "DF", role: "CB", flag: "🇨🇱", nationality: "Chile" }),
  makePlayer({ teamId: "seriea_torino", number: 15, name: "Saba Sazonov", pos: "DF", role: "CB", flag: "🇬🇪", nationality: "Georgia" }),
  makePlayer({ teamId: "seriea_torino", number: 23, name: "Saul Coco", pos: "DF", role: "CB", flag: "🇬🇶", nationality: "Equatorial Guinea" }),
  makePlayer({ teamId: "seriea_torino", number: 35, name: "Luca Marianucci", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_torino", number: 44, name: "Ardian Ismajli", pos: "DF", role: "CB", flag: "🇦🇱", nationality: "Albania" }),
  makePlayer({ teamId: "seriea_torino", number: 77, name: "Enzo Ebosse", pos: "DF", role: "CB", flag: "🇨🇲", nationality: "Cameroon" }),

  makePlayer({ teamId: "seriea_torino", number: 16, name: "Marcus Pedersen", pos: "DF", role: "RM", flag: "🇳🇴", nationality: "Norway" }),
  makePlayer({ teamId: "seriea_torino", number: 20, name: "Valentino Lazaro", pos: "DF", role: "RM", flag: "🇦🇹", nationality: "Austria" }),

  makePlayer({ teamId: "seriea_torino", number: 7, name: "Zakaria Aboukhlal", pos: "DF", role: "LM", flag: "🇲🇦", nationality: "Morocco" }),
  makePlayer({ teamId: "seriea_torino", number: 25, name: "Niels Nkounkou", pos: "DF", role: "LM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_torino", number: 33, name: "Rafa Obrador", pos: "DF", role: "LM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_torino", number: 34, name: "Cristiano Biraghi", pos: "DF", role: "LM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_torino", number: 4, name: "Matteo Prati", pos: "MF", role: "DM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_torino", number: 61, name: "Adrien Tamezr", pos: "MF", role: "DM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_torino", number: 6, name: "Emirhan Ilkhan", pos: "MF", role: "CM", flag: "🇹🇷", nationality: "Turkey" }),
  makePlayer({ teamId: "seriea_torino", number: 8, name: "Ivan Ilic", pos: "MF", role: "CM", flag: "🇷🇸", nationality: "Serbia" }),
  makePlayer({ teamId: "seriea_torino", number: 10, name: "Nikola Vlasic", pos: "MF", role: "CM", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_torino", number: 14, name: "Tino Anjorin", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_torino", number: 22, name: "Cesare Casadei", pos: "MF", role: "CM", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_torino", number: 66, name: "Gvidas Gineitis", pos: "MF", role: "CM", flag: "🇱🇹", nationality: "Lithuania" }),
  makePlayer({ teamId: "seriea_torino", number: 79, name: "Zanos Savva", pos: "MF", role: "CM", flag: "🇨🇾", nationality: "Cyprus" }),
  makePlayer({ teamId: "seriea_torino", number: 83, name: "Sergiu Perciun", pos: "MF", role: "CM", flag: "🇲🇩", nationality: "Moldova" }),

  makePlayer({ teamId: "seriea_torino", number: 17, name: "Sandro Kulenovic", pos: "FW", role: "CF", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_torino", number: 18, name: "Giovanni Simeone", pos: "FW", role: "CF", flag: "🇦🇷", nationality: "Argentina" }),
  makePlayer({ teamId: "seriea_torino", number: 19, name: "Che Adams", pos: "FW", role: "CF", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),
  makePlayer({ teamId: "seriea_torino", number: 91, name: "Duvan Zapata (C)", pos: "FW", role: "CF", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_torino", number: 92, name: "Alieu Njie", pos: "FW", role: "CF", flag: "🇸🇪", nationality: "Sweden" }),

  // Udinese (25/26)
  makePlayer({ teamId: "seriea_udinese", number: 1, name: "Alessandro Nunziante", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_udinese", number: 40, name: "Maduka Okoye", pos: "GK", role: "GK", flag: "🇳🇬", nationality: "Nigeria" }),
  makePlayer({ teamId: "seriea_udinese", number: 90, name: "Razvan Sava", pos: "GK", role: "GK", flag: "🇷🇴", nationality: "Romania" }),
  makePlayer({ teamId: "seriea_udinese", number: 93, name: "Daniele Padelli", pos: "GK", role: "GK", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_udinese", number: 13, name: "Nicolo Bertola", pos: "DF", role: "CB", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_udinese", number: 22, name: "Branimir Mlacic", pos: "DF", role: "CB", flag: "🇭🇷", nationality: "Croatia" }),
  makePlayer({ teamId: "seriea_udinese", number: 27, name: "Christian Kabasele", pos: "DF", role: "CB", flag: "🇧🇪", nationality: "Belgium" }),
  makePlayer({ teamId: "seriea_udinese", number: 28, name: "Oumar Solet", pos: "DF", role: "CB", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_udinese", number: 31, name: "Thomas Kristensen", pos: "DF", role: "CB", flag: "🇩🇰", nationality: "Denmark" }),

  makePlayer({ teamId: "seriea_udinese", number: 19, name: "Kingsley Ehizibue", pos: "DF", role: "RM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_udinese", number: 59, name: "Alessandro Zanoli", pos: "DF", role: "RM", flag: "🇮🇹", nationality: "Italy" }),

  makePlayer({ teamId: "seriea_udinese", number: 11, name: "Hassane Kamara", pos: "DF", role: "LM", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_udinese", number: 20, name: "Juan Arizala", pos: "DF", role: "LM", flag: "🇨🇴", nationality: "Colombia" }),
  makePlayer({ teamId: "seriea_udinese", number: 33, name: "Jordan Zemura", pos: "DF", role: "LM", flag: "🇿🇼", nationality: "Zimbabwe" }),

  makePlayer({ teamId: "seriea_udinese", number: 8, name: "Jesper Karlstrom (C)", pos: "MF", role: "DM", flag: "🇸🇪", nationality: "Sweden" }),
  makePlayer({ teamId: "seriea_udinese", number: 29, name: "Abdoulaye Camara", pos: "MF", role: "DM", flag: "🇫🇷", nationality: "France" }),

  makePlayer({ teamId: "seriea_udinese", number: 6, name: "Oier Zarraga", pos: "MF", role: "CM", flag: "🇪🇸", nationality: "Spain" }),
  makePlayer({ teamId: "seriea_udinese", number: 14, name: "Arthur Atta", pos: "MF", role: "CM", flag: "🇫🇷", nationality: "France" }),
  makePlayer({ teamId: "seriea_udinese", number: 24, name: "Jakub Piotrowski", pos: "MF", role: "CM", flag: "🇵🇱", nationality: "Poland" }),
  makePlayer({ teamId: "seriea_udinese", number: 32, name: "Jurgen Ekkelenkamp", pos: "MF", role: "CM", flag: "🇳🇱", nationality: "Netherlands" }),
  makePlayer({ teamId: "seriea_udinese", number: 38, name: "Lennon Miller", pos: "MF", role: "CM", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", nationality: "Scotland" }),

  makePlayer({ teamId: "seriea_udinese", number: 7, name: "Idrissa Gueye", pos: "FW", role: "CF", flag: "🇸🇳", nationality: "Senegal" }),
  makePlayer({ teamId: "seriea_udinese", number: 9, name: "Keinan Davis", pos: "FW", role: "CF", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", nationality: "England" }),
  makePlayer({ teamId: "seriea_udinese", number: 10, name: "Nicolo Zaniolo", pos: "FW", role: "CF", flag: "🇮🇹", nationality: "Italy" }),
  makePlayer({ teamId: "seriea_udinese", number: 15, name: "Vakoun Bayo", pos: "FW", role: "CF", flag: "🇨🇮", nationality: "Ivory Coast" }),
  makePlayer({ teamId: "seriea_udinese", number: 18, name: "Adam Buksa", pos: "FW", role: "CF", flag: "🇵🇱", nationality: "Poland" }),

  // Bayern
  makePlayer({ teamId: "bundesliga_bayern", number: 1, name: "BO. Keeper", pos: "GK", age: 38, nationality: "Germany", heightCm: 193, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 2, name: "BP. Defender", pos: "DF", age: 29, nationality: "France", heightCm: 176, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 3, name: "BQ. Defender", pos: "DF", age: 23, nationality: "Netherlands", heightCm: 190, foot: "Left" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 4, name: "BR. Defender", pos: "DF", age: 27, nationality: "South Korea", heightCm: 190, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 5, name: "BS. Defender", pos: "DF", age: 23, nationality: "Canada", heightCm: 183, foot: "Left" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 6, name: "BT. Midfield", pos: "MF", age: 29, nationality: "Germany", heightCm: 188, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 8, name: "BU. Midfield", pos: "MF", age: 21, nationality: "Germany", heightCm: 177, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 10, name: "BV. Midfield", pos: "MF", age: 34, nationality: "Germany", heightCm: 176, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 7, name: "BW. Winger", pos: "FW", age: 28, nationality: "Germany", heightCm: 178, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 9, name: "BX. Striker", pos: "FW", age: 30, nationality: "England", heightCm: 188, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_bayern", number: 11, name: "BY. Winger", pos: "FW", age: 29, nationality: "France", heightCm: 176, foot: "Right" }),

  // Dortmund
  makePlayer({ teamId: "bundesliga_dortmund", number: 1, name: "BZ. Keeper", pos: "GK", age: 33, nationality: "Switzerland", heightCm: 194, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 2, name: "CA. Defender", pos: "DF", age: 24, nationality: "Germany", heightCm: 178, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 3, name: "CB. Defender", pos: "DF", age: 28, nationality: "Germany", heightCm: 190, foot: "Left" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 4, name: "CC. Defender", pos: "DF", age: 22, nationality: "Germany", heightCm: 187, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 5, name: "CD. Defender", pos: "DF", age: 28, nationality: "Germany", heightCm: 183, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 6, name: "CE. Midfield", pos: "MF", age: 34, nationality: "Germany", heightCm: 183, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 8, name: "CF. Midfield", pos: "MF", age: 25, nationality: "Austria", heightCm: 188, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 10, name: "CG. Midfield", pos: "MF", age: 20, nationality: "Germany", heightCm: 173, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 7, name: "CH. Winger", pos: "FW", age: 19, nationality: "Germany", heightCm: 182, foot: "Left" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 9, name: "CI. Striker", pos: "FW", age: 30, nationality: "Guinea", heightCm: 187, foot: "Right" }),
  makePlayer({ teamId: "bundesliga_dortmund", number: 11, name: "CJ. Winger", pos: "FW", age: 25, nationality: "Netherlands", heightCm: 179, foot: "Right" }),

  // PSG
  makePlayer({ teamId: "ligue1_psg", number: 1, name: "CK. Keeper", pos: "GK", age: 25, nationality: "Italy", heightCm: 196, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 2, name: "CL. Defender", pos: "DF", age: 28, nationality: "Morocco", heightCm: 185, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 3, name: "CM. Defender", pos: "DF", age: 30, nationality: "Brazil", heightCm: 183, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 4, name: "CN. Defender", pos: "DF", age: 29, nationality: "France", heightCm: 191, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 5, name: "CO. Defender", pos: "DF", age: 25, nationality: "Portugal", heightCm: 187, foot: "Left" }),
  makePlayer({ teamId: "ligue1_psg", number: 6, name: "CP. Midfield", pos: "MF", age: 19, nationality: "France", heightCm: 178, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 8, name: "CQ. Midfield", pos: "MF", age: 30, nationality: "Spain", heightCm: 174, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 10, name: "CR. Midfield", pos: "MF", age: 28, nationality: "France", heightCm: 178, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 7, name: "CS. Winger", pos: "FW", age: 19, nationality: "France", heightCm: 178, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 9, name: "CT. Forward", pos: "FW", age: 25, nationality: "Portugal", heightCm: 187, foot: "Right" }),
  makePlayer({ teamId: "ligue1_psg", number: 11, name: "CU. Winger", pos: "FW", age: 27, nationality: "France", heightCm: 178, foot: "Right" }),

  // Marseille
  makePlayer({ teamId: "ligue1_marseille", number: 1, name: "CV. Keeper", pos: "GK", age: 32, nationality: "Argentina", heightCm: 189, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 2, name: "CW. Defender", pos: "DF", age: 27, nationality: "France", heightCm: 182, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 3, name: "CX. Defender", pos: "DF", age: 30, nationality: "France", heightCm: 186, foot: "Left" }),
  makePlayer({ teamId: "ligue1_marseille", number: 4, name: "CY. Defender", pos: "DF", age: 24, nationality: "DR Congo", heightCm: 188, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 5, name: "CZ. Defender", pos: "DF", age: 25, nationality: "France", heightCm: 180, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 6, name: "DA. Midfield", pos: "MF", age: 22, nationality: "Morocco", heightCm: 185, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 8, name: "DB. Midfield", pos: "MF", age: 26, nationality: "France", heightCm: 174, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 10, name: "DC. Midfield", pos: "MF", age: 29, nationality: "England", heightCm: 186, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 7, name: "DD. Winger", pos: "FW", age: 27, nationality: "France", heightCm: 175, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 9, name: "DE. Striker", pos: "FW", age: 25, nationality: "Gabon", heightCm: 187, foot: "Right" }),
  makePlayer({ teamId: "ligue1_marseille", number: 11, name: "DF. Winger", pos: "FW", age: 23, nationality: "France", heightCm: 182, foot: "Left" }),
];

const WC_SEED = buildWorldCupSeed();
TEAMS.push(...WC_SEED.teams);
PLAYERS.push(...WC_SEED.players);

{
  const wcStandings = MINI_STANDINGS.find((x) => x.leagueId === "worldcup");
  if (wcStandings) {
    wcStandings.groups = buildWorldCupGroupsSeed();
    wcStandings.rows = [];
  }
}

const FC_SEED = {
  leagues: LEAGUES,
  heroLeagueTabs: HERO_LEAGUE_TABS,
  leagueUi: LEAGUE_UI,
  teams: TEAMS,
  players: PLAYERS,
  matches: MATCHES,
  miniStandings: MINI_STANDINGS,
  topScorers: TOP_SCORERS,
  transfers: TRANSFERS,
  leagueMeta: typeof FCDataStore !== "undefined" ? FCDataStore.defaultLeagueMeta() : {},
};

const FC_ARRAYS = {
  teams: TEAMS,
  players: PLAYERS,
  matches: MATCHES,
  miniStandings: MINI_STANDINGS,
  topScorers: TOP_SCORERS,
  transfers: TRANSFERS,
};

function byId(arr) {
  const map = new Map();
  for (const item of arr) map.set(item.id, item);
  return map;
}

let teamById = byId(TEAMS);
let lineupRosterIndex = new Map();

function rebuildTeamIndex() {
  teamById = byId(TEAMS);
}

function rebuildLineupRosterIndex() {
  lineupRosterIndex = new Map();
  for (const p of PLAYERS) {
    if (!p?.teamId) continue;
    if (!lineupRosterIndex.has(p.teamId)) lineupRosterIndex.set(p.teamId, new Map());
    const key = `${p.number}|${normLineupName(p.name)}`;
    lineupRosterIndex.get(p.teamId).set(key, p);
  }
}

function markSeedReady() {
  syncLeagueConfigFromStore();
  refreshNationalityFlagsLearn();
  rebuildTeamIndex();
  rebuildLineupRosterIndex();
  window.__FC_SEED_READY__ = true;
  document.dispatchEvent(new CustomEvent("fc-data-ready"));
}

const FC_IS_ADMIN_PAGE = document.body?.dataset?.page === "admin";

if (typeof FCDataStore !== "undefined") {
  FCDataStore.init(FC_SEED);
  FCDataStore.hydrateInPlace(FC_ARRAYS);
  syncLeagueConfigFromStore();

  if (FC_IS_ADMIN_PAGE) {
    markSeedReady();
    FCDataStore.bootstrapSeed(FC_SEED, FC_ARRAYS, { preferPublishedCatalog: false }).catch((err) => {
      console.warn("data.json refresh failed:", err);
    });
  } else {
    FCDataStore.bootstrapSeed(FC_SEED, FC_ARRAYS, { preferPublishedCatalog: true })
      .then(markSeedReady)
      .catch((err) => {
        console.warn("data.json load failed, using built-in seed:", err);
        markSeedReady();
      });
  }
} else {
  markSeedReady();
}

function resolveLineupRosterPlayer(teamId, slot) {
  if (!teamId || !slot) return null;
  return lineupRosterIndex.get(teamId)?.get(`${slot.number}|${normLineupName(slot.name)}`) ?? null;
}

const DISPLAY_LAST_NAME_MAX = 20;

function deriveLastNameFromFullName(name) {
  const clean = stripCaptainSuffix(name);
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : clean;
}

/** Short label for pitch/lineup views — uses roster displayLastName when set. */
function playerDisplayLastName({ player, teamId, lineupSlot } = {}) {
  const roster = player ?? (teamId && lineupSlot ? resolveLineupRosterPlayer(teamId, lineupSlot) : null);
  const custom = String(roster?.displayLastName ?? "").trim();
  if (custom) return custom.slice(0, DISPLAY_LAST_NAME_MAX);
  const fullName = roster?.name ?? lineupSlot?.name ?? "";
  return deriveLastNameFromFullName(fullName);
}

function enrichFormationRowsDisplay(teamId, rows) {
  if (!rows?.length) return rows;
  return rows.map((row) =>
    row.map((slot) => ({
      ...slot,
      displayLastName: playerDisplayLastName({ teamId, lineupSlot: slot }),
    })),
  );
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Roster names may include " (C)" manually; lineup UI uses a separate captain flag. */
function stripCaptainSuffix(name) {
  return String(name ?? "").replace(/\s*\(C\)\s*$/i, "").trim();
}

function playerNameMarksCaptain(name) {
  return /\s*\(C\)\s*$/i.test(String(name ?? "").trim());
}

function formatLineupDisplayName(name, captain) {
  const base = stripCaptainSuffix(name);
  if (captain || playerNameMarksCaptain(name)) return `${base} (C)`;
  return base;
}

function isCaptainPlayer(p) {
  if (!p) return false;
  if (p.captain) return true;
  return playerNameMarksCaptain(p.name);
}

function openModal({ title, bodyHtml, primaryLabel = "Done" }) {
  const dlg = $("#modal");
  const titleEl = $("#modalTitle");
  const bodyEl = $("#modalBody");
  const primary = $("#modalPrimary");

  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHtml;
  primary.textContent = primaryLabel;

  if (typeof dlg.showModal === "function") dlg.showModal();
  else alert(`${title}\n\n${bodyEl.textContent}`);
}

function applyTheme(theme) {
  const locked = theme === "light" ? "dark" : theme;
  document.documentElement.dataset.theme = locked;
  document.documentElement.dataset.bsTheme = locked;
  try {
    localStorage.setItem(STORAGE_THEME_KEY, locked);
  } catch {
    // ignore
  }
}

function setupTheme() {
  applyTheme("dark");
}

function setupSidebarNav() {
  const topLinks = $$(".topbar-nav a[href^='#'], .home-tabbar__tab[href^='#']");
  const sidebar = $("#contextSidebar");
  const panels = $$("[data-sidebar-panel]");
  const pageWrapper = $(".page-wrapper");
  const contextualSections = new Set(["squads", "match-center", "transfers"]);
  const sectionIds = ["main", "squads", "match-center", "transfers", "about"];
  const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);

  const setNavActive = (id) => {
    const sectionId = id || "main";
    for (const link of topLinks) {
      const href = link.getAttribute("href") ?? "";
      const match = href === `#${sectionId}` || (sectionId === "main" && (href === "#" || href === "#main"));
      link.classList.toggle("active", match);
      link.closest("li")?.classList.toggle("active", match);
    }
  };

  const setSectionLayout = (id) => {
    const sectionId = id || "main";
    const onHome = sectionId === "main" || sectionId === "about";
    const showSidebar = contextualSections.has(sectionId);
    pageWrapper?.classList.toggle("page-wrapper--home", onHome);
    pageWrapper?.classList.toggle("page-wrapper--section", showSidebar);
    if (sidebar) sidebar.hidden = !showSidebar;

    for (const panel of panels) {
      const panelId = panel.getAttribute("data-sidebar-panel");
      panel.hidden = !showSidebar || panelId !== sectionId;
    }
  };

  const activateSection = (id, { layout = true } = {}) => {
    const sectionId = id || "main";
    setNavActive(sectionId);
    if (layout) setSectionLayout(sectionId);
  };

  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const id = visible[0]?.target?.id;
        if (!id) return;
        setNavActive(id);
        if (id === "main" || id === "about") setSectionLayout("main");
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.12, 0.3] },
    );
    for (const sec of sections) io.observe(sec);
  }

  for (const link of topLinks) {
    link.addEventListener("click", () => {
      const id = (link.getAttribute("href") ?? "#main").replace("#", "") || "main";
      activateSection(id, { layout: true });
    });
  }

  for (const link of $$(".sidebar-item[data-sidebar-focus]")) {
    link.addEventListener("click", (e) => {
      const targetId = link.getAttribute("data-sidebar-focus");
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!(target instanceof HTMLElement)) return;
      e.preventDefault();
      const sectionHref = link.getAttribute("href") ?? "";
      if (sectionHref.startsWith("#")) {
        const section = document.getElementById(sectionHref.slice(1));
        section?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      window.setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (target.matches("input, select, textarea, button")) target.focus({ preventScroll: true });
        else target.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
      }, 280);
    });
  }

  const initial = (location.hash || "#main").replace("#", "") || "main";
  activateSection(initial, { layout: true });
}

function setupAdminNavVisibility() {
  const show = globalThis.FCDataStore?.isAuthed?.() === true;
  for (const el of $$("[data-admin-only]")) el.hidden = !show;
}

function setupNav() {
  const toggle = $(".nav-toggle");
  const menu = $("#nav-menu");
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    menu.dataset.open = open ? "true" : "false";
  };

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
  });

  for (const link of $$(".nav-link", menu)) link.addEventListener("click", () => setOpen(false));

  document.addEventListener("click", (e) => {
    if (!menu.dataset.open || menu.dataset.open !== "true") return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (menu.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  });
}

function teamBrandColor(team) {
  const c = team?.colors?.[0];
  return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : "#378ADD";
}

function matchCardBrandAttrs(ht, at, { featured = false } = {}) {
  const home = teamBrandColor(ht);
  const away = teamBrandColor(at);
  let classExtra = "match-card--branded";
  if (featured) classExtra += " match-card--featured";
  return {
    classExtra,
    styleAttr: `style="--mc-home:${home};--mc-away:${away}"`,
  };
}

function teamCrestHtml(team, { className = "", size = 32, attrs = "" } = {}) {
  const shellSize = size >= 40 ? "team-crest-shell--md" : "team-crest-shell--sm";
  const extraClass = className ? ` ${className}` : "";
  const extra = attrs ? ` ${attrs}` : "";
  if (!team) {
    return `<span class="team-crest-shell ${shellSize} team-crest-shell--empty${extraClass}"${extra} aria-hidden="true"></span>`;
  }
  const logo = team.logo ? String(team.logo).trim() : "";
  if (logo) {
    return `<span class="team-crest-shell ${shellSize}${extraClass}"${extra} aria-hidden="true"><img class="team-crest-shell__img" src="${escapeHtml(logo)}" alt="" width="64" height="64" loading="lazy" decoding="async" /></span>`;
  }
  const [c1, c2] = team.colors ?? ["#1e2d45", "#253d5e"];
  const initials = String(team.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `<span class="team-crest-shell ${shellSize} team-crest-shell--fallback${extraClass}"${extra} style="background:linear-gradient(135deg,${c1},${c2})" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function crestStyle(teamId) {
  const t = teamById.get(teamId);
  if (!t) return "";
  const [c1, c2] = t.colors;
  const logo = t.logo ? String(t.logo) : "";
  const base = `radial-gradient(18px 18px at 35% 25%, rgba(255,255,255,.45), transparent), linear-gradient(135deg, ${c1}, ${c2})`;
  if (!logo) return `style="background: ${base}; border: 1px solid var(--border);"`;
  return `style="background-image: url('${escapeHtml(logo)}'), ${base}; background-repeat: no-repeat; background-position: center; background-size: cover, cover; border: 1px solid var(--border);"`;
}

/** Flat club logo (matches Clubs list chips — logo only, neutral tile). */
function clubLogoHtml(teamOrId, classes = "club-crest") {
  const t = typeof teamOrId === "string" ? teamById.get(teamOrId) : teamOrId;
  const size = classes.includes("club-crest") && !classes.includes("squad-crest") ? 40 : 32;
  return teamCrestHtml(t, { className: classes, size });
}

function teamsForLeague(leagueId) {
  return TEAMS.filter((t) => t.leagueId === leagueId).sort(compareTeamOrder);
}

function compareTeamOrder(a, b) {
  const ao = a.sortOrder ?? 1e9;
  const bo = b.sortOrder ?? 1e9;
  if (ao !== bo) return ao - bo;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
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
  return PLAYERS.filter((p) => p.teamId === teamId).sort(comparePlayerOrder);
}

function setupBackToTop() {
  const btn = $("#backToTop");
  if (!btn) return;
  const showAt = 420;
  const onScroll = () => {
    btn.classList.toggle("is-visible", window.scrollY > showAt);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function setupBootstrapUI() {
  if (typeof bootstrap === "undefined") return;
  for (const el of $$('[data-bs-toggle="tooltip"]')) {
    bootstrap.Tooltip.getOrCreateInstance(el);
  }
}

function renderLeagueOptions() {
  const sel = $("#leagueSelect");
  if (!sel) return;
  sel.innerHTML = LEAGUES.map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join("");
}

function leaguePillButtonHtml(l, activeLeagueId) {
  const selected = l.id === activeLeagueId;
  return `
    <button
      type="button"
      class="league-tab${selected ? " active" : ""}"
      data-league-pill="${escapeHtml(l.id)}"
      aria-selected="${selected ? "true" : "false"}"
    >
      ${escapeHtml(l.name)}
    </button>
  `;
}

function renderLeaguePills(activeLeagueId) {
  const wrap = $("#leaguePills");
  const moreMount = $("#homeRailMoreMount");
  if (!wrap) return;

  const list = LEAGUES.filter((l) => HERO_LEAGUE_TABS.includes(l.id));

  wrap.innerHTML = list.map((l) => leaguePillButtonHtml(l, activeLeagueId)).join("");

  for (const btn of $$("[data-league-pill]", wrap)) {
    btn.addEventListener("click", () => {
      const leagueId = btn.getAttribute("data-league-pill");
      if (leagueId) {
        closeHomeRailMore();
        setActiveLeague(leagueId);
      }
    });
  }

  if (moreMount) {
    if (list.length > 1) {
      moreMount.innerHTML = `
        <div class="home-rail__more" id="homeRailMore">
          <button
            type="button"
            class="league-tab league-tab--more"
            id="homeRailMoreBtn"
            aria-expanded="false"
            aria-haspopup="listbox"
            aria-label="Show all ${list.length} competitions"
          ><span class="home-rail__more-icon" aria-hidden="true"></span><span class="home-rail__more-text">All</span></button>
          <div class="home-rail__more-menu" id="homeRailMoreMenu" role="listbox" aria-label="All competitions" hidden>
            ${list
              .map((l) => {
                const selected = l.id === activeLeagueId;
                return `
                  <button
                    type="button"
                    class="home-rail__more-item${selected ? " active" : ""}"
                    data-league-pill="${escapeHtml(l.id)}"
                    role="option"
                    aria-selected="${selected ? "true" : "false"}"
                  >
                    ${escapeHtml(l.name)}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
      moreMount.hidden = false;
      wireHomeRailMore();
    } else {
      moreMount.innerHTML = "";
      moreMount.hidden = true;
    }
  }

  updateHomeRailArrows();
  refreshHomeEntranceAnimations();

  const scroller = $("#leaguePillsScroll");
  if (scroller) {
    const active = $(`[data-league-pill="${CSS.escape(activeLeagueId)}"]`, wrap);
    if (active instanceof HTMLElement) {
      requestAnimationFrame(() => {
        active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      });
    }
  }
}

function closeHomeRailMore() {
  const wrap = $("#homeRailMore");
  if (!wrap) return;
  wrap.classList.remove("home-rail__more--open");
  const menu = $("#homeRailMoreMenu");
  const btn = $("#homeRailMoreBtn");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

let homeRailMoreIgnoreClose = false;

function wireHomeRailMore() {
  const btn = $("#homeRailMoreBtn");
  const menu = $("#homeRailMoreMenu");
  const wrap = $("#homeRailMore");
  if (!btn || !menu || !wrap) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    homeRailMoreIgnoreClose = true;
    const opening = !wrap.classList.contains("home-rail__more--open");
    closeHomeRailMore();
    if (opening) {
      wrap.classList.add("home-rail__more--open");
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
    }
    window.setTimeout(() => {
      homeRailMoreIgnoreClose = false;
    }, 0);
  });

  for (const item of $$("[data-league-pill]", menu)) {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const leagueId = item.getAttribute("data-league-pill");
      if (!leagueId) return;
      closeHomeRailMore();
      setActiveLeague(leagueId);
    });
  }
}

function bindHomeRailMore() {
  if (document.documentElement.dataset.homeRailMoreBound === "1") return;
  document.documentElement.dataset.homeRailMoreBound = "1";

  document.addEventListener("click", (e) => {
    if (homeRailMoreIgnoreClose) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".home-rail__more")) return;
    closeHomeRailMore();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHomeRailMore();
  });
}

function setupLeagueSwitcherLayout() {
  bindHomeRailScroll();
  bindHomeSpotlightScroll();
  bindHomeRailMore();
  bindHeroStandingsExpand();
  bindHomeBentoViewToggle();

  const reposition = () => {
    updateHomeRailArrows();
  };
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reposition, 100);
  });
  $("#leaguePillsScroll")?.addEventListener("scroll", reposition, { passive: true });
}

function bindHomeRailScroll() {
  const rail = $(".home-rail");
  const scroller = $("#leaguePillsScroll");
  const prev = $("#homeRailPrev");
  const next = $("#homeRailNext");
  if (!rail || !scroller) return;

  const update = () => updateHomeRailArrows();

  prev?.addEventListener("click", () => {
    scroller.scrollBy({ left: -Math.max(120, scroller.clientWidth * 0.6), behavior: "smooth" });
  });
  next?.addEventListener("click", () => {
    scroller.scrollBy({ left: Math.max(120, scroller.clientWidth * 0.6), behavior: "smooth" });
  });

  scroller.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function updateHomeRailArrows() {
  const rail = $(".home-rail");
  const wrap = $("#homeRailScrollWrap");
  const scroller = $("#leaguePillsScroll");
  const prev = $("#homeRailPrev");
  const next = $("#homeRailNext");
  const hint = $("#homeRailScrollHint");
  if (!rail || !scroller || !prev || !next) return;

  const overflow = scroller.scrollWidth > scroller.clientWidth + 4;
  const show = overflow;
  const atStart = scroller.scrollLeft <= 2;
  const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;

  rail.classList.toggle("home-rail--scrollable", show);
  wrap?.classList.toggle("home-rail__scroll-wrap--fade-start", show && !atStart);
  wrap?.classList.toggle("home-rail__scroll-wrap--fade-end", show && !atEnd);
  if (hint) hint.hidden = !show;
  prev.hidden = !show;
  next.hidden = !show;
  if (!show) {
    prev.disabled = true;
    next.disabled = true;
    return;
  }

  prev.disabled = atStart;
  next.disabled = atEnd;
}

function updateHomeSpotlightScroll() {
  const wrap = $("#heroSpotlightWrap");
  const track = $("#heroSpotlight");
  const hint = $("#heroSpotlightHint");
  if (!wrap || !track) return;

  const overflow = track.scrollWidth > track.clientWidth + 4;
  const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  wrap.classList.toggle("home-spotlight__track-wrap--overflow-end", overflow && !atEnd);
  if (hint) hint.hidden = !overflow;
}

function bindHomeSpotlightScroll() {
  const track = $("#heroSpotlight");
  if (!track) return;
  const update = () => updateHomeSpotlightScroll();
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

function renderTeamOptions(leagueId) {
  const sel = $("#teamSelect");
  if (!sel) return;
  const teams = teamsForLeague(leagueId);
  sel.innerHTML = teams.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
}

function getRosterState() {
  const leagueId = $("#leagueSelect")?.value ?? LEAGUES[0].id;
  const teamId = $("#teamSelect")?.value ?? teamsForLeague(leagueId)[0]?.id;
  const pos = $("#positionSelect")?.value ?? "all";
  const q = ($("#playerSearch")?.value ?? "").trim().toLowerCase();
  return { leagueId, teamId, pos, q };
}

function playerMatches(p, { pos, q }) {
  if (pos !== "all" && p.pos !== pos) return false;
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || String(p.number).includes(q) || p.nationality.toLowerCase().includes(q);
}

function normLineupName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Count starting-XI appearances from match lineups (by shirt # + name). */
function buildLineupStartsMap(leagueId) {
  const byTeam = new Map();
  for (const p of PLAYERS) {
    const t = teamById.get(p.teamId);
    if (!t || (leagueId && t.leagueId !== leagueId)) continue;
    const key = `${p.number}|${normLineupName(p.name)}`;
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, new Map());
    byTeam.get(p.teamId).set(key, p.id);
  }

  const starts = new Map();
  for (const m of MATCHES) {
    if (leagueId && m.leagueId !== leagueId) continue;
    const sides = [
      [m.homeTeamId, m.lineups?.home],
      [m.awayTeamId, m.lineups?.away],
    ];
    for (const [teamId, xi] of sides) {
      if (!teamId || !xi?.length) continue;
      const lookup = byTeam.get(teamId);
      if (!lookup) continue;
      for (const slot of xi) {
        const key = `${slot.number}|${normLineupName(slot.name)}`;
        const pid = lookup.get(key);
        if (pid) starts.set(pid, (starts.get(pid) ?? 0) + 1);
      }
    }
  }
  return starts;
}

function lineupStartsFor(player, startsMap) {
  if (typeof player.starts === "number") return player.starts;
  return startsMap.get(player.id) ?? 0;
}

function formatLineupStarts(n) {
  return n > 0 ? String(n) : "—";
}

function normalizeInstagramUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!u.hostname.includes("instagram.com")) return "";
      const path = u.pathname.replace(/\/+$/, "");
      const parts = path.split("/").filter(Boolean);
      if (!parts.length) return "";
      return `https://www.instagram.com/${parts[0]}/`;
    } catch {
      return "";
    }
  }
  const user = s
    .replace(/^@+/, "")
    .replace(/^instagram\.com\//i, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!user || !/^[a-zA-Z0-9._]+$/.test(user)) return "";
  return `https://www.instagram.com/${user}/`;
}

function playerInstagramUrl(p) {
  return normalizeInstagramUrl(p?.instagram);
}

function instagramIconSvg() {
  return `<svg class="player-social-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
}

function playerSocialHtml(p) {
  const url = playerInstagramUrl(p);
  if (!url) return "";
  return `<a class="player-social-link player-social-link--ig" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram for ${escapeHtml(stripCaptainSuffix(p.name))}">${instagramIconSvg()}<span class="player-social-label">Instagram</span></a>`;
}

function openPlayerModal(p, startsMap = new Map(), leagueId) {
  const team = teamById.get(p.teamId);
  const role = p.role ?? POS_LABEL[p.pos] ?? p.pos;
  const cap = isCaptainPlayer(p) ? `<span class="squad-cap" title="Captain">C</span>` : "";
  const displayName = stripCaptainSuffix(p.name);
  const lid = leagueId ?? team?.leagueId ?? "";
  const showClub = isWorldCupLeague(lid) && leagueFeatureOn(lid, "playerClub");
  const showNat = leagueFeatureOn(lid, "playerNationality");
  const clubRow =
    showClub && p.club
      ? `<div class="squad-profile-stat">
            <span class="squad-profile-stat-label">Club</span>
            <span class="squad-profile-stat-value">${escapeHtml(p.club)}</span>
          </div>`
      : "";
  const natRow = showNat
    ? `<div class="squad-profile-stat">
            <span class="squad-profile-stat-label">Nationality</span>
            <span class="squad-profile-stat-value">
              ${squadFlagHtml(p)}
              ${escapeHtml(p.nationality ?? "—")}
            </span>
          </div>`
    : "";
  const ageRow = `<div class="squad-profile-stat">
            <span class="squad-profile-stat-label">Age</span>
            <span class="squad-profile-stat-value">${escapeHtml(formatPlayerAge(p))}</span>
          </div>`;
  const socialHtml = playerSocialHtml(p);
  openModal({
    title: displayName,
    bodyHtml: `
      <div class="squad-profile">
        <div class="squad-profile-hero">
          <span class="squad-profile-num" aria-hidden="true">${escapeHtml(p.number)}</span>
          <div class="squad-profile-copy min-w-0">
            <div class="squad-profile-name-row">
              <div class="squad-profile-name">${escapeHtml(displayName)}${cap}</div>
              ${socialHtml}
            </div>
            <div class="squad-profile-club">${escapeHtml(team?.name ?? "—")} · ${escapeHtml(role)}${showClub && p.club ? ` · ${escapeHtml(p.club)}` : ""}</div>
          </div>
        </div>
        <div class="squad-profile-grid">
          ${natRow}
          ${ageRow}
          ${clubRow}
          ${isCaptainPlayer(p) ? `<div class="squad-profile-stat"><span class="squad-profile-stat-label">Role</span><span class="squad-profile-stat-value">Club captain</span></div>` : ""}
        </div>
      </div>
    `,
    primaryLabel: "Close",
  });
}

function bindSquadRowClicks(root, startsMap, leagueId) {
  if (!root) return;
  for (const row of $$("[data-player]", root)) {
    const pid = row.getAttribute("data-player");
    const player = PLAYERS.find((x) => x.id === pid);
    if (!player) continue;
    row.addEventListener("click", () => {
      openPlayerModal(player, startsMap, leagueId);
      if (typeof row.blur === "function") row.blur();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPlayerModal(player, startsMap, leagueId);
      }
    });
  }
}

const ROSTER_VIEW_STORAGE = "fc_roster_view";
let rosterViewMode = "list";

function initRosterViewMode() {
  const saved = localStorage.getItem(ROSTER_VIEW_STORAGE);
  if (saved === "depth" || saved === "list") rosterViewMode = saved;
}

function syncRosterViewToggle() {
  const bar = $("#rosterViewBar");
  if (!bar) return;
  for (const btn of $$("[data-roster-view]", bar)) {
    const active = btn.dataset.rosterView === rosterViewMode;
    btn.classList.toggle("is-active", active);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function setRosterViewMode(mode) {
  rosterViewMode = mode === "depth" ? "depth" : "list";
  localStorage.setItem(ROSTER_VIEW_STORAGE, rosterViewMode);
  syncRosterViewToggle();
  renderRoster();
}

function renderSquadDepthPosNode(tag, players, isGk = false) {
  const label = escapeHtml(String(tag ?? "—").toUpperCase());
  const hasCap = players.some((p) => isCaptainPlayer(p));
  const capClass = hasCap ? " captain" : "";
  const namesHtml = players.length
    ? players
        .map((p) => {
          const short = playerDisplayLastName({ player: p });
          const cap = isCaptainPlayer(p) ? `<span class="depth-pos-cap" aria-hidden="true">C</span>` : "";
          return `<button type="button" class="depth-pos-name" data-player="${escapeHtml(p.id)}" aria-label="${escapeHtml(stripCaptainSuffix(p.name))}">${cap}${escapeHtml(short)}</button>`;
        })
        .join("")
    : `<span class="depth-empty muted">—</span>`;
  return `
    <div class="depth-pos-node${isGk ? " is-gk" : ""}">
      <div class="player-circle pitch-token depth-pos-badge${capClass}">${label}</div>
      <div class="depth-pos-names">${namesHtml}</div>
    </div>
  `;
}

function renderSquadDepthPitch(team, depth, leagueId) {
  if (typeof SquadDepth === "undefined") return "";
  const normalized = SquadDepth.normalizeSquadDepth(depth, team.formation);
  if (!SquadDepth.hasSquadDepthContent(normalized)) return "";

  const formation = normalized.formation || team.formation || "4-2-3-1";
  const playerMap = new Map(playersForTeam(team.id).map((p) => [p.id, p]));
  const gks = normalized.goalkeepers.map((id) => playerMap.get(id)).filter(Boolean);
  const slots = normalized.slots.map((s) => ({
    tag: s.tag,
    players: s.players.map((id) => playerMap.get(id)).filter(Boolean),
  }));
  const outfieldRows = SquadDepth.buildOutfieldRows(formation, slots);
  const rowCount = outfieldRows.length;
  const outfieldTopStart = 72;
  const outfieldTopEnd = 12;

  const gkHtml =
    gks.length > 0
      ? `<div class="depth-slot depth-slot--gk" style="left:50%;top:86%">${renderSquadDepthPosNode("GK", gks, true)}</div>`
      : "";

  const outfieldHtml = outfieldRows
    .map((row, r) => {
      const top = rowCount > 1 ? outfieldTopStart - (r / (rowCount - 1)) * (outfieldTopStart - outfieldTopEnd) : 50;
      return row
        .map((slot, c) => {
          const left = ((c + 1) / (row.length + 1)) * 100;
          return `
            <div class="depth-slot" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">
              ${renderSquadDepthPosNode(slot.tag, slot.players)}
            </div>
          `;
        })
        .join("");
    })
    .join("");

  const onChart = SquadDepth.depthPlayerIds(normalized);
  const chartCount = onChart.size;
  const excluded = playersForTeam(team.id).filter((p) => !onChart.has(p.id));
  const excludedNote = excluded.length
    ? `<p class="squad-depth-excluded muted mb-0">${excluded.length} squad player${excluded.length === 1 ? "" : "s"} not on depth chart</p>`
    : "";

  return `
    <section class="lineup-block pitch-side squad-depth-side">
      <div class="lineup-team-header pitch-side-head">
        <h3 class="lineup-team-name pitch-team">${escapeHtml(team.name)}</h3>
        <span class="lineup-formation-badge">${escapeHtml(formation)}</span>
      </div>
      <div class="pitch squad-depth-pitch">
        ${pitchMarkingsSvg()}
        <div class="pitch-players">
          ${gkHtml}
          ${outfieldHtml}
        </div>
      </div>
      <p class="squad-depth-footnote muted mb-2">${chartCount} on chart · up to ${SquadDepth.DEPTH_CHART_SIZE} (3 GK + 10 positions × 2)</p>
      ${excludedNote}
    </section>
  `;
}

function renderSquadDepthView(state, team, startsMap) {
  const wrap = $("#rosterDepthWrap");
  const listWrap = $("#rosterListWrap");
  if (!wrap || !listWrap) return;

  listWrap.classList.add("is-hidden");
  wrap.classList.remove("is-hidden");

  if (!team) {
    wrap.innerHTML = `<div class="squad-empty"><p class="mb-0">Select a team to view squad depth.</p></div>`;
    return;
  }

  const depth = team.squadDepth;
  const pitchHtml = renderSquadDepthPitch(team, depth, state.leagueId);
  if (!pitchHtml) {
    wrap.innerHTML = `
      <div class="squad-empty squad-depth-empty">
        <p class="mb-2"><strong>${escapeHtml(team.name)}</strong> — depth chart not set up yet.</p>
        <p class="mb-0 muted">Add players in Admin → Squad depth (any number — 2 GK, 1 per slot, etc.).</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = `<div class="squad-depth-body">${pitchHtml}</div>`;
  bindSquadRowClicks(wrap, startsMap, state.leagueId);
}

/** Ordered roster columns, filtered by the league's player-field feature flags. */
function rosterColumns(leagueId, showClub) {
  const defs = [
    { key: "num", width: "40px", head: `<span class="squad-col-num">#</span>`, on: leagueFeatureOn(leagueId, "playerNumber") },
    { key: "player", width: "minmax(0, 1fr)", head: `<span class="squad-col-player">Player</span>`, on: true },
    { key: "pos", width: "44px", head: `<span class="squad-col-role">Pos</span>`, on: leagueFeatureOn(leagueId, "playerPosition") },
    { key: "club", width: "minmax(88px, 0.95fr)", head: `<span class="squad-col-club">Club</span>`, on: showClub && leagueFeatureOn(leagueId, "playerClub") },
    { key: "nat", width: "minmax(100px, 1fr)", head: `<span class="squad-col-nat">Nation</span>`, on: leagueFeatureOn(leagueId, "playerNationality") },
  ];
  return defs.filter((d) => d.on);
}

const ROSTER_COL_ORDER = ["num", "player", "pos", "club", "nat"];

function nationalDutyEntriesForTeam(team) {
  if (!team) return [];
  return typeof NationalDuty !== "undefined"
    ? NationalDuty.normalizeNationalDuty(team.nationalDuty)
    : Array.isArray(team.nationalDuty)
      ? team.nationalDuty
      : [];
}

function nationalDutyPlayerIdsForTeam(team) {
  if (typeof NationalDuty !== "undefined") return NationalDuty.dutyPlayerIds(team?.nationalDuty);
  return new Set(nationalDutyEntriesForTeam(team).map((e) => e.playerId));
}

function renderNationalDutyBlock(team, leagueId) {
  if (!leagueHasNationalDuty(leagueId) || !team) return "";
  const entries = nationalDutyEntriesForTeam(team);
  if (!entries.length) return "";

  const rosterMap = new Map(playersForTeam(team.id).map((p) => [p.id, p]));
  const rows = entries
    .map((e) => {
      const p = rosterMap.get(e.playerId);
      if (!p) return "";
      const country = e.country || p.nationality || "—";
      const meta = [e.note, e.until ? `Until ${e.until}` : ""].filter(Boolean).join(" · ");
      return `<li class="national-duty-row">
          <span class="national-duty-player">${squadFlagHtml(p)}<strong>${escapeHtml(stripCaptainSuffix(p.name))}</strong></span>
          <span class="national-duty-country">${escapeHtml(country)}</span>
          ${meta ? `<span class="national-duty-meta">${escapeHtml(meta)}</span>` : ""}
        </li>`;
    })
    .filter(Boolean)
    .join("");

  if (!rows) return "";

  return `<div class="national-duty-block" role="region" aria-label="On national duty">
    <h4 class="national-duty-title">On national duty</h4>
    <ul class="national-duty-list">${rows}</ul>
  </div>`;
}

function formatPlayerAge(p) {
  const age = Number(p?.age);
  if (Number.isFinite(age) && age > 0) return String(Math.round(age));
  return "—";
}

function renderSquadRow(p, startsMap, leagueId, colKeys, dutyIds) {
  const keys = colKeys ?? new Set(ROSTER_COL_ORDER);
  const role = p.role ?? p.pos;
  const cap = isCaptainPlayer(p) ? `<span class="squad-cap" title="Captain" aria-label="Captain">C</span>` : "";
  const onDuty = dutyIds?.has(p.id);
  const dutyBadge = onDuty
    ? `<span class="squad-duty-badge" title="On national duty">Int'l</span>`
    : "";
  const displayName = stripCaptainSuffix(p.name);
  const age = formatPlayerAge(p);
  const cells = {
    num: `<span class="squad-num">${escapeHtml(p.number)}</span>`,
    player: `<span class="squad-player">
      ${playerInitialsAvatarHtml(displayName, "player-avatar squad-row__avatar")}
      <span class="squad-player-text">
        <span class="squad-name">${escapeHtml(displayName)}${cap}${dutyBadge}</span>
      </span>
    </span>`,
    pos: `<span class="squad-pos-tag" data-pos="${escapeHtml(p.pos)}">${escapeHtml(role)}</span>`,
    club: `<span class="squad-club">${escapeHtml(p.club ?? "—")}</span>`,
    nat: `<span class="squad-nat">
      ${squadFlagHtml(p)}
      <span class="squad-nat-copy">
        <span class="squad-nat-name">${escapeHtml(p.nationality ?? "")}</span>
        <span class="squad-age" title="Age">${escapeHtml(age)}</span>
      </span>
    </span>`,
  };
  const inner = ROSTER_COL_ORDER.filter((k) => keys.has(k)).map((k) => cells[k]).join("");
  return `
    <button type="button" class="squad-row" data-player="${escapeHtml(p.id)}" aria-label="View ${escapeHtml(displayName)}">
      ${inner}
    </button>
  `;
}

let rosterFiltersOpen = false;
const collapsedSquadGroups = new Set();

function setRosterFiltersOpen(open, focusField) {
  rosterFiltersOpen = Boolean(open);
  const panel = $("#rosterFilterPanel");
  const toggle = $("#rosterFilterToggle");
  if (panel) {
    panel.hidden = !rosterFiltersOpen;
    panel.classList.toggle("is-collapsed", !rosterFiltersOpen);
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", rosterFiltersOpen ? "true" : "false");
    toggle.textContent = rosterFiltersOpen ? "Done" : "Filters";
  }
  if (rosterFiltersOpen && focusField) {
    const map = {
      league: "#leagueSelect",
      team: "#teamSelect",
      pos: "#positionSelect",
      search: "#playerSearch",
    };
    const el = $(map[focusField] || focusField);
    queueMicrotask(() => el?.focus?.());
  }
}

function syncRosterFilterChips(state, league, team) {
  const chips = $("#rosterChips");
  if (!chips) return;
  const parts = [
    `<button type="button" class="chip chip--action" data-roster-filter="league">${escapeHtml(league?.name ?? state.leagueId)}</button>`,
    `<button type="button" class="chip chip--action" data-roster-filter="team">${escapeHtml(team?.name ?? state.teamId)}</button>`,
  ];
  if (state.pos !== "all") {
    const posLabel = SQUAD_POS_GROUPS.find((g) => g.key === state.pos)?.label ?? state.pos;
    parts.push(
      `<button type="button" class="chip chip--action" data-roster-filter="pos">${escapeHtml(posLabel)}</button>`,
    );
  }
  if (state.q) {
    parts.push(
      `<button type="button" class="chip chip--action chip--search" data-roster-filter="search">“${escapeHtml(state.q)}”</button>`,
    );
  }
  if (rosterViewMode === "depth") {
    parts.push(`<span class="chip chip--muted">Depth chart</span>`);
  }
  chips.innerHTML = parts.join("");
}

function syncRosterViewCopy() {
  const title = $("#rosterViewTitle");
  const hint = $("#rosterViewHint");
  if (rosterViewMode === "depth") {
    if (title) title.textContent = "Depth chart";
    if (hint) hint.textContent = "Formation roles and backup options";
  } else {
    if (title) title.textContent = "Squad list";
    if (hint) hint.textContent = "Players grouped by position";
  }
}

function updateRosterTeamHead(state, league, team, countLabel) {
  const teamHead = $("#rosterTeamHead");
  if (!teamHead) return;
  const crest = team ? clubLogoHtml(team.id, "club-crest squad-crest") : "";
  const meta =
    rosterViewMode === "depth"
      ? `Depth chart · ${escapeHtml(league?.name ?? state.leagueId)}`
      : `${escapeHtml(league?.name ?? state.leagueId)}${team?.coach ? ` · ${escapeHtml(team.coach)}` : ""}`;
  teamHead.innerHTML = `
    <div class="squad-team-head-inner">
      ${crest}
      <div class="squad-team-copy min-w-0">
        <h4 class="subsection-title squad-team-name mb-1">${escapeHtml(team?.name ?? state.teamId)}</h4>
        <p class="squad-team-meta mb-0">${meta}</p>
      </div>
      <span class="squad-count-badge">${escapeHtml(countLabel)}</span>
    </div>
    ${renderNationalDutyBlock(team, state.leagueId)}
  `;
}

function bindSquadGroupToggles(grid) {
  if (!grid || grid.dataset.groupToggleBound) return;
  grid.dataset.groupToggleBound = "1";
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-squad-group]");
    if (!btn) return;
    e.preventDefault();
    const key = btn.getAttribute("data-squad-group");
    const section = btn.closest(".squad-group");
    if (!section || !key) return;
    const collapsed = section.classList.toggle("is-collapsed");
    btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (collapsed) collapsedSquadGroups.add(key);
    else collapsedSquadGroups.delete(key);
  });
}

function renderRoster() {
  const grid = $("#rosterGrid");
  const chips = $("#rosterChips");
  const count = $("#rosterCount");
  const listWrap = $("#rosterListWrap");
  const depthWrap = $("#rosterDepthWrap");
  if (!grid || !chips || !count) return;

  syncRosterViewToggle();
  syncRosterViewCopy();

  const state = getRosterState();
  const league = LEAGUES.find((l) => l.id === state.leagueId);
  const team = teamById.get(state.teamId);
  const squad = playersForTeam(state.teamId).filter((p) => playerMatches(p, state));
  const startsMap = buildLineupStartsMap(state.leagueId);
  const fullSquad = playersForTeam(state.teamId);
  const countLabel =
    rosterViewMode === "depth"
      ? `${fullSquad.length} player${fullSquad.length === 1 ? "" : "s"}`
      : `${squad.length} player${squad.length === 1 ? "" : "s"}`;
  count.textContent = countLabel;

  syncRosterFilterChips(state, league, team);
  updateRosterTeamHead(state, league, team, countLabel);

  if (rosterViewMode === "depth") {
    renderSquadDepthView(state, team, startsMap);
    return;
  }

  if (listWrap) listWrap.classList.remove("is-hidden");
  if (depthWrap) {
    depthWrap.classList.add("is-hidden");
    depthWrap.innerHTML = "";
  }

  const dutyIds = nationalDutyPlayerIdsForTeam(team);

  const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
  squad.sort((a, b) => (order[a.pos] ?? 9) - (order[b.pos] ?? 9) || a.number - b.number || a.name.localeCompare(b.name));

  const showClub = isWorldCupLeague(state.leagueId);
  const rosterPanel = $("#rosterPanel");
  const colHead = rosterPanel?.querySelector(".squad-col-head");
  const cols = rosterColumns(state.leagueId, showClub);
  const colKeys = new Set(cols.map((c) => c.key));
  if (rosterPanel) {
    rosterPanel.classList.toggle("squad-panel--worldcup", showClub);
    rosterPanel.style.setProperty("--squad-cols", cols.map((c) => c.width).join(" "));
  }
  if (colHead) {
    colHead.innerHTML = cols
      .map((c) => (c.key === "nat" ? `<span class="squad-col-nat">Nation / Age</span>` : c.head))
      .join("");
  }

  if (!squad.length) {
    grid.innerHTML = `
      <div class="squad-empty">
        <p class="mb-0">No players match your filters. Try another position or clear the search.</p>
      </div>
    `;
    return;
  }

  const grouped = SQUAD_POS_GROUPS.map((g) => ({
    ...g,
    players: squad
      .filter((p) => p.pos === g.key)
      .sort((a, b) => comparePlayerOrder(a, b)),
  })).filter((g) => g.players.length);

  grid.innerHTML = grouped
    .map((g) => {
      const collapsed = collapsedSquadGroups.has(g.key);
      return `
      <section class="squad-group${collapsed ? " is-collapsed" : ""}" aria-labelledby="squad-group-${escapeHtml(g.key)}">
        <button
          type="button"
          class="squad-group-title"
          id="squad-group-${escapeHtml(g.key)}"
          data-squad-group="${escapeHtml(g.key)}"
          aria-expanded="${collapsed ? "false" : "true"}"
        >
          <span class="squad-group-title__label">
            <span class="squad-group-chevron" aria-hidden="true"></span>
            <span>${escapeHtml(g.label)}</span>
          </span>
          <span class="squad-group-count">${escapeHtml(g.players.length)}</span>
        </button>
        <div class="squad-list">
          ${g.players.map((p) => renderSquadRow(p, startsMap, state.leagueId, colKeys, dutyIds)).join("")}
        </div>
      </section>
    `;
    })
    .join("");

  bindSquadGroupToggles(grid);
  bindSquadRowClicks(grid, startsMap, state.leagueId);
}

function matchCardStatusClass(status) {
  const live = String(status ?? "").toLowerCase() === "live";
  return live ? "meta-pill live match-card__status" : "meta-pill match-card__status";
}

function matchCardAriaLabel(m, ht, at) {
  return `${ht?.name ?? "Home"} ${m.score[0]} to ${m.score[1]} ${at?.name ?? "Away"}`;
}

function matchCardVenueHtml(m, ht, at, { list = false, hero = false } = {}) {
  const raw = renderMatchVenueCoachesHtml(m, ht, at, { list, hero });
  if (!raw) return "";
  return `<div class="match-card__venue">${raw}</div>`;
}

function matchLiveMinute(m) {
  if (m?.minute != null && m.minute !== "") {
    const n = Number(m.minute);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  const events = Array.isArray(m?.goalEvents) ? m.goalEvents : [];
  let max = null;
  for (const ev of events) {
    const n = Number(ev?.minute);
    if (Number.isFinite(n) && (max == null || n > max)) max = n;
  }
  return max;
}

function matchCardStatusHtml(m, { showStatus = true } = {}) {
  if (!showStatus) return "";
  const status = String(m?.status ?? "").trim();
  if (!status) return "";
  const upper = status.toUpperCase();
  if (upper === "LIVE") {
    const minute = matchLiveMinute(m);
    const label = minute != null ? `LIVE ${minute}'` : "LIVE";
    return `<span class="meta-pill live match-card__status match-card__status--live" aria-label="${escapeHtml(label)}"><span class="dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
  }
  return `<span class="${matchCardStatusClass(status)}">${escapeHtml(status)}</span>`;
}

function matchCenterDetailTabsHtml(m, ht, at) {
  const lid = m?.leagueId;
  const datetime = m.time || "";
  const overviewVenue = renderMatchVenueCoachesHtml(m, ht, at, { list: true, hero: true });
  const overviewBody = `
    <div class="mc-tab-panel__stack">
      ${datetime ? `<div class="match-card__datetime"><time class="match-card__time">${escapeHtml(datetime)}</time></div>` : ""}
      ${overviewVenue || `<p class="mc-tab-empty">No venue details yet.</p>`}
    </div>`;

  const hasLineups = Boolean(m?.lineups?.home?.length || m?.lineups?.away?.length);
  const formation =
    Array.isArray(m?.formation) && (m.formation[0] || m.formation[1])
      ? `${m.formation[0] || "—"} · ${m.formation[1] || "—"}`
      : "";
  const lineupsBody = hasLineups
    ? `<div class="mc-tab-panel__stack">
        ${formation ? `<p class="mc-tab-meta">Formations <strong>${escapeHtml(formation)}</strong></p>` : ""}
        <p class="mc-tab-meta">${escapeHtml(ht?.name ?? "Home")}: ${escapeHtml(String(m.lineups.home?.length ?? 0))} named · ${escapeHtml(at?.name ?? "Away")}: ${escapeHtml(String(m.lineups.away?.length ?? 0))} named</p>
        <button type="button" class="mc-tab-cta" data-open="${escapeHtml(m.id)}" data-open-tab="lineups">View full lineups →</button>
      </div>`
    : `<p class="mc-tab-empty">Lineups not available for this fixture.</p>`;

  const goals = Array.isArray(m?.goalEvents) ? m.goalEvents : [];
  const poss = Array.isArray(m?.possession) ? m.possession : [];
  const hasStats = goals.length > 0 || poss.length > 0 || (m?.scorers ?? []).length > 0;
  const goalsPreview = goals.length
    ? `<ul class="mc-tab-goals">${goals
        .slice(0, 4)
        .map(
          (g) =>
            `<li><span class="mc-tab-goals__min">${escapeHtml(String(g.minute ?? "—"))}'</span> <span class="mc-tab-goals__name">${escapeHtml(g.scorer ?? "—")}</span></li>`,
        )
        .join("")}${goals.length > 4 ? `<li class="mc-tab-goals__more">+${goals.length - 4} more</li>` : ""}</ul>`
    : (m?.scorers ?? []).length
      ? `<p class="mc-tab-meta">${escapeHtml((m.scorers ?? []).join(" · "))}</p>`
      : "";
  const possHtml =
    poss.length >= 2
      ? `<p class="mc-tab-meta">Possession <strong>${escapeHtml(String(poss[0]))}% – ${escapeHtml(String(poss[1]))}%</strong></p>`
      : "";
  const statsBody = hasStats
    ? `<div class="mc-tab-panel__stack">${possHtml}${goalsPreview || `<p class="mc-tab-empty">No goal events logged.</p>`}
        <button type="button" class="mc-tab-cta" data-open="${escapeHtml(m.id)}" data-open-tab="stats">Open match sheet →</button>
      </div>`
    : `<p class="mc-tab-empty">Stats not available for this fixture.</p>`;

  const h2hBody = `<p class="mc-tab-empty">Head-to-head history coming soon. Open the match sheet for this fixture’s details.</p>
    <button type="button" class="mc-tab-cta" data-open="${escapeHtml(m.id)}">Open match sheet →</button>`;

  const tabs = [
    { id: "overview", label: "Overview", body: overviewBody },
    { id: "lineups", label: "Lineups", body: lineupsBody },
    { id: "stats", label: "Stats", body: statsBody },
    { id: "h2h", label: "H2H", body: h2hBody },
  ];

  return `
    <div class="mc-match-tabs" data-match-tabs="${escapeHtml(m.id)}">
      <div class="mc-match-tabs__list" role="tablist" aria-label="Match details">
        ${tabs
          .map(
            (t, i) => `
          <button type="button" class="mc-match-tabs__tab${i === 0 ? " is-active" : ""}" role="tab" aria-selected="${i === 0 ? "true" : "false"}" data-mc-tab="${t.id}">${t.label}</button>`,
          )
          .join("")}
      </div>
      ${tabs
        .map(
          (t, i) => `
      <div class="mc-match-tabs__panel${i === 0 ? " is-active" : ""}" role="tabpanel" data-mc-panel="${t.id}"${i === 0 ? "" : " hidden"}>${t.body}</div>`,
        )
        .join("")}
    </div>`;
}

function bindMatchCenterDetailTabs(root) {
  if (!root) return;
  for (const wrap of $$("[data-match-tabs]", root)) {
    const tablist = wrap.querySelector(".mc-match-tabs__list");
    if (!tablist || tablist.dataset.bound === "1") continue;
    tablist.dataset.bound = "1";
    tablist.addEventListener("click", (e) => {
      const btn = e.target instanceof Element ? e.target.closest("[data-mc-tab]") : null;
      if (!btn || !wrap.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-mc-tab");
      if (!id) return;
      for (const tab of $$("[data-mc-tab]", wrap)) {
        const on = tab.getAttribute("data-mc-tab") === id;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      }
      for (const panel of $$("[data-mc-panel]", wrap)) {
        const on = panel.getAttribute("data-mc-panel") === id;
        panel.classList.toggle("is-active", on);
        panel.hidden = !on;
      }
    });
  }
}

function matchCenterFixtureHtml(m, { showStatus = true, matchId = m.id } = {}) {
  const ht = teamById.get(m.homeTeamId);
  const at = teamById.get(m.awayTeamId);
  const crestClass = "team-crest team-crest--sm";
  const headerKicker = m.matchday || "";
  const status = String(m.status ?? "").trim();
  const homeName = ht?.name ?? "Home";
  const awayName = at?.name ?? "Away";
  const hs = Number(m.score?.[0]);
  const as = Number(m.score?.[1]);
  const decided = Number.isFinite(hs) && Number.isFinite(as) && status.toUpperCase() !== "LIVE";
  const homeWin = decided && hs > as;
  const awayWin = decided && as > hs;
  const rowCls = (win, lose) => (win ? " is-winner" : lose ? " is-loser" : "");
  const isLive = status.toUpperCase() === "LIVE";

  const headerHtml =
    headerKicker || showStatus
      ? `<div class="match-card__header">
          ${headerKicker ? `<span class="match-card__kicker">${escapeHtml(headerKicker)}</span>` : ""}
          ${matchCardStatusHtml(m, { showStatus })}
        </div>`
      : "";

  return `
    <div class="match-card match-card--fixture${isLive ? " match-card--live" : ""}">
      ${headerHtml}
      <div class="match-card__main match-card__main--compact">
        <div class="match-card__row match-card__row--home${rowCls(homeWin, awayWin)}">
          ${teamCrestHtml(ht, { className: crestClass })}
          <span class="match-card__team" title="${escapeHtml(homeName)}">${escapeHtml(homeName)}</span>
          <span class="match-card__score-num">${escapeHtml(String(m.score[0]))}</span>
        </div>
        <div class="match-card__row match-card__row--away${rowCls(awayWin, homeWin)}">
          ${teamCrestHtml(at, { className: crestClass })}
          <span class="match-card__team" title="${escapeHtml(awayName)}">${escapeHtml(awayName)}</span>
          <span class="match-card__score-num">${escapeHtml(String(m.score[1]))}</span>
        </div>
      </div>
      <div class="match-card__action">
        <button class="live-blog" type="button" data-open="${escapeHtml(matchId)}">
          Live blog <span class="arr" aria-hidden="true">›</span>
        </button>
      </div>
      ${matchCenterDetailTabsHtml(m, ht, at)}
    </div>`;
}

function matchCardHtml(m, options = {}) {
  const {
    variant = "card",
    showVenue = variant === "list",
    showStatus = true,
    kicker = "",
    attrs = "",
    tag = "article",
    featured = false,
  } = options;

  const ht = teamById.get(m.homeTeamId);
  const at = teamById.get(m.awayTeamId);
  const brand = matchCardBrandAttrs(ht, at, { featured });
  const crestClass = "team-crest team-crest--sm";
  const headerKicker = kicker || m.matchday || "";
  const datetime = m.time || "";
  const status = String(m.status ?? "").trim();
  const venueHtml = showVenue ? matchCardVenueHtml(m, ht, at, { list: variant === "list", hero: variant === "hero" }) : "";

  const headerHtml =
    headerKicker || (showStatus && status)
      ? `<div class="match-card__header">
          ${headerKicker ? `<span class="match-card__kicker">${escapeHtml(headerKicker)}</span>` : ""}
          ${showStatus && status ? `<span class="${matchCardStatusClass(status)}">${escapeHtml(status)}</span>` : ""}
        </div>`
      : "";

  const datetimeHtml = datetime
    ? `<div class="match-card__datetime"><time class="match-card__time">${escapeHtml(datetime)}</time></div>`
    : "";

  const scoreHtml = `
        <div class="match-card__score" aria-label="Score">
          <span class="match-card__score-num">${escapeHtml(String(m.score[0]))}</span>
          <span class="match-card__score-sep" aria-hidden="true">:</span>
          <span class="match-card__score-num">${escapeHtml(String(m.score[1]))}</span>
        </div>`;

  let mainHtml;
  if (variant === "list") {
    mainHtml = `<div class="match-card__stack">
          <div class="match-card__row match-card__row--home">
            ${teamCrestHtml(ht, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(ht?.name ?? "Home")}</span>
          </div>
          ${scoreHtml}
          <div class="match-card__row match-card__row--away">
            ${teamCrestHtml(at, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(at?.name ?? "Away")}</span>
          </div>
        </div>`;
  } else if (variant === "hero") {
    const hs = Number(m.score?.[0]);
    const as = Number(m.score?.[1]);
    const decided = Number.isFinite(hs) && Number.isFinite(as) && String(status).toUpperCase() !== "LIVE";
    const homeWin = decided && hs > as;
    const awayWin = decided && as > hs;
    const rowCls = (win, lose) => (win ? " is-winner" : lose ? " is-loser" : "");
    mainHtml = `<div class="match-card__main match-card__main--compact">
          <div class="match-card__row match-card__row--home${rowCls(homeWin, awayWin)}">
            ${teamCrestHtml(ht, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(ht?.name ?? "Home")}</span>
            <span class="match-card__score-num">${escapeHtml(String(m.score[0]))}</span>
          </div>
          <div class="match-card__row match-card__row--away${rowCls(awayWin, homeWin)}">
            ${teamCrestHtml(at, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(at?.name ?? "Away")}</span>
            <span class="match-card__score-num">${escapeHtml(String(m.score[1]))}</span>
          </div>
        </div>`;
  } else {
    mainHtml = `<div class="match-card__main">
          <div class="match-card__side match-card__side--home">
            ${teamCrestHtml(ht, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(ht?.name ?? "Home")}</span>
          </div>
          ${scoreHtml}
          <div class="match-card__side match-card__side--away">
            ${teamCrestHtml(at, { className: crestClass })}
            <span class="match-card__team">${escapeHtml(at?.name ?? "Away")}</span>
          </div>
        </div>`;
  }

  return `
    <${tag}
      class="match-card match-card--${variant} ${brand.classExtra}"
      ${brand.styleAttr}
      ${attrs}
    >
      ${headerHtml}
      ${mainHtml}
      ${datetimeHtml}
      ${venueHtml}
    </${tag}>`;
}

function heroMatchCardHtml(m, options = {}) {
  const ht = teamById.get(m.homeTeamId);
  const at = teamById.get(m.awayTeamId);
  return matchCardHtml(m, {
    variant: "hero",
    showVenue: true,
    featured: Boolean(options.featured),
    attrs: `
      data-hero-match="${escapeHtml(m.id)}"
      role="button"
      tabindex="0"
      aria-label="${escapeHtml(matchCardAriaLabel(m, ht, at))}"`,
  });
}

function openHeroMatch(leagueId, matchId) {
  const openRow = () => {
    const row = $(`[data-match="${CSS.escape(matchId)}"]`, $("#matchList"));
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    row.click();
  };
  $("#match-center")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const leagueSel = $("#leagueSelect");
  if (leagueSel && leagueSel.value !== leagueId) {
    setActiveLeague(leagueId);
    requestAnimationFrame(() => requestAnimationFrame(openRow));
  } else {
    renderMatchCenter(leagueId);
    openRow();
  }
}

function bindHeroMatchCards(root, leagueId) {
  if (!root) return;
  for (const card of $$("[data-hero-match]", root)) {
    const id = card.getAttribute("data-hero-match");
    if (!id) continue;
    card.addEventListener("click", () => openHeroMatch(leagueId, id));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openHeroMatch(leagueId, id);
      }
    });
  }
}

function pickHeroFeaturedMatch(matches) {
  if (!matches?.length) return null;
  const live = matches.find((m) => String(m.status).toLowerCase() === "live");
  if (live) return live;
  const finished = matches.filter((m) => String(m.status).toUpperCase() === "FT");
  if (finished.length) return finished[finished.length - 1];
  return matches[0];
}

function renderHeroFeaturedMatch(leagueId) {
  const wrap = $("#heroFeaturedMatch");
  const leagueEl = $("#heroFeaturedLeague");
  const labelEl = $("#heroFeaturedLabel");

  const league = LEAGUES.find((l) => l.id === leagueId);
  if (leagueEl) leagueEl.textContent = league?.name ?? leagueId;

  if (!wrap) return;

  const meta = heroLeagueMeta(leagueId);
  const mw = meta.matchweek ?? 36;
  const matches = filterMatchesForLeagueWeek(MATCHES, leagueId, mw);
  const featured = pickHeroFeaturedMatch(matches);

  if (labelEl) {
    const live = featured && String(featured.status).toLowerCase() === "live";
    labelEl.textContent = live ? "Live now" : featured ? "Featured result" : "This matchweek";
  }

  if (!featured) {
    wrap.innerHTML = `<div class="home-hero-feature__empty">No fixtures for this matchweek yet.</div>`;
    wrap.style.removeProperty("--hero-home-color");
    wrap.style.removeProperty("--hero-away-color");
    return;
  }

  const ht = teamById.get(featured.homeTeamId);
  const at = teamById.get(featured.awayTeamId);
  wrap.style.setProperty("--hero-home-color", teamBrandColor(ht));
  wrap.style.setProperty("--hero-away-color", teamBrandColor(at));

  wrap.innerHTML = heroMatchCardHtml(featured, { featured: true });
  bindHeroMatchCards(wrap, leagueId);
  triggerFeaturedScoreReveal(wrap);
  refreshHomeEntranceAnimations(wrap);
}

function triggerFeaturedScoreReveal(root) {
  const score = root?.querySelector(".match-card__score");
  if (!score) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  score.classList.remove("match-card__score--reveal");
  if (reduce) return;
  void score.offsetWidth;
  score.classList.add("match-card__score--reveal");
}

let heroStatsCounted = false;
let heroStatsObserver = null;
let homeEnterObserver = null;
let homeRailEnterSeeded = false;

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function runHeroStatCounters() {
  animateCounter($("#statLeagues"), LEAGUES.length);
  animateCounter($("#statTeams"), TEAMS.length);
  animateCounter($("#statPlayers"), PLAYERS.length);
  heroStatsCounted = true;
}

function setHeroStatValues(values) {
  const els = [$("#statLeagues"), $("#statTeams"), $("#statPlayers")];
  els.forEach((el, i) => {
    if (!el) return;
    el.textContent = String(values[i]);
    el.dataset.countTarget = String(values[i]);
  });
}

function observeHeroStatCounters() {
  const wrap = $(".home-statbar");
  if (!wrap) return;

  const values = [LEAGUES.length, TEAMS.length, PLAYERS.length];
  if (heroStatsCounted) {
    setHeroStatValues(values);
    return;
  }

  if (prefersReducedMotion()) {
    setHeroStatValues(values);
    heroStatsCounted = true;
    return;
  }

  if (!("IntersectionObserver" in window)) {
    runHeroStatCounters();
    return;
  }

  if (heroStatsObserver) heroStatsObserver.disconnect();
  heroStatsObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        runHeroStatCounters();
        heroStatsObserver?.disconnect();
        heroStatsObserver = null;
      }
    },
    { threshold: 0.35, rootMargin: "0px 0px -8% 0px" },
  );
  heroStatsObserver.observe(wrap);
}

function updateHeroSummary() {
  observeHeroStatCounters();
}

function animateCounter(el, target) {
  if (!(el instanceof HTMLElement)) return;
  const to = Number(target) || 0;
  el.dataset.countTarget = String(to);
  if (prefersReducedMotion()) {
    el.textContent = String(to);
    return;
  }
  const from = 0;
  const start = performance.now();
  const dur = 1200;
  const tick = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const cur = Math.round(from + (to - from) * eased);
    el.textContent = String(cur);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function getHomeEnterObserver() {
  if (homeEnterObserver) return homeEnterObserver;
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) return null;

  document.documentElement.classList.add("home-enter-init");
  homeEnterObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-entered");
        homeEnterObserver?.unobserve(entry.target);
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
  );
  return homeEnterObserver;
}

function stampHomeEnter(el, index, staggerMs = 65) {
  if (!(el instanceof HTMLElement)) return;
  el.classList.add("home-enter");
  el.style.setProperty("--home-enter-delay", `${index * staggerMs}ms`);
  const io = getHomeEnterObserver();
  if (!io) {
    el.classList.add("is-entered");
    return;
  }
  if (el.getBoundingClientRect().top < window.innerHeight * 0.94) {
    el.classList.add("is-entered");
    return;
  }
  io.observe(el);
}

function refreshHomeEntranceAnimations(scope) {
  const root = scope ?? document;

  if (!scope && !homeRailEnterSeeded) {
    const pills = [
      ...$$("#leaguePills .league-tab", root),
      ...$$("#homeRailMoreMount .league-tab--more", root),
    ];
    pills.forEach((el, i) => stampHomeEnter(el, i, 60));
    homeRailEnterSeeded = true;
  }

  if (!scope) {
    const sections = $$(".home-enter", root);
    sections.forEach((el, i) => {
      if (el.classList.contains("is-entered")) return;
      stampHomeEnter(el, i, 80);
    });
  }

  const cards = [
    ...$$("#heroSpotlight .match-card", root),
    ...$$("#heroFeaturedMatch .match-card", root),
    ...$$(".home-clubs .club-card", root),
  ];
  cards.forEach((el, i) => {
    if (el.classList.contains("is-entered")) return;
    stampHomeEnter(el, i, 75);
  });
}

function setupHomeEntranceAnimations() {
  getHomeEnterObserver();
}

function formationForTeam(teamId) {
  const saved = String(teamById.get(teamId)?.formation ?? "").trim();
  return saved || "—";
}

function stadiumForTeam(teamId) {
  const saved = String(teamById.get(teamId)?.stadium ?? "").trim();
  if (saved && saved !== "—") return saved;
  const homeMatch = MATCHES.find(
    (m) => m.homeTeamId === teamId && String(m.stadium ?? "").trim() && m.stadium !== "—",
  );
  return homeMatch ? homeMatch.stadium : "—";
}

function setLeagueAccent(leagueId) {
  const ui = LEAGUE_UI[leagueId] ?? LEAGUE_UI.epl;
  document.documentElement.style.setProperty("--league-accent", ui.c1 ?? "#378ADD");
  const shell = $("#homeStadiumShell");
  if (shell) shell.dataset.league = leagueId;
}

function heroLeagueMeta(leagueId) {
  if (typeof FCDataStore !== "undefined") {
    return FCDataStore.getLeagueMeta(leagueId);
  }
  return {
    matchweek: 36,
    dateRange: leagueId === "laliga" ? "Saturday 10 May – Tuesday 12 May" : "Saturday 9 May – Tuesday 12 May",
  };
}

function renderHeroLeagueMeta(leagueId) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  const meta = heroLeagueMeta(leagueId);
  const mw = meta.matchweek ?? 36;
  const nameEl = $("#heroLeagueName");
  const mwEl = $("#heroMwMeta");
  const rangeEl = $("#heroMwRange");
  if (nameEl) nameEl.textContent = league?.name ?? leagueId;
  if (mwEl) mwEl.textContent = meta.matchweekTitle || `MW ${mw}`;
  if (rangeEl) rangeEl.textContent = meta.dateRange ?? "—";
}

let heroStandingsExpanded = false;

function featuredTeamStandingRow(leagueId, teamName) {
  const rows = miniStandingsBlock(leagueId)?.rows ?? [];
  const name = String(teamName ?? "").trim().toLowerCase();
  if (!name) return null;
  const hit = rows.find((r) => String(r[1] ?? "").trim().toLowerCase() === name);
  return hit ?? null;
}

function updateHeroStandingsTitle(leagueId) {
  const title = $("#heroStandingsTitle");
  if (!title) return;
  const league = LEAGUES.find((l) => l.id === leagueId);
  const name = league?.name ?? "League";
  title.textContent = `${name} Table`;
}

function updateHeroStandingsExpandBtn() {
  const expandBtn = $("#heroStandingsExpand");
  if (!expandBtn) return;
  const on = heroStandingsExpanded;
  expandBtn.setAttribute("aria-pressed", on ? "true" : "false");
  expandBtn.classList.toggle("is-active", on);
  expandBtn.title = on
    ? "Hide wins, draws, losses, and goal difference"
    : "Show wins, draws, losses, and goal difference";
  const label = expandBtn.querySelector(".table-card__expand-label");
  if (label) label.textContent = on ? "Compact" : "Full stats";
  else expandBtn.textContent = on ? "Compact" : "Full stats";
}

function renderHeroStandings(leagueId) {
  const el = $("#heroStandings");
  if (!el) return;

  updateHeroStandingsTitle(leagueId);
  updateHeroStandingsExpandBtn();

  const highlightClub = String($("#featuredTeam")?.textContent ?? "").trim();
  const common = {
    leagueId,
    compact: true,
    showLegend: true,
    fullLegend: true,
    wrapCard: false,
    fullStats: true,
    expanded: heroStandingsExpanded,
    highlightClub: highlightClub && highlightClub !== "—" ? highlightClub : "",
  };

  if (leagueUsesGroupStandings(leagueId)) {
    const groupA = groupStandingsForLeague(leagueId).find((g) => g.id === "A");
    const rows = groupA?.rows ?? [];
    if (!rows.some(([, club]) => String(club ?? "").trim())) {
      el.innerHTML = `<div class="standings-empty">No group standings yet.</div>`;
      return;
    }
    el.innerHTML = renderMiniStandingsTableHtml(rows, {
      ...common,
      fullLegend: false,
      limit: 4,
    });
    bindStandingsScrollAffordances(el);
    return;
  }

  const rows = miniStandingsBlock(leagueId)?.rows ?? [];
  if (!rows.length) {
    el.innerHTML = `<div class="standings-empty">No standings for this league.</div>`;
    return;
  }
  el.innerHTML = renderMiniStandingsTableHtml(rows, {
    ...common,
    limit: heroStandingsExpanded ? 8 : 6,
  });
  bindStandingsScrollAffordances(el);
}

function updateStandingsScrollAffordance(shell) {
  if (!(shell instanceof HTMLElement)) return;
  const wrap = shell.querySelector(".standings-table-wrap--scroll");
  if (!(wrap instanceof HTMLElement)) return;
  const overflow = wrap.scrollWidth > wrap.clientWidth + 4;
  const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
  shell.classList.toggle("standings-scroll--overflow", overflow);
  shell.classList.toggle("standings-scroll--at-end", !overflow || atEnd);
}

function bindStandingsScrollAffordances(root = document) {
  const shells =
    root instanceof Element && root.matches?.("[data-standings-scroll]")
      ? [root]
      : [...(root.querySelectorAll?.("[data-standings-scroll]") ?? [])];
  for (const shell of shells) {
    const wrap = shell.querySelector(".standings-table-wrap--scroll");
    if (!(wrap instanceof HTMLElement)) continue;
    updateStandingsScrollAffordance(shell);
    requestAnimationFrame(() => updateStandingsScrollAffordance(shell));
    if (wrap.dataset.scrollBound === "1") continue;
    wrap.dataset.scrollBound = "1";
    wrap.addEventListener(
      "scroll",
      () => updateStandingsScrollAffordance(shell),
      { passive: true },
    );
    window.addEventListener("resize", () => updateStandingsScrollAffordance(shell), { passive: true });
  }
}

function bindHeroStandingsExpand() {
  const btn = $("#heroStandingsExpand");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    heroStandingsExpanded = !heroStandingsExpanded;
    const leagueId = $("#leagueSelect")?.value || LEAGUES[0]?.id;
    if (leagueId) renderHeroStandings(leagueId);
  });
}

function bindHomeBentoViewToggle() {
  const root = $(".home-bento");
  if (!root || root.dataset.viewBound === "1") return;
  root.dataset.viewBound = "1";

  const tabs = $$("[data-bento-view]", root);
  const setView = (view) => {
    root.dataset.bentoView = view;
    for (const tab of tabs) {
      const on = tab.getAttribute("data-bento-view") === view;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    }
  };

  setView(root.dataset.bentoView || "team");
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const view = tab.getAttribute("data-bento-view");
      if (view) setView(view);
    });
  }
}

const HERO_STRIP_ORDER = ["live", "results", "upcoming"];
const HERO_STRIP_LABEL = { live: "Live", results: "Results", upcoming: "Upcoming" };
const HERO_RESULT_STATUSES = new Set(["FT", "AET", "PEN", "AWD"]);
let heroStripState = null;

function categorizeHeroMatches(matches) {
  const buckets = { live: [], upcoming: [], results: [] };
  for (const m of matches ?? []) {
    const s = String(m.status ?? "").trim().toUpperCase();
    if (s === "LIVE") buckets.live.push(m);
    else if (HERO_RESULT_STATUSES.has(s)) buckets.results.push(m);
    else buckets.upcoming.push(m);
  }
  return buckets;
}

function renderHeroStripToggle(leagueId, state, buckets) {
  const wrap = $("#heroStripToggle");
  if (!wrap) return;

  wrap.innerHTML = HERO_STRIP_ORDER
    .map((k) => {
      const count = buckets[k].length;
      const active = k === state;
      const disabled = count === 0;
      const isLive = k === "live";
      return `
        <button type="button" role="tab" aria-selected="${active ? "true" : "false"}"${disabled ? " disabled aria-disabled=\"true\"" : ""}
          class="hero-seg${active ? " is-active" : ""}${isLive && count ? " hero-seg--live" : ""}${disabled ? " is-disabled" : ""}"
          data-hero-state="${k}">
          ${isLive ? '<span class="dot" aria-hidden="true"></span>' : ""}
          <span class="hero-seg__label">${HERO_STRIP_LABEL[k]}</span>
          <span class="hero-seg__count">${count}</span>
        </button>`;
    })
    .join("");

  for (const btn of $$("[data-hero-state]", wrap)) {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const next = btn.getAttribute("data-hero-state");
      if (!next || next === heroStripState) return;
      heroStripState = next;
      renderHeroSpotlight(leagueId);
    });
  }
}

function renderHeroSpotlight(leagueId) {
  const track = $("#heroSpotlight");
  if (!track) return;

  const meta = heroLeagueMeta(leagueId);
  const mw = meta.matchweek ?? 36;
  const matches = filterMatchesForLeagueWeek(MATCHES, leagueId, mw);
  const buckets = categorizeHeroMatches(matches);
  const available = HERO_STRIP_ORDER.filter((k) => buckets[k].length);

  let state = heroStripState;
  if (!available.includes(state)) state = available[0] ?? "results";
  heroStripState = state;

  renderHeroStripToggle(leagueId, state, buckets);

  const list = (buckets[state] ?? []).slice(0, 8);
  if (!list.length) {
    track.innerHTML = `<div class="home-spotlight__empty">No matches to show yet.</div>`;
    updateHomeSpotlightScroll();
    return;
  }

  track.innerHTML = list.map((m) => heroMatchCardHtml(m)).join("");
  bindHeroMatchCards(track, leagueId);
  track.scrollLeft = 0;
  updateHomeSpotlightScroll();
  refreshHomeEntranceAnimations(track);
}

function updateHeroLeagueContext(leagueId) {
  renderHeroLeagueMeta(leagueId);
  renderHeroFeaturedMatch(leagueId);
  renderHeroSpotlight(leagueId);
  renderHeroStandings(leagueId);
}

/** Content-preview club carousel shown above the fold on the home page. */
function renderLeagueTrending(leagueId) {
  const el = $("#heroClubStrip");
  if (!el) return;

  const league = LEAGUES.find((l) => l.id === leagueId);
  const leagueLabel = $("#heroClubStripLeague");
  if (leagueLabel) leagueLabel.textContent = league?.name ?? leagueId;

  const teams = teamsForLeague(leagueId);
  if (!teams.length) {
    el.innerHTML = `<p class="home-clubstrip__empty text-secondary">No clubs for this competition yet.</p>`;
    return;
  }

  el.innerHTML = teams
    .map((t) => {
      const squad = playersForTeam(t.id).length;
      return `
        <button type="button" class="clubstrip-chip" data-club="${escapeHtml(t.id)}" aria-label="Open ${escapeHtml(t.name)} roster">
          ${teamCrestHtml(t, { className: "clubstrip-chip__crest", size: 40 })}
          <span class="clubstrip-chip__name">${escapeHtml(t.name)}</span>
          <span class="clubstrip-chip__meta">${escapeHtml(squad)} players</span>
        </button>
      `;
    })
    .join("");

  for (const chip of $$("[data-club]", el)) {
    chip.addEventListener("click", () => {
      const teamId = chip.getAttribute("data-club");
      if (!teamId) return;
      const team = teamById.get(teamId);
      if (!team) return;
      openTeamRoster(team.leagueId, teamId);
    });
  }
}

/** Jump straight to a team's roster in the Squads section. */
function openTeamRoster(leagueId, teamId) {
  const leagueSel = $("#leagueSelect");
  const teamSel = $("#teamSelect");
  if (leagueSel) leagueSel.value = leagueId;
  renderTeamOptions(leagueId);
  if (teamSel && teamId) teamSel.value = teamId;
  setActiveLeague(leagueId, teamId);
  renderRoster();
  $("#squads")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setFeaturedTeam(teamId) {
  const team = teamById.get(teamId);
  if (!team) return;
  const league = LEAGUES.find((l) => l.id === team.leagueId);
  const squadSize = playersForTeam(teamId).length;
  const standing = featuredTeamStandingRow(team.leagueId, team.name);

  $("#featuredTeam").textContent = team.name;
  $("#featuredMeta").textContent = `${league?.name ?? team.leagueId} • ${team.city} • ${squadSize} players`;
  $("#featuredHint").textContent = `Coach: ${team.coach}`;
  $("#featuredFormation").textContent = formationForTeam(teamId);
  const stadiumEl = $("#featuredStadium");
  if (stadiumEl) stadiumEl.textContent = stadiumForTeam(teamId);

  const posEl = $("#featuredPos");
  const ptsEl = $("#featuredPts");
  const squadEl = $("#featuredSquad");
  if (posEl) posEl.textContent = standing ? String(standing[0]) : "—";
  if (ptsEl) ptsEl.textContent = standing ? String(standing[2] ?? 0) : "—";
  if (squadEl) squadEl.textContent = String(squadSize);

  renderLeaguePills(team.leagueId);
  setLeagueAccent(team.leagueId);
  renderLeagueTrending(team.leagueId);
  updateHeroLeagueContext(team.leagueId);

  const homeCrest = $('[data-crest="home"]');
  if (homeCrest) {
    homeCrest.outerHTML = teamCrestHtml(team, {
      className: "club-crest featured-crest",
      size: 40,
      attrs: 'data-crest="home"',
    });
  }

  const featuredBtn = $("#featuredBtn");
  if (featuredBtn) {
    featuredBtn.onclick = () => {
      const leagueSel = $("#leagueSelect");
      const teamSel = $("#teamSelect");
      if (leagueSel) leagueSel.value = team.leagueId;
      renderTeamOptions(team.leagueId);
      if (teamSel) teamSel.value = teamId;
      renderRoster();
      $("#squads")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
}

/** Keep hero, squads, and Match Center on the same league. */
function setActiveLeague(leagueId, preferredTeamId) {
  renderMatchCenter._viewWeek = null;
  renderMatchCenter._viewDateByWeek = {};
  if (!leagueId) return;
  const leagueSel = $("#leagueSelect");
  if (leagueSel) leagueSel.value = leagueId;

  renderTeamOptions(leagueId);
  const teamSel = $("#teamSelect");
  const fallbackTeam = teamsForLeague(leagueId)[0]?.id;
  const teamId = preferredTeamId ?? teamSel?.value ?? fallbackTeam;
  if (teamSel && teamId) teamSel.value = teamId;

  renderLeaguePills(leagueId);
  setLeagueAccent(leagueId);
  renderLeagueTrending(leagueId);
  updateHeroLeagueContext(leagueId);
  applyLeagueSectionToggles(leagueId);
  if (leagueFeatureOn(leagueId, "matchCenter")) renderMatchCenter(leagueId);
  if (leagueHasTransfers(leagueId)) renderTransfers(leagueId, teamId);
  if (leagueFeatureOn(leagueId, "squads")) renderRoster();
  if (teamId && leagueFeatureOn(leagueId, "spotlight")) setFeaturedTeam(teamId);
}

/** Show/hide whole public sections per the league's feature flags. */
function setSectionHidden(el, hide) {
  if (!el) return;
  el.classList.toggle("d-none", hide);
  el.setAttribute("aria-hidden", hide ? "true" : "false");
}

function applyLeagueSectionToggles(leagueId) {
  const sections = [
    { feature: "matchCenter", sel: "#match-center", navHref: "#match-center" },
    { feature: "transfers", sel: "#transfers", navHref: "#transfers" },
    { feature: "squads", sel: "#squads", navHref: "#squads" },
  ];
  for (const s of sections) {
    const hide = !leagueFeatureOn(leagueId, s.feature);
    setSectionHidden($(s.sel), hide);
    if (s.navHref) {
      for (const link of $$(`a[href="${s.navHref}"]`)) {
        link.classList.toggle("d-none", hide);
        link.closest("li")?.classList.toggle("d-none", hide);
      }
    }
  }
  setSectionHidden($("#miniStandings"), !leagueFeatureOn(leagueId, "standings"));
  setSectionHidden($("#topScorers")?.closest(".col-12"), !leagueFeatureOn(leagueId, "topScorers"));
  setSectionHidden($(".home-bento__spotlight"), !leagueFeatureOn(leagueId, "spotlight"));
}

let transferViewTeamId = "";

function transfersForLeague(leagueId) {
  const block = TRANSFERS.find((t) => t.leagueId === leagueId);
  return typeof FCDataStore !== "undefined"
    ? FCDataStore.normalizeTransfersBlock(block ?? { leagueId })
    : { leagueId, in: [], out: [], loanReturn: [], loanRecall: [] };
}

function transfersForTeam(leagueId, teamId) {
  const team = teamById.get(teamId);
  const club = (team?.name ?? "").trim();
  const block = transfersForLeague(leagueId);
  if (!club) return { in: [], out: [], loanReturn: [], loanRecall: [] };
  const match = (t) => (t.club ?? "").trim() === club;
  return {
    in: (block.in ?? []).filter(match),
    out: (block.out ?? []).filter(match),
    loanReturn: (block.loanReturn ?? []).filter(match),
    loanRecall: (block.loanRecall ?? []).filter(match),
  };
}

function renderTransferTeamOptions(leagueId, preferredTeamId) {
  const sel = $("#transferTeamSelect");
  const teams = teamsForLeague(leagueId);
  if (!teams.length) {
    if (sel) sel.innerHTML = "";
    transferViewTeamId = "";
    return "";
  }
  let teamId = preferredTeamId || transferViewTeamId || $("#teamSelect")?.value || teams[0].id;
  if (!teams.some((t) => t.id === teamId)) teamId = teams[0].id;
  if (sel) {
    sel.innerHTML = teams
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
      .join("");
    sel.value = teamId;
  }
  transferViewTeamId = teamId;
  return teamId;
}

function renderLeagueTabBar(container, activeLeagueId, attr) {
  if (!container) return;
  const leagues = LEAGUES.filter((l) => HERO_LEAGUE_TABS.includes(l.id));
  container.innerHTML = leagues
    .map((l) => {
      const selected = l.id === activeLeagueId;
      return `
        <button type="button" class="league-tab${selected ? " active" : ""}" ${attr}="${escapeHtml(l.id)}" aria-selected="${selected ? "true" : "false"}">
          ${escapeHtml(l.name)}
        </button>
      `;
    })
    .join("");

  for (const b of $$(`[${attr}]`, container)) {
    b.addEventListener("click", () => {
      const id = b.getAttribute(attr);
      if (id) setActiveLeague(id);
    });
  }
}

function transferEmptyIconHtml(direction) {
  if (direction === "in") {
    return `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 5v10"/><path d="M8 11l4 4 4-4"/><path d="M5 19h14"/>
    </svg>`;
  }
  if (direction === "out") {
    return `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 19V9"/><path d="M8 13l4-4 4 4"/><path d="M5 5h14"/>
    </svg>`;
  }
  if (direction === "loanReturn") {
    return `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v1"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 10l5 5-5 5"/><path d="M20 15H9a5 5 0 0 1-5-5V9"/>
  </svg>`;
}

function transferEmptyHtml(direction, clubName) {
  const club = String(clubName ?? "").trim() && clubName !== "—" ? clubName : "this club";
  const panel = TRANSFER_PANELS.find((p) => p.key === direction);
  const iconClass = panel?.dirClass ?? direction;
  const copy = {
    in: {
      title: "No incoming transfers yet",
      hint: `Players signed by ${club} will appear here once they are recorded.`,
    },
    out: {
      title: "No outgoing transfers yet",
      hint: `Players who left ${club} will appear here once they are recorded.`,
    },
    loanReturn: {
      title: "No loan returns yet",
      hint: `Players returning from loan to ${club} will appear here once they are recorded.`,
    },
    loanRecall: {
      title: "No recalls yet",
      hint: `Players sent back to their parent club from ${club} will appear here once they are recorded.`,
    },
  }[direction] ?? { title: "Nothing here yet", hint: "" };
  return `
    <div class="transfer-empty-state" role="status">
      <div class="transfer-empty-state__icon transfer-empty-state__icon--${iconClass}" aria-hidden="true">
        ${transferEmptyIconHtml(direction)}
      </div>
      <p class="transfer-empty-state__title">${escapeHtml(copy.title)}</p>
      <p class="transfer-empty-state__hint">${escapeHtml(copy.hint)}</p>
    </div>`;
}

function transferPanelMetaText(count, direction) {
  if (!count) return "";
  const labels = {
    in: `${count} arrival${count === 1 ? "" : "s"}`,
    out: `${count} departure${count === 1 ? "" : "s"}`,
    loanReturn: `${count} return${count === 1 ? "" : "s"}`,
    loanRecall: `${count} recall${count === 1 ? "" : "s"}`,
  };
  return labels[direction] ?? `${count} move${count === 1 ? "" : "s"}`;
}

function setTransferPanelMeta(block) {
  for (const panel of TRANSFER_PANELS) {
    const el = document.querySelector(`.${panel.card} .transfer-panel-head__meta`);
    if (!el) continue;
    const count = block[panel.key]?.length ?? 0;
    const text = transferPanelMetaText(count, panel.key);
    el.textContent = text;
    el.hidden = !text;
  }
}

function formatTransferFeeBadge(fee) {
  const raw = String(fee ?? "").trim();
  if (!raw || raw === "—" || raw === "-" || raw === "–" || /^undisclosed$/i.test(raw)) {
    return { label: "Undisclosed", kind: "undisclosed" };
  }
  if (/^free(\s+transfer)?$/i.test(raw)) {
    return { label: "Free Transfer", kind: "free" };
  }
  if (/loan/i.test(raw)) {
    return { label: /^loan$/i.test(raw) ? "Loan" : raw, kind: "loan" };
  }
  return { label: raw, kind: "fee" };
}

function renderTransferRows(items, direction, clubName, leagueId = "") {
  if (!items?.length) {
    return transferEmptyHtml(direction, clubName);
  }
  const panel = TRANSFER_PANELS.find((p) => p.key === direction);
  const dirClass = panel?.dirClass ?? direction;
  const dirSymbol = panel?.symbol ?? "•";
  const otherLabel = direction === "out" || direction === "loanRecall" ? "To" : "From";
  return items
    .map((t) => {
      const otherClub = String(t.otherClub ?? "").trim();
      const fee = formatTransferFeeBadge(t.fee);
      const date = String(t.date ?? "").trim();
      const crest = clubCrestFromName(otherClub, leagueId, "squad-crest transfer-row__crest");
      return `
        <article class="transfer-row">
          <span class="transfer-direction ${dirClass}" aria-hidden="true">${dirSymbol}</span>
          ${playerInitialsAvatarHtml(t.player, "player-avatar transfer-row__avatar")}
          <div class="transfer-row__main">
            <div class="transfer-row__top">
              <span class="transfer-name">${escapeHtml(t.player)}</span>
              <span class="transfer-fee-badge transfer-fee-badge--${fee.kind}">${escapeHtml(fee.label)}</span>
            </div>
            <div class="transfer-row__meta">
              <span class="transfer-row__club">
                <span class="transfer-row__club-label">${otherLabel}</span>
                ${crest}
                <span class="transfer-club">${escapeHtml(otherClub || "—")}</span>
              </span>
              ${date ? `<time class="transfer-row__date">${escapeHtml(date)}</time>` : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function toggleTransfersSection(leagueId) {
  const section = $("#transfers");
  const hide = !leagueHasTransfers(leagueId);
  if (section) {
    section.classList.toggle("d-none", hide);
    section.setAttribute("aria-hidden", hide ? "true" : "false");
  }
  for (const link of $$('a[href="#transfers"]')) {
    link.classList.toggle("d-none", hide);
    link.closest("li")?.classList.toggle("d-none", hide);
  }
}

function renderTransfers(leagueId, preferredTeamId) {
  if (!leagueHasTransfers(leagueId)) return;
  const tabs = $("#transferTabs");
  const labelEl = $("#transferLeagueLabel");
  const clubLabelEl = $("#transferClubLabel");
  if (!TRANSFER_PANELS.every((p) => $(`#${p.elId}`))) return;

  const league = LEAGUES.find((l) => l.id === leagueId);
  if (labelEl) labelEl.textContent = league?.name ?? leagueId;

  renderLeagueTabBar(tabs, leagueId, "data-transfer-tab");

  const teamId = renderTransferTeamOptions(leagueId, preferredTeamId);
  const team = teamById.get(teamId);
  const clubName = team?.name ?? "—";
  if (clubLabelEl) clubLabelEl.textContent = clubName;

  const block = transfersForTeam(leagueId, teamId);
  setTransferPanelMeta(block);
  for (const panel of TRANSFER_PANELS) {
    const el = $(`#${panel.elId}`);
    if (el) el.innerHTML = renderTransferRows(block[panel.key], panel.key, clubName, leagueId);
  }
}

function setupTransferControls() {
  $("#transferTeamSelect")?.addEventListener("change", () => {
    const leagueId = $("#leagueSelect")?.value ?? LEAGUES[0]?.id;
    if (!leagueId) return;
    renderTransfers(leagueId, $("#transferTeamSelect")?.value);
  });
}

function setupRosterControls() {
  const leagueSel = $("#leagueSelect");
  const teamSel = $("#teamSelect");
  const posSel = $("#positionSelect");
  const search = $("#playerSearch");

  initRosterViewMode();
  syncRosterViewToggle();
  setRosterFiltersOpen(false);

  $("#rosterViewBar")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-roster-view]");
    if (!btn) return;
    setRosterViewMode(btn.dataset.rosterView);
  });

  $("#rosterFilterToggle")?.addEventListener("click", () => {
    setRosterFiltersOpen(!rosterFiltersOpen);
  });

  $("#rosterChips")?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-roster-filter]");
    if (!chip) return;
    setRosterFiltersOpen(true, chip.getAttribute("data-roster-filter"));
  });

  leagueSel?.addEventListener("change", () => {
    setActiveLeague(leagueSel.value);
  });

  teamSel?.addEventListener("change", () => {
    renderRoster();
    setFeaturedTeam(teamSel.value);
    const leagueId = leagueSel?.value;
    if (leagueId && leagueHasTransfers(leagueId)) renderTransfers(leagueId, teamSel.value);
  });

  posSel?.addEventListener("change", renderRoster);
  search?.addEventListener("input", renderRoster);
}

function shareFilenameSlug(text, suffix) {
  const slug = String(text ?? "team")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "team"}-${suffix}.png`;
}

let matchLineupSharePayload = null;

function buildLineupSharePayload(m, ht, at, leagueId) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  const showFormation = leagueFeatureOn(leagueId, "matchFormation");
  const stadium = String(m?.stadium ?? "").trim();
  const venue =
    leagueFeatureOn(leagueId, "matchStadium") && stadium && stadium !== "—" ? stadium : "";
  return {
    homeTeam: { name: ht?.name ?? "Home", logo: ht?.logo ?? "" },
    awayTeam: { name: at?.name ?? "Away", logo: at?.logo ?? "" },
    score: m.score ?? [0, 0],
    matchday: m.matchday ?? "",
    time: m.time ?? "",
    venue,
    leagueName: league?.name ?? leagueId,
    homeFormation: showFormation ? m.formation?.[0] ?? "" : "",
    awayFormation: showFormation ? m.formation?.[1] ?? "" : "",
    homeRows: enrichFormationRowsDisplay(
      m.homeTeamId,
      buildFormationRows(m.formation?.[0], m.lineups?.home),
    ),
    awayRows: enrichFormationRowsDisplay(
      m.awayTeamId,
      buildFormationRows(m.formation?.[1], m.lineups?.away),
    ),
  };
}

function lineupShareToolbarHtml({ showPitchToggle = false } = {}) {
  const toggle = showPitchToggle
    ? `<div class="lineup-toggle lineup-view-toggle" role="tablist" aria-label="Lineup view">
          <button type="button" class="lineup-toggle-btn lineup-view-btn is-active active" data-view="pitch" role="tab">Pitch</button>
          <button type="button" class="lineup-toggle-btn lineup-view-btn" data-view="list" role="tab">List</button>
        </div>`
    : "";
  return `
    <div class="lineup-toolbar">
      ${toggle}
      <button
        type="button"
        class="btn btn-ghost btn-sm share-btn"
        id="shareLineupBtn"
        aria-label="Share lineup image"
      >
        Share
      </button>
    </div>`;
}

async function handleShareLineup() {
  if (typeof ShareImage === "undefined") {
    alert("Share image module did not load. Refresh the page.");
    return;
  }
  const btn = $("#shareLineupBtn");
  const payload = matchLineupSharePayload;
  if (!payload) return;
  if (!payload.homeRows.length && !payload.awayRows.length) {
    alert("No lineup data to share for this match.");
    return;
  }

  setShareBusy(btn, true);
  try {
    const canvas = await ShareImage.renderLineupShareImage(payload);
    const slug = `${payload.homeTeam.name}-vs-${payload.awayTeam.name}`;
    await ShareImage.exportShareImage(canvas, shareFilenameSlug(slug, "lineup"));
  } catch (err) {
    console.error(err);
    alert("Could not generate lineup image. Use a local server (http://) and try again.");
  } finally {
    setShareBusy(btn, false);
  }
}

function bindLineupShareButton() {
  const btn = $("#shareLineupBtn");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", handleShareLineup);
}

function setShareBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) btn.setAttribute("aria-busy", "true");
  else btn.removeAttribute("aria-busy");
}

async function handleShareSquad() {
  if (typeof ShareImage === "undefined") {
    alert("Share image module did not load. Refresh the page.");
    return;
  }
  const btn = $("#shareSquadBtn");
  const state = getRosterState();
  const team = teamById.get(state.teamId);
  if (!team) return;

  const league = LEAGUES.find((l) => l.id === state.leagueId);
  const players = playersForTeam(state.teamId);
  if (!players.length) {
    alert("This team has no players to share.");
    return;
  }

  setShareBusy(btn, true);
  try {
    const canvas = await ShareImage.renderSquadShareImage({
      team,
      leagueName: league?.name ?? state.leagueId,
      formation: formationForTeam(state.teamId),
      players,
      dutyIds: nationalDutyPlayerIdsForTeam(team),
      showNumber: leagueFeatureOn(state.leagueId, "playerNumber"),
      showPos: leagueFeatureOn(state.leagueId, "playerPosition"),
      showNat: leagueFeatureOn(state.leagueId, "playerNationality"),
      showClub: isWorldCupLeague(state.leagueId) && leagueFeatureOn(state.leagueId, "playerClub"),
      helpers: { playerFlagEmoji },
    });
    await ShareImage.exportShareImage(canvas, shareFilenameSlug(team.name, "squad"));
  } catch (err) {
    console.error(err);
    alert("Could not generate squad image. Use a local server (http://) and try again.");
  } finally {
    setShareBusy(btn, false);
  }
}

function getMatchCenterShareState() {
  const leagueId = renderMatchCenter._leagueId ?? $("#leagueSelect")?.value ?? LEAGUES[0]?.id;
  const meta =
    typeof FCDataStore !== "undefined"
      ? FCDataStore.getLeagueMeta(leagueId)
      : { matchweek: 36, dateRange: "—", matchweekTitle: "" };
  const publishedWeek = meta.matchweek ?? 36;
  const showAll = leagueShowsAllFixtures(leagueId);
  const viewWeek = showAll ? publishedWeek : renderMatchCenter._viewWeek ?? publishedWeek;
  const weekMatches = filterMatchesForLeagueWeek(MATCHES, leagueId, viewWeek);
  const { activeGroup } = resolveMatchCenterDateView(leagueId, viewWeek, weekMatches, showAll);
  const matches = activeGroup?.items ?? [];
  const league = LEAGUES.find((l) => l.id === leagueId);
  const title = showAll
    ? meta.matchweekTitle || "World Cup"
    : viewWeek === publishedWeek
      ? meta.matchweekTitle || `Matchweek ${publishedWeek}`
      : `Matchweek ${viewWeek}`;
  const dateRange = activeGroup?.label ?? meta.dateRange ?? "—";

  const shareMatches = matches.map((m) => ({
    ...m,
    dayLabel: showAll
      ? [m.matchday, m.time].filter((x) => x && x !== "—").join(" · ") || "—"
      : m.time || "—",
  }));

  return { leagueId, leagueName: league?.name ?? leagueId, title, dateRange, matches: shareMatches };
}

async function handleShareGameweek() {
  if (typeof ShareImage === "undefined") {
    alert("Share image module did not load. Refresh the page.");
    return;
  }
  const btn = $("#shareGameweekBtn");
  const { leagueId, leagueName, title, dateRange, matches } = getMatchCenterShareState();

  setShareBusy(btn, true);
  try {
    const canvas = await ShareImage.renderGameweekShareImage({
      leagueName,
      title,
      dateRange,
      matches,
      teamById,
      showStatus: leagueFeatureOn(leagueId, "matchStatus"),
    });
    await ShareImage.exportShareImage(
      canvas,
      shareFilenameSlug(`${leagueName}-${title}`, "gameweek"),
    );
  } catch (err) {
    console.error(err);
    alert("Could not generate gameweek image. Use a local server (http://) and try again.");
  } finally {
    setShareBusy(btn, false);
  }
}

function getTransferShareState() {
  const leagueId = $("#leagueSelect")?.value ?? LEAGUES[0]?.id;
  const teamId = transferViewTeamId || $("#transferTeamSelect")?.value || $("#teamSelect")?.value || "";
  const team = teamById.get(teamId);
  const league = LEAGUES.find((l) => l.id === leagueId);
  const block = transfersForTeam(leagueId, teamId);
  return {
    leagueId,
    leagueName: league?.name ?? leagueId,
    team,
    panels: TRANSFER_PANELS.map((panel) => ({
      key: panel.key,
      label: panel.label,
      symbol: panel.symbol,
      items: block[panel.key] ?? [],
    })),
  };
}

async function handleShareTransfers() {
  if (typeof ShareImage === "undefined") {
    alert("Share image module did not load. Refresh the page.");
    return;
  }
  const btn = $("#shareTransfersBtn");
  const { leagueId, leagueName, team, panels } = getTransferShareState();
  if (!leagueHasTransfers(leagueId)) return;
  if (!team) return;

  setShareBusy(btn, true);
  try {
    const canvas = await ShareImage.renderTransfersShareImage({
      team,
      leagueName,
      panels,
    });
    await ShareImage.exportShareImage(canvas, shareFilenameSlug(`${team.name}-transfers`, "transfers"));
  } catch (err) {
    console.error(err);
    alert("Could not generate transfers image. Use a local server (http://) and try again.");
  } finally {
    setShareBusy(btn, false);
  }
}

function setupShareButtons() {
  $("#shareSquadBtn")?.addEventListener("click", handleShareSquad);
  $("#shareGameweekBtn")?.addEventListener("click", handleShareGameweek);
  $("#shareTransfersBtn")?.addEventListener("click", handleShareTransfers);
}

function setupHowItWorks() {
  // Button removed from UI; keep function for future use.
}

function setupRevealAnimations() {
  const els = $$(".reveal");
  if (!els.length) return;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isMobile = window.matchMedia?.("(max-width: 767.98px)")?.matches;
  if (prefersReducedMotion || isMobile || !("IntersectionObserver" in window)) {
    for (const el of els) el.classList.add("is-visible");
    return;
  }

  document.documentElement.classList.add("reveal-init");

  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) el.classList.add("is-visible");
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    },
    { root: null, threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
  );

  for (const el of els) io.observe(el);
}

function setupRipple() {
  for (const el of $$(".fx-ripple")) {
    el.addEventListener("click", (e) => {
      const target = e.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect();
      const r = document.createElement("span");
      r.className = "ripple";
      const size = Math.max(rect.width, rect.height);
      r.style.width = `${size}px`;
      r.style.height = `${size}px`;
      r.style.left = `${e.clientX - rect.left - size / 2}px`;
      r.style.top = `${e.clientY - rect.top - size / 2}px`;
      target.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    });
  }
}

function setupTilt() {
  for (const card of $$(".fx-tilt")) {
    const el = card;
    if (!(el instanceof HTMLElement)) continue;
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) translateY(-1px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  }
}

/**
 * Rich goal / assist block for modals. Falls back to nothing if `events` is empty.
 * `events`: { minute?: number|null, side: "home"|"away", scorer: string, assist?: string|null, type?: string }
 * `matchCtx`: optional { homeTeamId, awayTeamId, lineups } for own-goal credit resolution
 */
function isOwnGoalType(type) {
  const t = String(type ?? "").trim().toLowerCase();
  return t === "own goal" || t === "own-goal" || t === "og";
}

function findScorerSideInMatch(scorer, matchCtx = {}) {
  const name = String(scorer ?? "").trim();
  if (!name) return null;
  const inList = (list) => (list ?? []).some((p) => String(p.name ?? "").trim() === name);
  if (inList(matchCtx.lineups?.home)) return "home";
  if (inList(matchCtx.lineups?.away)) return "away";
  const { homeTeamId, awayTeamId } = matchCtx;
  if (homeTeamId && PLAYERS.some((p) => p.teamId === homeTeamId && p.name === name)) return "home";
  if (awayTeamId && PLAYERS.some((p) => p.teamId === awayTeamId && p.name === name)) return "away";
  return null;
}

/** Team that receives the goal on the scoreboard (flips for own goals). */
function goalCreditedSide(ev, matchCtx = {}) {
  const stored = ev?.side === "away" ? "away" : "home";
  if (!isOwnGoalType(ev?.type)) return stored;
  const scorerSide = findScorerSideInMatch(ev?.scorer, matchCtx);
  if (scorerSide) return scorerSide === "home" ? "away" : "home";
  return stored === "home" ? "away" : "home";
}

function renderMatchGoalEventsHtml(homeClubName, awayClubName, events, matchCtx = {}) {
  if (!events?.length) return "";

  const assistLine = (ev) => {
    if (ev.assist) {
      return `<div class="fc-goal-assist">Assist <span class="fc-goal-assist-name">${escapeHtml(ev.assist)}</span></div>`;
    }
    const bits = [`<span class="fc-goal-no-assist">No assist</span>`];
    if (ev.type) bits.push(`<span class="fc-goal-type">${escapeHtml(ev.type)}</span>`);
    return `<div class="fc-goal-assist">${bits.join(`<span class="fc-goal-sep" aria-hidden="true">·</span>`)}</div>`;
  };

  const rows = events
    .map((ev) => {
      const creditSide = goalCreditedSide(ev, matchCtx);
      const home = creditSide === "home";
      const club = home ? homeClubName : awayClubName;
      const min =
        ev.minute != null && Number.isFinite(ev.minute)
          ? `<span class="fc-goal-minute">${escapeHtml(String(ev.minute))}<span class="fc-goal-tick">'</span></span>`
          : ev.type === "Free kick" || ev.type === "Free Kick"
            ? `<span class="fc-goal-minute fc-goal-minute--fk" title="Free kick">FK</span>`
            : `<span class="fc-goal-minute fc-goal-minute--na" title="Time not set">—</span>`;
      return `
        <div class="fc-goal-row fc-goal-row--${home ? "home" : "away"}">
          ${min}
          <div class="fc-goal-main">
            <div class="fc-goal-scorer">${escapeHtml(ev.scorer ?? "")}</div>
            ${assistLine(ev)}
          </div>
          <span class="fc-goal-club">${escapeHtml(club ?? (home ? "Home" : "Away"))}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="fc-goal-sheet" role="group" aria-label="Match goals">
      <div class="fc-goal-sheet-head">
        <span class="fc-goal-sheet-title">Goals</span>
        <span class="fc-goal-sheet-ico" aria-hidden="true">⚽</span>
      </div>
      <div class="fc-goal-sheet-body">${rows}</div>
    </div>
  `;
}

/** Venue + head coaches from `m.stadium` and `TEAMS[].coach`. Omits placeholder "—". */
function renderMatchVenueCoachesHtml(m, ht, at, { list = false, hero = false } = {}) {
  const lid = m?.leagueId;
  const showStadium = leagueFeatureOn(lid, "matchStadium");
  const showCoaches = leagueFeatureOn(lid, "matchCoaches");
  const st = String(m?.stadium ?? "").trim();
  const stadiumOk = showStadium && st && st !== "—";
  const hc = String(ht?.coach ?? "").trim();
  const ac = String(at?.coach ?? "").trim();
  const homeCoachOk = showCoaches && hc && hc !== "—";
  const awayCoachOk = showCoaches && ac && ac !== "—";
  if (!stadiumOk && !homeCoachOk && !awayCoachOk) return "";

  if (hero) {
    const stadiumRowH = stadiumOk
      ? `<div class="mw-venue-row"><span class="mw-venue-label">Venue</span><span class="mw-venue-value">${escapeHtml(st)}</span></div>`
      : "";
    let coachesRowH = "";
    if (homeCoachOk || awayCoachOk) {
      const lines = [];
      if (homeCoachOk) {
        lines.push(
          `<span class="mw-coach-line-item"><span class="mw-coach-team">${escapeHtml(ht?.name ?? "Home")}</span><span class="mw-coach-name">${escapeHtml(hc)}</span></span>`,
        );
      }
      if (awayCoachOk) {
        lines.push(
          `<span class="mw-coach-line-item"><span class="mw-coach-team">${escapeHtml(at?.name ?? "Away")}</span><span class="mw-coach-name">${escapeHtml(ac)}</span></span>`,
        );
      }
      const label = homeCoachOk && awayCoachOk ? "Managers" : "Manager";
      coachesRowH = `<div class="mw-venue-row mw-venue-row--coaches"><span class="mw-venue-label">${label}</span><span class="mw-coach-lines">${lines.join("")}</span></div>`;
    }
    return `<div class="mw-venue-meta mw-venue-meta--hero">${stadiumRowH}${coachesRowH}</div>`;
  }

  const stadiumRow = stadiumOk
    ? `<div class="mw-venue-row"><span class="mw-venue-label">Venue</span><span class="mw-venue-value">${escapeHtml(st)}</span></div>`
    : "";

  let coachesRow = "";
  if (homeCoachOk || awayCoachOk) {
    if (list) {
      const lines = [];
      if (homeCoachOk) {
        lines.push(
          `<span class="mw-coach-line-item"><span class="mw-coach-team">${escapeHtml(ht?.name ?? "Home")}</span><span class="mw-coach-name">${escapeHtml(hc)}</span></span>`,
        );
      }
      if (awayCoachOk) {
        lines.push(
          `<span class="mw-coach-line-item"><span class="mw-coach-team">${escapeHtml(at?.name ?? "Away")}</span><span class="mw-coach-name">${escapeHtml(ac)}</span></span>`,
        );
      }
      const label = homeCoachOk && awayCoachOk ? "Managers" : "Manager";
      coachesRow = `<div class="mw-venue-row mw-venue-row--coaches"><span class="mw-venue-label">${label}</span><span class="mw-coach-lines">${lines.join("")}</span></div>`;
    } else {
      const bits = [];
      if (homeCoachOk) {
        bits.push(
          `<span class="mw-coach"><span class="mw-venue-label">${escapeHtml(ht?.name ?? "Home")}</span><span class="mw-venue-value">${escapeHtml(hc)}</span></span>`,
        );
      }
      if (awayCoachOk) {
        bits.push(
          `<span class="mw-coach"><span class="mw-venue-label">${escapeHtml(at?.name ?? "Away")}</span><span class="mw-venue-value">${escapeHtml(ac)}</span></span>`,
        );
      }
      coachesRow = `<div class="mw-venue-row mw-venue-row--coaches">${bits.join(`<span class="mw-coach-sep" aria-hidden="true">·</span>`)}</div>`;
    }
  }

  const cls = list ? "mw-venue-meta mw-venue-meta--list mw-venue-meta--hero" : "mw-venue-meta";
  return `<div class="${cls}">${stadiumRow}${coachesRow}</div>`;
}

/** Parse a formation string like "4-2-3-1" into outfield line counts [4,2,3,1]. */
function parseFormationLines(formation) {
  return String(formation ?? "")
    .split(/[^0-9]+/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Left/right hint from a positional tag so wide players sit on the correct flank. */
function tagSideHint(tag) {
  const t = String(tag ?? "").toUpperCase();
  if (/^L/.test(t)) return -1;
  if (/^R/.test(t)) return 1;
  return 0;
}

/** Fallback grouping by positional tag when a formation string is missing/mismatched. */
function lineupBand(tag) {
  const t = String(tag ?? "").toUpperCase();
  if (["CB", "RB", "LB", "RWB", "LWB", "WB", "DF"].includes(t)) return 0;
  if (["DM", "CDM", "DMF"].includes(t)) return 1;
  if (["CM", "RM", "LM", "MF", "CMF"].includes(t)) return 2;
  if (["AM", "CAM", "RAM", "LAM", "AMF"].includes(t)) return 3;
  return 4; // RW, LW, CF, ST, SS, FW, etc.
}

/** Build pitch rows (GK first) from a formation + lineup list. */
function buildFormationRows(formation, lineup) {
  const all = (lineup ?? []).filter(Boolean);
  if (!all.length) return [];

  const players = all.slice();
  let gkIdx = players.findIndex((p) => String(p.tag ?? "").toUpperCase() === "GK");
  if (gkIdx < 0) gkIdx = 0;
  const gk = players.splice(gkIdx, 1)[0];

  const lines = parseFormationLines(formation);
  const sum = lines.reduce((a, b) => a + b, 0);

  let rows;
  if (lines.length && sum === players.length) {
    rows = [];
    let idx = 0;
    for (const n of lines) {
      rows.push(players.slice(idx, idx + n));
      idx += n;
    }
  } else {
    const bands = [[], [], [], [], []];
    for (const p of players) bands[lineupBand(p.tag)].push(p);
    rows = bands.filter((b) => b.length);
  }

  // Order each outfield row left -> right by flank hint (stable for centre players).
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    row.forEach((p, i) => (p.__i = i));
    row.sort((a, b) => tagSideHint(a.tag) - tagSideHint(b.tag) || a.__i - b.__i);
    row.forEach((p) => delete p.__i);
    rows[r] =
      typeof SquadDepth !== "undefined" ? SquadDepth.centerDmInPitchRow(row, (p) => p.tag) : row;
  }

  return [[gk], ...rows];
}

/** Short label for a pitch token: surname only, falling back to the full name. */
function lineupShortName(name) {
  return deriveLastNameFromFullName(name);
}

/** SVG pitch markings overlay (portrait, viewBox 0 0 100 155). */
function pitchMarkingsSvg() {
  return `<svg class="pitch-markings" viewBox="0 0 100 155" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="94" height="149" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <line x1="3" y1="77.5" x2="97" y2="77.5" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <circle cx="50" cy="77.5" r="13" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <circle cx="50" cy="77.5" r="0.8" fill="rgba(255,255,255,0.4)"/>
    <rect x="22" y="3" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <rect x="35" y="3" width="30" height="10" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <circle cx="50" cy="19" r="0.8" fill="rgba(255,255,255,0.4)"/>
    <rect x="22" y="130" width="56" height="22" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <rect x="35" y="142" width="30" height="10" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="0.6"/>
    <circle cx="50" cy="136" r="0.8" fill="rgba(255,255,255,0.4)"/>
    <rect x="40" y="1" width="20" height="3" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
    <rect x="40" y="151" width="20" height="3" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
    <path d="M 35,25 A 13,13 0 0,0 65,25" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M 35,130 A 13,13 0 0,1 65,130" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M 3,6 A 3,3 0 0,1 6,3" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M 94,3 A 3,3 0 0,1 97,6" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M 3,149 A 3,3 0 0,0 6,152" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
    <path d="M 97,149 A 3,3 0 0,0 94,152" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.6"/>
  </svg>`;
}

/** One team's interactive XI rendered on a glassmorphic pitch. */
function renderPitchSideHtml(teamName, formation, lineup, side, showFormation = true, teamId = "") {
  const formationBadge =
    showFormation && formation
      ? `<span class="lineup-formation-badge">${escapeHtml(formation)}</span>`
      : "";
  const rows = buildFormationRows(formation, lineup);
  if (!rows.length) {
    return `
      <section class="lineup-block pitch-side">
        <div class="lineup-team-header pitch-side-head">
          <h3 class="lineup-team-name pitch-team">${escapeHtml(teamName)}</h3>
          ${formationBadge}
        </div>
        <div class="pitch pitch--empty"><span class="muted">Lineup not available.</span></div>
      </section>
    `;
  }

  const rowCount = rows.length;
  const tokens = rows
    .map((row, r) => {
      const top = rowCount > 1 ? 90 - (r / (rowCount - 1)) * 78 : 50;
      const isGkRow = r === 0;
      return row
        .map((p, c) => {
          const left = ((c + 1) / (row.length + 1)) * 100;
          const isGk = isGkRow || String(p.tag ?? "").toUpperCase() === "GK";
          const fullName = formatLineupDisplayName(p.name, p.captain);
          const short = playerDisplayLastName({ teamId, lineupSlot: p });
          const num = escapeHtml(p.number ?? "");
          const tag = escapeHtml(String(p.tag ?? "").toUpperCase() || (isGk ? "GK" : "—"));
          const nat = escapeHtml(String(p.nationality ?? "").trim());
          const meta = [tag, nat || teamName].filter(Boolean).join(" · ");
          const capClass = isCaptainPlayer(p) ? " captain" : "";
          const nodeClass = isGk ? "player-node gk pitch-player is-gk" : "player-node pitch-player";
          return `
            <div class="${nodeClass}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">
              <div class="player-circle pitch-token${capClass}">${num}</div>
              <div class="player-name-tag pitch-name">${escapeHtml(short)}</div>
              <div class="player-tooltip">
                <div class="player-tooltip-name">${escapeHtml(fullName)}</div>
                <div class="player-tooltip-meta">${meta}</div>
              </div>
            </div>
          `;
        })
        .join("");
    })
    .join("");

  return `
    <section class="lineup-block pitch-side">
      <div class="lineup-team-header pitch-side-head">
        <h3 class="lineup-team-name pitch-team">${escapeHtml(teamName)}</h3>
        ${formationBadge}
      </div>
      <div class="pitch" data-side="${escapeHtml(side)}">
        ${pitchMarkingsSvg()}
        <div class="pitch-players">${tokens}</div>
      </div>
    </section>
  `;
}

/** Wire up the Pitch/List segmented toggle inside the open match modal. */
function bindLineupViewToggle() {
  const root = $("#modalBody .lineup-views-wrap");
  if (!root) return;
  const btns = $$(".lineup-view-btn", root);
  const panels = $$(".lineup-view", root);
  for (const btn of btns) {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      for (const b of btns) {
        b.classList.toggle("is-active", b === btn);
        b.classList.toggle("active", b === btn);
      }
      for (const p of panels) p.classList.toggle("is-hidden", p.dataset.viewPanel !== view);
    });
  }
}

function renderMatchCenter(leagueId) {
  renderMatchCenter._leagueId = leagueId;
  const tabs = $("#matchTabs");
  const listEl = $("#matchList");
  const titleEl = $("#mwTitle");
  const rangeEl = $("#mwRange");
  const prevBtn = $("#mwPrev");
  const nextBtn = $("#mwNext");
  const dateTitleEl = $("#mwDateTitle");
  const dateMetaEl = $("#mwDateMeta");
  if (!tabs || !listEl || !titleEl || !rangeEl || !prevBtn || !nextBtn || !dateTitleEl || !dateMetaEl) return;

  renderLeagueTabBar(tabs, leagueId, "data-match-tab");

  const onOpen = (matchId) => {
    const m = MATCHES.find((x) => x.id === matchId);
    if (!m) return;
    const ht = teamById.get(m.homeTeamId);
    const at = teamById.get(m.awayTeamId);
    const showGoals = leagueFeatureOn(leagueId, "matchGoalEvents");
    const showFormation = leagueFeatureOn(leagueId, "matchFormation");
    const showLineups = leagueFeatureOn(leagueId, "matchLineups");
    const showPitch = showLineups && leagueFeatureOn(leagueId, "matchPitchView");
    const showPossession = leagueFeatureOn(leagueId, "matchPossession");
    const goalsHtml = showGoals
      ? renderMatchGoalEventsHtml(ht?.name, at?.name, m.goalEvents, {
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          lineups: m.lineups,
        })
      : "";
    const venueHtml = renderMatchVenueCoachesHtml(m, ht, at);

    const renderLineupSide = (title, formation, list) => {
      const rows = (list ?? [])
        .map((p) => {
          const nat = leagueFeatureOn(leagueId, "playerNationality")
            ? [p.flag, p.nationality].filter(Boolean).join(" ")
            : "";
          const numCell = leagueFeatureOn(leagueId, "playerNumber")
            ? `<span class="lineup-num">${escapeHtml(p.number ?? "")}</span>`
            : "";
          return `
            <div class="lineup-row">
              <span class="lineup-tag">(${escapeHtml(p.tag ?? "")})</span>
              ${numCell}
              <span class="lineup-name">${escapeHtml(formatLineupDisplayName(p.name, p.captain))}</span>
              <span class="lineup-nat">${escapeHtml(nat)}</span>
            </div>
          `;
        })
        .join("");

      const formationHtml = showFormation && formation
        ? `<div class="lineup-formation">${escapeHtml(formation)}</div>`
        : "";
      return `
        <section class="lineup-side">
          <div class="lineup-head">
            <div class="lineup-team">${escapeHtml(title)}</div>
            ${formationHtml}
          </div>
          <div class="lineup-list">${rows || "<div class='muted'>Lineup not available.</div>"}</div>
        </section>
      `;
    };

    const statusChip = leagueFeatureOn(leagueId, "matchStatus")
      ? `<span class="chip">${escapeHtml(m.status)} • ${escapeHtml(m.time)}</span>`
      : `<span class="chip">${escapeHtml(m.time)}</span>`;

    if (m.lineups && showLineups) {
      const legacyScorers =
        showGoals && !goalsHtml && (m.scorers ?? []).length > 0
          ? `<p class="muted" style="margin:0 0 14px;font-weight:800;line-height:1.5">${escapeHtml((m.scorers ?? []).join(" • "))}</p>`
          : "";

      const listGrid = `
        <div class="lineups-grid">
          ${renderLineupSide(ht?.name ?? "Home", m.formation?.[0], m.lineups.home)}
          ${renderLineupSide(at?.name ?? "Away", m.formation?.[1], m.lineups.away)}
        </div>
      `;

      const lineupBlock = showPitch
        ? `
          <div class="lineup-views-wrap">
            ${lineupShareToolbarHtml({ showPitchToggle: true })}
            <div class="lineup-view" data-view-panel="pitch">
              <div class="lineups-wrapper pitch-grid">
                ${renderPitchSideHtml(ht?.name ?? "Home", m.formation?.[0], m.lineups.home, "home", showFormation, m.homeTeamId)}
                ${renderPitchSideHtml(at?.name ?? "Away", m.formation?.[1], m.lineups.away, "away", showFormation, m.awayTeamId)}
              </div>
            </div>
            <div class="lineup-view is-hidden" data-view-panel="list">
              ${listGrid}
            </div>
          </div>
        `
        : `
          <div class="lineup-views-wrap">
            ${lineupShareToolbarHtml({ showPitchToggle: false })}
            ${listGrid}
          </div>
        `;

      matchLineupSharePayload = buildLineupSharePayload(m, ht, at, leagueId);

      openModal({
        title: `${ht?.name ?? "Home"} ${m.score?.[0] ?? "—"}–${m.score?.[1] ?? "—"} ${at?.name ?? "Away"}`,
        bodyHtml: `
          <div class="chips" style="margin-bottom:10px">
            <span class="chip">${escapeHtml(m.matchday)}</span>
            ${statusChip}
          </div>
          ${venueHtml}
          ${goalsHtml}
          ${legacyScorers}
          ${lineupBlock}
        `,
        primaryLabel: "Done",
      });
      if (showPitch) bindLineupViewToggle();
      bindLineupShareButton();
      return;
    }

    matchLineupSharePayload = null;

    const possessionCard = showPossession
      ? `<div class="card" style="padding:12px">
            <div class="muted" style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:11px">Possession</div>
            <div style="font-weight:950;margin-top:6px">${escapeHtml(m.possession?.[0] ?? "—")}% — ${escapeHtml(m.possession?.[1] ?? "—")}%</div>
          </div>`
      : "";
    const formationsCard = showFormation
      ? `<div class="card" style="padding:12px">
            <div class="muted" style="font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:11px">Formations</div>
            <div style="font-weight:950;margin-top:6px">${escapeHtml(m.formation?.[0] ?? "—")} • ${escapeHtml(m.formation?.[1] ?? "—")}</div>
          </div>`
      : "";
    const statBoxes = possessionCard || formationsCard
      ? `<div style="display:grid;grid-template-columns:${possessionCard && formationsCard ? "1fr 1fr" : "1fr"};gap:10px">${possessionCard}${formationsCard}</div>`
      : "";
    const momentumBar = showPossession
      ? `<div class="momentum" style="margin:10px 0"><span style="width:${escapeHtml(Math.round((m.momentum ?? 0.5) * 100))}%"></span></div>`
      : "";

    openModal({
      title: `${ht?.name ?? "Home"} vs ${at?.name ?? "Away"}`,
      bodyHtml: `
        <div class="chips" style="margin-bottom:10px">
          <span class="chip">${escapeHtml(m.matchday)}</span>
          ${statusChip}
        </div>
        ${venueHtml}
        ${
          goalsHtml
            ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
          <strong style="font-size:18px">${escapeHtml(m.score[0])}–${escapeHtml(m.score[1])}</strong>
          <span class="muted" style="font-weight:800;font-size:12px">Final score</span>
        </div>
        ${goalsHtml}`
            : `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
          <strong style="font-size:18px">${escapeHtml(m.score[0])}–${escapeHtml(m.score[1])}</strong>
          <span class="muted" style="font-weight:800">${escapeHtml(showGoals ? (m.scorers ?? []).join(" • ") || "No scorers" : "")}</span>
        </div>`
        }
        ${momentumBar}
        ${statBoxes}
      `,
      primaryLabel: "Close",
    });
  };

  const meta =
    typeof FCDataStore !== "undefined"
      ? FCDataStore.getLeagueMeta(leagueId)
      : { matchweek: 36, dateRange: leagueId === "laliga" ? "Saturday 10 May – Tuesday 12 May" : "Saturday 9 May – Tuesday 12 May" };
  const publishedWeek = meta.matchweek ?? 36;
  const showAll = leagueShowsAllFixtures(leagueId);
  let viewWeek = showAll ? publishedWeek : renderMatchCenter._viewWeek ?? publishedWeek;
  if (!showAll && renderMatchCenter._viewWeek == null) renderMatchCenter._viewWeek = publishedWeek;

  const setWeek = (w, { edge = "start" } = {}) => {
    if (showAll) return;
    renderMatchCenter._viewWeek = w;
    const key = matchCenterDateStorageKey(leagueId, w);
    if (!renderMatchCenter._viewDateByWeek) renderMatchCenter._viewDateByWeek = {};
    // Defer date pick until after we know the week's groups
    renderMatchCenter._pendingWeekEdge = { key, edge };
    delete renderMatchCenter._viewDateByWeek[key];
    renderMatchCenter(leagueId);
  };

  if (showAll) {
    titleEl.textContent = meta.matchweekTitle || "World Cup";
    rangeEl.textContent = meta.dateRange ?? "—";
    rangeEl.hidden = false;
    rangeEl.classList.add("is-visible");
  } else {
    titleEl.textContent =
      viewWeek === publishedWeek
        ? meta.matchweekTitle || `Matchweek ${publishedWeek}`
        : `Matchweek ${viewWeek}`;
    rangeEl.textContent = viewWeek === publishedWeek ? meta.dateRange ?? "—" : "Browse earlier / later gameweeks";
    rangeEl.hidden = viewWeek === publishedWeek;
    rangeEl.classList.toggle("is-visible", viewWeek !== publishedWeek);
  }

  const weekMatches = filterMatchesForLeagueWeek(MATCHES, leagueId, viewWeek);
  let { dateGroups, activeIndex, activeGroup } = resolveMatchCenterDateView(
    leagueId,
    viewWeek,
    weekMatches,
    showAll,
  );
  const storageKey = matchCenterDateStorageKey(leagueId, viewWeek);
  const pending = renderMatchCenter._pendingWeekEdge;
  if (pending && pending.key === storageKey && dateGroups.length) {
    const idx = pending.edge === "end" ? dateGroups.length - 1 : 0;
    if (!renderMatchCenter._viewDateByWeek) renderMatchCenter._viewDateByWeek = {};
    renderMatchCenter._viewDateByWeek[storageKey] = dateGroups[idx].key;
    renderMatchCenter._pendingWeekEdge = null;
    ({ dateGroups, activeIndex, activeGroup } = resolveMatchCenterDateView(
      leagueId,
      viewWeek,
      weekMatches,
      showAll,
    ));
  }
  const displayMatches = activeGroup?.items ?? [];
  const fixtureWord = displayMatches.length === 1 ? "fixture" : "fixtures";

  dateTitleEl.textContent = activeGroup?.label ?? "No dates";
  dateMetaEl.textContent = displayMatches.length
    ? `${displayMatches.length} ${fixtureWord}`
    : weekMatches.length
      ? "No fixtures on this date"
      : "No fixtures this gameweek";

  const setDateIndex = (index) => {
    const group = dateGroups[index];
    if (!group) return;
    if (!renderMatchCenter._viewDateByWeek) renderMatchCenter._viewDateByWeek = {};
    renderMatchCenter._viewDateByWeek[storageKey] = group.key;
    renderMatchCenter(leagueId);
  };

  /** One arrow pair: step dates within the week, then spill into adjacent matchweeks. */
  const stepMatchday = (delta) => {
    if (showAll) {
      const next = activeIndex + delta;
      if (next >= 0 && next < dateGroups.length) setDateIndex(next);
      return;
    }
    const next = activeIndex + delta;
    if (next >= 0 && next < dateGroups.length) {
      setDateIndex(next);
      return;
    }
    if (delta < 0 && viewWeek > 1) {
      setWeek(viewWeek - 1, { edge: "end" });
      return;
    }
    if (delta > 0) setWeek(viewWeek + 1, { edge: "start" });
  };

  const canGoPrev = showAll
    ? activeIndex > 0
    : activeIndex > 0 || viewWeek > 1;
  const canGoNext = showAll
    ? activeIndex >= 0 && activeIndex < dateGroups.length - 1
    : true;

  prevBtn.disabled = !canGoPrev;
  nextBtn.disabled = !canGoNext;
  prevBtn.classList.toggle("opacity-50", !canGoPrev);
  nextBtn.classList.toggle("opacity-50", !canGoNext);
  prevBtn.classList.remove("d-none");
  nextBtn.classList.remove("d-none");
  prevBtn.onclick = () => stepMatchday(-1);
  nextBtn.onclick = () => stepMatchday(1);

  const showStatus = leagueFeatureOn(leagueId, "matchStatus");
  const rowHtml = (m) => {
    const ht = teamById.get(m.homeTeamId);
    const at = teamById.get(m.awayTeamId);
    return `
      <div
        class="mw-row"
        data-match="${escapeHtml(m.id)}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(matchCardAriaLabel(m, ht, at))}"
      >
        ${matchCenterFixtureHtml(m, { showStatus, matchId: m.id })}
      </div>
    `;
  };

  listEl.innerHTML = displayMatches.length
    ? displayMatches.map(rowHtml).join("")
    : `<div class="mw-empty">${escapeHtml(dateMetaEl.textContent)}</div>`;

  for (const row of $$("[data-match]", listEl)) {
    const id = row.getAttribute("data-match");
    if (!id) continue;
    row.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-open], [data-mc-tab], .mc-match-tabs__tab, .mc-match-tabs__panel, .live-blog")) return;
      onOpen(id);
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const t = e.target;
        if (t instanceof Element && t.closest("[data-mc-tab], .mc-match-tabs__tab")) return;
        e.preventDefault();
        onOpen(id);
      }
    });
  }
  for (const btn of $$("[data-open]", listEl)) {
    const id = btn.getAttribute("data-open");
    if (!id) continue;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onOpen(id);
    });
  }
  bindMatchCenterDetailTabs(listEl);

  const stEl = $("#miniStandings");
  if (stEl) {
    const featuredTeam = teamById.get($("#teamSelect")?.value ?? "");
    if (leagueUsesGroupStandings(leagueId)) {
      stEl.innerHTML = renderGroupStandingsHtml(groupStandingsForLeague(leagueId), leagueId);
    } else {
      const rows = miniStandingsBlock(leagueId)?.rows ?? [];
      stEl.innerHTML = rows.length
        ? renderMiniStandingsTableHtml(rows, {
            leagueId,
            title: "Standings",
            showLegend: true,
            highlightClub: featuredTeam?.name ?? "",
          })
        : "<div class='standings-empty'>No standings for this league.</div>";
    }
  }

  const scEl = $("#topScorers");
  if (scEl) {
    scEl.innerHTML = renderTopScorersHtml(leagueId, topScorerStatMode);
  }
}

let topScorerStatMode = "goals";

function topScorerRowsFromTable(leagueId) {
  return (TOP_SCORERS.find((x) => x.leagueId === leagueId)?.rows ?? [])
    .map(([name, club, goals]) => ({
      name: String(name ?? "").trim(),
      club: String(club ?? "").trim(),
      value: Number(goals) || 0,
    }))
    .filter((r) => r.name)
    .slice(0, 5);
}

function topAssistRowsFromMatches(leagueId, limit = 5) {
  const counts = new Map();
  for (const m of MATCHES) {
    if (m.leagueId !== leagueId) continue;
    for (const ev of m.goalEvents ?? []) {
      const assist = stripCaptainSuffix(String(ev.assist ?? "").trim());
      if (!assist) continue;
      const teamId = ev.side === "away" ? m.awayTeamId : m.homeTeamId;
      const team = teamById.get(teamId);
      const club = team?.name ?? "";
      const prev = counts.get(assist) ?? { name: assist, club, value: 0 };
      if (club) prev.club = club;
      prev.value += 1;
      counts.set(assist, prev);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function renderTopScorersHtml(leagueId, mode = "goals") {
  const rows = mode === "assists" ? topAssistRowsFromMatches(leagueId) : topScorerRowsFromTable(leagueId);
  if (!rows.length) {
    const empty =
      mode === "assists" ? "No assists recorded for this league yet." : "No scorers for this league.";
    return `<div class="muted mc-empty">${empty}</div>`;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="mc-score-list" role="table" aria-label="${mode === "assists" ? "Top assists" : "Top scorers"}">${rows
    .map((row, i) => {
      const rank = i + 1;
      const pct = Math.max(8, Math.round((row.value / max) * 100));
      const crest = clubCrestFromName(row.club, leagueId, "squad-crest mc-score-crest");
      const leaderClass = rank === 1 ? " mc-score-row--leader" : "";
      return `
        <div class="mc-score-row${leaderClass}" role="row" style="--mc-score-bar:${pct}%">
          <span class="mc-score-rank" aria-label="Rank ${rank}">${rank}</span>
          ${crest}
          <div class="mc-score-main">
            <span class="mc-score-name">${escapeHtml(row.name)}</span>
            <span class="mc-score-club">${escapeHtml(row.club)}</span>
          </div>
          <span class="mc-score-goals" aria-label="${mode === "assists" ? "Assists" : "Goals"} ${row.value}">${escapeHtml(String(row.value))}</span>
        </div>`;
    })
    .join("")}</div>`;
}

function syncTopScorerStatToggle() {
  for (const btn of $$("[data-scorer-stat]")) {
    const on = btn.getAttribute("data-scorer-stat") === topScorerStatMode;
    btn.classList.toggle("is-active", on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
}

function setupTopScorerControls() {
  const card = document.querySelector('[aria-label="Top scorers"]');
  if (!card || card.dataset.scorerToggleBound) return;
  card.dataset.scorerToggleBound = "1";
  card.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-scorer-stat]");
    if (!btn) return;
    const mode = btn.getAttribute("data-scorer-stat");
    if (!mode || mode === topScorerStatMode) return;
    topScorerStatMode = mode;
    syncTopScorerStatToggle();
    const leagueId = $("#leagueSelect")?.value ?? LEAGUES[0]?.id;
    const scEl = $("#topScorers");
    if (scEl && leagueId) scEl.innerHTML = renderTopScorersHtml(leagueId, topScorerStatMode);
  });
}

function refreshSiteFromStore() {
  if (document.body?.dataset?.page === "admin") return;
  if (typeof FCDataStore !== "undefined") FCDataStore.hydrateInPlace(FC_ARRAYS);
  syncLeagueConfigFromStore();
  refreshNationalityFlagsLearn();
  rebuildTeamIndex();
  rebuildLineupRosterIndex();
  renderLeagueOptions();
  updateHeroSummary();
  const leagueId = $("#leagueSelect")?.value ?? LEAGUES[0]?.id;
  if (!leagueId) return;
  setActiveLeague(leagueId);
}

function main() {
  if (document.body?.dataset?.page === "admin") return;

  setupNav();
  setupTheme();
  setupSidebarNav();
  setupAdminNavVisibility();
  setupBackToTop();
  setupBootstrapUI();
  setupHowItWorks();
  setupRevealAnimations();
  setupHomeEntranceAnimations();

  renderLeagueOptions();
  setupRosterControls();
  setupShareButtons();
  setupTransferControls();
  setupTopScorerControls();
  setupLeagueSwitcherLayout();

  updateHeroSummary();
  setActiveLeague(LEAGUES[0].id);
  refreshHomeEntranceAnimations();
}

document.addEventListener("fc-data-updated", refreshSiteFromStore);

function startApp() {
  if (window.__FC_SEED_READY__) main();
  else document.addEventListener("fc-data-ready", main, { once: true });
}

document.addEventListener("DOMContentLoaded", startApp);

