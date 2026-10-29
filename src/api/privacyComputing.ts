import { api, ApiResp } from './client'

export interface PrivacyComputeProject {
  id: string
  name: string
  description: string | null
  contract_id: string
  contract_version: number
  contract_document_hash: string
  application_code: string
  configuration: Record<string, unknown> | null
  status: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface PrivacyComputeRun {
  id: string
  project_id: string
  status: string
  system_type: string | null
  external_run_ref: string | null
  result: Record<string, unknown> | null
  evidence: Record<string, unknown> | null
  error: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PrivacyApplication {
  code: string
  name: string
  description: string | null
  execution_env_code: string
  status: string
  version: string
  input_schema?: Record<string, unknown> | null
  output_schema?: Record<string, unknown> | null
  extension_schema?: Record<string, unknown> | null
  execution_bindings?: Array<{
    system_type: string
    implementation_ref: string
    capability_requirements: Array<string | { code: string }>
  }>
}

export async function listPrivacyApplications() {
  const { data } = await api.get<ApiResp<PrivacyApplication[]>>('/capabilities/applications')
  return data.data
}

export async function listPrivacyProjects() {
  const { data } = await api.get<ApiResp<PrivacyComputeProject[]>>('/privacy-computing/projects')
  return data.data
}

export async function createPrivacyProject(body: {
  name: string
  description?: string
  contract_id: string
  application_code: string
  configuration?: Record<string, unknown>
}) {
  const { data } = await api.post<ApiResp<PrivacyComputeProject>>('/privacy-computing/projects', body)
  return data.data
}

export async function startPrivacyRun(projectId: string, body: {
  input_provider_ref: string
  input_consumer_ref: string
  join_keys: string[]
  implementation_ref?: string
  idempotency_key?: string
}) {
  const { data } = await api.post<ApiResp<PrivacyComputeRun>>(`/privacy-computing/projects/${projectId}/runs`, body)
  return data.data
}

export async function listPrivacyRuns(projectId: string) {
  const { data } = await api.get<ApiResp<PrivacyComputeRun[]>>(`/privacy-computing/projects/${projectId}/runs`)
  return data.data
}
