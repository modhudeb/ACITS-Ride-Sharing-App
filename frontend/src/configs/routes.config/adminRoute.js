import { lazy } from 'react'
import { ADMIN } from '@/constants/roles.constant'

const adminRoute = [
    {
        key: 'admin.dashboard',
        path: '/admin',
        component: lazy(() => import('@/views/admin/Dashboard')),
        authority: [ADMIN],
    },
    {
        key: 'admin.driverApproval',
        path: '/admin/drivers',
        component: lazy(() => import('@/views/admin/DriverApproval')),
        authority: [ADMIN],
    },
    {
        key: 'admin.passengerManagement',
        path: '/admin/passengers',
        component: lazy(() => import('@/views/admin/PassengerManagement')),
        authority: [ADMIN],
    },
    {
        key: 'admin.pricingConfig',
        path: '/admin/pricing',
        component: lazy(() => import('@/views/admin/PricingConfig')),
        authority: [ADMIN],
    },
    {
        key: 'admin.rideManagement',
        path: '/admin/rides',
        component: lazy(() => import('@/views/admin/RideManagement')),
        authority: [ADMIN],
    },
    {
        key: 'admin.liveOps',
        path: '/admin/live',
        component: lazy(() => import('@/views/admin/LiveOps')),
        authority: [ADMIN],
        meta: { pageContainerType: 'gutterless' },
    },
]

export default adminRoute
