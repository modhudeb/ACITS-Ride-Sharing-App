import { useEffect, useRef } from 'react'

const useInterval = (callback, delay) => {
    const intervalRef = useRef(null)
    const savedCallback = useRef(callback)

    useEffect(() => {
        savedCallback.current = callback
    }, [callback])

    useEffect(() => {
        if (delay !== null) {
            const tick = () => {
                if (savedCallback.current) {
                    savedCallback.current()
                }
            }
            intervalRef.current = window.setInterval(tick, delay)
            return () => {
                if (intervalRef.current !== null) {
                    window.clearInterval(intervalRef.current)
                }
            }
        }
    }, [delay])

    return intervalRef
}

export default useInterval
