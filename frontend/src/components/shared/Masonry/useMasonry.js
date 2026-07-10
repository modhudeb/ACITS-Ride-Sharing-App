import { Children, isValidElement, useMemo } from 'react'

import useColumnsCount from './useCoulmnsCount'

const createEmptyColumns = (count) => {
    return Array.from({ length: count }, () => [])
}

const useMasonry = (children, columns) => {
    const noOfColumns = useColumnsCount(columns)

    const columnsChildren = useMemo(() => {
        const group = createEmptyColumns(noOfColumns)

        Children.forEach(children, (child, index) => {
            if (isValidElement(child)) {
                group[index % noOfColumns].push(child)
            }
        })

        return group
    }, [noOfColumns, children])

    return columnsChildren
}

export default useMasonry
