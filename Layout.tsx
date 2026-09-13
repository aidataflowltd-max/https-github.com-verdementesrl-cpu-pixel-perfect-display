import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/AuthContext'

export function PortalLayout({
  children,
  nav,
  title,
}: {
  children: ReactNode
  nav: { to: string; label: string }[]
  title: string
}) {
  const location = useLocation()
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-paper flex">
      <aside className="w-64 shrink-0 bg-night text-white flex flex-col">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-verified" />
            <span className="font-semibold tracking-tight">VERIFIED</span>
          </div>
          <div className="text-xs text-white/40 mt-1">{title}</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`block rounded-lg px-3 py-2 text-sm transition ${
                location.pathname === item.to || location.pathname.startsWith(item.to + '/')
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-white/40">
          <div className="truncate">{profile?.full_name ?? profile?.role}</div>
          <button onClick={() => signOut()} className="mt-2 text-white/60 hover:text-white transition">
            Esci
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
