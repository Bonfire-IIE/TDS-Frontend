import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert,
  Badge,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Switch,
  Tooltip,
  message,
} from 'antd'
import {
  ClearOutlined,
  CloudServerOutlined,
  DownloadOutlined,
  ReloadOutlined,
  VerticalAlignBottomOutlined,
} from '@ant-design/icons'
import {
  downloadLog,
  followLog,
  listLogFiles,
  tailLog,
  type LogFile,
} from '../api/kusciaLogs'

// 前端缓冲上限：Kuscia 的 kuscia.log/k3s.log 写入极快，无上限会拖垮渲染
const MAX_BUFFERED_LINES = 5000
// 流式追加合并到 state 的节流间隔，避免每批日志触发一次重渲染
const FLUSH_INTERVAL_MS = 400

const CATEGORY_LABELS: Record<string, string> = {
  kuscia: 'Kuscia 主进程',
  kusciaapi: 'KusciaAPI 请求',
  k3s: 'k3s',
  'k3s-audit': 'k3s 审计',
  containerd: 'containerd',
  datamesh: 'DataMesh',
  envoy: 'Envoy 网关',
}

const RUN_MODE_LABELS: Record<string, string> = {
  master: 'Master（中心化控制面）',
  autonomy: 'Autonomy（自治节点）',
  lite: 'Lite',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(1)} ${units[i]}`
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function lineColor(line: string): string | undefined {
  if (/\b(ERROR|FATAL|PANIC)\b/.test(line)) return '#ff4d4f'
  if (/\bWARN(ING)?\b/.test(line)) return '#faad14'
  if (/\bDEBUG\b/.test(line)) return '#8c8c8c'
  return undefined
}

function renderLine(line: string, keyword: string) {
  if (!keyword) return line
  const idx = line.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx < 0) return line
  return (
    <>
      {line.slice(0, idx)}
      <mark style={{ background: '#ffe58f', padding: 0 }}>
        {line.slice(idx, idx + keyword.length)}
      </mark>
      {line.slice(idx + keyword.length)}
    </>
  )
}

function fileLabel(f: LogFile): string {
  const meta = [formatSize(f.size)]
  if (f.compressed) meta.push('已压缩')
  if (f.pod) meta.push(`容器 ${f.pod.container}`, `第 ${f.pod.restart_count} 次启动`)
  const name = f.pod ? `${f.pod.pod_name} / ${f.pod.container}` : f.name
  return `${name}  ·  ${meta.join('  ·  ')}`
}

type KindFilter = 'all' | 'component' | 'pod'

export default function KusciaLogs() {
  const [kind, setKind] = useState<KindFilter>('all')
  const [filePath, setFilePath] = useState<string>()
  const [lines, setLines] = useState(500)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [following, setFollowing] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [buffer, setBuffer] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [streamError, setStreamError] = useState<string>()

  const pending = useRef<string[]>([])
  const stopRef = useRef<(() => void) | null>(null)
  const viewRef = useRef<HTMLDivElement>(null)

  const filesQ = useQuery({
    queryKey: ['log-files', kind],
    queryFn: () => listLogFiles(kind),
  })
  const files = filesQ.data?.files ?? []

  // 默认选中 kuscia.log（排查最常用），否则取第一个仍在写入的文件
  useEffect(() => {
    if (!files.length) return
    if (filePath && files.some((f) => f.path === filePath)) return
    const preferred =
      files.find((f) => f.name === 'kuscia.log') ?? files.find((f) => !f.rotated) ?? files[0]
    setFilePath(preferred.path)
  }, [files, filePath])

  const stopFollow = () => {
    stopRef.current?.()
    stopRef.current = null
  }

  // 切换目标或过滤条件时必须重建流：这些参数在服务端决定了 tail 的对象
  useEffect(() => {
    stopFollow()
    setFollowing(false)
    setStreamError(undefined)
    setBuffer([])
    pending.current = []
  }, [filePath, keyword])

  useEffect(() => () => stopFollow(), [])

  useEffect(() => {
    if (!following) return
    const timer = setInterval(() => {
      if (!pending.current.length) return
      const incoming = pending.current
      pending.current = []
      setBuffer((prev) => {
        const next = prev.concat(incoming)
        return next.length > MAX_BUFFERED_LINES
          ? next.slice(next.length - MAX_BUFFERED_LINES)
          : next
      })
    }, FLUSH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [following])

  useEffect(() => {
    if (autoScroll && viewRef.current) {
      viewRef.current.scrollTop = viewRef.current.scrollHeight
    }
  }, [buffer, autoScroll])

  const selectedFile = useMemo(() => files.find((f) => f.path === filePath), [files, filePath])

  const loadTail = async () => {
    if (!filePath) return
    setLoading(true)
    setStreamError(undefined)
    try {
      const data = await tailLog(filePath, lines, keyword || undefined)
      setBuffer(data.lines)
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? '拉取日志失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleFollow = (next: boolean) => {
    if (!filePath) return
    if (!next) {
      stopFollow()
      setFollowing(false)
      return
    }
    setBuffer([])
    pending.current = []
    setStreamError(undefined)
    setFollowing(true)
    setAutoScroll(true)
    stopRef.current = followLog(filePath, lines, keyword || undefined, {
      onLines: (incoming) => pending.current.push(...incoming),
      onError: (msg) => {
        setStreamError(msg)
        setFollowing(false)
      },
      onEnd: () => setFollowing(false),
    })
  }

  const onDownload = async () => {
    if (!filePath) return
    try {
      const text = await downloadLog(filePath, Math.max(lines, 1000))
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `master-${filePath.split('/').pop()}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      message.error(e.response?.data?.detail ?? '导出失败')
    }
  }

  const fileOptions = useMemo(() => {
    const groups = new Map<string, LogFile[]>()
    for (const f of files) {
      let label: string
      if (f.rotated) label = '历史轮转'
      else if (f.kind === 'pod') label = '任务容器'
      else label = CATEGORY_LABELS[f.category] ?? f.category
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label)!.push(f)
    }
    return [...groups.entries()].map(([label, items]) => ({
      label,
      options: items.map((f) => ({ value: f.path, label: fileLabel(f) })),
    }))
  }, [files])

  const node = filesQ.data

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {filesQ.isError && (
        <Alert
          type="error"
          showIcon
          message="无法获取 Master 日志清单"
          description={
            (filesQ.error as any)?.response?.data?.detail ??
            '请确认 Master 的 KusciaAPI 可达，且其版本已包含节点日志接口。'
          }
        />
      )}

      <Card size="small">
        <Descriptions size="small" column={3} colon={false}>
          <Descriptions.Item label="节点域">{node?.domain_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="运行模式">
            {node ? (RUN_MODE_LABELS[node.run_mode] ?? node.run_mode) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="节点名">{node?.node_name || '-'}</Descriptions.Item>
        </Descriptions>
        <div style={{ color: '#8c8c8c', fontSize: 12 }}>
          日志经 Master 的 KusciaAPI 读取，只包含 Master 自身；各连接器的日志由其所在方在连接器门户查看，平台侧不采集。
        </div>
      </Card>

      <Card
        title={
          <Space>
            <CloudServerOutlined />
            Kuscia Master 日志
            {following ? (
              <Badge status="processing" text="实时跟随中" />
            ) : (
              <Badge status="default" text="已暂停" />
            )}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="重新拉取当前文件尾部">
              <Button
                icon={<ReloadOutlined />}
                onClick={loadTail}
                loading={loading}
                disabled={!filePath || following}
              >
                拉取
              </Button>
            </Tooltip>
            <Button icon={<DownloadOutlined />} onClick={onDownload} disabled={!filePath}>
              导出
            </Button>
            <Button icon={<ClearOutlined />} onClick={() => setBuffer([])}>
              清屏
            </Button>
          </Space>
        }
      >
        <Space wrap size="middle" style={{ marginBottom: 16 }}>
          <Radio.Group
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'all', label: '全部' },
              { value: 'component', label: '节点组件' },
              { value: 'pod', label: '任务容器' },
            ]}
          />
          <Select
            style={{ width: 420 }}
            placeholder="选择日志文件"
            value={filePath}
            onChange={setFilePath}
            loading={filesQ.isLoading}
            options={fileOptions}
            showSearch
            optionFilterProp="label"
            notFoundContent={filesQ.isLoading ? '加载中…' : '该分类下没有日志文件'}
          />
          <Space size={4}>
            尾部行数
            <InputNumber
              min={1}
              max={MAX_BUFFERED_LINES}
              step={100}
              value={lines}
              onChange={(v) => setLines(v ?? 500)}
              style={{ width: 100 }}
            />
          </Space>
          <Input.Search
            allowClear
            style={{ width: 240 }}
            placeholder="关键字过滤（服务端）"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onSearch={(v) => setKeyword(v.trim())}
            enterButton="过滤"
          />
          <Space>
            实时跟随
            <Switch
              checked={following}
              onChange={toggleFollow}
              disabled={!filePath || selectedFile?.compressed}
            />
          </Space>
          <Space>
            <Tooltip title="有新日志时自动滚到底部">
              <VerticalAlignBottomOutlined />
            </Tooltip>
            <Switch size="small" checked={autoScroll} onChange={setAutoScroll} />
          </Space>
        </Space>

        {streamError && (
          <Alert
            type="error"
            showIcon
            closable
            style={{ marginBottom: 12 }}
            message="日志流中断"
            description={streamError}
            onClose={() => setStreamError(undefined)}
          />
        )}

        {selectedFile?.rotated && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              selectedFile.compressed
                ? '这是已压缩的历史轮转文件，内容不再增长，无法实时跟随'
                : '这是历史文件，内容不再增长'
            }
          />
        )}

        <div
          ref={viewRef}
          onScroll={(e) => {
            const el = e.currentTarget
            // 用户往上翻时自动停掉跟随滚动，避免被新日志拽回底部
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            if (!atBottom && autoScroll) setAutoScroll(false)
          }}
          style={{
            height: 'calc(100vh - 420px)',
            minHeight: 320,
            overflow: 'auto',
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: 6,
            padding: '10px 14px',
            fontFamily: 'Menlo, Consolas, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {buffer.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span style={{ color: '#8c8c8c' }}>
                  {filePath ? '暂无内容，点击「拉取」或开启「实时跟随」' : '请选择日志文件'}
                </span>
              }
              style={{ marginTop: 80 }}
            />
          ) : (
            buffer.map((line, i) => (
              <div
                key={i}
                style={{ color: lineColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {renderLine(line, keyword)}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: 12 }}>
          共 {buffer.length} 行
          {buffer.length >= MAX_BUFFERED_LINES &&
            `（已达前端缓冲上限，仅保留最新 ${MAX_BUFFERED_LINES} 行）`}
          {selectedFile &&
            `　·　${selectedFile.path}　·　${formatSize(selectedFile.size)}　·　更新于 ${formatTime(selectedFile.modified_at)}`}
        </div>
      </Card>
    </Space>
  )
}
