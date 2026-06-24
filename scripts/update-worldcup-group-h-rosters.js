/**
 * Update World Cup Group H rosters (Uruguay, Saudi Arabia) from Transfermarkt 2026 squads.
 * Run: node scripts/update-worldcup-group-h-rosters.js
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

const URUGUAY = [
  { number: 1, name: "Sergio Rochet", pos: "GK", role: "GK", club: "Internacional" },
  { number: 12, name: "Santiago Mele", pos: "GK", role: "GK", club: "Monterrey" },
  { number: 23, name: "Fernando Muslera", pos: "GK", role: "GK", club: "Estudiantes" },
  { number: 2, name: "Jose Maria Gimenez", pos: "DF", role: "CB", club: "Atletico Madrid" },
  { number: 3, name: "Sebastian Caceres", pos: "DF", role: "CB", club: "CF America" },
  { number: 4, name: "Ronald Araujo", pos: "DF", role: "CB", club: "Barcelona" },
  { number: 24, name: "Santiago Bueno", pos: "DF", role: "CB", club: "Wolves" },
  { number: 13, name: "Guillermo Varela", pos: "DF", role: "RB", club: "Flamengo" },
  { number: 17, name: "Matias Vina", pos: "DF", role: "LB", club: "River Plate" },
  { number: 16, name: "Mathias Olivera", pos: "DF", role: "LB", club: "Napoli" },
  { number: 22, name: "Joaquin Piquerez", pos: "DF", role: "LB", club: "Palmeiras" },
  { number: 25, name: "Juan Manuel Sanabria", pos: "DF", role: "LB", club: "Real Salt Lake" },
  { number: 20, name: "Maxi Araujo", pos: "DF", role: "LB", club: "Sporting CP" },
  { number: 5, name: "Manuel Ugarte", pos: "MF", role: "DM", club: "Manchester United" },
  { number: 6, name: "Rodrigo Bentancur", pos: "MF", role: "DM", club: "Tottenham Hotspur" },
  { number: 15, name: "Emiliano Martinez", pos: "MF", role: "DM", club: "Palmeiras" },
  { number: 8, name: "Federico Valverde", pos: "MF", role: "CM", club: "Real Madrid", captain: true },
  { number: 7, name: "Nicolas de la Cruz", pos: "MF", role: "CM", club: "Flamengo" },
  { number: 10, name: "Giorgian de Arrascaeta", pos: "MF", role: "AM", club: "Flamengo" },
  { number: 26, name: "Rodrigo Zalazar", pos: "MF", role: "AM", club: "Braga" },
  { number: 18, name: "Brian Rodriguez", pos: "FW", role: "LW", club: "Club America" },
  { number: 14, name: "Agustin Canobbio", pos: "FW", role: "RW", club: "Leicester City" },
  { number: 11, name: "Facundo Pellistri", pos: "FW", role: "RW", club: "Panathinaikos" },
  { number: 9, name: "Darwin Nunez", pos: "FW", role: "CF", club: "Al-Hilal" },
  { number: 21, name: "Federico Vinas", pos: "FW", role: "CF", club: "Leon" },
  { number: 19, name: "Rodrigo Aguirre", pos: "FW", role: "CF", club: "Monterrey" },
];

const SAUDI_ARABIA = [
  { number: 1, name: "Nawaf Al-Aqidi", pos: "GK", role: "GK", club: "Al-Nassr" },
  { number: 21, name: "Mohammed Al-Owais", pos: "GK", role: "GK", club: "Al-Hilal" },
  { number: 22, name: "Ahmed Al-Kassar", pos: "GK", role: "GK", club: "Al-Ettifaq" },
  { number: 5, name: "Hassan Tambakti", pos: "DF", role: "CB", club: "Al-Hilal" },
  { number: 4, name: "Abdulelah Al-Amri", pos: "DF", role: "CB", club: "Al-Nassr" },
  { number: 25, name: "Jehad Thakri", pos: "DF", role: "CB", club: "Al-Fateh" },
  { number: 3, name: "Ali Lajami", pos: "DF", role: "CB", club: "Al-Nassr" },
  { number: 24, name: "Moteb Al-Harbi", pos: "DF", role: "LB", club: "Al-Qadsiah" },
  { number: 8, name: "Ayman Yahya", pos: "DF", role: "LB", club: "Al-Nassr" },
  { number: 14, name: "Hassan Kadesh", pos: "DF", role: "LB", club: "Al-Taawoun" },
  { number: 12, name: "Saud Abdulhamid", pos: "DF", role: "RB", club: "Lecce" },
  { number: 26, name: "Mohammed Abu Al-Shamat", pos: "DF", role: "RB", club: "Al-Hilal" },
  { number: 2, name: "Ali Majrashi", pos: "DF", role: "RB", club: "Al-Ahli" },
  { number: 13, name: "Nawaf Boushal", pos: "DF", role: "RB", club: "Al-Shabab" },
  { number: 16, name: "Ziyad Al-Johani", pos: "MF", role: "DM", club: "Al-Ittihad" },
  { number: 15, name: "Abdullah Al-Khaibari", pos: "MF", role: "DM", club: "Al-Nassr" },
  { number: 7, name: "Musab Al-Juwayr", pos: "MF", role: "CM", club: "Al-Hilal" },
  { number: 6, name: "Nasser Al-Dawsari", pos: "MF", role: "CM", club: "Al-Hilal" },
  { number: 23, name: "Mohamed Kanno", pos: "MF", role: "CM", club: "Al-Hilal" },
  { number: 18, name: "Alaa Hejji", pos: "MF", role: "CM", club: "Al-Ettifaq" },
  { number: 17, name: "Khalid Al-Ghannam", pos: "FW", role: "LW", club: "Al-Nassr" },
  { number: 10, name: "Salem Al-Dawsari", pos: "FW", role: "LW", club: "Al-Hilal", captain: true },
  { number: 20, name: "Sultan Mandash", pos: "FW", role: "RW", club: "Al-Ahli" },
  { number: 9, name: "Firas Al-Buraikan", pos: "FW", role: "CF", club: "Al-Ahli" },
  { number: 11, name: "Saleh Al-Shehri", pos: "FW", role: "CF", club: "Al-Hilal" },
  { number: 19, name: "Abdullah Al-Hamdan", pos: "FW", role: "CF", club: "Al-Hilal" },
];

const TEAMS = [
  { id: "worldcup_uruguay", flag: "🇺🇾", nationality: "Uruguay", squad: URUGUAY },
  { id: "worldcup_saudi_arabia", flag: "🇸🇦", nationality: "Saudi Arabia", squad: SAUDI_ARABIA },
];

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const removeIds = new Set(TEAMS.map((t) => t.id));

const before = data.players.length;
data.players = data.players.filter((p) => !removeIds.has(p.teamId));

for (const team of TEAMS) {
  for (const entry of team.squad) {
    data.players.push(makePlayer(team.id, entry, team.flag, team.nationality));
  }
}

data.dataRevision = Date.now();
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`Updated Group H rosters in ${DATA_PATH}`);
console.log(`  Removed ${before - data.players.length + TEAMS.reduce((n, t) => n + t.squad.length, 0)} old players`);
console.log(`  Uruguay: ${URUGUAY.length} players`);
console.log(`  Saudi Arabia: ${SAUDI_ARABIA.length} players`);
console.log(`  Total players now: ${data.players.length}`);
