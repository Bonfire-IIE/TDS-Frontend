import type { CatalogItem } from '../api/catalog'

export const sharedMetadataLabels: Record<string, string> = {
  name: '产品名称', description: '产品简介', industry_code: '行业分类',
  personal_information_level: '是否涉及个人信息', update_frequency: '更新频率',
  time_range: '覆盖时间范围', data_size: '数据规模',
  provider_name: '提供方名称', provider_identity_id: '身份标识码',
}

/** Only semantically shared metadata is inherited. Product-specific claims require confirmation. */
export function deriveProductMetadata(resources: CatalogItem[]) {
  const values: Record<string, string | undefined> = Object.fromEntries(Object.keys(sharedMetadataLabels).map(k => [k, undefined]))
  const unresolved: string[] = []
  if (!resources.length) return { values, unresolved }
  const shared = (key: string, read: (r: CatalogItem) => string | undefined | null) => {
    const candidates = resources.map(r => read(r)?.trim() || undefined)
    if (candidates.every(v => v !== undefined && v === candidates[0])) values[key] = candidates[0]
    else unresolved.push(sharedMetadataLabels[key])
  }
  shared('name', r => r.name)
  shared('description', r => r.resource_abstract || r.description)
  shared('industry_code', r => r.industry_code)
  shared('update_frequency', r => r.update_freq)
  shared('time_range', r => r.time_range)
  shared('provider_name', r => r.resource_owner_name)
  shared('provider_identity_id', r => r.resource_owner_id)
  // Multiple resources may overlap or use different units; never sum or copy the first size.
  if (resources.length === 1) shared('data_size', r => r.data_size)
  else unresolved.push(sharedMetadataLabels.data_size)
  const levels = resources.map(r => r.personal_information_level)
  if (levels.every(v => v != null && ['0', '1', '2'].includes(String(v)))) {
    values.personal_information_level = String(Math.max(...levels.map(Number)))
  } else unresolved.push(sharedMetadataLabels.personal_information_level)
  return { values, unresolved }
}

export function inheritedPatch(values: Record<string, string | undefined>, edited: Set<string>) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !edited.has(key)))
}
