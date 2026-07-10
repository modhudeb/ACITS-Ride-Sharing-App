import { useState, useCallback, useMemo, useEffect } from 'react'
import classNames from 'classnames'
import { RadioGroupContextProvider } from './context'

const Group = (props) => {
    const {
        radioClass,
        disabled,
        name,
        onChange,
        ref,
        value: valueProp,
        vertical = false,
        className,
        ...rest
    } = props

    const [value, setValue] = useState(valueProp)

    useEffect(() => {
        if (valueProp !== value) {
            setValue(valueProp)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [valueProp])

    const onRadioGroupChange = useCallback(
        (nextValue, e) => {
            setValue(nextValue)
            onChange?.(nextValue, e)
        },
        [onChange, setValue],
    )

    const contextValue = useMemo(
        () => ({
            vertical,
            name,
            value: typeof value === 'undefined' ? null : value,
            radioClass,
            disabled,
            onChange: onRadioGroupChange,
        }),
        [disabled, onRadioGroupChange, vertical, name, radioClass, value],
    )

    const radioGroupClass = classNames(
        'radio-group',
        vertical && 'vertical',
        className,
    )

    return (
        <RadioGroupContextProvider value={contextValue}>
            <div ref={ref} className={radioGroupClass} {...rest}>
                {props.children}
            </div>
        </RadioGroupContextProvider>
    )
}

export default Group
