import type { ReactNode } from 'react'
import { Alert, Button, Card, Space } from 'antd'
export default function EditorPage({open,title,children,onCancel,onClose,onOk,confirmLoading,extra,loading,error}:{open?:boolean;title?:ReactNode;children?:ReactNode;onCancel?:()=>void;onClose?:()=>void;onOk?:()=>void;confirmLoading?:boolean;loading?:boolean;error?:boolean;extra?:ReactNode;[key:string]:unknown}) {
 if(!open)return null
 return <section className="editor-page"><Card loading={loading} title={title} extra={extra||<Space><Button onClick={onCancel||onClose}>返回</Button>{onOk&&!error&&<Button type="primary" loading={confirmLoading} onClick={onOk}>保存并提交</Button>}</Space>}>{error?<Alert type="error" message="记录不存在、加载失败或当前账号无编辑权限"/>:children}</Card></section>
}
