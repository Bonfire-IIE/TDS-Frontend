import type { Contract } from '../api/contracts'

const esc = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function exportContractPdf(contract: Contract, productName: string, _connectorName: (id: string) => string) {
  const win = window.open('', '_blank')
  if (!win) throw new Error('浏览器阻止了导出窗口，请允许本站打开弹窗')
  win.opener = null
  const policyRows = contract.document.contractPolicies.map((p, i) => `<tr><td>${i + 1}</td><td>${p.policyType === 'permission' ? '允许' : p.policyType === 'prohibition' ? '禁止' : '义务'}</td><td>${esc(p.actions.join('、'))}</td><td><pre>${esc(JSON.stringify(p.constraints ?? {}, null, 2))}</pre></td></tr>`).join('')
  const partyRows = contract.document.contractInfo.signatoryEntities.map(p => {
    const signature = contract.document.contractInfo.signatureList.find(s => s.signatoryEntityId === p.signatoryEntityId)
    return `<tr><td>${esc(p.signatoryType)}</td><td>${esc(p.signatoryEntityName)}</td><td>${signature ? '已签署' : '未签署'}</td><td>${esc(signature?.signatoryTime)}</td></tr>`
  }).join('')
  const historyRows = contract.versions.map(h => `<tr><td>${h.version}</td><td>${esc(h.operation)}</td><td>${esc(h.createdBy)}</td><td>${esc(h.createdAt)}</td></tr>`).join('')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(contract.document.contractInfo.contractName)}</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:#1f2937;font-size:12px;line-height:1.55}h1{text-align:center;font-size:24px;margin:8px 0 2px}h2{font-size:15px;border-left:4px solid #c2410c;padding-left:8px;margin-top:24px}.subtitle{text-align:center;color:#64748b;margin-bottom:24px}.meta{display:grid;grid-template-columns:140px 1fr;border:1px solid #cbd5e1}.meta div{padding:7px 10px;border-bottom:1px solid #e2e8f0}.meta .label{background:#f8fafc;font-weight:600}.meta div:nth-last-child(-n+2){border-bottom:0}table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9}pre{white-space:pre-wrap;margin:0;font-size:10px}.hash{word-break:break-all;font-family:monospace}.footer{margin-top:30px;padding-top:10px;border-top:1px solid #cbd5e1;color:#64748b;text-align:center}@media print{button{display:none}}
  </style></head><body><h1>Bonfire-TDS 数字合约</h1><div class="subtitle">可信数据空间数字合约导出件</div>
  <h2>合约基本信息</h2><div class="meta"><div class="label">合约名称</div><div>${esc(contract.document.contractInfo.contractName)}</div><div class="label">合约编号</div><div>${esc(contract.contract_id)}</div><div class="label">绑定数据产品</div><div>${esc(productName)}</div><div class="label">交易模式 / 状态</div><div>${esc(contract.document.contractInfo.signMode)} / ${esc(contract.document.contractInfo.contractStatus)}</div><div class="label">摘要</div><div>${esc(contract.document.contractInfo.contractAbstract)}</div><div class="label">使用目的</div><div>${esc(contract.document.contractInfo.contractAbstract)}</div><div class="label">供数方</div><div>${esc(contract.document.contractInfo.signatoryEntities.filter(e=>e.signatoryType==='provider').map(e=>e.signatoryEntityName).join('、'))}</div><div class="label">用数方</div><div>${esc(contract.document.contractInfo.signatoryEntities.filter(e=>e.signatoryType==='consumer').map(e=>e.signatoryEntityName).join('、'))}</div></div>
  <h2>合约策略</h2><table><thead><tr><th>#</th><th>类型</th><th>操作</th><th>约束</th></tr></thead><tbody>${policyRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table>
  <h2>签署信息</h2><table><thead><tr><th>角色</th><th>主体</th><th>状态</th><th>时间</th></tr></thead><tbody>${partyRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table>
  <h2>协商记录</h2><table><thead><tr><th>轮次</th><th>操作</th><th>操作人</th><th>时间</th></tr></thead><tbody>${historyRows || '<tr><td colspan="4">无</td></tr>'}</tbody></table>
  <h2>备案信息</h2><div class="hash">合约哈希：${esc(contract.document_hash)}</div><div class="footer">导出时间：${esc(new Date().toLocaleString())}</div><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`)
  win.document.close()
}
