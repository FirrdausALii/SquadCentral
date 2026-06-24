/**
 * Update World Cup Group I rosters (France, Senegal) from Transfermarkt 2026 squads.
 * Run: node scripts/update-worldcup-group-i-rosters.js
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

const FRANCE = [
  { number: 23, name: "Robin Risser", pos: "GK", role: "GK", club: "Brighton" },
  { number: 16, name: "Mike Maignan", pos: "GK", role: "GK", club: "AC Milan" },
  { number: 1, name: "Brice Samba", pos: "GK", role: "GK", club: "Rennes" },
  { number: 17, name: "William Saliba", pos: "DF", role: "CB", club: "Arsenal" },
  { number: 4, name: "Dayot Upamecano", pos: "DF", role: "CB", club: "Bayern Munich" },
  { number: 26, name: "Maxence Lacroix", pos: "DF", role: "CB", club: "Crystal Palace" },
  { number: 15, name: "Ibrahima Konate", pos: "DF", role: "CB", club: "Liverpool" },
  { number: 19, name: "Theo Hernandez", pos: "DF", role: "LB", club: "AC Milan" },
  { number: 21, name: "Lucas Hernandez", pos: "DF", role: "LB", club: "Paris Saint-Germain" },
  { number: 3, name: "Lucas Digne", pos: "DF", role: "LB", club: "Aston Villa" },
  { number: 5, name: "Jules Kounde", pos: "DF", role: "RB", club: "Barcelona" },
  { number: 2, name: "Malo Gusto", pos: "DF", role: "RB", club: "Chelsea" },
  { number: 8, name: "Aurelien Tchouameni", pos: "MF", role: "DM", club: "Real Madrid" },
  { number: 13, name: "N'Golo Kante", pos: "MF", role: "DM", club: "Al-Ittihad" },
  { number: 18, name: "Warren Zaire-Emery", pos: "MF", role: "CM", club: "Paris Saint-Germain" },
  { number: 6, name: "Manu Kone", pos: "MF", role: "CM", club: "AS Roma" },
  { number: 14, name: "Adrien Rabiot", pos: "MF", role: "CM", club: "AC Milan" },
  { number: 24, name: "Rayan Cherki", pos: "MF", role: "AM", club: "Manchester City" },
  { number: 12, name: "Bradley Barcola", pos: "FW", role: "LW", club: "Paris Saint-Germain" },
  { number: 11, name: "Michael Olise", pos: "FW", role: "RW", club: "Bayern Munich" },
  { number: 20, name: "Desire Doue", pos: "FW", role: "RW", club: "Paris Saint-Germain" },
  { number: 25, name: "Maghnes Akliouche", pos: "FW", role: "RW", club: "AS Monaco" },
  { number: 10, name: "Kylian Mbappe", pos: "FW", role: "CF", club: "Real Madrid", captain: true },
  { number: 7, name: "Ousmane Dembele", pos: "FW", role: "CF", club: "Paris Saint-Germain" },
  { number: 9, name: "Marcus Thuram", pos: "FW", role: "CF", club: "Inter Milan" },
  { number: 22, name: "Jean-Philippe Mateta", pos: "FW", role: "CF", club: "Crystal Palace" },
];

const SENEGAL = [
  { number: 1, name: "Yehvann Diouf", pos: "GK", role: "GK", club: "Reims" },
  { number: 16, name: "Edouard Mendy", pos: "GK", role: "GK", club: "Al-Ahli" },
  { number: 23, name: "Mory Diaw", pos: "GK", role: "GK", club: "Lorient" },
  { number: 2, name: "Mamadou Sarr", pos: "DF", role: "CB", club: "Chelsea" },
  { number: 19, name: "Moussa Niakhate", pos: "DF", role: "CB", club: "Lyon" },
  { number: 24, name: "Antoine Mendy", pos: "DF", role: "CB", club: "Nice" },
  { number: 3, name: "Kalidou Koulibaly", pos: "DF", role: "CB", club: "Al-Hilal", captain: true },
  { number: 4, name: "Abdoulaye Seck", pos: "DF", role: "CB", club: "Royal Antwerp" },
  { number: 25, name: "El Hadji Malick Diouf", pos: "DF", role: "LB", club: "West Ham United" },
  { number: 14, name: "Ismail Jakobs", pos: "DF", role: "LB", club: "Galatasaray" },
  { number: 5, name: "Idrissa Gueye", pos: "MF", role: "DM", club: "Everton" },
  { number: 8, name: "Lamine Camara", pos: "MF", role: "CM", club: "AS Monaco" },
  { number: 26, name: "Pape Gueye", pos: "MF", role: "CM", club: "Villarreal" },
  { number: 21, name: "Habib Diarra", pos: "MF", role: "CM", club: "Sunderland" },
  { number: 17, name: "Pape Matar Sarr", pos: "MF", role: "CM", club: "Tottenham Hotspur" },
  { number: 22, name: "Bara Sapoko Ndiaye", pos: "MF", role: "CM", club: "Metz" },
  { number: 6, name: "Pathe Ciss", pos: "MF", role: "CM", club: "Rayo Vallecano" },
  { number: 15, name: "Krepin Diatta", pos: "MF", role: "RM", club: "AS Monaco" },
  { number: 7, name: "Assane Diao", pos: "FW", role: "LW", club: "Real Betis" },
  { number: 10, name: "Sadio Mane", pos: "FW", role: "LW", club: "Al-Nassr" },
  { number: 13, name: "Iliman Ndiaye", pos: "FW", role: "RW", club: "Everton" },
  { number: 18, name: "Ismaila Sarr", pos: "FW", role: "RW", club: "Crystal Palace" },
  { number: 20, name: "Ibrahim Mbaye", pos: "FW", role: "RW", club: "Paris Saint-Germain" },
  { number: 11, name: "Nicolas Jackson", pos: "FW", role: "CF", club: "Chelsea" },
  { number: 9, name: "Bamba Dieng", pos: "FW", role: "CF", club: "Marseille" },
  { number: 12, name: "Cherif Ndiaye", pos: "FW", role: "CF", club: "Trabzonspor" },
];

const TEAMS = [
  { id: "worldcup_france", flag: "🇫🇷", nationality: "France", squad: FRANCE },
  { id: "worldcup_senegal", flag: "🇸🇳", nationality: "Senegal", squad: SENEGAL },
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
console.log(`  France: ${FRANCE.length} players`);
console.log(`  Senegal: ${SENEGAL.length} players`);
console.log(`  Total players now: ${data.players.length}`);
