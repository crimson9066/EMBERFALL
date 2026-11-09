// ── Shared domain types for Emberfall ────────────────────────────────────────

export type ClassId = "vanguard" | "arcanist" | "warden" | "nightblade";
export type ZoneId = "world" | "crypt";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type ItemSlot = "weapon" | "armor" | "trinket";

export interface StatBlock {
  str: number;
  agi: number;
  int: number;
  vit: number;
}

export interface ItemStats extends Partial<StatBlock> {
  armor?: number;
  attack?: number;
  spell?: number;
  crit?: number;
  haste?: number;
  lifesteal?: number;
  hp?: number;
  mp?: number;
}

export interface Item {
  uid: string;
  baseId: string;
  name: string;
  rarity: Rarity;
  ilvl: number;
  qty: number;
  slot?: ItemSlot;
  stats?: ItemStats;
  value: number;
  glyph: string;
  desc?: string;
  consumable?: { hp?: number; mp?: number; teleport?: boolean; cooldown?: number };
  stackable?: boolean;
}

export interface Derived {
  maxHp: number;
  maxMp: number;
  maxStamina: number;
  attack: number;
  spell: number;
  armor: number;
  crit: number;
  haste: number;
  lifesteal: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  kind: "buff" | "debuff" | "dot" | "hot" | "stun" | "root" | "slow" | "shield";
  value: number;
  remaining: number;
  glyph: string;
  color: string;
}

export interface QuestObjective {
  type: "kill" | "collect" | "boss" | "visit";
  target: string;
  count: number;
  label: string;
}

export interface QuestDef {
  id: string;
  name: string;
  giver: string;
  level: number;
  text: string;
  completeText: string;
  objectives: QuestObjective[];
  rewards: { xp: number; gold: number; items?: string[] };
  requires?: string;
  repeatable?: boolean;
}

export interface QuestState {
  id: string;
  progress: number[];
  state: "active" | "done";
}

export interface PlayerData {
  name: string;
  classId: ClassId;
  level: number;
  xp: number;
  xpNext: number;
  gold: number;
  stats: StatBlock;
  derived: Derived;
  equipment: Record<ItemSlot, Item | null>;
  inventory: Item[];
  quests: QuestState[];
  learned: string[];
  kills: number;
  deaths: number;
  completed: string[];
  createdAt: number;
  playTime: number;
  respawn: { zone: ZoneId; x: number; y: number };
}

export interface PartyMemberView {
  id: string;
  name: string;
  level: number;
  classId: ClassId;
  hp: number;
  maxHp: number;
  zone: ZoneId;
  online: boolean;
  leader: boolean;
}

export interface PartyView {
  id: string;
  leader: string;
  members: PartyMemberView[];
}

export interface CooldownView {
  id: string;
  remain: number;
  max: number;
}

export interface SelfSnap {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
  xp: number;
  xpNext: number;
  gold: number;
  zone: ZoneId;
  targetId: string | null;
  cds: CooldownView[];
  buffs: StatusEffect[];
  dead: boolean;
  respawnIn: number;
  autoAttack: boolean;
  facing: number;
  party: PartyView | null;
  inCombat: boolean;
}

export interface EntSnap {
  id: string;
  kind: "player" | "mob" | "npc" | "portal";
  name: string;
  glyph: string;
  color: string;
  x: number;
  y: number;
  level?: number;
  hp?: number;
  maxHp?: number;
  facing?: number;
  rare?: boolean;
  elite?: boolean;
  boss?: boolean;
  role?: string;
  className?: string;
  title?: string;
  dead?: boolean;
}

export interface GroundItemSnap {
  id: string;
  name: string;
  glyph: string;
  color: string;
  x: number;
  y: number;
  qty: number;
  rarity: Rarity;
}

export interface ProjectileSnap {
  id: string;
  x: number;
  y: number;
  glyph: string;
  color: string;
  trail?: string;
}

export interface CastSnap {
  id: string;
  x: number;
  y: number;
  radius: number;
  remain: number;
  color: string;
  name: string;
  kind: string;
  angle?: number;
  length?: number;
}

export interface ZoneSnap {
  id: string;
  x: number;
  y: number;
  radius: number;
  remain: number;
  color: string;
  kind: string;
}

export interface Snapshot {
  t: "snapshot";
  now: number;
  time: number;
  weather: string;
  zone: ZoneId;
  players: EntSnap[];
  mobs: EntSnap[];
  npcs: EntSnap[];
  items: GroundItemSnap[];
  projectiles: ProjectileSnap[];
  casts: CastSnap[];
  zones: ZoneSnap[];
  self: SelfSnap;
}

export interface Fx {
  kind: string;
  x: number;
  y: number;
  amount?: number;
  crit?: boolean;
  color?: string;
  glyph?: string;
  text?: string;
  radius?: number;
  id?: string;
  dur?: number;
  angle?: number;
  length?: number;
}

export type ChatChannel = "say" | "yell" | "world" | "party" | "whisper" | "system" | "loot" | "combat";

export interface ChatMsg {
  channel: ChatChannel;
  from: string;
  text: string;
  color?: string;
  senderId?: string;
}

export interface DialogData {
  npcId: string;
  npcName: string;
  npcTitle: string;
  text: string;
  kind: "quest" | "vendor" | "healer" | "lore" | "portal" | "shrine";
  quests?: { id: string; state: "offer" | "active" | "done" }[];
  buy?: { id: string; name: string; price: number; desc: string; glyph: string; color: string }[];
}

export type ClientMsg =
  | { t: "auth"; name: string; classId: ClassId; token?: string }
  | { t: "input"; mx: number; my: number; sprint: boolean }
  | { t: "select"; id: string | null }
  | { t: "cast"; slot: number; aimX: number; aimY: number }
  | { t: "auto" }
  | { t: "quaff"; kind: "hp" | "mp" }
  | { t: "interact" }
  | { t: "respawn" }
  | { t: "chat"; text: string }
  | { t: "inv"; action: "use" | "equip" | "unequip" | "drop" | "sell"; uid: string }
  | { t: "vendor"; action: "buy"; id: string; qty: number }
  | { t: "quest"; action: "accept" | "turnin"; id: string }
  | { t: "party"; action: "invite" | "accept" | "leave"; name?: string }
  | { t: "emote"; name: string }
  | { t: "ping"; at: number };

export type ServerMsg =
  | {
      t: "welcome";
      token: string;
      data: PlayerData;
      zone: ZoneId;
      seed: number;
      time: number;
      online: number;
      self: SelfSnap;
    }
  | { t: "snapshot"; snap: Snapshot }
  | { t: "playerData"; data: PlayerData }
  | { t: "chat"; msg: ChatMsg }
  | { t: "log"; text: string; color?: string }
  | { t: "toast"; text: string; kind?: string }
  | { t: "fx"; fx: Fx }
  | { t: "dialog"; dialog: DialogData }
  | { t: "death"; respawnIn: number }
  | { t: "levelup"; level: number; learned: string[] }
  | { t: "zone"; zone: ZoneId; seed: number; x: number; y: number; time: number }
  | { t: "error"; message: string }
  | { t: "online"; count: number }
  | { t: "pong"; at: number };

export interface Vec2 {
  x: number;
  y: number;
}
