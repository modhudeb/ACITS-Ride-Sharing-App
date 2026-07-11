import { useCallback, useEffect, useState } from 'react'
import useRealtimeTopic from './useRealtimeTopic'
import { apiGetRideMessages } from '@/services/RideService'

const useRideMessages = (rideId) => {
    const [messages, setMessages] = useState([])

    const refetch = useCallback(() => {
        if (!rideId) {
            setMessages([])
            return
        }
        apiGetRideMessages(rideId)
            .then(setMessages)
            .catch(() => setMessages([]))
    }, [rideId])

    useEffect(() => {
        refetch()
    }, [refetch])

    useRealtimeTopic(rideId ? `ride_chat:${rideId}` : null, (message) => {
        if (message.type === 'message') {
            setMessages((prev) => [...prev, message.data])
        }
    })

    return messages
}

export default useRideMessages
