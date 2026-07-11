import { useState, Suspense, lazy } from 'react'
import classNames from 'classnames'
import Drawer from '@/components/ui/Drawer'
import NavToggle from '@/components/shared/NavToggle'
import { DIR_RTL } from '@/constants/theme.constant'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import navigationConfig from '@/configs/navigation.config'
import appConfig from '@/configs/app.config'
import { APP_NAME } from '@/constants/app.constant'
import { useThemeStore } from '@/store/themeStore'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useSessionUser } from '@/store/authStore'

const VerticalMenuContent = lazy(
    () => import('@/components/template/VerticalMenuContent'),
)

const MobileNavToggle = withHeaderItem(NavToggle)

const MobileNav = ({ translationSetup = appConfig.activeNavTranslation }) => {
    const [isOpen, setIsOpen] = useState(false)

    const handleOpenDrawer = () => {
        setIsOpen(true)
    }

    const handleDrawerClose = () => {
        setIsOpen(false)
    }

    const direction = useThemeStore((state) => state.direction)
    const currentRouteKey = useRouteKeyStore((state) => state.currentRouteKey)

    const userAuthority = useSessionUser((state) => state.user.authority)
    const sessionUser = useSessionUser((state) => state.user)

    return (
        <>
            <div className="text-2xl" onClick={handleOpenDrawer}>
                <MobileNavToggle toggled={isOpen} />
            </div>
            <Drawer
                title={
                    <div className="flex min-w-0 items-center gap-2">
                        <img
                            src="/img/logo/logo-light-streamline.png"
                            alt={APP_NAME}
                            className="h-6 w-6 shrink-0 rounded"
                        />
                        <div className="min-w-0">
                            <p className="heading-text truncate text-sm font-bold leading-tight">
                                {APP_NAME}
                            </p>
                            <p className="truncate text-xs text-gray-400">
                                {sessionUser?.email}
                            </p>
                        </div>
                    </div>
                }
                isOpen={isOpen}
                bodyClass={classNames('p-0', 'safe-y')}
                width={330}
                placement={direction === DIR_RTL ? 'right' : 'left'}
                onClose={handleDrawerClose}
                onRequestClose={handleDrawerClose}
            >
                <Suspense fallback={<></>}>
                    {isOpen && (
                        <VerticalMenuContent
                            collapsed={false}
                            navigationTree={navigationConfig}
                            routeKey={currentRouteKey}
                            userAuthority={userAuthority}
                            direction={direction}
                            translationSetup={translationSetup}
                            onMenuItemClick={handleDrawerClose}
                        />
                    )}
                </Suspense>
            </Drawer>
        </>
    )
}

export default MobileNav
