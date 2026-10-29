import { INDUSTRIES } from '../domain/catalogOptions'
import RouteSurface from '../components/RouteSurface'
import DetailPage from '../components/DetailPage'
import { useDetailRoute } from '../components/useDetailRoute'
import BusinessDetails from '../components/BusinessDetails'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useState } from 'react'
import {
  Alert, Table, Tag, Button, Space, Input, Select, message, Modal, Form,
  Descriptions, Typography,
} from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CatalogItem, searchResources, approveResource, rejectResource, delistResource } from '../api/catalog'
import { useAuth } from '../auth/AuthContext'

const { Text } = Typography

const SEC_LABEL: Record<string, string> = { general_1: '一般数据一级', general_2: '一般数据二级', important: '重要数据' }
const SEC_COLOR: Record<string, string> = { general_1: 'default', general_2: 'blue', important: 'gold' }
const PERSONAL_LABEL: Record<string, string> = { '0': '不涉及', '1': '一般个人信息', '2': '敏感个人信息' }
const SOURCE_LABEL: Record<string, string> = { '01': '原始取得', '02': '收集取得', '03': '交易取得', '04': '共享取得', '05': '其他' }
const QUALITY_LABEL: Record<string, string> = { '01': '高质量', '02': '一般质量', '03': '低质量', '04': '未评估' }


// 平台承载的数据类型；仅 table 为结构化（含列定义）
const DATA_TYPES = [
  { value: 'table', label: '结构化表 (table)' },
  { value: 'image', label: '图像 (image)' },
  { value: 'text', label: '文本 (text)' },
  { value: 'file', label: '文件 (file)' },
  { value: 'other', label: '其他 (other)' },
]
const DATA_TYPE_LABEL: Record<string, string> = Object.fromEntries(DATA_TYPES.map((d) => [d.value, d.label]))
export default function Catalog() {
  const { user } = useAuth()
  const navigate=useNavigate()
  const isOperator = Boolean(user?.roles?.includes('operator'))
  const isSupervisor = user?.roles?.includes('supervisor')
  const isAdmin = Boolean(isOperator || isSupervisor)
  const qc = useQueryClient()

  const [params,setParams]=useSearchParams()
  const [filters, setFilters] = useState<{ q?: string; security_level?: string; industry_code?: string }>({q:params.get('q')||undefined,security_level:params.get('security_level')||undefined,industry_code:params.get('industry_code')||undefined})
  const [applied, setApplied] = useState(filters)
  const [rejecting, setRejecting] = useState<CatalogItem | null>(null)
  const [rejectForm] = Form.useForm()
  const {id:detailId}=useParams()
  const list = useQuery({
    queryKey: ['catalog', detailId ? {} : applied],
    queryFn: () => searchResources(detailId ? {} : applied),
  })
  const [detail, setDetail] = useDetailRoute<CatalogItem>('/catalog', list.data ?? [])
  const approveMut = useMutation({ mutationFn: (id: string) => approveResource(id), onSuccess: () => { message.success('资源投影已审核通过'); qc.invalidateQueries({ queryKey: ['catalog'] }) }, onError: (e: any) => message.error(e.response?.data?.detail ?? '审核失败') })
  const rejectMut = useMutation({ mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectResource(id, comment), onSuccess: () => { message.success('已驳回上架申请'); setRejecting(null); rejectForm.resetFields(); qc.invalidateQueries({ queryKey: ['catalog'] }) }, onError: (e: any) => message.error(e.response?.data?.detail ?? '审核失败') })

  const withdrawMut = useMutation({ mutationFn: delistResource, onSuccess: () => { message.success('已撤回中心资源投影，连接器资源保留'); qc.invalidateQueries({ queryKey: ['catalog'] }) }, onError: (e: any) => message.error(e.response?.data?.detail ?? '撤回失败') })
  const withdraw = (r: CatalogItem) => Modal.confirm({ title: '下架数据资源（撤回中心投影）？', content: '这不是数据产品下架。撤回后不再向中心提供该资源信息，连接器本地资源及原始数据保留。存在产品引用时需先解除引用。', okText: '撤回中心投影', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => withdrawMut.mutateAsync(r.id) })
  const columns = [
    { title: '资源名称', dataIndex: 'name' },
    { title: 'TDS 标识码', dataIndex: 'tds_code', render: (v: string) => <Text copyable code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '归属连接器', dataIndex: 'provider_connector_id', render: (v: string) => <Text code>{v}</Text> },
    { title: '数据类型', dataIndex: 'data_type', render: (v: string) => <Tag>{DATA_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '行业分类', dataIndex: 'industry_code', render: (v: string) => INDUSTRIES.find((item) => item.value === v)?.label || v },
    { title: '安全等级', dataIndex: 'security_level', render: (v: string) => <Tag color={SEC_COLOR[v]}>{SEC_LABEL[v] || v}</Tag> },
    { title: '状态', dataIndex: 'status', render: (s: string) => <Tag color={s === 'published' ? 'green' : s === 'pending_review' ? 'gold' : 'default'}>{s === 'published' ? '已登记至中心' : s === 'pending_review' ? '待审核' : s === 'delisted' ? '已撤回中心投影' : s}</Tag> },
    {
      title: '操作', key: 'action',
      render: (_: any, r: CatalogItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => setDetail(r)}>详情</Button>
          {r.status==='published'&&r.created_by===user?.username&&<Button onClick={()=>navigate('/products/new?resource='+encodeURIComponent(r.id))}>构建数据产品</Button>}
          {r.status === 'pending_review' && isAdmin && <Button type="link" size="small" onClick={() => approveMut.mutate(r.id)}>审核通过</Button>}
          {r.status !== 'delisted' && (isAdmin || r.created_by === user?.username) && <Button type="link" danger loading={withdrawMut.isPending && withdrawMut.variables === r.id} onClick={() => withdraw(r)}>下架资源</Button>}
          {r.status === 'pending_review' && isAdmin && <Button type="link" danger size="small" onClick={() => setRejecting(r)}>驳回</Button>}
        </Space>
      ),
    },
  ]

  return (
    <RouteSurface
      title="数据资源"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Text type="secondary">资源由连接器登记并提交中心审核，仅属主和治理人员可见；对外公开的是数据产品</Text>
        </Space>
      }
    >
      {list.isError && <Alert type="error" showIcon message="数据加载失败，当前列表可能不完整" action={<Button onClick={()=>list.refetch()}>重试</Button>} style={{marginBottom:16}}/>}
      {/* 检索栏 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input value={filters.q} placeholder="按名称搜索" allowClear style={{ width: 200 }}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))} />
        <Select value={filters.security_level} placeholder="安全等级" allowClear style={{ width: 160 }} options={Object.entries(SEC_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(v) => setFilters((f) => ({ ...f, security_level: v }))} />
        <Select value={filters.industry_code} placeholder="行业分类" allowClear showSearch style={{ width: 250 }} options={INDUSTRIES}
          onChange={(v) => setFilters((f) => ({ ...f, industry_code: v }))} />
        <Button type="primary" icon={<SearchOutlined />} onClick={() => {setApplied(filters);setParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v) as [string,string][]))}}>检索</Button>
      </Space>

      <Table rowKey="id" loading={list.isLoading} dataSource={list.data ?? []} columns={columns} pagination={{ pageSize:10,current:Math.max(1,Number(params.get('page'))||1),onChange:page=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(page));return next}) }} />

      <Modal title="驳回资源上架申请" open={!!rejecting} okText="确认驳回" okButtonProps={{ danger: true }}
        confirmLoading={rejectMut.isPending} onCancel={() => { setRejecting(null); rejectForm.resetFields() }} onOk={() => rejectForm.submit()} destroyOnClose>
        <Form form={rejectForm} layout="vertical" onFinish={(values) => rejecting && rejectMut.mutate({ id: rejecting.id, comment: values.comment })}>
          <Form.Item name="comment" label="审核意见" rules={[{ required: true, message: '请填写驳回原因' }]}>
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情 */}
      <DetailPage loading={list.isLoading} error={list.isError} title="资源详情" open={!!detail} onClose={() => setDetail(null)} width={520}>
        {detail && (
          <BusinessDetails column={1} bordered size="small">
            <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="TDS 标识码"><Text copyable code>{detail.tds_code}</Text></Descriptions.Item>
            <Descriptions.Item label="描述">{detail.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="数据类型"><Tag>{DATA_TYPE_LABEL[detail.data_type] ?? detail.data_type}</Tag></Descriptions.Item>
            <Descriptions.Item label="归属连接器">{detail.provider_connector_id}</Descriptions.Item>
            <Descriptions.Item label="关联数据源">
              {detail.datasource_name ? (
                <span>
                  {detail.datasource_name} <Tag>{detail.datasource_type}</Tag>
                  {detail.datasource_uri && <div><Text type="secondary" style={{ fontSize: 12 }}>{detail.datasource_uri}</Text></div>}
                </span>
              ) : detail.datasource_id}
            </Descriptions.Item>
            <Descriptions.Item label="行业分类">{INDUSTRIES.find((item) => item.value === detail.industry_code)?.label || detail.industry_code}</Descriptions.Item>
            <Descriptions.Item label="政务主题分类">{detail.theme_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="资源持有方">{detail.resource_owner_name}（{detail.resource_owner_id}）</Descriptions.Item>
            <Descriptions.Item label="联系人">{detail.contact_name} / {detail.contact_information}</Descriptions.Item>
            <Descriptions.Item label="资源摘要">{detail.resource_abstract}</Descriptions.Item>
            <Descriptions.Item label="资源格式">{detail.resource_format}</Descriptions.Item>
            <Descriptions.Item label="数据来源">{SOURCE_LABEL[detail.source_type || ''] || detail.source_type || '—'}</Descriptions.Item>
            <Descriptions.Item label="更新频率">{detail.update_freq || '—'}</Descriptions.Item>
            <Descriptions.Item label="更新方式">{detail.update_method || '—'}</Descriptions.Item>
            <Descriptions.Item label="个人信息">{PERSONAL_LABEL[detail.personal_information_level] || detail.personal_information_level}</Descriptions.Item>
            <Descriptions.Item label="质量等级">{QUALITY_LABEL[detail.resource_quality || ''] || detail.resource_quality || '—'}</Descriptions.Item>
            <Descriptions.Item label="安全等级"><Tag color={SEC_COLOR[detail.security_level]}>{SEC_LABEL[detail.security_level] || detail.security_level}</Tag></Descriptions.Item>
            <Descriptions.Item label="数据模态">{(detail.data_modalities || []).join('、') || '—'}</Descriptions.Item>
            <Descriptions.Item label="审核意见">{detail.review_comment || '—'}</Descriptions.Item>
            <Descriptions.Item label="标签">{(detail.tags ?? []).map((t) => <Tag key={t}>{t}</Tag>)}</Descriptions.Item>
            <Descriptions.Item label="数据列">
              {(detail.columns ?? []).length
                ? (detail.columns ?? []).map((c: any) => <div key={c.name}><Text code>{c.name}</Text> : {c.type} {c.comment && `（${c.comment}）`}</div>)
                : '—（非结构化数据无列定义）'}
            </Descriptions.Item>
          </BusinessDetails>
        )}
      </DetailPage>
    </RouteSurface>
  )
}
