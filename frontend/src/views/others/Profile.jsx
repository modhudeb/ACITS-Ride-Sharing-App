import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Avatar from '@/components/ui/Avatar'
import Loading from '@/components/shared/Loading'
import ErrorRetry from '@/components/shared/ErrorRetry'
import { apiGetMyProfile } from '@/services/ProfileService'

const statusColor = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100',
    pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100',
    suspended: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100',
}

const roleLabel = { passenger: 'Rider', driver: 'Driver', admin: 'Admin' }

const formatMemberSince = (isoDate) =>
    new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })

const StatBlock = ({ label, value }) => (
    <div className="flex flex-col items-center rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-700/40">
        <span className="text-lg font-bold sm:text-xl">{value}</span>
        <span className="text-xs text-gray-500">{label}</span>
    </div>
)

const Profile = () => {
    const { data: profile, isLoading, error, isValidating, mutate } = useSWR(
        'my-profile',
        () => apiGetMyProfile(),
    )

    if (isLoading) return <Loading loading />
    if (error || !profile) {
        return (
            <div className="p-4">
                <ErrorRetry
                    message="Could not load your profile"
                    onRetry={mutate}
                    retrying={isValidating}
                />
            </div>
        )
    }

    const initials = (profile.name || profile.email || '?').trim().slice(0, 2).toUpperCase()
    // Rides/rating are meaningless for an admin account - show only what's
    // real for the role instead of a "0 rides, no rating" placeholder.
    const showRideStats = profile.role === 'passenger' || profile.role === 'driver'

    return (
        <div className="mx-auto max-w-lg p-4 pb-24 sm:pb-4">
            <Card>
                <div className="flex flex-col items-center gap-3 py-2 text-center sm:flex-row sm:items-start sm:text-left">
                    <Avatar size={72} className="bg-emerald-600 text-white">
                        {initials}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <h4 className="truncate">{profile.name || 'Unnamed'}</h4>
                        <p className="truncate text-sm text-gray-500">{profile.email}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100">
                                {roleLabel[profile.role] || profile.role || 'Member'}
                            </Tag>
                            <Tag className={statusColor[profile.status] || ''}>
                                {profile.status.replace('_', ' ')}
                            </Tag>
                        </div>
                    </div>
                </div>

                {showRideStats ? (
                    <>
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <StatBlock
                                label="Rides completed"
                                value={profile.completed_rides}
                            />
                            <StatBlock
                                label="Rating"
                                value={
                                    profile.rating_count > 0
                                        ? `★ ${profile.rating_avg.toFixed(1)}`
                                        : '—'
                                }
                            />
                            <StatBlock label="Member since" value={formatMemberSince(profile.created_at)} />
                        </div>

                        {profile.rating_count > 0 && (
                            <p className="mt-2 text-center text-xs text-gray-400 sm:text-left">
                                Based on {profile.rating_count} rating{profile.rating_count > 1 ? 's' : ''}
                            </p>
                        )}
                    </>
                ) : (
                    <p className="mt-4 text-center text-sm text-gray-500 sm:text-left">
                        Member since {formatMemberSince(profile.created_at)}
                    </p>
                )}

                {profile.vehicle && (
                    <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                        <h6 className="mb-2">Vehicle</h6>
                        <div className="flex flex-col gap-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Type</span>
                                <span className="font-medium capitalize">{profile.vehicle.type}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Model</span>
                                <span className="font-medium">{profile.vehicle.model || '—'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Plate</span>
                                <span className="font-medium">{profile.vehicle.plate || '—'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}

export default Profile
