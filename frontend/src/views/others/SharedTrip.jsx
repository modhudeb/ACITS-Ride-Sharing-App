import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import axios from 'axios'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import appConfig from '@/configs/app.config'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const POLL_INTERVAL_MS = 5000

const routeLineLayer = {
    id: 'shared-route-line',
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 4 },
}

const statusLabel = {
    requested: 'Waiting for a driver',
    accepted: 'Driver is on the way to pickup',
    in_progress: 'Trip in progress',
    completed: 'Trip completed safely',
    cancelled: 'Trip was cancelled',
}

// Read-only live trip view for people the passenger shares their link with.
// Anonymous viewers can't hold Firestore listeners, so this polls a public
// token-gated endpoint instead.
const SharedTrip = () => {
    const { rideId } = useParams()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')

    const [trip, setTrip] = useState(null)
    const [error, setError] = useState('')
    const [viewState, setViewState] = useState(null)

    useEffect(() => {
        if (!token) {
            setError('This share link is missing its token.')
            return
        }

        let stopped = false

        const fetchTrip = async () => {
            try {
                const res = await axios.get(
                    `${appConfig.apiPrefix}/v1/rides/${rideId}/shared`,
                    { params: { token } },
                )
                if (stopped) return
                setTrip(res.data)
                setError('')
                setViewState(
                    (v) =>
                        v || {
                            latitude: res.data.pickup.lat,
                            longitude: res.data.pickup.lng,
                            zoom: 13,
                        },
                )
            } catch (err) {
                if (stopped) return
                setError(
                    err?.response?.status === 403
                        ? 'This share link is invalid or has been revoked.'
                        : 'Could not load the trip right now.',
                )
            }
        }

        fetchTrip()
        const interval = setInterval(fetchTrip, POLL_INTERVAL_MS)
        return () => {
            stopped = true
            clearInterval(interval)
        }
    }, [rideId, token])

    const routeGeoJson = trip?.route_path
        ? {
              type: 'Feature',
              geometry: {
                  type: 'LineString',
                  coordinates: trip.route_path.map((p) => [p.lng, p.lat]),
              },
          }
        : null

    return (
        <div className="relative h-screen w-screen">
            {viewState && (
                <Map
                    {...viewState}
                    onMove={(evt) => setViewState(evt.viewState)}
                    mapboxAccessToken={MAPBOX_TOKEN}
                    mapStyle="mapbox://styles/mapbox/streets-v12"
                    reuseMaps
                    style={{ width: '100%', height: '100%' }}
                >
                    {trip?.pickup && (
                        <Marker
                            latitude={trip.pickup.lat}
                            longitude={trip.pickup.lng}
                            color="#2563eb"
                        />
                    )}
                    {trip?.destination && (
                        <Marker
                            latitude={trip.destination.lat}
                            longitude={trip.destination.lng}
                            color="#dc2626"
                        />
                    )}
                    {trip?.driver_location && (
                        <Marker
                            latitude={trip.driver_location.lat}
                            longitude={trip.driver_location.lng}
                            color="#16a34a"
                        />
                    )}
                    {routeGeoJson && (
                        <Source
                            id="shared-route"
                            type="geojson"
                            data={routeGeoJson}
                        >
                            <Layer {...routeLineLayer} />
                        </Source>
                    )}
                </Map>
            )}

            <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-96">
                <Card>
                    {error ? (
                        <p className="text-sm text-red-500">{error}</p>
                    ) : !trip ? (
                        <div className="flex items-center gap-2">
                            <Spinner size={20} /> Loading trip...
                        </div>
                    ) : (
                        <>
                            <h5 className="mb-1">
                                {trip.passenger_name || 'A RideShare user'}
                                &apos;s trip
                            </h5>
                            <p className="text-sm text-gray-500 mb-2">
                                {statusLabel[trip.status] || trip.status}
                            </p>
                            <div className="text-sm space-y-1">
                                {trip.driver_name && (
                                    <div className="flex justify-between">
                                        <span>Driver</span>
                                        <span className="font-semibold">
                                            {trip.driver_name}
                                        </span>
                                    </div>
                                )}
                                {trip.vehicle?.plate && (
                                    <div className="flex justify-between">
                                        <span>Truck</span>
                                        <span>
                                            {trip.vehicle.model} (
                                            {trip.vehicle.plate})
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span>From</span>
                                    <span className="truncate max-w-[60%] text-right">
                                        {trip.pickup?.address}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>To</span>
                                    <span className="truncate max-w-[60%] text-right">
                                        {trip.destination?.address}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                Location refreshes every few seconds.
                            </p>
                        </>
                    )}
                </Card>
            </div>
        </div>
    )
}

export default SharedTrip
