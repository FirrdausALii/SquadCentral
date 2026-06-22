/**
 * One-off helper: merge World Cup league, teams, and players into data.json.
 * Run: node scripts/patch-worldcup-data-json.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data.json");

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

const SQUAD_TEMPLATE = [
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

function makePlayerId(teamId, number, name) {
  return `${teamId}_${number}_${String(name).replaceAll(" ", "_")}`;
}

function buildWorldCupCatalog() {
  const teams = [];
  const players = [];
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
    SQUAD_TEMPLATE.forEach((slot, i) => {
      const name = `${n.name} Player ${i + 1}`;
      players.push({
        id: makePlayerId(teamId, slot.number, name),
        teamId,
        number: slot.number,
        name,
        pos: slot.pos,
        role: slot.role,
        flag: n.flag,
        nationality: n.nationality,
      });
    });
  }
  return { teams, players };
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

if (!data.leagues.some((l) => l.id === "worldcup")) {
  data.leagues.push({ id: "worldcup", name: "World Cup" });
}
if (!data.heroLeagueTabs.includes("worldcup")) {
  data.heroLeagueTabs.push("worldcup");
}
data.leagueUi = data.leagueUi ?? {};
data.leagueUi.worldcup = data.leagueUi.worldcup ?? { c1: "#1fe4a5", c2: "#ffd166", mask: "trophy" };

const wc = buildWorldCupCatalog();
const existingTeamIds = new Set(data.teams.map((t) => t.id));
for (const t of wc.teams) {
  if (!existingTeamIds.has(t.id)) data.teams.push(t);
}
const existingPlayerIds = new Set(data.players.map((p) => p.id));
for (const p of wc.players) {
  if (!existingPlayerIds.has(p.id)) data.players.push(p);
}

if (!data.miniStandings.some((x) => x.leagueId === "worldcup")) {
  data.miniStandings.push({
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
  });
}
if (!data.topScorers.some((x) => x.leagueId === "worldcup")) {
  data.topScorers.push({ leagueId: "worldcup", rows: [] });
}
if (!data.transfers.some((x) => x.leagueId === "worldcup")) {
  data.transfers.push({ leagueId: "worldcup", in: [], out: [] });
}

data.leagueMeta = data.leagueMeta ?? {};
data.leagueMeta.worldcup = data.leagueMeta.worldcup ?? {
  matchweek: 1,
  matchweekTitle: "Group Stage",
  dateRange: "Set date range in admin",
};

data.dataRevision = Date.now();

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Patched ${DATA_PATH}: ${wc.teams.length} World Cup teams, ${wc.players.length} players.`);
