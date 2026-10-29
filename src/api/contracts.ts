import { api, ApiResp } from './client'
import type { Policy } from './products'

export type ContractStatus = 'initiated'|'negotiating'|'signed'|'filed'|'executing'|'terminated'|'rejected'
export interface SignatoryEntity { signatoryEntityId:string; signatoryEntityName:string; signatoryType:'provider'|'consumer'|'operator'|'other' }
export interface SignatureEntry { signatoryEntityId:string; signatureAlgorithm:string; signingKeyId:string; signatureValue:string; signatureHash:string; signatoryTime:string }
export interface ContractPolicy { policyType:'permission'|'prohibition'|'obligation'; subjectInfo:{dataProductId:string;dataProductName:string;dataProductEntityId:string}; executionNodeInfo:{providerNodeId:string;providerNodeName:string;consumerNodeId:string;consumerNodeName:string}; actions:string[]; constraints:Array<{constraintName:string;constraintOperator:string;constraintValue:unknown}>; policyExpansion:Record<string,unknown> }
export interface ContractDocument { $schema:'TC609-6-2025-14'; contractInfo:{contractId:string;contractName:string;contractAbstract?:string;contractStatus:ContractStatus;createTime:string;signMode:'accept'|'negotiate';signatoryEntities:SignatoryEntity[];signatureList:SignatureEntry[];signTime?:string;indate:{activationTime:string;endTime:string};expansionItem:Record<string,unknown>}; contractPolicies:ContractPolicy[] }
export interface ContractVersion { version:number;operation:string;documentHash:string;previousHash?:string;createdBy?:string;createdAt:string;document:ContractDocument }
export interface Contract { contract_id:string;document:ContractDocument;document_hash:string;current_version:number;created_by:string;created_at:string;updated_at:string;versions:ContractVersion[]; name?:string; abstract?:string|null; purpose?:string|null; product_id?:string; provider_connector_id?:string; consumer_connector_id?:string; status?:ContractStatus; mode?:string; policies?:any[] }
export interface ContractRequest { consumer_connector_id:string;purpose?:string;confirm?:string;policies?:Policy[];contract_expansion?:Record<string,unknown> }

export const info=(c:Contract)=>c?.document?.contractInfo ?? ({contractId:c?.contract_id??'',contractName:'未命名合约',contractStatus:'initiated',signMode:'negotiate',signatoryEntities:[],signatureList:[],indate:{activationTime:'',endTime:''}} as any)
export const policy=(c:Contract)=>c?.document?.contractPolicies?.[0] ?? null
export async function listContracts(){const {data}=await api.get<ApiResp<Contract[]>>('/contracts');return data.data}
export async function getContract(id:string){const {data}=await api.get<ApiResp<Contract>>(`/contracts/${id}`);return data.data}
export async function requestContract(productId:string,body:ContractRequest){const {data}=await api.post<ApiResp<Contract>>(`/contracts/products/${productId}/request`,body);return data.data}
export async function proposeContract(id:string,contract_policies:any[],contract_expansion?:Record<string,unknown>){const {data}=await api.post<ApiResp<Contract>>(`/contracts/${id}/propose`,{contract_policies,contract_expansion});return data.data}
export async function signContract(id:string){const {data}=await api.post<ApiResp<Contract>>(`/contracts/${id}/sign`);return data.data}
export async function terminateContract(id:string){const {data}=await api.post<ApiResp<Contract>>(`/contracts/${id}/terminate`);return data.data}
export async function rejectContract(id:string){const {data}=await api.post<ApiResp<Contract>>(`/contracts/${id}/reject`);return data.data}
export async function downloadContractYaml(c:Contract){const response=await api.get(`/contracts/${c.contract_id}/document`,{responseType:'blob'});const url=URL.createObjectURL(response.data);const a=document.createElement('a');a.href=url;a.download=`${c.contract_id}.yaml`;a.click();URL.revokeObjectURL(url)}
export async function getContractYaml(id:string){const {data}=await api.get(`/contracts/${id}/document`,{responseType:'text'});return data as string}
