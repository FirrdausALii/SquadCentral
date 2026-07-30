/**
 * Fetch Transfermarkt squads and transfers via the local serve.ps1 proxy,
 * parse HTML, and diff the results against Squad Central.
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

      const nameLink =
        row.querySelector("td.hauptlink a") ||
        row.querySelector("a.spielprofil_tooltip") ||
        row.querySelector("td.posrela a");
      const name = (nameLink?.textContent || nameLink?.getAttribute("title") || "").trim();
      if (!name) continue;

      const numberText = row.querySelector(":scope > td.zentriert")?.textContent?.trim() ?? "";
      const parsedNumber = parseInt(numberText, 10);
      const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;

      const natImg = row.querySelector("img[title]");
      const nationality = natImg?.getAttribute("title")?.trim() ?? "";

      const posCell =
        row.querySelector("td.posrela table.inline-table tr:nth-child(2) td") ||
        row.querySelector("td.posrela tr:nth-child(2) td");
      const tmPosition = posCell?.textContent?.trim() ?? "";
      const mapped = mapTmPosition(tmPosition);

      const nameKey = normalizeNameKey(name);
      const dedupe = nameKey || `${number}:${name}`;
      if (!nameKey || seen.has(dedupe)) continue;
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

    return players.sort(
      (a, b) =>
        (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name),
    );
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

  function transferCategoryForRow(direction, fee, otherClub, teamName) {
    const feeKey = String(fee ?? "").toLowerCase();
    if (/end of loan/.test(feeKey)) {
      return direction === "in" ? "loanReturn" : "loanRecall";
    }
    if (direction === "in") {
      const other = normalizeNameKey(otherClub)
        .replace(/\b(?:u21|u23|u19|u18|youth|academy|reserves?|ii|b)\b/g, "")
        .replace(/\bfc\b/g, "")
        .trim();
      const team = normalizeNameKey(teamName).replace(/\bfc\b/g, "").trim();
      const isYouth = /\b(?:u21|u23|u19|u18|youth|academy|reserves?|ii|b)\b/i.test(
        String(otherClub ?? ""),
      );
      if (isYouth && other && team && (other.includes(team) || team.includes(other))) {
        return "promoted";
      }
    }
    return direction;
  }

  function transferDateFromFee(fee) {
    const match = String(fee ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function normalizeTransferFee(fee, category) {
    const raw = String(fee ?? "")
      .replace(/\s+/g, " ")
      .replace(/â‚¬/g, "€")
      .trim();
    if (category === "loanReturn" || category === "loanRecall") return "";
    if (category === "promoted") return "Internal";
    if (/^free transfer$/i.test(raw)) return "Free";
    if (/^loan transfer$/i.test(raw)) return "Loan";
    if (/^loan fee:/i.test(raw)) return raw.replace(/^loan fee:\s*/i, "Loan ");
    if (raw === "-" || raw === "–") return "";
    return raw;
  }

  function parseTransferRows(box, direction, teamName) {
    const rows = [];
    for (const row of box?.querySelectorAll("table.items > tbody > tr") ?? []) {
      const cells = row.children;
      if (cells.length < 6) continue;
      const playerLink =
        cells[1].querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
        cells[1].querySelector('a[href*="/profil/spieler/"]');
      const player = (playerLink?.textContent || playerLink?.getAttribute("title") || "").trim();
      if (!player) continue;

      const playerId = playerLink?.getAttribute("href")?.match(/\/spieler\/(\d+)/)?.[1] ?? "";
      const position =
        cells[1].querySelector("table.inline-table tr:nth-child(2) td")?.textContent?.trim() ?? "";
      const nationality = cells[3].querySelector("img[title]")?.getAttribute("title")?.trim() ?? "";
      const clubLink =
        cells[4].querySelector("td.hauptlink a") ||
        cells[4].querySelector('a[href*="/startseite/verein/"]');
      const otherClub =
        (clubLink?.getAttribute("title") || clubLink?.textContent || "").trim();
      const rawFee = cells[5].textContent?.replace(/\s+/g, " ").trim() ?? "";
      const category = transferCategoryForRow(direction, rawFee, otherClub, teamName);
      const mapped = mapTmPosition(position);

      rows.push({
        id: `tm_${direction}_${playerId || normalizeNameKey(player).replace(/\s+/g, "_")}`,
        player,
        otherClub,
        fee: normalizeTransferFee(rawFee, category),
        date: transferDateFromFee(rawFee),
        category,
        nationality,
        pos: mapped.pos,
        role: mapped.role,
        tmPosition: position,
      });
    }
    return rows;
  }

  function parseTransfersHtml(html, teamName = "") {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const boxes = [...doc.querySelectorAll("div.box")];
    const arrivalsBox = boxes.find((box) =>
      /^arrivals$/i.test(box.querySelector("h2")?.textContent?.trim() ?? ""),
    );
    const departuresBox = boxes.find((box) =>
      /^departures$/i.test(box.querySelector("h2")?.textContent?.trim() ?? ""),
    );
    const all = [
      ...parseTransferRows(arrivalsBox, "in", teamName),
      ...parseTransferRows(departuresBox, "out", teamName),
    ];
    return {
      in: all.filter((row) => row.category === "in"),
      out: all.filter((row) => row.category === "out"),
      promoted: all.filter((row) => row.category === "promoted"),
      loanReturn: all.filter((row) => row.category === "loanReturn"),
      loanRecall: all.filter((row) => row.category === "loanRecall"),
    };
  }

  function compareTransferLists(localLists, tmLists) {
    const categories = ["in", "out", "promoted", "loanReturn", "loanRecall"];
    const byCategory = {};
    let matched = 0;
    let tmTotal = 0;
    let localTotal = 0;
    for (const category of categories) {
      const local = localLists?.[category] ?? [];
      const remote = tmLists?.[category] ?? [];
      const localByName = new Map(
        local.map((row) => [normalizeNameKey(row.player), row]).filter(([key]) => key),
      );
      const tmByName = new Map(
        remote.map((row) => [normalizeNameKey(row.player), row]).filter(([key]) => key),
      );
      const toAdd = [...tmByName].filter(([key]) => !localByName.has(key)).map(([, row]) => row);
      const toRemove = [...localByName]
        .filter(([key]) => !tmByName.has(key))
        .map(([, row]) => row);
      const categoryMatched = [...tmByName.keys()].filter((key) => localByName.has(key)).length;
      byCategory[category] = { toAdd, toRemove, matched: categoryMatched };
      matched += categoryMatched;
      tmTotal += remote.length;
      localTotal += local.length;
    }
    return { byCategory, matched, tmTotal, localTotal };
  }

  function looksLikeHtml(text) {
    const s = String(text ?? "").trim().slice(0, 200).toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head");
  }

  function isLocalProxyHost() {
    const host = String(global.location?.hostname ?? "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  }

  async function fetchSquadHtml(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Refresh only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-squad?clubId=${encodeURIComponent(String(id))}`;
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error("Cannot reach local Transfermarkt proxy — start serve.bat and open admin via http://127.0.0.1");
    }
    const body = await res.text();
    if (!res.ok) {
      let detail = body.trim();
      if (looksLikeHtml(detail)) {
        throw new Error(
          "Transfermarkt proxy missing — restart serve.bat so /api/tm-squad is available.",
        );
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* plain text */
      }
      throw new Error(detail || `Transfermarkt fetch failed (${res.status})`);
    }
    if (looksLikeHtml(body) && !/table\.items|rn_nummer|hauptlink/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — restart serve.bat so /api/tm-squad is available.",
      );
    }
    return body;
  }

  async function fetchTransfersHtml(clubId, season) {
    const id = Number(clubId);
    const seasonId = Number(season);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    if (!Number.isInteger(seasonId) || seasonId < 1900 || seasonId > 2100) {
      throw new Error("Invalid Transfermarkt season");
    }
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Refresh only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-transfers?clubId=${encodeURIComponent(String(id))}&season=${encodeURIComponent(String(seasonId))}`;
    let res;
    try {
      res = await fetch(url, { cache: "no-store" });
    } catch {
      throw new Error("Cannot reach local Transfermarkt proxy — start serve.bat and open admin via http://127.0.0.1");
    }
    const body = await res.text();
    if (!res.ok) {
      let detail = body.trim();
      if (res.status === 404 || looksLikeHtml(detail) || /^404\b/i.test(detail)) {
        throw new Error(
          "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
        );
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* plain text */
      }
      throw new Error(detail || `Transfermarkt fetch failed (${res.status})`);
    }
    if (looksLikeHtml(body) && !/Arrivals|Departures|zugaenge|abgaenge/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndCompareTransfers(localLists, clubId, season, teamName) {
    const html = await fetchTransfersHtml(clubId, season);
    const tmLists = parseTransfersHtml(html, teamName);
    const total = Object.values(tmLists).reduce((sum, rows) => sum + rows.length, 0);
    if (!total) {
      throw new Error("Could not parse any transfers from Transfermarkt — check the season or page layout.");
    }
    return { tmLists, diff: compareTransferLists(localLists, tmLists) };
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
    parseTransfersHtml,
    compareTransferLists,
    fetchSquadHtml,
    fetchTransfersHtml,
    fetchAndCompare,
    fetchAndCompareTransfers,
    isLocalProxyHost,
  };
})(typeof window !== "undefined" ? window : globalThis);
