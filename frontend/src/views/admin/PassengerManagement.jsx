import { useEffect, useState, useCallback } from 'react'
import Table from '@/components/ui/Table'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Loading from '@/components/shared/Loading'
import ErrorRetry from '@/components/shared/ErrorRetry'
import {
    apiGetPassengers,
    apiUpdatePassengerStatus,
} from '@/services/AdminService'

const { Tr, Th, Td, THead, TBody } = Table

const statusColor = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100',
    suspended: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-100',
}

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

const PassengerManagement = () => {
    const [passengers, setPassengers] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [updatingUid, setUpdatingUid] = useState('')

    const loadPassengers = useCallback(async () => {
        setLoading(true)
        try {
            const data = await apiGetPassengers()
            setPassengers(data)
            setLoadError(false)
        } catch {
            setLoadError(true)
            notify('Failed to load passengers', 'danger')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadPassengers()
    }, [loadPassengers])

    const handleStatusChange = async (uid, status) => {
        setUpdatingUid(uid)
        try {
            await apiUpdatePassengerStatus(uid, status)
            setPassengers((prev) =>
                prev.map((passenger) =>
                    passenger.uid === uid ? { ...passenger, status } : passenger,
                ),
            )
            notify('Passenger updated', 'success')
        } catch {
            notify('Failed to update passenger', 'danger')
        } finally {
            setUpdatingUid('')
        }
    }

    return (
        <div>
            <h3 className="mb-4">Passenger Management</h3>
            {loadError && !loading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load passengers"
                        onRetry={loadPassengers}
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
                            <Th>Actions</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {passengers.map((passenger) => (
                            <Tr key={passenger.uid}>
                                <Td>{passenger.name || '-'}</Td>
                                <Td>{passenger.email}</Td>
                                <Td>
                                    <Tag className={statusColor[passenger.status]}>
                                        {passenger.status}
                                    </Tag>
                                </Td>
                                <Td>
                                    <div className="flex gap-2">
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            loading={updatingUid === passenger.uid}
                                            disabled={passenger.status === 'active'}
                                            onClick={() =>
                                                handleStatusChange(
                                                    passenger.uid,
                                                    'active',
                                                )
                                            }
                                        >
                                            Activate
                                        </Button>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            loading={updatingUid === passenger.uid}
                                            disabled={passenger.status === 'suspended'}
                                            onClick={() =>
                                                handleStatusChange(
                                                    passenger.uid,
                                                    'suspended',
                                                )
                                            }
                                        >
                                            Suspend
                                        </Button>
                                    </div>
                                </Td>
                            </Tr>
                        ))}
                        {!loading && passengers.length === 0 && (
                            <Tr>
                                <Td colSpan={4} className="text-center">
                                    No passengers have signed up yet
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </Loading>
        </div>
    )
}

export default PassengerManagement
