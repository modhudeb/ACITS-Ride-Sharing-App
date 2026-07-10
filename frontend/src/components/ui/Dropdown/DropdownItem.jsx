import { useContext, useCallback, isValidElement, cloneElement } from 'react'
import isNil from 'lodash/isNil'
import useUncertainRef from '../hooks/useUncertainRef'
import useUniqueId from '../hooks/useUniqueId'
import classNames from '../utils/classNames'
import DropdownContext from './context/dropdownContext'
import MenuContext from './context/menuContext'
import MenuItem from '../MenuItem'
import { DROPDOWN_ITEM_TYPE } from '../utils/constants'
import { useFloatingTree } from '@floating-ui/react'

const { DEFAULT, DIVIDER, HEADER, CUSTOM } = DROPDOWN_ITEM_TYPE

const DropdownItem = (props) => {
    const {
        asElement: Component = 'li',
        children,
        active: activeProp,
        disabled,
        className,
        style,
        eventKey,
        onSelect,
        onClick,
        onFocus,
        ref = null,
        variant = DEFAULT,
        ...rest
    } = props

    const dropdown = useContext(DropdownContext)
    const menu = useContext(MenuContext)

    const menuitemRef = useUncertainRef(ref)

    const menuitemId = useUniqueId('menu-item-')

    const active =
        activeProp ||
        (!isNil(dropdown?.activeKey) && dropdown?.activeKey === eventKey)

    const tree = useFloatingTree()

    const activate = useCallback(
        (e) => {
            onSelect?.(eventKey || '', e)
            onClick?.(e)
        },
        [eventKey, onClick, onSelect],
    )

    const handleClick = useCallback(
        (e) => {
            if (disabled) {
                return
            }

            activate(e)
            tree?.events.emit('click')
        },
        [disabled, activate, tree?.events],
    )

    const menuitemEventHandlers = {
        ...menu.getItemProps({
            onClick(event) {
                handleClick(event)
            },
            onFocus(event) {
                onFocus?.(event)
                menu.setHasFocusInside(true)
            },
        }),
    }

    if (variant === DIVIDER || variant === HEADER || variant === CUSTOM) {
        return (
            <Component
                ref={menuitemRef}
                id={menuitemId}
                style={style}
                className={classNames(`menu-item-${variant}`, className)}
                {...(variant === CUSTOM ? menuitemEventHandlers : {})}
                {...rest}
            >
                {(variant === HEADER || variant === CUSTOM) && children}
            </Component>
        )
    }

    function renderChildren() {
        if (!isValidElement(children)) {
            return children
        }
        return cloneElement(children)
    }

    return (
        <MenuItem
            ref={menuitemRef}
            asElement={Component}
            style={style}
            isActive={active}
            disabled={disabled}
            eventKey={eventKey}
            className={className}
            {...menuitemEventHandlers}
            {...rest}
        >
            {renderChildren()}
        </MenuItem>
    )
}

export default DropdownItem
