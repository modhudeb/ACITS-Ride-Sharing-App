import DropdownMenu from './DropdownMenu'
import { FloatingTree, useFloatingParentNodeId } from '@floating-ui/react'

const DropdownSub = ({ ref, ...props }) => {
    const parentId = useFloatingParentNodeId()

    if (parentId === null) {
        return (
            <FloatingTree>
                <DropdownMenu {...props} ref={ref} />
            </FloatingTree>
        )
    }

    return <DropdownMenu {...props} ref={ref} />
}

export default DropdownSub
