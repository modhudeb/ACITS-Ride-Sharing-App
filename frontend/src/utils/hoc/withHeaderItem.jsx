import classNames from 'classnames'

const withHeaderItem = (Component) => {
    const WithHeaderItem = (props) => {
        const { className, hoverable = true } = props
        return (
            <Component
                {...props}
                className={classNames(
                    'header-action-item',
                    hoverable && 'header-action-item-hoverable',
                    className,
                )}
            />
        )
    }
    WithHeaderItem.displayName = `withHeaderItem(${
        Component.displayName || Component.name || 'Component'
    })`
    return WithHeaderItem
}

export default withHeaderItem
