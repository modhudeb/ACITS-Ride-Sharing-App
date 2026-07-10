import { useRef, useState } from 'react'
import classNames from 'classnames'
import useMergedRef from '../hooks/useMergeRef'
import { padTime } from './utils'
import { clamp } from '../utils/clamp'

const TimeInputField = (props) => {
    const {
        className,
        onFocus,
        onBlur,
        onChange,
        ref = null,
        setValue,
        withSeparator = false,
        max,
        min = 0,
        value,
        ...rest
    } = props

    const [digitsEntered, setDigitsEntered] = useState(0)

    const inputRef = useRef(undefined)

    const handleFocus = (event) => {
        typeof onFocus === 'function' && onFocus(event)
        inputRef?.current?.select()
        setDigitsEntered(0)
    }

    const handleBlur = (event) => {
        typeof onBlur === 'function' && onBlur(event)
        if (digitsEntered === 1) {
            typeof onChange === 'function' &&
                onChange(event.currentTarget.value, false)
        }
    }

    const handleClick = (event) => {
        event.stopPropagation()
        inputRef?.current?.select()
    }

    const handleKeyDown = (event) => {
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            const padded = padTime(
                clamp(
                    parseInt(event.currentTarget.value, 10) + 1,
                    min,
                    max,
                ).toString(),
            )

            if (value !== padded) {
                onChange(padded, false)
            }
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            const padded = padTime(
                clamp(
                    parseInt(event.currentTarget.value, 10) - 1,
                    min,
                    max,
                ).toString(),
            )

            if (value !== padded) {
                onChange(padded, false)
            }
        }
    }

    const handleChange = (event) => {
        setDigitsEntered(digitsEntered + 1)

        const _val = parseInt(event.currentTarget.value, 10).toString()

        if (_val === '0' && digitsEntered === 0) {
            setValue('00')
            return
        }
        onChange(_val, true, digitsEntered > 0)
    }

    return (
        <>
            <input
                ref={useMergedRef(inputRef, ref)}
                type="text"
                inputMode="numeric"
                value={value}
                className={classNames('time-input-field', className)}
                onChange={handleChange}
                onClick={handleClick}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                {...rest}
            />
            {withSeparator && <span> : </span>}
        </>
    )
}

export default TimeInputField
