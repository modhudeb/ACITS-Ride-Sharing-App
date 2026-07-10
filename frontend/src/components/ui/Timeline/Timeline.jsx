import { Children } from 'react'
import classNames from 'classnames'
import mapCloneElement from '../utils/mapCloneElement'

const Timeline = (props) => {
    const { children, className, ref } = props

    const count = Children.count(children)

    const items = mapCloneElement(children, (item, index) => ({
        isLast: index === count - 1,
        ...item.props,
    }))

    return (
        <ul ref={ref} className={classNames('timeline', className)}>
            {items}
        </ul>
    )
}

export default Timeline
