import classNames from '@/utils/classNames'

const IconText = ({
    className,
    asElement: Component = 'span',
    icon,
    children,
}) => {
    return (
        <Component className={classNames('flex items-center gap-2', className)}>
            {icon}
            {children}
        </Component>
    )
}

export default IconText
