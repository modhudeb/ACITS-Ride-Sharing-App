import classNames from 'classnames'

const Container = (props) => {
    const {
        className,
        children,
        asElement: Component = 'div',
        ref,
        ...rest
    } = props

    return (
        <Component
            ref={ref}
            className={classNames('container mx-auto', className)}
            {...rest}
        >
            {children}
        </Component>
    )
}

export default Container
