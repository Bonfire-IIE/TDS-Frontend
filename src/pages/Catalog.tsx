import { useMemo, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message, Drawer,
  Descriptions, Popconfirm, Row, Col, Typography, Divider, Switch,
} from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined, MinusCircleOutlined, DatabaseOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CatalogItem, CodeTable, DataSourceItem, getCodeDict, searchResources, registerResource,
  delistResource, deleteResource, listDataSources, createDataSource, deleteDataSource,
} from '../api/catalog'
import { listConnectors } from '../api/connectors'
import { useAuth } from '../auth/AuthContext'

const { Text } = Typography

const SEC_COLOR: Record<string, string> = { '1': 'green', '2': 'cyan', '3': 'gold', '4': 'orange', '5': 'red' }

// 平台承载的数据类型；仅 table 为结构化（含列定义）
const DATA_TYPES = [
  { value: 'table', label: '结构化表 (table)' },
  { value: 'image', label: '图像 (image)' },
  { value: 'text', label: '文本 (text)' },
  { value: 'file', label: '文件 (file)' },
  { value: 'other', label: '其他 (other)' },
]
const DATA_TYPE_LABEL: Record<string, string> = Object.fromEntries(DATA_TYPES.map((d) => [d.value, d.label]))

export default function Catalog() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const isSupervisor = user?.roles?.includes('supervisor')
  const isAdmin = isOperator || isSupervisor
  const qc = useQueryClient()

  const [filters, setFilters] = useState<{ q?: string; security_level?: string; resource_category?: string }>({})
  const [applied, setApplied] = useState(filters)
  const [regOpen, setRegOpen] = useState(false)
  const [dsMgrOpen, setDsMgrOpen] = useState(false)
  const [detail, setDetail] = useState<CatalogItem | null>(null)
  const [form] = Form.useForm()

  // 登记表单里选中的连接器 / 数据类型（联动数据源列表与列定义显隐）
  const regConnId = Form.useWatch('provider_connector_id', form)
  const regDataType = Form.useWatch('data_type', form)

  const codeDict = useQuery({ queryKey: ['code-dict'], queryFn: getCodeDict })
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: listConnectors })
  const list = useQuery({
    queryKey: ['catalog', applied],
    queryFn: () => searchResources(applied),
  })
  // 登记表单：按所选连接器加载可用数据源
  const regDatasources = useQuery({
    queryKey: ['datasources', regConnId],
    queryFn: () => listDataSources(regConnId),
    enabled: !!regConnId,
  })

  // code -> 中文名 映射
  const nameOf = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    ;(codeDict.data ?? []).forEach((t: CodeTable) => {
      m[t.table_key] = Object.fromEntries(t.options.map((o) => [o.code, o.name]))
    })
    return (table: string, code?: string | null) => (code ? m[table]?.[code] ?? code : '—')
  }, [codeDict.data])

  const opts = (key: string) =>
    (codeDict.data?.find((t) => t.table_key === key)?.options ?? []).map((o) => ({ value: o.code, label: o.name }))
  // 安全等级上限=3（法律责任硬约束）：登记表单只允许 1/2/3
  const secOptsCapped = () => opts('security_level').filter((o) => o.value <= '3')

  const regMut = useMutation({
    mutationFn: registerResource,
    onSuccess: () => {
      message.success('资源登记成功，已在 Kuscia 创建 DomainData')
      setRegOpen(false); form.resetFields()
      qc.invalidateQueries({ queryKey: ['catalog'] })
    },
    onError: (e: any) => message.error(e.response?.data?.detail ?? '登记失败'),
  })
  const delistMut = useMutation({
    mutationFn: delistResource,
    onSuccess: () => { message.success('已下架'); qc.invalidateQueries({ queryKey: ['catalog'] }) },
    onError: (e: any) => message.error(e.response?.data?.detail ?? '操作失败'),
  })
  const deleteMut = useMutation({
    mutationFn: deleteResource,
    onSuccess: () => { message.success('已删除'); qc.invalidateQueries({ queryKey: ['catalog'] }) },
    onError: (e: any) => message.error(e.response?.data?.detail ?? '删除失败'),
  })

  const approvedConnectors = (connectors.data ?? []).filter((c) => ['approved', 'online', 'offline'].includes(c.status))

  const dsSelectOptions = (regDatasources.data ?? []).map((d) => ({
    value: d.scope === 'builtin' ? d.kuscia_datasource_id : d.id,
    label: `${d.name}（${d.type}${d.scope === 'builtin' ? ' · 内置' : ''}）`,
  }))

  const columns = [
    { title: '资源名称', dataIndex: 'name' },
    { title: 'TDS 标识码', dataIndex: 'tds_code', render: (v: string) => <Text copyable code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '归属连接器', dataIndex: 'kuscia_domain_id', render: (v: string) => <Text code>{v}</Text> },
    { title: '数据类型', dataIndex: 'data_type', render: (v: string) => <Tag>{DATA_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '资源分类', dataIndex: 'resource_category', render: (v: string) => nameOf('resource_category', v) },
    { title: '安全等级', dataIndex: 'security_level', render: (v: string) => <Tag color={SEC_COLOR[v]}>{nameOf('security_level', v)}</Tag> },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'registered' ? 'green' : 'default'}>{s === 'registered' ? '已登记' : '已下架'}</Tag> },
    {
      title: '操作', key: 'action',
      render: (_: any, r: CatalogItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => setDetail(r)}>详情</Button>
          {r.status === 'registered' && (isOperator || r.created_by === user?.username) && (
            <Popconfirm title="下架该资源？" onConfirm={() => delistMut.mutate(r.id)}>
              <Button type="link" size="small" danger>下架</Button>
            </Popconfirm>
          )}
          {(isAdmin || r.created_by === user?.username) && (
            <Popconfirm title="删除该资源？删除将同步移除 Kuscia DomainData；若已被数据产品引用会被拦截。"
              onConfirm={() => deleteMut.mutate(r.id)}>
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="数据资源"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button icon={<DatabaseOutlined />} onClick={() => setDsMgrOpen(true)}>数据源管理</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setRegOpen(true)}>登记数据资源</Button>
        </Space>
      }
    >
      {/* 检索栏 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input placeholder="按名称搜索" allowClear style={{ width: 200 }}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))} />
        <Select placeholder="安全等级" allowClear style={{ width: 140 }} options={opts('security_level')}
          onChange={(v) => setFilters((f) => ({ ...f, security_level: v }))} />
        <Select placeholder="资源分类" allowClear style={{ width: 140 }} options={opts('resource_category')}
          onChange={(v) => setFilters((f) => ({ ...f, resource_category: v }))} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => setApplied(filters)}>检索</Button>
      </Space>

      <Table rowKey="id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={{ pageSize: 10 }} />

      {/* 登记 */}
      <Modal title="登记数据资源" open={regOpen} width={720} onOk={() => form.submit()}
        onCancel={() => setRegOpen(false)} confirmLoading={regMut.isPending}>
        <Form form={form} layout="vertical" onFinish={(v) => regMut.mutate(v)}
          initialValues={{ data_type: 'table', columns: [{ name: '', type: 'str', comment: '' }] }}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="name" label="资源名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="provider_connector_id" label="归属连接器" rules={[{ required: true }]}>
              <Select placeholder="选择已批准的连接器"
                options={approvedConnectors.map((c) => ({ value: c.id, label: `${c.name}（${c.kuscia_domain_id}）` }))} />
            </Form.Item></Col>
          </Row>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="data_type" label="数据类型" rules={[{ required: true }]}><Select options={DATA_TYPES} /></Form.Item></Col>
            <Col span={12}><Form.Item name="security_level" label="安全等级" rules={[{ required: true }]}>
              <Select options={secOptsCapped()} placeholder="仅 1-3 级" />
            </Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="resource_category" label="资源分类"><Select allowClear options={opts('resource_category')} /></Form.Item></Col>
            <Col span={8}><Form.Item name="source_type" label="数据来源"><Select allowClear options={opts('source_type')} /></Form.Item></Col>
            <Col span={8}><Form.Item name="delivery_form" label="交付形式"><Select allowClear options={opts('delivery_form')} /></Form.Item></Col>
            <Col span={8}><Form.Item name="update_freq" label="更新频率"><Select allowClear options={opts('update_freq')} /></Form.Item></Col>
            <Col span={8}><Form.Item name="quality_level" label="质量等级"><Select allowClear options={opts('quality_level')} /></Form.Item></Col>
          </Row>
          <Form.Item name="tags" label="标签"><Select mode="tags" placeholder="回车添加标签" /></Form.Item>

          {/* 资源 ↔ Kuscia DomainData 绑定：数据源 + 文件相对路径 + 列定义 */}
          <Divider>Kuscia DomainData 绑定</Divider>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="datasource_id" label="关联数据源">
              <Select options={dsSelectOptions} loading={regDatasources.isFetching}
                notFoundContent={regConnId ? '该连接器暂无数据源' : '请先选择连接器'} />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="relative_uri" label="数据文件路径 (relative_uri)"
              extra="相对所选数据源根路径的文件路径，如 alice.csv；隐私计算应用据此导入数据。留空则由平台自动生成（可能与真实文件不符）。">
              <Input placeholder="alice.csv" />
            </Form.Item></Col>
          </Row>

          {/* 仅结构化(table)需要列定义 */}
          {regDataType === 'table' && (
            <Form.Item label="数据列定义">
              <Form.List name="columns">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                        <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true, message: '列名' }]} noStyle>
                          <Input placeholder="列名" style={{ width: 160 }} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'type']} noStyle>
                          <Select style={{ width: 110 }} options={['str', 'int', 'float', 'bool'].map((t) => ({ value: t, label: t }))} />
                        </Form.Item>
                        <Form.Item {...field} name={[field.name, 'comment']} noStyle>
                          <Input placeholder="注释" style={{ width: 200 }} />
                        </Form.Item>
                        <MinusCircleOutlined onClick={() => remove(field.name)} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add({ name: '', type: 'str', comment: '' })} block>+ 添加列</Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          )}
          {regDataType && regDataType !== 'table' && (
            <Text type="secondary">非结构化数据（{DATA_TYPE_LABEL[regDataType]}）无需列定义，将以 Kuscia type=unknown 登记。</Text>
          )}
        </Form>
      </Modal>

      {/* 数据源管理 */}
      <DataSourceManager
        open={dsMgrOpen}
        onClose={() => setDsMgrOpen(false)}
        connectors={approvedConnectors.map((c) => ({ id: c.id, label: `${c.name}（${c.kuscia_domain_id}）` }))}
      />

      {/* 详情 */}
      <Drawer title="资源详情" open={!!detail} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="TDS 标识码"><Text copyable code>{detail.tds_code}</Text></Descriptions.Item>
            <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="数据类型"><Tag>{DATA_TYPE_LABEL[detail.data_type] ?? detail.data_type}</Tag></Descriptions.Item>
            <Descriptions.Item label="归属连接器">{detail.kuscia_domain_id}</Descriptions.Item>
            <Descriptions.Item label="DomainData">{detail.kuscia_domaindata_id}</Descriptions.Item>
            <Descriptions.Item label="关联数据源">
              {detail.datasource_name ? (
                <span>
                  {detail.datasource_name} <Tag>{detail.datasource_type}</Tag>
                  {detail.datasource_uri && <div><Text type="secondary" style={{ fontSize: 12 }}>{detail.datasource_uri}</Text></div>}
                </span>
              ) : detail.datasource_id}
            </Descriptions.Item>
            <Descriptions.Item label="资源分类">{nameOf('resource_category', detail.resource_category)}</Descriptions.Item>
            <Descriptions.Item label="数据来源">{nameOf('source_type', detail.source_type)}</Descriptions.Item>
            <Descriptions.Item label="交付形式">{nameOf('delivery_form', detail.delivery_form)}</Descriptions.Item>
            <Descriptions.Item label="更新频率">{nameOf('update_freq', detail.update_freq)}</Descriptions.Item>
            <Descriptions.Item label="质量等级">{nameOf('quality_level', detail.quality_level)}</Descriptions.Item>
            <Descriptions.Item label="安全等级"><Tag color={SEC_COLOR[detail.security_level]}>{nameOf('security_level', detail.security_level)}</Tag></Descriptions.Item>
            <Descriptions.Item label="标签">{(detail.tags ?? []).map((t) => <Tag key={t}>{t}</Tag>)}</Descriptions.Item>
            <Descriptions.Item label="数据列">
              {(detail.columns ?? []).length
                ? (detail.columns ?? []).map((c: any) => <div key={c.name}><Text code>{c.name}</Text> : {c.type} {c.comment && `（${c.comment}）`}</div>)
                : '—（非结构化数据无列定义）'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </Card>
  )
}

// ---- 数据源管理（建 localfs / oss + 列表 + 删除）----
function DataSourceManager({ open, onClose, connectors }: {
  open: boolean
  onClose: () => void
  connectors: { id: string; label: string }[]
}) {
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [connId, setConnId] = useState<string | undefined>(undefined)
  const dsType = Form.useWatch('type', form)

  const dsList = useQuery({
    queryKey: ['datasources', connId],
    queryFn: () => listDataSources(connId),
    enabled: open && !!connId,
  })

  const createMut = useMutation({
    mutationFn: createDataSource,
    onSuccess: () => {
      message.success('数据源创建成功，已在 Kuscia 创建 DomainDataSource')
      form.resetFields()
      qc.invalidateQueries({ queryKey: ['datasources'] })
    },
    onError: (e: any) => message.error(e.response?.data?.detail ?? '创建失败'),
  })
  const delMut = useMutation({
    mutationFn: deleteDataSource,
    onSuccess: () => { message.success('已删除'); qc.invalidateQueries({ queryKey: ['datasources'] }) },
    onError: (e: any) => message.error(e.response?.data?.detail ?? '删除失败'),
  })

  const onFinish = (v: any) => {
    const body =
      v.type === 'localfs'
        ? { name: v.name, type: 'localfs', connector_id: v.connector_id, uri: v.path, info: { path: v.path } }
        : {
            name: v.name, type: 'oss', connector_id: v.connector_id, access_directly: !!v.access_directly,
            info: {
              endpoint: v.endpoint, bucket: v.bucket, prefix: v.prefix || '',
              access_key_id: v.access_key_id, access_key_secret: v.access_key_secret,
              storage_type: v.storage_type || '', virtualhost: !!v.virtualhost,
            },
          }
    createMut.mutate(body)
  }

  const cols = [
    { title: '名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type', render: (v: string) => <Tag>{v}</Tag> },
    { title: '来源', dataIndex: 'scope', render: (v: string) => <Tag color={v === 'builtin' ? 'gold' : 'blue'}>{v === 'builtin' ? 'Kuscia 内置' : '自定义'}</Tag> },
    { title: 'Kuscia 数据源', dataIndex: 'kuscia_datasource_id', render: (v: string) => <Text code>{v}</Text> },
    { title: 'URI', dataIndex: 'uri', render: (v: string) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text> },
    {
      title: '操作', key: 'action',
      render: (_: any, r: DataSourceItem) => r.deletable ? (
        <Popconfirm title="删除该数据源？（Kuscia 中同步删除）" onConfirm={() => delMut.mutate(r.id)}>
          <Button type="link" size="small" danger>删除</Button>
        </Popconfirm>
      ) : <Text type="secondary">内置，不可删除</Text>,
    },
  ]

  return (
    <Modal title="数据源管理" open={open} width={760} footer={null} onCancel={onClose}>
      <Space style={{ marginBottom: 12 }}>
        <Text>按连接器查看：</Text>
        <Select style={{ width: 320 }} allowClear placeholder="选择连接器" value={connId}
          options={connectors.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(v) => setConnId(v)} />
      </Space>
      <Table rowKey="id" size="small" loading={dsList.isFetching} columns={cols}
        dataSource={dsList.data ?? []} pagination={false}
        locale={{ emptyText: connId ? '暂无数据源' : '请选择连接器' }} />

      <Divider>新增数据源</Divider>
      <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ type: 'localfs', access_directly: true }}>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="connector_id" label="归属连接器" rules={[{ required: true }]}>
            <Select options={connectors.map((c) => ({ value: c.id, label: c.label }))} onChange={(v) => setConnId(v)} />
          </Form.Item></Col>
          <Col span={8}><Form.Item name="name" label="数据源名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
          <Col span={8}><Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'localfs', label: '本地文件系统 (localfs)' }, { value: 'oss', label: '对象存储 (oss)' }]} />
          </Form.Item></Col>
        </Row>
        {dsType === 'localfs' && (
          <Form.Item name="path" label="节点内路径" rules={[{ required: true }]}
            extra="连接器(Lite)节点本地路径；数据不出域(access_directly=true)">
            <Input placeholder="/home/kuscia/var/storage/data" />
          </Form.Item>
        )}
        {dsType === 'oss' && (
          <>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="endpoint" label="Endpoint" rules={[{ required: true }]}><Input placeholder="https://oss-cn-x.example.com" /></Form.Item></Col>
              <Col span={6}><Form.Item name="bucket" label="Bucket" rules={[{ required: true }]}><Input /></Form.Item></Col>
              <Col span={6}><Form.Item name="prefix" label="Prefix"><Input placeholder="data/" /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="access_key_id" label="AccessKeyId"><Input placeholder="仅用于下发，不落库" /></Form.Item></Col>
              <Col span={8}><Form.Item name="access_key_secret" label="AccessKeySecret"><Input.Password placeholder="仅用于下发，不落库" /></Form.Item></Col>
              <Col span={8}><Form.Item name="storage_type" label="StorageType"><Input placeholder="minio / oss / ..." /></Form.Item></Col>
            </Row>
            <Space size="large">
              <Form.Item name="virtualhost" label="Virtualhost" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item name="access_directly" label="直连(access_directly)" valuePropName="checked"><Switch /></Form.Item>
            </Space>
          </>
        )}
        <Button type="primary" htmlType="submit" loading={createMut.isPending}>创建数据源</Button>
      </Form>
    </Modal>
  )
}
