import { CLASSES, regionAt } from "../../shared/content";
import type { ChatMsg } from "../../shared/types";
import type { Game } from "../game";
import type { Party, SPlayer } from "../types";
import { cleanText, nameKey } from "../util";

const SAY_RADIUS = 30;
const YELL_RADIUS = 70;
const PARTY_MAX = 5;

function sendChat(game: Game, p: SPlayer, msg: ChatMsg): void {
  game.send(p, { t: "chat", msg });
}

function sendAround(game: Game, p: SPlayer, radius: number, msg: ChatMsg): void {
  for (const other of game.players.values()) {
    if (other.zone !== p.zone) continue;
    if (other.id !== p.id && (other.dead || p.dead)) continue;
    if (dist(other, p) > radius) continue;
    game.send(other, { t: "chat", msg });
  }
}

function dist(a: SPlayer, b: SPlayer): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function partyOf(game: Game, p: SPlayer): Party | undefined {
  return p.partyId ? game.parties.get(p.partyId) : undefined;
}

function partyLog(game: Game, party: Party, text: string, color = "#8fd0a0"): void {
  for (const id of party.memberIds) {
    const m = game.players.get(id);
    if (m) game.sendLog(m, text, color);
  }
}

function say(game: Game, p: SPlayer, text: string, channel: "say" | "yell"): void {
  const radius = channel === "yell" ? YELL_RADIUS : SAY_RADIUS;
  const msg: ChatMsg = {
    channel, from: p.data.name, text,
    color: channel === "yell" ? "#f0c674" : "#ddd6c4", senderId: p.id
  };
  sendAround(game, p, radius, msg);
  game.sendFx(p.zone, p.x, p.y, { kind: "chatbubble", x: p.x, y: p.y, text, color: msg.color, id: p.id }, radius);
}

function worldChat(game: Game, p: SPlayer, text: string): void {
  game.broadcastChat({ channel: "world", from: p.data.name, text, color: "#8fb8e8", senderId: p.id });
}

function partyChat(game: Game, p: SPlayer, text: string): void {
  const party = partyOf(game, p);
  if (!party) {
    game.sendLog(p, "You are not in a party.", "#b8a890");
    return;
  }
  const msg: ChatMsg = { channel: "party", from: p.data.name, text, color: "#8fd0a0", senderId: p.id };
  for (const id of party.memberIds) {
    const m = game.players.get(id);
    if (m) sendChat(game, m, msg);
  }
}

function whisper(game: Game, p: SPlayer, targetName: string, text: string): void {
  const target = game.byName.get(nameKey(targetName));
  if (!target) {
    game.sendLog(p, `No one named ${targetName} is online.`, "#b8a890");
    return;
  }
  sendChat(game, target, { channel: "whisper", from: p.data.name, text, color: "#d0a0e8", senderId: p.id });
  sendChat(game, p, { channel: "whisper", from: `to ${target.data.name}`, text, color: "#d0a0e8" });
}

function onlineList(game: Game, p: SPlayer): void {
  const list = [...game.players.values()]
    .sort((a, b) => b.data.level - a.data.level)
    .map((m) => `${m.data.name} · ${m.data.level} ${CLASSES[m.data.classId].name} · ${regionAt(m.zone, m.x, m.y).name}`);
  game.sendLog(p, `Online (${list.length}): ${list.join("  |  ")}`, "#a8c8d8");
}

function help(game: Game, p: SPlayer): void {
  const lines = [
    "MOVEMENT  WASD / arrows · Shift sprint · E interact · mouse select & loot",
    "COMBAT    1-6 skills · right-click cast armed · Space auto-attack · Tab target · Q heal · F mana · R respawn",
    "PANELS    I pack · C character · J journal · M map · P party · H codex · V CRT · N mute · Esc close",
    "CHAT      Enter to talk · /s /y /w Name /p · /who · /invite Name · /accept · /leave",
    "VIEW      mouse wheel or +/- zoom · the road south of Hearthvale leads to wolves; the crypt lies far east."
  ];
  for (const line of lines) game.sendLog(p, line, "#9aa89a");
}

export function handleChat(game: Game, p: SPlayer, raw: string): void {
  const text = cleanText(raw, 220);
  if (!text) return;
  if (game.time - p.lastChatAt < 0.55) {
    game.sendToast(p, "Easy. Let the words breathe.", "warn");
    return;
  }
  p.lastChatAt = game.time;

  if (!text.startsWith("/")) {
    say(game, p, text, "say");
    return;
  }
  const space = text.indexOf(" ");
  const cmd = (space < 0 ? text.slice(1) : text.slice(1, space)).toLowerCase();
  const rest = space < 0 ? "" : text.slice(space + 1).trim();

  switch (cmd) {
    case "s": case "say": say(game, p, rest, "say"); break;
    case "y": case "yell": say(game, p, rest, "yell"); break;
    case "w": case "whisper": {
      const parts = rest.split(/\s+/);
      const name = parts.shift() ?? "";
      whisper(game, p, name, parts.join(" "));
      break;
    }
    case "p": case "party": partyChat(game, p, rest); break;
    case "invite": handleParty(game, p, "invite", rest); break;
    case "accept": handleParty(game, p, "accept"); break;
    case "leave": handleParty(game, p, "leave"); break;
    case "who": onlineList(game, p); break;
    case "help": help(game, p); break;
    case "roll": {
      const n = 1 + Math.floor(Math.random() * 100);
      say(game, p, `rolls ${n} (1-100)`, "yell");
      break;
    }
    case "dance": case "wave": case "bow": case "cheer": case "point":
      handleEmote(game, p, cmd);
      break;
    default:
      game.sendLog(p, `Unknown command /${cmd}. Try /help.`, "#b8a890");
  }
}

export function handleParty(game: Game, p: SPlayer, action: string, name?: string): void {
  if (action === "leave") {
    partyLeave(game, p, false);
    return;
  }
  if (action === "invite") {
    const target = game.byName.get(nameKey(name ?? ""));
    if (!target) { game.sendToast(p, "No such wanderer online.", "warn"); return; }
    if (target.id === p.id) { game.sendToast(p, "You cannot invite yourself.", "warn"); return; }
    if (target.partyId) { game.sendToast(p, `${target.data.name} is already in a party.`, "warn"); return; }
    const myParty = partyOf(game, p);
    if (myParty && myParty.leaderId !== p.id) { game.sendToast(p, "Only the party leader may invite.", "warn"); return; }
    if (myParty && myParty.memberIds.size >= PARTY_MAX) { game.sendToast(p, "Your party is full.", "warn"); return; }
    game.invites.set(target.id, { fromId: p.id, expires: game.time + 30 });
    game.sendLog(target, `${p.data.name} invites you to a party. Type /accept within 30s.`, "#8fd0a0");
    game.sendToast(target, `PARTY INVITE — ${p.data.name}`, "party");
    game.sendLog(p, `Invitation sent to ${target.data.name}.`, "#8fd0a0");
    return;
  }
  if (action === "accept") {
    const invite = game.invites.get(p.id);
    if (!invite || invite.expires < game.time) {
      game.sendToast(p, "No party invitation pending.", "warn");
      return;
    }
    game.invites.delete(p.id);
    const leader = game.players.get(invite.fromId);
    if (!leader) { game.sendToast(p, "The invitation has faded.", "warn"); return; }
    if (p.partyId) { game.sendToast(p, "You are already in a party.", "warn"); return; }
    let party = partyOf(game, leader);
    if (!party) {
      party = { id: game.uid("party"), leaderId: leader.id, memberIds: new Set([leader.id]) };
      game.parties.set(party.id, party);
      leader.partyId = party.id;
    }
    if (party.leaderId !== leader.id && party.leaderId !== p.id) {
      game.sendToast(p, "That party has disbanded.", "warn");
      return;
    }
    if (party.memberIds.size >= PARTY_MAX) { game.sendToast(p, "That party is full.", "warn"); return; }
    party.memberIds.add(p.id);
    p.partyId = party.id;
    partyLog(game, party, `${p.data.name} joins the party.`);
    return;
  }
}

export function partyLeave(game: Game, p: SPlayer, silent: boolean): void {
  const party = partyOf(game, p);
  if (!party) {
    if (!silent) game.sendLog(p, "You are not in a party.", "#b8a890");
    return;
  }
  party.memberIds.delete(p.id);
  p.partyId = null;
  if (party.memberIds.size === 0) {
    game.parties.delete(party.id);
    return;
  }
  if (party.leaderId === p.id) {
    const next = [...party.memberIds][0];
    party.leaderId = next;
    partyLog(game, party, `${p.data.name} leaves. ${game.players.get(next)?.data.name ?? "Someone"} now leads.`, "#b8a890");
  } else if (!silent) {
    partyLog(game, party, `${p.data.name} leaves the party.`, "#b8a890");
  }
  if (!silent) game.sendLog(p, "You leave the party.", "#b8a890");
}

export function handleEmote(game: Game, p: SPlayer, emote: string): void {
  const allowed = ["dance", "wave", "bow", "cheer", "point"];
  if (!allowed.includes(emote)) return;
  const text = `* ${p.data.name} ${emote}s. *`;
  const msg: ChatMsg = { channel: "say", from: p.data.name, text, color: "#c8b8a0", senderId: p.id };
  sendAround(game, p, SAY_RADIUS, msg);
  game.sendFx(p.zone, p.x, p.y, { kind: "emote", x: p.x, y: p.y, text: emote.toUpperCase(), color: "#d8b46a", id: p.id }, 30);
}
