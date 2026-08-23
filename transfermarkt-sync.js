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

  function foldLatinLetters(str, { keepCase = false } = {}) {
    return String(str ?? "")
      .replace(/ø/gi, (ch) => (keepCase && ch === "Ø" ? "O" : "o"))
      .replace(/æ/gi, (ch) => (keepCase && ch === "Æ" ? "AE" : "ae"))
      .replace(/œ/gi, (ch) => (keepCase && ch === "Œ" ? "OE" : "oe"))
      .replace(/đ/gi, (ch) => (keepCase && ch === "Đ" ? "D" : "d"))
      .replace(/ł/gi, (ch) => (keepCase && ch === "Ł" ? "L" : "l"))
      .replace(/ß/g, "ss");
  }

  function normalizeNameKey(name) {
    return foldLatinLetters(String(name ?? ""))
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*\(C\)\s*$/i, "")
      .replace(/[ÃƒÂ¸ÃƒËœ]/g, "o")
      .replace(/[ÃƒÂ¦Ãƒâ€ ]/g, "ae")
      .replace(/[Ã…â€œÃ…â€™]/g, "oe")
      .replace(/[Ã„â€˜Ã„Â]/g, "d")
      .replace(/[Ã…â€šÃ…Â]/g, "l")
      .replace(/[ÃƒÅ¸]/g, "ss")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  /** Strip accents/diacritics for storage — José Ángel → Jose Angel */
  function toAsciiName(name) {
    return foldLatinLetters(String(name ?? ""), { keepCase: true })
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[ÃƒÂ¸ÃƒËœ]/g, (ch) => (ch === "ÃƒÂ¸" ? "o" : "O"))
      .replace(/[ÃƒÂ¦Ãƒâ€ ]/g, (ch) => (ch === "ÃƒÂ¦" ? "ae" : "AE"))
      .replace(/[Ã…â€œÃ…â€™]/g, (ch) => (ch === "Ã…â€œ" ? "oe" : "OE"))
      .replace(/[Ã„â€˜Ã„Â]/g, (ch) => (ch === "Ã„â€˜" ? "d" : "D"))
      .replace(/[Ã…â€šÃ…Â]/g, (ch) => (ch === "Ã…â€š" ? "l" : "L"))
      .replace(/[ÃƒÅ¸]/g, "ss")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nameTokens(key) {
    return String(key ?? "")
      .split(/\s+/)
      .filter(Boolean);
  }

  function jerseyNumbersMatch(aNumber, bNumber) {
    const a = Number(aNumber);
    const b = Number(bNumber);
    return Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0 && a === b;
  }

  function jerseyNumbersMissing(aNumber, bNumber) {
    const a = Number(aNumber);
    const b = Number(bNumber);
    return !Number.isFinite(a) || a <= 0 || !Number.isFinite(b) || b <= 0;
  }

  /**
   * Close names match when first + last tokens agree and the shorter
   * name's tokens are a subsequence of the longer (Jose Carmona ≈ Jose Angel Carmona).
   * Mononym ⊂ full name (Gabriel ⊂ Gabriel Magalhaes) when shirt numbers match,
   * or when numbers are missing and both nationalities match.
   */
  function namesLooselyMatch(aName, bName, opts = {}) {
    const aKey = normalizeNameKey(aName);
    const bKey = normalizeNameKey(bName);
    if (!aKey || !bKey) return false;
    if (aKey === bKey) return true;
    const a = nameTokens(aKey);
    const b = nameTokens(bKey);
    if (!a.length || !b.length) return false;

    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    const subset = shorter.every((token) => longer.includes(token));
    if (subset && shorter.length < longer.length) {
      if (jerseyNumbersMatch(opts.aNumber, opts.bNumber)) return true;
      const aNat = nationalityKey(opts.aNationality);
      const bNat = nationalityKey(opts.bNationality);
      if (jerseyNumbersMissing(opts.aNumber, opts.bNumber) && aNat && bNat && aNat === bNat) {
        return true;
      }
    }

    if (a.length < 2 || b.length < 2) return false;
    if (a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
    let i = 0;
    for (const token of longer) {
      if (token === shorter[i]) i += 1;
      if (i === shorter.length) return true;
    }
    return false;
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
      const rawName = (nameLink?.textContent || nameLink?.getAttribute("title") || "").trim();
      const name = toAsciiName(rawName);
      if (!name) continue;

      const numberText = row.querySelector(":scope > td.zentriert")?.textContent?.trim() ?? "";
      const parsedNumber = parseInt(numberText, 10);
      const number = Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null;

      // Prefer the nation flag column Ã¢â‚¬â€ first img[title] can be a crest/portrait.
      const natImg =
        row.querySelector("td.zentriert img.flaggenrahmen[title]") ||
        row.querySelector("img.flaggenrahmen[title]");
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

  function normalizeRole(value) {
    return String(value ?? "").trim().toUpperCase();
  }

  function normalizePos(value) {
    const pos = String(value ?? "").trim().toUpperCase();
    return ["GK", "DF", "MF", "FW"].includes(pos) ? pos : "";
  }

  function nationalityKey(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function fieldDiffs(local, tm) {
    const changes = [];
    const localNumber = Number(local?.number);
    const tmNumber = Number(tm?.number);
    if (Number.isFinite(tmNumber) && tmNumber > 0 && localNumber !== tmNumber) {
      changes.push("number");
    }
    const localPos = normalizePos(local?.pos);
    const tmPos = normalizePos(tm?.pos);
    if (tmPos && localPos !== tmPos) changes.push("pos");
    const localRole = normalizeRole(local?.role ?? local?.pos);
    const tmRole = normalizeRole(tm?.role);
    if (tmRole && localRole !== tmRole) changes.push("role");
    const tmNat = String(tm?.nationality ?? "").trim();
    if (tmNat && nationalityKey(local?.nationality) !== nationalityKey(tmNat)) {
      changes.push("nationality");
    }
    return changes;
  }

  function compareSquads(localPlayers, tmPlayers) {
    const locals = [...(localPlayers ?? [])];
    const tms = [...(tmPlayers ?? [])];
    const usedLocal = new Set();
    const usedTm = new Set();
    const pairs = [];

    const localByKey = new Map();
    for (let i = 0; i < locals.length; i++) {
      const key = normalizeNameKey(locals[i].name);
      if (key && !localByKey.has(key)) localByKey.set(key, i);
    }

    for (let ti = 0; ti < tms.length; ti++) {
      const key = normalizeNameKey(tms[ti].name);
      const li = key ? localByKey.get(key) : undefined;
      if (li == null || usedLocal.has(li)) continue;
      usedLocal.add(li);
      usedTm.add(ti);
      pairs.push({ local: locals[li], tm: tms[ti] });
    }

    for (let ti = 0; ti < tms.length; ti++) {
      if (usedTm.has(ti)) continue;
      const tm = tms[ti];
      let best = -1;
      let bestScore = Infinity;
      for (let li = 0; li < locals.length; li++) {
        if (usedLocal.has(li)) continue;
        if (
          !namesLooselyMatch(tm.name, locals[li].name, {
            aNumber: tm.number,
            bNumber: locals[li].number,
            aNationality: tm.nationality,
            bNationality: locals[li].nationality,
          })
        ) {
          continue;
        }
        const tmTokens = nameTokens(normalizeNameKey(tm.name));
        const localTokens = nameTokens(normalizeNameKey(locals[li].name));
        let score = Math.abs(tmTokens.length - localTokens.length);
        if (
          Number.isFinite(Number(tm.number)) &&
          Number(tm.number) > 0 &&
          Number(locals[li].number) === Number(tm.number)
        ) {
          score -= 10;
        }
        if (score < bestScore) {
          bestScore = score;
          best = li;
        }
      }
      if (best < 0) continue;
      usedLocal.add(best);
      usedTm.add(ti);
      pairs.push({ local: locals[best], tm });
    }

    const toAdd = tms.filter((_, i) => !usedTm.has(i));
    const toRemove = locals.filter((_, i) => !usedLocal.has(i));
    const toUpdate = [];
    for (const { local, tm } of pairs) {
      const changes = fieldDiffs(local, tm);
      if (changes.length) toUpdate.push({ local, tm, changes });
    }

    toAdd.sort(
      (a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name),
    );
    toRemove.sort((a, b) => Number(a.number) - Number(b.number) || String(a.name).localeCompare(b.name));
    toUpdate.sort(
      (a, b) =>
        Number(a.local.number) - Number(b.local.number) ||
        String(a.local.name).localeCompare(String(b.local.name)),
    );

    return {
      toAdd,
      toRemove,
      toUpdate,
      matched: pairs.length,
      tmTotal: tms.length,
      localTotal: locals.length,
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
      .replace(/\u00e2\u20ac|\u00e2\u0082\u00ac/g, "\u20ac")
      .trim();
    if (category === "loanReturn" || category === "loanRecall") return "";
    if (category === "promoted") return "Internal";
    if (/^free transfer$/i.test(raw)) return "Free";
    if (/^loan transfer$/i.test(raw)) return "Loan";
    if (/^loan fee:/i.test(raw)) return raw.replace(/^loan fee:\s*/i, "Loan ");
    if (raw === "-" || raw === "–" || raw === "—") return "";
    return raw;
  }

  function normalizeTransferDateKey(dateStr) {
    const s = String(dateStr ?? "").trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const slash = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slash) {
      return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    }
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    return s.toLowerCase();
  }

  function transferFieldDiffs(local, tm, category) {
    const changes = [];
    const localClub = toAsciiName(local?.otherClub ?? "");
    const tmClub = toAsciiName(tm?.otherClub ?? "");
    if (tmClub && normalizeNameKey(localClub) !== normalizeNameKey(tmClub)) {
      changes.push("otherClub");
    }
    if (category !== "loanReturn" && category !== "loanRecall") {
      const localFee = String(local?.fee ?? "").trim();
      const tmFee = String(tm?.fee ?? "").trim();
      if (tmFee && normalizeNameKey(localFee) !== normalizeNameKey(tmFee)) {
        changes.push("fee");
      }
    }
    const localDate = normalizeTransferDateKey(local?.date);
    const tmDate = normalizeTransferDateKey(tm?.date);
    if (tmDate && localDate !== tmDate) changes.push("date");
    return changes;
  }

  function parseTransferRows(box, direction, teamName) {
    const rows = [];
    for (const row of box?.querySelectorAll("table.items > tbody > tr") ?? []) {
      const cells = row.children;
      if (cells.length < 6) continue;
      const playerLink =
        cells[1].querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
        cells[1].querySelector('a[href*="/profil/spieler/"]');
      const player = toAsciiName((playerLink?.textContent || playerLink?.getAttribute("title") || "").trim());
      if (!player) continue;

      const playerId = playerLink?.getAttribute("href")?.match(/\/spieler\/(\d+)/)?.[1] ?? "";
      const position =
        cells[1].querySelector("table.inline-table tr:nth-child(2) td")?.textContent?.trim() ?? "";
      const nationality =
        cells[3].querySelector("img.flaggenrahmen[title]")?.getAttribute("title")?.trim() ||
        cells[3].querySelector("img[title]")?.getAttribute("title")?.trim() ||
        "";
      const clubLink =
        cells[4].querySelector("td.hauptlink a") ||
        cells[4].querySelector('a[href*="/startseite/verein/"]');
      const otherClub = toAsciiName(
        (clubLink?.getAttribute("title") || clubLink?.textContent || "").trim(),
      );
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

  function flattenTransferLists(lists) {
    const categories = ["in", "out", "promoted", "loanReturn", "loanRecall"];
    const rows = [];
    for (const category of categories) {
      for (const row of lists?.[category] ?? []) {
        const player = String(row?.player ?? "").trim();
        if (!player) continue;
        rows.push({ ...row, category, player });
      }
    }
    return rows;
  }

  function compareTransferLists(localLists, tmLists) {
    const categories = ["in", "out", "promoted", "loanReturn", "loanRecall"];
    const locals = flattenTransferLists(localLists);
    const tms = flattenTransferLists(tmLists);
    const usedLocal = new Set();
    const usedTm = new Set();
    const pairs = [];

    function tryPair(preferSameCategory, exactOnly) {
      for (let ti = 0; ti < tms.length; ti++) {
        if (usedTm.has(ti)) continue;
        const tm = tms[ti];
        let best = -1;
        let bestScore = Infinity;
        for (let li = 0; li < locals.length; li++) {
          if (usedLocal.has(li)) continue;
          const local = locals[li];
          const exact = normalizeNameKey(local.player) === normalizeNameKey(tm.player);
          const loose = !exact && namesLooselyMatch(local.player, tm.player);
          if (exactOnly ? !exact : !(exact || loose)) continue;
          if (preferSameCategory && local.category !== tm.category) continue;
          let score = exact ? 0 : 10;
          if (local.category === tm.category) score -= 5;
          if (score < bestScore) {
            bestScore = score;
            best = li;
          }
        }
        if (best < 0) continue;
        usedLocal.add(best);
        usedTm.add(ti);
        pairs.push({ local: locals[best], tm });
      }
    }

    tryPair(true, true);
    tryPair(true, false);
    tryPair(false, true);
    tryPair(false, false);

    const byCategory = {};
    for (const category of categories) {
      byCategory[category] = { toAdd: [], toRemove: [], toUpdate: [], toReclassify: [], matched: 0 };
    }

    for (const { local, tm } of pairs) {
      if (local.category === tm.category) {
        byCategory[local.category].matched += 1;
        const changes = transferFieldDiffs(local, tm, local.category);
        if (changes.length) {
          byCategory[local.category].toUpdate.push({
            local,
            tm,
            category: local.category,
            changes,
          });
        }
      } else {
        byCategory[local.category].toReclassify.push({
          local,
          tm,
          fromCategory: local.category,
          toCategory: tm.category,
          changes: transferFieldDiffs(local, tm, tm.category),
        });
      }
    }

    for (let ti = 0; ti < tms.length; ti++) {
      if (usedTm.has(ti)) continue;
      byCategory[tms[ti].category].toAdd.push(tms[ti]);
    }
    for (let li = 0; li < locals.length; li++) {
      if (usedLocal.has(li)) continue;
      byCategory[locals[li].category].toRemove.push(locals[li]);
    }

    let matched = 0;
    for (const category of categories) {
      matched += byCategory[category].matched;
      byCategory[category].toAdd.sort((a, b) => String(a.player).localeCompare(String(b.player)));
      byCategory[category].toRemove.sort((a, b) => String(a.player).localeCompare(String(b.player)));
      byCategory[category].toUpdate.sort((a, b) =>
        String(a.local.player).localeCompare(String(b.local.player)),
      );
      byCategory[category].toReclassify.sort((a, b) =>
        String(a.local.player).localeCompare(String(b.local.player)),
      );
    }

    return {
      byCategory,
      matched,
      tmTotal: tms.length,
      localTotal: locals.length,
    };
  }

  function looksLikeHtml(text) {
    const s = String(text ?? "").trim().slice(0, 200).toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head");
  }

  function isLocalProxyHost() {
    const host = String(global.location?.hostname ?? "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  }

  async function fetchProxyText(url, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    let res;
    try {
      res = await fetch(url, { cache: "no-store", signal: controller.signal });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error(
          `${label} timed out Ã¢â‚¬â€ restart serve.bat (Transfermarkt fetch now uses curl) and try again.`,
        );
      }
      throw new Error("Cannot reach local Transfermarkt proxy Ã¢â‚¬â€ start serve.bat and open admin via http://127.0.0.1");
    } finally {
      clearTimeout(timer);
    }
    const body = await res.text();
    if (!res.ok) {
      let detail = body.trim();
      if (res.status === 404 || looksLikeHtml(detail) || /^404\b/i.test(detail)) {
        throw new Error(
          "Transfermarkt proxy missing Ã¢â‚¬â€ close the old serve.bat window, run serve.bat again, then reopen admin.",
        );
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* plain text */
      }
      if (/timed?\s*out|timeout/i.test(detail)) {
        throw new Error(
          "Transfermarkt timed out Ã¢â‚¬â€ restart serve.bat so it uses curl, then try again.",
        );
      }
      throw new Error(detail || `Transfermarkt fetch failed (${res.status})`);
    }
    return body;
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
    const body = await fetchProxyText(url, "Squad refresh");
    if (looksLikeHtml(body) && !/table\.items|rn_nummer|hauptlink/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing Ã¢â‚¬â€ restart serve.bat so /api/tm-squad is available.",
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
    const body = await fetchProxyText(url, "Transfer compare");
    if (looksLikeHtml(body) && !/Arrivals|Departures|zugaenge|abgaenge/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing Ã¢â‚¬â€ close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndCompareTransfers(localLists, clubId, season, teamName) {
    const html = await fetchTransfersHtml(clubId, season);
    const tmLists = parseTransfersHtml(html, teamName);
    const total = Object.values(tmLists).reduce((sum, rows) => sum + rows.length, 0);
    if (!total) {
      throw new Error("Could not parse any transfers from Transfermarkt Ã¢â‚¬â€ check the season or page layout.");
    }
    return { tmLists, diff: compareTransferLists(localLists, tmLists) };
  }

  async function fetchAndCompare(localPlayers, clubId) {
    const html = await fetchSquadHtml(clubId);
    const tmPlayers = parseSquadHtml(html);
    if (!tmPlayers.length) {
      throw new Error("Could not parse any players from Transfermarkt Ã¢â‚¬â€ the page layout may have changed.");
    }
    return { tmPlayers, diff: compareSquads(localPlayers, tmPlayers) };
  }

  function parseClubStadiumName(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const link =
      doc.querySelector('a[href*="/stadion/verein/"]') ||
      doc.querySelector('a[href*="/stadium/verein/"]');
    const fromLink = toAsciiName(
      (link?.getAttribute("title") || link?.textContent || "").trim(),
    );
    if (fromLink) return fromLink;

    for (const row of doc.querySelectorAll("table.profilheader tr, .dataHeader tr, table tr")) {
      const label = (row.querySelector("th, td:first-child")?.textContent || "").trim();
      if (!/^stadium|^stadion/i.test(label)) continue;
      const valueCell = row.querySelector("td:last-child") || row.querySelector("td");
      const name = toAsciiName(
        (
          valueCell?.querySelector("a")?.getAttribute("title") ||
          valueCell?.querySelector("a")?.textContent ||
          valueCell?.textContent ||
          ""
        )
          .replace(/\d[\d.\s]*\s*(seats|plätze|plaetze).*$/i, "")
          .trim(),
      );
      if (name) return name;
    }
    return "";
  }

  function stadiumNamesMatch(a, b) {
    const aName = String(a ?? "").trim();
    const bName = String(b ?? "").trim();
    if (!aName || !bName) return false;
    return (
      normalizeNameKey(aName) === normalizeNameKey(bName) ||
      namesLooselyMatch(aName, bName)
    );
  }

  function compareLeagueStadiums({ localNames, teams, tmByTeamId }) {
    const locals = [...new Set((localNames ?? []).map((s) => String(s ?? "").trim()).filter(Boolean))];
    const localKeySet = new Set(locals.map((s) => normalizeNameKey(s)));
    const tmNames = new Set();
    const toAdd = [];
    const toLink = [];
    const toRename = [];
    const matched = [];
    const failed = [];
    const skipped = [];

    for (const team of teams ?? []) {
      const teamId = team?.id;
      if (!teamId) continue;
      if (!team.clubId) {
        skipped.push({ teamId, teamName: team.name, reason: "no Transfermarkt link" });
        continue;
      }
      const tmEntry = tmByTeamId?.[teamId];
      if (tmEntry?.error) {
        failed.push({ teamId, teamName: team.name, error: String(tmEntry.error) });
        continue;
      }
      const tmName = toAsciiName(tmEntry?.stadium || "");
      if (!tmName) {
        failed.push({ teamId, teamName: team.name, error: "Could not parse stadium name" });
        continue;
      }
      tmNames.add(tmName);
      const localStadium = String(team.stadium ?? "").trim();
      const exact = localStadium && normalizeNameKey(localStadium) === normalizeNameKey(tmName);
      if (exact) {
        matched.push({ teamId, teamName: team.name, stadium: localStadium || tmName });
        continue;
      }
      if (localStadium && stadiumNamesMatch(localStadium, tmName)) {
        toRename.push({
          teamId,
          teamName: team.name,
          from: localStadium,
          to: tmName,
          inLeagueList: localKeySet.has(normalizeNameKey(localStadium)),
        });
        continue;
      }
      toLink.push({
        teamId,
        teamName: team.name,
        from: localStadium || "",
        to: tmName,
      });
    }

    const addSeen = new Set();
    for (const name of tmNames) {
      const key = normalizeNameKey(name);
      if (!key || localKeySet.has(key) || addSeen.has(key)) continue;
      // Also skip if a local name loosely matches this TM name (rename covers that)
      const looseHit = locals.some((local) => stadiumNamesMatch(local, name));
      if (looseHit) continue;
      addSeen.add(key);
      toAdd.push({ name });
    }

    const usedKeys = new Set();
    for (const team of teams ?? []) {
      const s = String(team?.stadium ?? "").trim();
      if (s) usedKeys.add(normalizeNameKey(s));
    }
    for (const name of tmNames) usedKeys.add(normalizeNameKey(name));
    for (const item of toRename) {
      usedKeys.add(normalizeNameKey(item.from));
      usedKeys.add(normalizeNameKey(item.to));
    }
    for (const item of toLink) usedKeys.add(normalizeNameKey(item.to));

    const toRemove = locals
      .filter((name) => {
        const key = normalizeNameKey(name);
        return key && !usedKeys.has(key) && ![...tmNames].some((tm) => stadiumNamesMatch(name, tm));
      })
      .map((name) => ({ name }));

    toAdd.sort((a, b) => a.name.localeCompare(b.name));
    toLink.sort((a, b) => String(a.teamName).localeCompare(String(b.teamName)));
    toRename.sort((a, b) => String(a.teamName).localeCompare(String(b.teamName)));
    toRemove.sort((a, b) => a.name.localeCompare(b.name));

    return {
      toAdd,
      toLink,
      toRename,
      toRemove,
      matched: matched.length,
      tmTotal: tmNames.size,
      localTotal: locals.length,
      skipped,
      failed,
      tmNames: [...tmNames].sort((a, b) => a.localeCompare(b)),
    };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchClubHtml(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Refresh only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-club?clubId=${encodeURIComponent(String(id))}`;
    const body = await fetchProxyText(url, "Club stadium");
    if (looksLikeHtml(body) && !/stadion|stadium|verein/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndCompareLeagueStadiums({ localNames, teams }) {
    const list = [...(teams ?? [])];
    const tmByTeamId = {};
    const withClub = list.filter((t) => t?.clubId);
    let cursor = 0;
    const concurrency = 3;

    async function worker() {
      while (cursor < withClub.length) {
        const idx = cursor++;
        const team = withClub[idx];
        try {
          const html = await fetchClubHtml(team.clubId);
          const stadium = parseClubStadiumName(html);
          tmByTeamId[team.id] = { stadium, clubId: team.clubId };
        } catch (err) {
          tmByTeamId[team.id] = { error: err?.message || String(err), clubId: team.clubId };
        }
        await delay(120);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(withClub.length, 1)) }, () => worker()),
    );

    return {
      tmByTeamId,
      diff: compareLeagueStadiums({ localNames, teams: list, tmByTeamId }),
    };
  }

  function parseScorePair(text) {
    const m = String(text ?? "")
      .replace(/\s+/g, "")
      .match(/^(\d+):(\d+)$/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2])];
  }

  function formatMatchdayTimeLabel(dateIso) {
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return "";
    const d = new Date(`${dateIso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  function parseMatchdayDateIso(container) {
    if (!container) return "";
    const datumHref = container.querySelector('a[href*="/datum/"]')?.getAttribute("href") || "";
    const fromHref = datumHref.match(/datum\/(\d{4}-\d{2}-\d{2})/i)?.[1];
    if (fromHref) return fromHref;
    const text = container.textContent || "";
    const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (slash) {
      return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    }
    return "";
  }

  function parseMatchdayGoals(container) {
    const goals = [];
    if (!container) return goals;
    const seen = new Set();

    for (const row of container.querySelectorAll("tr")) {
      const cells = [...row.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
      if (cells.length < 2) continue;
      const rowText = row.textContent || "";
      if (/who does the community|referee:|filter by season|select matchday/i.test(rowText)) continue;

      const playerLink = row.querySelector('a[href*="/profil/spieler/"]');
      if (!playerLink) continue;
      const scorer = toAsciiName(
        (playerLink.getAttribute("title") || playerLink.textContent || "").trim(),
      );
      if (!scorer) continue;

      let minute = null;
      for (const cell of cells) {
        const m = String(cell.textContent || "")
          .trim()
          .match(/^(\d{1,3})(?:\+(\d{1,2}))?'?$/);
        if (m) {
          minute = Number(m[1]) + (m[2] ? Number(m[2]) : 0);
          break;
        }
      }
      if (minute == null) {
        const m = rowText.match(/\b(\d{1,3})(?:\+(\d{1,2}))?'/);
        if (m) minute = Number(m[1]) + (m[2] ? Number(m[2]) : 0);
      }
      if (minute == null) continue;

      // Goal rows include the running score (1:0); cards/subs usually do not.
      const scoreProg = rowText.match(/\b(\d+):(\d+)\b/);
      if (!scoreProg) continue;
      let side = "home";
      const linkIndex = cells.findIndex((c) => c.contains(playerLink));
      const scoreIndex = cells.findIndex((c) => /\b\d+:\d+\b/.test(String(c.textContent || "").trim()));
      if (linkIndex >= 0 && scoreIndex >= 0) {
        side = linkIndex < scoreIndex ? "home" : "away";
      } else {
        const before = rowText.slice(0, rowText.indexOf(playerLink.textContent || scorer));
        side = /\d+:\d+/.test(before) ? "away" : "home";
      }

      const key = `${minute}|${side}|${normalizeNameKey(scorer)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      goals.push({ minute, side, scorer });
    }

    goals.sort((a, b) => a.minute - b.minute || a.side.localeCompare(b.side));
    return goals;
  }

  function parseMatchdayHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const fixtures = [];
    const seenMatch = new Set();

    for (const scoreLink of doc.querySelectorAll('a[href*="/spielbericht/"]')) {
      const href = scoreLink.getAttribute("href") || "";
      const tmMatchId = href.match(/spielbericht\/(\d+)/i)?.[1] || "";
      if (tmMatchId && seenMatch.has(tmMatchId)) continue;

      const score = parseScorePair(scoreLink.textContent);
      const container =
        scoreLink.closest("div.box") ||
        scoreLink.closest("table")?.closest("div.box") ||
        scoreLink.closest("table") ||
        scoreLink.parentElement?.parentElement?.parentElement;

      const clubLinks = [];
      const clubSeen = new Set();
      for (const a of container?.querySelectorAll('a[href*="/verein/"]') || []) {
        const id = Number(a.getAttribute("href")?.match(/\/verein\/(\d+)/i)?.[1]);
        if (!Number.isFinite(id) || id <= 0 || clubSeen.has(id)) continue;
        clubSeen.add(id);
        clubLinks.push({
          clubId: id,
          name: toAsciiName((a.getAttribute("title") || a.textContent || "").trim()),
        });
      }
      if (clubLinks.length < 2) continue;

      const home = clubLinks[0];
      const away = clubLinks[1];
      if (!home.name || !away.name) continue;

      const dateIso = parseMatchdayDateIso(container);
      const timeLabel = formatMatchdayTimeLabel(dateIso);
      const goals = score ? parseMatchdayGoals(container) : [];
      const dedupeKey = tmMatchId || `${home.clubId}-${away.clubId}-${dateIso}`;
      if (seenMatch.has(dedupeKey)) continue;
      seenMatch.add(dedupeKey);

      fixtures.push({
        homeClubId: home.clubId,
        awayClubId: away.clubId,
        homeName: home.name,
        awayName: away.name,
        score,
        dateIso,
        timeLabel,
        goals,
        tmMatchId: tmMatchId || "",
      });
    }

    return fixtures;
  }

  function goalEventKey(ev) {
    return `${Number(ev?.minute) || 0}|${ev?.side === "away" ? "away" : "home"}|${normalizeNameKey(ev?.scorer)}`;
  }

  function goalsDiffer(localGoals, tmGoals) {
    const a = (localGoals ?? []).map(goalEventKey).sort().join(";");
    const b = (tmGoals ?? []).map(goalEventKey).sort().join(";");
    return a !== b;
  }

  function compareMatchday({ localMatches, tmFixtures, teams }) {
    const clubToTeam = new Map();
    for (const team of teams ?? []) {
      const clubId = Number(team?.clubId);
      if (!Number.isFinite(clubId) || clubId <= 0 || !team?.id) continue;
      if (!clubToTeam.has(clubId)) clubToTeam.set(clubId, team);
    }

    const locals = [...(localMatches ?? [])];
    const usedLocal = new Set();
    const toAdd = [];
    const toUpdate = [];
    const skipped = [];
    let matched = 0;

    const localByPair = new Map();
    for (let i = 0; i < locals.length; i++) {
      const m = locals[i];
      const key = `${m.homeTeamId}|${m.awayTeamId}`;
      if (!localByPair.has(key)) localByPair.set(key, i);
    }

    for (const tm of tmFixtures ?? []) {
      const homeTeam = clubToTeam.get(Number(tm.homeClubId));
      const awayTeam = clubToTeam.get(Number(tm.awayClubId));
      if (!homeTeam || !awayTeam) {
        skipped.push({
          homeName: tm.homeName,
          awayName: tm.awayName,
          reason: !homeTeam && !awayTeam ? "both clubs unmapped" : !homeTeam ? "home unmapped" : "away unmapped",
        });
        continue;
      }

      const pairKey = `${homeTeam.id}|${awayTeam.id}`;
      const li = localByPair.get(pairKey);
      const enriched = {
        ...tm,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
      };

      if (li == null || usedLocal.has(li)) {
        toAdd.push(enriched);
        continue;
      }

      usedLocal.add(li);
      matched += 1;
      const local = locals[li];
      const changes = [];
      const localScore = [
        Number(local?.score?.[0]) || 0,
        Number(local?.score?.[1]) || 0,
      ];
      if (tm.score) {
        if (localScore[0] !== tm.score[0] || localScore[1] !== tm.score[1]) changes.push("score");
      }
      const localTime = String(local?.time ?? "").trim();
      if (tm.timeLabel && localTime !== tm.timeLabel) changes.push("time");
      if ((tm.goals ?? []).length && goalsDiffer(local?.goalEvents, tm.goals)) {
        changes.push("goals");
      }
      if (changes.length) {
        toUpdate.push({ local, tm: enriched, changes });
      }
    }

    const toRemove = [];
    for (let i = 0; i < locals.length; i++) {
      if (usedLocal.has(i)) continue;
      toRemove.push(locals[i]);
    }

    toAdd.sort((a, b) =>
      String(a.homeTeamName).localeCompare(String(b.homeTeamName)) ||
      String(a.awayTeamName).localeCompare(String(b.awayTeamName)),
    );
    toUpdate.sort((a, b) =>
      String(a.tm.homeTeamName).localeCompare(String(b.tm.homeTeamName)),
    );
    toRemove.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    return {
      toAdd,
      toUpdate,
      toRemove,
      matched,
      tmTotal: (tmFixtures ?? []).length,
      localTotal: locals.length,
      skipped,
    };
  }

  async function fetchMatchdayHtml(compId, season, matchday) {
    const competition = String(compId ?? "").trim();
    const seasonId = Number(season);
    const md = Number(matchday);
    if (!competition || !/^[A-Za-z0-9]+$/.test(competition)) {
      throw new Error("Invalid Transfermarkt competition id");
    }
    if (!Number.isInteger(seasonId) || seasonId < 1900 || seasonId > 2100) {
      throw new Error("Invalid Transfermarkt season");
    }
    if (!Number.isInteger(md) || md < 1 || md > 50) {
      throw new Error("Invalid matchday number");
    }
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Refresh only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url =
      `/api/tm-matchday?compId=${encodeURIComponent(competition)}` +
      `&season=${encodeURIComponent(String(seasonId))}` +
      `&matchday=${encodeURIComponent(String(md))}`;
    const body = await fetchProxyText(url, "Matchday compare");
    if (looksLikeHtml(body) && !/spielbericht|spieltag|matchday/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndCompareMatchday({ localMatches, teams, compId, season, matchday }) {
    const html = await fetchMatchdayHtml(compId, season, matchday);
    const tmFixtures = parseMatchdayHtml(html);
    if (!tmFixtures.length) {
      throw new Error(
        "Could not parse any fixtures from Transfermarkt — check season/matchday or page layout.",
      );
    }
    return {
      tmFixtures,
      diff: compareMatchday({ localMatches, tmFixtures, teams }),
    };
  }

  global.TransfermarktSync = {
    normalizeNameKey,
    toAsciiName,
    namesLooselyMatch,
    mapTmPosition,
    parseSquadHtml,
    compareSquads,
    parseTransfersHtml,
    compareTransferLists,
    parseClubStadiumName,
    compareLeagueStadiums,
    parseMatchdayHtml,
    compareMatchday,
    fetchSquadHtml,
    fetchTransfersHtml,
    fetchClubHtml,
    fetchMatchdayHtml,
    fetchAndCompare,
    fetchAndCompareTransfers,
    fetchAndCompareLeagueStadiums,
    fetchAndCompareMatchday,
    isLocalProxyHost,
  };
})(typeof window !== "undefined" ? window : globalThis);
