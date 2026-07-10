import Skeleton from '@/components/ui/Skeleton'
import Table from '@/components/ui/Table'

const { Tr, Td, TBody } = Table

const TableRowSkeleton = (props) => {
    const { columns = 1, rows = 10, avatarInColumns = [], avatarProps } = props

    return (
        <TBody>
            {Array.from(new Array(rows), (_, i) => i + 0).map((row) => (
                <Tr key={`row-${row}`}>
                    {Array.from(new Array(columns), (_, i) => i + 0).map(
                        (col) => (
                            <Td key={`col-${col}`}>
                                <div className="flex flex-auto items-center gap-2">
                                    {avatarInColumns.includes(col) && (
                                        <div>
                                            <Skeleton
                                                variant="circle"
                                                {...avatarProps}
                                            />
                                        </div>
                                    )}
                                    <Skeleton />
                                </div>
                            </Td>
                        ),
                    )}
                </Tr>
            ))}
        </TBody>
    )
}

export default TableRowSkeleton
