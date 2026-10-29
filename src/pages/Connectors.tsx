import RouteSurface from '../components/RouteSurface'
import DetailPage from '../components/DetailPage'
import { useDetailRoute } from '../components/useDetailRoute'
import BusinessDetails from '../components/BusinessDetails'
import { useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd'
import { CodeOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Connector, DeploymentInstruction, applyConnector, approveConnector, deleteConnector, getDeploymentInstructions, listConnectors, rejectConnector } from '../api/connectors'
import { useAuth } from '../auth/AuthContext'

const { Paragraph, Text } = Typography
const STATUS: Record<string, { color: string; text: string }> = {
  applying: { color: 'gold', text: '待审批' }, approved: { color: 'blue', text: '待激活' }, active: { color: 'green', text: '已激活' },
  rejected: { color: 'red', text: '已驳回' }, revoked: { color: 'default', text: '已吊销' },
}
const showError = (e: any) => message.error(e.response?.data?.detail ?? e.message ?? '操作失败')
const short = (v?: string | null) => v ? `${v.slice(0, 12)}...${v.slice(-8)}` : '—'

export default function Connectors() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const isAdmin = isOperator || user?.roles?.includes('supervisor')
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['connectors'], queryFn: listConnectors })
  const [registerOpen, setRegisterOpen] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [details, setDetails] = useDetailRoute<Connector>('/connectors', list.data ?? [])
  const [instruction, setInstruction] = useState<DeploymentInstruction | null>(null)
  const [registerForm] = Form.useForm()
  const [deployForm] = Form.useForm()
  const [keyword, setKeyword] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['connectors'] })
  const apply = useMutation({ mutationFn: applyConnector, onSuccess: () => { message.success('CSR 注册申请已提交'); setRegisterOpen(false); registerForm.resetFields(); refresh() }, onError: showError })
  const approve = useMutation({ mutationFn: approveConnector, onSuccess: () => { message.success('审批完成，连接器证书已签发'); refresh() }, onError: showError })
  const reject = useMutation({ mutationFn: rejectConnector, onSuccess: () => { message.success('申请已驳回'); refresh() }, onError: showError })
  const remove = useMutation({ mutationFn: deleteConnector, onSuccess: () => { message.success('连接器身份已吊销'); refresh() }, onError: showError })
  const rows = useMemo(() => (list.data ?? []).filter(x => !keyword || `${x.name} ${x.org_name} ${x.tds_code}`.toLowerCase().includes(keyword.toLowerCase())), [list.data, keyword])
  const columns = [
    { title: '连接器', dataIndex: 'name' },
    { title: 'TDS 标识码', dataIndex: 'tds_code', render: (v: string | null) => v ? <Text copyable code>{v}</Text> : '—' },
    { title: '机构', dataIndex: 'org_name', render: (v: string | null) => v || '—' },
    { title: '公钥指纹', dataIndex: 'public_key_fingerprint', render: (v: string) => <Text code>{short(v)}</Text> },
    { title: '身份状态', dataIndex: 'status', render: (v: string) => <Tag color={STATUS[v]?.color}>{STATUS[v]?.text ?? v}</Tag> },
    { title: '申请人', dataIndex: 'created_by' },
    { title: '操作', render: (_: unknown, row: Connector) => <Space>
      <Button type="text" icon={<EyeOutlined />} aria-label="查看连接器详情" title="查看" onClick={() => setDetails(row)} />
      {isOperator && row.status === 'applying' && <><Popconfirm title="批准 CSR 并签发连接器证书？" onConfirm={() => approve.mutate(row.id)}><Button type="link">批准</Button></Popconfirm><Popconfirm title="驳回该注册申请？" onConfirm={() => reject.mutate(row.id)}><Button type="link" danger>驳回</Button></Popconfirm></>}
      {(isAdmin || row.created_by === user?.username) && <Popconfirm title="吊销并删除该连接器身份？" onConfirm={() => remove.mutate(row.id)}><Button type="link" danger>吊销</Button></Popconfirm>}
    </Space> },
  ]
  return <RouteSurface plain>
    <div className="workspace-welcome"><div><Typography.Title level={3} style={{ margin: 0 }}>连接器管理</Typography.Title><Text type="secondary">部署连接器软件，审核由连接器本地私钥生成的身份申请。</Text></div><Space><Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button><Button icon={<CodeOutlined />} onClick={() => setDeployOpen(true)}>部署连接器</Button>{!isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegisterOpen(true)}>注册 CSR</Button>}</Space></div>
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="连接器身份与隐私计算引擎相互独立" description="连接器注册只处理 CSR 和机器身份证书；Kuscia 等隐私计算引擎在 Connector Portal 的能力集成中单独部署。" />
      {list.isError && <Alert type="error" showIcon message="数据加载失败，当前列表可能不完整" action={<Button onClick={()=>list.refetch()}>重试</Button>} style={{marginBottom:16}}/>}
    <Input.Search allowClear placeholder="搜索名称、机构或 TDS 标识码" style={{ maxWidth: 420, marginBottom: 16 }} onSearch={setKeyword} onChange={e => !e.target.value && setKeyword('')} />
    <Table rowKey="id" loading={list.isLoading} dataSource={rows} columns={columns} pagination={false} />
    <Modal title="注册连接器身份" open={registerOpen} onCancel={() => setRegisterOpen(false)} onOk={() => registerForm.submit()} confirmLoading={apply.isPending} width={680}>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="私钥不得上传中心平台" description="请在 Connector Portal 生成密钥和 PKCS#10 CSR；这里只粘贴 CSR 公共请求。" />
      <Form form={registerForm} layout="vertical" onFinish={v => apply.mutate(v)}><Form.Item name="name" label="连接器名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="org_name" label="所属机构"><Input /></Form.Item><Form.Item name="csr_pem" label="PKCS#10 CSR" rules={[{ required: true }, { pattern: /BEGIN CERTIFICATE REQUEST/, message: '请输入 PEM 格式 CSR' }]}><Input.TextArea rows={10} style={{ fontFamily: 'monospace' }} /></Form.Item></Form>
    </Modal>
    <Drawer title="连接器软件部署" open={deployOpen} onClose={() => setDeployOpen(false)} width={680}>
      <Form form={deployForm} layout="vertical" initialValues={{ system: 'linux', deployment_platform: 'docker-compose', architecture: 'amd64', version: 'latest' }} onFinish={async v => { try { setInstruction(await getDeploymentInstructions(v)) } catch (e) { showError(e) } }}><Space align="start" wrap><Form.Item name="system" label="目标系统"><Select style={{ width: 140 }} options={[{ value: 'linux', label: 'Linux' }]} /></Form.Item><Form.Item name="deployment_platform" label="部署平台"><Select style={{ width: 180 }} options={[{ value: 'docker-compose', label: 'Docker Compose' }]} /></Form.Item><Form.Item name="architecture" label="CPU 架构"><Select style={{ width: 130 }} options={[{ value: 'amd64' }]} /></Form.Item><Form.Item name="version" label="版本"><Input style={{ width: 120 }} /></Form.Item></Space><Button type="primary" htmlType="submit" icon={<CodeOutlined />}>生成部署指令</Button></Form>
      {instruction && <div style={{ marginTop: 24 }}><Paragraph copyable={{ text: instruction.commands }} style={{ whiteSpace: 'pre-wrap', background: '#161b22', color: '#e6edf3', padding: 16, borderRadius: 6, fontFamily: 'monospace' }}>{instruction.commands}</Paragraph>{instruction.notes.map(x => <Paragraph key={x} type="secondary">{x}</Paragraph>)}</div>}
    </Drawer>
    <DetailPage loading={list.isLoading} error={list.isError} title="连接器身份详情" open={!!details} onClose={() => setDetails(null)} width={600}>{details && <BusinessDetails bordered column={1} size="small"><Descriptions.Item label="名称">{details.name}</Descriptions.Item><Descriptions.Item label="机构">{details.org_name || '—'}</Descriptions.Item><Descriptions.Item label="TDS 标识码">{details.tds_code || '—'}</Descriptions.Item><Descriptions.Item label="状态"><Tag color={STATUS[details.status]?.color}>{STATUS[details.status]?.text}</Tag></Descriptions.Item><Descriptions.Item label="CSR 指纹"><Text copyable code>{details.csr_fingerprint}</Text></Descriptions.Item><Descriptions.Item label="公钥指纹"><Text copyable code>{details.public_key_fingerprint}</Text></Descriptions.Item><Descriptions.Item label="证书序列号">{details.certificate_serial || '—'}</Descriptions.Item><Descriptions.Item label="证书到期时间">{details.certificate_not_after ? new Date(details.certificate_not_after).toLocaleString() : '—'}</Descriptions.Item><Descriptions.Item label="首次激活">{details.activated_at ? new Date(details.activated_at).toLocaleString() : '尚未激活'}</Descriptions.Item></BusinessDetails>}</DetailPage>
  </RouteSurface>
}
