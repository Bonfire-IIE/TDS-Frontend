import { useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Alert, Button, Card, Collapse, Descriptions, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Contract, ContractPolicy, downloadContractYaml, getContract, info, listContracts, proposeContract, rejectContract, signContract, terminateContract } from '../api/contracts'
import { listConnectors } from '../api/connectors'
import { useAuth } from '../auth/AuthContext'
import JsonViewer from '../components/JsonViewer'
import BusinessDetails from '../components/BusinessDetails'
import ComputationOutsourcingFields from '../components/ComputationOutsourcingFields'
import { listComputationServices } from '../api/applicationTemplates'

const statusText:Record<string,string>={initiated:'已发起',negotiating:'磋商中',signed:'已签署',filed:'已备案',executing:'执行中',terminated:'已终止',rejected:'已驳回'}
const status=(v:string)=><Tag color={v==='filed'?'green':v==='rejected'?'red':v==='negotiating'?'orange':'default'}>{statusText[v]??v}</Tag>
const policyTypes={permission:'允许',prohibition:'禁止',obligation:'义务'}
const valueText=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value)
function PolicyCards({policies}:{policies:ContractPolicy[]}) {
 return <div className="center-form-columns">{policies.map((p,index)=><section className="center-form-panel" key={index}><h3><Tag>{policyTypes[p.policyType]||p.policyType}</Tag>{p.subjectInfo.dataProductName}</h3><p>{p.executionNodeInfo.providerNodeName} → {p.executionNodeInfo.consumerNodeName}</p><p>{p.actions.map(action=><Tag key={action}>{action}</Tag>)}</p><dl>{p.constraints.map((constraint,i)=><div key={i}><dt>{constraint.constraintName} · {constraint.constraintOperator}</dt><dd>{valueText(constraint.constraintValue)}</dd></div>)}</dl>{!p.constraints.length&&<Typography.Text type="secondary">此策略未设置附加约束</Typography.Text>}</section>)}</div>
}
export default function Contracts() {
 const {user}=useAuth();const qc=useQueryClient();const {id}=useParams();const navigate=useNavigate();const [params,setParams]=useSearchParams()
 const [proposing,setProposing]=useState(false);const [form]=Form.useForm()
 const list=useQuery({queryKey:['contracts'],queryFn:listContracts})
 const services=useQuery({queryKey:['computation-services'],queryFn:listComputationServices})
 const connectors=useQuery({queryKey:['connectors'],queryFn:listConnectors})
 const detail=useQuery({queryKey:['contract',id],queryFn:()=>getContract(id!),enabled:!!id})
 const refresh=()=>{void qc.invalidateQueries({queryKey:['contracts']});void qc.invalidateQueries({queryKey:['contract',id]})}
 const err=(e:any)=>message.error(typeof e.response?.data?.detail==='string'?e.response.data.detail:'操作失败，请检查输入并重试')
 const sign=useMutation({mutationFn:signContract,onSuccess:()=>{message.success('签署成功');refresh()},onError:err})
 const terminate=useMutation({mutationFn:terminateContract,onSuccess:refresh,onError:err})
 const reject=useMutation({mutationFn:rejectContract,onSuccess:refresh,onError:err})
 const propose=useMutation({mutationFn:(v:{policies:ContractPolicy[];extension:Record<string,unknown>})=>proposeContract(id!,v.policies,v.extension),onSuccess:()=>{setProposing(false);message.success('修订版本已提交，原签名已失效，需重新签署');refresh()},onError:err})
 const c=detail.data;const i=c?.document.contractInfo
 const identities=new Set([user?.username,...(connectors.data||[]).filter(x=>x.created_by===user?.username).flatMap(x=>[x.id,x.tds_code])])
 const owned=i?.signatoryEntities.filter(e=>identities.has(e.signatoryEntityId))||[]
 const canManage=Boolean(owned.length||c?.created_by===user?.username||user?.roles.includes('operator'))
 const canSign=owned.some(e=>!i?.signatureList.some(s=>s.signatoryEntityId===e.signatoryEntityId))
 const phase=i?.contractStatus;const negotiating=phase==='initiated'||phase==='negotiating'
 const active=phase&&!['terminated','rejected'].includes(phase)
 const search=params.get('q')||'';const filter=params.get('status')||''
 const changeFilter=(key:string,value:string)=>setParams(previous=>{const next=new URLSearchParams(previous);value?next.set(key,value):next.delete(key);next.delete('page');return next},{replace:true})
 const rows=(list.data||[]).filter(c=>(!search||info(c).contractName.includes(search)||c.contract_id.includes(search))&&(!filter||info(c).contractStatus===filter))
 if(!id) return <Card title="数字合约" extra={<Button icon={<ReloadOutlined/>} onClick={()=>list.refetch()}>刷新</Button>}>
   <p className="page-intro">在产品市场发起合约，在此完成协商与签署。已备案合约可用于创建计算项目，并追踪使用记录。</p>
   <div className="page-toolbar"><Input allowClear aria-label="搜索合约" placeholder="搜索合约名称或编号" value={search} onChange={e=>changeFilter('q',e.target.value)} style={{width:300,maxWidth:'100%'}}/><Select allowClear aria-label="合约状态" placeholder="全部状态" value={filter||undefined} onChange={v=>changeFilter('status',v||'')} options={Object.entries(statusText).map(([value,label])=>({value,label}))} style={{width:180}}/></div>
   {list.isError?<Alert type="error" message="合约加载失败，请刷新重试"/>:<Table rowKey="contract_id" loading={list.isLoading} dataSource={rows} scroll={{x:800}} pagination={{current:Math.max(1,Number(params.get('page'))||1),pageSize:10,onChange:p=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(p));return next})}} columns={[
    {title:'合约',render:(_:unknown,c:Contract)=><><Link to={'/contracts/'+encodeURIComponent(c.contract_id)+'?'+params.toString()}>{info(c).contractName}</Link><div><Typography.Text type="secondary">{c.contract_id}</Typography.Text></div></>},
    {title:'签署方式',render:(_:unknown,c:Contract)=>info(c).signMode==='accept'?'提案—接受':'提案—修订'},
    {title:'参与方',render:(_:unknown,c:Contract)=>info(c).signatoryEntities.map((e:{signatoryEntityName:string})=>e.signatoryEntityName).join(' / ')},
    {title:'当前状态',render:(_:unknown,c:Contract)=>status(info(c).contractStatus)},
    {title:'版本',dataIndex:'current_version',render:(v:number)=>'v'+v},
   ]}/>}
 </Card>
 return <div><div className="workspace-welcome"><div><Typography.Title level={2}>{i?.contractName||'合约工作台'}</Typography.Title><Space>{phase&&status(phase)}{c&&<Typography.Text type="secondary">当前版本 v{c.current_version}</Typography.Text>}</Space></div><Button onClick={()=>navigate('/contracts?'+params.toString())}>返回合约列表</Button></div>
 <Card loading={detail.isLoading}>{detail.isError?<Alert showIcon type="error" message="合约不可访问或加载失败" action={<Button onClick={()=>detail.refetch()}>重试</Button>}/>:c&&i?<>
 <div className="page-toolbar">
 {negotiating&&canSign&&<Popconfirm title="确认签署当前版本？" description={<div>本次签署产品：{c.document.contractPolicies.map(p=>p.subjectInfo.dataProductName).join("、")}。请核对下方产品标识、策略和参与方。</div>} onConfirm={()=>sign.mutateAsync(c.contract_id)}><Button type="primary" loading={sign.isPending}>签署当前版本</Button></Popconfirm>}
 {negotiating&&canManage&&i.signMode==='negotiate'&&<Button onClick={()=>{form.setFieldsValue({outsourcing_allowed:(i.expansionItem?.computationOutsourcing as any)?.allowed===true,outsourcing_connectors:(i.expansionItem?.computationOutsourcing as any)?.allowedConnectors||[],policies:c.document.contractPolicies.map(p=>({...p,constraints:p.constraints.map(x=>({...x,value:JSON.stringify(x.constraintValue)}))}))});setProposing(true)}}>修订策略与外包许可</Button>}
 {phase==='filed'&&<Link to={'/privacy-computing?contract='+encodeURIComponent(c.contract_id)}><Button type="primary">创建计算项目</Button></Link>}
 <Link to={'/usage?contract='+encodeURIComponent(c.contract_id)}><Button>使用记录</Button></Link><Link to={'/audit?contract='+encodeURIComponent(c.contract_id)}><Button>审计证据</Button></Link>
 <Button icon={<DownloadOutlined/>} onClick={()=>downloadContractYaml(c).catch(err)}>导出 YAML</Button>
 {active&&canManage&&<Popconfirm title="确认终止此合约？" description="此操作将提交合约终止状态，请先确认相关业务已完成。" onConfirm={()=>terminate.mutateAsync(c.contract_id)}><Button danger loading={terminate.isPending}>终止</Button></Popconfirm>}
 {negotiating&&canManage&&<Popconfirm title="确认驳回此合约？" onConfirm={()=>reject.mutateAsync(c.contract_id)}><Button danger loading={reject.isPending}>驳回</Button></Popconfirm>}
 </div>
 <Tabs defaultActiveKey="overview" items={[
 {key:'overview',label:'概览与签署',children:<><BusinessDetails><Descriptions.Item label="本次使用的数据产品">{c.document.contractPolicies.map((p,index)=><div key={index}><Link to={"/products/"+encodeURIComponent(p.subjectInfo.dataProductId)}>{p.subjectInfo.dataProductName}</Link><div><Typography.Text code copyable>{p.subjectInfo.dataProductId}</Typography.Text></div></div>)}</Descriptions.Item><Descriptions.Item label="合约名称">{i.contractName}</Descriptions.Item><Descriptions.Item label="合约编号"><Typography.Text copyable>{i.contractId}</Typography.Text></Descriptions.Item><Descriptions.Item label="摘要">{i.contractAbstract||'—'}</Descriptions.Item><Descriptions.Item label="有效期">{new Date(i.indate.activationTime).toLocaleString()} 至 {new Date(i.indate.endTime).toLocaleString()}</Descriptions.Item><Descriptions.Item label="文档哈希"><Typography.Text copyable>{c.document_hash}</Typography.Text></Descriptions.Item><Descriptions.Item label="标准">{c.document.$schema}</Descriptions.Item><Descriptions.Item label="外包计算许可">{(i.expansionItem?.computationOutsourcing as any)?.allowed===true?'允许，需另行完成项目计算委托':'未允许'}</Descriptions.Item><Descriptions.Item label="计算服务许可范围">{((i.expansionItem?.computationOutsourcing as any)?.allowedConnectors||[]).map((cid:string)=><Tag key={cid}>{connectors.data?.find(x=>x.id===cid||x.tds_code===cid)?.name||services.data?.find(x=>x.id===cid)?.name||cid}</Tag>)}{!(i.expansionItem?.computationOutsourcing as any)?.allowedConnectors?.length&&'未额外限定连接器'}</Descriptions.Item></BusinessDetails><h3>参与方签署进度</h3><div className="center-form-columns">{i.signatoryEntities.map(e=>{const signature=i.signatureList.find(s=>s.signatoryEntityId===e.signatoryEntityId);return <section className="center-form-panel" key={e.signatoryEntityId}><h3>{e.signatoryEntityName}</h3><Tag>{({provider:'供数方',consumer:'用数方',operator:'运营方',other:'其他参与方'})[e.signatoryType]}</Tag><Tag color={signature?'green':'default'}>{signature?'已签署':'待签署'}</Tag><p><Typography.Text copyable>{e.signatoryEntityId}</Typography.Text></p>{signature&&<Typography.Text type="secondary">{new Date(signature.signatoryTime).toLocaleString()}</Typography.Text>}</section>})}</div></>},
 {key:'policies',label:`使用策略 (${c.document.contractPolicies.length})`,children:<PolicyCards policies={c.document.contractPolicies}/>},
 {key:'versions',label:'版本与证据',children:<><Table rowKey="version" dataSource={c.versions} scroll={{x:650}} columns={[{title:'版本',dataIndex:'version'},{title:'操作',dataIndex:'operation'},{title:'操作人',dataIndex:'createdBy'},{title:'时间',dataIndex:'createdAt'}]} expandable={{expandedRowRender:v=><><Typography.Paragraph copyable>{v.documentHash}</Typography.Paragraph><PolicyCards policies={v.document.contractPolicies}/></>}}/><Collapse items={[{key:'document',label:'完整标准文档',children:<JsonViewer value={c.document} collapsed={1} maxHeight={420}/>}]} /></>},
 ]}/></>:<Empty description="合约不存在"/>}</Card>
 <Modal title="修订策略与外包许可" open={proposing} width={1160} onCancel={()=>setProposing(false)} confirmLoading={propose.isPending} onOk={()=>form.submit()} destroyOnClose>
 <Alert type="warning" showIcon message="提交会生成新版本并清空现有签名，各参与方需重新签署。"/>
 <Form form={form} layout="vertical" onFinish={v=>propose.mutate({extension:{computationOutsourcing:{allowed:!!v.outsourcing_allowed,allowedConnectors:v.outsourcing_connectors||[]}},policies:v.policies.map((p:any,index:number)=>({...c!.document.contractPolicies[index],...p,constraints:p.constraints.map(({value,...x}:any,j:number)=>({...c!.document.contractPolicies[index].constraints[j],...x,constraintValue:JSON.parse(value)}))}))})}>
 <Form.List name="policies">{fields=><div className="center-form-columns">{fields.map(field=><section className="center-form-panel" key={field.key}><h3>策略 {field.name+1} · {c?.document.contractPolicies[field.name]?.subjectInfo.dataProductName}</h3><Form.Item name={[field.name,'policyType']} label="策略类型"><Select options={Object.entries(policyTypes).map(([value,label])=>({value,label}))}/></Form.Item><Form.Item name={[field.name,'actions']} label="操作行为" rules={[{required:true}]}><Select mode="tags" options={['read','process','download','export'].map(value=>({value}))}/></Form.Item><Form.List name={[field.name,'constraints']}>{constraints=>constraints.map(constraint=><div key={constraint.key}><Typography.Text strong>{form.getFieldValue(['policies',field.name,'constraints',constraint.name,'constraintName'])}</Typography.Text><Form.Item name={[constraint.name,'constraintOperator']} label="约束运算符" rules={[{required:true}]}><Input/></Form.Item><Form.Item name={[constraint.name,'value']} label="约束值（保留原值类型）" rules={[{required:true},{validator:(_,v)=>{try{JSON.parse(v);return Promise.resolve()}catch{return Promise.reject(new Error('请输入有效 JSON 值，例如 10 或 "mpc"'))}}}]}><Input/></Form.Item></div>)}</Form.List></section>)}</div>}</Form.List>
 <ComputationOutsourcingFields connectors={connectors.data||[]}/>
 </Form></Modal></div>
}
