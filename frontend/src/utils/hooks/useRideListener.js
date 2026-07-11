import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetRide } from '@/services/RideService'

// Fetches the current ride once, then stays live via the ride:{id} realtime
// topic (full-state pushes on every status change) - the REST+WS equivalent
// of the old Firestore onSnapshot(doc(db,'rides',rideId)).
const useRideListener = (rideId) => {
    const [ride, setRide] = useState(null)

    const refetch = useCallback(() => {
        if (!rideId) {
            setRide(null)
            return
        }
        apiGetRide(rideId)
            .then(setRide)
            .catch(() => setRide(null))
    }, [rideId])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(rideId ? `ride:${rideId}` : null, (message) => {
        if (message.type === 'state') setRide(message.data)
    })

    return ride
}

export default useRideListener
