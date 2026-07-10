import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

export function normalizeRideDoc(id, data) {
    return {
        id,
        passenger_id: data.passengerId,
        passenger_name: data.passengerName,
        driver_id: data.driverId,
        driver_name: data.driverName,
        status: data.status,
        pickup: data.pickup,
        destination: data.destination,
        distance_meters: data.distanceMeters,
        duration_seconds: data.durationSeconds,
        route_path: data.routePath,
        fare_estimate: data.fareEstimate,
        fare_breakdown: data.fareBreakdown,
        goods: data.goods || { weight_kg: 0, volume_m3: 0 },
        share_token: data.shareToken,
        scheduled_at: data.scheduledAt?.toDate
            ? data.scheduledAt.toDate().toISOString()
            : data.scheduledAt || null,
        rated_by_passenger: Boolean(data.ratedByPassenger),
        rated_by_driver: Boolean(data.ratedByDriver),
        final_fare: data.finalFare,
        cancellation_fee: data.cancellationFee,
        cancel_reason: data.cancelReason,
    }
}

const useRideListener = (rideId) => {
    const [ride, setRide] = useState(null)

    useEffect(() => {
        if (!rideId) {
            setRide(null)
            return
        }

        const unsubscribe = onSnapshot(doc(db, 'rides', rideId), (snapshot) => {
            setRide(
                snapshot.exists()
                    ? normalizeRideDoc(snapshot.id, snapshot.data())
                    : null,
            )
        })

        return unsubscribe
    }, [rideId])

    return ride
}

export default useRideListener
