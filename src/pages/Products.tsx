import { useMemo, useState } from 'react'
import {
  Card, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Typography, Alert,
  Drawer, Descriptions, Empty,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Product, listProducts, listProduct, delistProduct, deleteProduct, Policy,
} from '../api/products'
import { requestContract } from '../api/contracts'
import { searchResources } from '../api/catalog'
import { listConnectors } from '../api/connectors'
import { listContractTemplates } from '../api/contractTemplates'
import { listAppImages } from '../api/appimages'
import { useAuth } from '../auth/AuthContext'
import PolicyEditor, { PolicyView, emptyPolicy } from '../components/PolicyEditor'

const { Text, Paragraph } = Typography

const MODE_TAG: Record<string, { color: string; text: string }> = {
  accept: { color: 'blue', text: '提案-接受' },
  negotiate: { color: 'default', text: '提案-修订' },
}
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  listed: { color: 'blue', text: '已上架' },
  delisted: { color: 'default', text: '已下架' },
}

export default function Products() {
  const { user } = useAuth()
  const isOperator = user?.roles?.includes('operator')
  const isSupervisor = user?.roles?.includes('supervisor')
  const isAdmin = isOperator || isSupervisor
  const qc = useQueryClient()

  const list = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const resources = useQuery({ queryKey: ['catalog', {}], queryFn: () => searchResources({}) })
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: listConnectors })
  const templates = useQuery({ queryKey: ['contract-templates'], queryFn: listContractTemplates })
  const appimages = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })

  // 已注册的应用能力（供产品关联）
  const appimageOptions = (appimages.data ?? [])
    .filter((a) => a.status === 'registered')
    .map((a) => ({ value: a.name, label: a.display_name }))
  const appimageLabel = (name: string) =>
    (appimages.data ?? []).find((a) => a.name === name)?.display_name ?? name

  const [createOpen, setCreateOpen] = useState(false)
  const [useTarget, setUseTarget] = useState<Product | null>(null)
  const [applyTarget, setApplyTarget] = useState<Product | null>(null)
  const [detailTarget, setDetailTarget] = useState<Product | null>(null)
  const [filters, setFilters] = useState({ name: '', domain: '', mode: '' })
  const [createForm] = Form.useForm()
  const [useForm] = Form.useForm()
  const [applyForm] = Form.useForm()

  // 可上架的资源：后端已按属主过滤（普通用户仅返回自有），此处仅保留已登记状态
  const myResources = useMemo(
    () => (resources.data ?? []).filter((r) => r.status === 'registered'),
    [resources.data],
  )
  // 可用连接器（approved / online）
  const usableConnectors = (connectors.data ?? []).filter((c) => ['approved', 'online'].includes(c.status))
  const domainOptions = useMemo(() => Array.from(new Set((list.data ?? []).map((p) => p.kuscia_domain_id))).sort().map((v) => ({ value: v, label: v })), [list.data])
  const filteredProducts = useMemo(() => (list.data ?? []).filter((p) =>
    (!filters.name.trim() || p.name.toLowerCase().includes(filters.name.trim().toLowerCase()))
    && (!filters.domain || p.kuscia_domain_id === filters.domain)
    && (!filters.mode || p.transaction_mode === filters.mode)
  ), [list.data, filters])

  const onErr = (e: any) => {
    const detail = e.response?.data?.detail
    const text = Array.isArray(detail)
      ? detail.map((item: any) => item?.msg ?? String(item)).join('；')
      : detail
    message.error(text || '操作失败')
  }
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] })

  const createMut = useMutation({
    mutationFn: listProduct,
    onSuccess: () => { message.success('产品上架成功'); setCreateOpen(false); createForm.resetFields(); invalidate() },
    onError: onErr,
  })
  const delistMut = useMutation({
    mutationFn: delistProduct,
    onSuccess: () => { message.success('已下架'); invalidate() },
    onError: onErr,
  })
  const deleteMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { message.success('已删除'); invalidate() },
    onError: onErr,
  })
  const requestMut = useMutation({
    mutationFn: (v: { productId: string; body: any }) => requestContract(v.productId, v.body),
    onSuccess: () => {
      message.success('已发起合约')
      setUseTarget(null); setApplyTarget(null); useForm.resetFields(); applyForm.resetFields()
      qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: onErr,
  })

  return (
    <Card
      title="数据产品市场"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); createForm.resetFields() }}>上架产品</Button>
        </Space>
      }
    >
      <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
        <Space wrap>
          <Input.Search allowClear placeholder="按产品名称检索" style={{ width: 280 }} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
          <Select allowClear showSearch placeholder="归属域" style={{ width: 220 }} options={domainOptions} onChange={(v) => setFilters((f) => ({ ...f, domain: v ?? '' }))} />
          <Select allowClear placeholder="交易模式" style={{ width: 180 }} options={[{ value: 'accept', label: '提案-接受' }, { value: 'negotiate', label: '提案-修订' }]} onChange={(v) => setFilters((f) => ({ ...f, mode: v ?? '' }))} />
          <Text type="secondary">共 {filteredProducts.length} 个产品</Text>
        </Space>
      </Card>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {filteredProducts.map((p) => (
          <Card key={p.id} hoverable styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', minHeight: 138 }}>
              <div style={{ width: 78, flex: '0 0 78px', position: 'relative', overflow: 'hidden', background: p.transaction_mode === 'accept' ? 'linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)' : 'linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%)' }}>
                <div style={{ position: 'absolute', width: 82, height: 82, borderRadius: '50%', background: 'rgba(255,255,255,.55)', left: -34, top: -20 }} />
                <div style={{ position: 'absolute', width: 52, height: 52, borderRadius: 14, border: '12px solid rgba(255,255,255,.48)', transform: 'rotate(32deg)', right: -25, bottom: -15 }} />
                <div style={{ position: 'absolute', width: 5, height: 54, borderRadius: 4, background: 'rgba(37,99,235,.24)', left: 22, top: 54 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.3fr) minmax(220px, 1fr) minmax(220px, 1fr) auto', gap: 24, alignItems: 'center', minHeight: 102 }}>
              <div style={{ minWidth: 0 }}><Space><Text strong style={{ fontSize: 17 }}>{p.name}</Text><Tag color={STATUS_TAG[p.status]?.color}>{STATUS_TAG[p.status]?.text ?? p.status}</Tag></Space><Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '8px 0 0' }}>{p.description || '暂无产品说明'}</Paragraph></div>
              <div style={{ minWidth: 0 }}><Text type="secondary">TDS 标识码</Text><br />{p.tds_code ? <Text copyable code ellipsis={{ tooltip: p.tds_code }} style={{ display: 'block', width: '100%', marginTop: 5 }}>{p.tds_code}</Text> : '—'}</div>
              <div><Space direction="vertical" size={6}><span><Text type="secondary">归属域：</Text><Text code>{p.kuscia_domain_id}</Text></span><span><Text type="secondary">交易模式：</Text><Tag color={MODE_TAG[p.transaction_mode]?.color}>{MODE_TAG[p.transaction_mode]?.text}</Tag></span><span><Text type="secondary">关联资源：</Text>{p.resource_name || p.resource_id}</span></Space></div>
              <Space wrap style={{ maxWidth: 260, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setDetailTarget(p)}>详情</Button>
                {p.status === 'listed' && p.transaction_mode === 'accept' && <Button type="primary" size="small" disabled={isAdmin} title={isAdmin ? '管理员不可使用数据产品' : undefined} onClick={() => { setUseTarget(p); useForm.resetFields() }}>使用</Button>}
                {p.status === 'listed' && p.transaction_mode === 'negotiate' && <Button type="primary" size="small" disabled={isAdmin} title={isAdmin ? '管理员不可申请使用数据产品' : undefined} onClick={() => { setApplyTarget(p); applyForm.setFieldsValue({ policies: p.baseline_policies ?? [] }) }}>申请</Button>}
                {p.status === 'listed' && (isOperator || p.created_by === user?.username) && <Popconfirm title="下架该产品？" onConfirm={() => delistMut.mutate(p.id)}><Button size="small" danger>下架</Button></Popconfirm>}
                {(isAdmin || p.created_by === user?.username) && <Popconfirm title="删除该产品？" onConfirm={() => deleteMut.mutate(p.id)}><Button size="small" danger>删除</Button></Popconfirm>}
              </Space>
            </div>
              </div>
            </div>
          </Card>
        ))}
        {!list.isLoading && !filteredProducts.length && <Empty description="没有符合条件的数据产品" />}
      </Space>

      {/* 上架产品 */}
      <Modal title="上架数据产品" open={createOpen} width={760} onOk={() => createForm.submit()}
        onCancel={() => setCreateOpen(false)} confirmLoading={createMut.isPending} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={(v) => createMut.mutate(v)}
          initialValues={{ transaction_mode: 'accept', baseline_policies: [emptyPolicy()] }}>
          <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input placeholder="产品对外展示名称" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="resource_id" label="底层数据资源" rules={[{ required: true, message: '请选择资源' }]}>
            <Select
              placeholder="选择一个已登记的数据资源"
              options={myResources.map((r) => ({ value: r.id, label: `${r.name}（${r.kuscia_domain_id}）` }))}
            />
          </Form.Item>
          <Form.Item name="transaction_mode" label="交易模式" rules={[{ required: true }]}>
            <Select options={[
              { value: 'accept', label: '提案-接受（用数方接受基准合约即成立）' },
              { value: 'negotiate', label: '提案-修订（多轮协商达成共识）' },
            ]} />
          </Form.Item>
          <Form.Item name="template_id" label="选择合约模板（可选，填充基准策略后可微调）">
            <Select
              allowClear
              placeholder="从系统/我的合约模板中选择，作为基准策略起点"
              options={(templates.data ?? []).map((t) => ({
                value: t.id,
                label: `${t.scope === 'system' ? '[系统] ' : '[我的] '}${t.name}`,
              }))}
              onChange={(id) => {
                const t = (templates.data ?? []).find((x) => x.id === id)
                if (t) createForm.setFieldsValue({ baseline_policies: t.policies ?? [] })
              }}
            />
          </Form.Item>
          <Form.Item name="baseline_policies" label="基准合约策略"
            rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少配置一条策略'))) }]}>
            <PolicyEditor />
          </Form.Item>
          <Form.Item name="allowed_appimages" label="支持的应用能力"
            extra="选择本产品允许使用的计算能力（AppImage），用于后续隐私计算作业">
            <Select
              mode="multiple"
              allowClear
              placeholder="从已注册的 AppImage 中选择"
              loading={appimages.isLoading}
              options={appimageOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 使用（accept）：只读策略 + 使用目的 + 打字确认 */}
      <Modal title={`使用产品：${useTarget?.name ?? ''}`} open={!!useTarget} width={640}
        onCancel={() => setUseTarget(null)} confirmLoading={requestMut.isPending}
        okText="确认使用" onOk={() => useForm.submit()} destroyOnClose>
        {useTarget && (
          <Form form={useForm} layout="vertical"
            onFinish={(v) => requestMut.mutate({ productId: useTarget.id, body: { consumer_connector_id: v.consumer_connector_id, purpose: v.purpose, confirm: v.confirm } })}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="接受即视为签署：将按基准策略即时生成并备案合约。" />
            <Typography.Text strong>基准合约策略</Typography.Text>
            <div style={{ margin: '8px 0 16px' }}><PolicyView policies={useTarget.baseline_policies ?? []} /></div>
            <Form.Item name="consumer_connector_id" label="使用方连接器" rules={[{ required: true }]}>
              <Select placeholder="选择你的连接器（approved/online）"
                options={usableConnectors.map((c) => ({ value: c.id, label: `${c.name}（${c.kuscia_domain_id}）` }))} />
            </Form.Item>
            <Form.Item name="purpose" label="使用目的" rules={[{ required: true, message: '请声明使用目的' }]}>
              <Input.TextArea rows={2} placeholder="声明本次数据使用的目的" />
            </Form.Item>
            <Form.Item name="confirm" label={<span>打字确认：请输入产品名 <Text code>{useTarget.name}</Text></span>}
              rules={[
                { required: true, message: '请输入产品名以确认' },
                { validator: (_, v) => (v === useTarget.name ? Promise.resolve() : Promise.reject(new Error('输入内容需与产品名完全一致'))) },
              ]}>
              <Input placeholder={useTarget.name} />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 申请（negotiate）：选连接器 + 基于基准修改策略 */}
      <Modal title={`申请产品：${applyTarget?.name ?? ''}`} open={!!applyTarget} width={760}
        onCancel={() => setApplyTarget(null)} confirmLoading={requestMut.isPending}
        okText="发起申请" onOk={() => applyForm.submit()} destroyOnClose>
        {applyTarget && (
          <Form form={applyForm} layout="vertical"
            initialValues={{ policies: applyTarget.baseline_policies ?? [] }}
            onFinish={(v) => requestMut.mutate({ productId: applyTarget.id, body: { consumer_connector_id: v.consumer_connector_id, purpose: v.purpose, policies: v.policies, allowed_appimages: v.allowed_appimages ?? [] } })}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="基于基准策略修改后发起磋商，供数方将进一步审核/修订。" />
            <Form.Item name="consumer_connector_id" label="使用方连接器" rules={[{ required: true }]}>
              <Select placeholder="选择你的连接器（approved/online）"
                options={usableConnectors.map((c) => ({ value: c.id, label: `${c.name}（${c.kuscia_domain_id}）` }))} />
            </Form.Item>
            <Form.Item name="purpose" label="使用目的"><Input.TextArea rows={2} placeholder="声明本次数据使用的目的（选填）" /></Form.Item>
            <Form.Item name="policies" label="拟定合约策略"
              rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少保留一条策略'))) }]}>
              <PolicyEditor />
            </Form.Item>
            <Form.Item name="allowed_appimages" label="限制应用（可选）" extra="留空表示不限制。">
              <Select mode="multiple" allowClear placeholder="选择允许使用的 AppImage" options={appimageOptions} />
            </Form.Item>
            {applyTarget.description && <Paragraph type="secondary">产品说明：{applyTarget.description}</Paragraph>}
          </Form>
        )}
      </Modal>

      {/* 产品详情 */}
      <Drawer title={`产品详情：${detailTarget?.name ?? ''}`} open={!!detailTarget} width={640}
        onClose={() => setDetailTarget(null)} destroyOnClose>
        {detailTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="产品名称">{detailTarget.name}</Descriptions.Item>
              <Descriptions.Item label="TDS 标识码">
                {detailTarget.tds_code ? <Text copyable code style={{ fontSize: 12 }}>{detailTarget.tds_code}</Text> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="描述">{detailTarget.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="关联资源">
                {detailTarget.resource_name || <Text type="secondary">{detailTarget.resource_id}</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="归属域"><Text code>{detailTarget.kuscia_domain_id}</Text></Descriptions.Item>
              <Descriptions.Item label="磋商模式">
                <Tag color={MODE_TAG[detailTarget.transaction_mode]?.color}>
                  {MODE_TAG[detailTarget.transaction_mode]?.text ?? detailTarget.transaction_mode}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_TAG[detailTarget.status]?.color}>
                  {STATUS_TAG[detailTarget.status]?.text ?? detailTarget.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="上架方">{detailTarget.created_by}</Descriptions.Item>
              <Descriptions.Item label="支持的应用能力">
                {(detailTarget.allowed_appimages ?? []).length
                  ? (detailTarget.allowed_appimages ?? []).map((n) => <Tag key={n} color="blue">{appimageLabel(n)}</Tag>)
                  : '—'}
              </Descriptions.Item>
            </Descriptions>
            <div>
              <Text strong>基准合约策略</Text>
              <div style={{ marginTop: 8 }}><PolicyView policies={detailTarget.baseline_policies ?? []} /></div>
            </div>
          </Space>
        )}
      </Drawer>
    </Card>
  )
}
