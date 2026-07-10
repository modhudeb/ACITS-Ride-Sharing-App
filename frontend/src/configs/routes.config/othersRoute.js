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
]

export default othersRoute
