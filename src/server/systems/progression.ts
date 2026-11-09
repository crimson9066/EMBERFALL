import { classAbilities, xpForLevel } from "../../shared/content";
import type { Game } from "../game";
import type { SPlayer } from "../types";

const MAX_LEVEL = 20;

/**
 * Grants experience, resolves one or more level-ups, unlocks abilities and
 * keeps derived stats in sync. All progression flows through this function.
 */
export function grantXp(game: Game, p: SPlayer, rawAmount: number): void {
  if (p.data.level >= MAX_LEVEL) {
    p.data.xp = Math.min(p.data.xpNext - 1, p.data.xp + Math.round(rawAmount));
    game.sendData(p);
    return;
  }
  const amount = Math.max(1, Math.round(rawAmount));
  p.data.xp += amount;
  game.send(p, { t: "fx", fx: { kind: "xp", x: p.x, y: p.y - 0.6, amount, color: "#d8b46a" } });

  let leveled = false;
  const learned: string[] = [];
  while (p.data.xp >= p.data.xpNext && p.data.level < MAX_LEVEL) {
    p.data.xp -= p.data.xpNext;
    p.data.level++;
    p.data.xpNext = xpForLevel(p.data.level);
    game.recalc(p.data);
    p.hp = p.data.derived.maxHp;
    p.mp = p.data.derived.maxMp;
    p.stamina = p.data.derived.maxStamina;
    leveled = true;
    for (const a of classAbilities(p.data.classId)) {
      if (a.unlock <= p.data.level && !p.data.learned.includes(a.id)) {
        p.data.learned.push(a.id);
        learned.push(a.name);
      }
    }
  }
  if (p.data.level >= MAX_LEVEL) p.data.xp = Math.min(p.data.xp, p.data.xpNext - 1);

  if (leveled) {
    p.data.derived = p.data.derived;
    game.sendData(p);
    game.send(p, { t: "levelup", level: p.data.level, learned });
    game.sendFx(p.zone, p.x, p.y, { kind: "levelup", x: p.x, y: p.y, color: "#f0d080" }, 24);
    game.sendLog(p, `You have reached level ${p.data.level}.`, "#f0c674");
    if (learned.length) game.sendLog(p, `New skill${learned.length > 1 ? "s" : ""}: ${learned.join(", ")}.`, "#8fd0a0");
    game.sendToast(p, `LEVEL ${p.data.level}${learned.length ? ` · ${learned.join(", ")}` : ""}`, "level");
  } else {
    game.sendData(p);
  }
  game.persist(p);
}
