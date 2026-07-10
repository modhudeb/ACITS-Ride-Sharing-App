import { useEffect, useRef, useCallback } from 'react'

function useTimeout(fn, ms = 0, enabled = true) {
    const timeout = useRef(undefined)
    const callback = useRef(fn)

    const clear = useCallback(() => {
        timeout.current && clearTimeout(timeout.current)
    }, [])

    const set = useCallback(() => {
        timeout.current && clearTimeout(timeout.current)
        if (enabled) {
            timeout.current = setTimeout(() => {
                callback.current?.()
            }, ms)
        }
    }, [ms, enabled])

    useEffect(() => {
        callback.current = fn
    }, [fn])

    useEffect(() => {
        set()
        return clear
    }, [ms, enabled, set, clear])

    return { clear, reset: set }
}

export default useTimeout
