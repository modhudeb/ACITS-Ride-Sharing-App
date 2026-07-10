import authRoute from '@/configs/routes.config/authRoute'
import { useLocation } from 'react-router'
import AuthLayout from './AuthLayout'

const PreLoginLayout = ({ children }) => {
    const location = useLocation()

    const { pathname } = location

    const isAuthPath = authRoute.some((route) => route.path === pathname)

    return (
        <div className="flex flex-auto flex-col h-[100vh]">
            {isAuthPath ? <AuthLayout>{children}</AuthLayout> : children}
        </div>
    )
}

export default PreLoginLayout
