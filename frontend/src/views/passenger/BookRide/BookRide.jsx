import { useCallback, useEffect, useMemo, useState } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import PlaceSearchInput from './components/PlaceSearchInput'
import AnimatedMarker from '@/components/shared/AnimatedMarker'
import DriverDotsLayer from '@/components/shared/DriverDotsLayer'
import OfflineBanner from '@/components/shared/OfflineBanner'
import RideChat from '@/components/shared/RideChat'
import StarRating from '@/components/shared/StarRating'
import {
    apiEstimateRoute,
    apiCreateRide,
    apiCancelRide,
    apiRateRide,
} from '@/services/RideService'
import useRideListener from '@/utils/hooks/useRideListener'
import useDriverLocation from '@/utils/hooks/useDriverLocation'
import useDriverProfile from '@/utils/hooks/useDriverProfile'
import useAvailableDrivers from '@/utils/hooks/useAvailableDrivers'
import useActivePassengerRide from '@/utils/hooks/useActivePassengerRide'
import useDriverEta from '@/utils/hooks/useDriverEta'
import haversineDistanceKm from '@/utils/haversineDistanceKm'
import { usePendingDestinationStore } from '@/store/pendingDestinationStore'
import { useAuth } from '@/auth'
import { DEFAULT_CENTER } from '@/constants/map.constant'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const routeLineLayer = {
    id: 'route-line',
    type: 'line',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 4 },
}

const BookRide = () => {
    const { user } = useAuth()
    const [pickup, setPickup] = useState(null)
    const [destination, setDestination] = useState(null)
    const [estimate, setEstimate] = useState(null)
    const [loadingEstimate, setLoadingEstimate] = useState(false)
    const [error, setError] = useState('')
    const [locating, setLocating] = useState(false)
    const [rideId, setRideId] = useState(null)
    const [requesting, setRequesting] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [pickingDestinationOnMap, setPickingDestinationOnMap] = useState(false)
    const [editingPickup, setEditingPickup] = useState(false)
    const [hasGoods, setHasGoods] = useState(false)
    const [goodsWeight, setGoodsWeight] = useState('')
    const [goodsVolume, setGoodsVolume] = useState('')
    const [scheduleLater, setScheduleLater] = useState(false)
    const [scheduledAt, setScheduledAt] = useState('')
    const [estimateRetryCount, setEstimateRetryCount] = useState(0)
    const [viewState, setViewState] = useState({
        latitude: DEFAULT_CENTER.lat,
        longitude: DEFAULT_CENTER.lng,
        zoom: 13,
    })

    const activeRideIdFromServer = useActivePassengerRide(user.uid)
    useEffect(() => {
        if (activeRideIdFromServer && !rideId) {
            setRideId(activeRideIdFromServer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRideIdFromServer])

    // The chat assistant hands off a selected place through this store rather
    // than router state, since the app's Suspense boundary remounts the whole
    // route tree on every navigation (see pendingDestinationStore.js).
    useEffect(() => {
        const { pendingDestination, clearPendingDestination } =
            usePendingDestinationStore.getState()
        if (pendingDestination) {
            setDestination(pendingDestination)
            clearPendingDestination()
        }
    }, [])

    const [hasCenteredOnRide, setHasCenteredOnRide] = useState(false)

    const ride = useRideListener(rideId)
    const rideActive = ride && ride.status !== 'cancelled'
    const trackingDriver = ride?.status === 'accepted' || ride?.status === 'in_progress'
    const driverLocation = useDriverLocation(trackingDriver ? ride.driver_id : null)
    const { profile: assignedDriverProfile } = useDriverProfile(
        trackingDriver ? ride.driver_id : null,
    )
    const driverRating = assignedDriverProfile?.rating
    const showAvailableDrivers = !ride || ride.status === 'requested'
    const availableDrivers = useAvailableDrivers(
        showAvailableDrivers,
        (ride ? ride.pickup : pickup) || DEFAULT_CENTER,
    )

    const useCurrentLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser')
            return
        }
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const next = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    address: 'Current location',
                }
                setPickup(next)
                setViewState((v) => ({
                    ...v,
                    latitude: next.lat,
                    longitude: next.lng,
                }))
                setLocating(false)
            },
            () => {
                setError(
                    'Could not get your location - pick a point on the map instead',
                )
                setLocating(false)
            },
        )
    }, [])

    useEffect(() => {
        useCurrentLocation()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (ride && !hasCenteredOnRide) {
            setHasCenteredOnRide(true)
            setViewState((v) => ({
                ...v,
                latitude: ride.pickup.lat,
                longitude: ride.pickup.lng,
            }))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ride, hasCenteredOnRide])

    const goods = {
        weight_kg: hasGoods ? Number(goodsWeight) || 0 : 0,
        volume_m3: hasGoods ? Number(goodsVolume) || 0 : 0,
    }

    useEffect(() => {
        if (!pickup || !destination || rideId) {
            setEstimate(null)
            return
        }

        let cancelled = false
        setLoadingEstimate(true)
        setError('')

        // Small delay so typing goods weight/volume doesn't fire an API call
        // per keystroke.
        const timer = setTimeout(() => {
            apiEstimateRoute({ pickup, destination, goods })
                .then((data) => {
                    if (cancelled) return
                    setEstimate(data)
                })
                .catch((err) => {
                    if (cancelled) return
                    setError(
                        err?.response?.data?.detail ||
                            'Could not estimate this route',
                    )
                    setEstimate(null)
                })
                .finally(() => {
                    if (!cancelled) setLoadingEstimate(false)
                })
        }, 400)

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        pickup,
        destination,
        rideId,
        goods.weight_kg,
        goods.volume_m3,
        estimateRetryCount,
    ])

    const handleMapClick = (event) => {
        if (rideId) return
        const { lat, lng } = event.lngLat
        if (pickingDestinationOnMap) {
            setDestination({ lat, lng, address: 'Selected on map' })
            setPickingDestinationOnMap(false)
        } else {
            setPickup({ lat, lng, address: 'Selected on map' })
            setEditingPickup(false)
        }
    }

    const handlePickupSelect = (place) => {
        setPickup(place)
        setViewState((v) => ({ ...v, latitude: place.lat, longitude: place.lng }))
        setEditingPickup(false)
    }

    const handleConfirmTrip = async () => {
        setRequesting(true)
        setError('')
        try {
            const created = await apiCreateRide({
                pickup,
                destination,
                estimate,
                goods,
                scheduledAt:
                    scheduleLater && scheduledAt
                        ? new Date(scheduledAt).toISOString()
                        : null,
            })
            setRideId(created.id)
        } catch (err) {
            setError(
                err?.response?.data?.detail || 'Could not create the ride request',
            )
        } finally {
            setRequesting(false)
        }
    }

    const handleCancelRide = async () => {
        if (!rideId) return
        setCancelling(true)
        try {
            await apiCancelRide(rideId, 'Cancelled by passenger')
        } catch {
            // ride may already have moved on server-side; listener will reflect true state
        } finally {
            setCancelling(false)
        }
    }

    const handleShareTrip = async () => {
        if (!ride?.share_token) return
        const url = `${window.location.origin}/shared-trip/${ride.id}?token=${ride.share_token}`
        try {
            await navigator.clipboard.writeText(url)
            toast.push(
                <Notification title="Share link copied" type="success" />,
                { placement: 'top-center' },
            )
        } catch {
            window.prompt('Copy this link to share your trip:', url)
        }
    }

    const handleDestinationSelect = (place) => {
        setDestination(place)
        setPickingDestinationOnMap(false)
    }

    const handleStartOver = () => {
        setRideId(null)
        setDestination(null)
        setEstimate(null)
        setPickingDestinationOnMap(false)
        setHasCenteredOnRide(false)
        setHasGoods(false)
        setGoodsWeight('')
        setGoodsVolume('')
        setScheduleLater(false)
        setScheduledAt('')
    }

    // Same as handleStartOver but keeps the destination the passenger already
    // searched for - a cancelled ride shouldn't force them to re-search from
    // scratch. The estimate effect below picks this up automatically once
    // rideId clears (pickup/destination are still set, so it refetches a
    // fresh fare rather than showing a stale one).
    const handleSearchAgain = () => {
        setRideId(null)
        setEstimate(null)
        setPickingDestinationOnMap(false)
        setHasCenteredOnRide(false)
        setHasGoods(false)
        setGoodsWeight('')
        setGoodsVolume('')
        setScheduleLater(false)
        setScheduledAt('')
    }

    const displayPickup = ride ? ride.pickup : pickup
    const displayDestination = ride ? ride.destination : destination
    const displayRoutePath = ride ? ride.route_path : estimate?.route_path

    const routeGeoJson = useMemo(
        () =>
            displayRoutePath
                ? {
                      type: 'Feature',
                      geometry: {
                          type: 'LineString',
                          coordinates: displayRoutePath.map((p) => [
                              p.lng,
                              p.lat,
                          ]),
                      },
                  }
                : null,
        [displayRoutePath],
    )

    const distanceToPickupKm = driverLocation
        ? haversineDistanceKm(driverLocation, ride.pickup).toFixed(1)
        : null
    const distanceToDestinationKm = driverLocation
        ? haversineDistanceKm(driverLocation, ride.destination).toFixed(1)
        : null

    const etaTarget = ride?.status === 'in_progress' ? ride.destination : ride?.pickup
    const driverEta = useDriverEta(
        trackingDriver ? driverLocation : null,
        trackingDriver ? etaTarget : null,
    )

    return (
        <div className="relative h-full w-full">
            <OfflineBanner />
            <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                onClick={handleMapClick}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                reuseMaps
                style={{ width: '100%', height: '100%' }}
            >
                {showAvailableDrivers && (
                    <DriverDotsLayer
                        id="available-drivers"
                        drivers={availableDrivers}
                        color="#9333ea"
                    />
                )}
                {displayPickup && (
                    <Marker
                        latitude={displayPickup.lat}
                        longitude={displayPickup.lng}
                        color="#2563eb"
                    />
                )}
                {displayDestination && (
                    <Marker
                        latitude={displayDestination.lat}
                        longitude={displayDestination.lng}
                        color="#dc2626"
                    />
                )}
                {driverLocation && (
                    <AnimatedMarker
                        latitude={driverLocation.lat}
                        longitude={driverLocation.lng}
                        color="#16a34a"
                    />
                )}
                {routeGeoJson && (
                    <Source id="route" type="geojson" data={routeGeoJson}>
                        <Layer {...routeLineLayer} />
                    </Source>
                )}
            </Map>

            <div className="absolute bottom-safe-panel left-4 right-4 pb-16 sm:pb-0 sm:left-auto sm:right-4 sm:top-4 sm:w-96 flex flex-col gap-3 max-h-[70dvh] sm:max-h-[calc(100dvh-7rem)] overflow-auto">
                <div className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600 sm:hidden" />
                {!rideActive && (
                    <Card>
                        <div className="mb-3">
                            <label className="text-xs font-semibold text-gray-500">
                                Pickup
                            </label>
                            {pickup && !editingPickup ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm flex-1 truncate">
                                        {pickup.address}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        onClick={() => setEditingPickup(true)}
                                    >
                                        Change
                                    </Button>
                                </div>
                            ) : (
                                <div className="mt-1">
                                    {locating && !pickup && (
                                        <p className="text-xs text-gray-400 mb-1">
                                            Detecting your location...
                                        </p>
                                    )}
                                    <PlaceSearchInput
                                        placeholder="Search pickup - e.g. your office"
                                        proximity={pickup}
                                        onPlaceSelect={handlePickupSelect}
                                    />
                                </div>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                                Or click anywhere on the map to set your pickup point
                            </p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500">
                                Destination
                            </label>
                            {destination ? (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-sm flex-1 truncate">
                                        {destination.address}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        onClick={() => setDestination(null)}
                                    >
                                        Change
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div className="mt-1">
                                        <PlaceSearchInput
                                            placeholder="Search destination - e.g. Jamuna Future Park"
                                            proximity={pickup}
                                            onPlaceSelect={handleDestinationSelect}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {pickingDestinationOnMap ? (
                                            'Click anywhere on the map to set your destination'
                                        ) : (
                                            <>
                                                Or{' '}
                                                <button
                                                    type="button"
                                                    className="underline"
                                                    onClick={() =>
                                                        setPickingDestinationOnMap(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    pick a point on the map
                                                </button>
                                            </>
                                        )}
                                    </p>
                                </>
                            )}
                        </div>
                        <div className="mt-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">
                                        Travelling with goods?
                                    </label>
                                    <p className="text-xs text-gray-400 mt-0.5 max-w-[16rem]">
                                        Turn this on to reserve cargo space -
                                        we&apos;ll match you with a truck.
                                    </p>
                                </div>
                                <Switcher
                                    checked={hasGoods}
                                    onChange={(checked) => {
                                        setHasGoods(checked)
                                        if (!checked) {
                                            setGoodsWeight('')
                                            setGoodsVolume('')
                                        }
                                    }}
                                />
                            </div>
                            {hasGoods && (
                                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Input
                                                size="sm"
                                                type="number"
                                                min="0"
                                                placeholder="Weight (kg)"
                                                value={goodsWeight}
                                                onChange={(e) =>
                                                    setGoodsWeight(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Load you need moved
                                            </p>
                                        </div>
                                        <div>
                                            <Input
                                                size="sm"
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                placeholder="Volume (m³)"
                                                value={goodsVolume}
                                                onChange={(e) =>
                                                    setGoodsVolume(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Optional - e.g. 1.5 for a few
                                                boxes
                                            </p>
                                        </div>
                                    </div>
                                    {estimate?.fare_breakdown
                                        ?.goods_surcharge > 0 && (
                                        <p className="text-xs text-amber-600 mt-2">
                                            +{estimate.fare_breakdown.goods_surcharge}{' '}
                                            BDT goods handling applies
                                        </p>
                                    )}
                                    {hasGoods &&
                                        !(Number(goodsWeight) > 0) && (
                                            <p className="text-xs text-gray-400 mt-2">
                                                Enter a weight so we can match a
                                                truck with enough cargo space.
                                            </p>
                                        )}
                                    <button
                                        type="button"
                                        className="text-xs text-gray-400 underline mt-2"
                                        onClick={() => {
                                            setHasGoods(false)
                                            setGoodsWeight('')
                                            setGoodsVolume('')
                                        }}
                                    >
                                        Just me - no goods
                                    </button>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {error && (
                    <Alert type="danger" showIcon>
                        <div className="flex items-center justify-between gap-4">
                            <span>{error}</span>
                            {pickup && destination && !rideId && (
                                <Button
                                    size="sm"
                                    loading={loadingEstimate}
                                    onClick={() =>
                                        setEstimateRetryCount((c) => c + 1)
                                    }
                                >
                                    Try again
                                </Button>
                            )}
                        </div>
                    </Alert>
                )}

                {loadingEstimate && (
                    <Card>
                        <div className="flex items-center gap-2">
                            <Spinner size={20} /> Calculating route and fare...
                        </div>
                    </Card>
                )}

                {estimate && !loadingEstimate && !rideId && (
                    <Card>
                        <h5 className="mb-2">Trip summary</h5>
                        <div className="text-sm space-y-1 mb-3">
                            <div className="flex justify-between">
                                <span>Distance</span>
                                <span>
                                    {(estimate.distance_meters / 1000).toFixed(1)} km
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Estimated time</span>
                                <span>
                                    {Math.round(estimate.duration_seconds / 60)} min
                                </span>
                            </div>
                            {estimate.fare_breakdown?.goods_surcharge > 0 && (
                                <div className="flex justify-between">
                                    <span>Goods handling</span>
                                    <span>
                                        {estimate.fare_breakdown.goods_surcharge}{' '}
                                        BDT
                                    </span>
                                </div>
                            )}
                            {estimate.fare_breakdown?.booking_fee > 0 && (
                                <div className="flex justify-between">
                                    <span>Booking fee</span>
                                    <span>
                                        {estimate.fare_breakdown.booking_fee} BDT
                                    </span>
                                </div>
                            )}
                            {estimate.fare_breakdown?.pool_discount_pct > 0 && (
                                <div className="flex justify-between text-emerald-600">
                                    <span>Shared ride discount</span>
                                    <span>
                                        -
                                        {estimate.fare_breakdown.pool_discount_pct}
                                        %
                                    </span>
                                </div>
                            )}
                            {estimate.fare_breakdown?.surge_multiplier > 1 && (
                                <div className="flex justify-between text-amber-600">
                                    <span>High demand (surge)</span>
                                    <span>
                                        x
                                        {estimate.fare_breakdown.surge_multiplier}
                                    </span>
                                </div>
                            )}
                            {estimate.fare_breakdown?.peak_hour_multiplier >
                                1 && (
                                <div className="flex justify-between text-amber-600">
                                    <span>Peak hours</span>
                                    <span>
                                        x
                                        {
                                            estimate.fare_breakdown
                                                .peak_hour_multiplier
                                        }
                                    </span>
                                </div>
                            )}
                            {estimate.fare_breakdown?.night_multiplier > 1 && (
                                <div className="flex justify-between text-amber-600">
                                    <span>Night charge</span>
                                    <span>
                                        x{estimate.fare_breakdown.night_multiplier}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between font-semibold">
                                <span>Estimated fare</span>
                                <span>{estimate.fare_estimate} BDT</span>
                            </div>
                            {estimate.fare_breakdown?.minimum_fare_applied && (
                                <p className="text-xs text-gray-400">
                                    Minimum fare applied
                                </p>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mb-3">
                            Shared ride - other employees may be picked up
                            along the way.
                        </p>
                        <div className="mb-3">
                            {scheduleLater ? (
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">
                                        Pickup time
                                    </label>
                                    <Input
                                        size="sm"
                                        type="datetime-local"
                                        value={scheduledAt}
                                        min={new Date(
                                            Date.now() + 15 * 60 * 1000,
                                        )
                                            .toISOString()
                                            .slice(0, 16)}
                                        onChange={(e) =>
                                            setScheduledAt(e.target.value)
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="text-xs text-gray-400 underline mt-1"
                                        onClick={() => {
                                            setScheduleLater(false)
                                            setScheduledAt('')
                                        }}
                                    >
                                        Ride now instead
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400">
                                    Need it later?{' '}
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => setScheduleLater(true)}
                                    >
                                        Schedule this ride
                                    </button>
                                </p>
                            )}
                        </div>
                        <Button
                            block
                            variant="solid"
                            loading={requesting}
                            disabled={
                                (scheduleLater && !scheduledAt) ||
                                (hasGoods && !(Number(goodsWeight) > 0))
                            }
                            onClick={handleConfirmTrip}
                        >
                            {scheduleLater ? 'Schedule trip' : 'Confirm trip'}
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'scheduled' && (
                    <Card>
                        <Alert type="info" showIcon className="mb-3">
                            Ride scheduled
                        </Alert>
                        <div className="text-sm space-y-1 mb-3">
                            <div className="flex justify-between">
                                <span>Pickup time</span>
                                <span className="font-semibold">
                                    {ride.scheduled_at
                                        ? new Date(
                                              ride.scheduled_at,
                                          ).toLocaleString()
                                        : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Fare</span>
                                <span>{ride.fare_estimate} BDT</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">
                            We&apos;ll look for a driver about 5 minutes before
                            your pickup time.
                        </p>
                        <Button
                            block
                            variant="plain"
                            loading={cancelling}
                            onClick={handleCancelRide}
                        >
                            Cancel scheduled ride
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'requested' && (
                    <Card>
                        <div className="flex items-center gap-2 mb-3">
                            <Spinner size={20} />
                            <span>Finding a nearby driver...</span>
                        </div>
                        <Button
                            block
                            variant="plain"
                            loading={cancelling}
                            onClick={handleCancelRide}
                        >
                            Cancel request
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'accepted' && (
                    <Card>
                        <Alert type="success" showIcon className="mb-3">
                            Driver assigned!
                        </Alert>
                        <div className="text-sm space-y-1 mb-3">
                            <div className="flex justify-between">
                                <span>Driver</span>
                                <span className="font-semibold">
                                    {ride.driver_name || 'Your driver'}
                                    {driverRating?.count > 0 && (
                                        <span className="font-normal text-amber-500">
                                            {' '}
                                            ★ {driverRating.avg} (
                                            {driverRating.count})
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Fare</span>
                                <span>{ride.fare_estimate} BDT</span>
                            </div>
                            {distanceToPickupKm && (
                                <div className="flex justify-between">
                                    <span>Driver is</span>
                                    <span>
                                        {driverEta
                                            ? `${driverEta.distanceKm.toFixed(1)} km · ~${driverEta.minutes} min away`
                                            : `${distanceToPickupKm} km from pickup`}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="mb-3">
                            <RideChat
                                rideId={ride.id}
                                currentUid={user.uid}
                                peerName={ride.driver_name}
                            />
                        </div>
                        <Button block className="mb-2" onClick={handleShareTrip}>
                            Share my trip
                        </Button>
                        <Button
                            block
                            variant="plain"
                            loading={cancelling}
                            onClick={handleCancelRide}
                        >
                            Cancel trip
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'in_progress' && (
                    <Card>
                        <Alert type="success" showIcon className="mb-3">
                            Trip in progress
                        </Alert>
                        <div className="text-sm space-y-1 mb-3">
                            <div className="flex justify-between">
                                <span>Driver</span>
                                <span className="font-semibold">
                                    {ride.driver_name || 'Your driver'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>Fare</span>
                                <span>{ride.fare_estimate} BDT</span>
                            </div>
                            {distanceToDestinationKm && (
                                <div className="flex justify-between">
                                    <span>Remaining</span>
                                    <span>
                                        {driverEta
                                            ? `${driverEta.distanceKm.toFixed(1)} km · ~${driverEta.minutes} min`
                                            : `${distanceToDestinationKm} km to destination`}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="mb-3">
                            <RideChat
                                rideId={ride.id}
                                currentUid={user.uid}
                                peerName={ride.driver_name}
                            />
                        </div>
                        <Button block onClick={handleShareTrip}>
                            Share my trip
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'completed' && (
                    <Card>
                        <Alert type="success" showIcon className="mb-3">
                            Trip completed - thanks for riding!
                        </Alert>
                        <div className="text-sm space-y-1 mb-3">
                            <div className="flex justify-between font-semibold">
                                <span>Final fare</span>
                                <span>{ride.final_fare ?? ride.fare_estimate} BDT</span>
                            </div>
                        </div>
                        {!ride.rated_by_passenger && (
                            <div className="mb-3">
                                <p className="text-sm mb-1">
                                    Rate {ride.driver_name || 'your driver'}
                                </p>
                                <StarRating
                                    onRate={(value) =>
                                        apiRateRide(ride.id, value).catch(
                                            () => {},
                                        )
                                    }
                                />
                            </div>
                        )}
                        {ride.rated_by_passenger && (
                            <p className="text-sm text-emerald-600 mb-3">
                                Thanks for your feedback!
                            </p>
                        )}
                        <Button block variant="solid" onClick={handleStartOver}>
                            Book another ride
                        </Button>
                    </Card>
                )}

                {ride && ride.status === 'cancelled' && (
                    <Card>
                        <Alert type="warning" showIcon className="mb-3">
                            Ride cancelled: {ride.cancel_reason || 'No reason given'}
                        </Alert>
                        {ride.cancellation_fee > 0 && (
                            <p className="text-sm text-red-500 mb-3">
                                A cancellation fee of {ride.cancellation_fee}{' '}
                                BDT applies because the driver was already on
                                the way.
                            </p>
                        )}
                        <Button block variant="solid" onClick={handleSearchAgain}>
                            Search again
                        </Button>
                    </Card>
                )}
            </div>
        </div>
    )
}

export default BookRide
