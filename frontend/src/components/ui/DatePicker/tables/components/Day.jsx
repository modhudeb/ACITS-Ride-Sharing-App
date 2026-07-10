import classNames from 'classnames'

function getDayTabIndex({ focusable, hasValue, selected, firstInMonth }) {
    if (!focusable) {
        return -1
    }

    if (hasValue) {
        return selected ? 0 : -1
    }

    return firstInMonth ? 0 : -1
}

const Day = (props) => {
    const {
        className,
        value,
        selected,
        weekend,
        outOfMonth,
        onMouseEnter,
        hasValue,
        firstInRange,
        lastInRange,
        inRange,
        isToday,
        firstInMonth,
        focusable,
        hideOutOfMonthDates,
        ref,
        renderDay,
        disabled,
        // eslint-disable-next-line no-unused-vars
        fullWidth,
        ...others
    } = props

    return (
        <button
            {...others}
            ref={ref}
            type="button"
            disabled={disabled}
            tabIndex={getDayTabIndex({
                focusable,
                hasValue,
                selected,
                firstInMonth,
            })}
            className={classNames(
                'date-picker-cell-content',
                disabled && 'date-picker-cell-disabled',
                isToday && `ring-1 ring-inset ring-primary`,
                weekend && !disabled && 'date-picker-cell-weekend',
                outOfMonth && !disabled && 'date-picker-other-month',
                outOfMonth && hideOutOfMonthDates && 'd-none',
                !outOfMonth &&
                    !disabled &&
                    !selected &&
                    'date-picker-cell-current-month',
                !disabled &&
                    !selected &&
                    !inRange &&
                    'date-picker-cell-hoverable',
                selected &&
                    !disabled &&
                    'date-picker-cell-selected bg-primary text-neutral',
                inRange &&
                    !disabled &&
                    !firstInRange &&
                    !lastInRange &&
                    !selected &&
                    'bg-primary-subtle',
                !inRange && !firstInRange && !lastInRange && 'rounded-full',
                inRange && isToday && 'date-picker-cell-inrange-today',
                firstInRange && !disabled && 'date-picker-cell-selected-start',
                lastInRange && !disabled && 'date-picker-cell-selected-end',
                className,
            )}
            onMouseEnter={(event) => onMouseEnter(value, event)}
        >
            {typeof renderDay === 'function'
                ? renderDay(value)
                : value?.getDate()}
        </button>
    )
}

export default Day
