import { Alert, Card, Table, Tag, Typography, Button, Input, Select, Descriptions, Empty } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { listUsageRecords, UsageRecord } from '../api/usage'
import BusinessDetails from '../components/BusinessDetails'

const { Text } = Typography
const DECISION: Record<string, string> = { allowed:'允许', denied:'策略拒绝', default_deny:'默认拒绝' }
const LIFECYCLE: Record<string, string> = { decided:'已决策', reserved:'已预占', consumed:'已消费', released:'已释放' }
export default function UsageRecords() {
  const [params, setParams] = useSearchParams()
  const contract = params.get('contract') || ''
  const decision = params.get('decision') || ''
  const update = (key:string,value:string) => setParams(previous=>{const next=new URLSearchParams(previous);value?next.set(key,value):next.delete(key);next.delete('page');return next}, {replace:true})
  const query = useQuery({ queryKey:['usage-records',contract], queryFn:()=>listUsageRecords(contract || undefined) })
  const rows=(query.data || []).filter(r=>!decision || r.decision===decision)
  const columns = [
    {title:'发生时间',dataIndex:'created_at',render:(v:string)=>new Date(v).toLocaleString()},
    {title:'操作与执行环境',render:(_:unknown,r:UsageRecord)=><><Text strong>{r.action}</Text><div><Text type="secondary">{r.context?.exec_env || '未记录执行环境'}</Text></div></>},
    {title:'使用主体',dataIndex:'username'},
    {title:'决策',dataIndex:'decision',render:(v:string)=><Tag color={v==='allowed'?'green':'red'}>{DECISION[v]||v}</Tag>},
    {title:'生命周期',dataIndex:'lifecycle',render:(v:string)=><Tag>{LIFECYCLE[v]||v}</Tag>},
    {title:'关联合约',dataIndex:'contract_id',render:(v:string)=><Link to={'/contracts/'+encodeURIComponent(v)}>查看合约</Link>},
  ]
  return <Card title="数据使用追踪" extra={<Button icon={<ReloadOutlined/>} onClick={()=>query.refetch()}>刷新</Button>}>
    <p className="page-intro">从使用决策追踪合约执行。展开记录可核对拒绝原因、命中策略与执行上下文。</p>
    <div className="page-toolbar"><Input aria-label="合约编号" allowClear placeholder="按完整合约编号筛选" value={contract} onChange={e=>update('contract',e.target.value)} style={{width:320,maxWidth:'100%'}}/><Select aria-label="决策结果" allowClear placeholder="全部决策" value={decision||undefined} onChange={v=>update('decision',v||'')} options={Object.entries(DECISION).map(([value,label])=>({value,label}))} style={{width:180}}/></div>
    {query.isError?<Alert type="error" showIcon message="使用记录加载失败" action={<Button onClick={()=>query.refetch()}>重试</Button>}/>:<Table rowKey="id" loading={query.isLoading} dataSource={rows} columns={columns} scroll={{x:850}} locale={{emptyText:<Empty description="暂无符合条件的使用记录"/>}} pagination={{current:Math.max(1,Number(params.get('page'))||1),pageSize:10,onChange:page=>setParams(previous=>{const next=new URLSearchParams(previous);next.set('page',String(page));return next})}} expandable={{expandRowByClick:true,expandedRowRender:r=><BusinessDetails>
      <Descriptions.Item label="决策原因">{r.reason||'未记录原因'}</Descriptions.Item><Descriptions.Item label="命中策略">{r.matched_policy_ids?.map(id=><Tag key={id}>{id}</Tag>)||'无'}</Descriptions.Item>
      <Descriptions.Item label="使用主体">{r.username}</Descriptions.Item><Descriptions.Item label="执行连接器"><Link to={'/connectors/'+encodeURIComponent(r.connector_id)}>{r.connector_id}</Link></Descriptions.Item>
      <Descriptions.Item label="执行环境">{r.context?.exec_env||'—'}</Descriptions.Item><Descriptions.Item label="计数快照">{r.context?.used_count??'—'}</Descriptions.Item><Descriptions.Item label="应用标识">{r.context?.application_code||'—'}</Descriptions.Item>
      <Descriptions.Item label="请求编号"><Text copyable>{r.request_id}</Text></Descriptions.Item><Descriptions.Item label="作业编号">{r.job_id||'—'}</Descriptions.Item><Descriptions.Item label="更新时间">{new Date(r.updated_at).toLocaleString()}</Descriptions.Item>
    </BusinessDetails>}}/>}
  </Card>
}
