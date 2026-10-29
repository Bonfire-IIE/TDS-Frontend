import { useMemo, useState } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message, Segmented, List, Empty } from 'antd'
import { PlusOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listContracts } from '../api/contracts'
import { createPrivacyProject, listPrivacyApplications, listPrivacyProjects, listPrivacyRuns, startPrivacyRun } from '../api/privacyComputing'

const { Text } = Typography

function RunHistory({ projectId }: { projectId: string }) {
  const runs = useQuery({ queryKey: ['privacy-runs', projectId], queryFn: () => listPrivacyRuns(projectId) })
  return <Table size="small" rowKey="id" loading={runs.isLoading} dataSource={runs.data ?? []} pagination={false} columns={[
    { title: '运行状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'succeeded' ? 'green' : v === 'failed' ? 'red' : 'blue'}>{v}</Tag> },
    { title: '执行系统', dataIndex: 'system_type', render: (v: string | null) => v || '—' },
    { title: '结果', dataIndex: 'result', render: (v: any) => v ? <Text code>{v.uri || v.resource_ref || JSON.stringify(v)}</Text> : '—' },
    { title: '错误', dataIndex: 'error', render: (v: string | null) => v ? <Text type="danger">{v}</Text> : '—' },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
  ]} />
}

export default function PrivacyComputing() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [runProject, setRunProject] = useState<any>(null)
  const [entryMode, setEntryMode] = useState<'preset' | 'lowcode'>('preset')
  const [form] = Form.useForm()
  const [runForm] = Form.useForm()
  const [workflow, setWorkflow] = useState<Array<{ id: string; app: any; parameters: Record<string, unknown> }>>([])
  const projects = useQuery({ queryKey: ['privacy-computing-projects'], queryFn: listPrivacyProjects })
  const applications = useQuery({ queryKey: ['privacy-applications'], queryFn: listPrivacyApplications })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const filedContracts = useMemo(
    () => (contracts.data ?? []).filter((c) => ['filed', 'signed'].includes(c.document?.contractInfo?.contractStatus)),
    [contracts.data],
  )
  const createMut = useMutation({
    mutationFn: createPrivacyProject,
    onSuccess: () => {
      message.success('隐私计算项目已创建')
      setOpen(false)
      form.resetFields(); setWorkflow([])
      qc.invalidateQueries({ queryKey: ['privacy-computing-projects'] })
    },
    onError: (e: any) => message.error(e.response?.data?.detail ?? e.message ?? '创建失败'),
  })
  const runMut = useMutation({
    mutationFn: (values: any) => startPrivacyRun(runProject.id, {
      ...values,
      join_keys: String(values.join_keys || '').split(',').map((x: string) => x.trim()).filter(Boolean),
      idempotency_key: `privacy-${Date.now()}`,
    }),
    onSuccess: () => { message.success('作业已提交'); setRunProject(null); runForm.resetFields(); qc.invalidateQueries({ queryKey: ['privacy-runs', runProject?.id] }) },
    onError: (e: any) => message.error(e.response?.data?.detail ?? e.message ?? '提交失败'),
  })

  return <Card
    title={<Space><RocketOutlined />隐私保护计算</Space>}
    extra={<Space><Button icon={<ReloadOutlined />} onClick={() => projects.refetch()}>刷新</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>创建计算项目</Button></Space>}
  >
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message="隐私计算项目必须绑定一份已签署并备案的数字合约。"
      description="当前支持 PSI。Kuscia 是否可用只影响任务执行，不影响中心平台的资源、产品和合约业务。"
    />
    <Table
      rowKey="id"
      loading={projects.isLoading}
      dataSource={projects.data ?? []}
      columns={[
        { title: '项目名称', dataIndex: 'name' },
        { title: '数字合约', dataIndex: 'contract_id', render: (v: string) => <Text code copyable>{v}</Text> },
        { title: '应用', dataIndex: 'application_code', render: (v: string) => <Tag color="blue">{v}</Tag> },
        { title: '状态', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
        { title: '操作', render: (_: unknown, p: any) => <Button type="link" onClick={() => { setRunProject(p); runForm.resetFields() }}>配置并执行</Button> },
        { title: '创建时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
      ]}
      expandable={{ expandedRowRender: (p: any) => <RunHistory projectId={p.id} />, rowExpandable: () => true }}
      locale={{ emptyText: '暂无隐私计算项目，请从已备案合约创建' }}
    />
    <Modal title="创建隐私计算项目" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={createMut.isPending} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate({ ...v, configuration: { workflow: workflow.map((node, index) => ({ order: index + 1, application_code: node.app.code, parameters: node.parameters })) } })}>
        <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}><Input placeholder="如：客户风险名单 PSI 匹配" /></Form.Item>
        <Form.Item name="contract_id" label="已备案数字合约" rules={[{ required: true, message: '请选择数字合约' }]}>
          <Select loading={contracts.isLoading} placeholder="选择已备案合约" options={filedContracts.map((c) => ({ value: c.contract_id, label: `${c.document.contractInfo.contractName}（${c.contract_id}）` }))} />
        </Form.Item>
        <Form.Item name="application_code" label="应用镜像" rules={[{ required: true, message: '请选择应用镜像' }]}>
          <Select loading={applications.isLoading} placeholder="选择已发布应用镜像" options={(applications.data ?? []).map((app) => ({ value: app.code, label: `${app.name}（${app.code}）` }))} />
        </Form.Item>
        <Form.Item label="执行流"><div style={{ border: '1px dashed #b7c3d0', padding: 12, borderRadius: 6 }}><Typography.Text type="secondary">创建项目后可在项目配置中编排应用镜像执行流。</Typography.Text></div></Form.Item>
        <Form.Item name="description" label="项目说明"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={runProject ? `配置执行流：${runProject.name}` : '配置执行流'} open={!!runProject} onCancel={() => setRunProject(null)} onOk={() => runForm.submit()} confirmLoading={runMut.isPending} width={900} destroyOnClose>
      <Segmented block value={entryMode} onChange={(v) => setEntryMode(v as 'preset' | 'lowcode')} options={[{ label: '低代码作业配置', value: 'lowcode' }, { label: '预置应用服务', value: 'preset' }]} style={{ marginBottom: 16 }} />
      {entryMode === 'lowcode' && <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 16, marginBottom: 16 }}>
        <Card size="small" title="可用应用镜像"><List size="small" dataSource={applications.data ?? []} locale={{ emptyText: '暂无已发布应用镜像' }} renderItem={(app: any) => <List.Item draggable onDragStart={(e) => e.dataTransfer.setData('application_code', app.code)} style={{ cursor: 'grab' }}><Space direction="vertical" size={0}><Typography.Text strong>{app.name}</Typography.Text><Typography.Text type="secondary">{app.code}</Typography.Text></Space></List.Item>} /></Card>
        <Card size="small" title="作业执行流" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const code = e.dataTransfer.getData('application_code'); const app = (applications.data ?? []).find((x: any) => x.code === code); if (app) setWorkflow((items) => [...items, { id: `${code}-${Date.now()}`, app, parameters: {} }]) }}>
          {workflow.length ? <List dataSource={workflow} renderItem={(node, index) => <List.Item actions={[<Button type="link" danger onClick={() => setWorkflow((items) => items.filter((_, i) => i !== index))}>移除</Button>]}><Space><Tag>{index + 1}</Tag><Typography.Text strong>{node.app.name}</Typography.Text><Typography.Text type="secondary">{node.app.code}</Typography.Text></Space></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="将应用镜像拖到这里" />}
        </Card>
      </div>}
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="输入资源由双方连接器登记。中心平台只保存资源引用和执行流定义。" />
      <Form form={runForm} layout="vertical" onFinish={(v) => runMut.mutate(v)}>
        <Form.Item name="input_provider_ref" label="供数方资源引用" rules={[{ required: true, message: '请输入供数方资源引用' }]}><Input placeholder="连接器侧资源标识" /></Form.Item>
        <Form.Item name="input_consumer_ref" label="用数方资源引用" rules={[{ required: true, message: '请输入用数方资源引用' }]}><Input placeholder="连接器侧资源标识" /></Form.Item>
        <Form.Item name="join_keys" label="关联字段" rules={[{ required: true, message: '请输入应用所需的关联字段' }]}><Input placeholder="多个字段用逗号分隔" /></Form.Item>
        {entryMode === 'lowcode' && <Form.Item name="implementation_ref" label="执行实现（可选）"><Input placeholder="默认使用项目应用镜像的执行实现" /></Form.Item>}
      </Form>
    </Modal>
  </Card>
}
