# Decision-Layer RL Environment Demo

Single-page interactive demo: a **task-level RL environment** for the decision layer (planner) of a deployed service robot. Everything runs client-side — no backend, no physics, no robot time.

**DECISION-LAYER ENVIRONMENT** with dual scripted policies (BASELINE vs TRAINED), a stochastic executor, live streaming HUD, episode scorecard, and 100-episode batch comparison. Optional **measured** bars show offline LLM planner eval results (committed JSON only — the web app stays static and keyless).

> Scripted statistics carry: **simulated — illustrative data**.  
> Measured LLM bars carry: **measured — real model runs**.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production bundle → dist/ (+ CI bundle guard)
npm run preview  # serve dist/
npm test         # vitest unit tests
```

Deploy `dist/` to Vercel or GitHub Pages. **No environment variables required** for the web app.

## Domains (`?domain=`)

| URL | Domain |
|-----|--------|
| `/` or `/?domain=hospitality` | Hotel guest laundry packaging (default) |
| `/?domain=folding` | Commercial laundry folding |

Unknown values fall back to hospitality.

## Views

| URL | View |
|-----|------|
| `/` or `?view=live` | LIVE streaming workcell (default) |
| `/?view=results` | RESULTS — 1,000-episode batch dashboard |
| `/?domain=folding&view=results` | RESULTS for folding domain |

RESULTS runs a fixed-seed 1,000-episode batch on first open (cached per domain), with headline delta cards, dumbbell chart, and a 50×20 episode strip per policy.

## Controls (LIVE)

- **BASELINE / TRAINED** — scripted pre-/post-training planner
- **1x / 4x** — stream speed (default delay 150ms)
- **SKIP** — finish current episode instantly → scorecard
- **NEW EPISODE** — new seeded scenario
- **RUN 100** — fast batch eval, side-by-side failure taxonomy (plus measured columns when present)

## Architecture

- `src/config/` — domain configs + resolver
- `src/engine/` — RNG streams, episode gen, executor, planners (incl. LLM adapter + serializer), score, batch
- `src/copy/traces.ts` — planner/OBS templates
- `src/components/` — HUD panels
- `scripts/eval-llm.ts` — **Node-only** offline LLM eval driver (not in the Vite bundle)
- `scripts/prompts/planner-system.md` — auditable system prompt for LLM planners
- `public/results/measured.<domain>.json` — optional committed measured bars

### RNG streams

From each master seed:

1. `streamEpisode` — items, manifest, capacity, skill jitter
2. `streamExecutorBaseline` — baseline executor + flaw rolls
3. `streamExecutorTrained` — trained executor + residual rolls
4. `exec-llm-<modelId>` — LLM episode executor stream (offline eval only)

## LLM planner evaluation (offline)

The web demo never calls a model API. Measure real LLMs as System 01 planners with the Node driver.

### Prerequisites

```bash
export OPENROUTER_API_KEY=sk-or-...
npm install
```

System prompt (auditable): [`scripts/prompts/planner-system.md`](scripts/prompts/planner-system.md).

Pipeline smoke (no API key — local heuristic planner):

```bash
npm run eval:llm -- --mock --domain hospitality --episodes 5 --concurrency 2
```

### Reproduce measured results

Dry-run first (5 episodes) to estimate cost, then full 30×2 domains.

```bash
# 1) Small open model — dry run (cost check)
npm run eval:llm -- --model meta-llama/llama-3.1-8b-instruct --domain hospitality --episodes 5 --concurrency 2
# Note total_cost_estimate_usd from the log, then full run:
npm run eval:llm -- --model meta-llama/llama-3.1-8b-instruct --domain hospitality --episodes 30 --concurrency 4
npm run eval:llm -- --model meta-llama/llama-3.1-8b-instruct --domain folding --episodes 30 --concurrency 4

# 2) Mid open model
npm run eval:llm -- --model qwen/qwen-2.5-72b-instruct --domain hospitality --episodes 5 --concurrency 2
npm run eval:llm -- --model qwen/qwen-2.5-72b-instruct --domain hospitality --episodes 30 --concurrency 4
npm run eval:llm -- --model qwen/qwen-2.5-72b-instruct --domain folding --episodes 30 --concurrency 4

# 3) One frontier model
npm run eval:llm -- --model anthropic/claude-sonnet-4 --domain hospitality --episodes 5 --concurrency 2
npm run eval:llm -- --model anthropic/claude-sonnet-4 --domain hospitality --episodes 30 --concurrency 4
npm run eval:llm -- --model anthropic/claude-sonnet-4 --domain folding --episodes 30 --concurrency 4
```

Each run writes `results/<model-slug>.<domain>.json` (PolicyMetrics + invalid actions, mean steps, mean tokens/ep, cost, wall time, prompt hash).

**Publish to the dashboard** by merging run objects into:

```text
public/results/measured.hospitality.json
public/results/measured.folding.json
```

(JSON arrays of `MeasuredRunResult`. Absent file → UI unchanged.)

Sample committed files use `open-small-demo` placeholder numbers so the third column is visible without a key.

### Expected cost (indicative)

From a 5-episode dry run, multiply by 6 for a 30-episode domain, ×2 for both domains. Log line `total_cost_estimate_usd` is the source of truth for your model/provider pricing.

### Bundle safety

`npm run build` runs `scripts/ci-guard-bundle.sh`, which fails if `OPENROUTER` / API key / env references appear under `src/` or in `dist/`.

## Reskin / new deployment

1. Copy `src/config/hospitality.ts` → `src/config/yourdomain.ts`
2. Edit attributes, skills, hazards, rates, copy
3. Register it in `src/config/index.ts`
4. Open `/?domain=yourdomain`

## License

Demo code for illustration.
