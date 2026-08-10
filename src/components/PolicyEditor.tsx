import { Button, Card, DatePicker, InputNumber, Select, Space, Tag, Typography, Empty } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { Policy } from '../api/products'

const { Text } = Typography
const { RangePicker } = DatePicker

// 操作词表（10项）
export const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'transform', label: '转换' },
  { value: 'access', label: '访问' },
  { value: 'read', label: '读取' },
  { value: 'reproduce', label: '复制' },
  { value: 'storage', label: '存储' },
  { value: 'download', label: '下载' },
  { value: 'process', label: '加工' },
  { value: 'jointDevelop', label: '联合开发' },
  { value: 'export', label: '导出' },
  { value: 'grantUse', label: '授权使用' },
]

export const ACTION_LABELS: Record<string, string> = Object.fromEntries(
  ACTION_OPTIONS.map((o) => [o.value, o.label]),
)

export const EXEC_ENV_OPTIONS: { value: string; label: string }[] = [
  { value: 'mpc', label: '安全多方计算(MPC)' },
  { value: 'sandbox', label: '沙箱' },
  { value: 'tee', label: '可信执行环境(TEE)' },
  { value: 'plain', label: '明文' },
]

export const EXEC_ENV_LABELS: Record<string, string> = Object.fromEntries(
  EXEC_ENV_OPTIONS.map((o) => [o.value, o.label]),
)

const TYPE_OPTIONS = [
  { value: 'allow', label: '允许' },
  { value: 'prohibit', label: '禁止' },
]

export function emptyPolicy(): Policy {
  return { type: 'allow', actions: [], constraints: { time_window: null, count: null, exec_env: null } }
}

interface Props {
  value?: Policy[]
  onChange?: (v: Policy[]) => void
}

// 受控策略编辑器：可增删策略行；每行 type + actions 多选 + 约束
export default function PolicyEditor({ value = [], onChange }: Props) {
  const update = (next: Policy[]) => onChange?.(next)

  const patch = (idx: number, p: Partial<Policy>) => {
    update(value.map((row, i) => (i === idx ? { ...row, ...p } : row)))
  }
  const patchConstraint = (idx: number, c: Partial<Policy['constraints']>) => {
    update(
      value.map((row, i) =>
        i === idx ? { ...row, constraints: { ...row.constraints, ...c } } : row,
      ),
    )
  }
  const add = () => update([...value, emptyPolicy()])
  const remove = (idx: number) => update(value.filter((_, i) => i !== idx))

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {value.length === 0 && <Empty description="暂无策略，点击下方添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      {value.map((row, idx) => {
        const tw = row.constraints?.time_window
        return (
          <Card key={idx} size="small" style={{ background: '#fafafa' }}
            extra={<Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(idx)} />}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Space wrap>
                <Select
                  style={{ width: 90 }}
                  value={row.type}
                  options={TYPE_OPTIONS}
                  onChange={(v) => patch(idx, { type: v as Policy['type'] })}
                />
                <Select
                  mode="multiple"
                  style={{ minWidth: 320 }}
                  placeholder="选择操作（可多选）"
                  value={row.actions}
                  options={ACTION_OPTIONS}
                  onChange={(v) => patch(idx, { actions: v })}
                />
              </Space>
              <Space wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>约束</Text>
                <RangePicker
                  showTime
                  placeholder={['生效', '失效']}
                  value={tw ? [dayjs(tw.from), dayjs(tw.to)] : null}
                  onChange={(v) =>
                    patchConstraint(idx, {
                      time_window:
                        v && v[0] && v[1]
                          ? { from: v[0].toISOString(), to: v[1].toISOString() }
                          : null,
                    })
                  }
                />
                <InputNumber
                  min={1}
                  placeholder="次数上限"
                  value={row.constraints?.count ?? undefined}
                  onChange={(v) => patchConstraint(idx, { count: v ?? null })}
                />
                <Select
                  allowClear
                  style={{ width: 200 }}
                  placeholder="执行环境"
                  value={row.constraints?.exec_env ?? undefined}
                  options={EXEC_ENV_OPTIONS}
                  onChange={(v) => patchConstraint(idx, { exec_env: (v as Policy['constraints']['exec_env']) ?? null })}
                />
              </Space>
            </Space>
          </Card>
        )
      })}
      <Button type="dashed" block icon={<PlusOutlined />} onClick={add}>添加策略</Button>
    </Space>
  )
}

// 只读策略视图（合约详情复用）
export function PolicyView({ policies }: { policies: Policy[] }) {
  if (!policies || policies.length === 0) return <Empty description="无策略" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {policies.map((p, idx) => {
        const tw = p.constraints?.time_window
        return (
          <Card key={idx} size="small" style={{ background: '#fafafa' }}>
            <Space wrap>
              <Tag color={p.type === 'allow' ? 'green' : 'red'}>{p.type === 'allow' ? '允许' : '禁止'}</Tag>
              {p.actions.map((a) => <Tag key={a}>{ACTION_LABELS[a] ?? a}</Tag>)}
            </Space>
            <div style={{ marginTop: 6, fontSize: 12, color: '#888' }}>
              {tw && <span>时间窗口：{dayjs(tw.from).format('YYYY-MM-DD HH:mm')} ~ {dayjs(tw.to).format('YYYY-MM-DD HH:mm')}　</span>}
              {p.constraints?.count != null && <span>次数上限：{p.constraints.count}　</span>}
              {p.constraints?.exec_env && <span>执行环境：{EXEC_ENV_LABELS[p.constraints.exec_env] ?? p.constraints.exec_env}</span>}
              {!tw && p.constraints?.count == null && !p.constraints?.exec_env && <span>无约束</span>}
            </div>
          </Card>
        )
      })}
    </Space>
  )
}
