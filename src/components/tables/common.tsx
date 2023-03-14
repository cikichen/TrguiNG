import { ClickEvent, ControlledMenu, MenuItem } from "@szhsin/react-menu";
import { useReactTable, Table, ColumnDef, ColumnSizingState, SortingState, VisibilityState, getCoreRowModel, getSortedRowModel, flexRender, Row, Header, Column } from "@tanstack/react-table";
import { useVirtualizer, Virtualizer } from "@tanstack/react-virtual";
import { ConfigContext, TableName } from "config";
import React, { memo } from "react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const defaultColumn = {
    minSize: 30,
    size: 150,
    maxSize: 2000,
};

export function useTable<TData>(
    tablename: TableName,
    columns: ColumnDef<TData, unknown>[],
    data: TData[],
    getRowId: (r: TData) => string,
): [Table<TData>, VisibilityState, (v: VisibilityState) => void, ColumnSizingState] {
    const config = useContext(ConfigContext);

    const [columnVisibility, setColumnVisibility] =
        useState<VisibilityState>(config.getTableColumnVisibility(tablename));
    const [columnSizing, setColumnSizing] =
        useState<ColumnSizingState>(config.getTableColumnSizes(tablename));
    const [sorting, setSorting] =
        useState<SortingState>(config.getTableSortBy(tablename));

    useEffect(() => config.setTableColumnVisibility(
        tablename, columnVisibility), [config, columnVisibility]);
    useEffect(() => config.setTableColumnSizes(
        tablename, columnSizing), [config, columnSizing]);
    useEffect(() => config.setTableSortBy(
        tablename, sorting), [config, sorting]);

    const table = useReactTable<TData>({
        columns,
        data,
        defaultColumn,
        getRowId,
        enableHiding: true,
        onColumnVisibilityChange: setColumnVisibility,
        enableColumnResizing: true,
        onColumnSizingChange: setColumnSizing,
        enableSorting: true,
        onSortingChange: setSorting,
        state: {
            columnVisibility,
            columnSizing,
            sorting,
        },
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return [table, columnVisibility, setColumnVisibility, columnSizing];
}

function useSelectHandler<TData>(
    table: Table<TData>,
    selectedReducer: ({ verb, ids }: { verb: "add" | "set", ids: string[] }) => void,
    getRowId: (row: TData) => string,
    setCurrent?: (id: string) => void,
): [number, (event: React.MouseEvent<Element>, index: number, lastIndex: number) => void] {
    const [lastIndex, setLastIndex] = useState(-1);

    const onRowClick = useCallback((event: React.MouseEvent<Element>, index: number, lastIndex: number) => {
        const rows = table.getRowModel().rows;
        event.preventDefault();
        event.stopPropagation();

        function genIds() {
            var minIndex = Math.min(index, lastIndex);
            var maxIndex = Math.max(index, lastIndex);
            var ids = [];
            for (var i = minIndex; i <= maxIndex; i++)
                ids.push(getRowId(rows[i].original));
            return ids;
        }

        if (event.shiftKey && event.ctrlKey && lastIndex != -1) {
            var ids = genIds();
            selectedReducer({ verb: "add", ids });
        } else if (event.shiftKey && lastIndex != -1) {
            var ids = genIds();
            selectedReducer({ verb: "set", ids });
        } else if (event.ctrlKey) {
            selectedReducer({ verb: "add", ids: [getRowId(rows[index].original)] });
        } else {
            selectedReducer({ verb: "set", ids: [getRowId(rows[index].original)] });
        }

        if (event.shiftKey) {
            document.getSelection()?.removeAllRanges();
        } else {
            setLastIndex(index);
        }
        if (setCurrent)
            setCurrent(getRowId(rows[index].original));
    }, [selectedReducer, setLastIndex, table]);

    return [lastIndex, onRowClick];
}

function useTableVirtualizer(count: number): [React.MutableRefObject<null>, number, Virtualizer<Element, Element>] {
    const parentRef = useRef(null);
    const rowHeight = useMemo(() => {
        const lineHeight = getComputedStyle(document.body).lineHeight.match(/[\d\.]+/);
        return Math.ceil(Number(lineHeight) * 1.1);
    }, []);

    const rowVirtualizer = useVirtualizer({
        count,
        getScrollElement: () => parentRef.current,
        paddingStart: rowHeight,
        overscan: 3,
        estimateSize: useCallback(() => rowHeight, []),
    });

    return [parentRef, rowHeight, rowVirtualizer];
}

function useColumnMenu<TData>(
    columnVisibility: VisibilityState,
    setColumnVisibility: (v: VisibilityState) => void,
    columns: Column<TData, unknown>[]
): [React.MouseEventHandler<HTMLDivElement>, React.ReactElement] {
    const [isColumnMenuOpen, setColumnMenuOpen] = useState(false);
    const [columnMenuAnchorPoint, setColumnMenuAnchorPoint] = useState({ x: 0, y: 0 });

    const onColumnMenuItemClick = useCallback((event: ClickEvent) => {
        event.keepOpen = true;
        setColumnVisibility({ ...columnVisibility, [event.value!]: event.checked });
    }, [columnVisibility]);

    const onContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setColumnMenuAnchorPoint({ x: e.clientX, y: e.clientY });
        setColumnMenuOpen(true);
    }, [setColumnMenuAnchorPoint, setColumnMenuOpen]);

    return [
        onContextMenu,
        <ControlledMenu
            anchorPoint={columnMenuAnchorPoint}
            state={isColumnMenuOpen ? 'open' : 'closed'}
            direction="right"
            onClose={() => setColumnMenuOpen(false)}
            onItemClick={onColumnMenuItemClick}
            overflow="auto"
            portal={true}
        >
            {columns.map(column =>
                <MenuItem key={column.id}
                    type="checkbox"
                    checked={columnVisibility[column.id] !== false}
                    value={column.id}
                >
                    {column.columnDef.header! as string}
                </MenuItem>
            )}
        </ControlledMenu>
    ];
}

export interface SelectableRow {
    isSelected?: boolean
}

function TableRow<TData extends SelectableRow>(props: {
    row: Row<TData>,
    index: number,
    start: number,
    lastIndex: number,
    onRowClick: (e: React.MouseEvent<Element>, i: number, li: number) => void,
    onRowDoubleClick?: (row: TData) => void,
    height: number,
    columnSizing: ColumnSizingState,
    columnVisibility: VisibilityState
}) {
    const onRowDoubleClick = useCallback(() => {
        if(props.onRowDoubleClick)
            props.onRowDoubleClick(props.row.original);
    }, [props.row]);
    return (
        <div
            className={`tr ${props.row.original.isSelected ? " selected" : ""} ${props.index % 2 ? " odd" : ""}`}
            style={{ height: `${props.height}px`, transform: `translateY(${props.start}px)` }}
            onClick={(e) => {
                props.onRowClick(e, props.index, props.lastIndex);
            }}
            onDoubleClick={onRowDoubleClick}
        >
            {props.row.getVisibleCells().map(cell => {
                return (
                    <div {...{
                        key: cell.id,
                        style: {
                            width: cell.column.getSize(),
                        },
                        className: "td"
                    }} >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                )
            })}
        </div>
    );
}

const MemoizedTableRow = memo(TableRow) as typeof TableRow;

export function Table<TData extends SelectableRow>(props: {
    tablename: TableName,
    columns: ColumnDef<TData, unknown>[]
    data: TData[],
    getRowId: (r: TData) => string,
    selectedReducer: ({ verb, ids }: { verb: "add" | "set", ids: string[] }) => void,
    setCurrent?: (id: string) => void,
    onRowDoubleClick?: (row: TData) => void,
}) {
    const [table, columnVisibility, setColumnVisibility, columnSizing] =
        useTable(props.tablename, props.columns, props.data, props.getRowId);

    const [lastIndex, onRowClick] = useSelectHandler(table, props.selectedReducer, props.getRowId, props.setCurrent);

    const [parentRef, rowHeight, virtualizer] = useTableVirtualizer(props.data.length);

    const [menuContextHandler, columnMenu] = useColumnMenu(columnVisibility, setColumnVisibility, table.getAllLeafColumns());

    return (
        <div ref={parentRef} className="torrent-table-container">
            <div className="torrent-table"
                style={{ height: `${virtualizer.getTotalSize()}px`, width: `${table.getTotalSize()}px` }}>
                <div className="sticky-top bg-light" style={{ height: `${rowHeight}px` }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <div className="tr" key={headerGroup.id}
                            onContextMenu={menuContextHandler}
                        >
                            {columnMenu}
                            {headerGroup.headers.map(header => (
                                <div {...{
                                    key: header.id,
                                    style: {
                                        width: header.getSize(),
                                    },
                                    onClick: header.column.getToggleSortingHandler(),
                                    className: "th"
                                }}>
                                    <span>{header.column.getIsSorted() ? header.column.getIsSorted() == "desc" ? '▼ ' : '▲ ' : ''}</span>
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext()
                                    )}
                                    <div {...{
                                        onMouseDown: header.getResizeHandler(),
                                        onTouchStart: header.getResizeHandler(),
                                        className: `resizer ${header.column.getIsResizing() ? 'isResizing' : ''}`,
                                        style: {
                                            left: `${header.getStart() + header.getSize() - 3}px`,
                                            transform:
                                                header.column.getIsResizing()
                                                    ? `translateX(${table.getState().columnSizingInfo.deltaOffset}px)`
                                                    : '',
                                        },
                                    }} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div>
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = table.getRowModel().rows[virtualRow.index];
                        return <MemoizedTableRow<TData> {...{
                            key: props.getRowId(row.original),
                            row,
                            index: virtualRow.index,
                            lastIndex,
                            start: virtualRow.start,
                            onRowClick,
                            onRowDoubleClick: props.onRowDoubleClick,
                            height: rowHeight,
                            columnSizing,
                            columnVisibility,
                        }} />;
                    })}
                </div>
            </div>
        </div >
    );
}