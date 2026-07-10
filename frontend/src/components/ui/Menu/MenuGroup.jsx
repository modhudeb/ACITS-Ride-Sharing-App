import { useContext } from 'react'
import classNames from 'classnames'
import { GroupContextProvider } from './context/groupContext'
import MenuContext from './context/menuContext'

const MenuGroup = (props) => {
    const { label, children, className } = props

    const { sideCollapsed } = useContext(MenuContext)

    const menuGroupDefaultClass = 'menu-group'
    const menuGroupClass = classNames(menuGroupDefaultClass, className)

    return (
        <div className={menuGroupClass}>
            {label && !sideCollapsed && (
                <div className={classNames('menu-title')}>{label}</div>
            )}
            <GroupContextProvider value={null}>
                <ul>{children}</ul>
            </GroupContextProvider>
        </div>
    )
}

MenuGroup.displayName = 'MenuGroup'

export default MenuGroup
