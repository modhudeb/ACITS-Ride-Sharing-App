const Td = (props) => {
    const { asElement: Component = 'td', children, ref, ...rest } = props

    return (
        <Component ref={ref} {...rest}>
            {children}
        </Component>
    )
}

export default Td
