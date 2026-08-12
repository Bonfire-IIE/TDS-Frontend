import { api, ApiResp, TOKEN_KEY } from './client'

export interface PodLogRef {
  namespace: string
  pod_name: string
  container: string
  restart_count: number
}

export interface LogFile {
  /** 节点上的绝对路径，查询时原样回传 */
  path: string
  name: string
  kind: 'component' | 'pod'
  category: string
  size: number
  modified_at: string | null
  rotated: boolean
  compressed: boolean
  pod: PodLogRef | null
}

/** 节点身份 + 日志清单。范围固定为 Kuscia Master 自身，无节点选择。 */
export interface LogFiles {
  domain_id: string
  node_name: string
  run_mode: string
  files: LogFile[]
}

export interface LogTail {
  path: string
  lines: string[]
  requested_lines: number
  truncated: boolean
}

export async function listLogFiles(kind?: string) {
  const { data } = await api.get<ApiResp<LogFiles>>('/logs/files', {
    params: kind && kind !== 'all' ? { kind } : undefined,
  })
  return data.data
}

export async function tailLog(file: string, lines: number, keyword?: string) {
  const { data } = await api.get<ApiResp<LogTail>>('/logs/tail', {
    params: { file, lines, keyword: keyword || undefined },
  })
  return data.data
}

/** 导出需要带 Bearer 头，无法用 <a download> 直链，故取回内容后走 Blob。 */
export async function downloadLog(file: string, lines: number) {
  const { data } = await api.get<string>('/logs/download', {
    params: { file, lines },
    responseType: 'text',
    transformResponse: [(v) => v],
  })
  return data
}

export interface FollowHandlers {
  onLines: (lines: string[]) => void
  onError: (message: string) => void
  onEnd: () => void
}

/**
 * SSE 跟随日志。用 fetch + ReadableStream 而非 EventSource：EventSource 无法自定义
 * 请求头，带不上 Bearer 令牌，改用查询串传令牌会把令牌写进服务端访问日志。
 * 返回值用于主动中止（会一路传导到 KusciaAPI，让节点上的 tail 及时退出）。
 */
export function followLog(
  file: string,
  lines: number,
  keyword: string | undefined,
  handlers: FollowHandlers,
): () => void {
  const controller = new AbortController()
  const qs = new URLSearchParams({ file, lines: String(lines) })
  if (keyword) qs.set('keyword', keyword)
  const token = localStorage.getItem(TOKEN_KEY)

  void (async () => {
    try {
      const resp = await fetch(`/api/v1/logs/stream?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      if (!resp.ok || !resp.body) {
        let detail = `日志流建立失败（HTTP ${resp.status}）`
        try {
          detail = (await resp.json())?.detail ?? detail
        } catch {
          /* 非 JSON 错误体，保留默认文案 */
        }
        handlers.onError(detail)
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE 以空行分隔事件；最后一段可能不完整，留到下一轮
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const raw of events) {
          let event = 'message'
          const dataParts: string[] = []
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataParts.push(line.slice(5).trim())
            // 以 ':' 开头的是心跳注释帧，忽略
          }
          if (!dataParts.length) continue
          const payload = JSON.parse(dataParts.join('\n'))
          if (event === 'error') handlers.onError(payload.message ?? '日志流异常')
          else if (event === 'end') handlers.onEnd()
          else if (payload.lines?.length) handlers.onLines(payload.lines)
        }
      }
      handlers.onEnd()
    } catch (e: any) {
      if (e?.name !== 'AbortError') handlers.onError(e?.message ?? '日志流中断')
    }
  })()

  return () => controller.abort()
}
