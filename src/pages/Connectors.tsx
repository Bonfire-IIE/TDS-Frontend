import { useMemo, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, InputNumber, message, Popconfirm, Typography, Alert, Drawer, Steps, Descriptions,
} from 'antd'
import { PlusOutlined, ImportOutlined, ReloadOutlined, CloudDownloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Connector, DeployInfo, listConnectors, applyConnector, importConnector,
  approveConnector, rejectConnector, getDeployInfo, downloadDeployScript, updateConnector, deleteConnector,
} from '../api/connectors'
import { useAuth } from '../auth/AuthContext'

const { Paragraph, Text } = Typography

const STATUS: Record<string, { color: string; text: string }> = {
  applying: { color: 'gold', text: '待审批' },
  approved: { color: 'blue', text: '已批准' },
  rejected: { color: 'red', text: '已驳回' },
  online: { color: 'blue', text: '在线' },
  offline: { color: 'gold', text: '待部署/离线' },
}

const PORT_FIELDS = ['auth_port', 'lite_api_port', 'grpc_port', 'app_port', 'data_port']
const portRules = [{ required: true, type: 'number' as const, min: 1, max: 65535, transform: (value: unknown) => value === '' || value == null ? value : Number(value) }]
const normalizePorts = <T extends Record<string, any>>(values: T): T => ({
  ...values,
  ...Object.fromEntries(
    PORT_FIELDS
      .filter((f) => values[f] !== undefined && values[f] !== null && values[f] !== '')
      .map((f) => [f, Number(values[f])]),
  ),
})
const validateDistinctPorts = (values: Record<string, number>) => {
  const ports = PORT_FIELDS.map((field) => values[field]).filter((value) => value != null)
  if (new Set(ports).size !== ports.length) throw new Error('认证、HTTP/API、gRPC、应用和采样端口不能重复')
}

export default function Connectors() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const isSupervisor = user?.roles?.includes('supervisor')
  const isAdmin = isOperator || isSupervisor
  const isParticipant = !isAdmin
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['connectors'],
    queryFn: listConnectors,
    refetchInterval: 10000,
  })

  const [applyOpen, setApplyOpen] = useState(false)
  const [applyStep, setApplyStep] = useState(0)
  const [importOpen, setImportOpen] = useState(false)
  const [deploy, setDeploy] = useState<DeployInfo | null>(null)
  const [deployId, setDeployId] = useState<string>('')
  const [applyForm] = Form.useForm()
  const [importForm] = Form.useForm()
  const [editTarget, setEditTarget] = useState<Connector | null>(null)
  const [viewTarget, setViewTarget] = useState<Connector | null>(null)
  const [editForm] = Form.useForm()
  const [searchForm] = Form.useForm()
  const [filters, setFilters] = useState<{ name?: string; tds_code?: string; org_name?: string; created_by?: string }>({})

  const invalidate = () => qc.invalidateQueries({ queryKey: ['connectors'] })
  const onErr = (e: any) => message.error(
    e.code === 'ECONNABORTED' ? '提交超时，请检查后端服务后重试' : e.response?.data?.detail ?? e.message ?? '操作失败',
  )

  const applyMut = useMutation({
    mutationFn: applyConnector,
    onSuccess: () => { message.success('已提交申请，等待运营方审批'); setApplyOpen(false); setApplyStep(0); applyForm.resetFields(); invalidate() },
    onError: onErr,
  })
  const importMut = useMutation({
    mutationFn: importConnector,
    onSuccess: () => { message.success('导入成功'); setImportOpen(false); importForm.resetFields(); invalidate() },
    onError: onErr,
  })
  const approveMut = useMutation({ mutationFn: approveConnector, onSuccess: () => { message.success('已批准，Kuscia Domain 已创建'); invalidate() }, onError: onErr })
  const rejectMut = useMutation({ mutationFn: rejectConnector, onSuccess: () => { message.success('已驳回'); invalidate() }, onError: onErr })
  const updateMut = useMutation({ mutationFn: (v: any) => updateConnector(editTarget!.id, v), onSuccess: () => { message.success('连接器信息已更新'); setEditTarget(null); setViewTarget(null); invalidate() }, onError: onErr })
  const deleteMut = useMutation({ mutationFn: deleteConnector, onSuccess: () => { message.success('已删除'); invalidate() }, onError: onErr })

  const openDeploy = async (c: Connector) => {
    try {
      const info = await getDeployInfo(c.id)
      setDeploy(info); setDeployId(c.id)
    } catch (e: any) { onErr(e) }
  }

  const filtered = useMemo(() => {
    const match = (value: string | null | undefined, kw?: string) =>
      !kw?.trim() || (value ?? '').toLowerCase().includes(kw.trim().toLowerCase())
    return (data ?? []).filter((c) =>
      match(c.name, filters.name) &&
      match(c.tds_code, filters.tds_code) &&
      match(c.org_name, filters.org_name) &&
      match(c.created_by, filters.created_by),
    )
  }, [data, filters])

  const columns = [
    { title: '名称', dataIndex: 'name' },
    {
      title: 'TDS 标识码', dataIndex: 'tds_code',
      render: (v: string | null) => v ? <Text copyable code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    { title: 'Kuscia Domain', dataIndex: 'kuscia_domain_id', render: (v: string) => <Text code>{v}</Text> },
    { title: '机构', dataIndex: 'org_name', render: (v: string | null) => v ?? '—' },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={STATUS[s]?.color}>{STATUS[s]?.text ?? s}</Tag> },
    { title: '申请人', dataIndex: 'created_by' },
    {
      title: '操作', key: 'action', align: 'left' as const,
      render: (_: any, c: Connector) => {
        const isOwner = c.created_by === user?.username
        return (
          <Space>
            <Button type="link" size="small" onClick={() => setViewTarget(c)}>查看</Button>
            {isOwner && ['approved', 'online', 'offline'].includes(c.status) && <Button type="link" size="small" onClick={() => openDeploy(c)}>部署</Button>}
            {isOperator && c.status === 'applying' && (
              <>
                <Popconfirm title="批准该连接器？将创建 Kuscia Domain" onConfirm={() => approveMut.mutate(c.id)}>
                  <Button type="link" size="small">批准</Button>
                </Popconfirm>
                <Popconfirm title="驳回该申请？" onConfirm={() => rejectMut.mutate(c.id)}>
                  <Button type="link" size="small" danger>驳回</Button>
                </Popconfirm>
              </>
            )}
            {(isAdmin || isOwner) && (
              <Popconfirm title="删除该连接器？" onConfirm={() => deleteMut.mutate(c.id)}>
                <Button type="link" size="small" danger>删除</Button>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <Card
      title="连接器管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>刷新</Button>
          {isOperator && <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>导入已有节点</Button>}
        </Space>
      }
    >
      {isParticipant && (
        <Card
          hoverable
          size="small"
          style={{ marginBottom: 16, borderColor: '#91caff', background: '#f0f7ff' }}
          onClick={() => { setApplyStep(0); setApplyOpen(true) }}
        >
          <Space align="start">
            <PlusOutlined style={{ fontSize: 22, color: '#1677ff', marginTop: 2 }} />
            <div>
              <Text strong style={{ fontSize: 15 }}>申请轻量连接器</Text>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                连接器是逻辑 TDS 内的工作节点，在此登记轻量连接器（Kuscia Lite）并按指引部署。
              </Paragraph>
            </div>
          </Space>
        </Card>
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <Form
          form={searchForm}
          layout="inline"
          onFinish={(v) => setFilters(v)}
        >
          <Form.Item name="name" label="名称"><Input allowClear placeholder="连接器名称" /></Form.Item>
          <Form.Item name="tds_code" label="TDS 标识码"><Input allowClear placeholder="TDS 标识码" /></Form.Item>
          <Form.Item name="org_name" label="归属机构"><Input allowClear placeholder="归属机构" /></Form.Item>
          <Form.Item name="created_by" label="申请人"><Input allowClear placeholder="申请人" /></Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">搜索</Button>
              <Button onClick={() => { searchForm.resetFields(); setFilters({}) }}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Table rowKey="id" loading={isLoading} dataSource={filtered} columns={columns} pagination={false} />

      {/* 申请：参考旧版 TDS 的三步抽屉流程 */}
      <Drawer title="注册调度节点" open={applyOpen} width={560} onClose={() => setApplyOpen(false)}
        extra={<Space>
          {applyStep > 0 && <Button onClick={() => setApplyStep(applyStep - 1)}>上一步</Button>}
          {applyStep < 2 && <Button type="primary" onClick={async () => { try { await applyForm.validateFields(applyStep === 0 ? ['name', 'kuscia_domain_id', 'org_name'] : ['lite_api_endpoint', ...PORT_FIELDS]); if (applyStep === 1) validateDistinctPorts(applyForm.getFieldsValue(PORT_FIELDS)); setApplyStep(applyStep + 1) } catch (error: any) { if (!error?.errorFields) message.error(error.message) } }}>下一步</Button>}
          {applyStep === 2 && <Button type="primary" loading={applyMut.isPending} onClick={() => { const v = applyForm.getFieldsValue(true); applyMut.mutate(normalizePorts(v)) }}>确认提交</Button>}
        </Space>}>
        <Steps current={applyStep} size="small" items={[{ title: '基础信息' }, { title: '网络/证书' }, { title: '确认提交' }]} style={{ marginBottom: 28 }} />
        <Form form={applyForm} layout="vertical" onFinish={async (v) => {
          try { await applyMut.mutateAsync(normalizePorts(v)) } catch { /* onError 已展示原因 */ }
        }} initialValues={{ auth_port: 28080, lite_api_port: 28081, grpc_port: 28082, app_port: 28083, data_port: 28084 }}>
          {applyStep === 0 && <>
            <Form.Item name="name" label="节点名称" rules={[{ required: true }]}><Input placeholder="如：某医院数据连接器" /></Form.Item>
            <Form.Item name="kuscia_domain_id" label="节点域名称（Kuscia Domain ID）" rules={[{ required: true, pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, message: '小写字母数字与连字符（RFC1123）' }]}><Input placeholder="如：hospital-a" /></Form.Item>
            <Form.Item name="org_name" label="所属机构"><Input placeholder="机构名称" /></Form.Item>
          </>}
          {applyStep === 1 && <>
            <Alert type="info" showIcon message="请填写连接器主机可达地址和 Kuscia 端口" description="端口用于生成部署配置；部署完成后可在连接器详情中修改 Lite API 地址和端口。" style={{ marginBottom: 16 }} />
            <Form.Item name="lite_api_endpoint" label="节点地址 / Lite API 主机" rules={[{ required: true }]}><Input placeholder="如：https://10.0.0.8（不含端口）" /></Form.Item>
            <Space.Compact block><Form.Item name="auth_port" label="认证端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item><Form.Item name="lite_api_port" label="HTTP/API 端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item></Space.Compact>
            <Space.Compact block><Form.Item name="grpc_port" label="gRPC 端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item><Form.Item name="app_port" label="应用端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item></Space.Compact>
            <Form.Item name="data_port" label="采样/数据端口（宿主）" rules={portRules}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item>
          </>}
          {applyStep === 2 && <>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="节点名称">{applyForm.getFieldValue('name')}</Descriptions.Item>
              <Descriptions.Item label="Domain">{applyForm.getFieldValue('kuscia_domain_id')}</Descriptions.Item>
              <Descriptions.Item label="节点地址">{applyForm.getFieldValue('lite_api_endpoint')}:{applyForm.getFieldValue('lite_api_port')}</Descriptions.Item>
              <Descriptions.Item label="端口映射">认证 {applyForm.getFieldValue('auth_port')} / gRPC {applyForm.getFieldValue('grpc_port')} / 应用 {applyForm.getFieldValue('app_port')} / 数据 {applyForm.getFieldValue('data_port')}</Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon style={{ marginTop: 16 }} message="节点令牌和 CA 证书在审批/部署阶段提供" description="平台不会在列表中明文展示敏感凭据。" />
          </>}
        </Form>
      </Drawer>

      <Drawer title="连接器详情" open={!!viewTarget} width={560} onClose={() => setViewTarget(null)}
        extra={viewTarget && viewTarget.created_by === user?.username && ['applying', 'approved', 'online', 'offline'].includes(viewTarget.status)
          ? <Button type="primary" onClick={() => { setEditTarget(viewTarget); editForm.setFieldsValue(viewTarget) }}>修改信息</Button> : null}>
        {viewTarget && <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="连接器名称">{viewTarget.name}</Descriptions.Item>
          <Descriptions.Item label="TDS 标识码">{viewTarget.tds_code ? <Text copyable code>{viewTarget.tds_code}</Text> : '—'}</Descriptions.Item>
          <Descriptions.Item label="Kuscia Domain"><Text code>{viewTarget.kuscia_domain_id}</Text></Descriptions.Item>
          <Descriptions.Item label="所属机构">{viewTarget.org_name || '—'}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={STATUS[viewTarget.status]?.color}>{STATUS[viewTarget.status]?.text ?? viewTarget.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="Lite API 地址">{viewTarget.lite_api_endpoint || '—'}</Descriptions.Item>
          <Descriptions.Item label="HTTP/API 端口">{viewTarget.lite_api_port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="认证端口">{viewTarget.auth_port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="gRPC 端口">{viewTarget.grpc_port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="应用端口">{viewTarget.app_port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="采样/数据端口">{viewTarget.data_port ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="申请人">{viewTarget.created_by}</Descriptions.Item>
          <Descriptions.Item label="申请时间">{new Date(viewTarget.created_at).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{new Date(viewTarget.updated_at).toLocaleString()}</Descriptions.Item>
        </Descriptions>}
      </Drawer>

      <Modal title="编辑连接器信息" open={!!editTarget} onOk={() => editForm.submit()} onCancel={() => setEditTarget(null)} confirmLoading={updateMut.isPending}>
        <Form form={editForm} layout="vertical" onFinish={(v) => { try { const normalized = normalizePorts(v); validateDistinctPorts(normalized); updateMut.mutate(normalized) } catch (error: any) { message.error(error.message) } }}>
          <Form.Item name="name" label="连接器名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="kuscia_domain_id" label="Kuscia Domain ID" rules={[{ required: true }]}><Input disabled /></Form.Item>
          <Form.Item name="org_name" label="所属机构"><Input /></Form.Item>
          <Form.Item name="lite_api_endpoint" label="Lite KusciaAPI 地址" rules={[{ required: true }]}><Input placeholder="如：https://10.0.0.8" /></Form.Item>
          <Form.Item name="lite_api_port" label="Lite KusciaAPI 端口（宿主）" rules={portRules}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item>
          <Space.Compact block><Form.Item name="auth_port" label="认证端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item><Form.Item name="grpc_port" label="gRPC 端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item></Space.Compact>
          <Space.Compact block><Form.Item name="app_port" label="应用端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item><Form.Item name="data_port" label="采样/数据端口（宿主）" rules={portRules} style={{ width: '50%' }}><InputNumber min={1} max={65535} precision={0} style={{ width: '100%' }} /></Form.Item></Space.Compact>
        </Form>
      </Modal>

      {/* 导入（operator） */}
      <Modal title="导入已有 Kuscia 节点" open={importOpen} onOk={() => importForm.submit()} onCancel={() => setImportOpen(false)} confirmLoading={importMut.isPending}>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="把已在 Kuscia 中运行的 Domain（如 alice/bob）登记为已批准连接器。" />
        <Form form={importForm} layout="vertical" onFinish={(v) => importMut.mutate(v)}>
          <Form.Item name="kuscia_domain_id" label="Kuscia Domain ID" rules={[{ required: true }]}><Input placeholder="如：alice" /></Form.Item>
          <Form.Item name="name" label="连接器名称（选填）"><Input /></Form.Item>
          <Form.Item name="org_name" label="所属机构（选填）"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* 部署信息 */}
      <Modal
        title="连接器部署指引" open={!!deploy} onCancel={() => setDeploy(null)} width={720}
        footer={[
          <Button key="dl" icon={<CloudDownloadOutlined />} onClick={() => deploy && downloadDeployScript(deployId, deploy.kuscia_domain_id)}>下载部署脚本</Button>,
          <Button key="close" type="primary" onClick={() => setDeploy(null)}>关闭</Button>,
        ]}
      >
        {deploy && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Alert type="warning" showIcon message="部署令牌为一次性凭据，请在连接器主机上尽快完成部署。" />
            <Text>部署令牌：<Text copyable code>{deploy.deploy_token ?? '（不可用）'}</Text></Text>
            <Text type="secondary">在连接器主机执行以下命令（需能访问 master {deploy.master_endpoint}）：</Text>
            <Paragraph copyable={{ text: deploy.commands }} style={{ background: '#1e1e1e', color: '#d4d4d4', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
              {deploy.commands}
            </Paragraph>
          </Space>
        )}
      </Modal>
    </Card>
  )
}
