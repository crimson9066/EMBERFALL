import type { ClassId, Derived, Item, ItemSlot, StatBlock } from "./types";
import { CLASSES } from "./content";
import { isWalkable, type GameMap } from "./worldgen";

export interface EquipSet {
  weapon: Item | null;
  armor: Item | null;
  trinket: Item | null;
}

export function emptyEquip(): EquipSet {
  return { weapon: null, armor: null, trinket: null };
}

export function totalStats(level: number, classId: ClassId, gear: EquipSet): StatBlock {
  const def = CLASSES[classId];
  const out: StatBlock = {
    str: def.stats.str + def.growth.str * (level - 1),
    agi: def.stats.agi + def.growth.agi * (level - 1),
    int: def.stats.int + def.growth.int * (level - 1),
    vit: def.stats.vit + def.growth.vit * (level - 1)
  };
  for (const slot of ["weapon", "armor", "trinket"] as ItemSlot[]) {
    const it = gear[slot];
    if (!it?.stats) continue;
    out.str += it.stats.str ?? 0;
    out.agi += it.stats.agi ?? 0;
    out.int += it.stats.int ?? 0;
    out.vit += it.stats.vit ?? 0;
  }
  return {
    str: Math.round(out.str),
    agi: Math.round(out.agi),
    int: Math.round(out.int),
    vit: Math.round(out.vit)
  };
}

export function deriveStats(level: number, classId: ClassId, gear: EquipSet): { stats: StatBlock; derived: Derived } {
  const def = CLASSES[classId];
  const stats = totalStats(level, classId, gear);
  let flatHp = 0;
  let flatMp = 0;
  let armor = 0;
  let attack = 0;
  let spell = 0;
  let crit = 0;
  let haste = 0;
  let lifesteal = 0;
  for (const slot of ["weapon", "armor", "trinket"] as ItemSlot[]) {
    const s = gear[slot]?.stats;
    if (!s) continue;
    flatHp += s.hp ?? 0;
    flatMp += s.mp ?? 0;
    armor += s.armor ?? 0;
    attack += s.attack ?? 0;
    spell += s.spell ?? 0;
    crit += s.crit ?? 0;
    haste += s.haste ?? 0;
    lifesteal += s.lifesteal ?? 0;
  }
  const maxHp = Math.round(def.hp + level * 8 + stats.vit * 7 + flatHp);
  const maxMp = Math.round(def.mp + level * 3 + stats.int * 5 + flatMp);
  return {
    stats,
    derived: {
      maxHp,
      maxMp,
      maxStamina: Math.round(def.stamina + level * 1.5 + stats.agi * 0.5),
      attack: Math.round(4 + attack + stats.str * 1.55 + stats.agi * 0.55),
      spell: Math.round(3 + spell + stats.int * 1.75 + stats.str * 0.15),
      armor: Math.round(armor + stats.vit * 0.55 + stats.agi * 0.2),
      crit: Math.min(65, Math.round((5 + stats.agi * 0.18 + crit) * 10) / 10),
      haste: Math.min(40, Math.round(haste * 10) / 10),
      lifesteal: Math.round(lifesteal * 10) / 10
    }
  };
}

export function armorMitigation(armor: number, level: number): number {
  return armor / (armor + 90 + level * 11);
}

export interface DamageRoll {
  amount: number;
  crit: boolean;
}

export function rollDamage(
  power: number,
  targetArmor: number,
  targetLevel: number,
  critChance: number,
  rng: () => number,
  variance = 0.12
): DamageRoll {
  let amount = power * (1 - variance + rng() * variance * 2);
  const crit = rng() * 100 < critChance;
  if (crit) amount *= 1.75;
  amount *= 1 - armorMitigation(targetArmor, targetLevel);
  return { amount: Math.max(1, Math.round(amount)), crit };
}

export function levelXpMultiplier(mobLevel: number, playerLevel: number): number {
  const diff = mobLevel - playerLevel;
  return Math.max(0.1, Math.min(1.6, 1 + diff * 0.08));
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function normalize(x: number, y: number): { x: number; y: number; len: number } {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

export function inCone(
  ox: number, oy: number, facing: number, tx: number, ty: number, radius: number, halfAngle: number
): boolean {
  if (dist(ox, oy, tx, ty) > radius) return false;
  const a = Math.atan2(ty - oy, tx - ox);
  let d = a - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= halfAngle;
}

// ── Collision ───────────────────────────────────────────────────────────────

export function canStand(map: GameMap, x: number, y: number, radius = 0.32): boolean {
  const checks = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius]
  ];
  for (const [cx, cy] of checks) {
    if (!isWalkable(map, cx, cy)) return false;
  }
  return true;
}

export function moveWithCollision(
  map: GameMap,
  x: number,
  y: number,
  vx: number,
  vy: number,
  dt: number,
  radius = 0.32
): { x: number; y: number } {
  let dx = vx * dt;
  let dy = vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  dx /= steps;
  dy /= steps;
  let nx = x;
  let ny = y;
  for (let i = 0; i < steps; i++) {
    if (dx !== 0 && canStand(map, nx + dx, ny, radius)) nx += dx;
    if (dy !== 0 && canStand(map, nx, ny + dy, radius)) ny += dy;
  }
  return { x: nx, y: ny };
}

export function findPathStep(
  map: GameMap,
  fromX: number, fromY: number, toX: number, toY: number, radius = 0.32
): { x: number; y: number } {
  const n = normalize(toX - fromX, toY - fromY);
  const tryDirs = [
    [n.x, n.y],
    [n.x, n.y * 0.3],
    [n.x * 0.3, n.y],
    [n.y, -n.x],
    [-n.y, n.x]
  ];
  for (const [dx, dy] of tryDirs) {
    if (canStand(map, fromX + dx * 0.35, fromY + dy * 0.35, radius)) {
      return { x: fromX + dx * 0.35, y: fromY + dy * 0.35 };
    }
  }
  return { x: fromX, y: fromY };
}
