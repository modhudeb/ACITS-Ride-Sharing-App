import { useEffect, useState, useRef } from 'react'
import Input from '@/components/ui/Input'
import classNames from '@/utils/classNames'

const OTPInput = ({
    length = 6,
    value = '',
    onChange,
    disabled = false,
    className = '',
    inputClass,
    autoFocus = false,
    placeholder,
    invalid = false,
}) => {
    // eslint-disable-next-line no-unused-vars
    const [_, setActiveInput] = useState(0)
    const inputRefs = useRef([])

    useEffect(() => {
        inputRefs.current = Array(length)
            .fill(null)
            .map((_, i) => inputRefs.current[i] || null)
    }, [length])

    const handleChange = (e, index) => {
        const newValue = e.target.value
        if (newValue.length > 1) return

        const newOTPValue =
            value.slice(0, index) + newValue + value.slice(index + 1)

        onChange?.(newOTPValue)

        if (newValue && index < length - 1) {
            setActiveInput(index + 1)
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace') {
            e.preventDefault()
            if (value[index]) {
                const newOTPValue =
                    value.slice(0, index) + '' + value.slice(index + 1)
                onChange?.(newOTPValue)
            } else if (index > 0) {
                setActiveInput(index - 1)
                inputRefs.current[index - 1]?.focus()
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault()
            setActiveInput(index - 1)
            inputRefs.current[index - 1]?.focus()
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            e.preventDefault()
            setActiveInput(index + 1)
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handlePaste = (e) => {
        e.preventDefault()
        const pastedData = e.clipboardData
            .getData('text/plain')
            .slice(0, length)
        if (pastedData.match(/^[0-9]+$/)) {
            onChange?.(pastedData.padEnd(length, ''))
        }
    }

    const setRef = (index) => (ref) => {
        inputRefs.current[index] = ref
    }

    return (
        <div className={`flex gap-2 ${className}`}>
            {Array(length)
                .fill(null)
                .map((_, index) => (
                    <Input
                        key={index}
                        ref={setRef(index)}
                        className={classNames(
                            'text-center text-lg h-[58px] w-[58px]',
                            inputClass,
                        )}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={value[index] || ''}
                        disabled={disabled}
                        autoFocus={autoFocus && index === 0}
                        placeholder={placeholder}
                        aria-label={`Digit ${index + 1} of ${length}`}
                        invalid={invalid}
                        onChange={(e) => handleChange(e, index)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        onPaste={handlePaste}
                        onFocus={() => setActiveInput(index)}
                    />
                ))}
        </div>
    )
}

export default OTPInput
