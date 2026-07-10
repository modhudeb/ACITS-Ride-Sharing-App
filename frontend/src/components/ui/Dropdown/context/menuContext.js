import { createContext } from 'react'

const MenuContext = createContext({
    getItemProps: () => ({}),
    activeIndex: null,
    setActiveIndex: () => {},
    setHasFocusInside: () => {},
    isOpen: false,
})

export const MenuContextProvider = MenuContext.Provider

export default MenuContext
