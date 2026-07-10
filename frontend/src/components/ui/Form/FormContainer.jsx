import { FormContextProvider, FormContextConsumer } from './context'
import { useConfig } from '../ConfigProvider'
import classNames from 'classnames'
import { SIZES, LAYOUT } from '../utils/constants'

const FormContainer = (props) => {
    const { controlSize } = useConfig()

    const {
        children,
        className,
        labelWidth = 100,
        layout = LAYOUT.VERTICAL,
        size = SIZES.MD,
    } = props

    const contextValue = {
        labelWidth,
        layout,
        size: size || controlSize,
    }

    return (
        <FormContextProvider value={contextValue}>
            <FormContextConsumer>
                {(context) => {
                    return (
                        <div
                            className={classNames(
                                'form-container',
                                context?.layout,
                                className,
                            )}
                        >
                            {children}
                        </div>
                    )
                }}
            </FormContextConsumer>
        </FormContextProvider>
    )
}

FormContainer.displayName = 'FormContainer'

export default FormContainer
