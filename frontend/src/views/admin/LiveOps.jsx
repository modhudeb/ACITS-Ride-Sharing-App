import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Card from '@/components/ui/Card'
import DriverDotsLayer from '@/components/shared/DriverDotsLayer'
import { db } from '@/services/firebase/firebaseApp'
import { DEFAULT_CENTER } from '@/constants/map.constant'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const STALE_LOCATION_MS = 2 * 60 * 1000

const StatTile = ({ label, value }) => (
    <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
    </div>
)

// Admin control room: every fresh online driver and every active trip,
// live from the same Firestore listeners the apps themselves use.
const LiveOps = () => {
    const [drivers, setDrivers] = useState([])
    const [activeRides, setActiveRides] = useState([])
    const [pendingCount, setPendingCount] = useState(0)
    const [viewState, setViewState] = useState({
        latitude: DEFAULT_CENTER.lat,
        longitude: DEFAULT_CENTER.lng,
        zoom: 12,
    })

    useEffect(() => {
        const q = query(
            collection(db, 'driver_profiles'),
            where('onlineStatus', '==', 'online'),
        )
        return onSnapshot(q, (snapshot) => {
            setDrivers(
                snapshot.docs
                    .map((docSnap) => ({
                        uid: docSnap.id,
                        location: docSnap.data().currentLocation,
                        vehicle: docSnap.data().vehicle,
                    }))
                    .filter((driver) => {
                        const updatedAt = driver.location?.updatedAt
                        return (
                            updatedAt?.toMillis &&
                            Date.now() - updatedAt.toMillis() <
                                STALE_LOCATION_MS
                        )
                    }),
            )
        })
    }, [])

    useEffect(() => {
        const q = query(
            collection(db, 'rides'),
            where('status', 'in', ['accepted', 'in_progress']),
        )
        return onSnapshot(q, (snapshot) => {
            setActiveRides(
                snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })),
            )
        })
    }, [])

    useEffect(() => {
        const q = query(
            collection(db, 'ride_requests'),
            where('status', '==', 'pending'),
        )
        return onSnapshot(q, (snapshot) => setPendingCount(snapshot.size))
    }, [])

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
