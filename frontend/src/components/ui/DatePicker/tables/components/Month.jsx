import { useMemo } from 'react'
import classNames from 'classnames'
import dayjs from 'dayjs'
import Day from './Day'
import getDayProps from './props/getDayProps'
import { isSameDate, getWeekdaysNames, getMonthDays } from '../../utils'
import { useConfig } from '../../../ConfigProvider'

const noop = () => false

const Month = (props) => {
    const {
        className,
        month,
        value,
        onChange,
        disableOutOfMonth = false,
        locale,
        dayClassName,
        dayStyle,
        minDate,
        maxDate,
        disableDate,
        onDayMouseEnter,
        range,
        hideWeekdays = false,
        fullWidth = false,
        preventFocus = false,
        focusable = true,
        firstDayOfWeek = 'monday',
        onDayKeyDown,
        daysRefs,
        hideOutOfMonthDates = false,
        isDateInRange = noop,
        isDateFirstInRange = noop,
        isDateLastInRange = noop,
        ref,
        renderDay,
        weekdayLabelFormat,
        weekendDays = [0, 6],
        ...rest
    } = props

    const { locale: themeLocale } = useConfig()

    const finalLocale = locale || themeLocale
    const days = getMonthDays(month, firstDayOfWeek)

    const weekdays = getWeekdaysNames(
        finalLocale,
        firstDayOfWeek,
        weekdayLabelFormat,
    ).map((weekday) => (
        <th key={weekday} className="week-day-cell">
            <span className="week-day-cell-content">{weekday}</span>
        </th>
    ))

    const hasValue = Array.isArray(value)
        ? value.every((item) => item instanceof Date)
        : value instanceof Date

    const hasValueInMonthRange =
        value instanceof Date &&
        dayjs(value).isAfter(dayjs(month).startOf('month')) &&
        dayjs(value).isBefore(dayjs(month).endOf('month'))

    const getDayPropsParams = {
        month: month,
        hasValue,
        minDate: minDate,
        maxDate: maxDate,
        value: value,
        disableDate: disableDate,
        disableOutOfMonth: disableOutOfMonth,
        range: range,
        weekendDays,
    }

    const firstIncludedDay = useMemo(
        () =>
            days
                .flatMap((_) => _)
                .find((date) => {
                    const dayProps = getDayProps({
                        ...getDayPropsParams,
                        ...{ date },
                    })

                    return !dayProps.disabled && !dayProps.outOfMonth
                }) || dayjs(month).startOf('month').toDate(), // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    )

    const rows = days.map((row, rowIndex) => {
        const cells = row.map((date, cellIndex) => {
            const dayProps = getDayProps({ ...getDayPropsParams, ...{ date } })

            const onKeyDownPayload = { rowIndex, cellIndex, date }

            return (
                <td key={cellIndex} className={classNames('date-picker-cell')}>
                    <Day
                        ref={(button) => {
                            if (daysRefs) {
                                if (!Array.isArray(daysRefs[rowIndex])) {
                                    daysRefs[rowIndex] = []
                                }

                                daysRefs[rowIndex][cellIndex] = button
                            }
                        }}
                        outOfMonth={dayProps.outOfMonth}
                        weekend={dayProps.weekend}
                        inRange={
                            dayProps.inRange || isDateInRange(date, dayProps)
                        }
                        firstInRange={
                            dayProps.firstInRange ||
                            isDateFirstInRange(date, dayProps)
                        }
                        lastInRange={
                            dayProps.lastInRange ||
                            isDateLastInRange(date, dayProps)
                        }
                        firstInMonth={isSameDate(date, firstIncludedDay)}
                        selected={dayProps.selected || dayProps.selectedInRange}
                        hasValue={hasValueInMonthRange}
                        className={
                            typeof dayClassName === 'function'
                                ? dayClassName(date, dayProps)
                                : ''
                        }
                        style={
                            typeof dayStyle === 'function'
                                ? dayStyle(date, dayProps)
                                : {}
                        }
                        disabled={dayProps.disabled}
                        fullWidth={fullWidth}
                        focusable={focusable}
                        hideOutOfMonthDates={hideOutOfMonthDates}
                        renderDay={renderDay}
                        isToday={isSameDate(date, new Date())}
                        value={date}
                        onClick={() =>
                            typeof onChange === 'function' && onChange(date)
                        }
                        onMouseDown={(event) =>
                            preventFocus && event.preventDefault()
                        }
                        onKeyDown={(event) =>
                            typeof onDayKeyDown === 'function' &&
                            onDayKeyDown(onKeyDownPayload, event)
                        }
                        onMouseEnter={
                            typeof onDayMouseEnter === 'function'
                                ? onDayMouseEnter
                                : noop
                        }
                    />
                </td>
            )
        })

        return (
            <tr key={rowIndex} className={classNames('date-picker-week-cell')}>
                {cells}
            </tr>
        )
    })

    return (
        <table
            ref={ref}
            className={classNames('picker-table', className)}
            cellSpacing="0"
            {...rest}
        >
            {!hideWeekdays && (
                <thead>
                    <tr>{weekdays}</tr>
                </thead>
            )}
            <tbody>{rows}</tbody>
        </table>
    )
}

export default Month
