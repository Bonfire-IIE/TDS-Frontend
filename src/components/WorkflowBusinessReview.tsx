import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Empty, Spin, Tag } from 'antd'
import { ArrowDownOutlined, ArrowRightOutlined, TeamOutlined } from '@ant-design/icons'
import { listApplicationTemplates, listComputationServices } from '../api/applicationTemplates'
import { listAppImages } from '../api/appimages'
import type { AvailableDomainData } from '../api/projects'
import type { Connector } from '../api/connectors'
import { projectDisplay, valueLabel } from '../utils/projectDisplay'

export default function WorkflowBusinessReview({workflow,domains=[],connectors=[],resources=[]}:{workflow:any;domains?:{domain_id?:string;connector_id?:string;connector_name:string}[];connectors?:Connector[];resources?:AvailableDomainData[]}) {
 const prefix=useId()
 const templates=useQuery({queryKey:['application-templates'],queryFn:listApplicationTemplates})
 const images=useQuery({queryKey:['appimages'],queryFn:listAppImages})
 const services=useQuery({queryKey:['computation-services'],queryFn:listComputationServices})
 const display=projectDisplay({workflow,domains,connectors,resources,templates:templates.data,images:images.data})
 const nodes=display.nodes,edges:any[]=workflow.edges||[]
 const names=new Set(nodes.map(n=>n.id)),rank=new Map<string,number>(),remaining=new Set<string>(names)
 // Topological layers preserve parallel branches and never invent an order for cycles.
 while(remaining.size){
  const ready=[...remaining].filter(id=>edges.filter(e=>e.target===id&&names.has(e.source)).every(e=>rank.has(e.source)))
  if(!ready.length)break
  for(const id of ready){rank.set(id,Math.max(0,...edges.filter(e=>e.target===id&&rank.has(e.source)).map(e=>rank.get(e.source)!+1)));remaining.delete(id)}
 }
 const levels=[...new Set(rank.values())].sort((a,b)=>a-b).map(level=>nodes.filter(n=>rank.get(n.id)===level))
 if(remaining.size)levels.push(nodes.filter(n=>remaining.has(n.id)))
 const connectorName=(id:string)=>services.data?.find(c=>c.id===id)?.name||display.connectorName(id)
 const targetId=(id:string)=>`${prefix}-${id}`
 const groups=(links:any[],key:'source'|'target')=>[...new Set(links.map(e=>e[key]))].map(id=>({id,links:links.filter(e=>e[key]===id)}))
 const renderLinks=(links:any[],input:boolean)=>groups(links,input?'source':'target').map(group=>{
  const data=group.links.filter(e=>e.type==='data'),control=group.links.filter(e=>e.type!=='data')
  return <div className="review-transfer" key={group.id}>
   <div className="review-transfer-title"><span>{input?'来自':'交给'}</span><a href={`#${targetId(group.id)}`}>{display.taskName(group.id)}</a><ArrowRightOutlined aria-hidden="true"/></div>
   {!!data.length&&<details><summary>数据传递 · {data.length} 项</summary><ul>{data.map((edge,index)=><li key={index}>{display.portName(display.task(edge.source),edge.source_handle,false)}<span aria-hidden="true"> → </span>{display.portName(display.task(edge.target),edge.target_handle)}</li>)}</ul></details>}
   {!!control.length&&<span className="review-control">执行顺序 · {input?'等待该任务完成':'完成后启动该任务'}（不传递数据）</span>}
  </div>
 })
 return <section className="workflow-review" aria-label="作业流总览">
  <header className="workflow-review-heading"><div><h3>作业流总览</h3></div><Tag>共{nodes.length} 个任务</Tag></header>
  {(templates.isLoading||images.isLoading)&&<Spin size="small"/>}
  {(templates.isError||images.isError)&&<Alert type="warning" showIcon message="部分应用信息加载失败，请刷新后核对任务详情。"/>}
  {!!remaining.size&&<Alert type="warning" showIcon message="存在循环或无法排序的依赖，请在编排页核对。相关任务列于最后一层。"/>}
  {!nodes.length&&<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此版本暂无任务"/>}
  {levels.map((tasks,index)=><div className="review-layer" key={index}>
   <div className="review-layer-marker"><span>{String(index+1).padStart(2,'0')}</span><strong>{index===0?'输入与准备':index===levels.length-1?'输出与交付':'计算与处理'}</strong>{index>0&&<ArrowDownOutlined aria-label="依赖上游任务"/>}</div>
   <div className="review-task-grid">{tasks.map(node=>{
    const incoming=edges.filter(e=>e.target===node.id),outgoing=edges.filter(e=>e.source===node.id)
    const parties:any[]=node.parties||[],bindings:any[]=node.input_bindings||[]
    const participants=[...new Set<string>(parties.map(p=>p.connector_id||p.domain_id))]
    const outputs:any[]=display.image(node)?.io_schema?.outputs||[]
    const openOutputs=outputs.filter(p=>!outgoing.some(e=>e.type==='data'&&e.source_handle===p.name))
    return <article className="review-task" id={targetId(node.id)} key={node.id}>
     <header><span className="review-task-application">{node.application_instance?display.applicationName(node.application_instance):'独立任务'}</span><h4>{display.taskName(node)}</h4></header>
     <section className="review-participants" aria-label="参与方与角色"><h5><TeamOutlined aria-hidden="true"/>参与方 <span>{participants.length}</span></h5><ul>{participants.map(id=><li key={id}><strong>{connectorName(id)}</strong><span>{parties.filter(p=>(p.connector_id||p.domain_id)===id).map(p=>display.roleName(node,p.role)).join('、')}</span></li>)}</ul>{!participants.length&&<p className="review-muted">尚未分配参与方</p>}</section>
     <div className="review-io-grid"><section aria-label="输入数据"><h5><span className="review-port-dot"/>输入</h5>
      {bindings.filter(b=>!incoming.some(e=>e.type==='data'&&e.target_handle===b.port)).map((binding,index)=><div className="review-resource" key={index}><strong>{display.resource(binding.domain_id,binding.domaindata_id)?.name||'已绑定资源（当前目录不可用）'}</strong><span>{display.portName(node,binding.port)}</span><small>持有方：{connectorName(binding.domain_id)}</small></div>)}
      {renderLinks(incoming,true)}
      {!bindings.length&&!incoming.length&&<p className="review-muted">无需外部输入</p>}
     </section><section aria-label="输出数据"><h5><span className="review-port-dot output"/>输出</h5>
      {renderLinks(outgoing,false)}
      {!!openOutputs.length&&<div className="review-resource"><strong>{!outgoing.length?'结果输出':'其他输出'}</strong>{openOutputs.length<=3?openOutputs.map(p=><span key={p.name}>{p.title||'未命名输出'}</span>):<details><summary>{openOutputs.length} 项输出</summary><ul>{openOutputs.map(p=><li key={p.name}>{p.title||'未命名输出'}</li>)}</ul></details>}<small>未连接下游任务</small></div>}
      {!outputs.length&&!outgoing.length&&<p className="review-muted">无输出接口</p>}
     </section></div>
     {!!Object.keys(node.parameters||{}).length&&<details className="review-parameters"><summary>查看执行参数 · {Object.keys(node.parameters).length} 项</summary><dl>{Object.entries(node.parameters).map(([key,value])=>{const schema=display.parameter(node,key);return <div key={key}><dt>{schema.title||'未命名参数'}</dt><dd>{valueLabel(value,schema)}</dd></div>})}</dl></details>}
    </article>
   })}</div>
  </div>)}
 </section>
}
