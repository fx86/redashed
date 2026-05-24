-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS connections (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  host        text NOT NULL,
  port        integer NOT NULL DEFAULT 5432,
  database    text NOT NULL,
  db_user     text NOT NULL,
  password_enc text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_connections" ON connections
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS saved_queries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  connection_id uuid REFERENCES connections(id) ON DELETE SET NULL,
  question      text NOT NULL,
  sql           text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE saved_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_saved_queries" ON saved_queries
  FOR ALL USING (auth.uid() = user_id);

-- Dashboards

CREATE TABLE IF NOT EXISTS dashboards (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_dashboards" ON dashboards
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS dashboard_tiles (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id  uuid REFERENCES dashboards(id) ON DELETE CASCADE NOT NULL,
  connection_id uuid REFERENCES connections(id) ON DELETE CASCADE NOT NULL,
  question      text NOT NULL,
  sql           text NOT NULL,
  chart_type    text NOT NULL DEFAULT 'table',
  chart_config  jsonb NOT NULL DEFAULT '{}',
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE dashboard_tiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_dashboard_tiles" ON dashboard_tiles
  FOR ALL USING (
    dashboard_id IN (SELECT id FROM dashboards WHERE user_id = auth.uid())
  );
