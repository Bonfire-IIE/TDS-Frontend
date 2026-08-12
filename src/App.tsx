import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import MainLayout from './layouts/MainLayout'
import ClusterStatus from './pages/ClusterStatus'
import Connectors from './pages/Connectors'
import Catalog from './pages/Catalog'
import Products from './pages/Products'
import Contracts from './pages/Contracts'
import ContractTemplates from './pages/ContractTemplates'
import AppImages from './pages/AppImages'
import Projects from './pages/Projects'
import UsageRecords from './pages/UsageRecords'
import AuditEvents from './pages/AuditEvents'
import Login from './pages/Login'
import Register from './pages/Register'
import KusciaMaster from './pages/KusciaMaster'
import KusciaLogs from './pages/KusciaLogs'
import KusciaMasterOnboarding from './pages/KusciaMasterOnboarding'
import { useAuth } from './auth/AuthContext'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 200 }}>
        <Spin size="large" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/setup/kuscia-master" element={<RequireAuth><KusciaMasterOnboarding /></RequireAuth>} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/cluster" element={<ClusterStatus />} />
        <Route path="/kuscia-master" element={<KusciaMaster />} />
        <Route path="/kuscia-logs" element={<KusciaLogs />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/products" element={<Products />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/contract-templates" element={<ContractTemplates />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<Projects />} />
        <Route path="/jobs" element={<Navigate to="/projects" replace />} />
        <Route path="/appimages" element={<AppImages />} />
        <Route path="/usage" element={<UsageRecords />} />
        <Route path="/audit" element={<AuditEvents />} />
        <Route path="*" element={<Navigate to="/cluster" replace />} />
      </Route>
    </Routes>
  )
}
