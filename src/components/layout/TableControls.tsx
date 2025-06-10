'use client';

import React from 'react';
import type { Table } from '@tanstack/react-table';
import PageSizeSelector from '@/components/ui/PageSizeSelector';

interface TableControlsProps<TData> {
  table: Table<TData>;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  marketRegionFilter: string;
  setMarketRegionFilter: (value: string) => void;
  marketRegions: string[];
}

const TableControls = <TData,>({
  table,
  globalFilter,
  setGlobalFilter,
  marketRegionFilter,
  setMarketRegionFilter,
  marketRegions,
}: TableControlsProps<TData>) => {
  return (
    <div className="card bg-base-200 shadow mb-4">
      <div className="card-body p-4">
        {/* Collapsible Column Selector */}
        <div tabIndex={0} className="collapse collapse-arrow border border-base-300 bg-base-100">
          <div className="collapse-title text-base font-medium">
            Select Columns to Display
          </div>
          <div className="collapse-content">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-2 p-2">
              {table.getAllLeafColumns().map((column: any) => (
                <div key={column.id} className="form-control">
                  <label className="label cursor-pointer justify-start gap-2 p-0">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    <span className="label-text text-sm">{column.id}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters and other controls */}
        <div className="flex flex-wrap items-end gap-4 mt-4">
          <div className="form-control flex-grow min-w-[250px]">
            <label className="label py-1"><span className="label-text text-xs font-semibold">Search Leads</span></label>
            <input
              type="text"
              placeholder="Search all fields..."
              className="input input-bordered input-sm w-full"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>
          <div className="form-control flex-grow">
            <label className="label py-1"><span className="label-text text-xs font-semibold">Market Region</span></label>
            <select 
              className="select select-bordered select-sm w-full" 
              value={marketRegionFilter} 
              onChange={e => setMarketRegionFilter(e.target.value)}
            >
              <option value="all">All Regions</option>
              {marketRegions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
          </div>
          <div className="form-control">
            <label className="label py-1"><span className="label-text text-xs font-semibold">Rows</span></label>
            <PageSizeSelector
              selectedPageSize={table.getState().pagination.pageSize}
              onPageSizeChange={table.setPageSize}
              disabled={!table.getCanSomeRows()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableControls;