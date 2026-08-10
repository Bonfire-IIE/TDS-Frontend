import { useEffect, useMemo, useState } from 'react'
import {
  Card, Tag, Button, Space, Form, Input, Select, message, Popconfirm,
  Drawer, Descriptions, Typography, Upload, Alert, Divider,
  Tabs, Empty, Steps,
} from 'antd'
import { PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AppImage, listAppImages, registerAppImage, updateAppImage, delistAppImage, parseAppImageConfig,
} from '../api/appimages'
import { useAuth } from '../auth/AuthContext'
import { ACTION_OPTIONS, ACTION_LABELS } from '../components/PolicyEditor'
import JsonViewer from '../components/JsonViewer'
import JsonEditor from '../components/JsonEditor'
import DeployTemplateEditor from '../components/appimage-schema/DeployTemplateEditor'
import { IoSchemaEditor, ParameterSchemaEditor, RoleSchemaEditor } from '../components/appimage-schema'
import type { IoSchema, ParameterSchemaValue, PartySchema } from '../components/appimage-schema'

const { Text } = Typography

const CAP_TAG: Record<string, { color: string; text: string }> = {
  mpc: { color: 'geekblue', text: '安全多方计算 (MPC)' },
  stats: { color: 'cyan', text: '联合统计' },
  train: { color: 'purple', text: '联合训练' },
  custom: { color: 'default', text: '自定义' },
}
const SCOPE_TAG: Record<string, { color: string; text: string }> = {
  builtin: { color: 'gold', text: '内置' },
  custom: { color: 'blue', text: '自定义' },
}
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  registered: { color: 'green', text: '已注册' },
  delisted: { color: 'default', text: '已下架' },
}
const REGISTRY_SOURCE = {
  platform: { color: 'green', text: '平台 Harbor' },
  third_party: { color: 'purple', text: '第三方仓库' },
}

const CAP_OPTIONS = [
  { value: 'mpc', label: '安全多方计算 (MPC)' },
  { value: 'stats', label: '联合统计 (stats)' },
  { value: 'train', label: '训练 (train)' },
  { value: 'custom', label: '自定义 (custom)' },
]

const UC_CAP_OPTIONS = [
  { value: 'ephemeral', label: '阅后即焚（容器销毁后数据不留存）' },
  { value: 'watermark', label: '水印' },
  { value: 'no_download', label: '禁止下载' },
  { value: 'no_export', label: '禁止导出' },
]

const UC_CAP_LABELS: Record<string, string> = Object.fromEntries(
  UC_CAP_OPTIONS.map((o) => [o.value, o.label]),
)

const DEFAULT_DEPLOY_TEMPLATES = [{ name: 'app', replicas: 1, restart_policy: 'Never', containers: [{ name: 'app', command: ['sh', '-c', 'sleep 1'], working_dir: '/' }] }]

const CAP_BACKGROUND: Record<string, { background: string; accent: string }> = {
  mpc: { background: 'linear-gradient(145deg, #f0f5ff 0%, #d6e4ff 100%)', accent: 'rgba(47,84,235,.25)' },
  stats: { background: 'linear-gradient(145deg, #e6fffb 0%, #cffafe 100%)', accent: 'rgba(8,151,156,.23)' },
  train: { background: 'linear-gradient(145deg, #f9f0ff 0%, #efdbff 100%)', accent: 'rgba(114,46,209,.22)' },
  custom: { background: 'linear-gradient(145deg, #fafafa 0%, #e5e7eb 100%)', accent: 'rgba(89,89,89,.18)' },
}

// 格式化 JSON 展示（失败原样返回）
export default function AppImages() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const qc = useQueryClient()

  const list = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })

  const [createOpen, setCreateOpen] = useState(false)
  const [partySchema, setPartySchema] = useState<PartySchema>({ roles: [] })
  const [ioSchema, setIoSchema] = useState<IoSchema>({ inputs: [], outputs: [] })
  const [parameterSchemas, setParameterSchemas] = useState<ParameterSchemaValue>({ parameterSchema: { type: 'object', properties: {} }, uiSchema: {} })
  const [createStep, setCreateStep] = useState(0)
  const [advancedSchemaText, setAdvancedSchemaText] = useState('')
  const [detail, setDetail] = useState<AppImage | null>(null)
  const [editing, setEditing] = useState<AppImage | null>(null)
  const [filters, setFilters] = useState({ keyword: '', capability: '', registrySource: '', scope: '' })
  const [visibleCount, setVisibleCount] = useState(12)
  const [form] = Form.useForm()
  const registrySource = Form.useWatch('registry_source', form)

  const onErr = (e: any) => {
    if (e.code === 'ECONNABORTED') {
      message.error('登记请求超时。请刷新列表确认是否已成功纳管，再决定是否重试。')
      return
    }
    message.error(e.response?.data?.detail ?? '操作失败')
  }
  const invalidate = () => qc.invalidateQueries({ queryKey: ['appimages'] })

  const registerMut = useMutation({
    mutationFn: registerAppImage,
    onSuccess: () => { message.success('应用登记成功'); setCreateOpen(false); form.resetFields(); invalidate() },
    onError: onErr,
  })
  const updateMut = useMutation({ mutationFn: ({ id, body }: { id: string; body: any }) => updateAppImage(id, body), onSuccess: () => { message.success('应用信息更新成功'); setCreateOpen(false); setEditing(null); form.resetFields(); invalidate() }, onError: onErr })
  const delistMut = useMutation({
    mutationFn: delistAppImage,
    onSuccess: () => { message.success('已下架'); invalidate() },
    onError: onErr,
  })

  // 仅自定义且（运营方或本人登记）可下架；内置不可下架
  const canDelist = (a: AppImage) =>
    a.scope === 'custom' && a.status === 'registered' && (isOperator || a.created_by === user?.username)

  const onFinish = async (v: any) => {
    const asText = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)
    let deploy_templates: any[]
    try {
      deploy_templates = (await parseAppImageConfig(asText(v.deploy_templates), 'deploy_templates')).deploy_templates
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? e.message ?? '部署模板解析失败')
      return
    }
    let config_templates: Record<string, any> | undefined
    if (v.config_templates && asText(v.config_templates).trim()) {
      try {
        config_templates = (await parseAppImageConfig(asText(v.config_templates), 'config_templates')).config_templates
      } catch (e: any) {
        message.error(e.response?.data?.detail ?? e.message ?? '配置模板解析失败')
        return
      }
    }
    let task_input_template: Record<string, any> | any[] | undefined
    if (v.task_input_template?.trim()) {
      try { task_input_template = JSON.parse(v.task_input_template) }
      catch (e: any) { message.error(`taskInputConfig 模板 JSON 解析失败：${e.message}`); return }
    }
    const payload = {
      name: v.name || undefined,
      display_name: v.display_name,
      description: v.description || undefined,
      capability: v.capability,
      registry_source: v.registry_source,
      registry: v.registry || undefined,
      image_name: v.image_name,
      image_tag: v.image_tag,
      deploy_templates,
      config_templates,
      io_schema: ioSchema,
      party_schema: partySchema,
      parameter_schema: parameterSchemas.parameterSchema,
      ui_schema: parameterSchemas.uiSchema,
      task_input_template,
      operations: v.operations ?? [],
      uc_capabilities: v.uc_capabilities ?? [],
    }
    if (editing) updateMut.mutate({ id: editing.id, body: { ...payload, name: editing.name } })
    else registerMut.mutate(payload)
  }

  const stepFields = [
    ['display_name', 'name', 'capability', 'operations', 'uc_capabilities', 'description'],
    [],
    ['registry_source', 'registry', 'image_name', 'image_tag', 'deploy_templates'],
  ]
  const nextCreateStep = async () => {
    try { await form.validateFields(stepFields[createStep]); setCreateStep((step) => Math.min(step + 1, 3)) }
    catch { message.warning('请先完成当前步骤的必填项') }
  }
  const openCreate = () => {
    setEditing(null); setCreateStep(0); setCreateOpen(true); form.resetFields()
    setPartySchema({ roles: [] }); setIoSchema({ inputs: [], outputs: [] })
    setParameterSchemas({ parameterSchema: { type: 'object', properties: {} }, uiSchema: {} })
  }
  const openEdit = (a: AppImage) => {
    setDetail(null); setEditing(a); setCreateStep(0); setCreateOpen(true)
    form.setFieldsValue({ ...a, task_input_template: a.task_input_template ? JSON.stringify(a.task_input_template, null, 2) : '' })
    setPartySchema(a.party_schema ?? { roles: [] }); setIoSchema(a.io_schema ?? { inputs: [], outputs: [] })
    setParameterSchemas({ parameterSchema: a.parameter_schema ?? { type: 'object', properties: {} }, uiSchema: a.ui_schema ?? {} })
  }

  const importFile = async (file: File) => {
    try {
      const imported = await parseAppImageConfig(await file.text(), 'appimage')
      const values: Record<string, any> = {
        name: imported.name,
        // DeployTemplateEditor consumes the normalized array directly so imported
        // YAML is rendered as editable template/container/port rows.
        deploy_templates: imported.deploy_templates ?? [],
        // JsonEditor/Form.Item accepts the parsed object and renders it as JSON;
        // keeping it structured also makes YAML import visibly populate the editor.
        config_templates: imported.config_templates ?? undefined,
      }
      if (imported.image?.name) values.image_name = imported.image.name
      if (imported.image?.tag) values.image_tag = imported.image.tag
      if (imported.image?.name) {
        const platformPrefix = '10.26.174.75:30002/bonfire/'
        if (imported.image.name.startsWith(platformPrefix)) {
          values.registry_source = 'platform'
          values.image_name = imported.image.name.slice(platformPrefix.length)
        } else {
          values.registry_source = 'third_party'
          const firstSegment = imported.image.name.split('/', 1)[0]
          values.registry = firstSegment.includes('.') || firstSegment.includes(':') || firstSegment === 'localhost'
            ? firstSegment
            : 'docker.io'
        }
      }
      form.setFieldsValue(values)
      message.success('AppImage 配置已解析并填入表单')
    } catch (error: any) {
      message.error(error.response?.data?.detail ?? error.message ?? 'AppImage 文件解析失败')
    }
    return false
  }

  const validatePlatformSyntax = async () => {
    try {
      const values = form.getFieldsValue(['deploy_templates', 'config_templates'])
      const deploy = await parseAppImageConfig(values.deploy_templates ?? '', 'deploy_templates')
      const config = values.config_templates?.trim()
        ? await parseAppImageConfig(values.config_templates, 'config_templates')
        : {}
      message.success('平台语法检查通过')
    } catch (error: any) {
      message.error(error.response?.data?.detail ?? error.message ?? '平台语法检查失败')
    }
  }

  const filtered = useMemo(() => (list.data ?? []).filter((a) => {
    const keyword = filters.keyword.trim().toLowerCase()
    const searchable = `${a.display_name} ${a.name} ${a.image_name}:${a.image_tag}`.toLowerCase()
    return (!keyword || searchable.includes(keyword))
      && (!filters.capability || a.capability === filters.capability)
      && (!filters.registrySource || a.registry_source === filters.registrySource)
      && (!filters.scope || a.scope === filters.scope)
  }), [list.data, filters])
  useEffect(() => setVisibleCount(12), [filters])
  const visibleApps = filtered.slice(0, visibleCount)

  return (
    <Card
      title="AppImage 应用管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>登记应用</Button>
        </Space>
      }
    >
      <Card size="small" style={{ marginBottom: 20, background: '#fafafa' }}>
        <Space wrap size={12}>
          <Input.Search allowClear placeholder="检索应用昵称、标识或镜像" style={{ width: 300 }} onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))} />
          <Select allowClear placeholder="应用能力" style={{ width: 190 }} options={CAP_OPTIONS} onChange={(v) => setFilters((f) => ({ ...f, capability: v ?? '' }))} />
          <Select allowClear placeholder="仓库来源" style={{ width: 150 }} options={[{ value: 'platform', label: '平台 Harbor' }, { value: 'third_party', label: '第三方仓库' }]} onChange={(v) => setFilters((f) => ({ ...f, registrySource: v ?? '' }))} />
          <Select allowClear placeholder="来源" style={{ width: 130 }} options={[{ value: 'builtin', label: '内置' }, { value: 'custom', label: '自定义' }]} onChange={(v) => setFilters((f) => ({ ...f, scope: v ?? '' }))} />
          <Text type="secondary">共 {filtered.length} 个应用</Text>
        </Space>
      </Card>
      {filtered.length ? (
        <div style={{ maxHeight: 'calc(100vh - 270px)', minHeight: 360, overflowY: 'auto', padding: '2px 4px 12px' }}
          onScroll={(e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) setVisibleCount((n) => Math.min(n + 8, filtered.length)) }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
          {visibleApps.map((a) => {
            const artwork = CAP_BACKGROUND[a.capability] ?? CAP_BACKGROUND.custom
            return (
            <Card key={a.id} hoverable size="small" styles={{ body: { padding: 0 } }} style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ height: 92, padding: '14px 16px', color: '#1f2937', background: artwork.background, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', width: 94, height: 94, borderRadius: '50%', background: 'rgba(255,255,255,.56)', left: -34, top: -48 }} />
                <div style={{ position: 'absolute', width: 58, height: 58, borderRadius: 16, border: '13px solid rgba(255,255,255,.52)', transform: 'rotate(32deg)', right: -22, bottom: -28 }} />
                <div style={{ position: 'absolute', width: 6, height: 48, borderRadius: 4, background: artwork.accent, right: 66, bottom: -9, transform: 'rotate(24deg)' }} />
                <div style={{ position: 'relative', fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 50 }}>{a.display_name}</div>
                <div style={{ position: 'relative', color: '#64748b', fontSize: 12, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CAP_TAG[a.capability]?.text ?? a.capability}</div>
                <Tag style={{ position: 'absolute', right: 10, top: 12, margin: 0 }} color={STATUS_TAG[a.status]?.color}>{STATUS_TAG[a.status]?.text ?? a.status}</Tag>
              </div>
              <div style={{ padding: 14 }}>
                <Space direction="vertical" size={9} style={{ width: '100%' }}>
                  <Text code copyable ellipsis={{ tooltip: a.name }} style={{ width: '100%', fontSize: 11 }}>{a.name}</Text>
                  <div style={{ minHeight: 24 }}><Tag color={REGISTRY_SOURCE[a.registry_source]?.color}>{REGISTRY_SOURCE[a.registry_source]?.text}</Tag><Tag color={SCOPE_TAG[a.scope]?.color}>{SCOPE_TAG[a.scope]?.text}</Tag></div>
                  <Text type="secondary" ellipsis={{ tooltip: a.description || '暂无描述' }} style={{ width: '100%', minHeight: 22 }}>{a.description || '暂无描述'}</Text>
                  <div style={{ minWidth: 0 }}><Text type="secondary" style={{ fontSize: 11 }}>镜像</Text><Text code ellipsis={{ tooltip: `${a.image_name}:${a.image_tag}` }} style={{ display: 'block', width: '100%', fontSize: 11 }}>{a.image_name}:{a.image_tag}</Text></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 24 }}>
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setDetail(a)}>查看详情</Button>
                    {canDelist(a) && <Popconfirm title="下架该应用？" onConfirm={() => delistMut.mutate(a.id)}><Button danger type="link" size="small">下架</Button></Popconfirm>}
                  </div>
                </Space>
              </div>
            </Card>
          )})}
          </div>
          {visibleCount < filtered.length && <div style={{ textAlign: 'center', color: '#8c8c8c', padding: 14 }}>继续向下滚动加载更多</div>}
        </div>
      ) : <Empty description={list.isLoading ? '加载中' : '没有符合条件的应用'} />}

      {/* 登记应用 */}
      <Drawer title="登记应用" open={createOpen} width={860} onClose={() => setCreateOpen(false)} destroyOnClose
        extra={<Space><Button onClick={() => setCreateOpen(false)}>取消</Button>{createStep > 0 && <Button onClick={() => setCreateStep((step) => step - 1)}>上一步</Button>}{createStep < 3 ? <Button type="primary" onClick={nextCreateStep}>下一步</Button> : <Button type="primary" loading={registerMut.isPending || updateMut.isPending} onClick={() => form.submit()}>{editing ? '保存' : '登记'}</Button>}</Space>}>
        <Steps current={createStep} size="small" style={{ marginBottom: 24 }} items={[
          { title: '基本信息' }, { title: '角色与 I/O' }, { title: '云部署与任务配置' }, { title: '生成结果与约束' },
        ]} />
        <Form form={form} layout="vertical" onFinish={onFinish}
          initialValues={{ capability: 'mpc', operations: ['process'], registry_source: 'platform', deploy_templates: DEFAULT_DEPLOY_TEMPLATES }}>
          <div style={{ display: createStep === 0 ? 'block' : 'none' }}>
          <Alert type="info" showIcon message="填写应用的展示信息和能力声明" style={{ marginBottom: 16 }} />
          <Form.Item name="display_name" label="应用名称" rules={[{ required: true }]}><Input placeholder="应用对外展示名称" /></Form.Item>
          <Form.Item name="name" label="Kuscia AppImage 标识（选填）" extra="需与已有 KusciaJob 的 appImage 一致；留空时由平台生成"><Input placeholder="如：risk-analysis-image" /></Form.Item>
          <Form.Item name="capability" label="应用能力" rules={[{ required: true }]}><Select options={CAP_OPTIONS} /></Form.Item>
          <Form.Item name="operations" label="操作属性" extra="运行时校验这些操作须全部在合约授权范围内"><Select mode="multiple" options={ACTION_OPTIONS} /></Form.Item>
          <Form.Item name="uc_capabilities" label="使用控制能力"><Select mode="multiple" options={UC_CAP_OPTIONS} /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
          </div>
          <div style={{ display: createStep === 2 ? 'block' : 'none' }}>
          <Alert type="info" showIcon message="云部署与任务配置" description="可导入 AppImage 文件自动填充，也可以分别配置镜像、部署模板和配置模板。" />
          <Upload accept=".yaml,.yml,.json,application/json,text/yaml" maxCount={1} showUploadList={false} beforeUpload={importFile}>
            <Button icon={<UploadOutlined />} style={{ margin: '12px 0 20px' }}>导入 AppImage YAML/JSON</Button>
          </Upload>
          <Tabs items={[
            { key: 'image', label: '镜像源', children: <>
              <Form.Item name="registry_source" label="镜像仓库来源" rules={[{ required: true }]}><Select options={[{ value: 'platform', label: '平台 Harbor（10.26.174.75:30002/bonfire）' }, { value: 'third_party', label: '第三方 OCI/Docker 仓库' }]} /></Form.Item>
              {registrySource === 'third_party' && <Form.Item name="registry" label="第三方仓库地址（选填）"><Input placeholder="如：registry.example.com" /></Form.Item>}
              <Form.Item name="image_name" label={registrySource === 'platform' ? '平台项目内仓库名' : '完整镜像名称'} rules={[{ required: true }]}><Input placeholder={registrySource === 'platform' ? '如：psi-demo' : '如：garbledoak/bonfire'} /></Form.Item>
              <Form.Item name="image_tag" label="镜像标签" rules={[{ required: true }]}><Input placeholder="如：latest" /></Form.Item>
            </> },
            { key: 'deploy', label: '部署模板', children: <Form.Item name="deploy_templates" rules={[{ required: true, message: '请配置部署模板' }]}><DeployTemplateEditor onChange={(value) => form.setFieldValue('deploy_templates', value)} /></Form.Item> },
            { key: 'config', label: '配置模板', children: <Form.Item name="config_templates" extra="配置文件名和值将原样保留"><JsonEditor rows={12} onChange={(text) => form.setFieldValue('config_templates', text)} placeholder={'{\n  "task-config.conf": "{{.TASK_ID}}"\n}'} /></Form.Item> },
            { key: 'task', label: '任务配置', children: <>
              <Alert type="info" showIcon style={{ marginBottom: 12 }} message="taskInputConfig 模板" description="平台会在 Workflow 运行时注入 DomainData 和参数。" />
              <Form.Item name="task_input_template" label="模板（JSON）" extra="inputs.<端口>.*、outputs.<端口>.*、parameters.<参数名>">
                <JsonEditor rows={10} onChange={(text) => form.setFieldValue('task_input_template', text)} placeholder={'{\n  "input": "{{inputs.customer_table.relative_uri}}",\n  "output": "{{outputs.result.relative_uri}}"\n}'} />
              </Form.Item>
              <Button onClick={validatePlatformSyntax}>平台语法检查</Button>
            </> },
          ]} />
          </div>
          <div style={{ display: createStep === 1 ? 'block' : 'none' }}>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="声明 Workflow 如何配置该应用" description="输入输出决定 DomainData 选择器；应用参数决定项目用户需要填写的动态表单。" />
          <Tabs items={[
            { key: 'roles', label: '参与方角色', children: <RoleSchemaEditor value={partySchema} onChange={setPartySchema} /> },
            { key: 'io', label: '输入输出', children: <IoSchemaEditor value={ioSchema} roles={partySchema.roles} onChange={setIoSchema} /> },
            { key: 'parameters', label: '应用参数', children: <><Alert type="info" showIcon style={{ marginBottom: 12 }} message="这些字段会在 Workflow 节点中生成动态表单，并通过 parameters.<参数名> 注入模板。" /><ParameterSchemaEditor value={parameterSchemas} onChange={setParameterSchemas} /></> },
            { key: 'advanced', label: '高级 JSON', children: <Space direction="vertical" style={{ width: '100%' }}><Alert type="warning" showIcon message="高级模式会覆盖角色、I/O 和参数定义；点击“应用到表单”后生效。" /><Input.TextArea rows={16} value={advancedSchemaText} onChange={(e) => setAdvancedSchemaText(e.target.value)} style={{ fontFamily: 'monospace' }} /><Button onClick={() => { try { const parsed = JSON.parse(advancedSchemaText); setPartySchema(parsed.party_schema ?? { roles: [] }); setIoSchema(parsed.io_schema ?? { inputs: [], outputs: [] }); setParameterSchemas({ parameterSchema: parsed.parameter_schema ?? { type: 'object', properties: {} }, uiSchema: parsed.ui_schema ?? {} }); message.success('高级 JSON 已应用') } catch (e: any) { message.error(`高级 JSON 解析失败：${e.message}`) } }}>应用到表单</Button></Space> },
          ]} onChange={(key) => { if (key === 'advanced') setAdvancedSchemaText(JSON.stringify({ party_schema: partySchema, io_schema: ioSchema, parameter_schema: parameterSchemas.parameterSchema, ui_schema: parameterSchemas.uiSchema }, null, 2)) }} />
          </div>
          <div style={{ display: createStep === 3 ? 'block' : 'none' }}>
            <Alert type="success" showIcon message="AppImage 生成结果" description="以下内容将作为应用登记请求提交；平台约束来自前面声明的角色、I/O Schema 和参数 Schema。" />
            <Divider orientation="left">生成的 AppImage YAML 结构</Divider>
            <JsonViewer value={{ apiVersion: 'kuscia.secretflow/v1alpha1', kind: 'AppImage', metadata: { name: form.getFieldValue('name') || '(平台自动生成)' }, spec: { image: { name: form.getFieldValue('image_name'), tag: form.getFieldValue('image_tag') }, deployTemplates: form.getFieldValue('deploy_templates'), configTemplates: form.getFieldValue('config_templates') || {} } }} collapsed={1} />
            <Divider orientation="left">平台约束</Divider>
            <JsonViewer value={{ party_schema: partySchema, io_schema: ioSchema, parameter_schema: parameterSchemas.parameterSchema, ui_schema: parameterSchemas.uiSchema, task_input_template: form.getFieldValue('task_input_template') ? JSON.parse(form.getFieldValue('task_input_template')) : null }} collapsed={2} />
          </div>
        </Form>
      </Drawer>

      {/* 详情 */}
      <Drawer title={`应用详情：${detail?.display_name ?? ''}`} open={!!detail} width={640}
        onClose={() => setDetail(null)} destroyOnClose>
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="应用名称">{detail.display_name}</Descriptions.Item>
              <Descriptions.Item label="标识"><Text code>{detail.name}</Text></Descriptions.Item>
              <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="能力"><Tag color={CAP_TAG[detail.capability]?.color}>{CAP_TAG[detail.capability]?.text ?? detail.capability}</Tag></Descriptions.Item>
              <Descriptions.Item label="操作属性">
                {detail.operations?.length
                  ? detail.operations.map((op) => <Tag key={op}>{ACTION_LABELS[op] ?? op}</Tag>)
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="使用控制能力">
                {detail.uc_capabilities?.length
                  ? detail.uc_capabilities.map((uc) => <Tag key={uc} color="volcano">{UC_CAP_LABELS[uc] ?? uc}</Tag>)
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="镜像"><Text code>{detail.image_name}:{detail.image_tag}</Text></Descriptions.Item>
              <Descriptions.Item label="仓库来源"><Tag color={REGISTRY_SOURCE[detail.registry_source]?.color}>{REGISTRY_SOURCE[detail.registry_source]?.text ?? detail.registry_source}</Tag></Descriptions.Item>
              <Descriptions.Item label="仓库地址">{detail.registry || '—'}</Descriptions.Item>
              <Descriptions.Item label="来源"><Tag color={SCOPE_TAG[detail.scope]?.color}>{SCOPE_TAG[detail.scope]?.text ?? detail.scope}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_TAG[detail.status]?.color}>{STATUS_TAG[detail.status]?.text ?? detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="登记方">{detail.created_by}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detail.created_at}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detail.updated_at}</Descriptions.Item>
              {detail.scope === 'custom' && detail.status === 'registered' && (isOperator || detail.created_by === user?.username) && <Descriptions.Item label="操作"><Button type="primary" onClick={() => openEdit(detail)}>编辑应用信息</Button></Descriptions.Item>}
            </Descriptions>
            <div>
              <Text strong>部署模板 (deploy_templates)</Text>
              <div style={{ marginTop: 8 }}><JsonViewer value={detail.deploy_templates} /></div>
            </div>
            <div>
              <Text strong>配置模板 (config_templates)</Text>
              <div style={{ marginTop: 8 }}>{detail.config_templates ? <JsonViewer value={detail.config_templates} /> : '—'}</div>
            </div>
            <div>
              <Text strong>作业模板 (job_template)</Text>
              <div style={{ marginTop: 8 }}>{detail.job_template ? <JsonViewer value={detail.job_template} /> : '—'}</div>
            </div>
            <div><Text strong>编排 I/O 契约 (io_schema)</Text><div style={{ marginTop: 8 }}>{detail.io_schema ? <JsonViewer value={detail.io_schema} /> : '—'}</div></div>
            <div><Text strong>taskInputConfig 模板</Text><div style={{ marginTop: 8 }}>{detail.task_input_template ? <JsonViewer value={detail.task_input_template} /> : '—'}</div></div>
          </Space>
        )}
      </Drawer>
    </Card>
  )
}
