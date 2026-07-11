import { useEffect, useState, useCallback } from 'react'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Loading from '@/components/shared/Loading'
import ErrorRetry from '@/components/shared/ErrorRetry'
import { apiGetDrivers, apiUpdateDriverStatus } from '@/services/AdminService'

const { Tr, Th, Td, THead, TBody } = Table

const statusColor = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100',
    pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-100',
    suspended: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100',
}

const notify = (title, type) => {
    toast.push(
        <Notification title={title} type={type} />,
        { placement: 'top-center' },
    )
}

const DriverApproval = () => {
    const [drivers, setDrivers] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [updatingUid, setUpdatingUid] = useState('')

    const loadDrivers = useCallback(async () => {
        setLoading(true)
        try {
            const data = await apiGetDrivers()
            setDrivers(data)
            setLoadError(false)
        } catch {
            setLoadError(true)
            notify('Failed to load drivers', 'danger')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadDrivers()
    }, [loadDrivers])

    const handleStatusChange = async (uid, status) => {
        setUpdatingUid(uid)
        try {
            await apiUpdateDriverStatus(uid, status)
            setDrivers((prev) =>
                prev.map((driver) =>
                    driver.uid === uid ? { ...driver, status } : driver,
                ),
            )
            notify('Driver updated', 'success')
        } catch {
            notify('Failed to update driver', 'danger')
        } finally {
            setUpdatingUid('')
        }
    }

    return (
        <div>
            <h3 className="mb-4">Driver Approvals</h3>
            {loadError && !loading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load drivers"
                        onRetry={loadDrivers}
                    />
                </div>
            )}
            <Loading loading={loading}>
                <Table>
                    <THead>
                        <Tr>
                            <Th>Name</Th>
                            <Th>Email</Th>
                            <Th>Status</Th>
                            <Th>Rating</Th>
                            <Th>Actions</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {drivers.map((driver) => (
                            <Tr key={driver.uid}>
                                <Td>{driver.name || '-'}</Td>
                                <Td>{driver.email}</Td>
                                <Td>
                                    <Tag className={statusColor[driver.status]}>
                                        {driver.status}
                                    </Tag>
                                </Td>
                                <Td>
                                    {driver.rating_count > 0 ? (
                                        <span className="text-amber-500">
                                            ★ {driver.rating_avg}{' '}
                                            <span className="text-gray-400">
                                                ({driver.rating_count})
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">—</span>
                                    )}
                                </Td>
                                <Td>
                                    <div className="flex gap-2">
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            loading={updatingUid === driver.uid}
                                            disabled={driver.status === 'active'}
                                            onClick={() =>
                                                handleStatusChange(driver.uid, 'active')
                                            }
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            loading={updatingUid === driver.uid}
                                            disabled={driver.status === 'suspended'}
                                            onClick={() =>
                                                handleStatusChange(driver.uid, 'suspended')
                                            }
                                        >
                                            Suspend
                                        </Button>
                                    </div>
                                </Td>
                            </Tr>
                        ))}
                        {!loading && drivers.length === 0 && (
                            <Tr>
                                <Td colSpan={5} className="text-center">
                                    No drivers have signed up yet
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </Loading>
        </div>
    )
}

export default DriverApproval
