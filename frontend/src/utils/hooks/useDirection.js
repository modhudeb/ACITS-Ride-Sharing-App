import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'

function useDirection() {
    const direction = useThemeStore((state) => state.direction)
    const setDirection = useThemeStore((state) => state.setDirection)

    useEffect(() => {
        if (window === undefined) {
            return
        }
        const root = window.document.documentElement
        root.setAttribute('dir', direction)
    }, [direction])

    return [direction, setDirection]
}

export default useDirection
