const THead = (props) => {
    const { asElement: Component = 'thead', children, ref, ...rest } = props

    return (
        <Component {...rest} ref={ref}>
            {children}
        </Component>
    )
}

export default THead
