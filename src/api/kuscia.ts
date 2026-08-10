import { api, ApiResp } from './client'

export interface KusciaMasterConfig {
  host: string
  port: number
  scheme?: string
  endpoint?: string
  updated_at?: string
}

export async function getKusciaMasterConfig() {
  const { data } = await api.get<ApiResp<KusciaMasterConfig[]>>('/kuscia-masters')
  const item = data.data?.[0]
  return item ? { ...item, host: item.deployment_ip, port: item.api_port } : undefined
}

export async function saveKusciaMasterConfig(config: KusciaMasterConfig) {
  const { data } = await api.post<ApiResp<KusciaMasterConfig>>('/kuscia-masters', { name: 'Kuscia Master', deployment_ip: config.host, api_port: config.port })
  return { ...data.data, host: data.data.deployment_ip, port: data.data.api_port }
}

export async function testKusciaMasterConfig(config: KusciaMasterConfig) {
  try { await fetch(`${config.scheme || 'http'}://${config.host}:${config.port}/api/v1/health`); return { ok: true } }
  catch { return { ok: false, message: '无法连接 Kuscia Master' } }
}
