import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { Input } from '../Input'
import useMergedRef from '../hooks/useMergeRef'
import { HiOutlineCalendar } from 'react-icons/hi'
import CloseButton from '../CloseButton'
import {
    useFloating,
    useInteractions,
    useDismiss,
    useRole,
    useFocus,
    useClick,
    useId,
    autoUpdate,
    offset,
    flip,
    shift,
} from '@floating-ui/react'

dayjs.extend(localizedFormat)

const BasePicker = (props) => {
    const {
        className,
        clearable = true,
        clearButton,
        children,
        disabled,
        dropdownOpened,
        inputtable,
        inputtableBlurClose = false,
        inputLabel,
        inputPrefix,
        inputSuffix = <HiOutlineCalendar className="text-lg" />,
        name,
        onDropdownOpen,
        onDropdownClose,
        onBlur,
        onFocus,
        onChange,
        onKeyDown,
        onClear,
        placeholder,
        ref = null,
        setDropdownOpened,
        size,
        type,
    } = props

    const handleInputClick = () => {
        inputtable ? openDropdown() : toggleDropdown(!dropdownOpened)
    }

    const closeDropdown = () => {
        setDropdownOpened(false)
        onDropdownClose?.()
    }

    const suffixIconSlot = clearable ? (
        clearButton ? (
            <div role="presentation" onClick={onClear}>
                {clearButton}
            </div>
        ) : (
            <CloseButton className="text-base" onClick={onClear} />
        )
    ) : inputSuffix ? (
        <>{inputSuffix}</>
    ) : null

    const toggleDropdown = (open) => {
        setDropdownOpened(open)
        open ? onDropdownOpen?.() : onDropdownClose?.()
    }

    const openDropdown = () => {
        setDropdownOpened(true)
        onDropdownOpen?.()
    }

    const handleKeyDown = (event) => {
        typeof onKeyDown === 'function' && onKeyDown(event)
        if ((event.key === 'Space' || event.key === 'Enter') && !inputtable) {
            event.preventDefault()
            openDropdown()
        }
    }

    const handleInputBlur = (event) => {
        onBlur?.(event)
        if (inputtable && inputtableBlurClose) {
            closeDropdown()
        }
    }

    const handleInputFocus = (event) => {
        onFocus?.(event)
    }

    const { refs, floatingStyles, context } = useFloating({
        open: dropdownOpened,
        onOpenChange: toggleDropdown,
        placement: 'bottom-start',
        middleware: [
            offset(10),
            flip({
                fallbackAxisSideDirection: 'start',
            }),
            shift(),
        ],
        whileElementsMounted: autoUpdate,
    })

    const focus = useFocus(context)
    const click = useClick(context)
    const dismiss = useDismiss(context)
    const role = useRole(context)

    const { getReferenceProps, getFloatingProps } = useInteractions([
        inputtable ? focus : click,
        dismiss,
        role,
    ])

    const headingId = useId()

    return (
        <>
            <Input
                ref={useMergedRef(ref, refs.setReference)}
                className={className}
                placeholder={placeholder}
                size={size}
                name={name}
                value={inputLabel}
                readOnly={!inputtable}
                suffix={suffixIconSlot}
                prefix={inputPrefix}
                autoComplete="off"
                type={type}
                disabled={disabled}
                asElement={'input'}
                onKeyDown={handleKeyDown}
                onClick={handleInputClick}
                onChange={onChange}
                {...getReferenceProps({
                    onBlur: handleInputBlur,
                    onFocus: handleInputFocus,
                })}
            />
            {dropdownOpened && (
                <div
                    ref={refs.setFloating}
                    className="picker"
                    style={floatingStyles}
                    aria-labelledby={headingId}
                    {...getFloatingProps()}
                >
                    <div className="picker-panel">{children}</div>
                </div>
            )}
        </>
    )
}

export default BasePicker
