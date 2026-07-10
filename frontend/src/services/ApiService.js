import AxiosBase from './axios/AxiosBase'

const ApiService = {
    fetchDataWithAxios(param) {
        return new Promise((resolve, reject) => {
            AxiosBase(param)
                .then((response) => {
                    resolve(response.data)
                })
                .catch((errors) => {
                    reject(errors)
                })
        })
    },
}

export default ApiService
