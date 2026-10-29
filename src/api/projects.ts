import { api, ApiResp } from './client'

export type ProjectStatus = 'draft' | 'pending_approval' | 'approved' | 'running' | 'completed' | 'failed'
export type RunStatus = 'pending' | 'pending-dispatch' | 'accepted' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface ProjectDomain {
  contract_role?: 'provider' | 'consumer' | null
  connector_id: string
  domain_id: string
  connector_name: string
  org_name: string | null
}

export interface AvailableDomainData {
  input_source_type?: string | null
  input_format?: string | null
  selection_scope?: 'contract' | 'consumer' | null
  resource_id: string
  domaindata_id: string
  domain_id: string
  connector_id: string
  connector_name: string
  name: string
  data_type: string
  datasource_type: string | null
  format: string | null
  columns: { name: string; type: string; comment?: string }[] | null
  relative_uri: string | null
}

export interface WorkflowApproval {
  connector_id: string
  decision: 'approved' | 'rejected'
  comment: string | null
  decided_by: string
  decided_at: string
}

export interface WorkflowVersion {
  id: string
  version: number
  workflow: Record<string, unknown>
  workflow_hash: string
  status: string
  created_by: string
  created_at: string
  approvals: WorkflowApproval[]
}

export interface ConnectivityPair {
  src: string
  dst: string
  status: string | null
  ready: boolean
}

export interface Connectivity {
  pairs: ConnectivityPair[]
  connected: boolean
}

export interface ProjectRun {
  id: string
  kuscia_job_id: string
  status: RunStatus
  job_snapshot: Record<string, unknown>
  failure_info: Record<string, unknown> | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface RunTaskProgress {
  total: number
  completed: number
  running: number
  failed: number
  cancelled: number
  pending: number
  unknown: number
  observed: boolean
  updated_at: string
  tasks: {
    node_id: string
    task_id: string | null
    name: string
    state: string
    message: string | null
  }[]
}

export interface Project {
  id: string
  name: string
  description: string | null
  contract_id: string
  initiator_connector_id: string
  status: ProjectStatus
  current_version: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ProjectDetail {
  project: Project
  domains: ProjectDomain[]
  current_workflow: WorkflowVersion | null
  previous_workflow: WorkflowVersion | null
  approvals: WorkflowApproval[]
  runs: ProjectRun[]
  connectivity: Connectivity
}

export async function listProjects() {
  const { data } = await api.get<ApiResp<Project[]>>('/projects')
  return data.data
}

export async function getProject(id: string) {
  const { data } = await api.get<ApiResp<ProjectDetail>>(`/projects/${id}`)
  return data.data
}

export async function getConnectivity(id: string) {
  const { data } = await api.get<ApiResp<Connectivity>>(`/projects/${id}/connectivity`)
  return data.data
}

export async function getAvailableDomainData(id: string) {
  const { data } = await api.get<ApiResp<AvailableDomainData[]>>(`/projects/${id}/available-domain-data`)
  return data.data
}

export async function ensureConnectivity(id: string) {
  const { data } = await api.post<ApiResp<Connectivity>>(`/projects/${id}/connectivity/ensure`)
  return data.data
}

export async function createProject(body: { name: string; description?: string; contract_id: string }) {
  const { data } = await api.post<ApiResp<Project>>('/projects', body)
  return data.data
}

export async function submitWorkflow(projectId: string, workflow: Record<string, unknown>) {
  const { data } = await api.post<ApiResp<WorkflowVersion>>(`/projects/${projectId}/workflows`, { workflow })
  return data.data
}

export async function approveWorkflow(projectId: string, decision: 'approved' | 'rejected', comment?: string) {
  // 无需指定代表方：后端按当前用户自动推导所属参与方连接器
  const { data } = await api.post<ApiResp<ProjectDetail>>(
    `/projects/${projectId}/approvals`,
    { decision, comment },
  )
  return data.data
}

export async function executeProject(id: string) {
  const { data } = await api.post<ApiResp<ProjectRun>>(`/projects/${id}/runs`)
  return data.data
}

export async function refreshProjectRun(projectId: string, runId: string) {
  const { data } = await api.post<ApiResp<ProjectRun>>(`/projects/${projectId}/runs/${runId}/refresh`)
  return data.data
}

export async function cancelProjectRun(projectId:string,runId:string){const {data}=await api.post<ApiResp<ProjectRun>>(`/projects/${projectId}/runs/${runId}/cancel`);return data.data}
export async function retryProjectRun(projectId:string,runId:string){const {data}=await api.post<ApiResp<ProjectRun>>(`/projects/${projectId}/runs/${runId}/retry`);return data.data}
