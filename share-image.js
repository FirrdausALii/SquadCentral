/**
 * Social share image generator — 1122 × 1402 px templates for squad lists and gameweeks.
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
      showClub = false,
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
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(truncateText(ctx, team?.name ?? "Team", textMax), textX, PAD + 62);

    ctx.fillStyle = THEME.muted;
    ctx.font = `500 26px ${FONT}`;
    const meta = [leagueName, team?.coach ? `Coach ${team.coach}` : "", formation ? formation : ""]
      .filter(Boolean)
      .join("  ·  ");
    ctx.fillText(truncateText(ctx, meta, textMax), textX, PAD + 102);

    ctx.textAlign = "right";
    ctx.fillStyle = THEME.faint;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(`${players.length}`, W - PAD - 28, PAD + 62);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText("PLAYERS", W - PAD - 28, PAD + 88);

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

    const bodyTop = PAD + headerH + 24;
    const bodyH = H - bodyTop - PAD - 48;
    drawPanel(ctx, PAD, bodyTop, W - PAD * 2, bodyH);

    const innerX = PAD + 24;
    const innerW = W - PAD * 2 - 48;
    let y = bodyTop + 36;

    const colNum = innerX;
    const colName = innerX + (showNumber ? 52 : 8);
    const colRole = innerW - 200 + innerX;
    const colNat = innerW - 72 + innerX;
    const nameMax = colRole - colName - 120;

    ctx.fillStyle = THEME.faint;
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = "left";
    if (showNumber) ctx.fillText("#", colNum, y);
    ctx.fillText("PLAYER", colName, y);
    if (showPos) {
      ctx.textAlign = "center";
      ctx.fillText("POS", colRole + 28, y);
    }
    if (showNat) {
      ctx.textAlign = "left";
      ctx.fillText("NATION", colNat, y);
    }
    y += 18;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(innerX, y);
    ctx.lineTo(innerX + innerW, y);
    ctx.stroke();
    y += 28;

    const totalRows =
      grouped.reduce((n, g) => n + g.players.length, 0) + grouped.length;
    const avail = bodyTop + bodyH - 24 - y;
    const rowH = Math.max(34, Math.min(44, Math.floor(avail / Math.max(totalRows, 1))));

    for (const group of grouped) {
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 18px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(group.label, innerX, y + 4);
      ctx.textAlign = "right";
      ctx.fillStyle = THEME.faint;
      roundRect(ctx, innerX + innerW - 36, y - 16, 36, 24, 6);
      ctx.fillStyle = THEME.surface2;
      ctx.fill();
      ctx.strokeStyle = THEME.border;
      ctx.stroke();
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 16px ${FONT}`;
      ctx.fillText(String(group.players.length), innerX + innerW - 8, y + 2);
      y += 26;

      for (const p of group.players) {
        const midY = y + rowH / 2 + 6;
        ctx.textAlign = "left";

        if (showNumber) {
          ctx.fillStyle = THEME.faint;
          ctx.font = `600 22px ${FONT}`;
          ctx.fillText(String(p.number ?? ""), colNum, midY);
        }

        let nameX = colName;
        ctx.fillStyle = THEME.text;
        ctx.font = `600 26px ${FONT}`;
        const displayName = stripCaptain(p.name);
        ctx.fillText(truncateText(ctx, displayName, nameMax), nameX, midY);
        nameX += ctx.measureText(truncateText(ctx, displayName, nameMax)).width + 10;

        if (p.captain) {
          roundRect(ctx, nameX, midY - 18, 24, 22, 4);
          ctx.fillStyle = THEME.accent;
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = `800 14px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText("C", nameX + 12, midY - 2);
          nameX += 32;
        }

        if (dutyIds?.has?.(p.id)) {
          roundRect(ctx, nameX, midY - 18, 52, 22, 6);
          ctx.fillStyle = THEME.intlBg;
          ctx.fill();
          ctx.fillStyle = THEME.intlText;
          ctx.font = `800 12px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText("INT'L", nameX + 26, midY - 2);
        }

        if (showPos) {
          const role = p.role ?? p.pos;
          const colors = roleTagColors(role, p.pos);
          const tag = String(role).toUpperCase();
          const tagW = Math.max(44, ctx.measureText(tag).width + 18);
          roundRect(ctx, colRole, midY - 18, tagW, 24, 6);
          ctx.fillStyle = colors.bg;
          ctx.fill();
          ctx.fillStyle = colors.text;
          ctx.font = `800 14px ${FONT}`;
          ctx.textAlign = "center";
          ctx.fillText(tag, colRole + tagW / 2, midY - 1);
        }

        if (showNat) {
          ctx.textAlign = "left";
          ctx.fillStyle = THEME.muted;
          ctx.font = `500 22px ${FONT}`;
          const flag = playerFlag(p, helpers);
          const natLabel = truncateText(ctx, p.nationality ?? "—", 180);
          if (flag) {
            ctx.font = `22px ${FONT}`;
            ctx.fillText(flag, colNat, midY);
            ctx.font = `500 22px ${FONT}`;
            ctx.fillText(natLabel, colNat + 34, midY);
          } else {
            ctx.fillText(natLabel, colNat, midY);
          }
        }

        if (showClub && p.club) {
          ctx.fillStyle = THEME.faint;
          ctx.font = `500 18px ${FONT}`;
          ctx.fillText(truncateText(ctx, p.club, 160), colName, midY + 18);
        }

        y += rowH;
      }
      y += 6;
    }

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

    const headerH = 180;
    drawPanel(ctx, PAD, PAD, W - PAD * 2, headerH);
    ctx.textAlign = "left";
    ctx.fillStyle = THEME.muted;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(String(leagueName).toUpperCase(), PAD + 32, PAD + 52);
    ctx.fillStyle = THEME.text;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(truncateText(ctx, title, W - PAD * 2 - 64), PAD + 32, PAD + 112);
    ctx.fillStyle = THEME.muted;
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(truncateText(ctx, dateRange || "—", W - PAD * 2 - 64), PAD + 32, PAD + 152);

    const groups = new Map();
    for (const m of matches) {
      const day = m.dayLabel || m.time || "—";
      const list = groups.get(day) ?? [];
      list.push(m);
      groups.set(day, list);
    }

    const bodyTop = PAD + headerH + 24;
    const bodyH = H - bodyTop - PAD - 48;
    drawPanel(ctx, PAD, bodyTop, W - PAD * 2, bodyH);

    const innerX = PAD + 28;
    const innerW = W - PAD * 2 - 56;
    let y = bodyTop + 40;

    const flatCount = matches.length + groups.size;
    const avail = bodyTop + bodyH - 32 - y;
    const blockH = Math.max(56, Math.min(88, Math.floor(avail / Math.max(flatCount, 1))));

    for (const [day, list] of groups.entries()) {
      ctx.fillStyle = THEME.muted;
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(String(day).toUpperCase(), innerX, y);
      y += 28;

      for (const m of list) {
        const ht = teamById.get(m.homeTeamId);
        const at = teamById.get(m.awayTeamId);
        const [hs, as] = m.score ?? [0, 0];
        const rowY = y;
        roundRect(ctx, innerX, rowY, innerW, blockH - 8, 12);
        ctx.fillStyle = THEME.surface2;
        ctx.fill();

        const midY = rowY + (blockH - 8) / 2 + 8;
        ctx.font = `700 30px ${FONT}`;
        ctx.fillStyle = THEME.text;
        ctx.textAlign = "right";
        const homeName = truncateText(ctx, ht?.name ?? "Home", 320);
        ctx.fillText(homeName, innerX + innerW / 2 - 70, midY);

        ctx.textAlign = "center";
        ctx.fillStyle = THEME.accent;
        ctx.font = `800 34px ${FONT}`;
        ctx.fillText(`${hs}  –  ${as}`, innerX + innerW / 2, midY);

        ctx.textAlign = "left";
        ctx.fillStyle = THEME.text;
        ctx.font = `700 30px ${FONT}`;
        const awayName = truncateText(ctx, at?.name ?? "Away", 320);
        ctx.fillText(awayName, innerX + innerW / 2 + 70, midY);

        if (showStatus && m.status) {
          ctx.textAlign = "right";
          ctx.fillStyle = THEME.faint;
          ctx.font = `700 16px ${FONT}`;
          ctx.fillText(String(m.status).toUpperCase(), innerX + innerW - 16, rowY + 22);
        }

        y += blockH;
      }
      y += 8;
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
    exportShareImage,
  };
})(typeof window !== "undefined" ? window : global);
