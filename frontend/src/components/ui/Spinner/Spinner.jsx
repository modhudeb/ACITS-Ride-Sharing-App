import classNames from 'classnames'
import { CgSpinner } from 'react-icons/cg'

const Spinner = (props) => {
    const {
        className,
        customColorClass,
        enableTheme = true,
        indicator: Component = CgSpinner,
        isSpining = true,
        size = 20,
        style,
        ref,
        ...rest
    } = props

    const spinnerColor = customColorClass || (enableTheme && 'text-primary')

    const spinnerStyle = {
        height: size,
        width: size,
        ...style,
    }

    const spinnerClass = classNames(
        isSpining && 'animate-spin',
        spinnerColor,
        className,
    )

    return (
        <Component
            ref={ref}
            style={spinnerStyle}
            className={spinnerClass}
            {...rest}
        />
    )
}

export default Spinner
