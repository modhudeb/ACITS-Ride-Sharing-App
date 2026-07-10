import { useContext } from 'react'
import isNil from 'lodash/isNil'
import useUncertainRef from '../hooks/useUncertainRef'
import useUniqueId from '../hooks/useUniqueId'
import { useConfig } from '../ConfigProvider'
import classNames from '../utils/classNames'
import DropdownContext from './context/dropdownContext'
import MenuItem from '../MenuItem'
import { TbChevronRight, TbChevronLeft } from 'react-icons/tb'

const DropdownSubMenu = (props) => {
    const {
        asElement: Component = 'li',
        children,
        active: activeProp,
        disabled,
        className,
        style,
        eventKey,
        onSelect,
        ref = null,
        ...rest
    } = props

    const { direction } = useConfig()

    const dropdown = useContext(DropdownContext)

    const menuitemRef = useUncertainRef(ref)
    const menuitemId = useUniqueId('menu-item-')

    const active =
        activeProp ||
        (!isNil(dropdown?.activeKey) && dropdown?.activeKey === eventKey)

    return (
        <ul style={style} className="relative" {...rest}>
            <MenuItem
                ref={menuitemRef}
                disabled={disabled}
                asElement={Component}
                id={menuitemId}
                isActive={active}
                eventKey={eventKey}
                className={classNames('dropdown-submenu-item', className)}
                onSelect={onSelect}
            >
                <span>{children}</span>
                {direction === 'rtl' ? <TbChevronLeft /> : <TbChevronRight />}
            </MenuItem>
        </ul>
    )
}

export default DropdownSubMenu
