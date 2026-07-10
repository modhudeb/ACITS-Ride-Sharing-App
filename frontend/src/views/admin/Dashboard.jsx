import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Loading from '@/components/shared/Loading'
import AbbreviateNumber from '@/components/shared/AbbreviateNumber'
import ErrorRetry from '@/components/shared/ErrorRetry'
import { apiGetDashboardStats } from '@/services/AdminService'

const StatTile = ({ label, value, sub }) => (
    <Card>
        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
)

const Dashboard = () => {
    const {
        data,
        isLoading,
        error,
        mutate,
        isValidating,
    } = useSWR('admin-dashboard-stats', () => apiGetDashboardStats())

    return (
        <div>
            <h3 className="mb-4">Dashboard</h3>
            {error && !isLoading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load dashboard stats"
                        retrying={isValidating}
                        onRetry={() => mutate()}
                    />
                </div>
            )}
            <Loading loading={isLoading}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile
                        label="Total passengers"
                        value={<AbbreviateNumber value={data?.total_passengers ?? 0} />}
                    />
                    <StatTile
                        label="Total drivers"
                        value={<AbbreviateNumber value={data?.total_drivers ?? 0} />}
                        sub={`${data?.pending_drivers ?? 0} pending approval`}
                    />
                    <StatTile
                        label="Online drivers"
                        value={<AbbreviateNumber value={data?.online_drivers ?? 0} />}
                    />
                    <StatTile
                        label="Rides today"
                        value={<AbbreviateNumber value={data?.rides_today ?? 0} />}
                    />
                    <StatTile
                        label="Total rides"
                        value={<AbbreviateNumber value={data?.total_rides ?? 0} />}
                        sub={`${data?.completed_rides ?? 0} completed`}
                    />
                    <StatTile
                        label="Total revenue"
                        value={`${data?.total_revenue ?? 0} BDT`}
                    />
                </div>
            </Loading>
        </div>
    )
}

export default Dashboard
