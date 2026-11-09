import { classAbilities } from "../shared/content";
import { dist } from "../shared/formulas";
import type { ClassId } from "../shared/types";
import { AudioEngine } from "./audio";
import { InputManager } from "./input";
import { Net } from "./net";
import { Renderer, drawFullMap } from "./render";
import {
  TitleScreen, buildCharacter, buildDialog, buildHelp, buildInventory, buildMap,
  buildParty, buildQuests, itemForUid
} from "./screens";
import { World } from "./state";
import { Ui, type PanelId } from "./ui";

// ── Bootstrap ────────────────────────────────────────────────────────────────

const canvas = document.getElementById("world") as HTMLCanvasElement | null;
const uiRoot = document.getElementById("ui");
const screenRoot = document.getElementById("screen");
const tooltipRoot = document.getElementById("tooltip");
if (!canvas || !uiRoot || !screenRoot || !tooltipRoot) {
  throw new Error("Emberfall could not find its mount points.");
}
const screenMount: HTMLElement = screenRoot;

const world = new World();
const renderer = new Renderer(canvas, world);
const ui = new Ui(world, uiRoot, screenRoot, tooltipRoot);
const input = new InputManager(world, renderer, canvas);
const audio = new AudioEngine();
const net = new Net();

let armedSlot = 0;
let authed = false;
let inTitle = true;
let deathVisible = false;
let lastInputAt = 0;
let lastAxis = { x: 0, y: 0, sprint: false };
let aimShowUntil = 0;

ui.showHud(false);

const title = new TitleScreen(screenMount, (name, classId, token) => {
  void enterReach(name, classId, token);
});

// Any real gesture wakes the audio context (browsers require this).
const wakeAudio = () => audio.unlock();
window.addEventListener("pointerdown", wakeAudio);
window.addEventListener("keydown", wakeAudio);

// ── Title flow ───────────────────────────────────────────────────────────────

async function enterReach(name: string, classId: ClassId, token: string): Promise<void> {
  audio.unlock();
  try {
    await net.connect();
    net.send({ t: "auth", name, classId, token: token || undefined });
  } catch (err) {
    title.setError(err instanceof Error ? err.message : String(err));
  }
}

function returnToTitle(error = ""): void {
  inTitle = true;
  authed = false;
  deathVisible = false;
  world.reset();
  ui.closePanel(true);
  ui.hideDeath();
  ui.hideDisconnect();
  ui.hideTooltip();
  ui.showHud(false);
  ui.appendAllLogs([]);
  input.clear();
  title.show(error);
}

function setTitleToggle(act: string, label: string): void {
  const button = screenMount.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
  if (button) button.textContent = label;
}

// ── Network handlers ─────────────────────────────────────────────────────────

net.on("welcome", (msg) => {
  title.saveToken(msg.token);
  title.hide();
  inTitle = false;
  authed = true;
  deathVisible = false;
  world.enter(msg);
  ui.showHud(true);
  ui.hideDeath();
  ui.hideDisconnect();
  ui.appendAllLogs(world.logs);
  setArmed(0);
  lastInputAt = 0;
  lastAxis = { x: 0, y: 0, sprint: false };
  audio.fx("respawn");
});

net.on("snapshot", (msg) => {
  world.applySnapshot(msg.snap);
  world.latency = net.latency;
  if (msg.snap.self.dead) {
    deathVisible = true;
    ui.showDeath(msg.snap.self.respawnIn);
  } else if (deathVisible) {
    deathVisible = false;
    ui.hideDeath();
  }
});

net.on("playerData", (msg) => {
  world.applyPlayerData(msg.data);
  refreshOpenPanel();
});

net.on("chat", (msg) => {
  const entry = world.logFromChat(msg.msg);
  ui.appendLog(entry);
});

net.on("log", (msg) => {
  const entry = world.pushLog({ channel: "system", from: "", text: msg.text, color: msg.color });
  ui.appendLog(entry);
});

net.on("toast", (msg) => {
  ui.toast(msg.text, msg.kind ?? "");
  if (msg.kind === "quest") audio.quest();
  else if (msg.kind === "loot") audio.fx("gold");
  else if (msg.kind === "level") audio.fx("levelup");
  else if (msg.kind === "warn") audio.warn();
});

net.on("fx", (msg) => {
  world.spawnFx(msg.fx);
  audio.fx(msg.fx.kind, { crit: msg.fx.crit, amount: msg.fx.amount });
});

net.on("dialog", (msg) => {
  world.dialog = msg.dialog;
  openDialogPanel();
});

net.on("death", (msg) => {
  deathVisible = true;
  ui.showDeath(msg.respawnIn);
  ui.closePanel(true);
});

net.on("levelup", () => {
  // The server already broadcasts the level toast and chat log entry.
  audio.fx("levelup");
});

net.on("zone", (msg) => {
  world.applyZone(msg.zone, msg.seed, msg.x, msg.y, msg.time);
  ui.closePanel(true);
  world.closeDialog();
});

net.on("online", (msg) => {
  world.online = msg.count;
});

net.on("error", (msg) => {
  if (!authed) {
    title.setError(msg.message);
    audio.warn();
    return;
  }
  ui.toast(msg.message, "warn");
  audio.warn();
});

net.onClose((reason) => {
  if (inTitle) return;
  authed = false;
  world.phase = "connecting";
  deathVisible = false;
  ui.hideDeath();
  ui.closePanel(true);
  ui.showDisconnect(reason);
  audio.warn();
});

// ── UI actions ───────────────────────────────────────────────────────────────

ui.actions = {
  action: (act, id, qty) => handleAction(act, id, qty),
  chat: (text) => {
    if (authed) net.send({ t: "chat", text });
  }
};

function handleAction(act: string, id: string | undefined, qty?: string): void {
  if (act !== "title-class" && act !== "title-random" && act !== "title-forget") audio.ui();
  switch (act) {
    case "title-enter":
      title.submit();
      break;
    case "title-class":
      title.select(id ?? "");
      break;
    case "title-random":
      title.randomize();
      break;
    case "title-forget":
      title.forgetToken();
      break;
    case "title-crt": {
      const off = ui.toggleCrt();
      setTitleToggle("title-crt", off ? "CRT: OFF" : "CRT: ON");
      break;
    }
    case "title-mute": {
      audio.unlock();
      const muted = audio.toggleMuted();
      setTitleToggle("title-mute", muted ? "SOUND: OFF" : "SOUND: ON");
      break;
    }
    case "chat-open":
      input.clear();
      break;
    case "chat-close":
      break;
    case "panel-close":
      ui.closePanel();
      break;
    case "panel-closed":
      world.closeDialog();
      break;
    case "cast-slot": {
      const slot = Number(id);
      if (Number.isFinite(slot)) {
        setArmed(slot);
        castSlot(slot);
      }
      break;
    }
    case "quaff":
      if (id === "hp" || id === "mp") net.send({ t: "quaff", kind: id });
      break;
    case "inv-use": {
      const item = itemForUid(world, id);
      if (!item) break;
      net.send({ t: "inv", action: item.slot ? "equip" : "use", uid: item.uid });
      break;
    }
    case "inv-drop":
      if (id) net.send({ t: "inv", action: "drop", uid: id });
      break;
    case "inv-sell":
      if (id) net.send({ t: "inv", action: "sell", uid: id });
      break;
    case "unequip":
      if (id) net.send({ t: "inv", action: "unequip", uid: id });
      break;
    case "quest-accept":
      if (id) net.send({ t: "quest", action: "accept", id });
      break;
    case "quest-turnin":
      if (id) net.send({ t: "quest", action: "turnin", id });
      break;
    case "vendor-buy":
      if (id) net.send({ t: "vendor", action: "buy", id, qty: Math.max(1, Number(qty) || 1) });
      break;
    case "party-invite-prompt":
      ui.openChat("/invite ");
      break;
    case "party-accept":
      net.send({ t: "party", action: "accept" });
      break;
    case "party-leave":
      net.send({ t: "party", action: "leave" });
      break;
    case "respawn":
      net.send({ t: "respawn" });
      break;
    case "disconnect-return":
      net.close();
      returnToTitle();
      break;
    default:
      break;
  }
}

// ── Panels ───────────────────────────────────────────────────────────────────

const PANEL_SIZE: Record<string, "wide" | "narrow" | undefined> = {
  map: "wide",
  help: "wide",
  inventory: "wide"
};

function showPanel(id: PanelId): void {
  const data = world.data;
  if (!data) return;
  const size = PANEL_SIZE[id];
  const opts = { wide: size === "wide", narrow: size === "narrow" };
  switch (id) {
    case "inventory":
      ui.openPanel("inventory", "Pack & Worn", "▣", buildInventory(world), { ...opts, sub: `${data.inventory.length} / 24 slots`, foot: "Click an item to act · hover for details" });
      break;
    case "character":
      ui.openPanel("character", "Character", classAbilities(data.classId)[0]?.glyph ?? "@", buildCharacter(world), { ...opts, sub: `${data.name} · level ${data.level}`, foot: "The Reach remembers every scar" });
      break;
    case "quests":
      ui.openPanel("quests", "Journal", "✎", buildQuests(world), { ...opts, sub: `${world.activeQuests().length} active`, foot: "Speak to quest givers with E" });
      break;
    case "party":
      ui.openPanel("party", "Company", "⚑", buildParty(world), { ...opts, sub: world.party ? `${world.party.members.length} / 5` : "alone", foot: "/invite Name · /accept · /p message" });
      break;
    case "help":
      ui.openPanel("help", "Codex", "?", buildHelp(world), { ...opts, sub: "keys, commands and the road ahead", foot: "Press H or Esc to close" });
      break;
    case "map":
      ui.openPanel("map", world.zone === "crypt" ? "The Sunken Crypt" : "The Ashen Reach", "⌖", buildMap(world), { ...opts, sub: world.regionName().name, foot: "Gold marks your road · purple marks rarity" });
      requestAnimationFrame(() => {
        const mapCanvas = screenMount.querySelector<HTMLCanvasElement>("#full-map");
        if (mapCanvas) drawFullMap(mapCanvas, world);
      });
      break;
    case "dialog":
      openDialogPanel();
      break;
    case "vendor":
      openDialogPanel();
      break;
    default:
      break;
  }
}

function togglePanel(id: PanelId): void {
  if (ui.currentPanel === id) {
    ui.closePanel();
    return;
  }
  showPanel(id);
}

function openDialogPanel(): void {
  const dialog = world.dialog;
  if (!dialog) return;
  const sigil =
    dialog.kind === "vendor" ? "⚖" :
    dialog.kind === "healer" ? "✚" :
    dialog.kind === "quest" ? "✦" :
    dialog.kind === "shrine" ? "☼" :
    dialog.kind === "portal" ? "◇" : "✜";
  ui.openPanel("dialog", dialog.npcName, sigil, buildDialog(world), {
    wide: dialog.kind === "vendor",
    sub: dialog.npcTitle,
    foot: dialog.kind === "vendor" ? "Sable buys at 35% of value · press Esc to leave" : "Press E again to keep talking"
  });
}

function refreshOpenPanel(): void {
  const panel = ui.currentPanel;
  if (!panel) return;
  switch (panel) {
    case "inventory": ui.refreshPanelBody(buildInventory(world)); break;
    case "character": ui.refreshPanelBody(buildCharacter(world)); break;
    case "quests": ui.refreshPanelBody(buildQuests(world)); break;
    case "party": ui.refreshPanelBody(buildParty(world)); break;
    case "help": ui.refreshPanelBody(buildHelp(world)); break;
    case "dialog":
      if (world.dialog) ui.refreshPanelBody(buildDialog(world));
      else ui.closePanel(true);
      break;
    case "map": break;
    default: break;
  }
}

// ── Combat helpers ───────────────────────────────────────────────────────────

function setArmed(slot: number): void {
  if (!world.self) return;
  const abilities = classAbilities(world.self.classId);
  if (!abilities[slot]) return;
  armedSlot = slot;
  ui.markArmedSlot(slot);
  renderer.aimAbility = abilities[slot];
  aimShowUntil = performance.now() + 1100;
}

function castSlot(slot: number): void {
  if (!world.self || !world.data || world.self.dead || !authed) return;
  const ability = classAbilities(world.self.classId)[slot];
  if (!ability) return;
  if (!world.data.learned.includes(ability.id)) {
    ui.toast(`LOCKED — reach level ${ability.unlock}`, "warn");
    audio.warn();
    return;
  }
  aimShowUntil = performance.now() + 700;
  const mouse = world.mouse;
  let ax: number;
  let ay: number;
  if (mouse.active) {
    ax = mouse.x;
    ay = mouse.y;
  } else {
    ax = world.predicted.x + Math.cos(world.facing) * Math.max(1, ability.range);
    ay = world.predicted.y + Math.sin(world.facing) * Math.max(1, ability.range);
  }
  net.send({ t: "cast", slot, aimX: ax, aimY: ay });
}

function selectTarget(id: string | null, beginAuto = false): void {
  net.send({ t: "select", id });
  if (beginAuto && world.self && !world.self.autoAttack && id) net.send({ t: "auto" });
}

function cycleTarget(): void {
  if (!world.self) return;
  const candidates = [...world.mobs.values()]
    .filter((mob) => !mob.dead)
    .sort((a, b) => dist(world.predicted.x, world.predicted.y, a.vx, a.vy) - dist(world.predicted.x, world.predicted.y, b.vx, b.vy));
  if (!candidates.length) {
    selectTarget(null);
    ui.toast("No foes within reach", "warn");
    return;
  }
  const current = world.self.targetId;
  const idx = candidates.findIndex((mob) => mob.id === current);
  const next = candidates[(idx + 1) % candidates.length];
  selectTarget(next.id, true);
}

// ── Input ────────────────────────────────────────────────────────────────────

input.onKey((key) => {
  if (!authed || inTitle) return;
  if (key === "escape") {
    if (ui.currentPanel) ui.closePanel();
    return;
  }
  if (key === "enter" || key === "/") {
    if (!ui.isChatOpen()) ui.openChat(key === "/" ? "/" : "");
    return;
  }
  if (key === "e") {
    net.send({ t: "interact" });
    return;
  }
  if (key === "r") {
    if (world.self?.dead) net.send({ t: "respawn" });
    return;
  }
  if (key === "tab") {
    cycleTarget();
    return;
  }
  if (key === " ") {
    net.send({ t: "auto" });
    return;
  }
  if (key === "q" || key === "f") {
    net.send({ t: "quaff", kind: key === "q" ? "hp" : "mp" });
    return;
  }
  if (key === "i") { togglePanel("inventory"); return; }
  if (key === "c") { togglePanel("character"); return; }
  if (key === "j") { togglePanel("quests"); return; }
  if (key === "p") { togglePanel("party"); return; }
  if (key === "m") { togglePanel("map"); return; }
  if (key === "h") { togglePanel("help"); return; }
  if (key === "v") {
    const off = ui.toggleCrt();
    ui.toast(off ? "CRT off" : "CRT on");
    return;
  }
  if (key === "n") {
    const muted = audio.toggleMuted();
    ui.toast(muted ? "Sound muted" : "Sound on");
    return;
  }
  if (key === "=" || key === "+") {
    renderer.setZoom(renderer.zoom + 0.1);
    return;
  }
  if (key === "-") {
    renderer.setZoom(renderer.zoom - 0.1);
    return;
  }
  if (/^[1-6]$/.test(key)) {
    const slot = Number(key) - 1;
    setArmed(slot);
    castSlot(slot);
  }
});

input.onMouse((button) => {
  if (!authed || world.phase !== "playing") return;
  if (button === 2) {
    castSlot(armedSlot);
    return;
  }
  if (button !== 0) return;
  const mx = world.mouse.x;
  const my = world.mouse.y;
  const item = world.findItemAt(mx, my);
  if (item) {
    net.send({ t: "interact" });
    return;
  }
  const npc = world.findNpcAt(mx, my);
  if (npc) {
    if (dist(world.predicted.x, world.predicted.y, npc.x, npc.y) <= 4) net.send({ t: "interact" });
    else ui.toast("Too far to speak", "warn");
    return;
  }
  const entity = world.findEntityAt(mx, my);
  if (entity) {
    if (entity.kind === "mob") selectTarget(entity.id, true);
    else selectTarget(entity.id);
    return;
  }
  if (world.self?.targetId) selectTarget(null);
});

input.onWheel((delta) => {
  if (!authed) return;
  renderer.setZoom(renderer.zoom - delta * 0.08);
});

// ── Frame loop ───────────────────────────────────────────────────────────────

function updateHover(): void {
  if (world.phase !== "playing" || !world.mouse.active) {
    world.hoverId = null;
    world.hoverItemId = null;
    return;
  }
  const item = world.findItemAt(world.mouse.x, world.mouse.y);
  world.hoverItemId = item?.id ?? null;
  const entity = world.findEntityAt(world.mouse.x, world.mouse.y);
  const npc = entity ? null : world.findNpcAt(world.mouse.x, world.mouse.y);
  world.hoverId = entity?.id ?? npc?.id ?? null;
}

let lastFrame = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;

  const axis = world.phase === "playing" ? input.axis() : { x: 0, y: 0 };
  world.step(dt, axis.x, axis.y, input.sprint);

  if (world.phase === "playing" && authed) {
    updateHover();
    world.latency = net.latency;
    const sprint = input.sprint;
    const changed = axis.x !== lastAxis.x || axis.y !== lastAxis.y || sprint !== lastAxis.sprint;
    if (changed || now - lastInputAt >= 50) {
      net.send({ t: "input", mx: axis.x, my: axis.y, sprint });
      lastAxis = { x: axis.x, y: axis.y, sprint };
      lastInputAt = now;
    }
    ui.update(now);
  }

  if (world.self) {
    const ability = classAbilities(world.self.classId)[armedSlot];
    if (ability) renderer.aimAbility = ability;
    renderer.showAim = now < aimShowUntil;
  } else {
    renderer.aimAbility = null;
    renderer.showAim = false;
  }

  renderer.render(now);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Debug handle for development and smoke tests.
(window as unknown as { __emberfall: unknown }).__emberfall = { world, net, renderer, ui, input, audio };

// ── Boot ─────────────────────────────────────────────────────────────────────

title.show();
