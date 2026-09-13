import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import type { UserRole } from '../lib/types'

export function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-black/40 text-sm">Caricamento…</div>
    )
  }
  if (!session || !profile) return <Navigate to="/" replace />
  if (!roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}
