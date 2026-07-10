import classNames from 'classnames'
import { MenuContextProvider } from './context/menuContext'

const Menu = (props) => {
    const {
        children,
        className,
        defaultActiveKeys = [],
        defaultExpandedKeys = [],
        defaultCollapseActiveKeys = [],
        menuItemHeight = 48,
        onSelect,
        ref,
        sideCollapsed = false,
        ...rest
    } = props

    const menuDefaultClass = 'menu'

    const menuClass = classNames(menuDefaultClass, className)

    return (
        <nav ref={ref} className={menuClass} {...rest}>
            <MenuContextProvider
                value={{
                    onSelect,
                    menuItemHeight,
                    sideCollapsed,
                    defaultExpandedKeys,
                    defaultActiveKeys,
                    defaultCollapseActiveKeys,
                }}
            >
                {children}
            </MenuContextProvider>
        </nav>
    )
}

export default Menu
