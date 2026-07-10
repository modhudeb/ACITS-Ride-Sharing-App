import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

const useDriverLocation = (driverId) => {
    const [location, setLocation] = useState(null)

    useEffect(() => {
        if (!driverId) {
            setLocation(null)
            return
        }

        const unsubscribe = onSnapshot(
            doc(db, 'driver_profiles', driverId),
            (snapshot) => {
                setLocation(
                    snapshot.exists() ? snapshot.data()?.currentLocation || null : null,
                )
            },
        )

        return unsubscribe
    }, [driverId])

    return location
}

export default useDriverLocation
