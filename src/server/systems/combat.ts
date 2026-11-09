import { ABILITIES, CLASSES, MOBS, classAbilities, type AbilityDef } from "../../shared/content";
import { canStand, dist, inCone, normalize, rollDamage } from "../../shared/formulas";
import { getMap, isWalkable, WORLD_SEED } from "../../shared/worldgen";
import type { Game } from "../game";
import type { SPlayer, SMob, SStatus } from "../types";

const MEELE_PAD = 1.0;
const PROJECTILE_SPEED = 17;

type Buffed = { buffs: SStatus[] };

export function playerPower(p: SPlayer): number {
  const caster = p.data.classId === "arcanist" || p.data.classId === "warden";
  return caster ? p.data.derived.spell : p.data.derived.attack;
}

export function powerMultiplier(p: SPlayer): number {
  let mult = 1;
  for (const b of p.buffs) if (b.id === "rally" && b.kind === "buff") mult += b.value;
  return mult;
}

export function effectiveArmor(p: SPlayer): number {
  let bonus = 0;
  for (const b of p.buffs) {
    if (b.kind === "buff" && (b.id === "ironclad" || b.id === "bark_skin")) bonus = Math.max(bonus, b.value);
  }
  return p.data.derived.armor * (1 + bonus);
}

export function mobArmor(mob: SMob): number {
  return mob.level * 2.2 + (mob.elite ? 14 : 0) + (mob.boss ? 34 : 0);
}

export function nearestMob(game: Game, zone: string, x: number, y: number, radius: number, excludeId?: string): SMob | null {
  let best: SMob | null = null;
  let bestD = radius;
  for (const m of game.mobs.values()) {
    if (m.dead || m.zone !== zone || m.id === excludeId) continue;
    const d = dist(x, y, m.x, m.y);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

export function mobsInRadius(game: Game, zone: string, x: number, y: number, radius: number): SMob[] {
  const out: SMob[] = [];
  for (const m of game.mobs.values()) {
    if (!m.dead && m.zone === zone && dist(x, y, m.x, m.y) <= radius + 0.45) out.push(m);
  }
  return out;
}

export function playersInRadius(game: Game, zone: string, x: number, y: number, radius: number): SPlayer[] {
  const out: SPlayer[] = [];
  for (const p of game.players.values()) {
    if (!p.dead && p.zone === zone && dist(x, y, p.x, p.y) <= radius + 0.35) out.push(p);
  }
  return out;
}

export function addStatus(target: Buffed, status: SStatus): void {
  const existing = target.buffs.find((b) => b.id === status.id);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, status.remaining);
    existing.value = status.kind === "shield" ? Math.max(existing.value, status.value) : status.value;
    existing.tickAt = status.tickAt;
  } else {
    target.buffs.push({ ...status });
  }
}

export function buffValue(target: Buffed, id: string): number {
  let v = 0;
  for (const b of target.buffs) if (b.id === id) v = Math.max(v, b.value);
  return v;
}

function absorbShield(game: Game, p: SPlayer, amount: number): number {
  let remaining = amount;
  for (const b of p.buffs) {
    if (b.kind !== "shield" || b.value <= 0) continue;
    const absorbed = Math.min(b.value, remaining);
    b.value -= absorbed;
    remaining -= absorbed;
    if (absorbed > 0) {
      game.sendFx(p.zone, p.x, p.y, { kind: "shield", x: p.x, y: p.y, amount: Math.round(absorbed), color: b.color, id: p.id });
    }
    if (b.value <= 0) b.remaining = 0;
    if (remaining <= 0) break;
  }
  return remaining;
}

export function damagePlayer(
  game: Game,
  p: SPlayer,
  power: number,
  sourceName: string,
  critChance = 5,
  ignoreArmor = false
): number {
  if (p.dead || power <= 0) return 0;
  const evasion = buffValue(p, "evasion");
  if (!ignoreArmor && evasion > 0 && Math.random() < evasion) {
    game.sendFx(p.zone, p.x, p.y, { kind: "text", x: p.x, y: p.y - 0.7, text: "dodge", color: "#b8c8c0", id: p.id });
    return 0;
  }
  const roll = ignoreArmor
    ? { amount: Math.max(1, Math.round(power)), crit: false }
    : rollDamage(power, effectiveArmor(p), p.data.level, critChance, Math.random);
  const afterShield = absorbShield(game, p, roll.amount);
  if (afterShield <= 0) return 0;
  p.hp -= afterShield;
  p.lastDamageAt = game.time;
  p.inCombatUntil = game.time + 5;
  game.sendFx(p.zone, p.x, p.y, {
    kind: "damage", x: p.x, y: p.y, amount: afterShield, crit: roll.crit,
    color: "#ff7060", id: p.id, text: sourceName
  });
  if (p.hp <= 0) killPlayer(game, p, sourceName);
  return afterShield;
}

export function directHurtPlayer(game: Game, p: SPlayer, amount: number, sourceName: string, color = "#c07ae8"): void {
  if (p.dead || amount <= 0) return;
  const afterShield = absorbShield(game, p, amount);
  if (afterShield <= 0) return;
  p.hp -= afterShield;
  p.inCombatUntil = game.time + 4;
  game.sendFx(p.zone, p.x, p.y, { kind: "damage", x: p.x, y: p.y, amount: Math.round(afterShield), color, id: p.id, text: sourceName });
  if (p.hp <= 0) killPlayer(game, p, sourceName);
}

export function healPlayer(game: Game, p: SPlayer, rawAmount: number, color = "#8fe0a0"): void {
  if (p.dead || rawAmount <= 0) return;
  const amount = Math.max(1, Math.round(rawAmount));
  const before = p.hp;
  p.hp = Math.min(p.data.derived.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (gained > 0) game.sendFx(p.zone, p.x, p.y, { kind: "heal", x: p.x, y: p.y, amount: gained, color, id: p.id });
}

export function damageMob(
  game: Game,
  p: SPlayer,
  mob: SMob,
  power: number,
  critChance: number,
  color = "#f0d090"
): number {
  if (mob.dead) return 0;
  const roll = rollDamage(power, mobArmor(mob), mob.level, critChance, Math.random);
  mob.hp -= roll.amount;
  mob.state = "chase";
  mob.targetId = p.id;
  p.inCombatUntil = game.time + 5;
  game.sendFx(mob.zone, mob.x, mob.y, {
    kind: "damage", x: mob.x, y: mob.y, amount: roll.amount, crit: roll.crit, color, id: mob.id
  });
  if (p.data.derived.lifesteal > 0) healPlayer(game, p, roll.amount * p.data.derived.lifesteal / 100, "#b06070");
  if (mob.hp <= 0) game.killMob(p, mob);
  return roll.amount;
}

export function spawnProjectile(
  game: Game,
  opts: {
    zone: string; x: number; y: number; dirX: number; dirY: number; speed?: number;
    ownerId: string; ownerIsPlayer: boolean; power: number; critChance: number;
    color: string; glyph: string; kind: "attack" | "ability" | "mob";
    hitRadius?: number; abilityId?: string; ttl?: number;
  }
): void {
  const n = normalize(opts.dirX, opts.dirY);
  if (n.len < 0.01) return;
  const speed = opts.speed ?? PROJECTILE_SPEED;
  const id = game.uid("pr");
  game.projectiles.set(id, {
    id, zone: opts.zone as never, x: opts.x, y: opts.y,
    vx: n.x * speed, vy: n.y * speed, ownerId: opts.ownerId, ownerIsPlayer: opts.ownerIsPlayer,
    ttl: opts.ttl ?? 2.2, power: opts.power, critChance: opts.critChance, color: opts.color,
    glyph: opts.glyph, hitRadius: opts.hitRadius ?? 0.65, kind: opts.kind, abilityId: opts.abilityId
  });
}

function fail(game: Game, p: SPlayer, text: string, color = "#b8a890"): void {
  game.send(p, { t: "fx", fx: { kind: "text", x: p.x, y: p.y - 0.8, text, color, dur: 0.9 } });
}

function clampAim(p: SPlayer, x: number, y: number, range: number): { x: number; y: number } {
  const dx = x - p.x;
  const dy = y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= range || d < 0.001) return { x, y };
  return { x: p.x + (dx / d) * range, y: p.y + (dy / d) * range };
}

function resolveEnemy(game: Game, p: SPlayer, range: number, aimX: number, aimY: number): SMob | null {
  const selected = p.targetId ? game.mobs.get(p.targetId) : null;
  if (selected && !selected.dead && selected.zone === p.zone && dist(p.x, p.y, selected.x, selected.y) <= range + MEELE_PAD) {
    return selected;
  }
  let best: SMob | null = null;
  let bestScore = Infinity;
  for (const m of game.mobs.values()) {
    if (m.dead || m.zone !== p.zone) continue;
    const dp = dist(p.x, p.y, m.x, m.y);
    if (dp > range + MEELE_PAD) continue;
    const da = dist(aimX, aimY, m.x, m.y);
    const score = da + dp * 0.15;
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}

function dash(game: Game, p: SPlayer, aimX: number, aimY: number, maxDist: number): { x: number; y: number } {
  const n = normalize(aimX - p.x, aimY - p.y);
  if (n.len < 0.01) return { x: p.x, y: p.y };
  const map = getMap(p.zone);
  const step = 0.25;
  let travelled = 0;
  while (travelled < maxDist) {
    const nx = p.x + n.x * step;
    const ny = p.y + n.y * step;
    if (!canStand(map, nx, ny, 0.33)) break;
    p.x = nx;
    p.y = ny;
    travelled += step;
  }
  if (travelled > 0) game.sendFx(p.zone, p.x, p.y, { kind: "trail", x: p.x, y: p.y, color: "#b8d8f0", id: p.id });
  return { x: p.x, y: p.y };
}

export function tickStatuses(game: Game, p: SPlayer, dt: number): void {
  let changed = false;
  for (const b of p.buffs) {
    b.remaining -= dt;
    if (b.kind === "dot" && b.dps) {
      if (b.tickAt === undefined) b.tickAt = 0.5;
      b.tickAt -= dt;
      while (b.tickAt <= 0 && !p.dead) {
        b.tickAt += 0.5;
        directHurtPlayer(game, p, b.dps * 0.5, b.name, b.color);
      }
    }
    if (b.kind === "hot" && b.hps) {
      if (b.tickAt === undefined) b.tickAt = 0.5;
      b.tickAt -= dt;
      while (b.tickAt <= 0) {
        b.tickAt += 0.5;
        healPlayer(game, p, b.hps * 0.5, b.color);
      }
    }
    if (b.remaining <= 0) changed = true;
  }
  if (changed) p.buffs = p.buffs.filter((b) => b.remaining > 0);
}

export function killPlayer(game: Game, p: SPlayer, sourceName: string): void {
  if (p.dead) return;
  p.dead = true;
  p.hp = 0;
  p.respawnLeft = 8;
  p.autoAttack = false;
  p.targetId = null;
  p.buffs = [];
  p.data.deaths++;
  const lost = Math.min(100, Math.floor(p.data.gold * 0.1));
  p.data.gold -= lost;
  game.send(p, { t: "death", respawnIn: 8 });
  game.sendFx(p.zone, p.x, p.y, { kind: "death", x: p.x, y: p.y, color: "#ff5a4a", id: p.id });
  game.sendLog(p, `You were slain by ${sourceName}.${lost > 0 ? ` ${lost} gold slipped from your purse.` : ""}`, "#ff7a6a");
  game.sendData(p);
  game.persist(p);
}

export function respawnPlayer(game: Game, p: SPlayer): void {
  if (!p.dead) return;
  const rz = p.data.respawn.zone;
  const map = getMap(rz);
  let x = p.data.respawn.x;
  let y = p.data.respawn.y;
  if (!isWalkable(map, x, y)) { x = 132.5; y = 96.5; }
  const zoneChanged = p.zone !== rz;
  p.zone = rz;
  p.x = x;
  p.y = y;
  p.dead = false;
  p.respawnLeft = 0;
  p.hp = Math.round(p.data.derived.maxHp * 0.6);
  p.mp = Math.round(p.data.derived.maxMp * 0.5);
  p.stamina = p.data.derived.maxStamina;
  p.buffs = [];
  p.inCombatUntil = 0;
  if (zoneChanged) game.send(p, { t: "zone", zone: rz, seed: WORLD_SEED, x, y, time: game.day });
  game.sendFx(rz, x, y, { kind: "respawn", x, y, color: "#f0d080", id: p.id }, 20);
  game.sendLog(p, "The hearth-fire pulls you back. Rise.", "#f0c674");
  game.sendData(p);
  game.persist(p);
}

export function toggleAuto(game: Game, p: SPlayer): void {
  p.autoAttack = !p.autoAttack;
  if (p.autoAttack) {
    if (!p.targetId || !game.mobs.get(p.targetId)) {
      const nearby = nearestMob(game, p.zone, p.x, p.y, 12);
      if (nearby) p.targetId = nearby.id;
    }
    if (!p.targetId) {
      p.autoAttack = false;
      game.sendToast(p, "No target — click a foe or press Tab.", "warn");
    }
  }
}

export function tryAutoAttack(game: Game, p: SPlayer): void {
  if (!p.autoAttack || p.dead || p.attackCd > 0) return;
  const target = p.targetId ? game.mobs.get(p.targetId) : null;
  if (!target || target.dead || target.zone !== p.zone) return;
  const def = CLASSES[p.data.classId];
  const d = dist(p.x, p.y, target.x, target.y);
  if (d > def.basic.range + 0.65) return;
  p.facing = Math.atan2(target.y - p.y, target.x - p.x);
  p.attackCd = def.basic.speed * (1 - p.data.derived.haste / 100);
  p.inCombatUntil = game.time + 5;
  const power = playerPower(p) * powerMultiplier(p) * (def.basic.projectile ? 0.82 : 1);
  if (def.basic.projectile) {
    spawnProjectile(game, {
      zone: p.zone, x: p.x, y: p.y, dirX: target.x - p.x, dirY: target.y - p.y,
      ownerId: p.id, ownerIsPlayer: true, power, critChance: p.data.derived.crit,
      color: def.basic.color, glyph: def.basic.glyph, kind: "attack", abilityId: "basic"
    });
  } else {
    damageMob(game, p, target, power, p.data.derived.crit, def.basic.color);
    game.sendFx(target.zone, target.x, target.y, {
      kind: "slash", x: target.x, y: target.y, color: def.basic.color, glyph: def.basic.glyph, id: target.id
    });
  }
}

export function useAbility(game: Game, p: SPlayer, slot: number, aimX: number, aimY: number): void {
  if (p.dead) return;
  const abilities = classAbilities(p.data.classId);
  const ability: AbilityDef | undefined = abilities[slot];
  if (!ability) return;
  if (!p.data.learned.includes(ability.id)) {
    fail(game, p, "Not yet learned");
    return;
  }
  const cd = p.cds.get(ability.id) ?? 0;
  if (cd > 0) {
    fail(game, p, `${ability.name} — ${cd.toFixed(1)}s`);
    return;
  }
  if (p.mp < ability.cost) {
    fail(game, p, "Not enough mana", "#8fb8e8");
    return;
  }

  let target: SMob | null = null;
  let ally: SPlayer = p;
  let point = { x: aimX, y: aimY };
  if (ability.targeting === "enemy") {
    target = resolveEnemy(game, p, ability.range, aimX, aimY);
    if (!target) {
      fail(game, p, "No target in range");
      return;
    }
    point = { x: target.x, y: target.y };
    p.facing = Math.atan2(target.y - p.y, target.x - p.x);
  } else if (ability.targeting === "point") {
    point = clampAim(p, aimX, aimY, ability.range);
    p.facing = Math.atan2(point.y - p.y, point.x - p.x);
  } else if (ability.targeting === "ally") {
    if (p.targetId?.startsWith("p_")) {
      const t = game.players.get(p.targetId);
      if (t && !t.dead && t.zone === p.zone && dist(p.x, p.y, t.x, t.y) <= ability.range) ally = t;
    }
  }

  p.mp = Math.max(0, p.mp - ability.cost);
  p.cds.set(ability.id, ability.cooldown * (1 - p.data.derived.haste / 100));
  p.inCombatUntil = game.time + 5;
  p.facing = ability.targeting === "self" ? p.facing : Math.atan2(point.y - p.y, point.x - p.x);

  const power = playerPower(p) * powerMultiplier(p);
  const crit = p.data.derived.crit;
  const color = ability.color;
  const fx = (x: number, y: number, kind: string, glyph = ability.glyph, extra?: Record<string, unknown>) => {
    game.sendFx(p.zone, x, y, { kind, x, y, color, glyph, ...extra });
  };

  game.sendFx(p.zone, p.x, p.y, { kind: "cast", x: p.x, y: p.y, color, glyph: ability.glyph, text: ability.name, id: p.id });

  switch (ability.id) {
    case "cleave": {
      p.facing = Math.atan2(point.y - p.y, point.x - p.x);
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, ability.radius ?? 2.4)) {
        if (!inCone(p.x, p.y, p.facing, m.x, m.y, ability.radius ?? 2.4, (ability.cone ?? 1.9) / 2)) continue;
        damageMob(game, p, m, power * (ability.damage ?? 1), crit, color);
      }
      fx(p.x, p.y, "slash", "╱");
      break;
    }
    case "shield_bash": {
      if (!target) break;
      damageMob(game, p, target, power * (ability.damage ?? 0.7), crit, color);
      addStatus(target, { id: "stun_bash", name: "Stunned", kind: "stun", value: 1, remaining: ability.duration ?? 1.2, glyph: "✷", color: "#f0d080" });
      fx(target.x, target.y, "impact", "◙");
      break;
    }
    case "rally": {
      addStatus(p, { id: "rally", name: "Rally", kind: "buff", value: 0.3, remaining: 8, glyph: "⚑", color: "#f0c674" });
      addStatus(p, { id: "rally_armor", name: "Rally", kind: "buff", value: 0.2, remaining: 8, glyph: "⚑", color: "#f0c674" });
      fx(p.x, p.y, "aura", "⚑");
      break;
    }
    case "whirlwind": {
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, ability.radius ?? 2.6)) {
        damageMob(game, p, m, power * (ability.damage ?? 1.15), crit, color);
      }
      fx(p.x, p.y, "ring", "↻", { radius: ability.radius ?? 2.6 });
      break;
    }
    case "charge": {
      dash(game, p, point.x, point.y, ability.range);
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, 1.9)) {
        damageMob(game, p, m, power * (ability.damage ?? 0.85), crit, color);
      }
      fx(p.x, p.y, "ring", "»", { radius: 1.9 });
      break;
    }
    case "ironclad": {
      addStatus(p, {
        id: "ironclad", name: "Ironclad", kind: "buff", value: 0.45,
        remaining: ability.duration ?? 8, glyph: "▣", color: "#c8d0d8"
      });
      addStatus(p, {
        id: "iron_shield", name: "Ironclad", kind: "shield", value: 38 + p.data.level * 18,
        remaining: ability.duration ?? 8, glyph: "▣", color: "#c8d0d8"
      });
      fx(p.x, p.y, "aura", "▣");
      break;
    }
    case "emberbolt": {
      if (!target) break;
      spawnProjectile(game, {
        zone: p.zone, x: p.x, y: p.y, dirX: target.x - p.x, dirY: target.y - p.y, speed: 18,
        ownerId: p.id, ownerIsPlayer: true, power: power * (ability.damage ?? 1.15), critChance: crit,
        color, glyph: "✦", kind: "ability", abilityId: ability.id
      });
      break;
    }
    case "frost_nova": {
      for (const m of mobsInRadius(game, p.zone, point.x, point.y, ability.radius ?? 2.5)) {
        damageMob(game, p, m, power * (ability.damage ?? 0.8), crit, color);
        addStatus(m, { id: "frost_slow", name: "Chilled", kind: "slow", value: 0.45, remaining: 3, glyph: "❄", color: "#9fd8f0" });
      }
      fx(point.x, point.y, "nova", "❄", { radius: ability.radius ?? 2.5 });
      break;
    }
    case "arcane_barrage": {
      if (!target) break;
      const base = Math.atan2(target.y - p.y, target.x - p.x);
      for (const off of [-0.13, 0, 0.13]) {
        spawnProjectile(game, {
          zone: p.zone, x: p.x, y: p.y, dirX: Math.cos(base + off), dirY: Math.sin(base + off), speed: 20,
          ownerId: p.id, ownerIsPlayer: true, power: power * (ability.damage ?? 0.5), critChance: crit,
          color, glyph: "⋆", kind: "ability", abilityId: ability.id
        });
      }
      break;
    }
    case "blink": {
      dash(game, p, point.x, point.y, ability.range);
      fx(p.x, p.y, "blink", "⌁");
      break;
    }
    case "meteor": {
      const id = game.uid("cast");
      game.casts.set(id, {
        id, zone: p.zone, x: point.x, y: point.y, radius: ability.radius ?? 3, endsAt: game.time + 1.6,
        color, glyph: "☄", name: "Meteor", kind: "meteor", ownerId: p.id, ownerIsPlayer: true,
        power: power * (ability.damage ?? 2.7), critChance: crit, angle: 0, length: 0, abilityId: ability.id
      });
      fx(point.x, point.y, "warn", "☄", { radius: ability.radius ?? 3, dur: 1.6 });
      break;
    }
    case "mana_shield": {
      addStatus(p, {
        id: "mana_shield", name: "Mana Shield", kind: "shield", value: 30 + p.data.level * 22,
        remaining: ability.duration ?? 10, glyph: "◈", color: "#8fc4f0"
      });
      fx(p.x, p.y, "aura", "◈");
      break;
    }
    case "thornlash": {
      if (!target) break;
      damageMob(game, p, target, power * (ability.damage ?? 1), crit, color);
      healPlayer(game, p, power * (ability.heal ?? 0.25), color);
      fx(target.x, target.y, "lash", "⌁");
      break;
    }
    case "rejuvenate": {
      healPlayer(game, ally, power * (ability.heal ?? 1.6) + p.data.level * 4, color);
      fx(ally.x, ally.y, "healBurst", "✚", { id: ally.id });
      break;
    }
    case "entangle": {
      for (const m of mobsInRadius(game, p.zone, point.x, point.y, ability.radius ?? 2.2)) {
        damageMob(game, p, m, power * (ability.damage ?? 0.45), crit, color);
        addStatus(m, { id: "root_entangle", name: "Rooted", kind: "root", value: 1, remaining: 2, glyph: "❦", color: "#7fbf6a" });
      }
      fx(point.x, point.y, "roots", "❦", { radius: ability.radius ?? 2.2 });
      break;
    }
    case "sanctuary": {
      const id = game.uid("zone");
      game.zones.set(id, {
        id, zone: p.zone, x: point.x, y: point.y, radius: 3, endsAt: game.time + 6,
        ownerId: p.id, color, kind: "heal", nextTick: game.time + 0.8, healAmount: 8 + power * 0.35
      });
      fx(point.x, point.y, "sanctuary", "☘", { radius: 3 });
      break;
    }
    case "bark_skin": {
      addStatus(p, {
        id: "bark_skin", name: "Bark Skin", kind: "buff", value: 0.55,
        remaining: ability.duration ?? 8, glyph: "♣", color: "#b0a070"
      });
      addStatus(p, {
        id: "bark_regen", name: "Bark Skin", kind: "hot", value: 0,
        remaining: ability.duration ?? 8, glyph: "♣", color: "#8fcf7a", hps: p.data.level * 1.4
      } as SStatus);
      fx(p.x, p.y, "aura", "♣");
      break;
    }
    case "wrath_grove": {
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, ability.radius ?? 3.2)) {
        damageMob(game, p, m, power * (ability.damage ?? 1.5), crit, color);
      }
      healPlayer(game, p, power * (ability.heal ?? 0.8), color);
      fx(p.x, p.y, "ring", "♠", { radius: ability.radius ?? 3.2 });
      break;
    }
    case "backstab": {
      if (!target) break;
      const toAttacker = Math.atan2(p.y - target.y, p.x - target.x);
      let diff = Math.abs(toAttacker - target.facing);
      while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
      const behind = diff > 2.1;
      damageMob(game, p, target, power * (behind ? 2.2 : (ability.damage ?? 1.3)), crit, color);
      if (behind) fx(target.x, target.y, "text", "†", { text: "BACKSTAB", color: "#ff8ad0" });
      break;
    }
    case "venom": {
      if (!target) break;
      damageMob(game, p, target, power * (ability.damage ?? 0.6), crit, color);
      addStatus(target, {
        id: "venom_dot", name: "Venom", kind: "dot", value: 0, remaining: 8,
        glyph: "☠", color: "#90c060", dps: 6 + power * 0.14, sourceId: p.id, tickAt: 0.5
      } as SStatus);
      fx(target.x, target.y, "poison", "☠");
      break;
    }
    case "shadowstep": {
      if (!target) break;
      const dir = Math.atan2(target.y - p.y, target.x - p.x);
      const behindX = target.x - Math.cos(target.facing) * 0.9;
      const behindY = target.y - Math.sin(target.facing) * 0.9;
      if (canStand(getMap(p.zone), behindX, behindY, 0.33)) {
        p.x = behindX;
        p.y = behindY;
      } else {
        dash(game, p, target.x, target.y, Math.max(0, dist(p.x, p.y, target.x, target.y) - 0.9));
      }
      p.facing = dir;
      damageMob(game, p, target, power * (ability.damage ?? 0.7), crit, color);
      fx(target.x, target.y, "blink", "➤");
      break;
    }
    case "fan_knives": {
      p.facing = Math.atan2(point.y - p.y, point.x - p.x);
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, ability.radius ?? 2.8)) {
        if (!inCone(p.x, p.y, p.facing, m.x, m.y, ability.radius ?? 2.8, (ability.cone ?? 2.4) / 2)) continue;
        damageMob(game, p, m, power * (ability.damage ?? 0.9), crit, color);
      }
      fx(p.x, p.y, "fan", "✳");
      break;
    }
    case "smoke_bomb": {
      addStatus(p, { id: "evasion", name: "Smoke Bomb", kind: "buff", value: 0.5, remaining: 5, glyph: "◌", color: "#a0a0b8" });
      for (const m of mobsInRadius(game, p.zone, p.x, p.y, 2.5)) {
        addStatus(m, { id: "smoke_slow", name: "Blinded", kind: "slow", value: 0.5, remaining: 3, glyph: "◌", color: "#a0a0b8" });
      }
      fx(p.x, p.y, "smoke", "◌", { radius: 2.5 });
      break;
    }
    case "assassinate": {
      if (!target) break;
      const execute = target.hp / target.maxHp < 0.3;
      damageMob(game, p, target, power * (execute ? 3 : (ability.damage ?? 1.2)), crit, execute ? "#ff6a8a" : color);
      fx(target.x, target.y, "impact", "☠", { text: execute ? "EXECUTE" : undefined });
      break;
    }
    default:
      break;
  }
}

