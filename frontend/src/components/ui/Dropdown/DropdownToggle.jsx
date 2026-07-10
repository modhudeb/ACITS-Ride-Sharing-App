import classNames from 'classnames'
import {
    TbChevronDown,
    TbChevronUp,
    TbChevronRight,
    TbChevronLeft,
} from 'react-icons/tb'

const DropdownToggleDefaultContent = ({ placement, children }) => {
    if (placement && placement.includes('right')) {
        return (
            <>
                {children}
                <TbChevronRight />
            </>
        )
    }

    if (placement && placement.includes('left')) {
        return (
            <>
                <TbChevronLeft />
                {children}
            </>
        )
    }

    if (placement && placement.includes('right')) {
        return (
            <>
                {children}
                <TbChevronUp />
            </>
        )
    }

    return (
        <>
            {children}
            <TbChevronDown />
        </>
    )
}

const DropdownToggle = (props) => {
    const {
        className,
        renderTitle,
        children,
        placement = 'bottom-start',
        disabled,
        ref,
        toggleClassName,
        ...rest
    } = props

    const toggleClass = 'dropdown-toggle'
    const disabledClass = 'dropdown-toggle-disabled'

    const dropdownToggleClass = classNames(
        toggleClass,
        className,
        toggleClassName,
        disabled && disabledClass,
    )

    const dropdownToggleDefaultClass = classNames(
        dropdownToggleClass,
        'dropdown-toggle-default',
    )

    if (renderTitle) {
        return (
            <div className={dropdownToggleClass} {...rest} ref={ref}>
                {renderTitle}
            </div>
        )
    }

    return (
        <div ref={ref} className={dropdownToggleDefaultClass} {...rest}>
            <span className="flex items-center gap-1">
                <DropdownToggleDefaultContent placement={placement}>
                    {children}
                </DropdownToggleDefaultContent>
            </span>
        </div>
    )
}

export default DropdownToggle
