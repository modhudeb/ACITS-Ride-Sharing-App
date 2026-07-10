import { Children } from 'react'
import classNames from 'classnames'
import { STEPS_STATUS } from '../utils/constants'
import mapCloneElement from '../utils/mapCloneElement'

const { COMPLETE, PENDING, IN_PROGRESS, ERROR } = STEPS_STATUS

const Steps = (props) => {
    const {
        className,
        children,
        vertical = false,
        current = 0,
        status = IN_PROGRESS,
        onChange,
        ref,
        ...rest
    } = props

    const count = Children.count(children)

    const items = mapCloneElement(children, (item, index) => {
        const itemStyles = {
            flexBasis: index < count - 1 ? `${100 / (count - 1)}%` : undefined,
            maxWidth: index === count - 1 ? `${100 / count}%` : undefined,
        }
        const itemProps = {
            stepNumber: index + 1,
            status: PENDING,
            style: !vertical ? itemStyles : undefined,
            isLast: index === count - 1,
            vertical: vertical,
            onStepChange: onChange ? () => onChange(index) : undefined,
            ...item.props,
        }

        if (status === ERROR && index === current - 1) {
            itemProps.className = classNames('steps-item-error')
        }

        if (!item.props.status) {
            if (index === current) {
                itemProps.status = status
                itemProps.className = classNames(
                    itemProps.className,
                    'steps-item-active',
                )
            } else if (index < current) {
                itemProps.status = COMPLETE
            }
        }
        return itemProps
    })

    return (
        <div
            ref={ref}
            className={classNames(
                'steps',
                vertical && 'steps-vertical',
                className,
            )}
            {...rest}
        >
            {items}
        </div>
    )
}

export default Steps
