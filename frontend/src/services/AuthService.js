import { ADMIN, DEFAULT_ROLE, DRIVER, PASSENGER } from '@/constants/roles.constant'
import ApiService from './ApiService'
import endpointConfig from '@/configs/endpoint.config'

const ROLE_LABEL = {
    [PASSENGER]: 'Rider',
    [DRIVER]: 'Driver',
    [ADMIN]: 'Admin',
}

function toSignInResult(resp) {
    return {
        token: resp.token,
        user: {
            uid: resp.user.uid,
            email: resp.user.email,
            userName: resp.user.name || '',
            avatar: '',
            authority: resp.user.role ? [resp.user.role] : [],
            status: resp.user.status || 'active',
        },
    }
}

export async function apiSignIn({ email, password, role }) {
    const resp = await ApiService.fetchDataWithAxios({
        url: endpointConfig.authSignIn,
        method: 'post',
        data: { email, password },
    })
    const result = toSignInResult(resp)

    if (
        role &&
        !result.user.authority.includes(role) &&
        !result.user.authority.includes(ADMIN)
    ) {
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
    let resp
    try {
        resp = await ApiService.fetchDataWithAxios({
            url: endpointConfig.adminLogin,
            method: 'post',
            data: { username, password },
        })
    } catch (error) {
        throw new Error(
            error?.response?.data?.detail || 'Unable to sign in as admin',
        )
    }
    return toSignInResult(resp)
}

export async function apiSignUp({ email, password, userName, role = DEFAULT_ROLE }) {
    const resp = await ApiService.fetchDataWithAxios({
        url: endpointConfig.authSignUp,
        method: 'post',
        data: { email, password, name: userName || '', role },
    })
    return toSignInResult(resp)
}

export async function apiSignOut() {
    // JWTs are stateless and long-lived by design (see backend/app/core/
    // security.py) - there's no server-side session to invalidate, so
    // signing out is just clearing the locally stored token.
    return true
}

export async function apiForgotPassword({ email }) {
    await ApiService.fetchDataWithAxios({
        url: endpointConfig.authForgotPassword,
        method: 'post',
        data: { email },
    })
    return true
}

export async function apiResetPassword({ password, token }) {
    await ApiService.fetchDataWithAxios({
        url: endpointConfig.authResetPassword,
        method: 'post',
        data: { token, new_password: password },
    })
    return true
}
