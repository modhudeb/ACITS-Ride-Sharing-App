// FastAPI puts error text under `detail`, not `message` - and for 422
// validation errors `detail` is an array of {msg, loc, ...} objects rather
// than a plain string. Axios's own `error.message` (e.g. "Request failed
// with status code 422") is a poor fallback since it never surfaces what
// actually went wrong.
export function getApiErrorMessage(error, fallback = 'Something went wrong') {
    const detail = error?.response?.data?.detail

    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
        return detail.map((item) => item?.msg).filter(Boolean).join(', ') || fallback
    }
    return error?.message || fallback
}
