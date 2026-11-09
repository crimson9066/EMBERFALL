import type { Renderer } from "./render";
import type { World } from "./state";

export type KeyHandler = (key: string, ev: KeyboardEvent) => void;
export type MouseHandler = (button: number, sx: number, sy: number, ev: MouseEvent) => void;

const MOVE_KEYS = new Set([
  "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"
]);

/** Raw input capture. Gameplay decisions stay in main; this only normalises. */
export class InputManager {
  private world: World;
  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private keyHandlers = new Set<KeyHandler>();
  private mouseHandlers = new Set<MouseHandler>();
  private wheelHandlers = new Set<(delta: number) => void>();
  private lastMouse = { x: 0, y: 0 };

  constructor(world: World, renderer: Renderer, canvas: HTMLCanvasElement) {
    this.world = world;
    this.renderer = renderer;
    this.canvas = canvas;
    this.bind();
  }

  onKey(fn: KeyHandler): () => void {
    this.keyHandlers.add(fn);
    return () => this.keyHandlers.delete(fn);
  }

  onMouse(fn: MouseHandler): () => void {
    this.mouseHandlers.add(fn);
    return () => this.mouseHandlers.delete(fn);
  }

  onWheel(fn: (delta: number) => void): () => void {
    this.wheelHandlers.add(fn);
    return () => this.wheelHandlers.delete(fn);
  }

  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    return { x, y };
  }

  get sprint(): boolean {
    return this.keys.has("shift");
  }

  get typing(): boolean {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
  }

  get mouseScreen(): { x: number; y: number } {
    return { ...this.lastMouse };
  }

  clear(): void {
    this.keys.clear();
  }

  private bind(): void {
    window.addEventListener("keydown", (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      const typing = this.typing;
      if (typing) return;

      const isMove = MOVE_KEYS.has(key) || key === "shift";
      const isGameKey = isMove || [" ", "tab", "enter", "escape", "/", "q", "f", "e", "r", "i", "c", "j", "m", "p", "h", "v", "n", "-", "=", "+"].includes(key) ||
        /^[1-6]$/.test(key);
      if (isGameKey) ev.preventDefault();

      this.keys.add(key);
      if (ev.repeat) return;
      for (const fn of this.keyHandlers) {
        try {
          fn(key, ev);
        } catch (err) {
          console.error("[input] key handler", err);
        }
      }
    });

    window.addEventListener("keyup", (ev) => {
      this.keys.delete(ev.key.toLowerCase());
      if (ev.key === "Shift") this.keys.delete("shift");
    });

    window.addEventListener("blur", () => this.keys.clear());

    this.canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

    window.addEventListener("mousemove", (ev) => {
      this.lastMouse = { x: ev.clientX, y: ev.clientY };
      const world = this.renderer.screenToWorld(ev.clientX, ev.clientY);
      this.world.mouse.x = world.x;
      this.world.mouse.y = world.y;
      this.world.mouse.active = true;
    });

    this.canvas.addEventListener("mousedown", (ev) => {
      const world = this.renderer.screenToWorld(ev.clientX, ev.clientY);
      this.world.mouse.x = world.x;
      this.world.mouse.y = world.y;
      this.world.mouse.active = true;
      this.lastMouse = { x: ev.clientX, y: ev.clientY };
      for (const fn of this.mouseHandlers) {
        try {
          fn(ev.button, ev.clientX, ev.clientY, ev);
        } catch (err) {
          console.error("[input] mouse handler", err);
        }
      }
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.world.mouse.active = false;
    });

    window.addEventListener("wheel", (ev) => {
      if (this.typing) return;
      const target = ev.target as HTMLElement | null;
      if (target && target.closest(".panel, .modal-backdrop")) return;
      ev.preventDefault();
      for (const fn of this.wheelHandlers) fn(Math.sign(ev.deltaY));
    }, { passive: false });
  }
}
