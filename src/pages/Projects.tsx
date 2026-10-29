import WorkflowBusinessReview from '../components/WorkflowBusinessReview'
import { projectDisplay, stateLabel } from '../utils/projectDisplay'
import DelegationReview from '../components/DelegationReview'
import CreateProjectModal from '../components/CreateProjectModal'
import { useAuth } from '../auth/AuthContext'
import { listConnectors } from '../api/connectors'
import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, Collapse, Descriptions, Form, Input, message, Modal, Popconfirm,
  Space, Table, Tabs, Tag, Tooltip, Typography,
} from 'antd'
import { ApiOutlined, CheckOutlined, CloseOutlined, PlusOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listContracts } from '../api/contracts'
import { checkDelegationReadiness, listDelegations, listApplicationTemplates } from '../api/applicationTemplates'
import { listAppImages } from '../api/appimages'
import WorkflowCanvas, { WorkflowDsl } from '../components/WorkflowCanvas'
import JsonViewer from '../components/JsonViewer'
import ApplicationWorkflowPanel from '../components/ApplicationWorkflowPanel'
import {
  Project, ProjectRun, ProjectStatus, RunStatus, RunTaskProgress, approveWorkflow, createProject,
  ensureConnectivity, getConnectivity, executeProject, getAvailableDomainData, getProject, listProjects, refreshProjectRun, submitWorkflow, cancelProjectRun, retryProjectRun,
} from '../api/projects'

const { Text } = Typography
const STATUS: Record<string, [string, string]> = {
  draft: ['default', '草稿'], pending_approval: ['orange', '待审核'], approved: ['green', '已审核'],
  running: ['blue', '执行中'], completed: ['green', '已完成'], succeeded: ['green', '已成功'],
  'pending-dispatch': ['gold', '等待调度'], accepted: ['cyan', '已接收'], failed: ['red', '失败'], cancelled: ['red', '已取消'], rejected: ['red', '已拒绝'], pending: ['default', '等待中'],
}

const statusTag = (status: ProjectStatus | RunStatus | string) => {
  const [color, label] = STATUS[status] ?? ['default', stateLabel(status)]
  return <Tag color={color}>{label}</Tag>
}
const errorText = (error: any) => error.response?.data?.detail ?? error.message ?? '操作失败'

type DiffLine = { type: 'ctx' | 'add' | 'del'; text: string }
function lineDiff(oldStr: string, newStr: string): DiffLine[] {
  const a = oldStr.split('\n'), b = newStr.split('\n')
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffLine[] = []; let i = 0, j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ type: 'ctx', text: a[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: a[i] }); i++ }
    else { out.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < m) { out.push({ type: 'del', text: a[i++] }) }
  while (j < n) { out.push({ type: 'add', text: b[j++] }) }
  return out
}

export default function Projects() {
  const {user}=useAuth()
  const connectors=useQuery({queryKey:['connectors'],queryFn:listConnectors})
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(Boolean(searchParams.get('contract')))
  const detailId = projectId ?? null
  const activeTab = searchParams.get('tab') || 'guide'
  const setActiveTab = (tab: string) => setSearchParams(p => { p.set('tab',tab);return p })
  const [workflowMode, setWorkflowMode] = useState<'canvas' | 'json'>('canvas')
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDsl>({ nodes: [], edges: [] })
  const [canvasNonce, setCanvasNonce] = useState(0)
  const [approval, setApproval] = useState<{ versionId: string; decision: 'approved' | 'rejected' } | null>(null)
  const [workflowForm] = Form.useForm()
  const [approvalForm] = Form.useForm()

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects, refetchInterval: 5000 })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const templates=useQuery({queryKey:['application-templates'],queryFn:listApplicationTemplates})
  const appimages = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })
  const detail = useQuery({
    queryKey: ['project', detailId], queryFn: () => getProject(detailId!), enabled: !!detailId,
    refetchInterval: (q) => q.state.data?.runs.some((r) => ['pending-dispatch', 'accepted', 'running'].includes(r.status)||(r.job_snapshot.artifact_lifecycle as any)?.state==='pending-confirmation') ? 5000 : false,
  })
  const delegationQuery=useQuery({queryKey:['project-delegations',detailId],queryFn:()=>listDelegations(detailId!),enabled:!!detailId})
  const readiness=useQuery({queryKey:['delegation-readiness',detailId,Array.isArray(workflowDraft.applications)?workflowDraft.applications.map(i=>({id:i.id,version_id:i.version_id,roles:i.roles})):[],delegationQuery.data],queryFn:()=>checkDelegationReadiness(detailId!,workflowDraft),enabled:!!detailId})
  const connectivityQuery=useQuery({queryKey:['project-connectivity',detailId],queryFn:()=>getConnectivity(detailId!),enabled:!!detailId,refetchInterval:q=>q.state.data?.pairs.some(p=>p.status==='probing')?2000:10000})
  const domainData = useQuery({ queryKey: ['project-domain-data', detailId], queryFn: () => getAvailableDomainData(detailId!), enabled: !!detailId })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] })
    if (detailId) qc.invalidateQueries({ queryKey: ['project', detailId] })
  }

  const refreshPageMut = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([
        detail.refetch({ throwOnError: true }),
        delegationQuery.refetch({ throwOnError: true }),
        readiness.refetch({ throwOnError: true }),
        connectivityQuery.refetch({ throwOnError: true }),
        domainData.refetch({ throwOnError: true }),
        contracts.refetch({ throwOnError: true }),
      ])
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    },
    onSuccess: () => message.success('项目信息已刷新'),
    onError: (e) => message.error(errorText(e)),
  })

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => { message.success('项目已创建'); setCreateOpen(false); invalidate(); navigate(`/privacy-computing/${p.id}`) },
    onError: (e) => message.error(errorText(e)),
  })
  const workflowMut = useMutation({
    mutationFn: ({ id, workflow }: { id: string; workflow: Record<string, unknown> }) => submitWorkflow(id, workflow),
    onSuccess: () => { message.success('编排已提交审核'); setActiveTab('approval'); invalidate() },
    onError: (e: any) => {
      const detail = e.response?.data?.detail
      if (e.response?.status === 409 && typeof detail === 'string' && detail.startsWith('提交前需要确认额外数据授权：')) {
        Modal.confirm({ title: '需要额外数据授权', content: detail.replace('提交前需要确认额外数据授权：', ''), okText: '确认并提交', cancelText: '取消', onOk: () => workflowMut.mutate({ id: detailId!, workflow: { ...(workflowDraft as any), grant_warning_acknowledged: true } }) })
      } else message.error(errorText(e))
    },
  })
  const approvalMut = useMutation({
    mutationFn: (v: { projectId: string; decision: 'approved' | 'rejected'; comment?: string }) =>
      approveWorkflow(v.projectId, v.decision, v.comment),
    onSuccess: (data, v) => {
      message.success('审核意见已提交'); setApproval(null); approvalForm.resetFields()
      // 审核通过且该版本已获全部参与方通过 → 自动跳转至执行监测
      if (v.decision === 'approved' && data.current_workflow?.status === 'approved') setActiveTab('runs')
      invalidate()
    },
    onError: (e) => message.error(errorText(e)),
  })
  const executeMut = useMutation({
    mutationFn: executeProject,
    onSuccess: () => { message.success('项目执行已发起'); invalidate() },
    onError: (e) => message.error(errorText(e)),
  })
  const refreshMut = useMutation({
    mutationFn: ({ projectId, runId }: { projectId: string; runId: string }) => refreshProjectRun(projectId, runId),
    onSuccess: () => { message.success('运行状态已刷新'); invalidate() },
    onError: (e) => message.error(errorText(e)),
  })
  const cancelMut=useMutation({mutationFn:({pid,rid}:{pid:string;rid:string})=>cancelProjectRun(pid,rid),onSuccess:()=>{message.success('已提交取消请求，停止及清理由引擎异步确认');invalidate()},onError:e=>message.error(errorText(e))})
  const retryMut=useMutation({mutationFn:({pid,rid}:{pid:string;rid:string})=>retryProjectRun(pid,rid),onSuccess:()=>{message.success('已创建新的整体执行');invalidate()},onError:e=>message.error(errorText(e))})
  const connectivityMut = useMutation({
    mutationFn: (id: string) => ensureConnectivity(id),
    onSuccess: () => { message.success('已发起互联检查'); qc.invalidateQueries({queryKey:['project-connectivity',detailId]}); invalidate() },
    onError: (e) => message.error(errorText(e)),
  })

  const submitWorkflowJson = (values: { workflow: string }) => {
    try {
      const workflow = JSON.parse(values.workflow)
      if ((!Array.isArray(workflow.nodes) && !Array.isArray(workflow.applications)) || !Array.isArray(workflow.edges)) throw new Error('必须包含应用或任务数组，以及 edges 数组')
      workflowMut.mutate({ id: detailId!, workflow })
    } catch (e: any) { message.error(`编排配置格式不正确：${e.message}`) }
  }
  const project = detail.data?.project
  const domains = detail.data?.domains ?? []
  const currentVersion = detail.data?.current_workflow
  const previousVersion = detail.data?.previous_workflow
  const runs = detail.data?.runs ?? []
  const workflowTemplate = {
    schedule_mode: 'Strict', max_parallelism: 1,
    nodes: [],
    edges: [],
  }
  const resetDraft = () => {
    const draft = (currentVersion?.workflow?.source_workflow ?? currentVersion?.workflow ?? workflowTemplate) as WorkflowDsl
    setWorkflowDraft(draft)
    workflowForm.setFieldValue('workflow', JSON.stringify(draft, null, 2))
    setWorkflowMode('canvas')
    setCanvasNonce((n) => n + 1)
  }
  // 详情加载或编排版本变化时，用当前版本(或模板)初始化编排草稿
  useEffect(() => {
    if (!detailId || !detail.isSuccess || !appimages.isSuccess) return
    const draft = (currentVersion?.workflow?.source_workflow ?? currentVersion?.workflow ?? workflowTemplate) as WorkflowDsl
    setWorkflowDraft(draft)
    workflowForm.setFieldValue('workflow', JSON.stringify(draft, null, 2))
    setCanvasNonce((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion?.id, detailId, detail.isSuccess, appimages.isSuccess])

  const connectivity = connectivityQuery.data ?? detail.data?.connectivity
  const activeServices=delegationQuery.data?.find(d=>d.status==='active'&&new Date(d.expires_at).getTime()>Date.now())?.scope.participants||[]
  const topologyDomains=[...domains,...activeServices.filter(p=>!domains.some(d=>d.connector_id===p.connector_id)).map(p=>({domain_id:p.connector_id,connector_id:p.connector_id,connector_name:p.connector_name||p.connector_id,org_name:p.org_name||null,contract_role:null}))]
  const display=projectDisplay({workflow:currentVersion?.workflow,templates:templates.data,images:appimages.data,connectors:connectors.data,domains:topologyDomains,resources:domainData.data})
  const connected = connectivity?.connected ?? false
  const workflowStatus = currentVersion?.status
  const workflowApproved = workflowStatus === 'approved'
  const ownProject=project?.created_by===user?.username
  const canApprove=domains.some(d=>connectors.data?.some(c=>c.id===d.connector_id&&c.created_by===user?.username))
  const canExecute = ownProject && connected && workflowApproved && ['approved','completed','failed'].includes(project?.status||'')
  const milestoneItems = [
    { key: 'guide', title: '项目指引', done: false },
    { key: 'applications', title: '应用选择', done: Boolean((Array.isArray(workflowDraft.applications) && workflowDraft.applications.length) || workflowDraft.nodes.length) },
    { key: 'delegations', title: '计算委托', done: readiness.data?.ready === true },
    { key: 'overview', title: '节点互联', done: connected },
    { key: 'workflow', title: '组件编排', done: Boolean(currentVersion) },
    { key: 'approval', title: '作业审核', done: workflowApproved },
    { key: 'runs', title: '执行监测', done: runs.some(run => run.status === 'succeeded') },
  ]
  const stepGuides = [
    { key: 'applications', title: '应用选择', action: '选择计算方法', description: '选择已发布的应用，填写公开参数、输入数据和参与角色。如需自定义应用，可跳过。', result: '确定本项目要算什么、用哪些数据。' },
    { key: 'delegations', title: '计算委托', action: '确认计算服务', description: '根据应用要求选择参与的计算服务方。如无外包计算需求，可跳过。', result: '所需角色、能力和独立性满足应用要求。' },
    { key: 'overview', title: '节点互联', action: '检查参与方连接', description: '点击“建立 / 检查互联”，检查业务参与方和受托计算服务之间的执行路径；有未连通项时先处理连接问题。', result: '全部执行参与方具备可用的互联路径。' },
    { key: 'workflow', title: '任务编排', action: '配置计算流程', description: '在宽屏画布中添加应用或应用镜像，连接数据与执行依赖，核对参数、数据绑定和角色。', result: '形成供参与方审核的编排版本。' },
    { key: 'approval', title: '作业审核', action: '核对并确认作业', description: '业务参与方核对当前版本的任务、数据、参数和角色，分别提交审核意见。', result: '当前编排版本获得所需参与方批准。' },
    { key: 'runs', title: '执行监测', action: '运行并查看结果', description: '由项目发起方发起执行，在中心查看运行和清理状态，前往对应数据连接器查看任务、日志与结果文件。', result: '获取计算结果；失败时先检查原因及清理状态再重跑。' },
  ]

  const runColumns = [
    { title: '执行记录', render: (_: unknown,r: ProjectRun) => <Text>第 {runs.length-runs.findIndex(item=>item.id===r.id)} 次执行</Text> },
    { title: '状态', dataIndex: 'status', render: statusTag },
    { title: '任务进度', render: (_: unknown, r: ProjectRun) => <RunTaskCount run={r}/> },
    { title: '发起时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    { title: '操作', render: (_: unknown, r: ProjectRun) => <Space wrap><Button type="link" onClick={() => refreshMut.mutate({ projectId: project!.id, runId: r.id })}>刷新</Button>{ownProject&&!['succeeded','failed','cancelled'].includes(r.status)&&<Popconfirm title="提交取消请求？" description="取消请求提交后，需要等待计算停止和临时数据清理确认。" onConfirm={()=>cancelMut.mutate({pid:project!.id,rid:r.id})}><Button danger loading={cancelMut.isPending} disabled={!!r.job_snapshot.cancel_requested}>{r.job_snapshot.cancel_requested?'取消确认中':'取消执行'}</Button></Popconfirm>}{ownProject&&['failed','cancelled'].includes(r.status)&&<Button disabled={(r.job_snapshot.artifact_lifecycle as any)?.state!=='cleaned'} loading={retryMut.isPending} onClick={()=>retryMut.mutate({pid:project!.id,rid:r.id})}>整体重跑</Button>}</Space> },
  ]

  return <Card className={`project-workbench ${activeTab==='workflow'?'editing':''}`} title={project ? `项目工作台：${project.name}` : '项目管理'} extra={!detailId ? <Space>
    <Button icon={<ReloadOutlined />} onClick={() => projects.refetch()}>刷新</Button>
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建项目</Button>
  </Space> : <Space wrap>
    <Button icon={<ReloadOutlined />} loading={refreshPageMut.isPending} onClick={() => refreshPageMut.mutate()}>刷新</Button>
    <Button onClick={() => navigate('/privacy-computing')}>返回项目列表</Button>
  </Space>}>
    {!detailId && <><Alert type="info" showIcon style={{ marginBottom: 16 }} message="项目基于已备案合约创建；编排发布后由所有参与方审核，审核通过才可发起执行。" />
    <Table rowKey="id" loading={projects.isLoading} dataSource={projects.data ?? []} columns={[
      { title: '项目名称', dataIndex: 'name' },
      { title: '合约', dataIndex: 'contract_id', render: (v: string) => <Link to={'/contracts/'+encodeURIComponent(v)}>{contracts.data?.find(c=>c.contract_id===v)?.document?.contractInfo?.contractName||'查看合约'}</Link> },
      { title: '编排版本', dataIndex: 'current_version', render: (v: number | null) => v ? `v${v}` : '未提交' },
      { title: '状态', dataIndex: 'status', render: statusTag },
      { title: '更新时间', dataIndex: 'updated_at', render: (v: string) => new Date(v).toLocaleString() },
      { title: '操作', render: (_: unknown, p: Project) => <Button type="link" onClick={() => navigate(`/privacy-computing/${p.id}`)}>进入项目</Button> },
    ]} /></>}

    <CreateProjectModal open={createOpen} contracts={contracts.data ?? []} loading={contracts.isLoading}
      error={contracts.isError} pending={createMut.isPending} initialContractId={searchParams.get('contract') || undefined}
      onCancel={() => setCreateOpen(false)} onRetry={() => { contracts.refetch() }} onCreate={createMut.mutate} />

    {detailId && <Card className="project-detail-shell" loading={detail.isLoading} bordered={false}>{detail.isError&&<Alert type="error" message="项目不可访问或加载失败" action={<Button onClick={()=>detail.refetch()}>重试</Button>}/>}
      {project && <><nav className="project-step-tags" aria-label="项目步骤">{milestoneItems.map((step, index) => <button
        type="button" key={step.key} className={`project-step-tag${activeTab === step.key ? ' active' : ''}${step.done ? ' completed' : ''}`}
        aria-current={activeTab === step.key ? 'step' : undefined}
        aria-label={`${step.title}${step.done ? '，已完成' : ''}`} onClick={() => setActiveTab(step.key)}
      ><span className="project-step-number" aria-hidden="true">{index === 0 ? '导览' : String(index).padStart(2, '0')}</span><span>{step.title}</span><span className="project-step-check">{step.done && <CheckOutlined aria-hidden="true" />}</span></button>)}</nav><Tabs className="project-step-panels" activeKey={activeTab} onChange={setActiveTab}
        items={[
        { key: 'guide', label: '项目概览与指引', children: <Space className="project-guide" direction="vertical" size={14} style={{width:'100%'}}>
          <div className="project-guide-intro"><div><Typography.Title level={3}>从这里开始你的计算协作</Typography.Title><Typography.Paragraph type="secondary">本项目基于数字合约组织参与方，依次完成应用配置、服务确认、互联、编排、审核和执行。</Typography.Paragraph></div><Button type="primary" onClick={()=>setActiveTab('applications')}>开始应用选择</Button></div>
          <section className="project-guide-basics" aria-label="项目基本信息"><Typography.Title level={4}>项目基本信息</Typography.Title><Descriptions column={{xs:1,sm:2,lg:3}} size="small">
            <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item><Descriptions.Item label="状态">{statusTag(project.status)}</Descriptions.Item>
            <Descriptions.Item label="当前版本">{project.current_version ? `v${project.current_version}` : '未提交'}</Descriptions.Item><Descriptions.Item label="发起方">{display.connectorName(project.initiator_connector_id)}</Descriptions.Item>
            <Descriptions.Item label="合约"><Link to={"/contracts/"+encodeURIComponent(project.contract_id)}>{contracts.data?.find(c=>c.contract_id===project.contract_id)?.document?.contractInfo?.contractName||project.contract_id}</Link></Descriptions.Item>
            <Descriptions.Item label="说明" span={3}>{project.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="业务参与方" span={3}><Space wrap>{domains.map(domain=><Tag key={domain.connector_id}>{domain.connector_name}{domain.org_name?` · ${domain.org_name}`:''}</Tag>)}</Space></Descriptions.Item>
          </Descriptions></section>
          <section aria-label="六步使用指引"><Typography.Title level={4}>接下来如何完成项目</Typography.Title><div className="project-guide-grid">{stepGuides.map((step,index)=><article className="project-guide-step" key={step.key}><div className="project-guide-step-heading"><span className="project-guide-number">{String(index+1).padStart(2,'0')}</span><div><Typography.Title level={5}>{step.title}</Typography.Title><Text type="secondary">{step.action}</Text></div>{milestoneItems.find(item=>item.key===step.key)?.done&&<Tag color="green" icon={<CheckOutlined/>}>已完成</Tag>}</div><Typography.Paragraph>{step.description}</Typography.Paragraph><p className="project-guide-result"><Text strong>完成后：</Text>{step.result}</p><Button onClick={()=>setActiveTab(step.key)}>前往{step.title}</Button></article>)}</div></section>
        </Space> },
        { key: 'applications', label: '应用选择', children: <Space className="application-stage" direction="vertical" size={20} style={{width:'100%'}}><ApplicationWorkflowPanel projectId={project.id} initiatorConnectorId={project.initiator_connector_id} workflow={workflowDraft} onChange={setWorkflowDraft} domains={domains} resources={domainData.data??[]} connectors={connectors.data??[]} mode="applications" readOnly={!ownProject} onNext={()=>setActiveTab('delegations')}/></Space> },
        { key: 'delegations', label: '计算委托', children: <Space className="delegation-stage" direction="vertical" style={{width:'100%'}}><Typography.Text className="step-instruction" type="secondary">根据应用分配计算服务方席位与委托期限，发出后所有参与方自动确认；请在作业审核中核对委托细节。</Typography.Text><ApplicationWorkflowPanel projectId={project.id} initiatorConnectorId={project.initiator_connector_id} workflow={workflowDraft} onChange={setWorkflowDraft} domains={domains} resources={domainData.data??[]} connectors={connectors.data??[]} mode="delegations" readOnly={!ownProject} onNext={()=>setActiveTab('overview')}/></Space> },
        { key: 'overview', label: '节点互联', children: <Space className="connectivity-stage" direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text className="step-instruction" type="secondary">验证各连接器连通性，确保隐私保护计算任务可执行。</Typography.Text>
          <Card size="small" title="参与方互联状态" extra={<Space wrap><Button type="primary" loading={connectivityMut.isPending} onClick={()=>connectivityMut.mutate(project.id)}>建立 / 检查互联</Button><Button onClick={()=>setActiveTab('workflow')}>进入组件编排</Button></Space>}><div className="project-topology">{topologyDomains.map(d=><div className="project-topology-node" key={d.connector_id}><ApiOutlined/><strong>{d.connector_name}</strong><Text type="secondary">{d.org_name||(d.contract_role==='provider'?'供数方':d.contract_role==='consumer'?'用数方':'')||'计算参与方'}</Text></div>)}</div><Table pagination={false} size="small" scroll={{x:true}} rowKey="domain_id" dataSource={topologyDomains} columns={[{title:'参与方',dataIndex:'connector_name'},...topologyDomains.map(target=>({title:target.connector_name,key:target.domain_id,render:(_:unknown,source:typeof topologyDomains[number])=>{if(source.domain_id===target.domain_id)return <Text type="secondary">本方</Text>;const pair=connectivity?.pairs.find(p=>(p.src===source.domain_id||p.src===source.connector_id)&&(p.dst===target.domain_id||p.dst===target.connector_id));return <Tooltip title={[(pair as any)?.checked_at?'检查时间：'+(pair as any).checked_at:'尚无检查记录'].filter(Boolean).join(' · ')}><Tag color={pair?.ready?'green':'orange'}>{pair?.ready?'已连通':({probing:'检查中',unknown:'待检查',failed:'未连通',ready:'已连通'}[pair?.status||'unknown'])}</Tag></Tooltip>}}))]}/></Card>
          <Collapse items={[{key:"connectivity",label:"高级信息：连接检查详情",children:<JsonViewer value={connectivity||{}} maxHeight={280}/>}]} />
          <Card size="small" title="参与连接器"><Space wrap>{domains.map((domain) => <Tag key={domain.connector_id} color={domain.connector_id === project.initiator_connector_id ? 'blue' : undefined}>{domain.connector_name}{domain.org_name ? ` · ${domain.org_name}` : ''}{domain.connector_id === project.initiator_connector_id ? ' · 发起方' : ''}</Tag>)}</Space></Card>
        </Space> },
        { key: 'workflow', label: '组件编排', children: <Space className="workflow-stage" direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert type="info" showIcon message="选择输入数据并分配参与方；数据连线传递数据，执行顺序连线表示先后关系。" />
          {domainData.isError && <Alert type="error" showIcon message="数据资源加载失败" description={errorText(domainData.error)} action={<Button size="small" onClick={() => domainData.refetch()}>重试</Button>} />}
          {domainData.isLoading && <Alert type="info" showIcon message="正在加载项目参与方的数据资源" />}
          <Tabs activeKey={workflowMode} onChange={(key) => {
            const mode = key as 'canvas' | 'json'
            if (mode === 'json') workflowForm.setFieldValue('workflow', JSON.stringify(workflowDraft, null, 2))
            else { try { setWorkflowDraft(JSON.parse(workflowForm.getFieldValue('workflow'))); setCanvasNonce((n) => n + 1) } catch { message.error('请先修正编排配置'); return } }
            setWorkflowMode(mode)
          }} tabBarExtraContent={<Space wrap><Button onClick={resetDraft}>重置为当前版本</Button><Button type="primary" disabled={!ownProject} loading={workflowMut.isPending} onClick={() => workflowMode === 'canvas' ? workflowMut.mutate({ id: detailId!, workflow: workflowDraft }) : workflowForm.submit()}>提交审核</Button></Space>} items={[
            { key: 'canvas', label: '可视化画布', children: <WorkflowCanvas key={`wf-${canvasNonce}`} projectId={project.id} initiatorConnectorId={project.initiator_connector_id} value={workflowDraft} appImages={appimages.data??[]} projectDomains={domains} domainData={domainData.data??[]} onChange={setWorkflowDraft} readOnly={!ownProject}/> },
            { key: 'json', label: '高级配置', children: <Form form={workflowForm} onFinish={submitWorkflowJson}><Form.Item name="workflow" rules={[{ required: true }]}><Input.TextArea rows={22} style={{ fontFamily: 'monospace' }} /></Form.Item></Form> },
          ]} />
          <Collapse items={[{key:'plan',label:'校验与执行计划预览',children:<ApplicationWorkflowPanel projectId={project.id} initiatorConnectorId={project.initiator_connector_id} workflow={workflowDraft} onChange={setWorkflowDraft} domains={domains} resources={domainData.data??[]} connectors={connectors.data??[]} mode="plan" readOnly={!ownProject}/>}]} />

        </Space> },
        { key: 'approval', label: '作业审核', children: currentVersion ? <Space className="approval-stage" direction="vertical" style={{ width: '100%' }} size={12}>
          <Typography.Text className="step-instruction" type="secondary">检查隐私保护计算项目计算委托与任务编排，进行执行审批。</Typography.Text>
          <Alert type={currentVersion.status === 'approved' ? 'success' : 'warning'} showIcon message={`编排 v${currentVersion.version} · ${STATUS[currentVersion.status]?.[1] ?? currentVersion.status}`}  action={<Space wrap>
            <Button type="primary" icon={<CheckOutlined />} disabled={!canApprove || currentVersion.status === 'approved'} onClick={() => setApproval({ versionId: currentVersion.id, decision: 'approved' })}>审核通过</Button>
            <Button danger icon={<CloseOutlined />} disabled={!canApprove || currentVersion.status === 'approved'} onClick={() => setApproval({ versionId: currentVersion.id, decision: 'rejected' })}>驳回</Button>
            {currentVersion.status === 'approved' && <Tag color="green">已通过，不可重复审核</Tag>}
          </Space>} />
          <DelegationReview templates={templates.data??[]} workflow={currentVersion.workflow} delegations={delegationQuery.data ?? []} connectors={connectors.data ?? []} loading={delegationQuery.isLoading} error={delegationQuery.isError} onRetry={() => { delegationQuery.refetch() }} />
          <WorkflowBusinessReview workflow={currentVersion.workflow} domains={topologyDomains} connectors={connectors.data??[]} resources={domainData.data??[]}/>
          <Collapse items={[{key:'dsl',label:'高级信息：编排文档与校验摘要',children:<><Typography.Paragraph copyable>{currentVersion.workflow_hash}</Typography.Paragraph><JsonViewer value={currentVersion.workflow} maxHeight={360}/></>}]}/>
          <div>
            <Collapse items={[{key:"changes",label:"查看与上一版本的变化",children:<>
            {previousVersion
              ? <pre style={{ maxHeight: 300, overflow: 'auto', padding: 12, background: 'var(--surface)', border: '1px solid var(--line)', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
                  {lineDiff(JSON.stringify(previousVersion.workflow, null, 2), JSON.stringify(currentVersion.workflow, null, 2)).map((line, i) =>
                    <div key={i} style={{ background: line.type === 'add' ? 'var(--diff-add)' : line.type === 'del' ? 'var(--diff-delete)' : undefined, whiteSpace: 'pre-wrap' }}>{(line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  ') + line.text}</div>)}
                </pre>
              : <div style={{ marginTop: 8 }}><Text type="secondary">首个编排版本，无历史对比</Text></div>}</>}]}/>
          </div>


        </Space> : <Alert type="info" message="尚未提交编排" description="请先在『组件编排』页配置任务并提交审核。" /> },
        { key: 'runs', label: `执行监测 (${runs.length})`, children: <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space className="execution-launch" wrap align="center">
            <Popconfirm title="确认按当前已审核版本发起执行？" onConfirm={() => executeMut.mutate(project.id)} disabled={!canExecute}>
              <Button type="primary" icon={<RocketOutlined />} disabled={!canExecute} loading={executeMut.isPending}>发起执行</Button>
            </Popconfirm>
            {!canExecute && <Text type="secondary" style={{ fontSize: 12 }}>需先完成节点互联与作业审核后方可执行</Text>}
          </Space>
          <Table rowKey="id" size="small" dataSource={runs} columns={runColumns} expandable={{ expandedRowRender: (r) => <RunSummary run={r} domains={topologyDomains} connectors={connectors.data??[]} templates={templates.data??[]} images={appimages.data??[]} user={user}/> }} />
        </Space> },
      ]} /></>}
    </Card>}

    <Modal title={approval?.decision === 'approved' ? '审核通过' : '驳回编排'} open={!!approval} onCancel={() => setApproval(null)} onOk={() => approvalForm.submit()} confirmLoading={approvalMut.isPending}>
      <Form form={approvalForm} layout="vertical" onFinish={(v) => approvalMut.mutate({ projectId: detailId!, decision: approval!.decision, comment: v.comment })}>
        <Form.Item name="comment" label="审核意见"><Input.TextArea rows={3} placeholder="选填" /></Form.Item>
      </Form>
    </Modal>
  </Card>
}

function RunTaskCount({run}:{run:ProjectRun}) {
 const master=run.job_snapshot.master_execution as {task_progress?:RunTaskProgress}|undefined
 const progress=master?.task_progress
 if(!progress)return <Text type="secondary">任务进度待同步</Text>
 const parts=[progress.running?`运行中 ${progress.running}`:'',progress.failed?`失败 ${progress.failed}`:'',progress.cancelled?`已取消 ${progress.cancelled}`:'',progress.pending?`等待中 ${progress.pending}`:'',progress.unknown?`状态待确认 ${progress.unknown}`:''].filter(Boolean)
 return <Space direction="vertical" size={0}><Text>已完成 {progress.completed} / {progress.total} 个任务</Text>{parts.length>0&&<Text type="secondary" style={{fontSize:12}}>{parts.join(' · ')}</Text>}</Space>
}
function RunSummary({run,domains:projectDomains,connectors,templates,images,user}:{run:ProjectRun;domains:any[];connectors:any[];templates:any[];images:any[];user:any}) {
 const snapshot=run.job_snapshot as any
 const workflow=snapshot.execution_snapshot?.workflow||{}
 const participants=snapshot.execution_snapshot?.participants||snapshot.execution_request?.participants||[]
 const display=projectDisplay({workflow,domains:[...projectDomains,...participants],connectors,templates,images})
 const progress=snapshot.master_execution?.task_progress as RunTaskProgress|undefined
 const guidance=snapshot.result_guidance||{},outputs:any[]=guidance.outputs||[]
 const taskName=(id:string)=>display.task(id)?display.taskName(id):'任务信息待同步'
 const explanation=run.status==='succeeded'?'本次执行已完成':run.status==='failed'?'执行未完成，请查看诊断详情或在数据连接器中核查原因':run.status==='cancelled'?'本次执行已取消':'执行状态持续更新中'
 return <Space direction="vertical" size={16} style={{width:'100%'}}>
  <Card title="基本信息" size="small" className="execution-summary-card">
   <dl className="execution-basic-grid">
    <div className="execution-request-id"><dt>执行请求编号</dt><dd><Text copyable>{run.kuscia_job_id}</Text></dd></div>
    <div><dt>执行状态</dt><dd>{statusTag(run.status)}</dd></div>
    <div><dt>任务进度</dt><dd><RunTaskCount run={run}/></dd></div>
    <div><dt>发起方</dt><dd>{run.created_by===user?.username?user.name||user.username:run.created_by}</dd></div>
    <div><dt>创建时间</dt><dd>{new Date(run.created_at).toLocaleString()}</dd></div>
    <div><dt>更新时间</dt><dd>{new Date(run.updated_at).toLocaleString()}</dd></div>
    <div><dt>执行说明</dt><dd>{explanation}</dd></div>
   </dl>
  <section className="execution-result-files" aria-label="结果数据文件"><h4>结果数据文件</h4><Typography.Paragraph type="secondary">请复制执行请求编号，登录对应数据连接器，在“项目运行”页面输入编号查看日志与结果。</Typography.Paragraph>{outputs.length?<Table size="small" pagination={false} rowKey={o=>o.node+o.port+o.connector_id} dataSource={outputs} columns={[
   {title:'持有方',dataIndex:'connector_id',render:id=>display.connectorName(id)},
   {title:'结果',render:(_,o)=>taskName(o.node)+' · '+display.portName(display.task(o.node),o.port,false)},
   {title:'操作',render:(_,o)=>{const route='/project-runs?execution='+encodeURIComponent(run.kuscia_job_id);const base=guidance.portal_browser_urls?.[o.connector_id];return <Space direction="vertical">{base&&/^https?:\/\//.test(base)?<a href={base.replace(/\/$/,'')+route} target="_blank" rel="noreferrer">查看日志与结果</a>:<Link to="/connectors">前往数据连接器</Link>}<details><summary>查看文件路径</summary><Text copyable>{o.relative_uri}</Text></details></Space>}}
  ]}/>:<Text type="secondary">结果尚未同步，可在数据连接器中查看任务输出。</Text>}</section>
  </Card>
  {snapshot.cancel_requested&&!['failed','cancelled','succeeded'].includes(run.status)&&<Alert type="warning" showIcon message="取消请求已提交，等待计算停止。"/>}
  <Card title="任务执行进度" extra={progress?.updated_at&&<Text type="secondary">更新于 {new Date(progress.updated_at).toLocaleTimeString()}</Text>}>
   {progress?<><Typography.Paragraph><RunTaskCount run={run}/></Typography.Paragraph><Table size="small" pagination={false} rowKey="node_id" dataSource={progress.tasks} columns={[{title:'任务',render:(_,task)=><div className="run-task-label"><span>{taskName(task.node_id)}</span><details><summary>查看 KusciaTask 号</summary>{task.task_id?<Text copyable code>{task.task_id}</Text>:<Text type="secondary">任务编号待同步</Text>}</details></div>},{title:'状态',dataIndex:'state',render:statusTag},{title:'执行说明',render:(_,task)=>task.state==='failed'?'未能完成，请查看诊断详情':task.state==='unknown'?'任务状态待确认':stateLabel(task.state)}]}/></>:<Text type="secondary">任务进度待同步，请点击执行记录右侧的“刷新”。</Text>}
  </Card>
  <Collapse items={[{key:'diagnostics',label:'高级信息：运行记录与诊断详情',children:<JsonViewer value={{snapshot:run.job_snapshot,failure:run.failure_info}} maxHeight={360}/>}]} />
 </Space>
}
