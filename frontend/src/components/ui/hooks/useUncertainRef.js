import { useRef } from 'react'

export default function useUncertainRef(ref) {
    const newRef = useRef(null)

    if (ref) {
        return ref
    }

    return newRef
}
