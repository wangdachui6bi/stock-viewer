export function toCsv(rows: Array<Record<string, any>>, headers?: Array<{ key: string; label: string }>) {
  const cols = headers ?? Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }))

  const escape = (v: any) => {
    const s = v == null ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }

  const lines: string[] = []
  lines.push(cols.map((c) => escape(c.label)).join(','))
  for (const r of rows) {
    lines.push(cols.map((c) => escape(r[c.key])).join(','))
  }
  return lines.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
