import { Routes, Route, Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import Workspace from './pages/Workspace'
import MainLayout from './layouts/MainLayout'
import Connectors from './pages/Connectors'
import Catalog from './pages/Catalog'
import Products from './pages/Products'
import Contracts from './pages/Contracts'
import ContractTemplates from './pages/ContractTemplates'
import UsageRecords from './pages/UsageRecords'
import AuditEvents from './pages/AuditEvents'
import Login from './pages/Login'
import Register from './pages/Register'
import Projects from './pages/Projects'
import AppImages from './pages/AppImages'
import Applications from './pages/Applications'
import ExecutionIdentities from './pages/ExecutionIdentities'
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
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/connectors/:id" element={<Connectors />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/catalog/:id" element={<Catalog />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<Products />} />
        <Route path="/products/new" element={<Products />} />
        <Route path="/products/:id/edit" element={<Products />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/contracts/:id" element={<Contracts />} />
        <Route path="/contract-templates" element={<ContractTemplates />} />
        <Route path="/privacy-computing" element={<Projects />} />
        <Route path="/privacy-computing/:projectId" element={<Projects />} />
        <Route path="/execution-identities" element={<ExecutionIdentities />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/applications/:id" element={<Applications />} />
        <Route path="/appimages" element={<AppImages />} />
        <Route path="/appimages/:id" element={<AppImages />} />
        <Route path="/appimages/new" element={<AppImages />} />
        <Route path="/appimages/:id/edit" element={<AppImages />} />
        <Route path="/usage" element={<UsageRecords />} />
        <Route path="/audit" element={<AuditEvents />} />
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Route>
    </Routes>
  )
}
