import useSWR from 'swr'
import Card from '@/components/ui/Card'
import Loading from '@/components/shared/Loading'
import AbbreviateNumber from '@/components/shared/AbbreviateNumber'
import ErrorRetry from '@/components/shared/ErrorRetry'
import { apiGetDriverEarnings } from '@/services/DriverService'

const StatTile = ({ label, value, sub }) => (
    <Card>
        <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </Card>
)

const Earnings = () => {
    const {
        data,
        isLoading,
        error,
        mutate,
        isValidating,
    } = useSWR('driver-earnings', () => apiGetDriverEarnings())

    return (
        <div className="h-full overflow-auto p-4 sm:p-6 max-w-3xl mx-auto">
            <h3 className="mb-4">Earnings</h3>
            {error && !isLoading && (
                <div className="mb-4">
                    <ErrorRetry
                        message="Failed to load earnings"
                        retrying={isValidating}
                        onRetry={() => mutate()}
                    />
                </div>
            )}
            <Loading loading={isLoading}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatTile
                        label="Today"
                        value={`${data?.today_total ?? 0} BDT`}
                        sub={`${data?.today_rides ?? 0} rides`}
                    />
                    <StatTile
                        label="Last 7 days"
                        value={`${data?.week_total ?? 0} BDT`}
                        sub={`${data?.week_rides ?? 0} rides`}
                    />
                    <StatTile
                        label="All time"
                        value={`${data?.all_time_total ?? 0} BDT`}
                        sub={
                            <>
                                <AbbreviateNumber value={data?.all_time_rides ?? 0} />{' '}
                                rides
                            </>
                        }
                    />
                </div>
            </Loading>
        </div>
    )
}

export default Earnings
