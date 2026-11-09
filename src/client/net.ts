import type { ClientMsg, ServerMsg } from "../shared/types";

type Handler<T extends ServerMsg["t"]> = (msg: Extract<ServerMsg, { t: T }>) => void;

/** Small typed WebSocket transport with ping measurement and clean teardown. */
export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(msg: ServerMsg) => void>>();
  private openHandlers = new Set<() => void>();
  private closeHandlers = new Set<(reason: string) => void>();
  private pingTimer: number | null = null;
  private pingSentAt = 0;

  latency = 0;
  open = false;

  connect(): Promise<void> {
    if (this.ws) this.close();
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      let settled = false;

      ws.onopen = () => {
        this.open = true;
        settled = true;
        this.startPing();
        this.openHandlers.forEach((fn) => fn());
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("Could not reach the Reach. Is the server running?"));
        }
      };
      ws.onclose = (ev) => {
        this.open = false;
        this.stopPing();
        this.ws = null;
        const reason = ev.reason || (ev.code === 4001 ? "Character entered from another window." : "The connection to the Reach was lost.");
        this.closeHandlers.forEach((fn) => fn(reason));
      };
      ws.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMsg;
        } catch {
          return;
        }
        this.route(msg);
      };
    });
  }

  on<T extends ServerMsg["t"]>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = fn as (msg: ServerMsg) => void;
    set.add(wrapped);
    return () => set?.delete(wrapped);
  }

  onOpen(fn: () => void): () => void {
    this.openHandlers.add(fn);
    return () => this.openHandlers.delete(fn);
  }

  onClose(fn: (reason: string) => void): () => void {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.open = false;
  }

  private route(msg: ServerMsg): void {
    if (msg.t === "pong") {
      this.latency = Math.max(0, performance.now() - this.pingSentAt);
      return;
    }
    const set = this.handlers.get(msg.t);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(msg);
      } catch (err) {
        console.error("[net] handler failed", msg.t, err);
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    const ping = () => {
      this.pingSentAt = performance.now();
      this.send({ t: "ping", at: this.pingSentAt });
    };
    ping();
    this.pingTimer = window.setInterval(ping, 4000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
