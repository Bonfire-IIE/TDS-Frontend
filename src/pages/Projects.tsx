import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Card, Descriptions, Form, Input, message, Modal, Popconfirm,
  Select, Space, Steps, Table, Tabs, Tag, Timeline, Typography,
} from 'antd'
import { ApiOutlined, CheckOutlined, CloseOutlined, PlusOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { listContracts } from '../api/contracts'
import { listAppImages } from '../api/appimages'
import { createProjectTemplate, listProjectTemplates } from '../api/projectTemplates'
import { useAuth } from '../auth/AuthContext'
import WorkflowCanvas, { WorkflowDsl } from '../components/WorkflowCanvas'
import JsonViewer from '../components/JsonViewer'
import {
  Project, ProjectRun, ProjectStatus, RunStatus, approveWorkflow, createProject,
  ensureConnectivity, executeProject, getAvailableDomainData, getProject, listProjects, refreshProjectRun, submitWorkflow,
} from '../api/projects'

const { Text } = Typography
const STATUS: Record<string, [string, string]> = {
  draft: ['default', '草稿'], pending_approval: ['gold', '待审核'], approved: ['blue', '已审核'],
  running: ['blue', '执行中'], completed: ['blue', '已完成'], succeeded: ['blue', '已成功'],
  failed: ['red', '失败'], rejected: ['red', '已拒绝'], pending: ['default', '等待中'],
}

const statusTag = (status: ProjectStatus | RunStatus | string) => {
  const [color, label] = STATUS[status] ?? ['default', status]
  return <Tag color={color}>{label}</Tag>
}
const short = (value: string) => value.length > 16 ? `${value.slice(0, 14)}…` : value
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
  const { user } = useAuth()
  const isAdmin = Boolean(user?.roles?.some((role) => role === 'operator' || role === 'supervisor'))
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [createOpen, setCreateOpen] = useState(false)
  const detailId = projectId ?? null
  const [activeTab, setActiveTab] = useState('overview')
  const [workflowMode, setWorkflowMode] = useState<'canvas' | 'json'>('canvas')
  const [workflowDraft, setWorkflowDraft] = useState<WorkflowDsl>({ nodes: [], edges: [] })
  const [canvasNonce, setCanvasNonce] = useState(0)
  const [approval, setApproval] = useState<{ versionId: string; decision: 'approved' | 'rejected' } | null>(null)
  const [createForm] = Form.useForm()
  const [workflowForm] = Form.useForm()
  const [approvalForm] = Form.useForm()
  const [templateForm] = Form.useForm()
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [importTemplateId, setImportTemplateId] = useState<string>()

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects, refetchInterval: 5000 })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const appimages = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })
  const projectTemplates = useQuery({ queryKey: ['project-templates'], queryFn: listProjectTemplates })
  const detail = useQuery({
    queryKey: ['project', detailId], queryFn: () => getProject(detailId!), enabled: !!detailId && !isAdmin,
    refetchInterval: (q) => q.state.data?.runs.some((r) => r.status === 'running') ? 5000 : false,
  })
  const domainData = useQuery({ queryKey: ['project-domain-data', detailId], queryFn: () => getAvailableDomainData(detailId!), enabled: !!detailId && !isAdmin })
  const filedContracts = useMemo(() => (contracts.data ?? []).filter((c) => c.status === 'filed'), [contracts.data])
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] })
    if (detailId) qc.invalidateQueries({ queryKey: ['project', detailId] })
  }

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => { message.success('项目已创建'); setCreateOpen(false); invalidate(); navigate(`/projects/${p.id}`) },
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
  const connectivityMut = useMutation({
    mutationFn: (id: string) => ensureConnectivity(id),
    onSuccess: () => { message.success('节点互联已建立'); invalidate() },
    onError: (e) => message.error(errorText(e)),
  })
  const saveTemplateMut = useMutation({
    mutationFn: (values: { name: string; description?: string }) => createProjectTemplate({ ...values, workflow: workflowDraft as unknown as Record<string, unknown> }),
    onSuccess: () => { message.success('当前镜像工作流已保存为项目模板'); setSaveTemplateOpen(false); templateForm.resetFields(); qc.invalidateQueries({ queryKey: ['project-templates'] }) },
    onError: (e) => message.error(errorText(e)),
  })

  const submitWorkflowJson = (values: { workflow: string }) => {
    try {
      const workflow = JSON.parse(values.workflow)
      if (!Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) throw new Error('必须包含 nodes 和 edges 数组')
      workflowMut.mutate({ id: detailId!, workflow })
    } catch (e: any) { message.error(`编排 JSON 无效：${e.message}`) }
  }
  const project = detail.data?.project
  const domains = detail.data?.domains ?? []
  const currentVersion = detail.data?.current_workflow
  const previousVersion = detail.data?.previous_workflow
  const approvals = detail.data?.approvals ?? []
  const runs = detail.data?.runs ?? []
  const workflowTemplate = {
    schedule_mode: 'Strict', max_parallelism: 1,
    nodes: [{ id: 'task-1', alias: 'task-1', app_image: appimages.data?.find((a) => a.status === 'registered')?.name ?? 'app-image-name', parties: domains.map((p) => ({ domain_id: p.domain_id, role: '' })), input_bindings: [], output_bindings: [], parameters: {} }],
    edges: [],
  }
  const resetDraft = () => {
    const draft = (currentVersion?.workflow ?? workflowTemplate) as WorkflowDsl
    setWorkflowDraft(draft)
    workflowForm.setFieldValue('workflow', JSON.stringify(draft, null, 2))
    setWorkflowMode('canvas')
    setCanvasNonce((n) => n + 1)
  }
  const importProjectTemplate = () => {
    const template = (projectTemplates.data ?? []).find((item) => item.id === importTemplateId)
    if (!template) { message.warning('请先选择项目模板'); return }
    const consumerDomain = domains.find((domain) => domain.connector_id === project?.initiator_connector_id)?.domain_id
    const providerDomain = domains.find((domain) => domain.connector_id !== project?.initiator_connector_id)?.domain_id
    const instantiate = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(instantiate)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, instantiate(item)]))
      if (value === '{{provider_domain}}') return providerDomain ?? value
      if (value === '{{consumer_domain}}') return consumerDomain ?? value
      return value
    }
    Modal.confirm({
      title: `导入项目模板“${template.name}”？`,
      content: '导入将覆盖当前尚未提交的编排草稿，不影响已经提交的编排版本。',
      okText: '确认导入',
      cancelText: '取消',
      onOk: () => {
        const draft = instantiate(template.workflow) as WorkflowDsl
        setWorkflowDraft(draft)
        workflowForm.setFieldValue('workflow', JSON.stringify(draft, null, 2))
        setWorkflowMode('canvas')
        setCanvasNonce((nonce) => nonce + 1)
        message.success('项目模板已导入到编排草稿')
      },
    })
  }
  // 详情加载或编排版本变化时，用当前版本(或模板)初始化编排草稿
  useEffect(() => {
    const draft = (currentVersion?.workflow ?? workflowTemplate) as WorkflowDsl
    setWorkflowDraft(draft)
    workflowForm.setFieldValue('workflow', JSON.stringify(draft, null, 2))
    setCanvasNonce((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion?.id, detailId])

  const connectivity = detail.data?.connectivity
  const connected = connectivity?.connected ?? false
  const workflowStatus = currentVersion?.status
  const workflowApproved = workflowStatus === 'approved'
  const latestRun = runs[0]
  const canExecute = connected && workflowApproved
  const milestoneCurrent = !connected ? 0 : !currentVersion ? 1 : !workflowApproved ? 2 : 3
  const milestoneItems = [
    {
      title: '节点互联',
      status: (connected ? 'finish' : 'process') as 'finish' | 'process',
      icon: <ApiOutlined />,
      description: connected
        ? <Space direction="vertical" size={2}>
            <Tag color="green">已连通</Tag>
            {(connectivity?.pairs ?? []).map((p) => <Text key={`${p.src}-${p.dst}`} type="secondary" style={{ fontSize: 12 }}>{p.src}→{p.dst} ✓</Text>)}
          </Space>
        : <Space direction="vertical" size={4}>
            {(connectivity?.pairs ?? []).filter((p) => !p.ready).map((p) => <Text key={`${p.src}-${p.dst}`} type="secondary" style={{ fontSize: 12 }}>{p.src}→{p.dst}：{STATUS[p.status ?? '']?.[1] ?? p.status ?? '未连通'}</Text>)}
            <Button size="small" type="primary" loading={connectivityMut.isPending} onClick={() => connectivityMut.mutate(project!.id)}>建立互联</Button>
          </Space>,
    },
    {
      title: '作业编排',
      status: (currentVersion ? 'finish' : connected ? 'process' : 'wait') as 'finish' | 'process' | 'wait',
      description: <Space direction="vertical" size={4}>
        <Text type="secondary" style={{ fontSize: 12 }}>{currentVersion ? `编排 v${currentVersion.version} 已提交` : '尚未提交编排'}</Text>
        <Button size="small" onClick={() => setActiveTab('workflow')}>{currentVersion ? '查看/修改编排' : '去编排'}</Button>
      </Space>,
    },
    {
      title: '作业审核',
      status: (workflowApproved ? 'finish' : workflowStatus === 'pending_approval' ? 'process' : workflowStatus === 'rejected' ? 'error' : 'wait') as 'finish' | 'process' | 'error' | 'wait',
      icon: <CheckOutlined />,
      description: <Space direction="vertical" size={4}>
        <Text type="secondary" style={{ fontSize: 12 }}>{
          workflowApproved ? `v${currentVersion?.version} 已通过多方审核`
            : workflowStatus === 'pending_approval' ? `v${currentVersion?.version} 待多方审核`
            : workflowStatus === 'rejected' ? '已驳回'
            : '尚未提交编排'
        }</Text>
        <Button size="small" onClick={() => setActiveTab('approval')}>去审核</Button>
      </Space>,
    },
    {
      title: '项目执行',
      status: (latestRun?.status === 'succeeded' ? 'finish' : latestRun?.status === 'running' ? 'process' : latestRun?.status === 'failed' ? 'error' : 'wait') as 'finish' | 'process' | 'error' | 'wait',
      icon: <RocketOutlined />,
      description: <Space direction="vertical" size={4}>
        {latestRun
          ? <Space size={6}>{statusTag(latestRun.status)}<Button type="link" size="small" onClick={() => refreshMut.mutate({ projectId: project!.id, runId: latestRun.id })}>刷新</Button></Space>
          : <Text type="secondary" style={{ fontSize: 12 }}>{canExecute ? '可发起执行' : '待互联与审核'}</Text>}
      </Space>,
    },
  ]

  const runColumns = [
    { title: 'Kuscia Job', dataIndex: 'kuscia_job_id', render: (v: string) => <Text copyable={{ text: v }} code>{short(v)}</Text> },
    { title: '状态', dataIndex: 'status', render: statusTag },
    { title: '发起时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    { title: '操作', render: (_: unknown, r: ProjectRun) => <Button type="link" onClick={() => refreshMut.mutate({ projectId: project!.id, runId: r.id })}>刷新</Button> },
  ]

  return <Card title={project ? `项目工作台：${project.name}` : '项目管理'} extra={!detailId ? <Space>
    <Button icon={<ReloadOutlined />} onClick={() => projects.refetch()}>刷新</Button>
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建项目</Button>
  </Space> : <Button onClick={() => navigate('/projects')}>返回项目列表</Button>}>
    {!detailId && <>
    <Table rowKey="id" loading={projects.isLoading} dataSource={projects.data ?? []} columns={[
      { title: '项目名称', dataIndex: 'name' },
      { title: '合约', dataIndex: 'contract_id', render: (v: string) => <Text copyable={{ text: v }} code>{short(v)}</Text> },
      { title: '编排版本', dataIndex: 'current_version', render: (v: number | null) => v ? `v${v}` : '未提交' },
      { title: '状态', dataIndex: 'status', render: statusTag },
      { title: '更新时间', dataIndex: 'updated_at', render: (v: string) => new Date(v).toLocaleString() },
      { title: '操作', render: (_: unknown, p: Project) => <Button type="link" disabled={isAdmin} title={isAdmin ? '管理员仅可查看项目列表，不可进入项目工作台' : undefined} onClick={() => navigate(`/projects/${p.id}`)}>进入项目</Button> },
    ]} /></>}

    {detailId && isAdmin && <Alert type="warning" showIcon message="管理员不可进入项目工作台" description="管理员仅保留项目列表查看权限，请使用项目参与方账户进入和操作项目。" />}

    <Modal title="基于合约创建项目" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} confirmLoading={createMut.isPending} destroyOnClose>
      <Form form={createForm} layout="vertical" onFinish={createMut.mutate}>
        <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="contract_id" label="备案合约" rules={[{ required: true }]}>
          <Select loading={contracts.isLoading} options={filedContracts.map((c) => ({ value: c.contract_id, label: `${c.name}（${short(c.contract_id)}）` }))} notFoundContent="暂无已备案合约" />
        </Form.Item>
        <Form.Item name="description" label="项目说明"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>

    {detailId && !isAdmin && <Card loading={detail.isLoading} bordered={false}>
      {project && <Tabs activeKey={activeTab} onChange={setActiveTab}
        items={[
        { key: 'overview', label: '项目概览', children: <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card size="small" title="里程碑引导">
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message="按顺序完成：① 节点互联 → ② 作业编排 → ③ 作业审核（多方）→ ④ 项目执行。未连通时请先建立互联，编排审核通过后方可执行。" />
            <Steps labelPlacement="vertical" current={milestoneCurrent} items={milestoneItems} />
          </Card>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="状态">{statusTag(project.status)}</Descriptions.Item><Descriptions.Item label="当前版本">{project.current_version ? `v${project.current_version}` : '未提交'}</Descriptions.Item>
            <Descriptions.Item label="合约"><Text copyable>{project.contract_id}</Text></Descriptions.Item><Descriptions.Item label="发起方">{project.initiator_connector_id}</Descriptions.Item>
            <Descriptions.Item label="说明" span={2}>{project.description || '—'}</Descriptions.Item>
          </Descriptions>
          <Card size="small" title="运行域"><Space wrap>{domains.map((domain) => <Tag key={domain.connector_id} color={domain.connector_id === project.initiator_connector_id ? 'blue' : undefined}>{domain.domain_id}{domain.connector_id === project.initiator_connector_id ? ' · initiator' : ''}</Tag>)}</Space></Card>
        </Space> },
        { key: 'workflow', label: '作业编排', children: <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Card size="small" title="从项目模板导入镜像工作流">
            <Space wrap>
              <Select
                value={importTemplateId}
                onChange={setImportTemplateId}
                loading={projectTemplates.isLoading}
                placeholder="选择项目模板"
                style={{ minWidth: 320 }}
                options={(projectTemplates.data ?? []).map((template) => ({
                  value: template.id,
                  label: `${template.name}（${Array.isArray((template.workflow as any).nodes) ? (template.workflow as any).nodes.length : 0} 个节点）`,
                }))}
                notFoundContent="暂无项目模板"
              />
              <Button type="primary" disabled={!importTemplateId} onClick={importProjectTemplate}>导入模板</Button>
              <Text type="secondary">导入仅更新当前草稿，您可以继续调整后再提交审核。</Text>
            </Space>
          </Card>
          <Tabs activeKey={workflowMode} onChange={(key) => {
            const mode = key as 'canvas' | 'json'
            if (mode === 'json') workflowForm.setFieldValue('workflow', JSON.stringify(workflowDraft, null, 2))
            else { try { setWorkflowDraft(JSON.parse(workflowForm.getFieldValue('workflow'))); setCanvasNonce((n) => n + 1) } catch { message.error('请先修正 JSON'); return } }
            setWorkflowMode(mode)
          }} items={[
            { key: 'canvas', label: '可视化画布', children: <WorkflowCanvas key={`wf-${currentVersion?.id ?? 'draft'}-${canvasNonce}`} value={workflowDraft} appImages={appimages.data ?? []} projectDomains={domains} domainData={domainData.data ?? []} onChange={setWorkflowDraft} height={620} /> },
            { key: 'json', label: 'JSON DSL', children: <Form form={workflowForm} onFinish={submitWorkflowJson}><Form.Item name="workflow" rules={[{ required: true }]}><Input.TextArea rows={22} style={{ fontFamily: 'monospace' }} /></Form.Item></Form> },
          ]} />
          <Space>
            <Button type="primary" loading={workflowMut.isPending} onClick={() => workflowMode === 'canvas' ? workflowMut.mutate({ id: detailId!, workflow: workflowDraft }) : workflowForm.submit()}>提交审核</Button>
            <Button onClick={resetDraft}>重置为当前版本</Button>
            <Button onClick={() => setSaveTemplateOpen(true)}>保存为项目模板</Button>
          </Space>
        </Space> },
        { key: 'approval', label: '作业审核', children: currentVersion ? <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert type={currentVersion.status === 'approved' ? 'success' : 'warning'} showIcon message={`编排 v${currentVersion.version} · ${STATUS[currentVersion.status]?.[1] ?? currentVersion.status}`} description={`SHA-256：${currentVersion.workflow_hash}`} />
          <div>
            <Text strong>当前 JSON DSL</Text>
            <div style={{ marginTop: 8 }}><JsonViewer value={currentVersion.workflow} maxHeight={360} /></div>
          </div>
          <div>
            <Text strong>与上一版本的变化</Text>
            {previousVersion
              ? <pre style={{ maxHeight: 300, overflow: 'auto', padding: 12, background: '#fff', border: '1px solid #f0f0f0', marginTop: 8, fontFamily: 'monospace', fontSize: 12 }}>
                  {lineDiff(JSON.stringify(previousVersion.workflow, null, 2), JSON.stringify(currentVersion.workflow, null, 2)).map((line, i) =>
                    <div key={i} style={{ background: line.type === 'add' ? '#e6ffed' : line.type === 'del' ? '#ffece8' : undefined, whiteSpace: 'pre-wrap' }}>{(line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  ') + line.text}</div>)}
                </pre>
              : <div style={{ marginTop: 8 }}><Text type="secondary">首个编排版本，无历史对比</Text></div>}
          </div>
          <Space>
            <Button type="primary" icon={<CheckOutlined />} disabled={currentVersion.status === 'approved'} onClick={() => setApproval({ versionId: currentVersion.id, decision: 'approved' })}>审核通过</Button>
            <Button danger icon={<CloseOutlined />} disabled={currentVersion.status === 'approved'} onClick={() => setApproval({ versionId: currentVersion.id, decision: 'rejected' })}>驳回</Button>
            {currentVersion.status === 'approved' && <Tag color="green">已通过，不可重复审核</Tag>}
          </Space>
          <Timeline items={approvals.map((a) => ({ color: a.decision === 'approved' ? 'green' : 'red', children: `${a.connector_id}：${STATUS[a.decision]?.[1] ?? a.decision}${a.comment ? `（${a.comment}）` : ''}` }))} />
        </Space> : <Alert type="info" message="尚未提交编排" description="请先在『作业编排』页创建首个不可变编排版本。" /> },
        { key: 'runs', label: `执行监测 (${runs.length})`, children: <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Popconfirm title="确认按当前已审核版本发起执行？" onConfirm={() => executeMut.mutate(project.id)} disabled={!canExecute}>
              <Button type="primary" icon={<RocketOutlined />} disabled={!canExecute} loading={executeMut.isPending}>发起执行</Button>
            </Popconfirm>
            {!canExecute && <Text type="secondary" style={{ fontSize: 12 }}>需先完成节点互联与作业审核后方可执行</Text>}
          </Space>
          <Table rowKey="id" size="small" dataSource={runs} columns={runColumns} expandable={{ expandedRowRender: (r) => <JsonViewer value={r.failure_info ?? { message: '暂无运行事件' }} maxHeight={320} /> }} />
        </Space> },
      ]} />}
    </Card>}

    <Modal title={approval?.decision === 'approved' ? '审核通过' : '驳回编排'} open={!!approval} onCancel={() => setApproval(null)} onOk={() => approvalForm.submit()} confirmLoading={approvalMut.isPending}>
      <Form form={approvalForm} layout="vertical" onFinish={(v) => approvalMut.mutate({ projectId: detailId!, decision: approval!.decision, comment: v.comment })}>
        <Form.Item name="comment" label="审核意见"><Input.TextArea rows={3} placeholder="选填" /></Form.Item>
      </Form>
    </Modal>
    <Modal title="保存为项目模板" open={saveTemplateOpen} onCancel={() => setSaveTemplateOpen(false)} onOk={() => templateForm.submit()} confirmLoading={saveTemplateMut.isPending}>
      <Form form={templateForm} layout="vertical" onFinish={(values) => saveTemplateMut.mutate(values)}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message="将保存当前画布中的镜像工作流" description="如需跨连接器复用，可在项目模板页面把具体 domain_id 改为 {{provider_domain}} / {{consumer_domain}}。" />
        <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="模板说明"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
  </Card>
}
