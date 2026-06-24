/**
 * Update World Cup Group J rosters (Austria, Jordan) from Transfermarkt 2026 squads.
 * Run: node scripts/update-worldcup-group-j-austria-jordan.js
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

const AUSTRIA = [
  { number: 12, name: "Florian Wiegele", pos: "GK", role: "GK", club: "Austria Wien" },
  { number: 13, name: "Patrick Pentz", pos: "GK", role: "GK", club: "Brondby" },
  { number: 1, name: "Alexander Schlager", pos: "GK", role: "GK", club: "RB Leipzig" },
  { number: 2, name: "David Affengruber", pos: "DF", role: "CB", club: "VfB Stuttgart" },
  { number: 3, name: "Kevin Danso", pos: "DF", role: "CB", club: "Tottenham Hotspur" },
  { number: 15, name: "Philipp Lienhart", pos: "DF", role: "CB", club: "SC Freiburg" },
  { number: 23, name: "Marco Friedl", pos: "DF", role: "CB", club: "Werder Bremen" },
  { number: 5, name: "Stefan Posch", pos: "DF", role: "CB", club: "Como" },
  { number: 25, name: "Michael Svoboda", pos: "DF", role: "CB", club: "Wolfsberger AC" },
  { number: 8, name: "David Alaba", pos: "DF", role: "CB", club: "Real Madrid", captain: true },
  { number: 16, name: "Phillipp Mwene", pos: "DF", role: "LB", club: "Mainz 05" },
  { number: 20, name: "Konrad Laimer", pos: "DF", role: "RB", club: "Bayern Munich" },
  { number: 6, name: "Nicolas Seiwald", pos: "MF", role: "DM", club: "RB Leipzig" },
  { number: 19, name: "Dejan Ljubicic", pos: "MF", role: "DM", club: "1. FC Koln" },
  { number: 10, name: "Florian Grillitsch", pos: "MF", role: "DM", club: "TSG Hoffenheim" },
  { number: 24, name: "Paul Wanner", pos: "MF", role: "CM", club: "Bayern Munich" },
  { number: 17, name: "Carney Chukwuemeka", pos: "MF", role: "CM", club: "Chelsea" },
  { number: 4, name: "Xaver Schlager", pos: "MF", role: "CM", club: "RB Leipzig" },
  { number: 9, name: "Marcel Sabitzer", pos: "MF", role: "CM", club: "Borussia Dortmund" },
  { number: 26, name: "Alessandro Schopf", pos: "MF", role: "CM", club: "SK Rapid Wien" },
  { number: 22, name: "Alexander Prass", pos: "MF", role: "LM", club: "TSG Hoffenheim" },
  { number: 18, name: "Romano Schmid", pos: "MF", role: "AM", club: "Werder Bremen" },
  { number: 21, name: "Patrick Wimmer", pos: "FW", role: "RW", club: "VfL Wolfsburg" },
  { number: 14, name: "Sasa Kalajdzic", pos: "FW", role: "CF", club: "VfB Stuttgart" },
  { number: 7, name: "Marko Arnautovic", pos: "FW", role: "CF", club: "Red Star Belgrade" },
  { number: 11, name: "Michael Gregoritsch", pos: "FW", role: "CF", club: "SC Freiburg" },
];

const JORDAN = [
  { number: 1, name: "Yazeed Abulaila", pos: "GK", role: "GK", club: "Al-Wehdat" },
  { number: 12, name: "Noor Bane Ataya", pos: "GK", role: "GK", club: "Al-Wehdat" },
  { number: 22, name: "Abdallah Al-Fakhouri", pos: "GK", role: "GK", club: "Al-Faisaly" },
  { number: 5, name: "Yazan Al-Arab", pos: "DF", role: "CB", club: "Al-Wehdat" },
  { number: 19, name: "Saed Al-Rousan", pos: "DF", role: "CB", club: "Al-Faisaly" },
  { number: 3, name: "Abdallah Nasib", pos: "DF", role: "CB", club: "Al-Wehdat" },
  { number: 4, name: "Husam Abu Dahab", pos: "DF", role: "CB", club: "Al-Wehdat" },
  { number: 16, name: "Mohammad Abualnadi", pos: "DF", role: "CB", club: "Shabab Al-Aqaba" },
  { number: 17, name: "Saleem Obaid", pos: "DF", role: "CB", club: "Al-Hussein" },
  { number: 20, name: "Mohannad Abu Taha", pos: "DF", role: "LB", club: "Al-Faisaly" },
  { number: 2, name: "Mohammad Abu Hasheesh", pos: "DF", role: "LB", club: "Al-Faisaly" },
  { number: 18, name: "Mohammad Abu Ghoush", pos: "DF", role: "LB", club: "Al-Wehdat" },
  { number: 23, name: "Ehsan Haddad", pos: "DF", role: "RB", club: "Al-Faisaly" },
  { number: 26, name: "Anas Badawi", pos: "DF", role: "RB", club: "Al-Wehdat" },
  { number: 21, name: "Nizar Al-Rashdan", pos: "MF", role: "DM", club: "Al-Wehdat" },
  { number: 6, name: "Amer Jamous", pos: "MF", role: "CM", club: "Al-Wehdat" },
  { number: 8, name: "Noor Al-Rawabdeh", pos: "MF", role: "CM", club: "Al-Wehdat" },
  { number: 15, name: "Ibrahim Saadeh", pos: "MF", role: "CM", club: "Partizan" },
  { number: 14, name: "Rajaei Ayed", pos: "MF", role: "CM", club: "Al-Hussein" },
  { number: 25, name: "Mohammad Al-Dawoud", pos: "MF", role: "CM", club: "Al-Baqa'a" },
  { number: 11, name: "Odeh Fakhoury", pos: "FW", role: "LW", club: "Al-Wehdat" },
  { number: 13, name: "Mahmoud Al-Mardi", pos: "FW", role: "LW", club: "Al-Hussein" },
  { number: 10, name: "Mousa Tamari", pos: "FW", role: "RW", club: "Rennes", captain: true },
  { number: 7, name: "Mohammad Abu Zrayq", pos: "FW", role: "RW", club: "Al-Wehdat" },
  { number: 24, name: "Ali Azaizeh", pos: "FW", role: "RW", club: "Shabab Al-Ordon" },
  { number: 9, name: "Ali Olwan", pos: "FW", role: "CF", club: "Zakho SC" },
];

const TEAMS = [
  { id: "worldcup_austria", flag: "🇦🇹", nationality: "Austria", squad: AUSTRIA },
  { id: "worldcup_jordan", flag: "🇯🇴", nationality: "Jordan", squad: JORDAN },
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

console.log(`Updated Group J rosters in ${DATA_PATH}`);
console.log(`  Removed ${removed} old players`);
console.log(`  Austria: ${AUSTRIA.length} players`);
console.log(`  Jordan: ${JORDAN.length} players`);
console.log(`  Total players now: ${data.players.length}`);
