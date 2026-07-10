/* eslint-disable no-unused-vars */
import cn from '../utils/classNames'
import ReactSelect from 'react-select'
import { useConfig } from '../ConfigProvider'
import { useForm, useFormItem } from '../Form/context'
import { useInputGroup } from '../InputGroup/context'
import { HiChevronDown, HiX } from 'react-icons/hi'
import DefaultOption from './Option'
import Spinner from '../Spinner/Spinner'
import { CONTROL_SIZES } from '../utils/constants'

const DefaultDropdownIndicator = () => {
    return (
        <div className="select-dropdown-indicator">
            <HiChevronDown />
        </div>
    )
}

const DefaultClearIndicator = ({ innerProps: { ref, ...restInnerProps } }) => {
    return (
        <div {...restInnerProps} ref={ref}>
            <div className="select-clear-indicator">
                <HiX />
            </div>
        </div>
    )
}

const DefaultLoadingIndicator = ({ selectProps }) => {
    const { themeColor } = selectProps
    return (
        <Spinner className={`select-loading-indicatior text-${themeColor}`} />
    )
}

function Select(props) {
    const {
        components,
        componentAs: Component = ReactSelect,
        size,
        styles,
        className,
        classNames,
        field,
        invalid,
        ...rest
    } = props

    const { controlSize } = useConfig()
    const formControlSize = useForm()?.size
    const formItemInvalid = useFormItem()?.invalid
    const inputGroupSize = useInputGroup()?.size

    const selectSize = size || inputGroupSize || formControlSize || controlSize

    const isSelectInvalid = invalid || formItemInvalid

    const selectClass = cn(`select select-${selectSize}`, className)

    return (
        <Component
            className={selectClass}
            classNames={{
                control: (state) =>
                    cn(
                        'select-control',
                        CONTROL_SIZES[selectSize].minH,
                        state.isDisabled && 'opacity-50 cursor-not-allowed',
                        (() => {
                            const classes = ['bg-gray-100 dark:bg-gray-700']

                            const { isFocused } = state

                            if (isFocused) {
                                classes.push(
                                    'select-control-focused ring-1 ring-primary border-primary bg-transparent',
                                )
                            }

                            if (isSelectInvalid) {
                                classes.push(
                                    'select-control-invalid bg-error-subtle',
                                )
                            }

                            if (isFocused && isSelectInvalid) {
                                classes.push('ring-error border-error')
                            }

                            return classes
                        })(),
                    ),
                valueContainer: ({ isMulti, hasValue, selectProps }) =>
                    cn(
                        'select-value-container',
                        isMulti &&
                            hasValue &&
                            selectProps.controlShouldRenderValue
                            ? 'flex'
                            : 'grid',
                    ),
                input: ({ value, isDisabled }) =>
                    cn(
                        'select-input-container',
                        isDisabled ? 'invisible' : 'visible',
                        value && '[transform:translateZ(0)]',
                    ),
                placeholder: () =>
                    cn(
                        'select-placeholder',
                        isSelectInvalid ? 'text-error' : 'text-gray-400',
                    ),
                indicatorsContainer: () => 'select-indicators-container',
                singleValue: () => 'select-single-value',
                multiValue: () => 'select-multi-value',
                multiValueLabel: () => 'select-multi-value-label',
                multiValueRemove: () => 'select-multi-value-remove',
                menu: () => 'select-menu',
                ...classNames,
            }}
            classNamePrefix={'select'}
            styles={{
                control: () => ({}),
                valueContainer: () => ({}),
                input: ({
                    margin,
                    paddingTop,
                    paddingBottom,
                    ...provided
                }) => ({ ...provided }),
                placeholder: () => ({}),
                singleValue: () => ({}),
                multiValue: () => ({}),
                multiValueLabel: () => ({}),
                multiValueRemove: () => ({}),
                menu: ({
                    backgroundColor,
                    marginTop,
                    marginBottom,
                    border,
                    borderRadius,
                    boxShadow,
                    ...provided
                }) => ({ ...provided, zIndex: 50 }),
                ...styles,
            }}
            components={{
                IndicatorSeparator: () => null,
                Option: DefaultOption,
                LoadingIndicator: DefaultLoadingIndicator,
                DropdownIndicator: DefaultDropdownIndicator,
                ClearIndicator: DefaultClearIndicator,
                ...components,
            }}
            {...field}
            {...rest}
        />
    )
}

export default Select
