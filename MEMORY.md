# MEMORY.md — Querywise

Significant decisions, what was rejected and why. Read at the start of every session.

---

## Architecture Decisions

### All metadata → local Postgres (not Supabase)
**Decided:** 2026-05-24
**Rule:** Except for login/authentication (which stays in Supabase), every piece of app metadata — connections, saved queries, dashboards, tiles, editors, layouts — is stored in local Postgres via `local_db_service.py`.
**Why:** Supabase is the auth layer only. App data lives where we control the schema, migrations, and queries directly. Reduces vendor lock-in and keeps the data model explicit.
**Rejected:** Storing query/dashboard metadata in Supabase tables alongside auth — rejected because it couples app schema evolution to the Supabase dashboard and makes local dev harder.

### Tile schema — FK to saved_queries, no copied columns
**Decided:** 2026-05-24
**Rule:** `dashboard_tiles` stores only `saved_query_id + layout + chart_type + chart_config`. Question, SQL, and connection_id are always read via JOIN from `saved_queries`. No denormalised copies.
**Why:** The original design copied question/sql/connection_id into the tile. When a user renamed a query, the dashboard title didn't update — it was a stale copy. Architecture fix required dropping those columns and migrating to a pure FK reference.
**Rejected:** Propagation approach (update tile columns when query is renamed) — rejected as fragile and complexity not worth it vs a proper FK join.

### Dashboard permissions — owner + editor model
**Decided:** 2026-05-24
**Rule:** Dashboard has one owner (creator). Owners can add editors via `dashboard_editors` table. Editors can change chart types and resize/move tiles. Only the owner can delete the dashboard or manage editors.
**Why:** Simple two-tier model sufficient for v1. Share by user ID (UUID) for now — email lookup deferred.

---

## UI / UX Decisions

### Nav IA — 2 primary links only
**Decided:** 2026-05-24
**Rule:** Primary nav = Dashboards + Queries. Connections lives behind a settings gear icon. "Query editor" link removed (duplicate of "+ New query" button).
**Why:** 4 nav items + CTA button caused redundancy. "Query editor" and "+ New query" both resolved to `/`. Connections is admin setup, not a content view.

### Login — grid background + card
**Decided:** 2026-05-24
**Rule:** Login screen uses a subtle indigo grid background (CSS background-image) + a frosted card container. Google button matches the dark system (gray-800 border, not white).
**Why:** Original white Google button was visually jarring. Content floating on a completely black screen felt unanchored.

### QueryInput — card with inner toolbar
**Decided:** 2026-05-24
**Rule:** The AI query input is a card (rounded-xl, indigo-tinted border) containing the textarea + a toolbar row (mic, hint, Run button). Not a bare textarea.
**Why:** The core product action needs visual weight. A bare form field doesn't communicate that this is the entry point.

---

## Feature Roadmap — Current Priority

| Priority | Feature | Status |
|----------|---------|--------|
| ✅ P0 | Open saved query in editor | Done — click row in /queries → `/?query_id=<id>` loads into SQL editor |
| ✅ P1 | Schema annotations | Done — hover table/column in SchemaPanel to annotate; injected into AI prompt |
| ✅ P2 | Execution time + row count in results header | Done — `QueryResponse.execution_time_ms` shown in results |
| ✅ P2 | Dashboard tile → opens source query | Done — external-link icon on tile header |
| ✅ P3 | Unsaved changes indicator + auto-save draft | Done — amber dot on Save button; localStorage draft restored on reload |
| ✅ P3 | Snowflake connector | Done — Snowflake enabled in form; uses snowflake-connector-python |
| P3 | Migrate connections from Supabase to local Postgres | Done — user_connections table in local Postgres; route migrated from supabase_service |
| Deferred | BigQuery connector | Requires service-account credential file upload — different auth model |
| Deferred | Export CSV | Depends on build-your-own-vis architecture. |
| Deferred | Export image of plot | Depends on build-your-own-vis architecture. |
| Deferred | Alerts | Email alerts on query result thresholds. |
| Deferred | Mobile nav hamburger | Mobile-first layout already works, hamburger menu polish deferred. |
| Deferred | Query versioning | Last 10 versions / history dropdown. |
| Deferred | Share by email | Sharing currently requires Supabase user UUID. Email lookup not built. |

---

## Session Log

### 2026-05-24 (session 1)
- Fixed React hooks violation in DashboardPage (useContainerWidth called after early returns)
- Added dashboard permissions (owner + editor model, `dashboard_editors` table)
- Inline query rename (double-click in queries list)
- Tile schema migration: dropped copied columns, added `saved_query_id` FK + JOIN
- Built "Add to dashboard" flow from queries list
- Added /connections page + nav link
- Fixed SaveToDashboard after schema migration
- Added voice-to-text (Web Speech API) + Cmd+Enter / Cmd+S shortcuts
- Design refresh: login card, nav IA, QueryInput card, dashboard tile header, type scale, unauthenticated redirects

### 2026-05-24 (session 2) — P0–P3 implementation
- P0: Open saved query in editor — `GET /saved-queries/:id`, row click in /queries → `/?query_id=<id>`, page.tsx reads param and pre-populates SQL editor + auto-connects to the right connection
- P1: Schema annotations — `schema_annotations` table + CRUD in local_db_service; `GET/PUT/DELETE /user-connections/:id/annotations`; annotations injected into AI prompt via ai_service; SchemaPanel inline annotation editing (hover → pencil icon)
- P2a: Execution time — `query_service.execute_select` returns `elapsed_ms`; `QueryResponse.execution_time_ms`; shown in ResultsTable
- P2b: Dashboard tile → open in editor — external-link icon on each tile routes to `/?query_id=<saved_query_id>`
- P3a: Unsaved changes — amber dot on Save button when `isDirty`; SQL draft persisted to localStorage and restored on mount
- P3b: Connections migrated from Supabase to local Postgres (`user_connections` table); Snowflake connector enabled with snowflake-connector-python; db_type field added throughout the stack
- Note: BigQuery deferred (requires service-account file upload, different auth model)
