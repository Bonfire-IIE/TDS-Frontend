import { api, ApiResp } from './client'

export interface ApplicationRole { name: string; title?: string; source: string; locked?: boolean }
export interface ApplicationTask { id: string; alias?: string; app_image: string; roles: Record<string, string>; parameters: Record<string, { parameter?: string; value?: unknown }> }
export interface ApplicationDefinition {
  architecture: 'cs' | 'outsourced'
  parameter_schema: { type?: string; properties: Record<string, any>; required?: string[] }
  roles: ApplicationRole[]
  distinct_roles?: string[][]
  tasks: ApplicationTask[]
  inputs: { name: string; title?: string; role: string; targets: { task: string; port: string }[] }[]
  outputs: { name: string; title?: string; role?: string; task: string; port: string }[]
  edges: { source: string; target: string; type: 'data' | 'control'; source_handle?: string; target_handle?: string }[]
  appimage_snapshots?: Record<string, any>
}
export interface ApplicationVersion { id: string; application_id: string; version: number; definition: ApplicationDefinition; definition_hash: string; status: string; created_at: string }
export interface ApplicationTemplate { id: string; name: string; draft: ApplicationDefinition | null; status: string; created_by: string; versions: ApplicationVersion[] }
export interface ApplicationInstance { position?: {x:number;y:number}; id: string; version_id: string; parameters: Record<string, unknown>; roles: Record<string, string>; inputs: Record<string, { domain_id: string; domaindata_id: string }> }
export interface Delegation { id: string; project_id: string; version: number; status: string; scope: { mode?:string; instances?: { id: string; version_id: string }[]; participants?: { connector_id: string; roles: string[]; subject_id?: string;connector_name?:string;org_name?:string }[] }; decisions?: {connector_id:string; kind:string; decision:string; decided_by:string}[]; expires_at: string }
export interface ExecutionPlan { workflow: { nodes: any[]; edges: any[] }; participants: { connector_id: string; subject_id?: string; domain_id?: string; [key: string]: any }[]; applications?: any[]; hash?: string; [key: string]: any }
export async function listApplicationTemplates(){const {data}=await api.get<ApiResp<ApplicationTemplate[]>>('/application-templates');return data.data}
export async function getApplicationTemplate(id:string){const {data}=await api.get<ApiResp<ApplicationTemplate>>(`/application-templates/${id}`);return data.data}
export async function saveApplicationTemplate(body:{name:string;draft:ApplicationDefinition},id?:string){const {data}=id?await api.put<ApiResp<ApplicationTemplate>>(`/application-templates/${id}`,body):await api.post<ApiResp<ApplicationTemplate>>('/application-templates',body);return data.data}
export async function publishApplicationTemplate(id:string){const {data}=await api.post<ApiResp<ApplicationVersion>>(`/application-templates/${id}/publish`);return data.data}
export async function listDelegations(projectId:string){const {data}=await api.get<ApiResp<Delegation[]>>(`/projects/${projectId}/delegations`);return data.data}
export async function createDelegation(projectId:string,body:{instances:{id:string;version_id:string}[];participants:{connector_id:string;roles:string[]}[];expires_at:string}){const {data}=await api.post<ApiResp<Delegation>>(`/projects/${projectId}/delegations`,body);return data.data}
export async function decideDelegation(id:string,connector_id:string,decision:'accepted'|'rejected'){const {data}=await api.post<ApiResp<Delegation>>(`/computation-delegations/${id}/decision`,{connector_id,decision});return data.data}
export async function revokeDelegation(projectId:string,id:string){const {data}=await api.post<ApiResp<Delegation>>(`/projects/${projectId}/delegations/${id}/revoke`);return data.data}
export async function previewExecutionPlan(projectId:string,workflow:Record<string,unknown>){const {data}=await api.post<ApiResp<ExecutionPlan>>(`/projects/${projectId}/execution-plan`,{workflow});return data.data}
export interface ExecutionIdentity {connector_id:string;subject_id:string;status:'verified'|'revoked';verified_by?:string;updated_at?:string}
export async function listExecutionIdentities(){const {data}=await api.get<ApiResp<ExecutionIdentity[]>>('/execution-identities');return data.data}
export async function saveExecutionIdentity(connectorId:string,body:{subject_id:string;status:'verified'|'revoked'}){const {data}=await api.put<ApiResp<ExecutionIdentity>>(`/execution-identities/${connectorId}`,body);return data.data}

export interface ComputationService {id:string;name:string;org_name:string|null;status:string;subject_id:string}
export async function listComputationServices(){const {data}=await api.get<ApiResp<ComputationService[]>>('/computation-services');return data.data}
export interface DelegationReadiness {required:boolean;ready:boolean;issues:{instance_id:string;message:string}[];roles:Record<string,Record<string,string>>}
export async function checkDelegationReadiness(projectId:string,workflow:Record<string,unknown>){const {data}=await api.post<ApiResp<DelegationReadiness>>(`/projects/${projectId}/delegation-readiness`,{workflow});return data.data}
