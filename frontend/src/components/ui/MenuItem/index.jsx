import classNames from 'classnames'
import { PiDotOutlineFill } from 'react-icons/pi'

const MenuItem = (props) => {
    const {
        asElement: Component = 'div',
        children,
        className,
        disabled,
        dotIndent,
        eventKey,
        isActive,
        menuItemHeight = 42,
        onSelect,
        ref,
        style,
        ...rest
    } = props

    const menuItemActiveClass = `menu-item-active`
    const menuItemHoverClass = `menu-item-hoverable`
    const disabledClass = 'menu-item-disabled'
    const menuItemClass = classNames(
        'menu-item',
        isActive && menuItemActiveClass,
        disabled && disabledClass,
        !disabled && menuItemHoverClass,
        dotIndent && 'items-center gap-2',
        className,
    )

    const hanldeOnClick = (e) => {
        if (onSelect) {
            onSelect(eventKey, e)
        }
    }

    return (
        <Component
            ref={ref}
            className={menuItemClass}
            style={{ height: `${menuItemHeight}px`, ...style }}
            onClick={hanldeOnClick}
            {...rest}
        >
            {dotIndent ? (
                <>
                    <div>
                        <PiDotOutlineFill
                            className={classNames(
                                'text-3xl w-[24px]',
                                !isActive && 'opacity-25',
                            )}
                        />
                    </div>
                    {children}
                </>
            ) : (
                <>{children}</>
            )}
        </Component>
    )
}

export default MenuItem
