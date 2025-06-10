'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Mail, Phone } from 'lucide-react';
import type { Database, Tables } from '@/types/supabase';
import LeadFormModal from '@/components/leads/LeadFormModal';
import TableControls from '@/components/layout/TableControls';

// Define a type for a single contact object
type Contact = Tables<'contacts'> | null;

// Define the new, flattened data structure for each property row
type LeadData = Tables<'properties'> & {
  Contact1: Contact;
  Contact2: Contact;
  Contact3: Contact;
  MLSAgent: Contact;
};

const columnHelper = createColumnHelper<LeadData>();

// Helper to render a contact cell
const ContactCell = ({ contact }: { contact: Contact }) => {
  if (!contact) return null;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="font-semibold text-sm text-base-content">{contact.name || 'N/A'}</div>
      <div className="flex items-center gap-2 text-base-content/70">
        <Mail size={12} />
        <span>{contact.email || 'No Email'}</span>
      </div>
      <div className="flex items-center gap-2 text-base-content/70">
        <Phone size={12} />
        <span>{contact.phone || 'No Phone'}</span>
      </div>
    </div>
  );
};

// Define the new columns based on the mockup
const columns: ColumnDef<LeadData, any>[] = [
  columnHelper.accessor('property_address', { id: 'Property Address' }),
  columnHelper.accessor('status', { id: 'Lead Status' }),
  columnHelper.accessor('market_region', { id: 'Market Region' }),
  columnHelper.accessor('assessed_total', { id: 'Assessed Total', cell: info => info.getValue()?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-' }),
  columnHelper.accessor('market_value', { id: 'Market Value', cell: info => info.getValue()?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-' }),
  columnHelper.accessor('beds', { id: 'Beds' }),
  columnHelper.accessor('baths', { id: 'Baths' }),
  columnHelper.accessor('property_type', { id: 'Property Type' }),
  columnHelper.accessor('square_footage', { id: 'Square Footage' }),
  columnHelper.accessor('year_built', { id: 'Year Built' }),
  columnHelper.accessor('lot_size_sqft', { id: 'Lot Size Sq Ft' }),
  columnHelper.accessor('assessed_year', { id: 'Assessed Year' }),
  columnHelper.accessor('wholesale_value', { id: 'Wholesale Value', cell: info => info.getValue()?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-' }),
  columnHelper.accessor('mls_status', { id: 'MLS Status' }),
  columnHelper.accessor('mls_days_on_market', { id: 'Days on Market' }),
  columnHelper.accessor('mls_list_price', { id: 'MLS List Price', cell: info => info.getValue()?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-' }),
  columnHelper.accessor('MLSAgent', { id: 'MLS Agent', cell: ({ getValue }) => <ContactCell contact={getValue()} /> }),
  columnHelper.accessor('Contact1', { id: 'Contact1', cell: ({ getValue }) => <ContactCell contact={getValue()} /> }),
  columnHelper.accessor('Contact2', { id: 'Contact2', cell: ({ getValue }) => <ContactCell contact={getValue()} /> }),
  columnHelper.accessor('Contact3', { id: 'Contact3', cell: ({ getValue }) => <ContactCell contact={getValue()} /> }),
];

const OmegaTable = () => {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [marketRegionFilter, setMarketRegionFilter] = useState('all');
  const [marketRegions, setMarketRegions] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    'Beds': false, 'Baths': false, 'Property Type': false,
    'Square Footage': false, 'Year Built': false, 'Lot Size Sq Ft': false,
    'Assessed Year': false, 'Wholesale Value': false, 'MLS Status': false,
    'MLS Agent': false, 'Days on Market': false, 'MLS List Price': false,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Tables<'properties'> | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const { data: properties, error: propertiesError } = await supabase.from('properties').select('*');
    if (propertiesError) throw propertiesError;
    if (!properties) return;

    const propertyIds = properties.map(p => p.property_id);
    const { data: contacts, error: contactsError } = await supabase.from('contacts').select('*').in('property_id', propertyIds);
    if (contactsError) throw contactsError;

    const contactsByPropertyId = (contacts || []).reduce<Record<string, Tables<'contacts'>[]>>((acc, contact) => {
      if (!acc[contact.property_id]) acc[contact.property_id] = [];
      acc[contact.property_id].push(contact);
      return acc;
    }, {});
    
    const uniqueRegions = [...new Set(properties.map(p => p.market_region).filter(Boolean) as string[])];
    setMarketRegions(uniqueRegions.sort());

    const flattenedLeads = properties.map(prop => {
      const relatedContacts = contactsByPropertyId[prop.property_id] || [];
      const owners = relatedContacts.filter(c => c.role !== 'mls_agent');
      const agent = relatedContacts.find(c => c.role === 'mls_agent');
      
      return {
        ...prop,
        Contact1: owners[0] || null,
        Contact2: owners[1] || null,
        Contact3: owners[2] || null,
        MLSAgent: agent || null,
      };
    });

    setLeads(flattenedLeads);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting: [], globalFilter, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });
  
  useEffect(() => {
    table.getColumn('Market Region')?.setFilterValue(marketRegionFilter === 'all' ? '' : marketRegionFilter);
  }, [marketRegionFilter, table]);

  const handleOpenModal = (property: Tables<'properties'> | null) => {
    if (!property) return;
    setSelectedProperty(property);
    setIsModalOpen(true);
  };

  return (
    <div className="p-4 bg-base-100 rounded-lg shadow-xl h-full flex flex-col">
      <TableControls
        table={table}
        globalFilter={globalFilter}
        setGlobalFilter={setGlobalFilter}
        marketRegionFilter={marketRegionFilter}
        setMarketRegionFilter={setMarketRegionFilter}
        marketRegions={marketRegions}
      />

      <div className="overflow-x-auto flex-grow">
        <table className="table w-full table-zebra table-sm">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
                <tr key={row.original.property_id} className="hover" onClick={() => handleOpenModal(row.original)}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="py-3 px-2 align-top">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
          <button className="btn btn-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>«</button>
          <button className="btn btn-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>»</button>
        </div>
      </div>

      {isModalOpen && (
          <LeadFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedProperty || undefined} />
      )}
    </div>
  );
};

export default OmegaTable;