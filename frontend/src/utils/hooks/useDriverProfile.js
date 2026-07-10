import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

// Returns undefined while the first snapshot is loading, null when the
// profile doc doesn't exist yet (fresh driver), and the doc data otherwise.
const useDriverProfile = (uid) => {
    const [profile, setProfile] = useState(undefined)

    useEffect(() => {
        if (!uid) {
            setProfile(null)
            return
        }

        const unsubscribe = onSnapshot(doc(db, 'driver_profiles', uid), (snapshot) => {
            setProfile(snapshot.exists() ? snapshot.data() : null)
        })

        return unsubscribe
    }, [uid])

    return profile
}

export default useDriverProfile
