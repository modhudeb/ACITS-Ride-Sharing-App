import Alert from '@/components/ui/Alert'
import SignUpForm from './components/SignUpForm'
import ActionLink from '@/components/shared/ActionLink'
import useTimeOutMessage from '@/utils/hooks/useTimeOutMessage'

export const SignUpBase = ({ signInUrl = '/sign-in', disableSubmit }) => {
    const [message, setMessage] = useTimeOutMessage()

    return (
        <>
            <div className="mb-8">
                <h3 className="mb-1">Create your account</h3>
                <p className="font-semibold heading-text">
                    Join ACITS to book or drive pooled company rides
                </p>
            </div>
            {message && (
                <Alert showIcon className="mb-4" type="danger">
                    <span className="break-all">{message}</span>
                </Alert>
            )}
            <SignUpForm disableSubmit={disableSubmit} setMessage={setMessage} />
            <div>
                <div className="mt-6 text-center">
                    <span>Already have an account? </span>
                    <ActionLink
                        to={signInUrl}
                        className="heading-text font-bold"
                        themeColor={false}
                    >
                        Sign in
                    </ActionLink>
                </div>
            </div>
        </>
    )
}

const SignUp = () => {
    return <SignUpBase />
}

export default SignUp
