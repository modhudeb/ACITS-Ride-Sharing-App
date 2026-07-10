import { create } from 'zustand'

export const useRouteKeyStore = create((set) => ({
    currentRouteKey: '',
    setCurrentRouteKey: (payload) => set(() => ({ currentRouteKey: payload })),
}))
