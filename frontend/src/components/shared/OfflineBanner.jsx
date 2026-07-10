import useOnlineStatus from '@/utils/hooks/useOnlineStatus'

// Shown on the live-tracking map views - the highest-stakes place for a
// dropped connection to go unnoticed, since ride status/location updates
// arrive via Firestore listeners that silently stall while offline.
const OfflineBanner = () => {
    const online = useOnlineStatus()
    if (online) return null

    return (
        <div className="absolute top-0 left-0 right-0 z-30 bg-red-600 text-white text-sm text-center py-1.5">
            You&apos;re offline - live updates are paused until your
            connection comes back.
        </div>
    )
}

export default OfflineBanner
