import { Link, useLocation } from 'react-router'
import Button from '@/components/ui/Button'
import LayoutBase from '@/components/template/LayoutBase'
import ChatAssistant from '@/components/shared/ChatAssistant'
import { useAuth } from '@/auth'
import { LAYOUT_BLANK } from '@/constants/theme.constant'
import { PASSENGER } from '@/constants/roles.constant'
import { APP_NAME } from '@/constants/app.constant'

const MapLayout = ({ children }) => {
    const { user, signOut } = useAuth()
    const { pathname } = useLocation()
    const isPassenger = user.authority?.includes(PASSENGER)
    const homePath = isPassenger ? '/passenger' : '/driver'
    const historyPath = `${homePath}/history`
    const earningsPath = '/driver/earnings'

    const initials = (user.userName || user.email || '?')
        .trim()
        .slice(0, 2)
        .toUpperCase()

    const navItems = isPassenger
        ? [
              { to: homePath, label: 'Home' },
              { to: historyPath, label: 'History' },
          ]
        : [
              { to: homePath, label: 'Home' },
              { to: earningsPath, label: 'Earnings' },
              { to: historyPath, label: 'History' },
          ]

    const isActive = (to) =>
        pathname === to || (to !== homePath && pathname.startsWith(`${to}/`))

    return (
        <LayoutBase
            type={LAYOUT_BLANK}
            className="app-layout-map flex flex-col h-[100dvh]"
        >
            <header className="safe-top flex items-center justify-between gap-2 border-b border-gray-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/90 sm:px-4">
                <Link to={homePath} className="flex shrink-0 items-center gap-2">
                    <img
                        src="/img/logo/logo-light-streamline.png"
                        alt={APP_NAME}
                        className="h-7 w-7 rounded-md"
                    />
                    <span className="heading-text hidden text-base font-bold sm:block sm:text-lg">
                        {APP_NAME}
                    </span>
                </Link>

                <nav className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`rounded-full px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm ${
                                isActive(item.to)
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                        >
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="flex shrink-0 items-center gap-2">
                    <Link
                        to="/profile"
                        aria-label="View profile"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white transition-transform hover:scale-105"
                    >
                        {initials}
                    </Link>
                    <Button size="sm" variant="plain" onClick={() => signOut()}>
                        Sign out
                    </Button>
                </div>
            </header>
            <main className="flex-1 overflow-hidden">{children}</main>
            {isPassenger && <ChatAssistant />}
        </LayoutBase>
    )
}

export default MapLayout
