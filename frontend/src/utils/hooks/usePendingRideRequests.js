import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'
import haversineDistanceKm from '@/utils/haversineDistanceKm'
import { TRUCK } from '@/constants/vehicle.constant'

// Pending requests are already few by construction (3-minute TTL), so the
// Firestore query stays global and proximity is a cheap client-side filter.
const MAX_DISTANCE_KM = 10

const hasGoods = (goods) =>
    Boolean((goods?.weight_kg || 0) > 0 || (goods?.volume_m3 || 0) > 0)

const usePendingRideRequests = (currentDriverUid, position, driverVehicleType) => {
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
        // Only trucks have cargo capacity (see backend/app/api/v1/drivers.py
        // set_vehicle_details) - accept_ride already rejects a bike/car
        // driver trying to take a goods-carrying request, so hide it from
        // their feed instead of letting them tap it just to get bounced.
        if (hasGoods(request.goods) && driverVehicleType && driverVehicleType !== TRUCK) {
            return false
        }
        if (position && request.pickup) {
            return haversineDistanceKm(position, request.pickup) <= MAX_DISTANCE_KM
        }
        return true
    })
}

export default usePendingRideRequests
