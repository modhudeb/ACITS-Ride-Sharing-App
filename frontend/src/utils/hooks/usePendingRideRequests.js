import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetPendingRequests } from '@/services/RideService'
import haversineDistanceKm from '@/utils/haversineDistanceKm'
import { TRUCK } from '@/constants/vehicle.constant'

// Pending requests are already few by construction (3-minute TTL), so
// proximity stays a cheap client-side filter over the full feed.
const MAX_DISTANCE_KM = 10

const hasGoods = (goods) =>
    Boolean((goods?.weight_kg || 0) > 0 || (goods?.volume_m3 || 0) > 0)

// Backend returns snake_case; DriverHome (unchanged since the Firestore
// days) still reads rideId/fareEstimate, so adapt the shape here rather
// than touching every consumer.
const toRequest = (data) => ({
    rideId: data.ride_id,
    passengerName: data.passenger_name,
    pickup: data.pickup,
    destination: data.destination,
    goods: data.goods,
    distanceMeters: data.distance_meters,
    durationSeconds: data.duration_seconds,
    fareEstimate: data.fare_estimate,
    expiresAt: data.expires_at,
})

const usePendingRideRequests = (currentDriverUid, position, driverVehicleType) => {
    const [raw, setRaw] = useState([])

    const refetch = useCallback(() => {
        if (!currentDriverUid) {
            setRaw([])
            return
        }
        // declined_by filtering already happened server-side (it knows who's
        // asking); this only ever contains requests still live for us.
        apiGetPendingRequests()
            .then((rows) => setRaw(rows.map(toRequest)))
            .catch(() => setRaw([]))
    }, [currentDriverUid])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(currentDriverUid ? 'driver_feed' : null, () => refetch())

    // Filtering happens at render time so a moving GPS position never forces
    // a refetch.
    return raw.filter((request) => {
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
