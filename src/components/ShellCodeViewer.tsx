interface ShellCodeViewerProps {
  code: string
  maxHeight?: number
}

function ShellLine({ line }: { line: string }) {
  if (line.trimStart().startsWith('#')) return <span style={{ color: '#7f8c98' }}>{line || ' '}</span>
  const parts = line.split(/("[^"]*"|'[^']*'|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\b(?:export|docker|chmod|mkdir|test|ls)\b)/g)
  return <>{parts.map((part, index) => {
    const color = /^['"]/.test(part) ? '#a5d6a7'
      : /^\$/.test(part) ? '#82aaff'
        : /^(export|docker|chmod|mkdir|test|ls)$/.test(part) ? '#c792ea'
          : '#d6deeb'
    return <span key={index} style={{ color }}>{part}</span>
  })}</>
}

export default function ShellCodeViewer({ code, maxHeight = 420 }: ShellCodeViewerProps) {
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <div style={{ border: '1px solid #273444', borderRadius: 8, overflow: 'hidden', background: '#0f172a' }}>
      <div style={{ height: 34, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#94a3b8', background: '#182235', borderBottom: '1px solid #273444', fontSize: 12 }}>
        <span>Shell</span>
        <span>deploy-kuscia-master.sh</span>
      </div>
      <div style={{ maxHeight, overflow: 'auto', padding: '12px 0', fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, Liberation Mono, monospace', fontSize: 13, lineHeight: 1.65 }}>
        {lines.map((line, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '52px minmax(max-content, 1fr)', minHeight: 22 }}>
            <span style={{ paddingRight: 14, color: '#526177', textAlign: 'right', userSelect: 'none', borderRight: '1px solid #243047' }}>{index + 1}</span>
            <code style={{ padding: '0 16px', whiteSpace: 'pre' }}><ShellLine line={line} /></code>
          </div>
        ))}
      </div>
    </div>
  )
}
