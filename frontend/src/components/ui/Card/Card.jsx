import classNames from 'classnames'
import { useConfig } from '../ConfigProvider'

const defaultHeaderConfig = {
    bordered: true,
}

const defaultFooterConfig = {
    bordered: true,
}

const Card = (props) => {
    const { ui } = useConfig()

    const {
        bodyClass,
        children,
        className,
        clickable = false,
        bordered = ui?.card?.cardBordered ?? true,
        header = {},
        footer = {},
        ref,
        onClick,
        ...rest
    } = props

    const headerProps = {
        ...defaultHeaderConfig,
        ...header,
    }

    const footerProps = {
        ...defaultFooterConfig,
        ...footer,
    }

    const cardClass = classNames(
        'card',
        className,
        bordered ? `card-border` : `card-shadow`,
        clickable && 'cursor-pointer user-select-none',
    )

    const cardBodyClasss = classNames('card-body', bodyClass)
    const cardHeaderClass = classNames(
        'card-header',
        headerProps.bordered ? 'card-header-border' : null,
        headerProps.extra ? 'card-header-extra' : null,
        headerProps.className,
    )
    const cardFooterClass = classNames(
        'card-footer',
        footerProps.bordered && `card-footer-border`,
        footerProps.className,
    )

    const renderHeader = () => {
        if (typeof headerProps.content === 'string') {
            return <h4>{headerProps.content}</h4>
        }
        return <>{headerProps.content}</>
    }

    const handleClick = (e) => {
        onClick?.(e)
    }

    return (
        <div
            ref={ref}
            className={cardClass}
            role="presentation"
            onClick={handleClick}
            {...rest}
        >
            {headerProps.content && (
                <div className={cardHeaderClass}>
                    {renderHeader()}
                    {headerProps.extra && <span>{headerProps.extra}</span>}
                </div>
            )}
            <div className={cardBodyClasss}>{children}</div>
            {footerProps.content && (
                <div className={cardFooterClass}>{footerProps.content}</div>
            )}
        </div>
    )
}

export default Card
