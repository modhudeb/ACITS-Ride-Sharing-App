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
