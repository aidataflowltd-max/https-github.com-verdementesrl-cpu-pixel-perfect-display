import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'

import Landing from './pages/Landing'
import BankLogin from './pages/bank/BankLogin'
import BankDashboard from './pages/bank/BankDashboard'
import NewRequest from './pages/bank/NewRequest'
import RequestDetail from './pages/bank/RequestDetail'
import InviteFlow from './pages/company/InviteFlow'
import CompanyDashboard from './pages/company/CompanyDashboard'
import SuperAdminLogin from './pages/admin/SuperAdminLogin'
import SuperAdmin from './pages/admin/SuperAdmin'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route path="/bank/login" element={<BankLogin />} />
          <Route
            path="/bank/dashboard"
            element={
              <ProtectedRoute roles={['bank_admin', 'bank_user']}>
                <BankDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank/new-request"
            element={
              <ProtectedRoute roles={['bank_admin', 'bank_user']}>
                <NewRequest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank/request/:id"
            element={
              <ProtectedRoute roles={['bank_admin', 'bank_user']}>
                <RequestDetail />
              </ProtectedRoute>
            }
          />

          <Route path="/request/:token" element={<InviteFlow />} />
          <Route
            path="/company/dashboard/:id"
            element={
              <ProtectedRoute roles={['company_contact']}>
                <CompanyDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/super-admin/login" element={<SuperAdminLogin />} />
          <Route
            path="/super-admin"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <SuperAdmin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/super-admin/:tab"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <SuperAdmin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
