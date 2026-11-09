import type {
  ClassId,
  Item,
  ItemSlot,
  ItemStats,
  QuestDef,
  Rarity,
  StatBlock,
  ZoneId
} from "./types";

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#a8a49a",
  uncommon: "#79c46a",
  rare: "#5fa8e8",
  epic: "#c07ae8",
  legendary: "#f0a03c"
};

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60,
  uncommon: 26,
  rare: 10,
  epic: 3.4,
  legendary: 0.6
};

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  glyph: string;
  color: string;
  blurb: string;
  lore: string;
  hp: number;
  mp: number;
  stamina: number;
  stats: StatBlock;
  growth: StatBlock;
  weapon: string;
  basic: { name: string; range: number; speed: number; glyph: string; projectile?: boolean; color: string };
  startingKit: string[];
}

export const CLASSES: Record<ClassId, ClassDef> = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    title: "Ironclad Bulwark",
    glyph: "@",
    color: "#e0a84e",
    blurb: "A wall of steel. Cleaves packs, shrugs off blows, and holds the line.",
    lore: "Oathbound soldiers of the old Hearthguard. The last wall between the Reach and the ash.",
    hp: 150,
    mp: 48,
    stamina: 110,
    stats: { str: 12, agi: 7, int: 3, vit: 12 },
    growth: { str: 2, agi: 1, int: 0, vit: 2 },
    weapon: "warblade",
    basic: { name: "Warblade", range: 1.75, speed: 1.05, glyph: "†", color: "#f0d090" },
    startingKit: ["potion_minor", "potion_minor", "hearthstone"]
  },
  arcanist: {
    id: "arcanist",
    name: "Arcanist",
    title: "Ember Scholar",
    glyph: "@",
    color: "#6fb7e8",
    blurb: "Glass and glory. Rains fire from afar, freezes crowds, and blinks out of danger.",
    lore: "Academy exiles who read the sky like a spellbook. Their embers still remember the first fire.",
    hp: 92,
    mp: 145,
    stamina: 90,
    stats: { str: 3, agi: 6, int: 14, vit: 6 },
    growth: { str: 0, agi: 1, int: 2, vit: 1 },
    weapon: "runestaff",
    basic: { name: "Ember Dart", range: 7, speed: 1.25, glyph: "✧", projectile: true, color: "#8fd0ff" },
    startingKit: ["tonic_mana", "potion_minor", "hearthstone"]
  },
  warden: {
    id: "warden",
    name: "Warden",
    title: "Voice of the Grove",
    glyph: "@",
    color: "#8fcf7a",
    blurb: "The forest answers. Mends wounds, roots foes, and blooms a sanctuary underfoot.",
    lore: "Keepers of seed and root, sworn to the green places that survived the Cinderfall.",
    hp: 118,
    mp: 100,
    stamina: 100,
    stats: { str: 8, agi: 8, int: 9, vit: 10 },
    growth: { str: 1, agi: 1, int: 1, vit: 2 },
    weapon: "thornstaff",
    basic: { name: "Thornwhip", range: 4, speed: 1.15, glyph: "⌁", projectile: true, color: "#a8e08a" },
    startingKit: ["potion_minor", "tonic_mana", "hearthstone"]
  },
  nightblade: {
    id: "nightblade",
    name: "Nightblade",
    title: "Whisper in the Dark",
    glyph: "@",
    color: "#d078c0",
    blurb: "First blood decides the fight. Strike from shadow, poison the wound, vanish.",
    lore: "Knife-work and old debts. The Nightblades sell silence to anyone with coin — or cause.",
    hp: 105,
    mp: 72,
    stamina: 115,
    stats: { str: 10, agi: 13, int: 5, vit: 7 },
    growth: { str: 1, agi: 2, int: 0, vit: 1 },
    weapon: "moonfang",
    basic: { name: "Moonfang", range: 1.7, speed: 0.8, glyph: "†", color: "#e8b0e0" },
    startingKit: ["potion_minor", "potion_minor", "hearthstone"]
  }
};

export interface AbilityDef {
  id: string;
  name: string;
  classId: ClassId;
  unlock: number;
  cost: number;
  cooldown: number;
  range: number;
  targeting: "enemy" | "point" | "self" | "ally";
  glyph: string;
  color: string;
  desc: string;
  damage?: number;
  heal?: number;
  radius?: number;
  cone?: number;
  duration?: number;
  projectile?: boolean;
  castTime?: number;
  school: "physical" | "fire" | "frost" | "nature" | "shadow" | "holy";
}

const ABILITY_LIST: AbilityDef[] = [
  // Vanguard
  {
    id: "cleave", name: "Cleave", classId: "vanguard", unlock: 1, cost: 8, cooldown: 3, range: 2.4,
    targeting: "point", glyph: "╱", color: "#e0a84e", desc: "A wide sweep that strikes every foe in a cone for 95% attack damage.",
    damage: 0.95, radius: 2.4, cone: 1.9, school: "physical"
  },
  {
    id: "shield_bash", name: "Shield Bash", classId: "vanguard", unlock: 2, cost: 14, cooldown: 8, range: 1.8,
    targeting: "enemy", glyph: "◙", color: "#e0c070", desc: "Slam a target for 70% attack damage and stun it for 1.2s.",
    damage: 0.7, duration: 1.2, school: "physical"
  },
  {
    id: "rally", name: "Rally", classId: "vanguard", unlock: 4, cost: 20, cooldown: 18, range: 0,
    targeting: "self", glyph: "⚑", color: "#f0c674", desc: "Plant the banner. Gain 30% attack power and 20% armor for 8s.",
    duration: 8, school: "holy"
  },
  {
    id: "whirlwind", name: "Whirlwind", classId: "vanguard", unlock: 6, cost: 24, cooldown: 9, range: 0,
    targeting: "self", glyph: "↻", color: "#d8b46a", desc: "Spin steel in a 2.6 tile radius, dealing 115% attack damage to all foes.",
    damage: 1.15, radius: 2.6, school: "physical"
  },
  {
    id: "charge", name: "Charge", classId: "vanguard", unlock: 8, cost: 20, cooldown: 12, range: 5.5,
    targeting: "point", glyph: "»", color: "#e8b870", desc: "Rush toward the marked ground, crushing foes along the path for 85% damage.",
    damage: 0.85, radius: 1.6, school: "physical"
  },
  {
    id: "ironclad", name: "Ironclad", classId: "vanguard", unlock: 10, cost: 30, cooldown: 26, range: 0,
    targeting: "self", glyph: "▣", color: "#c8d0d8", desc: "Harden your plate: absorb damage and gain 45% armor for 8s.",
    duration: 8, school: "physical"
  },
  // Arcanist
  {
    id: "emberbolt", name: "Emberbolt", classId: "arcanist", unlock: 1, cost: 10, cooldown: 1.2, range: 9,
    targeting: "enemy", glyph: "✦", color: "#ff9a5a", desc: "Hurl a bolt of living flame for 115% spell power.",
    damage: 1.15, projectile: true, school: "fire"
  },
  {
    id: "frost_nova", name: "Frost Nova", classId: "arcanist", unlock: 2, cost: 18, cooldown: 7, range: 8,
    targeting: "point", glyph: "❄", color: "#9fd8f0", desc: "Burst frost at a point. Deals 80% spell damage and slows foes 45% for 3s.",
    damage: 0.8, radius: 2.5, duration: 3, school: "frost"
  },
  {
    id: "arcane_barrage", name: "Arcane Barrage", classId: "arcanist", unlock: 4, cost: 24, cooldown: 8, range: 9,
    targeting: "enemy", glyph: "⋆", color: "#b08cf0", desc: "Loose three arcane motes, each dealing 50% spell damage.",
    damage: 0.5, projectile: true, school: "frost"
  },
  {
    id: "blink", name: "Blink", classId: "arcanist", unlock: 6, cost: 16, cooldown: 10, range: 5.5,
    targeting: "point", glyph: "⌁", color: "#8fd0ff", desc: "Step through the veil up to 5.5 tiles toward the mark.",
    school: "frost"
  },
  {
    id: "meteor", name: "Meteor", classId: "arcanist", unlock: 8, cost: 35, cooldown: 22, range: 10,
    targeting: "point", glyph: "☄", color: "#ff7a3c", desc: "Call a burning star. After 1.6s it crashes for 270% spell damage in a 3 tile radius.",
    damage: 2.7, radius: 3, castTime: 1.6, school: "fire"
  },
  {
    id: "mana_shield", name: "Mana Shield", classId: "arcanist", unlock: 10, cost: 25, cooldown: 30, range: 0,
    targeting: "self", glyph: "◈", color: "#8fc4f0", desc: "Weave a shield that absorbs damage for 10s.",
    duration: 10, school: "frost"
  },
  // Warden
  {
    id: "thornlash", name: "Thornlash", classId: "warden", unlock: 1, cost: 9, cooldown: 2.5, range: 5,
    targeting: "enemy", glyph: "⌁", color: "#8fcf7a", desc: "Lash a foe with bramble for 100% spell damage and heal yourself for a little.",
    damage: 1.0, heal: 0.25, school: "nature"
  },
  {
    id: "rejuvenate", name: "Rejuvenate", classId: "warden", unlock: 2, cost: 20, cooldown: 8, range: 7,
    targeting: "ally", glyph: "✚", color: "#9fe08a", desc: "Restore a burst of health to yourself or a chosen ally.",
    heal: 1.6, school: "nature"
  },
  {
    id: "entangle", name: "Entangle", classId: "warden", unlock: 4, cost: 18, cooldown: 11, range: 8,
    targeting: "point", glyph: "❦", color: "#7fbf6a", desc: "Roots erupt at a point, dealing 45% damage and rooting foes for 2s.",
    damage: 0.45, radius: 2.2, duration: 2, school: "nature"
  },
  {
    id: "sanctuary", name: "Sanctuary", classId: "warden", unlock: 6, cost: 28, cooldown: 18, range: 6,
    targeting: "point", glyph: "☘", color: "#8fe0a0", desc: "Consecrate the ground, healing allies inside for 6s.",
    heal: 0.55, radius: 3, duration: 6, school: "nature"
  },
  {
    id: "bark_skin", name: "Bark Skin", classId: "warden", unlock: 8, cost: 22, cooldown: 20, range: 0,
    targeting: "self", glyph: "♣", color: "#b0a070", desc: "Your hide hardens, granting 55% armor and regeneration for 8s.",
    duration: 8, school: "nature"
  },
  {
    id: "wrath_grove", name: "Wrath of the Grove", classId: "warden", unlock: 10, cost: 35, cooldown: 24, range: 0,
    targeting: "self", glyph: "♠", color: "#70d890", desc: "The grove answers: 150% damage in a 3.2 tile radius and a burst of healing.",
    damage: 1.5, heal: 0.8, radius: 3.2, school: "nature"
  },
  // Nightblade
  {
    id: "backstab", name: "Backstab", classId: "nightblade", unlock: 1, cost: 8, cooldown: 2.5, range: 1.8,
    targeting: "enemy", glyph: "†", color: "#d078c0", desc: "A vicious strike for 130% damage. Deals 220% when striking from behind.",
    damage: 1.3, school: "shadow"
  },
  {
    id: "venom", name: "Venom", classId: "nightblade", unlock: 2, cost: 12, cooldown: 6, range: 3,
    targeting: "enemy", glyph: "☠", color: "#90c060", desc: "Coat the wound with venom: 60% damage now and bleeding over 8s.",
    damage: 0.6, duration: 8, school: "shadow"
  },
  {
    id: "shadowstep", name: "Shadowstep", classId: "nightblade", unlock: 4, cost: 18, cooldown: 9, range: 8,
    targeting: "enemy", glyph: "➤", color: "#b080d8", desc: "Slip behind a target within 8 tiles and strike for 70% damage.",
    damage: 0.7, school: "shadow"
  },
  {
    id: "fan_knives", name: "Fan of Knives", classId: "nightblade", unlock: 6, cost: 20, cooldown: 7, range: 2.8,
    targeting: "point", glyph: "✳", color: "#e0a0d8", desc: "Throw a fan of blades, striking all foes in a wide cone for 90% damage.",
    damage: 0.9, radius: 2.8, cone: 2.4, school: "physical"
  },
  {
    id: "smoke_bomb", name: "Smoke Bomb", classId: "nightblade", unlock: 8, cost: 20, cooldown: 20, range: 0,
    targeting: "self", glyph: "◌", color: "#a0a0b8", desc: "Vanish in smoke: 50% evasion for 5s. Nearby foes are slowed.",
    duration: 5, radius: 2.5, school: "shadow"
  },
  {
    id: "assassinate", name: "Assassinate", classId: "nightblade", unlock: 10, cost: 30, cooldown: 20, range: 2,
    targeting: "enemy", glyph: "☠", color: "#ff6a8a", desc: "Finish the weak: 300% damage to targets below 30% health, otherwise 120%.",
    damage: 1.2, school: "shadow"
  }
];

export const ABILITIES: Record<string, AbilityDef> = Object.fromEntries(
  ABILITY_LIST.map((a) => [a.id, a])
);

export function classAbilities(classId: ClassId): AbilityDef[] {
  return ABILITY_LIST.filter((a) => a.classId === classId);
}

export interface ItemBase {
  id: string;
  name: string;
  glyph: string;
  desc: string;
  value: number;
  stackable?: boolean;
  consumable?: { hp?: number; mp?: number; teleport?: boolean };
}

export const ITEM_BASES: Record<string, ItemBase> = {
  potion_minor: { id: "potion_minor", name: "Minor Healing Draught", glyph: "!", value: 12, stackable: true, consumable: { hp: 55 }, desc: "Tastes of pine tar and stubbornness. Restores 55 health." },
  potion_heal: { id: "potion_heal", name: "Healing Draught", glyph: "!", value: 30, stackable: true, consumable: { hp: 140 }, desc: "Restores 140 health." },
  potion_great: { id: "potion_great", name: "Greater Elixir", glyph: "!", value: 78, stackable: true, consumable: { hp: 360 }, desc: "Restores 360 health." },
  tonic_mana: { id: "tonic_mana", name: "Mana Tonic", glyph: "¡", value: 22, stackable: true, consumable: { mp: 60 }, desc: "A cold blue draught. Restores 60 mana." },
  tonic_mana_great: { id: "tonic_mana_great", name: "Greater Tonic", glyph: "¡", value: 58, stackable: true, consumable: { mp: 150 }, desc: "Restores 150 mana." },
  hearthstone: { id: "hearthstone", name: "Hearthstone", glyph: "○", value: 40, stackable: true, consumable: { teleport: true }, desc: "A warm river stone. Returns you to Hearthvale. 60s cooldown." },
  glowcap: { id: "glowcap", name: "Glowcap", glyph: "♠", value: 9, stackable: true, desc: "A pale mushroom that glows faintly. Alchemists pay well." },
  wolf_pelt: { id: "wolf_pelt", name: "Wolf Pelt", glyph: "▓", value: 7, stackable: true, desc: "Thick grey fur, still warm." },
  spider_silk: { id: "spider_silk", name: "Spider Silk", glyph: "≈", value: 8, stackable: true, desc: "Strong, sticky, and unpleasant to carry." },
  ash_shard: { id: "ash_shard", name: "Ashen Shard", glyph: "◆", value: 18, stackable: true, desc: "A sliver of glassed stone. It hums when the wind blows." },
  bone_fragment: { id: "bone_fragment", name: "Bone Fragment", glyph: "†", value: 6, stackable: true, desc: "Old bone, older grief." },
  cinder_core: { id: "cinder_core", name: "Cinder Core", glyph: "✹", value: 120, stackable: true, desc: "The still-beating heart of something that should have stayed dead." }
};

export const GEAR_BASES: { id: string; name: string; slot: ItemSlot; glyph: string; bias: "str" | "agi" | "int" | "vit" | "none" }[] = [
  { id: "w_blade", name: "Warblade", slot: "weapon", glyph: "†", bias: "str" },
  { id: "w_axe", name: "Battleaxe", slot: "weapon", glyph: "⚒", bias: "str" },
  { id: "w_staff", name: "Runestaff", slot: "weapon", glyph: "⌁", bias: "int" },
  { id: "w_dagger", name: "Moonshard Dagger", slot: "weapon", glyph: "†", bias: "agi" },
  { id: "w_bow", name: "Yew Longbow", slot: "weapon", glyph: ")", bias: "agi" },
  { id: "a_plate", name: "Riveted Plate", slot: "armor", glyph: "▣", bias: "vit" },
  { id: "a_leather", name: "Trail Leathers", slot: "armor", glyph: "▤", bias: "agi" },
  { id: "a_robe", name: "Woven Robe", slot: "armor", glyph: "▥", bias: "int" },
  { id: "t_ring", name: "Signet Ring", slot: "trinket", glyph: "◉", bias: "none" },
  { id: "t_amulet", name: "Ash Amulet", slot: "trinket", glyph: "◈", bias: "none" }
];

const PREFIXES = ["Stalwart", "Runed", "Feral", "Vital", "Gloomforged", "Sunwrought", "Bramble", "Cinder", "Frostbound", "Whispering"];

const AFFIX_POOL: (keyof ItemStats)[] = ["str", "agi", "int", "vit", "armor", "crit", "haste", "lifesteal", "hp", "mp"];

export function rollRarity(luck = 0): Rarity {
  const r = Math.random() * 100 + luck;
  let acc = 0;
  for (const rarity of RARITY_ORDER) {
    acc += RARITY_WEIGHT[rarity];
    if (r <= acc) return rarity;
  }
  return "common";
}

export function generateItem(ilvl: number, rng: () => number, uid: string, opts?: { slot?: ItemSlot; rarity?: Rarity; forceBase?: string }): Item {
  const rarity = opts?.rarity ?? rollRarity(0);
  const slot = opts?.slot ?? (["weapon", "armor", "trinket"] as ItemSlot[])[Math.floor(rng() * 3)];
  const bases = GEAR_BASES.filter((b) => b.slot === slot && (!opts?.forceBase || b.id === opts.forceBase));
  const base = bases[Math.floor(rng() * bases.length)] ?? GEAR_BASES[0];
  const rIdx = RARITY_ORDER.indexOf(rarity);
  const mult = [1, 1.3, 1.7, 2.2, 2.9][rIdx];
  const stats: ItemStats = {};
  const power = Math.max(1, ilvl);
  if (slot === "weapon") {
    if (base.bias === "int") stats.spell = Math.round((3 + power * 2.2) * mult);
    else stats.attack = Math.round((3 + power * 2.2) * mult);
  } else {
    stats.armor = Math.round((2 + power * 2.4) * mult);
  }
  const affixCount = [0, 1, 2, 3, 4][rIdx];
  const used = new Set<string>();
  for (let i = 0; i < affixCount; i++) {
    let key = AFFIX_POOL[Math.floor(rng() * AFFIX_POOL.length)];
    if (used.has(key)) key = AFFIX_POOL[Math.floor(rng() * AFFIX_POOL.length)];
    used.add(key);
    const scale = (1 + power * 0.35) * mult;
    switch (key) {
      case "str": case "agi": case "int": case "vit":
        stats[key] = (stats[key] ?? 0) + Math.max(1, Math.round(1 + power * 0.18 * mult));
        break;
      case "armor": stats.armor = (stats.armor ?? 0) + Math.round(2 + power * 0.8); break;
      case "crit": stats.crit = (stats.crit ?? 0) + Math.round(1 + mult); break;
      case "haste": stats.haste = (stats.haste ?? 0) + Math.round(1 + mult); break;
      case "lifesteal": stats.lifesteal = (stats.lifesteal ?? 0) + Math.round(1 + mult * 0.7); break;
      case "hp": stats.hp = (stats.hp ?? 0) + Math.round(6 + power * 2.2 * mult); break;
      case "mp": stats.mp = (stats.mp ?? 0) + Math.round(4 + power * 1.5 * mult); break;
      default: break;
    }
    void scale;
  }
  const prefix = PREFIXES[Math.floor(rng() * PREFIXES.length)];
  const name = rarity === "common" ? base.name : `${prefix} ${base.name}`;
  return {
    uid,
    baseId: base.id,
    name,
    rarity,
    ilvl,
    qty: 1,
    slot,
    stats,
    value: Math.round((12 + power * 8) * (1 + rIdx * 0.65)),
    glyph: base.glyph
  };
}

export function makeConsumable(baseId: string, qty = 1): Item {
  const b = ITEM_BASES[baseId];
  return {
    uid: `stack_${baseId}`,
    baseId,
    name: b.name,
    rarity: "common",
    ilvl: 1,
    qty,
    value: b.value,
    glyph: b.glyph,
    desc: b.desc,
    consumable: b.consumable,
    stackable: true
  };
}

export function makeStarterGear(classId: ClassId): Item {
  const def = CLASSES[classId];
  const isCaster = classId === "arcanist" || classId === "warden";
  const stats: ItemStats = isCaster
    ? { spell: 6, int: 2 }
    : { attack: 6, str: classId === "nightblade" ? 1 : 2, agi: classId === "nightblade" ? 2 : 0 };
  return {
    uid: `starter_${classId}`,
    baseId: `starter_${classId}`,
    name: def.weapon === "warblade" ? "Hearthguard Warblade" : def.weapon === "runestaff" ? "Academy Runestaff" : def.weapon === "thornstaff" ? "Grovebound Staff" : "Moonfang Knife",
    rarity: "uncommon",
    ilvl: 1,
    qty: 1,
    slot: "weapon",
    stats,
    value: 24,
    glyph: isCaster ? "⌁" : "†",
    desc: "Well-worn, but it remembers your hand."
  };
}

// ── Enemies ─────────────────────────────────────────────────────────────────

export interface MobAbilityDef {
  id: string;
  name: string;
  kind: "slam" | "volley" | "summon" | "beam" | "wave";
  cooldown: number;
  radius: number;
  damage: number;
  telegraph: number;
  color: string;
  glyph: string;
}

export interface MobDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  level: number;
  hp: number;
  damage: number;
  speed: number;
  aggro: number;
  range: number;
  attackInterval: number;
  xp: number;
  gold: number;
  tags: string[];
  projectile?: boolean;
  boss?: boolean;
  elite?: boolean;
  loot: { id: string; chance: number; qty?: number }[];
  gearChance?: number;
  abilities: MobAbilityDef[];
}

export const MOBS: Record<string, MobDef> = {
  meadow_wolf: {
    id: "meadow_wolf", name: "Meadow Wolf", glyph: "r", color: "#b8b09a", level: 2, hp: 46, damage: 6, speed: 2.5,
    aggro: 8, range: 1.6, attackInterval: 1.4, xp: 14, gold: 4, tags: ["beast", "wolf"],
    loot: [{ id: "wolf_pelt", chance: 0.42 }],
    abilities: [{ id: "pounce", name: "Pounce", kind: "slam", cooldown: 7, radius: 1.8, damage: 9, telegraph: 0.9, color: "#d0a060", glyph: "✳" }]
  },
  forest_spider: {
    id: "forest_spider", name: "Gloomweaver", glyph: "x", color: "#8a9a78", level: 3, hp: 58, damage: 7, speed: 2.2,
    aggro: 7, range: 1.5, attackInterval: 1.2, xp: 17, gold: 5, tags: ["beast", "spider"],
    loot: [{ id: "spider_silk", chance: 0.5 }, { id: "glowcap", chance: 0.18 }],
    abilities: [{ id: "web", name: "Web", kind: "slam", cooldown: 8, radius: 2.2, damage: 4, telegraph: 1.0, color: "#b0c8a0", glyph: "≈" }]
  },
  bandit: {
    id: "bandit", name: "Reach Bandit", glyph: "b", color: "#d08060", level: 4, hp: 82, damage: 9, speed: 2.3,
    aggro: 9, range: 1.7, attackInterval: 1.25, xp: 24, gold: 10, tags: ["humanoid", "bandit"],
    loot: [{ id: "potion_minor", chance: 0.15 }], gearChance: 0.07,
    abilities: [{ id: "dirty_blow", name: "Dirty Blow", kind: "beam", cooldown: 9, radius: 0.8, damage: 15, telegraph: 0.85, color: "#e08050", glyph: "→" }]
  },
  goblin: {
    id: "goblin", name: "Mire Goblin", glyph: "g", color: "#a8b060", level: 5, hp: 92, damage: 10, speed: 2.4,
    aggro: 9, range: 1.6, attackInterval: 1.2, xp: 28, gold: 11, tags: ["humanoid", "goblin"],
    loot: [{ id: "glowcap", chance: 0.32 }, { id: "potion_minor", chance: 0.1 }], gearChance: 0.08,
    abilities: [{ id: "mire_toss", name: "Mire Toss", kind: "slam", cooldown: 8, radius: 2, damage: 13, telegraph: 1, color: "#8fbf6a", glyph: "●" }]
  },
  bog_lurker: {
    id: "bog_lurker", name: "Bog Lurker", glyph: "L", color: "#6f9a70", level: 6, hp: 135, damage: 13, speed: 1.6,
    aggro: 7, range: 1.8, attackInterval: 1.6, xp: 38, gold: 13, tags: ["beast", "bog"],
    loot: [{ id: "glowcap", chance: 0.65 }, { id: "spider_silk", chance: 0.22 }], gearChance: 0.09,
    abilities: [{ id: "mire_grasp", name: "Mire Grasp", kind: "slam", cooldown: 10, radius: 2.4, damage: 18, telegraph: 1.2, color: "#80c080", glyph: "❦" }]
  },
  skeleton: {
    id: "skeleton", name: "Crypt Skeleton", glyph: "s", color: "#c8c4b0", level: 7, hp: 115, damage: 12, speed: 2.2,
    aggro: 8, range: 1.6, attackInterval: 1.2, xp: 34, gold: 9, tags: ["undead", "skeleton"],
    loot: [{ id: "bone_fragment", chance: 0.55 }], gearChance: 0.1,
    abilities: [{ id: "bone_cleave", name: "Bone Cleave", kind: "slam", cooldown: 7, radius: 2, damage: 18, telegraph: 1, color: "#e0d8b0", glyph: "╱" }]
  },
  ghoul: {
    id: "ghoul", name: "Rotting Ghoul", glyph: "z", color: "#90a080", level: 8, hp: 155, damage: 15, speed: 2.1,
    aggro: 9, range: 1.7, attackInterval: 1.3, xp: 42, gold: 12, tags: ["undead", "ghoul"],
    loot: [{ id: "bone_fragment", chance: 0.6 }, { id: "potion_minor", chance: 0.12 }], gearChance: 0.1,
    abilities: [{ id: "rot_burst", name: "Rot Burst", kind: "slam", cooldown: 9, radius: 2.2, damage: 22, telegraph: 1.1, color: "#8fb060", glyph: "☠" }]
  },
  ember_imp: {
    id: "ember_imp", name: "Ember Imp", glyph: "i", color: "#ff8a50", level: 8, hp: 96, damage: 14, speed: 2.7,
    aggro: 10, range: 6, attackInterval: 1.4, xp: 44, gold: 14, tags: ["demon", "fire"], projectile: true,
    loot: [{ id: "ash_shard", chance: 0.5 }], gearChance: 0.08,
    abilities: [{ id: "fire_volley", name: "Cinder Volley", kind: "volley", cooldown: 10, radius: 1, damage: 12, telegraph: 1, color: "#ff7a3c", glyph: "✹" }]
  },
  frost_wraith: {
    id: "frost_wraith", name: "Frost Wraith", glyph: "w", color: "#a0d0e8", level: 9, hp: 128, damage: 16, speed: 2.4,
    aggro: 10, range: 7, attackInterval: 1.5, xp: 50, gold: 15, tags: ["undead", "ice"], projectile: true,
    loot: [{ id: "ash_shard", chance: 0.2 }, { id: "tonic_mana", chance: 0.15 }], gearChance: 0.1,
    abilities: [{ id: "frost_ring", name: "Frost Ring", kind: "volley", cooldown: 9, radius: 1, damage: 14, telegraph: 1.1, color: "#9fd8f0", glyph: "❄" }]
  },
  stone_golem: {
    id: "stone_golem", name: "Ashen Golem", glyph: "G", color: "#9a8f80", level: 11, hp: 340, damage: 24, speed: 1.5,
    aggro: 8, range: 2, attackInterval: 1.8, xp: 110, gold: 34, tags: ["construct", "elite"], elite: true,
    loot: [{ id: "ash_shard", chance: 1, qty: 2 }, { id: "potion_great", chance: 0.25 }], gearChance: 0.45,
    abilities: [{ id: "ground_slam", name: "Ground Slam", kind: "slam", cooldown: 8, radius: 3, damage: 36, telegraph: 1.3, color: "#d0a060", glyph: "◎" }]
  },
  crypt_guardian: {
    id: "crypt_guardian", name: "Crypt Guardian", glyph: "C", color: "#c0b890", level: 12, hp: 390, damage: 26, speed: 1.9,
    aggro: 10, range: 2, attackInterval: 1.6, xp: 135, gold: 40, tags: ["undead", "elite"], elite: true,
    loot: [{ id: "bone_fragment", chance: 1, qty: 2 }, { id: "potion_great", chance: 0.3 }], gearChance: 0.5,
    abilities: [{ id: "grave_wave", name: "Grave Wave", kind: "volley", cooldown: 9, radius: 1.2, damage: 28, telegraph: 1.3, color: "#b0d0c0", glyph: "❄" }]
  },
  frost_troll: {
    id: "frost_troll", name: "Frostfen Troll", glyph: "T", color: "#a8c8d8", level: 13, hp: 520, damage: 30, speed: 1.8,
    aggro: 10, range: 2.2, attackInterval: 1.8, xp: 180, gold: 55, tags: ["giant", "elite"], elite: true,
    loot: [{ id: "potion_great", chance: 0.45 }, { id: "ash_shard", chance: 0.5 }], gearChance: 0.6,
    abilities: [
      { id: "ice_roar", name: "Ice Roar", kind: "volley", cooldown: 10, radius: 1.1, damage: 24, telegraph: 1.2, color: "#b0e0f0", glyph: "❄" },
      { id: "troll_smash", name: "Troll Smash", kind: "slam", cooldown: 7, radius: 2.6, damage: 42, telegraph: 1.4, color: "#d0e8f0", glyph: "◎" }
    ]
  },
  cinder_king: {
    id: "cinder_king", name: "The Cinder King", glyph: "K", color: "#ff6a3c", level: 14, hp: 1800, damage: 34, speed: 1.7,
    aggro: 14, range: 2.6, attackInterval: 1.7, xp: 900, gold: 350, tags: ["undead", "boss"], boss: true,
    loot: [{ id: "cinder_core", chance: 1, qty: 2 }, { id: "potion_great", chance: 1, qty: 2 }], gearChance: 1,
    abilities: [
      { id: "throne_slam", name: "Throne Slam", kind: "slam", cooldown: 7, radius: 3.4, damage: 48, telegraph: 1.35, color: "#ff8a3c", glyph: "◎" },
      { id: "ember_ring", name: "Ember Ring", kind: "volley", cooldown: 11, radius: 1.2, damage: 26, telegraph: 1.4, color: "#ff5a3c", glyph: "✹" },
      { id: "raise_dead", name: "Raise the Fallen", kind: "summon", cooldown: 20, radius: 2, damage: 0, telegraph: 1.8, color: "#d0b060", glyph: "†" }
    ]
  },
  ashen_wyrm: {
    id: "ashen_wyrm", name: "Cinderwing", glyph: "W", color: "#e05a3c", level: 15, hp: 2600, damage: 40, speed: 2.0,
    aggro: 15, range: 2.8, attackInterval: 1.9, xp: 1500, gold: 600, tags: ["dragon", "boss"], boss: true,
    loot: [{ id: "cinder_core", chance: 1, qty: 3 }, { id: "potion_great", chance: 1, qty: 2 }], gearChance: 1,
    abilities: [
      { id: "wing_buffet", name: "Wing Buffet", kind: "slam", cooldown: 6, radius: 3, damage: 55, telegraph: 1.2, color: "#ff8a50", glyph: "◎" },
      { id: "cinder_breath", name: "Cinder Breath", kind: "beam", cooldown: 9, radius: 1.6, damage: 70, telegraph: 1.6, color: "#ff6a3c", glyph: "→" },
      { id: "wyrm_volley", name: "Ember Storm", kind: "volley", cooldown: 13, radius: 1.2, damage: 30, telegraph: 1.5, color: "#ff5a3c", glyph: "✹" }
    ]
  }
};

// ── Quests ──────────────────────────────────────────────────────────────────

export const QUESTS: Record<string, QuestDef> = {
  q_wolves: {
    id: "q_wolves",
    name: "Fangs at the Gate",
    giver: "elder",
    level: 2,
    text: "The wolves have grown bold — three shepherds lost this week. Thin the pack south of town, and Hearthvale will breathe easier.",
    completeText: "The howling has quieted. You have our thanks, and our coin.",
    objectives: [{ type: "kill", target: "meadow_wolf", count: 8, label: "Meadow Wolves slain" }],
    rewards: { xp: 120, gold: 35, items: ["potion_heal"] }
  },
  q_gloom: {
    id: "q_gloom",
    name: "The Rot Below",
    giver: "elder",
    level: 3,
    text: "Something foul grows in the Mirefen. Gather six glowcaps — the bog lurkers hoard them. Do not eat one. I mean it.",
    completeText: "Ah, still warm. The alchemists will have these. Take this for your trouble.",
    objectives: [{ type: "collect", target: "glowcap", count: 6, label: "Glowcaps gathered" }],
    rewards: { xp: 180, gold: 45, items: ["tonic_mana", "potion_heal"] },
    requires: "q_wolves"
  },
  q_bandits: {
    id: "q_bandits",
    name: "The Reach Bandits",
    giver: "elder",
    level: 4,
    text: "A pack of cutthroats has made camp east of the plaza. They prey on the road. Break them, and bring back what they stole.",
    completeText: "The road is safe again. Hearthvale remembers.",
    objectives: [{ type: "kill", target: "bandit", count: 10, label: "Reach Bandits slain" }],
    rewards: { xp: 260, gold: 70, items: ["potion_heal"] },
    requires: "q_wolves"
  },
  q_crypt: {
    id: "q_crypt",
    name: "Doors of the Sunken Crypt",
    giver: "elder",
    level: 6,
    text: "The old crypt east of the Mirefen has opened. Skeletons walk its halls, and something wears a crown down there. Clear the guardians and find the Cinder King.",
    completeText: "You walked into the dark and came back. The Reach has need of such people.",
    objectives: [
      { type: "kill", target: "skeleton", count: 8, label: "Crypt Skeletons slain" },
      { type: "kill", target: "crypt_guardian", count: 1, label: "Crypt Guardian slain" }
    ],
    rewards: { xp: 520, gold: 140, items: ["potion_great", "tonic_mana_great"] },
    requires: "q_bandits"
  },
  q_king: {
    id: "q_king",
    name: "The Cinder King",
    giver: "elder",
    level: 10,
    text: "At the bottom of the crypt sits a throne of fused bone. The Cinder King stirs. End him before his embers find the forest.",
    completeText: "The smoke above the crypt has thinned. You have done what the Hearthguard could not.",
    objectives: [{ type: "boss", target: "cinder_king", count: 1, label: "The Cinder King destroyed" }],
    rewards: { xp: 1400, gold: 400, items: ["potion_great", "potion_great"] },
    requires: "q_crypt"
  },
  q_bounty: {
    id: "q_bounty",
    name: "Bounty: Reach Wildlife",
    giver: "guard",
    level: 2,
    text: "The board is full again. Wolves, spiders — the Reach does not care what you kill, only that you come back with proof.",
    completeText: "Proof enough. Here is your pay.",
    objectives: [{ type: "kill", target: "meadow_wolf", count: 6, label: "Meadow Wolves slain" }],
    rewards: { xp: 90, gold: 30 },
    repeatable: true
  }
};

// ── NPCs & portals ──────────────────────────────────────────────────────────

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  role: "quest" | "vendor" | "healer" | "lore" | "guard";
  glyph: string;
  color: string;
  zone: ZoneId;
  x: number;
  y: number;
  text: string;
}

export const NPCS: NpcDef[] = [
  { id: "elder", name: "Elder Marrow", title: "Keeper of Hearthvale", role: "quest", glyph: "?", color: "#f0c674", zone: "world", x: 111.5, y: 78.5, text: "Hearthvale survives because we remember the old oaths. What will you remember, wanderer?" },
  { id: "vendor", name: "Sable", title: "The Peddler", role: "vendor", glyph: "$", color: "#e0c060", zone: "world", x: 148.5, y: 78.5, text: "Everything has a price. Even that look on your face." },
  { id: "healer", name: "Sister Elowen", title: "Warden of the Inn", role: "healer", glyph: "+", color: "#8fd0a0", zone: "world", x: 111.5, y: 104.5, text: "Sit. Breathe. The road can wait a moment longer." },
  { id: "guard", name: "Warden Kael", title: "Gatewatch", role: "guard", glyph: "!", color: "#d0a060", zone: "world", x: 148.5, y: 103.5, text: "Bounty board is right there. Try not to die where I have to find you." },
  { id: "loremaster", name: "Orin the Tallow", title: "Keeper of Ashes", role: "lore", glyph: "Ω", color: "#b0a8c8", zone: "world", x: 133.5, y: 98.5, text: "The Cinderfall was not a war. It was a door opening. We are still deciding what walked through." }
];

export const PORTALS: { id: string; name: string; zone: ZoneId; x: number; y: number; color: string; glyph: string; target: ZoneId; tx: number; ty: number }[] = [
  { id: "portal_crypt", name: "Sunken Crypt", zone: "world", x: 225.5, y: 120.5, color: "#9fd8f0", glyph: "◈", target: "crypt", tx: 8.5, ty: 35.5 },
  { id: "portal_world", name: "Hearthvale Road", zone: "crypt", x: 8.5, y: 35.5, color: "#f0c674", glyph: "◈", target: "world", tx: 225.5, ty: 122.5 }
];

export const SHRINES = [
  { id: "shrine_town", zone: "world" as ZoneId, x: 136.5, y: 90.5, name: "Shrine of the Hearth" },
  { id: "shrine_crypt", zone: "crypt" as ZoneId, x: 12.5, y: 38.5, name: "Forgotten Shrine" }
];

// ── Regions & environment ───────────────────────────────────────────────────

export const REGIONS: { id: string; name: string; subtitle: string; test: (x: number, y: number, zone: ZoneId) => boolean }[] = [
  { id: "crypt", name: "The Sunken Crypt", subtitle: "Where the embers were buried", test: (_x, _y, z) => z === "crypt" },
  { id: "town", name: "Hearthvale", subtitle: "The last warm hearth", test: (x, y) => Math.abs(x - 130) < 34 && Math.abs(y - 90) < 26 },
  { id: "ash", name: "The Ashen Waste", subtitle: "Nothing grows but hunger", test: (x, y) => y < 48 },
  { id: "frost", name: "Frostfen", subtitle: "The cold keeps its own counsel", test: (x) => x < 58 },
  { id: "mire", name: "Mirefen", subtitle: "The bog remembers every step", test: (x, y) => x > 178 && y > 125 },
  { id: "verdant", name: "The Verdant Reach", subtitle: "Green things still fight for the light", test: () => true }
];

export function regionAt(zone: ZoneId, x: number, y: number) {
  return REGIONS.find((r) => r.test(x, y, zone)) ?? REGIONS[REGIONS.length - 1];
}

export const VENDOR_STOCK = [
  { id: "potion_minor", price: 14 },
  { id: "potion_heal", price: 38 },
  { id: "potion_great", price: 95 },
  { id: "tonic_mana", price: 26 },
  { id: "tonic_mana_great", price: 68 },
  { id: "hearthstone", price: 50 }
];

export function xpForLevel(level: number): number {
  if (level >= 20) return 999999999;
  return Math.floor(55 + Math.pow(level, 1.62) * 48);
}
