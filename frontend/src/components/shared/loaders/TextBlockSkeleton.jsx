import Skeleton from '@/components/ui/Skeleton'

const TextBlockSkeleton = (props) => {
    const {
        height,
        lastChildWidth = '60%',
        rowCount = 3,
        title = true,
        titleWidth = '40%',
    } = props

    return (
        <div className="flex flex-col gap-4">
            {title && (
                <Skeleton className="mb-1" height={height} width={titleWidth} />
            )}
            {Array.from(new Array(rowCount), (_, i) => i + 1).map(
                (row, index) => (
                    <Skeleton
                        key={row}
                        height={height}
                        width={
                            index === rowCount - 1 ? lastChildWidth : undefined
                        }
                    />
                ),
            )}
        </div>
    )
}

export default TextBlockSkeleton
