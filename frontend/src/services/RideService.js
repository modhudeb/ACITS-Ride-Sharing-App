import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

const NO_GOODS = { weight_kg: 0, volume_m3: 0, description: null }

export async function apiEstimateRoute({ pickup, destination, goods }) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.routeEstimate,
        method: 'post',
        data: { pickup, destination, goods: goods || NO_GOODS },
    })
}

export async function apiGetEta({ origin, destination }) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.routeEta,
        method: 'post',
        data: { origin, destination },
    })
}

export async function apiCreateRide({
    pickup,
    destination,
    estimate,
    goods,
    scheduledAt,
}) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rides,
        method: 'post',
        data: {
            pickup,
            destination,
            distance_meters: estimate.distance_meters,
            duration_seconds: estimate.duration_seconds,
            route_path: estimate.route_path,
            fare_estimate: estimate.fare_estimate,
            fare_breakdown: estimate.fare_breakdown,
            goods: goods || NO_GOODS,
            scheduled_at: scheduledAt || null,
        },
    })
}

export async function apiGetRide(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.ride(rideId),
        method: 'get',
    })
}

export async function apiCancelRide(rideId, reason) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideCancel(rideId),
        method: 'post',
        data: { reason },
    })
}

export async function apiAcceptRide(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideAccept(rideId),
        method: 'post',
    })
}

export async function apiRejectRide(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideReject(rideId),
        method: 'post',
    })
}

export async function apiStartRide(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideStart(rideId),
        method: 'post',
    })
}

export async function apiCompleteRide(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideComplete(rideId),
        method: 'post',
    })
}

export async function apiRateRide(rideId, rating, comment) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideRate(rideId),
        method: 'post',
        data: { rating, comment: comment || null },
    })
}

export async function apiGetRideHistory() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideHistory,
        method: 'get',
    })
}

// Backs the "do I have an active ride" hooks - refetched whenever their
// rides:{uid} realtime topic signals a change.
export async function apiGetActiveRides() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.ridesActive,
        method: 'get',
    })
}

// A driver's live pending-request feed - refetched on the driver_feed signal.
export async function apiGetPendingRequests() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.ridesPending,
        method: 'get',
    })
}

export async function apiGetRideMessages(rideId) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideMessages(rideId),
        method: 'get',
    })
}

export async function apiSendRideMessage(rideId, text) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.rideMessages(rideId),
        method: 'post',
        data: { text },
    })
}
