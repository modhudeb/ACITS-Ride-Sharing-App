import { useEffect, useRef } from 'react'
import { realtimeClient } from '@/services/realtime/RealtimeClient'

/** Subscribes to a realtime topic for the lifetime of the component; the
 * callback ref means callers don't need to memoize onMessage themselves. */
const useRealtimeTopic = (topic, onMessage) => {
    const callbackRef = useRef(onMessage)
    callbackRef.current = onMessage

    useEffect(() => {
        if (!topic) return undefined
        return realtimeClient.subscribe(topic, (message) => callbackRef.current(message))
    }, [topic])
}

export default useRealtimeTopic
