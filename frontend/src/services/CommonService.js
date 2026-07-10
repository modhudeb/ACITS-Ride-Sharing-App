import ApiService from './ApiService'

export async function apiGetNotificationCount() {
    return ApiService.fetchDataWithAxios({
        url: '/notification/count',
        method: 'get',
    })
}

export async function apiGetNotificationList() {
    return ApiService.fetchDataWithAxios({
        url: '/notification/list',
        method: 'get',
    })
}

export async function apiGetSearchResult(params) {
    return ApiService.fetchDataWithAxios({
        url: '/search/query',
        method: 'get',
        params,
    })
}
