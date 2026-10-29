import { api, ApiResp, TOKEN_KEY } from './client'

export interface Connector {
  id: string; tds_code: string | null; name: string; org_name: string | null
  status: 'applying' | 'approved' | 'active' | 'rejected' | 'revoked'
  csr_fingerprint: string; public_key_fingerprint: string; certificate_serial: string | null
  certificate_not_before: string | null; certificate_not_after: string | null
  activated_at: string | null; last_seen_at: string | null
  created_by: string; created_at: string; updated_at: string
}
export interface ConnectorFields { name: string; org_name?: string; csr_pem: string }
export interface DeploymentInstruction {
  system: 'linux'; deployment_platform: 'docker-compose' | 'kubernetes'; architecture: 'amd64' | 'arm64'
  version: string; commands: string; notes: string[]
}
export async function listConnectors() { const { data } = await api.get<ApiResp<Connector[]>>('/connectors'); return data.data }
export async function applyConnector(body: ConnectorFields) { const { data } = await api.post<ApiResp<Connector>>('/connectors', body); return data.data }
export async function importConnector(body: ConnectorFields) { const { data } = await api.post<ApiResp<Connector>>('/connectors/import', body); return data.data }
export async function updateConnector(id: string, body: Pick<ConnectorFields, 'name' | 'org_name'>) { const { data } = await api.patch<ApiResp<Connector>>(`/connectors/${id}`, body); return data.data }
export async function deleteConnector(id: string) { await api.delete(`/connectors/${id}`) }
export async function approveConnector(id: string) { const { data } = await api.post<ApiResp<Connector>>(`/connectors/${id}/approve`); return data.data }
export async function rejectConnector(id: string) { const { data } = await api.post<ApiResp<Connector>>(`/connectors/${id}/reject`); return data.data }
export async function getDeploymentInstructions(params: { system: string; deployment_platform: string; architecture: string; version: string }) {
  const { data } = await api.get<ApiResp<DeploymentInstruction>>('/connectors/deployment-instructions', { params }); return data.data
}
export { TOKEN_KEY }
