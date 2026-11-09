import type { ZoneId } from "./types";

// ── Tile definitions ────────────────────────────────────────────────────────

export const T = {
  Void: 0, Grass: 1, TallGrass: 2, Tree: 3, Water: 4, Sand: 5, Road: 6, Stone: 7,
  Wall: 8, Floor: 9, Mountain: 10, Snow: 11, Ice: 12, Lava: 13, Ash: 14, Bridge: 15,
  CaveFloor: 16, CaveWall: 17, Mushroom: 18, Torch: 19, Crystal: 20, SnowTree: 21,
  Marsh: 22, Ruin: 23, Flower: 24, Bones: 25
} as const;

export type TileId = number;

export interface TileDef {
  name: string;
  glyphs: string[];
  colors: string[];
  walk: boolean;
  minimap: string;
  light?: number;
  animated?: boolean;
}

export const TILES: TileDef[] = [
  { name: "void", glyphs: [" "], colors: ["#05070a"], walk: false, minimap: "#05070a" },
  { name: "grass", glyphs: [".", ",", "'", "."], colors: ["#66825a", "#5d7a4e", "#6f8b5e"], walk: true, minimap: "#3f5a3a" },
  { name: "tall grass", glyphs: ['"', "'", ",", "`"], colors: ["#789a60", "#6f8f5a", "#82a468"], walk: true, minimap: "#48663f" },
  { name: "tree", glyphs: ["♣", "♠", "♣"], colors: ["#42633c", "#3a5a36", "#4c6d44"], walk: false, minimap: "#2c452c" },
  { name: "water", glyphs: ["≈", "~", "≈"], colors: ["#40708a", "#4a8098", "#355f76"], walk: false, minimap: "#2b5064", animated: true },
  { name: "sand", glyphs: ["·", ".", "·"], colors: ["#a89868", "#9d8d60", "#b2a070"], walk: true, minimap: "#7a6f50" },
  { name: "road", glyphs: ["·", "∙", "·"], colors: ["#8b7f68", "#847862", "#93866e"], walk: true, minimap: "#5f5748" },
  { name: "stone", glyphs: ["·", "·", "▪"], colors: ["#777b7a", "#6e7272", "#808482"], walk: true, minimap: "#555a59" },
  { name: "wall", glyphs: ["▓", "█", "▓"], colors: ["#5a5f60", "#505555", "#646968"], walk: false, minimap: "#3d4142" },
  { name: "floor", glyphs: ["·", ".", "·"], colors: ["#7c6b50", "#847256", "#746348"], walk: true, minimap: "#5c503d" },
  { name: "mountain", glyphs: ["▲", "▲", "△"], colors: ["#656c6e", "#5b6264", "#707779"], walk: false, minimap: "#3f4648" },
  { name: "snow", glyphs: ["*", "·", ".", "˙"], colors: ["#bccbd0", "#b0c0c6", "#c8d6da"], walk: true, minimap: "#7f9298" },
  { name: "ice", glyphs: ["≈", "~", "≈"], colors: ["#8ab4c0", "#7ca8b4", "#96c0ca"], walk: true, minimap: "#5f8894", animated: true },
  { name: "lava", glyphs: ["≈", "~", "≈"], colors: ["#c85c34", "#e0703c", "#a84a2c"], walk: false, minimap: "#7a3020", light: 3, animated: true },
  { name: "ash", glyphs: ["·", ".", ",", "˙"], colors: ["#5e5850", "#565048", "#66605a"], walk: true, minimap: "#403c37" },
  { name: "bridge", glyphs: ["=", "≡", "="], colors: ["#91764e", "#877048", "#9c8058"], walk: true, minimap: "#655438" },
  { name: "cave floor", glyphs: ["·", ".", "·"], colors: ["#5e5a52", "#56534c", "#66625a"], walk: true, minimap: "#403e39" },
  { name: "cave wall", glyphs: ["▓", "█", "▓"], colors: ["#46443e", "#3e3c37", "#4e4c46"], walk: false, minimap: "#2c2b28" },
  { name: "mushroom", glyphs: ["♠", "♣", "♠"], colors: ["#93b070", "#a0bc7c", "#86a468"], walk: false, minimap: "#5f754a" },
  { name: "torch", glyphs: ["☼", "✷", "☼"], colors: ["#f0b050", "#e8a040", "#ffc060"], walk: false, minimap: "#b08040", light: 7, animated: true },
  { name: "crystal", glyphs: ["♦", "◆", "♦"], colors: ["#7fb8d8", "#6fa8c8", "#90c8e8"], walk: false, minimap: "#507a90", light: 4, animated: true },
  { name: "snow tree", glyphs: ["♣", "♠"], colors: ["#5f7d78", "#55736e"], walk: false, minimap: "#3f5a56" },
  { name: "marsh", glyphs: [",", ".", ";", "`"], colors: ["#586e4c", "#506646", "#607856"], walk: true, minimap: "#3b4f36" },
  { name: "ruin", glyphs: ["░", "▒", "░"], colors: ["#7c7569", "#726b60", "#867f73"], walk: true, minimap: "#575247" },
  { name: "flowers", glyphs: ["*", "✿", "·", "'"], colors: ["#c8a0b8", "#b8a0c8", "#d0b0a0"], walk: true, minimap: "#6f5a5f" },
  { name: "bones", glyphs: ["†", "·", "†"], colors: ["#a8a090", "#9a9282"], walk: true, minimap: "#6a6458" }
];

export function tileDef(t: number): TileDef {
  return TILES[t] ?? TILES[0];
}

export function walkableTile(t: number): boolean {
  return TILES[t]?.walk ?? false;
}

// ── Deterministic noise ─────────────────────────────────────────────────────

export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// ── Map data ────────────────────────────────────────────────────────────────

export const WORLD_W = 260;
export const WORLD_H = 180;
export const CRYPT_W = 96;
export const CRYPT_H = 72;
export const WORLD_SEED = 0xe6b3f19;
export const CRYPT_SEED = 0x51c0de7;

export interface GameMap {
  zone: ZoneId;
  w: number;
  h: number;
  tiles: Uint8Array;
}

const mapCache = new Map<string, GameMap>();

export function seedFor(zone: ZoneId, base = WORLD_SEED): number {
  return zone === "crypt" ? (base ^ 0x9e3779b9) >>> 0 : base >>> 0;
}

export function getMap(zone: ZoneId, base = WORLD_SEED): GameMap {
  const key = `${zone}:${base}`;
  const hit = mapCache.get(key);
  if (hit) return hit;
  const map = zone === "crypt" ? generateCrypt(seedFor(zone, base)) : generateWorld(seedFor(zone, base));
  mapCache.set(key, map);
  return map;
}

export function tileAt(map: GameMap, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return T.Void;
  return map.tiles[iy * map.w + ix];
}

export function setTile(map: GameMap, x: number, y: number, t: number): void {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
  map.tiles[y * map.w + x] = t;
}

export function isWalkable(map: GameMap, x: number, y: number): boolean {
  return walkableTile(tileAt(map, x, y));
}

export function randomWalkableNear(map: GameMap, cx: number, cy: number, radius: number, rng: () => number): { x: number; y: number } {
  for (let i = 0; i < 80; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = Math.floor(cx + Math.cos(a) * r) + 0.5;
    const y = Math.floor(cy + Math.sin(a) * r) + 0.5;
    if (isWalkable(map, x, y)) return { x, y };
  }
  return { x: cx, y: cy };
}

// ── Points of interest ──────────────────────────────────────────────────────

export const WORLD_POIS = {
  town: { x: 130, y: 90 },
  cryptGate: { x: 225, y: 120 },
  wolfDen: { x: 160, y: 150 },
  banditCamp: { x: 195, y: 65 },
  frostRuins: { x: 40, y: 65 },
  ashenCamp: { x: 105, y: 30 },
  mire: { x: 205, y: 155 },
  wyrmRoost: { x: 70, y: 24 }
};

export const CRYPT_POIS = {
  exit: { x: 8, y: 35 },
  hall: { x: 34, y: 34 },
  depths: { x: 50, y: 52 },
  boss: { x: 72, y: 16 }
};

// ── World generation ────────────────────────────────────────────────────────

function generateWorld(seed: number): GameMap {
  const map: GameMap = { zone: "world", w: WORLD_W, h: WORLD_H, tiles: new Uint8Array(WORLD_W * WORLD_H) };

  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const e = fbm(x / 46, y / 46, seed, 5);
      const m = fbm(x / 33 + 90, y / 33 + 40, seed + 7717, 4);
      const detail = fbm(x / 11, y / 11, seed + 331, 3);
      const edge = Math.min(x, y, WORLD_W - 1 - x, WORLD_H - 1 - y);
      let tile: number = T.Grass;

      const frostLine = 57 + (valueNoise(x / 18, 3, seed + 41) - 0.5) * 22;
      const ashLine = 48 + (valueNoise(x / 21, 9, seed + 83) - 0.5) * 16;
      const mireLineX = 181 + (valueNoise(7, y / 17, seed + 12) - 0.5) * 26;
      const mireLineY = 126 + (valueNoise(x / 19, 3, seed + 27) - 0.5) * 16;

      const isFrost = x < frostLine;
      const isAsh = y < ashLine;
      const isMire = x > mireLineX && y > mireLineY;
      const isTownArea = Math.abs(x - 130) < 38 && Math.abs(y - 90) < 31;

      if (isFrost) {
        tile = T.Snow;
        if (e < 0.3) tile = T.Ice;
        else if (e > 0.73) tile = T.Mountain;
        else if (m > 0.62 && detail > 0.56) tile = T.SnowTree;
        else if (detail > 0.78) tile = T.Ruin;
      } else if (isAsh) {
        tile = T.Ash;
        if (e > 0.74) tile = T.Mountain;
        else if (e < 0.26 && m > 0.42) tile = T.Lava;
        else if (detail > 0.8) tile = T.Crystal;
        else if (detail < 0.24) tile = T.Bones;
      } else if (isMire) {
        tile = T.Marsh;
        if (e < 0.34 || m > 0.66) tile = T.Water;
        else if (m < 0.32) tile = T.TallGrass;
        else if (detail > 0.73) tile = T.Mushroom;
        else if (detail > 0.66) tile = T.Tree;
        else if (e > 0.77) tile = T.Mountain;
      } else {
        tile = m > 0.48 ? T.TallGrass : T.Grass;
        if (e < 0.255) tile = T.Water;
        else if (e < 0.285) tile = T.Sand;
        else if (e > 0.79) tile = T.Mountain;
        else if (m > 0.54 && detail > 0.54) tile = T.Tree;
        else if (detail < 0.08) tile = T.Flower;
        else if (detail > 0.9) tile = T.Bones;
      }

      if (isTownArea) {
        if (tile === T.Water || tile === T.Lava || tile === T.Mountain || tile === T.Tree || tile === T.SnowTree) tile = T.Grass;
        if (m > 0.55) tile = T.TallGrass;
      }

      if (edge < 2) tile = T.Void;
      else if (edge < 4 && tile !== T.Water && tile !== T.Lava) tile = T.Mountain;

      map.tiles[y * WORLD_W + x] = tile;
    }
  }

  // Landmark platforms
  stampCircle(map, WORLD_POIS.cryptGate.x, WORLD_POIS.cryptGate.y, 8, T.Stone, T.Ruin);
  ringTorches(map, WORLD_POIS.cryptGate.x, WORLD_POIS.cryptGate.y, 7);
  stampCircle(map, WORLD_POIS.wolfDen.x, WORLD_POIS.wolfDen.y, 8, T.TallGrass, T.Grass);
  stampCircle(map, WORLD_POIS.banditCamp.x, WORLD_POIS.banditCamp.y, 9, T.Ash, T.Ruin);
  setTile(map, WORLD_POIS.banditCamp.x - 2, WORLD_POIS.banditCamp.y, T.Torch);
  stampCircle(map, WORLD_POIS.frostRuins.x, WORLD_POIS.frostRuins.y, 9, T.Ruin, T.Snow);
  for (let i = -6; i <= 6; i += 3) {
    setTile(map, WORLD_POIS.frostRuins.x + i, WORLD_POIS.frostRuins.y - 4, T.Wall);
    setTile(map, WORLD_POIS.frostRuins.x + i, WORLD_POIS.frostRuins.y + 4, T.Wall);
  }
  stampCircle(map, WORLD_POIS.ashenCamp.x, WORLD_POIS.ashenCamp.y, 8, T.Ash, T.Bones);
  setTile(map, WORLD_POIS.ashenCamp.x + 1, WORLD_POIS.ashenCamp.y, T.Torch);
  stampCircle(map, WORLD_POIS.mire.x, WORLD_POIS.mire.y, 12, T.Marsh, T.Water);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    setTile(map, Math.round(WORLD_POIS.mire.x + Math.cos(a) * 7), Math.round(WORLD_POIS.mire.y + Math.sin(a) * 5), T.Mushroom);
  }
  stampCircle(map, WORLD_POIS.wyrmRoost.x, WORLD_POIS.wyrmRoost.y, 10, T.Ash, T.Ruin);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    setTile(map, Math.round(WORLD_POIS.wyrmRoost.x + Math.cos(a) * 6), Math.round(WORLD_POIS.wyrmRoost.y + Math.sin(a) * 5), T.Crystal);
  }

  // Roads
  carveRoad(map, 160, 96, WORLD_POIS.banditCamp.x - 8, WORLD_POIS.banditCamp.y);
  carveRoad(map, 160, 110, WORLD_POIS.cryptGate.x - 8, WORLD_POIS.cryptGate.y);
  carveRoad(map, 130, 112, WORLD_POIS.wolfDen.x, WORLD_POIS.wolfDen.y - 7);
  carveRoad(map, 100, 80, WORLD_POIS.frostRuins.x + 8, WORLD_POIS.frostRuins.y);
  carveRoad(map, 130, 62, WORLD_POIS.ashenCamp.x, WORLD_POIS.ashenCamp.y + 7);
  carveRoad(map, 110, 68, WORLD_POIS.ashenCamp.x, WORLD_POIS.ashenCamp.y + 7);

  buildTown(map);

  // Ensure key walkable points are clear
  ensureWalkable(map, WORLD_POIS.cryptGate.x, WORLD_POIS.cryptGate.y, T.Stone);
  ensureWalkable(map, 130, 95, T.Stone);

  return map;
}

function stampCircle(map: GameMap, cx: number, cy: number, r: number, primary: number, secondary: number): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r + 1) continue;
      const d = Math.sqrt(x * x + y * y) / r;
      const t = d > 0.82 && hash2(cx + x, cy + y, 91) > 0.45 ? secondary : primary;
      setTile(map, cx + x, cy + y, t);
    }
  }
}

function ringTorches(map: GameMap, cx: number, cy: number, r: number): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    setTile(map, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), T.Torch);
  }
}

function carveRoad(map: GameMap, x0: number, y0: number, x1: number, y1: number): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  let guard = 0;
  while ((x !== tx || y !== ty) && guard++ < 600) {
    paintPath(map, x, y);
    if (x !== tx) x += Math.sign(tx - x);
    if (y !== ty && (guard % 2 === 0 || x === tx)) y += Math.sign(ty - y);
  }
  paintPath(map, tx, ty);
}

function paintPath(map: GameMap, x: number, y: number): void {
  for (const [ox, oy] of [[0, 0], [0, 1], [1, 0]]) {
    const t = tileAt(map, x + ox, y + oy);
    if (t === T.Water || t === T.Ice) setTile(map, x + ox, y + oy, T.Bridge);
    else if (t === T.Lava || t === T.Mountain || t === T.Tree || t === T.SnowTree || t === T.Mushroom || t === T.Wall) setTile(map, x + ox, y + oy, T.Road);
    else setTile(map, x + ox, y + oy, T.Road);
  }
}

function buildTown(map: GameMap): void {
  const cx = WORLD_POIS.town.x;
  const cy = WORLD_POIS.town.y;

  // Grounds
  for (let y = cy - 28; y <= cy + 28; y++) {
    for (let x = cx - 36; x <= cx + 36; x++) {
      const t = tileAt(map, x, y);
      if (!walkableTile(t) || t === T.Tree || t === T.TallGrass) setTile(map, x, y, T.Grass);
    }
  }

  // Plaza
  for (let y = cy - 22; y <= cy + 22; y++) {
    for (let x = cx - 30; x <= cx + 30; x++) {
      const edge = x === cx - 30 || x === cx + 30 || y === cy - 22 || y === cy + 22;
      if (edge && hash2(x, y, 33) > 0.55) continue;
      setTile(map, x, y, T.Stone);
    }
  }
  for (let i = -26; i <= 26; i += 4) {
    setTile(map, cx + i, cy - 19, T.Road);
    setTile(map, cx + i, cy + 19, T.Road);
  }

  // Fountain
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const d = Math.max(Math.abs(x), Math.abs(y));
      setTile(map, cx + x, cy + y, d === 3 ? T.Stone : d <= 2 ? T.Water : T.Stone);
    }
  }
  setTile(map, cx, cy - 3, T.Bones);
  setTile(map, cx, cy + 3, T.Bones);

  // Shrine platform
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) setTile(map, cx + 6 + x, cy + y, T.Stone);
  }
  setTile(map, cx + 6, cy - 2, T.Torch);
  setTile(map, cx + 6, cy + 2, T.Torch);

  // Buildings
  building(map, cx - 26, cy - 20, 14, 11, cx - 19);
  building(map, cx + 12, cy - 20, 14, 11, cx + 19);
  building(map, cx - 26, cy + 8, 14, 11, cx - 19);
  building(map, cx + 12, cy + 8, 14, 11, cx + 19);

  // Plaza lanterns
  for (const [lx, ly] of [[-24, -17], [24, -17], [-24, 17], [24, 17], [-8, -8], [8, 8], [-8, 8], [8, -8]]) {
    setTile(map, cx + lx, cy + ly, T.Torch);
  }

  // Decorative verge
  for (let y = cy - 27; y <= cy + 27; y++) {
    for (let x = cx - 35; x <= cx + 35; x++) {
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (d > 24 && d < 28 && hash2(x, y, 77) > 0.72 && walkableTile(tileAt(map, x, y))) {
        setTile(map, x, y, hash2(x, y, 78) > 0.55 ? T.Flower : T.TallGrass);
      }
    }
  }

  // Town signposts / benches
  for (const [bx, by] of [[-3, -6], [3, -6], [-3, 6], [3, 6]]) setTile(map, cx + bx, cy + by, T.Bones);
}

function building(map: GameMap, x: number, y: number, w: number, h: number, doorX: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const border = xx === x || xx === x + w - 1 || yy === y || yy === y + h - 1;
      setTile(map, xx, yy, border ? T.Wall : T.Floor);
    }
  }
  // door on bottom wall
  setTile(map, doorX, y + h - 1, T.Floor);
  setTile(map, doorX, y + h - 2, T.Floor);
  // wall torches outside the door
  setTile(map, doorX - 1, y + h - 1, T.Wall);
  setTile(map, doorX + 1, y + h - 1, T.Wall);
  setTile(map, x, y, T.Torch);
  setTile(map, x + w - 1, y, T.Torch);
  // simple furniture
  setTile(map, x + 2, y + 2, T.Wall);
  setTile(map, x + w - 3, y + h - 3, T.Wall);
}

function ensureWalkable(map: GameMap, x: number, y: number, tile: number): void {
  if (!walkableTile(tileAt(map, x, y))) setTile(map, x, y, tile);
}

// ── Crypt generation ────────────────────────────────────────────────────────

function generateCrypt(seed: number): GameMap {
  const map: GameMap = { zone: "crypt", w: CRYPT_W, h: CRYPT_H, tiles: new Uint8Array(CRYPT_W * CRYPT_H) };
  const rng = mulberry32(seed);
  let grid: number[] = [];
  for (let y = 0; y < CRYPT_H; y++) {
    for (let x = 0; x < CRYPT_W; x++) {
      const border = x < 2 || y < 2 || x >= CRYPT_W - 2 || y >= CRYPT_H - 2;
      grid.push(border || rng() < 0.44 ? 1 : 0);
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    const next = grid.slice();
    for (let y = 2; y < CRYPT_H - 2; y++) {
      for (let x = 2; x < CRYPT_W - 2; x++) {
        let walls = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            walls += grid[(y + oy) * CRYPT_W + (x + ox)];
          }
        }
        if (walls >= 5) next[y * CRYPT_W + x] = 1;
        else if (walls <= 2) next[y * CRYPT_W + x] = 0;
      }
    }
    grid = next;
  }
  for (let y = 0; y < CRYPT_H; y++) {
    for (let x = 0; x < CRYPT_W; x++) {
      const border = x < 2 || y < 2 || x >= CRYPT_W - 2 || y >= CRYPT_H - 2;
      const wall = border || grid[y * CRYPT_W + x] === 1;
      map.tiles[y * CRYPT_W + x] = wall ? T.CaveWall : T.CaveFloor;
    }
  }

  // Carve guaranteed routes
  carveTunnel(map, CRYPT_POIS.exit.x, CRYPT_POIS.exit.y, CRYPT_POIS.hall.x, CRYPT_POIS.hall.y, 2);
  carveTunnel(map, CRYPT_POIS.hall.x, CRYPT_POIS.hall.y, CRYPT_POIS.depths.x, CRYPT_POIS.depths.y, 2);
  carveTunnel(map, CRYPT_POIS.depths.x, CRYPT_POIS.depths.y, CRYPT_POIS.boss.x, CRYPT_POIS.boss.y, 2);

  stampCircle(map, CRYPT_POIS.exit.x, CRYPT_POIS.exit.y, 6, T.CaveFloor, T.CaveWall);
  stampCircle(map, CRYPT_POIS.hall.x, CRYPT_POIS.hall.y, 8, T.CaveFloor, T.CaveWall);
  stampCircle(map, CRYPT_POIS.depths.x, CRYPT_POIS.depths.y, 9, T.CaveFloor, T.CaveWall);
  stampCircle(map, CRYPT_POIS.boss.x, CRYPT_POIS.boss.y, 9, T.CaveFloor, T.CaveWall);

  // Shrine & torches
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    setTile(map, Math.round(CRYPT_POIS.boss.x + Math.cos(a) * 8), Math.round(CRYPT_POIS.boss.y + Math.sin(a) * 8), i % 3 === 0 ? T.Crystal : T.Torch);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    setTile(map, Math.round(CRYPT_POIS.exit.x + Math.cos(a) * 5), Math.round(CRYPT_POIS.exit.y + Math.sin(a) * 5), T.Torch);
  }
  setTile(map, 12, 38, T.CaveFloor);
  setTile(map, 13, 38, T.CaveFloor);
  setTile(map, 12, 37, T.Crystal);
  // bones and rubble
  for (let i = 0; i < 120; i++) {
    const x = 3 + Math.floor(rng() * (CRYPT_W - 6));
    const y = 3 + Math.floor(rng() * (CRYPT_H - 6));
    if (tileAt(map, x, y) === T.CaveFloor) setTile(map, x, y, rng() > 0.5 ? T.Bones : T.Ruin);
  }
  // guaranteed walkables
  for (const p of [CRYPT_POIS.exit, CRYPT_POIS.hall, CRYPT_POIS.depths, CRYPT_POIS.boss, { x: 8, y: 35 }]) {
    ensureWalkable(map, p.x, p.y, T.CaveFloor);
  }
  return map;
}

function carveTunnel(map: GameMap, x0: number, y0: number, x1: number, y1: number, radius: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > radius * radius + 1) continue;
        const tx = cx + ox;
        const ty = cy + oy;
        if (tx > 1 && ty > 1 && tx < CRYPT_W - 2 && ty < CRYPT_H - 2) {
          setTile(map, tx, ty, T.CaveFloor);
        }
      }
    }
  }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
