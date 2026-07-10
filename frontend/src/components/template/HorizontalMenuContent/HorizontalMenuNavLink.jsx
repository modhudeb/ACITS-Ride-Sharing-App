import { Link } from 'react-router'
import classNames from 'classnames'

const HorizontalMenuNavLink = ({
    path,
    children,
    isExternalLink,
    className,
    onClick,
}) => {
    return (
        <Link
            className={classNames(
                'w-full flex items-center outline-0',
                className,
            )}
            to={path}
            target={isExternalLink ? '_blank' : ''}
            onClick={onClick}
        >
            {children}
        </Link>
    )
}

export default HorizontalMenuNavLink
