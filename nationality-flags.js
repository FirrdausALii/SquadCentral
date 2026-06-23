/**
 * Nationality → flag emoji lookup for admin (and optional site use).
 * Learns from existing players with flags set in app.js / data.json.
 */
(function (global) {
  const UK_ENGLAND = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
  const UK_SCOTLAND = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
  const UK_WALES = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}";

  const BASE = {
    Afghanistan: "🇦🇫",
    Albania: "🇦🇱",
    Algeria: "🇩🇿",
    Argentina: "🇦🇷",
    Armenia: "🇦🇲",
    Australia: "🇦🇺",
    Austria: "🇦🇹",
    Belgium: "🇧🇪",
    Bolivia: "🇧🇴",
    "Bosnia and Herzegovina": "🇧🇦",
    Brazil: "🇧🇷",
    Bulgaria: "🇧🇬",
    "Burkina Faso": "🇧🇫",
    Cameroon: "🇨🇲",
    Canada: "🇨🇦",
    Chile: "🇨🇱",
    China: "🇨🇳",
    Colombia: "🇨🇴",
    "Costa Rica": "🇨🇷",
    Croatia: "🇭🇷",
    "Côte d'Ivoire": "🇨🇮",
    "Ivory Coast": "🇨🇮",
    Curacao: "🇨🇼",
    Curaçao: "🇨🇼",
    Cyprus: "🇨🇾",
    "Czech Republic": "🇨🇿",
    Czechia: "🇨🇿",
    "Democratic Republic of the Congo": "🇨🇩",
    "DR Congo": "🇨🇩",
    Denmark: "🇩🇰",
    Ecuador: "🇪🇨",
    Egypt: "🇪🇬",
    England: UK_ENGLAND,
    Estonia: "🇪🇪",
    Finland: "🇫🇮",
    France: "🇫🇷",
    Gabon: "🇬🇦",
    Gambia: "🇬🇲",
    Georgia: "🇬🇪",
    Germany: "🇩🇪",
    Ghana: "🇬🇭",
    Greece: "🇬🇷",
    Guinea: "🇬🇳",
    Haiti: "🇭🇹",
    Honduras: "🇭🇳",
    Hungary: "🇭🇺",
    Iceland: "🇮🇸",
    India: "🇮🇳",
    Indonesia: "🇮🇩",
    Iran: "🇮🇷",
    Iraq: "🇮🇶",
    Ireland: "🇮🇪",
    Israel: "🇮🇱",
    Italy: "🇮🇹",
    Jamaica: "🇯🇲",
    Japan: "🇯🇵",
    Jordan: "🇯🇴",
    Kazakhstan: "🇰🇿",
    Kenya: "🇰🇪",
    Kosovo: "🇽🇰",
    Latvia: "🇱🇻",
    Lithuania: "🇱🇹",
    Luxembourg: "🇱🇺",
    Malaysia: "🇲🇾",
    Mali: "🇲🇱",
    Malta: "🇲🇹",
    Mexico: "🇲🇽",
    Moldova: "🇲🇩",
    Montenegro: "🇲🇪",
    Morocco: "🇲🇦",
    Mozambique: "🇲🇿",
    Netherlands: "🇳🇱",
    "New Zealand": "🇳🇿",
    Nigeria: "🇳🇬",
    "North Macedonia": "🇲🇰",
    "Northern Ireland": "🇬🇧",
    Norway: "🇳🇴",
    Paraguay: "🇵🇾",
    Peru: "🇵🇪",
    Poland: "🇵🇱",
    Portugal: "🇵🇹",
    Qatar: "🇶🇦",
    Romania: "🇷🇴",
    Russia: "🇷🇺",
    "Saudi Arabia": "🇸🇦",
    Scotland: UK_SCOTLAND,
    Senegal: "🇸🇳",
    Serbia: "🇷🇸",
    Slovakia: "🇸🇰",
    Slovenia: "🇸🇮",
    "South Africa": "🇿🇦",
    "South Korea": "🇰🇷",
    Korea: "🇰🇷",
    Spain: "🇪🇸",
    Sweden: "🇸🇪",
    Switzerland: "🇨🇭",
    Syria: "🇸🇾",
    Tunisia: "🇹🇳",
    Turkey: "🇹🇷",
    Türkiye: "🇹🇷",
    "United Arab Emirates": "🇦🇪",
    Uganda: "🇺🇬",
    Ukraine: "🇺🇦",
    Uruguay: "🇺🇾",
    USA: "🇺🇸",
    "United States": "🇺🇸",
    Venezuela: "🇻🇪",
    Vietnam: "🇻🇳",
    Wales: UK_WALES,
    Zambia: "🇿🇲",
    Zimbabwe: "🇿🇼",
  };

  /** ISO 3166-1 codes for flagcdn.com (works on Windows, Android, all browsers). */
  const ISO_CODES = {
    Afghanistan: "af",
    Albania: "al",
    Algeria: "dz",
    Argentina: "ar",
    Armenia: "am",
    Australia: "au",
    Austria: "at",
    Belgium: "be",
    Bolivia: "bo",
    "Bosnia and Herzegovina": "ba",
    Brazil: "br",
    Bulgaria: "bg",
    "Burkina Faso": "bf",
    Cameroon: "cm",
    Canada: "ca",
    "Cape Verde": "cv",
    Chile: "cl",
    China: "cn",
    Colombia: "co",
    "Costa Rica": "cr",
    Croatia: "hr",
    "Côte d'Ivoire": "ci",
    "Ivory Coast": "ci",
    Curacao: "cw",
    Curaçao: "cw",
    Cyprus: "cy",
    "Czech Republic": "cz",
    Czechia: "cz",
    "Democratic Republic of the Congo": "cd",
    "DR Congo": "cd",
    Denmark: "dk",
    Ecuador: "ec",
    Egypt: "eg",
    England: "gb-eng",
    Estonia: "ee",
    Finland: "fi",
    France: "fr",
    Gabon: "ga",
    Gambia: "gm",
    Georgia: "ge",
    Germany: "de",
    Ghana: "gh",
    Greece: "gr",
    Guinea: "gn",
    "Guinea-Bissau": "gw",
    Haiti: "ht",
    Honduras: "hn",
    Hungary: "hu",
    Iceland: "is",
    India: "in",
    Indonesia: "id",
    Iran: "ir",
    Iraq: "iq",
    Ireland: "ie",
    Israel: "il",
    Italy: "it",
    Jamaica: "jm",
    Japan: "jp",
    Jordan: "jo",
    Kazakhstan: "kz",
    Kenya: "ke",
    Kosovo: "xk",
    Latvia: "lv",
    Lithuania: "lt",
    Luxembourg: "lu",
    Malaysia: "my",
    Mali: "ml",
    Malta: "mt",
    Mexico: "mx",
    Moldova: "md",
    Montenegro: "me",
    Morocco: "ma",
    Mozambique: "mz",
    Netherlands: "nl",
    "New Zealand": "nz",
    Nigeria: "ng",
    "North Macedonia": "mk",
    "Northern Ireland": "gb-nir",
    Norway: "no",
    Paraguay: "py",
    Peru: "pe",
    Poland: "pl",
    Portugal: "pt",
    Qatar: "qa",
    Romania: "ro",
    Russia: "ru",
    "Saudi Arabia": "sa",
    Scotland: "gb-sct",
    Senegal: "sn",
    Serbia: "rs",
    Slovakia: "sk",
    Slovenia: "si",
    "South Africa": "za",
    "South Korea": "kr",
    Korea: "kr",
    Spain: "es",
    Sweden: "se",
    Switzerland: "ch",
    Syria: "sy",
    Tunisia: "tn",
    Turkey: "tr",
    Türkiye: "tr",
    "United Arab Emirates": "ae",
    Uganda: "ug",
    Ukraine: "ua",
    Uruguay: "uy",
    USA: "us",
    "United States": "us",
    Venezuela: "ve",
    Vietnam: "vn",
    Wales: "gb-wls",
    Zambia: "zm",
    Zimbabwe: "zw",
  };

  const learned = Object.create(null);
  const learnedLabels = Object.create(null);

  function normalize(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  const ALIASES = {
    "dr congo": "democratic republic of the congo",
    drc: "democratic republic of the congo",
    "dem rep congo": "democratic republic of the congo",
    "republic of ireland": "ireland",
    "south korea": "korea",
    "korea republic": "korea",
    "korea south": "korea",
    usa: "united states",
    uae: "united arab emirates",
    "cote d'ivoire": "ivory coast",
    "côte d'ivoire": "ivory coast",
    turkiye: "turkey",
    "north macedonia": "north macedonia",
    bosnia: "bosnia and herzegovina",
    "guinea bissau": "guinea-bissau",
    "cape verde": "cape verde",
  };

  function resolveNationalityKey(nationality) {
    const key = normalize(nationality);
    if (!key) return "";
    return ALIASES[key] ?? key;
  }

  function ukFlagForKey(key) {
    if (key === "england") return UK_ENGLAND;
    if (key === "scotland") return UK_SCOTLAND;
    if (key === "wales") return UK_WALES;
    if (key === "northern ireland" || key === "north ireland") return "🇬🇧";
    return "";
  }

  function learnFromPlayers(players) {
    for (const p of players ?? []) {
      const nat = String(p.nationality ?? "").trim();
      const flag = String(p.flag ?? "").trim();
      if (nat && flag) {
        const key = normalize(nat);
        learned[key] = flag;
        learnedLabels[key] = nat;
      }
    }
  }

  function getFlag(nationality) {
    const key = resolveNationalityKey(nationality);
    if (!key) return "";
    const uk = ukFlagForKey(key);
    if (uk) return uk;
    if (learned[key]) return learned[key];
    for (const [name, flag] of Object.entries(BASE)) {
      if (normalize(name) === key) return flag;
    }
    return "";
  }

  function getIsoCode(nationality) {
    const key = resolveNationalityKey(nationality);
    if (!key) return "";
    for (const [name, code] of Object.entries(ISO_CODES)) {
      if (normalize(name) === key) return code;
    }
    return "";
  }

  function getFlagImageUrl(nationality, width = 40) {
    const iso = getIsoCode(nationality);
    if (!iso) return "";
    const w = Math.max(20, Math.min(160, Number(width) || 40));
    return `https://flagcdn.com/w${w}/${iso}.png`;
  }

  function listNationalities() {
    const names = new Set(Object.keys(BASE));
    for (const key of Object.keys(learned)) {
      names.add(learnedLabels[key] || key);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  global.NationalityFlags = {
    BASE,
    ISO_CODES,
    getFlag,
    getIsoCode,
    getFlagImageUrl,
    learnFromPlayers,
    listNationalities,
    normalize,
  };
})(typeof window !== "undefined" ? window : globalThis);
