import { lazy } from 'react'
import authRoute from './authRoute'
import othersRoute from './othersRoute'
import passengerRoute from './passengerRoute'
import driverRoute from './driverRoute'
import adminRoute from './adminRoute'

export const publicRoutes = [...authRoute]

export const protectedRoutes = [
    {
        key: 'home',
        path: '/home',
        component: lazy(() => import('@/views/Home')),
        authority: [],
    },
    ...passengerRoute,
    ...driverRoute,
    ...adminRoute,
    ...othersRoute,
]
