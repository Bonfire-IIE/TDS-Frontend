import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import {
  addEdge, Background, Controls, Handle, MiniMap, Position, ReactFlow,
  ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AppImage } from '../api/appimages'
import type { AvailableDomainData } from '../api/projects'

const { Text } = Typography

export interface WorkflowParty { domain_id: string; role: string }
export interface InputBinding { port: string; domain_id: string; domaindata_id: string }
export interface OutputBinding { port: string; domain_id: string; name?: string; relative_uri?: string; data_type?: string }
export interface WorkflowNodeDsl {
  id: string
  alias: string
  app_image: string
  parties: WorkflowParty[]
  input_bindings?: InputBinding[]
  output_bindings?: OutputBinding[]
  parameters?: Record<string, unknown>
  position?: { x: number; y: number }
}
export interface WorkflowEdgeDsl { source: string; target: string; type?: 'control' | 'data'; source_handle?: string; target_handle?: string }
export interface WorkflowDsl {
  schedule_mode?: string
  max_parallelism?: number
  nodes: WorkflowNodeDsl[]
  edges: WorkflowEdgeDsl[]
  [key: string]: unknown
}

interface Props {
  value: WorkflowDsl
  appImages: AppImage[]
  projectDomains: { domain_id: string }[]
  domainData: AvailableDomainData[]
  onChange: (workflow: WorkflowDsl) => void
  height?: number
}

type AppContract = AppImage & {
  party_schema?: { roles?: { name: string; title?: string; min?: number; max?: number }[] } | null
}
type NormalizedPort = { name: string; title: string; kind: string; role?: string; required: boolean; multiple: boolean; formats: string[]; source_types: string[] }
type TaskNodeData = WorkflowNodeDsl & { label: string; inputs: NormalizedPort[]; outputs: NormalizedPort[] }

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)

function normalizeParameterContract(app?: AppContract) {
  const schema = isRecord(app?.parameter_schema) ? app.parameter_schema : {}
  const rawProperties = isRecord(schema.properties) ? schema.properties : {}
  const properties = Object.fromEntries(Object.entries(rawProperties).filter(([, value]) => isRecord(value)))
  const required = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === 'string') : []
  const uiSchema = isRecord(app?.ui_schema) ? app.ui_schema : {}
  return { properties, required: new Set(required), uiSchema, invalid: !!app?.parameter_schema && !isRecord(schema.properties) }
}

function normalizeAppContract(app?: AppContract) {
  const rawRoles = isRecord(app?.party_schema) && Array.isArray(app.party_schema.roles) ? app.party_schema.roles : []
  const roles = rawRoles.filter((role) => isRecord(role) && typeof role.name === 'string').map((role) => ({
    name: role.name as string,
    title: typeof role.title === 'string' ? role.title : role.name as string,
    min: typeof role.min === 'number' ? role.min : 0,
    max: typeof role.max === 'number' ? role.max : 1,
  }))
  const io = isRecord(app?.io_schema) ? app.io_schema : {}
  const normalizePorts = (value: unknown) => Array.isArray(value)
    ? value.filter((port) => isRecord(port) && typeof port.name === 'string' && typeof port.kind === 'string').map((port) => ({
      name: port.name as string,
      title: typeof port.title === 'string' ? port.title : port.name as string,
      kind: port.kind as string,
      role: typeof port.role === 'string' ? port.role : undefined,
      required: port.required !== false,
      multiple: port.multiple === true,
      formats: Array.isArray(port.formats) ? port.formats.filter((item): item is string => typeof item === 'string') : [],
      source_types: Array.isArray(port.source_types) ? port.source_types.filter((item): item is string => typeof item === 'string') : [],
    }))
    : []
  return {
    roles,
    inputs: normalizePorts(io.inputs),
    outputs: normalizePorts(io.outputs),
    invalid: (!!app?.party_schema && !Array.isArray((app.party_schema as any).roles))
      || (!!app?.io_schema && (!Array.isArray((app.io_schema as any).inputs) || !Array.isArray((app.io_schema as any).outputs))),
  }
}

function TaskNode({ data, selected }: NodeProps<Node<TaskNodeData>>) {
  return <div style={{ minWidth: 210, padding: 12, borderRadius: 8, background: '#fff', border: `2px solid ${selected ? '#1677ff' : '#d9d9d9'}`, boxShadow: '0 2px 8px #00000018', position: 'relative' }}>
    <Handle id="control-in" type="target" position={Position.Top} style={{ background: '#8c8c8c' }} />
    <Space direction="vertical" size={2}>
      <Text strong>{data.alias || data.id}</Text>
      <Tag color="blue" style={{ margin: 0 }}>{data.app_image}</Tag>
      <Text type="secondary" style={{ fontSize: 12 }}>{(Array.isArray(data.parties) ? data.parties : []).filter((p) => isRecord(p) && typeof p.domain_id === 'string').map((p) => p.domain_id).join('、') || '未配置参与方'}</Text>
    </Space>
    {data.inputs.map((port, i, all) => <Handle key={`in:${port.name}`} id={`in:${port.name}`} type="target" position={Position.Left} style={{ top: `${((i + 1) * 100) / (all.length + 1)}%`, background: '#1677ff' }} title={`输入 ${port.name} (${port.kind})`} />)}
    {data.outputs.map((port, i, all) => <Handle key={`out:${port.name}`} id={`out:${port.name}`} type="source" position={Position.Right} style={{ top: `${((i + 1) * 100) / (all.length + 1)}%`, background: '#52c41a' }} title={`输出 ${port.name} (${port.kind})`} />)}
    <Handle id="control-out" type="source" position={Position.Bottom} style={{ background: '#8c8c8c' }} />
  </div>
}

const nodeTypes = { task: TaskNode }

function Editor({ value, appImages, projectDomains, domainData, onChange, height = 620 }: Props) {
  const initialNodes = useMemo<Node<TaskNodeData>[]>(() => (Array.isArray(value.nodes) ? value.nodes : []).filter((n) => isRecord(n) && typeof n.id === 'string').map((n, i) => {
    const contract = normalizeAppContract(appImages.find((a) => a.name === n.app_image) as AppContract | undefined)
    return { id: n.id, type: 'task', position: isRecord(n.position) && typeof n.position.x === 'number' && typeof n.position.y === 'number' ? n.position as { x: number; y: number } : { x: 80 + (i % 3) * 260, y: 80 + Math.floor(i / 3) * 150 }, data: { id: n.id, alias: typeof n.alias === 'string' ? n.alias : n.id, app_image: typeof n.app_image === 'string' ? n.app_image : '', parties: Array.isArray(n.parties) ? n.parties : [], input_bindings: Array.isArray(n.input_bindings) ? n.input_bindings : [], output_bindings: Array.isArray(n.output_bindings) ? n.output_bindings : [], parameters: isRecord(n.parameters) ? n.parameters : {}, label: typeof n.alias === 'string' ? n.alias : n.id, inputs: contract.inputs, outputs: contract.outputs } }
  }), [])
  const initialEdges = useMemo<Edge[]>(() => value.edges.map((e, i) => ({
    id: `${e.source}-${e.target}-${i}`, source: e.source, target: e.target,
    sourceHandle: e.type === 'data' ? `out:${e.source_handle}` : 'control-out', targetHandle: e.type === 'data' ? `in:${e.target_handle}` : 'control-in',
    label: e.type === 'data' ? '数据' : '控制', data: { edgeType: e.type ?? 'control' }, animated: e.type === 'data',
  })), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedId, setSelectedId] = useState<string>()
  const [form] = Form.useForm()
  const { screenToFlowPosition } = useReactFlow()

  const emit = useCallback((nextNodes: Node<TaskNodeData>[], nextEdges: Edge[]) => {
    onChange({ ...value, nodes: nextNodes.map((n) => ({ id: n.id, alias: n.data.alias, app_image: n.data.app_image, parties: n.data.parties ?? [], input_bindings: n.data.input_bindings ?? [], output_bindings: n.data.output_bindings ?? [], parameters: n.data.parameters ?? {}, position: n.position })), edges: nextEdges.map((e) => ({ source: e.source, target: e.target, type: (e.data?.edgeType as 'control' | 'data') ?? 'control', ...((e.data?.edgeType === 'data') ? { source_handle: e.sourceHandle?.replace(/^out:/, ''), target_handle: e.targetHandle?.replace(/^in:/, '') } : {}) })) })
  }, [onChange, value])

  useEffect(() => {
    const node = nodes.find((n) => n.id === selectedId)
    if (node) form.setFieldsValue(node.data)
  }, [selectedId])

  const connect = (connection: Connection) => setEdges((current) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return current
    const isData = connection.sourceHandle?.startsWith('out:') && connection.targetHandle?.startsWith('in:')
    const isControl = connection.sourceHandle === 'control-out' && connection.targetHandle === 'control-in'
    if (!isData && !isControl) return current
    const edgeType = isData ? 'data' : 'control'
    const next = addEdge({ ...connection, label: isData ? '数据' : '控制', animated: isData, data: { edgeType } }, current)
    emit(nodes, next); return next
  })
  const drop = (event: React.DragEvent) => {
    event.preventDefault()
    const appName = event.dataTransfer.getData('application/appimage')
    if (!appName) return
    const base = appName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() || 'task'
    let id = base; let suffix = 1
    while (nodes.some((n) => n.id === id)) id = `${base}-${suffix++}`
    const partyTemplate = projectDomains.map((p) => ({ domain_id: p.domain_id, role: '' }))
    const app = appImages.find((item) => item.name === appName) as AppContract | undefined
    const contract = normalizeAppContract(app)
    const outputBindings = contract.outputs.map((port) => ({ port: port.name, domain_id: projectDomains[0]?.domain_id ?? '', data_type: port.kind }))
    const node: Node<TaskNodeData> = { id, type: 'task', position: screenToFlowPosition({ x: event.clientX, y: event.clientY }), data: { id, alias: id, label: id, app_image: appName, parties: partyTemplate, input_bindings: [], output_bindings: outputBindings, parameters: {}, inputs: contract.inputs, outputs: contract.outputs } }
    const next = [...nodes, node]; setNodes(next); emit(next, edges); setSelectedId(id)
  }
  const saveNode = (fields: TaskNodeData) => setNodes((current) => {
    const contract = normalizeAppContract(appImages.find((a) => a.name === fields.app_image) as AppContract | undefined)
    const next = current.map((n) => n.id === selectedId ? { ...n, data: { ...n.data, ...fields, label: fields.alias, inputs: contract.inputs, outputs: contract.outputs } } : n)
    emit(next, edges); return next
  })
  const removeNode = () => {
    const nextNodes = nodes.filter((n) => n.id !== selectedId); const nextEdges = edges.filter((e) => e.source !== selectedId && e.target !== selectedId)
    setNodes(nextNodes); setEdges(nextEdges); emit(nextNodes, nextEdges); setSelectedId(undefined)
  }

  const selectedNode = nodes.find((n) => n.id === selectedId)
  const selectedApp = appImages.find((a) => a.name === selectedNode?.data.app_image) as AppContract | undefined
  const appContract = normalizeAppContract(selectedApp)
  const roles = appContract.roles
  const inputPorts = appContract.inputs
  const outputPorts = appContract.outputs
  const parameterContract = normalizeParameterContract(selectedApp)
  const parameterProperties = parameterContract.properties
  const requiredParameters = parameterContract.required
  const updateInput = (port: string, domaindataId?: string) => {
    const selected = domainData.find((item) => item.domaindata_id === domaindataId)
    const current = (form.getFieldValue('input_bindings') ?? []) as InputBinding[]
    const next = [...current.filter((item) => item.port !== port), ...(selected ? [{ port, domain_id: selected.domain_id, domaindata_id: selected.domaindata_id }] : [])]
    form.setFieldValue('input_bindings', next); saveNode({ ...form.getFieldsValue(), input_bindings: next })
  }
  const updateOutput = (port: string, field: keyof OutputBinding, value: string) => {
    const current = (form.getFieldValue('output_bindings') ?? []) as OutputBinding[]
    const old = current.find((item) => item.port === port) ?? { port, domain_id: projectDomains[0]?.domain_id ?? '' }
    const next = [...current.filter((item) => item.port !== port), { ...old, port, [field]: value }]
    form.setFieldValue('output_bindings', next); saveNode({ ...form.getFieldsValue(), output_bindings: next })
  }
  const updateRole = (role: string, domainIds: string[]) => {
    const current = (form.getFieldValue('parties') ?? []) as WorkflowParty[]
    const validRoles = new Set(roles.map((item) => item.name))
    const next = [...current.filter((party) => validRoles.has(party.role) && party.role !== role), ...domainIds.map((domain_id) => ({ domain_id, role }))]
    form.setFieldValue('parties', next)
    saveNode({ ...form.getFieldsValue(), parties: next })
  }
  const updateParameter = (name: string, value: unknown) => {
    const parameters = { ...((form.getFieldValue('parameters') ?? {}) as Record<string, unknown>), [name]: value }
    form.setFieldValue('parameters', parameters); saveNode({ ...form.getFieldsValue(), parameters })
  }
  const changeAppImage = (appImage: string) => {
    const app = appImages.find((item) => item.name === appImage) as AppContract | undefined
    const contract = normalizeAppContract(app)
    const inputNames = new Set(contract.inputs.map((port) => port.name))
    const outputNames = new Set(contract.outputs.map((port) => port.name))
    const parameterNames = new Set(Object.keys(normalizeParameterContract(app).properties))
    const current = form.getFieldsValue()
    const fields = {
      ...current,
      app_image: appImage,
      input_bindings: ((current.input_bindings ?? []) as InputBinding[]).filter((binding) => inputNames.has(binding.port)),
      output_bindings: ((current.output_bindings ?? []) as OutputBinding[]).filter((binding) => outputNames.has(binding.port)),
      parameters: Object.fromEntries(Object.entries((current.parameters ?? {}) as Record<string, unknown>).filter(([name]) => parameterNames.has(name))),
    }
    form.setFieldsValue(fields); saveNode(fields)
  }

  return <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 300px', height, border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
    <div style={{ padding: 12, overflow: 'auto', background: '#fafafa', borderRight: '1px solid #f0f0f0' }}>
      <Text strong>AppImage 组件</Text><div style={{ margin: '8px 0 14px' }}><Text type="secondary">拖入画布创建任务</Text></div>
      {appImages.filter((a) => a.status === 'registered').map((app) => <Card key={app.id} size="small" hoverable draggable onDragStart={(e) => { e.dataTransfer.setData('application/appimage', app.name); e.dataTransfer.effectAllowed = 'move' }} style={{ marginBottom: 8 }}>
        <Text strong>{app.display_name || app.name}</Text><br /><Text code style={{ fontSize: 11 }}>{app.name}</Text><br /><Tag style={{ marginTop: 5 }}>{app.capability}</Tag>
      </Card>)}
      {!appImages.some((a) => a.status === 'registered') && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已登记应用" />}
    </div>
    <div style={{ position: 'relative' }} onDrop={drop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} deleteKeyCode="Delete" onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
        onNodeClick={(_, n) => setSelectedId(n.id)} onNodeDragStop={(_, n) => { const next = nodes.map((item) => item.id === n.id ? n : item); setNodes(next); emit(next, edges) }}
        onEdgesDelete={(deleted) => { const ids = new Set(deleted.map((e) => e.id)); const next = edges.filter((e) => !ids.has(e.id)); setEdges(next); emit(nodes, next) }} fitView>
        <Background /><Controls /><MiniMap />
      </ReactFlow>
    </div>
    <div style={{ padding: 14, overflow: 'auto', borderLeft: '1px solid #f0f0f0' }}>
      {!selectedId ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择节点编辑属性" /> : <>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}><Text strong>任务属性</Text><Button danger type="text" icon={<DeleteOutlined />} onClick={removeNode}>删除</Button></Space>
        <Form form={form} layout="vertical" onValuesChange={(_, all) => saveNode(all)}>
          <Form.Item name="alias" label="任务别名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="app_image" label="AppImage" rules={[{ required: true }]}><Select onChange={changeAppImage} options={appImages.filter((a) => a.status === 'registered').map((a) => ({ value: a.name, label: a.display_name || a.name }))} /></Form.Item>
          <Form.Item name="parties" hidden><Input /></Form.Item>
          <Form.Item name="input_bindings" hidden><Input /></Form.Item>
          <Form.Item name="output_bindings" hidden><Input /></Form.Item>
          <Form.Item name="parameters" hidden><Input /></Form.Item>
          {appContract.invalid && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="该 AppImage 的角色或 I/O Schema 格式无效，已忽略异常定义。" />}
          <Text strong>参与方角色</Text>
          {roles.length ? roles.map((role) => <Form.Item key={role.name} label={role.title || role.name} required={(role.min ?? 0) > 0} extra={`${role.name} · ${role.min ?? 0}–${role.max ?? '不限'} 个参与方`}>
            <Select mode={(role.max ?? Infinity) === 1 ? undefined : 'multiple'} value={(selectedNode?.data.parties ?? []).filter((party) => party.role === role.name).map((party) => party.domain_id)} onChange={(value) => updateRole(role.name, Array.isArray(value) ? value : [value])}
              options={projectDomains.map((domain) => ({ value: domain.domain_id, label: domain.domain_id }))} maxCount={role.max} />
          </Form.Item>) : <Form.Item label="参与方"><Select mode="multiple" value={(selectedNode?.data.parties ?? []).map((party) => party.domain_id)} onChange={(ids) => {
            const parties = ids.map((domain_id) => ({ domain_id, role: '' })); form.setFieldValue('parties', parties); saveNode({ ...form.getFieldsValue(), parties })
          }} options={projectDomains.map((domain) => ({ value: domain.domain_id, label: domain.domain_id }))} /></Form.Item>}
          {!!inputPorts.length && <><Text strong>DomainData 输入</Text>{inputPorts.map((port) => {
            const binding = (selectedNode?.data.input_bindings ?? []).find((item) => item.port === port.name)
            const incoming = edges.find((edge) => edge.target === selectedNode?.id && edge.data?.edgeType === 'data' && edge.targetHandle === `in:${port.name}`)
            const upstream = incoming ? nodes.find((node) => node.id === incoming.source) : undefined
            const upstreamPort = incoming?.sourceHandle?.replace(/^out:/, '')
            const accepted = [port.kind]
            const formats = port.formats
            const sources = port.source_types
            const roleDomains = port.role ? new Set((selectedNode?.data.parties ?? []).filter((party) => party.role === port.role).map((party) => party.domain_id)) : undefined
            const options = domainData.filter((item) => (!roleDomains || roleDomains.has(item.domain_id)) && (!accepted.length || accepted.includes(item.data_type)) && (!formats?.length || (!!item.format && formats.includes(item.format))) && (!sources?.length || sources.includes('*') || (!!item.datasource_type && sources.includes(item.datasource_type)))).map((item) => ({ value: item.domaindata_id, label: `${item.name}（${item.domain_id} · ${item.data_type}${item.format ? `/${item.format}` : ''} · ${item.datasource_type || 'unknown'}）` }))
            return <Form.Item key={port.name} label={port.title} required={port.required} extra={`${port.name} · ${port.kind} · 格式 ${formats.join('/') || '不限'} · 数据源 ${sources.join('/') || '不限'}`}>
              {incoming ? <Input value={`上游任务「${upstream?.data.alias || upstream?.id}」输出「${upstreamPort || '未命名'}」`} disabled /> : <Select allowClear showSearch optionFilterProp="label" value={binding?.domaindata_id} onChange={(value) => updateInput(port.name, value)} options={options} placeholder="选择兼容的 DomainData" />}
            </Form.Item>
          })}</>}
          {!!outputPorts.length && <><Text strong>DomainData 输出</Text>{outputPorts.map((port) => {
            const binding = (selectedNode?.data.output_bindings ?? []).find((item) => item.port === port.name)
            return <Card key={port.name} size="small" title={port.title} style={{ margin: '8px 0' }}><Form.Item label="输出域" required><Select value={binding?.domain_id} onChange={(value) => updateOutput(port.name, 'domain_id', value)} options={projectDomains.map((d) => ({ value: d.domain_id, label: d.domain_id }))} /></Form.Item><Form.Item label="资源名称"><Input value={binding?.name} onChange={(e) => updateOutput(port.name, 'name', e.target.value)} placeholder="默认使用项目-任务-端口" /></Form.Item><Form.Item label="相对路径"><Input value={binding?.relative_uri} onChange={(e) => updateOutput(port.name, 'relative_uri', e.target.value)} placeholder="留空由平台按 run 生成" /></Form.Item></Card>
          })}</>}
          {!!Object.keys(parameterProperties).length && <><Text strong>应用参数</Text>{Object.entries(parameterProperties).map(([name, property]) => {
            const rawValue = selectedNode?.data.parameters?.[name] ?? property.default
            const label = typeof property.title === 'string' ? property.title : name
            const extra = typeof property.description === 'string' ? property.description : `模板变量：parameters.${name}`
            const enumValues = Array.isArray(property.enum) ? property.enum.filter((item: unknown): item is string | number => typeof item === 'string' || typeof item === 'number') : []
            if (enumValues.length) return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Select value={(typeof rawValue === 'string' || typeof rawValue === 'number') ? rawValue : undefined} onChange={(next) => updateParameter(name, next)} options={enumValues.map((item) => ({ value: item, label: String(item) }))} /></Form.Item>
            if (property.type === 'boolean') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Switch checked={typeof rawValue === 'boolean' ? rawValue : false} onChange={(next) => updateParameter(name, next)} /></Form.Item>
            if (property.type === 'number' || property.type === 'integer') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><InputNumber value={typeof rawValue === 'number' ? rawValue : undefined} precision={property.type === 'integer' ? 0 : undefined} onChange={(next) => updateParameter(name, next)} style={{ width: '100%' }} /></Form.Item>
            if (property.type === 'array') return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}><Select mode="tags" value={Array.isArray(rawValue) ? rawValue.filter((item): item is string => typeof item === 'string') : []} onChange={(next) => updateParameter(name, next)} /></Form.Item>
            const ui = isRecord(parameterContract.uiSchema[name]) ? parameterContract.uiSchema[name] : {}
            const value = typeof rawValue === 'string' || typeof rawValue === 'number' ? String(rawValue) : ''
            return <Form.Item key={name} label={label} required={requiredParameters.has(name)} extra={extra}>{ui['ui:widget'] === 'textarea' ? <Input.TextArea value={value} onChange={(e) => updateParameter(name, e.target.value)} /> : <Input value={value} onChange={(e) => updateParameter(name, e.target.value)} />}</Form.Item>
          })}</>}
          {parameterContract.invalid && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="该 AppImage 的参数 Schema 格式无效，已跳过动态参数表单。" />}
        </Form>
      </>}
    </div>
  </div>
}

export default function WorkflowCanvas(props: Props) {
  return <ReactFlowProvider><Editor {...props} /></ReactFlowProvider>
}
