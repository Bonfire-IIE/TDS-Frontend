import { Children, isValidElement, type ReactNode } from 'react'
import { Card, Modal, Drawer, type CardProps } from 'antd'
import { useParams } from 'react-router-dom'
import EditorPage from './EditorPage'
import DetailPage from './DetailPage'
/** Render list or detail explicitly, preserving dialogs used by detail actions. */
export default function RouteSurface({children,plain,...props}:CardProps & {plain?:boolean;children?:ReactNode}) {
 const {id}=useParams()
 const editor=Children.toArray(children).find(child=>isValidElement<{open?:boolean}>(child)&&child.type===EditorPage&&child.props.open)
 if(editor)return <div>{editor}</div>
 if(id) return <div>{Children.toArray(children).filter(child=>isValidElement(child)&&[DetailPage,Modal,Drawer].includes(child.type as typeof DetailPage))}</div>
 return plain?<div>{children}</div>:<Card {...props}>{children}</Card>
}
