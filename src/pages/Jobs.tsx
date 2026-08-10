import { useMemo, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Modal, Form, Input, Select, message,
  Drawer, Descriptions, Typography, Alert, Collapse, Steps,
} from 'antd'
import { PlusOutlined, ReloadOutlined, LoadingOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Job, JobStatus, listJobs, getJob, createJob, refreshJob } from '../api/jobs'
import { listContracts } from '../api/contracts'
import { listProducts, getProduct } from '../api/products'
import { listAppImages } from '../api/appimages'
import { preflightUsage } from '../api/usage'

const { Text } = Typography

const STATUS_TAG: Record<JobStatus, { color: string; text: string; icon?: JSX.Element }> = {
  pending: { color: 'default', text: '等待中' },
  running: { color: 'blue', text: '执行中', icon: <LoadingOutlined spin /> },
  succeeded: { color: 'green', text: '已成功' },
  failed: { color: 'red', text: '已失败' },
}

// 编号缩略（保留前 12 位，可复制）
const shortCode = (v?: string | null) =>
  v ? (v.length > 14 ? `${v.slice(0, 12)}…` : v) : '—'

export default function Jobs() {
  const qc = useQueryClient()

  // 列表：5s 轮询，让 running -> succeeded/failed 自动刷新
  const list = useQuery({ queryKey: ['jobs'], queryFn: listJobs, refetchInterval: 5000 })
  const contracts = useQuery({ queryKey: ['contracts'], queryFn: listContracts })
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const appimages = useQuery({ queryKey: ['appimages'], queryFn: listAppImages })

  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const detail = useQuery({
    queryKey: ['job', detailId],
    queryFn: () => getJob(detailId as string),
    enabled: !!detailId,
    refetchInterval: (query) => query.state.data?.status === 'running' ? 5000 : false,
  })

  // 产品名映射
  const productName = useMemo(() => {
    const m = Object.fromEntries((products.data ?? []).map((p) => [p.id, p.name]))
    return (id?: string | null) => (id ? m[id] ?? id : '')
  }, [products.data])

  // 仅列已备案 (filed) 合约
  const filedContracts = useMemo(
    () => (contracts.data ?? []).filter((c) => c.status === 'filed'),
    [contracts.data],
  )

  // 已注册的应用
  const registeredApps = useMemo(
    () => (appimages.data ?? []).filter((a) => a.status === 'registered'),
    [appimages.data],
  )

  // 表单联动：当前所选合约 -> 对应产品 -> allowed_appimages
  const selectedContractId = Form.useWatch('contract_id', form)
  const selectedAppImage = Form.useWatch('app_image', form)
  const selectedContract = useMemo(
    () => filedContracts.find((c) => c.contract_id === selectedContractId),
    [filedContracts, selectedContractId],
  )
  const productDetail = useQuery({
    queryKey: ['product', selectedContract?.product_id],
    queryFn: () => getProduct(selectedContract!.product_id),
    enabled: !!selectedContract?.product_id,
  })
  const preflight = useQuery({
    queryKey: ['usage-preflight', selectedContractId, selectedAppImage],
    queryFn: () => preflightUsage(selectedContractId, selectedAppImage),
    enabled: !!selectedContractId && !!selectedAppImage && createOpen,
    retry: false,
  })

  // 尽力而为：产品声明了 allowed_appimages 则据此过滤，否则列全部已注册应用
  const appOptions = useMemo(() => {
    const allowed = productDetail.data?.allowed_appimages
    const filtered =
      allowed && allowed.length > 0
        ? registeredApps.filter((a) => allowed.includes(a.name))
        : registeredApps
    return filtered.map((a) => ({ value: a.name, label: a.display_name }))
  }, [registeredApps, productDetail.data])

  const onErr = (e: any) => {
    const detail = e.response?.data?.detail ?? '操作失败'
    message.error(e.response?.status === 403 ? `使用控制拒绝：${detail}` : detail)
  }

  const createMut = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      message.success('作业已发起')
      setCreateOpen(false)
      form.resetFields()
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: onErr,
  })

  const refreshMut = useMutation({
    mutationFn: refreshJob,
    onSuccess: (j) => {
      message.success('状态已刷新')
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['job', j.id] })
    },
    onError: onErr,
  })

  const onFinish = (v: any) => {
    const join_keys = (v.join_keys ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
    createMut.mutate({
      contract_id: v.contract_id,
      app_image: v.app_image,
      input_provider_domaindata_id: v.input_provider_domaindata_id,
      input_consumer_domaindata_id: v.input_consumer_domaindata_id,
      join_keys: join_keys.length > 0 ? join_keys : undefined,
      name: v.name || undefined,
    })
  }

  const statusTag = (s: JobStatus) => {
    const t = STATUS_TAG[s] ?? { color: 'default', text: s }
    return <Tag color={t.color} icon={t.icon}>{t.text}</Tag>
  }

  const columns = [
    { title: '作业名称', dataIndex: 'name', render: (v: string | null) => v || '—' },
    {
      title: '作业编号', dataIndex: 'job_code',
      render: (v: string) => <Text copyable={{ text: v }} code style={{ fontSize: 12 }}>{shortCode(v)}</Text>,
    },
    {
      title: '参与方（供 → 用）', key: 'domains',
      render: (_: any, j: Job) => (
        <Text style={{ fontSize: 13 }}>{j.provider_domain || '—'} → {j.consumer_domain || '—'}</Text>
      ),
    },
    { title: '应用', dataIndex: 'app_image', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '状态', dataIndex: 'status', render: (v: JobStatus) => statusTag(v) },
    { title: '创建时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
    {
      title: '操作', key: 'action',
      render: (_: any, j: Job) => (
        <Space>
          <Button type="link" size="small" onClick={() => setDetailId(j.id)}>详情</Button>
          <Button type="link" size="small" loading={refreshMut.isPending && refreshMut.variables === j.id}
            onClick={() => refreshMut.mutate(j.id)}>刷新</Button>
        </Space>
      ),
    },
  ]

  const j = detail.data

  return (
    <Card
      title="隐私计算作业"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateOpen(true); form.resetFields() }}>发起作业</Button>
        </Space>
      }
    >
      <Table rowKey="id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={{ pageSize: 10 }} />

      {/* 发起作业 */}
      <Modal title="发起隐私计算作业" open={createOpen} width={680} onOk={() => form.submit()}
        onCancel={() => setCreateOpen(false)} confirmLoading={createMut.isPending} destroyOnClose
        okButtonProps={{ disabled: !!selectedAppImage && !preflight.data?.allowed }}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="基于一份已备案 (filed) 的数字合约，选择应用在供/用两连接器间执行一次求交 (PSI)，结果落各方本地（数据不出域）。" />
        <Form form={form} layout="vertical" onFinish={onFinish}
          initialValues={{ input_provider_domaindata_id: 'psi-alice', input_consumer_domaindata_id: 'psi-bob', join_keys: 'id' }}>
          <Form.Item name="contract_id" label="数字合约（仅列已备案）" rules={[{ required: true, message: '请选择合约' }]}>
            <Select
              placeholder="选择一份已备案的数字合约"
              loading={contracts.isLoading}
              onChange={() => form.setFieldValue('app_image', undefined)}
              options={filedContracts.map((c) => ({
                value: c.contract_id,
                label: `${c.name}（${shortCode(c.contract_id)}${c.product_id ? ` · ${productName(c.product_id)}` : ''}）`,
              }))}
              notFoundContent="暂无已备案合约"
            />
          </Form.Item>
          {selectedAppImage && (
            <Alert showIcon style={{ marginBottom: 16 }}
              type={preflight.data?.allowed ? 'success' : preflight.isFetching ? 'info' : 'warning'}
              message={preflight.isFetching ? '正在进行合约可执行性预检…' : preflight.data?.allowed ? '合约允许发起本作业' : '当前合约不能发起本作业'}
              description={preflight.data
                ? <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Text>{preflight.data.reason}；已使用 {preflight.data.used_count} 次，预占 {preflight.data.reserved_count} 次{preflight.data.max_count == null ? '' : `，上限 ${preflight.data.max_count} 次`}</Text>
                    <Collapse ghost defaultActiveKey={preflight.data.allowed ? [] : ['checks']} items={[{
                      key: 'checks', title: preflight.data.allowed ? '查看合约检测明细' : '查看未通过原因',
                      children: <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        {preflight.data.checks.map((check) => <Text key={check.key} type={check.passed ? 'success' : 'danger'}>• {check.passed ? '通过' : '不通过'}：{check.label}（{check.detail}）</Text>)}
                      </Space>,
                    }]} />
                  </Space>
                : (preflight.error as any)?.response?.data?.detail} />
          )}
          <Form.Item name="app_image" label="应用 (AppImage)" rules={[{ required: true, message: '请选择应用' }]}
            extra={productDetail.data?.allowed_appimages?.length ? '已按合约对应产品声明的可用应用过滤' : undefined}>
            <Select
              placeholder={selectedContract ? '选择应用' : '请先选择合约'}
              disabled={!selectedContract}
              loading={appimages.isLoading || productDetail.isFetching}
              options={appOptions}
              notFoundContent="无可用应用"
            />
          </Form.Item>
          <Form.Item name="input_provider_domaindata_id" label="供方输入数据 (DomainData id)" rules={[{ required: true }]}>
            <Input placeholder="供方 DomainData id，如 psi-alice" />
          </Form.Item>
          <Form.Item name="input_consumer_domaindata_id" label="用方输入数据 (DomainData id)" rules={[{ required: true }]}>
            <Input placeholder="用方 DomainData id，如 psi-bob" />
          </Form.Item>
          <Form.Item name="join_keys" label="求交主键 (join_keys，逗号分隔)"
            extra="用于对齐两方数据的字段名，多个以英文逗号分隔">
            <Input placeholder="如：id" />
          </Form.Item>
          <Form.Item name="name" label="备注名称（选填）">
            <Input placeholder="便于识别的作业名称" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情 */}
      <Drawer title={`作业详情：${j?.name || j?.job_code || ''}`} open={!!detailId} width={640}
        onClose={() => setDetailId(null)} loading={detail.isLoading}
        extra={j && <Button icon={<ReloadOutlined />} loading={refreshMut.isPending} onClick={() => refreshMut.mutate(j.id)}>刷新状态</Button>}>
        {j && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="作业名称">{j.name || '—'}</Descriptions.Item>
              <Descriptions.Item label="作业编号"><Text copyable code>{j.job_code}</Text></Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(j.status)}</Descriptions.Item>
              <Descriptions.Item label="所属合约"><Text copyable code style={{ fontSize: 12 }}>{j.contract_id}</Text></Descriptions.Item>
              <Descriptions.Item label="关联产品">{j.product_id ? productName(j.product_id) : '—'}</Descriptions.Item>
              <Descriptions.Item label="应用 (AppImage)"><Text code>{j.app_image}</Text></Descriptions.Item>
              <Descriptions.Item label="发起方连接器 / 域">{j.initiator_connector_id || '—'} / {j.initiator_domain || '—'}</Descriptions.Item>
              <Descriptions.Item label="供方连接器 / 域">{j.provider_connector_id || '—'} / {j.provider_domain || '—'}</Descriptions.Item>
              <Descriptions.Item label="用方连接器 / 域">{j.consumer_connector_id || '—'} / {j.consumer_domain || '—'}</Descriptions.Item>
              <Descriptions.Item label="供方输入数据"><Text code style={{ fontSize: 12 }}>{j.input_provider_domaindata_id}</Text></Descriptions.Item>
              <Descriptions.Item label="用方输入数据"><Text code style={{ fontSize: 12 }}>{j.input_consumer_domaindata_id}</Text></Descriptions.Item>
              <Descriptions.Item label="Kuscia 作业 ID">{j.kuscia_job_id ? <Text copyable code style={{ fontSize: 12 }}>{j.kuscia_job_id}</Text> : '—'}</Descriptions.Item>
              <Descriptions.Item label="结果 DomainData">{j.result_domaindata_id ? <Text code style={{ fontSize: 12 }}>{j.result_domaindata_id}</Text> : '—'}</Descriptions.Item>
              <Descriptions.Item label="发起人">{j.created_by}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(j.created_at).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(j.updated_at).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>执行进度</Text>
              <Steps style={{ marginTop: 12 }} current={j.status === 'pending' ? 0 : j.status === 'running' ? 1 : 2}
                status={j.status === 'failed' ? 'error' : 'process'}
                items={[{ title: '已提交' }, { title: 'Kuscia 执行中' }, { title: j.status === 'failed' ? '执行失败' : '执行完成' }]} />
              <Text type="secondary" style={{ fontSize: 12 }}>页面会自动刷新运行中的作业状态；当前系统暂未接入 Kuscia 容器 stdout 日志。</Text>
            </div>

            {j.status === 'succeeded' && (
              <Alert type="success" showIcon message="作业已成功"
                description={
                  <div style={{ fontSize: 13 }}>
                    {j.result_uri && <div>结果位置：<Text code>{j.result_uri}</Text></div>}
                    <div style={{ marginTop: 4 }}>结果已落各参与方本地（数据不出域）。</div>
                  </div>
                } />
            )}
            {j.status === 'failed' && (
              <Alert type="error" showIcon message="作业执行失败"
                description={<Space direction="vertical" size={4}>
                  <Text strong>{j.failure_info?.message || j.error || '未知错误'}</Text>
                  {j.failure_info && <>
                    <Text type="secondary">失败阶段：{j.failure_info.stage || '—'}；来源：{j.failure_info.source || '—'}；责任域：{j.failure_info.domain_id || 'Kuscia Master'}</Text>
                    <Text type="secondary">错误码：{j.failure_info.code || '—'}；可重试：{j.failure_info.retryable ? '是' : '否'}</Text>
                    <Text type="secondary">{j.failure_info.detail_scope}</Text>
                  </>}
                </Space>} />
            )}
          </Space>
        )}
      </Drawer>
    </Card>
  )
}
