import classNames from '@/utils/classNames'
import Card from '@/components/ui/Card'
import useLayout from '@/utils/hooks/useLayout'

const AdaptiveCard = (props) => {
    const { adaptiveCardActive } = useLayout()

    const { className, bodyClass, ...rest } = props

    return (
        <Card
            className={classNames(
                className,
                adaptiveCardActive && 'border-none dark:bg-transparent',
            )}
            bodyClass={classNames(bodyClass, adaptiveCardActive && 'p-0')}
            {...rest}
        />
    )
}

export default AdaptiveCard
