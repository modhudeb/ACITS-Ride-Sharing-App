import debounce from 'lodash/debounce'

function useDebounce(func, wait, options) {
    return debounce(func, wait, options)
}

export default useDebounce
