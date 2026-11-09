import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type {
  ChatMsg, ClientMsg, ClassId, CooldownView, DialogData, EntSnap, Fx, GroundItemSnap, Item,
  ItemSlot, PlayerData, QuestState, SelfSnap, ServerMsg, Snapshot, StatusEffect, ZoneId
} from "../shared/types";
import {
  ABILITIES, CLASSES, ITEM_BASES, MOBS, NPCS, PORTALS, QUESTS, SHRINES, VENDOR_STOCK,
  classAbilities, generateItem, makeConsumable, makeStarterGear, regionAt, xpForLevel
} from "../shared/content";
import {
  CRYPT_POIS, T, WORLD_POIS, WORLD_SEED, getMap, isWalkable, randomWalkableNear, seedFor, walkableTile, type GameMap
} from "../shared/worldgen";
import {
  canStand, deriveStats, dist, emptyEquip, findPathStep, inCone, levelXpMultiplier, moveWithCollision,
  normalize, rollDamage
} from "../shared/formulas";
import { Store } from "./persistence";
import type { SPlayer, SMob, SProj, SCast, SZone, Ground, Party } from "./types";
import { nameKey, nowSec, validName } from "./util";
import {
  spawnAll as spawnWorld, updateMob as tickMob, updateProjectiles as tickProjectiles,
  updateCasts as tickCasts, updateZones as tickZones, killMob as killMobSystem
} from "./systems/mobs";
import { updatePlayer as tickPlayer } from "./systems/player";
import { toggleAuto as toggleAutoAttack, useAbility as castAbility, respawnPlayer as resurrectPlayer } from "./systems/combat";
import { handleChat as chatSystem, handleParty as partySystem, handleEmote as emoteSystem, partyLeave as leaveParty } from "./systems/social";
import { addItem as addItemSystem, handleInventory as inventorySystem, handleVendor as vendorSystem, quaff as quaffPotion, updateGround as tickGround } from "./systems/items";
import { handleQuest as questSystem, onMobKill as questKill, onCollect as questCollect, refreshDialog as refreshDialogSystem, openNpcDialog } from "./systems/quests";
import { grantXp as grantExperience } from "./systems/progression";

const TICK_MS = 50;
const INTEREST = 62;
const BASE_SPEED = 4.4;
const TOWN_SAFE = 31;
const DAY_LENGTH = 1200;

export class Game {
  readonly store: Store;
  players = new Map<string, SPlayer>();
  byName = new Map<string, SPlayer>();
  connections = new Map<WebSocket, SPlayer | null>();
  mobs = new Map<string, SMob>();
  ground = new Map<string, Ground>();
  projectiles = new Map<string, SProj>();
  casts = new Map<string, SCast>();
  zones = new Map<string, SZone>();
  parties = new Map<string, Party>();
  invites = new Map<string, { fromId: string; expires: number }>();
  time = 0;
  day = 0.33;
  weather = "clear";
  weatherTimer = 200;
  lastTick = 0;
  timer: ReturnType<typeof setInterval> | null = null;
  private uidCounter = 0;
  private lastOnlineBroadcast = 0;

  constructor(store?: Store) {
    this.store = store ?? new Store();
    this.lastTick = nowSec();
    spawnWorld(this);
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = nowSec();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    console.log(`[game] world online â€” ${this.mobs.size} creatures, ${this.players.size} players`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.players.values()) this.persist(p);
    this.store.flush(true);
  }

  uid(prefix: string): string {
    this.uidCounter++;
    return `${prefix}_${this.uidCounter.toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
  }

  // â”€â”€ Connection lifecycle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  handleConnection(ws: WebSocket): void {
    this.connections.set(ws, null);
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMsg;
        this.handleMessage(ws, msg);
      } catch (err) {
        console.warn("[net] bad message", err);
      }
    });
    ws.on("close", () => this.disconnect(ws));
    ws.on("error", () => this.disconnect(ws));
  }

  private handleMessage(ws: WebSocket, msg: ClientMsg): void {
    if (!msg || typeof msg.t !== "string") return;
    if (msg.t === "auth") {
      this.handleAuth(ws, msg);
      return;
    }
    if (msg.t === "ping") {
      this.sendRaw(ws, { t: "pong", at: msg.at });
      return;
    }
    const p = this.connections.get(ws);
    if (!p) {
      this.sendRaw(ws, { t: "error", message: "Not authenticated." });
      return;
    }
    this.onMessage(p, msg);
  }

  private handleAuth(ws: WebSocket, msg: { name: string; classId: ClassId; token?: string }): void {
    const name = typeof msg.name === "string" ? msg.name.trim() : "";
    if (!validName(name)) {
      this.sendRaw(ws, { t: "error", message: "Name must be 3â€“16 characters: letters, numbers, underscore." });
      return;
    }
    if (!CLASSES[msg.classId]) {
      this.sendRaw(ws, { t: "error", message: "Unknown calling." });
      return;
    }

    let existing = this.store.get(name);
    const token = typeof msg.token === "string" ? msg.token : "";
    if (existing && existing.token !== token) {
      this.sendRaw(ws, { t: "error", message: `The name ${existing.data.name} is already claimed.` });
      return;
    }

    const online = this.byName.get(nameKey(name));
    if (online) {
      this.sendLog(online, "You have been disconnected: this character entered from another window.", "#ff8a6a");
      try { online.ws.close(4001, "session replaced"); } catch { /* ignore */ }
      this.players.delete(online.id);
      this.byName.delete(nameKey(name));
      this.connections.set(online.ws, null);
      this.persist(online);
    }

    let data: PlayerData;
    const returning = !!existing;
    if (existing) {
      data = existing.data;
      data.xpNext = xpForLevel(data.level);
      this.recalc(data);
    } else {
      data = this.createCharacter(name, msg.classId);
      existing = {
        data,
        token: randomUUID(),
        zone: "world",
        x: 132.5,
        y: 96.5,
        lastSeen: Date.now()
      };
      this.store.put(existing);
    }

    let zone: ZoneId = existing.zone;
    let x = existing.x;
    let y = existing.y;
    if (!isWalkable(getMap(zone), x, y)) {
      zone = data.respawn.zone;
      x = data.respawn.x;
      y = data.respawn.y;
      if (!isWalkable(getMap(zone), x, y)) {
        zone = "world";
        x = 132.5;
        y = 96.5;
      }
    }

    const p: SPlayer = {
      id: `p_${nameKey(name)}`,
      ws,
      token: existing.token,
      data,
      zone,
      x,
      y,
      hp: data.derived.maxHp,
      mp: data.derived.maxMp,
      stamina: data.derived.maxStamina,
      facing: 0,
      inputX: 0,
      inputY: 0,
      sprint: false,
      targetId: null,
      autoAttack: false,
      attackCd: 0,
      hearthCd: 0,
      cds: new Map(),
      buffs: [],
      dead: false,
      respawnLeft: 0,
      inCombatUntil: 0,
      lastDamageAt: 0,
      lastChatAt: 0,
      partyId: null,
      dialogNpc: null,
      dirty: true,
      lastSave: nowSec(),
      joinedAt: Date.now(),
      sessionKills: 0
    };
    this.connections.set(ws, p);
    this.players.set(p.id, p);
    this.byName.set(nameKey(name), p);

    this.send(p, {
      t: "welcome",
      token: p.token,
      data: p.data,
      zone: p.zone,
      seed: WORLD_SEED,
      time: this.day,
      online: this.players.size,
      self: this.selfSnap(p)
    });
    this.sendLog(p, returning ? `Welcome back to the Reach, ${p.data.name}.` : `Welcome to Emberfall, ${p.data.name}. Press H for help.`, "#d8b46a");
    if (!returning) {
      this.sendLog(p, "The Hearthvale road is south of the plaza. Wolves have been bold lately.", "#8f9a8a");
    }
    this.broadcastSystem(`${p.data.name} the ${CLASSES[p.data.classId].name} has entered the Reach.`);
    this.persist(p);
    console.log(`[game] ${p.data.name} (${p.data.classId}) entered ${p.zone} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }

  private createCharacter(name: string, classId: ClassId): PlayerData {
    const def = CLASSES[classId];
    const gear = emptyEquip();
    const weapon = makeStarterGear(classId);
    weapon.uid = this.uid("it");
    weapon.qty = 1;
    gear.weapon = weapon;
    const { stats, derived } = deriveStats(1, classId, gear);
    const inventory: Item[] = [];
    for (const baseId of def.startingKit) {
      const stack = inventory.find((i) => i.baseId === baseId);
      if (stack) stack.qty++;
      else {
        const it = makeConsumable(baseId);
        it.uid = this.uid("it");
        inventory.push(it);
      }
    }
    return {
      name,
      classId,
      level: 1,
      xp: 0,
      xpNext: xpForLevel(1),
      gold: 25,
      stats,
      derived,
      equipment: gear,
      inventory,
      quests: [],
      learned: classAbilities(classId).filter((a) => a.unlock <= 1).map((a) => a.id),
      kills: 0,
      deaths: 0,
      completed: [],
      createdAt: Date.now(),
      playTime: 0,
      respawn: { zone: "world", x: 132.5, y: 96.5 }
    };
  }

  disconnect(ws: WebSocket): void {
    const p = this.connections.get(ws);
    this.connections.delete(ws);
    if (!p) return;
    if (p.ws !== ws) return;
    this.players.delete(p.id);
    this.byName.delete(nameKey(p.data.name));
    this.persist(p);
    leaveParty(this, p, true);
    this.broadcastSystem(`${p.data.name} fades from the Reach.`);
    console.log(`[game] ${p.data.name} disconnected`);
  }

  private onMessage(p: SPlayer, msg: ClientMsg): void {
    switch (msg.t) {
      case "input":
        if (typeof msg.mx === "number" && typeof msg.my === "number") {
          p.inputX = Math.max(-1, Math.min(1, msg.mx));
          p.inputY = Math.max(-1, Math.min(1, msg.my));
          p.sprint = !!msg.sprint;
        }
        break;
      case "select":
        p.targetId = typeof msg.id === "string" ? msg.id : null;
        break;
      case "cast":
        castAbility(this, p, msg.slot, msg.aimX, msg.aimY);
        break;
      case "auto":
        toggleAutoAttack(this, p);
        break;
      case "quaff":
        quaffPotion(this, p, msg.kind === "mp" ? "mp" : "hp");
        break;
      case "interact":
        this.interact(p);
        break;
      case "respawn":
        resurrectPlayer(this, p);
        break;
      case "chat":
        chatSystem(this, p, typeof msg.text === "string" ? msg.text : "");
        break;
      case "inv":
        inventorySystem(this, p, msg.action, msg.uid);
        break;
      case "vendor":
        vendorSystem(this, p, msg.action, msg.id, msg.qty ?? 1);
        break;
      case "quest":
        questSystem(this, p, msg.action, msg.id);
        break;
      case "party":
        partySystem(this, p, msg.action, msg.name);
        break;
      case "emote":
        emoteSystem(this, p, msg.name);
        break;
    }
  }

  // â”€â”€ Messaging helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  send(p: SPlayer, msg: ServerMsg): void {
    this.sendRaw(p.ws, msg);
  }

  sendRaw(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(msg)); } catch { /* socket died */ }
  }

  sendLog(p: SPlayer, text: string, color = "#a8a49a"): void {
    this.send(p, { t: "log", text, color });
  }

  sendToast(p: SPlayer, text: string, kind = "info"): void {
    this.send(p, { t: "toast", text, kind });
  }

  sendData(p: SPlayer): void {
    p.dirty = true;
    this.send(p, { t: "playerData", data: p.data });
  }

  sendFx(zone: ZoneId, x: number, y: number, fx: Fx, radius = 70): void {
    for (const p of this.players.values()) {
      if (p.zone !== zone) continue;
      if (dist(p.x, p.y, x, y) > radius) continue;
      this.send(p, { t: "fx", fx });
    }
  }

  broadcastSystem(text: string): void {
    const msg: ServerMsg = { t: "log", text, color: "#7f8a94" };
    for (const p of this.players.values()) this.send(p, msg);
  }

  broadcastChat(msg: ChatMsg): void {
    for (const p of this.players.values()) this.send(p, { t: "chat", msg });
  }

  persist(p: SPlayer): void {
    this.store.put({
      data: p.data,
      token: p.token,
      zone: p.zone,
      x: p.x,
      y: p.y,
      lastSeen: Date.now()
    });
    p.dirty = false;
    p.lastSave = nowSec();
  }

  recalc(data: PlayerData): void {
    const gear = data.equipment ?? emptyEquip();
    const { stats, derived } = deriveStats(data.level, data.classId, gear);
    data.stats = stats;
    data.derived = derived;
  }

  // â”€â”€ Main loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private tick(): void {
    const now = nowSec();
    let dt = now - this.lastTick;
    if (dt <= 0) return;
    if (dt > 0.25) dt = 0.25;
    this.lastTick = now;
    this.time += dt;
    this.day = (0.32 + this.time / DAY_LENGTH) % 1;
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const options = ["clear", "clear", "clear", "rain", "fog", "ember", "snow"];
      this.weather = options[Math.floor(Math.random() * options.length)];
      this.weatherTimer = 150 + Math.random() * 180;
    }

    for (const p of this.players.values()) tickPlayer(this, p, dt);
    for (const m of [...this.mobs.values()]) tickMob(this, m, dt);
    tickProjectiles(this, dt);
    tickCasts(this);
    tickZones(this);
    tickGround(this);
    this.sendSnapshots();
    this.store.flush();

    if (now - this.lastOnlineBroadcast > 20) {
      this.lastOnlineBroadcast = now;
      const msg: ServerMsg = { t: "online", count: this.players.size };
      for (const p of this.players.values()) this.send(p, msg);
    }
  }

  private sendSnapshots(): void {
    for (const p of this.players.values()) {
      this.send(p, { t: "snapshot", snap: this.buildSnapshot(p) });
    }
  }

  private buildSnapshot(p: SPlayer): Snapshot {
    const players: EntSnap[] = [];
    const mobs: EntSnap[] = [];
    const npcs: EntSnap[] = [];
    const items: GroundItemSnap[] = [];
    const projectiles = [];
    const casts = [];
    const zones = [];

    for (const other of this.players.values()) {
      if (other.id === p.id || other.zone !== p.zone) continue;
      if (dist(p.x, p.y, other.x, other.y) > INTEREST) continue;
      players.push(this.playerEnt(other));
    }
    for (const m of this.mobs.values()) {
      if (m.zone !== p.zone || m.dead) continue;
      if (dist(p.x, p.y, m.x, m.y) > INTEREST) continue;
      mobs.push(this.mobEnt(m));
    }
    for (const n of NPCS) {
      if (n.zone !== p.zone) continue;
      if (dist(p.x, p.y, n.x, n.y) > INTEREST) continue;
      npcs.push({ id: n.id, kind: "npc", name: n.name, title: n.title, glyph: n.glyph, color: n.color, x: n.x, y: n.y, role: n.role });
    }
    for (const s of SHRINES) {
      if (s.zone !== p.zone) continue;
      if (dist(p.x, p.y, s.x, s.y) > INTEREST) continue;
      npcs.push({ id: s.id, kind: "npc", name: s.name, title: "Sacred ground", glyph: "â˜¼", color: "#e8c878", x: s.x, y: s.y, role: "shrine" });
    }
    for (const portal of PORTALS) {
      if (portal.zone !== p.zone) continue;
      if (dist(p.x, p.y, portal.x, portal.y) > INTEREST) continue;
      npcs.push({ id: portal.id, kind: "portal", name: portal.name, title: "A way between places", glyph: portal.glyph, color: portal.color, x: portal.x, y: portal.y, role: "portal" });
    }
    for (const g of this.ground.values()) {
      if (g.zone !== p.zone) continue;
      if (dist(p.x, p.y, g.x, g.y) > 42) continue;
      items.push({ id: g.id, name: g.item.name, glyph: g.item.glyph, color: this.rarityColor(g.item.rarity), x: g.x, y: g.y, qty: g.item.qty, rarity: g.item.rarity });
    }
    for (const pr of this.projectiles.values()) {
      if (pr.zone !== p.zone || dist(p.x, p.y, pr.x, pr.y) > INTEREST) continue;
      projectiles.push({ id: pr.id, x: pr.x, y: pr.y, glyph: pr.glyph, color: pr.color });
    }
    for (const c of this.casts.values()) {
      if (c.zone !== p.zone || dist(p.x, p.y, c.x, c.y) > INTEREST) continue;
      casts.push({
        id: c.id, x: c.x, y: c.y, radius: c.radius, remain: Math.max(0, c.endsAt - this.time),
        color: c.color, name: c.name, kind: c.kind, angle: c.angle, length: c.length
      });
    }
    for (const z of this.zones.values()) {
      if (z.zone !== p.zone || dist(p.x, p.y, z.x, z.y) > INTEREST) continue;
      zones.push({ id: z.id, x: z.x, y: z.y, radius: z.radius, remain: Math.max(0, z.endsAt - this.time), color: z.color, kind: z.kind });
    }

    return {
      t: "snapshot",
      now: Date.now(),
      time: this.day,
      weather: this.weather,
      zone: p.zone,
      players,
      mobs,
      npcs,
      items,
      projectiles,
      casts,
      zones,
      self: this.selfSnap(p)
    };
  }

  private playerEnt(p: SPlayer): EntSnap {
    return {
      id: p.id, kind: "player", name: p.data.name, glyph: CLASSES[p.data.classId].glyph,
      color: CLASSES[p.data.classId].color, x: p.x, y: p.y, level: p.data.level,
      hp: Math.ceil(p.hp), maxHp: p.data.derived.maxHp, facing: p.facing,
      className: CLASSES[p.data.classId].name, dead: p.dead
    };
  }

  private mobEnt(m: SMob): EntSnap {
    const def = MOBS[m.defId];
    return {
      id: m.id, kind: "mob", name: m.name, glyph: def?.glyph ?? "?", color: m.rare ? "#c07ae8" : (def?.color ?? "#d08060"),
      x: m.x, y: m.y, level: m.level, hp: Math.ceil(m.hp), maxHp: m.maxHp, facing: m.facing,
      rare: m.rare, elite: m.elite, boss: m.boss
    };
  }

  private selfSnap(p: SPlayer): SelfSnap {
    const abilities = classAbilities(p.data.classId);
    const cds: CooldownView[] = abilities.map((a) => ({
      id: a.id,
      remain: Math.max(0, p.cds.get(a.id) ?? 0),
      max: Math.max(0.2, a.cooldown * (1 - p.data.derived.haste / 100))
    }));
    return {
      id: p.id,
      name: p.data.name,
      classId: p.data.classId,
      level: p.data.level,
      x: p.x,
      y: p.y,
      hp: Math.ceil(p.hp),
      maxHp: p.data.derived.maxHp,
      mp: Math.ceil(p.mp),
      maxMp: p.data.derived.maxMp,
      stamina: Math.ceil(p.stamina),
      maxStamina: p.data.derived.maxStamina,
      xp: p.data.xp,
      xpNext: p.data.xpNext,
      gold: p.data.gold,
      zone: p.zone,
      targetId: p.targetId,
      cds,
      buffs: p.buffs.map((b) => ({ id: b.id, name: b.name, kind: b.kind, value: b.value, remaining: b.remaining, glyph: b.glyph, color: b.color })),
      dead: p.dead,
      respawnIn: p.dead ? Math.max(0, Math.ceil(p.respawnLeft)) : 0,
      autoAttack: p.autoAttack,
      facing: p.facing,
      party: this.partyView(p),
      inCombat: this.time <= p.inCombatUntil
    };
  }

  private partyView(p: SPlayer): SelfSnap["party"] {
    if (!p.partyId) return null;
    const party = this.parties.get(p.partyId);
    if (!party) return null;
    const members = [];
    for (const id of party.memberIds) {
      const m = this.players.get(id);
      if (!m) continue;
      members.push({
        id: m.id, name: m.data.name, level: m.data.level, classId: m.data.classId,
        hp: Math.ceil(m.hp), maxHp: m.data.derived.maxHp, zone: m.zone,
        online: true, leader: id === party.leaderId
      });
    }
    return { id: party.id, leader: party.leaderId, members };
  }

  private rarityColor(r: string): string {
    return ({ common: "#a8a49a", uncommon: "#79c46a", rare: "#5fa8e8", epic: "#c07ae8", legendary: "#f0a03c" } as Record<string, string>)[r] ?? "#a8a49a";
  }

  isTownSafe(zone: ZoneId, x: number, y: number): boolean {
    return zone === "world" && dist(x, y, WORLD_POIS.town.x, WORLD_POIS.town.y) < TOWN_SAFE;
  }

  // Facade methods used by simulation systems. Keeps cross-system calls going
  // through the world mediator instead of systems importing each other.

  killMob(p: SPlayer, mob: SMob): void {
    killMobSystem(this, p, mob);
  }

  grantXp(p: SPlayer, amount: number): void {
    grantExperience(this, p, amount);
  }

  addItem(p: SPlayer, item: Item, silent = false): boolean {
    return addItemSystem(this, p, item, silent);
  }

  onMobKill(p: SPlayer, mob: SMob): void {
    questKill(this, p, mob);
  }

  onCollect(p: SPlayer, baseId: string, qty: number): void {
    questCollect(this, p, baseId, qty);
  }

  refreshDialog(p: SPlayer): void {
    refreshDialogSystem(this, p);
  }

  private interact(p: SPlayer): void {
    if (p.dead) return;

    const ground = [...this.ground.values()].find(
      (g) => g.zone === p.zone && dist(p.x, p.y, g.x, g.y) <= 1.4
    );
    if (ground) {
      if (this.addItem(p, ground.item)) {
        this.ground.delete(ground.id);
        this.send(p, {
          t: "chat",
          msg: { channel: "loot", from: "", text: `You loot ${ground.item.name}${ground.item.qty > 1 ? ` ×${ground.item.qty}` : ""}.` }
        });
        this.sendFx(p.zone, p.x, p.y, { kind: "pickup", x: p.x, y: p.y, glyph: ground.item.glyph, color: "#e8d8a0" });
        this.sendData(p);
        this.persist(p);
      }
      return;
    }

    const portal = PORTALS.find((pt) => pt.zone === p.zone && dist(p.x, p.y, pt.x, pt.y) <= 2.5);
    if (portal) {
      this.teleport(p, portal.target, portal.tx, portal.ty);
      this.sendLog(p, `You step through the ${portal.name}.`, portal.color);
      return;
    }

    const shrine = SHRINES.find((s) => s.zone === p.zone && dist(p.x, p.y, s.x, s.y) <= 2.6);
    if (shrine) {
      p.data.respawn = { zone: shrine.zone, x: shrine.x, y: shrine.y };
      this.sendData(p);
      this.persist(p);
      this.sendLog(p, `${shrine.name} remembers you. Your return point is set.`, "#f0c674");
      this.sendToast(p, "RETURN POINT SET", "quest");
      this.sendFx(shrine.zone, shrine.x, shrine.y, { kind: "aura", x: shrine.x, y: shrine.y, color: "#f0c674", glyph: "☼" });
      return;
    }

    let nearestNpc: (typeof NPCS)[number] | undefined;
    let best = 3.8;
    for (const npc of NPCS) {
      if (npc.zone !== p.zone) continue;
      const d = dist(p.x, p.y, npc.x, npc.y);
      if (d < best) { best = d; nearestNpc = npc; }
    }
    if (nearestNpc) {
      if (nearestNpc.role === "healer") {
        p.hp = p.data.derived.maxHp;
        p.mp = p.data.derived.maxMp;
        this.sendFx(p.zone, p.x, p.y, { kind: "healBurst", x: p.x, y: p.y, color: "#8fe0a0", id: p.id });
        this.sendLog(p, "Sister Elowen tends your wounds. You are restored.", "#8fd0a0");
      }
      openNpcDialog(this, p, nearestNpc.id);
      return;
    }

    this.sendToast(p, "Nothing within reach.", "warn");
  }

  private teleport(p: SPlayer, zone: ZoneId, x: number, y: number): void {
    if (!isWalkable(getMap(zone), x, y)) return;
    const changed = p.zone !== zone;
    p.zone = zone;
    p.x = x;
    p.y = y;
    p.targetId = null;
    p.autoAttack = false;
    if (changed) {
      this.send(p, { t: "zone", zone, seed: WORLD_SEED, x, y, time: this.day });
      this.sendFx(zone, x, y, { kind: "teleport", x, y, color: "#9fd8f0" }, 20);
    }
    this.persist(p);
  }

  // __NEXT__
}
