# Ami — Restrained Warm UI (v3)

Same app, same functionality as the last version — this is purely a
visual restyle to compare against the more playful "sticker" version.

## What changed from v2

- **Shadows**: soft ambient shadows only, no hard offset "sticker"
  shadow
- **Borders**: thinner (1.5px), muted ink-tint color instead of solid
  black
- **Removed**: floating star/plus/circle decorations, the handwritten
  Caveat annotation
- **Feature/persona pills**: same shape, quieter default state, color
  fills only on the active selection

Everything functional is identical to v2: WebRTC connection, the
`onTrackStarted` audio fix, live language + persona switching via
`/set-language` and `/set-persona`.

## Setup

```bash
npm install
```

## Run it

Same two-terminal pattern as always:

**Terminal 1:**
```bash
cd path/to/pipecat-quickstart/server
uv run bot.py
```

**Terminal 2:**
```bash
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

## Comparing against v2

Keep both folders around and run one at a time (same backend works for
either) if you want to flip back and forth before deciding which
direction to commit to.
