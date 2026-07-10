import navigationIcon from '@/configs/navigation-icon.config'

export const Icon = ({ component, ...props }) => {
    const Component = component
    return <Component {...props} />
}

const VerticalMenuIcon = ({ icon }) => {
    if (typeof icon !== 'string' && !icon) {
        return <></>
    }

    return (
        <>
            {navigationIcon[icon] && (
                <span className={`text-2xl`}>{navigationIcon[icon]}</span>
            )}
        </>
    )
}

export default VerticalMenuIcon
