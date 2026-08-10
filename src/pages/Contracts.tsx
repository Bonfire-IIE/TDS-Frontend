import { useMemo, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Drawer, Descriptions, message, Modal, Form, Timeline, Typography, Popconfirm, Alert, Divider,
  Select,
} from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Contract, listContracts, getContract, proposeContract, signContract,
  terminateContract, rejectContract,
} from '../api/contracts'
import { listConnectors } from '../api/connectors'
import { listProducts, Policy } from '../api/products'
import { listAppImages, AppImage } from '../api/appimages'
import PolicyEditor, { PolicyView } from '../components/PolicyEditor'
import JsonViewer from '../components/JsonViewer'
import { exportContractPdf } from '../utils/contractPdf'

const { Text } = Typography

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  initiated: { color: 'blue', text: '已发起' },
  negotiating: { color: 'orange', text: '磋商中' },
  filed: { color: 'green', text: '已备案' },
  executing: { color: 'cyan', text: '执行中' },
  terminated: { color: 'default', text: '已终止' },
  rejected: { color: 'red', text: '已驳回' },
}
const MODE_TAG: Record<string, { color: string; text: string }> = {
  accept: { color: 'cyan', text: '提案-接受' },
  negotiate: { color: 'geekblue', text: '提案-修订' },
}
const OP_LABELS: Record<string, string> = {
  propose: '提出提案', revise: '修订策略', accept: '接受签署', reject: '驳回',
  sign: '签署', file: '备案', terminate: '终止',
}

function jsonDiff(prev: unknown, next: unknown) {
  const left = JSON.stringify(prev, null, 2).split('\n')
  const right = JSON.stringify(next, null, 2).split('\n')
  const rows: { type: 'same' | 'add' | 'remove'; text: string }[] = []
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0))
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0; let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { rows.push({ type: 'same', text: left[i] }); i++; j++ }
    else if (j < right.length && (i === left.length || dp[i][j + 1] >= dp[i + 1][j])) { rows.push({ type: 'add', text: right[j++] }) }
    else { rows.push({ type: 'remove', text: left[i++] }) }
  }
  return rows
}

export default function Contracts() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: listConnectors })
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const appImages = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })

  const [detailId, setDetailId] = useState<string | null>(null)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [proposeForm] = Form.useForm()

  const detail = useQuery({
    queryKey: ['contract', detailId],
    queryFn: () => getContract(detailId as string),
    enabled: !!detailId,
  })

  const connName = useMemo(() => {
    const m = Object.fromEntries((connectors.data ?? []).map((c) => [c.id, `${c.name}（${c.kuscia_domain_id}）`]))
    return (id: string) => m[id] ?? id
  }, [connectors.data])
  const productName = useMemo(() => {
    const m = Object.fromEntries((products.data ?? []).map((p) => [p.id, p.name]))
    return (id: string) => m[id] ?? id
  }, [products.data])

  const exportPdf = (contract: Contract) => {
    try { exportContractPdf(contract, productName(contract.product_id), connName) }
    catch (e: any) { message.error(e.message ?? '导出失败') }
  }

  const onErr = (e: any) => message.error(e.response?.data?.detail ?? '操作失败')
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] })
    if (detailId) qc.invalidateQueries({ queryKey: ['contract', detailId] })
  }

  const proposeMut = useMutation({
    mutationFn: (v: { id: string; policies: Policy[]; allowed_appimages: string[] }) => proposeContract(v.id, v.policies, v.allowed_appimages),
    onSuccess: () => { message.success('已提交修订版策略'); setProposeOpen(false); refresh() },
    onError: onErr,
  })
  const signMut = useMutation({ mutationFn: signContract, onSuccess: (contract) => { message.success(contract.status === 'filed' ? '双方已签署，合约已自动备案' : '已签署，等待另一方签署'); refresh() }, onError: onErr })
  const terminateMut = useMutation({ mutationFn: terminateContract, onSuccess: () => { message.success('已终止'); refresh() }, onError: onErr })
  const rejectMut = useMutation({ mutationFn: rejectContract, onSuccess: () => { message.success('已驳回'); refresh() }, onError: onErr })

  const columns = [
    { title: '合约名称', dataIndex: 'name' },
    { title: '合约编号', dataIndex: 'contract_id', render: (v: string) => <Text copyable code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '数据产品', dataIndex: 'product_id', render: (v: string) => productName(v) },
    { title: '模式', dataIndex: 'mode', render: (v: string) => <Tag color={MODE_TAG[v]?.color}>{MODE_TAG[v]?.text ?? v}</Tag> },
    { title: '供数方', dataIndex: 'provider_connector_id', render: (v: string) => connName(v) },
    { title: '用数方', dataIndex: 'consumer_connector_id', render: (v: string) => connName(v) },
    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={STATUS_TAG[v]?.color}>{STATUS_TAG[v]?.text ?? v}</Tag> },
    {
      title: '操作', key: 'action',
      render: (_: any, c: Contract) => (
        <Space>
          <Button type="link" size="small" onClick={() => setDetailId(c.contract_id)}>详情</Button>
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => exportPdf(c)}>导出 PDF</Button>
        </Space>
      ),
    },
  ]

  const c = detail.data
  const canNegotiate = c && (c.status === 'initiated' || c.status === 'negotiating')

  return (
    <Card
      title="数字合约"
      extra={<Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>}
    >
      <Table rowKey="contract_id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={{ pageSize: 10 }} />

      <Drawer title="合约详情" open={!!detailId} onClose={() => setDetailId(null)} width={620} loading={detail.isLoading}>
        {c && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="合约名称">{c.name}</Descriptions.Item>
              <Descriptions.Item label="合约编号"><Text copyable code>{c.contract_id}</Text></Descriptions.Item>
              <Descriptions.Item label="绑定数据产品">{productName(c.product_id)}</Descriptions.Item>
              <Descriptions.Item label="摘要">{c.abstract || '—'}</Descriptions.Item>
              <Descriptions.Item label="使用目的">{c.purpose || '—'}</Descriptions.Item>
              <Descriptions.Item label="模式"><Tag color={MODE_TAG[c.mode]?.color}>{MODE_TAG[c.mode]?.text ?? c.mode}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_TAG[c.status]?.color}>{STATUS_TAG[c.status]?.text ?? c.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="供数方">{connName(c.provider_connector_id)}</Descriptions.Item>
              <Descriptions.Item label="用数方">{connName(c.consumer_connector_id)}</Descriptions.Item>
              <Descriptions.Item label="限制应用">{c.allowed_appimages?.length ? c.allowed_appimages.join('、') : '不限制'}</Descriptions.Item>
              {c.contract_hash && (
                <Descriptions.Item label="备案存证码"><Text copyable code style={{ fontSize: 12 }}>{c.contract_hash}</Text></Descriptions.Item>
              )}
            </Descriptions>

            {/* 签署方 */}
            {c.parties?.length > 0 && (
              <div>
                <Text strong>签署方</Text>
                <div style={{ marginTop: 8 }}>
                  {c.parties.map((p) => (
                    <div key={p.party_role} style={{ fontSize: 13, marginBottom: 4 }}>
                      <Tag color={p.party_role === 'provider' ? 'blue' : 'gold'}>{p.party_role === 'provider' ? '供数方' : '用数方'}</Tag>
                      {p.entity || connName(p.connector_id)}
                      {p.signature_hash
                        ? <Tag color="green" style={{ marginLeft: 8 }}>已签署</Tag>
                        : <Tag color="default" style={{ marginLeft: 8 }}>未签署</Tag>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Text strong>合约策略</Text>
              <div style={{ marginTop: 8 }}><PolicyView policies={c.policies ?? []} /></div>
            </div>

            {/* 协商历史时间线 */}
            <div>
              <Text strong>协商历史</Text>
              <div style={{ marginTop: 12 }}>
                {c.history?.length > 0 ? (
                  <Timeline
                    items={c.history.map((h, i) => {
                      const prev = i > 0 ? c.history[i - 1].snapshot : null
                      const current = h.snapshot
                      const diff = prev ? jsonDiff(prev, current) : []
                      return ({
                      children: (
                        <div>
                          <Space>
                            <Tag>第 {h.round} 轮</Tag>
                            <Text>{OP_LABELS[h.op] ?? h.op}</Text>
                          </Space>
                          <div style={{ fontSize: 12, color: '#888' }}>{h.operator} · {new Date(h.created_at).toLocaleString()}</div>
                          {h.snapshot && <Button type="link" size="small" style={{ paddingLeft: 0 }} onClick={() => Modal.info({
                            title: `第 ${h.round} 轮 · ${i === 0 ? '提案 JSON' : 'JSON 与 Diff'}`,
                            width: 900,
                            okText: '关闭',
                            content: <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
                              <Text strong>当前轮次 JSON</Text>
                              <JsonViewer value={current} collapsed={1} maxHeight={360} />
                              {prev && <><Text strong>与上一轮 Diff</Text><div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#0f172a', padding: 12, fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace', fontSize: 12 }}>{diff.map((row, index) => <div key={index} style={{ color: row.type === 'add' ? '#86efac' : row.type === 'remove' ? '#fca5a5' : '#cbd5e1', background: row.type === 'add' ? '#14532d' : row.type === 'remove' ? '#7f1d1d' : 'transparent', whiteSpace: 'pre-wrap' }}>{row.type === 'add' ? '+ ' : row.type === 'remove' ? '- ' : '  '}{row.text}</div>)}</div></>}
                            </Space>,
                          })}>{i === 0 ? '查看本轮 JSON' : '查看 JSON 与 Diff'}</Button>}
                        </div>
                      ),
                    })})}
                  />
                ) : <Text type="secondary">暂无协商记录</Text>}
              </div>
            </div>

            <Divider style={{ margin: 0 }} />

            {/* 当前可执行操作 */}
            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={() => exportPdf(c)}>导出 PDF</Button>
              {canNegotiate && (
              <Button type="primary" onClick={() => { proposeForm.setFieldsValue({ policies: c.policies ?? [], allowed_appimages: c.allowed_appimages ?? [] }); setProposeOpen(true) }}>
                  修订策略
                </Button>
              )}
              {canNegotiate && (
                <Popconfirm title="按当前策略签署本合约？" onConfirm={() => signMut.mutate(c.contract_id)}>
                  <Button loading={signMut.isPending}>签署</Button>
                </Popconfirm>
              )}
              {['initiated', 'negotiating'].includes(c.status) && (
                <Popconfirm title="驳回本合约？此操作不可逆。" onConfirm={() => rejectMut.mutate(c.contract_id)}>
                  <Button danger loading={rejectMut.isPending}>驳回</Button>
                </Popconfirm>
              )}
              {['signed', 'filed', 'executing'].includes(c.status) && (
                <Popconfirm title="终止本合约？" onConfirm={() => terminateMut.mutate(c.contract_id)}>
                  <Button danger loading={terminateMut.isPending}>终止</Button>
                </Popconfirm>
              )}
              {['terminated', 'rejected'].includes(c.status) && (
                <Alert type="info" showIcon message="合约已处于终态，无可执行操作。" style={{ flex: 1 }} />
              )}
            </Space>
          </Space>
        )}
      </Drawer>

      {/* 修订策略（propose） */}
      <Modal title="修订合约策略" open={proposeOpen} width={760} destroyOnClose
        onCancel={() => setProposeOpen(false)} confirmLoading={proposeMut.isPending}
        onOk={() => proposeForm.submit()}>
        <Form form={proposeForm} layout="vertical"
          onFinish={(v) => c && proposeMut.mutate({ id: c.contract_id, policies: v.policies, allowed_appimages: v.allowed_appimages ?? [] })}>
          <Form.Item name="policies" label="修订后的策略"
            rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少保留一条策略'))) }]}>
            <PolicyEditor />
          </Form.Item>
          <Form.Item name="allowed_appimages" label="限制应用（可选）" extra="留空表示不限制；提交后将显示本轮变更。">
            <Select mode="multiple" allowClear placeholder="选择允许使用的 AppImage" options={(appImages.data ?? []).filter((a: AppImage) => a.status === 'registered').map((a: AppImage) => ({ value: a.name, label: a.display_name || a.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
