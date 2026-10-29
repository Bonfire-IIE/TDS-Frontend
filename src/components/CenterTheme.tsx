import { useEffect, useState, type ReactNode } from 'react'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { bonfireTheme, darkTheme } from '../theme'
export default function CenterTheme({children}:{children:ReactNode}) {
 const [dark,setDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches)
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const change=()=>setDark(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark])
 return <ConfigProvider locale={zhCN} theme={dark?darkTheme:bonfireTheme}>{children}</ConfigProvider>
}
