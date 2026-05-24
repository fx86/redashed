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
- [ ] SSO (Google OAuth) button — deferred, placeholder only for now
- [ ] "Forgot password" flow — email reset link
- [ ] Redirect to dashboard after sign in
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

- [ ] Logo + product name left-aligned
- [ ] Nav links: Dashboards · Queries · Alerts · Settings
- [ ] Active link has indigo bottom border indicator
- [ ] Global search (opens query search, not a separate page)
- [ ] `+ New query` button → opens editor in AI mode, blank state
- [ ] User avatar top right → dropdown: Profile, Settings, Sign out
- [ ] Nav is responsive: on mobile, collapses to hamburger menu

---

## 3. Dashboard

> Prototype reference: "Dashboards" tab → Space Ops dashboard

### 3.1 Dashboard List
- [ ] List of all dashboards user has access to
- [ ] Create new dashboard (name only to start, widgets added after)
- [ ] Favourite/star a dashboard
- [ ] Delete dashboard (confirm modal)

### 3.2 Dashboard View
- [ ] Dashboard title — inline editable (click to edit)
- [ ] Last updated timestamp + auto-refresh interval badge
- [ ] Grid of widgets (2-column at desktop, 1-column on mobile)
- [ ] Widget types: chart, table, KPI number, text/markdown
- [ ] `Add widget` button → query picker → select result column mapping

### 3.3 Widget
- [ ] Widget title (editable)
- [ ] Chart rendered via `@bi-tool/charts` (Observable Plot wrapper)
- [x] Chart type auto-selected from result shape; creator/editors can override — persisted to DB
- [x] Resize widget (drag handle) — creator/editors only; layout changes persisted
- [x] Remove widget from dashboard — creator/editors only
- [ ] Click widget → opens source query in editor

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
- [ ] Query title — inline editable
- [ ] Mode toggle pill: `Write SQL` | `Ask AI` (see §4.2 and §4.3)
- [ ] Connection selector dropdown — shows user's warehouse connections
- [ ] SQL editor pane (always visible and editable regardless of mode)
- [ ] Run button
- [ ] Results pane below editor
- [ ] Save button — saves query with current SQL and title
- [ ] Share button — generates read-only link to query

### 4.2 Write SQL Mode
- [ ] Full-width SQL textarea with monospace font, syntax colour
- [ ] SQL is editable directly
- [ ] No NL input shown
- [ ] Switching from AI mode → SQL mode preserves whatever SQL is in the pane

### 4.3 Ask AI Mode
- [ ] Natural language text input shown above SQL editor
- [ ] Suggested prompt chips below input (pulled from query history)
- [ ] "Generate SQL" button → triggers AI generation flow
- [ ] AI generation states:
  - [ ] "Reading schema context…" skeleton loading
  - [ ] Step labels update during generation (schema → tables → SQL)
  - [ ] Generated SQL appears in the SQL editor pane (editable)
- [ ] AI chip label: "AI generates SQL · you review & run" — always visible in AI mode
- [ ] Switching to SQL mode hides NL input but keeps generated SQL
- [ ] Follow-up questions chips appear after results load

### 4.4 Pre-Run
- [ ] Show estimated scan size (bytes) before run if warehouse supports it
- [ ] Row limit warning if result will exceed configured limit
- [ ] SQL is shown to user before execution — **no silent auto-run ever**
- [ ] Read-only enforcement: reject any non-SELECT before sending to warehouse

### 4.5 Execution & Results
- [ ] "Running…" state with spinner on run button
- [ ] Results table below editor on success
- [ ] Column headers match SELECT aliases
- [ ] Row count + execution time in results header
- [ ] Paginated display (show first 500 rows, load more on scroll)
- [ ] Results view toggle: Table | Chart
- [ ] Chart view uses `@bi-tool/charts` — auto-selects type from result shape
- [ ] Chart type override pill (bar / line / scatter / area / table)
- [ ] Export CSV button
- [ ] "Add to dashboard" button → dashboard picker modal
- [ ] Error state: show warehouse error message inline, SQL editor stays editable

### 4.6 Query Persistence
- [ ] Unsaved changes indicator (dot on Save button)
- [ ] Auto-save draft every 30s (local, not server)
- [ ] Named save → server, appears in Queries list
- [ ] Query versioning — keep last 10 versions, accessible via history dropdown

---

## 5. Queries List

> Prototype reference: "Queries" tab

- [ ] Table: star · name · created by · last updated · data source · actions
- [ ] Search bar — filters by name in real time
- [ ] Filter by data source
- [ ] Filter by tag
- [ ] Star / favourite toggle per row
- [ ] Click row → opens query in editor
- [ ] "Edit" link → opens query in editor
- [ ] "Run" link → opens query in editor and immediately runs it
- [ ] Tabs: All · My Queries · Favourites · Recent

---

## 6. Warehouse Connections

> No dedicated role for this. Any user can add a connection.

### 6.1 Connection Setup
- [ ] Supported warehouses: Snowflake, BigQuery, Postgres, Redshift, Databricks
- [ ] Warehouse type picker (icon cards)
- [ ] Per-warehouse credential form (fields differ by type)
- [ ] Test connection button — runs a `SELECT 1` before saving
- [ ] Credentials encrypted at rest (Supabase Vault)
- [ ] Connection listed in sidebar after creation
- [ ] Status indicator: Connected (green) / Error (red) / Untested (grey)

### 6.2 Schema Introspection
- [ ] Auto-introspect on first successful connection
- [ ] Manual re-introspect button
- [ ] Table tree: schema → table → columns
- [ ] Per-table row count shown
- [ ] Annotation dot: green = described, grey = unannotated

### 6.3 Schema Annotation
- [ ] Editable table description (plain text)
- [ ] Editable per-column description (plain text)
- [ ] Completion indicator: X of Y columns annotated
- [ ] Annotations stored in Supabase, injected into AI prompts
- [ ] Annotations are optional — AI still works without them

---

## 7. Alerts
- [ ] Alert on: query result row count, specific column value threshold, query failure
- [ ] Notification channels: email (start here), Slack (future)
- [ ] Alert list with status: active / paused / firing
- [ ] Create alert from query results view

---

## 8. Settings
- [ ] Profile: name, email, password change
- [ ] Workspace: name, logo
- [ ] Connections: manage all warehouse connections
- [ ] API keys: generate personal access tokens (for future API access)
- [ ] Danger zone: delete account

---

## 9. charts Package (`packages/charts`)

> See ARCHITECTURE.md §packages/charts

- [ ] `renderChart(config, data, container)` exported from `@bi-tool/charts`
- [ ] Chart types: line, bar, stacked bar, scatter, area, KPI number
- [ ] Chart registry: `registerChart(type, implementation)`
- [ ] Auto-select chart type from result shape (see ChartHintService in ARCHITECTURE.md)
- [ ] User override persisted per saved query
- [ ] All charts responsive — ResizeObserver, explicit viewBox for SVG
- [ ] Charts tested at 375px, 768px, 1280px breakpoints

---

## 10. Mobile

- [ ] Every screen functional at 375px viewport
- [ ] Touch targets minimum 44px
- [ ] No hover-only interactions
- [ ] Top nav collapses to hamburger on mobile
- [ ] Dashboard grid: 1-column on mobile
- [ ] SQL editor: full-width, adequate height with keyboard open
- [ ] Results table: horizontal scroll wrapper

---

## Build Sequence

Follow this order. Each phase should be demo-able.

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Supabase schema, auth (sign in/up), connection service, Postgres connector | `[ ]` |
| 2 | Schema introspection + storage, annotation UI | `[ ]` |
| 3 | AI service (DeepSeek), prompt builder, SQL generation | `[ ]` |
| 4 | Query executor (read-only enforcement, row limits, logging) | `[ ]` |
| 5 | Query editor UI — SQL mode, run, results table | `[ ]` |
| 6 | Query editor UI — AI mode toggle, generation flow | `[ ]` |
| 7 | `packages/charts` — line + bar to start, chart type switcher | `[ ]` |
| 8 | Queries list, save/load, query history | `[ ]` |
| 9 | Dashboard — widget grid, add widget, chart rendering | `[ ]` |
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
