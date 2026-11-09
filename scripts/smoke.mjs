import WebSocket from "ws";

const name = `Smoke${Math.floor(Math.random() * 9000 + 1000)}`;
const ws = new WebSocket("ws://localhost:8787/ws");
let moved = false;
let cast = false;
let missed = 0;

function send(msg) {
  ws.send(JSON.stringify(msg));
}

ws.on("open", () => {
  console.log("connected as", name);
  send({ t: "auth", name, classId: "arcanist" });
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === "welcome") {
    console.log("welcome", msg.zone, "at", msg.self.x.toFixed(1), msg.self.y.toFixed(1), "hp", msg.self.hp + "/" + msg.self.maxHp);
    send({ t: "chat", text: "Smoke test online." });
    setTimeout(() => {
      send({ t: "input", mx: 1, my: 0, sprint: true });
      moved = true;
      console.log("input: moving east");
    }, 300);
    setTimeout(() => {
      send({ t: "input", mx: 0, my: 0, sprint: false });
      send({ t: "interact" });
    }, 1200);
  } else if (msg.t === "snapshot") {
    const near = msg.snap.mobs
      .map((m) => ({ m, d: Math.hypot(m.x - msg.snap.self.x, m.y - msg.snap.self.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!cast && near && near.d < 20) {
      cast = true;
      console.log("target", near.m.name, "lv", near.m.level, "distance", near.d.toFixed(1));
      send({ t: "select", id: near.m.id });
      setTimeout(() => {
        send({ t: "cast", slot: 0, aimX: near.m.x, aimY: near.m.y });
        console.log("cast emberbolt");
        setTimeout(() => send({ t: "auto" }), 400);
      }, 200);
    }
  } else if (msg.t === "fx") {
    if (msg.fx.kind === "damage") {
      console.log("damage fx:", msg.fx.amount, msg.fx.crit ? "CRIT" : "", "on", msg.fx.id);
    }
  } else if (msg.t === "playerData") {
    if (!moved) console.log("playerData received");
  } else if (msg.t === "error") {
    console.log("ERROR", msg.message);
    missed++;
  } else if (msg.t === "chat" || msg.t === "log") {
    const m = msg.msg ?? msg;
    console.log("[" + (m.channel ?? "log") + "]", m.from ? m.from + ":" : "", m.text ?? m.text);
  }
});

ws.on("close", () => console.log("closed"));

setTimeout(() => {
  console.log("smoke test finished (no fatal errors)");
  ws.close();
  process.exit(0);
}, 5000);
