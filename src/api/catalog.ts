import { api, ApiResp } from './client'

export interface ColumnDef {
  name: string
  type: string
  comment?: string
}

export interface CatalogItem {
  id: string
  tds_code: string | null
  name: string
  description: string | null
  kind: string
  data_type: string
  provider_connector_id: string
  kuscia_domain_id: string
  kuscia_domaindata_id: string | null
  resource_category: string | null
  source_type: string | null
  delivery_form: string | null
  update_freq: string | null
  quality_level: string | null
  security_level: string
  service_type: string | null
  topic_category: string | null
  tags: string[] | null
  columns: ColumnDef[] | null
  relative_uri: string | null
  datasource_id: string
  datasource_name: string | null
  datasource_type: string | null
  datasource_uri: string | null
  status: string
  created_by: string
  created_at: string
  scope: 'builtin' | 'custom'
  deletable: boolean
  updated_at: string
}

export interface DataSourceItem {
  id: string
  name: string
  type: string
  connector_id: string
  kuscia_domain_id: string
  kuscia_datasource_id: string
  uri: string | null
  info: Record<string, unknown> | null
  created_by: string
  created_at: string
  scope?: 'builtin' | 'custom'
  deletable?: boolean
}

export interface CodeOption { code: string; name: string }
export interface CodeTable { table_key: string; label: string; options: CodeOption[] }

export interface ResourceCreate {
  name: string
  description?: string
  provider_connector_id: string
  security_level: string
  data_type?: string
  resource_category?: string
  source_type?: string
  delivery_form?: string
  update_freq?: string
  quality_level?: string
  service_type?: string
  tags?: string[]
  columns: ColumnDef[]
  relative_uri?: string
  datasource_id?: string
}

export interface DataSourceCreate {
  name: string
  type: string
  connector_id: string
  uri?: string
  info?: Record<string, unknown>
  access_directly?: boolean
}

export async function getCodeDict() {
  const { data } = await api.get<ApiResp<CodeTable[]>>('/catalog/code-dict')
  return data.data
}

export async function searchResources(params: {
  q?: string
  security_level?: string
  resource_category?: string
  connector_id?: string
}) {
  const { data } = await api.get<ApiResp<CatalogItem[]>>('/catalog/resources', { params })
  return data.data
}

export async function registerResource(body: ResourceCreate) {
  const { data } = await api.post<ApiResp<CatalogItem>>('/catalog/resources', body)
  return data.data
}

export async function delistResource(id: string) {
  const { data } = await api.post<ApiResp<CatalogItem>>(`/catalog/resources/${id}/delist`)
  return data.data
}

export async function deleteResource(id: string) {
  const { data } = await api.delete<ApiResp<{ deleted: string }>>(`/catalog/resources/${id}`)
  return data.data
}

export async function listDataSources(connector_id?: string) {
  const { data } = await api.get<ApiResp<DataSourceItem[]>>('/catalog/datasources', {
    params: connector_id ? { connector_id } : {},
  })
  return data.data
}

export async function createDataSource(body: DataSourceCreate) {
  const { data } = await api.post<ApiResp<DataSourceItem>>('/catalog/datasources', body)
  return data.data
}

export async function deleteDataSource(id: string) {
  const { data } = await api.delete<ApiResp<{ deleted: string }>>(`/catalog/datasources/${id}`)
  return data.data
}
