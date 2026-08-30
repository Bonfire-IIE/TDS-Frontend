import { Card, Table, Tag, Typography, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { listUsageRecords, UsageRecord } from '../api/usage'

const { Text } = Typography

const DECISION: Record<string, { color: string; text: string }> = {
  allowed: { color: 'blue', text: '允许' },
  denied: { color: 'red', text: '禁止策略拒绝' },
  default_deny: { color: 'red', text: '默认拒绝' },
}
const LIFECYCLE: Record<string, { color: string; text: string }> = {
  decided: { color: 'default', text: '已决策' },
  reserved: { color: 'blue', text: '已预占' },
  consumed: { color: 'blue', text: '已消费' },
  released: { color: 'default', text: '已释放' },
}

export default function UsageRecords() {
  const query = useQuery({ queryKey: ['usage-records'], queryFn: () => listUsageRecords() })
  const columns = [
    { title: '时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    { title: '合约', dataIndex: 'contract_id', render: (v: string) => <Text copyable={{ text: v }} code>{v.slice(0, 14)}…</Text> },
    { title: '操作', dataIndex: 'action', render: (v: string) => <Text code>{v}</Text> },
    { title: '执行环境', key: 'env', render: (_: unknown, r: UsageRecord) => r.context?.exec_env ?? '—' },
    { title: '计数快照', key: 'count', render: (_: unknown, r: UsageRecord) => r.context?.used_count ?? 0 },
    { title: '决策', dataIndex: 'decision', render: (v: string) => <Tag color={DECISION[v]?.color}>{DECISION[v]?.text ?? v}</Tag> },
    { title: '生命周期', dataIndex: 'lifecycle', render: (v: string) => <Tag color={LIFECYCLE[v]?.color}>{LIFECYCLE[v]?.text ?? v}</Tag> },
    { title: '原因', dataIndex: 'reason', ellipsis: true },
    { title: '作业', dataIndex: 'job_id', render: (v: string | null) => v ? <Text copyable={{ text: v }} code>{v.slice(0, 8)}…</Text> : '—' },
  ]
  return (
    <Card title="使用控制记录" extra={<Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>}>
      <Table rowKey="id" loading={query.isLoading} dataSource={query.data ?? []} columns={columns} scroll={{ x: 1100 }} />
    </Card>
  )
}
