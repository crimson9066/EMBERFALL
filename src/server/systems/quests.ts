import { ITEM_BASES, NPCS, QUESTS, VENDOR_STOCK, type NpcDef } from "../../shared/content";
import { dist } from "../../shared/formulas";
import type { DialogData, QuestState } from "../../shared/types";
import type { Game } from "../game";
import type { SMob, SPlayer } from "../types";
import { addItem, itemFromBase } from "./items";

function questNpc(questId: string): NpcDef | undefined {
  const def = QUESTS[questId];
  if (!def) return undefined;
  return NPCS.find((n) => n.id === def.giver);
}

function nearNpc(p: SPlayer, npc: NpcDef | undefined): boolean {
  return !!npc && npc.zone === p.zone && dist(p.x, p.y, npc.x, npc.y) <= 4;
}

function stateOf(p: SPlayer, id: string): QuestState | undefined {
  return p.data.quests.find((q) => q.id === id);
}

function offerable(p: SPlayer, id: string): boolean {
  const def = QUESTS[id];
  if (!def) return false;
  if (stateOf(p, id)) return false;
  if (!def.repeatable && p.data.completed.includes(id)) return false;
  if (def.requires && !p.data.completed.includes(def.requires)) return false;
  if (p.data.level < def.level - 1) return false;
  return true;
}

function allObjectivesDone(p: SPlayer, q: QuestState): boolean {
  const def = QUESTS[q.id];
  if (!def) return false;
  return def.objectives.every((o, i) => (q.progress[i] ?? 0) >= o.count);
}

function countItem(p: SPlayer, baseId: string): number {
  return p.data.inventory.filter((i) => i.baseId === baseId).reduce((n, i) => n + i.qty, 0);
}

function consumeItem(p: SPlayer, baseId: string, count: number): void {
  let left = count;
  for (let i = p.data.inventory.length - 1; i >= 0 && left > 0; i--) {
    const item = p.data.inventory[i];
    if (item.baseId !== baseId) continue;
    const take = Math.min(item.qty, left);
    item.qty -= take;
    left -= take;
    if (item.qty <= 0) p.data.inventory.splice(i, 1);
  }
}

export function onMobKill(game: Game, p: SPlayer, mob: SMob): void {
  for (const q of p.data.quests) {
    if (q.state !== "active") continue;
    const def = QUESTS[q.id];
    if (!def) continue;
    let touched = false;
    for (let i = 0; i < def.objectives.length; i++) {
      const obj = def.objectives[i];
      if (obj.target !== mob.defId) continue;
      if (obj.type !== "kill" && obj.type !== "boss") continue;
      if ((q.progress[i] ?? 0) >= obj.count) continue;
      q.progress[i] = (q.progress[i] ?? 0) + 1;
      touched = true;
    }
    if (touched) {
      if (allObjectivesDone(p, q)) {
        q.state = "done";
        game.sendLog(p, `Quest ready to turn in: ${def.name}.`, "#f0c674");
        game.sendToast(p, `QUEST COMPLETE — ${def.name}`, "quest");
      } else {
        const parts = def.objectives.map((o, i) => `${o.label} ${Math.min(q.progress[i] ?? 0, o.count)}/${o.count}`);
        game.sendLog(p, `${def.name}: ${parts.join(" · ")}`, "#8f9a8a");
      }
      game.sendData(p);
      game.persist(p);
    }
  }
}

export function onCollect(game: Game, p: SPlayer, baseId: string, qty: number): void {
  let touched = false;
  for (const q of p.data.quests) {
    if (q.state !== "active") continue;
    const def = QUESTS[q.id];
    if (!def) continue;
    for (let i = 0; i < def.objectives.length; i++) {
      const obj = def.objectives[i];
      if (obj.type !== "collect" || obj.target !== baseId) continue;
      if ((q.progress[i] ?? 0) >= obj.count) continue;
      q.progress[i] = Math.min(obj.count, (q.progress[i] ?? 0) + qty);
      touched = true;
      if (allObjectivesDone(p, q)) {
        q.state = "done";
        game.sendLog(p, `Quest ready to turn in: ${def.name}.`, "#f0c674");
        game.sendToast(p, `QUEST COMPLETE — ${def.name}`, "quest");
      } else {
        game.sendLog(p, `${def.name}: ${obj.label} ${q.progress[i] ?? 0}/${obj.count}`, "#8f9a8a");
      }
      game.sendData(p);
    }
  }
  if (touched) game.persist(p);
}

export function handleQuest(game: Game, p: SPlayer, action: string, id: string): void {
  const def = QUESTS[id];
  if (!def) return;
  const npc = questNpc(id);
  if (!nearNpc(p, npc)) {
    game.sendToast(p, "Find the quest giver first.", "warn");
    return;
  }

  if (action === "accept") {
    if (!offerable(p, id)) return;
    // Collect quests should count reagents the wanderer already carries.
    const progress = def.objectives.map((o) =>
      o.type === "collect" ? Math.min(o.count, countItem(p, o.target)) : 0
    );
    p.data.quests.push({ id, progress, state: "active" });
    game.sendLog(p, `Quest accepted: ${def.name}.`, "#f0c674");
    game.sendToast(p, `NEW QUEST — ${def.name}`, "quest");
    game.sendData(p);
    game.persist(p);
    refreshDialog(game, p);
    return;
  }

  if (action === "turnin") {
    const q = stateOf(p, id);
    if (!q || !allObjectivesDone(p, q)) {
      game.sendToast(p, "The task is not finished.", "warn");
      return;
    }
    for (const obj of def.objectives) {
      if (obj.type === "collect" && countItem(p, obj.target) < obj.count) {
        game.sendToast(p, `You need ${obj.count} ${ITEM_BASES[obj.target]?.name ?? obj.target}.`, "warn");
        return;
      }
    }
    for (const obj of def.objectives) {
      if (obj.type === "collect") consumeItem(p, obj.target, obj.count);
    }
    p.data.quests = p.data.quests.filter((x) => x.id !== id);
    if (!p.data.completed.includes(id)) p.data.completed.push(id);
    p.data.gold += def.rewards.gold;
    if (def.rewards.items) {
      for (const baseId of def.rewards.items) {
        if (baseId === "cinder_core") addItem(game, p, itemFromBase("cinder_core", 1, game), true);
        else addItem(game, p, itemFromBase(baseId, 1, game), true);
      }
    }
    game.grantXp(p, def.rewards.xp);
    game.sendLog(p, `Quest complete: ${def.name}. +${def.rewards.xp} XP · +${def.rewards.gold} gold`, "#f0c674");
    game.sendToast(p, `REWARD — ${def.rewards.gold} GOLD`, "loot");
    game.sendData(p);
    game.persist(p);
    refreshDialog(game, p);
  }
}

export function buildQuestList(p: SPlayer, npcId: string): DialogData["quests"] {
  const out: NonNullable<DialogData["quests"]> = [];
  for (const def of Object.values(QUESTS)) {
    if (def.giver !== npcId) continue;
    const st = stateOf(p, def.id);
    if (st) {
      out.push({ id: def.id, state: st.state === "done" || allObjectivesDone(p, st) ? "done" : "active" });
    } else if (offerable(p, def.id)) {
      out.push({ id: def.id, state: "offer" });
    }
  }
  return out;
}

export function openNpcDialog(game: Game, p: SPlayer, npcId: string): void {
  const npc = NPCS.find((n) => n.id === npcId);
  if (!npc) return;
  if (npc.zone !== p.zone || dist(p.x, p.y, npc.x, npc.y) > 4) return;
  p.dialogNpc = npcId;

  const kind: DialogData["kind"] =
    npc.role === "vendor" ? "vendor" :
    npc.role === "healer" ? "healer" :
    npc.role === "quest" || npc.role === "guard" ? "quest" : "lore";

  const dialog: DialogData = {
    npcId: npc.id,
    npcName: npc.name,
    npcTitle: npc.title,
    text: npc.text,
    kind
  };
  if (kind === "quest") dialog.quests = buildQuestList(p, npc.id);
  if (kind === "vendor") {
    dialog.buy = VENDOR_STOCK.map((s) => {
      const base = ITEM_BASES[s.id];
      return {
        id: s.id, name: base.name, price: s.price, desc: base.desc, glyph: base.glyph,
        color: s.id.startsWith("potion") ? "#e08a70" : s.id.startsWith("tonic") ? "#7fb8e8" : "#e8c878"
      };
    });
  }
  game.send(p, { t: "dialog", dialog });
}

export function refreshDialog(game: Game, p: SPlayer): void {
  if (p.dialogNpc) openNpcDialog(game, p, p.dialogNpc);
}
