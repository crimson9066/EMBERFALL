import { ABILITIES, CLASSES, RARITY_COLOR, regionAt, type AbilityDef } from "../shared/content";
import { dist } from "../shared/formulas";
import type { EntityView, Effect, World } from "./state";
import {
  CRYPT_H, CRYPT_POIS, CRYPT_W, T, TILES, WORLD_H, WORLD_POIS, WORLD_W,
  getMap, hash2, tileDef
} from "../shared/worldgen";

interface Light {
  x: number;
  y: number;
  r: number;
  strength: number;
  color: string;
}

const FONT_STACK = '"Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Courier New", monospace';

const regionTint: Record<string, [number, number, number]> = {
  crypt: [0.84, 0.86, 1.02],
  town: [1.07, 1.01, 0.9],
  ash: [1.1, 0.94, 0.88],
  frost: [0.9, 0.99, 1.1],
  mire: [0.92, 1.01, 0.9],
  verdant: [1, 1, 1]
};

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? parseInt(h.split("").map((c) => c + c).join(""), 16)
    : parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private world: World;

  width = 0;
  height = 0;
  dpr = 1;
  fontPx = 17;
  zoom = 1;
  cellW = 10;
  cellH = 19;
  cols = 80;
  rows = 40;

  aimAbility: AbilityDef | null = null;
  showAim = false;
  private shadeCache = new Map<string, string>();
  private resizeHandler = () => this.resize();

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.world = world;
    window.addEventListener("resize", this.resizeHandler);
    this.resize();
  }

  dispose(): void {
    window.removeEventListener("resize", this.resizeHandler);
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.fontPx = Math.max(11, 17 * this.zoom);
    this.cellW = Math.max(7, this.fontPx * 0.6);
    this.cellH = Math.max(12, this.fontPx * 1.14);
    this.cols = Math.ceil(this.width / this.cellW) + 1;
    this.rows = Math.ceil(this.height / this.cellH) + 1;
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.7, Math.min(1.8, zoom));
    this.resize();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const cam = this.camCenter();
    return {
      x: cam.x + (sx - this.width / 2) / this.cellW,
      y: cam.y + (sy - this.height / 2) / this.cellH
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.camCenter();
    return {
      x: this.width / 2 + (x - cam.x) * this.cellW,
      y: this.height / 2 + (y - cam.y) * this.cellH
    };
  }

  /** Keep the camera inside the map so edges never leave half the view black. */
  private camCenter(): { x: number; y: number } {
    const map = this.world.map;
    const halfCols = this.cols / 2;
    const halfRows = this.rows / 2;
    const minX = Math.min(halfCols, map.w / 2);
    const minY = Math.min(halfRows, map.h / 2);
    const maxX = Math.max(minX, map.w - halfCols);
    const maxY = Math.max(minY, map.h - halfRows);
    return {
      x: Math.max(minX, Math.min(maxX, this.world.camX)),
      y: Math.max(minY, Math.min(maxY, this.world.camY))
    };
  }

  private shade(hex: string, light: number, tint?: [number, number, number]): string {
    const step = Math.max(0, Math.min(14, Math.round(light * 12)));
    const key = `${hex}|${step}|${tint ? tint.join(",") : ""}`;
    const hit = this.shadeCache.get(key);
    if (hit) return hit;
    const [r, g, b] = hexRgb(hex);
    const f = step / 12;
    const tr = tint ? tint[0] : 1;
    const tg = tint ? tint[1] : 1;
    const tb = tint ? tint[2] : 1;
    const out = `rgb(${Math.min(255, Math.round(r * f * tr))},${Math.min(255, Math.round(g * f * tg))},${Math.min(255, Math.round(b * f * tb))})`;
    if (this.shadeCache.size > 8000) this.shadeCache.clear();
    this.shadeCache.set(key, out);
    return out;
  }

  render(now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, this.width, this.height);

    if (w.phase === "title") return;

    const shakeX = w.shake > 0 ? (Math.random() - 0.5) * w.shake * 8 : 0;
    const shakeY = w.shake > 0 ? (Math.random() - 0.5) * w.shake * 7 : 0;
    const viewCam = this.camCenter();
    const camX = viewCam.x;
    const camY = viewCam.y;

    const night = this.nightness(w.dayTime);
    const zone = w.zone;
    const ambient = zone === "crypt" ? 0.38 : 0.3 + 0.7 * (1 - night);
    const tint = regionTint[regionAt(zone, camX, camY).id] ?? [1, 1, 1];

    const halfCols = this.cols / 2;
    const halfRows = this.rows / 2;
    const startX = Math.floor(camX - halfCols) - 1;
    const startY = Math.floor(camY - halfRows) - 1;
    const endX = startX + this.cols + 2;
    const endY = startY + this.rows + 2;

    const lights = this.collectLights(startX, startY, endX, endY, ambient, zone, night);
    const lightAt = (x: number, y: number): number => {
      let level = ambient;
      for (const l of lights) {
        const dx = x - l.x;
        const dy = y - l.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= l.r * l.r) continue;
        const d = Math.sqrt(d2);
        level += l.strength * (1 - d / l.r);
      }
      return Math.min(1.35, level);
    };

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${this.fontPx}px ${FONT_STACK}`;

    const offX = this.width / 2 - camX * this.cellW + shakeX;
    const offY = this.height / 2 - camY * this.cellH + shakeY;
    const seed = w.seed;

    // ── Tiles ────────────────────────────────────────────────────────────────
    for (let gy = startY; gy <= endY; gy++) {
      if (gy < 0 || gy >= w.map.h) continue;
      for (let gx = startX; gx <= endX; gx++) {
        if (gx < 0 || gx >= w.map.w) continue;
        const tile = w.map.tiles[gy * w.map.w + gx];
        if (tile === T.Void) continue;
        const def = TILES[tile];
        if (!def) continue;
        const h = hash2(gx, gy, seed);
        let gi = Math.floor(h * def.glyphs.length);
        if (def.animated) {
          gi = Math.floor((now / 420 + h * 7) % def.glyphs.length);
        }
        const ci = Math.floor(hash2(gx, gy, seed + 131) * def.colors.length);
        let color = def.colors[ci];
        if (night > 0.35 && zone === "world") color = this.cool(color, night);
        const px = offX + (gx + 0.5) * this.cellW;
        const py = offY + (gy + 0.5) * this.cellH;
        ctx.fillStyle = this.shade(color, lightAt(gx + 0.5, gy + 0.5), tint);
        ctx.fillText(def.glyphs[gi], px, py);
      }
    }

    // ── Warm bloom around lights ─────────────────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const l of lights) {
      if (l.strength < 0.12) continue;
      const px = offX + l.x * this.cellW;
      const py = offY + l.y * this.cellH;
      const radius = Math.max(8, l.r * this.cellW);
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, this.rgba(l.color, 0.1));
      grad.addColorStop(0.45, this.rgba(l.color, 0.035));
      grad.addColorStop(1, this.rgba(l.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
    ctx.restore();

    // ── Ground telegraphs, zones, aim ────────────────────────────────────────
    this.drawZones(offX, offY, now);
    this.drawCasts(offX, offY, now);
    this.drawAim(offX, offY, now);

    // ── Ground items ─────────────────────────────────────────────────────────
    for (const item of w.items) {
      if (!this.inView(item.x, item.y, 2)) continue;
      const px = offX + item.x * this.cellW;
      const py = offY + item.y * this.cellH;
      const pulse = 0.72 + 0.28 * Math.sin(now / 300 + item.x);
      ctx.globalAlpha = pulse;
      ctx.font = `${this.fontPx * 0.9}px ${FONT_STACK}`;
      ctx.shadowColor = item.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = item.color;
      ctx.fillText(item.glyph, px, py);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      const d = dist(w.predicted.x, w.predicted.y, item.x, item.y);
      const showName = item.rarity !== "common" || d < 6 || w.hoverItemId === item.id;
      if (showName) {
        ctx.font = `${Math.round(this.fontPx * 0.55)}px ${FONT_STACK}`;
        ctx.fillStyle = "#0a0c0e";
        ctx.fillText(item.name, px + 1, py - this.cellH * 0.75 + 1);
        ctx.fillStyle = item.color;
        ctx.fillText(item.name, px, py - this.cellH * 0.75);
      }
    }

    // ── Entities sorted by depth ─────────────────────────────────────────────
    interface Drawable { y: number; draw: () => void }
    const drawables: Drawable[] = [];

    for (const npc of w.npcs) {
      if (!this.inView(npc.x, npc.y, 2)) continue;
      drawables.push({ y: npc.y, draw: () => this.drawNpc(npc, offX, offY, now, lightAt(npc.x, npc.y)) });
    }
    for (const mob of w.mobs.values()) {
      if (!this.inView(mob.vx, mob.vy, 2)) continue;
      drawables.push({ y: mob.vy, draw: () => this.drawMob(mob, offX, offY, now, lightAt(mob.vx, mob.vy)) });
    }
    for (const player of w.players.values()) {
      if (!this.inView(player.vx, player.vy, 2)) continue;
      drawables.push({ y: player.vy, draw: () => this.drawPlayer(player, offX, offY, now, lightAt(player.vx, player.vy)) });
    }
    drawables.push({ y: w.predicted.y, draw: () => this.drawSelf(offX, offY, now) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    // ── Projectiles ──────────────────────────────────────────────────────────
    ctx.font = `${this.fontPx * 0.92}px ${FONT_STACK}`;
    for (const pr of w.projectiles) {
      if (!this.inView(pr.x, pr.y, 2)) continue;
      const px = offX + pr.x * this.cellW;
      const py = offY + pr.y * this.cellH;
      ctx.shadowColor = pr.color;
      ctx.shadowBlur = 9;
      ctx.fillStyle = pr.color;
      ctx.fillText(pr.glyph, px, py);
    }
    ctx.shadowBlur = 0;

    // ── Combat effects ───────────────────────────────────────────────────────
    for (const fx of w.effects) this.drawEffect(fx, offX, offY, now);

    // ── Weather ──────────────────────────────────────────────────────────────
    this.drawWeather(now, night, zone);

    // ── Cursor / targeting chrome ────────────────────────────────────────────
    this.drawCursor(offX, offY, now);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  private nightness(day: number): number {
    // day 0 = midnight, 0.5 = noon.
    const s = Math.sin((day - 0.25) * Math.PI * 2) * 0.5 + 0.5;
    return 1 - Math.max(0, Math.min(1, s));
  }

  private cool(hex: string, night: number): string {
    const [r, g, b] = hexRgb(hex);
    const f = 1 - night * 0.22;
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(Math.min(255, b * (1 + night * 0.12)))})`;
  }

  private rgba(hex: string, alpha: number): string {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private collectLights(startX: number, startY: number, endX: number, endY: number, ambient: number, zone: string, night: number): Light[] {
    const lights: Light[] = [];
    const w = this.world;
    const m = w.map;
    const x0 = Math.max(0, startX - 8);
    const y0 = Math.max(0, startY - 8);
    const x1 = Math.min(m.w - 1, endX + 8);
    const y1 = Math.min(m.h - 1, endY + 8);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const def = TILES[m.tiles[y * m.w + x]];
        if (!def?.light) continue;
        lights.push({
          x: x + 0.5,
          y: y + 0.5,
          r: def.light + 1,
          strength: def.light >= 6 ? 0.85 : def.light >= 4 ? 0.55 : 0.42,
          color: def.light >= 6 ? "#f0a850" : def.light >= 4 ? "#7fb8d8" : "#d06a3a"
        });
      }
    }
    // The player carries a small lantern in the dark.
    const carry = zone === "crypt" ? 0.5 : 0.22 + night * 0.32;
    lights.push({ x: w.predicted.x, y: w.predicted.y, r: 6.2, strength: carry, color: "#d8c8a0" });
    for (const pr of w.projectiles) {
      lights.push({ x: pr.x, y: pr.y, r: 2.4, strength: 0.35, color: pr.color });
    }
    for (const z of w.zones) {
      lights.push({ x: z.x, y: z.y, r: z.radius + 1, strength: 0.3, color: z.color });
    }
    for (const c of w.casts) {
      lights.push({ x: c.x, y: c.y, r: c.radius + 1, strength: 0.22, color: c.color });
    }
    void ambient;
    return lights;
  }

  private inView(x: number, y: number, pad = 0): boolean {
    const cam = this.camCenter();
    return Math.abs(x - cam.x) < this.cols / 2 + pad &&
      Math.abs(y - cam.y) < this.rows / 2 + pad;
  }

  private drawNpc(npc: { x: number; y: number; glyph: string; color: string; name: string; role?: string; id: string }, offX: number, offY: number, now: number, light: number): void {
    const ctx = this.ctx;
    const px = offX + npc.x * this.cellW;
    const py = offY + npc.y * this.cellH;
    const isPortal = npc.role === "portal";
    const isShrine = npc.role === "shrine";
    const bob = isShrine ? Math.sin(now / 600 + npc.x) * this.cellH * 0.06 : 0;
    const color = this.shade(npc.color, Math.max(light, 0.7));
    ctx.font = `${this.fontPx * (isPortal ? 1.08 : 1)}px ${FONT_STACK}`;
    ctx.shadowColor = npc.color;
    ctx.shadowBlur = isPortal || isShrine ? 16 : 8;
    ctx.fillStyle = color;
    ctx.globalAlpha = isPortal ? 0.72 + 0.28 * Math.sin(now / 260 + npc.x) : 1;
    ctx.fillText(npc.glyph, px, py + bob);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (isPortal || isShrine) {
      ctx.font = `${Math.round(this.fontPx * 0.5)}px ${FONT_STACK}`;
      ctx.fillStyle = this.rgba(npc.color, 0.55);
      const ring = isPortal ? ["◇", "◈", "◆", "◈"] : ["·", "✧", "·", "✧"];
      for (let i = 0; i < 8; i++) {
        const a = now / 900 + (i * Math.PI) / 4;
        ctx.fillText(ring[i % ring.length], px + Math.cos(a) * this.cellW * 1.2, py + Math.sin(a) * this.cellH * 0.7);
      }
    }

    const near = dist(this.world.predicted.x, this.world.predicted.y, npc.x, npc.y) < 5;
    if (near || this.world.hoverId === npc.id) {
      this.label(npc.name, px, py - this.cellH * 0.85, npc.color, 0.62);
    }
  }

  private drawMob(mob: EntityView, offX: number, offY: number, now: number, light: number): void {
    const ctx = this.ctx;
    const px = offX + mob.vx * this.cellW;
    const py = offY + mob.vy * this.cellH;
    const targeted = this.world.self?.targetId === mob.id;
    const hovered = this.world.hoverId === mob.id;
    const rare = !!mob.rare;
    const color = this.shade(mob.color, Math.max(light, targeted || hovered ? 0.9 : 0.55));

    if (mob.rare || mob.elite || mob.boss) {
      const aura = mob.boss ? "#f0a03c" : mob.elite ? "#e08a50" : "#c07ae8";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const r = (mob.boss ? 1.6 : 1.1) * this.cellW;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r * 2);
      grad.addColorStop(0, this.rgba(aura, mob.boss ? 0.22 : 0.14));
      grad.addColorStop(1, this.rgba(aura, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(px - r * 2, py - r * 2, r * 4, r * 4);
      ctx.restore();
    }

    const scale = mob.boss ? 1.28 : mob.elite ? 1.12 : 1;
    ctx.font = `${this.fontPx * scale}px ${FONT_STACK}`;
    ctx.shadowColor = mob.rare ? "#c07ae8" : mob.color;
    ctx.shadowBlur = mob.boss ? 18 : mob.rare || mob.elite ? 12 : 6;
    ctx.fillStyle = color;
    ctx.fillText(mob.glyph, px, py);
    ctx.shadowBlur = 0;

    if (mob.facing !== undefined) {
      ctx.fillStyle = this.rgba(mob.color, 0.32);
      ctx.font = `${Math.round(this.fontPx * 0.5)}px ${FONT_STACK}`;
      ctx.fillText("·", px + Math.cos(mob.facing) * this.cellW * 0.85, py + Math.sin(mob.facing) * this.cellH * 0.5);
    }

    const showBar = targeted || hovered || rare || mob.elite || mob.boss || (mob.hp !== undefined && mob.maxHp !== undefined && mob.hp < mob.maxHp);
    const showName = targeted || hovered || rare || mob.elite || mob.boss;
    if (showBar) {
      const width = mob.boss ? 56 : mob.elite || rare ? 40 : 30;
      const hpFrac = mob.hp !== undefined && mob.maxHp ? Math.max(0, mob.hp / mob.maxHp) : 1;
      const barColor = mob.boss ? "#e0a040" : mob.elite ? "#e08a50" : mob.rare ? "#a45ad8" : "#b04a3a";
      this.hpBar(px - width / 2, py - this.cellH * 0.58, width, 3, hpFrac, barColor);
    }
    if (showName) {
      const nameColor = mob.boss ? "#f0c674" : mob.elite ? "#e8b070" : mob.rare ? "#c07ae8" : "#b8b09a";
      this.label(`${mob.name}${mob.level ? ` · ${mob.level}` : ""}`, px, py - this.cellH * 0.86, nameColor, 0.56);
    }
    if (targeted) this.corners(px, py, this.cellW * 1.05, this.cellH * 0.72, "#f0d080", now);
    else if (hovered) this.corners(px, py, this.cellW * 1.05, this.cellH * 0.72, "#8f9a8a", now);
  }

  private drawPlayer(player: EntityView, offX: number, offY: number, now: number, light: number): void {
    const ctx = this.ctx;
    const px = offX + player.vx * this.cellW;
    const py = offY + player.vy * this.cellH;
    const color = this.shade(player.color, Math.max(light, 0.7));
    ctx.font = `${this.fontPx}px ${FONT_STACK}`;
    ctx.shadowColor = player.color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    ctx.globalAlpha = player.dead ? 0.35 : 1;
    ctx.fillText(player.glyph || "@", px, py);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const partyMember = this.world.party?.members.some((m) => m.id === player.id);
    this.label(player.name, px, py - this.cellH * 0.82, partyMember ? "#8fd0a0" : "#c8c2b0", 0.56);
    if (partyMember) this.hpBar(px - 16, py - this.cellH * 0.56, 32, 3, player.hp && player.maxHp ? player.hp / player.maxHp : 1, "#6aa86a");
    if (this.world.hoverId === player.id) {
      this.label(`${player.className ?? "Wanderer"} · ${player.level ?? 1}`, px, py - this.cellH * 1.2, "#9aa89a", 0.5);
    }
    void now;
  }

  private drawSelf(offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    if (!w.self) return;
    const px = offX + w.predicted.x * this.cellW;
    const py = offY + w.predicted.y * this.cellH;
    const def = CLASSES[w.self.classId];

    // Halo.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(px, py, 0, px, py, this.cellW * 3);
    grad.addColorStop(0, this.rgba(def.color, 0.13));
    grad.addColorStop(1, this.rgba(def.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(px - this.cellW * 3, py - this.cellW * 3, this.cellW * 6, this.cellW * 6);
    ctx.restore();

    ctx.font = `${this.fontPx}px ${FONT_STACK}`;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = w.self.dead ? "#5a5a52" : def.color;
    ctx.globalAlpha = w.self.dead ? 0.5 : 1;
    ctx.fillText(def.glyph, px, py);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Facing tick.
    ctx.font = `${Math.round(this.fontPx * 0.55)}px ${FONT_STACK}`;
    ctx.fillStyle = this.rgba(def.color, 0.5);
    ctx.fillText("·", px + Math.cos(w.facing) * this.cellW * 0.9, py + Math.sin(w.facing) * this.cellH * 0.55);

    if (w.self.inCombat) {
      ctx.font = `${Math.round(this.fontPx * 0.5)}px ${FONT_STACK}`;
      ctx.fillStyle = this.rgba("#ff6a50", 0.5 + 0.3 * Math.sin(now / 200));
      ctx.fillText("⚔", px + this.cellW * 0.9, py - this.cellH * 0.55);
    }
  }

  private label(text: string, x: number, y: number, color: string, scale: number): void {
    const ctx = this.ctx;
    ctx.font = `${Math.round(this.fontPx * scale)}px ${FONT_STACK}`;
    ctx.fillStyle = "#05070a";
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private hpBar(x: number, y: number, w: number, h: number, frac: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(3,4,6,0.82)";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = "rgba(80,84,76,0.4)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  }

  private corners(px: number, py: number, halfW: number, halfH: number, color: string, now: number): void {
    const ctx = this.ctx;
    ctx.font = `${Math.round(this.fontPx * 0.8)}px ${FONT_STACK}`;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(now / 240);
    const x0 = px - halfW;
    const x1 = px + halfW;
    const y0 = py - halfH;
    const y1 = py + halfH;
    ctx.fillText("┌", x0, y0);
    ctx.fillText("┐", x1, y0);
    ctx.fillText("└", x0, y1);
    ctx.fillText("┘", x1, y1);
    ctx.globalAlpha = 1;
  }

  private drawZones(offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    for (const z of this.world.zones) {
      if (!this.inView(z.x, z.y, z.radius + 2)) continue;
      const px = offX + z.x * this.cellW;
      const py = offY + z.y * this.cellH;
      const pulse = 0.06 + 0.03 * Math.sin(now / 280);
      ctx.beginPath();
      ctx.ellipse(px, py, z.radius * this.cellW, z.radius * this.cellH, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.rgba(z.color, pulse);
      ctx.fill();
      ctx.strokeStyle = this.rgba(z.color, 0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = `${Math.round(this.fontPx * 0.7)}px ${FONT_STACK}`;
      ctx.fillStyle = this.rgba(z.color, 0.55);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + now / 1600;
        ctx.fillText(z.kind === "heal" ? "✚" : "·", px + Math.cos(a) * z.radius * this.cellW, py + Math.sin(a) * z.radius * this.cellH);
      }
    }
  }

  private drawCasts(offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    for (const c of this.world.casts) {
      if (!this.inView(c.x, c.y, (c.radius ?? 2) + (c.length ?? 0) + 2)) continue;
      const px = offX + c.x * this.cellW;
      const py = offY + c.y * this.cellH;
      const pulse = 0.5 + 0.3 * Math.sin(now / 100);
      if (c.kind === "beam") {
        const angle = c.angle ?? 0;
        const length = c.length ?? 8;
        ctx.save();
        ctx.strokeStyle = this.rgba(c.color, 0.22 * pulse);
        ctx.lineWidth = this.cellW * 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle) * length * this.cellW, py + Math.sin(angle) * length * this.cellH);
        ctx.stroke();
        ctx.restore();
        ctx.font = `${Math.round(this.fontPx * 0.7)}px ${FONT_STACK}`;
        ctx.fillStyle = this.rgba(c.color, 0.6);
        for (let i = 0; i < length; i += 0.8) {
          ctx.fillText("·", px + Math.cos(angle) * i * this.cellW, py + Math.sin(angle) * i * this.cellH);
        }
      } else {
        ctx.beginPath();
        ctx.ellipse(px, py, c.radius * this.cellW, c.radius * this.cellH, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.rgba(c.color, 0.07 + 0.05 * pulse);
        ctx.fill();
        ctx.strokeStyle = this.rgba(c.color, 0.32 + 0.2 * pulse);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `${Math.round(this.fontPx * 0.75)}px ${FONT_STACK}`;
        ctx.fillStyle = this.rgba(c.color, 0.7);
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          ctx.fillText("·", px + Math.cos(a) * c.radius * this.cellW, py + Math.sin(a) * c.radius * this.cellH);
        }
        ctx.font = `${Math.round(this.fontPx * 0.55)}px ${FONT_STACK}`;
        ctx.fillStyle = this.rgba(c.color, 0.85);
        ctx.fillText(c.name, px, py - c.radius * this.cellH - 4);
      }
    }
  }

  private drawAim(offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    const ability = this.aimAbility;
    if (!this.showAim || !ability || !w.mouse.active || !w.self || w.self.dead) return;

    let ax = w.mouse.x;
    let ay = w.mouse.y;
    if (ability.targeting === "self" || ability.targeting === "ally") {
      ax = w.predicted.x;
      ay = w.predicted.y;
    } else {
      const d = dist(w.predicted.x, w.predicted.y, ax, ay);
      if (d > ability.range && d > 0.01) {
        ax = w.predicted.x + ((ax - w.predicted.x) / d) * ability.range;
        ay = w.predicted.y + ((ay - w.predicted.y) / d) * ability.range;
      }
    }

    const px = offX + ax * this.cellW;
    const py = offY + ay * this.cellH;
    const color = ability.color;
    const pulse = 0.5 + 0.3 * Math.sin(now / 220);

    if (ability.targeting === "point" && ability.radius) {
      ctx.beginPath();
      ctx.ellipse(px, py, ability.radius * this.cellW, ability.radius * this.cellH, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.rgba(color, 0.06);
      ctx.fill();
      ctx.strokeStyle = this.rgba(color, 0.4 + 0.2 * pulse);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.round(this.fontPx * 0.7)}px ${FONT_STACK}`;
      ctx.fillStyle = this.rgba(color, 0.65);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + now / 2200;
        ctx.fillText("·", px + Math.cos(a) * ability.radius * this.cellW, py + Math.sin(a) * ability.radius * this.cellH);
      }
    } else if (ability.targeting === "enemy" || ability.targeting === "ally") {
      const spx = offX + w.predicted.x * this.cellW;
      const spy = offY + w.predicted.y * this.cellH;
      ctx.strokeStyle = this.rgba(color, 0.28);
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(spx, spy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.round(this.fontPx * 0.9)}px ${FONT_STACK}`;
      ctx.fillStyle = this.rgba(color, 0.8);
      ctx.fillText("◎", px, py);
    }

    ctx.font = `${Math.round(this.fontPx * 0.52)}px ${FONT_STACK}`;
    ctx.fillStyle = this.rgba(color, 0.8);
    ctx.fillText(`${ability.name} · ${ability.range > 0 ? `${ability.range.toFixed(1)}y` : "self"}`, px, py - this.cellH * 0.9);
  }

  private drawCursor(offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    if (!w.mouse.active) return;
    if (w.hoverId) return;
    if (!this.inView(w.mouse.x, w.mouse.y, 2)) return;
    const px = offX + w.mouse.x * this.cellW;
    const py = offY + w.mouse.y * this.cellH;
    ctx.font = `${Math.round(this.fontPx * 0.6)}px ${FONT_STACK}`;
    ctx.fillStyle = this.rgba("#d8b46a", 0.55 + 0.2 * Math.sin(now / 300));
    ctx.fillText("+", px, py);
  }

  private drawEffect(fx: Effect, offX: number, offY: number, now: number): void {
    const ctx = this.ctx;
    const age = (now - fx.born) / 1000;
    const f = Math.min(1, age / fx.dur);
    if (f >= 1) return;
    const px = offX + fx.x * this.cellW;
    const py = offY + fx.y * this.cellH;
    const fade = 1 - f;

    switch (fx.kind) {
      case "damage":
      case "heal":
      case "mana":
      case "xp":
      case "gold":
      case "pickup": {
        let text: string;
        if (fx.text && fx.kind === "damage") text = fx.text;
        else if (fx.amount === undefined) text = fx.glyph ?? "·";
        else {
          const sign = fx.kind === "damage" ? "-" : "+";
          text = `${sign}${Math.round(fx.amount)}`;
          if (fx.kind === "xp") text += " xp";
          if (fx.kind === "gold") text += "g";
        }
        if (fx.kind === "pickup") text = fx.glyph ?? "·";
        const rise = f * this.cellH * 1.45;
        const size = (fx.crit && fx.kind === "damage" ? 1.2 : 0.82) * this.fontPx;
        ctx.globalAlpha = 1 - f * f;
        ctx.font = `${Math.round(size)}px ${FONT_STACK}`;
        ctx.fillStyle = "#05070a";
        ctx.fillText(text, px + 1, py - rise + 1);
        ctx.fillStyle = fx.crit ? "#ffd070" : fx.color;
        ctx.fillText(text, px, py - rise);
        ctx.globalAlpha = 1;
        break;
      }
      case "text":
      case "emote": {
        const rise = f * this.cellH * (fx.kind === "emote" ? 0.7 : 1.1);
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * (fx.kind === "emote" ? 0.72 : 0.78))}px ${FONT_STACK}`;
        ctx.fillStyle = "#05070a";
        ctx.fillText(fx.text ?? "", px + 1, py - rise + 1);
        ctx.fillStyle = fx.color;
        ctx.fillText(fx.text ?? "", px, py - rise);
        ctx.globalAlpha = 1;
        break;
      }
      case "chatbubble": {
        const alpha = f < 0.85 ? 1 : (1 - f) / 0.15;
        ctx.globalAlpha = Math.max(0, alpha);
        this.wrappedText(fx.text ?? "", px, py - this.cellH * 1.15, fx.color, 0.58, 26);
        ctx.globalAlpha = 1;
        break;
      }
      case "cast": {
        const r = (0.3 + f * 0.9) * this.cellW;
        ctx.strokeStyle = this.rgba(fx.color, fade * 0.6);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * 0.6)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        ctx.fillText(fx.text ?? "", px, py - this.cellH * 0.9 - f * this.cellH * 0.4);
        ctx.globalAlpha = 1;
        break;
      }
      case "slash":
      case "fan":
      case "lash": {
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * 0.9)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        const count = fx.kind === "fan" ? 7 : 4;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + now / 500;
          ctx.fillText(fx.glyph ?? "╱", px + Math.cos(a) * this.cellW * (1 + f), py + Math.sin(a) * this.cellH * 0.7 * (1 + f));
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "impact":
      case "blink":
      case "trail": {
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * 0.8)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        const count = fx.kind === "impact" ? 6 : 3;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          ctx.fillText(fx.glyph ?? "·", px + Math.cos(a) * f * this.cellW * 1.6, py + Math.sin(a) * f * this.cellH * 0.9);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "explosion":
      case "nova":
      case "ring":
      case "aura":
      case "roots":
      case "smoke":
      case "healBurst":
      case "shield": {
        const radius = fx.radius ?? 2.2;
        const rr = radius * (0.35 + f * 0.65);
        ctx.beginPath();
        ctx.ellipse(px, py, rr * this.cellW, rr * this.cellH, 0, 0, Math.PI * 2);
        ctx.strokeStyle = this.rgba(fx.color, fade * 0.55);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.globalAlpha = fade * 0.8;
        ctx.font = `${Math.round(this.fontPx * 0.65)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        const glyph = fx.glyph ?? "·";
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2 + now / 900;
          ctx.fillText(glyph, px + Math.cos(a) * rr * this.cellW, py + Math.sin(a) * rr * this.cellH);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "warn": {
        const radius = fx.radius ?? 2.5;
        ctx.beginPath();
        ctx.ellipse(px, py, radius * this.cellW, radius * this.cellH, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.rgba(fx.color, 0.06 + 0.04 * Math.sin(now / 100));
        ctx.fill();
        ctx.strokeStyle = this.rgba(fx.color, 0.35);
        ctx.stroke();
        break;
      }
      case "beam": {
        const angle = fx.angle ?? 0;
        const length = fx.length ?? 8;
        ctx.strokeStyle = this.rgba(fx.color, fade * 0.7);
        ctx.lineWidth = this.cellW * 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(angle) * length * this.cellW, py + Math.sin(angle) * length * this.cellH);
        ctx.stroke();
        break;
      }
      case "teleport":
      case "respawn":
      case "levelup":
      case "summon":
      case "death": {
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * (fx.kind === "levelup" ? 1 : 0.8))}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        const count = fx.kind === "death" ? 14 : 8;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + (fx.kind === "death" ? 0 : now / 700);
          const d = (fx.kind === "respawn" || fx.kind === "teleport" || fx.kind === "levelup" ? -1 : 1) * f;
          ctx.fillText(fx.glyph ?? "·", px + Math.cos(a) * this.cellW * (1 + d * 2), py + Math.sin(a) * this.cellH * 0.7 * (1 + d) - f * this.cellH * 0.6);
        }
        if (fx.kind === "levelup") {
          ctx.globalAlpha = fade;
          ctx.font = `${Math.round(this.fontPx * 0.7)}px ${FONT_STACK}`;
          ctx.fillStyle = "#f0d080";
          ctx.fillText("LEVEL UP", px, py - this.cellH * 1.2 - f * this.cellH * 0.8);
        }
        ctx.globalAlpha = 1;
        break;
      }
      case "poison": {
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * 0.65)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        for (let i = 0; i < 5; i++) {
          ctx.fillText("☠", px + Math.sin(now / 300 + i * 1.7) * this.cellW * 0.8, py - f * this.cellH * (0.5 + i * 0.35));
        }
        ctx.globalAlpha = 1;
        break;
      }
      default: {
        ctx.globalAlpha = fade;
        ctx.font = `${Math.round(this.fontPx * 0.75)}px ${FONT_STACK}`;
        ctx.fillStyle = fx.color;
        ctx.fillText(fx.glyph ?? "·", px, py - f * this.cellH * 0.5);
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  private wrappedText(text: string, x: number, y: number, color: string, scale: number, maxChars: number): void {
    const ctx = this.ctx;
    ctx.font = `${Math.round(this.fontPx * scale)}px ${FONT_STACK}`;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    if (line) lines.push(line);
    lines.forEach((ln, i) => {
      const ly = y - (lines.length - 1 - i) * this.fontPx * scale * 1.3;
      ctx.fillStyle = "#05070a";
      ctx.fillText(ln, x + 1, ly + 1);
      ctx.fillStyle = color;
      ctx.fillText(ln, x, ly);
    });
  }

  private drawWeather(now: number, night: number, zone: string): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const weather = this.world.weather;
    if (zone === "crypt" && weather !== "ember") {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "rgba(10,14,20,0.18)");
      grad.addColorStop(1, "rgba(2,4,8,0.42)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    if (zone === "world" && night > 0.55 && weather === "clear") {
      ctx.font = `${Math.max(8, this.fontPx * 0.45)}px ${FONT_STACK}`;
      ctx.fillStyle = "rgba(190,205,220,0.28)";
      for (let i = 0; i < 50; i++) {
        const x = (hash2(i, 3, 97) * w + now * 0.002) % w;
        const y = hash2(i, 7, 91) * h * 0.55;
        ctx.fillText("·", x, y);
      }
    }

    if (weather === "rain") {
      ctx.strokeStyle = "rgba(140,180,210,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 130; i++) {
        const speed = 620 + hash2(i, 2, 11) * 400;
        const x = (hash2(i, 4, 21) * w + now * 0.02) % w;
        const y = (hash2(i, 8, 31) * h + now * speed * 0.001) % h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + 10);
      }
      ctx.stroke();
    } else if (weather === "snow") {
      ctx.font = `${Math.max(7, this.fontPx * 0.4)}px ${FONT_STACK}`;
      ctx.fillStyle = "rgba(225,235,242,0.55)";
      for (let i = 0; i < 90; i++) {
        const x = (hash2(i, 6, 43) * w + Math.sin(now / 1800 + i) * 30 + now * 0.008) % w;
        const y = (hash2(i, 9, 53) * h + now * 0.03 * (1 + hash2(i, 1, 7))) % h;
        ctx.fillText("*", x, y);
      }
    } else if (weather === "fog") {
      for (let i = 0; i < 3; i++) {
        const y = ((now * 0.008 + i * 0.33) % 1) * h;
        const grad = ctx.createLinearGradient(0, y - h * 0.2, 0, y + h * 0.2);
        grad.addColorStop(0, "rgba(170,180,175,0)");
        grad.addColorStop(0.5, "rgba(170,180,175,0.05)");
        grad.addColorStop(1, "rgba(170,180,175,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - h * 0.2, w, h * 0.4);
      }
    } else if (weather === "ember") {
      ctx.font = `${Math.max(7, this.fontPx * 0.42)}px ${FONT_STACK}`;
      for (let i = 0; i < 70; i++) {
        const x = (hash2(i, 5, 61) * w + Math.sin(now / 900 + i) * 22) % w;
        const y = h - ((hash2(i, 2, 71) * h + now * 0.05 * (1 + hash2(i, 3, 9))) % h);
        ctx.fillStyle = `rgba(230,120,60,${0.15 + 0.3 * hash2(i, 8, 13)})`;
        ctx.fillText(hash2(i, 1, 3) > 0.6 ? "˙" : "·", x, y);
      }
    }
  }
}

// ── Map rendering (minimap + full map) ───────────────────────────────────────

const mapImageCache = new Map<string, HTMLCanvasElement>();

function mapImage(zone: string, seed: number): HTMLCanvasElement {
  const key = `${zone}:${seed}`;
  const hit = mapImageCache.get(key);
  if (hit) return hit;
  const map = getMap(zone as never, seed);
  const canvas = document.createElement("canvas");
  canvas.width = map.w;
  canvas.height = map.h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(map.w, map.h);
  const cache = new Map<number, [number, number, number]>();
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    let rgb = cache.get(t);
    if (!rgb) {
      rgb = hexRgb(tileDef(t).minimap);
      cache.set(t, rgb);
    }
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  mapImageCache.set(key, canvas);
  return canvas;
}

function mapBounds(zone: string): { w: number; h: number } {
  return zone === "crypt" ? { w: CRYPT_W, h: CRYPT_H } : { w: WORLD_W, h: WORLD_H };
}

export function drawMinimap(canvas: HTMLCanvasElement, world: World): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 236;
  const cssH = canvas.clientHeight || 130;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, cssW, cssH);

  const { w, h } = mapBounds(world.zone);
  const scale = Math.min(cssW / w, cssH / h);
  const ox = (cssW - w * scale) / 2;
  const oy = (cssH - h * scale) / 2;
  ctx.drawImage(mapImage(world.zone, world.seed), ox, oy, w * scale, h * scale);

  const dot = (x: number, y: number, color: string, size = 2.4) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x * scale - size / 2, oy + y * scale - size / 2, size, size);
  };

  // Points of interest
  const pois = world.zone === "crypt"
    ? [
        { ...CRYPT_POIS.exit, c: "#f0c674" },
        { ...CRYPT_POIS.hall, c: "#9fd8f0" },
        { ...CRYPT_POIS.depths, c: "#9fd8f0" },
        { ...CRYPT_POIS.boss, c: "#e08a50" }
      ]
    : [
        { ...WORLD_POIS.town, c: "#f0c674" },
        { ...WORLD_POIS.cryptGate, c: "#9fd8f0" },
        { ...WORLD_POIS.wolfDen, c: "#b8b09a" },
        { ...WORLD_POIS.banditCamp, c: "#d08060" },
        { ...WORLD_POIS.frostRuins, c: "#9fd8f0" },
        { ...WORLD_POIS.ashenCamp, c: "#ff8a50" },
        { ...WORLD_POIS.mire, c: "#7fbf6a" },
        { ...WORLD_POIS.wyrmRoost, c: "#e08a50" }
      ];
  for (const p of pois) dot(p.x, p.y, p.c, 3);

  for (const npc of world.npcs) {
    if (npc.role === "portal") dot(npc.x, npc.y, npc.color, 4);
    else if (npc.role === "shrine") dot(npc.x, npc.y, "#f0c674", 3);
  }
  for (const mob of world.mobs.values()) dot(mob.vx, mob.vy, mob.rare ? "#c07ae8" : "#b04a3a", 1.6);
  for (const p of world.players.values()) dot(p.vx, p.vy, "#8fd0a0", 3);
  if (world.party) {
    for (const m of world.party.members) {
      if (m.id === world.self?.id) continue;
      // party members outside interest are approximated from their last known zone marker
      void m;
    }
  }

  const pulse = 2.6 + Math.sin(performance.now() / 260) * 0.8;
  dot(world.predicted.x, world.predicted.y, "#f2d38a", pulse * 1.8);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, w * scale - 1, h * scale - 1);
}

export function drawFullMap(canvas: HTMLCanvasElement, world: World): void {
  const { w, h } = mapBounds(world.zone);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const targetW = 620;
  const targetH = Math.round(targetW * (h / w));
  canvas.width = targetW * dpr;
  canvas.height = targetH * dpr;
  canvas.style.width = `${targetW}px`;
  canvas.style.height = `${targetH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, targetW, targetH);

  ctx.drawImage(mapImage(world.zone, world.seed), 0, 0, targetW, targetH);
  ctx.fillStyle = "rgba(5,7,10,0.25)";
  ctx.fillRect(0, 0, targetW, targetH);

  const sx = targetW / w;
  const sy = targetH / h;

  ctx.font = '9px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const point = (x: number, y: number, color: string, label: string, size = 3) => {
    const px = x * sx;
    const py = y * sy;
    ctx.fillStyle = color;
    ctx.fillRect(px - size, py - size, size * 2, size * 2);
    ctx.fillStyle = "#05070a";
    ctx.fillText(label, px + 1, py - 9);
    ctx.fillStyle = color;
    ctx.fillText(label, px, py - 10);
  };

  if (world.zone === "crypt") {
    point(CRYPT_POIS.exit.x, CRYPT_POIS.exit.y, "#f0c674", "EXIT");
    point(CRYPT_POIS.hall.x, CRYPT_POIS.hall.y, "#9fd8f0", "HALL");
    point(CRYPT_POIS.depths.x, CRYPT_POIS.depths.y, "#9fd8f0", "DEPTHS");
    point(CRYPT_POIS.boss.x, CRYPT_POIS.boss.y, "#e08a50", "CINDER KING");
  } else {
    point(WORLD_POIS.town.x, WORLD_POIS.town.y, "#f0c674", "HEARTHVALE", 4);
    point(WORLD_POIS.cryptGate.x, WORLD_POIS.cryptGate.y, "#9fd8f0", "SUNKEN CRYPT");
    point(WORLD_POIS.wolfDen.x, WORLD_POIS.wolfDen.y, "#b8b09a", "WOLF DEN");
    point(WORLD_POIS.banditCamp.x, WORLD_POIS.banditCamp.y, "#d08060", "BANDIT CAMP");
    point(WORLD_POIS.frostRuins.x, WORLD_POIS.frostRuins.y, "#9fd8f0", "FROSTFEN RUINS");
    point(WORLD_POIS.ashenCamp.x, WORLD_POIS.ashenCamp.y, "#ff8a50", "ASHEN CAMP");
    point(WORLD_POIS.mire.x, WORLD_POIS.mire.y, "#7fbf6a", "MIREFEN");
    point(WORLD_POIS.wyrmRoost.x, WORLD_POIS.wyrmRoost.y, "#e08a50", "WYRM ROOST");
  }

  for (const npc of world.npcs) {
    ctx.fillStyle = npc.color;
    ctx.fillRect(npc.x * sx - 1.5, npc.y * sy - 1.5, 3, 3);
  }
  for (const mob of world.mobs.values()) {
    ctx.fillStyle = mob.rare ? "#c07ae8" : "#a04a3a";
    ctx.fillRect(mob.vx * sx - 1, mob.vy * sy - 1, 2, 2);
  }
  for (const p of world.players.values()) {
    ctx.fillStyle = "#8fd0a0";
    ctx.fillRect(p.vx * sx - 1.5, p.vy * sy - 1.5, 3, 3);
  }

  const px = world.predicted.x * sx;
  const py = world.predicted.y * sy;
  const pulse = 4 + Math.sin(performance.now() / 240) * 1.5;
  ctx.strokeStyle = "#f2d38a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(px, py, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#f2d38a";
  ctx.fillRect(px - 2, py - 2, 4, 4);
}

export function abilityFor(classId: string, slot: number): AbilityDef | undefined {
  const list = Object.values(ABILITIES).filter((a) => a.classId === classId);
  return list[slot];
}

export function rarityColor(rarity: string): string {
  return RARITY_COLOR[rarity as keyof typeof RARITY_COLOR] ?? "#a8a49a";
}
