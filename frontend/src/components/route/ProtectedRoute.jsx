import appConfig from '@/configs/app.config'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/auth'
import AdminLogin from '@/views/admin/AdminLogin'

const { unAuthenticatedEntryPath } = appConfig

const ProtectedRoute = () => {
    const { authenticated } = useAuth()

    const pathName = location.pathname

    if (!authenticated) {
        // /admin gets its own username+password prompt instead of bouncing to
        // the Rider/Driver sign-in - rendered in place so the URL stays
        // /admin and the dashboard just takes over once authenticated flips
        // true.
        if (pathName.startsWith('/admin')) {
            return <AdminLogin />
        }

        const getPathName =
            pathName === '/' ? '' : `?${REDIRECT_URL_KEY}=${pathName}`

        return (
            <Navigate
                replace
                to={`${unAuthenticatedEntryPath}${getPathName}`}
            />
        )
    }

    return <Outlet />
}

export default ProtectedRoute
