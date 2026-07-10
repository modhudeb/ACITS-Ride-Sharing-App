import { useState, useRef } from 'react'
import useMergedRef from '../hooks/useMergeRef'
import useDidUpdate from '../hooks/useDidUpdate'
import TimeInput from './TimeInput'
import CloseButton from '../CloseButton'
import { HiOutlineClock } from 'react-icons/hi'
import Input from '../Input/Input'

const TimeInputRange = (props) => {
    const {
        amPmPlaceholder = 'am',
        clearable = false,
        className,
        defaultValue = [null, null],
        disabled = false,
        format = '24',
        id,
        invalid,
        name,
        onChange,
        prefix,
        ref = null,
        seperator = '~',
        showSeconds = false,
        size,
        style,
        suffix = <HiOutlineClock className="text-lg" />,
        timeFieldPlaceholder = '--',
        value,
        ...rest
    } = props

    const fromTimeRef = useRef(undefined)
    const toTimeRef = useRef(undefined)
    const [_value, setValue] = useState(value ?? defaultValue)

    useDidUpdate(() => {
        typeof onChange === 'function' && onChange(_value)
    }, [_value])

    useDidUpdate(() => {
        if (
            value &&
            (value[0]?.getTime() !== _value[0]?.getTime() ||
                value[1]?.getTime() !== _value[1]?.getTime())
        ) {
            setValue(value)
        }
    }, [value])

    const handleClear = () => {
        setValue([null, null])
        fromTimeRef.current?.focus()
    }

    const suffixSlot =
        clearable && _value ? (
            <CloseButton onClick={handleClear} />
        ) : (
            <>{suffix}</>
        )

    const forwardProps = {
        amPmPlaceholder,
        disabled,
        format,
        size,
        timeFieldPlaceholder,
        showSeconds,
    }

    return (
        <Input
            asElement="div"
            invalid={invalid}
            size={size}
            className={className}
            style={style}
            disabled={disabled}
            suffix={suffixSlot}
            prefix={prefix}
            onClick={() => {
                fromTimeRef.current?.focus()
            }}
            {...rest}
        >
            <div className="time-input-wrapper">
                <TimeInput
                    ref={useMergedRef(fromTimeRef, ref)}
                    unstyle
                    value={_value[0]}
                    name={name}
                    nextRef={toTimeRef}
                    id={id ? id + '0' : undefined}
                    clearable={false}
                    suffix={null}
                    onChange={(date) => setValue([date, _value[1]])}
                    {...forwardProps}
                />

                <span className="time-input-separator">{seperator}</span>

                <TimeInput
                    ref={toTimeRef}
                    unstyle
                    value={_value[1]}
                    clearable={false}
                    id={id ? id + '1' : undefined}
                    suffix={null}
                    onChange={(date) => setValue([_value[0], date])}
                    {...forwardProps}
                />
            </div>
        </Input>
    )
}

export default TimeInputRange
