# Decision-Layer RL Environment Demo

Single-page interactive demo: a **task-level RL environment** for the decision layer (planner) of a deployed service robot. Everything runs client-side — no backend, no physics, no robot time.

**DECISION-LAYER ENVIRONMENT** with dual scripted policies (BASELINE vs TRAINED), a stochastic executor, live streaming HUD, episode scorecard, and 100-episode batch comparison.

> All statistics carry the label: **simulated — illustrative data**.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production bundle → dist/
npm run preview  # serve dist/
npm test         # vitest unit tests
```

Deploy `dist/` to Vercel or GitHub Pages. No environment variables required.

## Domains (`?domain=`)

The app selects a task config from the URL at mount:

| URL | Domain |
|-----|--------|
| `/` or `/?domain=hospitality` | Hotel guest laundry packaging (default) |
| `/?domain=folding` | Commercial laundry folding |

Unknown values fall back to hospitality.

Engine code never branches on domain name — vocabulary (ticket/manifest, bag/stack, attributes, skills) lives entirely in config.

## Reskin / new deployment

1. Copy `src/config/hospitality.ts` → `src/config/yourdomain.ts`
2. Edit attributes, skills, hazards, rates, copy
3. Register it in `src/config/index.ts`
4. Open `/?domain=yourdomain`

Planner rates (including trained residual error) live under `plannerRates` in the config — nothing is hardcoded in policy files.

Trace / OBS strings live in `src/copy/traces.ts` as template functions (marked `// TODO(jaivir): rewrite` for hand-edit).

## Controls

- **BASELINE / TRAINED** — scripted pre-/post-training planner
- **1x / 4x** — stream speed (default delay 150ms)
- **SKIP** — finish current episode instantly → scorecard
- **NEW EPISODE** — new seeded scenario
- **RUN 100** — fast batch eval, side-by-side failure taxonomy

Auto-runs one BASELINE episode on cold load.

## Architecture

- `src/config/` — domain configs + resolver
- `src/engine/` — RNG (3 streams), episode gen, executor, planners, score, batch
- `src/copy/traces.ts` — all user-visible reasoning/OBS templates
- `src/components/` — HUD panels
- `src/hooks/useEpisodeRunner.ts` — cancellable live stream

### RNG streams

From each master seed:

1. `streamEpisode` — items, manifest, capacity, skill jitter
2. `streamExecutorBaseline` — baseline executor + flaw rolls
3. `streamExecutorTrained` — trained executor + residual rolls

Same seed ⇒ identical episodes for both policies; policy stochasticity is isolated.

## License

Demo code for illustration.
