import Cookies from 'js-cookie'

const cookiesStorage = {
    getItem: (name) => {
        return Cookies.get(name) ?? null
    },
    setItem: (name, value, expires = 1) => {
        Cookies.set(name, value, { expires })
    },
    removeItem: (name) => {
        Cookies.remove(name)
    },
}

export default cookiesStorage
