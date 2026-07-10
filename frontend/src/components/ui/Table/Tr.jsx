const Tr = (props) => {
    const { asElement: Component = 'tr', children, ref, ...rest } = props

    return (
        <Component ref={ref} {...rest}>
            {children}
        </Component>
    )
}

export default Tr
