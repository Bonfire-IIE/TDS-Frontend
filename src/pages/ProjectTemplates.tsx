import { useState } from 'react'
import { Button, Card, Form, Input, message, Modal, Popconfirm, Space, Table, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import JsonViewer from '../components/JsonViewer'
import {
  createProjectTemplate, deleteProjectTemplate, listProjectTemplates, ProjectTemplate,
  updateProjectTemplate,
} from '../api/projectTemplates'

const { Text } = Typography
const EMPTY_WORKFLOW = {
  schedule_mode: 'Strict', max_parallelism: 1,
  nodes: [{ id: 'task-1', alias: 'task-1', app_image: '请替换为已登记的 AppImage 名称', parties: [{ domain_id: '{{provider_domain}}', role: '请填写镜像角色' }, { domain_id: '{{consumer_domain}}', role: '请填写镜像角色' }], input_bindings: [], output_bindings: [], parameters: {} }],
  edges: [],
}
const errorText = (error: any) => error.response?.data?.detail ?? error.message ?? '操作失败'

export default function ProjectTemplates() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<ProjectTemplate | null | undefined>(undefined)
  const [viewing, setViewing] = useState<ProjectTemplate | null>(null)
  const [form] = Form.useForm()
  const templates = useQuery({ queryKey: ['project-templates'], queryFn: listProjectTemplates })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['project-templates'] })
  const save = useMutation({
    mutationFn: async (values: { name: string; description?: string; workflow: string }) => {
      let workflow: Record<string, unknown>
      try { workflow = JSON.parse(values.workflow) } catch { throw new Error('工作流必须是合法 JSON') }
      const body = { name: values.name, description: values.description, workflow }
      return editing ? updateProjectTemplate(editing.id, body) : createProjectTemplate(body)
    },
    onSuccess: () => { message.success(editing ? '项目模板已更新' : '项目模板已创建'); setEditing(undefined); form.resetFields(); invalidate() },
    onError: (error) => message.error(errorText(error)),
  })
  const remove = useMutation({ mutationFn: deleteProjectTemplate, onSuccess: () => { message.success('项目模板已删除'); invalidate() }, onError: (error) => message.error(errorText(error)) })
  const openCreate = () => { setEditing(null); form.setFieldsValue({ workflow: JSON.stringify(EMPTY_WORKFLOW, null, 2) }) }
  const openEdit = (row: ProjectTemplate) => { setEditing(row); form.setFieldsValue({ name: row.name, description: row.description, workflow: JSON.stringify(row.workflow, null, 2) }) }

  return <Card title="项目模板" extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建模板</Button>}>
    <Text type="secondary">保存可复用的镜像工作流 DSL。在项目工作台的“作业编排”页面导入模板后，可继续调整并提交审核。</Text>
    <Table style={{ marginTop: 16 }} rowKey="id" loading={templates.isLoading} dataSource={templates.data ?? []} columns={[
      { title: '模板名称', dataIndex: 'name' },
      { title: '说明', dataIndex: 'description', render: (value) => value || '—' },
      { title: '镜像节点', render: (_, row) => Array.isArray((row.workflow as any).nodes) ? (row.workflow as any).nodes.length : 0 },
      { title: '更新时间', dataIndex: 'updated_at', render: (value) => new Date(value).toLocaleString() },
      { title: '操作', render: (_, row) => <Space><Button type="link" onClick={() => setViewing(row)}>查看</Button><Button type="link" icon={<EditOutlined />} onClick={() => openEdit(row)}>编辑</Button><Popconfirm title="删除该项目模板？" onConfirm={() => remove.mutate(row.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> },
    ]} />
    <Modal width={780} title={editing ? '编辑项目模板' : '新建项目模板'} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} confirmLoading={save.isPending} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="模板说明"><Input.TextArea rows={2} /></Form.Item>
        <Form.Item name="workflow" label="镜像工作流 JSON DSL" rules={[{ required: true }]} extra={<>模板使用项目工作台相同的 Workflow DSL；参与方可使用 <Text code>{'{{provider_domain}}'}</Text> 和 <Text code>{'{{consumer_domain}}'}</Text>，导入模板时按当前项目合约双方自动替换。</>}><Input.TextArea rows={20} style={{ fontFamily: 'monospace' }} /></Form.Item>
      </Form>
    </Modal>
    <Modal width={760} title={`模板详情：${viewing?.name ?? ''}`} open={!!viewing} footer={null} onCancel={() => setViewing(null)}>{viewing && <JsonViewer value={viewing.workflow} maxHeight={600} />}</Modal>
  </Card>
}
