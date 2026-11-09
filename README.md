# EMBERFALL — The Ashen Reach

A multiplayer ASCII MMORPG rendered entirely with terminal glyphs, box-drawing characters and a synthesized soundtrack. Built with TypeScript, Vite and Canvas 2D on the client, and an authoritative Node.js + `ws` server.

> The Cinderfall did not end the world; it opened a door. Hearthvale keeps the last warm hearth while the Reach grows teeth.

## Run it

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787 (WebSocket at `/ws`, status at `/api/status`)

For a production build:

```bash
npm run build
npm start
```

`npm start` serves the built client from `dist/` and the game server from port `8787`.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| `Shift` | Sprint (drains stamina) |
| `E` | Talk, loot, enter portals, touch shrines |
| Left click | Select a foe and auto-attack |
| Right click | Cast the armed skill at the cursor |
| `1`–`6` | Cast that skill |
| `Tab` | Cycle nearby foes |
| `Space` | Toggle auto-attack |
| `Q` / `F` | Quaff healing / mana potion |
| `I` / `C` / `J` / `P` / `M` / `H` | Pack, character, journal, party, map, help |
| `R` | Rise at your last shrine when dead |
| `V` / `N` | Toggle CRT scanlines / mute audio |
| `Enter` | Chat (`/s`, `/y`, `/w Name`, `/p`, `/help`) |
| `Esc` | Close panels / cancel chat |

Mouse wheel zooms the glyph grid. Hover items and skills for tooltips.

## What is in the Reach

- Four classes with 24 abilities, skill unlocks and class-flavoured starter gear.
- A shared overworld plus the Sunken Crypt dungeon, with deterministic terrain, towns, roads, shrines, portals and weather.
- Server-authoritative combat: auto-attacks, cones, projectiles, telegraphs, heal zones, champion/rare packs and boss abilities.
- Diablo II-inspired loot: rarity colours, affixes, equipment slots, vendors, a potion belt and ground drops with a short owner lock.
- Quest chain from Elder Marrow, a repeatable bounty board, a quest journal and a HUD tracker.
- Parties, shared XP, party chat, whispers, emotes and a `/who` roster.
- Death, gold penalty, shrine return points and respawn.
- Persistent characters in `data/players.json`.
- Terminal UI: Canvas glyph world, DOM panels, minimap/full map, CRT overlay, screen shake, particles and WebAudio effects.

## Architecture

```
src/
  shared/      deterministic worldgen, content tables, formulas, wire/domain types
  server/      authoritative 20 Hz game loop and focused systems
    game.ts    orchestrator, auth, snapshots, persistence facade
    systems/   combat, mobs, player, items, quests, progression, social
  client/      Vite app
    main.ts    bootstrap, network wiring, input routing
    render.ts  Canvas glyph renderer, camera, lighting, weather, minimap
    state.ts   client world state, prediction, snapshots
    ui.ts      HUD, chat, toasts, tooltips, panels, overlays
    screens.ts title, character creation and panel HTML
    input.ts   keyboard/mouse bindings
    audio.ts   synthesized WebAudio
```

The server ticks at 20 Hz, owns movement/combat/loot/quests, and sends snapshots. The client predicts local movement and reconciles against the server, which keeps the game responsive without giving up authority.

## Notes

- No image assets: all visuals are glyphs, CSS and Canvas drawing; all sound is synthesized.
- `window.__emberfall` exposes `{ world, net, renderer, ui, input, audio }` for debugging in the browser console.
