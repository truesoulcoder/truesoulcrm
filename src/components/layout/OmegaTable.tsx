'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { View } from 'lucide-react';
import type { Database, Tables } from '@/types/supabase';
import LeadFormModal from '@/components/leads/LeadFormModal';
import ColumnSelectorModal from './ColumnSelectorModal';

// Create a new type for our view by extending the base property type
type PropertyWithContacts = Tables<'properties'> & {
    contact_count: number | null;
    contact_names: string | null;
    contact_emails: string | null;
    contact_phones: string | null;
};

const columnHelper = createColumnHelper<PropertyWithContacts>();

// Define all possible columns for the new view
const allColumns = [
  columnHelper.accessor('property_address', {
    header: 'Property Address',
    cell: info => <div className="truncate">{info.getValue() || 'N/A'}</div>,
  }),
  columnHelper.accessor('property_city', { header: 'City' }),
  columnHelper.accessor('status', {
    header: 'Lead Status',
    cell: info => {
      const status = info.getValue();
      const statusClass = {
        'New Lead': 'badge-info', 'Contacted': 'badge-success', 'Qualified': 'badge-primary',
        'Unqualified/Disqualified': 'badge-error', 'Closed - Converted/Customer': 'badge-success font-bold',
      }[status] || 'badge-ghost';
      return <span className={`badge ${statusClass} text-xs`}>{status}</span>;
    },
  }),
  columnHelper.accessor('contact_count', { header: '# Contacts' }),
  columnHelper.accessor('contact_names', {
      header: 'Contact Names',
      cell: info => <div className="truncate">{info.getValue()}</div>,
  }),
  columnHelper.accessor('contact_emails', {
      header: 'Contact Emails',
      cell: info => <div className="truncate">{info.getValue()}</div>,
  }),
  columnHelper.accessor('beds', { header: 'Beds' }),
  columnHelper.accessor('baths', { header: 'Baths' }),
  columnHelper.accessor('square_footage', { header: 'Sq. Ft.' }),
  columnHelper.accessor('year_built', { header: 'Year Built' }),
  columnHelper.accessor('market_value', {
    header: 'Market Value',
    cell: info => info.getValue()?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-',
  }),
  columnHelper.accessor('created_at', {
    header: 'Date Added',
    cell: info => new Date(info.getValue()).toLocaleDateString(),
  }),
];


const OmegaTable = () => {
  const [leads, setLeads] = useState<PropertyWithContacts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
      // Hide the more detailed contact columns by default
      contact_names: false,
      contact_emails: false,
      beds: false,
      baths: false,
      square_footage: false,
      year_built: false,
      market_value: false,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithContacts | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch from the new 'properties_with_contacts' view
      const { data, error: fetchError } = await supabase.from('properties_with_contacts').select('*').order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setLeads(data as PropertyWithContacts[] || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leads.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    // When the underlying tables change, refetch from the view
    const channel = supabase.channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleOpenModal = (property: PropertyWithContacts | null = null) => {
    setSelectedProperty(property);
    setIsModalOpen(true);
  };

  const table = useReactTable({
    data: leads,
    columns: allColumns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="p-4 bg-base-100 rounded-lg shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          placeholder="Search leads..."
          className="input input-bordered w-full max-w-xs"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => setIsColumnModalOpen(true)}>
                <View size={16} />
                Columns
            </button>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              Add Lead
            </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {/* Added table-fixed to prevent overflow */}
        <table className="table w-full table-fixed table-zebra">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()} className="cursor-pointer select-none">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? null}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={allColumns.length} className="text-center py-10"><span className="loading loading-spinner"></span></td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={allColumns.length} className="text-center py-10">No leads found.</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.original.property_id} className="hover" onClick={() => handleOpenModal(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <span className="text-sm">
          Page{' '}<strong>{table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</strong>
        </span>
        <div className="btn-group">
          <button className="btn" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>«</button>
          <button className="btn" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>»</button>
        </div>
      </div>

      {isModalOpen && (
          <LeadFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedProperty || undefined} />
      )}

      <ColumnSelectorModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        allColumns={table.getAllLeafColumns().map(col => ({ key: col.id, label: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id }))}
        currentVisibility={columnVisibility}
        onSave={setColumnVisibility}
      />
    </div>
  );
};

export default OmegaTable;