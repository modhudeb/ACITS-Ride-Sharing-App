import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

export async function apiAssistantChat({ message, location, history }) {
    return ApiService.fetchDataWithAxios({
        url: endpointConfig.assistantChat,
        method: 'post',
        data: { message, location, history: history || [] },
    })
}
