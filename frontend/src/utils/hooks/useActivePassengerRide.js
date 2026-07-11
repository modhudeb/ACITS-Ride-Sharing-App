import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetActiveRides } from '@/services/RideService'

// A passenger can only ever have one active ride (create_ride enforces this
// server-side). Fetches it once, then refetches whenever the rides:{uid}
// topic signals a change - simpler and less error-prone than trying to
// reconstruct "do I have an active ride" purely from a stream of events.
const useActivePassengerRide = (uid) => {
    const [rideId, setRideId] = useState(null)

    const refetch = useCallback(() => {
        if (!uid) {
            setRideId(null)
            return
        }
        apiGetActiveRides()
            .then((rides) => setRideId(rides[0]?.id || null))
            .catch(() => setRideId(null))
    }, [uid])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(uid ? `rides:${uid}` : null, () => refetch())

    return rideId
}

export default useActivePassengerRide
