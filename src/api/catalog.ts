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
  industry_code: string
  theme_code: string | null
  resource_owner_name: string
  resource_owner_id: string
  contact_name: string
  contact_information: string
  resource_abstract: string
  resource_format: string
  data_size: string | null
  time_range: string | null
  update_method: string | null
  personal_information_level: string
  resource_quality: string | null
  high_quality_flag: string | null
  data_modalities: string[] | null
  contains_synthetic_data: string | null
  ai_readiness: string | null
  ai_task_types: string[] | null
  annotation_info: Record<string, unknown> | null
  ai_training_authorization: string | null
  review_comment: string | null
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

export interface CodeOption { code: string; name: string }
export interface CodeTable { table_key: string; label: string; options: CodeOption[] }

export async function getCodeDict() {
  const { data } = await api.get<ApiResp<CodeTable[]>>('/catalog/code-dict')
  return data.data
}

export async function searchResources(params: {
  q?: string
  security_level?: string
  industry_code?: string
  connector_id?: string
}) {
  const { data } = await api.get<ApiResp<CatalogItem[]>>('/catalog/resources', { params })
  return data.data
}

export async function delistResource(id: string) {
  const { data } = await api.post<ApiResp<CatalogItem>>(`/catalog/resources/${id}/delist`)
  return data.data
}

export async function approveResource(id: string, comment?: string) {
  const { data } = await api.post<ApiResp<CatalogItem>>(`/catalog/resources/${id}/approve`, { comment })
  return data.data
}

export async function rejectResource(id: string, comment: string) {
  const { data } = await api.post<ApiResp<CatalogItem>>(`/catalog/resources/${id}/reject`, { comment })
  return data.data
}

export async function deleteResource(id: string) {
  const { data } = await api.delete<ApiResp<{ withdrawn: string; status: string }>>(`/catalog/resources/${id}`)
  return data.data
}
