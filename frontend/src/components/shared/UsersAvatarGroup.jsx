import { useMemo } from 'react'
import Tooltip from '@/components/ui/Tooltip'
import Avatar from '@/components/ui/Avatar'
import acronym from '@/utils/acronym'
import useRandomBgColor from '@/utils/hooks/useRandomBgColor'

const UsersAvatarGroup = (props) => {
    const {
        avatarGroupProps = {},
        avatarProps = {},
        imgKey = 'img',
        nameKey = 'name',
        onAvatarClick,
        users = [],
        ...rest
    } = props

    const bgColor = useRandomBgColor()

    const defaultAvatarProps = useMemo(() => {
        return {
            shape: 'circle',
            size: 30,
            className: 'cursor-pointer',
            ...avatarProps,
        }
    }, [avatarProps])

    const handleAvatarClick = (avatar) => {
        onAvatarClick?.(avatar)
    }

    return (
        <Avatar.Group
            omittedAvatarTooltip
            chained
            omittedAvatarProps={defaultAvatarProps}
            omittedAvatarTooltipProps={{
                wrapperClass: 'flex',
            }}
            {...avatarGroupProps}
            {...rest}
        >
            {users.map((elm, index) => (
                <Tooltip
                    key={elm[nameKey] + index}
                    wrapperClass="flex"
                    title={elm[nameKey]}
                >
                    <Avatar
                        {...defaultAvatarProps}
                        className={`${
                            elm[imgKey] ? '' : bgColor(elm[nameKey])
                        } ${defaultAvatarProps.className}`}
                        src={elm[imgKey]}
                        onClick={() => handleAvatarClick(elm)}
                    >
                        {acronym(elm.name)}
                    </Avatar>
                </Tooltip>
            ))}
        </Avatar.Group>
    )
}

export default UsersAvatarGroup
