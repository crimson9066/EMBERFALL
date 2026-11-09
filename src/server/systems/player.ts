import { getMap } from "../../shared/worldgen";
import { dist, moveWithCollision, normalize } from "../../shared/formulas";
import type { Game } from "../game";
import type { SPlayer } from "../types";
import { respawnPlayer, tickStatuses, tryAutoAttack } from "./combat";

const BASE_SPEED = 4.4;
const SPRINT_MULT = 1.45;
const SPRINT_DRAIN = 19;
const STAMINA_REGEN = 14;

export function updatePlayer(game: Game, p: SPlayer, dt: number): void {
  p.data.playTime += dt;
  if (p.dead) {
    p.respawnLeft -= dt;
    if (p.respawnLeft <= 0) respawnPlayer(game, p);
    return;
  }

  tickStatuses(game, p, dt);

  const stunned = p.buffs.some((b) => b.kind === "stun");
  const rooted = p.buffs.some((b) => b.kind === "root");
  const n = normalize(p.inputX, p.inputY);
  let moving = false;
  if (!stunned && !rooted && n.len > 0.01) {
    moving = true;
    let speed = BASE_SPEED * slowFactor(p);
    if (p.sprint && p.stamina > 0.5) {
      speed *= SPRINT_MULT;
      p.stamina = Math.max(0, p.stamina - SPRINT_DRAIN * dt);
    }
    const moved = moveWithCollision(getMap(p.zone), p.x, p.y, n.x * speed, n.y * speed, dt, 0.33);
    p.x = moved.x;
    p.y = moved.y;
    p.facing = Math.atan2(n.y, n.x);
  }
  if (!moving || !p.sprint) {
    p.stamina = Math.min(p.data.derived.maxStamina, p.stamina + STAMINA_REGEN * dt);
  }

  for (const [id, remain] of p.cds) {
    if (remain <= dt) p.cds.delete(id);
    else p.cds.set(id, remain - dt);
  }
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.hearthCd = Math.max(0, p.hearthCd - dt);

  if (p.targetId) {
    if (p.targetId.startsWith("p_")) {
      if (!game.players.has(p.targetId)) p.targetId = null;
    } else {
      const target = game.mobs.get(p.targetId);
      if (!target || target.dead) p.targetId = null;
    }
  }

  // Auto-attack should roll onto the next foe instead of idling after a kill.
  if (p.autoAttack && !p.targetId) {
    let nearest: string | null = null;
    let bestDist = 12;
    for (const mob of game.mobs.values()) {
      if (mob.zone !== p.zone || mob.dead) continue;
      const d = dist(p.x, p.y, mob.x, mob.y);
      if (d < bestDist) {
        bestDist = d;
        nearest = mob.id;
      }
    }
    if (nearest) p.targetId = nearest;
    else p.autoAttack = false;
  }

  if (p.autoAttack) tryAutoAttack(game, p);

  if (game.time > p.inCombatUntil) {
    const d = p.data.derived;
    p.hp = Math.min(d.maxHp, p.hp + d.maxHp * 0.009 * dt);
    p.mp = Math.min(d.maxMp, p.mp + d.maxMp * 0.018 * dt);
  } else {
    p.mp = Math.min(p.data.derived.maxMp, p.mp + p.data.derived.maxMp * 0.006 * dt);
  }
}

export function slowFactor(p: SPlayer): number {
  let slow = 0;
  for (const b of p.buffs) {
    if (b.kind === "slow") slow = Math.max(slow, b.value);
    if (b.kind === "root" || b.kind === "stun") return 0;
  }
  return Math.max(0.25, 1 - slow);
}
