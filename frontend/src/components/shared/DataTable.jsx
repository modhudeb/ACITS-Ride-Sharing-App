import {
    useMemo,
    useRef,
    useEffect,
    useState,
    useImperativeHandle,
} from 'react'
import classNames from 'classnames'
import Table from '@/components/ui/Table'
import Pagination from '@/components/ui/Pagination'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import TableRowSkeleton from './loaders/TableRowSkeleton'
import Loading from './Loading'
import FileNotFound from '@/assets/svg/FileNotFound'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
} from '@tanstack/react-table'

const { Tr, Th, Td, THead, TBody, Sorter } = Table

const IndeterminateCheckbox = (props) => {
    const {
        indeterminate,
        onChange,
        onCheckBoxChange,
        onIndeterminateCheckBoxChange,
        ...rest
    } = props

    const ref = useRef(null)

    useEffect(() => {
        if (typeof indeterminate === 'boolean' && ref.current) {
            ref.current.indeterminate = !rest.checked && indeterminate
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, indeterminate])

    const handleChange = (e) => {
        onChange(e)
        onCheckBoxChange?.(e)
        onIndeterminateCheckBoxChange?.(e)
    }

    return (
        <Checkbox
            ref={ref}
            className="mb-0"
            onChange={(_, e) => handleChange(e)}
            {...rest}
        />
    )
}

function DataTable(props) {
    const {
        skeletonAvatarColumns,
        columns: columnsProp = [],
        data = [],
        customNoDataIcon,
        loading,
        noData,
        onCheckBoxChange,
        onIndeterminateCheckBoxChange,
        onPaginationChange,
        onSelectChange,
        onSort,
        pageSizes = [10, 25, 50, 100],
        selectable = false,
        skeletonAvatarProps,
        pagingData = {
            total: 0,
            pageIndex: 1,
            pageSize: 10,
        },
        checkboxChecked,
        indeterminateCheckboxChecked,
        instanceId = 'data-table',
        ref,
        ...rest
    } = props

    const { pageSize, pageIndex, total } = pagingData

    const [sorting, setSorting] = useState(null)

    const pageSizeOption = useMemo(
        () =>
            pageSizes.map((number) => ({
                value: number,
                label: `${number} / page`,
            })),
        [pageSizes],
    )

    useEffect(() => {
        if (Array.isArray(sorting)) {
            const sortOrder =
                sorting.length > 0 ? (sorting[0].desc ? 'desc' : 'asc') : ''
            const id = sorting.length > 0 ? sorting[0].id : ''
            onSort?.({ order: sortOrder, key: id })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sorting])

    const handleIndeterminateCheckBoxChange = (checked, rows) => {
        if (!loading) {
            onIndeterminateCheckBoxChange?.(checked, rows)
        }
    }

    const handleCheckBoxChange = (checked, row) => {
        if (!loading) {
            onCheckBoxChange?.(checked, row)
        }
    }

    const finalColumns = useMemo(() => {
        const columns = columnsProp

        if (selectable) {
            return [
                {
                    id: 'select',
                    maxSize: 50,
                    header: ({ table }) => (
                        <IndeterminateCheckbox
                            checked={
                                indeterminateCheckboxChecked
                                    ? indeterminateCheckboxChecked(
                                          table.getRowModel().rows,
                                      )
                                    : table.getIsAllRowsSelected()
                            }
                            indeterminate={table.getIsSomeRowsSelected()}
                            onChange={table.getToggleAllRowsSelectedHandler()}
                            onIndeterminateCheckBoxChange={(e) => {
                                handleIndeterminateCheckBoxChange(
                                    e.target.checked,
                                    table.getRowModel().rows,
                                )
                            }}
                        />
                    ),
                    cell: ({ row }) => (
                        <IndeterminateCheckbox
                            checked={
                                checkboxChecked
                                    ? checkboxChecked(row.original)
                                    : row.getIsSelected()
                            }
                            disabled={!row.getCanSelect()}
                            indeterminate={row.getIsSomeSelected()}
                            onChange={row.getToggleSelectedHandler()}
                            onCheckBoxChange={(e) =>
                                handleCheckBoxChange(
                                    e.target.checked,
                                    row.original,
                                )
                            }
                        />
                    ),
                },
                ...columns,
            ]
        }
        return columns
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnsProp, selectable, loading, checkboxChecked])

    const table = useReactTable({
        data,
        columns: finalColumns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualPagination: true,
        manualSorting: true,
        onSortingChange: (sorter) => {
            setSorting(sorter)
        },
        state: {
            sorting: sorting,
        },
    })

    const resetSorting = () => {
        table.resetSorting()
    }

    const resetSelected = () => {
        table.resetRowSelection(true)
    }

    useImperativeHandle(ref, () => ({
        resetSorting,
        resetSelected,
    }))

    const handlePaginationChange = (page) => {
        if (!loading) {
            resetSelected()
            onPaginationChange?.(page)
        }
    }

    const handleSelectChange = (value) => {
        if (!loading) {
            onSelectChange?.(Number(value))
        }
    }

    return (
        <Loading loading={Boolean(loading && data.length !== 0)} type="cover">
            <Table {...rest}>
                <THead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <Tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                return (
                                    <Th
                                        key={header.id}
                                        colSpan={header.colSpan}
                                    >
                                        {header.isPlaceholder ? null : (
                                            <div
                                                className={classNames(
                                                    header.column.getCanSort() &&
                                                        'cursor-pointer select-none point',
                                                    loading &&
                                                        'pointer-events-none',
                                                )}
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext(),
                                                )}
                                                {header.column.getCanSort() && (
                                                    <Sorter
                                                        sort={header.column.getIsSorted()}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </Th>
                                )
                            })}
                        </Tr>
                    ))}
                </THead>
                {loading && data.length === 0 ? (
                    <TableRowSkeleton
                        columns={finalColumns.length}
                        rows={pagingData.pageSize}
                        avatarInColumns={skeletonAvatarColumns}
                        avatarProps={skeletonAvatarProps}
                    />
                ) : (
                    <TBody>
                        {noData ? (
                            <Tr>
                                <Td
                                    className="hover:bg-transparent"
                                    colSpan={finalColumns.length}
                                >
                                    <div className="flex flex-col items-center gap-4">
                                        {customNoDataIcon ? (
                                            customNoDataIcon
                                        ) : (
                                            <>
                                                <FileNotFound />
                                                <span className="font-semibold">
                                                    No data found!
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </Td>
                            </Tr>
                        ) : (
                            table
                                .getRowModel()
                                .rows.slice(0, pageSize)
                                .map((row) => {
                                    return (
                                        <Tr key={row.id}>
                                            {row
                                                .getVisibleCells()
                                                .map((cell) => {
                                                    return (
                                                        <Td
                                                            key={cell.id}
                                                            style={{
                                                                width: cell.column.getSize(),
                                                            }}
                                                        >
                                                            {flexRender(
                                                                cell.column
                                                                    .columnDef
                                                                    .cell,
                                                                cell.getContext(),
                                                            )}
                                                        </Td>
                                                    )
                                                })}
                                        </Tr>
                                    )
                                })
                        )}
                    </TBody>
                )}
            </Table>
            <div className="flex items-center justify-between mt-4">
                <Pagination
                    pageSize={pageSize}
                    currentPage={pageIndex}
                    total={total}
                    onChange={handlePaginationChange}
                />
                <div style={{ minWidth: 130 }}>
                    <Select
                        instanceId={instanceId}
                        size="sm"
                        menuPlacement="top"
                        isSearchable={false}
                        value={pageSizeOption.filter(
                            (option) => option.value === pageSize,
                        )}
                        options={pageSizeOption}
                        onChange={(option) => handleSelectChange(option?.value)}
                    />
                </div>
            </div>
        </Loading>
    )
}

export default DataTable
