import classNames from 'classnames'
import Drawer from '@/components/ui/Drawer'
import { PiGearDuotone } from 'react-icons/pi'
import SidePanelContent from './SidePanelContent'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import { useThemeStore } from '@/store/themeStore'

const _SidePanel = (props) => {
    const { className, ...rest } = props

    const panelExpand = useThemeStore((state) => state.panelExpand)
    const direction = useThemeStore((state) => state.direction)
    const setPanelExpand = useThemeStore((state) => state.setPanelExpand)

    const openPanel = () => {
        setPanelExpand(true)
    }

    const closePanel = () => {
        setPanelExpand(false)

        if (document) {
            const bodyClassList = document.body.classList
            if (bodyClassList.contains('drawer-lock-scroll')) {
                bodyClassList.remove('drawer-lock-scroll', 'drawer-open')
            }
        }
    }

    return (
        <>
            <div
                className={classNames('text-2xl', className)}
                onClick={openPanel}
                {...rest}
            >
                <PiGearDuotone />
            </div>
            <Drawer
                title="Theme Config"
                isOpen={panelExpand}
                placement={direction === 'rtl' ? 'left' : 'right'}
                width={375}
                onClose={closePanel}
                onRequestClose={closePanel}
            >
                <SidePanelContent callBackClose={closePanel} />
            </Drawer>
        </>
    )
}

const SidePanel = withHeaderItem(_SidePanel)

export default SidePanel
