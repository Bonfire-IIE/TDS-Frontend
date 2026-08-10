import { api, ApiResp } from './client'
import { Policy, TransactionMode } from './products'

export type ContractStatus =
  | 'initiated'
  | 'negotiating'
  | 'signed'
  | 'filed'
  | 'executing'
  | 'terminated'
  | 'rejected'

export interface ContractParty {
  party_role: 'provider' | 'consumer'
  connector_id: string
  entity: string | null
  signature_hash: string | null
  signed_at: string | null
}

export interface ContractHistory {
  round: number
  op: string
  operator: string
  created_at: string
  snapshot?: Record<string, any> | null
}

export interface Contract {
  contract_id: string
  name: string
  abstract: string | null
  purpose: string | null
  product_id: string
  provider_connector_id: string
  consumer_connector_id: string
  mode: TransactionMode
  status: ContractStatus
  policies: Policy[]
  allowed_appimages: string[]
  contract_hash: string | null
  created_by: string
  created_at: string
  updated_at: string
  parties: ContractParty[]
  history: ContractHistory[]
}

export interface ContractRequest {
  consumer_connector_id: string
  purpose?: string
  confirm?: string
  policies?: Policy[]
  allowed_appimages?: string[]
}

export async function requestContract(productId: string, body: ContractRequest) {
  const { data } = await api.post<ApiResp<Contract>>(
    `/contracts/products/${productId}/request`,
    body,
  )
  return data.data
}

export async function listContracts() {
  const { data } = await api.get<ApiResp<Contract[]>>('/contracts')
  return data.data
}

export async function getContract(id: string) {
  const { data } = await api.get<ApiResp<Contract>>(`/contracts/${id}`)
  return data.data
}

export async function proposeContract(id: string, policies: Policy[], allowed_appimages?: string[]) {
  const { data } = await api.post<ApiResp<Contract>>(`/contracts/${id}/propose`, { policies, allowed_appimages })
  return data.data
}

export async function signContract(id: string) {
  const { data } = await api.post<ApiResp<Contract>>(`/contracts/${id}/sign`)
  return data.data
}

export async function fileContract(id: string) {
  const { data } = await api.post<ApiResp<Contract>>(`/contracts/${id}/file`)
  return data.data
}

export async function terminateContract(id: string) {
  const { data } = await api.post<ApiResp<Contract>>(`/contracts/${id}/terminate`)
  return data.data
}

export async function rejectContract(id: string) {
  const { data } = await api.post<ApiResp<Contract>>(`/contracts/${id}/reject`)
  return data.data
}
