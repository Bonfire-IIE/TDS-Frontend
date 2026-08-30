import { api, ApiResp } from './client'
import { newIdempotencyKey } from '../utils/idempotency'

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface Job {
  id: string
  job_code: string
  name: string | null
  contract_id: string
  usage_record_id: string | null
  product_id: string | null
  app_image: string
  initiator_connector_id: string | null
  initiator_domain: string | null
  provider_connector_id: string | null
  provider_domain: string | null
  consumer_connector_id: string | null
  consumer_domain: string | null
  input_provider_domaindata_id: string
  input_consumer_domaindata_id: string
  kuscia_job_id: string | null
  status: JobStatus
  result_domaindata_id: string | null
  result_uri: string | null
  error: string | null
  failure_info: {
    stage?: string; source?: string; domain_id?: string | null; code?: string
    message?: string; retryable?: boolean; observed_at?: string; detail_scope?: string
  } | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface JobCreate {
  contract_id: string
  app_image: string
  input_provider_domaindata_id: string
  input_consumer_domaindata_id: string
  join_keys?: string[]
  name?: string
  idempotency_key?: string
}

export async function listJobs() {
  const { data } = await api.get<ApiResp<Job[]>>('/jobs')
  return data.data
}

export async function getJob(id: string) {
  const { data } = await api.get<ApiResp<Job>>(`/jobs/${id}`)
  return data.data
}

export async function createJob(body: JobCreate) {
  const { data } = await api.post<ApiResp<Job>>('/jobs', { ...body, idempotency_key: body.idempotency_key ?? newIdempotencyKey() })
  return data.data
}

export async function refreshJob(id: string) {
  const { data } = await api.post<ApiResp<Job>>(`/jobs/${id}/refresh`)
  return data.data
}
