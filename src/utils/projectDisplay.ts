import type { ApplicationTemplate } from '../api/applicationTemplates'
import type { AppImage } from '../api/appimages'
import type { Connector } from '../api/connectors'
import type { AvailableDomainData } from '../api/projects'

export const stateLabel=(state:string)=>({pending:'等待中','pending-dispatch':'等待调度',accepted:'已接收',running:'执行中',succeeded:'已完成',completed:'已完成',success:'已完成',failed:'失败',cancelled:'已取消',canceled:'已取消',unknown:'待确认',draft:'草稿',approved:'已审核',pending_approval:'待审核',active:'已生效',revoked:'已撤回',rejected:'已拒绝',expired:'已过期',superseded:'已替代',pending_business:'待确认',pending_service:'待确认','identity-changed':'身份已变更'}[state.toLowerCase()]||'待核对')
export const roleSourceLabel=(source:string)=>source.startsWith('delegate:')?`计算服务席位 ${Number(source.slice(9))+1}`:source.startsWith('same:')?'与指定参与方一致':({provider:'合约供数方',consumer:'合约用数方',initiator:'项目发起方',manual:'在授权范围内选择'}[source]||'按应用要求分配')
export const dataKindLabel=(kind:string)=>({table:'数据表',file:'文件',image:'图片',text:'文本',model:'模型',custom:'其他数据',csv:'数据表文件',binary:'文件',bin:'数据文件',json:'结构化文件',local:'本地文件',localfs:'本地文件',s3:'对象存储',minio:'对象存储',ftp:'文件服务',postgresql:'关系数据库',pgsql:'关系数据库',mysql:'关系数据库'}[kind.toLowerCase()]||'数据文件')
export function valueLabel(value:unknown,schema:Record<string,any>={}):string {
 if(value===undefined||value===null||value==='')return '未设置'
 if(typeof value==='boolean')return value?'开启':'关闭'
 if(Array.isArray(value))return value.map(v=>valueLabel(v)).join('、')||'未设置'
 if(typeof value==='object')return '已配置（详情见高级信息）'
 return schema.enum_labels?.[String(value)]||String(value)
}
export function projectDisplay({workflow={},templates=[],images=[],connectors=[],domains=[],resources=[]}:{workflow?:any;templates?:ApplicationTemplate[];images?:AppImage[];connectors?:Connector[];domains?:{connector_id?:string;domain_id?:string;connector_name:string;org_name?:string|null}[];resources?:AvailableDomainData[]}) {
 const versions=templates.flatMap(a=>a.versions.map(v=>({...v,applicationName:a.name})))
 const nodes:any[]=workflow.nodes||[]
 const version=(node:any)=>versions.find(v=>v.id===node?.template_version)
 const image=(node:any)=>{const v=version(node);return node?.template_version?v?.definition.appimage_snapshots?.[node.app_image]:images.find(a=>a.name===node?.app_image)}
 const task=(id:string)=>nodes.find(n=>n.id===id)
 const taskName=(node:any)=>{if(typeof node==='string')node=task(node);if(!node)return '未命名任务';const alias=node.alias;return alias&&alias!==node.id&&alias!==node.template_task?alias:version(node)?.definition.tasks.find(t=>t.id===node.template_task)?.alias||image(node)?.display_name||'未命名任务'}
 const applicationName=(id:string)=>{const inst=[...(workflow.applications||[]),...(workflow.detached_applications||[])].find((i:any)=>i.id===id);return versions.find(v=>v.id===inst?.version_id)?.applicationName||'应用'}
 const connectorName=(id:string)=>domains.find(d=>d.connector_id===id||d.domain_id===id)?.connector_name||connectors.find(c=>c.id===id)?.name||'未登记名称的参与方'
 const roleName=(node:any,name:string)=>image(node)?.party_schema?.roles?.find((r:any)=>typeof r==='object'&&r.name===name)?.title||'未命名角色'
 const portName=(node:any,name:string,input=true)=>image(node)?.io_schema?.[input?'inputs':'outputs']?.find((p:any)=>p.name===name)?.title||(input?'未命名输入':'未命名输出')
 const resource=(domain:string,id:string)=>resources.find(r=>(r.domain_id===domain||r.connector_id===domain)&&r.domaindata_id===id)
 const parameter=(node:any,key:string)=>image(node)?.parameter_schema?.properties?.[key]||{}
 return {nodes,versions,image,task,taskName,applicationName,connectorName,roleName,portName,resource,parameter}
}
