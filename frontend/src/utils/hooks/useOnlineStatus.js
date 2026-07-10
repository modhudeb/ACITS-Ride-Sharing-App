import { useEffect, useState } from 'react'

// navigator.onLine only reflects the network interface, not real connectivity
// to our servers, but it reliably catches the common case (wifi/data dropped)
// and needs zero extra network calls - good enough to warn a rider mid-trip
// that Firestore's live updates may be stale.
const useOnlineStatus = () => {
    const [online, setOnline] = useState(navigator.onLine)

    useEffect(() => {
        const goOnline = () => setOnline(true)
        const goOffline = () => setOnline(false)
        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)
        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [])

    return online
}

export default useOnlineStatus
