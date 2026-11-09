import { CLASSES, NPCS, PORTALS, QUESTS, SHRINES, regionAt } from "../shared/content";
import { dist, moveWithCollision } from "../shared/formulas";
import type {
  CastSnap, ChatMsg, DialogData, EntSnap, Fx, GroundItemSnap, PartyView, PlayerData,
  ProjectileSnap, QuestState, SelfSnap, Snapshot, ZoneId, ZoneSnap
} from "../shared/types";
import { WORLD_SEED, getMap, type GameMap } from "../shared/worldgen";

export type Phase = "title" | "connecting" | "playing";

export interface EntityView extends EntSnap {
  /** smoothed render position */
  vx: number;
  vy: number;
}

export interface LogEntry {
  id: number;
  channel: string;
  from: string;
  text: string;
  color?: string;
  at: number;
}

export interface Effect {
  kind: string;
  x: number;
  y: number;
  born: number;
  dur: number;
  amount?: number;
  crit?: boolean;
  color: string;
  glyph?: string;
  text?: string;
  radius?: number;
  angle?: number;
  length?: number;
  id?: string;
}

export interface InteractHint {
  kind: "npc" | "portal" | "shrine" | "item";
  label: string;
  glyph: string;
  color: string;
  x: number;
  y: number;
}

const BASE_SPEED = 4.4;
const SPRINT_MULT = 1.45;
const MAX_LOG = 80;

let logSeq = 0;

export class World {
  phase: Phase = "title";
  token = "";
  data: PlayerData | null = null;
  seed = WORLD_SEED;
  zone: ZoneId = "world";
  map: GameMap = getMap("world");
  self: SelfSnap | null = null;

  predicted = { x: 132.5, y: 96.5 };
  serverPos = { x: 132.5, y: 96.5 };
  facing = 0;
  stamina = 100;

  players = new Map<string, EntityView>();
  mobs = new Map<string, EntityView>();
  npcs: EntSnap[] = [];
  items: GroundItemSnap[] = [];
  projectiles: ProjectileSnap[] = [];
  casts: CastSnap[] = [];
  zones: ZoneSnap[] = [];

  party: PartyView | null = null;
  dialog: DialogData | null = null;

  weather = "clear";
  dayTime = 0.33;
  online = 1;
  latency = 0;

  effects: Effect[] = [];
  logs: LogEntry[] = [];

  mouse = { x: 132.5, y: 96.5, active: false };
  hoverId: string | null = null;
  hoverItemId: string | null = null;
  hoverWorld: { x: number; y: number } | null = null;

  camX = 132.5;
  camY = 96.5;
  shake = 0;
  time = 0;

  get me(): EntityView | null {
    if (!this.self) return null;
    return {
      ...this.self,
      kind: "player",
      glyph: CLASSES[this.self.classId].glyph,
      color: CLASSES[this.self.classId].color,
      name: this.self.name,
      vx: this.predicted.x,
      vy: this.predicted.y
    };
  }

  reset(): void {
    this.phase = "title";
    this.data = null;
    this.self = null;
    this.token = "";
    this.players.clear();
    this.mobs.clear();
    this.npcs = [];
    this.items = [];
    this.projectiles = [];
    this.casts = [];
    this.zones = [];
    this.party = null;
    this.dialog = null;
    this.effects = [];
    this.logs = [];
    this.hoverId = null;
    this.hoverItemId = null;
    this.mouse.active = false;
    this.shake = 0;
    this.zone = "world";
    this.map = getMap("world");
    this.seed = WORLD_SEED;
  }

  enter(welcome: { token: string; data: PlayerData; zone: ZoneId; seed: number; time: number; online: number; self: SelfSnap }): void {
    this.reset();
    this.phase = "playing";
    this.token = welcome.token;
    this.data = welcome.data;
    this.self = welcome.self;
    this.zone = welcome.zone;
    this.seed = welcome.seed;
    this.map = getMap(welcome.zone, welcome.seed);
    this.dayTime = welcome.time;
    this.online = welcome.online;
    this.predicted = { x: welcome.self.x, y: welcome.self.y };
    this.serverPos = { ...this.predicted };
    this.camX = this.predicted.x;
    this.camY = this.predicted.y;
    this.stamina = welcome.self.stamina;
    this.facing = welcome.self.facing;
  }

  applyPlayerData(data: PlayerData): void {
    this.data = data;
  }

  applySnapshot(snap: Snapshot): void {
    const zoneChanged = snap.zone !== this.zone;
    this.zone = snap.zone;
    if (zoneChanged) {
      this.map = getMap(snap.zone, this.seed);
      this.players.clear();
      this.mobs.clear();
      this.npcs = [];
      this.items = [];
      this.projectiles = [];
      this.casts = [];
      this.zones = [];
    }

    this.self = snap.self;
    this.weather = snap.weather;
    this.dayTime = snap.time;
    this.stamina = snap.self.stamina;
    this.serverPos = { x: snap.self.x, y: snap.self.y };
    this.party = snap.self.party;
    this.latency = 0;

    // Client prediction reconciliation: stay local unless the server meaningfully disagrees.
    const err = dist(this.predicted.x, this.predicted.y, snap.self.x, snap.self.y);
    if (zoneChanged || err > 2.2) {
      this.predicted.x = snap.self.x;
      this.predicted.y = snap.self.y;
    } else if (err > 0.65) {
      this.predicted.x += (snap.self.x - this.predicted.x) * 0.22;
      this.predicted.y += (snap.self.y - this.predicted.y) * 0.22;
    }

    this.syncEntities(this.players, snap.players);
    this.syncEntities(this.mobs, snap.mobs);
    this.npcs = snap.npcs;
    this.items = snap.items;
    this.projectiles = snap.projectiles;
    this.casts = snap.casts;
    this.zones = snap.zones;
  }

  private syncEntities(map: Map<string, EntityView>, next: EntSnap[]): void {
    const seen = new Set<string>();
    for (const ent of next) {
      seen.add(ent.id);
      const prev = map.get(ent.id);
      if (prev) {
        const vx = prev.vx;
        const vy = prev.vy;
        Object.assign(prev, ent);
        prev.vx = vx;
        prev.vy = vy;
      } else {
        map.set(ent.id, { ...ent, vx: ent.x, vy: ent.y });
      }
    }
    for (const id of [...map.keys()]) {
      if (!seen.has(id)) map.delete(id);
    }
  }

  applyZone(zone: ZoneId, seed: number, x: number, y: number, time: number): void {
    this.zone = zone;
    this.seed = seed;
    this.map = getMap(zone, seed);
    this.predicted = { x, y };
    this.serverPos = { x, y };
    this.camX = x;
    this.camY = y;
    this.dayTime = time;
    this.players.clear();
    this.mobs.clear();
    this.npcs = [];
    this.items = [];
    this.projectiles = [];
    this.casts = [];
    this.zones = [];
  }

  /** Advance prediction, camera smoothing and entity interpolation. */
  step(dt: number, ax: number, ay: number, sprint: boolean): { moving: boolean; ax: number; ay: number } {
    this.time += dt;
    const me = this.self;
    const canMove = this.phase === "playing" && !!me && !me.dead;
    let moving = false;
    let nx = 0;
    let ny = 0;

    if (canMove && (ax !== 0 || ay !== 0)) {
      const len = Math.hypot(ax, ay);
      nx = ax / len;
      ny = ay / len;
      const sprinting = sprint && this.stamina > 1;
      const speed = BASE_SPEED * (sprinting ? SPRINT_MULT : 1);
      const moved = moveWithCollision(this.map, this.predicted.x, this.predicted.y, nx * speed, ny * speed, dt, 0.33);
      moving = Math.abs(moved.x - this.predicted.x) + Math.abs(moved.y - this.predicted.y) > 0.0005;
      this.predicted.x = moved.x;
      this.predicted.y = moved.y;
      this.facing = Math.atan2(ny, nx);
      // Client-side stamina guess for sprint feedback; snapshots own the truth.
      this.stamina = Math.max(0, sprinting ? this.stamina - 19 * dt : Math.min(this.stamina + 14 * dt, me.maxStamina));
    } else if (canMove) {
      this.stamina = Math.min(me?.maxStamina ?? 100, this.stamina + 14 * dt);
    }

    // Smooth other bodies toward the newest authoritative sample.
    const k = Math.min(1, dt * 16);
    for (const ent of this.players.values()) {
      ent.vx += (ent.x - ent.vx) * k;
      ent.vy += (ent.y - ent.vy) * k;
    }
    for (const ent of this.mobs.values()) {
      ent.vx += (ent.x - ent.vx) * k;
      ent.vy += (ent.y - ent.vy) * k;
    }

    // Camera
    const camK = Math.min(1, dt * 10);
    this.camX += (this.predicted.x - this.camX) * camK;
    this.camY += (this.predicted.y - this.camY) * camK;
    this.shake = Math.max(0, this.shake - dt * 2.2);

    // Age out effects.
    const now = performance.now();
    if (this.effects.length) {
      this.effects = this.effects.filter((e) => now - e.born < e.dur * 1000);
    }

    return { moving, ax: nx, ay: ny };
  }

  spawnFx(fx: Fx): void {
    const now = performance.now();
    const defaultDur: Record<string, number> = {
      damage: 1.0, heal: 1.0, mana: 1.0, xp: 1.1, gold: 1.2, text: 1.0,
      cast: 0.7, impact: 0.35, slash: 0.32, explosion: 0.55, nova: 0.55,
      ring: 0.5, aura: 0.9, warn: 0.55, beam: 0.5, roots: 0.8, smoke: 0.8,
      blink: 0.4, teleport: 0.9, respawn: 1.2, summon: 0.8, trail: 0.4,
      pickup: 1.0, levelup: 1.5, death: 1.0, poison: 0.7, lash: 0.4,
      fan: 0.45, healBurst: 0.9, shield: 0.7, emote: 1.6, chatbubble: 3.4
    };
    this.effects.push({
      kind: fx.kind,
      x: fx.x,
      y: fx.y,
      born: now,
      dur: fx.dur ?? defaultDur[fx.kind] ?? 0.6,
      amount: fx.amount,
      crit: fx.crit,
      color: fx.color ?? "#d8b46a",
      glyph: fx.glyph,
      text: fx.text,
      radius: fx.radius,
      angle: fx.angle,
      length: fx.length,
      id: fx.id
    });
    if (fx.kind === "damage" && fx.id && this.self && fx.id === this.self.id) {
      this.shake = Math.min(1, this.shake + (fx.crit ? 0.7 : 0.4));
    }
    if (fx.kind === "death" && fx.id && this.self && fx.id === this.self.id) this.shake = 1;
  }

  pushLog(msg: Pick<LogEntry, "channel" | "from" | "text" | "color">): LogEntry {
    const entry: LogEntry = { ...msg, id: ++logSeq, at: Date.now() };
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG) this.logs.splice(0, this.logs.length - MAX_LOG);
    return entry;
  }

  logFromChat(msg: ChatMsg): LogEntry {
    return this.pushLog({ channel: msg.channel, from: msg.from, text: msg.text, color: msg.color });
  }

  closeDialog(): void {
    this.dialog = null;
  }

  findEntityAt(x: number, y: number, radius = 0.9): EntityView | null {
    let best: EntityView | null = null;
    let bestD = radius;
    for (const m of this.mobs.values()) {
      const d = dist(x, y, m.vx, m.vy);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) return best;
    for (const p of this.players.values()) {
      const d = dist(x, y, p.vx, p.vy);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  findNpcAt(x: number, y: number, radius = 1): EntSnap | null {
    let best: EntSnap | null = null;
    let bestD = radius;
    for (const n of this.npcs) {
      const d = dist(x, y, n.x, n.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  findItemAt(x: number, y: number, radius = 0.85): GroundItemSnap | null {
    let best: GroundItemSnap | null = null;
    let bestD = radius;
    for (const it of this.items) {
      const d = dist(x, y, it.x, it.y);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  nearestMob(radius = 30): EntityView | null {
    let best: EntityView | null = null;
    let bestD = radius;
    for (const m of this.mobs.values()) {
      if (m.dead) continue;
      const d = dist(this.predicted.x, this.predicted.y, m.vx, m.vy);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  targetedEntity(): EntityView | null {
    const id = this.self?.targetId;
    if (!id) return null;
    return this.mobs.get(id) ?? this.players.get(id) ?? null;
  }

  activeQuests(): { def: (typeof QUESTS)[string]; state: QuestState; done: boolean }[] {
    if (!this.data) return [];
    const out: { def: (typeof QUESTS)[string]; state: QuestState; done: boolean }[] = [];
    for (const q of this.data.quests) {
      const def = QUESTS[q.id];
      if (!def) continue;
      const done = def.objectives.every((o, i) => (q.progress[i] ?? 0) >= o.count);
      out.push({ def, state: q, done });
    }
    return out;
  }

  inventoryCount(baseId: string): number {
    if (!this.data) return 0;
    return this.data.inventory.reduce((n, i) => i.baseId === baseId ? n + i.qty : n, 0);
  }

  potionCount(kind: "hp" | "mp"): number {
    if (!this.data) return 0;
    return this.data.inventory.reduce((n, i) => {
      if (kind === "hp" && i.consumable?.hp) return n + i.qty;
      if (kind === "mp" && i.consumable?.mp) return n + i.qty;
      return n;
    }, 0);
  }

  regionName(): { name: string; subtitle: string } {
    return regionAt(this.zone, this.predicted.x, this.predicted.y);
  }

  interactHint(): InteractHint | null {
    if (!this.self || this.self.dead) return null;
    const { x, y } = this.predicted;

    const item = this.items.find((g) => dist(x, y, g.x, g.y) <= 1.4);
    if (item) return { kind: "item", label: `Loot ${item.name}${item.qty > 1 ? ` ×${item.qty}` : ""}`, glyph: item.glyph, color: item.color, x: item.x, y: item.y };

    let bestNpc: { label: string; glyph: string; color: string; x: number; y: number } | null = null;
    let bestD = 3.8;
    for (const npc of NPCS) {
      if (npc.zone !== this.zone) continue;
      const d = dist(x, y, npc.x, npc.y);
      if (d < bestD) {
        bestD = d;
        bestNpc = { label: npc.role === "vendor" ? `Trade with ${npc.name}` : `Speak with ${npc.name}`, glyph: npc.glyph, color: npc.color, x: npc.x, y: npc.y };
      }
    }
    if (bestNpc) return { kind: "npc", ...bestNpc };

    for (const portal of PORTALS) {
      if (portal.zone !== this.zone) continue;
      if (dist(x, y, portal.x, portal.y) <= 2.5) {
        return { kind: "portal", label: `Enter ${portal.name}`, glyph: portal.glyph, color: portal.color, x: portal.x, y: portal.y };
      }
    }
    for (const shrine of SHRINES) {
      if (shrine.zone !== this.zone) continue;
      if (dist(x, y, shrine.x, shrine.y) <= 2.6) {
        return { kind: "shrine", label: `Attune to ${shrine.name}`, glyph: "☼", color: "#f0c674", x: shrine.x, y: shrine.y };
      }
    }
    return null;
  }

  questProgressText(id: string): string {
    if (!this.data) return "";
    const state = this.data.quests.find((q) => q.id === id);
    const def = QUESTS[id];
    if (!state || !def) return "";
    return def.objectives
      .map((o, i) => `${o.label} ${Math.min(o.count, state.progress[i] ?? 0)}/${o.count}`)
      .join(" · ");
  }

  xpFraction(): number {
    if (!this.self || this.self.xpNext <= 0) return 0;
    return Math.max(0, Math.min(1, this.self.xp / this.self.xpNext));
  }
}
