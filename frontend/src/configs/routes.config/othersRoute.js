import { lazy } from 'react'
import { ADMIN, PASSENGER, DRIVER } from '@/constants/roles.constant'

const othersRoute = [
    {
        key: 'accessDenied',
        path: `/access-denied`,
        component: lazy(() => import('@/views/others/AccessDenied')),
        authority: [ADMIN, PASSENGER, DRIVER],
        meta: {
            pageBackgroundType: 'plain',
            pageContainerType: 'contained',
        },
    },
    {
        key: 'profile',
        path: '/profile',
        component: lazy(() => import('@/views/others/Profile')),
        authority: [ADMIN, PASSENGER, DRIVER],
    },
]

export default othersRoute
