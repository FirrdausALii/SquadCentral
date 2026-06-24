/**
 * Update World Cup Group J rosters (Argentina, Algeria) from Transfermarkt 2026 squads.
 * Run: node scripts/update-worldcup-group-j-rosters.js
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

const ARGENTINA = [
  { number: 23, name: "Emiliano Martinez", pos: "GK", role: "GK", club: "Aston Villa" },
  { number: 12, name: "Geronimo Rulli", pos: "GK", role: "GK", club: "Marseille" },
  { number: 1, name: "Juan Musso", pos: "GK", role: "GK", club: "Atletico Madrid" },
  { number: 13, name: "Cristian Romero", pos: "DF", role: "CB", club: "Tottenham Hotspur" },
  { number: 6, name: "Lisandro Martinez", pos: "DF", role: "CB", club: "Manchester United" },
  { number: 2, name: "Marcos Senesi", pos: "DF", role: "CB", club: "Bournemouth" },
  { number: 25, name: "Facundo Medina", pos: "DF", role: "CB", club: "Lens" },
  { number: 19, name: "Nicolas Otamendi", pos: "DF", role: "CB", club: "Benfica" },
  { number: 3, name: "Nicolas Tagliafico", pos: "DF", role: "LB", club: "Lyon" },
  { number: 26, name: "Nahuel Molina", pos: "DF", role: "RB", club: "Atletico Madrid" },
  { number: 4, name: "Gonzalo Montiel", pos: "DF", role: "RB", club: "River Plate" },
  { number: 5, name: "Leandro Paredes", pos: "MF", role: "DM", club: "Boca Juniors" },
  { number: 24, name: "Enzo Fernandez", pos: "MF", role: "CM", club: "Chelsea" },
  { number: 20, name: "Alexis Mac Allister", pos: "MF", role: "CM", club: "Liverpool" },
  { number: 8, name: "Valentin Barco", pos: "MF", role: "CM", club: "Brighton" },
  { number: 14, name: "Exequiel Palacios", pos: "MF", role: "CM", club: "Bayer Leverkusen" },
  { number: 7, name: "Rodrigo De Paul", pos: "MF", role: "CM", club: "Inter Miami" },
  { number: 18, name: "Nico Paz", pos: "MF", role: "AM", club: "Como" },
  { number: 11, name: "Giovani Lo Celso", pos: "MF", role: "AM", club: "Real Betis" },
  { number: 15, name: "Nico Gonzalez", pos: "FW", role: "LW", club: "Juventus" },
  { number: 16, name: "Thiago Almada", pos: "FW", role: "LW", club: "Atletico Madrid" },
  { number: 17, name: "Giuliano Simeone", pos: "FW", role: "RW", club: "Atletico Madrid" },
  { number: 10, name: "Lionel Messi", pos: "FW", role: "RW", club: "Inter Miami", captain: true },
  { number: 9, name: "Julian Alvarez", pos: "FW", role: "CF", club: "Atletico Madrid" },
  { number: 22, name: "Lautaro Martinez", pos: "FW", role: "CF", club: "Inter Milan" },
  { number: 21, name: "Flaco Lopez", pos: "FW", role: "CF", club: "Porto" },
];

const ALGERIA = [
  { number: 23, name: "Luca Zidane", pos: "GK", role: "GK", club: "Granada" },
  { number: 16, name: "Oussama Benbout", pos: "GK", role: "GK", club: "CR Belouizdad" },
  { number: 1, name: "Melvin Mastil", pos: "GK", role: "GK", club: "MC Alger" },
  { number: 21, name: "Ramy Bensebaini", pos: "DF", role: "CB", club: "Borussia Dortmund" },
  { number: 26, name: "Samir Chergui", pos: "DF", role: "CB", club: "ES Setif" },
  { number: 5, name: "Zineddine Belaid", pos: "DF", role: "CB", club: "CR Belouizdad" },
  { number: 4, name: "Mohamed Amine Tougai", pos: "DF", role: "CB", club: "Esperance de Tunis" },
  { number: 2, name: "Aissa Mandi", pos: "DF", role: "CB", club: "Lille" },
  { number: 3, name: "Achref Abada", pos: "DF", role: "CB", club: "Paradou AC" },
  { number: 15, name: "Rayan Ait-Nouri", pos: "DF", role: "LB", club: "Manchester City" },
  { number: 13, name: "Jaouen Hadjam", pos: "DF", role: "LB", club: "Young Boys" },
  { number: 17, name: "Rafik Belghali", pos: "DF", role: "RB", club: "Angers" },
  { number: 6, name: "Ramiz Zerrouki", pos: "MF", role: "DM", club: "Feyenoord" },
  { number: 19, name: "Nabil Bentaleb", pos: "MF", role: "DM", club: "Lille" },
  { number: 14, name: "Hicham Boudaoui", pos: "MF", role: "CM", club: "OGC Nice" },
  { number: 24, name: "Yassine Titraoui", pos: "MF", role: "CM", club: "Le Havre" },
  { number: 22, name: "Ibrahim Maza", pos: "MF", role: "AM", club: "Bayer Leverkusen" },
  { number: 10, name: "Fares Chaibi", pos: "MF", role: "AM", club: "Eintracht Frankfurt" },
  { number: 8, name: "Houssem Aouar", pos: "MF", role: "AM", club: "Al-Ittihad" },
  { number: 20, name: "Adil Boulbina", pos: "FW", role: "LW", club: "AS Monaco" },
  { number: 11, name: "Anis Hadj Moussa", pos: "FW", role: "RW", club: "Feyenoord" },
  { number: 25, name: "Fares Ghedjemis", pos: "FW", role: "RW", club: "Eintracht Frankfurt" },
  { number: 7, name: "Riyad Mahrez", pos: "FW", role: "RW", club: "Al-Ahli", captain: true },
  { number: 9, name: "Amine Gouiri", pos: "FW", role: "CF", club: "Marseille" },
  { number: 18, name: "Mohamed Amoura", pos: "FW", role: "CF", club: "VfL Wolfsburg" },
  { number: 12, name: "Nadhir Benbouali", pos: "FW", role: "CF", club: "Royal Antwerp" },
];

const TEAMS = [
  { id: "worldcup_argentina", flag: "🇦🇷", nationality: "Argentina", squad: ARGENTINA },
  { id: "worldcup_algeria", flag: "🇩🇿", nationality: "Algeria", squad: ALGERIA },
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
console.log(`  Argentina: ${ARGENTINA.length} players`);
console.log(`  Algeria: ${ALGERIA.length} players`);
console.log(`  Total players now: ${data.players.length}`);
