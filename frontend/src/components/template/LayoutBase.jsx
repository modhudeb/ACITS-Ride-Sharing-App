import { LayoutContext } from '@/utils/hooks/useLayout'

const LayoutBase = (props) => {
    const {
        children,
        className,
        adaptiveCardActive,
        type,
        pageContainerReassemble,
    } = props

    return (
        <LayoutContext.Provider
            value={{ adaptiveCardActive, pageContainerReassemble, type }}
        >
            <div className={className}>{children}</div>
        </LayoutContext.Provider>
    )
}

export default LayoutBase
