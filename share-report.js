/**
 * Multi-page Squad Central share reports — Transfers, Squads, Squad Depth.
 * Fixed 1080×1350 (or landscape depth) canvases, independent of the device viewport.
 */
(function (global) {
  const W = 1080;
  const H = 1350;
  const M = 48;
  const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const DISPLAY = "'Barlow Condensed', 'Inter', system-ui, sans-serif";

  const THEME = {
    page: "#0b1120",
    page2: "#070b14",
    surface: "#10192a",
    surface2: "#152033",
    border: "#24344c",
    text: "#e8f0f8",
    muted: "#8aa4c0",
    faint: "#5d7896",
    accent: "#378ADD",
    accentDim: "rgba(55, 138, 221, 0.16)",
    gold: "#facc15",
  };

  const POS_GROUPS = [
    { key: "GK", label: "GOALKEEPERS" },
    { key: "DF", label: "DEFENDERS" },
    { key: "MF", label: "MIDFIELDERS" },
    { key: "FW", label: "FORWARDS" },
  ];

  const TRANSFER_META = {
    in: { title: "Incoming transfers", clubPrefix: "From", showFee: true, color: "#4ade80" },
    out: { title: "Outgoing transfers", clubPrefix: "To", showFee: true, color: "#7dd3fc" },
    promoted: { title: "Promoted", clubPrefix: "", showFee: false, color: "#2dd4bf" },
    loanReturn: { title: "Loan returns", clubPrefix: "From", showFee: false, color: "#fbbf24" },
    loanRecall: { title: "Recalled", clubPrefix: "From", showFee: false, color: "#c084fc" },
  };

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function truncateText(ctx, text, maxWidth) {
    const s = String(text ?? "");
    if (ctx.measureText(s).width <= maxWidth) return s;
    let out = s;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
  }

  function fileToken(text) {
    return (
      String(text ?? "")
        .replace(/[^\w.-]+/g, "")
        .replace(/^[-.]+|[-.]+$/g, "") || "Club"
    );
  }

  function reportFilename({ club, kind, season, page, total }) {
    const base = `SquadCentral_${fileToken(club)}_${fileToken(kind)}_${fileToken(season || "Season")}`;
    return total > 1 ? `${base}_P${page}.png` : `${base}.png`;
  }

  function stripCaptain(name) {
    return String(name ?? "")
      .replace(/\s*\([Cc]\)\s*$/, "")
      .trim();
  }

  function isCaptainPlayer(p) {
    if (!p) return false;
    if (p.captain) return true;
    return /\s*\([Cc]\)\s*$/.test(String(p.name ?? "").trim());
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png");
    });
  }

  function makeCanvas(w = W, h = H) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    return { canvas, ctx, w, h };
  }

  function drawReportBg(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, THEME.page);
    g.addColorStop(1, THEME.page2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.18, 80, 20, w * 0.18, 80, 420);
    glow.addColorStop(0, "rgba(55, 138, 221, 0.16)");
    glow.addColorStop(1, "rgba(55, 138, 221, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCrest(ctx, img, cx, cy, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = THEME.surface2;
    ctx.fill();
    ctx.clip();
    if (img) {
      const s = Math.min(img.width, img.height) || 1;
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawFlag(ctx, img, x, y, fw = 28, fh = 20) {
    roundRect(ctx, x, y, fw, fh, 3);
    ctx.save();
    ctx.clip();
    if (img) ctx.drawImage(img, x, y, fw, fh);
    else {
      ctx.fillStyle = THEME.surface2;
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, fw, fh, 3);
    ctx.stroke();
  }

  const HEADER_H = 188;
  const FOOTER_H = 72;

  function contentBox(w = W, h = H) {
    const headerY = M;
    const footerY = h - M - FOOTER_H;
    const bodyY = headerY + HEADER_H + 18;
    const bodyH = footerY - bodyY - 16;
    return {
      headerY,
      footerY,
      bodyY,
      bodyH,
      innerX: M + 28,
      innerW: w - M * 2 - 56,
      innerRight: M + w - M * 2 - 28,
      w,
      h,
    };
  }

  function drawReportHeader(ctx, box, {
    teamLogo,
    teamName,
    kicker,
    title,
    subtitle,
    rightLabel,
    rightValue,
  }) {
    const { headerY, w } = box;
    roundRect(ctx, M, headerY, w - M * 2, HEADER_H, 22);
    ctx.fillStyle = THEME.surface;
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const crest = 92;
    const cx = M + 36 + crest / 2;
    const cy = headerY + HEADER_H / 2;
    drawCrest(ctx, teamLogo, cx, cy, crest);

    const textX = M + 36 + crest + 22;
    const textMax = w - textX - M - 140;
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(truncateText(ctx, String(kicker ?? "").toUpperCase(), textMax), textX, headerY + 48);
    ctx.fillStyle = THEME.text;
    ctx.font = `700 46px ${DISPLAY}`;
    ctx.fillText(truncateText(ctx, teamName ?? "Club", textMax), textX, headerY + 98);
    ctx.fillStyle = THEME.accent;
    ctx.font = `700 22px ${DISPLAY}`;
    ctx.fillText(truncateText(ctx, String(title ?? "").toUpperCase(), textMax), textX, headerY + 132);
    ctx.fillStyle = THEME.muted;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(truncateText(ctx, subtitle ?? "", textMax), textX, headerY + 162);

    if (rightValue != null) {
      ctx.textAlign = "right";
      ctx.fillStyle = THEME.text;
      ctx.font = `700 40px ${DISPLAY}`;
      ctx.fillText(String(rightValue), w - M - 32, headerY + 92);
      ctx.fillStyle = THEME.faint;
      ctx.font = `700 13px ${FONT}`;
      ctx.fillText(String(rightLabel ?? "").toUpperCase(), w - M - 32, headerY + 120);
    }
  }

  function drawReportFooter(ctx, box, { brandLogo, page, total }) {
    const { footerY, w } = box;
    roundRect(ctx, M, footerY, w - M * 2, FOOTER_H, 16);
    ctx.fillStyle = "#080d18";
    ctx.fill();

    const cy = footerY + FOOTER_H / 2;
    ctx.textBaseline = "middle";
    if (brandLogo) {
      ctx.drawImage(brandLogo, M + 24, cy - 16, 32, 32);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.text;
    ctx.font = `700 20px ${DISPLAY}`;
    ctx.fillText("SQUAD CENTRAL", M + (brandLogo ? 66 : 28), cy);

    ctx.textAlign = "right";
    ctx.fillStyle = THEME.muted;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(total > 1 ? `${page} / ${total}` : "squadcentral", w - M - 28, cy);
    ctx.textBaseline = "alphabetic";
  }

  /**
   * Split sections into pages. Keeps a player row intact and prefers not to
   * break groups smaller than `keepTogether` when they still fit on a fresh page.
   */
  function paginateSections(sections, { maxBody, headerH, rowH, gap = 16, keepTogether = 4 }) {
    const pages = [];
    let units = [];
    let used = 0;

    const flush = () => {
      if (units.length) pages.push(units);
      units = [];
      used = 0;
    };

    for (const section of sections) {
      const items = section.items ?? [];
      if (!items.length) continue;
      let offset = 0;
      while (offset < items.length) {
        const remaining = items.length - offset;
        const fullH = headerH + remaining * rowH + (units.length ? gap : 0);
        const fitsAll = used + fullH <= maxBody;
        const startingSection = offset === 0;
        const leftoverTooTight = maxBody - used < headerH + rowH * 3;
        if (!fitsAll && units.length && (startingSection || leftoverTooTight || remaining <= keepTogether)) {
          flush();
          continue;
        }
        const space = maxBody - used - (units.length ? gap : 0) - headerH;
        const take = Math.max(1, Math.min(remaining, Math.floor(space / rowH)));
        units.push({
          ...section,
          items: items.slice(offset, offset + take),
          continued: offset > 0,
          gapBefore: units.length ? gap : 0,
          height: headerH + take * rowH,
        });
        used += (units.length > 1 ? gap : 0) + headerH + take * rowH;
        offset += take;
        if (offset < items.length) flush();
      }
    }
    flush();
    return pages.filter((p) => p.length);
  }

  async function loadFlagMap(nationalities) {
    const map = new Map();
    const unique = [...new Set((nationalities ?? []).map((n) => String(n ?? "").trim()).filter(Boolean))];
    await Promise.all(
      unique.map(async (nat) => {
        const url =
          typeof NationalityFlags !== "undefined" ? NationalityFlags.getFlagImageUrl(nat) : "";
        map.set(nat, url ? await loadImage(url) : null);
      }),
    );
    return map;
  }

  function startPage(assets, header, size) {
    const { canvas, ctx, w, h } = makeCanvas(size?.w || W, size?.h || H);
    const box = contentBox(w, h);
    drawReportBg(ctx, w, h);
    drawReportHeader(ctx, box, { ...header, teamLogo: assets.teamLogo });
    return { canvas, ctx, box, w, h };
  }

  function finishPage(ctx, box, assets, page, total) {
    drawReportFooter(ctx, box, { brandLogo: assets.brandLogo, page, total });
  }

  async function loadReportAssets(team, logoSrc = "./logo.png") {
    const [teamLogo, brandLogo] = await Promise.all([loadImage(team?.logo), loadImage(logoSrc)]);
    return { teamLogo, brandLogo };
  }

  function wrapPages(canvases, { club, kind, season }) {
    const total = canvases.length || 1;
    return canvases.map((canvas, i) => ({
      canvas,
      filename: reportFilename({ club, kind, season, page: i + 1, total }),
    }));
  }

  function drawSectionTitle(ctx, x, y, title, count, color, width) {
    ctx.textAlign = "left";
    ctx.fillStyle = color || THEME.accent;
    ctx.font = `700 18px ${DISPLAY}`;
    ctx.fillText(String(title).toUpperCase(), x, y + 22);
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(String(count), x + width, y + 22);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(x, y + 34);
    ctx.lineTo(x + width, y + 34);
    ctx.stroke();
    return 44;
  }

  async function renderTransfersSharePages(options) {
    const {
      team,
      leagueName = "",
      windowLabel = "Summer",
      season = "",
      panels = [],
      logoSrc = "./logo.png",
    } = options;
    const assets = await loadReportAssets(team, logoSrc);
    const active = (panels ?? [])
      .map((p) => ({
        key: p.key,
        meta: TRANSFER_META[p.key] ?? { title: p.label || p.key, clubPrefix: "", showFee: false, color: THEME.muted },
        items: p.items ?? [],
      }))
      .filter((p) => p.items.length);

    const header = {
      teamName: team?.name,
      kicker: [leagueName, season].filter(Boolean).join("  ·  "),
      title: "Transfer report",
      subtitle: `${windowLabel} window`,
      rightLabel: "Moves",
      rightValue: active.reduce((n, p) => n + p.items.length, 0),
    };

    if (!active.length) {
      const page = startPage(assets, header);
      const { ctx, box } = page;
      ctx.fillStyle = THEME.muted;
      ctx.font = `600 26px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("No transfers recorded", box.w / 2, box.bodyY + box.bodyH / 2);
      finishPage(ctx, box, assets, 1, 1);
      return wrapPages([page.canvas], { club: team?.name, kind: "Transfers", season });
    }

    const ROW_H = 58;
    const HEADER_SEC = 44;
    const box0 = contentBox();
    const pages = paginateSections(
      active.map((p) => ({
        key: p.key,
        title: p.meta.title,
        color: p.meta.color,
        showFee: p.meta.showFee,
        clubPrefix: p.meta.clubPrefix,
        items: p.items,
      })),
      { maxBody: box0.bodyH, headerH: HEADER_SEC, rowH: ROW_H, keepTogether: 3 },
    );

    const canvases = pages.map((units, pageIndex) => {
      const page = startPage(assets, header);
      const { ctx, box } = page;
      let y = box.bodyY;
      for (const unit of units) {
        y += unit.gapBefore || 0;
        const label = unit.continued ? `${unit.title} (cont.)` : unit.title;
        drawSectionTitle(ctx, box.innerX, y, label, unit.items.length, unit.color, box.innerW);
        y += HEADER_SEC;
        for (const item of unit.items) {
          const mid = y + ROW_H / 2 + 5;
          ctx.textAlign = "left";
          ctx.fillStyle = THEME.text;
          ctx.font = `650 22px ${FONT}`;
          ctx.fillText(truncateText(ctx, item.player ?? "—", box.innerW * 0.42), box.innerX, mid);

          const clubBits = [unit.clubPrefix, item.otherClub].filter(Boolean).join(" ");
          ctx.fillStyle = THEME.muted;
          ctx.font = `500 18px ${FONT}`;
          ctx.fillText(truncateText(ctx, clubBits, box.innerW * 0.32), box.innerX + box.innerW * 0.44, mid);

          if (unit.showFee) {
            const fee = String(item.fee ?? "").trim();
            if (fee) {
              ctx.textAlign = "right";
              ctx.fillStyle = THEME.accent;
              ctx.font = `700 18px ${FONT}`;
              ctx.fillText(truncateText(ctx, fee, 140), box.innerX + box.innerW, mid);
            }
          }
          y += ROW_H;
        }
      }
      finishPage(ctx, box, assets, pageIndex + 1, pages.length);
      return page.canvas;
    });

    return wrapPages(canvases, { club: team?.name, kind: "Transfers", season });
  }

  async function renderSquadSharePages(options) {
    const {
      team,
      leagueName = "",
      formation = "",
      season = "",
      players = [],
      dutyIds = new Set(),
      showNumber = true,
      showPos = true,
      showNat = true,
      showClub = false,
      logoSrc = "./logo.png",
    } = options;
    const assets = await loadReportAssets(team, logoSrc);
    const flags = await loadFlagMap(players.map((p) => p.nationality));
    const grouped = POS_GROUPS.map((g) => ({
      ...g,
      items: (players ?? []).filter((p) => p.pos === g.key),
    })).filter((g) => g.items.length);

    const header = {
      teamName: team?.name,
      kicker: [leagueName, season].filter(Boolean).join("  ·  "),
      title: "Squad list",
      subtitle: [formation, `${players.length} player${players.length === 1 ? "" : "s"}`].filter(Boolean).join("  ·  "),
      rightLabel: "Players",
      rightValue: players.length,
    };

    if (!grouped.length) {
      const page = startPage(assets, header);
      page.ctx.fillStyle = THEME.muted;
      page.ctx.font = `600 26px ${FONT}`;
      page.ctx.textAlign = "center";
      page.ctx.fillText("No players to export", page.box.w / 2, page.box.bodyY + page.box.bodyH / 2);
      finishPage(page.ctx, page.box, assets, 1, 1);
      return wrapPages([page.canvas], { club: team?.name, kind: "Squads", season });
    }

    const ROW_H = 54;
    const HEADER_SEC = 44;
    const box0 = contentBox();
    const pages = paginateSections(grouped.map((g) => ({ title: g.label, items: g.items })), {
      maxBody: box0.bodyH,
      headerH: HEADER_SEC,
      rowH: ROW_H,
      keepTogether: 4,
    });

    const canvases = pages.map((units, pageIndex) => {
      const page = startPage(assets, header);
      const { ctx, box } = page;
      let y = box.bodyY;
      for (const unit of units) {
        y += unit.gapBefore || 0;
        const label = unit.continued ? `${unit.title} (cont.)` : unit.title;
        drawSectionTitle(ctx, box.innerX, y, label, unit.items.length, THEME.accent, box.innerW);
        y += HEADER_SEC;
        for (const p of unit.items) {
          const mid = y + ROW_H / 2 + 5;
          let x = box.innerX;
          if (showNumber) {
            ctx.textAlign = "left";
            ctx.fillStyle = THEME.faint;
            ctx.font = `700 18px ${FONT}`;
            ctx.fillText(String(p.number ?? ""), x, mid);
            x += 46;
          }
          ctx.fillStyle = THEME.text;
          ctx.font = `650 21px ${FONT}`;
          const name = stripCaptain(p.name);
          ctx.fillText(truncateText(ctx, name, box.innerW * 0.42), x, mid);
          if (isCaptainPlayer(p)) {
            const nw = ctx.measureText(truncateText(ctx, name, box.innerW * 0.42)).width;
            roundRect(ctx, x + nw + 8, y + 16, 18, 18, 9);
            ctx.fillStyle = THEME.gold;
            ctx.fill();
            ctx.fillStyle = "#422006";
            ctx.font = `800 11px ${FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("C", x + nw + 17, y + 25);
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
          }
          if (dutyIds?.has?.(p.id)) {
            ctx.fillStyle = THEME.gold;
            ctx.font = `700 12px ${FONT}`;
            ctx.textAlign = "left";
            ctx.fillText("INTL", box.innerX + box.innerW * 0.52, mid);
          }
          if (showPos) {
            const tag = String(p.role || p.pos || "").toUpperCase();
            ctx.textAlign = "left";
            ctx.fillStyle = THEME.accent;
            ctx.font = `700 16px ${FONT}`;
            ctx.fillText(tag, box.innerX + box.innerW * 0.62, mid);
          }
          const rightX = box.innerX + box.innerW - 8;
          if (showClub && p.club) {
            ctx.textAlign = "right";
            ctx.fillStyle = THEME.muted;
            ctx.font = `500 16px ${FONT}`;
            ctx.fillText(truncateText(ctx, p.club, 200), rightX, mid);
          } else if (showNat) {
            const nat = String(p.nationality ?? "").trim();
            const flag = flags.get(nat);
            ctx.textAlign = "right";
            ctx.fillStyle = THEME.muted;
            ctx.font = `500 16px ${FONT}`;
            const natLabel = truncateText(ctx, nat || "—", 150);
            const tw = ctx.measureText(natLabel).width;
            ctx.fillText(natLabel, rightX, mid);
            if (nat) drawFlag(ctx, flag, rightX - tw - 36, y + 17, 28, 19);
          }
          y += ROW_H;
        }
      }
      finishPage(ctx, box, assets, pageIndex + 1, pages.length);
      return page.canvas;
    });

    return wrapPages(canvases, { club: team?.name, kind: "Squads", season });
  }

  function drawPitchField(ctx, x, y, w, h) {
    const stripes = 12;
    const sh = h / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#1f8f46" : "#177a3b";
      ctx.fillRect(x, y + i * sh, w, sh);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);
    ctx.beginPath();
    ctx.moveTo(x + 16, y + h / 2);
    ctx.lineTo(x + w - 16, y + h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawDepthNames(ctx, cx, cy, players, maxW) {
    const list = players ?? [];
    let ty = cy;
    list.forEach((p, i) => {
      const name = stripCaptain(p?.name);
      const cap = isCaptainPlayer(p) ? " (C)" : "";
      ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.78)";
      ctx.font = `${i === 0 ? "700" : "600"} 15px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(truncateText(ctx, `${name}${cap}`, maxW), cx, ty);
      ty += 18;
    });
    ctx.textBaseline = "alphabetic";
  }

  async function renderSquadDepthSharePages(options) {
    const {
      team,
      leagueName = "",
      formation = "",
      season = "",
      depth,
      players = [],
      logoSrc = "./logo.png",
    } = options;
    const SD =
      typeof SquadDepth !== "undefined"
        ? SquadDepth
        : global.SquadDepth;
    if (!SD) throw new Error("Squad depth module not loaded");
    const normalized = SD.normalizeSquadDepth(depth, formation || team?.formation);
    if (!SD.hasSquadDepthContent(normalized)) throw new Error("Depth chart is empty");

    const assets = await loadReportAssets(team, logoSrc);
    const form = String(normalized.formation || formation || team?.formation || "").trim();
    const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
    const gks = normalized.goalkeepers.map((id) => playerMap.get(id)).filter(Boolean);
    const slots = normalized.slots.map((s) => ({
      tag: s.tag,
      players: s.players.map((id) => playerMap.get(id)).filter(Boolean),
    }));
    const outfieldRows = SD.buildOutfieldRows(form, slots);
    const maxWide = Math.max(1, ...outfieldRows.map((r) => r.length), 1);
    const landscape = maxWide >= 5;
    const size = landscape ? { w: 1350, h: 1080 } : { w: W, h: H };
    const chartCount = SD.depthPlayerIds(normalized).size;
    const header = {
      teamName: team?.name,
      kicker: [leagueName, season].filter(Boolean).join("  ·  "),
      title: "Squad depth",
      subtitle: form || "Formation",
      rightLabel: "On chart",
      rightValue: chartCount,
    };

    const page = startPage(assets, header, size);
    const { ctx, box, canvas } = page;
    const pitchX = box.innerX - 8;
    const pitchY = box.bodyY;
    const pitchW = box.innerW + 16;
    const pitchH = box.bodyH;
    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 20);
    ctx.save();
    ctx.clip();
    drawPitchField(ctx, pitchX, pitchY, pitchW, pitchH);

    const innerY = pitchY + 36;
    const innerH = pitchH - 72;
    if (gks.length) {
      const gx = pitchX + pitchW / 2;
      const gy = innerY + innerH * 0.9;
      ctx.beginPath();
      ctx.arc(gx, gy - 28, 18, 0, Math.PI * 2);
      ctx.fillStyle = "#f59e0b";
      ctx.fill();
      ctx.fillStyle = "#422006";
      ctx.font = `800 12px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("GK", gx, gy - 27);
      ctx.textBaseline = "alphabetic";
      drawDepthNames(ctx, gx, gy - 4, gks, 220);
    }
    outfieldRows.forEach((row, r) => {
      const topPct = outfieldRows.length > 1 ? 0.72 - (r / (outfieldRows.length - 1)) * 0.56 : 0.45;
      row.forEach((slot, c) => {
        const leftPct = (c + 1) / (row.length + 1);
        const px = pitchX + leftPct * pitchW;
        const py = innerY + topPct * innerH;
        ctx.beginPath();
        ctx.arc(px, py - 22, 16, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.fillStyle = "#0b1120";
        ctx.font = `800 11px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(slot.tag ?? "").toUpperCase(), px, py - 21);
        ctx.textBaseline = "alphabetic";
        drawDepthNames(ctx, px, py - 2, slot.players, Math.max(120, pitchW / (row.length + 0.6)));
      });
    });
    ctx.restore();
    finishPage(ctx, box, assets, 1, 1);
    return wrapPages([canvas], { club: team?.name, kind: "SquadDepth", season });
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u32(n) {
    return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  }
  function u16(n) {
    return [n & 255, (n >>> 8) & 255];
  }

  async function zipBlobs(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = new TextEncoder().encode(file.name);
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const crc = crc32(data);
      const local = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        .concat(u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      const localU8 = new Uint8Array(local.concat([...name], [...data]));
      parts.push(localU8);
      const cen = [0x50, 0x4b, 0x01, 0x02, 0x14, 0x00, 0x14, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        .concat(u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(cen.concat([...name])));
      offset += localU8.length;
    }
    const centralU8 = concatBytes(central);
    const end = new Uint8Array(
      [0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00]
        .concat(u16(files.length), u16(files.length), u32(centralU8.length), u32(offset), u16(0)),
    );
    return new Blob([concatBytes(parts), centralU8, end], { type: "application/zip" });
  }

  function concatBytes(chunks) {
    const len = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function shareOrDownloadPages(pages, { title } = {}) {
    const files = [];
    for (const page of pages) {
      const blob = await canvasBlob(page.canvas);
      files.push({ blob, name: page.filename, file: new File([blob], page.filename, { type: "image/png" }) });
    }
    if (navigator.share && typeof File !== "undefined") {
      try {
        const pack = files.map((f) => f.file);
        if (!navigator.canShare || navigator.canShare({ files: pack })) {
          await navigator.share({ files: pack, title: title || pack[0].name });
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    if (files.length === 1) {
      downloadBlob(files[0].blob, files[0].name);
      return;
    }
    const zip = await zipBlobs(files);
    const zipName = String(files[0].name).replace(/_P\d+\.png$/i, ".zip").replace(/\.png$/i, ".zip");
    downloadBlob(zip, zipName);
  }

  function presentSharePages(pages, { title = "Share export" } = {}) {
    if (!pages?.length) throw new Error("Nothing to export");
    closeSharePreview();
    let index = 0;
    const urls = pages.map((p) => p.canvas.toDataURL("image/png"));
    const overlay = document.createElement("div");
    overlay.className = "share-preview";
    overlay.innerHTML = `
      <div class="share-preview__sheet" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
        <div class="share-preview__head">
          <div>
            <p class="share-preview__kicker">Share export</p>
            <h3 class="share-preview__title">${escapeHtml(title)}</h3>
            <p class="share-preview__meta">${pages.length} page${pages.length === 1 ? "" : "s"} · ${pages[0].canvas.width}×${pages[0].canvas.height}</p>
          </div>
          <button type="button" class="share-preview__close" data-share-close aria-label="Close">×</button>
        </div>
        <div class="share-preview__stage">
          <img class="share-preview__img" alt="Export preview" />
        </div>
        <div class="share-preview__pager"${pages.length < 2 ? " hidden" : ""}>
          <button type="button" class="btn btn-ghost btn-sm" data-share-prev>Prev</button>
          <span class="share-preview__page"></span>
          <button type="button" class="btn btn-ghost btn-sm" data-share-next>Next</button>
        </div>
        <div class="share-preview__actions">
          <button type="button" class="btn btn-ghost" data-share-dl>Download page</button>
          ${pages.length > 1 ? `<button type="button" class="btn btn-ghost" data-share-all>Download all</button>` : ""}
          <button type="button" class="btn btn-primary" data-share-native>Share</button>
        </div>
      </div>
    `;
    const img = overlay.querySelector(".share-preview__img");
    const pageEl = overlay.querySelector(".share-preview__page");
    const sync = () => {
      img.src = urls[index];
      if (pageEl) pageEl.textContent = `${index + 1} / ${pages.length}`;
    };
    sync();
    overlay.addEventListener("click", async (e) => {
      if (e.target === overlay || e.target.closest("[data-share-close]")) {
        closeSharePreview();
        return;
      }
      if (e.target.closest("[data-share-prev]")) {
        index = (index - 1 + pages.length) % pages.length;
        sync();
      } else if (e.target.closest("[data-share-next]")) {
        index = (index + 1) % pages.length;
        sync();
      } else if (e.target.closest("[data-share-dl]")) {
        downloadBlob(await canvasBlob(pages[index].canvas), pages[index].filename);
      } else if (e.target.closest("[data-share-all]")) {
        await shareOrDownloadPages(pages, { title });
      } else if (e.target.closest("[data-share-native]")) {
        await shareOrDownloadPages(pages.length === 1 ? pages : [pages[index]], { title });
      }
    });
    document.body.appendChild(overlay);
    document.body.classList.add("share-preview-open");
  }

  function closeSharePreview() {
    document.querySelector(".share-preview")?.remove();
    document.body.classList.remove("share-preview-open");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function firstCanvas(fn, options) {
    const pages = await fn(options);
    return pages[0]?.canvas;
  }

  const api = global.ShareImage || {};
  api.renderTransfersSharePages = renderTransfersSharePages;
  api.renderSquadSharePages = renderSquadSharePages;
  api.renderSquadDepthSharePages = renderSquadDepthSharePages;
  api.renderTransfersShareImage = (opt) => firstCanvas(renderTransfersSharePages, opt);
  api.renderSquadShareImage = (opt) => firstCanvas(renderSquadSharePages, opt);
  api.renderSquadDepthShareImage = (opt) => firstCanvas(renderSquadDepthSharePages, opt);
  api.presentSharePages = presentSharePages;
  api.shareOrDownloadPages = shareOrDownloadPages;
  api.reportFilename = reportFilename;
  api.REPORT_SIZE = { width: W, height: H };
  global.ShareImage = api;
})(typeof window !== "undefined" ? window : globalThis);
