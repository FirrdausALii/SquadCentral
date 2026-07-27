/**
 * Fetch Transfermarkt squads via local serve.ps1 proxy, parse HTML, diff vs Squad Central.
 */
(function (global) {
  const TM_POSITION_MAP = {
    goalkeeper: { pos: "GK", role: "GK" },
    "centre-back": { pos: "DF", role: "CB" },
    "center-back": { pos: "DF", role: "CB" },
    "left-back": { pos: "DF", role: "LB" },
    "right-back": { pos: "DF", role: "RB" },
    "defensive midfield": { pos: "MF", role: "DM" },
    "central midfield": { pos: "MF", role: "CM" },
    "attacking midfield": { pos: "MF", role: "AM" },
    "left midfield": { pos: "MF", role: "LM" },
    "right midfield": { pos: "MF", role: "RM" },
    "left winger": { pos: "FW", role: "LW" },
    "right winger": { pos: "FW", role: "RW" },
    "centre-forward": { pos: "FW", role: "CF" },
    "center-forward": { pos: "FW", role: "CF" },
    "second striker": { pos: "FW", role: "CF" },
    defender: { pos: "DF", role: "CB" },
    midfielder: { pos: "MF", role: "CM" },
    forward: { pos: "FW", role: "CF" },
  };

  function normalizeNameKey(name) {
    return String(name ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*\(C\)\s*$/i, "")
      .replace(/[øØ]/g, "o")
      .replace(/[æÆ]/g, "ae")
      .replace(/[œŒ]/g, "oe")
      .replace(/[đĐ]/g, "d")
      .replace(/[łŁ]/g, "l")
      .replace(/[ß]/g, "ss")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function mapTmPosition(raw) {
    const key = String(raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (TM_POSITION_MAP[key]) return { ...TM_POSITION_MAP[key], tmPosition: raw };
    if (/goal/.test(key)) return { pos: "GK", role: "GK", tmPosition: raw };
    if (/back|defender/.test(key)) return { pos: "DF", role: "CB", tmPosition: raw };
    if (/midfield|midfielder/.test(key)) return { pos: "MF", role: "CM", tmPosition: raw };
    if (/wing|forward|striker/.test(key)) return { pos: "FW", role: "CF", tmPosition: raw };
    return { pos: "MF", role: "CM", tmPosition: raw };
  }

  function parseSquadHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const players = [];
    const seen = new Set();

    for (const row of doc.querySelectorAll("table.items > tbody > tr")) {
      if (row.querySelector("th")) continue;
      const numberText = row.querySelector(":scope > td.zentriert")?.textContent?.trim() ?? "";
      const number = parseInt(numberText, 10);
      if (!Number.isFinite(number)) continue;

      const nameLink =
        row.querySelector("td.hauptlink a") ||
        row.querySelector("a.spielprofil_tooltip") ||
        row.querySelector("td.posrela a");
      const name = (nameLink?.textContent || nameLink?.getAttribute("title") || "").trim();
      if (!name) continue;

      const natImg = row.querySelector("img[title]");
      const nationality = natImg?.getAttribute("title")?.trim() ?? "";

      const posCell =
        row.querySelector("td.posrela table.inline-table tr:nth-child(2) td") ||
        row.querySelector("td.posrela tr:nth-child(2) td");
      const tmPosition = posCell?.textContent?.trim() ?? "";
      const mapped = mapTmPosition(tmPosition);

      const dedupe = `${number}:${normalizeNameKey(name)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      players.push({
        number,
        name,
        nationality,
        pos: mapped.pos,
        role: mapped.role,
        tmPosition: mapped.tmPosition || tmPosition,
      });
    }

    return players.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
  }

  function compareSquads(localPlayers, tmPlayers) {
    const localByKey = new Map();
    for (const p of localPlayers ?? []) {
      const key = normalizeNameKey(p.name);
      if (key) localByKey.set(key, p);
    }
    const tmByKey = new Map();
    for (const p of tmPlayers ?? []) {
      const key = normalizeNameKey(p.name);
      if (key) tmByKey.set(key, p);
    }

    const toAdd = [];
    for (const [key, tm] of tmByKey) {
      if (!localByKey.has(key)) toAdd.push(tm);
    }
    const toRemove = [];
    for (const [key, local] of localByKey) {
      if (!tmByKey.has(key)) toRemove.push(local);
    }
    toAdd.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
    toRemove.sort((a, b) => Number(a.number) - Number(b.number) || String(a.name).localeCompare(b.name));

    return {
      toAdd,
      toRemove,
      matched: localByKey.size - toRemove.length,
      tmTotal: tmPlayers?.length ?? 0,
      localTotal: localPlayers?.length ?? 0,
    };
  }

  async function fetchSquadHtml(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    const url = `/api/tm-squad?clubId=${encodeURIComponent(String(id))}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      let detail = body.trim();
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* plain text or HTML error body */
      }
      throw new Error(detail || `Transfermarkt fetch failed (${res.status})`);
    }
    return res.text();
  }

  async function fetchAndCompare(localPlayers, clubId) {
    const html = await fetchSquadHtml(clubId);
    const tmPlayers = parseSquadHtml(html);
    if (!tmPlayers.length) {
      throw new Error("Could not parse any players from Transfermarkt — the page layout may have changed.");
    }
    return { tmPlayers, diff: compareSquads(localPlayers, tmPlayers) };
  }

  global.TransfermarktSync = {
    normalizeNameKey,
    mapTmPosition,
    parseSquadHtml,
    compareSquads,
    fetchSquadHtml,
    fetchAndCompare,
  };
})(typeof window !== "undefined" ? window : globalThis);
