import { useEffect, useRef, useState } from 'react'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import RideChat from '@/components/shared/RideChat'
import OfflineBanner from '@/components/shared/OfflineBanner'
import VehicleDetailsFields, {
    emptyVehicleForm,
    isVehicleFormValid,
} from '@/components/shared/VehicleDetailsFields'
import { useAuth } from '@/auth'
import {
    apiGetDemandHeatmap,
    apiSetDriverStatus,
    apiSetVehicleDetails,
    apiUpdateDriverLocation,
} from '@/services/DriverService'
import {
    apiAcceptRide,
    apiRejectRide,
    apiCancelRide,
    apiStartRide,
    apiCompleteRide,
} from '@/services/RideService'
import usePendingRideRequests from '@/utils/hooks/usePendingRideRequests'
import useActiveDriverRides from '@/utils/hooks/useActiveDriverRides'
import useDriverProfile from '@/utils/hooks/useDriverProfile'
import useDriverEta from '@/utils/hooks/useDriverEta'
import haversineDistanceKm from '@/utils/haversineDistanceKm'
import { DEFAULT_CENTER } from '@/constants/map.constant'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Adaptive heartbeat: report quickly while actually moving, but a parked
// truck only pings once a minute - an order of magnitude fewer location
// writes (and downstream realtime pushes) for an idle fleet.
const LOCATION_SEND_INTERVAL_MS = 10000
const IDLE_SEND_INTERVAL_MS = 60000
const MIN_MOVE_KM = 0.03

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

const heatmapLayer = {
    id: 'demand-heat',
    type: 'heatmap',
    paint: {
        'heatmap-radius': 40,
        'heatmap-opacity': 0.6,
    },
}

const goodsLabel = (goods) => {
    const kg = goods?.weight_kg || 0
    const m3 = goods?.volume_m3 || 0
    if (!kg && !m3) return 'No goods'
    return `${kg} kg · ${m3} m³`
}

const VehicleSetupCard = ({ onSaved }) => {
    const [form, setForm] = useState(emptyVehicleForm)
    const [saving, setSaving] = useState(false)

    const setField = (field) => (e) =>
        setForm((f) => ({ ...f, [field]: e.target.value }))

    const handleVehicleTypeChange = (vehicleType) => {
        setForm((f) => ({ ...f, vehicleType }))
    }

    const canSave = isVehicleFormValid(form)

    const handleSave = async () => {
        setSaving(true)
        try {
            await apiSetVehicleDetails({
                vehicleType: form.vehicleType,
                vehicleModel: form.vehicleModel.trim(),
                plateNumber: form.plateNumber.trim(),
                maxWeightKg: Number(form.maxWeightKg) || undefined,
                maxVolumeM3: Number(form.maxVolumeM3) || undefined,
                maxPassengers: Number(form.maxPassengers),
            })
            notify('Vehicle details saved', 'success')
            onSaved?.()
        } catch (err) {
            notify(
                err?.response?.data?.detail || 'Could not save vehicle details',
                'danger',
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <h5 className="mb-1">Set up your vehicle</h5>
            <p className="text-sm text-gray-500 mb-3">
                Trucks are matched by free cargo space for pooled goods rides;
                bikes and cars carry passengers only.
            </p>
            <VehicleDetailsFields
                form={form}
                setField={setField}
                onVehicleTypeChange={handleVehicleTypeChange}
            />
            <Button
                block
                variant="solid"
                className="mt-2"
                disabled={!canSave}
                loading={saving}
                onClick={handleSave}
            >
                Save vehicle details
            </Button>
        </Card>
    )
}

const CapacityBar = ({ label, used, max, unit }) => {
    const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0
    return (
        <div>
            <div className="flex justify-between text-xs mb-0.5">
                <span>{label}</span>
                <span>
                    {Math.round(used * 10) / 10} / {max} {unit}
                </span>
            </div>
            <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-600 overflow-hidden">
                <div
                    className={`h-full rounded ${pct >= 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

const ActiveRideCard = ({
    ride,
    position,
    user,
    busyRideId,
    onStartTrip,
    onCompleteTrip,
    onCancelTrip,
}) => {
    const target = ride.status === 'accepted' ? ride.pickup : ride.destination
    const targetLabel = ride.status === 'accepted' ? 'pickup' : 'destination'
    const driverEta = useDriverEta(position, target)

    return (
        <Card>
            <div className="flex items-center justify-between mb-2">
                <h5>{ride.status === 'accepted' ? 'Pick up' : 'Dropping off'}</h5>
                <span className="text-xs text-gray-400">
                    {goodsLabel(ride.goods)}
                </span>
            </div>
            <div className="text-sm space-y-1 mb-3">
                <div className="flex justify-between">
                    <span>Passenger</span>
                    <span className="font-semibold">
                        {ride.passenger_name || 'Passenger'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Pickup</span>
                    <span className="truncate max-w-[60%] text-right">
                        {ride.pickup?.address}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Destination</span>
                    <span className="truncate max-w-[60%] text-right">
                        {ride.destination?.address}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Fare</span>
                    <span>{ride.fare_estimate} BDT</span>
                </div>
                {position && (
                    <div className="flex justify-between">
                        <span>You are</span>
                        <span>
                            {driverEta
                                ? `${driverEta.distanceKm.toFixed(1)} km · ~${driverEta.minutes} min from ${targetLabel}`
                                : `${haversineDistanceKm(position, target).toFixed(1)} km from ${targetLabel}`}
                        </span>
                    </div>
                )}
            </div>
            <div className="mb-3">
                <RideChat
                    rideId={ride.id}
                    currentUid={user.uid}
                    currentName={user.userName}
                />
            </div>
            <div className="flex flex-col gap-2">
                {ride.status === 'accepted' && (
                    <Button
                        block
                        variant="solid"
                        loading={busyRideId === ride.id}
                        onClick={() => onStartTrip(ride.id)}
                    >
                        Picked up - start trip
                    </Button>
                )}
                {ride.status === 'in_progress' && (
                    <Button
                        block
                        variant="solid"
                        loading={busyRideId === ride.id}
                        onClick={() => onCompleteTrip(ride.id)}
                    >
                        Dropped off - complete
                    </Button>
                )}
                {ride.status === 'accepted' && (
                    <Button
                        block
                        variant="plain"
                        loading={busyRideId === ride.id}
                        onClick={() => onCancelTrip(ride.id)}
                    >
                        Cancel trip
                    </Button>
                )}
            </div>
        </Card>
    )
}

const DriverHome = () => {
    const { user } = useAuth()
    const [togglingOnline, setTogglingOnline] = useState(false)
    const [position, setPosition] = useState(null)
    const [respondingId, setRespondingId] = useState('')
    const [busyRideId, setBusyRideId] = useState('')
    const [viewState, setViewState] = useState({
        latitude: DEFAULT_CENTER.lat,
        longitude: DEFAULT_CENTER.lng,
        zoom: 13,
    })
    const watchIdRef = useRef(null)
    const lastSentRef = useRef(0)
    const lastSentPosRef = useRef(null)
    const centeredRef = useRef(false)

    const driverProfile = useDriverProfile(user.uid)
    const onlineStatus = driverProfile?.onlineStatus || 'offline'
    const capacity = driverProfile?.capacity

    const activeRides = useActiveDriverRides(user.uid)

    // Live capacity ledger: what's already committed on the truck.
    const usedKg = activeRides.reduce(
        (sum, r) => sum + (r.goods?.weight_kg || 0),
        0,
    )
    const usedM3 = activeRides.reduce(
        (sum, r) => sum + (r.goods?.volume_m3 || 0),
        0,
    )
    const riders = activeRides.length
    const seatLeft = capacity ? riders < capacity.maxPassengers : false

    const fitsRequest = (request) => {
        if (!capacity || !seatLeft) return false
        const kg = request.goods?.weight_kg || 0
        const m3 = request.goods?.volume_m3 || 0
        return (
            usedKg + kg <= capacity.maxWeightKg &&
            usedM3 + m3 <= capacity.maxVolumeM3
        )
    }

    const pendingRequests = usePendingRideRequests(
        onlineStatus === 'online' ? user.uid : null,
        position,
        driverProfile?.vehicle?.type,
    )
    const sortedRequests = position
        ? [...pendingRequests].sort(
              (a, b) =>
                  haversineDistanceKm(position, a.pickup) -
                  haversineDistanceKm(position, b.pickup),
          )
        : pendingRequests

    // Demand heatmap: fetched once when toggled on, shows where pickups
    // happened over the last 30 days so drivers can position themselves.
    const [showHeatmap, setShowHeatmap] = useState(false)
    const [heatPoints, setHeatPoints] = useState(null)
    useEffect(() => {
        if (!showHeatmap || heatPoints) return
        apiGetDemandHeatmap()
            .then((data) => setHeatPoints(data.points || []))
            .catch(() => notify('Could not load demand data', 'danger'))
    }, [showHeatmap, heatPoints])

    const heatmapGeoJson =
        showHeatmap && heatPoints
            ? {
                  type: 'FeatureCollection',
                  features: heatPoints.map((p) => ({
                      type: 'Feature',
                      geometry: {
                          type: 'Point',
                          coordinates: [p.lng, p.lat],
                      },
                  })),
              }
            : null

    // Alert the driver when a new request lands: short beep (allowed because
    // the "Go Online" click already unlocked the AudioContext) plus a tab
    // title flash when the tab is in the background.
    const prevRequestCountRef = useRef(0)
    const baseTitleRef = useRef(document.title)
    useEffect(() => {
        if (sortedRequests.length > prevRequestCountRef.current) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext
                const ctx = new AudioCtx()
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.connect(gain)
                gain.connect(ctx.destination)
                osc.frequency.value = 880
                gain.gain.setValueAtTime(0.08, ctx.currentTime)
                osc.start()
                osc.stop(ctx.currentTime + 0.35)
                osc.onended = () => ctx.close()
            } catch {
                // audio blocked - the tab flash below still works
            }
            if (document.hidden) {
                document.title = '(!) New ride request'
            }
        }
        prevRequestCountRef.current = sortedRequests.length
    }, [sortedRequests.length])

    useEffect(() => {
        const baseTitle = baseTitleRef.current
        const restoreTitle = () => {
            if (!document.hidden) document.title = baseTitle
        }
        document.addEventListener('visibilitychange', restoreTitle)
        return () => {
            document.removeEventListener('visibilitychange', restoreTitle)
            document.title = baseTitle
        }
    }, [])

    const stopWatchingLocation = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current)
            watchIdRef.current = null
        }
    }

    const startWatchingLocation = () => {
        if (!navigator.geolocation || watchIdRef.current !== null) return
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
                setPosition(next)
                if (!centeredRef.current) {
                    centeredRef.current = true
                    setViewState((v) => ({
                        ...v,
                        latitude: next.lat,
                        longitude: next.lng,
                    }))
                }
                const now = Date.now()
                const sincelastSend = now - lastSentRef.current
                const moved = lastSentPosRef.current
                    ? haversineDistanceKm(lastSentPosRef.current, next) >=
                      MIN_MOVE_KM
                    : true
                const shouldSend = moved
                    ? sincelastSend > LOCATION_SEND_INTERVAL_MS
                    : sincelastSend > IDLE_SEND_INTERVAL_MS
                if (shouldSend) {
                    lastSentRef.current = now
                    lastSentPosRef.current = next
                    apiUpdateDriverLocation(next).catch(() => {})
                }
            },
            () => notify('Could not access your location', 'danger'),
            { enableHighAccuracy: true },
        )
    }

    useEffect(() => {
        if (onlineStatus === 'online') {
            startWatchingLocation()
        } else {
            stopWatchingLocation()
        }
        return stopWatchingLocation
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onlineStatus])

    if (user.status === 'pending_approval') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <h3 className="mb-2">Application under review</h3>
                <Alert type="info" showIcon className="max-w-md">
                    Thanks for signing up, {user.userName || 'driver'}. An
                    administrator needs to approve your driver account before
                    you can go online and accept rides. We&apos;ll let you
                    know once you&apos;re approved.
                </Alert>
            </div>
        )
    }

    if (user.status === 'suspended') {
        return (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                <h3 className="mb-2">Account suspended</h3>
                <Alert type="danger" showIcon className="max-w-md">
                    Your driver account has been suspended. Contact support if
                    you believe this is a mistake.
                </Alert>
            </div>
        )
    }

    const handleToggleOnline = async () => {
        setTogglingOnline(true)
        const nextStatus = onlineStatus === 'offline' ? 'online' : 'offline'
        try {
            await apiSetDriverStatus(nextStatus)
        } catch (err) {
            notify(
                err?.response?.data?.detail || 'Failed to update status',
                'danger',
            )
        } finally {
            setTogglingOnline(false)
        }
    }

    const handleAccept = async (rideId) => {
        setRespondingId(rideId)
        try {
            await apiAcceptRide(rideId)
            notify('Ride accepted', 'success')
        } catch (err) {
            notify(
                err?.response?.data?.detail || 'Could not accept ride',
                'danger',
            )
        } finally {
            setRespondingId('')
        }
    }

    const handleReject = async (rideId) => {
        setRespondingId(rideId)
        try {
            await apiRejectRide(rideId)
        } catch {
            notify('Could not reject ride', 'danger')
        } finally {
            setRespondingId('')
        }
    }

    const handleCancelTrip = async (rideId) => {
        setBusyRideId(rideId)
        try {
            await apiCancelRide(rideId, 'Cancelled by driver')
        } catch {
            notify('Could not cancel trip', 'danger')
        } finally {
            setBusyRideId('')
        }
    }

    const handleStartTrip = async (rideId) => {
        setBusyRideId(rideId)
        try {
            await apiStartRide(rideId)
            notify('Trip started', 'success')
        } catch (err) {
            notify(err?.response?.data?.detail || 'Could not start trip', 'danger')
        } finally {
            setBusyRideId('')
        }
    }

    const handleCompleteTrip = async (rideId) => {
        setBusyRideId(rideId)
        try {
            await apiCompleteRide(rideId)
            notify('Trip completed', 'success')
        } catch (err) {
            notify(
                err?.response?.data?.detail || 'Could not complete trip',
                'danger',
            )
        } finally {
            setBusyRideId('')
        }
    }

    const statusText =
        onlineStatus !== 'online'
            ? 'Offline'
            : riders > 0
              ? `${riders} active trip${riders > 1 ? 's' : ''} - still accepting`
              : 'Online - waiting for requests'

    return (
        <div className="relative h-full w-full">
            <OfflineBanner />
            <Map
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                mapboxAccessToken={MAPBOX_TOKEN}
                mapStyle="mapbox://styles/mapbox/streets-v12"
                reuseMaps
                style={{ width: '100%', height: '100%' }}
            >
                {heatmapGeoJson && (
                    <Source
                        id="demand-points"
                        type="geojson"
                        data={heatmapGeoJson}
                    >
                        <Layer {...heatmapLayer} />
                    </Source>
                )}

                {onlineStatus === 'online' &&
                    sortedRequests.map((request) => (
                        <Marker
                            key={request.rideId}
                            latitude={request.pickup.lat}
                            longitude={request.pickup.lng}
                            color="#f59e0b"
                        />
                    ))}

                {activeRides.map((ride) => {
                    const target =
                        ride.status === 'accepted'
                            ? ride.pickup
                            : ride.destination
                    return (
                        <Marker
                            key={ride.id}
                            latitude={target.lat}
                            longitude={target.lng}
                            color={
                                ride.status === 'accepted'
                                    ? '#dc2626'
                                    : '#0d9488'
                            }
                        />
                    )
                })}

                {position && (
                    <Marker
                        latitude={position.lat}
                        longitude={position.lng}
                        color="#2563eb"
                    />
                )}
            </Map>

            <div className="absolute top-4 left-4 right-4 sm:right-auto sm:w-96 flex flex-col gap-3 max-h-[calc(100%-2rem)] overflow-auto">
                <Card>
                    <div className="flex items-center justify-between">
                        <div>
                            <h4>Welcome, {user.userName || 'driver'}</h4>
                            <p className="text-sm text-gray-500">{statusText}</p>
                        </div>
                        <Button
                            variant={onlineStatus === 'offline' ? 'solid' : 'plain'}
                            loading={togglingOnline}
                            disabled={riders > 0 && onlineStatus === 'online'}
                            onClick={handleToggleOnline}
                        >
                            {onlineStatus === 'offline' ? 'Go Online' : 'Go Offline'}
                        </Button>
                    </div>
                    {capacity && (
                        <div className="mt-3 flex flex-col gap-1.5">
                            {capacity.maxWeightKg > 0 && (
                                <CapacityBar
                                    label="Load"
                                    used={usedKg}
                                    max={capacity.maxWeightKg}
                                    unit="kg"
                                />
                            )}
                            {capacity.maxVolumeM3 > 0 && (
                                <CapacityBar
                                    label="Space"
                                    used={usedM3}
                                    max={capacity.maxVolumeM3}
                                    unit="m³"
                                />
                            )}
                            <div className="text-xs text-gray-500">
                                {riders} / {capacity.maxPassengers} riders on
                                board
                                {driverProfile?.vehicle?.plate
                                    ? ` · ${driverProfile.vehicle.model} (${driverProfile.vehicle.plate})`
                                    : ''}
                            </div>
                        </div>
                    )}
                    <button
                        type="button"
                        className="text-xs underline text-gray-400 mt-2"
                        onClick={() => setShowHeatmap((s) => !s)}
                    >
                        {showHeatmap
                            ? 'Hide demand heatmap'
                            : 'Show demand heatmap'}
                    </button>
                </Card>

                {driverProfile !== undefined && !capacity && (
                    <VehicleSetupCard onSaved={() => {}} />
                )}

                {activeRides.map((ride) => (
                    <ActiveRideCard
                        key={ride.id}
                        ride={ride}
                        position={position}
                        user={user}
                        busyRideId={busyRideId}
                        onStartTrip={handleStartTrip}
                        onCompleteTrip={handleCompleteTrip}
                        onCancelTrip={handleCancelTrip}
                    />
                ))}

                {onlineStatus === 'online' && (
                    <div>
                        <h5 className="mb-2">Nearby ride requests</h5>
                        {sortedRequests.length === 0 && (
                            <p className="text-sm text-gray-400">
                                No pending requests right now.
                            </p>
                        )}
                        <div className="flex flex-col gap-3">
                            {sortedRequests.map((request) => {
                                const fits = fitsRequest(request)
                                return (
                                    <Card key={request.rideId}>
                                        <div className="text-sm mb-2">
                                            <div className="flex justify-between gap-2">
                                                <span className="truncate">
                                                    {request.pickup?.address}
                                                </span>
                                                {request.fareEstimate != null && (
                                                    <span className="font-semibold whitespace-nowrap">
                                                        {request.fareEstimate}{' '}
                                                        BDT
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 flex justify-between">
                                                <span>
                                                    {goodsLabel(request.goods)}
                                                </span>
                                                {position && (
                                                    <span>
                                                        {haversineDistanceKm(
                                                            position,
                                                            request.pickup,
                                                        ).toFixed(1)}{' '}
                                                        km away
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {!fits && (
                                            <div className="text-xs text-red-500 mb-2">
                                                {seatLeft
                                                    ? "Doesn't fit your remaining capacity"
                                                    : 'No rider seats left'}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="solid"
                                                disabled={!fits}
                                                loading={
                                                    respondingId ===
                                                    request.rideId
                                                }
                                                onClick={() =>
                                                    handleAccept(request.rideId)
                                                }
                                            >
                                                Accept
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                loading={
                                                    respondingId ===
                                                    request.rideId
                                                }
                                                onClick={() =>
                                                    handleReject(request.rideId)
                                                }
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default DriverHome
