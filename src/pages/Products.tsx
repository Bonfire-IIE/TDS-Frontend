import { INDUSTRIES } from '../domain/catalogOptions'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEditorRoute } from '../components/useEditorRoute'
import EditorPage from '../components/EditorPage'
import { useListState } from '../components/useListState'
import RouteSurface from '../components/RouteSurface'
import DetailPage from '../components/DetailPage'
import { Steps, InputNumber, Tabs } from 'antd'
import { useDetailRoute } from '../components/useDetailRoute'
import BusinessDetails from '../components/BusinessDetails'
import ComputationOutsourcingFields from '../components/ComputationOutsourcingFields'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Card, Tag, Button, Space, Modal, Form, Input, Select, message, Popconfirm, Typography, Alert,
  Descriptions, Empty,
} from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Product, publishProduct, ProductPublish, listProducts, listProduct, updateProduct, delistProduct, deleteProduct, Policy,
} from '../api/products'
import { requestContract } from '../api/contracts'
import { searchResources } from '../api/catalog'
import { listConnectors } from '../api/connectors'
import { listContractTemplates } from '../api/contractTemplates'
import { useAuth } from '../auth/AuthContext'
import PolicyEditor, { PolicyView, emptyPolicy } from '../components/PolicyEditor'

import { deriveProductMetadata, inheritedPatch, sharedMetadataLabels } from '../domain/productMetadata'

const { Text, Paragraph } = Typography

const MODE_TAG: Record<string, { color: string; text: string }> = {
  accept: { color: 'blue', text: '提案-接受' },
  negotiate: { color: 'default', text: '提案-修订' },
}
const STATUS_TAG: Record<string, { color: string; text: string }> = {
  registered: {color:"default",text:"已登记·待上架"},
  draft: { color: 'default', text: '草稿' },
  listed: { color: 'blue', text: '已上架' },
  delisted: { color: 'default', text: '已下架' },
}

const PRODUCT_TYPES = [
  { value: '01', label: '数据集' }, { value: '02', label: 'API产品' },
  { value: '03', label: '数据应用' }, { value: '04', label: '数据报告' },
  { value: '05', label: '数字对象' }, { value: '06', label: '其他' },
]
const DELIVERY_METHODS = [
  { value: '01', label: '文件传输' }, { value: '02', label: '数据流传输' },
  { value: '03', label: 'API传输' }, { value: '04', label: '其他' },
]
const DATA_SUBJECT_TYPES = [
  { value: '01', label: '个人信息' }, { value: '02', label: '企业数据' }, { value: '03', label: '公共数据' },
]
const PERSONAL_LEVELS = [
  { value: '0', label: '不涉及' }, { value: '1', label: '一般个人信息' }, { value: '2', label: '敏感个人信息' },
]
const PROVIDER_TYPES = [
  { value: '01', label: '自然人' }, { value: '02', label: '法人' }, { value: '03', label: '非法人组织' },
]

export default function Products() {
  const { user } = useAuth()
  const navigate=useNavigate();const [searchParams]=useSearchParams()
  const [productStep,setProductStep]=useState(0)
  const [publishTarget,setPublishTarget]=useState<Product|null>(null)
  const [publishForm]=Form.useForm<ProductPublish>()
  const isOperator = user?.roles?.includes('operator')
  const isSupervisor = user?.roles?.includes('supervisor')
  const isAdmin = isOperator || isSupervisor
  const qc = useQueryClient()

  const list = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const resources = useQuery({ queryKey: ['catalog', {}], queryFn: () => searchResources({}) })
  const connectors = useQuery({ queryKey: ['connectors'], queryFn: listConnectors })
  const templates = useQuery({ queryKey: ['contract-templates'], queryFn: listContractTemplates })

  const [createOpen, setCreateOpen,editorId] = useEditorRoute('/products')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [useTarget, setUseTarget] = useState<Product | null>(null)
  const [applyTarget, setApplyTarget] = useState<Product | null>(null)
  const [detailTarget, setDetailTarget] = useDetailRoute<Product>('/products', list.data ?? [])
  const [viewState,setViewState]=useListState({view:'discover'})
  const view=viewState.view;const setView=(view:string)=>setViewState({view})
  const [filters, setFilters] = useListState({ name: '', domain: '', mode: '' })
  const [createForm] = Form.useForm()
  const editedMetadata = useRef(new Set<string>())
  useEffect(() => { editedMetadata.current = new Set(editorId ? Object.keys(sharedMetadataLabels) : []) }, [createOpen, editorId])
  const [useForm] = Form.useForm()
  const [applyForm] = Form.useForm()

  useEffect(()=>{
    if(!createOpen)return
    if(!editorId){setEditingProduct(null);return}
    const product=list.data?.find(p=>p.id===editorId)
    if(product&&editingProduct?.id!==product.id){setEditingProduct(product);createForm.setFieldsValue({...product,resource_ids:product.resource_ids||[],baseline_policies:product.baseline_policies||[]})}
  },[createOpen,editorId,list.data,editingProduct?.id,createForm])
  useEffect(()=>{if(createOpen)setProductStep(editorId?1:0)},[createOpen,editorId])
  // 产品只能引用中心已审核上架的资源。
  const myResources = useMemo(
    () => (resources.data ?? []).filter((r) => r.status === 'published' && r.created_by === (editingProduct?.created_by || user?.username)),
    [resources.data, editingProduct?.created_by, user?.username],
  )
  const sourceIds: string[]=Form.useWatch('resource_ids',createForm)||[]
  const selectedResources=myResources.filter(r=>sourceIds.includes(r.id))
  const metadata = deriveProductMetadata(selectedResources)
  const chooseResources=(ids:string[])=>{
    const derived=deriveProductMetadata(myResources.filter(r=>ids.includes(r.id)))
    createForm.setFieldsValue({resource_ids:ids,...inheritedPatch(derived.values,editedMetadata.current)})
  }
  useEffect(()=>{
    const source=searchParams.get('resource')
    if(createOpen&&!editorId&&source&&myResources.some(r=>r.id===source)&&!createForm.getFieldValue('resource_ids')?.length)chooseResources([source])
  },[createOpen,editorId,resources.data])
  // 合约申请依赖已审批的业务连接器，不依赖任何具体执行系统在线。
  // approved 是后端无法取得实时状态时可能保留的存储态；正常情况下
  // 已签发或已激活的连接器可以承载产品；执行能力在具体作业提交时单独校验。
  const usableConnectors = (connectors.data ?? []).filter((c) => ['approved', 'active'].includes(c.status))
  const filteredProducts = useMemo(() => (list.data ?? []).filter((p) =>
    (view === 'mine' ? p.created_by === user?.username : p.status === 'listed')
    && (!filters.name.trim() || p.name.toLowerCase().includes(filters.name.trim().toLowerCase()))
    && (!filters.domain)
    && (!filters.mode || p.transaction_mode === filters.mode)
  ), [list.data, filters, view, user?.username])

  const onErr = (e: any) => {
    const detail = e.response?.data?.detail
    const text = Array.isArray(detail)
      ? detail.map((item: any) => item?.msg ?? String(item)).join('；')
      : detail
    message.error(text || '操作失败')
  }
  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] })

  const createMut = useMutation({
    mutationFn: (body: any) => editingProduct ? updateProduct(editingProduct.id, body) : listProduct(body),
    onSuccess: (product) => { message.success(editingProduct ? '产品登记信息已更新' : '产品已登记，完善上架信息后可公开'); setEditingProduct(null); createForm.resetFields(); invalidate(); navigate('/products/'+encodeURIComponent(product.id)+'?view=mine') },
    onError: onErr,
  })
  const publishMut=useMutation({mutationFn:(body:ProductPublish)=>publishProduct(publishTarget!.id,body),onSuccess:()=>{message.success('产品已上架');setPublishTarget(null);invalidate()},onError:onErr})
  const openPublish=(p:Product)=>{setPublishTarget(p);publishForm.resetFields();publishForm.setFieldsValue({platform_name:p.platform_name||undefined,platform_id:p.platform_id||undefined,platform_location:p.platform_location||undefined,delivery_mode:p.delivery_mode||undefined,measure_method:p.measure_method||undefined,measure_unit:p.measure_unit||undefined,price:p.price??undefined,delivery_info:p.delivery_info||undefined})}
  const delistMut = useMutation({
    mutationFn: delistProduct,
    onSuccess: () => { message.success('已下架'); invalidate() },
    onError: onErr,
  })
  const deleteMut = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { message.success('已删除'); invalidate() },
    onError: onErr,
  })
  const requestMut = useMutation({
    mutationFn: (v: { productId: string; body: any }) => requestContract(v.productId, v.body),
    onSuccess: (contract) => {
      message.success('已发起合约')
      setUseTarget(null); setApplyTarget(null); useForm.resetFields(); applyForm.resetFields()
      qc.invalidateQueries({ queryKey: ['contracts'] })
      navigate('/contracts/' + encodeURIComponent(contract.contract_id))
    },
    onError: onErr,
  })

  return (
    <RouteSurface
      title="数据产品市场"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => list.refetch()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingProduct(null); setCreateOpen(true); createForm.resetFields() }}>基于资源构建产品</Button>
        </Space>
      }
    >
      {list.isError && <Alert type="error" showIcon message="数据加载失败，当前列表可能不完整" action={<Button onClick={()=>list.refetch()}>重试</Button>} style={{marginBottom:16}}/>}
      <Tabs activeKey={view} onChange={setView} items={[{key:"discover",label:"发现产品"},{key:"mine",label:"我的产品"}]} />
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input.Search allowClear value={filters.name} placeholder="按产品名称检索" style={{ width: 280 }} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
          <Select allowClear value={filters.mode||undefined} placeholder="交易模式" style={{ width: 180 }} options={[{ value: 'accept', label: '提案-接受' }, { value: 'negotiate', label: '提案-修订' }]} onChange={(v) => setFilters((f) => ({ ...f, mode: v ?? '' }))} />
          <Text type="secondary">共 {filteredProducts.length} 个产品</Text>
        </Space>
      </Card>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {filteredProducts.map((p) => (
          <Card key={p.id} hoverable styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', minHeight: 138 }}>
              <div className="product-artwork" style={{ width: 78, flex: '0 0 78px', position: 'relative', overflow: 'hidden', background: 'var(--soft)' }}>
                <div style={{ position: 'absolute', width: 82, height: 82, borderRadius: '50%', background: 'rgba(255,255,255,.55)', left: -34, top: -20 }} />
                <div style={{ position: 'absolute', width: 52, height: 52, borderRadius: 14, border: '12px solid rgba(255,255,255,.48)', transform: 'rotate(32deg)', right: -25, bottom: -15 }} />
                <div style={{ position: 'absolute', width: 5, height: 54, borderRadius: 4, background: 'var(--accent)', left: 22, top: 54 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: 18 }}>
            <div className="product-summary">
              <div style={{ minWidth: 0 }}><Space><Text strong style={{ fontSize: 17 }}>{p.name}</Text><Tag color={STATUS_TAG[p.status]?.color}>{STATUS_TAG[p.status]?.text ?? p.status}</Tag></Space><Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '8px 0 0' }}>{p.description || '暂无产品说明'}</Paragraph></div>
              <div style={{ minWidth: 0 }}><Text type="secondary">TDS 标识码</Text><br />{p.tds_code ? <Text copyable code ellipsis={{ tooltip: p.tds_code }} style={{ display: 'block', width: '100%', marginTop: 5 }}>{p.tds_code}</Text> : '—'}</div>
              <div><Space direction="vertical" size={6}><span><Text type="secondary">供数连接器：</Text><Text code>{p.provider_connector_id}</Text></span><span><Text type="secondary">交易模式：</Text><Tag color={MODE_TAG[p.transaction_mode]?.color}>{MODE_TAG[p.transaction_mode]?.text}</Tag></span><span><Text type="secondary">关联资源：</Text>{p.resource_name || p.resource_id}</span></Space></div>
              <Space wrap style={{ maxWidth: 260, justifyContent: 'flex-end' }}>
                <Button size="small" onClick={() => setDetailTarget(p)}>详情</Button>
                {p.status !== 'listed' && (isAdmin || p.created_by === user?.username) && <Button size="small" onClick={() => { setEditingProduct(p); createForm.setFieldsValue({ ...p, resource_ids: p.resource_ids || [], baseline_policies: p.baseline_policies || [] }); setCreateOpen(p.id) }}>修改</Button>}
                {p.status!=='listed'&&(isOperator||p.created_by===user?.username)&&<Button size="small" type="primary" onClick={()=>openPublish(p)}>上架</Button>}
                {p.status === 'listed' && p.transaction_mode === 'accept' && <Button type="primary" size="small" disabled={isAdmin} title={isAdmin ? '管理员不可使用数据产品' : undefined} onClick={() => { setUseTarget(p); useForm.resetFields() }}>使用</Button>}
                {p.status === 'listed' && p.transaction_mode === 'negotiate' && <Button type="primary" size="small" disabled={isAdmin} title={isAdmin ? '管理员不可申请使用数据产品' : undefined} onClick={() => { setApplyTarget(p); applyForm.resetFields(); applyForm.setFieldsValue({ policies: p.baseline_policies ?? [] }) }}>申请</Button>}
                {p.status === 'listed' && (isOperator || p.created_by === user?.username) && <Popconfirm title="下架该产品？" onConfirm={() => delistMut.mutate(p.id)}><Button size="small" danger>下架</Button></Popconfirm>}
                {(isAdmin || p.created_by === user?.username) && <Popconfirm title="删除该产品？" onConfirm={() => deleteMut.mutate(p.id)}><Button size="small" danger>删除</Button></Popconfirm>}
              </Space>
            </div>
              </div>
            </div>
          </Card>
        ))}
        {!list.isLoading && !filteredProducts.length && <Empty description="没有符合条件的数据产品" />}
      </Space>

      {/* 基于资源登记产品，登记不等于上架 */}
      <EditorPage error={Boolean(editorId&&!list.isLoading&&(!editingProduct||(!isAdmin&&editingProduct.created_by!==user?.username)||editingProduct?.status==='listed'))} loading={Boolean(editorId&&list.isLoading)} title={editingProduct ? '修改产品登记' : '基于数据资源构建产品'} open={createOpen} width={1160} extra={<Space wrap><Button onClick={()=>setCreateOpen(false)}>返回</Button>{productStep>0&&<Button onClick={()=>setProductStep(0)}>重新选择资源</Button>}{productStep===0?<Button type="primary" disabled={!sourceIds.length||selectedResources.length!==sourceIds.length} onClick={()=>{if(new Set(selectedResources.map(r=>r.provider_connector_id)).size>1){message.warning('请选择同一供数连接器的资源');return}setProductStep(1)}}>下一步：定义产品</Button>:<Button type="primary" disabled={Boolean(editorId&&(!editingProduct||editingProduct.status==='listed'))} loading={createMut.isPending} onClick={()=>createForm.submit()}>保存产品登记</Button>}</Space>}
        onCancel={() => { setCreateOpen(false); setEditingProduct(null) }} confirmLoading={createMut.isPending} destroyOnClose>
        <Steps current={productStep} style={{marginBottom:24}} items={[{title:'选择来源资源'},{title:'定义产品与使用规则'}]}/>
        <Alert type="info" showIcon style={{marginBottom:24}} message="资源是产品的来源，产品描述加工后提供的内容或服务" description="先选供数方已公开到中心且审核通过的资源，再描述加工、用途与交付内容。登记后需单独完成上架信息，才会出现在产品市场。"/>
        <Form form={createForm} layout="vertical" onValuesChange={(changed)=>Object.keys(changed).filter(key=>key in sharedMetadataLabels).forEach(key=>editedMetadata.current.add(key))} onFinish={(v) => (!editorId || editingProduct?.id===editorId) && createMut.mutate({ ...v, resource_ids: v.resource_ids || [], authorization_required: Boolean(v.authorization_required), provider_entity_info:typeof v.provider_entity_info==='string'?JSON.parse(v.provider_entity_info):v.provider_entity_info })}
          initialValues={{ transaction_mode: 'accept', public_data: false, authorization_required: false, provider_entity_info: {}, declarations: { compliance: '', data_source: '', ai_training_license: '' }, baseline_policies: [emptyPolicy()] }}>
          <div style={{display:productStep===0?'block':'none'}}>
            <div className="center-form-columns"><section className="center-form-panel"><h3>选择已公开的数据资源</h3><Form.Item name="resource_ids" label="产品来源资源" rules={[{required:true,message:'请选择数据资源'}]}><Select mode="multiple" showSearch optionFilterProp="label" loading={resources.isLoading} placeholder="选择一个或多个同一连接器的资源" options={myResources.map(r=>({value:r.id,label:r.name}))} onChange={chooseResources}/></Form.Item>{resources.isError&&<Alert type="error" message="资源加载失败" action={<Button onClick={()=>resources.refetch()}>重试</Button>}/>}<Text type="secondary">仅列出本供数方已公开并审核通过的资源。资源登记与公开操作在连接器 Portal 完成。</Text></section><section className="center-form-panel"><h3>来源预览 · {selectedResources.length} 项</h3>{selectedResources.length?selectedResources.map(r=><div key={r.id} style={{marginBottom:16}}><Text strong>{r.name}</Text><p>{r.resource_abstract||r.description}</p><Text type="secondary">{r.resource_owner_name} · {r.resource_format} · {r.update_freq||'未说明更新频率'}</Text><p><Text copyable>{r.tds_code||r.id}</Text></p></div>):<Empty description="选择资源后查看来源摘要"/>}</section></div>
          </div>
          <div style={{display:productStep===1?'block':'none'}}>
          <Card size="small" style={{marginBottom:24}} title="依据的数据资源"><Space wrap>{selectedResources.map(r=><Tag key={r.id}>{r.name}</Tag>)}</Space><p className="page-intro">名称、简介、行业、时间范围、更新频率、个人信息分类及提供方身份从资源带出，可按加工结果修改。个人信息分类按来源最高等级预填；多个资源的规模需另行确认。</p>{metadata.unresolved.length>0&&<Alert type="warning" showIcon message="以下共享字段无法直接继承，请核对填写结果" description={metadata.unresolved.join('、')}/>}<Popconfirm title="重新带入将覆盖共享字段的手动修改，是否继续？" onConfirm={()=>{editedMetadata.current.clear();createForm.setFieldsValue(metadata.values);message.success('共享字段已重新从来源带入')}}><Button style={{marginTop:12}}>重新带入共享元信息</Button></Popconfirm></Card>
          <div className="center-form-columns"><section className="center-form-panel"><h3>产品内容与资源加工</h3><h4>共享元信息 · 从资源带入</h4><p className="page-intro">以下内容按来源预填，可按加工结果调整。来源缺失或存在差异的字段需要确认。</p><Form.Item name="name" label="产品名称" rules={[{ required: true }, {max:128,message:"产品名称不超过128字"}]}><Input maxLength={128} placeholder="从资源名称带出，请按产品内容调整" /></Form.Item><Form.Item name="description" label="产品简介" rules={[{ required: true }, {max:500,message:"产品简介不超过500字，请精简来源摘要"}]}><Input.TextArea rows={3} showCount maxLength={500} /></Form.Item><div className="product-metadata-grid"><Form.Item name="industry_code" label="行业分类（GB/T 4754 门类）" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={INDUSTRIES} placeholder="选择行业" style={{width:"100%"}} /></Form.Item><Form.Item name="personal_information_level" label="是否涉及个人信息" rules={[{ required: true }]}><Select options={PERSONAL_LEVELS} /></Form.Item></div><div className="product-metadata-grid"><Form.Item name="update_frequency" label="更新频率" rules={[{ required: true }, {pattern:/^(不更新|实时|其他|[1-9]\d*次\/(天|周|月|季度|年))$/,message:"使用实时、不更新、其他或数字次/天、周、月、季度、年"}]}><Input placeholder="如 1次/月、其他" /></Form.Item><Form.Item name="data_size" label="数据规模"><Input /></Form.Item></div><Form.Item name="time_range" label="覆盖时间范围"><Input placeholder="YYYY-MM-DD至YYYY-MM-DD"/></Form.Item><h4>加工后的产品定义</h4><p className="page-intro">产品类型、交付方式与使用限制由实际产品决定，请单独填写。</p><Form.Item name="processing_description" label="资源加工过程与产品价值" rules={[{required:true,whitespace:true,message:'请说明如何由资源形成产品'}]}><Input.TextArea rows={3} maxLength={4000} placeholder="例如：对来源数据清洗、脱敏并按月聚合，形成面向风险分析的统计指标；仅填写资源名称不代表完成加工。"/></Form.Item><div className="product-metadata-grid"><Form.Item name="product_type" label="产品类型" rules={[{ required: true }]}><Select options={PRODUCT_TYPES} /></Form.Item><Form.Item name="delivery_method" label="交付方式" rules={[{ required: true }]}><Select options={DELIVERY_METHODS} /></Form.Item></div><Form.Item name="usage_limitations" label="使用限制" rules={[{ required: true }]}><Input /></Form.Item><div className="product-metadata-grid"><Form.Item name="data_subject_type" label="数据主体" rules={[{ required: true }]}><Select options={DATA_SUBJECT_TYPES} /></Form.Item><Form.Item name="region_code" label="地域分类（GB/T 2260）"><Input placeholder="GB/T 2260 行政区划代码"/></Form.Item></div><Form.Item name="authorization_required" label="是否需资源持有方另行授权"><Select options={[{value:true,label:'是'},{value:false,label:'否'}]}/></Form.Item><Form.Item name="applicable_model_types" label="适用模型类型（可选）"><Select mode="multiple" options={['大语言模型（LLM）','多模态大模型','图像生成模型','语音模型','推荐模型','专用模型','Agent/智能体模型','其他'].map((label,i)=>({label,value:String(i+1).padStart(2,'0')}))}/></Form.Item><Form.Item name="ai_usage_scenarios" label="AI用途场景（可选）" extra="来源的AI任务类型与产品用途含义不同，请按加工后的产品选择。"><Select mode="multiple" options={['预训练','指令微调','RLHF/RLAIF对齐','检索增强生成（RAG）','知识库构建','评测基准','合成数据生成','Agent工具调用','模型蒸馏/压缩','其他'].map((label,i)=>({label,value:String(i+1).padStart(2,'0')}))}/></Form.Item><h4>平台业务信息</h4><Form.Item name="application_scenarios" label="业务应用场景（平台扩展）" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="说明产品面向的业务使用场景" /></Form.Item><Form.Item name="public_data" label="公共数据标记（平台扩展）"><Select options={[{ value: true, label: '是' }, { value: false, label: '否' }]} /></Form.Item></section><section className="center-form-panel"><h3>提供方、声明与使用规则</h3>
          <div className="product-metadata-grid"><Form.Item name="provider_name" label="提供方名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="provider_type" label="提供方主体类型" rules={[{ required: true }]}><Select options={PROVIDER_TYPES} /></Form.Item><Form.Item name="provider_identity_id" label="身份标识码" rules={[{ required: true }]}><Input /></Form.Item></div>
          <Form.Item name="provider_description" label="提供方简介" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="provider_entity_info" label="提供方主体信息（JSON）" rules={[{validator:(_,v)=>{try{const parsed=typeof v==='string'?JSON.parse(v):v;if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw new Error();return Promise.resolve()}catch{return Promise.reject(new Error('请输入有效 JSON 对象'))}}}]} getValueFromEvent={(e)=>e.target.value} getValueProps={(v)=>({value:typeof v==='string'?v:JSON.stringify(v??{},null,2)})}><Input.TextArea rows={3} placeholder={'例如：{"统一社会信用代码":"..."}'} /></Form.Item>
          <Space style={{ display: 'flex' }} align="start"><Form.Item name="operator_name" label="经办人"><Input /></Form.Item><Form.Item name="operator_telephone" label="经办人电话"><Input /></Form.Item><Form.Item name="operator_id_card" label="经办人证件号"><Input /></Form.Item></Space>
          <Form.Item label="声明附件引用" required><Space direction="vertical" style={{ width: '100%' }}><Form.Item name={['declarations', 'compliance']} noStyle rules={[{ required: true, message: '请填写合法合规声明引用' }]}><Input addonBefore="合法合规" placeholder="attachment://文档对象ID" /></Form.Item><Form.Item name={['declarations', 'data_source']} noStyle rules={[{ required: true, message: '请填写数据来源声明引用' }]}><Input addonBefore="数据来源" placeholder="attachment://文档对象ID" /></Form.Item><Form.Item name={['declarations', 'ai_training_license']} noStyle rules={[{ required: true, message: '请填写AI训练授权引用' }]}><Input addonBefore="AI训练授权" placeholder="attachment://文档对象ID" /></Form.Item></Space></Form.Item>
          <Form.Item name="transaction_mode" label="交易模式" rules={[{ required: true }]}>
            <Select options={[
              { value: 'accept', label: '提案-接受（用数方接受基准合约即成立）' },
              { value: 'negotiate', label: '提案-修订（多轮协商达成共识）' },
            ]} />
          </Form.Item>
          <Form.Item name="template_id" label="选择合约模板（可选，填充基准策略后可微调）">
            <Select
              allowClear
              placeholder="从系统/我的合约模板中选择，作为基准策略起点"
              options={(templates.data ?? []).map((t) => ({
                value: t.id,
                label: `${t.scope === 'system' ? '[系统] ' : '[我的] '}${t.name}`,
              }))}
              onChange={(id) => {
                const t = (templates.data ?? []).find((x) => x.id === id)
                if (t) createForm.setFieldsValue({ baseline_policies: t.policies ?? [] })
              }}
            />
          </Form.Item>
          <Form.Item name="baseline_policies" label="基准合约策略"
            rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少配置一条策略'))) }]}>
            <PolicyEditor />
          </Form.Item>
          </section></div></div>
        </Form>
      </EditorPage>

      <Modal title={`上架数据产品：${publishTarget?.name||''}`} open={!!publishTarget} width={1160} onCancel={()=>setPublishTarget(null)} onOk={()=>publishForm.submit()} confirmLoading={publishMut.isPending} okText="确认上架" destroyOnClose>
        <Alert type="info" showIcon message="上架后公开的是数据产品，来源数据资源的可见范围不会改变" style={{marginBottom:24}}/>
        <Form form={publishForm} layout="vertical" onFinish={v=>publishMut.mutate(v)}><div className="center-form-columns"><section className="center-form-panel"><h3>上架节点与交付</h3><Form.Item name="platform_name" label="上架业务节点名称" rules={[{required:true,whitespace:true}]}><Input/></Form.Item><Form.Item name="platform_id" label="上架业务节点标识码" rules={[{required:true,whitespace:true}]}><Input/></Form.Item><Form.Item name="platform_location" label="节点位置" rules={[{required:true,whitespace:true}]}><Input/></Form.Item><Form.Item name="delivery_mode" label="上架交付方式" rules={[{required:true}]}><Select options={[{value:'01',label:'文件传输'},{value:'02',label:'数据流传输'},{value:'03',label:'API传输'},{value:'04',label:'沙箱计算'},{value:'05',label:'隐私计算'},{value:'06',label:'数据可视化'},{value:'07',label:'其他'}]}/></Form.Item><Form.Item name="delivery_info" label="交付说明 / 说明文件引用" rules={[{required:true,whitespace:true}]}><Input.TextArea rows={3}/></Form.Item></section><section className="center-form-panel"><h3>计量与定价</h3><Form.Item name="measure_method" label="计量方式" rules={[{required:true,whitespace:true}]}><Input placeholder="按次、按用量、按周期等"/></Form.Item><Form.Item name="measure_unit" label="计量单位" rules={[{required:true,whitespace:true}]}><Input placeholder="元/次、元/GB、元/月等"/></Form.Item><Form.Item name="price" label="价格（免费填写 0）" rules={[{required:true}]}><InputNumber min={0} style={{width:'100%'}}/></Form.Item><Text type="secondary">产品下架仅停止对外提供此产品；不会撤回来源资源。需要修改已上架产品时，先下架再修改登记信息。</Text></section></div></Form>
      </Modal>

      {/* 使用（accept）：只读策略 + 使用目的 + 打字确认 */}
      <Modal title={`使用产品：${useTarget?.name ?? ''}`} open={!!useTarget} width={640}
        onCancel={() => setUseTarget(null)} confirmLoading={requestMut.isPending}
        okText="确认使用" onOk={() => useForm.submit()} destroyOnClose>
        {useTarget && (
          <Form form={useForm} layout="vertical"
            onFinish={(v) => requestMut.mutate({ productId: useTarget.id, body: { consumer_connector_id: v.consumer_connector_id, purpose: v.purpose, confirm: v.confirm } })}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="接受即视为签署：将按基准策略即时生成并备案合约。" />
            <Typography.Text strong>基准合约策略</Typography.Text>
            <div style={{ margin: '8px 0 16px' }}><PolicyView policies={useTarget.baseline_policies ?? []} /></div>
            <Alert type="info" showIcon style={{marginBottom:16}} message="请核对本次申请对象" description={<><div>产品：{useTarget.name} · {useTarget.tds_code||useTarget.id}</div><div>来源资源：{useTarget.resource_name||'未命名资源'}</div><div>资源标识：{(useTarget.resource_ids||[useTarget.resource_id]).filter(Boolean).join('、')}</div><div>供数连接器：{connectors.data?.find(c=>c.id===useTarget.provider_connector_id)?.name||useTarget.provider_connector_id}</div></>}/>
            <Form.Item name="consumer_connector_id" label="使用方连接器" rules={[{ required: true }]}>
              <Select placeholder="选择你的连接器（已审批且在线）"
              options={usableConnectors.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="purpose" label="使用目的" rules={[{ required: true, message: '请声明使用目的' }]}>
              <Input.TextArea rows={2} placeholder="声明本次数据使用的目的" />
            </Form.Item>
            <Form.Item name="confirm" label={<span>打字确认：请输入产品名 <Text code>{useTarget.name}</Text></span>}
              rules={[
                { required: true, message: '请输入产品名以确认' },
                { validator: (_, v) => (v === useTarget.name ? Promise.resolve() : Promise.reject(new Error('输入内容需与产品名完全一致'))) },
              ]}>
              <Input placeholder={useTarget.name} />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 申请（negotiate）：选连接器 + 基于基准修改策略 */}
      <Modal title={`申请产品：${applyTarget?.name ?? ''}`} open={!!applyTarget} width={760}
        onCancel={() => setApplyTarget(null)} confirmLoading={requestMut.isPending}
        okText="发起申请" onOk={() => applyForm.submit()} destroyOnClose>
        {applyTarget && (
          <Form form={applyForm} layout="vertical"
            initialValues={{ policies: applyTarget.baseline_policies ?? [] }}
            onFinish={(v) => requestMut.mutate({ productId: applyTarget.id, body: { consumer_connector_id: v.consumer_connector_id, purpose: v.purpose, policies: v.policies, ...(applyTarget.transaction_mode==='negotiate'?{contract_expansion:{computationOutsourcing:{allowed:!!v.outsourcing_allowed,allowedConnectors:v.outsourcing_connectors||[]}}}:{}) } })}>
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message="基于基准策略修改后发起磋商，供数方将进一步审核/修订。" />
            <Alert type="info" showIcon style={{marginBottom:16}} message="请核对本次申请对象" description={<><div>产品：{applyTarget.name} · {applyTarget.tds_code||applyTarget.id}</div><div>来源资源：{applyTarget.resource_name||'未命名资源'}</div><div>资源标识：{(applyTarget.resource_ids||[applyTarget.resource_id]).filter(Boolean).join('、')}</div><div>供数连接器：{connectors.data?.find(c=>c.id===applyTarget.provider_connector_id)?.name||applyTarget.provider_connector_id}</div></>}/>
            <Form.Item name="consumer_connector_id" label="使用方连接器" rules={[{ required: true }]}>
              <Select placeholder="选择你的连接器（已审批且在线）"
              options={usableConnectors.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="purpose" label="使用目的"><Input.TextArea rows={2} placeholder="声明本次数据使用的目的（选填）" /></Form.Item>
            <Form.Item name="policies" label="拟定合约策略"
              rules={[{ validator: (_, v: Policy[]) => (v && v.length > 0 ? Promise.resolve() : Promise.reject(new Error('至少保留一条策略'))) }]}>
              <PolicyEditor />
            </Form.Item>
            {applyTarget.transaction_mode==='negotiate'&&<ComputationOutsourcingFields connectors={connectors.data||[]}/>}
            {applyTarget.description && <Paragraph type="secondary">产品说明：{applyTarget.description}</Paragraph>}
          </Form>
        )}
      </Modal>

      {/* 产品详情 */}
      <DetailPage loading={list.isLoading} error={list.isError} title={`产品详情：${detailTarget?.name ?? ''}`} open={!!detailTarget} width={1040}
        onClose={() => setDetailTarget(null)} extra={detailTarget ? <Space>{detailTarget.status!=='listed'&&(isOperator||detailTarget.created_by===user?.username)&&<Button type="primary" onClick={()=>openPublish(detailTarget)}>上架产品</Button>}{detailTarget.status==='listed'&&!isAdmin&&<Button type="primary" onClick={()=>{if(detailTarget.transaction_mode==='negotiate'){applyForm.resetFields();applyForm.setFieldsValue({policies:detailTarget.baseline_policies??[]});setApplyTarget(detailTarget)}else{useForm.resetFields();setUseTarget(detailTarget)}}}>申请使用此产品</Button>}</Space>:undefined} destroyOnClose>
        {detailTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <BusinessDetails column={1} bordered size="small">
              <Descriptions.Item label="来源资源标识码">{(detailTarget.resource_codes||[]).map(code=><div key={code}><Text copyable>{code}</Text></div>)}</Descriptions.Item>
              <Descriptions.Item label="资源加工与产品价值">{detailTarget.processing_description||'历史产品尚未补充加工说明'}</Descriptions.Item>
              <Descriptions.Item label="产品名称">{detailTarget.name}</Descriptions.Item>
              <Descriptions.Item label="TDS 标识码">
                {detailTarget.tds_code ? <Text copyable code style={{ fontSize: 12 }}>{detailTarget.tds_code}</Text> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="描述">{detailTarget.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="产品类型">{PRODUCT_TYPES.find((x) => x.value === detailTarget.product_type)?.label ?? detailTarget.product_type}</Descriptions.Item>
              <Descriptions.Item label="行业分类">{detailTarget.industry_code}</Descriptions.Item>
              <Descriptions.Item label="业务应用场景（平台扩展）">{detailTarget.application_scenarios || '—'}</Descriptions.Item>
              <Descriptions.Item label="是否涉及个人信息">{PERSONAL_LEVELS.find((x) => x.value === detailTarget.personal_information_level)?.label ?? detailTarget.personal_information_level}</Descriptions.Item>
              <Descriptions.Item label="数据主体">{DATA_SUBJECT_TYPES.find((x) => x.value === detailTarget.data_subject_type)?.label ?? detailTarget.data_subject_type}</Descriptions.Item>
              <Descriptions.Item label="交付方式">{DELIVERY_METHODS.find((x) => x.value === detailTarget.delivery_method)?.label ?? detailTarget.delivery_method}</Descriptions.Item>
              <Descriptions.Item label="更新频率">{detailTarget.update_frequency || '—'}</Descriptions.Item>
              <Descriptions.Item label="公共数据标记（平台扩展）">{detailTarget.public_data ? '是' : '否'}</Descriptions.Item>
              <Descriptions.Item label="关联资源">
                {detailTarget.resource_name || <Text type="secondary">{detailTarget.resource_id}</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="供数连接器"><Text code>{detailTarget.provider_connector_id}</Text></Descriptions.Item>
              <Descriptions.Item label="磋商模式">
                <Tag color={MODE_TAG[detailTarget.transaction_mode]?.color}>
                  {MODE_TAG[detailTarget.transaction_mode]?.text ?? detailTarget.transaction_mode}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_TAG[detailTarget.status]?.color}>
                  {STATUS_TAG[detailTarget.status]?.text ?? detailTarget.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="上架方">{detailTarget.created_by}</Descriptions.Item>
              <Descriptions.Item label="声明附件引用">{detailTarget.declarations ? Object.entries(detailTarget.declarations).map(([k, v]) => <div key={k}>{k}：{v}</div>) : '—'}</Descriptions.Item>
            </BusinessDetails>
            <div>
              <Text strong>基准合约策略</Text>
              <div style={{ marginTop: 8 }}><PolicyView policies={detailTarget.baseline_policies ?? []} /></div>
            </div>
          </Space>
        )}
      </DetailPage>
    </RouteSurface>
  )
}
