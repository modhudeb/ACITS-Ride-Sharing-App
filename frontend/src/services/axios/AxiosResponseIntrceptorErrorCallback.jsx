import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { useSessionUser, useToken } from '@/store/authStore'

const unauthorizedCode = [401, 419, 440]

const AxiosResponseIntrceptorErrorCallback = (error) => {
    const { response } = error
    const { setToken } = useToken()

    if (response && unauthorizedCode.includes(response.status)) {
        // Only a session that was actually signed in just expired - a failed
        // login attempt on the sign-in page is also a 401 but isn't this.
        const wasSignedIn = useSessionUser.getState().session.signedIn

        setToken('')
        useSessionUser.getState().setUser({})
        useSessionUser.getState().setSessionSignedIn(false)

        if (wasSignedIn) {
            toast.push(
                <Notification title="Session expired" type="warning">
                    Please sign in again to continue.
                </Notification>,
                { placement: 'top-center' },
            )
        }
    }
}

export default AxiosResponseIntrceptorErrorCallback
