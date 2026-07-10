import { lazy } from 'react'
import { PASSENGER } from '@/constants/roles.constant'

const passengerRoute = [
    {
        key: 'passenger.bookRide',
        path: '/passenger',
        component: lazy(() => import('@/views/passenger/BookRide')),
        authority: [PASSENGER],
    },
    {
        key: 'passenger.history',
        path: '/passenger/history',
        component: lazy(() => import('@/views/rides/RideHistory')),
        authority: [PASSENGER],
    },
]

export default passengerRoute
