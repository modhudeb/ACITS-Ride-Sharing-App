import { useEffect, useRef, useState } from 'react'
import { Marker } from 'react-map-gl/mapbox'

const ANIMATION_MS = 1000

// Slides a marker smoothly between successive positions instead of letting it
// teleport on each location heartbeat - the standard ride-hailing app trick.
const AnimatedMarker = ({ latitude, longitude, color }) => {
    const [pos, setPos] = useState({ lat: latitude, lng: longitude })
    const frameRef = useRef(null)
    const fromRef = useRef({ lat: latitude, lng: longitude })

    useEffect(() => {
        const from = fromRef.current
        const to = { lat: latitude, lng: longitude }
        const start = performance.now()

        const step = (now) => {
            const t = Math.min(1, (now - start) / ANIMATION_MS)
            // ease-out so arrival looks natural
            const eased = 1 - (1 - t) * (1 - t)
            const next = {
                lat: from.lat + (to.lat - from.lat) * eased,
                lng: from.lng + (to.lng - from.lng) * eased,
            }
            setPos(next)
            fromRef.current = next
            if (t < 1) {
                frameRef.current = requestAnimationFrame(step)
            }
        }

        frameRef.current = requestAnimationFrame(step)
        return () => cancelAnimationFrame(frameRef.current)
    }, [latitude, longitude])

    return <Marker latitude={pos.lat} longitude={pos.lng} color={color} />
}

export default AnimatedMarker
