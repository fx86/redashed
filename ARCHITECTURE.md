# BI Tool Architecture

## Core Design Principles

Two user types with fundamentally different needs:
- **Analytics engineers** — configure warehouse connections, curate schema context, manage permissions
- **Business users** — ask questions in plain English, see results, explore visuals

The architecture serves both without letting the complexity of one leak into the other.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Frontend                      │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │  Engineer UI     │    │  Business User UI         │    │
│  │  - Connections  │    │  - Natural language input │    │
│  │  - Schema mgmt  │    │  - Query results          │    │
│  │  - Permissions  │    │  - Observable Plot charts │    │
│  └────────┬────────┘    └──────────┬───────────────┘    │
└───────────┼──────────────────────┼─────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                          │
│  Auth middleware → Route handlers → Service layer        │
│                                                          │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Connection   │  │  AI/SQL     │  │  Query        │  │
│  │ Service      │  │  Service    │  │  Executor     │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │ Schema       │  │  Chart      │  │  Result       │  │
│  │ Service      │  │  Hint Svc   │  │  Cache        │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
└──────┬───────────────────┬─────────────────┬────────────┘
       │                   │                 │
       ▼                   ▼                 ▼
  Supabase           DeepSeek API     User Warehouses
  (app metadata,     (text → SQL,     (Snowflake, BQ,
   credentials,       schema-aware     Postgres, etc.)
   query history)     prompting)
```

---

## Data Flow: Natural Language → Chart

This is the critical path. Every design decision flows from getting this right.

```
1. User types: "Show me monthly revenue by product for 2024"
2. Frontend → POST /api/queries  { nl_query, connection_id }
3. Auth middleware validates user owns connection_id
4. Schema Service fetches relevant schema context (scoped to tenant)
5. AI Service builds prompt: schema + NL query → DeepSeek → SQL
6. SQL shown to user (never auto-executed)
7. User confirms → Query Executor runs SELECT against their warehouse
8. Results returned as columnar JSON
9. Chart Hint Service inspects result shape → suggests chart type
10. Frontend renders via packages/charts (Observable Plot)
```

---

## Module Breakdown

### 1. Connection Service

Stores and manages warehouse credentials. The most sensitive part of the system.

```python
class ConnectionService:
    def create_connection(user_id, config: ConnectionConfig) -> Connection
    def test_connection(connection_id) -> TestResult
    def get_connection(user_id, connection_id) -> Connection  # enforces ownership
    def list_connections(user_id) -> list[Connection]
    def delete_connection(connection_id)
```

Key decisions:
- Credentials encrypted at rest using Supabase Vault or KMS envelope (AES-256, keys never touch the DB)
- Connection configs stored in Supabase with `user_id` foreign key — every fetch is scoped
- Connector interface is abstract: `SnowflakeConnector`, `BigQueryConnector`, `PostgresConnector` all implement `execute(sql) → ResultSet`
- Connection pooling lives per-connector, not globally — prevents cross-tenant pool sharing

### 2. Schema Service

Schema context quality directly determines SQL quality.

```python
class SchemaService:
    def introspect(connection_id) -> SchemaSnapshot          # pull live from warehouse
    def get_context(connection_id, nl_query) -> SchemaContext  # filtered/ranked subset
    def save_snapshot(connection_id, snapshot)               # store in Supabase for faster retrieval
    def annotate_table(connection_id, table, description)    # engineer adds descriptions
    def annotate_column(connection_id, table, column, description)
```

Don't send the entire schema to the AI. Large warehouses can have thousands of tables. Use **semantic search over schema metadata** to retrieve only the tables/columns relevant to the user's question. Keeps prompts small, focused, and cheaper.

Schema metadata stored in Supabase as structured JSON:

```json
{
  "tables": [{
    "name": "orders",
    "description": "One row per customer order",
    "columns": [
      { "name": "order_id", "type": "integer", "description": "Primary key" },
      { "name": "revenue", "type": "numeric", "description": "Net revenue in USD" }
    ]
  }]
}
```

Analytics engineers add descriptions. Business users never see this layer.

### 3. AI/SQL Service

```python
class AIService:
    def nl_to_sql(nl_query: str, schema_context: SchemaContext, dialect: SQLDialect) -> SQLResult
    def explain_sql(sql: str) -> str                          # for business users who want to understand the query
    def suggest_followups(result_shape: ResultShape) -> list[str]  # "You might also want to see..."
```

Prompt structure:

```
You are a SQL analyst. Generate a SELECT query for the following warehouse.

Dialect: {{ dialect }}
Schema:
{{ schema_context }}  ← scoped, filtered subset only

Rules:
- SELECT only, no DDL or DML
- Use fully qualified table names
- Return only valid {{ dialect }} SQL, no explanation

Question: {{ nl_query }}
```

Dialect awareness is required — `LIMIT` vs `FETCH FIRST`, date functions, and string quoting all vary. Keep a `SQLDialect` enum and pass it through the chain.

### 4. Query Executor

```python
class QueryExecutor:
    def execute(connection_id, sql: str, user_id: str) -> ExecutionResult
    def validate_readonly(sql: str) -> bool   # reject DDL/DML before it reaches the warehouse
    def paginate(result: ExecutionResult, page, page_size) -> Page
```

Safeguards:
- Parse SQL with `sqlglot` before execution — reject anything that's not a SELECT
- Set query timeouts per warehouse (configurable, default 30s)
- Row limits to prevent unbounded result sets (configurable per connection, default 10k rows)
- Log every execution to Supabase: `user_id, connection_id, sql_hash, row_count, duration_ms, timestamp`

Never return raw credentials to the executor from outside the service layer.

### 5. Chart Hint Service

Bridges query results to `packages/charts`. AI suggests chart type based on result shape; user can override.

```python
class ChartHintService:
    def suggest(result_shape: ResultShape, nl_query: str) -> ChartSuggestion

# result_shape: { columns: [{name, type}], row_count }
# ChartSuggestion: { chart_type, x_field, y_field, color_field?, title? }
```

Shape heuristics (rule-based to start, upgradeable to AI):
- 1 numeric column → KPI card
- 1 categorical + 1 numeric → bar chart
- 1 date/time + 1+ numeric → line chart
- 2 numerics → scatter
- 3+ numerics → multi-line or faceted bar
- Geo column present → map (future)

---

## packages/charts

The only place Observable Plot code lives. Structured as a standalone npm package inside the monorepo.

```
packages/charts/
  src/
    types.ts          # ChartConfig, ChartType, DataColumn types
    registry.ts       # register/lookup chart types
    charts/
      line.ts
      bar.ts
      scatter.ts
      area.ts
    index.ts          # export renderChart(config, data, container)
  package.json
```

The registry pattern lets engineers register custom chart types:

```typescript
// Internal
registerChart('line', LineChart)

// User-extensible — engineers can add custom chart types
chartRegistry.register('cohort_heatmap', CohortHeatmapChart)
```

Frontend only imports from `@bi-tool/charts` — never from `@observablehq/plot` directly. This keeps the Plot dependency contained and upgradeable.

---

## Multi-Tenancy

Every Supabase table has `org_id` or `user_id`. Row-level security (RLS) policies enforce isolation at the database level — FastAPI is a second line of defense, not the only one.

Schema context sent to DeepSeek is **always** fetched through `SchemaService.get_context(connection_id)` which enforces the tenant boundary. The prompt builder never accepts raw schema — only the output of that method.

---

## Frontend Structure

```
app/
  (engineer)/
    connections/      # warehouse connection setup
    schema/           # schema annotation, table descriptions
    permissions/      # who can query what
  (business)/
    queries/          # natural language input, results, charts
    history/          # past queries, saved views
  api/                # Next.js route handlers → proxy to FastAPI
```

Route groups keep engineer and business user surfaces separate at the routing level. Middleware gates each group based on user role stored in Supabase.

---

## Known Tradeoffs

**Schema retrieval strategy** — Static snapshots (fast, stale) vs live introspection (fresh, slow). Recommended: snapshot on first connect, refresh on engineer request, detect drift by hashing schema on each query execution.

**SQL validation** — `sqlglot` parsing catches most DDL/DML but dialect edge cases exist. Treat as defense-in-depth alongside DB-level read-only roles for warehouse connection credentials.

**AI prompt size** — Too much schema degrades SQL quality and burns tokens. Too little causes hallucinated table names. Semantic search over schema metadata solves this but adds ~50–100ms latency. Worth it at scale.

**Observable Plot on mobile** — Plot renders SVGs. Pass container dimensions explicitly via ResizeObserver rather than relying on CSS alone. 375px viewports need explicit viewBox handling.

**Query result caching** — Cache by `hash(sql + connection_id)` with a TTL. Don't cache anything containing PII by default — let engineers opt connections in.

---

## Build Sequence

Ordered for fastest path to a working product:

1. Connection service + Postgres connector + credential encryption
2. Schema introspection + storage in Supabase
3. AI service with schema → SQL prompt, tested against DeepSeek
4. Query executor with readonly enforcement + row limits
5. Minimal frontend: text input → SQL preview → results table (no charts yet)
6. `packages/charts` + chart hint service → line + bar to start
7. Engineer UI for schema annotation + connection management
8. Multi-tenancy hardening + RLS policies

Steps 1–5 produce a working demo. Steps 6–8 complete the product.
