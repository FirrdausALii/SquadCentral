/**
 * National duty — club players away with their national team.
 */
(function (global) {
  function normalizeEntry(entry) {
    return {
      playerId: String(entry?.playerId ?? "").trim(),
      country: String(entry?.country ?? "").trim(),
      note: String(entry?.note ?? "").trim(),
      until: String(entry?.until ?? "").trim(),
    };
  }

  function normalizeNationalDuty(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      const e = normalizeEntry(item);
      if (!e.playerId || seen.has(e.playerId)) continue;
      seen.add(e.playerId);
      out.push(e);
    }
    return out;
  }

  function validateNationalDuty(entries, rosterIds) {
    const roster = new Set(rosterIds ?? []);
    const errors = [];
    for (const e of entries) {
      if (!e.playerId) continue;
      if (!roster.has(e.playerId)) errors.push("Each player must be on the club squad.");
      if (!e.country) errors.push("Country is required for each player on duty.");
    }
    return { ok: errors.length === 0, errors };
  }

  function dutyPlayerIds(entries) {
    return new Set(normalizeNationalDuty(entries).map((e) => e.playerId));
  }

  global.NationalDuty = {
    normalizeEntry,
    normalizeNationalDuty,
    validateNationalDuty,
    dutyPlayerIds,
  };
})(typeof window !== "undefined" ? window : globalThis);
