import { useSearchParams } from 'react-router-dom'
import type { SetStateAction } from 'react'
/** List filters survive details, reloads and browser back/forward. */
export function useListState<T extends Record<string,string>>(defaults:T):[T,(value:SetStateAction<T>)=>void] {
 const [params,setParams]=useSearchParams()
 const state=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,params.get(key)??value])) as T
 const setState=(value:SetStateAction<T>)=>setParams(previous=>{
  const current=Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,previous.get(key)??fallback])) as T
  const nextValue=typeof value==='function'?value(current):value
  const next=new URLSearchParams(previous)
  Object.entries(nextValue).forEach(([key,value])=>value?next.set(key,value):next.delete(key))
  next.delete('page');return next
 },{replace:true})
 return [state,setState]
}
