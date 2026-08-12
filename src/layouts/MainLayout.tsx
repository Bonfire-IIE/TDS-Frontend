import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Dropdown, Avatar, Space, Tag } from 'antd'
import type { MenuProps } from 'antd'
import {
  CloudServerOutlined,
  DashboardOutlined,
  ApiOutlined,
  DatabaseOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  SnippetsOutlined,
  ShoppingOutlined,
  ProjectOutlined,
  AppstoreOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  LogoutOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getKusciaMasterConfig } from '../api/kuscia'

const { Header, Sider, Content } = Layout

const ROLE_LABELS: Record<string, string> = {
  provider: '供数方',
  user: '用数方',
  operator: '运营方',
  service_provider: '数商',
  applicant: '申请方',
  supervisor: '监管方',
}

const menuItems: MenuProps['items'] = [
  {
    key: 'overview',
    icon: <DashboardOutlined />,
    label: '运行概览',
    children: [
      { key: '/cluster', icon: <CloudServerOutlined />, label: '集群状态' },
      { key: '/connectors', icon: <ApiOutlined />, label: '连接器' },
      { key: '/kuscia-master', icon: <CloudServerOutlined />, label: '控制节点' },
      { key: '/kuscia-logs', icon: <FileTextOutlined />, label: 'Kuscia 日志' },
    ],
  },
  {
    key: 'data-catalog',
    icon: <DatabaseOutlined />,
    label: '数据目录',
    children: [
      { key: '/catalog', icon: <DatabaseOutlined />, label: '数据资源' },
      { key: '/products', icon: <ShoppingOutlined />, label: '数据产品' },
    ],
  },
  {
    key: 'digital-contracts',
    icon: <FileProtectOutlined />,
    label: '数字合约',
    children: [
      { key: '/contracts', icon: <FileProtectOutlined />, label: '数字合约' },
      { key: '/contract-templates', icon: <SnippetsOutlined />, label: '合约模板' },
    ],
  },
  { key: '/projects', icon: <ProjectOutlined />, label: '项目管理' },
  {
    key: 'application-management',
    icon: <AppstoreOutlined />,
    label: '应用管理',
    children: [
      { key: '/appimages', icon: <AppstoreOutlined />, label: 'AppImage' },
    ],
  },
  {
    key: 'governance',
    icon: <AuditOutlined />,
    label: '治理审计',
    children: [
      { key: '/usage', icon: <SafetyCertificateOutlined />, label: '使用控制记录' },
      { key: '/audit', icon: <AuditOutlined />, label: '审计存证' },
    ],
  },
]

const routeMenus: Array<{ path: string; parent?: string; selectedPath?: string }> = [
  { path: '/cluster', parent: 'overview' },
  { path: '/connectors', parent: 'overview' },
  { path: '/kuscia-master', parent: 'overview' },
  { path: '/kuscia-logs', parent: 'overview' },
  { path: '/catalog', parent: 'data-catalog' },
  { path: '/products', parent: 'data-catalog' },
  { path: '/appimages', parent: 'application-management' },
  { path: '/contracts', parent: 'digital-contracts' },
  { path: '/contract-templates', parent: 'digital-contracts' },
  { path: '/projects' },
  { path: '/jobs', selectedPath: '/projects' },
  { path: '/usage', parent: 'governance' },
  { path: '/audit', parent: 'governance' },
]

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const activeMenu = useMemo(
    () => routeMenus.find(({ path }) => location.pathname === path || location.pathname.startsWith(`${path}/`)),
    [location.pathname],
  )
  const activeParent = activeMenu?.parent
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    activeMenu?.parent ? [activeMenu.parent] : ['overview'],
  )

  useEffect(() => {
    if (activeParent) {
      setOpenKeys((keys) => (keys.includes(activeParent) ? keys : [...keys, activeParent]))
    }
  }, [activeParent])

  useEffect(() => {
    if (location.pathname === '/kuscia-master' || location.pathname === '/login' || location.pathname === '/register') return
    getKusciaMasterConfig()
      .then((config) => {
        // 已保存或已上传凭据即可进入平台；连接测试失败不应造成页面重定向循环。
        if (!config || !['connected', 'reachable', 'credentials_uploaded', 'error'].includes((config as any).status)) navigate('/kuscia-master', { replace: true })
      })
      .catch(() => undefined)
  }, [location.pathname, navigate])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" breakpoint="lg" collapsible>
        <div
          style={{
            height: 48,
            margin: 16,
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          🔥 Bonfire-TDS
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={activeMenu ? [activeMenu.selectedPath ?? activeMenu.path] : []}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            fontSize: 18,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>可信数据空间服务平台</span>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: logout }],
            }}
          >
            <Space style={{ cursor: 'pointer', fontSize: 14, fontWeight: 400 }}>
              <Avatar size="small" icon={<UserOutlined />} />
              {user?.name || user?.username}
              {user?.roles?.map((r) => (
                <Tag key={r} color="blue">
                  {ROLE_LABELS[r] ?? r}
                </Tag>
              ))}
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
