import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

export async function apiSetDriverStatus(driverStatus) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.driverStatus,
        method: 'post',
        data: { status: driverStatus },
    })
}

export async function apiUpdateDriverLocation({ lat, lng }) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.driverLocation,
        method: 'post',
        data: { lat, lng },
    })
}

export async function apiSetVehicleDetails({
    vehicleType,
    vehicleModel,
    plateNumber,
    maxWeightKg,
    maxVolumeM3,
    maxPassengers,
}) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.driverVehicle,
        method: 'post',
        data: {
            vehicle_type: vehicleType,
            vehicle_model: vehicleModel,
            plate_number: plateNumber,
            max_weight_kg: maxWeightKg,
            max_volume_m3: maxVolumeM3,
            max_passengers: maxPassengers,
        },
    })
}

export async function apiGetDemandHeatmap() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.driverHeatmap,
        method: 'get',
    })
}

export async function apiGetDriverEarnings() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.driverEarnings,
        method: 'get',
    })
}
