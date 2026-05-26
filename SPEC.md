# SPEC.md — Querywise Feature Specification

> Living document. Check boxes off as features ship. Never delete rows — move to ~~strikethrough~~ if descoped with a note.
> Prototype: open `prototype.html` in a browser to see the target UX.
> Architecture: see `ARCHITECTURE.md` for backend design.
> Figma: https://www.figma.com/design/JzcWlW4gaE6jAxCJzM4Its

---

## How to use this file

- Before starting any feature, find it here and confirm scope
- After shipping, check the box and add the PR/commit reference
- If a feature changes from what the prototype shows, note it inline — don't silently diverge
- Add new features at the bottom of the relevant section with `[ ]`

---

## 1. Auth & Onboarding

### 1.1 Sign In
- [ ] Email + password sign in
- [x] SSO (Google OAuth) — working as primary auth method (deviation: spec said placeholder only; Google OAuth is the live auth flow)
- [ ] "Forgot password" flow — email reset link
- [x] Redirect to query editor after sign in
- [ ] Show workspace name in nav after sign in

### 1.2 Sign Up
- [ ] Name + email + password registration
- [ ] Email verification before first login
- [ ] Terms of service acceptance checkbox
- [ ] Redirect to onboarding wizard after registration

### 1.3 Onboarding Wizard
- [ ] Step 1: Add first warehouse connection (skip allowed)
- [ ] Step 2: Test the connection
- [ ] Step 3: Trigger schema introspection
- [ ] Completion → redirect to dashboard

**No role picker.** All users have access to all features. Scrapped in favour of unified UX.

---

## 2. Top Navigation

> Matches prototype: horizontal bar, not sidebar.

- [x] Logo + product name left-aligned
- [x] Nav links: Dashboards · Queries · Alerts · Settings
- [x] Active link has indigo bottom border indicator
- [ ] Global search (opens query search, not a separate page)
- [x] `New query` link → opens editor (deviation: labelled "New query", not a `+` button; opens in AI mode)
- [x] User avatar top right → dropdown: Settings, Sign out
- [ ] Nav is responsive: on mobile, collapses to hamburger menu

---

## 3. Dashboard

> Prototype reference: "Dashboards" tab → Space Ops dashboard

### 3.1 Dashboard List Page
- [x] `/dashboard` route — full-page card grid (deviation: route is `/dashboard` not `/dashboards`)
- [ ] Each card shows: dashboard name, tile count, last updated, owner avatar (name + last updated shown; tile count and avatar not yet)
- [x] Clicking a card opens the dashboard in full-page view
- [ ] Dashboard full-page view will incorporate filter bar in future (§3.6); layout must reserve space for it
- [x] Create new dashboard button — name-only modal, tiles added after
- [ ] Favourite/star a dashboard (starred dashboards appear at top of list)
- [x] Delete dashboard — confirm modal; owner only
- [ ] Empty state: prompt to create first dashboard or connect a data source

### 3.2 Dashboard View
- [x] Dashboard title — inline editable (click to edit; can_edit users only)
- [ ] Last updated timestamp + auto-refresh interval badge
- [x] Grid of widgets (2-column at desktop, 1-column on mobile)
- [ ] Widget types: chart, table, KPI number, text/markdown (chart and KPI done; table and text/markdown not yet)
- [x] `Add widget` → tiles added via Queries list → "Add to dashboard" flow

### 3.3 Widget
- [x] Widget title (editable — click in edit mode; updates saved_query.question)
- [x] Chart rendered via `@bi-tool/charts` (Observable Plot wrapper)
- [x] Chart type auto-selected from result shape; creator/editors can override — persisted to DB
- [x] Resize widget (drag handle) — creator/editors only; layout changes persisted
- [x] Remove widget from dashboard — creator/editors only
- [ ] Click widget → opens source query in editor
- [ ] **Chart type selection lives in the query editor, not the dashboard tile.** Dashboard tiles display the chart type chosen at query save time. Changing chart type requires going back to the query editor. The tile shows no chart-type switcher UI — just the chart, title, and a context menu with "Edit query" and "Remove". (Deviation from current implementation — current build has chart switcher on each tile, which is noisy.)

### 3.6 Dashboard Filters
- [ ] Dashboard-level filter bar above the tile grid
- [ ] Users can add filters from any column used in the dashboard's queries
- [ ] Filter type auto-detected from column data type: date range picker (date/timestamp), dropdown (low-cardinality text), text search (high-cardinality text), numeric range (number)
- [ ] Filters applied client-side where possible; for server-side filtering, re-run the query with a WHERE clause injected
- [ ] Filter state preserved in URL (shareable filtered dashboard links)
- [ ] "Clear all filters" button

### 3.5 Dashboard Permissions
- [x] Creator owns the dashboard; only they can change chart type, resize tiles, delete tiles/dashboard
- [x] Owner can share edit access with other users via `POST /dashboards/{id}/editors` (user ID required)
- [x] Shared editors have same edit rights as owner, except they cannot delete the dashboard or manage editors
- [x] `can_edit` / `is_owner` flags returned on every dashboard response — frontend gates UI accordingly
- [x] Shared dashboards appear in the recipient's dashboard list with a "shared" label
- [ ] Share by email (requires user lookup endpoint — deferred, currently requires user ID)

### 3.4 Dashboard Refresh
- [ ] Manual refresh button
- [ ] Auto-refresh: off / 30s / 1m / 5m / 30m (per dashboard setting)

---

## 4. Query Editor

> Prototype reference: "Query editor" tab. This is the core product surface.

### 4.1 Editor Layout
- [x] Query title — inline editable
- [x] Mode toggle pill: `Write SQL` | `Ask AI`
- [x] Connection selector dropdown — shows user's warehouse connections
- [x] SQL editor pane (always visible and editable regardless of mode)
- [x] Run button
- [x] Results pane below editor
- [x] Save button — saves query with current SQL and title
- [ ] Share button — generates read-only link to query

### 4.2 Write SQL Mode
- [x] Full-width SQL textarea with monospace font
- [x] SQL is editable directly
- [x] No NL input shown in SQL mode
- [x] Switching from AI mode → SQL mode preserves SQL in pane

### 4.3 Ask AI Mode
- [x] Natural language text input shown above SQL editor
- [x] Suggested prompt chips below input
- [x] "Generate SQL" button → triggers AI generation flow
- [ ] AI generation states:
  - [x] Loading state during generation
  - [ ] Step labels update during generation (schema → tables → SQL) — deferred
  - [x] Generated SQL appears in the SQL editor pane (editable)
- [ ] AI chip label: "AI generates SQL · you review & run" — always visible in AI mode
- [x] Switching to SQL mode hides NL input but keeps generated SQL
- [ ] Follow-up questions chips appear after results load

### 4.4 Pre-Run
- [ ] Show estimated scan size (bytes) before run if warehouse supports it
- [ ] Row limit warning if result will exceed configured limit
- [x] SQL is shown to user before execution — no silent auto-run
- [x] Read-only enforcement: backend rejects any non-SELECT

### 4.5 Execution & Results
- [x] Running state with spinner on run button
- [x] Results table below editor on success
- [x] Column headers match SELECT aliases
- [x] Row count + execution time in results header
- [ ] Paginated display (show first 500 rows, load more on scroll)
- [x] Results view toggle: Table | Chart
- [x] Chart view uses `@bi-tool/charts` — auto-selects type from result shape
- [x] **Chart type selector in query editor** (ChartCustomizer component) — persisted with saved query
- [x] Export CSV + PNG buttons
- [x] "Add to dashboard" button → dashboard picker modal
- [x] Error state: warehouse error shown inline, SQL editor stays editable

### 4.7 Query Chaining (Multiple Charts from One Query)
- [ ] After a query runs, user can create multiple "views" of the same result — each with a different chart type and column mapping
- [ ] Each view is a named chart (e.g. "Revenue by Month — Line", "Revenue by Month — Bar")
- [ ] All views share one underlying query execution result; re-running updates all
- [ ] Each view can be independently added to a dashboard as a separate tile
- [ ] Views listed in a tabbed or card layout below the results pane
- [ ] "Add view" button clones the current chart config as a starting point
- [ ] Views are persisted alongside the saved query; no separate query object created

### 4.6 Query Persistence
- [x] Unsaved changes indicator (amber dot on Save button)
- [x] Auto-save draft (local localStorage) — restored on next visit to same connection
- [x] Named save → server, appears in Queries list
- [ ] Query versioning — keep last 10 versions, accessible via history dropdown

---

## 5. Queries List

> Prototype reference: "Queries" tab

- [x] Table: name · last updated · data source · actions
- [x] Search bar — filters by name in real time
- [x] Tabs: All · Recent
- [x] Click row → opens query in editor (loads query at `/` with saved SQL)
- [x] Inline rename
- [x] Delete query
- [x] Add to dashboard from queries list
- [ ] Table: star column, created by column
- [ ] Star / favourite toggle per row — persisted to DB
- [ ] Tabs: My Queries · Favourites (in addition to All · Recent)
- [ ] Filter by data source (connection name dropdown)
- [ ] Tagging — add/remove tags on any query; tags stored as `text[]` on `saved_queries`
- [ ] Filter by tag — tag chips above the table, multi-select
- [ ] Full-text search — search across query title AND SQL content, not just title
- [ ] Query sharing — "Share" button generates a read-only token link; recipient can view result + chart but not edit
- [ ] Share to specific user — share directly to a user by email; appears in their "Shared with me" tab
- [ ] "Shared with me" tab — queries shared by other users
- [ ] "Run" action → opens query in editor and immediately executes it

---

## 6. Warehouse Connections

> No dedicated role for this. Any user can add a connection.

### 6.1 Connection Setup
- [ ] Supported warehouses: Snowflake, BigQuery, Postgres, Redshift, Databricks (Postgres only currently)
- [ ] Warehouse type picker (icon cards) — not built; currently a single form
- [x] Per-warehouse credential form — Postgres (host, port, database, user, password)
- [x] Test connection button — runs `SELECT 1` before saving
- [x] Credentials encrypted at rest (backend encryption)
- [x] Connections listed on `/connections` page
- [ ] Status indicator: Connected (green) / Error (red) / Untested (grey)
- [x] Delete connection — confirm modal; drops connection config and any cached schema; data.gov ingested tables also dropped

### 6.2 Schema Introspection
- [x] Schema introspection on connection select — table tree shown in query editor sidebar (SchemaPanel)
- [ ] Manual re-introspect button on connections page
- [x] Table tree: schema → table → columns (in query editor sidebar)
- [ ] Per-table row count shown
- [ ] Annotation dot: green = described, grey = unannotated

### 6.3 Schema Annotation
- [ ] Editable table description (plain text)
- [ ] Editable per-column description (plain text)
- [ ] Completion indicator: X of Y columns annotated
- [x] Annotations stored in DB, injected into AI prompts (backend annotation service)
- [x] Annotations are optional — AI still works without them

---

## 6b. data.gov Connections

- [x] User can search data.gov datasets by keyword (CKAN API, no key required)
- [x] Search results show datasets with available CSV resources
- [x] "Import" ingests CSV into local Postgres `datagov` schema (500k row cap)
- [x] Ingested dataset appears in connections list with a "GOV" badge
- [x] Queryable via AI and raw SQL exactly like warehouse connections
- [x] Delete drops the ingested table from local Postgres
- [ ] Manual refresh (re-fetch + reload the CSV) — deferred
- [ ] Row count / last ingested timestamp shown on connection card — deferred

### 6c. World Bank Data Portal

- [ ] Search World Bank indicators via World Bank API (no key required)
- [ ] Browse by topic/country/indicator
- [ ] Ingest result as a Postgres table in `public_data` schema, same pattern as data.gov
- [ ] "WB" badge in connection list

### 6d. India Open Data (data.gov.in)

- [ ] Search datasets via data.gov.in CKAN API
- [ ] CSV/JSON resource download and ingest into `public_data` schema
- [ ] "IND" badge in connection list

### 6f. Collaborative Query Combining

- [ ] User A saves a query and shares a dashboard (existing sharing mechanism)
- [ ] User B adds their own query to the same dashboard
- [ ] "Combine" button on any two tiles — opens a join configuration modal
- [ ] Join modal: auto-suggests matching columns by name intersection; user confirms or overrides join key and join type (inner / left / full)
- [ ] Backend materialises both query results into `public_data` schema as temp tables, executes the join, returns combined result
- [ ] Combined result rendered as a new chart tile on the shared dashboard — both users see the same visualisation
- [ ] Combined tile shows provenance: "Query A (owner) × Query B (collaborator)"
- [ ] Re-running either source query updates the combined tile on next load
- [ ] Invite by email: User A can invite User B to a shared dashboard by email (see §3.5 deferred item)

---

### 6e. Cross-Dataset Query (Join Schema)

- [ ] Ingested public datasets (data.gov, World Bank, India) share a common `public_data` Postgres schema
- [ ] Users can write SQL that joins tables across datasets (e.g. `JOIN public_data.wb_gdp ON public_data.india_population`)
- [ ] AI is given schema context for all ingested tables in `public_data` when answering questions against a "multi-source" virtual connection
- [ ] UI: "Multi-source query" option in connection selector — selects all ingested public datasets as the context
- [ ] Query chaining: user can reference a previous query result as a CTE, then join it with another dataset

---

## 7. Data Upload
- [x] Upload UI component exists (FileUpload.tsx) and backend routes wired (uploads.py, upload_service.py)
- [ ] Uploaded file parsed client-side to preview columns + first 10 rows before import
- [ ] On confirm, file loaded into a temporary queryable table (DuckDB or user's warehouse schema)
- [ ] Uploaded table appears in schema sidebar with "uploaded" badge
- [ ] User can query uploaded data with SQL
- [ ] Uploaded data joinable with warehouse tables
- [ ] Files auto-expire after 7 days with warning banner
- [ ] Upload size limit: 50MB
- [ ] Supported types: CSV, TSV, XLSX, JSON (newline-delimited)

---

## 8. Alerts
- [ ] Alert on: query result row count, specific column value threshold, query failure
- [ ] Notification channels: email (start here), Slack (future)
- [ ] Alert list with status: active / paused / firing
- [ ] Create alert from query results view

---

## 8. Settings
- [x] Profile: name (editable), email (display), password change (email+password users only)
- [ ] Workspace: name, logo
- [ ] Connections: manage all warehouse connections (link to /connections)
- [ ] API keys: generate personal access tokens (for future API access)
- [ ] Danger zone: delete account

### 8.1 AI Provider Keys
- [x] User can add their own AI provider key (DeepSeek · OpenAI · OpenRouter; Anthropic deferred — needs separate SDK)
- [x] Key stored encrypted at rest — never logged or exposed to frontend
- [x] Provider picker dropdown + model selector per provider
- [x] Key tested on save (minimal chat completion call to provider)
- [x] Per-user key takes priority over platform default; fallback to platform key if user has none
- [x] One active key per user — saving a new key replaces the old one
- [ ] Multiple saved keys per user — one per provider; active key selectable per connection or query session

---

## 9. charts Package (`packages/charts`)

> See ARCHITECTURE.md §packages/charts

- [x] Chart components and registry exported from `@bi-tool/charts`
- [x] Chart types: line, bar, scatter, area, histogram, KPI, donut, heatmap, pivot table (more than spec requires)
- [x] Chart registry: `ChartRegistry`, `createRegistry`, `registerChart`
- [x] Auto-select chart type from result shape (`selectChartType`)
- [x] User override persisted per saved query
- [x] All charts responsive — ResizeObserver on every chart type
- [ ] Hover tooltips — on mouseover, show data point values (x, y, series label) in a floating tooltip for all chart types that support it (line, bar, scatter, area, histogram, donut); KPI and pivot table excluded
- [ ] Charts formally tested at 375px, 768px, 1280px breakpoints

---

## 10. Mobile

- [ ] Every screen functional at 375px viewport
- [ ] Touch targets minimum 44px
- [ ] No hover-only interactions
- [ ] Top nav collapses to hamburger on mobile
- [x] Dashboard grid: 1-column on mobile
- [ ] SQL editor: full-width, adequate height with keyboard open
- [ ] Results table: horizontal scroll wrapper

---

## Build Sequence

Follow this order. Each phase should be demo-able.

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Supabase schema, auth (sign in/up), connection service, Postgres connector | `[x]` auth (Google OAuth) + Postgres connection + service layer done |
| 2 | Schema introspection + storage, annotation UI | `[~]` introspection works in query editor sidebar; annotation UI not built |
| 3 | AI service (DeepSeek), prompt builder, SQL generation | `[x]` |
| 4 | Query executor (read-only enforcement, row limits, logging) | `[x]` |
| 5 | Query editor UI — SQL mode, run, results table | `[x]` |
| 6 | Query editor UI — AI mode toggle, generation flow | `[x]` |
| 7 | `packages/charts` — line + bar to start, chart type switcher | `[x]` 9 chart types shipped |
| 8 | Queries list, save/load, query history | `[x]` save/load done; query versioning not done |
| 9 | Dashboard — widget grid, add widget, chart rendering | `[x]` |
| 10 | Additional warehouse connectors (Snowflake, BigQuery) | `[ ]` |
| 11 | Alerts, mobile polish, settings | `[ ]` |

---

## Deferred / Descoped

Items considered but not in scope for v1:

- SSO / SAML (placeholder button only)
- Role-based access control (separate engineer vs business user role) — **removed by design decision** in favour of unified UX
- Slack notifications for alerts (email only in v1)
- Dashboard embedding / public share links
- Custom chart types via user registry (architecture supports it, UI deferred)
- AI explain SQL (natural language explanation of generated query)
