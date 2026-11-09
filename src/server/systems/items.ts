import { ITEM_BASES, MOBS, NPCS, VENDOR_STOCK, generateItem, makeConsumable } from "../../shared/content";
import { dist } from "../../shared/formulas";
import type { Item } from "../../shared/types";
import { WORLD_SEED } from "../../shared/worldgen";
import type { Game } from "../game";
import type { SMob, SPlayer } from "../types";
import { healPlayer } from "./combat";

export const INVENTORY_MAX = 24;

function announceData(game: Game, p: SPlayer): void {
  game.sendData(p);
  game.persist(p);
}

export function addItem(game: Game, p: SPlayer, item: Item, silent = false): boolean {
  if (item.stackable) {
    const stack = p.data.inventory.find((i) => i.baseId === item.baseId);
    if (stack) {
      stack.qty += item.qty;
      if (!silent) game.onCollect(p, item.baseId, item.qty);
      return true;
    }
  }
  if (p.data.inventory.length >= INVENTORY_MAX) {
    if (!silent) game.sendToast(p, "Your pack is full.", "warn");
    return false;
  }
  p.data.inventory.push({ ...item });
  if (!silent) game.onCollect(p, item.baseId, item.qty);
  return true;
}

export function itemFromBase(baseId: string, qty: number, game: Game): Item {
  const base = ITEM_BASES[baseId];
  const item = makeConsumable(baseId, qty);
  item.uid = game.uid("it");
  item.qty = qty;
  item.name = base?.name ?? baseId;
  return item;
}

export function dropGround(game: Game, zone: SPlayer["zone"], x: number, y: number, item: Item, ownerId?: string): void {
  const gx = x + (Math.random() - 0.5) * 0.6;
  const gy = y + (Math.random() - 0.5) * 0.6;
  const id = game.uid("ground");
  game.ground.set(id, {
    id, item, zone, x: Math.max(1.5, Math.min(258.5, gx)), y: Math.max(1.5, Math.min(178.5, gy)),
    spawnedAt: game.time,
    ownerId,
    lockUntil: ownerId ? game.time + 5 : undefined
  });
}

export function spawnLoot(game: Game, mob: SMob, killer: SPlayer): void {
  const def = MOBS[mob.defId];
  if (!def) return;
  const drops: Item[] = [];
  for (const entry of def.loot) {
    if (Math.random() < entry.chance) {
      const qty = entry.qty ?? 1;
      drops.push(itemFromBase(entry.id, qty, game));
    }
  }
  const gearChance = (def.gearChance ?? 0) + (mob.rare ? 0.35 : 0) + (mob.elite ? 0.2 : 0) + (mob.boss ? 1 : 0);
  if (Math.random() < gearChance) {
    let rarity: Item["rarity"] | undefined;
    if (mob.boss) rarity = Math.random() < 0.4 ? "epic" : "rare";
    else if (mob.elite || mob.rare) rarity = Math.random() < 0.35 ? "rare" : "uncommon";
    drops.push(generateItem(mob.level + (mob.boss ? 2 : 0), Math.random, game.uid("it"), {
      rarity, slot: (["weapon", "armor", "trinket"] as const)[Math.floor(Math.random() * 3)]
    }));
  }
  if (mob.boss) {
    drops.push(generateItem(mob.level + 3, Math.random, game.uid("it"), { rarity: Math.random() < 0.5 ? "epic" : "legendary" }));
  }
  if (mob.boss && mob.defId === "cinder_king") {
    drops.push(itemFromBase("cinder_core", 2, game));
  }

  const gold = Math.max(1, Math.round(mob.gold * (0.8 + Math.random() * 0.5)));
  killer.data.gold += gold;
  game.sendFx(killer.zone, killer.x, killer.y, { kind: "gold", x: killer.x, y: killer.y, amount: gold, color: "#f0c060" });
  game.send(killer, { t: "chat", msg: { channel: "loot", from: "", text: `You receive ${gold} gold.`, color: "#e8c878" } });
  for (const item of drops) dropGround(game, mob.zone, mob.x, mob.y, item);
  game.sendData(killer);
}

export function updateGround(game: Game): void {
  for (const [id, g] of game.ground) {
    if (game.time - g.spawnedAt > 480) { game.ground.delete(id); continue; }
    for (const p of game.players.values()) {
      if (p.zone !== g.zone || p.dead) continue;
      if (g.ownerId === p.id && game.time < (g.lockUntil ?? 0)) continue;
      if (dist(p.x, p.y, g.x, g.y) > 0.85) continue;
      if (addItem(game, p, g.item, false)) {
        game.ground.delete(id);
        const label = g.item.qty > 1 ? `${g.item.name} ×${g.item.qty}` : g.item.name;
        game.send(p, { t: "chat", msg: { channel: "loot", from: "", text: `You loot ${label}.`, color: undefined } });
        game.sendFx(g.zone, g.x, g.y, { kind: "pickup", x: g.x, y: g.y, glyph: g.item.glyph, color: "#e8d8a0" });
        announceData(game, p);
      }
      break;
    }
  }
}

export function nearVendor(game: Game, p: SPlayer): boolean {
  return NPCS.some((n) => n.role === "vendor" && n.zone === p.zone && dist(p.x, p.y, n.x, n.y) <= 4);
}

export function handleInventory(game: Game, p: SPlayer, action: string, uid: string): void {
  if (p.dead) return;

  if (action === "unequip") {
    for (const slot of ["weapon", "armor", "trinket"] as const) {
      const eq = p.data.equipment[slot];
      if (eq?.uid !== uid) continue;
      if (p.data.inventory.length >= INVENTORY_MAX) {
        game.sendToast(p, "Your pack is full.", "warn");
        return;
      }
      p.data.equipment[slot] = null;
      p.data.inventory.push(eq);
      game.recalc(p.data);
      announceData(game, p);
      return;
    }
    return;
  }

  const idx = p.data.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  const item = p.data.inventory[idx];

  if (action === "use") {
    if (!item.consumable) {
      game.sendToast(p, "That is not something you can use.", "warn");
      return;
    }
    if (item.consumable.teleport) {
      if (p.hearthCd > 0) {
        game.sendToast(p, `Hearthstone recharging — ${Math.ceil(p.hearthCd)}s.`, "warn");
        return;
      }
      p.hearthCd = 60;
      p.zone = "world";
      p.x = 132.5;
      p.y = 96.5;
      p.buffs = [];
      game.send(p, { t: "zone", zone: "world", seed: WORLD_SEED, x: p.x, y: p.y, time: game.day });
      game.sendFx("world", p.x, p.y, { kind: "teleport", x: p.x, y: p.y, color: "#f0c674" }, 20);
      game.sendLog(p, "The hearthstone grows warm. Hearthvale.", "#f0c674");
      announceData(game, p);
      return;
    }
    const wantsHp = !!item.consumable.hp;
    const wantsMp = !!item.consumable.mp;
    if ((wantsHp || wantsMp) && (!wantsHp || p.hp >= p.data.derived.maxHp) && (!wantsMp || p.mp >= p.data.derived.maxMp)) {
      game.sendToast(p, wantsHp && wantsMp ? "Health and mana are already full." : wantsHp ? "Already at full health." : "Already at full mana.", "warn");
      return;
    }
    if (item.consumable.hp) {
      healPlayer(game, p, item.consumable.hp, "#8fe0a0");
      game.sendLog(p, `You drink ${item.name}.`, "#8fd0a0");
    }
    if (item.consumable.mp) {
      p.mp = Math.min(p.data.derived.maxMp, p.mp + item.consumable.mp);
      game.sendFx(p.zone, p.x, p.y, { kind: "mana", x: p.x, y: p.y, amount: item.consumable.mp, color: "#7fb8e8", id: p.id });
      game.sendLog(p, `You drink ${item.name}.`, "#8fb8e8");
    }
    item.qty--;
    if (item.qty <= 0) p.data.inventory.splice(idx, 1);
    announceData(game, p);
    return;
  }

  if (action === "equip") {
    if (!item.slot) {
      game.sendToast(p, "That cannot be equipped.", "warn");
      return;
    }
    const slot = item.slot;
    const old = p.data.equipment[slot];
    p.data.inventory.splice(idx, 1);
    p.data.equipment[slot] = item;
    if (old) p.data.inventory.splice(idx, 0, old);
    game.recalc(p.data);
    p.hp = Math.min(p.hp, p.data.derived.maxHp);
    p.mp = Math.min(p.mp, p.data.derived.maxMp);
    game.sendLog(p, `Equipped ${item.name}.`, "#d8b46a");
    announceData(game, p);
    return;
  }

  if (action === "drop") {
    if (uid.startsWith("eq_")) return;
    p.data.inventory.splice(idx, 1);
    dropGround(game, p.zone, p.x, p.y, item, p.id);
    game.sendLog(p, `Dropped ${item.name}.`, "#8a8a80");
    announceData(game, p);
    return;
  }

  if (action === "sell") {
    if (!nearVendor(game, p)) {
      game.sendToast(p, "Sable is not nearby.", "warn");
      return;
    }
    const value = Math.max(1, Math.floor(item.value * 0.35 * item.qty));
    p.data.gold += value;
    p.data.inventory.splice(idx, 1);
    game.sendLog(p, `Sold ${item.name} for ${value} gold.`, "#e8c878");
    game.sendData(p);
    game.persist(p);
  }
}

export function handleVendor(game: Game, p: SPlayer, action: string, id: string, qty: number): void {
  if (action !== "buy" || !nearVendor(game, p)) return;
  const stock = VENDOR_STOCK.find((s) => s.id === id);
  if (!stock) return;
  const count = Math.max(1, Math.min(10, Math.floor(qty || 1)));
  const price = stock.price * count;
  if (p.data.gold < price) {
    game.sendToast(p, "Not enough gold.", "warn");
    return;
  }
  const item = itemFromBase(id, count, game);
  if (!addItem(game, p, item, true)) return;
  p.data.gold -= price;
  game.sendLog(p, `Bought ${item.name}${count > 1 ? ` ×${count}` : ""} for ${price} gold.`, "#e8c878");
  game.sendData(p);
  game.persist(p);
  game.refreshDialog(p);
}

/** D2-style potion belt: quaff the first matching potion in the pack. */
export function quaff(game: Game, p: SPlayer, kind: "hp" | "mp"): void {
  if (p.dead) return;
  const idx = p.data.inventory.findIndex((i) => kind === "hp" ? !!i.consumable?.hp : !!i.consumable?.mp);
  if (idx < 0) {
    game.sendToast(p, kind === "hp" ? "No healing potions." : "No mana potions.", "warn");
    return;
  }
  handleInventory(game, p, "use", p.data.inventory[idx].uid);
}
