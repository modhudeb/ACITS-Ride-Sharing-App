import { useEffect, useState } from 'react'
import {
    collection,
    onSnapshot,
    orderBy,
    query,
} from 'firebase/firestore'
import { db } from '@/services/firebase/firebaseApp'

const useRideMessages = (rideId) => {
    const [messages, setMessages] = useState([])

    useEffect(() => {
        if (!rideId) {
            setMessages([])
            return
        }

        const q = query(
            collection(db, 'rides', rideId, 'messages'),
            orderBy('at', 'asc'),
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(
                snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })),
            )
        })

        return unsubscribe
    }, [rideId])

    return messages
}

export default useRideMessages
