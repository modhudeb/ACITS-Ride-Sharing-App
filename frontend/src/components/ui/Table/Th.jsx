const Th = (props) => {
    const { asElement: Component = 'th', children, ref, ...rest } = props

    return (
        <Component {...rest} ref={ref}>
            {children}
        </Component>
    )
}

export default Th
