/**
 * Squad Central team id → Transfermarkt club id (verein).
 * Override per team with `transfermarktId` on the team object in data.json.
 */
(function (global) {
  /** @type {Record<string, number>} */
  const TRANSFERMARKT_CLUB_IDS = {
    // Premier League
    epl_arsenal: 11,
    epl_aston_villa: 405,
    epl_bournemouth: 989,
    epl_brentford: 1148,
    epl_brighton: 1237,
    epl_chelsea: 631,
    epl_coventry_city: 990,
    epl_crystal_palace: 873,
    epl_everton: 29,
    epl_fulham: 931,
    epl_hull_city: 300,
    epl_ipswich_town: 677,
    epl_leeds: 399,
    epl_liverpool: 31,
    epl_city: 281,
    epl_united: 985,
    epl_newcastle: 762,
    epl_nottingham: 703,
    epl_sunderland: 289,
    epl_tottenham: 148,

    // La Liga (incl. 2026-27 promoted: Málaga, Deportivo, Racing)
    laliga_alaves: 1108,
    laliga_athletic_bilbao: 621,
    laliga_atletico_madrid: 13,
    laliga_barcelona: 131,
    laliga_celta_vigo: 940,
    laliga_deportivo_a_coruna: 897,
    laliga_elche: 1531,
    laliga_espanyol: 714,
    laliga_getafe: 3709,
    laliga_girona: 12321,
    laliga_levante: 3368,
    laliga_malaga: 1084,
    laliga_mallorca: 237,
    laliga_osasuna: 331,
    laliga_racing_santander: 630,
    laliga_rayo_vallecano: 367,
    laliga_real_betis: 150,
    laliga_real_madrid: 418,
    laliga_real_oviedo: 2497,
    laliga_real_sociedad: 681,
    laliga_sevilla: 368,
    laliga_valencia: 1049,
    laliga_villarreal: 1050,

    // Serie A
    seriea_ac_milan: 5,
    seriea_as_roma: 12,
    seriea_atalanta: 800,
    seriea_bologna: 1025,
    seriea_cagliari: 1390,
    seriea_como: 1047,
    seriea_cremonese: 2239,
    seriea_fiorentina: 430,
    seriea_genoa: 252,
    seriea_hellas_verona: 276,
    seriea_inter: 46,
    seriea_juve: 506,
    seriea_lazio: 398,
    seriea_lecce: 1005,
    seriea_napoli: 6195,
    seriea_parma: 130,
    seriea_pisa: 4172,
    seriea_sassuolo: 6574,
    seriea_torino: 416,
    seriea_udinese: 410,

    // Bundesliga
    bundesliga_augsburg: 167,
    bundesliga_bayer_leverkusen: 15,
    bundesliga_bayern: 27,
    bundesliga_dortmund: 16,
    bundesliga_monchengladbach: 18,
    bundesliga_eintracht_frankfurt: 24,
    bundesliga_elversberg: 64,
    bundesliga_freiburg: 60,
    bundesliga_hamburg: 41,
    bundesliga_heidenheim: 2036,
    bundesliga_hoffenheim: 533,
    bundesliga_koln: 3,
    bundesliga_mainz: 39,
    bundesliga_paderborn: 127,
    bundesliga_rb_leipzig: 23826,
    bundesliga_schalke: 33,
    bundesliga_st_pauli: 35,
    bundesliga_stuttgart: 79,
    bundesliga_union_berlin: 89,
    bundesliga_werder_bremen: 86,
    bundesliga_wolfsburg: 82,

    // Ligue 1
    ligue1_angers: 1420,
    ligue1_as_monaco: 162,
    ligue1_auxerre: 290,
    ligue1_brest: 3911,
    ligue1_le_havre: 738,
    ligue1_le_mans: 1088,
    ligue1_lens: 826,
    ligue1_lille: 1082,
    ligue1_lorient: 1158,
    ligue1_lyon: 1041,
    ligue1_marseille: 244,
    ligue1_metz: 347,
    ligue1_nantes: 995,
    ligue1_nice: 417,
    ligue1_paris: 10004,
    ligue1_psg: 583,
    ligue1_rennes: 273,
    ligue1_strasbourg: 667,
    ligue1_toulouse: 415,
    ligue1_troyes: 1095,

    // Malaysia Super League
    msl_dpmm: 14320,
    msl_imigresen: 84287,
    msl_johor_dt: 15817,
    msl_kelantan_united: 77911,
    msl_kuala_lumpur: 36848,
    msl_kuching_city: 62736,
    msl_melaka: 106091,
    msl_negeri_sembilan: 12363,
    msl_pdrm: 21294,
    msl_penang: 27577,
    msl_sabah: 15630,
    msl_selangor: 15831,
    msl_terengganu: 15838,
  };

  global.TransfermarktTeams = {
    TRANSFERMARKT_CLUB_IDS,
    /** @deprecated use TRANSFERMARKT_CLUB_IDS */
    EPL_TRANSFERMARKT_CLUB_IDS: TRANSFERMARKT_CLUB_IDS,
    clubIdForTeam(team) {
      if (!team) return null;
      const fromTeam = Number(team.transfermarktId);
      if (Number.isFinite(fromTeam) && fromTeam > 0) return fromTeam;
      return TRANSFERMARKT_CLUB_IDS[team.id] ?? null;
    },
    hasMapping(team) {
      return this.clubIdForTeam(team) != null;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
