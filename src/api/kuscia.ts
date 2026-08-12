import { api, ApiResp } from './client'

export interface KusciaMasterConfig {
  id?: string
  host: string
  port: number
  scheme?: string
  endpoint?: string
  updated_at?: string
  status?: string
  deployment_ip?: string
  api_port?: number
  deploy_endpoint?: string
  credential_ref?: string
  last_error?: string
}

export interface KusciaMasterOnboardingState {
  configured: boolean
  completed: boolean
  master?: KusciaMasterConfig | null
}

export interface KusciaMasterDeployInput {
  domain_id: string
  deployment_ip: string
  api_port: number
  gateway_port: number
  kuscia_image?: string
}

export interface KusciaMasterDeployScript {
  commands: string
  api_endpoint: string
  deploy_endpoint: string
  kuscia_image: string
}

export async function getKusciaMasterConfig() {
  const { data } = await api.get<ApiResp<KusciaMasterConfig[]>>('/kuscia-masters')
  const item = data.data?.[0]
  return item ? { ...item, host: item.deployment_ip, port: item.api_port } : undefined
}

export async function saveKusciaMasterConfig(config: KusciaMasterConfig) {
  const payload = {
    name: 'Kuscia Master', deployment_ip: config.host, api_port: config.port,
    scheme: config.scheme || 'https', deploy_endpoint: config.deploy_endpoint,
  }
  const { data } = config.id
    ? await api.patch<ApiResp<KusciaMasterConfig>>(`/kuscia-masters/${config.id}`, payload)
    : await api.post<ApiResp<KusciaMasterConfig>>('/kuscia-masters', payload)
  return { ...data.data, host: data.data.deployment_ip, port: data.data.api_port }
}

export async function uploadKusciaCredentials(id: string, files: { ca: File; cert: File; key: File; token: File }) {
  const form = new FormData()
  Object.entries(files).forEach(([name, file]) => form.append(name, file))
  const { data } = await api.post<ApiResp<any>>(`/kuscia-masters/${id}/credentials`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data.data
}

export async function testKusciaMaster(id: string) {
  const { data } = await api.post<ApiResp<{ ok: boolean; message?: string }>>(`/kuscia-masters/${id}/test`)
  return data.data
}
export async function probeKusciaMaster(id: string) {
  const { data } = await api.post<ApiResp<{ ok: boolean; message?: string }>>(`/kuscia-masters/${id}/probe`)
  return data.data
}

export async function getKusciaMasterOnboardingState() {
  const { data } = await api.get<ApiResp<KusciaMasterOnboardingState>>('/kuscia-masters/onboarding/state')
  return data.data
}

export async function getKusciaMasterDeployScript(input: KusciaMasterDeployInput) {
  const { data } = await api.post<ApiResp<KusciaMasterDeployScript>>('/kuscia-masters/onboarding/deploy-script', input)
  return data.data
}
