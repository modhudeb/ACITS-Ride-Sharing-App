const TBody = (props) => {
    const { asElement: Component = 'tbody', children, ref, ...rest } = props

    return (
        <Component {...rest} ref={ref}>
            {children}
        </Component>
    )
}

export default TBody
