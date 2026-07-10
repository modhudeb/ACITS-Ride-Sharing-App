import {
    createUserWithEmailAndPassword,
    signInWithCustomToken,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    sendPasswordResetEmail,
    confirmPasswordReset,
    updateProfile,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './firebase/firebaseApp'
import { ADMIN, DEFAULT_ROLE, DRIVER, PASSENGER } from '@/constants/roles.constant'
import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

const ROLE_LABEL = {
    [PASSENGER]: 'Rider',
    [DRIVER]: 'Driver',
    [ADMIN]: 'Admin',
}

// Stamps the caller's Firestore role onto their Firebase Auth custom claims
// (backend /auth/claims), then force-refreshes the ID token so THIS session
// picks it up immediately. Once a token carries the claim, the backend's
// get_current_user reads it straight off the verified token instead of
// doing a Firestore lookup on every request. Non-fatal: if this fails, the
// backend's Firestore-read fallback keeps everything working as before.
async function syncRoleClaim(firebaseUser) {
    try {
        const freshToken = await firebaseUser.getIdToken()
        await ApiService.fetchDataWithAxios({
            url: endpointConfig.authClaims,
            method: 'post',
            headers: { Authorization: `Bearer ${freshToken}` },
        })
        await firebaseUser.getIdToken(true)
    } catch {
        // Fine - stays on the Firestore-read fallback until this succeeds.
    }
}

async function buildSignInResult(firebaseUser) {
    const userRef = doc(db, 'users', firebaseUser.uid)
    const snapshot = await getDoc(userRef)
    const profile = snapshot.exists() ? snapshot.data() : null
    const token = await firebaseUser.getIdToken()

    return {
        token,
        user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            userName: profile?.name || firebaseUser.displayName || '',
            avatar: profile?.photoUrl || '',
            authority: profile?.role ? [profile.role] : [],
            status: profile?.status || 'active',
        },
    }
}

export async function apiSignIn({ email, password, role }) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const result = await buildSignInResult(credential.user)

    if (
        role &&
        !result.user.authority.includes(role) &&
        !result.user.authority.includes(ADMIN)
    ) {
        await firebaseSignOut(auth)
        const actualRole = result.user.authority[0]
        const actualLabel = ROLE_LABEL[actualRole] || 'a different role'
        throw new Error(
            actualRole
                ? `This account is registered as a ${actualLabel}. Please switch to the ${actualLabel} tab to sign in.`
                : 'This account has no role assigned yet. Please contact support.',
        )
    }

    await syncRoleClaim(credential.user)
    result.token = await credential.user.getIdToken()

    return result
}

export async function apiAdminSignIn({ username, password }) {
    let customToken
    try {
        const resp = await ApiService.fetchDataWithAxios({
            url: endpointConfig.adminLogin,
            method: 'post',
            data: { username, password },
        })
        customToken = resp.custom_token
    } catch (error) {
        throw new Error(
            error?.response?.data?.detail || 'Unable to sign in as admin',
        )
    }

    const credential = await signInWithCustomToken(auth, customToken)
    return buildSignInResult(credential.user)
}

export async function apiSignUp({ email, password, userName, role = DEFAULT_ROLE }) {
    const credential = await createUserWithEmailAndPassword(auth, email, password)

    if (userName) {
        await updateProfile(credential.user, { displayName: userName })
    }

    const status = role === DRIVER ? 'pending_approval' : 'active'

    await setDoc(doc(db, 'users', credential.user.uid), {
        role,
        name: userName || '',
        email,
        status,
        createdAt: serverTimestamp(),
    })

    await syncRoleClaim(credential.user)

    return buildSignInResult(credential.user)
}

export async function apiSignOut() {
    await firebaseSignOut(auth)
}

export async function apiForgotPassword({ email }) {
    await sendPasswordResetEmail(auth, email)
    return true
}

export async function apiResetPassword({ password, oobCode }) {
    await confirmPasswordReset(auth, oobCode, password)
    return true
}
