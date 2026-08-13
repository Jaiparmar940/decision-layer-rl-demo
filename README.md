# Decision-Layer RL Environment Demo

> **`demo/live-video` — keep unmerged.** Served at [snlabs.dev/hospitality-env](https://snlabs.dev/hospitality-env/). Live env uses the same seeded scripted Baseline/Trained planners as main.

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
| `/?domain=dynaDelivery` | Commercial laundry: dryer to delivery (sort-to-order) |
| `/?domain=genericFulfillment` | Neutral SKU/tote fulfillment (sort-to-order) |

Unknown values fall back to hospitality. Hospitality and folding are the single-order degenerate case of the same engine.

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

- `src/config/` — domain configs + resolver (`hospitality`, `folding`, `dynaDelivery`, `genericFulfillment`)
- `src/engine/` — RNG streams, episode gen, sort-to-order fulfillment, executor, planners (incl. LLM adapter + serializer), score, batch
- `src/copy/traces.ts` — planner/OBS templates
- `src/components/` — HUD panels
- `scripts/eval-llm.ts` — **Node-only** offline LLM eval driver (not in the Vite bundle)
- `scripts/prompts/planner-system.md` — auditable system prompt for LLM planners
- `public/results/measured.<domain>.json` — optional **real** eval artifacts only (no sample data; absent → no measured bars)

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
cp .env.example .env   # set provider API keys (gitignored)
npm install
```

`eval:llm` loads `.env` automatically. An already-exported key still wins. The web app never reads `.env`.

Default provider is OpenRouter (`OPENROUTER_API_KEY`). Direct OpenAI:

```bash
npm run eval:llm -- --provider openai --model gpt-5.6-sol --domain hospitality --episodes 5 --concurrency 2
```

Uses `OPENAI_API_KEY` and `https://api.openai.com/v1/chat/completions`. Native ids (`gpt-5.6-sol` is the current flagship; `gpt-5.6` aliases to it); a leading `openai/` prefix is stripped. Optional `--base-url` overrides the API root. Cost is the provider’s `usage.cost` when present (no local price table); the run log always prints prompt / completion / reasoning / cached / total tokens.

Direct Gemini (Google AI Studio, `GOOGLE_API_KEY`):

```bash
npm run eval:llm -- --provider google --model gemini-3.5-flash --domain hospitality --episodes 5 --concurrency 2
```

`--model google/gemini-3.5-flash` is accepted; the `google/` prefix is stripped. Hits Gemini’s OpenAI-compatible Chat Completions endpoint. Same cost/token accounting as above. (`gemini-2.5-flash` is closed to new API users.)

The adapter extracts JSON from the reply (direct parse → markdown fences → last `{...}` block) and accepts `action`/`kind` plus snake_case, kebab-case, and camelCase kinds. Invalid steps are histogrammed; if more than 25% of the first 10 steps are invalid the run aborts (adapter/format mismatch, not a model result).

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

Each run writes `results/<model-slug>.<domain>.json` (PolicyMetrics, invalid-action histogram, token breakdown, cost from the provider’s `usage.cost` when present, wall time, prompt hash) and a step-by-step transcript per episode:

```text
results/<model-slug>.<domain>/ep-01.transcript.json
results/<model-slug>.<domain>/ep-01.transcript.md
```

Same schema as Manual run (planner payload, action JSON, executor outcome). `results/` is gitignored. Load a `.transcript.json` in EPISODE REVIEW.

**Publish to the dashboard** by merging **real** run objects (from `eval:llm`, not mocks) into:

```text
public/results/measured.hospitality.json
public/results/measured.folding.json
```

JSON arrays of `MeasuredRunResult`. Entries with `modelId` starting with `sample/` or a non-eval `promptTemplateHash` are rejected at load time. Absent file → UI unchanged (no fabricated placeholders ship in the app).

### Expected cost (indicative)

From a 5-episode dry run, multiply by 6 for a 30-episode domain, ×2 for both domains. Log line `total_cost_estimate_usd` is the source of truth for your model/provider pricing.

### Bundle safety

`npm run build` runs `scripts/ci-guard-bundle.sh` (POSIX `grep`) over `src/` and `dist/assets/` for provider URLs/keys (`OPENROUTER`, `OPENAI_API_KEY`, `api.openai.com`, `sk-or-`, …), then `--self-test` to prove the guard can catch a planted token. A missing scanner fails the build. The Node eval driver in `scripts/` is allowed to talk to providers; the web bundle is not.

## Composite score (deployment-tunable)

The 0–100 composite is a **site policy**, not a universal metric. Weights and safety penalties live in `config.scoring` (defaults in `src/config/scoring.ts`) and are shown in the UI scoring popover.

| Component | Default weight | What it measures |
|-----------|----------------|------------------|
| completion | 50 | `itemsResolved / itemsPresent` × 50 (single-manifest). With `orders`, the term is order-line fulfillment fraction instead. |
| safety | 35 | Starts full; subtract per violation class (unflagged/abandoned, hazard containerized, special mis-containerized, capacity violated; plus optional foreign-object and cross-order). Floor 0. |
| verification | 10 | Manifest mismatch caught when one exists; **full credit if no mismatch existed**. |
| efficiency | 5 | Scaled vs `parSteps`; **zero if the step cap was hit**. |

Hitting the step cap therefore caps the score low by construction (completion collapses if items are unfinished; efficiency is 0). A do-nothing `reInspect` loop cannot look safe: unresolved items fire the unflagged/abandoned class and zero the safety component.

Retune per deployment by editing `scoring` on the domain config. Do not treat the numeral as comparable across sites with different weights.

## Reskin / new deployment

1. Copy `src/config/hospitality.ts` (single-manifest) or `src/config/genericFulfillment.ts` (sort-to-order) → `src/config/yourdomain.ts`
2. Edit attributes, `itemTypes`, `orders`, stream/quality-gate/short-ship, skills, rates, copy, and `scoring` weights. Leave a field off to keep the hospitality degenerate case.
3. Register it in `src/config/index.ts`
4. Open `/?domain=yourdomain`

## License

Demo code for illustration.
