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

  function drawSharePageBg(ctx) {
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, W, H);
  }

  function drawSharePanel(ctx, x, y, w, h, { radius = 20, fill = "#0d1625" } = {}) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = "#1e2d45";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawShareFooterBar(ctx, { margin, footerY, footerH, teamLogo, brandLogo }) {
    const pitchW = W - margin * 2;
    roundRect(ctx, margin, footerY, pitchW, footerH, 18);
    ctx.fillStyle = "#05080f";
    ctx.fill();

    const footCrest = 48;
    const footCy = footerY + footerH / 2;
    if (teamLogo) drawCrestInCircle(ctx, teamLogo, margin + 36 + footCrest / 2, footCy, footCrest);

    ctx.textBaseline = "middle";
    const centerX = W / 2;
    if (brandLogo) {
      const bw = 36;
      ctx.drawImage(brandLogo, centerX - bw / 2 - 90, footCy - bw / 2, bw, bw);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 22px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText("Squad Central", centerX - 46, footCy);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 22px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("Squad Central", centerX, footCy);
    }
    ctx.textBaseline = "alphabetic";
  }

  function drawTeamShareHeader(ctx, {
    margin,
    headerY,
    headerH,
    teamLogo,
    teamName,
    leagueName,
    coach,
    formation,
    rightLabel,
    rightValue,
  }) {
    const pitchW = W - margin * 2;
    drawSharePanel(ctx, margin, headerY, pitchW, headerH);

    const crestSz = 88;
    const crestCx = margin + 36 + crestSz / 2;
    const crestCy = headerY + headerH / 2;
    drawCrestInCircle(ctx, teamLogo, crestCx, crestCy, crestSz);

    const textX = margin + 36 + crestSz + 24;
    const textMax = pitchW - crestSz - 160;
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.text;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(truncateText(ctx, teamName ?? "Team", textMax), textX, headerY + 58);

    ctx.fillStyle = THEME.muted;
    ctx.font = `600 20px ${FONT}`;
    const metaBits = [leagueName, coach ? `Manager ${coach}` : ""].filter(Boolean);
    ctx.fillText(truncateText(ctx, metaBits.join("  ·  "), textMax), textX, headerY + 96);

    if (formation) {
      const form = String(formation);
      ctx.font = `800 18px ${FONT}`;
      const fw = ctx.measureText(form).width + 24;
      const fh = 30;
      const fx = textX;
      const fy = headerY + 116;
      roundRect(ctx, fx, fy, fw, fh, 8);
      ctx.fillStyle = "rgba(55, 138, 221, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(55, 138, 221, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(form, fx + fw / 2, fy + fh / 2);
      ctx.textBaseline = "alphabetic";
    }

    if (rightValue != null) {
      ctx.textAlign = "right";
      ctx.fillStyle = THEME.text;
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText(String(rightValue), margin + pitchW - 28, headerY + 64);
      ctx.fillStyle = THEME.faint;
      ctx.font = `700 14px ${FONT}`;
      ctx.fillText(String(rightLabel ?? "").toUpperCase(), margin + pitchW - 28, headerY + 92);
    }
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
      logoSrc = "./logo.png",
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const teamLogo = await loadImage(team?.logo);
    const brandLogo = await loadImage(logoSrc);
    const coach = String(team?.coach ?? "").trim();
    const form = String(formation || team?.formation || "").trim();

    drawSharePageBg(ctx);

    const margin = 36;
    const headerH = 168;
    const footerH = 88;
    const headerY = margin;
    const footerY = H - margin - footerH;

    drawTeamShareHeader(ctx, {
      margin,
      headerY,
      headerH,
      teamLogo,
      teamName: team?.name,
      leagueName,
      coach,
      formation: form,
      rightLabel: "Players",
      rightValue: players.length,
    });

    const bodyTop = headerY + headerH + 16;
    const bodyH = footerY - bodyTop - 16;
    drawSharePanel(ctx, margin, bodyTop, W - margin * 2, bodyH, { radius: 24, fill: "#0b1422" });

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

    const innerX = margin + 28;
    const innerW = W - margin * 2 - 56;
    const cols = squadColumns(innerX, innerW, showNumber, showPos, showNat);

    let y = bodyTop + 28;

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
    y += 20;

    const sectionH = 28;
    const sectionGap = 12;
    const totalRows = grouped.reduce((n, g) => n + g.players.length, 0);
    const sectionCount = grouped.length;
    const avail = bodyTop + bodyH - 24 - y;
    const rowH = Math.max(
      34,
      Math.min(42, Math.floor((avail - sectionCount * (sectionH + sectionGap)) / Math.max(totalRows, 1))),
    );

    grouped.forEach((group, groupIndex) => {
      if (groupIndex > 0) y += sectionGap;

      const sectionTop = y;
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(group.label, innerX, sectionTop + 18);
      drawCountPill(ctx, cols.right - 36, sectionTop + 1, 36, 24, group.players.length);
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
        ctx.font = `600 23px ${FONT}`;
        const displayName = stripCaptain(p.name);
        ctx.fillText(truncateText(ctx, displayName, cols.playerW), cols.playerX, midY);

        let badgeOffset = 0;
        if (p.captain || isCaptainPlayer(p)) {
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

    drawShareFooterBar(ctx, { margin, footerY, footerH, teamLogo, brandLogo });
    return canvas;
  }

  function drawDepthPosNode(ctx, cx, cy, tag, players, { isGk = false } = {}) {
    const tokenR = 26;
    const label = String(tag ?? "").toUpperCase() || "—";

    ctx.beginPath();
    ctx.arc(cx, cy, tokenR, 0, Math.PI * 2);
    if (isGk) {
      const grad = ctx.createLinearGradient(cx - tokenR, cy - tokenR, cx + tokenR, cy + tokenR);
      grad.addColorStop(0, "#fbbf24");
      grad.addColorStop(1, "#d97706");
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = "#ffffff";
    }
    ctx.fill();
    ctx.strokeStyle = isGk ? "rgba(255,255,255,0.85)" : "rgba(11,17,32,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isGk ? "#422006" : "#0b1120";
    ctx.font = `800 ${Math.round(tokenR * 0.55)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + 1);

    const names = (players ?? []).slice(0, 2);
    const lineH = 18;
    let textY = cy + tokenR + 12;
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 5;
    if (!names.length) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText("—", cx, textY);
    } else {
      names.forEach((p, i) => {
        const short =
          String(p?.displayLastName ?? "").trim() || lineupShortName(p?.name);
        const cap = isCaptainPlayer(p) ? " (C)" : "";
        ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255,255,255,0.78)";
        ctx.font = `${i === 0 ? "700" : "600"} 15px ${FONT}`;
        ctx.fillText(truncateText(ctx, `${short}${cap}`, tokenR * 4.2), cx, textY);
        textY += lineH;
      });
    }
    ctx.shadowBlur = 0;
    ctx.textBaseline = "alphabetic";
  }

  async function renderSquadDepthShareImage(options) {
    const {
      team,
      leagueName = "",
      formation = "",
      depth,
      players = [],
      logoSrc = "./logo.png",
    } = options;

    const SD =
      typeof SquadDepth !== "undefined"
        ? SquadDepth
        : typeof global !== "undefined" && global.SquadDepth
          ? global.SquadDepth
          : null;
    if (!SD) throw new Error("Squad depth module not loaded");

    const normalized = SD.normalizeSquadDepth(depth, formation || team?.formation);
    if (!SD.hasSquadDepthContent(normalized)) {
      throw new Error("Depth chart is empty");
    }

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const teamLogo = await loadImage(team?.logo);
    const brandLogo = await loadImage(logoSrc);
    const coach = String(team?.coach ?? "").trim();
    const form = String(normalized.formation || formation || team?.formation || "").trim();
    const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
    const gks = normalized.goalkeepers.map((id) => playerMap.get(id)).filter(Boolean);
    const slots = normalized.slots.map((s) => ({
      tag: s.tag,
      players: s.players.map((id) => playerMap.get(id)).filter(Boolean),
    }));
    const outfieldRows = SD.buildOutfieldRows(form, slots);
    const chartCount = SD.depthPlayerIds(normalized).size;

    drawSharePageBg(ctx);

    const margin = 36;
    const headerH = 168;
    const footerH = 88;
    const headerY = margin;
    const footerY = H - margin - footerH;

    drawTeamShareHeader(ctx, {
      margin,
      headerY,
      headerH,
      teamLogo,
      teamName: team?.name,
      leagueName,
      coach,
      formation: form,
      rightLabel: "On chart",
      rightValue: chartCount,
    });

    const pitchY = headerY + headerH + 16;
    const pitchH = footerY - pitchY - 16;
    const pitchX = margin;
    const pitchW = W - margin * 2;

    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 24);
    ctx.save();
    ctx.clip();
    drawPitchStripes(ctx, pitchX, pitchY, pitchW, pitchH);
    drawPitchMarkings(ctx, pitchX, pitchY, pitchW, pitchH);

    const vig = ctx.createLinearGradient(pitchX, pitchY, pitchX, pitchY + pitchH);
    vig.addColorStop(0, "rgba(0,0,0,0.16)");
    vig.addColorStop(0.12, "rgba(0,0,0,0)");
    vig.addColorStop(0.88, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.26)");
    ctx.fillStyle = vig;
    ctx.fillRect(pitchX, pitchY, pitchW, pitchH);

    const badgeCrest = 72;
    const badgeX = pitchX + 24;
    const badgeY = pitchY + 20;
    drawCrestInCircle(ctx, teamLogo, badgeX + badgeCrest / 2, badgeY + badgeCrest / 2, badgeCrest);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 24px ${FONT}`;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.fillText("SQUAD DEPTH", badgeX + badgeCrest + 14, badgeY + 32);
    ctx.shadowBlur = 0;
    if (form) {
      ctx.font = `800 20px ${FONT}`;
      const fw = ctx.measureText(form).width + 24;
      roundRect(ctx, badgeX + badgeCrest + 14, badgeY + 44, fw, 30, 8);
      ctx.fillStyle = "rgba(11,17,32,0.72)";
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(form, badgeX + badgeCrest + 14 + fw / 2, badgeY + 59);
      ctx.textBaseline = "alphabetic";
    }

    const padTop = 120;
    const padBottom = coach ? 100 : 56;
    const innerY = pitchY + padTop;
    const innerH = pitchH - padTop - padBottom;
    const rowCount = outfieldRows.length;

    if (gks.length) {
      drawDepthPosNode(ctx, pitchX + pitchW / 2, innerY + innerH * 0.06, "GK", gks, { isGk: true });
    }

    outfieldRows.forEach((row, r) => {
      const topPct = rowCount > 1 ? 22 + (r / (rowCount - 1)) * 68 : 50;
      row.forEach((slot, c) => {
        const leftPct = ((c + 1) / (row.length + 1)) * 100;
        const px = pitchX + (leftPct / 100) * pitchW;
        const py = innerY + (topPct / 100) * innerH;
        drawDepthPosNode(ctx, px, py, slot.tag, slot.players);
      });
    });

    if (coach) {
      const stripH = 52;
      const stripY = pitchY + pitchH - stripH - 16;
      const stripW = Math.min(520, pitchW - 48);
      const stripX = pitchX + (pitchW - stripW) / 2;
      roundRect(ctx, stripX, stripY, stripW, stripH, 14);
      ctx.fillStyle = "rgba(7, 11, 20, 0.78)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = THEME.muted;
      ctx.font = `600 13px ${FONT}`;
      ctx.fillText("MANAGER", stripX + stripW / 2, stripY + 16);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 20px ${FONT}`;
      ctx.fillText(truncateText(ctx, coach, stripW - 36), stripX + stripW / 2, stripY + 38);
    }

    ctx.restore();
    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 24);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawShareFooterBar(ctx, { margin, footerY, footerH, teamLogo, brandLogo });
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
    promoted: { label: "PROMOTED", color: "#2dd4bf", bg: "#0d2422" },
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
        const feeLabel =
          panel.key === "loanReturn" || panel.key === "loanRecall"
            ? ""
            : truncateText(ctx, item.fee ?? "—", cols.feeW);
        if (feeLabel) ctx.fillText(feeLabel, cols.feeX + cols.feeW, midY);

        y += rowH;
      }
      y += sectionGap;
    }

    drawBrandFooter(ctx);
    return canvas;
  }

  function lineupShortName(name) {
    const clean = String(name ?? "")
      .replace(/\s*\(C\)\s*$/i, "")
      .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : clean;
  }

  /** Full name as up to two rows — given name(s) / surname. */
  function pitchNameLines(name, captain = false) {
    const base = String(name ?? "")
      .replace(/\s*\(C\)\s*$/i, "")
      .trim();
    const cap = Boolean(captain) || /\s*\(C\)\s*$/i.test(String(name ?? "").trim());
    const parts = base.split(/\s+/).filter(Boolean);
    let lines;
    if (parts.length <= 1) lines = [base || "—"];
    else if (parts.length === 2) lines = [parts[0], parts[1]];
    else lines = [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
    if (cap) lines[lines.length - 1] = `${lines[lines.length - 1]} (C)`;
    return lines;
  }

  function isCaptainPlayer(p) {
    if (!p) return false;
    if (p.captain) return true;
    return /\s*\(C\)\s*$/i.test(String(p.name ?? "").trim());
  }

  function drawPitchStripes(ctx, x, y, w, h) {
    const stripes = 14;
    const stripeH = h / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#1f8a45" : "#1a7a3c";
      ctx.fillRect(x, y + i * stripeH, w, stripeH);
    }
  }

  /** Lineup11-style pitch: concentric mow rings + soft boards at the far end. */
  function drawLineup11Pitch(ctx, x, y, w, h) {
    ctx.fillStyle = "#2a7d3a";
    ctx.fillRect(x, y, w, h);

    const boardH = Math.max(28, Math.round(h * 0.055));
    const boardColors = ["#1e3a5f", "#c8102e", "#f5f5f5", "#0b5cab", "#111111", "#ffd100", "#1e3a5f"];
    const boardW = w / boardColors.length;
    for (let i = 0; i < boardColors.length; i++) {
      ctx.fillStyle = boardColors[i];
      ctx.fillRect(x + i * boardW, y, boardW + 1, boardH);
    }
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, y + boardH - 4, w, 4);

    const cx = x + w / 2;
    const cy = y + boardH + (h - boardH) * 0.52;
    const maxRx = w * 0.72;
    const maxRy = (h - boardH) * 0.62;
    const rings = 18;
    for (let i = rings; i >= 0; i--) {
      const t = i / rings;
      ctx.beginPath();
      ctx.ellipse(cx, cy, maxRx * t, maxRy * t, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "#318f44" : "#277a38";
      ctx.fill();
    }

    const fade = ctx.createLinearGradient(x, y + boardH, x, y + boardH + 50);
    fade.addColorStop(0, "rgba(0,0,0,0.22)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(x, y + boardH, w, 50);
  }

  function teamKitColors(team, { isGk = false } = {}) {
    if (isGk) return { c1: "#1a1a1a", c2: "#6b7280", sleeve: "#111111" };
    const colors = Array.isArray(team?.colors) ? team.colors.filter(Boolean) : [];
    const c1 = String(colors[0] ?? "#ffffff").trim() || "#ffffff";
    const c2 = String(colors[1] ?? c1).trim() || c1;
    return { c1, c2, sleeve: c2 };
  }

  /** Flat kit icon: striped body, sleeves, crest, number badge — Lineup11 style. */
  function drawJerseyToken(ctx, cx, cy, player, { kit, crest, scale = 1 } = {}) {
    const w = 58 * scale;
    const h = 62 * scale;
    const x = cx - w / 2;
    const y = cy - h / 2 - 6 * scale;
    const c1 = kit?.c1 ?? "#ffffff";
    const c2 = kit?.c2 ?? c1;
    const sleeve = kit?.sleeve ?? c2;
    const striped = c1.toLowerCase() !== c2.toLowerCase();

    ctx.save();

    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.42, w * 0.42, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    const jerseyOutline = () => {
      ctx.beginPath();
      ctx.moveTo(x + w * 0.22, y + h * 0.12);
      ctx.lineTo(x + w * 0.08, y + h * 0.22);
      ctx.lineTo(x + w * 0.02, y + h * 0.38);
      ctx.lineTo(x + w * 0.18, y + h * 0.42);
      ctx.lineTo(x + w * 0.18, y + h * 0.92);
      ctx.quadraticCurveTo(cx, y + h * 0.98, x + w * 0.82, y + h * 0.92);
      ctx.lineTo(x + w * 0.82, y + h * 0.42);
      ctx.lineTo(x + w * 0.98, y + h * 0.38);
      ctx.lineTo(x + w * 0.92, y + h * 0.22);
      ctx.lineTo(x + w * 0.78, y + h * 0.12);
      ctx.quadraticCurveTo(cx, y + h * 0.02, x + w * 0.22, y + h * 0.12);
      ctx.closePath();
    };

    jerseyOutline();
    ctx.save();
    ctx.clip();

    if (striped) {
      const stripeW = Math.max(5, w / 7);
      for (let i = -1; i < 9; i++) {
        ctx.fillStyle = i % 2 === 0 ? c1 : c2;
        ctx.fillRect(x + i * stripeW, y, stripeW + 1, h);
      }
      ctx.fillStyle = sleeve;
      ctx.fillRect(x, y + h * 0.12, w * 0.2, h * 0.32);
      ctx.fillRect(x + w * 0.8, y + h * 0.12, w * 0.2, h * 0.32);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    }

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.12, y + h * 0.1);
    ctx.lineTo(cx, y + h * 0.2);
    ctx.lineTo(cx + w * 0.12, y + h * 0.1);
    ctx.closePath();
    ctx.fill();

    if (crest) {
      const cw = 14 * scale;
      const ch = 14 * scale;
      try {
        ctx.drawImage(crest, cx - w * 0.18 - cw / 2, y + h * 0.32, cw, ch);
      } catch (_) {
        /* ignore crest draw failures */
      }
    }

    ctx.restore();

    jerseyOutline();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    const num = String(player?.number ?? "").trim() || "—";
    const badgeR = 11 * scale;
    const bx = cx + w * 0.28;
    const by = cy + h * 0.22;
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.2 * scale;
    ctx.stroke();
    ctx.fillStyle = "#0b1120";
    ctx.font = `800 ${Math.round(12 * scale)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(num, bx, by + 0.5);

    if (isCaptainPlayer(player)) {
      const capR = 8 * scale;
      const capX = cx + w * 0.3;
      const capY = y + h * 0.14;
      ctx.beginPath();
      ctx.arc(capX, capY, capR, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.strokeStyle = "#0b1120";
      ctx.lineWidth = 1.2 * scale;
      ctx.stroke();
      ctx.fillStyle = "#422006";
      ctx.font = `800 ${Math.round(9 * scale)}px ${FONT}`;
      ctx.fillText("C", capX, capY + 0.5);
    }

    ctx.restore();
  }

  function drawLineup11PlayerName(ctx, cx, cy, player, { maxW = 120 } = {}) {
    const captain = isCaptainPlayer(player);
    const lines = pitchNameLines(player?.name, false);
    const first = truncateText(ctx, lines[0] || "—", maxW);
    const last = lines[1] ? truncateText(ctx, lines[1], maxW) : "";

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = "#ffffff";
    ctx.font = `800 17px ${FONT}`;
    ctx.fillText(first, cx, cy);

    if (last) {
      ctx.font = `600 15px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(last + (captain ? " (C)" : ""), cx, cy + 20);
    } else if (captain) {
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText("(C)", cx, cy + 20);
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.textBaseline = "alphabetic";
  }

  function drawPitchMarkings(ctx, x, y, w, h) {
    const sx = w / 100;
    const sy = h / 155;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.85;
    ctx.strokeRect(3, 3, 94, 149);
    ctx.beginPath();
    ctx.moveTo(3, 77.5);
    ctx.lineTo(97, 77.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(50, 77.5, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(50, 77.5, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
    // Top (GK) box
    ctx.strokeRect(22, 3, 56, 22);
    ctx.strokeRect(35, 3, 30, 10);
    // Bottom box
    ctx.strokeRect(22, 130, 56, 22);
    ctx.strokeRect(35, 142, 30, 10);
    ctx.restore();
  }

  /** LiveScore-style token: white disc + dark number, name under. */
  function drawSharePlayerToken(ctx, cx, cy, player, { tokenR = 28, isGk = false } = {}) {
    const num = String(player?.number ?? "").trim();
    const captain = isCaptainPlayer(player);

    ctx.beginPath();
    ctx.arc(cx, cy, tokenR, 0, Math.PI * 2);
    if (isGk) {
      const grad = ctx.createLinearGradient(cx - tokenR, cy - tokenR, cx + tokenR, cy + tokenR);
      grad.addColorStop(0, "#fbbf24");
      grad.addColorStop(1, "#d97706");
    ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = "#ffffff";
    }
    ctx.fill();
    ctx.strokeStyle = isGk ? "rgba(255,255,255,0.85)" : "rgba(11,17,32,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = isGk ? "#422006" : "#0b1120";
    ctx.font = `800 ${Math.round(tokenR * 0.72)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(num || "—", cx, cy + 1);

    if (captain) {
      const capR = Math.round(tokenR * 0.34);
      const capX = cx + tokenR * 0.68;
      const capY = cy - tokenR * 0.68;
      ctx.beginPath();
      ctx.arc(capX, capY, capR, 0, Math.PI * 2);
      ctx.fillStyle = "#facc15";
      ctx.fill();
      ctx.strokeStyle = "#0b1120";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#422006";
      ctx.font = `800 ${Math.max(9, Math.round(capR * 1.15))}px ${FONT}`;
      ctx.fillText("C", capX, capY + 1);
    }

    // Full name under token — two rows (given / surname)
    const maxW = tokenR * 3.8;
    ctx.font = `700 ${Math.round(tokenR * 0.38)}px ${FONT}`;
    const lines = pitchNameLines(player?.name, captain).map((line) => truncateText(ctx, line, maxW));

    const lineH = Math.round(tokenR * 0.44);
    let textY = cy + tokenR + 12;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    for (const line of lines.slice(0, 2)) {
      ctx.fillText(line, cx, textY);
      textY += lineH;
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
      ctx.textBaseline = "alphabetic";
  }

  function drawCrestInCircle(ctx, logo, cx, cy, size) {
    const r = size / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, cx - r + 3, cy - r + 3, size - 6, size - 6);
      ctx.restore();
    }
  }

  /**
   * Lineup11-style single-team share card (1122 × 1402).
   * Jersey tokens on a concentric-mow pitch, full names in two rows.
   */
  async function renderLineupShareImage(options) {
    const {
      homeTeam = {},
      awayTeam = {},
      score = [0, 0],
      matchday = "",
      time = "",
      venue = "",
      leagueName = "",
      homeFormation = "",
      awayFormation = "",
      homeRows = [],
      awayRows = [],
      homeCoach = "",
      awayCoach = "",
      focusSide = "home",
      logoSrc = "./logo.png",
    } = options;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    const side = focusSide === "away" ? "away" : "home";
    const focusTeam = side === "home" ? homeTeam : awayTeam;
    const oppTeam = side === "home" ? awayTeam : homeTeam;
    const focusRows = side === "home" ? homeRows : awayRows;
    const focusFormation = side === "home" ? homeFormation : awayFormation;
    const focusCoach = String(side === "home" ? homeCoach : awayCoach).trim();
    const [hs, as] = score ?? [0, 0];
    const focusScore = side === "home" ? hs : as;
    const oppScore = side === "home" ? as : hs;

    const brandLogo = await loadImage(logoSrc);
    const focusLogo = await loadImage(focusTeam.logo);

    ctx.fillStyle = "#d8d4cc";
    ctx.fillRect(0, 0, W, H);

    const margin = 28;
    const headerH = 150;
    const footerH = 64;
    const headerY = margin;
    const footerY = H - margin - footerH;
    const pitchY = headerY + headerH + 8;
    const pitchH = footerY - pitchY - 10;
    const pitchX = margin;
    const pitchW = W - margin * 2;
    const centerX = W / 2;

    ctx.textAlign = "center";
    ctx.fillStyle = "#0b1f3a";
    ctx.font = `900 56px ${FONT}`;
    ctx.fillText(truncateText(ctx, focusTeam.name ?? "Team", pitchW - 40), centerX, headerY + 62);

    const metaBits = [];
    if (focusFormation) metaBits.push(String(focusFormation));
    metaBits.push(`${focusScore}–${oppScore} vs ${oppTeam.name ?? "Opponent"}`);
    const gw = String(matchday ?? "").trim();
    if (gw) metaBits.push(gw);
    ctx.fillStyle = "#3d4f66";
    ctx.font = `700 22px ${FONT}`;
    ctx.fillText(truncateText(ctx, metaBits.join("  ·  "), pitchW - 60), centerX, headerY + 102);

    const subBits = [String(leagueName ?? "").trim(), time, venue]
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    if (subBits.length) {
      ctx.fillStyle = "#6a7a8c";
      ctx.font = `600 18px ${FONT}`;
      ctx.fillText(truncateText(ctx, subBits.join("  ·  "), pitchW - 80), centerX, headerY + 132);
    }

    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 18);
        ctx.save();
        ctx.clip();
    drawLineup11Pitch(ctx, pitchX, pitchY, pitchW, pitchH);
    const boardH = Math.max(28, Math.round(pitchH * 0.055));
    drawPitchMarkings(ctx, pitchX + 18, pitchY + boardH + 8, pitchW - 36, pitchH - boardH - 28);

    const vig = ctx.createRadialGradient(
      pitchX + pitchW / 2,
      pitchY + pitchH * 0.55,
      pitchW * 0.15,
      pitchX + pitchW / 2,
      pitchY + pitchH * 0.55,
      pitchW * 0.75,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = vig;
    ctx.fillRect(pitchX, pitchY, pitchW, pitchH);

    if (!focusRows?.length) {
    ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText("Lineup not available", pitchX + pitchW / 2, pitchY + pitchH / 2);
    } else {
      const rowCount = focusRows.length;
      const scale = Math.max(0.85, Math.min(1.15, pitchW / 980));
      const padTop = 56 + boardH;
      const padBottom = focusCoach ? 96 : 56;
      const innerY = pitchY + padTop;
      const innerH = pitchH - padTop - padBottom;
      const layout =
        typeof pitchTokenPercents === "function"
          ? pitchTokenPercents
          : (r, rows, c, cols) => ({
              top: rows > 1 ? 90 - (r / (rows - 1)) * 78 : 50,
              left: ((c + 1) / (cols + 1)) * 100,
            });

      const outfieldKit = teamKitColors(focusTeam, { isGk: false });
      const gkKit = teamKitColors(focusTeam, { isGk: true });

      focusRows.forEach((row, r) => {
        const isGkRow = r === 0;
        row.forEach((p, c) => {
          const { left: leftPct, top: topPct } = layout(r, rowCount, c, row.length);
          const px = pitchX + (leftPct / 100) * pitchW;
          const py = innerY + (topPct / 100) * innerH;
          const isGk = isGkRow || String(p.tag ?? "").toUpperCase() === "GK";
          drawJerseyToken(ctx, px, py - 8, p, {
            kit: isGk ? gkKit : outfieldKit,
            crest: focusLogo,
            scale,
          });
          drawLineup11PlayerName(ctx, px, py + 42 * scale, p, { maxW: 130 * scale });
        });
      });
    }

    if (focusCoach) {
    ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `700 14px ${FONT}`;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 4;
      ctx.fillText("MANAGER", pitchX + pitchW / 2, pitchY + pitchH - 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText(truncateText(ctx, focusCoach, pitchW - 80), pitchX + pitchW / 2, pitchY + pitchH - 24);
      ctx.shadowBlur = 0;
    }

      ctx.restore();

    roundRect(ctx, pitchX, pitchY, pitchW, pitchH, 18);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const footCy = footerY + footerH / 2;
    if (brandLogo) {
      const bw = 28;
      ctx.drawImage(brandLogo, W - margin - 210, footCy - bw / 2, bw, bw);
    }
    ctx.fillStyle = "#0b1f3a";
    ctx.font = `900 26px ${FONT}`;
    ctx.fillText("SQUAD CENTRAL", W - margin - 8, footCy);
    ctx.textBaseline = "alphabetic";

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
    renderSquadDepthShareImage,
    renderGameweekShareImage,
    renderTransfersShareImage,
    renderLineupShareImage,
    exportShareImage,
  };
})(typeof window !== "undefined" ? window : global);
