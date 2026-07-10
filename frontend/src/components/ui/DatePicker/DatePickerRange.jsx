import { useState, useRef } from 'react'
import dayjs from 'dayjs'
import useControllableState from '../hooks/useControllableState'
import useMergedRef from '../hooks/useMergeRef'
import capitalize from '../utils/capitalize'
import RangeCalendar from './RangeCalendar'
import BasePicker from './BasePicker'
import { useConfig } from '../ConfigProvider'

const validationRule = (val) =>
    Array.isArray(val) &&
    val.length === 2 &&
    val.every((v) => v instanceof Date)

const isFirstDateSet = (val) =>
    Array.isArray(val) && val.length === 2 && val[0] instanceof Date

const DatePickerRange = (props) => {
    const {
        className,
        clearable = true,
        clearButton,
        closePickerOnChange = true,
        dateViewCount = 1,
        dayClassName,
        dayStyle,
        defaultMonth,
        defaultOpen = false,
        defaultValue,
        defaultView,
        disabled,
        disableDate,
        enableHeaderLabel,
        disableOutOfMonth,
        firstDayOfWeek = 'monday',
        hideOutOfMonthDates,
        hideWeekdays,
        inputFormat,
        inputPrefix,
        inputSuffix,
        labelFormat = {
            month: 'MMM',
            year: 'YYYY',
        },
        separator = '~',
        locale,
        lockView,
        maxDate,
        minDate,
        onChange,
        onDropdownClose,
        onDropdownOpen,
        openPickerOnClear = false,
        ref = null,
        renderDay,
        singleDate = false,
        size,
        style,
        value,
        weekendDays,
        yearLabelFormat,
        ...rest
    } = props

    const { locale: themeLocale } = useConfig()

    const finalLocale = locale || themeLocale

    const dateFormat = inputFormat || 'YYYY-MM-DD'

    const [dropdownOpened, setDropdownOpened] = useState(defaultOpen)

    const inputRef = useRef(null)

    const [_value, setValue] = useControllableState({
        prop: value,
        defaultProp: defaultValue !== undefined ? defaultValue : [null, null],
        onChange,
    })

    const handleValueChange = (range) => {
        setValue(range)
        if (closePickerOnChange && validationRule(range)) {
            setDropdownOpened(false)
            onDropdownClose?.()
            window.setTimeout(() => inputRef.current?.focus(), 0)
        }
    }

    const valueValid = validationRule(_value)
    const firstValueValid = isFirstDateSet(_value)

    const firstDateLabel = _value?.[0]
        ? capitalize(dayjs(_value[0]).locale(finalLocale).format(dateFormat))
        : ''

    const secondDateLabel = _value?.[1]
        ? capitalize(dayjs(_value[1]).locale(finalLocale).format(dateFormat))
        : ''

    const handleClear = () => {
        setValue([null, null])
        setDropdownOpened(true)
        openPickerOnClear && onDropdownOpen?.()
        inputRef.current?.focus()
    }

    const handleDropdownToggle = (isOpened) => {
        if (!isOpened && firstValueValid && _value?.[1] === null) {
            handleClear()
        }
        setDropdownOpened(isOpened)
    }

    return (
        <BasePicker
            ref={useMergedRef(ref, inputRef)}
            dropdownOpened={dropdownOpened}
            setDropdownOpened={handleDropdownToggle}
            size={size}
            style={style}
            className={className}
            inputLabel={
                firstValueValid
                    ? `${firstDateLabel} ${separator} ${secondDateLabel}`
                    : ''
            }
            clearable={clearable && firstValueValid}
            clearButton={clearButton}
            disabled={disabled}
            inputPrefix={inputPrefix}
            inputSuffix={inputSuffix}
            onClear={handleClear}
            onDropdownClose={onDropdownClose}
            onDropdownOpen={onDropdownOpen}
            {...rest}
        >
            <RangeCalendar
                locale={finalLocale}
                defaultMonth={valueValid ? _value?.[0] : defaultMonth}
                value={_value}
                labelFormat={labelFormat}
                dayClassName={dayClassName}
                dayStyle={dayStyle}
                disableOutOfMonth={disableOutOfMonth}
                minDate={minDate}
                maxDate={maxDate}
                disableDate={disableDate}
                firstDayOfWeek={firstDayOfWeek}
                enableHeaderLabel={enableHeaderLabel}
                singleDate={singleDate}
                dateViewCount={dateViewCount}
                defaultView={defaultView}
                hideOutOfMonthDates={hideOutOfMonthDates}
                hideWeekdays={hideWeekdays}
                renderDay={renderDay}
                weekendDays={weekendDays}
                yearLabelFormat={yearLabelFormat}
                lockView={lockView}
                onChange={(date) => handleValueChange(date)}
            />
        </BasePicker>
    )
}

export default DatePickerRange
