import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

const ACTIVE_STATUSES = ['scheduled', 'requested', 'accepted', 'in_progress']

const useActivePassengerRide = (uid) => {
    const [rideId, setRideId] = useState(null)

    useEffect(() => {
        if (!uid) {
            setRideId(null)
            return
        }

        const q = query(collection(db, 'rides'), where('passengerId', '==', uid))

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const active = snapshot.docs.find((docSnap) =>
                ACTIVE_STATUSES.includes(docSnap.data().status),
            )
            setRideId(active ? active.id : null)
        })

        return unsubscribe
    }, [uid])

    return rideId
}

export default useActivePassengerRide
