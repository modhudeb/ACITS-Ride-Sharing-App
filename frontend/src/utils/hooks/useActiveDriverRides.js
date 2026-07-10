import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'
import { normalizeRideDoc } from './useRideListener'

const ACTIVE_STATUSES = ['accepted', 'in_progress']

// Pooled trucks can carry several rides at once, so this returns every
// active ride assigned to the driver, not just the first one.
const useActiveDriverRides = (uid) => {
    const [rides, setRides] = useState([])

    useEffect(() => {
        if (!uid) {
            setRides([])
            return
        }

        const q = query(collection(db, 'rides'), where('driverId', '==', uid))

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRides(
                snapshot.docs
                    .filter((docSnap) =>
                        ACTIVE_STATUSES.includes(docSnap.data().status),
                    )
                    .map((docSnap) =>
                        normalizeRideDoc(docSnap.id, docSnap.data()),
                    ),
            )
        })

        return unsubscribe
    }, [uid])

    return rides
}

export default useActiveDriverRides
