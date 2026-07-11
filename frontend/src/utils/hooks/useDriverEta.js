import { useEffect, useRef, useState } from 'react'
import { apiGetEta } from '@/services/RideService'
import haversineDistanceKm from '@/utils/haversineDistanceKm'

// Road-based ETA is a paid Mapbox Directions call, so it's throttled instead
// of firing on every driver GPS heartbeat (~every 10s): only refetch once the
// driver has moved a meaningful distance, or REFRESH_MS has elapsed since the
// last call - whichever comes first.
const REFRESH_MS = 25 * 1000
const MIN_MOVE_KM = 0.3

const useDriverEta = (driverLocation, target) => {
    const [eta, setEta] = useState(null)
    const lastFetchLocation = useRef(null)
    const lastFetchAt = useRef(0)

    useEffect(() => {
        if (!driverLocation || !target) {
            setEta(null)
            lastFetchLocation.current = null
            lastFetchAt.current = 0
            return
        }

        const now = Date.now()
        const movedKm = lastFetchLocation.current
            ? haversineDistanceKm(driverLocation, lastFetchLocation.current)
            : Infinity

        if (movedKm < MIN_MOVE_KM && now - lastFetchAt.current < REFRESH_MS) {
            return
        }

        let cancelled = false
        lastFetchLocation.current = driverLocation
        lastFetchAt.current = now

        apiGetEta({ origin: driverLocation, destination: target })
            .then((data) => {
                if (cancelled) return
                setEta({
                    distanceKm: data.distance_meters / 1000,
                    minutes: Math.max(1, Math.round(data.duration_seconds / 60)),
                    routePath: data.route_path || [],
                })
            })
            .catch(() => {
                // Transient failure (rate limit, network blip) - keep showing
                // the last good ETA rather than clearing it.
            })

        return () => {
            cancelled = true
        }
    }, [driverLocation, target])

    return eta
}

export default useDriverEta
