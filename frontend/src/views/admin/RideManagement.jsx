import { useState } from 'react'
import useSWR from 'swr'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import ErrorRetry from '@/components/shared/ErrorRetry'
import { apiGetAdminRides } from '@/services/AdminService'

const { Tr, Th, Td, THead, TBody } = Table

const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'requested', label: 'Requested' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
]

const statusColor = {
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-100',
    requested: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100',
    accepted: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-100',
    in_progress: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-100',
    completed:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100',
}

const goodsLabel = (goods) => {
    const kg = goods?.weight_kg || 0
    const m3 = goods?.volume_m3 || 0
    if (!kg && !m3) return '-'
    return `${kg} kg / ${m3} m³`
}

const RideManagement = () => {
    const [statusFilter, setStatusFilter] = useState(STATUS_OPTIONS[0])

    const {
        data: rides,
        isLoading,
        error,
        isValidating,
        mutate,
    } = useSWR(['admin-rides', statusFilter.value], () =>
        apiGetAdminRides(
            statusFilter.value ? { ride_status: statusFilter.value } : {},
        ),
    )

    return (
        <div className="h-full overflow-auto p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 gap-4">
                <h3>Rides</h3>
                <div className="w-48">
                    <Select
                        size="sm"
                        options={STATUS_OPTIONS}
                        value={statusFilter}
                        onChange={(option) => setStatusFilter(option)}
                    />
                </div>
            </div>
            {error && !isLoading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load rides"
                        retrying={isValidating}
                        onRetry={() => mutate()}
                    />
                </div>
            )}
            <Loading loading={isLoading}>
                <Table>
                    <THead>
                        <Tr>
                            <Th>Requested</Th>
                            <Th>Passenger</Th>
                            <Th>Driver</Th>
                            <Th>Route</Th>
                            <Th>Goods</Th>
                            <Th>Fare</Th>
                            <Th>Status</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {(rides || []).map((ride) => (
                            <Tr key={ride.id}>
                                <Td className="whitespace-nowrap">
                                    {ride.requested_at
                                        ? new Date(
                                              ride.requested_at,
                                          ).toLocaleString()
                                        : '-'}
                                </Td>
                                <Td>{ride.passenger_name || '-'}</Td>
                                <Td>{ride.driver_name || '-'}</Td>
                                <Td className="max-w-[260px]">
                                    <div className="truncate">
                                        {ride.pickup_address}
                                    </div>
                                    <div className="truncate text-xs text-gray-400">
                                        → {ride.destination_address}
                                    </div>
                                </Td>
                                <Td>{goodsLabel(ride.goods)}</Td>
                                <Td className="whitespace-nowrap">
                                    {ride.final_fare ?? ride.fare_estimate} BDT
                                    {ride.cancellation_fee > 0 && (
                                        <div className="text-xs text-red-500">
                                            +{ride.cancellation_fee} cancel fee
                                        </div>
                                    )}
                                </Td>
                                <Td>
                                    <Tag className={statusColor[ride.status]}>
                                        {ride.status}
                                    </Tag>
                                </Td>
                            </Tr>
                        ))}
                        {!isLoading && (!rides || rides.length === 0) && (
                            <Tr>
                                <Td colSpan={7} className="text-center">
                                    No rides found
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </Loading>
        </div>
    )
}

export default RideManagement
