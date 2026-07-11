import { useCallback, useEffect, useRef, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetOnlineDriverLocations } from '@/services/DriverService'
import haversineDistanceKm from '@/utils/haversineDistanceKm'

// Location heartbeat is sent every 10s while online - anything older than this
// means the driver's session likely died without going offline cleanly
// (closed tab, crash, lost connection), so don't show them as available.
const STALE_LOCATION_MS = 2 * 60 * 1000

const MAX_DISTANCE_KM = 10

const toEntry = (data) => ({
    uid: data.uid,
    onlineStatus: data.online_status,
    location: {
        lat: data.lat,
        lng: data.lng,
        updatedAtMs: data.updated_at ? new Date(data.updated_at).getTime() : 0,
    },
})

const useAvailableDrivers = (enabled, center) => {
    // Keyed by uid so a driver_locations push updates one entry in place
    // instead of the hook needing to re-fetch the whole online fleet.
    const driversRef = useRef(new Map())
    const [, forceRender] = useState(0)

    const refetch = useCallback(() => {
        if (!enabled) {
            driversRef.current = new Map()
            forceRender((n) => n + 1)
            return
        }
        apiGetOnlineDriverLocations()
            .then((rows) => {
                driversRef.current = new Map(rows.map((row) => [row.uid, toEntry(row)]))
                forceRender((n) => n + 1)
            })
            .catch(() => {
                driversRef.current = new Map()
                forceRender((n) => n + 1)
            })
    }, [enabled])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(enabled ? 'driver_locations' : null, (message) => {
        if (message.type !== 'state') return
        const entry = toEntry(message.data)
        if (entry.onlineStatus !== 'online' || entry.location.lat == null) {
            driversRef.current.delete(entry.uid)
        } else {
            driversRef.current.set(entry.uid, entry)
        }
        forceRender((n) => n + 1)
    })

    if (!enabled || !center) return []

    return Array.from(driversRef.current.values()).filter((driver) => {
        if (driver.onlineStatus !== 'online') return false
        if (Date.now() - driver.location.updatedAtMs > STALE_LOCATION_MS) return false
        return haversineDistanceKm(driver.location, center) <= MAX_DISTANCE_KM
    })
}

export default useAvailableDrivers
