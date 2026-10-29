import type { ReactNode } from 'react'
import { Alert, Button, Card } from 'antd'
import { useParams } from 'react-router-dom'
export default function DetailPage({open,title,onClose,children,loading,extra,error}:{open?:boolean;title?:ReactNode;onClose:()=>void;children?:ReactNode;loading?:boolean;error?:boolean;extra?:ReactNode;[key:string]:unknown}) {
 const {id}=useParams()
 if(!open&&!id)return null
 return <section className="detail-page"><Card loading={loading} title={title} extra={<><Button onClick={onClose}>返回列表</Button>{extra}</>}>{open?children:<Alert type={error?"error":"warning"} message={error?"详情加载失败，请刷新重试":"记录不存在或不在当前账号的可见范围内"}/>}</Card></section>
}
