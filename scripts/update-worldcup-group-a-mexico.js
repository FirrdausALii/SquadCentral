/**
 * Update World Cup Group A — Mexico squad, fixtures MD1–3, and standings.
 * Run: node scripts/update-worldcup-group-a-mexico.js
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

const MEXICO = [
  { number: 1, name: "Raul Rangel", pos: "GK", role: "GK", club: "Chivas" },
  { number: 12, name: "Carlos Acevedo", pos: "GK", role: "GK", club: "Santos Laguna" },
  { number: 13, name: "Guillermo Ochoa", pos: "GK", role: "GK", club: "AEL Limassol" },
  { number: 3, name: "Cesar Montes", pos: "DF", role: "CB", club: "Lokomotiv Moscow" },
  { number: 5, name: "Johan Vasquez", pos: "DF", role: "CB", club: "Genoa" },
  { number: 2, name: "Jorge Sanchez", pos: "DF", role: "RB", club: "PAOK" },
  { number: 15, name: "Israel Reyes", pos: "DF", role: "RB", club: "CF America" },
  { number: 20, name: "Mateo Chavez", pos: "DF", role: "LB", club: "AZ Alkmaar" },
  { number: 23, name: "Jesus Gallardo", pos: "DF", role: "LB", club: "Toluca" },
  { number: 4, name: "Edson Alvarez", pos: "MF", role: "DM", club: "West Ham", captain: true },
  { number: 6, name: "Erik Lira", pos: "MF", role: "DM", club: "Cruz Azul" },
  { number: 24, name: "Luis Chavez", pos: "MF", role: "DM", club: "Dynamo Moscow" },
  { number: 8, name: "Alvaro Fidalgo", pos: "MF", role: "CM", club: "Real Betis" },
  { number: 17, name: "Orbelin Pineda", pos: "MF", role: "CM", club: "AEK Athens" },
  { number: 18, name: "Obed Vargas", pos: "MF", role: "CM", club: "Atletico Madrid" },
  { number: 7, name: "Luis Romo", pos: "MF", role: "AM", club: "Chivas" },
  { number: 19, name: "Gilberto Mora", pos: "MF", role: "AM", club: "Tijuana" },
  { number: 26, name: "Brian Gutierrez", pos: "MF", role: "AM", club: "Chivas" },
  { number: 21, name: "Cesar Huerta", pos: "FW", role: "RW", club: "Anderlecht" },
  { number: 25, name: "Roberto Alvarado", pos: "FW", role: "RW", club: "Chivas" },
  { number: 10, name: "Alexis Vega", pos: "FW", role: "LW", club: "Toluca" },
  { number: 16, name: "Julian Quinones", pos: "FW", role: "LW", club: "Al Qadsiah" },
  { number: 9, name: "Raul Jimenez", pos: "FW", role: "CF", club: "Fulham" },
  { number: 11, name: "Santiago Gimenez", pos: "FW", role: "CF", club: "AC Milan" },
  { number: 14, name: "Armando Gonzalez", pos: "FW", role: "CF", club: "Chivas" },
  { number: 22, name: "Guillermo Martinez", pos: "FW", role: "CF", club: "Pumas" },
];

const TEAM_ID = "worldcup_mexico";

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

// --- Mexico roster ---
const removed = data.players.filter((p) => p.teamId === TEAM_ID).length;
data.players = data.players.filter((p) => p.teamId !== TEAM_ID);
for (const entry of MEXICO) {
  data.players.push(makePlayer(TEAM_ID, entry, "🇲🇽", "Mexico"));
}

const mexicoTeam = data.teams.find((t) => t.id === TEAM_ID);
if (!mexicoTeam) throw new Error("worldcup_mexico team not found");
mexicoTeam.coach = "Javier Aguirre";
mexicoTeam.formation = "4-1-4-1";
mexicoTeam.squadDepth = {
  formation: "4-1-4-1",
  goalkeepers: [
    "worldcup_mexico_1_Raul_Rangel",
    "worldcup_mexico_12_Carlos_Acevedo",
    "worldcup_mexico_13_Guillermo_Ochoa",
  ],
  slots: [
    {
      tag: "LB",
      players: ["worldcup_mexico_23_Jesus_Gallardo", "worldcup_mexico_20_Mateo_Chavez"],
    },
    {
      tag: "CB",
      players: ["worldcup_mexico_3_Cesar_Montes", ""],
    },
    {
      tag: "CB",
      players: ["worldcup_mexico_5_Johan_Vasquez", ""],
    },
    {
      tag: "RB",
      players: ["worldcup_mexico_2_Jorge_Sanchez", "worldcup_mexico_15_Israel_Reyes"],
    },
    {
      tag: "DM",
      players: ["worldcup_mexico_4_Edson_Alvarez", "worldcup_mexico_6_Erik_Lira"],
    },
    {
      tag: "LW",
      players: ["worldcup_mexico_10_Alexis_Vega", "worldcup_mexico_16_Julian_Quinones"],
    },
    {
      tag: "CM",
      players: ["worldcup_mexico_8_Alvaro_Fidalgo", "worldcup_mexico_17_Orbelin_Pineda"],
    },
    {
      tag: "AM",
      players: ["worldcup_mexico_7_Luis_Romo", "worldcup_mexico_26_Brian_Gutierrez"],
    },
    {
      tag: "RW",
      players: ["worldcup_mexico_21_Cesar_Huerta", "worldcup_mexico_25_Roberto_Alvarado"],
    },
    {
      tag: "CF",
      players: ["worldcup_mexico_9_Raul_Jimenez", "worldcup_mexico_11_Santiago_Gimenez"],
    },
  ],
};

// --- Add MD2 & MD3 fixtures ---
const newMatches = [
  {
    id: "worldcup_group_stage_mexico_south_korea",
    leagueId: "worldcup",
    matchday: "Group Stage",
    status: "FT",
    time: "Friday 19 Jun",
    stadium: "Estadio Guadalajara",
    homeTeamId: "worldcup_mexico",
    awayTeamId: "worldcup_south_korea",
    score: [1, 0],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.5,
    formation: ["4-1-4-1", "3-4-2-1"],
  },
  {
    id: "worldcup_group_stage_czech_republic_mexico",
    leagueId: "worldcup",
    matchday: "Group Stage",
    status: "FT",
    time: "Thursday 25 Jun",
    stadium: "Estadio Guadalajara",
    homeTeamId: "worldcup_czech_republic",
    awayTeamId: "worldcup_mexico",
    score: [0, 3],
    scorers: [],
    goalEvents: [],
    possession: [],
    momentum: 0.5,
    formation: ["3-4-2-1", "4-1-4-1"],
  },
];

for (const match of newMatches) {
  const i = data.matches.findIndex((m) => m.id === match.id);
  if (i >= 0) data.matches[i] = { ...data.matches[i], ...match };
  else data.matches.push(match);
}

// --- Group A standings ---
const wcStandings = data.miniStandings.find((x) => x.leagueId === "worldcup");
if (!wcStandings) throw new Error("worldcup miniStandings not found");
const groupA = wcStandings.groups?.find((g) => g.id === "A");
if (!groupA) throw new Error("Group A not found");
groupA.rows = [
  [1, "Mexico", 9],
  [2, "South Africa", 4],
  [3, "South Korea", 3],
  [4, "Czech Republic", 1],
];

data.dataRevision = Date.now();
fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`Updated Group A in ${DATA_PATH}`);
console.log(`  Mexico roster: ${MEXICO.length} players (removed ${removed} old)`);
console.log(`  Matches: MD1 existing, MD2 + MD3 added/updated`);
console.log(`  Group A standings: Mexico 9, South Africa 4, South Korea 3, Czech Republic 1`);
