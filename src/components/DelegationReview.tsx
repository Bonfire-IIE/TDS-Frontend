import { Alert, Button, Card, Collapse, Descriptions, Table, Tag, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { listComputationServices } from '../api/applicationTemplates'
import { stateLabel } from '../utils/projectDisplay'
import type { ApplicationTemplate } from '../api/applicationTemplates'
import type { Delegation } from '../api/applicationTemplates'
import type { Connector } from '../api/connectors'

type Snapshot = { id: string; version: number; scope: Delegation['scope']; scope_hash: string; contract_hash: string; expires_at: string }
export default function DelegationReview({ workflow, delegations, connectors, loading, error, onRetry, templates=[] }: {
  templates?: ApplicationTemplate[]; workflow: Record<string, any>; delegations: Delegation[]; connectors: Connector[]; loading: boolean; error: boolean; onRetry: () => void
}) {
  const services=useQuery({queryKey:['computation-services'],queryFn:listComputationServices})
  const participantName=(id:string)=>connectors.find(c=>c.id===id)?.name||services.data?.find(c=>c.id===id)?.name
  const versions=templates.flatMap(app=>app.versions.map(version=>({...version,applicationName:app.name})))
  const roleLabel=(name:string)=>name.startsWith('seat:')?`计算服务席位 ${Number(name.slice(5))+1}`:versions.filter(v=>(workflow.nodes||[]).some((n:any)=>n.template_version===v.id)).flatMap(v=>v.definition.roles).find(r=>r.name===name)?.title||'计算参与方'
  const snapshot = workflow.delegation_snapshot as Snapshot | null | undefined
  // Historical versions predate snapshots: identify their delegation by task domains,
  // and explicitly label the result as current records rather than historical evidence.
  const ids = new Set((workflow.nodes ?? []).flatMap((n: any) => (n.parties ?? []).map((p: any) => p.domain_id)))
  const record = snapshot ? delegations.find(d => d.id === snapshot.id) : delegations.find(d => d.scope.participants?.some(p => ids.has(p.connector_id)))
  const scope = snapshot?.scope ?? record?.scope
  const expires = snapshot?.expires_at ?? record?.expires_at
  const expired = !!expires && new Date(expires).getTime() <= Date.now()
  return <Card title="计算委托细节" size="small" loading={loading}>
    {error && <Alert type="error" showIcon message="委托状态加载失败，请重试后核对" action={<Button onClick={onRetry}>重试</Button>} />}
    {!scope ? <Typography.Text type="secondary">此编排版本未关联计算委托。</Typography.Text> : <>
      {!snapshot && <Alert type="info" showIcon message="此历史编排未保存历史委托信息，以下为当前可查的关联委托记录，请核对版本与有效期。" style={{ marginBottom: 12 }} />}
      {(expired || (record && record.status !== 'active')) && <Alert type="warning" showIcon message="关联委托已过期或失效，请重新发出委托并提交编排审核。" style={{ marginBottom: 12 }} />}
      <Descriptions size="small" column={{ xs: 1, sm: 2 }} items={[
        { key: 'version', label: '委托版本', children: `v${snapshot?.version ?? record?.version}` },
        { key: 'status', label: '当前状态', children: <Tag color={!error && !expired && record?.status === 'active' ? 'green' : 'orange'}>{error ? '待核对' : expired ? '已过期' : record?.status === 'active' ? '已生效' : record?.status ? stateLabel(record.status) : '记录不可用'}</Tag> },
        { key: 'expires', label: '有效期至', span: 2, children: expires ? new Date(expires).toLocaleString() : '—' },
        { key: 'mode', label: '委托范围', span: 2, children: scope.mode === 'project-seats' ? '项目计算服务席位' : scope.instances?.map(i=>versions.find(v=>v.id===i.version_id)?.applicationName||'应用名称暂不可用').join('、') },
      ]} />
      <Table size="small" pagination={false} rowKey="connector_id" scroll={{ x: 480 }} dataSource={scope.participants ?? []} columns={[
        { title: '席位 / 角色', render: (_, p) => p.roles.map(roleLabel).join('、') },
        { title: '计算服务方', render: (_, p) => participantName(p.connector_id) || p.connector_name || '服务方名称待补充' },
        { title: '所属机构', render: (_, p) => connectors.find(c => c.id === p.connector_id)?.org_name || services.data?.find(c=>c.id===p.connector_id)?.org_name || p.org_name || '—' },
      ]} />
      <Collapse size="small" ghost items={[{key:"identity",label:"查看委托编号",children:<Typography.Text copyable>{snapshot?.id??record?.id}</Typography.Text>}]}/>
    </>}
  </Card>
}
