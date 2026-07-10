import { Suspense } from 'react'
import Loading from '@/components/shared/Loading'
import { useAuth } from '@/auth'
import { useThemeStore } from '@/store/themeStore'
import PostLoginLayout from './PostLoginLayout'
import PreLoginLayout from './PreLoginLayout'
import MapLayout from './MapLayout'
import { ADMIN } from '@/constants/roles.constant'

const Layout = ({ children }) => {
    const layoutType = useThemeStore((state) => state.layout.type)

    const { authenticated, user } = useAuth()
    const isAdmin = user.authority?.includes(ADMIN)

    return (
        <Suspense
            fallback={
                <div className="flex flex-auto flex-col h-[100vh]">
                    <Loading loading={true} />
                </div>
            }
        >
            {authenticated ? (
                isAdmin ? (
                    <PostLoginLayout layoutType={layoutType}>
                        {children}
                    </PostLoginLayout>
                ) : (
                    <MapLayout>{children}</MapLayout>
                )
            ) : (
                <PreLoginLayout>{children}</PreLoginLayout>
            )}
        </Suspense>
    )
}

export default Layout
