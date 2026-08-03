/**
 * Squad depth chart — up to 3 GK + 10 outfield slots × 2 players (partial picks allowed).
 */
(function (global) {
  const DEPTH_GK_COUNT = 3;
  const DEPTH_OUTFIELD_SLOTS = 10;
  const DEPTH_PLAYERS_PER_SLOT = 2;
  const DEPTH_CHART_SIZE = DEPTH_GK_COUNT + DEPTH_OUTFIELD_SLOTS * DEPTH_PLAYERS_PER_SLOT;

  /** Outfield slot tags left → right, back → front (GK is separate). */
  const FORMATION_SLOT_TEMPLATES = {
    "4-3-3": ["LB", "CB", "CB", "RB", "DM", "CM", "CM", "LW", "CF", "RW"],
    "4-4-2": ["LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "CF", "CF"],
    "4-2-3-1": ["LB", "CB", "CB", "RB", "CM", "CM", "LW", "AM", "RW", "CF"],
    "4-1-4-1": ["LB", "CB", "CB", "RB", "DM", "LW", "AM", "AM", "RW", "CF"],
    "3-5-2": ["CB", "CB", "CB", "LM", "DM", "CM", "CM", "RM", "CF", "CF"],
    "3-4-3": ["CB", "CB", "CB", "LM", "DM", "DM", "RM", "LW", "CF", "RW"],
    "3-4-2-1": ["CB", "CB", "CB", "LM", "DM", "DM", "RM", "AM", "AM", "CF"],
    "5-4-1": ["LB", "CB", "CB", "CB", "RB", "LM", "DM", "DM", "RM", "CF"],
    "5-3-2": ["LB", "CB", "CB", "CB", "RB", "CM", "DM", "CM", "CF", "CF"],
  };

  function parseFormationLines(formation) {
    return String(formation ?? "")
      .split(/[^0-9]+/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  function normalizeFormationKey(formation) {
    const lines = parseFormationLines(formation);
    return lines.length ? lines.join("-") : String(formation ?? "").trim();
  }

  function genericSlotTagsForFormation(formation) {
    const lines = parseFormationLines(formation);
    const sum = lines.reduce((a, b) => a + b, 0);
    if (!lines.length || sum !== DEPTH_OUTFIELD_SLOTS) {
      return ["LB", "CB", "CB", "RB", "DM", "DM", "LW", "AM", "RW", "ST"];
    }
    const tags = [];
    const lastIdx = lines.length - 1;
    for (let li = 0; li < lines.length; li++) {
      const n = lines[li];
      const isLast = li === lastIdx;
      const isFirst = li === 0;
      let row;
      if (n === 1) row = ["ST"];
      else if (n === 2) row = isLast ? ["ST", "CF"] : ["DM", "DM"];
      else if (n === 3) {
        if (isFirst) row = ["LCB", "CB", "RCB"];
        else if (isLast) row = ["LW", "ST", "RW"];
        else row = ["LM", "CM", "RM"];
      } else if (n === 4) row = ["LB", "CB", "CB", "RB"];
      else if (n === 5) row = ["LWB", "DM", "CM", "DM", "RWB"];
      else row = Array.from({ length: n }, (_, i) => `S${tags.length + i + 1}`);
      for (let i = 0; i < n; i++) tags.push(row[i] ?? `S${tags.length + 1}`);
    }
    return tags.slice(0, DEPTH_OUTFIELD_SLOTS);
  }

  function defaultSlotTagsForFormation(formation) {
    const key = normalizeFormationKey(formation);
    const template = FORMATION_SLOT_TEMPLATES[key];
    if (template?.length === DEPTH_OUTFIELD_SLOTS) return template.slice();
    return genericSlotTagsForFormation(formation);
  }

  function hasFormationTemplate(formation) {
    const key = normalizeFormationKey(formation);
    return Boolean(FORMATION_SLOT_TEMPLATES[key]);
  }

  function emptySquadDepth(formation) {
    const form = String(formation ?? "4-2-3-1").trim() || "4-2-3-1";
    const tags = defaultSlotTagsForFormation(form);
    return {
      formation: form,
      goalkeepers: Array(DEPTH_GK_COUNT).fill(""),
      slots: tags.map((tag) => ({ tag, players: ["", ""] })),
    };
  }

  function normalizeSquadDepth(raw, fallbackFormation) {
    const base = emptySquadDepth(raw?.formation || fallbackFormation || "4-2-3-1");
    if (!raw || typeof raw !== "object") return base;

    const formation = String(raw.formation ?? base.formation).trim() || base.formation;
    const tags = defaultSlotTagsForFormation(formation);
    const useTemplateTags = hasFormationTemplate(formation);
    const gks = Array.isArray(raw.goalkeepers) ? raw.goalkeepers.map(String) : [];
    const slotsIn = Array.isArray(raw.slots) ? raw.slots : [];

    return {
      formation,
      goalkeepers: Array.from({ length: DEPTH_GK_COUNT }, (_, i) => gks[i] ?? ""),
      slots: Array.from({ length: DEPTH_OUTFIELD_SLOTS }, (_, i) => {
        const slot = slotsIn[i] ?? {};
        const players = Array.isArray(slot.players) ? slot.players.map(String) : [];
        return {
          tag: useTemplateTags ? tags[i] : String(slot.tag ?? tags[i] ?? `S${i + 1}`),
          players: [players[0] ?? "", players[1] ?? ""],
        };
      }),
    };
  }

  function syncDepthFormation(depth, formation) {
    const next = normalizeSquadDepth(depth, formation);
    next.formation = formation;
    const tags = defaultSlotTagsForFormation(formation);
    next.slots = next.slots.map((slot, i) => ({
      tag: tags[i] ?? slot.tag,
      players: slot.players.slice(0, DEPTH_PLAYERS_PER_SLOT),
    }));
    while (next.slots.length < DEPTH_OUTFIELD_SLOTS) {
      next.slots.push({ tag: tags[next.slots.length] ?? "—", players: ["", ""] });
    }
    return next;
  }

  function depthPlayerIds(depth) {
    const ids = new Set();
    for (const id of depth.goalkeepers ?? []) {
      if (id) ids.add(id);
    }
    for (const slot of depth.slots ?? []) {
      for (const id of slot.players ?? []) {
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  function countDepthPlayers(depth) {
    return depthPlayerIds(depth).size;
  }

  function hasSquadDepthContent(depth) {
    return countDepthPlayers(depth) > 0;
  }

  /** Only blocks duplicate picks — partial charts (2 GK, 1 player per slot, etc.) are fine. */
  function validateSquadDepth(depth) {
    const errors = [];
    const ids = [];
    for (const id of depth.goalkeepers ?? []) {
      if (id) ids.push(id);
    }
    for (const slot of depth.slots ?? []) {
      for (const id of slot.players ?? []) {
        if (id) ids.push(id);
      }
    }
    const uniq = new Set(ids);
    if (uniq.size !== ids.length) errors.push("Each player can only appear once on the depth chart.");
    return { ok: errors.length === 0, errors, count: uniq.size };
  }

  function buildOutfieldRows(formation, slots) {
    const lines = parseFormationLines(formation);
    const sum = lines.reduce((a, b) => a + b, 0);
    if (!lines.length || sum !== DEPTH_OUTFIELD_SLOTS) {
      return [slots];
    }
    const rows = [];
    let idx = 0;
    for (const n of lines) {
      rows.push(centerDmInPitchRow(slots.slice(idx, idx + n)));
      idx += n;
    }
    return rows;
  }

  function isDmTag(tag) {
    const t = String(tag ?? "").toUpperCase();
    return t === "DM" || t === "CDM" || t === "DMF";
  }

  /** Place DM slot(s) in the middle of a pitch row (display only — slot data unchanged). */
  function centerDmInPitchRow(items, getTag = (x) => x?.tag) {
    if (!items?.length) return items;
    const dm = [];
    const rest = [];
    for (const item of items) {
      if (isDmTag(getTag(item))) dm.push(item);
      else rest.push(item);
    }
    if (!dm.length) return items.slice();

    const n = items.length;
    const out = Array(n).fill(null);
    const dmStart = Math.floor((n - dm.length) / 2);
    for (let i = 0; i < dm.length; i++) out[dmStart + i] = dm[i];

    let ri = 0;
    for (let i = 0; i < n; i++) {
      if (!out[i]) out[i] = rest[ri++];
    }
    return out;
  }

  function isSquadDepthComplete(depth) {
    return hasSquadDepthContent(depth);
  }

  function formationSlotSummary(formation) {
    const key = normalizeFormationKey(formation);
    const tags = defaultSlotTagsForFormation(formation);
    const counts = { GK: 1 };
    for (const t of tags) counts[t] = (counts[t] ?? 0) + 1;
    const posOrder = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "CF", "ST"];
    const parts = posOrder.filter((t) => counts[t]).map((t) => `${counts[t]} ${t}`);
    return { key, tags, label: parts.join(", ") };
  }

  function playerPosBlob(player) {
    return `${player?.pos ?? ""} ${player?.role ?? ""}`.toUpperCase().replace(/[./_-]+/g, " ");
  }

  function isGoalkeeperPlayer(player) {
    const blob = playerPosBlob(player);
    return /\bGK\b|\bG\.?K\.?\b|\bGOALKEEP/.test(blob);
  }

  /** Normalize position tags for matching (CAM→AM, ST→CF, etc.). */
  function canonicalPosTag(tag) {
    const t = String(tag ?? "").trim().toUpperCase();
    if (!t) return "";
    if (t === "GK" || t === "G") return "GK";
    if (t === "SW" || t === "RCB" || t === "LCB") return "CB";
    if (t === "RWB") return "RB";
    if (t === "LWB") return "LB";
    if (t === "CDM" || t === "DMF" || t === "ANC") return "DM";
    if (t === "CAM" || t === "OMF" || t === "RAM" || t === "LAM") return "AM";
    if (t === "RCM" || t === "LCM" || t === "MC") return "CM";
    if (t === "ST" || t === "SS" || t === "CFW" || t === "RF" || t === "LF") return "CF";
    if (t === "RMF") return "RM";
    if (t === "LMF") return "LM";
    return t;
  }

  function tagsLooselyMatch(a, b) {
    const ca = canonicalPosTag(a);
    const cb = canonicalPosTag(b);
    if (!ca || !cb) return false;
    if (ca === cb) return true;
    if ((ca === "CB" || ca === "LB" || ca === "RB") && (cb === "CB" || cb === "LB" || cb === "RB")) {
      return ca === "CB" || cb === "CB" ? ca === cb : false;
    }
    if ((ca === "CM" || ca === "DM" || ca === "AM") && (cb === "CM" || cb === "DM" || cb === "AM")) {
      return ca === "CM" || cb === "CM";
    }
    if ((ca === "LW" || ca === "LM") && (cb === "LW" || cb === "LM")) return true;
    if ((ca === "RW" || ca === "RM") && (cb === "RW" || cb === "RM")) return true;
    if ((ca === "CF" || ca === "ST") && (cb === "CF" || cb === "ST")) return true;
    return false;
  }

  /**
   * Score how well a roster player fits a depth-slot tag (higher is better).
   * 0 = no fit.
   */
  function scorePlayerForTag(tag, player) {
    if (!player?.id) return 0;
    const want = canonicalPosTag(tag);
    if (!want) return 0;
    if (isGoalkeeperPlayer(player)) return want === "GK" ? 100 : 0;

    const blob = playerPosBlob(player);
    const role = String(player.role ?? "").toUpperCase().trim();
    const pos = String(player.pos ?? "").toUpperCase().trim();
    let score = 0;

    if (role && canonicalPosTag(role) === want) score += 50;
    if (role && tagsLooselyMatch(role, want)) score += 30;
    if (blob.includes(` ${want} `) || blob.startsWith(`${want} `) || blob.endsWith(` ${want}`) || blob === want) {
      score += 40;
    }

    const isDf = /\bDF\b|\bDEF\b|\bBACK\b|\bCB\b|\bLB\b|\bRB\b|\bWB\b/.test(blob) || pos === "DF";
    const isMf = /\bMF\b|\bMID\b|\bCM\b|\bDM\b|\bAM\b|\bCDM\b|\bCAM\b/.test(blob) || pos === "MF";
    const isFw = /\bFW\b|\bATT\b|\bST\b|\bCF\b|\bWING\b|\bLW\b|\bRW\b/.test(blob) || pos === "FW";

    if (want === "CB" || want === "LB" || want === "RB") {
      if (isDf) score += 12;
      if (want === "LB" && /\bL\b|LEFT|LB|LWB/.test(blob)) score += 18;
      if (want === "RB" && /\bR\b|RIGHT|RB|RWB/.test(blob)) score += 18;
      if (want === "CB" && /\bCB\b|CENTR|CENTRE BACK|CENTER BACK/.test(blob)) score += 18;
    } else if (want === "DM" || want === "CM" || want === "AM" || want === "LM" || want === "RM") {
      if (isMf) score += 12;
      if (want === "DM" && /\bDM\b|CDM|DEFENSIVE MID/.test(blob)) score += 20;
      if (want === "AM" && /\bAM\b|CAM|ATTACKING MID|OMF/.test(blob)) score += 20;
      if (want === "LM" && /\bLM\b|LEFT MID|LMF/.test(blob)) score += 18;
      if (want === "RM" && /\bRM\b|RIGHT MID|RMF/.test(blob)) score += 18;
      if (want === "CM" && /\bCM\b|CENTRAL MID|MC\b/.test(blob)) score += 18;
    } else if (want === "LW" || want === "RW" || want === "CF") {
      if (isFw) score += 12;
      if (want === "LW" && /\bLW\b|LEFT W|LAM\b/.test(blob)) score += 20;
      if (want === "RW" && /\bRW\b|RIGHT W|RAM\b/.test(blob)) score += 20;
      if (want === "CF" && /\bST\b|\bCF\b|STRIKER|FORWARD|CENTRE F|CENTER F/.test(blob)) score += 20;
    }

    if (score > 0 && Number.isFinite(Number(player.number))) {
      /* Prefer regulars slightly (lower shirt numbers tend to be starters). */
      score += Math.max(0, 8 - Math.min(8, Number(player.number) / 5));
    }
    return score;
  }

  function sortRosterForPicks(a, b) {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  }

  /** Clear picks, keep formation/tags. */
  function clearDepthPicks(depth) {
    const next = normalizeSquadDepth(depth);
    next.goalkeepers = Array(DEPTH_GK_COUNT).fill("");
    next.slots = next.slots.map((s) => ({ tag: s.tag, players: ["", ""] }));
    return next;
  }

  /**
   * Auto-place roster players into depth slots by pos/role heuristics.
   * @param {{ replaceExisting?: boolean }} opts — default replace all picks.
   */
  function autoFillDepthFromRoster(depth, roster, opts = {}) {
    const replaceExisting = opts.replaceExisting !== false;
    const next = replaceExisting ? clearDepthPicks(depth) : normalizeSquadDepth(depth);
    const used = depthPlayerIds(next);
    const list = Array.isArray(roster) ? roster.filter((p) => p?.id) : [];

    const freeGks = list.filter((p) => isGoalkeeperPlayer(p) && !used.has(p.id)).sort(sortRosterForPicks);
    let gi = 0;
    for (let i = 0; i < DEPTH_GK_COUNT; i++) {
      if (next.goalkeepers[i]) continue;
      while (gi < freeGks.length && used.has(freeGks[gi].id)) gi++;
      if (gi >= freeGks.length) break;
      next.goalkeepers[i] = freeGks[gi].id;
      used.add(freeGks[gi].id);
      gi++;
    }

    for (const pass of [0, 1]) {
      for (let si = 0; si < next.slots.length; si++) {
        if (next.slots[si].players[pass]) continue;
        const tag = next.slots[si].tag;
        let best = null;
        let bestScore = 0;
        for (const p of list) {
          if (used.has(p.id) || isGoalkeeperPlayer(p)) continue;
          const score = scorePlayerForTag(tag, p);
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
        const minScore = pass === 0 ? 12 : 18;
        if (best && bestScore >= minScore) {
          next.slots[si].players[pass] = best.id;
          used.add(best.id);
        }
      }
    }
    return next;
  }

  /**
   * Map a match XI (lineup slots with tag + player) into depth starters.
   * @param {Array<{ id?: string, tag?: string, pos?: string, name?: string, number?: * }>} lineupSlots
   * @param {(slot: object) => object|null|undefined} resolvePlayer
   */
  function seedDepthFromLineup(depth, lineupSlots, resolvePlayer) {
    const next = clearDepthPicks(depth);
    const used = new Set();
    const slots = Array.isArray(lineupSlots) ? lineupSlots : [];

    for (const slot of slots) {
      const player = typeof resolvePlayer === "function" ? resolvePlayer(slot) : null;
      if (!player?.id || used.has(player.id)) continue;

      const rawTag = String(slot?.tag ?? slot?.pos ?? "").trim();
      const tag = canonicalPosTag(rawTag) || (isGoalkeeperPlayer(player) ? "GK" : "");

      if (tag === "GK" || isGoalkeeperPlayer(player)) {
        const gkIdx = next.goalkeepers.findIndex((id) => !id);
        if (gkIdx >= 0) {
          next.goalkeepers[gkIdx] = player.id;
          used.add(player.id);
        }
        continue;
      }

      let idx = next.slots.findIndex((s) => !s.players[0] && tagsLooselyMatch(s.tag, tag || s.tag));
      if (idx < 0 && tag) {
        idx = next.slots.findIndex((s) => !s.players[0] && canonicalPosTag(s.tag) === tag);
      }
      if (idx < 0) {
        idx = next.slots.findIndex((s) => !s.players[0]);
      }
      if (idx >= 0) {
        next.slots[idx].players[0] = player.id;
        used.add(player.id);
      }
    }
    return next;
  }

  global.SquadDepth = {
    DEPTH_GK_COUNT,
    DEPTH_OUTFIELD_SLOTS,
    DEPTH_PLAYERS_PER_SLOT,
    DEPTH_CHART_SIZE,
    FORMATION_SLOT_TEMPLATES,
    parseFormationLines,
    normalizeFormationKey,
    defaultSlotTagsForFormation,
    hasFormationTemplate,
    formationSlotSummary,
    emptySquadDepth,
    normalizeSquadDepth,
    syncDepthFormation,
    depthPlayerIds,
    countDepthPlayers,
    hasSquadDepthContent,
    validateSquadDepth,
    buildOutfieldRows,
    centerDmInPitchRow,
    isDmTag,
    isSquadDepthComplete,
    playerPosBlob,
    isGoalkeeperPlayer,
    canonicalPosTag,
    tagsLooselyMatch,
    scorePlayerForTag,
    clearDepthPicks,
    autoFillDepthFromRoster,
    seedDepthFromLineup,
  };
})(typeof window !== "undefined" ? window : globalThis);
