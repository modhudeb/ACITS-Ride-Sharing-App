import { useCallback, useEffect, useRef, useState } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Card from '@/components/ui/Card'
import DriverDotsLayer from '@/components/shared/DriverDotsLayer'
import useRealtimeTopic from '@/utils/hooks/useRealtimeTopic'
import { apiGetOnlineDriverLocations } from '@/services/DriverService'
import { apiGetPendingRequests } from '@/services/RideService'
import { apiGetActiveAdminRides } from '@/services/AdminService'
import { DEFAULT_CENTER } from '@/constants/map.constant'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const StatTile = ({ label, value }) => (
    <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
    </div>
)

// Admin control room: every online driver's live location, every active
// trip, and the pending-request count - built on REST snapshots refreshed
// by realtime signals instead of Firestore listeners.
const LiveOps = () => {
    const driversRef = useRef(new Map())
    const [, forceRender] = useState(0)
    const [activeRides, setActiveRides] = useState([])
    const [pendingCount, setPendingCount] = useState(0)
    const [viewState, setViewState] = useState({
        latitude: DEFAULT_CENTER.lat,
        longitude: DEFAULT_CENTER.lng,
        zoom: 12,
    })

    const refetchDrivers = useCallback(() => {
        apiGetOnlineDriverLocations()
            .then((rows) => {
                driversRef.current = new Map(
                    rows.map((row) => [row.uid, { uid: row.uid, location: { lat: row.lat, lng: row.lng } }]),
                )
                forceRender((n) => n + 1)
            })
            .catch(() => {})
    }, [])

    const refetchRides = useCallback(() => {
        apiGetActiveAdminRides()
            .then(setActiveRides)
            .catch(() => setActiveRides([]))
    }, [])

    const refetchPending = useCallback(() => {
        apiGetPendingRequests()
            .then((rows) => setPendingCount(rows.length))
            .catch(() => setPendingCount(0))
    }, [])

    useEffect(() => {
        refetchDrivers()
        refetchRides()
        refetchPending()
    }, [refetchDrivers, refetchRides, refetchPending])

    useRealtimeTopic('driver_locations', (message) => {
        if (message.type !== 'state') return
        const { uid, lat, lng, online_status: onlineStatus } = message.data
        if (onlineStatus !== 'online' || lat == null) {
            driversRef.current.delete(uid)
        } else {
            driversRef.current.set(uid, { uid, location: { lat, lng } })
        }
        forceRender((n) => n + 1)
    })

    useRealtimeTopic('admin_ops', () => {
        refetchRides()
        refetchPending()
    })

    const drivers = Array.from(driversRef.current.values())

    return (
        <div className="relative h-full w-full">
            <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                reuseMaps
                style={{ width: '100%', height: '100%' }}
            >
                {activeRides.map((ride) => (
                    <Marker
                        key={`${ride.id}-target`}
                        latitude={
                            ride.status === 'accepted'
                                ? ride.pickup.lat
                                : ride.destination.lat
                        }
                        longitude={
                            ride.status === 'accepted'
                                ? ride.pickup.lng
                                : ride.destination.lng
                        }
                        color={ride.status === 'accepted' ? '#dc2626' : '#0d9488'}
                    />
                ))}
                <DriverDotsLayer
                    id="live-ops-drivers"
                    drivers={drivers}
                    color="#2563eb"
                />
            </Map>

            <div className="absolute top-4 left-4">
                <Card>
                    <h5 className="mb-2">Live operations</h5>
                    <div className="flex gap-6">
                        <StatTile label="Online drivers" value={drivers.length} />
                        <StatTile
                            label="Active trips"
                            value={activeRides.length}
                        />
                        <StatTile
                            label="Waiting requests"
                            value={pendingCount}
                        />
                    </div>
                    <div className="text-xs text-gray-400 mt-2 space-y-0.5">
                        <div>Blue = driver · Red = pickup · Teal = drop-off</div>
                    </div>
                </Card>
            </div>
        </div>
    )
}

export default LiveOps
