import { useLocation, useNavigate, useParams } from 'react-router-dom'
/** Editor URLs support refresh and links; unsaved changes remain local. */
export function useEditorRoute(base:string) {
 const {pathname,search}=useLocation();const navigate=useNavigate();const {id}=useParams()
 const open=pathname===base+'/new'||pathname.endsWith('/edit')
 const setOpen=(value:boolean|string)=>navigate((value?(typeof value==='string'?`${base}/${encodeURIComponent(value)}/edit`:base+'/new'):base)+search)
 return [open,setOpen,pathname.endsWith('/edit')?id:undefined] as const
}
