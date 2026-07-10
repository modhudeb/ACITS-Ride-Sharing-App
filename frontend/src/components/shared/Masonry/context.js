import { createContext, useContext } from 'react'

export const MasonryItemContext = createContext({
    column: 0,
    position: 0,
})

export const useMasonryItem = () => useContext(MasonryItemContext)
