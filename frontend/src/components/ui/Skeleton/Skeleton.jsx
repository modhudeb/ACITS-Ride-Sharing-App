import classNames from 'classnames'

const Skeleton = (props) => {
    const {
        animation = true,
        asElement: Component = 'span',
        className,
        height,
        ref,
        style,
        variant = 'block',
        width,
    } = props

    return (
        <Component
            ref={ref}
            className={classNames(
                'skeleton',
                variant === 'circle' && 'skeleton-circle',
                variant === 'block' && 'skeleton-block',
                animation && 'animate-pulse',
                className,
            )}
            style={{
                width,
                height,
                ...style,
            }}
        />
    )
}

export default Skeleton
