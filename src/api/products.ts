import { api, ApiResp } from './client'

// 策略约束
export interface PolicyConstraints {
  time_window?: { from: string; to: string } | null
  count?: number | null
  exec_env?: 'mpc' | 'sandbox' | 'tee' | 'plain' | null
}

// 单条策略（allow/prohibit）
export interface Policy {
  type: 'allow' | 'prohibit'
  actions: string[]
  constraints: PolicyConstraints
}

export type TransactionMode = 'accept' | 'negotiate'
export type ProductStatus = 'draft' | 'listed' | 'delisted'

export interface Product {
  id: string
  tds_code: string | null
  name: string
  description: string | null
  resource_id: string
  provider_connector_id: string
  kuscia_domain_id: string
  transaction_mode: TransactionMode
  baseline_policies: Policy[]
  status: ProductStatus
  allowed_appimages?: string[]
  created_by: string
  created_at: string
  updated_at: string
  resource_name?: string | null
}

export interface ProductCreate {
  name: string
  description?: string
  resource_id: string
  transaction_mode: TransactionMode
  baseline_policies: Policy[]
  allowed_appimages?: string[]
  template_id?: string
}

export async function listProducts() {
  const { data } = await api.get<ApiResp<Product[]>>('/products')
  return data.data
}

export async function getProduct(id: string) {
  const { data } = await api.get<ApiResp<Product>>(`/products/${id}`)
  return data.data
}

export async function listProduct(body: ProductCreate) {
  const { data } = await api.post<ApiResp<Product>>('/products', body)
  return data.data
}

export async function delistProduct(id: string) {
  const { data } = await api.post<ApiResp<Product>>(`/products/${id}/delist`)
  return data.data
}

export async function deleteProduct(id: string) {
  const { data } = await api.delete<ApiResp<{ deleted: string }>>(`/products/${id}`)
  return data.data
}
