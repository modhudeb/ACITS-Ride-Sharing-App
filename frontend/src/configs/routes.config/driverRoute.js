import { lazy } from 'react'
import { DRIVER } from '@/constants/roles.constant'

const driverRoute = [
    {
        key: 'driver.home',
        path: '/driver',
        component: lazy(() => import('@/views/driver/DriverHome')),
        authority: [DRIVER],
    },
    {
        key: 'driver.history',
        path: '/driver/history',
        component: lazy(() => import('@/views/rides/RideHistory')),
        authority: [DRIVER],
    },
    {
        key: 'driver.earnings',
        path: '/driver/earnings',
        component: lazy(() => import('@/views/driver/Earnings')),
        authority: [DRIVER],
    },
]

export default driverRoute
