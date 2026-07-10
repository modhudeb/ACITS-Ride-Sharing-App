import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'
import { normalizeRideDoc } from './useRideListener'

const ACTIVE_STATUSES = ['accepted', 'in_progress']

// Pooled trucks can carry several rides at once, so this returns every
// active ride assigned to the driver, not just the first one. Scoped to
// status in ACTIVE_STATUSES (equality + "in" needs no composite index) so
// the listener doesn't watch the driver's entire ride history forever -
// max_passengers caps at 6, so 10 is headroom, not a real limit in practice.
const useActiveDriverRides = (uid) => {
    const [rides, setRides] = useState([])

    useEffect(() => {
        if (!uid) {
            setRides([])
            return
        }

        const q = query(
            collection(db, 'rides'),
            where('driverId', '==', uid),
            where('status', 'in', ACTIVE_STATUSES),
            limit(10),
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRides(
                snapshot.docs.map((docSnap) =>
                    normalizeRideDoc(docSnap.id, docSnap.data()),
                ),
            )
        })

        return unsubscribe
    }, [uid])

    return rides
}

export default useActiveDriverRides
