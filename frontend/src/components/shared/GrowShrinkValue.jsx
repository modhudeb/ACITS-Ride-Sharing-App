import classNames from '@/utils/classNames'
import { HiArrowUp, HiArrowDown } from 'react-icons/hi'

const GrowShrinkValue = (props) => {
    const {
        value = 0,
        className,
        prefix,
        suffix,
        positiveIcon,
        negativeIcon,
        showIcon = true,
        positiveClass,
        negativeClass,
        ref,
    } = props

    return (
        <span
            ref={ref}
            className={classNames(
                'flex items-center',
                value > 0
                    ? classNames('text-success', positiveClass)
                    : classNames('text-error', negativeClass),
                className,
            )}
        >
            {value !== 0 && (
                <span>
                    {showIcon &&
                        (value > 0 ? (
                            typeof positiveIcon !== 'undefined' ? (
                                positiveIcon
                            ) : (
                                <HiArrowUp />
                            )
                        ) : typeof negativeIcon !== 'undefined' ? (
                            negativeIcon
                        ) : (
                            <HiArrowDown />
                        ))}
                </span>
            )}
            <span>
                {prefix}
                {value}
                {suffix}
            </span>
        </span>
    )
}

export default GrowShrinkValue
