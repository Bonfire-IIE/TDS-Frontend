import { api, ApiResp, TOKEN_KEY } from './client'

export interface Connector {
  id: string
  tds_code: string | null
  name: string
  org_name: string | null
  kuscia_domain_id: string
  status: 'applying' | 'approved' | 'rejected' | 'online' | 'offline'
  endpoint: string | null
  lite_api_endpoint: string | null
  lite_api_port: number | null
  auth_port: number | null
  grpc_port: number | null
  app_port: number | null
  data_port: number | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface DeployInfo {
  kuscia_domain_id: string
  deploy_token: string | null
  master_endpoint: string
  kuscia_image: string
  commands: string
}

export async function listConnectors() {
  const { data } = await api.get<ApiResp<Connector[]>>('/connectors')
  return data.data
}

export async function applyConnector(body: {
  name: string
  kuscia_domain_id: string
  org_name?: string
  lite_api_endpoint: string
  lite_api_port: number
  auth_port: number
  grpc_port: number
  app_port: number
  data_port: number
}) {
  const { data } = await api.post<ApiResp<Connector>>('/connectors', body, { timeout: 10000 })
  return data.data
}

export async function importConnector(body: {
  kuscia_domain_id: string
  name?: string
  org_name?: string
  lite_api_endpoint?: string
  lite_api_port?: number
  auth_port?: number
  grpc_port?: number
  app_port?: number
  data_port?: number
}) {
  const { data } = await api.post<ApiResp<Connector>>('/connectors/import', body)
  return data.data
}

export async function updateConnector(id: string, body: { name: string; kuscia_domain_id: string; org_name?: string; lite_api_endpoint: string; lite_api_port: number; auth_port: number; grpc_port: number; app_port: number; data_port: number }) {
  const { data } = await api.patch<ApiResp<Connector>>(`/connectors/${id}`, body)
  return data.data
}

export async function deleteConnector(id: string) {
  await api.delete(`/connectors/${id}`)
}

export async function approveConnector(id: string) {
  const { data } = await api.post<ApiResp<Connector>>(`/connectors/${id}/approve`)
  return data.data
}

export async function rejectConnector(id: string) {
  const { data } = await api.post<ApiResp<Connector>>(`/connectors/${id}/reject`)
  return data.data
}

export async function getDeployInfo(id: string) {
  const { data } = await api.get<ApiResp<DeployInfo>>(`/connectors/${id}/deploy`)
  return data.data
}

// 下载部署脚本：带 Bearer 拉 blob 再触发下载（不能用裸 <a href>，需鉴权头）
export async function downloadDeployScript(id: string, domainId: string) {
  const resp = await api.get(`/connectors/${id}/deploy/script`, { responseType: 'blob' })
  const url = URL.createObjectURL(resp.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deploy-connector-${domainId}.sh`
  a.click()
  URL.revokeObjectURL(url)
}

export { TOKEN_KEY }
