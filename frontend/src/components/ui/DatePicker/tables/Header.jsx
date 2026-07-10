import classNames from 'classnames'
import { HiChevronRight, HiChevronLeft } from 'react-icons/hi'

const Header = (props) => {
    const {
        hasNext,
        hasPrevious,
        onNext,
        onPrevious,
        onNextLevel,
        label,
        nextLevelDisabled,
        nextLabel,
        previousLabel,
        preventLevelFocus = false,
        preventFocus,
        children,
        className,
        ...rest
    } = props

    const headerLabel = (
        <button
            className="picker-header-label"
            disabled={nextLevelDisabled}
            tabIndex={preventLevelFocus ? -1 : 0}
            type="button"
            onClick={onNextLevel}
            onMouseDown={(event) => preventFocus && event.preventDefault()}
        >
            {label}
        </button>
    )

    const renderChildren = children ? children : headerLabel

    return (
        <div
            className={classNames(
                'picker-header flex items-center justify-between mb-2 border-b border-gray-200 dark:border-gray-700 pb-2',
                className,
            )}
            {...rest}
        >
            <div
                className={
                    'flex justify-between w-full items-center rtl:flex-row-reverse'
                }
            >
                <button
                    type="button"
                    className={classNames(
                        'picker-direction-button',
                        !hasPrevious && 'opacity-0 cursor-default',
                    )}
                    disabled={!hasPrevious}
                    aria-label={previousLabel}
                    onClick={onPrevious}
                    onMouseDown={(event) =>
                        preventFocus && event.preventDefault()
                    }
                >
                    <HiChevronLeft />
                </button>
                {renderChildren}
                <button
                    type="button"
                    className={classNames(
                        'picker-direction-button',
                        !hasNext && 'opacity-0 cursor-default',
                    )}
                    disabled={!hasNext}
                    aria-label={nextLabel}
                    onClick={onNext}
                    onMouseDown={(event) =>
                        preventFocus && event.preventDefault()
                    }
                >
                    <HiChevronRight />
                </button>
            </div>
        </div>
    )
}

export default Header
