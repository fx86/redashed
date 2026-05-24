-- Local PostgreSQL tables for saved queries, dashboards, and dashboard tiles.
-- Run once against the DATABASE_URL database.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS saved_queries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    question    TEXT NOT NULL,
    sql         TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_queries_user_id_idx ON saved_queries (user_id);

CREATE TABLE IF NOT EXISTS dashboards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dashboards_user_id_idx ON dashboards (user_id);

CREATE TABLE IF NOT EXISTS dashboard_tiles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id  UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL,
    question      TEXT NOT NULL,
    sql           TEXT NOT NULL,
    chart_type    TEXT NOT NULL DEFAULT 'table',
    chart_config  JSONB NOT NULL DEFAULT '{}',
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dashboard_tiles_dashboard_id_idx ON dashboard_tiles (dashboard_id);

ALTER TABLE dashboard_tiles
  ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{"x":0,"y":0,"w":6,"h":4}';

-- Dashboard permission sharing: owner can grant edit access to other users
CREATE TABLE IF NOT EXISTS dashboard_editors (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    granted_by   TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (dashboard_id, user_id)
);

CREATE INDEX IF NOT EXISTS dashboard_editors_dashboard_id_idx ON dashboard_editors (dashboard_id);
CREATE INDEX IF NOT EXISTS dashboard_editors_user_id_idx ON dashboard_editors (user_id);

-- Phase 1 (run first if coming from a fresh schema — skipped if already applied)
ALTER TABLE dashboard_tiles
  ADD COLUMN IF NOT EXISTS source_query_id UUID REFERENCES saved_queries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dashboard_tiles_source_query_id_idx ON dashboard_tiles (source_query_id);

-- Phase 2: Backfill source_query_id for existing tiles
UPDATE dashboard_tiles t
SET source_query_id = (
    SELECT sq.id
    FROM saved_queries sq
    JOIN dashboards d ON d.id = t.dashboard_id
    WHERE sq.user_id = d.user_id
      AND sq.sql = t.sql
    ORDER BY sq.created_at DESC
    LIMIT 1
)
WHERE t.source_query_id IS NULL
  AND EXISTS (
    SELECT 1 FROM saved_queries sq
    JOIN dashboards d ON d.id = t.dashboard_id
    WHERE sq.user_id = d.user_id AND sq.sql = t.sql
  );

-- Phase 3: Drop tiles that have no matching saved query (truly orphaned)
DELETE FROM dashboard_tiles WHERE source_query_id IS NULL;

-- Phase 4: Promote source_query_id → saved_query_id (NOT NULL, canonical FK)
ALTER TABLE dashboard_tiles ALTER COLUMN source_query_id SET NOT NULL;
ALTER TABLE dashboard_tiles RENAME COLUMN source_query_id TO saved_query_id;
ALTER INDEX IF EXISTS dashboard_tiles_source_query_id_idx RENAME TO dashboard_tiles_saved_query_id_idx;

-- Phase 5: Drop redundant copied columns
ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS question;
ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS sql;
ALTER TABLE dashboard_tiles DROP COLUMN IF EXISTS connection_id;

-- User connections: moved from Supabase to local Postgres
CREATE TABLE IF NOT EXISTS user_connections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    db_type      TEXT NOT NULL DEFAULT 'postgres',
    host         TEXT,
    port         INTEGER,
    db_name      TEXT,
    db_user      TEXT,
    password_enc TEXT,
    extra_config JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_connections_user_id_idx ON user_connections (user_id);

-- Schema annotations: table/column descriptions injected into AI prompts
CREATE TABLE IF NOT EXISTS schema_annotations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    table_schema  TEXT NOT NULL,
    table_name    TEXT NOT NULL,
    column_name   TEXT,
    description   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS schema_annotations_conn_idx ON schema_annotations (user_id, connection_id);
