import { ABILITIES, CLASSES, ITEM_BASES, QUESTS, classAbilities, type AbilityDef } from "../shared/content";
import type { ClassId, Item } from "../shared/types";
import type { World } from "./state";
import { itemTooltipHtml } from "./ui";

const RARITY_HEX: Record<string, string> = {
  common: "#a8a49a",
  uncommon: "#79c46a",
  rare: "#5fa8e8",
  epic: "#c07ae8",
  legendary: "#f0a03c"
};

const SLOT_LABEL: Record<string, string> = {
  weapon: "Weapon",
  armor: "Armor",
  trinket: "Trinket"
};

const STAT_LABEL: Record<string, string> = {
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  armor: "Armor",
  attack: "Attack",
  spell: "Spell",
  crit: "Crit",
  haste: "Haste",
  lifesteal: "Life Steal",
  hp: "Health",
  mp: "Mana"
};

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tipAttr(html: string): string {
  return html.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ── Title screen ────────────────────────────────────────────────────────────

const LOGO = String.raw`
███████╗███╗   ███╗██████╗ ███████╗██████╗ ███████╗ █████╗ ██╗     ██╗
██╔════╝████╗ ████║██╔══██╗██╔════╝██╔══██╗██╔════╝██╔══██╗██║     ██║
█████╗  ██╔████╔██║██████╔╝█████╗  ██████╔╝█████╗  ███████║██║     ██║
██╔══╝  ██║╚██╔╝██║██╔══██╗██╔══╝  ██╔══██╗██╔══╝  ██╔══██║██║     ██║
███████╗██║ ╚═╝ ██║██║  ██║███████╗██║  ██║███████╗██║  ██║███████╗███████╗
╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝`;

const NAME_SYLLABLES_A = ["Ash", "Bran", "Cael", "Dorn", "Eld", "Fen", "Gil", "Hale", "Ith", "Kael", "Lir", "Mor", "Nyx", "Orin", "Rook", "Sable", "Thal", "Vey", "Wren", "Yara"];
const NAME_SYLLABLES_B = ["a", "en", "is", "or", "wyn", "ric", "da", "mir", "thas", "vane", "gar", "iel", "oth", "ra", "dan", "eth"];

function randomName(): string {
  const a = NAME_SYLLABLES_A[Math.floor(Math.random() * NAME_SYLLABLES_A.length)];
  const b = NAME_SYLLABLES_B[Math.floor(Math.random() * NAME_SYLLABLES_B.length)];
  return `${a}${b}`;
}

export class TitleScreen {
  private root: HTMLElement;
  private onEnter: (name: string, classId: ClassId, token: string) => void;
  private selected: ClassId;
  private connecting = false;

  constructor(root: HTMLElement, onEnter: (name: string, classId: ClassId, token: string) => void) {
    this.root = root;
    this.onEnter = onEnter;
    const savedClass = localStorage.getItem("emberfall:class") as ClassId | null;
    this.selected = savedClass && CLASSES[savedClass] ? savedClass : "vanguard";
  }

  get isVisible(): boolean {
    return this.root.classList.contains("title-mode");
  }

  show(error = ""): void {
    this.connecting = false;
    this.root.classList.add("title-mode");
    const savedName = localStorage.getItem("emberfall:name") ?? randomName();
    const savedClass = this.selected;
    const ash = Array.from({ length: 26 }, (_, i) => {
      const left = Math.random() * 100;
      const delay = Math.random() * 12;
      const dur = 9 + Math.random() * 14;
      const drift = (Math.random() - 0.5) * 180;
      const size = Math.random() > 0.7 ? 2 : 1;
      return `<i style="left:${left.toFixed(1)}%;animation-delay:-${delay.toFixed(1)}s;animation-duration:${dur.toFixed(1)}s;--drift:${drift.toFixed(0)}px;width:${size}px;height:${size}px"></i>`;
    }).join("");

    this.root.innerHTML = `
      <div class="title-wrap">
        <div class="title-ash">${ash}</div>
        <div class="title-header">
          <pre class="title-logo">${LOGO}</pre>
          <div class="title-sub">THE ASHEN REACH</div>
          <div class="title-tagline">A shared-world ASCII saga of embers, oath and old bone.</div>
        </div>

        <div class="title-main">
          <div class="title-classes" id="title-classes">
            ${Object.values(CLASSES).map((c) => this.classCard(c.id, c.id === savedClass)).join("")}
          </div>
          <div class="title-detail">
            <div id="title-detail-body">${this.detailBody(savedClass)}</div>
            <div class="title-form">
              <label for="title-name">Your name in the Reach</label>
              <input id="title-name" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(savedName)}" />
              <div class="title-error" id="title-error">${error ? esc(error) : ""}</div>
              <div class="row">
                <button class="btn primary" id="title-enter-btn" data-act="title-enter">ENTER THE REACH</button>
                <button class="btn" data-act="title-random" title="Roll a name">⟳</button>
              </div>
            </div>
          </div>
        </div>

        <div class="title-foot">
          <span><span class="k">WASD</span> move</span>
          <span><span class="k">1–6</span> skills</span>
          <span><span class="k">Q/F</span> potions</span>
          <span><span class="k">ENTER</span> speak</span>
          <button data-act="title-crt">CRT: ON</button>
          <button data-act="title-mute">SOUND: ON</button>
          <button data-act="title-forget">FORGET KEY</button>
        </div>
      </div>
    `;

    const input = this.root.querySelector("#title-name") as HTMLInputElement | null;
    if (input) {
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") {
          ev.preventDefault();
          this.submit();
        }
      });
    }
  }

  private classCard(id: ClassId, selected: boolean): string {
    const c = CLASSES[id];
    return `
      <button class="class-card${selected ? " selected" : ""}" data-act="title-class" data-id="${id}">
        <span class="cc-glyph" style="color:${c.color}">${c.glyph}</span>
        <span class="cc-body">
          <span class="cc-name" style="color:${c.color}">${c.name}<span>${c.title}</span></span>
          <span class="cc-blurb">${esc(c.blurb)}</span>
        </span>
        <span class="cc-mark">${selected ? "◆" : "◇"}</span>
      </button>
    `;
  }

  private detailBody(id: ClassId): string {
    const c = CLASSES[id];
    const abilities = classAbilities(id);
    return `
      <div class="td-head">
        <span class="td-glyph" style="color:${c.color}">${c.glyph}</span>
        <div>
          <div class="td-name" style="color:${c.color}">${c.name}</div>
          <div class="td-title">${c.title}</div>
        </div>
      </div>
      <div class="td-lore">${esc(c.lore)}</div>
      <div class="td-stats">
        <div class="td-stat"><span class="k">Health</span><span class="v">${c.hp}</span></div>
        <div class="td-stat"><span class="k">Mana</span><span class="v">${c.mp}</span></div>
        <div class="td-stat"><span class="k">Stamina</span><span class="v">${c.stamina}</span></div>
        <div class="td-stat"><span class="k">Weapon</span><span class="v">${c.basic.name}</span></div>
        <div class="td-stat"><span class="k">Strength</span><span class="v">${c.stats.str}</span></div>
        <div class="td-stat"><span class="k">Agility</span><span class="v">${c.stats.agi}</span></div>
        <div class="td-stat"><span class="k">Intellect</span><span class="v">${c.stats.int}</span></div>
        <div class="td-stat"><span class="k">Vitality</span><span class="v">${c.stats.vit}</span></div>
      </div>
      <div class="td-kit"><b>PATH</b> · ${abilities.map((a) => `${esc(a.name)} <span style="color:#5f6358">lv${a.unlock}</span>`).join(" · ")}</div>
    `;
  }

  select(id: string): void {
    if (!CLASSES[id as ClassId]) return;
    this.selected = id as ClassId;
    localStorage.setItem("emberfall:class", this.selected);
    this.root.querySelectorAll<HTMLElement>(".class-card").forEach((card) => {
      const on = card.dataset.id === id;
      card.classList.toggle("selected", on);
      const mark = card.querySelector(".cc-mark");
      if (mark) mark.textContent = on ? "◆" : "◇";
    });
    const body = this.root.querySelector("#title-detail-body");
    if (body) body.innerHTML = this.detailBody(this.selected);
  }

  randomize(): void {
    const input = this.root.querySelector("#title-name") as HTMLInputElement | null;
    if (input) input.value = randomName();
  }

  forgetToken(): void {
    const input = this.root.querySelector("#title-name") as HTMLInputElement | null;
    const name = (input?.value ?? "").trim().toLowerCase();
    if (name) localStorage.removeItem(`emberfall:token:${name}`);
    this.setError("Saved key forgotten. Enter to claim a fresh character with this name.");
  }

  setError(message: string): void {
    const el = this.root.querySelector("#title-error");
    if (el) el.textContent = message;
    this.connecting = false;
    const btn = this.root.querySelector("#title-enter-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "ENTER THE REACH";
    }
  }

  submit(): void {
    if (this.connecting) return;
    const input = this.root.querySelector("#title-name") as HTMLInputElement | null;
    const name = (input?.value ?? "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{2,15}$/.test(name)) {
      this.setError("Name must be 3–16 characters: letters, numbers, underscore.");
      return;
    }
    this.connecting = true;
    this.setError("");
    const btn = this.root.querySelector("#title-enter-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "OPENING THE VEIL…";
    }
    localStorage.setItem("emberfall:name", name);
    const token = localStorage.getItem(`emberfall:token:${name.toLowerCase()}`) ?? "";
    this.onEnter(name, this.selected, token);
  }

  saveToken(token: string): void {
    const input = this.root.querySelector("#title-name") as HTMLInputElement | null;
    const name = (input?.value ?? localStorage.getItem("emberfall:name") ?? "").trim().toLowerCase();
    if (name) localStorage.setItem(`emberfall:token:${name}`, token);
  }

  hide(): void {
    this.root.classList.remove("title-mode");
    this.root.innerHTML = "";
  }
}

// ── Panel builders ──────────────────────────────────────────────────────────

export function buildInventory(world: World): string {
  const data = world.data;
  if (!data) return "";
  const equip = data.equipment;

  const equipSlots = (["weapon", "armor", "trinket"] as const).map((slot) => {
    const item = equip[slot];
    if (!item) {
      return `<div class="equip-slot empty"><div class="es-label">${SLOT_LABEL[slot]}</div><div class="es-main"><span class="es-glyph" style="color:#3d4138">·</span><span class="es-name">nothing</span></div></div>`;
    }
    const color = RARITY_HEX[item.rarity];
    return `
      <div class="equip-slot" data-tip="${tipAttr(itemTooltipHtml(item))}">
        <div class="es-label">${SLOT_LABEL[slot]}</div>
        <div class="es-main">
          <span class="es-glyph" style="color:${color}">${item.glyph}</span>
          <span class="es-name" style="color:${color}">${esc(item.name)}</span>
        </div>
        <button class="btn small" style="margin-top:6px" data-act="unequip" data-id="${item.uid}">UNEQUIP</button>
      </div>
    `;
  }).join("");

  const slots: string[] = [];
  for (let i = 0; i < 24; i++) {
    const item = data.inventory[i];
    if (!item) {
      slots.push('<div class="inv-slot empty"><span class="g" style="color:#2f332c">·</span></div>');
      continue;
    }
    const color = RARITY_HEX[item.rarity];
    slots.push(`
      <div class="inv-slot" data-act="inv-use" data-id="${item.uid}" data-tip="${tipAttr(itemTooltipHtml(item))}" style="border-color:${color}55">
        <span class="g" style="color:${color}">${item.glyph}</span>
        <span class="n">${esc(item.name)}</span>
        ${item.qty > 1 ? `<span class="q">${item.qty}</span>` : ""}
        <span class="acts">
          <button class="btn small" data-act="inv-use" data-id="${item.uid}">${item.slot ? "EQUIP" : item.consumable ? "USE" : "TAKE"}</button>
          <button class="btn small danger" data-act="inv-drop" data-id="${item.uid}">DROP</button>
        </span>
      </div>
    `);
  }

  const d = data.derived;
  const stats = [
    ["Attack", d.attack], ["Spell", d.spell], ["Armor", d.armor],
    ["Crit", `${d.crit}%`], ["Haste", `${d.haste}%`], ["Life Steal", `${d.lifesteal}%`]
  ].map(([k, v]) => `<div class="stat-line"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");

  return `
    <div class="cols">
      <div>
        <div class="section-title"><span>Pack</span><span class="sub">${data.inventory.length} / 24</span></div>
        <div class="inv-grid">${slots.join("")}</div>
        <div class="section-title" style="margin-top:14px"><span>Worn</span><span class="sub">equipped</span></div>
        <div class="equip-row">${equipSlots}</div>
      </div>
      <div>
        <div class="section-title"><span>Purse</span></div>
        <div class="gold-line">◈ ${data.gold} gold</div>
        <div class="section-title" style="margin-top:14px"><span>Combat</span></div>
        <div class="stat-grid">${stats}</div>
        <div class="section-title" style="margin-top:14px"><span>Guidance</span></div>
        <div class="lore-block">Click a pack item to use or equip it. Drop what you cannot carry. Sable buys anything — open her stall and sell from your pack. The dead keep no pockets.</div>
      </div>
    </div>
  `;
}

export function buildCharacter(world: World): string {
  const data = world.data;
  const self = world.self;
  if (!data || !self) return "";
  const def = CLASSES[data.classId];
  const d = data.derived;
  const playMinutes = Math.floor(data.playTime / 60);
  const stats = [
    ["Strength", data.stats.str], ["Agility", data.stats.agi],
    ["Intellect", data.stats.int], ["Vitality", data.stats.vit]
  ].map(([k, v]) => `<div class="stat-line"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
  const derived = [
    ["Health", d.maxHp], ["Mana", d.maxMp], ["Stamina", d.maxStamina],
    ["Attack", d.attack], ["Spell", d.spell], ["Armor", d.armor],
    ["Critical", `${d.crit}%`], ["Haste", `${d.haste}%`], ["Life Steal", `${d.lifesteal}%`]
  ].map(([k, v]) => `<div class="stat-line"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");

  const abilities = classAbilities(data.classId).map((a) => {
    const learned = data.learned.includes(a.id);
    return `
      <div class="stat-line" title="${esc(a.desc)}">
        <span class="k" style="color:${learned ? a.color : "var(--faint)"}">${a.glyph} ${esc(a.name)}</span>
        <span class="v" style="color:${learned ? "var(--green)" : "var(--faint)"}">${learned ? "learned" : `level ${a.unlock}`}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="cols">
      <div>
        <div class="td-head" style="margin-bottom:12px">
          <span class="td-glyph" style="color:${def.color}">${def.glyph}</span>
          <div><div class="td-name" style="color:${def.color}">${esc(data.name)}</div><div class="td-title">${def.title} · Level ${data.level}</div></div>
        </div>
        <div class="section-title"><span>Attributes</span></div>
        <div class="stat-grid">${stats}</div>
        <div class="section-title" style="margin-top:14px"><span>Derived</span></div>
        <div class="stat-grid">${derived}</div>
        <div class="section-title" style="margin-top:14px"><span>Record</span></div>
        <div class="stat-grid">
          <div class="stat-line"><span class="k">Kills</span><span class="v">${data.kills}</span></div>
          <div class="stat-line"><span class="k">Deaths</span><span class="v">${data.deaths}</span></div>
          <div class="stat-line"><span class="k">Quests</span><span class="v">${data.completed.length}</span></div>
          <div class="stat-line"><span class="k">Time</span><span class="v">${playMinutes}m</span></div>
          <div class="stat-line"><span class="k">Gold</span><span class="v" style="color:var(--gold)">◈ ${data.gold}</span></div>
          <div class="stat-line"><span class="k">Shrine</span><span class="v">${data.respawn.zone === "crypt" ? "Crypt" : "Hearthvale"}</span></div>
        </div>
      </div>
      <div>
        <div class="section-title"><span>Path of the ${def.name}</span><span class="sub">${data.learned.length} learned</span></div>
        <div class="stat-grid">${abilities}</div>
        <div class="section-title" style="margin-top:14px"><span>Calling</span></div>
        <div class="lore-block">${esc(def.lore)}</div>
        <div class="section-title" style="margin-top:14px"><span>Progress</span></div>
        <div class="bar xp" style="height:12px"><div class="fill" style="width:${(data.xp / Math.max(1, data.xpNext)) * 100}%"></div><span class="lbl">${data.xp} / ${data.xpNext} xp</span></div>
        <div style="font-size:10px;color:var(--faint);margin-top:6px">Reach level ${Math.min(20, data.level + 1)} for the next ability unlock.</div>
      </div>
    </div>
  `;
}

export function buildQuests(world: World): string {
  const data = world.data;
  if (!data) return "";
  const active = world.activeQuests();
  const completed = data.completed.map((id) => QUESTS[id]).filter(Boolean);

  const activeHtml = active.length ? active.map(({ def, state, done }) => {
    const objectives = def.objectives.map((o, i) => {
      const cur = Math.min(o.count, state.progress[i] ?? 0);
      return `<div class="qc-obj${cur >= o.count ? " done" : ""}">${esc(o.label)} ${cur}/${o.count}</div>`;
    }).join("");
    return `
      <div class="quest-card${done ? " done" : ""}">
        <div class="qc-head"><span class="qc-name">${esc(def.name)}</span><span class="qc-lv">level ${def.level}${done ? " · ready" : ""}</span></div>
        <div class="qc-text">${esc(def.text)}</div>
        ${objectives}
        <div class="qc-reward">Reward: ${def.rewards.xp} xp · ◈ ${def.rewards.gold}${def.rewards.items?.length ? ` · ${def.rewards.items.map((i) => esc(ITEM_BASES[i]?.name ?? i)).join(", ")}` : ""}</div>
        ${done ? `<div class="qc-actions"><span style="font-size:10px;color:var(--green)">Return to ${esc(npcName(def.giver))} to claim your reward.</span></div>` : ""}
      </div>
    `;
  }).join("") : '<div class="empty-note">No active tasks. Elder Marrow keeps the Hearthvale board; Warden Kael pays bounties.</div>';

  const completedHtml = completed.length
    ? completed.map((q) => `<div class="stat-line"><span class="k" style="color:var(--green)">✓ ${esc(q.name)}</span><span class="v" style="color:var(--faint)">${q.rewards.xp} xp</span></div>`).join("")
    : '<div class="empty-note">Nothing finished yet. The Reach is patient.</div>';

  return `
    <div class="cols">
      <div>
        <div class="section-title"><span>Active</span><span class="sub">${active.length} in progress</span></div>
        ${activeHtml}
      </div>
      <div>
        <div class="section-title"><span>Completed</span><span class="sub">${completed.length}</span></div>
        ${completedHtml}
        <div class="section-title" style="margin-top:16px"><span>How quests work</span></div>
        <div class="lore-block">Speak to a quest giver with <b>E</b>. Accept the task, then gather or kill as instructed. Return when every objective is struck through to claim coin, gear and experience.</div>
        <div class="section-title" style="margin-top:16px"><span>Road ahead</span></div>
        <div class="step-list" style="font-size:11px;color:var(--dim);line-height:1.7">
          <div>† Wolves south of Hearthvale.</div>
          <div>† Glowcaps in the Mirefen, far south-east.</div>
          <div>† Bandit camp east of the plaza.</div>
          <div>† The Sunken Crypt, beyond the eastern mire.</div>
        </div>
      </div>
    </div>
  `;
}

function npcName(id: string): string {
  const map: Record<string, string> = { elder: "Elder Marrow", guard: "Warden Kael", vendor: "Sable", healer: "Sister Elowen" };
  return map[id] ?? id;
}

export function buildParty(world: World): string {
  const party = world.party;
  if (!party) {
    return `
      <div class="section-title"><span>No Party</span></div>
      <div class="empty-note">You walk the Reach alone. A party shares experience with every member nearby when a foe falls.</div>
      <div class="lore-block" style="margin-top:14px">
        Press <b>Enter</b> and type <b>/invite Name</b> to call another wanderer.<br>
        They type <b>/accept</b> to join. Up to five may walk together.<br>
        Use <b>/p message</b> for party chat. <b>/leave</b> to disband your bond.
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn primary" data-act="party-invite-prompt">INVITE A WANDERER</button>
        <button class="btn" data-act="party-accept">ACCEPT INVITE</button>
      </div>
    `;
  }
  const rows = party.members.map((m) => {
    const color = CLASSES[m.classId]?.color ?? "#a8a49a";
    return `
      <div class="party-member">
        <span class="pm-glyph" style="color:${color}">${CLASSES[m.classId]?.glyph ?? "@"}</span>
        <div class="pm-id">
          <div class="pm-name"><span style="color:${color}">${esc(m.name)}</span>${m.leader ? '<span class="lead">LEADER</span>' : ""}<span style="color:var(--faint);font-size:9px">level ${m.level} ${CLASSES[m.classId]?.name ?? ""}</span></div>
          <div class="pm-zone">${m.zone === "crypt" ? "The Sunken Crypt" : "The Ashen Reach"} · ${Math.round(m.hp)} / ${m.maxHp} hp</div>
        </div>
        <div class="pm-bar"><div class="bar hp" style="height:9px"><div class="fill" style="width:${(m.hp / Math.max(1, m.maxHp)) * 100}%"></div></div></div>
      </div>
    `;
  }).join("");
  return `
    <div class="section-title"><span>Party</span><span class="sub">${party.members.length} / 5</span></div>
    ${rows}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn primary" data-act="party-invite-prompt">INVITE</button>
      <button class="btn danger" data-act="party-leave">LEAVE PARTY</button>
    </div>
    <div class="lore-block" style="margin-top:14px">Party members within reach share 80% of your experience. The leader is marked with a golden sigil. Use <b>/p message</b> to speak only to your company.</div>
  `;
}

export function buildMap(world: World): string {
  const zoneName = world.zone === "crypt" ? "The Sunken Crypt" : "The Ashen Reach";
  const region = world.regionName();
  const pois = world.zone === "crypt"
    ? ["Hearthvale Road (exit)", "The Hall of Bone", "The Depths", "Throne of the Cinder King"]
    : ["Hearthvale", "The Sunken Crypt gate", "Wolf Den", "Bandit Camp", "Frostfen Ruins", "Ashen Camp", "Mirefen", "Wyrm Roost"];
  return `
    <div class="map-wrap">
      <canvas id="full-map"></canvas>
      <div class="map-legend">
        <div class="ml" style="color:#f2d38a"><span class="dot"></span> You are here</div>
        <div class="ml" style="color:#8fd0a0"><span class="dot"></span> Party</div>
        <div class="ml" style="color:#b04a3a"><span class="dot"></span> Foes</div>
        <div class="ml" style="color:#c07ae8"><span class="dot"></span> Rare creature</div>
        <div class="ml" style="color:#9fd8f0"><span class="dot"></span> Waypoint / crypt</div>
        <div class="ml" style="color:#f0c674"><span class="dot"></span> Shrine / town</div>
        <div class="map-note">
          ${pois.map((p) => `† ${esc(p)}`).join("<br>")}
        </div>
        <div class="map-note" style="color:var(--faint)">
          <b style="color:var(--gold)">${esc(zoneName)}</b><br>
          You stand in ${esc(region.name)}.<br>
          ${esc(region.subtitle)}.
        </div>
      </div>
    </div>
  `;
}

export function buildHelp(world: World): string {
  void world;
  return `
    <div class="help-grid">
      <div>
        <div class="section-title"><span>Movement & World</span></div>
        <div class="help-list">
          <div class="hl"><span class="keys">W A S D / ↑←↓→</span><span class="desc">Walk the Reach</span></div>
          <div class="hl"><span class="keys">SHIFT</span><span class="desc">Sprint (drains stamina)</span></div>
          <div class="hl"><span class="keys">E</span><span class="desc">Speak, loot, enter portals, touch shrines</span></div>
          <div class="hl"><span class="keys">M / WHEEL</span><span class="desc">World map · zoom the glyph grid</span></div>
          <div class="hl"><span class="keys">V</span><span class="desc">Toggle CRT scanlines</span></div>
          <div class="hl"><span class="keys">N</span><span class="desc">Mute or unmute audio</span></div>
        </div>
        <div class="section-title" style="margin-top:16px"><span>Combat</span></div>
        <div class="help-list">
          <div class="hl"><span class="keys">LEFT CLICK</span><span class="desc">Select a foe and begin auto-attack</span></div>
          <div class="hl"><span class="keys">RIGHT CLICK</span><span class="desc">Cast the armed skill at the cursor</span></div>
          <div class="hl"><span class="keys">1 – 6</span><span class="desc">Cast that skill at the cursor</span></div>
          <div class="hl"><span class="keys">TAB</span><span class="desc">Cycle the nearest foe</span></div>
          <div class="hl"><span class="keys">SPACE</span><span class="desc">Toggle auto-attack on the selected target</span></div>
          <div class="hl"><span class="keys">Q / F</span><span class="desc">Quaff healing / mana draught</span></div>
          <div class="hl"><span class="keys">R</span><span class="desc">Rise at your last shrine when dead</span></div>
        </div>
      </div>
      <div>
        <div class="section-title"><span>Panels & Chat</span></div>
        <div class="help-list">
          <div class="hl"><span class="keys">I</span><span class="desc">Pack and worn equipment</span></div>
          <div class="hl"><span class="keys">C</span><span class="desc">Character sheet</span></div>
          <div class="hl"><span class="keys">J</span><span class="desc">Quest journal</span></div>
          <div class="hl"><span class="keys">M</span><span class="desc">Full map</span></div>
          <div class="hl"><span class="keys">P</span><span class="desc">Party</span></div>
          <div class="hl"><span class="keys">H</span><span class="desc">This help</span></div>
          <div class="hl"><span class="keys">ENTER</span><span class="desc">Open chat · /s /y /w Name /p</span></div>
          <div class="hl"><span class="keys">/help</span><span class="desc">Server command reference</span></div>
          <div class="hl"><span class="keys">ESC</span><span class="desc">Close panels / cancel chat</span></div>
        </div>
        <div class="section-title" style="margin-top:16px"><span>Commands</span></div>
        <div class="help-list">
          <div class="hl"><span class="keys">/who</span><span class="desc">List wanderers online</span></div>
          <div class="hl"><span class="keys">/invite Name</span><span class="desc">Offer a party bond</span></div>
          <div class="hl"><span class="keys">/accept</span><span class="desc">Accept the last invitation</span></div>
          <div class="hl"><span class="keys">/leave</span><span class="desc">Leave your party</span></div>
          <div class="hl"><span class="keys">/roll</span><span class="desc">Roll 1–100 for loot</span></div>
          <div class="hl"><span class="keys">/dance /wave /cheer</span><span class="desc">Emote</span></div>
        </div>
        <div class="section-title" style="margin-top:16px"><span>The Ashen Reach</span></div>
        <div class="lore-block">The Cinderfall did not end the world; it opened a door. Hearthvale keeps the last warm hearth while the Reach grows teeth. Follow Elder Marrow's chain east — wolves, bandits, the Sunken Crypt, and the thing that wears a crown of embers.</div>
      </div>
    </div>
  `;
}

export function buildDialog(world: World): string {
  const d = world.dialog;
  if (!d) return "";
  const quests = d.quests ?? [];
  const questHtml = quests.length ? `
    <div class="section-title"><span>Tasks</span><span class="sub">${esc(d.npcName)}</span></div>
    ${quests.map((q) => {
      const def = QUESTS[q.id];
      if (!def) return "";
      const progress = world.questProgressText(q.id);
      const state = world.data?.quests.find((x) => x.id === q.id);
      const actions = q.state === "offer"
        ? `<button class="btn primary small" data-act="quest-accept" data-id="${q.id}">ACCEPT</button>`
        : q.state === "done"
          ? `<button class="btn primary small" data-act="quest-turnin" data-id="${q.id}">TURN IN</button>`
          : `<span style="font-size:10px;color:var(--dim)">in progress · ${esc(progress)}</span>`;
      return `
        <div class="quest-card${q.state === "done" ? " done" : ""}">
          <div class="qc-head"><span class="qc-name">${esc(def.name)}</span><span class="qc-lv">level ${def.level}</span></div>
          <div class="qc-text">${esc(q.state === "done" ? def.completeText : def.text)}</div>
          ${def.objectives.map((o, i) => {
            const cur = q.state === "offer" ? 0 : Math.min(o.count, state?.progress[i] ?? 0);
            return `<div class="qc-obj">${esc(o.label)} ${cur}/${o.count}</div>`;
          }).join("")}
          <div class="qc-reward">Reward: ${def.rewards.xp} xp · ◈ ${def.rewards.gold}${def.rewards.items?.length ? ` · ${def.rewards.items.map((it) => esc(ITEM_BASES[it]?.name ?? it)).join(", ")}` : ""}</div>
          <div class="qc-actions">${actions}</div>
        </div>
      `;
    }).join("")}
  ` : "";

  const buyHtml = d.buy?.length ? `
    <div class="section-title"><span>Wares</span><span class="sub">${esc(d.npcName)}'s stall</span></div>
    <div class="vendor-list">
      ${d.buy.map((b) => `
        <div class="vendor-row">
          <span class="vg" style="color:${b.color}">${b.glyph}</span>
          <div class="vi"><div class="vn">${esc(b.name)}</div><div class="vd">${esc(b.desc)}</div></div>
          <span class="vp">◈ ${b.price}</span>
          <button class="btn small primary" data-act="vendor-buy" data-id="${b.id}" data-qty="1" ${world.data && world.data.gold < b.price ? "disabled" : ""}>BUY</button>
          <button class="btn small" data-act="vendor-buy" data-id="${b.id}" data-qty="5" ${world.data && world.data.gold < b.price * 5 ? "disabled" : ""}>×5</button>
        </div>
      `).join("")}
    </div>
  ` : "";

  const sellHtml = d.kind === "vendor" && world.data?.inventory.length ? `
    <div class="section-title" style="margin-top:14px"><span>Your Pack</span><span class="sub">Sable pays 35% of value</span></div>
    <div class="vendor-list">
      ${world.data.inventory.map((item) => `
        <div class="vendor-row">
          <span class="vg" style="color:${RARITY_HEX[item.rarity]}">${item.glyph}</span>
          <div class="vi"><div class="vn" style="color:${RARITY_HEX[item.rarity]}">${esc(item.name)}${item.qty > 1 ? ` ×${item.qty}` : ""}</div><div class="vd">${item.slot ? SLOT_LABEL[item.slot] : "consumable"} · value ${item.value * item.qty}g</div></div>
          <span class="vp">◈ ${Math.max(1, Math.floor(item.value * 0.35 * item.qty))}</span>
          <button class="btn small" data-act="inv-sell" data-id="${item.uid}">SELL</button>
        </div>
      `).join("")}
    </div>
  ` : "";

  return `
    <div class="dialog-text">“${esc(d.text)}”</div>
    ${questHtml}
    ${buyHtml}
    ${sellHtml}
    ${d.kind === "healer" ? '<div class="lore-block">Sister Elowen has already tended your wounds. The hearth is warm; take a breath before the road.</div>' : ""}
    ${d.kind === "lore" ? '<div class="lore-block">Orin turns a page without looking up. “Ask, and I will tell you what the ashes remember.”</div>' : ""}
  `;
}

export function buildDeathBody(): string {
  return "";
}

// ── Helpers used by main ────────────────────────────────────────────────────

export function itemForUid(world: World, uid: string | undefined): Item | undefined {
  if (!uid || !world.data) return undefined;
  return world.data.inventory.find((i) => i.uid === uid);
}

export function abilitiesFor(classId: ClassId): AbilityDef[] {
  return ABILITIES ? classAbilities(classId) : [];
}

export function slotLabel(slot: string): string {
  return SLOT_LABEL[slot] ?? slot;
}

export function statLabel(stat: string): string {
  return STAT_LABEL[stat] ?? stat;
}
