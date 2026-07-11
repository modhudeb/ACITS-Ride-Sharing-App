import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

export async function apiGetMyProfile() {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.usersMe,
        method: 'get',
    })
}
