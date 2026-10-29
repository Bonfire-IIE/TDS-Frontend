import { api, ApiResp } from './client'
export async function launchApplication(key:string, contract_id:string){ const {data}=await api.post<ApiResp<{project_id:string;workflow_version_id:string}>>(`/applications/${key}/launch`,{contract_id}); return data.data }
