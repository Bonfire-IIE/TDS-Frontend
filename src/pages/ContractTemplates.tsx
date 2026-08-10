import { useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, message, Popconfirm, Typography,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ContractTemplate,
  listContractTemplates,
  createContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
} from '../api/contractTemplates'
import { Policy } from '../api/products'
import { useAuth } from '../auth/AuthContext'
import PolicyEditor, { PolicyView, emptyPolicy } from '../components/PolicyEditor'

const { Text } = Typography

const SCOPE_TAG: Record<string, { color: string; text: string }> = {
  system: { color: 'gold', text: '系统预置' },
  user: { color: 'blue', text: '我的模板' },
}

export default function ContractTemplates() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const qc = useQueryClient()

  const list = useQuery({ queryKey: ['contract-templates'], queryFn: listContractTemplates })

  const [editTarget, setEditTarget] = useState<ContractTemplate | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewTarget, setViewTarget] = useState<ContractTemplate | null>(null)
  const [form] = Form.useForm()

  const onErr = (e: any) => message.error(e.response?.data?.detail ?? '操作失败')
  const invalidate = () => qc.invalidateQueries({ queryKey: ['contract-templates'] })

  const createMut = useMutation({
    mutationFn: createContractTemplate,
    onSuccess: () => { message.success('模板已创建'); setCreateOpen(false); form.resetFields(); invalidate() },
    onError: onErr,
  })
  const updateMut = useMutation({
    mutationFn: (v: { id: string; body: any }) => updateContractTemplate(v.id, v.body),
    onSuccess: () => { message.success('模板已更新'); setEditTarget(null); form.resetFields(); invalidate() },
    onError: onErr,
  })
  const deleteMut = useMutation({
    mutationFn: deleteContractTemplate,
    onSuccess: () => { message.success('模板已删除'); invalidate() },
    onError: onErr,
  })

  // 是否可编辑：system 模板仅 operator；user 模板属主/operator
  const canEdit = (t: ContractTemplate) =>
    t.scope === 'system' ? !!isOperator : isOperator || t.owner === user?.username

  const openCreate = () => { setCreateOpen(true); form.resetFields() }
  const openEdit = (t: ContractTemplate) => {
    setEditTarget(t)
    form.setFieldsValue({ name: t.name, description: t.description, policies: t.policies ?? [] })
  }

  const columns = [
    { title: '模板名称', dataIndex: 'name' },
    { title: '说明', dataIndex: 'description', render: (v: string | null) => v || <Text type="secondary">—</Text> },
    {
      title: '归属', dataIndex: 'scope',
      render: (v: string) => <Tag color={SCOPE_TAG[v]?.color}>{SCOPE_TAG[v]?.text ?? v}</Tag>,
    },
    { title: '策略数', key: 'pc', render: (_: any, t: ContractTemplate) => (t.policies?.length ?? 0) },
    {
      title: '操作', key: 'action',
      render: (_: any, t: ContractTemplate) => (
        <Space>
          <Button type="link" size="small" onClick={() => setViewTarget(t)}>查看</Button>
          {canEdit(t) && (
            <Button type="link" size="small" onClick={() => openEdit(t)}>编辑</Button>
          )}
          {canEdit(t) && (
            <Popconfirm title="删除该模板？" onConfirm={() => deleteMut.mutate(t.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="合约模板"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建模板</Button>
        </Space>
      }
    >
      <Table rowKey="id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={{ pageSize: 10 }} />

      {/* 新建 / 编辑 */}
      <Modal
        title={editTarget ? '编辑合约模板' : '新建合约模板'}
        open={createOpen || !!editTarget}
        width={760}
        confirmLoading={createMut.isPending || updateMut.isPending}
        onCancel={() => { setCreateOpen(false); setEditTarget(null); form.resetFields() }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ policies: [emptyPolicy()] }}
          onFinish={(v) => {
            if (editTarget) updateMut.mutate({ id: editTarget.id, body: v })
            else createMut.mutate(v)
          }}
        >
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}>
            <Input placeholder="模板对外展示名称" />
          </Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item
            name="policies"
            label="模板策略"
            rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少配置一条策略'))) }]}
          >
            <PolicyEditor />
          </Form.Item>
        </Form>
      </Modal>

      {/* 查看（只读） */}
      <Modal
        title={`模板详情：${viewTarget?.name ?? ''}`}
        open={!!viewTarget}
        width={640}
        footer={null}
        onCancel={() => setViewTarget(null)}
        destroyOnClose
      >
        {viewTarget && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Tag color={SCOPE_TAG[viewTarget.scope]?.color}>{SCOPE_TAG[viewTarget.scope]?.text}</Tag>
              {viewTarget.owner && <Text type="secondary">属主：{viewTarget.owner}</Text>}
            </div>
            {viewTarget.description && <Text type="secondary">{viewTarget.description}</Text>}
            <Text strong>模板策略</Text>
            <PolicyView policies={viewTarget.policies ?? []} />
          </Space>
        )}
      </Modal>
    </Card>
  )
}
