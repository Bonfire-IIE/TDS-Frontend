import JsonView from '@uiw/react-json-view'

interface JsonViewerProps {
  value: unknown
  collapsed?: number | boolean
  maxHeight?: number
}

export default function JsonViewer({ value, collapsed = 2, maxHeight = 420 }: JsonViewerProps) {
  const source = value !== null && typeof value === 'object' ? value : { value }

  return (
    <div style={{ maxHeight, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--canvas)' }}>
      <JsonView
        value={source as object}
        collapsed={collapsed}
        displayDataTypes={false}
        enableClipboard
        style={{
          padding: 12,
          fontSize: 12,
          lineHeight: 1.65,
          fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, monospace',
          backgroundColor: 'transparent',
          ['--w-rjv-color' as string]: 'var(--text)',
          ['--w-rjv-key-string' as string]: 'var(--accent)',
          ['--w-rjv-string-color' as string]: 'var(--success)',
          ['--w-rjv-number-color' as string]: 'var(--accent)',
          ['--w-rjv-boolean-color' as string]: 'var(--accent)',
          ['--w-rjv-null-color' as string]: 'var(--muted)',
        }}
      />
    </div>
  )
}
