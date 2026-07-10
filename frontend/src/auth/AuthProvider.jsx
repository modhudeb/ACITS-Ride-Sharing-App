import { useRef, useImperativeHandle, useState, useEffect } from 'react'
import AuthContext from './AuthContext'
import appConfig from '@/configs/app.config'
import { useSessionUser, useToken } from '@/store/authStore'
import { apiAdminSignIn, apiSignIn, apiSignOut, apiSignUp } from '@/services/AuthService'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { useNavigate } from 'react-router'
import { onIdTokenChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/services/firebase/firebaseApp'

const IsolatedNavigator = ({ ref }) => {
    const navigate = useNavigate()

    useImperativeHandle(ref, () => {
        return {
            navigate,
        }
    }, [navigate])

    return <></>
}

function AuthProvider({ children }) {
    const signedIn = useSessionUser((state) => state.session.signedIn)
    const user = useSessionUser((state) => state.user)
    const setUser = useSessionUser((state) => state.setUser)
    const setSessionSignedIn = useSessionUser(
        (state) => state.setSessionSignedIn,
    )
    const { token, setToken } = useToken()
    const  [tokenState, setTokenState] = useState(token)

    const authenticated = Boolean(tokenState && signedIn)

    const navigatorRef = useRef(null)

    useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
            if (!firebaseUser || !signedIn) return
            const freshToken = await firebaseUser.getIdToken()
            setToken(freshToken)
            setTokenState(freshToken)
        })
        return unsubscribe
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn])

    // Role/status (e.g. an admin approving a driver, or suspending an
    // account) live in Firestore and only got baked into the persisted user
    // object at sign-in time - without this, a refresh just replays the same
    // stale localStorage snapshot forever. This keeps it live instead.
    useEffect(() => {
        if (!authenticated || !user.uid) return

        const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
            if (!snapshot.exists()) return
            const profile = snapshot.data()
            setUser({
                userName: profile.name || '',
                avatar: profile.photoUrl || '',
                authority: profile.role ? [profile.role] : [],
                status: profile.status || 'active',
            })
        })

        return unsubscribe
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticated, user.uid])

    const redirect = () => {
        const search = window.location.search
        const params = new URLSearchParams(search)
        const redirectUrl = params.get(REDIRECT_URL_KEY)

        navigatorRef.current?.navigate(
            redirectUrl ? redirectUrl : appConfig.authenticatedEntryPath,
        )
    }

    const handleSignIn = (tokens, user) => {
        setToken(tokens.accessToken)
        setTokenState(tokens.accessToken)
        setSessionSignedIn(true)

        if (user) {
            setUser(user)
        }
    }

    const handleSignOut = () => {
        setToken('')
        setUser({})
        setSessionSignedIn(false)
    }

    const signIn = async (values) => {
        try {
            const resp = await apiSignIn(values)
            if (resp) {
                handleSignIn({ accessToken: resp.token }, resp.user)
                redirect()
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'Unable to sign in',
            }
        } catch (errors) {
            return {
                status: 'failed',
                message:
                    errors?.response?.data?.message ||
                    errors?.message ||
                    errors.toString(),
            }
        }
    }

    const signUp = async (values) => {
        try {
            const resp = await apiSignUp(values)
            if (resp) {
                handleSignIn({ accessToken: resp.token }, resp.user)
                redirect()
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'Unable to sign up',
            }
        } catch (errors) {
            return {
                status: 'failed',
                message:
                    errors?.response?.data?.message ||
                    errors?.message ||
                    errors.toString(),
            }
        }
    }

    const adminSignIn = async (values) => {
        try {
            const resp = await apiAdminSignIn(values)
            if (resp) {
                // No redirect() call - the caller is already sitting on the
                // /admin route it wants; ProtectedRoute re-renders in place
                // once `authenticated` flips true.
                handleSignIn({ accessToken: resp.token }, resp.user)
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'Unable to sign in',
            }
        } catch (errors) {
            return {
                status: 'failed',
                message:
                    errors?.response?.data?.message ||
                    errors?.message ||
                    errors.toString(),
            }
        }
    }

    const signOut = async () => {
        try {
            await apiSignOut()
        } finally {
            handleSignOut()
            navigatorRef.current?.navigate('/')
        }
    }
    const oAuthSignIn = (callback) => {
        callback({
            onSignIn: handleSignIn,
            redirect,
        })
    }

    return (
        <AuthContext.Provider
            value={{
                authenticated,
                user,
                signIn,
                signUp,
                adminSignIn,
                signOut,
                oAuthSignIn,
            }}
        >
            {children}
            <IsolatedNavigator ref={navigatorRef} />
        </AuthContext.Provider>
    )
}

export default AuthProvider
