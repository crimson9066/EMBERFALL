import type { Item, PlayerData, StatusEffect, ZoneId } from "../shared/types";

export interface SStatus extends StatusEffect {
  sourceId?: string;
  dps?: number;
  hps?: number;
  tickAt?: number;
}

export interface SPlayer {
  id: string;
  ws: import("ws").WebSocket;
  token: string;
  data: PlayerData;
  zone: ZoneId;
  x: number;
  y: number;
  hp: number;
  mp: number;
  stamina: number;
  facing: number;
  inputX: number;
  inputY: number;
  sprint: boolean;
  targetId: string | null;
  autoAttack: boolean;
  attackCd: number;
  hearthCd: number;
  cds: Map<string, number>;
  buffs: SStatus[];
  dead: boolean;
  respawnLeft: number;
  inCombatUntil: number;
  lastDamageAt: number;
  lastChatAt: number;
  partyId: string | null;
  dialogNpc: string | null;
  dirty: boolean;
  lastSave: number;
  joinedAt: number;
  sessionKills: number;
}

export interface SMob {
  id: string;
  defId: string;
  name: string;
  zone: ZoneId;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  homeRadius: number;
  level: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  aggro: number;
  range: number;
  attackInterval: number;
  xp: number;
  gold: number;
  state: "idle" | "chase" | "return" | "dead";
  targetId: string | null;
  attackCd: number;
  abilityCds: Record<string, number>;
  castingId: string | null;
  wanderX: number;
  wanderY: number;
  wanderCd: number;
  facing: number;
  buffs: SStatus[];
  elite: boolean;
  boss: boolean;
  rare: boolean;
  summoned: boolean;
  respawnAt: number;
  dead: boolean;
  spawnedAt: number;
}

export interface SProj {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  ownerIsPlayer: boolean;
  ttl: number;
  power: number;
  critChance: number;
  color: string;
  glyph: string;
  hitRadius: number;
  kind: "attack" | "ability" | "mob";
  abilityId?: string;
}

export interface SCast {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  radius: number;
  endsAt: number;
  color: string;
  glyph: string;
  name: string;
  kind: string;
  ownerId: string;
  ownerIsPlayer: boolean;
  power: number;
  critChance: number;
  angle: number;
  length: number;
  abilityId?: string;
}

export interface SZone {
  id: string;
  zone: ZoneId;
  x: number;
  y: number;
  radius: number;
  endsAt: number;
  ownerId: string;
  color: string;
  kind: string;
  nextTick: number;
  healAmount: number;
}

export interface Ground {
  id: string;
  item: Item;
  zone: ZoneId;
  x: number;
  y: number;
  spawnedAt: number;
  /** When set, this player cannot auto-collect the item until the lock expires. */
  ownerId?: string;
  lockUntil?: number;
}

export interface Party {
  id: string;
  leaderId: string;
  memberIds: Set<string>;
}

export interface SpawnGroup {
  zone: ZoneId;
  defId: string;
  count: number;
  level?: number;
  x: number;
  y: number;
  radius: number;
  respawn?: number;
}
