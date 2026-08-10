import { api, ApiResp } from './client'
import { Policy } from './products'

export type TemplateScope = 'system' | 'user'

export interface ContractTemplate {
  id: string
  name: string
  description: string | null
  policies: Policy[]
  scope: TemplateScope
  owner: string | null
  created_at: string
  updated_at: string
}

export interface TemplateCreate {
  name: string
  description?: string
  policies: Policy[]
  scope?: TemplateScope
}

export interface TemplateUpdate {
  name?: string
  description?: string
  policies?: Policy[]
}

export async function listContractTemplates() {
  const { data } = await api.get<ApiResp<ContractTemplate[]>>('/contract-templates')
  return data.data
}

export async function getContractTemplate(id: string) {
  const { data } = await api.get<ApiResp<ContractTemplate>>(`/contract-templates/${id}`)
  return data.data
}

export async function createContractTemplate(body: TemplateCreate) {
  const { data } = await api.post<ApiResp<ContractTemplate>>('/contract-templates', body)
  return data.data
}

export async function updateContractTemplate(id: string, body: TemplateUpdate) {
  const { data } = await api.put<ApiResp<ContractTemplate>>(`/contract-templates/${id}`, body)
  return data.data
}

export async function deleteContractTemplate(id: string) {
  const { data } = await api.delete<ApiResp<{ id: string }>>(`/contract-templates/${id}`)
  return data.data
}
