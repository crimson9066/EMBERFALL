import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { Game } from "./game";

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

const game = new Game();

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname === "/api/status") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      players: game.players.size,
      mobs: game.mobs.size,
      uptime: Math.round(process.uptime()),
      weather: game.weather
    }));
    return;
  }

  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Emberfall server is running. Client dev server: http://localhost:5173\n");
    return;
  }

  const safePath = path.normalize(url.pathname).replace(/^(\.\.[\\/])+/, "");
  let filePath = path.join(DIST, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(DIST)) filePath = path.join(DIST, "index.html");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(DIST, "index.html");
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  game.handleConnection(ws);
});

game.start();

server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  EMBERFALL — The Ashen Reach             ║`);
  console.log(`  ║  http://localhost:${PORT}                    ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});

function shutdown(): void {
  console.log("\n[emberfall] saving the Reach...");
  game.stop();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
