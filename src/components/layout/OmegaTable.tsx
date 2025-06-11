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
import { Eye, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react'; // Using lucide for icons
import type { Database, Tables } from '@/types/supabase';
import LeadFormModal from '@/components/leads/LeadFormModal';
import ColumnSelectorModal from './ColumnSelectorModal';
import { Button, Input, Badge, Spinner, Card, CardHeader, CardBody, CardFooter } from '@heroui/react'; // Assuming these components exist

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
      let color: "primary" | "secondary" | "success" | "warning" | "danger" | "neutral" = "neutral";
      // Basic mapping, HeroUI might have different color names or props
      switch (status) {
        case 'New Lead': color = "primary"; break;
        case 'Contacted': color = "success"; break;
        case 'Qualified': color = "primary"; break;
        case 'Unqualified/Disqualified': color = "danger"; break;
        case 'Closed - Converted/Customer': color = "success"; break;
        default: color = "neutral";
      }
      return <Badge color={color} variant="solid" className="text-xs">{status}</Badge>;
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
    //debugTable: true, // useful for development
  });

  // HeroUI table styles are inferred or use Tailwind defaults
  // Based on typical HeroUI structure, Card might be a good container
  return (
    <Card className="shadow-lg rounded-lg">
      <CardHeader className="p-4 sm:p-6"> {/* Adjusted padding */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <Input
            type="text"
            placeholder="Search leads..."
            className="w-full sm:max-w-xs" // Removed input-bordered, relying on HeroUI Input styling
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
          />
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsColumnModalOpen(true)}>
                  <Eye size={16} className="mr-2" />
                  Columns
              </Button>
              <Button color="primary" onClick={() => handleOpenModal()}>
                Add Lead
              </Button>
          </div>
        </div>
      </CardHeader>

      <CardBody className="overflow-x-auto p-0"> {/* Remove padding for table to span full width */}
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"> {/* Basic table structure */}
          <thead className="bg-gray-50 dark:bg-gray-800">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id} 
                    onClick={header.column.getToggleSortingHandler()}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && <ChevronUp size={14} className="inline ml-1" />}
                    {header.column.getIsSorted() === 'desc' && <ChevronDown size={14} className="inline ml-1" />}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={allColumns.length} className="text-center py-10"><Spinner size="lg" /></td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={allColumns.length} className="text-center py-10 text-gray-500 dark:text-gray-400">No leads found.</td></tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr 
                  key={row.original.property_id} 
                  className="hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" // Generic hover
                  onClick={() => handleOpenModal(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">
                      {/* Removed 'truncate' from td, apply it in cell render if needed */}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardBody>

      <CardFooter className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Page{' '}<strong>{table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</strong>
        </span>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => table.previousPage()} 
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous Page"
          >
            <ChevronsLeft size={16} />
          </Button>
          <Button 
            variant="outline" 
            onClick={() => table.nextPage()} 
            disabled={!table.getCanNextPage()}
            aria-label="Next Page"
          >
            <ChevronsRight size={16} />
          </Button>
        </div>
      </CardFooter>

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
    </Card>
  );
};

export default OmegaTable;