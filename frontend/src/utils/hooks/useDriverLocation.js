import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetDriverProfile } from '@/services/DriverService'

// Live location for one specific driver - initial value from their profile
// (which carries last-known lat/lng), then updated from the shared
// driver_locations topic, filtered down to this uid.
const useDriverLocation = (driverId) => {
    const [location, setLocation] = useState(null)

    const refetch = useCallback(() => {
        if (!driverId) {
            setLocation(null)
            return
        }
        apiGetDriverProfile(driverId)
            .then((data) =>
                setLocation(data.lat != null ? { lat: data.lat, lng: data.lng } : null),
            )
            .catch(() => setLocation(null))
    }, [driverId])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(driverId ? 'driver_locations' : null, (message) => {
        if (message.type !== 'state' || message.data.uid !== driverId) return
        setLocation(
            message.data.lat != null ? { lat: message.data.lat, lng: message.data.lng } : null,
        )
    })

    return location
}

export default useDriverLocation
