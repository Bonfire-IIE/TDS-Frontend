import JsonView from '@uiw/react-json-view'

interface JsonViewerProps {
  value: unknown
  collapsed?: number | boolean
  maxHeight?: number
}

export default function JsonViewer({ value, collapsed = 2, maxHeight = 420 }: JsonViewerProps) {
  const source = value !== null && typeof value === 'object' ? value : { value }

  return (
    <div style={{ maxHeight, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fbfcfe' }}>
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
          ['--w-rjv-color' as string]: '#334155',
          ['--w-rjv-key-string' as string]: '#2563eb',
          ['--w-rjv-string-color' as string]: '#15803d',
          ['--w-rjv-number-color' as string]: '#b45309',
          ['--w-rjv-boolean-color' as string]: '#7c3aed',
          ['--w-rjv-null-color' as string]: '#94a3b8',
        }}
      />
    </div>
  )
}
