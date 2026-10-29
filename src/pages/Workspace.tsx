import { useState } from 'react'
import { Alert, Button, Empty, Pagination, Skeleton } from 'antd'
import { ArrowRightOutlined, ApartmentOutlined, FileProtectOutlined, DatabaseOutlined, ShoppingOutlined, AuditOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, ApiOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { listContracts, info } from '../api/contracts'
import { listProjects, type ProjectStatus } from '../api/projects'
import { searchResources } from '../api/catalog'
import { listConnectors } from '../api/connectors'

const statuses:Record<ProjectStatus,{label:string;tone:string}>={draft:{label:'编排中',tone:'neutral'},pending_approval:{label:'待审核',tone:'attention'},approved:{label:'待执行',tone:'neutral'},running:{label:'执行中',tone:'active'},completed:{label:'已完成',tone:'success'},failed:{label:'执行失败',tone:'danger'}}
const dateLabel=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit'}).format(date)}
const shortcuts=[{href:'/catalog',title:'数据资源',description:'查看与管理已登记资源',icon:DatabaseOutlined},{href:'/products',title:'数据产品',description:'发现可用于协作的数据',icon:ShoppingOutlined},{href:'/contracts',title:'数字合约',description:'推进协商与授权约定',icon:FileProtectOutlined},{href:'/usage',title:'使用控制',description:'追踪数据使用与履约记录',icon:AuditOutlined}]

export default function Workspace() {
  const { user } = useAuth()
  const [filter,setFilter]=useState('全部'),[page,setPage]=useState(1)
  const reviewer=user?.roles?.some(role=>['operator','supervisor'].includes(role))
  const operator=user?.roles?.includes('operator')
  const contracts=useQuery({queryKey:['workspace-contracts'],queryFn:listContracts})
  const projects=useQuery({queryKey:['workspace-projects'],queryFn:listProjects})
  const connectors=useQuery({queryKey:['workspace-connectors'],queryFn:listConnectors,enabled:Boolean(operator)})
  const resources=useQuery({queryKey:['workspace-resources'],queryFn:()=>searchResources({}),enabled:Boolean(reviewer)})
  const modules=[{label:'数字合约',query:contracts},{label:'计算项目',query:projects},...(operator?[{label:'连接器申请',query:connectors}]:[]),...(reviewer?[{label:'资源审核',query:resources}]:[])]
  const failed=modules.filter(item=>item.query.isError),loading=modules.some(item=>item.query.isLoading),refreshing=modules.some(item=>item.query.isFetching)
  const tasks=[
    ...(reviewer?(resources.data||[]).filter(r=>r.status==='pending_review').map(r=>({id:'resource-'+r.id,title:r.name,category:'资源审核',reason:'数据资源等待公开审核',href:'/catalog',action:'审核资源',tone:'attention',icon:DatabaseOutlined})):[]),
    ...(operator?(connectors.data||[]).filter(c=>c.status==='applying').map(c=>({id:'connector-'+c.id,title:c.name,category:'接入申请',reason:'连接器身份申请待审核',href:'/connectors',action:'查看申请',tone:'attention',icon:ApiOutlined})):[]),
    ...(projects.data||[]).filter(p=>['pending_approval','failed'].includes(p.status)).map(p=>({id:'project-'+p.id,title:p.name,category:'计算项目',reason:p.status==='failed'?'执行未完成，请进入项目查看失败原因':'任务编排已提交，等待参与方审核',href:`/privacy-computing/${p.id}`,action:p.status==='failed'?'查看原因':'审核编排',tone:p.status==='failed'?'danger':'attention',icon:ApartmentOutlined})),
    ...(contracts.data||[]).filter(c=>['initiated','negotiating'].includes(info(c).contractStatus)).map(c=>({id:'contract-'+c.contract_id,title:info(c).contractName,category:'合约协商',reason:'协商尚未完成，请核对参与方与合约内容',href:'/contracts/'+encodeURIComponent(c.contract_id),action:'查看合约',tone:'neutral',icon:FileProtectOutlined})),
  ]
  const categories=['全部',...new Set(tasks.map(t=>t.category))],filtered=tasks.filter(t=>filter==='全部'||t.category===filter)
  const recent=[...(projects.data||[])].sort((a,b)=>(b.updated_at||b.created_at).localeCompare(a.updated_at||a.created_at)).slice(0,3)
  const running=(projects.data||[]).filter(p=>p.status==='running').length
  return <div className="center-workspace workspace-redesign">
    <header className="workspace-intro"><div><div className="workspace-eyebrow">协作从这里继续</div><h1>工作台<span>你好，{user?.name||user?.username}</span></h1><p>聚焦需要处理的事项，让数据协作有序推进。</p></div><div className="workspace-header-actions"><Button icon={<ReloadOutlined aria-hidden="true"/>} loading={refreshing} onClick={()=>modules.forEach(item=>void item.query.refetch())}>刷新</Button><Link to="/products" className="workspace-primary-link">发现数据产品<ArrowRightOutlined aria-hidden="true"/></Link></div></header>
    <section className="workspace-overview" aria-label="协作概览">
      {[{label:'待关注事项',value:tasks.length,detail:'需要你进一步处理',icon:ClockCircleOutlined},{label:'执行中项目',value:running,detail:'关注当前计算进展',icon:ApartmentOutlined},{label:'计算项目',value:projects.data?.length,detail:'持续推进计算协作',icon:FileProtectOutlined}].map((item,index)=><div className={`workspace-metric metric-${index}`} key={item.label}><span className="workspace-metric-icon"><item.icon aria-hidden="true"/></span><div><span>{item.label}</span><strong>{loading?'—':item.value??'—'}</strong><small>{item.detail}</small></div></div>)}
      <div className="workspace-overview-note"><span className="workspace-eyebrow">从数据到计算</span><strong>连接资源，达成协作</strong><span>资源登记 <ArrowRightOutlined aria-hidden="true"/> 合约约定 <ArrowRightOutlined aria-hidden="true"/> 隐私计算</span></div>
    </section>
    {failed.length>0&&<Alert className="workspace-load-warning" type="warning" showIcon message={`${failed.map(item=>item.label).join('、')}加载失败，相关数据暂不可用`} action={<Button onClick={()=>failed.forEach(item=>void item.query.refetch())}>重试</Button>}/>}
    <div className="workspace-main-grid">
      <section className="workspace-panel workspace-attention" aria-labelledby="workspace-attention-title"><div className="workspace-section-heading"><div><h2 id="workspace-attention-title">待关注事项</h2><p>待审核、待协商与异常事项，集中处理。</p></div><span className="workspace-heading-icon"><ClockCircleOutlined aria-hidden="true"/></span></div>
        <div className="workspace-filters" role="group" aria-label="筛选待关注事项">{categories.map(category=><button type="button" key={category} aria-pressed={filter===category} className={filter===category?'selected':''} onClick={()=>{setFilter(category);setPage(1)}}>{category}{category!=='全部'&&<span>{tasks.filter(t=>t.category===category).length}</span>}</button>)}</div>
        <div className="workspace-attention-body" tabIndex={0} role="region" aria-label="待关注事项列表">{loading?<div className="workspace-loading"><Skeleton active paragraph={{rows:5}}/></div>:filtered.length?<ul className="workspace-task-list">{filtered.slice((page-1)*5,page*5).map(task=><li key={task.id}><span className={`workspace-task-icon ${task.tone}`}><task.icon aria-hidden="true"/></span><div className="workspace-task-copy"><span className={`workspace-task-category ${task.tone}`}>{task.tone==='danger'&&<ExclamationCircleOutlined aria-hidden="true"/>}{task.category}</span><h3>{task.title}</h3><p>{task.reason}</p></div><Link className="workspace-task-action" to={task.href}>{task.action}<ArrowRightOutlined aria-hidden="true"/></Link></li>)}</ul>:<div className="workspace-clear-state"><span><CheckCircleOutlined aria-hidden="true"/></span><h3>{failed.length?'暂无已加载的待关注事项':'当前事项已处理妥当'}</h3><p>{failed.length?'部分数据尚未加载，请重试后查看。':'可以继续推进计算项目，或发现新的数据产品。'}</p><Link to="/privacy-computing">前往计算项目 <ArrowRightOutlined aria-hidden="true"/></Link></div>}</div>
        {filtered.length>5&&<Pagination className="workspace-pagination" current={page} pageSize={5} total={filtered.length} showSizeChanger={false} onChange={setPage} size="small"/>}
      </section>
      <section className="workspace-panel workspace-recent" aria-labelledby="workspace-recent-title"><div className="workspace-section-heading"><div><h2 id="workspace-recent-title">近期计算项目</h2><p>接着上次的进度，继续推进。</p></div><Link to="/privacy-computing" aria-label="查看全部计算项目" className="workspace-section-more"><ArrowRightOutlined aria-hidden="true"/></Link></div>
        <div className="workspace-recent-body" tabIndex={0} role="region" aria-label="近期计算项目列表">{projects.isLoading?<div className="workspace-loading"><Skeleton active/></div>:recent.length?<div className="workspace-project-list">{recent.map(project=>{const status=statuses[project.status]||{label:project.status,tone:'neutral'};return <Link to={`/privacy-computing/${project.id}`} className="workspace-project" key={project.id}><div className="workspace-project-top"><span className="workspace-project-icon"><ApartmentOutlined aria-hidden="true"/></span><span className={`workspace-project-status ${status.tone}`}><i/>{status.label}</span></div><h3>{project.name}</h3><div className="workspace-project-bottom"><span>{project.current_version?`编排 v${project.current_version}`:'尚未提交编排'}<i>·</i>{dateLabel(project.updated_at||project.created_at)} 更新</span><ArrowRightOutlined aria-hidden="true"/></div></Link>})}</div>:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={projects.isError?'项目暂不可用，请重试':'尚无计算项目'}/>}</div>
        <Link className="workspace-all-projects" to="/privacy-computing">查看全部项目<ArrowRightOutlined aria-hidden="true"/></Link>
      </section>
    </div>
    <section className="workspace-continue" aria-labelledby="workspace-continue-title"><div className="workspace-section-heading"><div><h2 id="workspace-continue-title">继续协作</h2><p>从常用入口，开启下一步。</p></div></div><div className="workspace-shortcuts">{shortcuts.map(item=><Link key={item.href} to={item.href}><span className="workspace-shortcut-icon"><item.icon aria-hidden="true"/></span><div><h3>{item.title}</h3><p>{item.description}</p></div><ArrowRightOutlined aria-hidden="true"/></Link>)}</div></section>
  </div>
}
