import { api, ApiResp } from './client'

export interface UsageRecord {
  id: string
  request_id: string
  contract_id: string
  connector_id: string
  username: string
  action: string
  decision: 'allowed' | 'denied' | 'default_deny'
  lifecycle: 'decided' | 'reserved' | 'consumed' | 'released'
  job_id: string | null
  reason: string | null
  matched_policy_ids: string[] | null
  context: { used_count?: number; exec_env?: string; app_image?: string } | null
  created_at: string
  updated_at: string
}

export interface UsagePreflight {
  allowed: boolean
  decision: string
  reason: string
  matched_policy_ids: string[]
  used_count: number
  reserved_count: number
  max_count: number | null
  checks: { key: string; label: string; passed: boolean; detail: string }[]
}

export async function listUsageRecords(contractId?: string) {
  const { data } = await api.get<ApiResp<UsageRecord[]>>('/usage/records', {
    params: contractId ? { contract_id: contractId } : undefined,
  })
  return data.data
}

export async function preflightUsage(contractId: string, appImage: string) {
  const { data } = await api.get<ApiResp<UsagePreflight>>('/usage/preflight', {
    params: { contract_id: contractId, app_image: appImage, action: 'process' },
  })
  return data.data
}
