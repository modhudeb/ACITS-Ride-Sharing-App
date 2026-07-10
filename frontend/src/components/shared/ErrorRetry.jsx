import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'

// Consistent "something failed, here's how to recover" state for data views.
// SWR (and similar) swallow fetch errors into a silent perpetual spinner
// otherwise - this makes the failure visible and gives the user a way out.
const ErrorRetry = ({ message = 'Failed to load data', onRetry, retrying }) => (
    <Alert type="danger" showIcon>
        <div className="flex items-center justify-between gap-4">
            <span>{message}</span>
            {onRetry && (
                <Button size="sm" loading={retrying} onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    </Alert>
)

export default ErrorRetry
