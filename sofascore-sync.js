/**
 * Fetch SofaScore lineups via the local serve.ps1 proxy (Chrome dump-dom),
 * then map starting XIs into Squad Central lineup slots.
 */
(function (global) {
  const UNIQUE_TOURNAMENT_IDS = {
    epl: 17,
    laliga: 8,
    seriea: 23,
    bundesliga: 35,
    ligue1: 34,
    ucl: 7,
    worldcup: 16,
    msl: 2660,
  };

  const MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  function isLocalProxyHost() {
    const host = String(global.location?.hostname ?? "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost";
  }

  function looksLikeHtml(text) {
    const s = String(text ?? "").trim().slice(0, 200).toLowerCase();
    return s.startsWith("<!doctype") || s.startsWith("<html") || s.includes("<head");
  }

  function toAsciiName(name) {
    if (typeof global.TransfermarktSync !== "undefined" && TransfermarktSync.toAsciiName) {
      return TransfermarktSync.toAsciiName(name);
    }
    return String(name ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function namesLooselyMatch(a, b, opts) {
    if (typeof global.TransfermarktSync !== "undefined" && TransfermarktSync.namesLooselyMatch) {
      return TransfermarktSync.namesLooselyMatch(a, b, opts);
    }
    const na = toAsciiName(a).toLowerCase();
    const nb = toAsciiName(b).toLowerCase();
    return Boolean(na && nb && (na === nb || na.includes(nb) || nb.includes(na)));
  }

  function parseEventId(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    if (/^\d{4,}$/.test(s)) return s;
    const hashId = s.match(/[#&?]id=(\d{4,})/i) || s.match(/#id:(\d{4,})/i);
    if (hashId) return hashId[1];
    const eventPath = s.match(/\/(?:event|events)\/(?:football\/)?(\d{4,})/i);
    if (eventPath) return eventPath[1];
    const labeled = s.match(/\b(?:eventId|event_id|id)\s*[:=]\s*(\d{4,})/i);
    if (labeled) return labeled[1];
    const sofascoreTail = s.match(/sofascore\.com\/[^\s#]*#id:(\d{4,})/i);
    if (sofascoreTail) return sofascoreTail[1];
    return "";
  }

  async function fetchProxyText(url, label, timeoutMs = 55000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { cache: "no-store", signal: controller.signal });
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error(`${label} timed out — restart serve.bat and try again.`);
      }
      throw new Error("Cannot reach local SofaScore proxy — start serve.bat and open admin via http://127.0.0.1");
    } finally {
      clearTimeout(timer);
    }
    const body = await res.text();
    if (!res.ok) {
      let detail = body.trim();
      if (res.status === 404 || looksLikeHtml(detail) || /^404\b/i.test(detail)) {
        throw new Error(
          "SofaScore proxy missing — close the old serve.bat window, run serve.bat again, then reopen admin.",
        );
      }
      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed.error === "string") detail = parsed.error;
      } catch {
        /* plain text */
      }
      throw new Error(detail || `SofaScore fetch failed (${res.status})`);
    }
    return body;
  }

  async function fetchProxyJson(url, label, timeoutMs) {
    const body = await fetchProxyText(url, label, timeoutMs);
    if (looksLikeHtml(body) && !body.includes("{")) {
      throw new Error(
        "SofaScore proxy missing — restart serve.bat so /api/ss-lineups is available.",
      );
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  }

  function jerseyNumber(row) {
    const n = Number(row?.shirtNumber ?? row?.jerseyNumber ?? row?.player?.jerseyNumber);
    return Number.isFinite(n) && n > 0 ? n : "";
  }

  function isCaptainRow(row) {
    const player = row?.player || {};
    const flag = row?.captain ?? player.captain ?? row?.isCaptain ?? player.isCaptain;
    if (flag === true || flag === 1 || flag === "1") return true;
    if (typeof flag === "string" && /^(true|yes|c)$/i.test(flag)) return true;
    return false;
  }

  function mapRow(row) {
    const player = row?.player || {};
    return {
      name: toAsciiName(player.name || player.shortName || ""),
      shortName: toAsciiName(player.shortName || player.name || ""),
      number: jerseyNumber(row),
      captain: isCaptainRow(row),
      yellow: false,
      red: false,
      nationality: String(player.country?.name ?? "").trim(),
      position: String(row?.position || player.position || "").trim(),
      playerId: Number(player.id) || 0,
    };
  }

  function formationLines(formation) {
    return String(formation ?? "")
      .split("-")
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
  }

  /** SofaScore lists each line right-to-left; admin tags are left-to-right (GK, LB, CB, CB, RB…). */
  function mirrorFormationRows(players, formation) {
    const list = (players ?? []).slice(0, 11);
    if (list.length < 2) return list;
    const rows = formationLines(formation);
    const gk = list[0];
    const rest = list.slice(1);
    const out = [gk];
    let i = 0;
    for (const n of rows) {
      const band = rest.slice(i, i + n);
      if (band.length === n && n >= 2) out.push(...band.slice().reverse());
      else out.push(...band);
      i += n;
    }
    if (i < rest.length) out.push(...rest.slice(i));
    return out;
  }

  function roleLetter(player) {
    return String(player?.position || "").toUpperCase().charAt(0);
  }

  function sortLeftToRight(list) {
    return list.slice().sort((a, b) => (Number(b.ay) || 0) - (Number(a.ay) || 0));
  }

  function spliceAll(unused, chosen) {
    const set = new Set(chosen);
    for (let i = unused.length - 1; i >= 0; i--) {
      if (set.has(unused[i])) unused.splice(i, 1);
    }
  }

  function takeByLowestX(unused, n) {
    const chosen = unused
      .slice()
      .sort((a, b) => (Number(a.ax) || 0) - (Number(b.ax) || 0) || (Number(b.ay) || 0) - (Number(a.ay) || 0))
      .slice(0, n);
    spliceAll(unused, chosen);
    return sortLeftToRight(chosen);
  }

  function takeLastLine(unused, n) {
    const forwards = unused.filter((p) => roleLetter(p) === "F");
    const chosen = [];
    if (n === 1) {
      const f = forwards.slice().sort((a, b) => (Number(b.ax) || 0) - (Number(a.ax) || 0))[0];
      chosen.push(f || unused.slice().sort((a, b) => (Number(b.ax) || 0) - (Number(a.ax) || 0))[0]);
    } else if (n === 3 && forwards.length) {
      const striker = forwards.slice().sort((a, b) => (Number(b.ax) || 0) - (Number(a.ax) || 0))[0];
      const rest = unused
        .filter((p) => p !== striker)
        .sort((a, b) => (Number(b.ay) || 0) - (Number(a.ay) || 0));
      chosen.push(rest[0], striker, rest[1]);
    } else {
      const prefer = (forwards.length ? forwards : unused)
        .slice()
        .sort((a, b) => (Number(b.ax) || 0) - (Number(a.ax) || 0));
      chosen.push(...prefer.slice(0, n));
      if (chosen.length < n) {
        const extra = unused.filter((p) => !chosen.includes(p)).sort((a, b) => (Number(b.ax) || 0) - (Number(a.ax) || 0));
        chosen.push(...extra.slice(0, n - chosen.length));
      }
    }
    const picked = chosen.filter(Boolean).slice(0, n);
    spliceAll(unused, picked);
    return n === 3 && picked.length === 3 ? picked : sortLeftToRight(picked);
  }

  function assignToFormationSlots(players, formation) {
    const lines = formationLines(formation);
    const unused = players.filter((p) => Number.isFinite(p.ax) && Number.isFinite(p.ay));
    const leftovers = players.filter((p) => !unused.includes(p));
    if (unused.length < 8) return fallbackRoleOrder(players);

    const gkI = unused.findIndex((p) => roleLetter(p) === "G");
    const gk = gkI >= 0
      ? unused.splice(gkI, 1)[0]
      : unused.sort((a, b) => a.ax - b.ax).shift();
    const out = [gk];

    const lastN = lines.length ? lines[lines.length - 1] : 0;
    const lastLine = lastN > 0 ? takeLastLine(unused, lastN) : [];

    for (let li = 0; li < lines.length - 1; li++) {
      const n = lines[li];
      if (li === 0) {
        const defs = unused.filter((p) => roleLetter(p) === "D");
        const use = (defs.length >= n ? defs : unused)
          .slice()
          .sort((a, b) => a.ax - b.ax)
          .slice(0, n);
        spliceAll(unused, use);
        out.push(...sortLeftToRight(use));
        continue;
      }
      out.push(...takeByLowestX(unused, n));
    }
    out.push(...lastLine);
    return out.concat(unused, leftovers).slice(0, 11);
  }

  function indexAveragePositions(avgJson) {
    const map = new Map();
    const sides = [avgJson?.home, avgJson?.away];
    for (const list of sides) {
      for (const row of list ?? []) {
        const id = Number(row?.player?.id);
        const ax = Number(row?.averageX);
        const ay = Number(row?.averageY);
        if (!id || !Number.isFinite(ax) || !Number.isFinite(ay)) continue;
        map.set(id, { ax, ay });
        const name = toAsciiName(row?.player?.name || "").toLowerCase();
        if (name) map.set(`n:${name}`, { ax, ay });
      }
    }
    return map;
  }

  function attachAveragePoints(players, avgMap) {
    return players.map((p) => {
      const byId = p.playerId ? avgMap.get(p.playerId) : null;
      const byName = avgMap.get(`n:${String(p.name || "").toLowerCase()}`);
      const pt = byId || byName;
      return pt ? { ...p, ax: pt.ax, ay: pt.ay } : { ...p };
    });
  }

  function fallbackRoleOrder(players) {
    const rank = { G: 0, D: 1, M: 2, F: 3 };
    return players
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ra = rank[String(a.p.position || "").toUpperCase().charAt(0)] ?? 9;
        const rb = rank[String(b.p.position || "").toUpperCase().charAt(0)] ?? 9;
        return ra - rb || a.i - b.i;
      })
      .map(({ p }) => p);
  }

  function orderStarters(rows, formation, avgMap) {
    const withFp = rows
      .map((row, i) => ({ row, i, fp: Number(row?.formationPosition) }))
      .filter((x) => Number.isFinite(x.fp) && x.fp > 0);
    if (withFp.length >= 8) {
      const ordered = rows
        .map((row, i) => ({ row, i, fp: Number(row?.formationPosition) }))
        .sort((a, b) => {
          const aFp = Number.isFinite(a.fp) && a.fp > 0 ? a.fp : 999;
          const bFp = Number.isFinite(b.fp) && b.fp > 0 ? b.fp : 999;
          return aFp - bFp || a.i - b.i;
        })
        .map(({ row }) => row);
      return mirrorFormationRows(ordered.slice(0, 11).map(mapRow), formation);
    }
    const mapped = rows.slice(0, 11).map(mapRow);
    const withPts = attachAveragePoints(mapped, avgMap);
    const located = withPts.filter((p) => Number.isFinite(p.ax) && Number.isFinite(p.ay)).length;
    if (located >= 8) return assignToFormationSlots(withPts, formation);
    return fallbackRoleOrder(mapped);
  }

  function parseSidePlayers(side, avgMap) {
    const rows = Array.isArray(side?.players) ? side.players : [];
    const starters = rows.filter((row) => !row?.substitute);
    return orderStarters(starters, side?.formation, avgMap || new Map());
  }

  function parseLineupsJson(data, eventId, avgJson) {
    const home = data?.home || {};
    const away = data?.away || {};
    const avgMap = indexAveragePositions(avgJson);
    return {
      eventId: String(eventId || data?.eventId || ""),
      confirmed: Boolean(data?.confirmed),
      home: {
        formation: String(home.formation ?? "").trim(),
        teamName: String(home.team?.name || home.name || data?.homeTeam?.name || "").trim(),
        players: parseSidePlayers(home, avgMap),
      },
      away: {
        formation: String(away.formation ?? "").trim(),
        teamName: String(away.team?.name || away.name || data?.awayTeam?.name || "").trim(),
        players: parseSidePlayers(away, avgMap),
      },
    };
  }

  async function fetchAvgPositions(eventId) {
    try {
      return await fetchProxyJson(
        `/api/ss-avg-positions?eventId=${encodeURIComponent(eventId)}`,
        "SofaScore positions",
      );
    } catch {
      return null;
    }
  }

  async function fetchAndParseLineups(eventId) {
    const id = parseEventId(eventId) || String(eventId ?? "").trim();
    if (!/^\d{4,}$/.test(id)) throw new Error("Invalid SofaScore match id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "SofaScore lineup fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const [data, avgJson] = await Promise.all([
      fetchProxyJson(`/api/ss-lineups?eventId=${encodeURIComponent(id)}`, "SofaScore lineups"),
      fetchAvgPositions(id),
    ]);
    const parsed = parseLineupsJson(data, id, avgJson);
    if (!parsed.home.players.length && !parsed.away.players.length) {
      throw new Error(
        parsed.confirmed
          ? "Could not parse starting XIs from SofaScore."
          : "SofaScore has no starting XI yet for this match.",
      );
    }
    return parsed;
  }

  function incidentPlayerName(player) {
    if (!player || typeof player !== "object") return "";
    return toAsciiName(player.name || player.shortName || player.nickname || "");
  }

  function incidentAssistName(row) {
    const assist =
      row?.assist1 ||
      row?.assist ||
      row?.playerAssist ||
      (Array.isArray(row?.assists) ? row.assists[0] : null);
    if (!assist) return "";
    if (typeof assist === "string") return toAsciiName(assist);
    return incidentPlayerName(assist?.player || assist);
  }

  function isGoalIncident(row) {
    const type = String(row?.incidentType || row?.type || "").toLowerCase();
    return type === "goal" || type === "owngoal";
  }

  function isOwnGoalIncident(row) {
    const type = String(row?.incidentType || row?.type || "").toLowerCase();
    const cls = String(row?.incidentClass || "").toLowerCase();
    return type === "owngoal" || cls === "owngoal" || cls === "own_goal" || Boolean(row?.isOwnGoal);
  }

  function incidentMinute(row) {
    const base = Number(row?.time ?? row?.minute ?? row?.elapsed);
    const added = Number(row?.addedTime ?? row?.injuryTime ?? 0);
    if (!Number.isFinite(base) || base < 0) return 0;
    if (Number.isFinite(added) && added > 0) return base; // display minute stays base; extra time is rare in our schema
    return base;
  }

  function parseIncidentsJson(data) {
    const list = Array.isArray(data?.incidents)
      ? data.incidents
      : Array.isArray(data?.events)
        ? data.events
        : Array.isArray(data)
          ? data
          : [];
    const goals = [];
    for (const row of list) {
      if (!isGoalIncident(row)) continue;
      const scorer = incidentPlayerName(row?.player || row?.playerName) || toAsciiName(row?.playerName || "");
      if (!scorer) continue;
      const ownGoal = isOwnGoalIncident(row);
      const isHome = row?.isHome === true || row?.isHome === 1 || row?.side === 1 || row?.side === "home";
      const isAway =
        row?.isHome === false ||
        row?.isHome === 0 ||
        row?.side === 2 ||
        row?.side === "away" ||
        (!isHome && (row?.isHome != null || row?.side != null));
      let side = isAway && !isHome ? "away" : "home";
      // SofaScore own goals: scorer is on the team that conceded; keep side as the scoring side for the board.
      if (ownGoal && row?.isHome != null) {
        side = row.isHome ? "home" : "away";
      }
      const assist = ownGoal ? null : incidentAssistName(row) || null;
      const cls = String(row?.incidentClass || "").toLowerCase();
      let type = "goal";
      if (ownGoal) type = "og";
      else if (cls === "penalty" || cls === "penaltykick") type = "pen";
      goals.push({
        minute: incidentMinute(row),
        side,
        scorer,
        assist,
        type,
      });
    }
    goals.sort((a, b) => a.minute - b.minute || String(a.scorer).localeCompare(String(b.scorer)));
    return goals;
  }

  async function fetchAndParseIncidents(eventId) {
    const id = parseEventId(eventId) || String(eventId ?? "").trim();
    if (!/^\d{4,}$/.test(id)) throw new Error("Invalid SofaScore match id");
    if (!isLocalProxyHost()) {
      throw new Error(
        "SofaScore incidents fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const data = await fetchProxyJson(
      `/api/ss-incidents?eventId=${encodeURIComponent(id)}`,
      "SofaScore incidents",
    );
    return parseIncidentsJson(data);
  }

  async function fetchWeekEnrichment(eventIds, { lineups = true } = {}) {
    const ids = [...new Set((eventIds ?? []).map((id) => parseEventId(id) || String(id ?? "").trim()).filter((id) => /^\d{4,}$/.test(id)))].slice(
      0,
      20,
    );
    if (!ids.length) return [];
    if (!isLocalProxyHost()) {
      throw new Error(
        "SofaScore week enrich only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const lineupFlag = lineups ? "1" : "0";
    const data = await fetchProxyJson(
      `/api/ss-week-enrich?eventIds=${encodeURIComponent(ids.join(","))}&includeLineups=${lineupFlag}`,
      "SofaScore week enrich",
      Math.max(90000, ids.length * (lineups ? 70000 : 35000)),
    );
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows.map((row) => {
      const eventId = String(row?.eventId ?? "").trim();
      if (row?.error) {
        return { eventId, error: String(row.error), lineups: null, goalEvents: [] };
      }
      let lineups = null;
      try {
        if (row?.lineups) lineups = parseLineupsJson(row.lineups, eventId, null);
      } catch (err) {
        return {
          eventId,
          error: err?.message || "Could not parse lineups",
          lineups: null,
          goalEvents: parseIncidentsJson(row?.incidents),
        };
      }
      return {
        eventId,
        error: "",
        lineups,
        goalEvents: parseIncidentsJson(row?.incidents),
      };
    });
  }

  function matchRoundEventsToFixtures(events, fixtures, { leagueId } = {}) {
    return (fixtures ?? []).map((fix) => {
      const entity = pickEventForTeams(events, {
        homeName: fix.homeName,
        awayName: fix.awayName,
        time: fix.time,
        leagueId: leagueId || fix.leagueId,
        allowFuture: true,
      });
      const match = entity ? eventMatchesTeams(entity, fix.homeName, fix.awayName) : null;
      return {
        ...fix,
        sofaScoreEventId: entity?.id ? String(entity.id) : "",
        ssEntity: entity || null,
        swapped: Boolean(match?.swapped),
      };
    });
  }

  function parseSearchResults(data) {
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return rows
      .map((row) => (row?.entity && row?.type === "event" ? row.entity : row?.type === "event" ? row : row?.entity?.id ? row.entity : null))
      .filter((entity) => entity && entity.id && entity.homeTeam && entity.awayTeam);
  }

  async function fetchRoundEvents(leagueId, seasonYear, round) {
    const utid = UNIQUE_TOURNAMENT_IDS[String(leagueId ?? "").trim()];
    const year = Number(seasonYear);
    const rd = Number(round);
    if (!utid || !Number.isInteger(year) || year < 1990 || !Number.isInteger(rd) || rd <= 0) return [];
    if (!isLocalProxyHost()) {
      throw new Error(
        "SofaScore round fetch only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const data = await fetchProxyJson(
      `/api/ss-round?tournamentId=${encodeURIComponent(String(utid))}` +
        `&seasonYear=${encodeURIComponent(String(year))}` +
        `&round=${encodeURIComponent(String(rd))}`,
      "SofaScore round",
    );
    return Array.isArray(data?.events) ? data.events : [];
  }

  async function searchEvents(query) {
    const q = String(query ?? "").trim();
    if (!q) return [];
    if (!isLocalProxyHost()) {
      throw new Error(
        "SofaScore search only works on your computer with serve.bat (not on phone / GitHub Pages).",
      );
    }
    const data = await fetchProxyJson(
      `/api/ss-search?q=${encodeURIComponent(q.slice(0, 80))}`,
      "SofaScore search",
    );
    return parseSearchResults(data);
  }

  function uniqueTournamentId(entity) {
    return Number(
      entity?.tournament?.uniqueTournament?.id ?? entity?.uniqueTournament?.id ?? 0,
    );
  }

  function parseDayMonth(time) {
    const s = String(time ?? "").trim();
    const m = s.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*/i);
    if (!m) return null;
    const day = Number(m[1]);
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!day || !month) return null;
    return { day, month };
  }

  function eventMatchesTeams(entity, homeName, awayName) {
    const h = entity?.homeTeam?.name;
    const a = entity?.awayTeam?.name;
    const same = namesLooselyMatch(h, homeName) && namesLooselyMatch(a, awayName);
    const swapped = namesLooselyMatch(h, awayName) && namesLooselyMatch(a, homeName);
    return same || swapped ? { same: Boolean(same), swapped: Boolean(swapped) } : null;
  }

  function pickEventForTeams(events, { homeName, awayName, time, leagueId, allowFuture = false } = {}) {
    const wantUtid = UNIQUE_TOURNAMENT_IDS[String(leagueId ?? "").trim()] || 0;
    const hint = parseDayMonth(time);
    const now = Date.now();
    let best = null;
    let bestScore = -Infinity;
    for (const entity of events ?? []) {
      const match = eventMatchesTeams(entity, homeName, awayName);
      if (!match) continue;
      let score = 10;
      const utid = uniqueTournamentId(entity);
      if (wantUtid && utid === wantUtid) score += 80;
      const ts = Number(entity.startTimestamp);
      if (Number.isFinite(ts) && ts > 0) {
        const d = new Date(ts * 1000);
        if (hint && d.getUTCDate() === hint.day && d.getUTCMonth() + 1 === hint.month) score += 120;
        else if (hint && d.getDate() === hint.day && d.getMonth() + 1 === hint.month) score += 120;
        const days = Math.abs(d.getTime() - now) / 86400000;
        if (days <= 21) score += 40 - days;
        else if (days <= 180) score += 15 - days / 20;
        else score -= Math.min(40, days / 40);
        if (!allowFuture && d.getTime() > now + 12 * 3600 * 1000) score -= 80;
      }
      if (score > bestScore) {
        bestScore = score;
        best = entity;
      }
    }
    return best;
  }

  global.SofaScoreSync = {
    UNIQUE_TOURNAMENT_IDS,
    isLocalProxyHost,
    parseEventId,
    parseLineupsJson,
    parseIncidentsJson,
    fetchAndParseLineups,
    fetchAndParseIncidents,
    fetchWeekEnrichment,
    fetchRoundEvents,
    matchRoundEventsToFixtures,
    searchEvents,
    pickEventForTeams,
    namesLooselyMatch,
    toAsciiName,
  };
})(typeof window !== "undefined" ? window : globalThis);
