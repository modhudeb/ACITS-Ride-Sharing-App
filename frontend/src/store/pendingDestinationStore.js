import { create } from 'zustand'

// Views.jsx wraps every route in <Suspense key={location.key}>, so any
// navigate() call - even to the same path - remounts the whole route tree
// and wipes component state. Router `state` can't survive that, so the chat
// assistant hands off its picked place through this store instead, which
// lives outside the React tree.
export const usePendingDestinationStore = create((set) => ({
    pendingDestination: null,
    setPendingDestination: (payload) => set({ pendingDestination: payload }),
    clearPendingDestination: () => set({ pendingDestination: null }),
}))
