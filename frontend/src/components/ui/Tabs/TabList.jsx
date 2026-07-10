import classNames from 'classnames'
import { useTabs } from './context'

const TabList = (props) => {
    const { className, children, ref, ...rest } = props

    const { variant } = useTabs()

    const tabListClass = classNames(
        'tab-list',
        `tab-list-${variant}`,
        className,
    )

    return (
        <div ref={ref} role="tablist" className={tabListClass} {...rest}>
            {children}
        </div>
    )
}

export default TabList
