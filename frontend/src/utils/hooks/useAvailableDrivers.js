import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'
import { encodeGeohash, geohashRangeEnd } from '@/utils/geohash'
import haversineDistanceKm from '@/utils/haversineDistanceKm'

// Location heartbeat is sent every 10s while online - anything older than this
// means the driver's session likely died without going offline cleanly
// (closed tab, crash, lost connection), so don't show them as available.
const STALE_LOCATION_MS = 2 * 60 * 1000

// Geohash prefix length 4 is a ~39 x 19.5 km cell - the Firestore query only
// downloads drivers in the viewer's cell instead of every driver worldwide.
// Drivers just across a cell boundary are missed; acceptable at city scale.
const CELL_PRECISION = 4

const MAX_DISTANCE_KM = 10

const useAvailableDrivers = (enabled, center) => {
    const [drivers, setDrivers] = useState([])

    const cell =
        enabled && center
            ? encodeGeohash(center.lat, center.lng, CELL_PRECISION)
            : null

    useEffect(() => {
        if (!cell) {
            setDrivers([])
            return
        }

        // Single-field range scan needs no composite index; the online-status
        // and freshness checks happen client-side on the (small) cell result.
        const q = query(
            collection(db, 'driver_profiles'),
            where('currentLocation.geohash', '>=', cell),
            where('currentLocation.geohash', '<=', geohashRangeEnd(cell)),
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setDrivers(
                snapshot.docs
                    .map((docSnap) => ({
                        uid: docSnap.id,
                        onlineStatus: docSnap.data().onlineStatus,
                        location: docSnap.data().currentLocation,
                    }))
                    .filter((driver) => {
                        if (driver.onlineStatus !== 'online') return false
                        const updatedAt = driver.location?.updatedAt
                        if (!updatedAt?.toMillis) return false
                        if (Date.now() - updatedAt.toMillis() > STALE_LOCATION_MS) {
                            return false
                        }
                        return (
                            haversineDistanceKm(driver.location, {
                                lat: center.lat,
                                lng: center.lng,
                            }) <= MAX_DISTANCE_KM
                        )
                    }),
            )
        })

        return unsubscribe
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cell])

    return drivers
}

export default useAvailableDrivers
