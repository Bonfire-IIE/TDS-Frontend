import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Descriptions, Drawer, Space, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { SigmaContainer, useLoadGraph, useRegisterEvents } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { getAuditEvidence, listAuditEvents, type AuditEventItem } from '../api/audit'
import JsonViewer from '../components/JsonViewer'

const { Text } = Typography

function AuditNetwork({ events, selectedId, onSelect }: { events: AuditEventItem[]; selectedId?: string; onSelect: (id: string) => void }) {
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  useEffect(() => {
    const graph = new Graph()
    const streams = new Map<string, AuditEventItem[]>()
    events.forEach((event) => streams.set(event.stream_id, [...(streams.get(event.stream_id) ?? []), event]))
    Array.from(streams.values()).forEach((chain, group) => chain.sort((a, b) => a.sequence - b.sequence).forEach((event, index) => {
      graph.addNode(event.event_id, { label: `${event.sequence}. ${event.event_type}`, x: group * 4 + Math.cos(index) * 2, y: group * 3 + Math.sin(index) * 2, size: event.event_id === selectedId ? 14 : 9, color: event.event_id === selectedId ? '#fa541c' : event.event_type.includes('contract') ? '#722ed1' : event.event_type.includes('usage') ? '#1677ff' : '#13a8a8', stream: event.stream_id })
      if (index) graph.addEdge(chain[index - 1].event_id, event.event_id, { size: 2, color: '#91caff' })
    }))
    if (graph.order > 1) forceAtlas2.assign(graph, { iterations: 120, settings: forceAtlas2.inferSettings(graph) })
    loadGraph(graph)
  }, [events, selectedId, loadGraph])
  useEffect(() => registerEvents({ clickNode: ({ node }) => onSelect(node) }), [registerEvents, onSelect])
  return null
}

export default function AuditEvents() {
  const list = useQuery({ queryKey: ['audit-events'], queryFn: listAuditEvents })
  const [selected, setSelected] = useState<AuditEventItem | null>(null)
  const evidence = useQuery({ queryKey: ['audit-evidence', selected?.event_id], queryFn: () => getAuditEvidence(selected!.event_id), enabled: !!selected })
  const events = list.data ?? []
  const focused = selected ? events.filter((event) => event.stream_id === selected.stream_id) : events
  const selectEvent = useMemo(() => (id: string) => setSelected(events.find((event) => event.event_id === id) ?? null), [events])
  const statusTag = (status: string) => status === 'submitted' ? <Tag color="green">已提交 Rekor</Tag> : status === 'local_only' ? <Tag color="orange">仅本地存证</Tag> : <Tag color="blue">{status}</Tag>

  return <Card title={<Space><SafetyCertificateOutlined />审计存证</Space>} extra={<Space>{selected && <Button onClick={() => setSelected(null)}>显示全部审计流</Button>}<Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button></Space>}>
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="上方关系图按审计流和序号展示本地哈希链；点击图节点或下方记录可聚焦相关合约审计链并查看 Rekor 回执。" />
    <div style={{ height: 390, border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 18, background: '#fafcff' }}>
      <SigmaContainer style={{ height: '100%', width: '100%' }} settings={{ renderEdgeLabels: false, labelDensity: 0.12, labelGridCellSize: 90, defaultEdgeType: 'line' }}>
        <AuditNetwork events={focused} selectedId={selected?.event_id} onSelect={selectEvent} />
      </SigmaContainer>
    </div>
    <Table rowKey="event_id" loading={list.isLoading} dataSource={selected ? focused : events} rowClassName={(record) => record.event_id === selected?.event_id ? 'ant-table-row-selected' : ''} onRow={(record) => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })} columns={[{ title: '事件类型', dataIndex: 'event_type', render: (v) => <Tag>{v}</Tag> }, { title: '事件 ID', dataIndex: 'event_id', render: (v) => <Text code copyable style={{ fontSize: 11 }}>{v}</Text> }, { title: '审计流', dataIndex: 'stream_id', render: (v) => <Text code>{v}</Text> }, { title: '序号', dataIndex: 'sequence' }, { title: '当前哈希', dataIndex: 'current_hash', render: (v) => <Text code ellipsis={{ tooltip: v }} style={{ maxWidth: 180, display: 'inline-block' }}>{v}</Text> }, { title: '发生时间', dataIndex: 'occurred_at', render: (v) => new Date(v).toLocaleString() }, { title: 'Rekor 状态', render: (_, record) => <Button type="link" onClick={(event) => { event.stopPropagation(); setSelected(record) }}>查看存证状态</Button> }]} pagination={{ pageSize: 10 }} />
    <Drawer title={`审计存证详情：${selected?.event_type ?? ''}`} width={760} open={!!selected} onClose={() => setSelected(null)} loading={evidence.isLoading}>{evidence.data && <Space direction="vertical" style={{ width: '100%' }} size={16}>{statusTag(evidence.data.status)}<Descriptions bordered size="small" column={1}><Descriptions.Item label="审计流">{selected?.stream_id}</Descriptions.Item><Descriptions.Item label="事件 ID"><Text copyable code>{selected?.event_id}</Text></Descriptions.Item><Descriptions.Item label="本地当前哈希"><Text copyable code>{evidence.data.current_hash}</Text></Descriptions.Item><Descriptions.Item label="前序哈希"><Text copyable code>{evidence.data.previous_hash || '（链首）'}</Text></Descriptions.Item><Descriptions.Item label="Rekor UUID">{evidence.data.anchor?.rekor_uuid ? <Text copyable code>{evidence.data.anchor.rekor_uuid}</Text> : '—'}</Descriptions.Item><Descriptions.Item label="LogIndex">{evidence.data.anchor?.log_index ?? '—'}</Descriptions.Item><Descriptions.Item label="Integrated Time">{evidence.data.anchor?.integrated_time ? new Date(evidence.data.anchor.integrated_time * 1000).toLocaleString() : '—'}</Descriptions.Item></Descriptions><div><Text strong>审计事件原件</Text><div style={{ marginTop: 8 }}><JsonViewer value={evidence.data.event} /></div></div>{evidence.data.anchor?.inclusion_proof && <div><Text strong>Rekor Inclusion Proof / Checkpoint</Text><div style={{ marginTop: 8 }}><JsonViewer value={evidence.data.anchor.inclusion_proof} /></div></div>}{evidence.data.anchor?.checkpoint?.signed_entry_timestamp && <div><Text strong>Signed Entry Timestamp</Text><Text code copyable style={{ display: 'block', marginTop: 8, wordBreak: 'break-all' }}>{evidence.data.anchor.checkpoint.signed_entry_timestamp}</Text></div>}</Space>}</Drawer>
  </Card>
}
