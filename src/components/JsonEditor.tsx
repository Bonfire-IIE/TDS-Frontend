import { Button, Input, Space, message } from 'antd'
import { useEffect, useState } from 'react'

export default function JsonEditor({ value, onChange, rows = 8, placeholder }: { value?: unknown; onChange: (value: string) => void; rows?: number; placeholder?: string }) {
  const [text, setText] = useState(() => typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2))
  useEffect(() => { if (typeof value !== 'undefined' && typeof value !== 'string') setText(JSON.stringify(value, null, 2)) }, [value])
  const format = () => { try { setText(JSON.stringify(JSON.parse(text), null, 2)); onChange(text) } catch (e: any) { message.error(`JSON 格式错误：${e.message}`) } }
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Input.TextArea value={text} rows={rows} placeholder={placeholder} style={{ fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace', fontSize: 12 }} onChange={(e) => { setText(e.target.value); onChange(e.target.value) }} />
    <Button size="small" onClick={format}>格式化 JSON</Button>
  </Space>
}
