import { useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
export function useDetailRoute<T extends {id:string}>(base:string,items:T[]) {
 const {id}=useParams();const navigate=useNavigate();const {search}=useLocation()
 const selected=items.find(item=>item.id===id)||null
 const select=useCallback((item:T|null)=>navigate((item?`${base}/${encodeURIComponent(item.id)}`:base)+search),[base,navigate,search])
 return [selected,select] as const
}
