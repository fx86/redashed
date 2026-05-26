const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(jwt: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ConnectionParams {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableInfo {
  name: string;
  schema: string;
  columns: ColumnInfo[];
}

export interface QueryResponse {
  sql: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
}

export interface SavedConnection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database: string;
  db_user: string;
  created_at: string;
}

export interface SavedQuery {
  id: string;
  connection_id: string | null;
  question: string;
  sql: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  created_at: string;
}

export async function testConnection(params: ConnectionParams): Promise<TableInfo[]> {
  const res = await fetch(`${BASE}/connections/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await handleResponse<{ tables: TableInfo[] }>(res);
  return data.tables;
}

export async function runQuery(
  connection: ConnectionParams,
  question: string,
  schema: TableInfo[]
): Promise<QueryResponse> {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, question, schema }),
  });
  return handleResponse<QueryResponse>(res);
}

export async function createUserConnection(
  jwt: string,
  body: { name: string; db_type?: string; host: string; port: number; database: string; db_user: string; password: string; extra_config?: Record<string, unknown> }
): Promise<SavedConnection> {
  const res = await fetch(`${BASE}/user-connections`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<SavedConnection>(res);
}

export async function listUserConnections(jwt: string): Promise<SavedConnection[]> {
  const res = await fetch(`${BASE}/user-connections`, { headers: authHeaders(jwt) });
  return handleResponse<SavedConnection[]>(res);
}

export async function getConnectionSchema(jwt: string, connectionId: string): Promise<TableInfo[]> {
  const res = await fetch(`${BASE}/user-connections/${connectionId}/schema`, {
    headers: authHeaders(jwt),
  });
  const data = await handleResponse<{ tables: TableInfo[] }>(res);
  return data.tables;
}

export async function deleteUserConnection(jwt: string, id: string): Promise<void> {
  await fetch(`${BASE}/user-connections/${id}`, { method: "DELETE", headers: authHeaders(jwt) });
}

export async function runSavedConnectionQuery(
  jwt: string,
  connectionId: string,
  question: string
): Promise<QueryResponse> {
  const res = await fetch(`${BASE}/user-connections/${connectionId}/query`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify({ question }),
  });
  return handleResponse<QueryResponse>(res);
}

export async function saveQuery(
  jwt: string,
  body: { connection_id: string; question: string; sql: string; chart_type?: string; chart_config?: Record<string, unknown> }
): Promise<SavedQuery> {
  const res = await fetch(`${BASE}/saved-queries`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<SavedQuery>(res);
}

export async function updateSavedQuery(
  jwt: string,
  queryId: string,
  body: { connection_id: string; question: string; sql: string; chart_type?: string; chart_config?: Record<string, unknown> }
): Promise<SavedQuery> {
  const res = await fetch(`${BASE}/saved-queries/${queryId}`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<SavedQuery>(res);
}

export async function listSavedQueries(jwt: string): Promise<SavedQuery[]> {
  const res = await fetch(`${BASE}/saved-queries`, { headers: authHeaders(jwt) });
  return handleResponse<SavedQuery[]>(res);
}

export async function getSavedQuery(jwt: string, id: string): Promise<SavedQuery> {
  const res = await fetch(`${BASE}/saved-queries/${id}`, { headers: authHeaders(jwt) });
  return handleResponse<SavedQuery>(res);
}

export async function renameSavedQuery(jwt: string, id: string, question: string): Promise<SavedQuery> {
  const res = await fetch(`${BASE}/saved-queries/${id}`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify({ question }),
  });
  return handleResponse<SavedQuery>(res);
}

export async function deleteSavedQuery(jwt: string, id: string): Promise<void> {
  await fetch(`${BASE}/saved-queries/${id}`, { method: "DELETE", headers: authHeaders(jwt) });
}

export async function runSql(
  jwt: string,
  connectionId: string,
  sql: string
): Promise<QueryResponse> {
  const res = await fetch(`${BASE}/user-connections/${connectionId}/run-sql`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify({ sql }),
  });
  return handleResponse<QueryResponse>(res);
}

// Dashboards

export interface Dashboard {
  id: string;
  name: string;
  created_at: string;
  can_edit: boolean;
  is_owner: boolean;
}

export interface DashboardEditor {
  id: string;
  dashboard_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
}

export interface TileLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardTile {
  id: string;
  dashboard_id: string;
  saved_query_id: string;
  connection_id: string;
  question: string;
  sql: string;
  chart_type: string;
  chart_config: Record<string, unknown>;
  position: number;
  layout: TileLayout;
  created_at: string;
}

export async function listDashboards(jwt: string): Promise<Dashboard[]> {
  const res = await fetch(`${BASE}/dashboards`, { headers: authHeaders(jwt) });
  return handleResponse<Dashboard[]>(res);
}

export async function createDashboard(jwt: string, name: string): Promise<Dashboard> {
  const res = await fetch(`${BASE}/dashboards`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify({ name }),
  });
  return handleResponse<Dashboard>(res);
}

export async function renameDashboard(jwt: string, dashboardId: string, name: string): Promise<Dashboard> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify({ name }),
  });
  return handleResponse<Dashboard>(res);
}

export async function deleteDashboard(jwt: string, id: string): Promise<void> {
  await fetch(`${BASE}/dashboards/${id}`, { method: "DELETE", headers: authHeaders(jwt) });
}

export async function listDashboardTiles(jwt: string, dashboardId: string): Promise<DashboardTile[]> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/tiles`, { headers: authHeaders(jwt) });
  return handleResponse<DashboardTile[]>(res);
}

export async function createDashboardTile(
  jwt: string,
  dashboardId: string,
  body: {
    saved_query_id: string;
    chart_type?: string;
    chart_config?: Record<string, unknown>;
    position?: number;
    layout?: TileLayout;
  }
): Promise<DashboardTile> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/tiles`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<DashboardTile>(res);
}

export async function renameTile(jwt: string, dashboardId: string, tileId: string, title: string): Promise<DashboardTile> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/tiles/${tileId}`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify({ title }),
  });
  return handleResponse<DashboardTile>(res);
}

export async function deleteDashboardTile(jwt: string, dashboardId: string, tileId: string): Promise<void> {
  await fetch(`${BASE}/dashboards/${dashboardId}/tiles/${tileId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
}

export async function updateDashboardLayout(
  jwt: string,
  dashboardId: string,
  layouts: Array<{ id: string; x: number; y: number; w: number; h: number }>
): Promise<void> {
  await fetch(`${BASE}/dashboards/${dashboardId}/layout`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify({ layouts }),
  });
}

export async function updateTileConfig(
  jwt: string,
  dashboardId: string,
  tileId: string,
  chartType: string,
  chartConfig: Record<string, unknown>
): Promise<DashboardTile> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/tiles/${tileId}/config`, {
    method: "PATCH",
    headers: authHeaders(jwt),
    body: JSON.stringify({ chart_type: chartType, chart_config: chartConfig }),
  });
  return handleResponse<DashboardTile>(res);
}

export async function listDashboardEditors(jwt: string, dashboardId: string): Promise<DashboardEditor[]> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/editors`, { headers: authHeaders(jwt) });
  return handleResponse<DashboardEditor[]>(res);
}

export async function addDashboardEditor(jwt: string, dashboardId: string, userId: string): Promise<DashboardEditor> {
  const res = await fetch(`${BASE}/dashboards/${dashboardId}/editors`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify({ user_id: userId }),
  });
  return handleResponse<DashboardEditor>(res);
}

export async function removeDashboardEditor(jwt: string, dashboardId: string, userId: string): Promise<void> {
  await fetch(`${BASE}/dashboards/${dashboardId}/editors/${userId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
}

// Annotations

export interface Annotation {
  id: string;
  table_schema: string;
  table_name: string;
  column_name: string | null;
  description: string;
}

export async function listAnnotations(jwt: string, connectionId: string): Promise<Annotation[]> {
  const res = await fetch(`${BASE}/user-connections/${connectionId}/annotations`, { headers: authHeaders(jwt) });
  return handleResponse<Annotation[]>(res);
}

export async function upsertAnnotation(
  jwt: string,
  connectionId: string,
  body: { table_schema: string; table_name: string; column_name?: string | null; description: string }
): Promise<Annotation> {
  const res = await fetch(`${BASE}/user-connections/${connectionId}/annotations`, {
    method: "PUT",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<Annotation>(res);
}

export async function deleteAnnotation(jwt: string, connectionId: string, annotationId: string): Promise<void> {
  await fetch(`${BASE}/user-connections/${connectionId}/annotations/${annotationId}`, {
    method: "DELETE",
    headers: authHeaders(jwt),
  });
}

// Uploads

export interface Upload {
  id: string;
  original_filename: string;
  table_name: string;
  schema_name: string;
  separator: string;
  row_count: number;
  col_count: number;
  created_at: string;
  expires_at: string;
  connection_id: string | null;
  columns: string[];
}

export async function uploadFile(
  jwt: string,
  file: File,
  separator: string,
  tableName?: string
): Promise<Upload> {
  const form = new FormData();
  form.append("file", file);
  form.append("separator", separator);
  if (tableName) form.append("table_name", tableName);
  const res = await fetch(`${BASE}/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  return handleResponse<Upload>(res);
}

export async function listUploads(jwt: string): Promise<Upload[]> {
  const res = await fetch(`${BASE}/uploads`, { headers: authHeaders(jwt) });
  return handleResponse<Upload[]>(res);
}

export async function deleteUpload(jwt: string, id: string): Promise<void> {
  await fetch(`${BASE}/uploads/${id}`, { method: "DELETE", headers: authHeaders(jwt) });
}

// data.gov

export interface DataGovResource {
  id: string;
  name: string;
  url: string;
}

export interface DataGovDataset {
  id: string;
  title: string;
  notes: string;
  organization: string;
  resources: DataGovResource[];
}

export async function searchDataGov(jwt: string, q: string): Promise<DataGovDataset[]> {
  const res = await fetch(`${BASE}/datagov/search?q=${encodeURIComponent(q)}`, {
    headers: authHeaders(jwt),
  });
  return handleResponse<DataGovDataset[]>(res);
}

export async function importDataGov(
  jwt: string,
  body: { dataset_id: string; dataset_title: string; resource_url: string }
): Promise<SavedConnection> {
  const res = await fetch(`${BASE}/datagov/import`, {
    method: "POST",
    headers: authHeaders(jwt),
    body: JSON.stringify(body),
  });
  return handleResponse<SavedConnection>(res);
}

// ── Settings ───────────────────────────────────────────────────────────────────

export interface AiKeyStatus {
  has_key: boolean;
  provider: string | null;
  model: string | null;
}

export async function getAiKeyStatus(jwt: string): Promise<AiKeyStatus> {
  const res = await fetch(`${BASE}/settings/ai-key`, { headers: authHeaders(jwt) });
  return handleResponse<AiKeyStatus>(res);
}

export async function upsertAiKey(
  jwt: string,
  provider: string,
  model: string,
  api_key: string,
): Promise<AiKeyStatus> {
  const res = await fetch(`${BASE}/settings/ai-key`, {
    method: "PUT",
    headers: { ...authHeaders(jwt), "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model, api_key }),
  });
  return handleResponse<AiKeyStatus>(res);
}

export async function deleteAiKey(jwt: string): Promise<void> {
  await fetch(`${BASE}/settings/ai-key`, { method: "DELETE", headers: authHeaders(jwt) });
}
