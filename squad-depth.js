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
  };
})(typeof window !== "undefined" ? window : globalThis);
