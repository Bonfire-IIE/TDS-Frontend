import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

/** Accepts existing labelled fields, keeping value formatting and permission checks intact. */
export default function BusinessDetails({children,groups:customGroups}:{children:ReactNode;groups?:{title:string;labels:string[]}[];[key:string]:unknown}) {
 const fields=Children.toArray(children).filter(isValidElement) as ReactElement<{label?:ReactNode;children?:ReactNode}>[]
 const groups:{title:string;pattern?:RegExp;labels?:string[]}[]=customGroups||[
  {title:'基本信息',pattern:/名称|编号|标识码|状态|描述|摘要|类型|版本/},
  {title:'参与方与数据来源',pattern:/供数|用数|持有|连接器|数据源|主体|联系人|机构|归属|数据来源/},
  {title:'交付与使用约束',pattern:/交付|用途|策略|等级|场景|行业|主题|频率|格式|质量|规模|授权|个人|模型|标注|合成|AI|更新方式|数据模态/},
  {title:'身份与证据',pattern:/签署|指纹|证书|哈希|Rekor|LogIndex|Proof|Timestamp|序列/},
  {title:'时间与生命周期',pattern:/时间|有效|首次|到期|创建|更新时间/},
 ]
 const used=new Set<number>()
 const sections=groups.map(g=>({title:g.title,fields:fields.filter((f,i)=>{if(used.has(i)||!(g.labels?g.labels.includes(String(f.props.label)):g.pattern?.test(String(f.props.label))))return false;used.add(i);return true})}))
 sections.push({title:'补充信息',fields:fields.filter((_,i)=>!used.has(i))})
 return <div className="business-details">{sections.filter(s=>s.fields.length).map(s=><section key={s.title}><h3>{s.title}</h3><dl>{s.fields.map((f,i)=><div key={i}><dt>{f.props.label}</dt><dd>{f.props.children}</dd></div>)}</dl></section>)}</div>
}
