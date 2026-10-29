import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Dropdown, Avatar, Space, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  FireOutlined,
  LeftOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const { Header, Sider, Content } = Layout

const ROLE_LABELS: Record<string, string> = {
  provider: '供数方',
  user: '用数方',
  operator: '运营方',
  service_provider: '数商',
  applicant: '申请方',
  supervisor: '监管方',
}

function menuItems(isOperator: boolean): MenuProps['items'] {
  return [
    {key:'/workspace',label:'工作台'},
    {key:'data-catalog',label:'数据协作',children:[{key:'/catalog',label:'数据资源'},{key:'/products',label:'数据产品'},{key:'/contracts',label:'数字合约'}]},
    {key:'privacy-computing',label:'计算协作',children:[{key:'/privacy-computing',label:'计算项目'},{key:'/applications',label:'应用模板'},{key:'/appimages',label:'应用镜像'}]},
    {key:'overview',label:'接入与配置',children:[{key:'/connectors',label:'连接器'},{key:'/contract-templates',label:'合约模板'},...(isOperator?[{key:'/execution-identities',label:'执行主体身份'}]:[])]},
    {key:'governance',label:'治理与追踪',children:[{key:'/usage',label:'使用控制'},{key:'/audit',label:'审计存证'}]},
  ]
}

const routeMenus: Array<{ path: string; parent?: string; selectedPath?: string }> = [
  { path: '/workspace' },
  { path: '/connectors', parent: 'overview' },
  { path: '/execution-identities', parent: 'overview' },
  { path: '/catalog', parent: 'data-catalog' },
  { path: '/products', parent: 'data-catalog' },
  { path: '/contracts', parent: 'data-catalog' },
  { path: '/contract-templates', parent: 'overview' },
  { path: '/privacy-computing', parent: 'privacy-computing' },
  { path: '/applications', parent: 'privacy-computing' },
  { path: '/appimages', parent: 'privacy-computing' },
  { path: '/usage', parent: 'governance' },
  { path: '/audit', parent: 'governance' },
]

const PAGE_TITLES: Record<string, string> = {
  '/execution-identities':'执行主体身份', '/workspace': '工作台', '/connectors': '连接器', '/catalog': '数据资源', '/products': '数据产品',
  '/contracts': '数字合约', '/contract-templates': '合约模板', '/privacy-computing': '隐私保护计算', '/applications': '应用', '/appimages': '应用镜像',
  '/usage': '使用控制记录', '/audit': '审计存证',
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const activeMenu = useMemo(
    () => routeMenus.find(({ path }) => location.pathname === path || location.pathname.startsWith(`${path}/`)),
    [location.pathname],
  )
  const activeParent = activeMenu?.parent
  const [openKeys, setOpenKeys] = useState<string[]>(['data-catalog', 'privacy-computing', 'overview', 'governance'])
  const workflowPage = new URLSearchParams(location.search).get('tab') === 'workflow'
  const [collapsed,setCollapsed]=useState(workflowPage || window.innerWidth < 992)
  useEffect(()=>{if(workflowPage)setCollapsed(true)},[workflowPage])
  useEffect(()=>{const change=(event:Event)=>{if((event as CustomEvent).detail)setCollapsed(true)};window.addEventListener('workflow-editor-active',change);return ()=>window.removeEventListener('workflow-editor-active',change)},[])
  const pageTitle = PAGE_TITLES[activeMenu?.path ?? ''] ?? '可信数据空间'
  const workspacePage = location.pathname === '/workspace'
  const computingPage = ['/privacy-computing', '/applications', '/appimages'].some(path => location.pathname === path || location.pathname.startsWith(`${path}/`))

  useEffect(() => {
    if (activeParent) {
      setOpenKeys((keys) => (keys.includes(activeParent) ? keys : [...keys, activeParent]))
    }
  }, [activeParent])

  return (
    <Layout className={`app-shell${workspacePage ? ' workspace-shell' : ''}`} style={{ minHeight: '100dvh' }}>
      <a className="skip-link" href="#main-content">跳转到主要内容</a>
      {!collapsed && <button type="button" className="sidebar-backdrop" aria-label="关闭全局导航" onClick={()=>setCollapsed(true)} />}
      {collapsed && <button type="button" className="sidebar-reopen" aria-label="恢复全局导航" aria-expanded={false} aria-controls="global-sidebar" title="展开侧边栏" onClick={()=>setCollapsed(false)}><span aria-hidden="true" /></button>}
      <Sider id="global-sidebar" className="app-sider" theme="light" width={248} collapsedWidth={0} breakpoint="lg" trigger={null} collapsed={collapsed} onBreakpoint={broken=>{if(broken)setCollapsed(true)}}>
        {!collapsed&&<><div className="brand">
          <span className="brand-mark" aria-hidden="true"><FireOutlined /></span>
          <span className="brand-copy">中心平台<small>Bonfire-TDS</small></span>
        </div>
        <Menu
          className="app-menu"
          theme="light"
          mode="inline"
          selectedKeys={activeMenu ? [activeMenu.selectedPath ?? activeMenu.path] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          items={menuItems(Boolean(user?.roles.includes('operator')))}
          onClick={({ key }) => {navigate(key);if(window.innerWidth<992)setCollapsed(true)}}
        />
        <button className="sidebar-collapse" type="button" aria-label="收起全局导航" aria-expanded={true} aria-controls="global-sidebar" onClick={()=>setCollapsed(true)}><LeftOutlined aria-hidden="true" /><span>收起侧边栏</span></button>
        </>}
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-context">
            <div className="header-eyebrow">可信数据空间服务平台</div>
            <div className="header-title">{pageTitle}</div>
          </div>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }],
            }}
          >
            <button className="header-user" type="button" aria-label="账户菜单"><Space>
              <Avatar size={30} icon={<UserOutlined />} style={{ background: 'var(--text)', color: 'var(--surface)' }} />
              {user?.name || user?.username}
              {user?.roles?.map((r) => (
                <Tag key={r} color="blue">
                  {ROLE_LABELS[r] ?? r}
                </Tag>
              ))}
            </Space></button>
          </Dropdown>
        </Header>
        <Content className={`content-canvas${computingPage ? ' computation-content' : ''}${workspacePage ? ' workspace-content' : ''}`} id="main-content" tabIndex={-1}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
