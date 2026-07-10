import { DropdownContextProvider } from './context/dropdownContext'
import DropdownMenu from './DropdownMenu'
import { FloatingTree, useFloatingParentNodeId } from '@floating-ui/react'

const Dropdown = ({ activeKey, ref, ...props }) => {
    const parentId = useFloatingParentNodeId()

    if (parentId === null) {
        return (
            <DropdownContextProvider value={{ activeKey }}>
                <FloatingTree>
                    <DropdownMenu {...props} ref={ref} />
                </FloatingTree>
            </DropdownContextProvider>
        )
    }

    return <DropdownMenu {...props} ref={ref} />
}

export default Dropdown
