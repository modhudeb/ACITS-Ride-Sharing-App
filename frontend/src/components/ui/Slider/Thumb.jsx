import { useState } from 'react'
import classNames from '../utils/classNames'

const Thumb = ({
    max,
    min,
    value,
    position,
    tooltip,
    direction,
    dragging,
    onMouseDown,
    onKeyDownCapture,
    alwaysShowTooltip,
    thumbAriaLabel,
    onFocus,
    onBlur,
    showTooltipOnHover,
    isHovered,
    children = null,
    disabled,
    thumbClass,
    ref,
}) => {
    const [focused, setFocused] = useState(false)

    const isVisible =
        alwaysShowTooltip ||
        (showTooltipOnHover && (isHovered || dragging || focused))

    return (
        <div
            className="slider-thumb-wrapper"
            style={
                direction === 'rtl'
                    ? { right: `${position}%` }
                    : { left: `${position}%` }
            }
        >
            <div
                ref={ref}
                tabIndex={0}
                role="slider"
                aria-label={thumbAriaLabel}
                aria-valuemax={max}
                aria-valuemin={min}
                aria-valuenow={value}
                className={classNames(
                    'slider-thumb',
                    disabled && 'disabled',
                    dragging && 'dragging',
                    thumbClass,
                )}
                onFocus={(event) => {
                    setFocused(true)
                    if (typeof onFocus === 'function') {
                        onFocus(event)
                    }
                }}
                onBlur={(event) => {
                    setFocused(false)
                    if (typeof onBlur === 'function') {
                        onBlur(event)
                    }
                }}
                onTouchStart={onMouseDown}
                onMouseDown={onMouseDown}
                onKeyDownCapture={onKeyDownCapture}
                onClick={(event) => event.stopPropagation()}
            >
                {children}
            </div>
            {isVisible && <div className="slider-tooltip">{tooltip}</div>}
        </div>
    )
}

export default Thumb
