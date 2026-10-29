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
  obligations?: ('ephemeral' | 'watermark' | 'no_download' | 'no_export')[]
}

export type TransactionMode = 'accept' | 'negotiate'
export type ProductStatus = 'draft' | 'registered' | 'listed' | 'delisted'
export type ProductType = '01' | '02' | '03' | '04' | '05' | '06'
export type DeliveryMethod = '01' | '02' | '03' | '04'
export type DataSubjectType = '01' | '02' | '03'
export type ProviderType = '01' | '02' | '03'

export interface Product {
  id: string
  tds_code: string | null
  name: string
  description: string | null
  product_type: ProductType
  industry_code: string
  region_code?: string | null
  time_range?: string | null
  application_scenarios: string
  public_data: boolean
  personal_information_level: '0' | '1' | '2'
  delivery_method: DeliveryMethod
  usage_limitations: string
  authorization_required: boolean
  data_subject_type: DataSubjectType
  data_size?: string | null
  update_frequency?: string | null
  applicable_model_types?: string[] | null
  ai_usage_scenarios?: string[] | null
  provider_name: string
  provider_type: ProviderType
  provider_identity_id: string
  provider_description: string
  provider_entity_info?: Record<string, unknown>
  operator_name?: string | null
  operator_telephone?: string | null
  operator_id_card?: string | null
  declarations?: Record<string, string> | null
  platform_name?: string | null
  platform_id?: string | null
  platform_location?: string | null
  delivery_mode?: string | null
  measure_method?: string | null
  measure_unit?: string | null
  price?: number | null
  delivery_info?: string | null
  processing_description: string
  resource_codes?: string[]
  resource_ids: string[]
  resource_id?: string | null
  provider_connector_id?: string | null
  transaction_mode: TransactionMode
  baseline_policies: Policy[]
  status: ProductStatus
  created_by: string
  created_at: string
  updated_at: string
  resource_name?: string | null
}

export interface ProductCreate {
  name: string
  description: string
  product_type: ProductType
  industry_code: string
  region_code?: string | null
  time_range?: string | null
  application_scenarios: string
  public_data: boolean
  personal_information_level: '0' | '1' | '2'
  delivery_method: DeliveryMethod
  usage_limitations: string
  authorization_required: boolean
  data_subject_type: DataSubjectType
  data_size?: string | null
  update_frequency: string
  applicable_model_types?: string[]
  ai_usage_scenarios?: string[]
  provider_name: string
  provider_type: ProviderType
  provider_identity_id: string
  provider_description: string
  provider_entity_info?: Record<string, unknown>
  operator_name?: string | null
  operator_telephone?: string | null
  operator_id_card?: string | null
  declarations: Record<string, string>
  platform_name?: string | null
  platform_id?: string | null
  platform_location?: string | null
  delivery_mode?: string | null
  measure_method?: string | null
  measure_unit?: string | null
  price?: number | null
  delivery_info?: string | null
  processing_description: string
  resource_codes?: string[]
  resource_ids: string[]
  transaction_mode?: TransactionMode
  baseline_policies: Policy[]
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

export async function updateProduct(id: string, body: ProductCreate) {
  const { data } = await api.put<ApiResp<Product>>(`/products/${id}`, body)
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

export interface ProductPublish {
  platform_name:string;platform_id:string;platform_location:string;delivery_mode:string;
  measure_method:string;measure_unit:string;price:number;delivery_info:string;
}
export async function publishProduct(id:string,body:ProductPublish) {
  const {data}=await api.post<ApiResp<Product>>(`/products/${id}/publish`,body)
  return data.data
}
