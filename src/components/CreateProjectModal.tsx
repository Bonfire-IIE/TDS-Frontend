import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Spin, Tag, Typography } from 'antd'
import { CheckCircleFilled, FileProtectOutlined, SearchOutlined } from '@ant-design/icons'
import type { Contract } from '../api/contracts'

type ProjectInput = { name: string; description?: string; contract_id: string }
type Props = {
  open: boolean; contracts: Contract[]; loading: boolean; error: boolean; pending: boolean
  initialContractId?: string; onCancel: () => void; onRetry: () => void; onCreate: (body: ProjectInput) => void
}

export default function CreateProjectModal(props: Props) {
  const [form] = Form.useForm<ProjectInput>()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const eligible = useMemo(() => props.contracts.filter(c => c.document?.contractInfo?.contractStatus === 'filed'), [props.contracts])
  useEffect(() => {
    if (props.open) { setQuery(''); setSelectedId(props.initialContractId); form.resetFields() }
  }, [props.open, props.initialContractId, form])
  const selected = eligible.find(c => c.contract_id === selectedId)
  const filtered = eligible.filter(c => {
    const info = c.document.contractInfo
    return [c.contract_id, info.contractName, ...info.signatoryEntities.map(p => `${p.signatoryEntityName} ${p.signatoryEntityId}`), ...c.document.contractPolicies.map(p => p.subjectInfo.dataProductName)]
      .join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  })
  const info = selected?.document.contractInfo
  const products = [...new Set(selected?.document.contractPolicies.map(p => p.subjectInfo.dataProductName).filter(Boolean))]
  const outsourcing = (info?.expansionItem?.computationOutsourcing as { allowed?: boolean } | undefined)?.allowed === true
  return <Modal className="project-create-modal" title={<div className="project-create-title"><FileProtectOutlined /><div>创建计算项目<small>选择备案合约，开启一次计算协作</small></div></div>}
    width={1100} open={props.open} onCancel={props.onCancel} confirmLoading={props.pending}
    okText="创建项目" cancelText="取消" okButtonProps={{ disabled: !selected || props.loading || props.error }} onOk={() => form.submit()}>
    <div className="project-create-grid">
      <section className="project-contract-picker" aria-label="选择备案合约">
        <div className="project-create-section-heading"><strong>选择合约</strong><span>{eligible.length} 份已备案</span></div>
        <Input prefix={<SearchOutlined />} aria-label="检索合约" placeholder="检索合约名称、合约号、参与方或产品" allowClear value={query} onChange={e => setQuery(e.target.value)} />
        <div className="project-contract-list" aria-label="可选合约列表" aria-busy={props.loading}>
          {props.loading ? <div className="project-contract-empty"><Spin tip="正在加载合约" /></div> : props.error ? <Alert type="error" showIcon message="合约加载失败" action={<Button size="small" onClick={props.onRetry}>重试</Button>} /> : filtered.length ? filtered.map(c => {
            const ci = c.document.contractInfo
            return <button type="button" key={c.contract_id} className={`project-contract-option${selectedId === c.contract_id ? ' selected' : ''}`} aria-pressed={selectedId === c.contract_id} onClick={() => setSelectedId(c.contract_id)}>
              <div className="project-contract-option-heading"><strong>{ci.contractName || '未命名合约'}</strong>{selectedId === c.contract_id ? <CheckCircleFilled /> : <span className="project-contract-radio" />}</div>
              <span className="project-contract-id-label">合约号</span><span className="project-contract-id">{c.contract_id}</span>
              <span className="project-contract-parties">{ci.signatoryEntities.map(p => p.signatoryEntityName).join(' · ') || '未登记参与方'}</span>
            </button>
          }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? '没有匹配的合约，请尝试其他关键词' : '暂无已备案合约'} />}
        </div>
        <p className="project-create-note">仅展示已备案合约，请确认合约及参与方后创建项目。</p>
      </section>
      <section className="project-create-details" aria-label="合约详情与项目信息">
        <div className="project-create-section-heading"><strong>合约确认</strong>{selected && <Tag color="green">已备案</Tag>}</div>
        {info && selected ? <div className="project-selected-contract">
          <h3>{info.contractName || '未命名合约'}</h3>
          <div className="project-contract-id-label">完整合约号</div><Typography.Text className="project-contract-id" copyable={{ text: selected.contract_id }}>{selected.contract_id}</Typography.Text>
          <dl><dt>参与方</dt><dd>{info.signatoryEntities.map(p => p.signatoryEntityName).join(' · ') || '—'}</dd>
            <dt>数据产品</dt><dd>{products.join('、') || '—'}</dd>
            <dt>有效期</dt><dd>{info.indate?.activationTime?.slice(0, 10) || '—'} 至 {info.indate?.endTime?.slice(0, 10) || '—'}</dd>
            <dt>外包计算</dt><dd>{outsourcing ? '允许，需项目计算委托' : '未允许'}</dd></dl>
        </div> : <div className="project-contract-placeholder"><FileProtectOutlined /><strong>选择一份合约</strong><span>在左侧检索并选择，核对完整合约信息</span></div>}
        {props.initialContractId && !selected && !props.loading && <Alert type="warning" message="请重新选择一份可用的已备案合约" showIcon />}
        <Form form={form} layout="vertical" onFinish={values => { if (selected) props.onCreate({ ...values, contract_id: selected.contract_id }) }} requiredMark="optional">
          <div className="project-create-section-heading"><strong>项目信息</strong></div>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, whitespace: true, message: '请输入项目名称' }, { max: 255, message: '项目名称不能超过 255 个字符' }]}><Input placeholder="为本次计算协作命名" maxLength={255} /></Form.Item>
          <Form.Item name="description" label="项目说明"><Input.TextArea placeholder="说明计算目标或协作背景（选填）" rows={3} /></Form.Item>
        </Form>
      </section>
    </div>
  </Modal>
}
