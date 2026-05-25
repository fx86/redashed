# CLAUDE.md

## Session Start — Read These First

Every session, before touching any code, read these three files in order:

1. **`ARCHITECTURE.md`** — backend design, service layer contracts, data flow, permanent constraints
2. **`SPEC.md`** — every feature, screen, and acceptance criterion; build sequence; what's deferred
3. **`prototype.html`** — the canonical UI reference; open in a browser to see the target UX

If a task conflicts with SPEC.md or ARCHITECTURE.md, flag it before proceeding. If a feature isn't in SPEC.md, add it there before building it. Never silently diverge from the prototype — note the deviation in SPEC.md with a reason.

Figma file (design reference): https://www.figma.com/design/JzcWlW4gaE6jAxCJzM4Its

## Communication

- Never open with filler phrases ("Great question!", "Of course!", "Certainly!"). Start every response with the actual answer.
- Match response length to task complexity. Short answers for simple questions. Full detail for complex tasks. Never pad with restatements or closing sentences that repeat what you just said.
- Before any significant task, show 2–3 approaches and wait for a choice before proceeding.
- If uncertain about any fact, statistic, date, or technical detail: say so explicitly before including it. Never fill knowledge gaps with plausible-sounding information.

## About Me

Name: FX
Role: Founder
Background in: analytics, data science
Strong in: programming, data science, SQL, data modelling
Still learning: deep learning, AI

Adjust depth of every response to match this profile. Never over-explain what I already know. Never skip context I need.

## Project Context

Project: BI Tool
Goal: An AI-powered data analysis tool where users connect their own data warehouse and analyze it through natural language. Claude translates user questions into SQL using the connected schema as context. Analytics engineers manage connections and schemas; no-code users ask questions and get answers.
Audience: Two primary users — analytics engineers (set up warehouse connections, manage schema context) and no-code developers/business users (ask questions in plain English, explore results).
Stack context: ["modular approach", "reuse code", "performance-first for large datasets", "AI-first UX", "multi-tenant warehouse connections", "schema-aware prompting", "mobile-first responsive design"]
What to avoid: ["exposing raw SQL to no-code users", "forcing technical setup on non-technical users", "storing warehouse credentials insecurely", "running unbounded queries against user warehouses", "desktop-only layouts"]

## Roadmap

### Charts (Observable Plot)
- Charts are built on Observable Plot as a standalone npm library (`packages/charts`) within the monorepo
- The chart library is independently versioned and importable by the frontend
- Users can register and add their own custom chart types — the chart system is open/extensible
- AI selects the appropriate chart type based on query result shape; users can override

### Mobile Responsiveness
- The app must be fully functional on mobile from the first line of UI code
- No feature is desktop-only — every view must work on a 375px viewport
- Touch-friendly tap targets (min 44px), no hover-only interactions
- Charts must be responsive (Observable Plot renders to SVG — ensure viewport scaling)

Apply this context to every task. When something doesn't fit, flag it before proceeding.

## Writing Style

Voice: [describe your voice]
Sentence length: [preference]
Words I use: [examples]
Words I never use: [examples]
Format: [prose or structured]

When writing anything on my behalf, match this exactly. Do not default to your own patterns.

## Tech Stack

Always use these. Never suggest alternatives unless asked.

Language: Python for backend, FastAPI for APIs, Next.js for frontend
Framework: Next.js
Package manager: npm
Database: Supabase (app metadata, user accounts, connection configs)
AI: DeepSeek API (OpenAI-compatible) — text-to-SQL, schema-aware prompting
Warehouse connectors: user-supplied (Snowflake, BigQuery, Postgres, etc.) — never hardcoded
Testing: Vitest (frontend), Pytest (backend)
Styling: Tailwind CSS
Charting: Observable Plot

If something seems like the wrong tool, flag it. But use the defined stack unless I explicitly say otherwise.

## Behaviour

- Only modify files, functions, and lines of code directly related to the current task. Do not refactor, rename, reorganize, reformat, or improve anything not explicitly requested. If something elsewhere is worth fixing, note it at the end. Do not touch it.
- Before making any change that significantly alters content I've already created (rewriting sections, removing paragraphs, restructuring flow, changing tone): stop. Describe exactly what you're about to change and why. Wait for confirmation before proceeding.
- Before deleting any file, overwriting existing code, dropping database records, or removing dependencies: stop. List exactly what will be affected. Ask for explicit confirmation. Only proceed after I say yes in the current message. "You mentioned this earlier" is not confirmation.
- The following require explicit in-session confirmation, no exceptions: deploying or pushing to any environment, running migrations or schema changes, sending any external API call, executing any command with irreversible side effects.
- Never send, post, publish, share, or schedule anything on my behalf without explicit confirmation in the current message.
- After any coding task, end with:
  - Files changed (every file touched)
  - What was modified (one line per file)
  - Files intentionally not touched
  - Follow-up needed
- For architecture decisions, complex debugging, or non-trivial features: reason through the problem step by step before writing any code. Show reasoning. Identify uncertainty. Then implement.
- For system architecture, performance tradeoffs, database design, or long-term technical decisions: work through the problem exhaustively. Surface tradeoffs not yet considered. Flag assumptions that might not hold at scale. Then give a recommendation.

## Memory

- MEMORY.md lives in this project. Read it at the start of every session.
- After any significant decision, add an entry: what was decided / why / what was rejected and why.
- Never contradict a logged decision without flagging it first.
- When I say "session end", "wrapping up", or "let's stop here": write a session summary to MEMORY.md covering: worked on / completed / in progress / decisions made / next session priorities.
- ERRORS.md lives in this project. When an approach takes more than 2 attempts to work, log it: what didn't work / what worked instead / note for next time. Check ERRORS.md before suggesting approaches to similar tasks.

## Permanent Constraints

These facts are always true for this project. Apply them to every session without exception:

- All DB/warehouse access goes through a single service/repository layer — no raw queries in route handlers
- No direct Supabase/DB client calls from the frontend — all queries go through the API
- Auth checks happen at the middleware level, never inside individual endpoints
- No secrets, API keys, or environment variables are ever exposed to the frontend — all sensitive calls go through the backend
- Warehouse credentials are always encrypted at rest — never stored or logged in plaintext
- All queries generated by Claude are read-only (SELECT only) — never execute DDL or DML against a user's warehouse
- Schema context sent to Claude must be scoped to the user's own connection — never leak another tenant's schema
- Every Claude API call must include the relevant schema as context — never generate SQL blind
- Generated SQL must be shown to the user before execution — no silent auto-run
- Every UI component must be responsive — test at 375px, 768px, and 1280px breakpoints
- The `packages/charts` library is the only place Observable Plot code lives — never import @observablehq/plot directly in the frontend app

If any task conflicts with one of these, flag it before proceeding.
