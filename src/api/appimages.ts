import { api, ApiResp } from './client'

export type AppImageCapability = 'mpc' | 'stats' | 'train' | 'custom'
export type AppImageStatus = 'registered' | 'delisted'
export type AppImageScope = 'builtin' | 'custom'

export interface AppImage {
  id: string
  name: string
  display_name: string
  description: string | null
  capability: AppImageCapability | string
  image_name: string
  image_tag: string
  registry_source: 'platform' | 'third_party'
  registry: string | null
  deploy_templates: any[]
  config_templates: Record<string, any> | null
  job_template: Record<string, any> | null
  io_schema: { inputs?: { name: string; kind: string; formats?: string[]; source_types?: string[] }[]; outputs?: { name: string; kind: string; formats?: string[]; source_types?: string[] }[] } | null
  party_schema: { roles?: { name: string; title?: string; min?: number; max?: number }[] } | null
  parameter_schema: Record<string, any> | null
  ui_schema: Record<string, any> | null
  task_input_template: Record<string, any> | any[] | null
  operations?: string[]
  uc_capabilities?: string[]
  status: AppImageStatus
  scope: AppImageScope
  created_by: string
  created_at: string
  updated_at: string
}

export interface AppImageCreate {
  name?: string
  display_name: string
  description?: string
  capability: string
  registry_source: 'platform' | 'third_party'
  registry?: string
  image_name: string
  image_tag: string
  deploy_templates: any[]
  config_templates?: Record<string, any>
  job_template?: Record<string, any>
  io_schema?: Record<string, any>
  party_schema?: Record<string, any>
  parameter_schema?: Record<string, any>
  ui_schema?: Record<string, any>
  task_input_template?: Record<string, any> | any[]
  operations?: string[]
  uc_capabilities?: string[]
}

export async function listAppImages() {
  const { data } = await api.get<ApiResp<AppImage[]>>('/appimages')
  return data.data
}

export async function getAppImage(id: string) {
  const { data } = await api.get<ApiResp<AppImage>>(`/appimages/${id}`)
  return data.data
}

export async function registerAppImage(body: AppImageCreate) {
  const { data } = await api.post<ApiResp<AppImage>>('/appimages', body, { timeout: 12000 })
  return data.data
}

export async function parseAppImageConfig(content: string, kind: 'appimage' | 'deploy_templates' | 'config_templates') {
  const { data } = await api.post<ApiResp<Record<string, any>>>('/appimages/parse', { content, kind })
  return data.data
}

export async function delistAppImage(id: string) {
  const { data } = await api.post<ApiResp<AppImage>>(`/appimages/${id}/delist`)
  return data.data
}

export async function updateAppImage(id: string, body: AppImageCreate) {
  const { data } = await api.put<ApiResp<AppImage>>(`/appimages/${id}`, body, { timeout: 12000 })
  return data.data
}
