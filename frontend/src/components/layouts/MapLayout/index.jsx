import { Link } from 'react-router'
import Button from '@/components/ui/Button'
import LayoutBase from '@/components/template/LayoutBase'
import ChatAssistant from '@/components/shared/ChatAssistant'
import { useAuth } from '@/auth'
import { LAYOUT_BLANK } from '@/constants/theme.constant'
import { PASSENGER } from '@/constants/roles.constant'
import { APP_NAME } from '@/constants/app.constant'

const MapLayout = ({ children }) => {
    const { user, signOut } = useAuth()
    const isPassenger = user.authority?.includes(PASSENGER)
    const homePath = isPassenger ? '/passenger' : '/driver'
    const historyPath = `${homePath}/history`

    return (
        <LayoutBase
            type={LAYOUT_BLANK}
            className="app-layout-map flex flex-col h-[100dvh]"
        >
            <header className="flex items-center justify-between px-4 pb-3 safe-top border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <Link to={homePath} className="flex items-center gap-2">
                    <img
                        src="/img/logo/logo-light-streamline.png"
                        alt={APP_NAME}
                        className="h-7 w-7"
                    />
                    <span className="font-bold text-lg heading-text">
                        {APP_NAME}
                    </span>
                </Link>
                <div className="flex items-center gap-3">
                    {!isPassenger && (
                        <Link to="/driver/earnings" className="text-sm">
                            Earnings
                        </Link>
                    )}
                    <Link to={historyPath} className="text-sm">
                        History
                    </Link>
                    <span className="text-sm hidden sm:inline">
                        {user.userName || user.email}
                    </span>
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
