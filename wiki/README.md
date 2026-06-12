# DRAFTMAN 5.0 — Engineering Wiki

Created 2026-06-12 from a full architectural audit session. These documents are the
source of truth for the platform's known issues and improvement roadmap. Cross-reference
IDs are stable: findings are §-numbered, remediation items are R-numbered, growth
investments are I-numbered.

## Contents

| Doc | What it is | Use it when |
|---|---|---|
| [system-map.md](system-map.md) | What the architecture **actually is** today (corrects stale CLAUDE.md) | Onboarding a session; before touching any subsystem |
| [architecture-review.md](architecture-review.md) | Hostile audit: 19 findings with severity, failure scenarios, file:line refs | Before modifying draft, tournament, signup, or verify code |
| [remediation-plan.md](remediation-plan.md) | R1–R19: incremental fixes ordered by risk-per-effort | Picking the next fix to implement |
| [growth-analysis.md](growth-analysis.md) | B/A/I-numbered bottlenecks + investments for 3× growth | Planning any new feature; deciding where structural effort goes |

## Status at time of writing

- Remediation phase: **nothing implemented yet** — R1 (kill `NEXT_PUBLIC_DEV_MODE` in Railway) is the first action
- Live testing started 2026-06-01 (DB purged for it)
- `bot-legacy/` is **deprecated and out of scope** — the live bot is `bot/`
- Project root CLAUDE.md "Architecture" section describes the deleted 13-phase manager bot — **do not trust it**; fixing it is R12

## Key facts that are easy to get wrong

- Real project path: `C:\Users\Laura\.local\bin\Projects\dodtourneys` (not `~\dodtourneys`, which is a different copy)
- Web and bot share one Supabase DB and one Discord bot token; they never import each other's code
- Machine-to-machine auth is a single shared `BOT_SECRET` header
- The draft's snake order is computed **client-side only** (`src/app/events/[id]/draft/page.tsx:189-192`) until R7 lands
- `supabase/` SQL files are run-by-hand worksheets, not applied migrations — whether constraints exist in prod is unverified until R2/R3
