/**
 * Update World Cup Group I rosters (Norway, Iraq) from Transfermarkt 2026 squads.
 * Run: node scripts/update-worldcup-group-i-norway-iraq.js
 */
const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data.json");

function playerId(teamId, number, name) {
  const slug = String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return `${teamId}_${number}_${slug}`;
}

function makePlayer(teamId, entry, flag, nationality) {
  const p = {
    id: playerId(teamId, entry.number, entry.name),
    teamId,
    number: entry.number,
    name: entry.name,
    pos: entry.pos,
    role: entry.role,
    club: entry.club,
    flag,
    nationality,
  };
  if (entry.captain) p.captain = true;
  return p;
}

const NORWAY = [
  { number: 12, name: "Sander Tangvik", pos: "GK", role: "GK", club: "Brann" },
  { number: 13, name: "Egil Selvik", pos: "GK", role: "GK", club: "Lillestrom" },
  { number: 1, name: "Orjan Nyland", pos: "GK", role: "GK", club: "Sevilla" },
  { number: 3, name: "Kristoffer Ajer", pos: "DF", role: "CB", club: "Brentford" },
  { number: 4, name: "Leo Ostigard", pos: "DF", role: "CB", club: "Genoa" },
  { number: 17, name: "Torbjorn Heggem", pos: "DF", role: "CB", club: "Bodo/Glimt" },
  { number: 25, name: "Henrik Falchener", pos: "DF", role: "CB", club: "Molde" },
  { number: 24, name: "Sondre Langas", pos: "DF", role: "CB", club: "Viking" },
  { number: 5, name: "David Moller Wolfe", pos: "DF", role: "LB", club: "AZ Alkmaar" },
  { number: 15, name: "Fredrik Bjorkan", pos: "DF", role: "LB", club: "Bodo/Glimt" },
  { number: 26, name: "Julian Ryerson", pos: "DF", role: "RB", club: "Borussia Dortmund" },
  { number: 16, name: "Marcus Pedersen", pos: "DF", role: "RB", club: "Torino" },
  { number: 8, name: "Sander Berge", pos: "MF", role: "DM", club: "Fulham" },
  { number: 6, name: "Patrick Berg", pos: "MF", role: "DM", club: "Bodo/Glimt" },
  { number: 14, name: "Fredrik Aursnes", pos: "MF", role: "CM", club: "Benfica" },
  { number: 18, name: "Kristian Thorstvedt", pos: "MF", role: "CM", club: "Sassuolo" },
  { number: 2, name: "Morten Thorsby", pos: "MF", role: "CM", club: "Genoa" },
  { number: 10, name: "Martin Odegaard", pos: "MF", role: "AM", club: "Arsenal", captain: true },
  { number: 19, name: "Thelo Aasgaard", pos: "MF", role: "AM", club: "Lillestrom" },
  { number: 20, name: "Antonio Nusa", pos: "FW", role: "LW", club: "RB Leipzig" },
  { number: 21, name: "Andreas Schjelderup", pos: "FW", role: "LW", club: "Benfica" },
  { number: 23, name: "Jens Petter Hauge", pos: "FW", role: "LW", club: "Bodo/Glimt" },
  { number: 22, name: "Oscar Bobb", pos: "FW", role: "RW", club: "Manchester City" },
  { number: 9, name: "Erling Haaland", pos: "FW", role: "CF", club: "Manchester City" },
  { number: 11, name: "Jorgen Strand Larsen", pos: "FW", role: "CF", club: "Wolverhampton Wanderers" },
  { number: 7, name: "Alexander Sorloth", pos: "FW", role: "CF", club: "Atletico Madrid" },
];

const IRAQ = [
  { number: 22, name: "Ahmed Basil Fadhil", pos: "GK", role: "GK", club: "Al-Zawraa" },
  { number: 1, name: "Fahad Talib", pos: "GK", role: "GK", club: "Al-Shorta" },
  { number: 12, name: "Jalal Hassan", pos: "GK", role: "GK", club: "Al-Quwa Al-Jawiya" },
  { number: 5, name: "Akam Hashem", pos: "DF", role: "CB", club: "Al-Quwa Al-Jawiya" },
  { number: 4, name: "Zaid Tahseen", pos: "DF", role: "CB", club: "Al-Shorta" },
  { number: 26, name: "Frans Putros", pos: "DF", role: "CB", club: "Hammarby" },
  { number: 6, name: "Manaf Younis", pos: "DF", role: "CB", club: "Al-Zawraa" },
  { number: 2, name: "Rebin Sulaka", pos: "DF", role: "CB", club: "Western Sydney Wanderers" },
  { number: 23, name: "Merchas Doski", pos: "DF", role: "LB", club: "Silkeborg" },
  { number: 15, name: "Ahmed Maknzi", pos: "DF", role: "LB", club: "Al-Shorta" },
  { number: 3, name: "Hussein Ali", pos: "DF", role: "RB", club: "Al-Zawraa" },
  { number: 25, name: "Mustafa Saadoon", pos: "DF", role: "RB", club: "Al-Quwa Al-Jawiya" },
  { number: 16, name: "Amir Al-Ammari", pos: "MF", role: "DM", club: "Halmstads BK" },
  { number: 24, name: "Zaid Ismail", pos: "MF", role: "DM", club: "Al-Shorta" },
  { number: 20, name: "Aimar Sher", pos: "MF", role: "CM", club: "Union Berlin" },
  { number: 14, name: "Zidane Iqbal", pos: "MF", role: "CM", club: "FC Utrecht" },
  { number: 19, name: "Kevin Yakob", pos: "MF", role: "CM", club: "Venezia" },
  { number: 21, name: "Marko Farji", pos: "FW", role: "LW", club: "Al-Shorta" },
  { number: 7, name: "Youssef Amyn", pos: "FW", role: "LW", club: "Al-Ettifaq" },
  { number: 17, name: "Ali Jasim", pos: "FW", role: "LW", club: "Como" },
  { number: 11, name: "Ahmed Qasem", pos: "FW", role: "RW", club: "Al-Shorta" },
  { number: 8, name: "Ibrahim Bayesh", pos: "FW", role: "RW", club: "Al-Quwa Al-Jawiya" },
  { number: 9, name: "Ali Al-Hamadi", pos: "FW", role: "CF", club: "Ipswich Town" },
  { number: 10, name: "Mohanad Ali", pos: "FW", role: "CF", club: "Al-Duhail" },
  { number: 18, name: "Aymen Hussein", pos: "FW", role: "CF", club: "Al-Najma", captain: true },
  { number: 13, name: "Ali Yousif", pos: "FW", role: "CF", club: "Al-Shorta" },
];

const TEAMS = [
  { id: "worldcup_norway", flag: "🇳🇴", nationality: "Norway", squad: NORWAY },
  { id: "worldcup_iraq", flag: "🇮🇶", nationality: "Iraq", squad: IRAQ },
];

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const removeIds = new Set(TEAMS.map((t) => t.id));

const removed = data.players.filter((p) => removeIds.has(p.teamId)).length;
data.players = data.players.filter((p) => !removeIds.has(p.teamId));

for (const team of TEAMS) {
  for (const entry of team.squad) {
    data.players.push(makePlayer(team.id, entry, team.flag, team.nationality));
  }
}

data.dataRevision = Date.now();
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`Updated Group I rosters in ${DATA_PATH}`);
console.log(`  Removed ${removed} old players`);
console.log(`  Norway: ${NORWAY.length} players`);
console.log(`  Iraq: ${IRAQ.length} players`);
console.log(`  Total players now: ${data.players.length}`);
