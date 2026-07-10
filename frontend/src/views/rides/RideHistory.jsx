import useSWR from 'swr'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import ErrorRetry from '@/components/shared/ErrorRetry'
import StarRating from '@/components/shared/StarRating'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { apiGetRideHistory, apiRateRide } from '@/services/RideService'
import { useAuth } from '@/auth'
import { DRIVER } from '@/constants/roles.constant'

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

const { Tr, Th, Td, THead, TBody } = Table

const statusColor = {
    completed:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100',
}

const RideHistory = () => {
    const { user } = useAuth()
    const isDriver = user.authority?.includes(DRIVER)
    const {
        data: rides,
        isLoading,
        error,
        isValidating,
        mutate,
    } = useSWR('ride-history', () => apiGetRideHistory())

    const handleRate = async (rideId, value) => {
        try {
            await apiRateRide(rideId, value)
        } catch {
            notify('Could not submit rating - please try again', 'danger')
        } finally {
            // Refresh either way: on success this shows the new "Rated" state;
            // on failure it reflects whatever the server actually has.
            mutate()
        }
    }

    return (
        <div className="h-full overflow-auto p-4 sm:p-6 max-w-3xl mx-auto">
            <h3 className="mb-4">Ride History</h3>
            {error && !isLoading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load ride history"
                        retrying={isValidating}
                        onRetry={() => mutate()}
                    />
                </div>
            )}
            <Loading loading={isLoading}>
                <Table>
                    <THead>
                        <Tr>
                            <Th>{isDriver ? 'Passenger' : 'Driver'}</Th>
                            <Th>Pickup</Th>
                            <Th>Destination</Th>
                            <Th>Fare</Th>
                            <Th>Status</Th>
                            <Th>Rating</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {(rides || []).map((ride) => (
                            <Tr key={ride.id}>
                                <Td>{ride.counterparty_name || '-'}</Td>
                                <Td className="max-w-[200px] truncate">
                                    {ride.pickup?.address}
                                </Td>
                                <Td className="max-w-[200px] truncate">
                                    {ride.destination?.address}
                                </Td>
                                <Td>{ride.final_fare ?? ride.fare_estimate} BDT</Td>
                                <Td>
                                    <Tag className={statusColor[ride.status]}>
                                        {ride.status}
                                    </Tag>
                                </Td>
                                <Td>
                                    {ride.status === 'completed' ? (
                                        ride.rated_by_me ? (
                                            <span className="text-xs text-gray-400">
                                                Rated
                                            </span>
                                        ) : (
                                            <StarRating
                                                onRate={(value) =>
                                                    handleRate(ride.id, value)
                                                }
                                            />
                                        )
                                    ) : (
                                        <span className="text-xs text-gray-400">
                                            -
                                        </span>
                                    )}
                                </Td>
                            </Tr>
                        ))}
                        {!isLoading && (!rides || rides.length === 0) && (
                            <Tr>
                                <Td colSpan={6} className="text-center">
                                    No past rides yet
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </Loading>
        </div>
    )
}

export default RideHistory
