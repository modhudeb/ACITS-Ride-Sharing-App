import classNames from '@/utils/classNames'
import HorizontalMenuNavLink from './HorizontalMenuNavLink'

const HorizontalMenuDropdownTrigger = (props) => {
    const { className, active, asElement = 'button', ...rest } = props
    const commonProps = {
        className: classNames(
            'font-semibold inline-flex h-9 w-max items-center justify-center rounded-lg bg-background px-4 py-2 dark:text-gray-300 dark:hover:text-gray-100 text-gray-900 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors',
            className,
            active &&
                'bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20',
        ),
    }

    if (asElement === 'a') {
        const { path, isExternalLink, ...anchorProps } = rest
        return (
            <HorizontalMenuNavLink
                path={path}
                isExternalLink={isExternalLink}
                {...commonProps}
                {...anchorProps}
            />
        )
    }

    if (asElement === 'button') {
        return <button ref={rest.ref} {...commonProps} {...rest} />
    }

    return <></>
}

export default HorizontalMenuDropdownTrigger
