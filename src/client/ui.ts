import { ABILITIES, CLASSES, QUESTS } from "../shared/content";
import type { AbilityDef } from "../shared/content";
import type { Item } from "../shared/types";
import type { LogEntry, World } from "./state";
import { drawMinimap } from "./render";

export type PanelId = "inventory" | "character" | "quests" | "party" | "help" | "map" | "dialog" | "vendor";

export interface UiActions {
  action(act: string, id: string | undefined, qty?: string): void;
  chat(text: string): void;
}

const WEATHER_LABEL: Record<string, string> = {
  clear: "clear skies",
  rain: "rain",
  snow: "snowfall",
  fog: "fog",
  ember: "falling embers"
};

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pct(cur: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (cur / max) * 100));
}

export class Ui {
  readonly world: World;
  readonly root: HTMLElement;
  readonly screen: HTMLElement;
  readonly tooltip: HTMLElement;
  readonly toasts: HTMLElement;
  actions: UiActions;

  currentPanel: PanelId | null = null;
  private panelEl: HTMLElement | null = null;
  private deathEl: HTMLElement | null = null;
  private disconnectEl: HTMLElement | null = null;
  private chatRow: HTMLElement;
  private chatInput: HTMLInputElement;
  private chatLog: HTMLElement;
  private chatHint: HTMLElement;
  private chatHistory: string[] = [];
  private chatHistoryIdx = -1;

  private els!: {
    hud: HTMLElement;
    sigil: HTMLElement;
    name: HTMLElement;
    cls: HTMLElement;
    lv: HTMLElement;
    region: HTMLElement;
    hpFill: HTMLElement; hpLbl: HTMLElement;
    mpFill: HTMLElement; mpLbl: HTMLElement;
    staFill: HTMLElement; staLbl: HTMLElement;
    xpFill: HTMLElement; xpLbl: HTMLElement;
    gold: HTMLElement; online: HTMLElement; ping: HTMLElement;
    buffs: HTMLElement;
    regionName: HTMLElement; regionSub: HTMLElement; clock: HTMLElement; weather: HTMLElement;
    target: HTMLElement; targetName: HTMLElement; targetLv: HTMLElement; targetBar: HTMLElement; targetFill: HTMLElement; targetBadges: HTMLElement;
    minimap: HTMLCanvasElement; mmFoot: HTMLElement;
    questBody: HTMLElement;
    skillbar: HTMLElement;
    potionHp: HTMLElement; potionHpQty: HTMLElement;
    potionMp: HTMLElement; potionMpQty: HTMLElement;
    status: HTMLElement;
    combat: HTMLElement;
  };

  private skillEls: { root: HTMLElement; cd: HTMLElement; cdt: HTMLElement; cost: HTMLElement }[] = [];
  private skillSig = "";
  private buffSig = "\u0000";
  private questSig = "\u0000";
  private lastMinimap = 0;
  private chatOpen = false;
  private statusCache = "";
  private regionCache = "";

  constructor(world: World, root: HTMLElement, screen: HTMLElement, tooltip: HTMLElement) {
    this.world = world;
    this.root = root;
    this.screen = screen;
    this.tooltip = tooltip;
    this.actions = { action: () => undefined, chat: () => undefined };
    this.toasts = document.createElement("div");
    this.toasts.id = "toasts";
    document.body.appendChild(this.toasts);

    root.innerHTML = this.hudTemplate();
    this.els = this.collectRefs();
    this.chatRow = this.must("#chat-row");
    this.chatInput = this.must("#chat-input") as HTMLInputElement;
    this.chatLog = this.must("#chat-log");
    this.chatHint = this.must("#chat-hint");
    this.bindUi();
  }

  private must<T extends Element = HTMLElement>(sel: string): T {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`[ui] missing ${sel}`);
    return el as T;
  }

  private hudTemplate(): string {
    return `
      <div class="hud" id="hud">
        <div class="hud-left">
          <div class="frame player-frame">
            <div class="pf-top">
              <div class="pf-sigil" id="pf-sigil">@</div>
              <div class="pf-id">
                <div class="pf-name"><b id="pf-name">Wanderer</b><span class="cls" id="pf-class">Vanguard</span><span class="lv" id="pf-level">LV 1</span></div>
                <div class="pf-region" id="pf-region">Hearthvale</div>
              </div>
            </div>
            <div class="pf-bars">
              <div class="bar hp"><div class="fill" id="hp-fill"></div><span class="lbl" id="hp-lbl">100 / 100</span></div>
              <div class="bar mp"><div class="fill" id="mp-fill"></div><span class="lbl" id="mp-lbl">50 / 50</span></div>
              <div class="bar sta"><div class="fill" id="sta-fill"></div></div>
              <div class="bar xp"><div class="fill" id="xp-fill"></div><span class="lbl" id="xp-lbl">0 xp</span></div>
            </div>
            <div class="pf-meta">
              <span class="gold" id="pf-gold">◈ 0</span>
              <span id="pf-online">1 online</span>
              <span class="ping" id="pf-ping">— ms</span>
            </div>
            <div class="buffs" id="buffs"></div>
          </div>
        </div>

        <div class="hud-top">
          <div class="region-plate">
            <span class="region-name" id="region-name">The Verdant Reach</span>
            <span class="region-sub" id="region-sub">Green things still fight for the light</span>
            <span class="region-clock"><span id="clock">06:00</span><span class="w" id="weather">clear skies</span></span>
          </div>
          <div class="frame target-frame hidden" id="target-frame">
            <div class="tf-top">
              <span class="tf-name" id="target-name">—</span>
              <span class="tf-badges" id="target-badges"></span>
              <span class="tf-level" id="target-level"></span>
            </div>
            <div class="bar mob" id="target-bar"><div class="fill" id="target-fill"></div></div>
          </div>
        </div>

        <div class="hud-right">
          <div class="frame minimap-frame">
            <div class="frame-title"><span>THE REACH</span><span class="sub" id="mm-region">WORLD</span></div>
            <canvas id="minimap"></canvas>
            <div class="mm-foot"><span id="mm-coords">0, 0</span><span id="mm-zone">HEARTHVALE</span></div>
          </div>
          <div class="frame quest-tracker">
            <div class="frame-title"><span>JOURNAL</span><span class="sub"><kbd>J</kbd></span></div>
            <div class="qt-body" id="quest-body"></div>
          </div>
        </div>

        <div class="hud-bottom-left">
          <div class="chat-log" id="chat-log"></div>
          <div class="chat-input-row hidden" id="chat-row">
            <span class="prompt">&gt;</span>
            <input id="chat-input" maxlength="220" autocomplete="off" spellcheck="false" placeholder="Say something…  /w Name message  /p message" />
            <span class="hint">Enter send · Esc cancel</span>
          </div>
          <div class="chat-hint" id="chat-hint">[Enter] speak · [E] interact · [M] map · [H] help</div>
        </div>

        <div class="hud-bottom">
          <div class="skillbar" id="skillbar"></div>
          <div class="potion-belt" id="potion-belt">
            <div class="potion" id="potion-hp" data-act="quaff" data-id="hp" title="Quaff healing potion">
              <span class="pg" style="color:#e0705a">!</span><span class="pn">HEAL</span><span class="pq" id="potion-hp-qty">0</span><span class="pk">Q</span>
            </div>
            <div class="potion" id="potion-mp" data-act="quaff" data-id="mp" title="Quaff mana potion">
              <span class="pg" style="color:#6fa8d8">¡</span><span class="pn">MANA</span><span class="pq" id="potion-mp-qty">0</span><span class="pk">F</span>
            </div>
          </div>
          <div class="status-line" id="status-line">&nbsp;</div>
        </div>

        <div class="hud-bottom-right">
          <div class="combat-badge hidden" id="combat-badge">⚔ IN COMBAT</div>
        </div>
      </div>
    `;
  }

  private collectRefs(): Ui["els"] {
    return {
      hud: this.must("#hud"),
      sigil: this.must("#pf-sigil"),
      name: this.must("#pf-name"),
      cls: this.must("#pf-class"),
      lv: this.must("#pf-level"),
      region: this.must("#pf-region"),
      hpFill: this.must("#hp-fill"), hpLbl: this.must("#hp-lbl"),
      mpFill: this.must("#mp-fill"), mpLbl: this.must("#mp-lbl"),
      staFill: this.must("#sta-fill"), staLbl: this.must("#sta-fill").parentElement as HTMLElement,
      xpFill: this.must("#xp-fill"), xpLbl: this.must("#xp-lbl"),
      gold: this.must("#pf-gold"), online: this.must("#pf-online"), ping: this.must("#pf-ping"),
      buffs: this.must("#buffs"),
      regionName: this.must("#region-name"), regionSub: this.must("#region-sub"),
      clock: this.must("#clock"), weather: this.must("#weather"),
      target: this.must("#target-frame"), targetName: this.must("#target-name"),
      targetLv: this.must("#target-level"), targetBar: this.must("#target-bar"),
      targetFill: this.must("#target-fill"), targetBadges: this.must("#target-badges"),
      minimap: this.must("#minimap") as HTMLCanvasElement,
      mmFoot: this.must("#mm-coords"),
      questBody: this.must("#quest-body"),
      skillbar: this.must("#skillbar"),
      potionHp: this.must("#potion-hp"), potionHpQty: this.must("#potion-hp-qty"),
      potionMp: this.must("#potion-mp"), potionMpQty: this.must("#potion-mp-qty"),
      status: this.must("#status-line"),
      combat: this.must("#combat-badge")
    };
  }

  private bindUi(): void {
    this.root.addEventListener("click", (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!target) return;
      ev.preventDefault();
      this.actions.action(target.dataset.act ?? "", target.dataset.id, target.dataset.qty);
    });

    document.addEventListener("click", (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!target) return;
      if (this.root.contains(target)) return;
      ev.preventDefault();
      this.actions.action(target.dataset.act ?? "", target.dataset.id, target.dataset.qty);
    });

    // Tooltips via data-tip (pre-escaped HTML).
    document.addEventListener("mouseover", (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el || !el.dataset.tip) {
        this.hideTooltip();
        return;
      }
      this.tooltip.innerHTML = el.dataset.tip;
      this.tooltip.classList.add("visible");
      this.moveTooltip(ev.clientX, ev.clientY);
    });
    document.addEventListener("mousemove", (ev) => {
      if (this.tooltip.classList.contains("visible")) this.moveTooltip(ev.clientX, ev.clientY);
    });
    document.addEventListener("mouseout", (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (el) this.hideTooltip();
    });

    this.chatInput.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        ev.preventDefault();
        const text = this.chatInput.value.trim();
        this.closeChat();
        if (text) {
          this.chatHistory.push(text);
          if (this.chatHistory.length > 40) this.chatHistory.shift();
          this.chatHistoryIdx = -1;
          this.actions.chat(text);
        }
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this.closeChat();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!this.chatHistory.length) return;
        if (this.chatHistoryIdx < 0) this.chatHistoryIdx = this.chatHistory.length;
        this.chatHistoryIdx = Math.max(0, this.chatHistoryIdx - 1);
        this.chatInput.value = this.chatHistory[this.chatHistoryIdx] ?? "";
        this.chatInput.setSelectionRange(this.chatInput.value.length, this.chatInput.value.length);
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (this.chatHistoryIdx < 0) return;
        this.chatHistoryIdx++;
        if (this.chatHistoryIdx >= this.chatHistory.length) {
          this.chatHistoryIdx = -1;
          this.chatInput.value = "";
        } else {
          this.chatInput.value = this.chatHistory[this.chatHistoryIdx] ?? "";
        }
      }
    });
    this.chatInput.addEventListener("blur", () => {
      if (this.chatOpen) this.closeChat();
    });
  }

  private moveTooltip(x: number, y: number): void {
    const pad = 16;
    const rect = this.tooltip.getBoundingClientRect();
    let nx = x + pad;
    let ny = y + pad;
    if (nx + rect.width > window.innerWidth - 8) nx = x - rect.width - pad;
    if (ny + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
    this.tooltip.style.left = `${Math.max(8, nx)}px`;
    this.tooltip.style.top = `${Math.max(8, ny)}px`;
  }

  hideTooltip(): void {
    this.tooltip.classList.remove("visible");
  }

  // ── HUD updates ───────────────────────────────────────────────────────────

  update(now: number): void {
    const w = this.world;
    const self = w.self;
    const data = w.data;
    if (!self || !data) return;
    const def = CLASSES[self.classId];

    this.setText(this.els.sigil, def.glyph);
    this.els.sigil.style.color = def.color;
    this.els.sigil.style.textShadow = `0 0 14px ${def.color}`;
    this.setText(this.els.name, self.name);
    this.setText(this.els.cls, def.name);
    this.setText(this.els.lv, `LV ${self.level}`);
    const region = w.regionName();
    this.setText(this.els.region, `${region.name} · ${region.subtitle}`);
    this.setText(this.els.regionName, region.name.toUpperCase());
    this.setText(this.els.regionSub, region.subtitle);

    const hours = Math.floor(((w.dayTime % 1) + 1) % 1 * 24);
    const mins = Math.floor((((w.dayTime % 1) + 1) % 1 * 24 % 1) * 60);
    this.setText(this.els.clock, `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`);
    this.setText(this.els.weather, WEATHER_LABEL[w.weather] ?? w.weather);

    this.setBar(this.els.hpFill, this.els.hpLbl, self.hp, self.maxHp);
    this.setBar(this.els.mpFill, this.els.mpLbl, self.mp, self.maxMp);
    this.els.staFill.style.width = `${pct(self.stamina, self.maxStamina)}%`;
    this.setText(this.els.xpLbl, `${Math.round(w.xpFraction() * 100)}% xp`);
    this.els.xpFill.style.width = `${pct(self.xp, self.xpNext)}%`;
    this.setText(this.els.gold, `◈ ${data.gold}`);
    this.setText(this.els.online, `${w.online} online`);
    this.setText(this.els.ping, w.latency > 0 ? `${Math.round(w.latency)} ms` : "— ms");

    this.updateTarget();
    this.updateSkills();
    this.updateBuffs();
    this.updateQuestTracker();
    this.updatePotions();
    this.updateStatus();

    this.els.combat.classList.toggle("hidden", !self.inCombat || self.dead);

    if (now - this.lastMinimap > 110) {
      this.lastMinimap = now;
      drawMinimap(this.els.minimap, w);
      this.setText(this.els.mmFoot, `${w.predicted.x.toFixed(0)}, ${w.predicted.y.toFixed(0)}`);
      const zoneEl = this.must("#mm-zone");
      this.setText(zoneEl, w.zone === "crypt" ? "SUNKEN CRYPT" : "ASHEN REACH");
      const regionEl = this.must("#mm-region");
      this.setText(regionEl, w.zone === "crypt" ? "DEPTHS" : "WORLD");
    }
  }

  private updateTarget(): void {
    const w = this.world;
    const id = w.self?.targetId;
    const ent = id ? (w.mobs.get(id) ?? w.players.get(id)) : null;
    if (!ent || ent.dead) {
      this.els.target.classList.add("hidden");
      return;
    }
    this.els.target.classList.remove("hidden");
    this.setText(this.els.targetName, ent.name);
    this.setText(this.els.targetLv, `LV ${ent.level ?? 1}`);
    const hp = ent.hp ?? 0;
    const max = ent.maxHp ?? 1;
    this.els.targetFill.style.width = `${pct(hp, max)}%`;
    this.els.targetBar.className = `bar mob${ent.rare ? " rare" : ""}${ent.boss ? " boss" : ""}${ent.elite ? " elite" : ""}`;
    const badges: string[] = [];
    if (ent.boss) badges.push('<span class="tf-badge boss">BOSS</span>');
    else if (ent.elite) badges.push('<span class="tf-badge elite">ELITE</span>');
    if (ent.rare) badges.push('<span class="tf-badge rare">RARE</span>');
    if (ent.kind === "player") badges.push(`<span class="tf-badge" style="color:#8fd0a0">${esc(ent.className ?? "PLAYER")}</span>`);
    this.els.targetBadges.innerHTML = badges.join("");
  }

  private updateSkills(): void {
    const w = this.world;
    const self = w.self;
    const data = w.data;
    if (!self || !data) return;
    const learned = data.learned;
    const sig = `${self.classId}|${learned.join(",")}`;
    if (sig !== this.skillSig) {
      this.skillSig = sig;
      this.buildSkills();
    }
    const cdMap = new Map(self.cds.map((c) => [c.id, c]));
    for (let i = 0; i < this.skillEls.length; i++) {
      const ability = this.abilityAt(i);
      if (!ability) continue;
      const slot = this.skillEls[i];
      const cd = cdMap.get(ability.id);
      const remain = cd?.remain ?? 0;
      const max = cd?.max ?? 1;
      if (remain > 0.05) {
        slot.cd.style.height = `${Math.min(100, (remain / max) * 100)}%`;
        slot.cdt.textContent = remain >= 1 ? `${Math.ceil(remain)}` : remain.toFixed(1);
      } else {
        slot.cd.style.height = "0%";
        slot.cdt.textContent = "";
      }
      const affordable = self.mp >= ability.cost;
      slot.cost.style.color = affordable ? "#6888a8" : "#b05040";
    }
  }

  private abilityAt(slot: number): AbilityDef | undefined {
    const self = this.world.self;
    if (!self) return undefined;
    return Object.values(ABILITIES).filter((a) => a.classId === self.classId)[slot];
  }

  private buildSkills(): void {
    const w = this.world;
    const self = w.self;
    const data = w.data;
    if (!self || !data) return;
    const abilities = Object.values(ABILITIES).filter((a) => a.classId === self.classId);
    this.els.skillbar.innerHTML = "";
    this.skillEls = [];
    abilities.forEach((ability, index) => {
      const unlocked = data.learned.includes(ability.id);
      const btn = document.createElement("button");
      btn.className = `skill${unlocked ? "" : " locked"}${index === 0 ? " armed" : ""}`;
      btn.dataset.act = "cast-slot";
      btn.dataset.id = String(index);
      btn.innerHTML = `
        <span class="sg" style="color:${ability.color}">${ability.glyph}</span>
        <span class="sk">${index + 1}</span>
        <span class="cost">${ability.cost}</span>
        <span class="nm">${esc(ability.name)}</span>
        <span class="cd"></span>
        <span class="cdt"></span>
        ${unlocked ? "" : `<span class="lr">LV ${ability.unlock}</span>`}
      `;
      btn.dataset.tip = this.abilityTip(ability, unlocked);
      this.els.skillbar.appendChild(btn);
      this.skillEls.push({
        root: btn,
        cd: btn.querySelector(".cd") as HTMLElement,
        cdt: btn.querySelector(".cdt") as HTMLElement,
        cost: btn.querySelector(".cost") as HTMLElement
      });
    });
  }

  private abilityTip(a: AbilityDef, unlocked: boolean): string {
    const lines = [
      `<span class="t-name" style="color:${a.color}">${a.glyph} ${esc(a.name)}</span>`,
      `<span class="t-line">${unlocked ? `Rank ${a.unlock}+` : `Locked — reach level ${a.unlock}`}</span>`,
      `<span class="t-line">${a.cost} mana · ${a.cooldown.toFixed(1)}s cooldown · ${a.range > 0 ? `${a.range} tiles` : "self"}</span>`,
      `<span class="t-line">${esc(a.desc)}</span>`
    ];
    return lines.join("<br>");
  }

  markArmedSlot(slot: number): void {
    this.skillEls.forEach((s, i) => s.root.classList.toggle("armed", i === slot));
  }

  private updateBuffs(): void {
    const self = this.world.self;
    if (!self) return;
    const buffs = self.buffs;
    const sig = buffs.map((b) => `${b.id}:${Math.ceil(b.remaining)}`).join("|");
    if (sig === this.buffSig) return;
    this.buffSig = sig;
    this.els.buffs.innerHTML = buffs.map((b) =>
      `<span class="buff" style="color:${b.color}" title="${esc(b.name)}"><span>${b.glyph}</span>${esc(b.name)}<small>${Math.ceil(b.remaining)}s</small></span>`
    ).join("");
  }

  private updateQuestTracker(): void {
    const w = this.world;
    const quests = w.activeQuests();
    const sig = quests.map((q) => `${q.def.id}:${q.state.progress.join(",")}:${q.done}`).join("|");
    if (sig === this.questSig) return;
    this.questSig = sig;
    if (!quests.length) {
      this.els.questBody.innerHTML = '<div class="qt-empty">No tasks. Seek Elder Marrow in Hearthvale.</div>';
      return;
    }
    this.els.questBody.innerHTML = quests.map(({ def, state, done }) => {
      const objectives = def.objectives.map((o, i) => {
        const count = Math.min(o.count, state.progress[i] ?? 0);
        const finished = count >= o.count;
        return `<div class="qt-obj${finished ? " done" : ""}">${esc(o.label)} ${count}/${o.count}</div>`;
      }).join("");
      return `<div class="qt-quest"><div class="qt-name">${done ? '<span class="done">◆</span> ' : ""}${esc(def.name)}</div>${objectives}</div>`;
    }).join("");
  }

  private updatePotions(): void {
    const w = this.world;
    const hp = w.potionCount("hp");
    const mp = w.potionCount("mp");
    this.setText(this.els.potionHpQty, String(hp));
    this.setText(this.els.potionMpQty, String(mp));
    this.els.potionHp.classList.toggle("empty", hp === 0);
    this.els.potionMp.classList.toggle("empty", mp === 0);
  }

  private updateStatus(): void {
    const w = this.world;
    const self = w.self;
    if (!self) return;
    let text = "";
    if (self.dead) text = "You have fallen · press <b>R</b> to rise at your last shrine";
    else {
      const hint = w.interactHint();
      if (hint) text = `<b>E</b> · ${esc(hint.label)}`;
      else if (self.autoAttack) text = "Auto-attack <b>ON</b> · <b>Space</b> to stop · <b>Tab</b> to switch foe";
      else if (w.casts.length) text = "Move out of the marked ground";
      else text = "WASD move · 1–6 skills · right-click cast · <b>Tab</b> target · <b>H</b> help";
    }
    if (text !== this.statusCache) {
      this.statusCache = text;
      this.els.status.innerHTML = text;
    }
  }

  private setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  private setBar(fill: HTMLElement, label: HTMLElement, cur: number, max: number): void {
    fill.style.width = `${pct(cur, max)}%`;
    this.setText(label, `${Math.round(cur)} / ${Math.round(max)}`);
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  appendLog(entry: LogEntry): void {
    const row = document.createElement("div");
    const channel = entry.channel;
    row.className = `chat-line ${channel === "system" ? "sys" : channel === "loot" ? "loot" : channel === "combat" ? "combat" : channel === "whisper" ? "whisper" : channel === "party" ? "party" : channel === "world" ? "world" : "say"}`;
    const chLabel = channel === "say" ? "" : channel === "combat" ? "" : channel === "loot" ? "" : channel;
    const ch = chLabel ? `<span class="ch">${esc(chLabel)}</span>` : "";
    const from = entry.from ? `<span class="fr">${esc(entry.from)}</span>` : "";
    const text = `<span class="tx">${esc(entry.text)}</span>`;
    row.innerHTML = `${ch}${from}${text}`;
    if (entry.color) {
      const tx = row.querySelector(".tx") as HTMLElement | null;
      if (tx) tx.style.color = entry.color;
    }
    this.chatLog.appendChild(row);
    while (this.chatLog.children.length > 80) this.chatLog.firstElementChild?.remove();
    window.setTimeout(() => row.classList.add("fade"), 9000);
  }

  appendAllLogs(entries: LogEntry[]): void {
    this.chatLog.innerHTML = "";
    for (const entry of entries.slice(-40)) this.appendLog(entry);
  }

  openChat(prefill = ""): void {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chatRow.classList.remove("hidden");
    this.chatHint.classList.add("hidden");
    this.chatInput.value = prefill;
    this.chatInput.focus();
    this.chatInput.setSelectionRange(prefill.length, prefill.length);
    this.actions.action("chat-open", undefined);
  }

  closeChat(): void {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatRow.classList.add("hidden");
    this.chatHint.classList.remove("hidden");
    this.chatInput.blur();
    this.actions.action("chat-close", undefined);
  }

  isChatOpen(): boolean {
    return this.chatOpen;
  }

  // ── Toasts / overlays ─────────────────────────────────────────────────────

  toast(text: string, kind = ""): void {
    const el = document.createElement("div");
    el.className = `toast ${kind}`.trim();
    el.textContent = text;
    this.toasts.appendChild(el);
    window.setTimeout(() => el.remove(), 3400);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild?.remove();
  }

  showHud(show: boolean): void {
    this.els.hud.classList.toggle("hidden", !show);
  }

  setTitleMode(on: boolean): void {
    this.screen.classList.toggle("title-mode", on);
  }

  openPanel(id: PanelId, title: string, sigil: string, bodyHtml: string, opts?: { wide?: boolean; narrow?: boolean; sub?: string; foot?: string }): void {
    this.hideTooltip();
    this.closePanel(true);
    this.currentPanel = id;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "panel-backdrop";
    const size = opts?.wide ? " wide" : opts?.narrow ? " narrow" : "";
    backdrop.innerHTML = `
      <div class="panel${size}">
        <div class="panel-head">
          <span class="sigil">${sigil}</span>
          <div><h2>${esc(title)}</h2>${opts?.sub ? `<div class="sub">${esc(opts.sub)}</div>` : ""}</div>
          <span class="spacer"></span>
          <button class="panel-close" data-act="panel-close" aria-label="Close">✕</button>
        </div>
        <div class="panel-body" id="panel-body">${bodyHtml}</div>
        ${opts?.foot ? `<div class="panel-foot">${opts.foot}<span class="spacer"></span><kbd>Esc</kbd></div>` : ""}
      </div>
    `;
    backdrop.addEventListener("mousedown", (ev) => {
      if (ev.target === backdrop) this.closePanel();
    });
    this.screen.appendChild(backdrop);
    this.panelEl = backdrop;
  }

  refreshPanelBody(bodyHtml: string): void {
    this.hideTooltip();
    const body = this.panelEl?.querySelector("#panel-body");
    if (body) body.innerHTML = bodyHtml;
  }

  closePanel(silent = false): void {
    this.hideTooltip();
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    const wasOpen = this.currentPanel;
    this.currentPanel = null;
    if (!silent && wasOpen) this.actions.action("panel-closed", undefined);
  }

  showDeath(countdown: number): void {
    if (!this.deathEl) {
      const el = document.createElement("div");
      el.className = "death-wrap";
      el.id = "death-overlay";
      el.innerHTML = `
        <div class="death-title">YOU HAVE FALLEN</div>
        <div class="death-sub">The Reach does not mourn · but it remembers</div>
        <div class="death-count" id="death-count">${Math.max(0, Math.ceil(countdown))}</div>
        <div class="death-note">Your body will be carried to the last shrine you touched. A tenth of your purse is lost to the dark.</div>
        <div class="death-actions"><button class="btn primary" data-act="respawn">RISE AGAIN <span class="key">R</span></button></div>
      `;
      this.screen.appendChild(el);
      this.deathEl = el;
    } else {
      const count = this.deathEl.querySelector("#death-count");
      if (count) count.textContent = String(Math.max(0, Math.ceil(countdown)));
    }
  }

  updateDeath(countdown: number): void {
    if (!this.deathEl) return;
    const count = this.deathEl.querySelector("#death-count");
    if (count) count.textContent = String(Math.max(0, Math.ceil(countdown)));
  }

  hideDeath(): void {
    this.deathEl?.remove();
    this.deathEl = null;
  }

  showDisconnect(message: string): void {
    this.hideDisconnect();
    const el = document.createElement("div");
    el.className = "modal-backdrop";
    el.id = "disconnect-overlay";
    el.innerHTML = `
      <div class="panel narrow">
        <div class="panel-head"><span class="sigil">✕</span><div><h2>Connection Lost</h2><div class="sub">the veil thins</div></div></div>
        <div class="panel-body">
          <div class="dialog-text">${esc(message)}</div>
          <p style="font-size:11px;color:var(--dim);line-height:1.6">Your character has been saved. The Reach will remember your name.</p>
        </div>
        <div class="panel-foot"><button class="btn primary" data-act="disconnect-return">RETURN TO TITLE</button><span class="spacer"></span></div>
      </div>
    `;
    this.screen.appendChild(el);
    this.disconnectEl = el;
  }

  hideDisconnect(): void {
    this.disconnectEl?.remove();
    this.disconnectEl = null;
  }

  toggleCrt(): boolean {
    const crt = document.getElementById("crt");
    if (!crt) return false;
    crt.classList.toggle("off");
    return crt.classList.contains("off");
  }

  itemTooltip(item: Item): string {
    return itemTooltipHtml(item);
  }

  questProgressText(id: string): string {
    const w = this.world;
    const q = w.data?.quests.find((x) => x.id === id);
    if (!q) return "";
    const def = QUESTS[id];
    if (!def) return "";
    return def.objectives.map((o, i) => `${o.label} ${Math.min(o.count, q.progress[i] ?? 0)}/${o.count}`).join(" · ");
  }
}

// ── Item tooltip ────────────────────────────────────────────────────────────

const RARITY_HEX: Record<string, string> = {
  common: "#a8a49a",
  uncommon: "#79c46a",
  rare: "#5fa8e8",
  epic: "#c07ae8",
  legendary: "#f0a03c"
};

const STAT_LABEL: Record<string, string> = {
  str: "Strength",
  agi: "Agility",
  int: "Intellect",
  vit: "Vitality",
  armor: "Armor",
  attack: "Attack Power",
  spell: "Spell Power",
  crit: "Critical Strike",
  haste: "Haste",
  lifesteal: "Life Steal",
  hp: "Health",
  mp: "Mana"
};

export function itemTooltipHtml(item: Item): string {
  const color = RARITY_HEX[item.rarity] ?? "#a8a49a";
  const lines: string[] = [];
  lines.push(`<div class="t-name" style="color:${color}">${esc(item.name)}</div>`);
  lines.push(`<div class="t-line">${item.rarity.toUpperCase()}${item.slot ? ` · ${item.slot.toUpperCase()}` : ""}${item.ilvl ? ` · ilvl ${item.ilvl}` : ""}</div>`);
  if (item.stats) {
    for (const [key, value] of Object.entries(item.stats)) {
      if (!value) continue;
      const isPct = key === "crit" || key === "haste" || key === "lifesteal";
      lines.push(`<div class="t-good">+${value}${isPct ? "%" : ""} ${STAT_LABEL[key] ?? key}</div>`);
    }
  }
  if (item.consumable) {
    if (item.consumable.hp) lines.push(`<div class="t-good">Restores ${item.consumable.hp} health</div>`);
    if (item.consumable.mp) lines.push(`<div class="t-good">Restores ${item.consumable.mp} mana</div>`);
    if (item.consumable.teleport) lines.push(`<div class="t-good">Returns you to Hearthvale</div>`);
  }
  if (item.desc) lines.push(`<div class="t-line">${esc(item.desc)}</div>`);
  if (item.stackable && item.qty > 1) lines.push(`<div class="t-line">Quantity: ${item.qty}</div>`);
  lines.push(`<div class="t-gold">Value: ${item.value * item.qty}g</div>`);
  lines.push(`<div class="t-line">Use or equip from the pack · hover a slot for its actions</div>`);
  return lines.join("<br>");
}
