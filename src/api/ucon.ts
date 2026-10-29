import { api, ApiResp } from './client'
export type UconStage='dispatch'|'static'|'data_ingest'|'dynamic'|'runtime'|'delivery'
export interface UconCheck { id:string; contract_id:string; project_id?:string|null; job_id?:string|null; stage:UconStage; decision:'allow'|'deny'; checks:Array<{name:string;decision:string;reason?:string}>; evidence:Record<string,unknown>; error?:string|null; created_by?:string|null }
export async function listUconChecks(contractId:string){ const {data}=await api.get<ApiResp<UconCheck[]>>(`/ucon/contracts/${contractId}/checks`); return data.data }
export async function recordUconCheck(contractId:string, body:Omit<UconCheck,'id'|'contract_id'|'decision'|'created_by'>){ const {data}=await api.post<ApiResp<UconCheck>>(`/ucon/contracts/${contractId}/checks`,body); return data.data }
