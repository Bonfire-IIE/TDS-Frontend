import { api, ApiResp } from './client'
export interface AuditEventItem { event_id: string; event_type: string; stream_id: string; sequence: number; resource_type?: string | null; resource_id?: string | null; contract_id?: string | null; project_id?: string | null; current_hash: string; occurred_at: string }
export interface AuditEventQuery { contract_id?: string; project_id?: string }
export interface AuditEvidence { event: Record<string, any>; payload_hash: string; previous_hash: string; current_hash: string; status: string; anchor?: { provider: string; rekor_uuid?: string; log_index?: number; integrated_time?: number; inclusion_proof?: any; checkpoint?: any } | null }
export async function listAuditEvents(query: AuditEventQuery = {}) { const { data } = await api.get<ApiResp<AuditEventItem[]>>('/audit/events', { params: query }); return data.data }
export async function getAuditEvidence(id: string) { const { data } = await api.get<ApiResp<AuditEvidence>>(`/audit/events/${id}/evidence`); return data.data }
