import { Link, useSearchParams } from 'react-router-dom'
import BusinessDetails from '../components/BusinessDetails'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Collapse, Button, Card, Descriptions, Drawer, Input, Space, Switch, Table, Tag, Typography } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { drawDiscNodeHover } from 'sigma/rendering'
import type { NodeHoverDrawingFunction } from 'sigma/rendering'
import { getAuditEvidence, listAuditEvents, type AuditEventItem, type AuditEventQuery } from '../api/audit'
import JsonViewer from '../components/JsonViewer'

const { Text } = Typography

type EventVisual = { key: string; label: string; color: string; soft: string; text: string }
const EVENT_VISUALS: EventVisual[] = [
  { key: 'contract', label: '合约', color: '#7c3aed', soft: '#f3e8ff', text: '#6b21a8' },
  { key: 'project', label: '项目/工作流', color: '#2563eb', soft: '#dbeafe', text: '#1d4ed8' },
  { key: 'usage', label: '用途/使用控制', color: '#0891b2', soft: '#cffafe', text: '#0e7490' },
  { key: 'job', label: '任务运行', color: '#ea580c', soft: '#ffedd5', text: '#c2410c' },
]
const OTHER_VISUAL: EventVisual = { key: 'other', label: '其他事件', color: '#64748b', soft: '#f1f5f9', text: '#475569' }
const REVIEW_WARNING: EventVisual = { key: 'review-warning', label: '拒绝/失败', color: '#eab308', soft: '#fef9c3', text: '#854d0e' }

function isReviewWarning(eventType: string) {
  return /(^|\.)(rejected|denied|failed|terminated)$/.test(eventType.toLowerCase())
}

function eventVisual(eventType: string) {
  return EVENT_VISUALS.find((item) => eventType.toLowerCase().startsWith(`${item.key}.`)) ?? OTHER_VISUAL
}

function hashForLabel(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  return hash
}

function EventTag({ eventType }: { eventType: string }) {
  const visual = eventVisual(eventType)
  const warning = isReviewWarning(eventType)
  return <Tag style={{ color: visual.text, background: visual.soft, borderColor: warning ? REVIEW_WARNING.color : visual.color, boxShadow: warning ? `0 0 0 1px ${REVIEW_WARNING.color}` : undefined }}>{warning ? '⚠ ' : ''}{eventType}</Tag>
}

const drawAuditNodeHover: NodeHoverDrawingFunction = (context, data, settings) => {
  if (data.failureBorder) {
    context.beginPath()
    context.arc(data.x, data.y, data.size + 4, 0, Math.PI * 2)
    context.strokeStyle = REVIEW_WARNING.color
    context.lineWidth = 3
    context.stroke()
  }
  // A failure border is a persistent visual marker, not a persistent label.
  // Standard hover information is rendered only while the pointer is present.
  if (data.pointerHovered || !data.failureBorder) drawDiscNodeHover(context, data, settings)
}

interface AuditNetworkProps {
  events: AuditEventItem[]
  selectedId?: string
  focusedStream?: string
  highlightFailures: boolean
  onSelect: (id: string) => void
  onClearFocus: () => void
}

function AuditNetwork({ events, selectedId, focusedStream, highlightFailures, onSelect, onClearFocus }: AuditNetworkProps) {
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()

  useEffect(() => {
    const graph = new Graph()
    const streams = new Map<string, AuditEventItem[]>()
    events.forEach((event) => streams.set(event.stream_id, [...(streams.get(event.stream_id) ?? []), event]))
    Array.from(streams.values()).forEach((chain, group) => chain.sort((a, b) => a.sequence - b.sequence).forEach((event, index) => {
      const visual = eventVisual(event.event_type)
      const warning = isReviewWarning(event.event_type)
      const inFocus = !focusedStream || event.stream_id === focusedStream
      const selected = event.event_id === selectedId
      // Keep a small, stable sample of labels visible when no node is selected.
      // This gives the graph visual anchors without turning it into a wall of text.
      const sampledLabel = !selectedId && hashForLabel(event.event_id) % 5 === 0
      const emphasized = highlightFailures && warning
      graph.addNode(event.event_id, {
        label: `${emphasized ? '⚠ ' : ''}${event.sequence}. ${event.event_type}`,
        x: group * 4 + Math.cos(index) * 2,
        y: group * 3 + Math.sin(index) * 2,
        size: selected ? 15 : emphasized ? 12 : inFocus && focusedStream ? 10 : 9,
        color: inFocus ? visual.color : '#d8dee9',
        stream: event.stream_id,
        forceLabel: selected || sampledLabel,
        highlighted: emphasized,
        failureBorder: emphasized,
        pointerHovered: false,
        zIndex: selected ? 3 : inFocus ? 2 : 1,
      })
      if (index) graph.addEdge(chain[index - 1].event_id, event.event_id, {
        size: inFocus && focusedStream ? 3 : 1.5,
        color: inFocus ? '#91caff' : '#e8ebf0',
        zIndex: inFocus ? 2 : 1,
      })
    }))
    if (graph.order > 1) forceAtlas2.assign(graph, { iterations: 120, settings: forceAtlas2.inferSettings(graph) })
    loadGraph(graph)
  }, [events, focusedStream, highlightFailures, selectedId, loadGraph])

  useEffect(() => {
    const graph = sigma.getGraph()
    return registerEvents({
      clickNode: ({ node }) => onSelect(node),
      clickStage: () => onClearFocus(),
      enterNode: ({ node }) => {
        if (graph.hasNode(node)) {
          graph.setNodeAttribute(node, 'pointerHovered', true)
          sigma.refresh({ partialGraph: { nodes: [node] } })
        }
      },
      leaveNode: ({ node }) => {
        if (graph.hasNode(node)) {
          graph.setNodeAttribute(node, 'pointerHovered', false)
          sigma.refresh({ partialGraph: { nodes: [node] } })
        }
      },
    })
  }, [registerEvents, onClearFocus, onSelect, sigma])
  return null
}

export default function AuditEvents() {
  const [params,setParams]=useSearchParams()
  const [contractInput, setContractInput] = useState(params.get('contract')||'')
  const [projectInput, setProjectInput] = useState(params.get('project')||'')
  const [query, setQuery] = useState<AuditEventQuery>({contract_id:params.get('contract')||undefined,project_id:params.get('project')||undefined})
  const [highlightFailures, setHighlightFailures] = useState(false)
  const [selected, setSelected] = useState<AuditEventItem | null>(null)
  const [focusedStream, setFocusedStream] = useState<string | null>(null)

  const list = useQuery({ queryKey: ['audit-events', query], queryFn: () => listAuditEvents(query) })
  const evidence = useQuery({ queryKey: ['audit-evidence', selected?.event_id], queryFn: () => getAuditEvidence(selected!.event_id), enabled: !!selected })
  const events = list.data ?? []
  const focusedEvents = focusedStream ? events.filter((event) => event.stream_id === focusedStream) : events

  const selectEvent = useCallback((id: string) => {
    const event = events.find((item) => item.event_id === id)
    if (!event) return
    setSelected(event)
    setFocusedStream(event.stream_id)
  }, [events])
  const selectRow = useCallback((event: AuditEventItem) => {
    setSelected(event)
    setFocusedStream(event.stream_id)
  }, [])
  const clearFocus = useCallback(() => {
    setSelected(null)
    setFocusedStream(null)
  }, [])
  const closeEvidence = useCallback(() => setSelected(null), [])

  const applySearch = useCallback(() => {
    setSelected(null)
    setFocusedStream(null)
    setParams({...(contractInput.trim()?{contract:contractInput.trim()}:{}),...(projectInput.trim()?{project:projectInput.trim()}:{})})
    setQuery({
      contract_id: contractInput.trim() || undefined,
      project_id: projectInput.trim() || undefined,
    })
  }, [contractInput, projectInput])
  const resetFilters = useCallback(() => {
    setContractInput('')
    setProjectInput('')
    setQuery({});setParams({})
    clearFocus()
  }, [clearFocus])
  const refreshAll = useCallback(() => {
    clearFocus()
    list.refetch()
  }, [clearFocus, list])

  const streamLabel = useMemo(() => focusedStream?.replace(/^contract:/, '') ?? '', [focusedStream])
  const statusTag = (status: string) => status === 'submitted' ? <Tag color="blue">已提交 Rekor</Tag> : status === 'local_only' ? <Tag color="gold">仅本地存证</Tag> : <Tag color="blue">{status}</Tag>

  return <Card title={<Space><SafetyCertificateOutlined />审计存证</Space>} extra={<Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>}>
    <Card size="small" style={{ marginBottom: 14, background: 'var(--canvas)' }}>
      <Space wrap size={[10, 10]}>
        <Input value={contractInput} onChange={(event) => setContractInput(event.target.value)} onPressEnter={applySearch} allowClear placeholder="按合约号查找存证链" style={{ width: 250 }} />
        <Input value={projectInput} onChange={(event) => setProjectInput(event.target.value)} onPressEnter={applySearch} allowClear placeholder="按项目号查找所属存证链" style={{ width: 250 }} />
        <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>查找</Button>
        <Button onClick={resetFilters}>重置</Button>
        <span><Switch checked={highlightFailures} onChange={setHighlightFailures} /> <Text>高亮失败节点</Text></span>
      </Space>
    </Card>
    <Space wrap size={[8, 8]} style={{ marginBottom: 14 }}>
      {[...EVENT_VISUALS, OTHER_VISUAL, REVIEW_WARNING].map((item) => <span key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, color: item.text, background: item.soft, border: `1px solid ${item.color}55`, fontSize: 12 }}><i style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />{item.label}</span>)}
      {focusedStream && <Tag color="blue">合约链{streamLabel}</Tag>}
    </Space>
    {list.isError && <Alert type="error" message="审计事件加载失败，请重试"/>}
    <Collapse style={{marginBottom:24}} items={[{key:'network',label:'存证关系图 · 按需展开',children:<>    <div style={{ height: 390, border: '1px solid var(--line)', borderRadius: 8, marginBottom: 18, background: 'var(--surface)' }}>
      <SigmaContainer style={{ height: '100%', width: '100%' }} settings={{ renderEdgeLabels: false, labelDensity: 0, labelRenderedSizeThreshold: 1000, defaultDrawNodeHover: drawAuditNodeHover, defaultEdgeType: 'line', zIndex: true }}>
        <AuditNetwork events={events} selectedId={selected?.event_id} focusedStream={focusedStream ?? undefined} highlightFailures={highlightFailures} onSelect={selectEvent} onClearFocus={clearFocus} />
      </SigmaContainer>
    </div>
</>}]} />
    <Table rowKey="event_id" loading={list.isLoading} dataSource={focusedStream ? focusedEvents : events} rowClassName={(record) => record.event_id === selected?.event_id ? 'ant-table-row-selected' : ''} onRow={(record) => ({ onClick: () => selectRow(record), style: { cursor: 'pointer' } })} columns={[
      { title: '事件类型', dataIndex: 'event_type', render: (value) => <EventTag eventType={value} /> },
      { title: '合约号', render: (_, record) => <Text code copyable>{record.contract_id ?? record.stream_id.replace(/^contract:/, '')}</Text> },
      { title: '项目号', dataIndex: 'project_id', render: (value) => value ? <Text code copyable>{value}</Text> : '—' },
      { title: '序号', dataIndex: 'sequence' },
      { title: '当前哈希', dataIndex: 'current_hash', render: (value) => <Text code ellipsis={{ tooltip: value }} style={{ maxWidth: 180, display: 'inline-block' }}>{value}</Text> },
      { title: '发生时间', dataIndex: 'occurred_at', render: (value) => new Date(value).toLocaleString() },
      { title: 'Rekor 状态', render: (_, record) => <Button type="link" onClick={(event) => { event.stopPropagation(); selectRow(record) }}>查看存证状态</Button> },
    ]} pagination={{ pageSize: 10 }} />
    <Drawer title={`审计存证详情：${selected?.event_type ?? ''}`} width={1040} open={!!selected} onClose={closeEvidence} loading={evidence.isLoading}>{evidence.isError&&<Alert type="error" message="存证详情加载失败" action={<Button onClick={()=>evidence.refetch()}>重试</Button>}/>}<Space wrap style={{marginBottom:16}}>{selected?.contract_id&&<Link to={'/contracts/'+encodeURIComponent(selected.contract_id)}>关联合约</Link>}{selected?.project_id&&<Link to={'/privacy-computing/'+selected.project_id}>关联项目</Link>}</Space>{evidence.data && <Space direction="vertical" style={{ width: '100%' }} size={16}>{statusTag(evidence.data.status)}<BusinessDetails bordered size="small" column={1}><Descriptions.Item label="审计流">{selected?.stream_id}</Descriptions.Item><Descriptions.Item label="事件 ID"><Text copyable code>{selected?.event_id}</Text></Descriptions.Item><Descriptions.Item label="本地当前哈希"><Text copyable code>{evidence.data.current_hash}</Text></Descriptions.Item><Descriptions.Item label="前序哈希"><Text copyable code>{evidence.data.previous_hash || '（链首）'}</Text></Descriptions.Item><Descriptions.Item label="Rekor UUID">{evidence.data.anchor?.rekor_uuid ? <Text copyable code>{evidence.data.anchor.rekor_uuid}</Text> : '—'}</Descriptions.Item><Descriptions.Item label="LogIndex">{evidence.data.anchor?.log_index ?? '—'}</Descriptions.Item><Descriptions.Item label="Integrated Time">{evidence.data.anchor?.integrated_time ? new Date(evidence.data.anchor.integrated_time * 1000).toLocaleString() : '—'}</Descriptions.Item></BusinessDetails><Collapse items={[{key:"original",label:"审计事件原件",children:<JsonViewer value={evidence.data.event}/>}]} />{evidence.data.anchor?.inclusion_proof && <div><Text strong>Rekor Inclusion Proof / Checkpoint</Text><div style={{ marginTop: 8 }}><JsonViewer value={evidence.data.anchor.inclusion_proof} /></div></div>}{evidence.data.anchor?.checkpoint?.signed_entry_timestamp && <div><Text strong>Signed Entry Timestamp</Text><Text code copyable style={{ display: 'block', marginTop: 8, wordBreak: 'break-all' }}>{evidence.data.anchor.checkpoint.signed_entry_timestamp}</Text></div>}</Space>}</Drawer>
  </Card>
}
