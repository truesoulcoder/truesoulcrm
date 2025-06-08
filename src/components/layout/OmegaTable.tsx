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
} from '@tanstack/react-table';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { createCrmLeadAction, updateCrmLeadAction, deleteCrmLeadAction } from '@/app/crm/actions';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/types';

// Type Aliases for the new schema
type Lead = Database['public']['Tables']['leads']['Row'];
type LeadInsert = Database['public']['Tables']['leads']['Insert'];

const columnHelper = createColumnHelper<Lead>();

const OmegaTable = () => {
  // Data and State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Table State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Data Fetching
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (fetchError) throw fetchError;
      setLeads(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leads.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Modal and CRUD Handlers
  const handleOpenModal = (lead: Lead | null = null) => {
    setSelectedLead(lead);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLead(null);
  };

  const handleFormSubmit = async (leadData: LeadInsert) => {
    const action = selectedLead ? updateCrmLeadAction(selectedLead.id, leadData) : createCrmLeadAction(leadData);
    const response = await action;
    if (response.success) {
      await fetchData(); // Refresh data on success
      handleCloseModal();
    } else {
      alert(`Error: ${response.error}`);
    }
  };

  const handleLeadDelete = async (leadId: string) => {
    const response = await deleteCrmLeadAction(leadId);
    if (response.success) {
      await fetchData();
      handleCloseModal();
    } else {
      alert(`Error: ${response.error}`);
    }
  };

  // TanStack Table Columns Definition
  const columns = useMemo(() => [
    columnHelper.accessor(row => `${row.first_name || ''} ${row.last_name || ''}`, {
        id: 'contact_name',
        header: 'Name',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('email', {
        header: 'Email',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('phone', {
        header: 'Phone',
        cell: info => info.getValue() || '-',
    }),
    columnHelper.accessor(row => `${row.property_address || ''}, ${row.property_city || ''}`, {
        id: 'address',
        header: 'Property Address',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('market_region', {
        header: 'Market',
        cell: info => info.getValue() || '-',
    }),
    columnHelper.accessor('created_at', {
        header: 'Date Added',
        cell: info => new Date(info.getValue()).toLocaleDateString(),
    }),
  ], []);

  const table = useReactTable({
    data: leads,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="p-4 bg-base-100 rounded-lg shadow-xl">
      {/* Header: Search and Add Button */}
      <div className="flex justify-between items-center mb-4">
        <input
          type="text"
          placeholder="Search all fields..."
          className="input input-bordered w-full max-w-xs"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          Add New Lead
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="table w-full">
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
              <tr><td colSpan={columns.length} className="text-center py-10"><span className="loading loading-spinner"></span></td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-10">No leads found.</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover" onClick={() => handleOpenModal(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <span className="text-sm">
          Page{' '}
          <strong>
            {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </strong>
        </span>
        <div className="btn-group">
          <button className="btn" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>«</button>
          <button className="btn" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>»</button>
        </div>
      </div>

      {/* Modal */}
      <LeadFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleFormSubmit}
        onDelete={handleLeadDelete}
        lead={selectedLead || undefined}
        isEditMode={!!selectedLead}
      />
    </div>
  );
};

export default OmegaTable;