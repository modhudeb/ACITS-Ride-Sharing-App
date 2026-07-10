import { useMemo, lazy } from 'react'

const currentLayoutType = 'centered'

const layouts = {
    centered: lazy(() => import('./Centered')),
}

const AuthLayout = ({ children }) => {
    const Layout = useMemo(() => {
        return layouts[currentLayoutType]
    }, [])

    return <Layout>{children}</Layout>
}

export default AuthLayout
