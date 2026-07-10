import { Children, cloneElement, Fragment } from 'react'
import classNames from 'classnames'
import Avatar from './Avatar'
import Tooltip from '../Tooltip/Tooltip'

const GroupContainer = ({ children, chained, className }) => (
    <div
        className={classNames(
            'avatar-group',
            chained && 'avatar-group-chained',
            className,
        )}
    >
        {children}
    </div>
)

const AvatarGroup = (props) => {
    const {
        chained = false,
        children,
        className,
        maxCount = 4,
        onOmittedAvatarClick,
        omittedAvatarContent,
        omittedAvatarProps,
        omittedAvatarTooltip = false,
        omittedAvatarTooltipProps,
    } = props

    const childCount = Children.count(children)

    const childWithKey = Children.toArray(children).map((child, index) =>
        cloneElement(child, {
            key: `grouped-avatar-${index}`,
        }),
    )

    if (maxCount && maxCount < childCount) {
        const childToShow = childWithKey.slice(0, maxCount)
        const overflowCount = childCount - maxCount
        const avatar = (
            <Avatar
                className={onOmittedAvatarClick ? 'cursor-pointer' : ''}
                onClick={() => onOmittedAvatarClick?.()}
                {...omittedAvatarProps}
            >
                {omittedAvatarContent || `+${overflowCount}`}
            </Avatar>
        )

        childToShow.push(
            omittedAvatarTooltip ? (
                <Tooltip
                    key="avatar-more-tooltip"
                    title={`${overflowCount} More`}
                    {...omittedAvatarTooltipProps}
                >
                    <>{avatar}</>
                </Tooltip>
            ) : (
                <Fragment key="avatar-more-tooltip">{avatar}</Fragment>
            ),
        )
        return (
            <GroupContainer className={className} chained={chained}>
                {childToShow}
            </GroupContainer>
        )
    }

    return (
        <GroupContainer className={className} chained={chained}>
            {children}
        </GroupContainer>
    )
}

export default AvatarGroup
