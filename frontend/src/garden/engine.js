// The star garden engine (originally a single-file prototype, since retired).
// It draws and animates the scene only. It owns no records: the React component tells it
// when a save succeeded (dropStar) and hears back when a star reaches the jar (onCatch).

const PREFS_KEY = "atlas-garden-prefs";
export function loadPrefs() {
  const p = { muted: false, music: true, lastDog: -1, collapsed: false };
  try { Object.assign(p, JSON.parse(localStorage.getItem(PREFS_KEY)) || {}); } catch (e) {}
  return p;
}
export function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} }

/**
 * @param {HTMLCanvasElement} cv
 * @param {{ coat: string, caught: number, waiting: number, onCatch: () => void }} opts
 */
export function createGarden(cv, opts) {
  const state = { coat: opts.coat, caught: opts.caught };
  const prefs = loadPrefs();
  const save = () => savePrefs(prefs);
  const listeners = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); listeners.push([target, type, fn, o]); };
  let alive = true;

  // ================= Palette and dogs =================
  const OUT = "#1a1426";
  const BRIDGE_DOGS = [
    { name: "Kuro",   ears: "floppy", fluffy: true,
      pal: { c: "#2d2836", d: "#4a4460", m: "#a39eb0", w: "#3a3446", h: "#4e4760" } },
    { name: "Attila", ears: "floppy",
      pal: { c: "#2d2836", d: "#4a4460", m: "#4a4460", w: "#f4f1ec", h: "#4e4760" } },
    { name: "Gladys", ears: "floppy", fluffy: true,
      pal: { c: "#f0b04a", d: "#c98323", m: "#ffd88a", w: "#f8c66a", h: "#ffd17a" } },
    { name: "Lucky",  ears: "cocker",
      pal: { c: "#f2cf94", d: "#c9954f", m: "#fae6c2", w: "#fae6c2", h: "#fff0d4" } },
  ];
  // Australian Shepherd coats: merle patches (p1, p2), white blaze/chest/paws (w), copper points (cu)
  const COATS = {
    blue: { aussie: true, c: "#a7afc0", f: "#7d8598", d: "#2d2836", m: "#f7f4ef", h: "#c8cedb",
            p1: "#2d2836", p2: "#5d6478", w: "#f7f4ef", cu: "#c96a2b", eye: "#3d9bff" },
    red:  { aussie: true, c: "#e2b39a", f: "#c08f77", d: "#9a4a28", m: "#f7f4ef", h: "#f0cdb9",
            p1: "#9a4a28", p2: "#c47a52", w: "#f7f4ef", cu: "#c96a2b", eye: "#b8862f" },
    tri:  { aussie: true, c: "#2d2836", f: "#1e1a25", d: "#3a3446", m: "#f7f4ef", h: "#4e4760",
            w: "#f7f4ef", cu: "#c96a2b" },
    // black saddle (s) over a tan coat
    saddle: { c: "#c98a4a", f: "#a8692f", d: "#8a4f22", m: "#e0b27a", h: "#dba066", s: "#2d2836" },
    golden: { c: "#f0b04a", f: "#c98323", d: "#c98323", m: "#ffd88a", h: "#ffd17a" },
    black:  { c: "#2d2836", f: "#1e1a25", d: "#4a4460", m: "#5d5670", h: "#4e4760" },
    brown:  { c: "#9a5f35", f: "#744523", d: "#744523", m: "#c48a5c", h: "#b27648" },
    cream:  { c: "#f4ead8", f: "#d6c6a8", d: "#d6c6a8", m: "#fffaf0", h: "#fffdf7" },
    grey:   { c: "#a9a5b6", f: "#858195", d: "#858195", m: "#d0ccdb", h: "#c3bfd0" },
  };
  // ================= Canvas =================
  const W = 400, H = 225, GROUND = 195;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  // Sprites are drawn with chunky 2x2 pixels (S), on top of a 1x background.
  const S = 2;
  // Parts are [x, y, w, h, colourKey, outlined?] in sprite pixels relative to an origin; outlines are drawn first.
  function drawParts(c, parts, ox, oy, flip, pal) {
    ox = Math.round(ox); oy = Math.round(oy);
    const X = (rx, w) => flip ? ox - (rx + w) * S : ox + rx * S;
    for (const p of parts) if (p[5] !== false) rect(c, X(p[0], p[2]) - S, oy + (p[1] - 1) * S, (p[2] + 2) * S, (p[3] + 2) * S, OUT);
    for (const p of parts) rect(c, X(p[0], p[2]), oy + p[1] * S, p[2] * S, p[3] * S, pal[p[4]] || p[4]);
  }
  function dot(c, rx, ry, col, ox, oy, flip, w = 1, h = 1) {
    ox = Math.round(ox); oy = Math.round(oy);
    rect(c, flip ? ox - (rx + w) * S : ox + rx * S, oy + ry * S, w * S, h * S, col);
  }

  // ================= Bitmap font (3x5) =================
  const FONT = {
    A:[".#.","#.#","###","#.#","#.#"], B:["##.","#.#","##.","#.#","##."], C:[".##","#..","#..","#..",".##"],
    D:["##.","#.#","#.#","#.#","##."], E:["###","#..","##.","#..","###"], F:["###","#..","##.","#..","#.."],
    G:[".##","#..","#.#","#.#",".##"], H:["#.#","#.#","###","#.#","#.#"], I:["###",".#.",".#.",".#.","###"],
    J:["..#","..#","..#","#.#",".#."], K:["#.#","#.#","##.","#.#","#.#"], L:["#..","#..","#..","#..","###"],
    M:["#.#","###","###","#.#","#.#"], N:["##.","#.#","#.#","#.#","#.#"], O:[".#.","#.#","#.#","#.#",".#."],
    P:["##.","#.#","##.","#..","#.."], Q:[".#.","#.#","#.#","##.",".##"], R:["##.","#.#","##.","#.#","#.#"],
    S:[".##","#..",".#.","..#","##."], T:["###",".#.",".#.",".#.",".#."], U:["#.#","#.#","#.#","#.#","###"],
    V:["#.#","#.#","#.#","#.#",".#."], W:["#.#","#.#","###","###","#.#"], X:["#.#","#.#",".#.","#.#","#.#"],
    Y:["#.#","#.#",".#.",".#.",".#."], Z:["###","..#",".#.","#..","###"],
    0:["###","#.#","#.#","#.#","###"], 1:[".#.","##.",".#.",".#.","###"], 2:["##.","..#",".#.","#..","###"],
    3:["##.","..#",".#.","..#","##."], 4:["#.#","#.#","###","..#","..#"], 5:["###","#..","##.","..#","##."],
    6:[".##","#..","###","#.#","###"], 7:["###","..#",".#.",".#.",".#."], 8:["###","#.#","###","#.#","###"],
    9:["###","#.#","###","..#","##."], "!":[".#.",".#.",".#.","...",".#."], ".":["...","...","...","...",".#."],
    ",":["...","...","...",".#.","#.."], ":":["...",".#.","...",".#.","..."], "'":[".#.",".#.","...","...","..."],
    "-":["...","...","###","...","..."], "?":["##.","..#",".#.","...",".#."],
  };
  const textWidth = s => [...s].reduce((w, ch) => w + (ch === " " ? 3 : 4), 0) - 1;
  function drawText(s, x, y, col, align = "left", shadow = OUT) {
    s = s.toUpperCase();
    let cx = Math.round(align === "center" ? x - textWidth(s) / 2 : x);
    for (const ch of s) {
      if (ch === " ") { cx += 3; continue; }
      const g = FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === "#") {
        if (shadow) rect(ctx, cx + k + 1, y + r + 1, 1, 1, shadow);
        rect(ctx, cx + k, y + r, 1, 1, col);
      }
      cx += 4;
    }
  }

  // ================= Static layers, drawn once =================
  function layer(draw) { const c = document.createElement("canvas"); c.width = W; c.height = H; draw(c.getContext("2d")); return c; }
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const BRIDGE = { cx: 200, cy: 220, r: 188, band: 5 };
  const RAINBOW = ["#ff004d", "#ff8b1f", "#ffe14d", "#3ddc84", "#29adff", "#6f5bff", "#c86bff"];

  const skyLayer = layer(c => {
    const bands = [["#3a8ee6", 0], ["#55a8f0", 32], ["#7cc4f6", 65], ["#a8dcf8", 100], ["#ffc9e4", 137], ["#ffe0b8", 167]];
    for (let y = 0; y < H; y++) {
      let i = 0; while (i + 1 < bands.length && y >= bands[i + 1][1]) i++;
      const next = bands[i + 1];
      for (let x = 0; x < W; x++) {
        const dither = next && y >= next[1] - 2 && (x + y) % 2 === 0;
        rect(c, x, y, 1, 1, dither ? next[0] : bands[i][0]);
      }
    }
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= 9) rect(c, 370 + x, 28 + y, 1, 1, d < 5 && x < 0 && y < 0 ? "#fffbd0" : "#fff27a");
      else if (d <= 10) rect(c, 370 + x, 28 + y, 1, 1, "#ff9f1c");
    }
  });

  const groundLayer = layer(c => {
    // rainbow bridge, pixel by pixel, with a dark outline
    for (let y = 0; y <= GROUND; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x + 0.5 - BRIDGE.cx, y + 0.5 - BRIDGE.cy);
      const inner = BRIDGE.r - BRIDGE.band * RAINBOW.length;
      if (d >= BRIDGE.r && d < BRIDGE.r + 1) rect(c, x, y, 1, 1, OUT);
      else if (d >= inner - 1 && d < inner) rect(c, x, y, 1, 1, OUT);
      else if (d >= inner && d < BRIDGE.r) rect(c, x, y, 1, 1, RAINBOW[Math.floor((BRIDGE.r - d) / BRIDGE.band)]);
    }
    // hills
    const hill = (cx, cy, rx, ry, col, light) => {
      for (let x = Math.max(0, cx - rx); x < Math.min(W, cx + rx); x++) {
        const top = Math.round(cy - ry * Math.sqrt(1 - ((x - cx) / rx) ** 2));
        if (top >= GROUND) continue;
        rect(c, x, top, 1, GROUND - top, col);
        rect(c, x, top - 1, 1, 1, "#1d5e33");
        for (let y = top + 3; y < GROUND; y += 6) if ((x * 7 + y * 3) % 11 === 0) rect(c, x, y, 1, 1, light);
      }
    };
    hill(319, 225, 162, 45, "#3fb058", "#6fd57c");
    hill(88, 222, 150, 42, "#4cc35f", "#7fe08a");
    // grass
    rect(c, 0, GROUND, W, H - GROUND, "#4cc35f");
    rect(c, 0, GROUND, W, 1, "#1d5e33");
    rect(c, 0, GROUND + 1, W, 1, "#8be36a");
    for (let y = GROUND + 12; y < H; y++) for (let x = 0; x < W; x++) if (y > GROUND + 15 || (x + y) % 2 === 0) rect(c, x, y, 1, 1, "#3a9f4f");
    for (let x = 0; x < W; x += 4) rect(c, x, GROUND - 1, 1, 1, "#1d5e33");
    // flowers
    const petals = ["#ff5fa2", "#ffe14d", "#ffffff", "#c86bff"];
    for (let i = 0; i < 26; i++) {
      const x = Math.round(rand() * (W - 6)) + 3, y = GROUND + 4 + Math.round(rand() * 16), p = petals[i % 4];
      rect(c, x - 1, y, 1, 1, p); rect(c, x + 1, y, 1, 1, p); rect(c, x, y - 1, 1, 1, p); rect(c, x, y + 1, 1, 1, p);
      rect(c, x, y, 1, 1, "#ff8b1f");
    }
    // dog bed and water bowl
    drawParts(c, [
      [0, -5, 26, 5, "#d9503f"], [0, -8, 4, 3, "#d9503f"], [22, -8, 4, 3, "#d9503f"],
      [4, -6, 18, 2, "#ffb8a0", false], [1, -4, 24, 1, "#ff7a5c", false],
    ], 6, GROUND, false, {});
    drawParts(c, [[0, -3, 8, 3, "#2f6fd6"], [1, -4, 6, 1, "#9fe0ff"]], 150, GROUND, false, {});
  });

  // ================= Sprites =================
  const STAR = ["...y...", "..yyy..", "yyyyyyy", ".yyyyy.", "..yyy..", ".yy.yy.", ".y...y."];
  function drawStarSprite(x, y, twinkle) {
    x = Math.round(x) - 3 * S; y = Math.round(y) - 3 * S;
    const px = (k, r, col) => rect(ctx, x + k * S, y + r * S, S, S, col);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
      STAR.forEach((row, r) => [...row].forEach((ch, k) => { if (ch === "y") px(k + ox, r + oy, OUT); }));
    STAR.forEach((row, r) => [...row].forEach((ch, k) => { if (ch === "y") px(k, r, "#ffe14d"); }));
    px(3, 2, twinkle ? "#ffffff" : "#fff7b0"); px(3, 3, twinkle ? "#ffffff" : "#fff7b0");
    if (twinkle) { px(-2, -1, "#ffffff"); px(8, 1, "#ffffff"); }
  }
  function miniStar(x, y, s = 1) {
    rect(ctx, x, y - s, s, 3 * s, "#ffe14d"); rect(ctx, x - s, y, 3 * s, s, "#ffe14d"); rect(ctx, x, y, s, s, "#fff7b0");
  }

  function drawBridgeDog(d, t) {
    const wagFast = d.hop > 0;
    const wag = Math.floor(t * (wagFast ? 14 : 4) + d.phase) % 2;
    const hop = d.hop > 0 ? -Math.round(Math.sin((1 - d.hop / 0.6) * Math.PI) * 4) * S : 0;
    const ox = d.x, oy = d.y + hop, pal = d.pal;
    const parts = [[4, wag ? -4 : -3, 2, 1, "d"]];
    if (d.ears === "pointy") parts.push([-3, -14, 2, 2, "d"], [2, -14, 2, 2, "d"]);
    if (d.ears === "cocker") parts.push([-5, -11, 2, 8, "d"], [4, -11, 2, 8, "d"], [-2, -13, 5, 1, "d"]);
    if (d.ears === "floppy") parts.push([-5, -11, 2, 5, "d"], [4, -11, 2, 5, "d"]);
    parts.push([-3, -6, 7, 6, "c"]);
    if (d.fluffy) parts.push([-4, -7, 9, 2, "c"]);
    parts.push([-3, -12, 7, 6, "c"]);
    if (d.ears !== "pointy") parts.push([d.ears === "cocker" ? -5 : -5, -11, 2, d.ears === "cocker" ? 8 : 5, "d", false],
                                        [4, -11, 2, d.ears === "cocker" ? 8 : 5, "d", false]);
    parts.push([-1, -5, 3, 4, "w", false], [-3, -1, 2, 1, "w", false], [2, -1, 2, 1, "w", false],
               [-2, -12, 4, 1, "h", false], [-1, -9, 3, 2, "m", false]);
    drawParts(ctx, parts, ox, oy, false, pal);
    const blink = (t + d.phase) % 4 < 0.15;
    if (!blink) { dot(ctx, -2, -11, "#ffffff", ox, oy, false); dot(ctx, 2, -11, "#ffffff", ox, oy, false);
                  dot(ctx, -2, -10, OUT, ox, oy, false); dot(ctx, 2, -10, OUT, ox, oy, false); }
    else { dot(ctx, -2, -10, OUT, ox, oy, false); dot(ctx, 2, -10, OUT, ox, oy, false); }
    dot(ctx, 0, -9, OUT, ox, oy, false);
    dot(ctx, -3, -8, "#ff9eb5", ox, oy, false); dot(ctx, 3, -8, "#ff9eb5", ox, oy, false);
    // halo
    const hy = (d.ears === "pointy" ? -19 : -17) + (Math.floor(t * 2 + d.phase) % 2);
    const halo = "#ffe14d";
    dot(ctx, -2, hy, halo, ox, oy, false, 5, 1); dot(ctx, -2, hy + 2, halo, ox, oy, false, 5, 1);
    dot(ctx, -3, hy + 1, halo, ox, oy, false); dot(ctx, 3, hy + 1, halo, ox, oy, false);
    drawText(d.name, d.x + 1, d.y + 4, "#ffffff", "center");
  }

  function drawPup(t) {
    const k = pup, pal = COATS[state.coat] || COATS.blue, flip = k.dir < 0, A = !!pal.aussie;
    const air = k.jy < 0;
    // standing still on the dog bed: lie down and fall asleep straight away
    const lying = k.x <= BED_RIGHT && !k.moving && !air && k.idle > 0.6;
    const sleepy = lying || (k.idle > 9 && !k.moving && !air);
    const frame = air ? 2 : k.moving ? Math.floor(k.phase / 0.14) % 2 : -1;
    const b = lying ? 1 : frame === 1 ? -1 : 0;
    // legs tuck up in the air; lying down they fold away under the body
    const lift = (n) => lying ? -8 : frame === 2 || frame === n ? -5 : -4;
    const wag = lying ? 0 : Math.floor(t * (k.happy > 0 ? 12 : 3)) % 2;
    const ox = k.x, oy = GROUND + Math.round(k.jy);
    // shadow stays on the ground and shrinks while jumping
    const sw = Math.max(20, 44 + Math.round(k.jy));
    if (!lying) rect(ctx, Math.round(ox) - sw / 2 + 2, GROUND, sw, 1, "#2f8f45");
    const parts = [[-6, lift(1), 2, 4, "f"], [4, lift(0), 2, 4, "f"]];
    if (A) parts.push([-10 + wag, -11 + b, 2, 2, "c"]);                       // bobbed tail
    else parts.push([-11 + wag, -15 + b, 3, 3, "c"], [-10, -12 + b, 3, 3, "c"]);
    parts.push([-8, -10 + b, 15, 6, "c"]);
    if (A) parts.push([-9, -7 + b, 2, 3, "c"]);                                // fluffy "pants"
    parts.push([3, -13 + b, 4, 4, "c"]);
    if (A) parts.push([5, -20 + b, 3, 2, "d"], [8, -20 + b, 1, 2, "d"]);       // ears folded forward
    if (pal.s) parts.push([-8, -10 + b, 12, 3, "s", false], [-11 + wag, -15 + b, 3, 2, "s", false]); // black saddle and tail tip
    parts.push([4, -18 + b, 7, 6, "c"], [10, -15 + b, 3, 3, "m"],
               [-4, lift(0), 2, 4, "c"], [6, lift(1), 2, 4, A ? "w" : "c"],
               [-6, -10 + b, 9, 1, "h", false], [5, -18 + b, 4, 1, "h", false]);
    if (A) {
      if (pal.p1) parts.push(                                                   // merle patches
        [-6, -9 + b, 3, 2, "p1", false], [-1, -8 + b, 2, 2, "p2", false], [2, -10 + b, 3, 2, "p1", false],
        [-4, -6 + b, 2, 1, "p2", false], [5, -18 + b, 2, 2, "p1", false], [-9, -6 + b, 1, 2, "p2", false]);
      parts.push([5, -12 + b, 3, 5, "w", false], [3, -7 + b, 3, 2, "w", false],  // white chest ruff
                 [9, -18 + b, 2, 3, "w", false]);                               // white blaze
      for (const [x, n] of [[-6, 1], [4, 0], [-4, 0], [6, 1]]) parts.push([x, lift(n) + 3, 2, 1, "w", false]); // white paws
      if (!pal.p1) parts.push([-4, lift(0) + 2, 2, 1, "cu", false], [-6, lift(1) + 2, 2, 1, "cu", false]); // copper legs (tri)
    }
    parts.push([4, -13 + b, 2, 3, "#e43b44", false]);
    drawParts(ctx, parts, ox, oy, flip, pal);
    if (!A) drawParts(ctx, [[5, -18 + b, 3, 5, "d"]], ox, oy, flip, pal);       // floppy ear hanging over the head
    dot(ctx, 12, -15 + b, OUT, ox, oy, flip);
    if (sleepy) dot(ctx, 7, -15 + b, OUT, ox, oy, flip, 2, 1);
    else { dot(ctx, 8, -16 + b, "#ffffff", ox, oy, flip); dot(ctx, 8, -15 + b, pal.eye || OUT, ox, oy, flip); }
    if (A) { dot(ctx, 8, -17 + b, pal.cu, ox, oy, flip); dot(ctx, 9, -14 + b, pal.cu, ox, oy, flip); }  // copper brow and cheek
    else dot(ctx, 9, -14 + b, "#ff9eb5", ox, oy, flip);
    if (k.happy > 0 && !sleepy) dot(ctx, 11, -12 + b, "#ff7aa2", ox, oy, flip, 1, 2);
    if (sleepy) for (let i = 0; i < 3; i++) {
      const p = (t * 0.5 + i / 3) % 1;
      drawText("Z", ox + k.dir * (30 + p * 10), GROUND - 52 - Math.round(p * 16), "#ffffff");
    }
  }

  function drawJar() {
    const x = JAR.x, y = GROUND - 28;
    rect(ctx, x - 2, y - 2, 28, 30, OUT);
    rect(ctx, x, y, 24, 26, "#bfeaff");
    const n = Math.min(state.caught, 9);
    for (let i = 0; i < n; i++) miniStar(x + 4 + (i % 3) * 8, GROUND - 7 - Math.floor(i / 3) * 7, 2);
    rect(ctx, x + 20, y + 4, 2, 16, "#ffffff");
    rect(ctx, x + 1, y - 10, 22, 9, OUT);
    rect(ctx, x + 3, y - 8, 18, 5, "#a8642c");
  }

  function drawClouds() {
    for (const c of clouds) {
      const x = Math.round(c.x), y = c.y;
      rect(ctx, x + 2, y, 8, 3, "#ffffff"); rect(ctx, x + 8, y - 2, 8, 5, "#ffffff");
      rect(ctx, x, y + 2, 22, 4, "#ffffff"); rect(ctx, x + 1, y + 5, 20, 1, "#cfe6fb");
    }
  }

  // ================= Scene state =================
  const dogs = BRIDGE_DOGS.map((d, i) => {
    const a = [150, 118, 62, 30][i] * Math.PI / 180;
    return { ...d, x: Math.round(BRIDGE.cx + BRIDGE.r * Math.cos(a)), y: Math.round(BRIDGE.cy - BRIDGE.r * Math.sin(a)),
             hop: 0, phase: i * 1.7 };
  });
  const clouds = [{ x: 20, y: 14, v: 3 }, { x: 160, y: 46, v: 4 }, { x: 290, y: 12, v: 2.5 }];
  const JAR = { x: 90 };
  const STAR_REST = GROUND - 8;
  const BED_RIGHT = 54;   // the dog bed spans x 6–58; a dog stopped over it lies down to sleep
  const pup = { x: 250, dir: 1, phase: 0, moving: false, target: null, idle: 0, happy: 0, jy: 0, jvy: 0 };
  const stars = [], sparkles = [];
  let toast = null;

  // ================= Sakura petals (Ctrl+S / Cmd+S) =================
  const petals = [];
  function sakura() {
    for (let i = 0; i < 45 && petals.length < 220; i++) {
      petals.push({ x: Math.random() * (W + 60) - 60, y: -4 - Math.random() * 120, vy: 10 + Math.random() * 10,
                    sway: Math.random() * 6.28, sp: 1 + Math.random() * 1.5,
                    land: GROUND + 2 + Math.random() * 24, rest: 0, col: Math.random() < 0.5 ? "#ffb7d5" : "#ffd1e3" });
    }
    beep([[1047, 0.12], [1175, 0.12], [1397, 0.12], [1568, 0.3]], "triangle", 0.04);
  }
  function updatePetals(dt, t) {
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      if (p.y < p.land) {
        p.y += p.vy * dt;
        p.x += (Math.sin(t * p.sp + p.sway) * 14 + 6) * dt;   // sway, with a light breeze to the right
      } else if ((p.rest += dt) > 2.5) petals.splice(i, 1);  // settle on the grass, then fade away
    }
  }
  function drawPetals(t) {
    for (const p of petals) {
      if (p.rest > 1.8 && Math.floor(p.rest * 10) % 2) continue;   // blink out, arcade style
      const x = Math.round(p.x), y = Math.round(p.y);
      const tumble = p.y < p.land ? Math.floor(t * 4 * p.sp + p.sway) % 2 : 0;
      rect(ctx, x, y, 2, 2, p.col);
      if (tumble) rect(ctx, x + 2, y + 2, 2, 2, "#ff8fbf");
      else rect(ctx, x + 2, y, 2, 2, "#ff8fbf");
    }
  }
  // At most a dozen stars wait on the grass; the rest stay in reserve and appear one by one
  // as stars are caught, so a long gap between visits never buries the scene.
  const MAX_RESTING = 12;
  let reserve = Math.max(0, opts.waiting - MAX_RESTING);
  const restStar = () => stars.push({ x: 150 + Math.random() * 150, y: STAR_REST, vy: 0, state: "rest", t: Math.random() * 6 });
  for (let i = 0; i < Math.min(opts.waiting, MAX_RESTING); i++) restStar();

  // ================= Sound (chiptune) =================
  let actx = null;
  let musicTimer = null, nextNoteTime = 0, step = 0, gestured = false;
  function audio() {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function beep(notes, type = "square", vol = 0.05) {
    if (prefs.muted || !gestured) return;
    try {
      audio();
      let at = actx.currentTime;
      for (const [f, dur] of notes) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(g).connect(actx.destination); o.start(at); o.stop(at + dur);
        at += dur * 0.8;
      }
    } catch (e) {}
  }
  const coin = () => beep([[988, 0.08], [1319, 0.3]]);
  const drop = () => beep([[1568, 0.06], [1175, 0.06], [784, 0.12]], "triangle", 0.08);

  // ================= Music: an original 70s-arcade-style loop =================
  // 4 bars (C, Am, F, G), 16 sixteenth-note steps each; numbers are MIDI notes, 0 is a rest.
  const LEAD = [
    72,0,76,0, 79,0,76,0, 77,0,76,0, 74,0,72,0,
    69,0,72,0, 76,0,74,0, 72,0,0,0,  69,0,0,0,
    65,0,69,0, 72,0,74,0, 76,0,74,0, 72,0,69,0,
    71,0,74,0, 79,0,77,0, 76,0,74,0, 71,0,0,0,
  ];
  const BASS = [
    48,0,0,0, 55,0,0,0, 48,0,0,0, 55,0,0,0,
    45,0,0,0, 52,0,0,0, 45,0,0,0, 52,0,0,0,
    41,0,0,0, 48,0,0,0, 41,0,0,0, 48,0,0,0,
    43,0,0,0, 50,0,0,0, 43,0,0,0, 50,0,0,0,
  ];
  const STEP = 60 / 104 / 4;
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  function tone(freq, at, dur, type, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(actx.destination); o.start(at); o.stop(at + dur + 0.02);
  }
  function scheduleMusic() {
    while (nextNoteTime < actx.currentTime + 0.15) {
      const i = step % LEAD.length;
      if (LEAD[i]) tone(mtof(LEAD[i]), nextNoteTime, STEP * 1.7, "square", 0.022);
      if (BASS[i]) tone(mtof(BASS[i]), nextNoteTime, STEP * 3.6, "triangle", 0.07);
      nextNoteTime += STEP; step++;
    }
  }
  function startMusic() {
    if (!prefs.music || musicTimer || !gestured || !alive) return;
    try { audio(); nextNoteTime = actx.currentTime + 0.05; musicTimer = setInterval(scheduleMusic, 25); } catch (e) {}
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  // Browsers only allow audio after a click or key press; nothing plays before that (spec §5.7).
  const firstGesture = () => { gestured = true; startMusic(); };
  on(window, "pointerdown", firstGesture, { once: true });
  on(window, "keydown", firstGesture, { once: true });

  // ================= Stars =================
  function dropStar(message, forced) {
    let i = forced !== undefined ? forced : Math.floor(Math.random() * dogs.length);
    if (forced === undefined && i === prefs.lastDog) i = (i + 1 + Math.floor(Math.random() * (dogs.length - 1))) % dogs.length;
    prefs.lastDog = i; save();
    const d = dogs[i];
    d.hop = 0.6;
    stars.push({ x: d.x, y: d.y - 30, vy: -26, state: "fall", t: 0 });
    toast = { text: message(d.name), t: 3.6 };
    drop();
    return d.name;
  }

  function updateStars(dt) {
    const catchX = pup.x + pup.dir * 8;
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      s.t += dt;
      if (s.state === "fall") {
        s.vy = Math.min(s.vy + 30 * dt, 20);
        s.y += s.vy * dt;
        s.x = Math.max(10, Math.min(W - 10, s.x + Math.sin(s.t * 2.2) * 8 * dt));
        if (Math.random() < dt * 10) sparkles.push({ x: s.x, y: s.y - 8, life: 0.5 });
        if (s.y >= STAR_REST) { s.y = STAR_REST; s.state = "rest"; }
      }
      if ((s.state === "fall" || s.state === "rest") && Math.abs(s.x - catchX) < 22 && s.y > GROUND - 50 + pup.jy) {
        s.state = "fly"; s.t = 0; s.sx = s.x; s.sy = s.y;
        pup.happy = 1.6; pup.idle = 0; coin();
      }
      if (s.state === "fly") {
        const p = Math.min(1, s.t / 0.8), e = 1 - Math.pow(1 - p, 3), tx = JAR.x + 12, ty = GROUND - 14;
        s.x = s.sx + (tx - s.sx) * e;
        s.y = s.sy + (ty - s.sy) * e - Math.sin(p * Math.PI) * 40;
        if (p >= 1) {
          stars.splice(i, 1);
          state.caught += 1;
          opts.onCatch();
          if (reserve > 0) { reserve -= 1; restStar(); }
          for (let k = 0; k < 6; k++) sparkles.push({ x: tx + (Math.random() - .5) * 16, y: ty + (Math.random() - .5) * 12, life: 0.6 });
        }
      }
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      sparkles[i].life -= dt; sparkles[i].y -= 4 * dt;
      if (sparkles[i].life <= 0) sparkles.splice(i, 1);
    }
  }

  function drawStars(t) {
    for (const s of stars) drawStarSprite(s.x, s.y, Math.floor(s.t * 4) % 3 === 0);
    for (const p of sparkles) {
      if (p.life > 0.3) { rect(ctx, p.x, p.y - 1, 1, 3, "#ffffff"); rect(ctx, p.x - 1, p.y, 3, 1, "#ffffff"); }
      else rect(ctx, p.x, p.y, 1, 1, "#fff7b0");
    }
  }

  function drawUi(t) {
    miniStar(7, 8);
    drawText(String(state.caught).padStart(3, "0"), 12, 6, "#ffe14d");
    const waiting = stars.filter(s => s.state !== "fly").length + reserve;
    if (waiting) drawText(`${waiting} WAITING`, 5, 15, "#ffffff");
    if (toast && (toast.t > 0.6 || Math.floor(toast.t * 8) % 2 === 0)) {
      const s = toast.text, w = textWidth(s.toUpperCase()) + 10, x = Math.round(W / 2 - w / 2), y = 100;
      rect(ctx, x - 2, y - 2, w + 4, 15, "#f6f0ff");
      rect(ctx, x - 1, y - 1, w + 2, 13, OUT);
      drawText(s, W / 2, y + 3, "#ffe14d", "center", null);
    }
    const a = Math.PI + ((t * 0.08) % 1) * Math.PI, r = BRIDGE.r - 14;
    const sx = Math.round(BRIDGE.cx + Math.cos(a) * r), sy = Math.round(BRIDGE.cy + Math.sin(a) * r);
    if (sy < GROUND - 10) { rect(ctx, sx, sy - 1, 1, 3, "#ffffff"); rect(ctx, sx - 1, sy, 3, 1, "#ffffff"); }
  }

  // ================= Input =================
  const keys = { left: false, right: false };
  const isTyping = e => e.target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName);
  const isLeft = k => k === "ArrowLeft" || k === "a" || k === "A";
  const isRight = k => k === "ArrowRight" || k === "d" || k === "D";
  const isJump = k => k === "ArrowUp" || k === "w" || k === "W" || k === " ";
  // Keys only steer the dog while the garden is on screen, so arrow keys still scroll the page otherwise.
  const visible = () => { const r = cv.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.height > 0; };
  function jump() {
    if (pup.jy < 0) return;
    pup.jvy = -150; pup.idle = 0;
    beep([[523, 0.05], [784, 0.08]], "square", 0.035);
  }
  on(window, "keydown", e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { if (visible()) { e.preventDefault(); sakura(); } return; }
    if (isTyping(e) || !visible()) return;
    if (isLeft(e.key)) { keys.left = true; e.preventDefault(); }
    if (isRight(e.key)) { keys.right = true; e.preventDefault(); }
    if (isJump(e.key)) { jump(); e.preventDefault(); }
  });
  on(window, "keyup", e => { if (isLeft(e.key)) keys.left = false; if (isRight(e.key)) keys.right = false; });
  on(cv, "pointerdown", e => {
    const r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    if (Math.abs(x - pup.x) < 26 && y > GROUND - 50 + pup.jy && y < GROUND + 4) jump();
    else pup.target = x;
  });

  function updatePup(dt) {
    let dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) pup.target = null;
    else if (pup.target !== null) {
      const d = pup.target - (pup.x + pup.dir * 8);
      if (Math.abs(d) < 3) pup.target = null; else dir = Math.sign(d);
    }
    pup.moving = dir !== 0;
    if (pup.moving) { pup.dir = dir; pup.x += dir * 50 * dt; pup.phase += dt; pup.idle = 0; }
    else pup.idle += dt;
    pup.x = Math.max(28, Math.min(W - 28, pup.x));
    pup.happy = Math.max(0, pup.happy - dt);
    if (pup.jvy !== 0 || pup.jy < 0) {
      pup.jvy += 500 * dt; pup.jy += pup.jvy * dt;
      if (pup.jy >= 0) { pup.jy = 0; pup.jvy = 0; }
    }
  }

  // ================= Loop =================
  let last = performance.now(), raf = 0;
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    for (const c of clouds) { c.x += c.v * dt; if (c.x > W + 4) c.x = -26; }
    for (const d of dogs) d.hop = Math.max(0, d.hop - dt);
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
    updatePup(dt);
    updateStars(dt);
    updatePetals(dt, t);
    ctx.drawImage(skyLayer, 0, 0);
    drawClouds();
    ctx.drawImage(groundLayer, 0, 0);
    dogs.forEach(d => drawBridgeDog(d, t));
    drawJar();
    drawPup(t);
    drawStars(t);
    drawPetals(t);
    drawUi(t);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    dropStar,
    setCoat(coat) { state.coat = coat; },
    get muted() { return prefs.muted; },
    get music() { return prefs.music; },
    setMuted(v) { prefs.muted = v; save(); },
    setMusic(v) { prefs.music = v; save(); if (v) startMusic(); else stopMusic(); },
    sakura,
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      stopMusic();
      for (const [t, type, fn, o] of listeners) t.removeEventListener(type, fn, o);
      try { actx && actx.close(); } catch (e) {}
    },
  };
}
