import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, Button, Card, message, Empty, Form, Input, InputNumber, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { DeleteOutlined, AppstoreOutlined, BlockOutlined, PlusOutlined, SearchOutlined, UndoOutlined, RedoOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, ApartmentOutlined, CheckCircleOutlined, SettingOutlined, CloseOutlined, CopyOutlined, SnippetsOutlined } from '@ant-design/icons'
import {
  Background, Handle, Position, ReactFlow, SelectionMode,
  ReactFlowProvider, useReactFlow, useUpdateNodeInternals,
  type Connection, type Edge, type Node, type NodeProps, type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useWorkflowDocument } from './useWorkflowDocument'
import { dataKindLabel } from '../utils/projectDisplay'
import { newUuid } from '../utils/uuid'
import { copySelection, pasteSelection, removeSelection, moveWorkflowNodes, edgeId, type Point } from './workflowDocument'
import type { AppImage } from '../api/appimages'
import { useQuery } from '@tanstack/react-query'
import { listApplicationTemplates, listDelegations, listComputationServices, previewExecutionPlan, type ApplicationInstance, type ApplicationVersion } from '../api/applicationTemplates'
import { ArrayParameter } from './ApplicationWorkflowPanel'
import type { AvailableDomainData } from '../api/projects'

const { Text } = Typography

export interface WorkflowParty { domain_id: string; role: string }
export interface InputBinding { port: string; domain_id: string; domaindata_id: string }
export interface OutputBinding { port: string; domain_id: string; name?: string; relative_uri?: string; data_type?: string }
export interface WorkflowNodeDsl {
  id: string
  alias: string
  app_image: string
  parties: WorkflowParty[]
  input_bindings?: InputBinding[]
  output_bindings?: OutputBinding[]
  parameters?: Record<string, unknown>
  position?: { x: number; y: number }
}
export interface WorkflowEdgeDsl { source: string; target: string; type?: 'control' | 'data'; source_handle?: string; target_handle?: string }
export interface WorkflowDsl {
  schedule_mode?: string
  max_parallelism?: number
  nodes: WorkflowNodeDsl[]
  edges: WorkflowEdgeDsl[]
  [key: string]: unknown
}

interface Props {
  projectId?:string
  initiatorConnectorId?:string
  value: WorkflowDsl
  appImages: AppImage[]
  projectDomains: { domain_id: string; connector_name: string; org_name?: string | null; contract_role?: 'provider' | 'consumer' | null }[]
  domainData: AvailableDomainData[]
  onChange: (workflow: WorkflowDsl) => void
  readOnly?: boolean
  height?: number
}

type LibraryItem = {kind:'application'|'image';id:string;label:string}

type AppContract = Omit<AppImage, 'party_schema'> & {
  party_schema?: { roles?: (string | { name: string; title?: string; required?: boolean; min?: number; max?: number })[] } | null
}
type NormalizedPort = { name: string; title: string; kind: string; role?: string; required: boolean; multiple: boolean; formats: string[]; source_types: string[] }
type TaskNodeData = WorkflowNodeDsl & Record<string, unknown> & { label: string; party_display: string; inputs: NormalizedPort[]; outputs: NormalizedPort[] }

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)

function normalizeParameterContract(app?: AppContract) {
  const schema = isRecord(app?.parameter_schema) ? app.parameter_schema : {}
  const rawProperties = isRecord(schema.properties) ? schema.properties : {}
  const properties = Object.fromEntries(Object.entries(rawProperties).filter(([, value]) => isRecord(value)))
  const required = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === 'string') : []
  const uiSchema = isRecord(app?.ui_schema) ? app.ui_schema : {}
  return { properties, required: new Set(required), uiSchema, invalid: !!app?.parameter_schema && !isRecord(schema.properties) }
}

function normalizeAppContract(app?: AppContract) {
  const rawRoles = isRecord(app?.party_schema) && Array.isArray(app.party_schema.roles) ? app.party_schema.roles : []
  const roles = rawRoles.flatMap((role) => {
    if (typeof role === 'string') return [{ name: role, title: role, min: 0, max: 1 }]
    if (!isRecord(role) || typeof role.name !== 'string') return []
    return [{
      name: role.name as string,
      title: typeof role.title === 'string' ? role.title : role.name as string,
      min: typeof role.min === 'number' ? role.min : role.required === true ? 1 : 0,
      max: typeof role.max === 'number' ? role.max : 1,
    }]
  })
  const io = isRecord(app?.io_schema) ? app.io_schema : {}
  const normalizePorts = (value: unknown) => Array.isArray(value)
    ? value.filter((port) => isRecord(port) && typeof port.name === 'string' && typeof port.kind === 'string').map((port) => ({
      name: port.name as string,
      title: typeof port.title === 'string' ? port.title : '',
      kind: port.kind as string,
      role: typeof port.role === 'string' ? port.role : undefined,
      required: port.required !== false,
      multiple: port.multiple === true,
      formats: Array.isArray(port.formats) ? port.formats.filter((item: unknown): item is string => typeof item === 'string') : [],
      source_types: Array.isArray(port.source_types) ? port.source_types.filter((item: unknown): item is string => typeof item === 'string') : [],
    }))
    : []
  return {
    roles,
    inputs: normalizePorts(io.inputs),
    outputs: normalizePorts(io.outputs),
    invalid: (!!app?.party_schema && !Array.isArray((app.party_schema as any).roles))
      || (!!app?.io_schema && (!Array.isArray((app.io_schema as any).inputs) || !Array.isArray((app.io_schema as any).outputs))),
  }
}

const PORT_COLLAPSE_THRESHOLD=4
const portExpanded=(data:any,direction:string)=>(data[direction]?.length||0)<=PORT_COLLAPSE_THRESHOLD||!!data.expanded_ports?.[direction]
const taskHeight=(data:any)=>Math.max(208,...['inputs','outputs'].map(direction=>portExpanded(data,direction)?(data[direction]?.length||0)*30+30:0))
function PortToggles({data}:{data:any}){return <>{(['inputs','outputs'] as const).map(direction=>(data[direction]?.length||0)>PORT_COLLAPSE_THRESHOLD?<button type="button" key={direction} className={`workflow-port-toggle nodrag nopan ${direction} ${portExpanded(data,direction)?'expanded':''}`} aria-expanded={portExpanded(data,direction)} onClick={e=>{e.stopPropagation();data.toggle_ports?.(direction)}}>{portExpanded(data,direction)?'收起':'展开'}{direction==='inputs'?'输入':'输出'} · {data[direction].length}</button>:null)}</>}
function PortHandles({data}: {data: any}) {
  const [open, setOpen] = useState<string>()
  return <>{(['inputs','outputs'] as const).flatMap(direction => (data[direction] || []).map((p: any, index: number, ports: any[]) => {
    const expanded=portExpanded(data,direction)
    const input = direction === 'inputs', id = `${input?'in':'out'}:${p.name}`
    const label = p.title?.trim() || (input?'未命名输入':'未命名输出')
    const role = data.role_titles?.[p.role] || '未指定角色'
    const owners = data.port_details?.[id] || []
    return <Handle key={id} id={id} type={input?'target':'source'} position={input?Position.Left:Position.Right}
      className={`workflow-data-port ${expanded?'':'collapsed-port'}`} isConnectable={expanded} style={{top:expanded?`${(index+1)*100/(ports.length+1)}%`:`${45+(index+1)*10/(ports.length+1)}%`,opacity:expanded?1:0,pointerEvents:expanded?undefined:'none'}}>
      <Tooltip open={open===id} title={<div><strong>{input?'输入':'输出'} · {label}</strong><p>角色：{role}</p>{owners.length?owners.map((o:any,n:number)=><p key={n}>{o.org_name||'机构未登记'}<br/>连接器：{o.connector_name}</p>):<p>待绑定参与方</p>}{!p.title?.trim()&&<p>接口名称待作者补充</p>}</div>}>
        <button type="button" className={`workflow-port-label nodrag nopan ${input?'input':'output'}`} tabIndex={expanded?0:-1} aria-hidden={!expanded} aria-label={`${input?'输入':'输出'} ${label} · ${role}`} onMouseEnter={()=>setOpen(id)} onMouseLeave={()=>setOpen(undefined)} onFocus={()=>setOpen(id)} onBlur={()=>setOpen(undefined)} onClick={e=>{e.stopPropagation();setOpen(open===id?undefined:id)}}><span>{label}</span><small>{role}</small></button>
      </Tooltip>
    </Handle>
  }))}</>
}
function ControlHandles() { return <><Handle id="control-in" type="target" position={Position.Top} className="workflow-control-port" tabIndex={0} aria-label="控制端口" title="控制输入：前置任务完成后执行"/><Handle id="control-out" type="source" position={Position.Bottom} className="workflow-control-port" tabIndex={0} aria-label="控制端口" title="控制输出：完成后启动后续任务"/></> }
function TaskNode({ id, data, selected }: NodeProps<Node<TaskNodeData>>) {
  const updateInternals=useUpdateNodeInternals()
  useEffect(()=>{const frame=requestAnimationFrame(()=>updateInternals(id));return ()=>cancelAnimationFrame(frame)},[id,data.expanded_ports,updateInternals])
  const rows=(data.role_rows||[]) as {role:string;institution:string;connector:string}[]
  const row=(r:typeof rows[number],i:number)=><div className="workflow-role-row" key={i}><span>{r.role}</span><span title={r.connector}>{r.institution}</span></div>
  return <div className={`workflow-task ${selected?'selected':''}`} style={{minHeight:taskHeight(data)}}>
    <ControlHandles/>{(!!data.flow_start||!!data.flow_end)&&<div className="workflow-boundary-badges">{!!data.flow_start&&<span className="workflow-boundary-start">起点</span>}{!!data.flow_end&&<span className="workflow-boundary-end">终点</span>}</div>}<div className="workflow-task-body"><strong>{data.alias || data.id}</strong><div className="workflow-image-name">{String(data.image_title||data.app_image)}</div>
    <div className="workflow-roles">{rows.slice(0,3).map(row)}{rows.length>3&&<details className="nodrag"><summary>另 {rows.length-3} 个角色</summary>{rows.slice(3).map(row)}</details>}{!rows.length&&<span>未配置角色</span>}</div></div>
    <PortHandles data={data}/><PortToggles data={data}/>
  </div>
}

function ApplicationGroup({id,data,selected}:NodeProps){const d=data as any;const updateInternals=useUpdateNodeInternals();useEffect(()=>{const frame=requestAnimationFrame(()=>updateInternals(id));return ()=>cancelAnimationFrame(frame)},[id,d.expanded_ports,updateInternals]);return <div className={`application-canvas-group ${selected?'selected':''}`} style={{width:d.width,height:d.height}}><div className="application-group-heading"><span className="application-group-symbol"><AppstoreOutlined aria-hidden="true" /></span><div><strong>{d.label}</strong><div className="application-group-meta">{d.count} 个任务<span>·</span>{d.architecture==='outsourced'?'外包计算':'双方计算'}<span>·</span>v{d.version}</div></div></div><ControlHandles/><PortHandles data={d}/><PortToggles data={d}/></div>}

const nodeTypes = { task: TaskNode, application:ApplicationGroup }

function Editor({ projectId,initiatorConnectorId,value: incoming, appImages, projectDomains, domainData, onChange: emitChange, readOnly=false }: Props) {
  const doc=useWorkflowDocument(incoming,emitChange), value=doc.workflow
  const onChange=(w:WorkflowDsl)=>{if(!readOnly)doc.change(w)}
  const [libraryDrag,setLibraryDrag]=useState<(LibraryItem&{x:number;y:number;overCanvas:boolean})>()
  const libraryGestureCleanup=useRef<()=>void>(),suppressLibraryClick=useRef(false)
  useEffect(()=>()=>libraryGestureCleanup.current?.(),[])
  const [expandedPorts,setExpandedPorts]=useState<Record<string,Record<string,boolean>>>({})
  const [libraryType,setLibraryType]=useState<'applications'|'images'>('applications')
  const [librarySearch,setLibrarySearch]=useState(''),[copied,setCopied]=useState<WorkflowDsl>()
  const [leftOpen,setLeftOpen]=useState(()=>window.innerWidth>1000),[rightOpen,setRightOpen]=useState(()=>window.innerWidth>1000),[leftWidth,setLeftWidth]=useState(240),[rightWidth,setRightWidth]=useState(320),[pan,setPan]=useState(false)
  const [menu,setMenu]=useState<{x:number;y:number;point:Point}>(),[validation,setValidation]=useState<string>(),[checking,setChecking]=useState(false)
  const workspaceRef=useRef<HTMLDivElement>(null),canvasRef=useRef<HTMLDivElement>(null)
  // Measurements belong to the view, not the saved workflow. Keep them
  // across document projections so ReactFlow does not hide initialized nodes.
  const measurements=useRef(new Map<string,{width:number;height:number}>())
  const [,refreshMeasurements]=useState(0)
  const userPositionedView=useRef(false)
  const [workspaceHeight,setWorkspaceHeight]=useState(600)
  useEffect(()=>{
    const measure=()=>{
      const workspace=workspaceRef.current
      if(!workspace)return
      const content=workspace.closest('.content-canvas'),card=workspace.closest('.project-workbench'),body=card?.querySelector(':scope > .ant-card-body'),panel=workspace.closest('.project-step-panels')
      const bottomInset=(content?parseFloat(getComputedStyle(content).paddingBottom):20)+(body?parseFloat(getComputedStyle(body).paddingBottom):0)+(panel?parseFloat(getComputedStyle(panel).paddingBottom)+parseFloat(getComputedStyle(panel).borderBottomWidth):0)+2
      setWorkspaceHeight(Math.max(360,Math.floor(window.innerHeight-workspace.getBoundingClientRect().top-bottomInset)))
    }
    const observer=new ResizeObserver(measure)
    observer.observe(document.body)
    if(workspaceRef.current?.parentElement)observer.observe(workspaceRef.current.parentElement)
    window.addEventListener('resize',measure)
    measure()
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[])
  const {screenToFlowPosition,fitBounds,getNodes,zoomIn,zoomOut}=useReactFlow()
  const center=()=>{const rect=canvasRef.current?.getBoundingClientRect();return screenToFlowPosition(rect?{x:rect.left+rect.width/2,y:rect.top+rect.height/2}:{x:400,y:300})}
  useEffect(()=>{const media=matchMedia('(max-width:1000px)');const change=()=>{if(media.matches){setLeftOpen(false);setRightOpen(false)}};media.addEventListener('change',change);return ()=>media.removeEventListener('change',change)},[])
  const selectedId=doc.nodes[0], setSelectedId=(id?:string)=>doc.select(id?[id]:[])
  useEffect(()=>{window.dispatchEvent(new CustomEvent('workflow-editor-active',{detail:true}));return ()=>{window.dispatchEvent(new CustomEvent('workflow-editor-active',{detail:false}))}},[])

  const templates=useQuery({queryKey:['application-templates'],queryFn:listApplicationTemplates})
  const versions=(templates.data||[]).flatMap(a=>a.versions.filter(v=>v.status==='published').map(v=>({...v,applicationName:a.name})))
  const instances=(Array.isArray(value.applications)?value.applications:[]) as ApplicationInstance[]
  const serviceDirectory=useQuery({queryKey:['computation-services'],queryFn:listComputationServices})
  const delegations=useQuery({queryKey:['project-delegations',projectId],queryFn:()=>listDelegations(projectId!),enabled:!!projectId})
  const active=delegations.data?.find(d=>d.status==='active'&&new Date(d.expires_at).getTime()>Date.now())
  const allDomains=[...projectDomains,...(active?.scope.participants||[]).filter(p=>!projectDomains.some(d=>d.domain_id===p.connector_id)).map(p=>({domain_id:p.connector_id,connector_name:p.connector_name||serviceDirectory.data?.find(s=>s.id===p.connector_id)?.name||p.connector_id,org_name:p.org_name}))]
  const resolveRole=(i:ApplicationInstance,d:ApplicationVersion['definition'],name:string,seen=new Set<string>()):string=>{if(seen.has(name))return '';seen.add(name);const r=d.roles.find(r=>r.name===name);if(!r)return '';if(r.locked===false&&i.roles?.[name])return i.roles[name];if(r.source==='initiator')return initiatorConnectorId||'';if(r.source.startsWith('same:'))return resolveRole(i,d,r.source.slice(5),seen);if(r.source.startsWith('delegate:'))return active?.scope.participants?.[Number(r.source.split(':')[1])]?.connector_id||'';return projectDomains.find(x=>x.contract_role===r.source)?.domain_id||i.roles?.[name]||''}

  const participantLabel = (id: string) => allDomains.find((item) => item.domain_id === id)?.connector_name || id
  const defaultParties = (app?: AppContract): WorkflowParty[] => {
    const roles = normalizeAppContract(app).roles
    const template = isRecord(app?.job_template) ? app.job_template : {}
    return projectDomains.flatMap(domain => {
      const candidates = domain.contract_role === 'provider' ? [template.provider_role, 'provider', 'sender'] : domain.contract_role === 'consumer' ? [template.consumer_role, 'consumer', 'recver', 'receiver'] : []
      const role = roles.find(r => candidates.includes(r.name))
      return role ? [{domain_id:domain.domain_id,role:role.name}] : []
    })
  }
  const initialParties = (parties: WorkflowParty[], app?: AppContract) => parties.some(p=>p.role) ? parties : defaultParties(app)

  const taskImage=(n:WorkflowNodeDsl):AppContract|undefined=>{
    const version=versions.find(v=>v.id===(n as any).template_version)
    return (version?.definition.appimage_snapshots?.[n.app_image]||appImages.find(a=>a.name===n.app_image)) as AppContract|undefined
  }
  const nodes:Node<TaskNodeData>[]=value.nodes.map((n,index)=>{
    const app=taskImage(n),contract=normalizeAppContract(app)
    return {id:n.id,type:'task',zIndex:2000,position:n.position||{x:220+(index%3)*720,y:120+Math.floor(index/3)*300},data:{...n,parties:initialParties(n.parties||[],app),label:n.alias||n.id,party_display:'',inputs:contract.inputs,outputs:contract.outputs,role_titles:Object.fromEntries(contract.roles.map(r=>[r.name,r.title])),image_title:app?.display_name||n.app_image}}
  })
  const edges:Edge[]=value.edges.map((e,index)=>({id:edgeId(index),source:e.source,target:e.target,sourceHandle:e.type==='data'?'out:'+e.source_handle:'control-out',targetHandle:e.type==='data'?'in:'+e.target_handle:'control-in',label:e.type==='data'?'数据依赖':'执行顺序',data:{edgeType:e.type||'control'},style:{stroke:e.type==='data'?'var(--accent)':'var(--muted)',strokeDasharray:e.type==='data'?undefined:'5 4'},selected:doc.edges.includes(edgeId(index))}))
  const [form]=Form.useForm()
  const instance=instances.find(i=>i.id===selectedId)
  const selectedFields=JSON.stringify({...value.nodes.find(n=>n.id===selectedId),position:undefined})
  useEffect(()=>{const n=nodes.find(n=>n.id===selectedId);if(n)form.setFieldsValue(n.data)},[selectedId,selectedFields])
  const connect=(connection:Connection)=>{
    if(readOnly||!connection.source||!connection.target||connection.source===connection.target)return
    const data=connection.sourceHandle?.startsWith('out:')&&connection.targetHandle?.startsWith('in:')
    const control=connection.sourceHandle==='control-out'&&connection.targetHandle==='control-in'
    if(!data&&!control){message.warning('请连接相同类型的端口');return}
    const edge:WorkflowEdgeDsl={source:connection.source,target:connection.target,type:data?'data':'control',...(data?{source_handle:connection.sourceHandle!.slice(4),target_handle:connection.targetHandle!.slice(3)}:{})}
    if(value.edges.some(e=>JSON.stringify(e)===JSON.stringify(edge)))return
    if(data&&(value.edges.some(e=>e.type==='data'&&e.target===edge.target&&e.target_handle===edge.target_handle)||value.nodes.find(n=>n.id===edge.target)?.input_bindings?.some(b=>b.port===edge.target_handle)||instances.find(i=>i.id===edge.target)?.inputs?.[edge.target_handle!])){message.warning('该输入已有来源，请先移除资源或连线');return}
    onChange({...value,edges:[...value.edges,edge]})
  }
  const addApp=(appName:string,position=center())=>{
    if(!appName||readOnly)return
    const app=appImages.find(a=>a.name===appName) as AppContract|undefined
    if(!app){message.warning('该应用镜像已不可用，请刷新组件库');return}
    userPositionedView.current=true
    doc.end()
    const contract=normalizeAppContract(app),current=doc.current()
    const id='task-'+newUuid().slice(0,8)
    onChange({...current,nodes:[...current.nodes,{id,alias:app.display_name||appName,app_image:appName,position,parties:defaultParties(app),parameters:Object.fromEntries(Object.entries(normalizeParameterContract(app).properties).filter(([,p])=>p.default!==undefined).map(([k,p])=>[k,p.default])),input_bindings:[],output_bindings:contract.outputs.map(p=>({port:p.name,domain_id:defaultParties(app).find(r=>r.role===p.role)?.domain_id||'',data_type:p.kind}))}]});setSelectedId(id);return true
  }
  const addLibraryItem=(item:LibraryItem,point:Point)=>{
    if(readOnly)return false
    if(item.kind==='image')return !!addApp(item.id,point)
    const version=versions.find(v=>v.id===item.id)
    if(!version){message.warning('该应用版本已不可用，请刷新组件库');return false}
    addApplication(version,point);return true
  }
  const drop=(e:React.DragEvent)=>{
    e.preventDefault();e.stopPropagation()
    if(readOnly)return
    const version=e.dataTransfer.getData('application/version'),image=e.dataTransfer.getData('application/appimage')
    if(version||image)addLibraryItem({kind:version?'application':'image',id:version||image,label:''},screenToFlowPosition({x:e.clientX,y:e.clientY}))
  }
  const overCanvas=(x:number,y:number)=>{
    const target=document.elementFromPoint(x,y)
    return !!target&&!!canvasRef.current?.contains(target)
  }
  const startLibraryDrag=(event:React.PointerEvent<HTMLDivElement>,item:LibraryItem)=>{
    if(readOnly||event.button!==0||event.pointerType==='touch')return
    libraryGestureCleanup.current?.()
    const source=event.currentTarget,pointerId=event.pointerId,start={x:event.clientX,y:event.clientY}
    let dragging=false,cancelled=false
    const cleanup=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);window.removeEventListener('keydown',key);window.removeEventListener('blur',cancel)
      if(source.hasPointerCapture(pointerId))source.releasePointerCapture(pointerId)
      libraryGestureCleanup.current=undefined
    }
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==pointerId||cancelled)return
      if(!dragging&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<6)return
      if(!dragging){dragging=true;userPositionedView.current=true;source.setPointerCapture(pointerId)}
      e.preventDefault()
      setLibraryDrag({...item,x:e.clientX,y:e.clientY,overCanvas:overCanvas(e.clientX,e.clientY)})
    }
    const cancel=()=>{cleanup();setLibraryDrag(undefined)}
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancelled=true;setLibraryDrag(undefined)}}
    const finish=(e:PointerEvent)=>{
      if(e.pointerId!==pointerId)return
      cleanup();setLibraryDrag(undefined)
      if(!dragging)return
      suppressLibraryClick.current=true;setTimeout(()=>{suppressLibraryClick.current=false},0)
      if(cancelled)return
      if(overCanvas(e.clientX,e.clientY)){
        if(addLibraryItem(item,screenToFlowPosition({x:e.clientX,y:e.clientY})))message.success(`已添加${item.kind==='application'?'应用':'任务'}`)
      }else message.info('已取消添加，请拖入中间画布')
    }
    libraryGestureCleanup.current=cleanup
    window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);window.addEventListener('keydown',key);window.addEventListener('blur',cancel)
  }

  const saveNode=(fields:Partial<TaskNodeData>)=>onChange({...value,nodes:value.nodes.map(n=>n.id===selectedId?{...n,...Object.fromEntries(['alias','app_image','parties','parameters','input_bindings','output_bindings'].filter(k=>(fields as any)[k]!==undefined).map(k=>[k,(fields as any)[k]]))}:n)})
  const removeSelected=()=>{doc.end();onChange(removeSelection(value,doc.nodes,doc.edges));doc.select([])}
  const removeNode=removeSelected
  const snapshot=(v:ApplicationVersion,name:string)=>(v.definition.appimage_snapshots?.[name]||appImages.find(a=>a.name===name)) as AppContract
  // Include the external labels in spacing and group bounds; task boxes remain compact.
  const labelSpace=(ports:{title?:string;role?:string}[])=>Math.max(120,...ports.map(p=>Math.min(360,32+((p.title||'未命名输入').length+(p.role||'').length)*13)))
  const geometry=(v:ApplicationVersion,instanceId='')=>{
    const entries=v.definition.tasks.map(t=>({t,contract:normalizeAppContract(snapshot(v,t.app_image))}))
    const ranks=new Map<string,number>(),pending=new Set(entries.map(e=>e.t.id))
    while(pending.size){const ready=[...pending].filter(id=>v.definition.edges.filter(e=>e.target===id).every(e=>ranks.has(e.source)));if(!ready.length){for(const id of pending)ranks.set(id,0);break}for(const id of ready){ranks.set(id,Math.max(0,...v.definition.edges.filter(e=>e.target===id).map(e=>ranks.get(e.source)!+1)));pending.delete(id)}}
    const count=Math.max(0,...ranks.values())+1
    let x=72,maxY=0
    const tasks: {t:typeof entries[number]['t'];contract:typeof entries[number]['contract'];position:Point}[]=[]
    for(let rank=0;rank<count;rank++){
      const column=entries.filter(e=>ranks.get(e.t.id)===rank)
      const left=Math.max(110,...column.map(e=>labelSpace(e.contract.inputs))),right=Math.max(110,...column.map(e=>labelSpace(e.contract.outputs)))
      let y=128
      for(const e of column){tasks.push({...e,position:{x:x+left,y}});y+=taskHeight({...e.contract,expanded_ports:expandedPorts[instanceId+'::'+e.t.id]})+100}
      maxY=Math.max(maxY,y);x+=left+260+right+112
    }
    return {tasks,width:Math.max(700,x),height:Math.max(420,maxY+20)}
  }
  const addApplication=(v:ApplicationVersion,position=center())=>{userPositionedView.current=true;doc.end();const id='app-'+newUuid().slice(0,8),current=doc.current();onChange({...current,applications:[...(Array.isArray(current.applications)?current.applications:[]),{id,version_id:v.id,parameters:Object.fromEntries(Object.entries(v.definition.parameter_schema.properties||{}).filter(([,p])=>p.default!==undefined).map(([k,p])=>[k,p.default])),roles:{},inputs:{},position}]});setSelectedId(id)}
  const composedNodes:Node<any>[]=[...nodes],composedEdges:Edge[]=[...edges]
  instances.forEach((i,index)=>{
    const v=versions.find(v=>v.id===i.version_id);if(!v)return
    const d=v.definition,g=geometry(v,i.id)
    g.height=Math.max(g.height,taskHeight({inputs:d.inputs,outputs:d.outputs,expanded_ports:expandedPorts[i.id]})+160)
    const outputs=d.outputs.map(p=>{const task=d.tasks.find(t=>t.id===p.task),port=normalizeAppContract(snapshot(v,task?.app_image||'')).outputs.find(x=>x.name===p.port);return {...p,role:p.role||task?.roles[port?.role||'']}})
    const roles=Object.fromEntries(d.roles.map(r=>[r.name,r.title||r.name]))
    composedNodes.push({id:i.id,type:'application',position:i.position||{x:240,y:120+index*(g.height+120)},width:g.width,height:g.height,style:{width:g.width,height:g.height},data:{label:v.applicationName,version:v.version,architecture:d.architecture,width:g.width,height:g.height,count:d.tasks.length,inputs:d.inputs,outputs,role_titles:roles,parties:d.roles.map(r=>({role:r.name,domain_id:resolveRole(i,d,r.name)}))}})
    g.tasks.forEach(({t,contract,position})=>composedNodes.push({id:i.id+'::'+t.id,parentId:i.id,extent:'parent',draggable:false,selectable:false,deletable:false,connectable:false,type:'task',position,data:{grouped:true,id:t.id,alias:t.alias||snapshot(v,t.app_image)?.display_name||t.id,app_image:t.app_image,image_title:snapshot(v,t.app_image)?.display_name||t.app_image,parties:Object.entries(t.roles).map(([role,ar])=>({role,domain_id:resolveRole(i,d,ar)})),inputs:contract.inputs,outputs:contract.outputs,role_titles:Object.fromEntries(contract.roles.map(r=>[r.name,r.title]))}}))
    d.edges.forEach((e,index)=>{
      const data=e.type==='data'
      composedEdges.push({id:i.id+'::edge'+index,source:i.id+'::'+e.source,target:i.id+'::'+e.target,
        sourceHandle:data?'out:'+e.source_handle:'control-out',targetHandle:data?'in:'+e.target_handle:'control-in',
        label:data?undefined:'执行顺序',type:'smoothstep',data:{edgeType:data?'data':'control'},selectable:false,deletable:false,
        style:{stroke:data?'var(--accent)':'var(--muted)',strokeDasharray:data?undefined:'5 4'},
      })
    })
  })
  composedNodes.forEach(n=>{n.measured=measurements.current.get(n.id);n.selected=doc.nodes.includes(n.id);const d=n.data;const localInstance=instances.find(instance=>n.id.startsWith(instance.id+'::'));const localVersion=versions.find(version=>version.id===localInstance?.version_id);const scopeEdges=localInstance?localVersion?.definition.edges||[]:value.edges;const scopeId=localInstance?n.id.slice(localInstance.id.length+2):n.id;d.flow_start=n.type==='task'&&!scopeEdges.some(edge=>edge.target===scopeId);d.flow_end=n.type==='task'&&!scopeEdges.some(edge=>edge.source===scopeId);d.expanded_ports=expandedPorts[n.id];d.toggle_ports=(direction:string)=>setExpandedPorts(current=>({...current,[n.id]:{...current[n.id],[direction]:!current[n.id]?.[direction]}}));d.port_details=Object.fromEntries(['inputs','outputs'].flatMap(direction=>(d[direction]||[]).map((p:NormalizedPort)=>[`${direction==='inputs'?'in':'out'}:${p.name}`,(d.parties||[]).filter((r:WorkflowParty)=>!p.role||r.role===p.role).map((r:WorkflowParty)=>({...allDomains.find(x=>x.domain_id===r.domain_id),domain_id:r.domain_id,connector_name:participantLabel(r.domain_id)}))])));d.role_rows=(d.parties||[]).map((r:WorkflowParty)=>({role:d.role_titles?.[r.role]||r.role,institution:allDomains.find(x=>x.domain_id===r.domain_id)?.org_name||participantLabel(r.domain_id)||'待绑定',connector:participantLabel(r.domain_id)}))})
  const endpointName=(id:string,handle?:string|null,input=false)=>{const node=composedNodes.find(n=>n.id===id);const label=String(node?.data.alias||node?.data.label||'未命名任务');const port=(node?.data[input?'inputs':'outputs']||[]).find((p:any)=>p.name===handle?.replace(/^(in|out):/,''));return label+(handle?' · '+(port?.title||(input?'未命名输入':'未命名输出')):'')}
  const fitCanvas=()=>{
    const bounds=getNodes().filter(n=>!n.parentId).map(n=>{const left=labelSpace((n.data.inputs||[]) as any[]),right=labelSpace((n.data.outputs||[]) as any[]);return {x:n.position.x-left,y:n.position.y-24,width:(n.measured?.width||Number(n.style?.width)||260)+left+right,height:(n.measured?.height||Number(n.style?.height)||160)+48}})
    if(!bounds.length)return
    const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y)),right=Math.max(...bounds.map(b=>b.x+b.width)),bottom=Math.max(...bounds.map(b=>b.y+b.height))
    fitBounds({x,y,width:right-x,height:bottom-y},{padding:.12})
  }
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>
    const scheduleFit=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!userPositionedView.current)fitCanvas()},120)}
    const observer=new ResizeObserver(scheduleFit)
    if(canvasRef.current)observer.observe(canvasRef.current)
    scheduleFit()
    return ()=>{observer.disconnect();clearTimeout(timer)}
  },[composedNodes.map(n=>n.id).join('|'),versions.length,leftOpen,rightOpen,leftWidth,rightWidth])
  const copySelected=()=>{try{setCopied(copySelection({...value,nodes:value.nodes.map(n=>({...n,position:n.position||nodes.find(x=>x.id===n.id)?.position})),applications:instances.map(i=>({...i,position:i.position||composedNodes.find(n=>n.id===i.id)?.position}))},doc.nodes))}catch(e){message.warning((e as Error).message);return false}return true}
  const pasteSelected=()=>{if(!copied||readOnly)return;const next=pasteSelection(value,copied,menu?.point||center());onChange(next.workflow);doc.select(next.ids);setMenu(undefined)}
  const ungroupApplication=()=>{
    doc.end()
    if(!instance||readOnly)return
    const version=versions.find(v=>v.id===instance.version_id);if(!version)return
    const d=version.definition
    const tid=(id:string)=>instance.id+'-'+id
    const expanded=d.tasks.map((t)=>{
      const c=normalizeAppContract(snapshot(version,t.app_image))
      return {id:tid(t.id),alias:t.alias||snapshot(version,t.app_image)?.display_name||t.id,app_image:t.app_image,template_version:version.id,template_task:t.id,application_instance:instance.id,detached:true,
        parties:Object.entries(t.roles).map(([role,ar])=>({role,domain_id:resolveRole(instance,d,ar)})),
        parameters:Object.fromEntries(Object.entries(t.parameters||{}).map(([k,v])=>[k,v.parameter?(Object.prototype.hasOwnProperty.call(instance.parameters||{},v.parameter)?instance.parameters[v.parameter]:d.parameter_schema.properties[v.parameter]?.default):v.value])),
        input_bindings:d.inputs.flatMap(p=>p.targets.filter(x=>x.task===t.id).flatMap(x=>instance.inputs?.[p.name]?[{...instance.inputs[p.name],port:x.port}]:[])),
        output_bindings:c.outputs.map(p=>({port:p.name,domain_id:resolveRole(instance,d,t.roles[p.role||'']||Object.values(t.roles)[0]),data_type:p.kind})),position:{x:(instance.position?.x||240)+geometry(version,instance.id).tasks.find(entry=>entry.t.id===t.id)!.position.x,y:(instance.position?.y||120)+geometry(version,instance.id).tasks.find(entry=>entry.t.id===t.id)!.position.y}}
    })
    const roots=d.tasks.filter(t=>!d.edges.some(e=>e.target===t.id)), terminals=d.tasks.filter(t=>!d.edges.some(e=>e.source===t.id))
    const translated=value.edges.flatMap(e=>{
      const sources=e.source!==instance.id?[{id:e.source,port:e.source_handle}]:e.type==='data'?d.outputs.filter(p=>p.name===e.source_handle).map(p=>({id:tid(p.task),port:p.port})):terminals.map(t=>({id:tid(t.id),port:undefined}))
      const targets=e.target!==instance.id?[{id:e.target,port:e.target_handle}]:e.type==='data'?d.inputs.filter(p=>p.name===e.target_handle).flatMap(p=>p.targets.map(x=>({id:tid(x.task),port:x.port}))):roots.map(t=>({id:tid(t.id),port:undefined}))
      return sources.flatMap(source=>targets.map(target=>({...e,source:source.id,target:target.id,source_handle:source.port,target_handle:target.port})))
    })
    onChange({...value,detached_applications:[...(Array.isArray(value.detached_applications)?value.detached_applications:[]),{...structuredClone(instance),roles:Object.fromEntries(d.roles.map(r=>[r.name,resolveRole(instance,d,r.name)]))}],applications:instances.filter(i=>i.id!==instance.id),nodes:[...value.nodes,...expanded],edges:[...translated,...d.edges.map(e=>({...e,source:tid(e.source),target:tid(e.target)}))]})
    setSelectedId(expanded[0]?.id);message.success('已解除组合，展开为可编辑任务；提交前请重新校验执行计划。')
  }

  const removeApplication=(id:string)=>{onChange({...value,applications:instances.filter(i=>i.id!==id),edges:value.edges.filter(e=>e.source!==id&&e.target!==id)});setSelectedId(undefined)}
  const selectedNode = nodes.find((n) => n.id === selectedId)
  const selectedApp = selectedNode?taskImage(selectedNode.data):undefined
  const appContract = normalizeAppContract(selectedApp)
  const roles = appContract.roles
  const inputPorts = appContract.inputs
  const outputPorts = appContract.outputs
  const parameterContract = normalizeParameterContract(selectedApp)
  const parameterProperties = parameterContract.properties
  const requiredParameters = parameterContract.required
  const updateInput = (port: string, resourceId?: string) => {
    const selected = domainData.find((item) => item.resource_id === resourceId)
    const current = (form.getFieldValue('input_bindings') ?? []) as InputBinding[]
    const next = [...current.filter((item) => item.port !== port), ...(selected ? [{ port, domain_id: selected.domain_id, domaindata_id: selected.domaindata_id }] : [])]
    form.setFieldValue('input_bindings', next); saveNode({ ...form.getFieldsValue(), input_bindings: next })
  }
  const updateOutput = (port: string, field: keyof OutputBinding, value: string) => {
    const current = (form.getFieldValue('output_bindings') ?? []) as OutputBinding[]
    const old = current.find((item) => item.port === port) ?? { port, domain_id: projectDomains[0]?.domain_id ?? '' }
    const next = [...current.filter((item) => item.port !== port), { ...old, port, [field]: value }]
    form.setFieldValue('output_bindings', next); saveNode({ ...form.getFieldsValue(), output_bindings: next })
  }
  const updateRole = (role: string, domainIds: string[]) => {
    const current = (form.getFieldValue('parties') ?? []) as WorkflowParty[]
    const validRoles = new Set(roles.map((item) => item.name))
    const next = [...current.filter((party) => validRoles.has(party.role) && party.role !== role), ...domainIds.map((domain_id) => ({ domain_id, role }))]
    form.setFieldValue('parties', next)
    saveNode({ ...form.getFieldsValue(), parties: next })
  }
  const updateParameter = (name: string, value: unknown) => {
    const parameters = { ...((form.getFieldValue('parameters') ?? {}) as Record<string, unknown>), [name]: value }
    form.setFieldValue('parameters', parameters); saveNode({ ...form.getFieldsValue(), parameters })
  }
  const changeAppImage = (appImage: string) => {
    const app = appImages.find((item) => item.name === appImage) as AppContract | undefined
    const contract = normalizeAppContract(app)
    const inputNames = new Set(contract.inputs.map((port) => port.name))
    const outputNames = new Set(contract.outputs.map((port) => port.name))
    const parameterNames = new Set(Object.keys(normalizeParameterContract(app).properties))
    const current = form.getFieldsValue()
    const fields = {
      ...current,
      app_image: appImage,
      parties: defaultParties(app),
      input_bindings: ((current.input_bindings ?? []) as InputBinding[]).filter((binding) => inputNames.has(binding.port)),
      output_bindings: ((current.output_bindings ?? []) as OutputBinding[]).filter((binding) => outputNames.has(binding.port)),
      parameters: Object.fromEntries(Object.entries((current.parameters ?? {}) as Record<string, unknown>).filter(([name]) => parameterNames.has(name))),
    }
    form.setFieldsValue(fields); saveNode(fields)
  }

  useEffect(()=>setValidation(undefined),[value])
  const validate=async()=>{if(!projectId)return;setChecking(true);try{const plan=await previewExecutionPlan(projectId,value);setValidation(`计划校验通过 · ${plan.workflow.nodes.length} 个任务`)}catch(e:any){setValidation(typeof e.response?.data?.detail==='string'?e.response.data.detail:e.message)}finally{setChecking(false)}}
  const autoLayout=()=>{let y=120;const positions=new Map<string,Point>();[...value.nodes,...instances].forEach(n=>{positions.set(n.id,{x:440,y});y+=('version_id' in n?geometry(versions.find(v=>v.id===n.version_id)!,n.id).height:Math.max(160,Math.max(normalizeAppContract(taskImage(n as WorkflowNodeDsl)).inputs.length,normalizeAppContract(taskImage(n as WorkflowNodeDsl)).outputs.length)*42))+140});onChange({...value,nodes:value.nodes.map(n=>({...n,position:positions.get(n.id)})),applications:instances.map(i=>({...i,position:positions.get(i.id)}))});requestAnimationFrame(()=>fitCanvas())}
  const resize=(side:'left'|'right',event:React.PointerEvent)=>{const start=event.clientX,initial=side==='left'?leftWidth:rightWidth;event.currentTarget.setPointerCapture(event.pointerId);const target=event.currentTarget;const move=(e:PointerEvent)=>{const width=Math.max(200,Math.min(520,initial+(e.clientX-start)*(side==='left'?1:-1)));if(side==='left')setLeftWidth(width);else setRightWidth(width)};const up=()=>{target.removeEventListener('pointermove',move as EventListener);target.removeEventListener('pointerup',up)};target.addEventListener('pointermove',move as EventListener);target.addEventListener('pointerup',up)}
  const context=(e:React.MouseEvent|MouseEvent,node?:Node,edge?:Edge)=>{e.preventDefault();workspaceRef.current?.focus({preventScroll:true});if(node?.parentId)node=composedNodes.find(n=>n.id===node!.parentId);if(node&&!node.parentId&&!doc.nodes.includes(node.id))doc.select([node.id]);else if(edge&&!edge.id.includes('::'))doc.select([],[edge.id]);setMenu({x:Math.min(e.clientX,window.innerWidth-200),y:Math.min(e.clientY,window.innerHeight-280),point:screenToFlowPosition({x:e.clientX,y:e.clientY})})}
  const keyDown=(e:React.KeyboardEvent)=>{
    if((e.target as HTMLElement).closest('input,textarea,select,[contenteditable=true],[role=combobox]'))return
    const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase()
    if(mod&&key==='c'){e.preventDefault();copySelected()}else if(mod&&key==='v'){e.preventDefault();pasteSelected()}else if(mod&&key==='x'&&!readOnly){e.preventDefault();if(copySelected())removeSelected()}else if((key==='delete'||key==='backspace')&&!readOnly){e.preventDefault();removeSelected()}else if(mod&&key==='z'&&!readOnly){e.preventDefault();e.shiftKey?doc.redo():doc.undo()}else if(mod&&key==='y'&&!readOnly){e.preventDefault();doc.redo()}else if(e.key==='Escape')setMenu(undefined)
  }
  const handleNodesChange=(changes:NodeChange[])=>{
    let resized=false
    for(const change of changes){
      if(change.type!=='dimensions'||!change.dimensions)continue
      const {width,height}=change.dimensions,previous=measurements.current.get(change.id)
      if(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)&&(!previous||previous.width!==width||previous.height!==height)){
        measurements.current.set(change.id,{width,height});resized=true
      }
    }
    if(resized)refreshMeasurements(v=>v+1)
    const selects=changes.filter(c=>c.type==='select')
    if(selects.length){const ids=new Set(doc.nodes);selects.forEach(c=>{if(c.type==='select'){if(c.selected)ids.add(c.id);else ids.delete(c.id)}});doc.select([...ids],doc.edges)}
    if(readOnly||pan)return
    const moves=changes.flatMap(c=>c.type==='position'&&c.position?[{id:c.id,position:c.position}]:[])
    if(moves.length)onChange(moveWorkflowNodes(doc.current(),moves))
  }
  return <div className="workflow-workspace" ref={workspaceRef} style={{height:workspaceHeight}} tabIndex={0} onKeyDown={keyDown} onPointerDown={e=>{if(menu)setMenu(undefined);if((e.target as HTMLElement).closest('.workflow-canvas')&&!(e.target as HTMLElement).closest('button,input,textarea,select'))workspaceRef.current?.focus({preventScroll:true})}}>
    <div className="workflow-toolbar" role="toolbar" aria-label="画布工具">
      <div className="workflow-tool-group"><Button icon={<AppstoreOutlined aria-hidden="true" />} onClick={()=>{setLeftOpen(!leftOpen);if(window.innerWidth<=1000)setRightOpen(false)}} aria-expanded={leftOpen}>组件库</Button></div>
      <div className="workflow-tool-group"><Tooltip title="撤销 · Ctrl / ⌘ Z"><Button type="text" aria-label="撤销" icon={<UndoOutlined aria-hidden="true" />} disabled={!doc.past.length||readOnly} onClick={doc.undo}/></Tooltip><Tooltip title="重做"><Button type="text" aria-label="重做" icon={<RedoOutlined aria-hidden="true" />} disabled={!doc.future.length||readOnly} onClick={doc.redo}/></Tooltip></div>
      <div className="workflow-tool-group workflow-mode-switch"><Button type={!pan?'primary':'text'} onClick={()=>setPan(false)} aria-pressed={!pan}>选择</Button><Button type={pan?'primary':'text'} onClick={()=>setPan(true)} aria-pressed={pan}>平移</Button></div>
      <div className="workflow-tool-group"><Tooltip title="缩小"><Button type="text" aria-label="缩小" icon={<ZoomOutOutlined aria-hidden="true" />} onClick={()=>zoomOut()}/></Tooltip><Tooltip title="放大"><Button type="text" aria-label="放大" icon={<ZoomInOutlined aria-hidden="true" />} onClick={()=>zoomIn()}/></Tooltip><Button type="text" icon={<FullscreenOutlined aria-hidden="true" />} onClick={()=>fitCanvas()}>适应画布</Button></div>
      <div className="workflow-tool-group workflow-tool-layout"><Button type="text" icon={<ApartmentOutlined aria-hidden="true" />} disabled={readOnly||instances.some(i=>!versions.some(v=>v.id===i.version_id))} onClick={autoLayout}>自动布局</Button></div>
      <div className="workflow-tool-group workflow-tool-end"><Button icon={<CheckCircleOutlined aria-hidden="true" />} loading={checking} onClick={validate}>计划校验</Button><Button type="text" icon={<SettingOutlined aria-hidden="true" />} onClick={()=>{setRightOpen(!rightOpen);if(window.innerWidth<=1000)setLeftOpen(false)}} aria-expanded={rightOpen}>配置</Button></div>
    </div>
    {validation&&<Alert closable onClose={()=>setValidation(undefined)} type={validation.startsWith('计划校验通过')?'success':'warning'} message={validation}/>}
    <div className="workflow-editor" style={{'--library-width':leftOpen?`${leftWidth}px`:'0px','--config-width':rightOpen?`${rightWidth}px`:'0px'} as React.CSSProperties}>
    <aside className={`workflow-library ${leftOpen?'open':''}`} aria-label="组件库" onClickCapture={e=>{if(suppressLibraryClick.current){e.preventDefault();e.stopPropagation();suppressLibraryClick.current=false}}}>
      <div className="workflow-panel-heading"><div><strong>组件库</strong><span>构建你的计算流程</span></div><Button type="text" aria-label="收起组件库" icon={<CloseOutlined aria-hidden="true" />} onClick={()=>setLeftOpen(false)}/></div>
      <Input prefix={<SearchOutlined aria-hidden="true" />} aria-label="搜索组件与应用" placeholder="搜索应用或组件名称" allowClear value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)}/>
      <div className="workflow-library-tabs" role="tablist" aria-label="组件分类"><button type="button" role="tab" aria-selected={libraryType==='applications'} onClick={()=>setLibraryType('applications')}>应用模板 <span>{versions.length}</span></button><button type="button" role="tab" aria-selected={libraryType==='images'} onClick={()=>setLibraryType('images')}>应用镜像 <span>{appImages.filter(a=>a.status==='registered').length}</span></button></div>
      <div className="workflow-library-items">
      {libraryType==='applications'?versions.filter(v=>`${v.applicationName} ${v.id}`.toLowerCase().includes(librarySearch.toLowerCase())).map(v=><div key={v.id} className="workflow-library-item" onDoubleClick={()=>{if(!readOnly)addApplication(v)}} draggable={false} onPointerDown={e=>startLibraryDrag(e,{kind:'application',id:v.id,label:v.applicationName})}>
        <div className="workflow-library-item-top"><span className="workflow-library-icon"><AppstoreOutlined aria-hidden="true" /></span><span className="workflow-library-version">v{v.version}</span><Button type="text" size="small" aria-label={`添加 ${v.applicationName} v${v.version}`} icon={<PlusOutlined aria-hidden="true" />} disabled={readOnly} onClick={e=>{e.stopPropagation();addApplication(v)}} onDoubleClick={e=>e.stopPropagation()}/></div>
        <strong>{v.applicationName}</strong><div className="workflow-library-item-meta"><span>{v.definition.tasks.length} 个任务</span><span>{v.definition.architecture==='outsourced'?'外包计算':'双方计算'}</span></div>
      </div>):appImages.filter(a=>a.status==='registered'&&`${a.name} ${a.display_name}`.toLowerCase().includes(librarySearch.toLowerCase())).map(app=><div key={app.id} className="workflow-library-item image" onDoubleClick={()=>{if(!readOnly)addApp(app.name)}} draggable={false} onPointerDown={e=>startLibraryDrag(e,{kind:'image',id:app.name,label:app.display_name||app.name})}>
        <div className="workflow-library-item-top"><span className="workflow-library-icon"><BlockOutlined aria-hidden="true" /></span><span className="workflow-library-version">任务组件</span><Button type="text" size="small" aria-label={`添加 ${app.display_name||app.name}`} icon={<PlusOutlined aria-hidden="true" />} disabled={readOnly} onClick={e=>{e.stopPropagation();addApp(app.name)}} onDoubleClick={e=>e.stopPropagation()}/></div>
        <strong>{app.display_name||app.name}</strong><div className="workflow-library-item-meta"><span>{({mpc:'安全多方计算',stats:'统计分析',train:'模型训练',custom:'自定义计算'} as Record<string,string>)[app.capability]||'通用计算'}</span></div>
      </div>)}
      {(libraryType==='applications'?versions.filter(v=>`${v.applicationName} ${v.id}`.toLowerCase().includes(librarySearch.toLowerCase())).length:appImages.filter(a=>a.status==='registered'&&`${a.name} ${a.display_name}`.toLowerCase().includes(librarySearch.toLowerCase())).length)===0&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={librarySearch?'没有匹配的组件':'暂无可用组件'}/>}
      </div><div className="workflow-library-tip">拖入画布，或双击条目添加</div>
    </aside>
    <div className="workflow-resizer" role="separator" aria-label="调整组件库宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>resize('left',e)} onKeyDown={e=>{if(e.key==='ArrowLeft')setLeftWidth(Math.max(200,leftWidth-20));if(e.key==='ArrowRight')setLeftWidth(Math.min(520,leftWidth+20))}}/>
    <div className={`workflow-canvas ${libraryDrag?.overCanvas?'library-drop-active':''}`} ref={canvasRef} onDropCapture={drop} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}}>
      <ReactFlow nodes={composedNodes} edges={composedEdges} nodeTypes={nodeTypes} deleteKeyCode={null} nodesDraggable={!readOnly&&!pan} nodesConnectable={!readOnly&&!pan} elementsSelectable={!pan} noPanClassName={pan?'workflow-pan-blocked':'nopan'} selectionOnDrag={!pan} selectionMode={SelectionMode.Partial} panOnDrag={pan?[0,1,2]:[1,2]} multiSelectionKeyCode={['Meta','Control','Shift']}
        onNodesChange={handleNodesChange}
        onEdgesChange={changes=>{const ids=new Set(doc.edges);changes.forEach(c=>{if(c.type==='select'){if(c.selected)ids.add(c.id);else ids.delete(c.id)}});doc.select(doc.nodes,[...ids])}} onNodeDragStart={()=>{userPositionedView.current=true;doc.begin()}} onNodeDragStop={()=>doc.end()} onSelectionDragStart={()=>{userPositionedView.current=true;doc.begin()}} onSelectionDragStop={()=>doc.end()} onMoveStart={event=>{if(event)userPositionedView.current=true}} onConnect={connect}
        onNodeClick={(e,n)=>{if(pan)return;workspaceRef.current?.focus({preventScroll:true});if(!n.parentId&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){setSelectedId(n.id);setRightOpen(true);workspaceRef.current?.focus({preventScroll:true})}}} onEdgeClick={(_,e)=>{if(pan)return;if(!e.id.includes('::')){doc.select([],[e.id]);setRightOpen(true)}}} onPaneClick={()=>{doc.select([]);setMenu(undefined)}}
        onNodeContextMenu={(e,n)=>context(e,n)} onEdgeContextMenu={(e,edge)=>context(e,undefined,edge)} onPaneContextMenu={e=>context(e)} fitView minZoom={.1} maxZoom={2} defaultEdgeOptions={{type:'smoothstep',style:{stroke:'var(--muted)',strokeWidth:1.5}}}>
        <Background gap={22} size={1} color="var(--line)" />
      </ReactFlow>
      {!composedNodes.length&&<div className="workflow-canvas-empty"><span><ApartmentOutlined aria-hidden="true" /></span><strong>从一个应用开始</strong><p>从左侧拖入应用模板或任务组件<br/>连接任务，组织你的计算流程</p></div>}
      <div className="workflow-canvas-status"><span className={`workflow-mode-dot ${readOnly?'readonly':''}`}/>{readOnly?'只读预览':pan?'平移视图':'编辑画布'}<i/><span>{instances.length} 个应用</span><span>{nodes.length+instances.reduce((count,i)=>count+(versions.find(v=>v.id===i.version_id)?.definition.tasks.length||0),0)} 个任务</span></div>
    </div>
    <div className="workflow-resizer" role="separator" aria-label="调整配置区宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>resize('right',e)} onKeyDown={e=>{if(e.key==='ArrowLeft')setRightWidth(Math.min(520,rightWidth+20));if(e.key==='ArrowRight')setRightWidth(Math.max(200,rightWidth-20))}}/>
    <aside className={`workflow-config ${rightOpen?'open':''}`} aria-label="对象配置" onFocusCapture={e=>{if((e.target as HTMLElement).matches('input,textarea,[role=combobox]'))doc.begin()}} onBlurCapture={e=>{if((e.target as HTMLElement).matches('input,textarea,[role=combobox]'))doc.end()}}>
      <div className="workflow-panel-heading"><div><strong>{doc.edges.length?'连线配置':instance?'应用配置':selectedId?'任务配置':'配置面板'}</strong><span>{instance?versions.find(v=>v.id===instance.version_id)?.applicationName:selectedNode?.data.alias||'选中对象后在这里调整'}</span></div><Button type="text" aria-label="收起配置" icon={<CloseOutlined aria-hidden="true" />} onClick={()=>setRightOpen(false)}/></div>
      <div className="workflow-config-actions"><Tooltip title="复制"><Button type="text" aria-label="复制" icon={<CopyOutlined aria-hidden="true" />} disabled={!doc.nodes.length} onClick={copySelected}/></Tooltip><Tooltip title="粘贴"><Button type="text" aria-label="粘贴" icon={<SnippetsOutlined aria-hidden="true" />} disabled={!copied||readOnly} onClick={pasteSelected}/></Tooltip><Button size="small" disabled={!instance||readOnly} onClick={ungroupApplication}>解除组合</Button></div>
      {doc.edges.length>0?<><h3>连线配置</h3>{doc.edges.map(id=>{const index=Number(id.slice(5)),e=value.edges[index];return e?<div key={id}><p>{e.type==='data'?'数据依赖':'执行顺序'}</p><p>{endpointName(e.source,e.source_handle)} → {endpointName(e.target,e.target_handle,true)}</p><Button danger disabled={readOnly} onClick={removeSelected}>删除连线</Button></div>:null})}</>:
      instance?<><div className="workflow-object-summary"><Tag icon={<AppstoreOutlined aria-hidden="true" />}>应用组合体</Tag><Text type="secondary">{versions.find(v=>v.id===instance.version_id)?.definition.tasks.length} 个任务</Text><details><summary>查看应用编号</summary><Text copyable>{instance.id}</Text></details></div><Button className="workflow-remove-object" danger type="text" size="small" disabled={readOnly} icon={<DeleteOutlined aria-hidden="true" />} onClick={()=>removeApplication(instance.id)}>移除组合体</Button>{(()=>{const v=versions.find(v=>v.id===instance.version_id);if(!v)return null;const d=v.definition;const update=(patch:Partial<ApplicationInstance>)=>onChange({...value,applications:instances.map(i=>i.id===instance.id?{...i,...patch}:i)});return <Form layout="vertical" disabled={readOnly} key={instance.id}><h3 className="workflow-config-section-title">应用参数</h3>{Object.entries(d.parameter_schema.properties||{}).map(([name,schema])=>{const val=instance.parameters?.[name]??schema.default;const change=(value:unknown)=>update({parameters:{...instance.parameters,[name]:value}});return <Form.Item key={name} label={schema.title||name} required={d.parameter_schema.required?.includes(name)} extra={schema.description}>{schema.enum?<Select aria-label={schema.title||name} value={val as any} options={schema.enum.map((x:unknown)=>({value:x,label:schema.enum_labels?.[String(x)]||String(x)}))} onChange={change}/>:schema.type==='boolean'?<Switch checked={Boolean(val)} onChange={change}/>:['integer','number'].includes(schema.type)?<InputNumber aria-label={schema.title||name} value={typeof val==='number'?val:undefined} min={schema.minimum} max={schema.maximum} precision={schema.type==='integer'?0:undefined} onChange={change}/>:schema.type==='array'?<ArrayParameter value={val} label={schema.title||name} disabled={readOnly} onChange={change}/>:<Input aria-label={schema.title||name} value={typeof val==='string'?val:''} onChange={e=>change(e.target.value)}/>}</Form.Item>})}<h3 className="workflow-config-section-title">输入资源</h3>{d.inputs.map(p=>{const cid=resolveRole(instance,d,p.role);const incoming=edges.find(e=>e.target===instance.id&&e.targetHandle==='in:'+p.name);return <Form.Item key={p.name} label={p.title||p.name} extra={(d.roles.find(r=>r.name===p.role)?.title||'未命名角色')+' · '+participantLabel(cid)}>{incoming?<Input disabled value={'上游：'+endpointName(incoming.source,incoming.sourceHandle)}/>:<Select labelRender={option=>option.label&&option.label!==option.value?option.label:'已绑定资源（当前目录不可用）'} aria-label={'输入数据 '+(p.title||'未命名输入')} allowClear value={instance.inputs?.[p.name]?instance.inputs[p.name].domain_id+'::'+instance.inputs[p.name].domaindata_id:undefined} options={domainData.filter(r=>r.domain_id===cid).map(r=>({value:r.domain_id+'::'+r.domaindata_id,label:r.name+' · '+r.connector_name}))} onChange={ref=>{const resource=domainData.find(r=>r.domain_id+'::'+r.domaindata_id===ref);const inputs={...instance.inputs};if(resource)inputs[p.name]={domain_id:resource.domain_id,domaindata_id:resource.domaindata_id};else delete inputs[p.name];update({inputs})}}/>}</Form.Item>})}<h3 className="workflow-config-section-title">计算角色</h3>{d.roles.map(r=><Form.Item key={r.name} label={r.title||r.name} extra={r.locked!==false?'由合约与计算委托自动分配':undefined}><Select aria-label={'应用角色 '+(r.title||'未命名角色')} value={resolveRole(instance,d,r.name)||undefined} disabled={readOnly||r.locked!==false} options={allDomains.map(x=>({value:x.domain_id,label:x.connector_name+(x.org_name?' · '+x.org_name:'')}))} onChange={cid=>update({roles:{...instance.roles,[r.name]:cid}})}/></Form.Item>)}</Form>})()}</>:!selectedId ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择应用、任务或连线，查看并调整配置" /> : <>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}><Text strong>任务属性</Text><Button danger type="text" icon={<DeleteOutlined aria-hidden="true" />} onClick={removeNode}>删除</Button></Space>
        <Form disabled={readOnly} form={form} layout="vertical" onValuesChange={(_, all) => saveNode(all)}>
          <Form.Item name="alias" label="任务别名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="app_image" label="应用镜像" rules={[{ required: true }]}><Select onChange={changeAppImage} options={appImages.filter((a) => a.status === 'registered').map((a) => ({ value: a.name, label: a.display_name || a.name }))} /></Form.Item>
          <Form.Item name="parties" hidden><Input /></Form.Item>
          <Form.Item name="input_bindings" hidden><Input /></Form.Item>
          <Form.Item name="output_bindings" hidden><Input /></Form.Item>
          <Form.Item name="parameters" hidden><Input /></Form.Item>
          {appContract.invalid && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="该组件的角色或输入输出信息不完整，请检查组件配置。" />}
          <Text strong>参与方角色</Text><Typography.Paragraph type="secondary">已按合约的供数方、用数方自动匹配应用角色。</Typography.Paragraph>
          {roles.length ? roles.map((role) => <Form.Item key={role.name} label={role.title || role.name} required={(role.min ?? 0) > 0} extra={`${role.min ?? 0}–${role.max ?? '不限'} 个参与方`}>
            <Select mode={(role.max ?? Infinity) === 1 ? undefined : 'multiple'} value={(role.max ?? Infinity) === 1 ? (selectedNode?.data.parties ?? []).find(party=>party.role===role.name)?.domain_id : (selectedNode?.data.parties ?? []).filter(party=>party.role===role.name).map(party=>party.domain_id)} onChange={(value) => updateRole(role.name, Array.isArray(value) ? value : [value])}
              options={allDomains.map((domain) => ({ value: domain.domain_id, label: domain.org_name ? `${domain.connector_name}（${domain.org_name}）` : domain.connector_name }))} maxCount={role.max} />
          </Form.Item>) : <Form.Item label="参与方"><Select mode="multiple" value={(selectedNode?.data.parties ?? []).map((party) => party.domain_id)} onChange={(ids) => {
            const parties = ids.map((domain_id) => ({ domain_id, role: '' })); form.setFieldValue('parties', parties); saveNode({ ...form.getFieldsValue(), parties })
          }} options={allDomains.map((domain) => ({ value: domain.domain_id, label: domain.org_name ? `${domain.connector_name}（${domain.org_name}）` : domain.connector_name }))} /></Form.Item>}
          {!!inputPorts.length && <><Text strong>数据资源输入</Text>{inputPorts.map((port) => {
            const binding = (selectedNode?.data.input_bindings ?? []).find((item) => item.port === port.name)
            const incoming = edges.find((edge) => edge.target === selectedNode?.id && edge.data?.edgeType === 'data' && edge.targetHandle === `in:${port.name}`)
            const upstream = incoming ? nodes.find((node) => node.id === incoming.source) : undefined
            const upstreamPort = incoming?.sourceHandle?.replace(/^out:/, '')
            const accepted = [port.kind]
            const formats = port.formats
            const sources = port.source_types
            const roleDomains = port.role ? new Set((selectedNode?.data.parties ?? []).filter((party) => party.role === port.role).map((party) => party.domain_id)) : undefined
            const compatibleResources = domainData.filter((item) => (!roleDomains || roleDomains.has(item.domain_id)) && (!accepted.length || accepted.includes(item.data_type)) && (!formats?.length || (!!(item.input_format || item.format) && formats.map((v:string)=>v.toLowerCase()).includes((item.input_format || item.format)!.toLowerCase()))) && (!sources?.length || sources.includes('*') || (!!(item.input_source_type || item.datasource_type) && sources.includes((item.input_source_type || item.datasource_type)!))))
            const selectedResource = compatibleResources.find((item) => item.domain_id === binding?.domain_id && item.domaindata_id === binding?.domaindata_id)
            const options = compatibleResources.map((item) => ({ value: item.resource_id, label: `${item.name}（${item.selection_scope==='contract'?'合约资源':'用数方资源'} · ${item.datasource_type?dataKindLabel(item.datasource_type):'数据资源'}）` }))
            return <Form.Item key={port.name} label={port.title} required={port.required} extra={<><div>选择该角色有权使用的数据资源。</div><div>输入要求：{dataKindLabel(port.kind)}{formats.length?` · ${[...new Set(formats.map(dataKindLabel))].join('、')}`:''}</div></>}>
              {incoming ? <Input value={`上游任务「${upstream?.data.alias || upstream?.id}」输出「${normalizeAppContract(upstream?taskImage(upstream.data):undefined).outputs.find(p=>p.name===upstreamPort)?.title||'未命名输出'}」`} disabled /> : <Select allowClear showSearch optionFilterProp="label" value={selectedResource?.resource_id} onChange={(value) => updateInput(port.name, value)} options={options} aria-label={`${port.title}资源`} notFoundContent={roleDomains && !roleDomains.size ? '请先选择上方参与方角色' : '暂无满足应用输入要求的已发布、已同步资源'} placeholder="选择数据资源" />}
            </Form.Item>
          })}</>}
          {!!outputPorts.length && <><Text strong>输出数据资源</Text>{outputPorts.map((port) => {
            const binding = (selectedNode?.data.output_bindings ?? []).find((item) => item.port === port.name)
            return <Card key={port.name} size="small" title={port.title} style={{ margin: '8px 0' }}><Form.Item label="归属连接器" required><Select value={binding?.domain_id} onChange={(value) => updateOutput(port.name, 'domain_id', value)} options={allDomains.map((d) => ({ value: d.domain_id, label: d.connector_name }))} /></Form.Item><Form.Item label="资源名称"><Input value={binding?.name} onChange={(e) => updateOutput(port.name, 'name', e.target.value)} placeholder="默认使用项目-任务-端口" /></Form.Item><Form.Item label="相对路径"><Input value={binding?.relative_uri} onChange={(e) => updateOutput(port.name, 'relative_uri', e.target.value)} placeholder="留空由平台自动生成" /></Form.Item></Card>
          })}</>}
          {!!Object.keys(parameterProperties).length && <><Text strong>应用参数</Text>{Object.entries(parameterProperties).map(([name, property]) => {
            const rawValue = selectedNode?.data.parameters?.[name] ?? property.default
            const label = typeof property.title === 'string' ? property.title : name
            const extra = typeof property.description === 'string' ? property.description : undefined
            const enumValues = Array.isArray(property.enum) ? property.enum.filter((item: unknown): item is string | number => typeof item === 'string' || typeof item === 'number') : []
            if (enumValues.length) return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Select value={(typeof rawValue === 'string' || typeof rawValue === 'number') ? rawValue : undefined} onChange={(next) => updateParameter(name, next)} options={enumValues.map((item: string | number) => ({ value: item, label: (property.enum_labels as Record<string,string>|undefined)?.[String(item)]||String(item) }))} /></Form.Item>
            if (property.type === 'boolean') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Switch checked={typeof rawValue === 'boolean' ? rawValue : false} onChange={(next) => updateParameter(name, next)} /></Form.Item>
            if (property.type === 'number' || property.type === 'integer') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><InputNumber value={typeof rawValue === 'number' ? rawValue : undefined} precision={property.type === 'integer' ? 0 : undefined} onChange={(next) => updateParameter(name, next)} style={{ width: '100%' }} /></Form.Item>
            if (property.type === 'array') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Select mode="tags" value={Array.isArray(rawValue) ? rawValue.filter((item: unknown): item is string => typeof item === 'string') : []} onChange={(next) => updateParameter(name, next)} /></Form.Item>
            const ui = isRecord(parameterContract.uiSchema[name]) ? parameterContract.uiSchema[name] : {}
            const value = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : ''
            return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}>{ui['ui:widget'] === 'textarea' ? <Input.TextArea value={value} onChange={(e) => updateParameter(name, e.target.value)} /> : <Input value={value} onChange={(e) => updateParameter(name, e.target.value)} />}</Form.Item>
          })}</>}
          {parameterContract.invalid && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="该应用镜像的参数信息不完整，请检查组件配置。" />}
        </Form>
      </>}
    </aside>
    </div>
    {libraryDrag&&createPortal(<div className={`workflow-library-drag-preview ${libraryDrag.overCanvas?'ready':''}`} style={{left:Math.min(libraryDrag.x+16,window.innerWidth-240),top:Math.min(libraryDrag.y+16,window.innerHeight-90)}}><span>{libraryDrag.kind==='application'?<AppstoreOutlined aria-hidden="true"/>:<BlockOutlined aria-hidden="true"/>}</span><div><strong>{libraryDrag.label}</strong><small>{libraryDrag.overCanvas?'松开以添加':'拖入中间画布'}</small></div></div>,document.body)}
    {menu&&<div className="workflow-context-menu" role="menu" style={{left:menu.x,top:menu.y}} onPointerDown={e=>e.stopPropagation()}><Button role="menuitem" disabled={!doc.nodes.length} onClick={()=>{copySelected();setMenu(undefined)}}>复制</Button><Button role="menuitem" disabled={!doc.nodes.length||readOnly} onClick={()=>{if(copySelected())removeSelected();setMenu(undefined)}}>剪切</Button><Button role="menuitem" disabled={!copied||readOnly} onClick={pasteSelected}>粘贴到此处</Button><Button role="menuitem" disabled={(!doc.nodes.length&&!doc.edges.length)||readOnly} danger onClick={()=>{removeSelected();setMenu(undefined)}}>删除所选</Button><Button role="menuitem" disabled={!instance||readOnly} onClick={()=>{ungroupApplication();setMenu(undefined)}}>解除组合</Button><Button role="menuitem" onClick={()=>{fitCanvas();setMenu(undefined)}}>适应画布</Button></div>}
  </div>
}

export default function WorkflowCanvas(props: Props) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>
}
