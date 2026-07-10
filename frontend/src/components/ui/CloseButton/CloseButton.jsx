import { HiX } from 'react-icons/hi'
import classNames from 'classnames'

const CloseButton = (props) => {
    const { absolute, className, resetDefaultClass, ref, ...rest } = props
    const closeButtonAbsoluteClass = 'absolute z-10'

    const closeButtonClass = classNames(
        !resetDefaultClass && 'close-button button-press-feedback',
        absolute && closeButtonAbsoluteClass,
        className,
    )

    return (
        <button ref={ref} className={closeButtonClass} type="button" {...rest}>
            <HiX />
        </button>
    )
}

export default CloseButton
