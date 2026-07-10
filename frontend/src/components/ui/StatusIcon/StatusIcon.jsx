import {
    HiCheckCircle,
    HiInformationCircle,
    HiExclamation,
    HiXCircle,
} from 'react-icons/hi'

const ICONS = {
    success: {
        color: 'text-success',
        icon: <HiCheckCircle />,
    },
    info: {
        color: 'text-info',
        icon: <HiInformationCircle />,
    },
    warning: {
        color: 'text-warning',
        icon: <HiExclamation />,
    },
    danger: {
        color: 'text-error',
        icon: <HiXCircle />,
    },
}

const StatusIcon = (props) => {
    const { type = 'info', custom, iconColor } = props

    const icon = ICONS[type]

    return (
        <span className={`text-2xl ${iconColor || icon.color}`}>
            {custom || icon.icon}
        </span>
    )
}

export default StatusIcon
