import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'
import haversineDistanceKm from '@/utils/haversineDistanceKm'

// Pending requests are already few by construction (3-minute TTL), so the
// Firestore query stays global and proximity is a cheap client-side filter.
const MAX_DISTANCE_KM = 10

const usePendingRideRequests = (currentDriverUid, position) => {
    const [raw, setRaw] = useState([])

    useEffect(() => {
        if (!currentDriverUid) {
            setRaw([])
            return
        }

        const q = query(
            collection(db, 'ride_requests'),
            where('status', '==', 'pending'),
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRaw(
                snapshot.docs.map((docSnap) => ({
                    rideId: docSnap.id,
                    ...docSnap.data(),
                })),
            )
        })

        return unsubscribe
    }, [currentDriverUid])

    // Filtering happens at render time so a moving GPS position never forces
    // the Firestore listener to re-subscribe.
    return raw.filter((request) => {
        if ((request.declinedBy || []).includes(currentDriverUid)) return false
        // Hide requests past their TTL even before the backend sweeper marks
        // them expired. Docs without expiresAt predate the field = stale.
        const expiresAt = request.expiresAt
        if (!expiresAt?.toMillis) return false
        if (expiresAt.toMillis() < Date.now()) return false
        if (position && request.pickup) {
            return haversineDistanceKm(position, request.pickup) <= MAX_DISTANCE_KM
        }
        return true
    })
}

export default usePendingRideRequests
