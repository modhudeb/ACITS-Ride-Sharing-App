import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

export async function apiGetDrivers(params) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminDrivers,
        method: 'get',
        params,
    })
}

export async function apiUpdateDriverStatus(uid, status) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminDriver(uid),
        method: 'patch',
        data: { status },
    })
}

export async function apiGetPassengers() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminPassengers,
        method: 'get',
    })
}

export async function apiUpdatePassengerStatus(uid, status) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminPassenger(uid),
        method: 'patch',
        data: { status },
    })
}

export async function apiGetPricing() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminPricing,
        method: 'get',
    })
}

export async function apiUpdatePricing(pricing) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminPricing,
        method: 'put',
        data: pricing,
    })
}

export async function apiGetAdminRides(params) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminRides,
        method: 'get',
        params,
    })
}

export async function apiGetDashboardStats() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.adminDashboardStats,
        method: 'get',
    })
}
