'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, BookOpen, Users, Image, Type, Eye, Settings, BookMarked } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { label:'Dashboard',   href:'/dashboard',             icon:LayoutDashboard, roles:['ALL'] },
  { label:'Submissions', href:'/dashboard/submissions',  icon:FileText,        roles:['ALL'] },
  { label:'Publications',href:'/dashboard/publications', icon:BookOpen,        roles:['SUPER_ADMIN','EDITOR_IN_CHIEF','SECTION_EDITOR'] },
  { label:'Editorial',   href:'/dashboard/editorial',    icon:Users,           roles:['SUPER_ADMIN','EDITOR_IN_CHIEF','SECTION_EDITOR','PEER_REVIEWER'] },
  { label:'Artwork',     href:'/dashboard/artwork',      icon:Image,           roles:['SUPER_ADMIN','EDITOR_IN_CHIEF','ARTWORK_EDITOR'] },
  { label:'Typesetting', href:'/dashboard/typesetting',  icon:Type,            roles:['SUPER_ADMIN','EDITOR_IN_CHIEF','TYPESETTER'] },
  { label:'Proofing',    href:'/dashboard/proofing',     icon:Eye,             roles:['ALL'] },
  { label:'Settings',    href:'/dashboard/settings',     icon:Settings,        roles:['SUPER_ADMIN','EDITOR_IN_CHIEF'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user }  = useAuth()
  const visible   = NAV.filter((n) => n.roles.includes('ALL') || n.roles.includes(user?.role ?? ''))

  return (
    <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2.5 border-b border-gray-200 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
          <BookMarked size={18} className="text-white" />
        </div>
        <span className="text-base font-semibold text-gray-900">PubFlow</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {visible.map((item) => {
            const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <li key={item.href}>
                <Link href={item.href} className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}>
                  <Icon size={16} className={active ? 'text-brand-500' : 'text-gray-400'} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {user && (
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600">
              {user.firstName?.[0]?.toUpperCase() ?? user.email[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900">
                {user.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : user.email}
              </p>
              <p className="truncate text-xs text-gray-400">{user.role.replace(/_/g,' ')}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
