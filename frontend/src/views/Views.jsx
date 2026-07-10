import { Suspense } from 'react'
import Loading from '@/components/shared/Loading'
import { useLocation } from 'react-router'
import AllRoutes from '@/components/route/AllRoutes'

const Views = (props) => {

    const location = useLocation()

    return (
        <Suspense 
            key={location.key}
            fallback={<Loading loading={true} className="w-full" />}
        >
            <AllRoutes {...props} />
        </Suspense>
    )
}

export default Views
