import { TabsContextProvider } from './context'
import useControllableState from '../hooks/useControllableState'
import classNames from 'classnames'

const Tabs = (props) => {
    const {
        className,
        defaultValue,
        onChange,
        ref,
        value: valueProp,
        variant = 'underline',
        ...rest
    } = props

    const [value, setValue] = useControllableState({
        prop: valueProp,
        onChange: onChange,
        defaultProp: defaultValue,
    })

    const tabsClass = classNames('tabs', className)

    return (
        <TabsContextProvider
            value={{
                value: value,
                onValueChange: setValue,
                variant,
            }}
        >
            <div className={tabsClass} {...rest} ref={ref} />
        </TabsContextProvider>
    )
}

export default Tabs
