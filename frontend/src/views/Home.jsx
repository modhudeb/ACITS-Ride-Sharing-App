import { Navigate } from 'react-router'
import { useAuth } from '@/auth'
import { ADMIN, DRIVER, PASSENGER } from '@/constants/roles.constant'

const Home = () => {
    const { user } = useAuth()
    const authority = user.authority || []

    if (authority.includes(ADMIN)) {
        return <Navigate to="/admin" replace />
    }

    if (authority.includes(DRIVER)) {
        return <Navigate to="/driver" replace />
    }

    if (authority.includes(PASSENGER)) {
        return <Navigate to="/passenger" replace />
    }

    return (
        <div>
            <h3 className="mb-1">Welcome</h3>
            <p>
                Signed in as <span className="font-semibold">{user.email}</span>
            </p>
        </div>
    )
}

export default Home
