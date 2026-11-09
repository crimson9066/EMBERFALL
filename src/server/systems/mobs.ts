import { MOBS } from "../../shared/content";
import { dist, levelXpMultiplier, moveWithCollision, normalize } from "../../shared/formulas";
import {
  CRYPT_POIS, T, WORLD_POIS, getMap, randomWalkableNear, tileAt, walkableTile
} from "../../shared/worldgen";
import type { Game } from "../game";
import type { ZoneId } from "../../shared/types";
import type { SPlayer, SMob, SpawnGroup } from "../types";
import { damageMob, damagePlayer, playersInRadius, spawnProjectile } from "./combat";
import { spawnLoot } from "./items";
import { grantXp } from "./progression";

const RARE_PREFIX = ["Vile", "Frenzied", "Ironhide", "Gloomshade", "Bloodmad", "Thorned", "Emberkin", "Frostbitten"];
const LEASH = 26;

export const SPAWN_GROUPS: SpawnGroup[] = [
  { zone: "world", defId: "meadow_wolf", count: 4, level: 1, x: 133, y: 106, radius: 3 },
  { zone: "world", defId: "forest_spider", count: 2, level: 2, x: 140, y: 108, radius: 3 },
  { zone: "world", defId: "meadow_wolf", count: 10, level: 2, x: WORLD_POIS.wolfDen.x, y: WORLD_POIS.wolfDen.y, radius: 12 },
  { zone: "world", defId: "meadow_wolf", count: 5, level: 3, x: 172, y: 108, radius: 13 },
  { zone: "world", defId: "forest_spider", count: 8, level: 3, x: 172, y: 100, radius: 14 },
  { zone: "world", defId: "bandit", count: 9, level: 4, x: WORLD_POIS.banditCamp.x, y: WORLD_POIS.banditCamp.y, radius: 11 },
  { zone: "world", defId: "goblin", count: 7, level: 5, x: 195, y: 145, radius: 12 },
  { zone: "world", defId: "bog_lurker", count: 6, level: 6, x: WORLD_POIS.mire.x, y: WORLD_POIS.mire.y, radius: 12 },
  { zone: "world", defId: "frost_wraith", count: 6, level: 8, x: WORLD_POIS.frostRuins.x, y: WORLD_POIS.frostRuins.y, radius: 10 },
  { zone: "world", defId: "frost_troll", count: 1, level: 11, x: WORLD_POIS.frostRuins.x, y: WORLD_POIS.frostRuins.y, radius: 8, respawn: 180 },
  { zone: "world", defId: "ember_imp", count: 7, level: 8, x: WORLD_POIS.ashenCamp.x, y: WORLD_POIS.ashenCamp.y, radius: 10 },
  { zone: "world", defId: "stone_golem", count: 2, level: 10, x: WORLD_POIS.ashenCamp.x + 10, y: WORLD_POIS.ashenCamp.y + 6, radius: 9, respawn: 180 },
  { zone: "world", defId: "ashen_wyrm", count: 1, level: 15, x: WORLD_POIS.wyrmRoost.x, y: WORLD_POIS.wyrmRoost.y, radius: 6, respawn: 420 },
  { zone: "crypt", defId: "skeleton", count: 5, level: 7, x: CRYPT_POIS.exit.x + 8, y: CRYPT_POIS.exit.y, radius: 9 },
  { zone: "crypt", defId: "ghoul", count: 3, level: 8, x: CRYPT_POIS.hall.x, y: CRYPT_POIS.hall.y, radius: 9 },
  { zone: "crypt", defId: "skeleton", count: 6, level: 7, x: CRYPT_POIS.hall.x, y: CRYPT_POIS.hall.y, radius: 10 },
  { zone: "crypt", defId: "crypt_guardian", count: 1, level: 12, x: CRYPT_POIS.depths.x, y: CRYPT_POIS.depths.y, radius: 5, respawn: 240 },
  { zone: "crypt", defId: "ghoul", count: 6, level: 8, x: CRYPT_POIS.depths.x, y: CRYPT_POIS.depths.y, radius: 10 },
  { zone: "crypt", defId: "cinder_king", count: 1, level: 14, x: CRYPT_POIS.boss.x, y: CRYPT_POIS.boss.y, radius: 5, respawn: 480 }
];

export function spawnAll(game: Game): void {
  for (const group of SPAWN_GROUPS) {
    for (let i = 0; i < group.count; i++) {
      spawnFromGroup(game, group);
    }
  }
  console.log(`[world] spawned ${game.mobs.size} creatures`);
}

function spawnFromGroup(game: Game, group: SpawnGroup): SMob {
  const def = MOBS[group.defId];
  const level = group.level ?? def.level;
  const diff = Math.max(0, level - def.level);
  const scale = 1 + diff * 0.16;
  const rare = !def.boss && !def.elite && Math.random() < 0.055;
  const pos = randomWalkableNear(getMap(group.zone), group.x, group.y, group.radius, Math.random);
  const id = game.uid("mob");
  const mob: SMob = {
    id,
    defId: def.id,
    name: rare ? `${RARE_PREFIX[Math.floor(Math.random() * RARE_PREFIX.length)]} ${def.name}` : def.name,
    zone: group.zone,
    x: pos.x,
    y: pos.y,
    homeX: pos.x,
    homeY: pos.y,
    homeRadius: Math.min(group.radius, 12),
    level,
    hp: Math.round(def.hp * scale * (rare ? 1.9 : 1)),
    maxHp: Math.round(def.hp * scale * (rare ? 1.9 : 1)),
    damage: def.damage * scale * (rare ? 1.3 : 1),
    speed: def.speed * (rare ? 1.12 : 1),
    aggro: def.aggro,
    range: def.range,
    attackInterval: def.attackInterval,
    xp: Math.round(def.xp * (1 + diff * 0.15) * (rare ? 2.3 : 1)),
    gold: Math.round(def.gold * (1 + diff * 0.12) * (rare ? 2.2 : 1)),
    state: "idle",
    targetId: null,
    attackCd: Math.random() * 1.2,
    abilityCds: {},
    castingId: null,
    wanderX: pos.x,
    wanderY: pos.y,
    wanderCd: Math.random() * 4,
    facing: Math.random() * Math.PI * 2,
    buffs: [],
    elite: !!def.elite,
    boss: !!def.boss,
    rare,
    summoned: false,
    respawnAt: 0,
    dead: false,
    spawnedAt: game.time
  };
  game.mobs.set(id, mob);
  return mob;
}

export function spawnSummon(game: Game, zone: string, x: number, y: number, level: number, defId = "skeleton"): SMob | null {
  const def = MOBS[defId];
  if (!def) return null;
  const pos = randomWalkableNear(getMap(zone as never), x, y, 3, Math.random);
  const id = game.uid("mob");
  const mob: SMob = {
    id, defId, name: def.name, zone: zone as never, x: pos.x, y: pos.y, homeX: pos.x, homeY: pos.y,
    homeRadius: 6, level, hp: Math.round(def.hp * (1 + Math.max(0, level - def.level) * 0.16)),
    maxHp: Math.round(def.hp * (1 + Math.max(0, level - def.level) * 0.16)),
    damage: def.damage, speed: def.speed, aggro: def.aggro, range: def.range, attackInterval: def.attackInterval,
    xp: Math.round(def.xp * 0.5), gold: Math.round(def.gold * 0.5), state: "chase", targetId: null,
    attackCd: 0.5, abilityCds: {}, castingId: null, wanderX: pos.x, wanderY: pos.y, wanderCd: 3,
    facing: 0, buffs: [], elite: false, boss: false, rare: false, summoned: true,
    respawnAt: 0, dead: false, spawnedAt: game.time
  };
  game.mobs.set(id, mob);
  return mob;
}

function resetMob(game: Game, m: SMob): void {
  const pos = randomWalkableNear(getMap(m.zone), m.homeX, m.homeY, m.homeRadius, Math.random);
  m.x = pos.x;
  m.y = pos.y;
  m.homeX = pos.x;
  m.homeY = pos.y;
  m.hp = m.maxHp;
  m.dead = false;
  m.state = "idle";
  m.targetId = null;
  m.castingId = null;
  m.buffs = [];
  m.attackCd = 0.8;
  m.wanderCd = 2 + Math.random() * 3;
  m.wanderX = pos.x;
  m.wanderY = pos.y;
  m.respawnAt = 0;
  m.spawnedAt = game.time;
}

function mobSlow(m: SMob): number {
  let slow = 0;
  for (const b of m.buffs) {
    if (b.kind === "slow") slow = Math.max(slow, b.value);
    if (b.kind === "root" || b.kind === "stun") return 0;
  }
  return Math.max(0.2, 1 - slow);
}

function tickMobStatuses(game: Game, m: SMob, dt: number): boolean {
  let changed = false;
  for (const b of m.buffs) {
    b.remaining -= dt;
    if (b.kind === "dot" && b.dps) {
      if (b.tickAt === undefined) b.tickAt = 0.5;
      b.tickAt -= dt;
      while (b.tickAt <= 0 && !m.dead) {
        b.tickAt += 0.5;
        m.hp -= b.dps * 0.5;
        game.sendFx(m.zone, m.x, m.y, { kind: "damage", x: m.x, y: m.y, amount: Math.round(b.dps * 0.5), color: b.color, id: m.id });
        if (m.hp <= 0) {
          const killer = b.sourceId ? game.players.get(b.sourceId) : undefined;
          if (killer) killMob(game, killer, m);
          else m.dead = true;
        }
      }
    }
    if (b.remaining <= 0) changed = true;
  }
  if (changed) m.buffs = m.buffs.filter((b) => b.remaining > 0);
  return m.dead;
}

export function updateMob(game: Game, m: SMob, dt: number): void {
  if (m.dead) {
    if (!m.summoned && m.respawnAt > 0 && game.time >= m.respawnAt) resetMob(game, m);
    return;
  }
  if (tickMobStatuses(game, m, dt)) return;

  if (m.castingId) {
    if (game.casts.has(m.castingId)) return;
    m.castingId = null;
  }

  const stunned = m.buffs.some((b) => b.kind === "stun");
  const map = getMap(m.zone);
  for (const key of Object.keys(m.abilityCds)) {
    m.abilityCds[key] = Math.max(0, m.abilityCds[key] - dt);
  }
  m.attackCd = Math.max(0, m.attackCd - dt);

  let target = m.targetId ? game.players.get(m.targetId) : undefined;
  if (target && (target.dead || target.zone !== m.zone)) target = undefined;
  if (target && game.isTownSafe(target.zone, target.x, target.y)) target = undefined;
  if (target && dist(target.x, target.y, m.homeX, m.homeY) > LEASH) {
    m.state = "return";
    m.targetId = null;
    target = undefined;
  }
  if (!target) {
    let best: SPlayer | undefined = undefined;
    let bestD = m.aggro;
    for (const p of game.players.values()) {
      if (p.dead || p.zone !== m.zone) continue;
      if (game.isTownSafe(p.zone, p.x, p.y)) continue;
      const d = dist(m.x, m.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) {
      target = best;
      m.targetId = best.id;
      m.state = "chase";
    }
  }

  if (target && !stunned) {
    const def = MOBS[m.defId];
    const d = dist(m.x, m.y, target.x, target.y);
    m.facing = Math.atan2(target.y - m.y, target.x - m.x);
    if (d > m.range) {
      const n = normalize(target.x - m.x, target.y - m.y);
      const speed = m.speed * mobSlow(m) * dt;
      const beforeX = m.x;
      const beforeY = m.y;
      const moved = moveWithCollision(map, m.x, m.y, n.x * m.speed * mobSlow(m), n.y * m.speed * mobSlow(m), dt, 0.3);
      m.x = moved.x;
      m.y = moved.y;
      if (Math.hypot(m.x - beforeX, m.y - beforeY) < speed * 0.15) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const alt = findOpenDirection(map, m.x, m.y, n, side);
        m.x = alt.x;
        m.y = alt.y;
      }
    } else {
      if (m.attackCd <= 0) {
        m.attackCd = m.attackInterval;
        if (def.projectile) {
          spawnProjectile(game, {
            zone: m.zone, x: m.x, y: m.y, dirX: target.x - m.x, dirY: target.y - m.y, speed: 10,
            ownerId: m.id, ownerIsPlayer: false, power: m.damage, critChance: 3,
            color: def.color, glyph: def.glyph, kind: "mob"
          });
        } else {
          damagePlayer(game, target, m.damage, m.name, 4);
          game.sendFx(target.zone, target.x, target.y, {
            kind: "slash", x: target.x, y: target.y, color: def.color, glyph: def.glyph, id: m.id
          });
        }
      }
      const ready = def.abilities.filter((a) => (m.abilityCds[a.id] ?? 0) <= 0);
      const shouldCast = ready.length > 0 && (def.boss || def.elite || Math.random() < 0.65);
      if (shouldCast) {
        const ability = ready[Math.floor(Math.random() * ready.length)];
        m.abilityCds[ability.id] = ability.cooldown * (0.9 + Math.random() * 0.2);
        const originX = ability.kind === "slam" ? target.x : m.x;
        const originY = ability.kind === "slam" ? target.y : m.y;
        const powerScale = def.damage > 0 ? (m.damage / def.damage) : 1;
        const id = createCast(game, {
          zone: m.zone, x: originX, y: originY, radius: ability.radius, duration: ability.telegraph,
          color: ability.color, glyph: ability.glyph, name: ability.name, kind: ability.kind,
          ownerId: m.id, ownerIsPlayer: false, power: ability.damage * powerScale,
          angle: Math.atan2(target.y - m.y, target.x - m.x), length: 9, abilityId: ability.id
        });
        m.castingId = id;
        game.sendFx(m.zone, m.x, m.y, { kind: "cast", x: m.x, y: m.y, color: ability.color, glyph: ability.glyph, text: ability.name, id: m.id });
      }
    }
    return;
  }

  if (m.state === "return" || dist(m.x, m.y, m.homeX, m.homeY) > m.homeRadius + 6) {
    m.state = "return";
    const d = dist(m.x, m.y, m.homeX, m.homeY);
    if (d < 0.7) {
      m.state = "idle";
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1);
    } else {
      const n = normalize(m.homeX - m.x, m.homeY - m.y);
      const moved = moveWithCollision(map, m.x, m.y, n.x * m.speed, n.y * m.speed, dt, 0.3);
      m.x = moved.x;
      m.y = moved.y;
      m.facing = Math.atan2(n.y, n.x);
    }
    return;
  }

  if (m.state === "chase" && !target) m.state = "idle";
  if (!stunned) {
    m.wanderCd -= dt;
    if (m.wanderCd <= 0) {
      const pos = randomWalkableNear(map, m.homeX, m.homeY, m.homeRadius, Math.random);
      m.wanderX = pos.x;
      m.wanderY = pos.y;
      m.wanderCd = 3 + Math.random() * 5;
    }
    const d = dist(m.x, m.y, m.wanderX, m.wanderY);
    if (d > 0.35) {
      const n = normalize(m.wanderX - m.x, m.wanderY - m.y);
      const moved = moveWithCollision(map, m.x, m.y, n.x * m.speed * 0.45, n.y * m.speed * 0.45, dt, 0.3);
      m.x = moved.x;
      m.y = moved.y;
      m.facing = Math.atan2(n.y, n.x);
    }
  }
}

function findOpenDirection(map: ReturnType<typeof getMap>, x: number, y: number, n: { x: number; y: number }, side: number): { x: number; y: number } {
  const dirs = [
    { x: n.x * 0.4 + n.y * side, y: n.y * 0.4 - n.x * side },
    { x: n.y * side, y: -n.x * side },
    { x: -n.y * side, y: n.x * side }
  ];
  for (const d of dirs) {
    const nn = normalize(d.x, d.y);
    const nx = x + nn.x * 0.22;
    const ny = y + nn.y * 0.22;
    if (walkableTile(tileAt(map, nx, ny))) return { x: nx, y: ny };
  }
  return { x, y };
}

export function killMob(game: Game, killer: SPlayer, mob: SMob): void {
  if (mob.dead) return;
  mob.dead = true;
  mob.state = "dead";
  mob.hp = 0;
  mob.targetId = null;
  mob.castingId = null;
  mob.buffs = [];
  const def = MOBS[mob.defId];
  mob.respawnAt = game.time + (mob.summoned ? 0 : def.boss ? 480 : def.elite ? 180 : mob.rare ? 95 : 45);
  if (mob.summoned) {
    game.mobs.delete(mob.id);
  }
  for (const [cid, cast] of game.casts) {
    if (cast.ownerId === mob.id) game.casts.delete(cid);
  }

  const beneficiaries: SPlayer[] = [killer];
  if (killer.partyId) {
    const party = game.parties.get(killer.partyId);
    if (party) {
      for (const id of party.memberIds) {
        if (id === killer.id) continue;
        const m = game.players.get(id);
        if (m && !m.dead && m.zone === mob.zone && dist(m.x, m.y, mob.x, mob.y) < 80) beneficiaries.push(m);
      }
    }
  }

  killer.sessionKills++;
  killer.data.kills++;
  game.sendFx(mob.zone, mob.x, mob.y, { kind: "death", x: mob.x, y: mob.y, color: def?.color ?? "#d08060", id: mob.id });
  game.send(killer, {
    t: "chat",
    msg: { channel: "combat", from: "", text: `You slay ${mob.name}.`, color: mob.rare || mob.elite || mob.boss ? "#f0c674" : "#a8a49a" }
  });

  for (const p of beneficiaries) {
    const share = p.id === killer.id ? 1 : 0.8;
    const xp = Math.round(mob.xp * levelXpMultiplier(mob.level, p.data.level) * share);
    grantXp(game, p, xp);
    game.onMobKill(p, mob);
  }
  spawnLoot(game, mob, killer);

  if (mob.boss) {
    game.broadcastSystem(`${killer.data.name} has felled ${mob.name} in ${mob.zone === "crypt" ? "the Sunken Crypt" : "the Ashen Reach"}.`);
  }
}

export interface CastOptions {
  zone: ZoneId;
  x: number;
  y: number;
  radius: number;
  duration: number;
  color: string;
  glyph: string;
  name: string;
  kind: string;
  ownerId: string;
  ownerIsPlayer: boolean;
  power: number;
  angle?: number;
  length?: number;
  abilityId?: string;
}

export function createCast(game: Game, opts: CastOptions): string {
  const id = game.uid("cast");
  game.casts.set(id, {
    id, zone: opts.zone, x: opts.x, y: opts.y, radius: opts.radius,
    endsAt: game.time + opts.duration, color: opts.color, glyph: opts.glyph, name: opts.name,
    kind: opts.kind, ownerId: opts.ownerId, ownerIsPlayer: opts.ownerIsPlayer,
    power: opts.power, critChance: 5, angle: opts.angle ?? 0, length: opts.length ?? 0,
    abilityId: opts.abilityId
  });
  return id;
}

export function updateCasts(game: Game): void {
  for (const [id, cast] of game.casts) {
    if (cast.endsAt > game.time) continue;
    game.casts.delete(id);
    const ownerMob = game.mobs.get(cast.ownerId);
    if (ownerMob?.castingId === id) ownerMob.castingId = null;

    if (cast.ownerIsPlayer) {
      const owner = game.players.get(cast.ownerId);
      if (!owner) continue;
      const mobs = [...game.mobs.values()];
      for (const mob of mobs) {
        if (mob.dead || mob.zone !== cast.zone) continue;
        if (dist(mob.x, mob.y, cast.x, cast.y) > cast.radius + 0.5) continue;
        damageMob(game, owner, mob, cast.power, cast.critChance, cast.color);
      }
      game.sendFx(cast.zone, cast.x, cast.y, {
        kind: "explosion", x: cast.x, y: cast.y, radius: cast.radius, color: cast.color, glyph: cast.glyph
      });
      continue;
    }

    if (cast.kind === "slam") {
      for (const p of playersInRadius(game, cast.zone, cast.x, cast.y, cast.radius)) {
        damagePlayer(game, p, cast.power, cast.name, 5);
      }
      game.sendFx(cast.zone, cast.x, cast.y, {
        kind: "explosion", x: cast.x, y: cast.y, radius: cast.radius, color: cast.color, glyph: cast.glyph
      });
    } else if (cast.kind === "volley") {
      const count = 10;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.12;
        spawnProjectile(game, {
          zone: cast.zone, x: cast.x, y: cast.y, dirX: Math.cos(a), dirY: Math.sin(a), speed: 8,
          ownerId: cast.ownerId, ownerIsPlayer: false, power: cast.power * 0.85, critChance: 3,
          color: cast.color, glyph: cast.glyph, kind: "mob", hitRadius: 0.55, ttl: 2.4
        });
      }
      game.sendFx(cast.zone, cast.x, cast.y, {
        kind: "nova", x: cast.x, y: cast.y, radius: cast.radius, color: cast.color, glyph: cast.glyph
      });
    } else if (cast.kind === "beam") {
      const dx = Math.cos(cast.angle);
      const dy = Math.sin(cast.angle);
      for (const p of playersInRadius(game, cast.zone, cast.x, cast.y, cast.length)) {
        const rx = p.x - cast.x;
        const ry = p.y - cast.y;
        const along = rx * dx + ry * dy;
        if (along < 0 || along > cast.length) continue;
        const perp = Math.abs(rx * -dy + ry * dx);
        if (perp > cast.radius + 0.4) continue;
        damagePlayer(game, p, cast.power, cast.name, 5);
      }
      game.sendFx(cast.zone, cast.x, cast.y, {
        kind: "beam", x: cast.x, y: cast.y, color: cast.color, glyph: cast.glyph,
        angle: cast.angle, length: cast.length, radius: cast.radius
      });
    } else if (cast.kind === "summon") {
      const level = Math.max(2, (ownerMob?.level ?? 6) - 2);
      spawnSummon(game, cast.zone, cast.x, cast.y, level, "skeleton");
      spawnSummon(game, cast.zone, cast.x, cast.y, level, "skeleton");
      game.sendFx(cast.zone, cast.x, cast.y, { kind: "summon", x: cast.x, y: cast.y, radius: 2, color: cast.color, glyph: "†" });
    }
  }
}

function projectileBlocked(tile: number): boolean {
  return tile === T.Wall || tile === T.Tree || tile === T.Mountain || tile === T.CaveWall ||
    tile === T.Torch || tile === T.Crystal || tile === T.SnowTree || tile === T.Mushroom;
}

export function updateProjectiles(game: Game, dt: number): void {
  for (const [id, pr] of game.projectiles) {
    pr.ttl -= dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    const map = getMap(pr.zone);
    if (pr.ttl <= 0 || projectileBlocked(tileAt(map, pr.x, pr.y))) {
      game.projectiles.delete(id);
      game.sendFx(pr.zone, pr.x, pr.y, { kind: "impact", x: pr.x, y: pr.y, color: pr.color, glyph: pr.glyph });
      continue;
    }
    if (pr.ownerIsPlayer) {
      const owner = game.players.get(pr.ownerId);
      if (!owner) { game.projectiles.delete(id); continue; }
      for (const mob of game.mobs.values()) {
        if (mob.dead || mob.zone !== pr.zone) continue;
        if (dist(mob.x, mob.y, pr.x, pr.y) > pr.hitRadius + 0.3) continue;
        damageMob(game, owner, mob, pr.power, pr.critChance, pr.color);
        game.projectiles.delete(id);
        game.sendFx(pr.zone, pr.x, pr.y, { kind: "impact", x: pr.x, y: pr.y, color: pr.color, glyph: pr.glyph });
        break;
      }
    } else {
      const source = game.mobs.get(pr.ownerId);
      for (const p of game.players.values()) {
        if (p.dead || p.zone !== pr.zone) continue;
        if (dist(p.x, p.y, pr.x, pr.y) > pr.hitRadius + 0.3) continue;
        damagePlayer(game, p, pr.power, source?.name ?? "a spell", 3);
        game.projectiles.delete(id);
        game.sendFx(pr.zone, pr.x, pr.y, { kind: "impact", x: pr.x, y: pr.y, color: pr.color, glyph: pr.glyph });
        break;
      }
    }
  }
}

export function updateZones(game: Game): void {
  for (const [id, zone] of game.zones) {
    if (game.time >= zone.endsAt) {
      game.zones.delete(id);
      continue;
    }
    if (game.time < zone.nextTick) continue;
    zone.nextTick += 0.8;
    for (const p of playersInRadius(game, zone.zone, zone.x, zone.y, zone.radius)) {
      const before = p.hp;
      p.hp = Math.min(p.data.derived.maxHp, p.hp + zone.healAmount);
      const gained = Math.round(p.hp - before);
      if (gained > 0) game.sendFx(p.zone, p.x, p.y, { kind: "heal", x: p.x, y: p.y, amount: gained, color: zone.color, id: p.id });
    }
  }
}
