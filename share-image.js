/**
 * Social share image generator — 1122 × 1402 px templates for squads, gameweeks, and transfers.
 */
(function (global) {
  const W = 1122;
  const H = 1402;
  const PAD = 56;
  const FONT =
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const THEME = {
    page: "#0b1120",
    surface: "#0d1625",
    surface2: "#111c2e",
    border: "#1e2d45",
    text: "#e8f0f8",
    muted: "#6b8aaa",
    faint: "#4a6a8a",
    accent: "#378ADD",
    intlBg: "#3d3418",
    intlText: "#facc15",
  };

  const POS_GROUPS = [
    { key: "GK", label: "GOALKEEPERS" },
    { key: "DF", label: "DEFENDERS" },
    { key: "MF", label: "MIDFIELDERS" },
    { key: "FW", label: "FORWARDS" },
  ];

  const POS_TAG_W = 48;
  const POS_TAG_H = 24;

  function roleTagColors(role, pos) {
    const r = String(role ?? pos ?? "")
      .trim()
      .toUpperCase();
    if (r === "GK") return { bg: "#1a3320", text: "#5dca82" };
    if (r === "CB") return { bg: "#0e2540", text: "#5aabdd" };
    if (r === "RB" || r === "RM") return { bg: "#123050", text: "#6bb8e8" };
    if (r === "LB" || r === "LM") return { bg: "#1a3a55", text: "#8cc8f0" };
    if (r === "DM" || r === "CM" || r === "AM") return { bg: "#221a3a", text: "#a78bfa" };
    if (r === "RW" || r === "LW" || r === "CF") return { bg: "#3a1a1a", text: "#f87171" };
    if (pos === "GK") return { bg: "#1a3320", text: "#5dca82" };
    if (pos === "DF") return { bg: "#0e2540", text: "#5aabdd" };
    if (pos === "MF") return { bg: "#221a3a", text: "#a78bfa" };
    if (pos === "FW") return { bg: "#3a1a1a", text: "#f87171" };
    return { bg: "#1a2d47", text: "#8cb4d8" };
  }

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

  function playerFlag(p, helpers) {
    if (helpers?.playerFlagEmoji) return helpers.playerFlagEmoji(p) || "";
    return String(p?.flag ?? "").trim();
  }

  function stripCaptain(name) {
    return String(name ?? "")
      .replace(/\s*\([Cc]\)\s*$/, "")
      .trim();
  }

  function drawBrandFooter(ctx) {
    const y = H - PAD - 8;
    ctx.fillStyle = THEME.faint;
    ctx.font = `600 22px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("Squad Central", PAD, y);
    ctx.textAlign = "right";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(`${W} × ${H}`, W - PAD, y);
  }

  function drawPanel(ctx, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = THEME.surface;
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawPosTag(ctx, x, y, role, pos) {
    const tag = String(role ?? pos ?? "").toUpperCase();
    const colors = roleTagColors(role, pos);
    roundRect(ctx, x, y, POS_TAG_W, POS_TAG_H, 6);
    ctx.fillStyle = colors.bg;
    ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.font = `800 13px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tag, x + POS_TAG_W / 2, y + POS_TAG_H / 2);
    ctx.textBaseline = "alphabetic";
  }

  function drawCountPill(ctx, x, y, w, h, count) {
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = THEME.surface2;
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.muted;
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), x + w / 2, y + h / 2);
    ctx.textBaseline = "alphabetic";
  }

  function squadColumns(innerX, innerW, showNumber, showPos, showNat) {
    const right = innerX + innerW;
    const natW = showNat ? 196 : 0;
    const posW = showPos ? POS_TAG_W : 0;
    const posGap = showPos && showNat ? 20 : 0;
    const numW = showNumber ? 44 : 0;

    const natX = right - natW;
    const posX = showPos ? natX - posGap - posW : right;
    const badgeW = 78;
    const badgeX = showPos ? posX - 16 - badgeW : right - badgeW;
    const playerX = innerX + numW;
    const playerW = Math.max(160, badgeX - playerX - 12);

    return { innerX, innerW, right, numW, numX: innerX, playerX, playerW, badgeX, badgeW, posX, posW, natX, natW };
  }

  async function renderSquadShareImage(options) {
    const {
      team,
      leagueName = "",
      formation = "",
      players = [],
      dutyIds = new Set(),
      showNumber = true,
      showPos = true,
      showNat = true,
      helpers = {},
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.fillStyle = THEME.page;
    ctx.fillRect(0, 0, W, H);

    const logo = await loadImage(team?.logo);
    const headerH = 168;
    drawPanel(ctx, PAD, PAD, W - PAD * 2, headerH);

    const crestSize = 88;
    const crestX = PAD + 28;
    const crestY = PAD + (headerH - crestSize) / 2;
    if (logo) {
      roundRect(ctx, crestX, crestY, crestSize, crestSize, 12);
      ctx.save();
      ctx.clip();
      ctx.drawImage(logo, crestX, crestY, crestSize, crestSize);
      ctx.restore();
    } else {
      roundRect(ctx, crestX, crestY, crestSize, crestSize, 12);
      ctx.fillStyle = THEME.surface2;
      ctx.fill();
    }

    const textX = crestX + crestSize + 28;
    const textMax = W - PAD - 28 - textX - 120;
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.text;
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText(truncateText(ctx, team?.name ?? "Team", textMax), textX, PAD + 60);

    ctx.fillStyle = THEME.muted;
    ctx.font = `500 24px ${FONT}`;
    const meta = [leagueName, team?.coach ? `Coach ${team.coach}` : "", formation ? formation : ""]
      .filter(Boolean)
      .join("  ·  ");
    ctx.fillText(truncateText(ctx, meta, textMax), textX, PAD + 98);

    ctx.textAlign = "right";
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(`${players.length}`, W - PAD - 28, PAD + 58);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText("PLAYERS", W - PAD - 28, PAD + 82);

    const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
    const sorted = [...players].sort(
      (a, b) =>
        (order[a.pos] ?? 9) - (order[b.pos] ?? 9) ||
        (a.number ?? 0) - (b.number ?? 0) ||
        String(a.name).localeCompare(String(b.name)),
    );

    const grouped = POS_GROUPS.map((g) => ({
      ...g,
      players: sorted.filter((p) => p.pos === g.key),
    })).filter((g) => g.players.length);

    const bodyTop = PAD + headerH + 20;
    const bodyH = H - bodyTop - PAD - 44;
    drawPanel(ctx, PAD, bodyTop, W - PAD * 2, bodyH);

    const innerX = PAD + 28;
    const innerW = W - PAD * 2 - 56;
    const cols = squadColumns(innerX, innerW, showNumber, showPos, showNat);

    let y = bodyTop + 32;

    ctx.fillStyle = THEME.faint;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = "left";
    if (showNumber) ctx.fillText("#", cols.numX, y);
    ctx.fillText("PLAYER", cols.playerX, y);
    if (showPos) {
      ctx.textAlign = "center";
      ctx.fillText("POS", cols.posX + cols.posW / 2, y);
    }
    if (showNat) {
      ctx.textAlign = "left";
      ctx.fillText("NATION", cols.natX, y);
    }
    y += 10;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(innerX, y);
    ctx.lineTo(cols.right, y);
    ctx.stroke();
    y += 22;

    const sectionH = 30;
    const sectionGap = 14;
    const totalRows = grouped.reduce((n, g) => n + g.players.length, 0);
    const sectionCount = grouped.length;
    const avail = bodyTop + bodyH - 28 - y;
    const rowH = Math.max(
      36,
      Math.min(42, Math.floor((avail - sectionCount * (sectionH + sectionGap)) / Math.max(totalRows, 1))),
    );

    grouped.forEach((group, groupIndex) => {
      if (groupIndex > 0) y += sectionGap;

      const sectionTop = y;
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(group.label, innerX, sectionTop + 20);
      drawCountPill(ctx, cols.right - 36, sectionTop + 2, 36, 26, group.players.length);
      y += sectionH;

      for (const p of group.players) {
        const rowTop = y;
        const midY = rowTop + rowH / 2 + 5;
        const tagY = rowTop + (rowH - POS_TAG_H) / 2;

        if (showNumber) {
          ctx.textAlign = "left";
          ctx.fillStyle = THEME.faint;
          ctx.font = `600 20px ${FONT}`;
          ctx.fillText(String(p.number ?? ""), cols.numX, midY);
        }

        ctx.textAlign = "left";
        ctx.fillStyle = THEME.text;
        ctx.font = `600 24px ${FONT}`;
        const displayName = stripCaptain(p.name);
        ctx.fillText(truncateText(ctx, displayName, cols.playerW), cols.playerX, midY);

        let badgeOffset = 0;
        if (p.captain) {
          roundRect(ctx, cols.badgeX + badgeOffset, tagY, 24, 22, 4);
          ctx.fillStyle = THEME.accent;
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `800 13px ${FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("C", cols.badgeX + badgeOffset + 12, tagY + 11);
          ctx.textBaseline = "alphabetic";
          badgeOffset += 28;
        }

        if (dutyIds?.has?.(p.id)) {
          roundRect(ctx, cols.badgeX + badgeOffset, tagY, 50, 22, 6);
          ctx.fillStyle = THEME.intlBg;
          ctx.fill();
          ctx.fillStyle = THEME.intlText;
          ctx.font = `800 11px ${FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("INT'L", cols.badgeX + badgeOffset + 25, tagY + 11);
          ctx.textBaseline = "alphabetic";
        }

        if (showPos) drawPosTag(ctx, cols.posX, tagY, p.role, p.pos);

        if (showNat) {
          ctx.textAlign = "left";
          ctx.fillStyle = THEME.muted;
          const flag = playerFlag(p, helpers);
          const natLabel = truncateText(ctx, p.nationality ?? "—", cols.natW - 38);
          if (flag) {
            ctx.font = `20px ${FONT}`;
            ctx.fillText(flag, cols.natX, midY);
            ctx.font = `500 20px ${FONT}`;
            ctx.fillText(natLabel, cols.natX + 32, midY);
          } else {
            ctx.font = `500 20px ${FONT}`;
            ctx.fillText(natLabel, cols.natX, midY);
          }
        }

        y += rowH;
      }
    });

    drawBrandFooter(ctx);
    return canvas;
  }

  async function renderGameweekShareImage(options) {
    const {
      leagueName = "",
      title = "Matchweek",
      dateRange = "",
      matches = [],
      teamById = new Map(),
      showStatus = true,
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.fillStyle = THEME.page;
    ctx.fillRect(0, 0, W, H);

    const headerH = 168;
    drawPanel(ctx, PAD, PAD, W - PAD * 2, headerH);
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.muted;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(String(leagueName).toUpperCase(), PAD + 32, PAD + 50);
    ctx.fillStyle = THEME.text;
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText(truncateText(ctx, title, W - PAD * 2 - 64), PAD + 32, PAD + 102);
    ctx.fillStyle = THEME.muted;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(truncateText(ctx, dateRange || "—", W - PAD * 2 - 64), PAD + 32, PAD + 140);

    const groups = new Map();
    for (const m of matches) {
      const day = m.dayLabel || m.time || "—";
      const list = groups.get(day) ?? [];
      list.push(m);
      groups.set(day, list);
    }

    const bodyTop = PAD + headerH + 20;
    const bodyH = H - bodyTop - PAD - 44;
    drawPanel(ctx, PAD, bodyTop, W - PAD * 2, bodyH);

    const innerX = PAD + 28;
    const innerW = W - PAD * 2 - 56;
    const centerX = innerX + innerW / 2;
    const homeX = centerX - 58;
    const awayX = centerX + 58;
    const scoreW = 96;
    const teamMaxW = (innerW - scoreW - 48) / 2;

    let y = bodyTop + 36;
    const dayHeaderH = 28;
    const dayGap = 10;
    const avail = bodyTop + bodyH - 36 - y;
    const rowH = Math.max(
      52,
      Math.min(72, Math.floor((avail - groups.size * (dayHeaderH + dayGap)) / Math.max(matches.length, 1))),
    );

    for (const [day, list] of groups.entries()) {
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(String(day).toUpperCase(), innerX, y + 16);
      y += dayHeaderH;

      for (const m of list) {
        const ht = teamById.get(m.homeTeamId);
        const at = teamById.get(m.awayTeamId);
        const [hs, as] = m.score ?? [0, 0];
        const rowTop = y;
        const cardH = rowH - 10;

        roundRect(ctx, innerX, rowTop, innerW, cardH, 10);
        ctx.fillStyle = THEME.surface2;
        ctx.fill();

        const midY = rowTop + cardH / 2 + 6;

        ctx.font = `700 26px ${FONT}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "right";
        ctx.fillText(truncateText(ctx, ht?.name ?? "Home", teamMaxW), homeX, midY);

        ctx.textAlign = "center";
        ctx.fillStyle = THEME.accent;
        ctx.font = `800 30px ${FONT}`;
        ctx.fillText(`${hs} – ${as}`, centerX, midY);

        ctx.textAlign = "left";
        ctx.fillStyle = THEME.text;
        ctx.font = `700 26px ${FONT}`;
        ctx.fillText(truncateText(ctx, at?.name ?? "Away", teamMaxW), awayX, midY);

        if (showStatus && m.status) {
          ctx.textAlign = "right";
          ctx.fillStyle = THEME.faint;
          ctx.font = `700 13px ${FONT}`;
          ctx.fillText(String(m.status).toUpperCase(), innerX + innerW - 14, rowTop + 18);
        }

        y += rowH;
      }
      y += dayGap;
    }

    if (!matches.length) {
      ctx.fillStyle = THEME.muted;
      ctx.font = `600 28px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("No fixtures this gameweek", W / 2, bodyTop + bodyH / 2);
    }

    drawBrandFooter(ctx);
    return canvas;
  }

  const TRANSFER_STYLE = {
    in: { label: "IN", color: "#4ade80", bg: "#0d2018" },
    out: { label: "OUT", color: "#5aabdd", bg: "#0e2540" },
    loanReturn: { label: "LOAN RETURN", color: "#fbbf24", bg: "#2a1f0a" },
    loanRecall: { label: "RECALL", color: "#c084fc", bg: "#231533" },
  };

  function transferColumns(innerX, innerW) {
    const right = innerX + innerW;
    const feeW = 128;
    const clubW = 300;
    const symW = 36;
    const gap = 14;
    const feeX = right - feeW;
    const clubX = feeX - gap - clubW;
    const playerX = innerX + symW + gap;
    const playerW = Math.max(180, clubX - gap - playerX);
    return { symX: innerX, symW, playerX, playerW, clubX, clubW, feeX, feeW, right };
  }

  function drawTransferSectionBadge(ctx, x, y, key, count) {
    const style = TRANSFER_STYLE[key] ?? { label: String(key).toUpperCase(), color: THEME.muted, bg: THEME.surface2 };
    ctx.font = `800 13px ${FONT}`;
    const textW = ctx.measureText(style.label).width;
    const badgeW = textW + 24;
    const badgeH = 26;
    roundRect(ctx, x, y, badgeW, badgeH, 6);
    ctx.fillStyle = style.bg;
    ctx.fill();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = style.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(style.label, x + 12, y + badgeH / 2);
    ctx.textBaseline = "alphabetic";
    drawCountPill(ctx, x + badgeW + 10, y, 36, badgeH, count);
    return badgeH;
  }

  async function renderTransfersShareImage(options) {
    const { team, leagueName = "", panels = [] } = options;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.fillStyle = THEME.page;
    ctx.fillRect(0, 0, W, H);

    const logo = await loadImage(team?.logo);
    const headerH = 168;
    drawPanel(ctx, PAD, PAD, W - PAD * 2, headerH);

    const crestSize = 88;
    const crestX = PAD + 28;
    const crestY = PAD + (headerH - crestSize) / 2;
    if (logo) {
      roundRect(ctx, crestX, crestY, crestSize, crestSize, 12);
      ctx.save();
      ctx.clip();
      ctx.drawImage(logo, crestX, crestY, crestSize, crestSize);
      ctx.restore();
    } else {
      roundRect(ctx, crestX, crestY, crestSize, crestSize, 12);
      ctx.fillStyle = THEME.surface2;
      ctx.fill();
    }

    const textX = crestX + crestSize + 28;
    const textMax = W - PAD - 28 - textX - 120;
    const totalMoves = panels.reduce((n, p) => n + (p.items?.length ?? 0), 0);

    ctx.textAlign = "left";
    ctx.fillStyle = THEME.muted;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(String(leagueName).toUpperCase(), textX, PAD + 46);
    ctx.fillStyle = THEME.text;
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText(truncateText(ctx, team?.name ?? "Club", textMax), textX, PAD + 92);
    ctx.fillStyle = THEME.muted;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText("Transfer window", textX, PAD + 130);

    ctx.textAlign = "right";
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(String(totalMoves), W - PAD - 28, PAD + 88);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillText("MOVES", W - PAD - 28, PAD + 112);

    const activePanels = panels.filter((p) => (p.items?.length ?? 0) > 0);
    const bodyTop = PAD + headerH + 20;
    const bodyH = H - bodyTop - PAD - 44;
    drawPanel(ctx, PAD, bodyTop, W - PAD * 2, bodyH);

    const innerX = PAD + 28;
    const innerW = W - PAD * 2 - 56;
    const cols = transferColumns(innerX, innerW);

    if (!activePanels.length) {
      ctx.fillStyle = THEME.muted;
      ctx.font = `600 28px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("No transfers recorded", W / 2, bodyTop + bodyH / 2);
      drawBrandFooter(ctx);
      return canvas;
    }

    let y = bodyTop + 32;
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 14px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText("PLAYER", cols.playerX, y);
    ctx.fillText("CLUB", cols.clubX, y);
    ctx.textAlign = "right";
    ctx.fillText("FEE", cols.feeX + cols.feeW, y);
    y += 10;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(innerX, y);
    ctx.lineTo(cols.right, y);
    ctx.stroke();
    y += 22;

    const sectionHeaderH = 34;
    const sectionGap = 18;
    const totalRows = activePanels.reduce((n, p) => n + p.items.length, 0);
    const avail = bodyTop + bodyH - 28 - y;
    const rowH = Math.max(
      40,
      Math.min(
        54,
        Math.floor(
          (avail - activePanels.length * (sectionHeaderH + sectionGap)) / Math.max(totalRows, 1),
        ),
      ),
    );

    for (const panel of activePanels) {
      const style = TRANSFER_STYLE[panel.key] ?? { color: THEME.muted };
      const badgeH = drawTransferSectionBadge(ctx, innerX, y, panel.key, panel.items.length);
      y += Math.max(sectionHeaderH, badgeH + 6);

      for (const item of panel.items) {
        const rowTop = y;
        const midY = rowTop + rowH / 2 + 5;

        ctx.textAlign = "center";
        ctx.fillStyle = style.color;
        ctx.font = `800 22px ${FONT}`;
        ctx.fillText(String(panel.symbol ?? "•"), cols.symX + cols.symW / 2, midY);

        ctx.textAlign = "left";
        ctx.fillStyle = THEME.text;
        ctx.font = `600 24px ${FONT}`;
        ctx.fillText(truncateText(ctx, item.player ?? "—", cols.playerW), cols.playerX, midY);

        ctx.fillStyle = THEME.muted;
        ctx.font = `500 22px ${FONT}`;
        ctx.fillText(truncateText(ctx, item.otherClub ?? "—", cols.clubW), cols.clubX, midY);

        ctx.textAlign = "right";
        ctx.fillStyle = THEME.accent;
        ctx.font = `700 22px ${FONT}`;
        ctx.fillText(truncateText(ctx, item.fee ?? "—", cols.feeW), cols.feeX + cols.feeW, midY);

        y += rowH;
      }
      y += sectionGap;
    }

    drawBrandFooter(ctx);
    return canvas;
  }

  async function exportShareImage(canvas, filename) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png");
    });
    const safeName = String(filename ?? "share.png").replace(/[^\w.\-]+/g, "-");

    if (navigator.share && typeof File !== "undefined") {
      try {
        const file = new File([blob], safeName, { type: "image/png" });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: safeName });
          return;
        }
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.click();
    URL.revokeObjectURL(url);
  }

  global.ShareImage = {
    SIZE: { width: W, height: H },
    renderSquadShareImage,
    renderGameweekShareImage,
    renderTransfersShareImage,
    exportShareImage,
  };
})(typeof window !== "undefined" ? window : global);
