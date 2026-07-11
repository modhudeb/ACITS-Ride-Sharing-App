import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetDriverProfile } from '@/services/DriverService'

// The backend returns a flat snake_case payload; this reshapes it into the
// nested {capacity, vehicle, rating} shape the UI already expects (unchanged
// since the old Firestore driver_profiles doc had the same nesting), so
// DriverHome/BookRide don't need to know the storage layer changed.
const toProfile = (data) => ({
    onlineStatus: data.online_status,
    vehicle: data.vehicle_type
        ? { type: data.vehicle_type, model: data.vehicle_model, plate: data.plate_number }
        : null,
    capacity:
        data.max_passengers != null
            ? {
                  maxPassengers: data.max_passengers,
                  maxWeightKg: data.max_weight_kg || 0,
                  maxVolumeM3: data.max_volume_m3 || 0,
              }
            : null,
    rating: { avg: data.rating_avg || 0, count: data.rating_count || 0 },
})

// Returns undefined while the first fetch is loading, null when the driver
// has no profile yet (fresh driver, or no uid), and the profile otherwise.
const useDriverProfile = (uid) => {
    const [profile, setProfile] = useState(undefined)

    const refetch = useCallback(() => {
        if (!uid) {
            setProfile(null)
            return
        }
        apiGetDriverProfile(uid)
            .then((data) => setProfile(toProfile(data)))
            .catch(() => setProfile(null))
    }, [uid])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(uid ? `driver_profile:${uid}` : null, (message) => {
        if (message.type === 'state') setProfile(toProfile(message.data))
    })

    return profile
}

export default useDriverProfile
