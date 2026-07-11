import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetActiveRides } from '@/services/RideService'

// Pooled trucks can carry several rides at once, so this returns every
// active ride assigned to the driver, not just the first one. Fetches once,
// then refetches whenever the rides:{uid} topic signals a change.
const useActiveDriverRides = (uid) => {
    const [rides, setRides] = useState([])

    const refetch = useCallback(() => {
        if (!uid) {
            setRides([])
            return
        }
        apiGetActiveRides()
            .then(setRides)
            .catch(() => setRides([]))
    }, [uid])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(uid ? `rides:${uid}` : null, () => refetch())

    return rides
}

export default useActiveDriverRides
