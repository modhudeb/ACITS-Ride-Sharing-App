import classNames from 'classnames'
import { HiCheckCircle } from 'react-icons/hi'

const PresetSegmentItemOption = (props) => {
    const {
        active,
        children,
        className,
        customCheck,
        defaultGutter = true,
        disabled,
        hoverable,
        onSegmentItemClick,
        ref,
    } = props

    return (
        <div
            ref={ref}
            className={classNames(
                'flex',
                !customCheck && 'justify-between',
                'items-center',
                'border',
                'rounded-md ',
                'border-gray-200 dark:border-gray-600',
                defaultGutter && 'py-5 px-4',
                'cursor-pointer',
                'select-none',
                'w-100',
                active && `ring-1 ring-primary border-primary`,
                hoverable &&
                    `hover:ring-1 hover:ring-primary hover:border-primary`,
                disabled && 'opacity-50 cursor-not-allowed',
                className,
            )}
            onClick={onSegmentItemClick}
        >
            {children}
            {active && !customCheck && (
                <HiCheckCircle className="text-2xl text-primary" />
            )}
            {active && customCheck}
        </div>
    )
}

export default PresetSegmentItemOption
