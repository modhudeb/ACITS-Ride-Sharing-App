import FormContainer from './FormContainer'

export const Form = (props) => {
    const {
        children,
        containerClassName,
        labelWidth,
        layout,
        size,
        ref,
        ...rest
    } = props

    return (
        <form ref={ref} {...rest}>
            <FormContainer
                className={containerClassName}
                labelWidth={labelWidth}
                layout={layout}
                size={size}
            >
                {children}
            </FormContainer>
        </form>
    )
}

export default Form
