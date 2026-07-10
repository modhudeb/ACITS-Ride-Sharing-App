import classNames from 'classnames'

const Table = (props) => {
    const {
        asElement: Component = 'table',
        cellBorder,
        children,
        className,
        compact = false,
        hoverable = true,
        overflow = true,
        ref,
        ...rest
    } = props

    const tableClass = classNames(
        Component === 'table' ? 'table-default' : 'table-flex',
        hoverable && 'table-hover',
        compact && 'table-compact',
        cellBorder && 'table-border',
        className,
    )

    return (
        <div className={classNames(overflow && 'overflow-x-auto')}>
            <Component className={tableClass} {...rest} ref={ref}>
                {children}
            </Component>
        </div>
    )
}

export default Table
