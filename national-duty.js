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

  /** Keep only YYYY-MM-DD for league window compare. */
  function normalizeIsoDate(value) {
    const s = String(value ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return "";
  }

  function normalizeWindow(raw) {
    if (!raw || typeof raw !== "object") {
      return { from: "", until: "" };
    }
    return {
      from: normalizeIsoDate(raw.from ?? raw.nationalDutyFrom),
      until: normalizeIsoDate(raw.until ?? raw.nationalDutyUntil),
    };
  }

  function localYmd(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /**
   * Active when today is inside the league window (inclusive, local calendar day).
   * Both empty → inactive (live must set a window before showing duty).
   */
  function isNationalDutyWindowActive(window, now = new Date()) {
    const { from, until } = normalizeWindow(window);
    if (!from && !until) return false;
    const today = localYmd(now);
    if (!today) return false;
    if (from && today < from) return false;
    if (until && today > until) return false;
    return true;
  }

  function windowStatus(window, now = new Date()) {
    const normalized = normalizeWindow(window);
    if (!normalized.from && !normalized.until) {
      return { key: "missing", label: "Missing dates", active: false, window: normalized };
    }
    const active = isNationalDutyWindowActive(normalized, now);
    return {
      key: active ? "active" : "inactive",
      label: active ? "Active now" : "Not active",
      active,
      window: normalized,
    };
  }

  global.NationalDuty = {
    normalizeEntry,
    normalizeNationalDuty,
    validateNationalDuty,
    dutyPlayerIds,
    normalizeIsoDate,
    normalizeWindow,
    isNationalDutyWindowActive,
    windowStatus,
    localYmd,
  };
})(typeof window !== "undefined" ? window : globalThis);
