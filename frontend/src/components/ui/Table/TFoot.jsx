const TFoot = (props) => {
    const { asElement: Component = 'tfoot', children, ref, ...rest } = props

    return (
        <Component {...rest} ref={ref}>
            {children}
        </Component>
    )
}

export default TFoot
