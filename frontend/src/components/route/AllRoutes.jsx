import ProtectedRoute from './ProtectedRoute'
import PublicRoute from './PublicRoute'
import AuthorityGuard from './AuthorityGuard'
import FallbackRoute from './FallbackRoute'
import AppRoute from './AppRoute'
import PageContainer from '@/components/template/PageContainer'
import { protectedRoutes, publicRoutes } from '@/configs/routes.config'
import appConfig from '@/configs/app.config'
import { useAuth } from '@/auth'
import { Routes, Route, Navigate } from 'react-router'
import { lazy } from 'react'

const { authenticatedEntryPath } = appConfig

const SharedTrip = lazy(() => import('@/views/others/SharedTrip'))

const AllRoutes = (props) => {
    const { user } = useAuth()

    return (
        <Routes>
            {/* Token-gated share-my-trip page: reachable with or without a
                session, so it sits outside both route guards. */}
            <Route path="/shared-trip/:rideId" element={<SharedTrip />} />
            <Route path="/" element={<PublicRoute />}>
                <Route
                    index
                    element={<FallbackRoute />}
                />
                {publicRoutes.map((route) => (
                    <Route
                        key={route.path}
                        path={route.path}
                        element={
                            <AppRoute
                                routeKey={route.key}
                                component={route.component}
                                {...route.meta}
                            />
                        }
                    />
                ))}
            </Route>
            <Route path="/" element={<ProtectedRoute />}>
                <Route
                    index
                    element={<Navigate replace to={authenticatedEntryPath} />}
                />
                {protectedRoutes.map((route, index) => (
                    <Route
                        key={route.key + index}
                        path={route.path}
                        element={
                            <AuthorityGuard
                                userAuthority={user.authority}
                                authority={route.authority}
                            >
                                <PageContainer {...props} {...route.meta}>
                                    <AppRoute
                                        routeKey={route.key}
                                        component={route.component}
                                        {...route.meta}
                                    />
                                </PageContainer>
                            </AuthorityGuard>
                        }
                    />
                ))}
                <Route path="*" element={<Navigate replace to="/" />} />
            </Route>
        </Routes>
    )
}

export default AllRoutes
