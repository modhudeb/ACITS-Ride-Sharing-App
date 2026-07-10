import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

const ACTIVE_STATUSES = ['scheduled', 'requested', 'accepted', 'in_progress']

const useActivePassengerRide = (uid) => {
    const [rideId, setRideId] = useState(null)

    useEffect(() => {
        if (!uid) {
            setRideId(null)
            return
        }

        // A passenger can only ever have one active ride (create_ride
        // enforces this server-side), so scope the listener to just that -
        // otherwise it watches the passenger's entire ride history forever,
        // most of which is long-completed and can never become "active"
        // again. Equality + "in" + limit needs no composite index.
        const q = query(
            collection(db, 'rides'),
            where('passengerId', '==', uid),
            where('status', 'in', ACTIVE_STATUSES),
            limit(1),
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRideId(snapshot.empty ? null : snapshot.docs[0].id)
        })

        return unsubscribe
    }, [uid])

    return rideId
}

export default useActivePassengerRide
