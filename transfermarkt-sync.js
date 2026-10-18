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

      const href = nameLink?.getAttribute("href") || "";
      const tmPlayerId = href.match(/\/spieler\/(\d+)/)?.[1] || "";

      players.push({
        number,
        name,
        nationality,
        pos: mapped.pos,
        role: mapped.role,
        tmPosition: mapped.tmPosition || tmPosition,
        tmPlayerId,
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

  function parseTransferDateText(text) {
    const s = String(text ?? "").trim();
    if (!s) return "";
    const key = normalizeTransferDateKey(s);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
  }

  function transferDateFromFee(fee) {
    return parseTransferDateText(fee);
  }

  /** Split Transfermarkt fee cell into amount label + ISO transfer date. */
  function parseTransferFeeCell(feeCell) {
    if (!feeCell) return { rawFee: "", date: "" };
    const link = feeCell.querySelector("a");
    const date =
      parseTransferDateText(link?.querySelector("i")?.textContent) ||
      parseTransferDateText(link?.getAttribute("title")) ||
      parseTransferDateText(feeCell.textContent);

    let rawFee = "";
    if (link) {
      const clone = link.cloneNode(true);
      clone.querySelectorAll("i").forEach((el) => el.remove());
      rawFee = clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
    } else {
      rawFee = feeCell.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (date) {
        rawFee = rawFee
          .replace(/\d{1,2}[/.]\d{1,2}[/.]\d{4}/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
    return { rawFee, date };
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
    const dot = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dot) {
      return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;
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
      const feeCell = row.querySelector("td.rechts.hauptlink") || cells[5];
      const { rawFee, date } = parseTransferFeeCell(feeCell);
      const category = transferCategoryForRow(direction, rawFee, otherClub, teamName);
      const mapped = mapTmPosition(position);

      rows.push({
        id: `tm_${direction}_${playerId || normalizeNameKey(player).replace(/\s+/g, "_")}`,
        player,
        otherClub,
        fee: normalizeTransferFee(rawFee, category),
        date,
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

  const INSTAGRAM_PATH_BLOCK = new Set([
    "p",
    "reel",
    "reels",
    "stories",
    "explore",
    "accounts",
    "share",
    "about",
    "legal",
    "tv",
    "directory",
    "transfermarkt",
    "transfermarkt_official",
    "transfermarktcom",
  ]);

  function parsePlayerInstagram(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const links = [...doc.querySelectorAll('a[href*="instagram.com"]')];
    for (const link of links) {
      const href = String(link.getAttribute("href") || "").trim();
      if (!href || /transfermarkt/i.test(href)) continue;
      let url;
      try {
        url = new URL(href, "https://www.instagram.com");
      } catch {
        continue;
      }
      if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ""))) continue;
      const handle = url.pathname.split("/").filter(Boolean)[0] || "";
      if (!handle || INSTAGRAM_PATH_BLOCK.has(handle.toLowerCase())) continue;
      if (!/^[a-zA-Z0-9._]+$/.test(handle)) continue;
      return `https://www.instagram.com/${handle}/`;
    }
    return "";
  }

  function parsePlayerSearchHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const rows = [];
    const seen = new Set();
    for (const tr of doc.querySelectorAll("table.items > tbody > tr")) {
      const nameLink = tr.querySelector('td.hauptlink a[href*="/spieler/"]');
      const href = nameLink?.getAttribute("href") || "";
      const tmPlayerId = href.match(/\/spieler\/(\d+)/)?.[1] || "";
      const name = toAsciiName((nameLink?.getAttribute("title") || nameLink?.textContent || "").trim());
      if (!tmPlayerId || !name || seen.has(tmPlayerId)) continue;
      seen.add(tmPlayerId);
      const clubLink = tr.querySelector('table.inline-table a[href*="/verein/"]');
      const clubHref = clubLink?.getAttribute("href") || "";
      rows.push({
        tmPlayerId,
        name,
        club: toAsciiName((clubLink?.getAttribute("title") || clubLink?.textContent || "").trim()),
        clubId: clubHref.match(/\/verein\/(\d+)/)?.[1] || "",
        nationality:
          tr.querySelector("img.flaggenrahmen[title]")?.getAttribute("title")?.trim() || "",
      });
    }
    return rows;
  }

  async function fetchPlayerSearchHtml(query) {
    const q = String(query ?? "").trim();
    if (!q) throw new Error("Enter a player name to search Transfermarkt");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Instagram fill only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-search?q=${encodeURIComponent(q)}`;
    const body = await fetchProxyText(url, "Instagram search");
    if (looksLikeHtml(body) && !/spieler\/\d+|schnellsuche|no results|keine/i.test(body)) {
      throw new Error(
        "Transfermarkt search proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchPlayerHtml(playerId) {
    const id = Number(playerId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt player id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt Instagram fill only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-spieler?playerId=${encodeURIComponent(String(id))}`;
    const body = await fetchProxyText(url, "Instagram fill");
    if (looksLikeHtml(body) && !/player data|spielerdaten|instagram|social/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
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

  function normalizeFormationLabel(raw) {
    const text = String(raw ?? "").trim();
    const m = text.match(/(\d+(?:\s*-\s*\d+)+)/);
    if (!m) return "";
    return m[1].replace(/\s+/g, "");
  }

  function parsePercentStyle(style, prop) {
    const m = String(style ?? "").match(new RegExp(`${prop}\\s*:\\s*([\\d.]+)\\s*%`, "i"));
    return m ? Number(m[1]) : null;
  }

  function parseFormationPlayerContainer(el) {
    const link = el.querySelector(".formation-number-name a") || el.querySelector('a[href*="/profil/spieler/"]');
    const rawName = (link?.getAttribute("title") || link?.textContent || "").trim();
    const name = toAsciiName(rawName);
    if (!name) return null;
    const numText = (el.querySelector(".tm-shirt-number")?.textContent || "").trim();
    const number = Number(numText);
    const top = parsePercentStyle(el.getAttribute("style"), "top");
    const left = parsePercentStyle(el.getAttribute("style"), "left");
    const captain = Boolean(el.querySelector(".kapitaenicon-formation"));
    const yellow = Boolean(el.querySelector(".icon-gelbekarte-formation"));
    const red = Boolean(
      el.querySelector(".icon-rotekarte-formation") || el.querySelector(".icon-gelbrotekarte-formation"),
    );
    return {
      name,
      number: Number.isFinite(number) && number > 0 ? number : null,
      top: top ?? 50,
      left: left ?? 50,
      captain,
      yellow,
      red,
    };
  }

  function parseAufstellungBox(box) {
    const clubLink =
      box.querySelector(".aufstellung-unterueberschrift-mannschaft a[href*='/verein/']") ||
      box.querySelector("a.sb-vereinslink[href*='/verein/']") ||
      box.querySelector("a[href*='/verein/']");
    const clubId = Number(clubLink?.getAttribute("href")?.match(/\/verein\/(\d+)/i)?.[1]);
    const clubName = toAsciiName(
      (clubLink?.getAttribute("title") || clubLink?.textContent || "").replace(/\s+/g, " ").trim(),
    );
    const formationRaw =
      box.querySelector(".formation-subtitle")?.textContent ||
      box.querySelector(".unterueberschrift.formation-subtitle")?.textContent ||
      "";
    const formation = normalizeFormationLabel(formationRaw);
    const players = [];
    for (const el of box.querySelectorAll(".formation-player-container")) {
      if (!el.querySelector(".tm-shirt-number") && !el.querySelector(".formation-number-name")) continue;
      const parsed = parseFormationPlayerContainer(el);
      if (!parsed) continue;
      players.push(parsed);
    }
    const seen = new Set();
    const unique = [];
    for (const p of players) {
      const key = `${p.number ?? ""}|${normalizeNameKey(p.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(p);
    }
    // TM pitch: higher top% = nearer own goal (GK). Left→right within a band.
    unique.sort((a, b) => b.top - a.top || a.left - b.left);
    return {
      clubId: Number.isFinite(clubId) && clubId > 0 ? clubId : null,
      clubName,
      formation: formation || "",
      players: unique.slice(0, 11),
    };
  }

  function lineupTagsForFormation(formation) {
    const outfield =
      typeof global.SquadDepth !== "undefined" && typeof global.SquadDepth.defaultSlotTagsForFormation === "function"
        ? global.SquadDepth.defaultSlotTagsForFormation(formation)
        : null;
    const tags = ["GK"];
    if (Array.isArray(outfield) && outfield.length) {
      for (const t of outfield) {
        const u = String(t ?? "").trim().toUpperCase();
        if (u === "LCB" || u === "RCB") tags.push("CB");
        else if (u === "ST") tags.push("CF");
        else tags.push(u || "CM");
      }
    } else {
      tags.push("LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "AM", "RW", "CF");
    }
    while (tags.length < 11) tags.push("CM");
    return tags.slice(0, 11);
  }

  function findAufstellungSideBoxes(doc) {
    const withClass = [...doc.querySelectorAll("div.aufstellung-box")].filter((el) =>
      el.querySelector(".formation-player-container"),
    );
    if (withClass.length >= 2) return withClass.slice(0, 2);

    // TM often omits aufstellung-box on the away block — match by column + pitch players.
    const byColumn = [...doc.querySelectorAll("div.large-6.columns, div.aufstellung-box")].filter(
      (el) =>
        el.querySelector(".formation-player-container") &&
        (el.querySelector(".formation-subtitle") ||
          el.querySelector(".aufstellung-unterueberschrift-mannschaft")),
    );
    if (byColumn.length >= 2) return byColumn.slice(0, 2);

    // Last resort: climb from each Starting Line-up subtitle.
    const fromSubtitles = [];
    for (const sub of doc.querySelectorAll(".formation-subtitle")) {
      if (!/starting\s*line-?up/i.test(sub.textContent || "")) continue;
      let node = sub.parentElement;
      for (let i = 0; i < 6 && node; i++) {
        if (
          node.querySelector?.(".formation-player-container") &&
          (node.classList?.contains("columns") || node.classList?.contains("aufstellung-box"))
        ) {
          if (!fromSubtitles.includes(node)) fromSubtitles.push(node);
          break;
        }
        node = node.parentElement;
      }
    }
    return fromSubtitles.slice(0, 2);
  }

  function parseSpielberichtLineups(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const boxes = findAufstellungSideBoxes(doc);
    if (boxes.length < 2) {
      return { home: null, away: null, tmMatchId: "" };
    }
    const home = parseAufstellungBox(boxes[0]);
    const away = parseAufstellungBox(boxes[1]);
    const pathHref =
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
      doc.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
      "";
    const tmMatchId = pathHref.match(/spielbericht\/(\d+)/i)?.[1] || "";
    return { home, away, tmMatchId };
  }

  async function fetchSpielberichtHtml(matchId) {
    const id = String(matchId ?? "").trim();
    if (!/^\d+$/.test(id)) throw new Error("Invalid Transfermarkt match id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt lineup fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-spielbericht?matchId=${encodeURIComponent(id)}`;
    const body = await fetchProxyText(url, "Lineup fetch");
    if (looksLikeHtml(body) && !/aufstellung|Starting Line-up|formation-player/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  function parseSbClockMinute(style) {
    const x = Number(String(style ?? "").match(/background-position:\s*(-?\d+(?:\.\d+)?)px/i)?.[1]);
    const y = Number(
      String(style ?? "").match(/background-position:\s*-?\d+(?:\.\d+)?px\s+(-?\d+(?:\.\d+)?)px/i)?.[1],
    );
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const ones = Math.round(Math.abs(x) / 36);
    const tens = Math.round(Math.abs(y) / 36);
    if (ones > 9 || tens > 12) return null;
    return tens * 10 + ones;
  }

  function parseSpielberichtGoals(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const goals = [];
    const root = doc.querySelector("#sb-tore") || doc.querySelector(".sb-ereignisse");
    if (!root) return goals;

    for (const li of root.querySelectorAll("li.sb-aktion-heim, li.sb-aktion-gast, li")) {
      const action = li.querySelector(".sb-aktion-aktion");
      if (!action) continue;
      const scorerLink =
        action.querySelector("a.wichtig[href*='/spieler/']") ||
        action.querySelector("a[href*='/profil/spieler/'], a[href*='/leistungsdatendetails/spieler/']");
      const scorer = toAsciiName((scorerLink?.getAttribute("title") || scorerLink?.textContent || "").trim());
      if (!scorer) continue;

      const actionText = (action.textContent || "").replace(/\s+/g, " ").trim();
      const ownGoal = /\bown[\s-]?goal\b|\beigentor\b/i.test(actionText);

      let assist = null;
      const assistMatch = actionText.match(/\bAssist:\s*/i);
      if (assistMatch) {
        const assistLinks = [...action.querySelectorAll("a.wichtig[href*='/spieler/'], a[href*='/spieler/']")];
        const assistLink =
          assistLinks.find((a) => {
            const name = toAsciiName((a.getAttribute("title") || a.textContent || "").trim());
            return name && normalizeNameKey(name) !== normalizeNameKey(scorer);
          }) || null;
        assist = toAsciiName((assistLink?.getAttribute("title") || assistLink?.textContent || "").trim()) || null;
      }

      const clockEl = li.querySelector(".sb-sprite-uhr-klein, .sb-aktion-uhr span[style*='background']");
      let minute = parseSbClockMinute(clockEl?.getAttribute("style") || "");
      if (minute == null) {
        const m = actionText.match(/\b(\d{1,3})(?:\+(\d{1,2}))?'/);
        if (m) minute = Number(m[1]) + (m[2] ? Number(m[2]) : 0);
      }
      if (minute == null) minute = 0;

      let side = "home";
      if (li.classList.contains("sb-aktion-gast")) side = "away";
      else if (li.classList.contains("sb-aktion-heim")) side = "home";

      goals.push({
        minute,
        side,
        scorer,
        assist: ownGoal ? null : assist,
        type: ownGoal ? "og" : "goal",
      });
    }

    goals.sort((a, b) => a.minute - b.minute || a.side.localeCompare(b.side));
    return goals;
  }

  async function fetchAndParseSpielberichtLineups(matchId) {
    const html = await fetchSpielberichtHtml(matchId);
    const parsed = parseSpielberichtLineups(html);
    const goals = parseSpielberichtGoals(html);
    if (!parsed.home?.players?.length && !parsed.away?.players?.length && !goals.length) {
      throw new Error("Could not parse starting XIs from Transfermarkt match sheet.");
    }
    return { ...parsed, goals };
  }

  async function fetchAndParseSpielberichtGoals(matchId) {
    const html = await fetchSpielberichtHtml(matchId);
    const goals = parseSpielberichtGoals(html);
    if (!goals.length) {
      throw new Error("Could not parse goals from Transfermarkt match sheet.");
    }
    return { goals, tmMatchId: parseSpielberichtMatchId(matchId) || String(matchId) };
  }

  function parseSpielberichtMatchId(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (/^\d+$/.test(s)) return s;
    return s.match(/spielbericht\/(\d+)/i)?.[1] || "";
  }

  function parseTabelleHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const table = doc.querySelector("table.items");
    const rows = [];
    if (!table) return rows;
    for (const tr of table.querySelectorAll(":scope > tbody > tr")) {
      const clubLink =
        tr.querySelector('td.no-border-links a[href*="/verein/"]') ||
        tr.querySelector('a[href*="/spielplan/verein/"], a[href*="/startseite/verein/"]');
      const clubName = toAsciiName(
        (clubLink?.getAttribute("title") || clubLink?.textContent || "").replace(/\s+/g, " ").trim(),
      );
      if (!clubName) continue;
      const clubId = Number(clubLink?.getAttribute("href")?.match(/\/verein\/(\d+)/i)?.[1]);
      const rankCell = tr.querySelector("td.rechts.hauptlink, td.rechts");
      const rank = Number(String(rankCell?.textContent || "").replace(/[^\d]/g, ""));
      const cells = [...tr.querySelectorAll(":scope > td")];
      const ptsCell = cells[cells.length - 1];
      const pts = Number(String(ptsCell?.textContent || "").trim());
      if (!Number.isFinite(rank) || rank <= 0 || !Number.isFinite(pts)) continue;
      rows.push({
        rank,
        clubName,
        clubId: Number.isFinite(clubId) && clubId > 0 ? clubId : null,
        pts,
      });
    }
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  }

  async function fetchTabelleHtml(compId, season) {
    const competition = String(compId ?? "").trim();
    const seasonId = Number(season);
    if (!competition || !/^[A-Za-z0-9]+$/.test(competition)) {
      throw new Error("Invalid Transfermarkt competition id");
    }
    if (!Number.isInteger(seasonId) || seasonId < 1900 || seasonId > 2100) {
      throw new Error("Invalid Transfermarkt season");
    }
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt table fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url =
      `/api/tm-tabelle?compId=${encodeURIComponent(competition)}` +
      `&season=${encodeURIComponent(String(seasonId))}`;
    const body = await fetchProxyText(url, "Standings fetch");
    if (looksLikeHtml(body) && !/tabelle|table\.items|Pts/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndParseTabelle(compId, season) {
    const html = await fetchTabelleHtml(compId, season);
    const rows = parseTabelleHtml(html);
    if (!rows.length) {
      throw new Error("Could not parse league table from Transfermarkt — check season or page layout.");
    }
    return rows;
  }

  function parseTorschuetzenHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const table = doc.querySelector("table.items");
    const rows = [];
    if (!table) return rows;
    for (const tr of table.querySelectorAll(":scope > tbody > tr")) {
      const playerLink =
        tr.querySelector('td .hauptlink a[href*="/profil/spieler/"]') ||
        tr.querySelector('a[href*="/profil/spieler/"]');
      const name = toAsciiName((playerLink?.getAttribute("title") || playerLink?.textContent || "").trim());
      if (!name) continue;
      const clubImg =
        tr.querySelector('a[href*="/verein/"] img[title]') ||
        tr.querySelector('td.zentriert a[href*="/verein/"] img');
      const clubLink = clubImg?.closest("a") || tr.querySelector('a[href*="/startseite/verein/"]');
      const clubName = toAsciiName(
        (clubImg?.getAttribute("title") || clubLink?.getAttribute("title") || clubLink?.textContent || "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      const clubId = Number(clubLink?.getAttribute("href")?.match(/\/verein\/(\d+)/i)?.[1]);
      const goalsCell =
        tr.querySelector("td.zentriert.hauptlink") ||
        [...tr.querySelectorAll("td.zentriert")].slice(-1)[0];
      const goals = Number(
        String(goalsCell?.querySelector("a")?.textContent || goalsCell?.textContent || "").trim(),
      );
      if (!Number.isFinite(goals) || goals < 0) continue;
      rows.push({
        name,
        clubName,
        clubId: Number.isFinite(clubId) && clubId > 0 ? clubId : null,
        goals,
      });
    }
    return rows;
  }

  async function fetchTorschuetzenHtml(compId, season) {
    const competition = String(compId ?? "").trim();
    const seasonId = Number(season);
    if (!competition || !/^[A-Za-z0-9]+$/.test(competition)) {
      throw new Error("Invalid Transfermarkt competition id");
    }
    if (!Number.isInteger(seasonId) || seasonId < 1900 || seasonId > 2100) {
      throw new Error("Invalid Transfermarkt season");
    }
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt scorers fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url =
      `/api/tm-torschuetzen?compId=${encodeURIComponent(competition)}` +
      `&season=${encodeURIComponent(String(seasonId))}`;
    const body = await fetchProxyText(url, "Scorers fetch");
    if (looksLikeHtml(body) && !/torschuetzen|profil\/spieler|Goals/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndParseTorschuetzen(compId, season) {
    const html = await fetchTorschuetzenHtml(compId, season);
    const rows = parseTorschuetzenHtml(html);
    if (!rows.length) {
      throw new Error("Could not parse top scorers from Transfermarkt — check season or page layout.");
    }
    return rows;
  }

  function parseClubCoachName(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    for (const row of doc.querySelectorAll("table.items tbody tr, table tbody tr")) {
      const role = (row.querySelector("table.inline-table tr:nth-child(2) td")?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!/^(manager|head\s*coach|coach|trainer)$/i.test(role)) continue;
      const link =
        row.querySelector('a[href*="/profil/trainer/"]') ||
        row.querySelector("table.inline-table td.hauptlink a") ||
        row.querySelector("a[title]");
      const name = toAsciiName((link?.getAttribute("title") || link?.textContent || "").trim());
      if (name) return name;
    }
    return "";
  }

  async function fetchMitarbeiterHtml(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt staff fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-mitarbeiter?clubId=${encodeURIComponent(String(id))}`;
    const body = await fetchProxyText(url, "Club staff");
    if (looksLikeHtml(body) && !/mitarbeiter|Manager|Trainer|profil\/trainer/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndParseClubCoach(clubId) {
    const html = await fetchMitarbeiterHtml(clubId);
    const coach = parseClubCoachName(html);
    if (!coach) throw new Error("Could not parse manager/coach from Transfermarkt staff page.");
    return { coach };
  }

  function matchTmClubToLocalTeam(tmClubId, tmClubName, teams) {
    const list = teams ?? [];
    const id = Number(tmClubId);
    if (Number.isFinite(id) && id > 0) {
      const byId = list.find((t) => Number(t.clubId) === id || Number(t.transfermarktId) === id);
      if (byId) return byId;
      if (typeof global.TransfermarktTeams !== "undefined") {
        const hit = list.find((t) => TransfermarktTeams.clubIdForTeam?.(t) === id);
        if (hit) return hit;
      }
    }
    const name = String(tmClubName ?? "").trim();
    if (!name) return null;
    const exact = list.find((t) => normalizeNameKey(t.name) === normalizeNameKey(name));
    if (exact) return exact;
    return list.find((t) => namesLooselyMatch(t.name, name)) || null;
  }

  /** Spain U21 → Spain; leave senior titles unchanged. */
  function nationalTeamToCountry(title) {
    return String(title ?? "")
      .replace(/\s+U\d+\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findNationalspielerBox(doc, headingRe) {
    for (const box of doc.querySelectorAll("div.box")) {
      const heading = (box.querySelector("h2, .content-box-headline, .table-header")?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (headingRe.test(heading)) return box;
    }
    return null;
  }

  function parseNationalspielerRows(root, group) {
    const out = [];
    const seen = new Set();
    const table = root?.matches?.("table.items")
      ? root
      : root?.querySelector?.("table.items") || null;
    for (const row of table?.querySelectorAll(":scope > tbody > tr") ?? []) {
      const playerLink =
        row.querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
        row.querySelector('a[href*="/profil/spieler/"]');
      const name = toAsciiName((playerLink?.getAttribute("title") || playerLink?.textContent || "").trim());
      if (!name) continue;
      const playerId = playerLink?.getAttribute("href")?.match(/\/spieler\/(\d+)/)?.[1] || "";
      const key = playerId || normalizeNameKey(name);
      if (!key || seen.has(`${group}:${key}`)) continue;
      seen.add(`${group}:${key}`);

      const position =
        row.querySelector("table.inline-table tr:nth-child(2) td")?.textContent?.trim() || "";
      const teamCell =
        row.querySelector('td.hauptlink a[href*="/startseite/verein/"]') ||
        row.querySelector("a[title] img.flaggenrahmen")?.closest("a") ||
        row.querySelector("img.flaggenrahmen[title]");
      const nationalTeam = String(
        teamCell?.getAttribute("title") ||
          teamCell?.textContent ||
          row.querySelector("img.flaggenrahmen[title]")?.getAttribute("title") ||
          "",
      )
        .replace(/\s+/g, " ")
        .trim();
      const country = nationalTeamToCountry(nationalTeam) || nationalTeam;
      const ageRaw = Number(row.querySelector("td.zentriert")?.textContent?.trim());
      const appsRaw = Number(
        [...row.querySelectorAll("td.zentriert a[href*='/nationalmannschaft/']")]
          .map((a) => a.textContent?.trim())
          .find((t) => /^\d+$/.test(String(t ?? ""))) || "",
      );
      const nominated =
        /\bbg_gruen|\bgruen_20\b/i.test(row.className || "") ||
        row.classList?.contains("bg_gruen_20");
      const mapped = mapTmPosition(position);

      out.push({
        name,
        tmPlayerId: playerId,
        nationalTeam,
        country,
        age: Number.isFinite(ageRaw) ? ageRaw : null,
        apps: Number.isFinite(appsRaw) ? appsRaw : null,
        position,
        pos: mapped.pos,
        role: mapped.role,
        group,
        nominated: Boolean(nominated),
      });
    }
    return out;
  }

  function parseNationalspielerHtml(html) {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    const seniorBox =
      findNationalspielerBox(doc, /^national team players$/i) ||
      [...doc.querySelectorAll("div.box")].find((box) =>
        /national team players/i.test(box.querySelector("h2")?.textContent || ""),
      );
    const youthBox = findNationalspielerBox(doc, /youth national players/i);
    const previousBox = findNationalspielerBox(doc, /previous senior national players/i);

    let senior = parseNationalspielerRows(seniorBox, "senior");
    if (!senior.length) {
      senior = parseNationalspielerRows(doc.querySelector("table.items"), "senior");
    }
    const youth = parseNationalspielerRows(youthBox, "youth");
    const previous = parseNationalspielerRows(previousBox, "previous");
    return { senior, youth, previous };
  }

  async function fetchNationalspielerHtml(clubId) {
    const id = Number(clubId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid Transfermarkt club id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "Transfermarkt national duty fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const url = `/api/tm-nationalspieler?clubId=${encodeURIComponent(String(id))}`;
    const body = await fetchProxyText(url, "National duty fetch");
    if (looksLikeHtml(body) && !/nationalspieler|National team players|flaggenrahmen/i.test(body)) {
      throw new Error(
        "Transfermarkt proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
      );
    }
    return body;
  }

  async function fetchAndParseNationalspieler(clubId) {
    const html = await fetchNationalspielerHtml(clubId);
    const parsed = parseNationalspielerHtml(html);
    const total = (parsed.senior?.length || 0) + (parsed.youth?.length || 0);
    if (!total) {
      throw new Error("Could not parse internationals from Transfermarkt — the page layout may have changed.");
    }
    return parsed;
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
    parseClubCoachName,
    compareLeagueStadiums,
    parseMatchdayHtml,
    compareMatchday,
    parseSpielberichtLineups,
    parseSpielberichtGoals,
    parseTabelleHtml,
    parseTorschuetzenHtml,
    lineupTagsForFormation,
    parseSpielberichtMatchId,
    matchTmClubToLocalTeam,
    nationalTeamToCountry,
    parseNationalspielerHtml,
    fetchNationalspielerHtml,
    fetchAndParseNationalspieler,
    fetchSquadHtml,
    fetchPlayerHtml,
    parsePlayerInstagram,
    parsePlayerSearchHtml,
    fetchPlayerSearchHtml,
    fetchTransfersHtml,
    fetchClubHtml,
    fetchMitarbeiterHtml,
    fetchMatchdayHtml,
    fetchSpielberichtHtml,
    fetchTabelleHtml,
    fetchTorschuetzenHtml,
    fetchAndCompare,
    fetchAndCompareTransfers,
    fetchAndCompareLeagueStadiums,
    fetchAndCompareMatchday,
    fetchAndParseSpielberichtLineups,
    fetchAndParseSpielberichtGoals,
    fetchAndParseTabelle,
    fetchAndParseTorschuetzen,
    fetchAndParseClubCoach,
    isLocalProxyHost,
  };
})(typeof window !== "undefined" ? window : globalThis);
