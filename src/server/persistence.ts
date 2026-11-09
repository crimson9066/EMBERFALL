import fs from "node:fs";
import path from "node:path";
import type { PlayerData, ZoneId } from "../shared/types";

export interface StoredChar {
  data: PlayerData;
  token: string;
  zone: ZoneId;
  x: number;
  y: number;
  lastSeen: number;
}

interface StoreFile {
  version: number;
  chars: StoredChar[];
}

export class Store {
  private chars = new Map<string, StoredChar>();
  private dirty = false;
  private lastFlush = 0;
  private readonly file: string;

  constructor(file = path.resolve(process.cwd(), "data", "players.json")) {
    this.file = file;
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.file)) return;
      const raw = fs.readFileSync(this.file, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      if (!Array.isArray(parsed.chars)) return;
      for (const c of parsed.chars) {
        if (c?.data?.name) this.chars.set(c.data.name.toLowerCase(), c);
      }
      console.log(`[store] loaded ${this.chars.size} characters`);
    } catch (err) {
      console.error("[store] failed to load, starting fresh:", err);
      try {
        if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.broken-${Date.now()}`);
      } catch { /* ignore */ }
    }
  }

  get(name: string): StoredChar | undefined {
    return this.chars.get(name.toLowerCase());
  }

  put(c: StoredChar): void {
    c.lastSeen = Date.now();
    this.chars.set(c.data.name.toLowerCase(), c);
    this.dirty = true;
  }

  delete(name: string): void {
    this.chars.delete(name.toLowerCase());
    this.dirty = true;
  }

  all(): StoredChar[] {
    return [...this.chars.values()];
  }

  touch(): void {
    this.dirty = true;
  }

  flush(force = false): void {
    const now = Date.now();
    if (!this.dirty && !force) return;
    if (!force && now - this.lastFlush < 2500) return;
    this.lastFlush = now;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const payload: StoreFile = { version: 1, chars: [...this.chars.values()] };
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      console.error("[store] flush failed:", err);
    }
  }
}
