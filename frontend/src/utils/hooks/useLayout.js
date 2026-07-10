import { createContext, useContext } from 'react'

export const LayoutContext = createContext(undefined)

const useLayout = () => {
    const context = useContext(LayoutContext)
    if (!context) {
        throw new Error('useLayout must be used within a LayoutProvider')
    }
    return context
}

export default useLayout
