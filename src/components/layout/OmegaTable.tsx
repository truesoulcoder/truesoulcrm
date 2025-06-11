'use client';

// Removed tanstack imports: flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, SortingState, VisibilityState
// createColumnHelper is also removed as allColumns will be replaced.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
// import { Eye, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react'; // Replaced with @iconify/react
import { Icon } from '@iconify/react'; // For icons
import type { Database, Tables } from '@/types/supabase';
import LeadFormModal from '@/components/leads/LeadFormModal';
import ColumnSelectorModal from './ColumnSelectorModal';
// Added Pagination, Select, SelectItem, Chip to imports from @heroui/react
import { Button, Input, Badge, Spinner, Card, CardHeader, CardBody, CardFooter, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Pagination, Select, SelectItem, Chip } from '@heroui/react';

// Create a new type for our view by extending the base property type
type PropertyWithContacts = Tables<'properties'> & {
    contact_count: number | null;
    contact_names: string | null;
    contact_emails: string | null;
    contact_phones: string | null;
};

// Local type for column visibility
type ColumnVisibility = { [key: string]: boolean };

// Define column structure for HeroUI Table
interface HeroTableColumn {
  key: keyof PropertyWithContacts | 'actions'; // 'actions' for custom columns not directly in data
  label: string;
  sortable?: boolean;
  renderCell?: (item: PropertyWithContacts) => React.ReactNode;
}

// Define all possible columns for the new view, similar to OmegaTable-original
const staticColumns: HeroTableColumn[] = [
  { key: 'property_address', label: 'Property Address', sortable: true, renderCell: item => <div className="truncate">{item.property_address || 'N/A'}</div> },
  { key: 'property_city', label: 'City', sortable: true },
  { 
    key: 'status', 
    label: 'Lead Status', 
    sortable: true,
    renderCell: item => {
      const status = item.status;
      // Status mapping based on bento-box-ui/src/components/leads-table.tsx
      // Using 'default' for Chip as 'neutral' might not be standard for Chip colors.
      let color: "primary" | "secondary" | "success" | "warning" | "danger" | "default" = "default"; 
      switch (status?.toLowerCase()) { // Normalize status for matching
        case 'new lead': // Assuming 'New Lead' from data maps to 'new'
        case 'new':
          color = "primary"; break;
        case 'contacted': 
          color = "secondary"; break;
        case 'qualified': 
          color = "success"; break;
        case 'proposal': // Example status from bento-box
          color = "warning"; break;
        case 'unqualified/disqualified': // Existing status
        case 'lost': // Example status from bento-box
          color = "danger"; break;
        case 'closed - converted/customer': // Existing status
        case 'closed': // Example status from bento-box
          color = "success"; break;
        default: 
          color = "default";
      }
      return <Chip color={color} variant="flat" size="sm">{status || 'N/A'}</Chip>;
    }
  },
  { key: 'contact_count', label: '# Contacts', sortable: true },
  { key: 'contact_names', label: 'Contact Names', sortable: true, renderCell: item => <div className="truncate">{item.contact_names || 'N/A'}</div> },
  { key: 'contact_emails', label: 'Contact Emails', sortable: true, renderCell: item => <div className="truncate">{item.contact_emails || 'N/A'}</div>},
  { key: 'beds', label: 'Beds', sortable: true },
  { key: 'baths', label: 'Baths', sortable: true },
  { key: 'square_footage', label: 'Sq. Ft.', sortable: true },
  { key: 'year_built', label: 'Year Built', sortable: true },
  { 
    key: 'market_value', 
    label: 'Market Value', 
    sortable: true,
    renderCell: item => item.market_value?.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }) || '-'
  },
  { 
    key: 'created_at', 
    label: 'Date Added', 
    sortable: true,
    renderCell: item => new Date(item.created_at).toLocaleDateString()
  },
];

const OmegaTable = () => {
  const [leads, setLeads] = useState<PropertyWithContacts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for HeroUI Table
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState(''); // Replaces globalFilter
  const [sortDescriptor, setSortDescriptor] = useState<{ column: string; direction: 'ascending' | 'descending' } | undefined>(undefined);
  const [selectedKeys, setSelectedKeys] = useState(new Set<React.Key>([])); // For row selection
  
  // Updated columnVisibility to use keys from staticColumns and local ColumnVisibility type
  const initialColumnVisibility: ColumnVisibility = {
    property_address: true,
    property_city: true,
    status: true,
    contact_count: true,
    contact_names: false,
    contact_emails: false,
    beds: false,
    baths: false,
    square_footage: false,
    year_built: false,
    market_value: false,
    created_at: true,
    // Ensure all keys from staticColumns are present, e.g.
    // actions: true, // If an 'actions' column were present
  };
  staticColumns.forEach(col => {
    if (!(col.key in initialColumnVisibility)) {
      // By default, make new columns visible if not specified, or set to false if preferred
      initialColumnVisibility[col.key as string] = true;
    }
  });
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(initialColumnVisibility);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithContacts | null>(null);

  // Filtering logic (client-side)
  const filteredLeads = useMemo(() => {
    if (!searchTerm) return leads;
    return leads.filter(lead =>
      // Iterate over staticColumns to only search visible and relevant data
      staticColumns.some(column => {
        if (columnVisibility[column.key as keyof ColumnVisibility] === false) return false; // Skip hidden columns
        if (column.key === 'actions') return false; // Skip non-data columns like 'actions'
        
        const value = lead[column.key as keyof PropertyWithContacts];
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      })
    );
  }, [leads, searchTerm, columnVisibility]);

  // Sorting logic (client-side)
  const sortedLeads = useMemo(() => {
    if (!sortDescriptor || !sortDescriptor.column) return filteredLeads;
    
    return [...filteredLeads].sort((a, b) => {
      // Get the actual key for sorting from staticColumns if needed, though sortDescriptor.column should be the key.
      const columnDefinition = staticColumns.find(c => c.key === sortDescriptor.column);
      if (!columnDefinition || !columnDefinition.sortable) return 0;

      const first = a[sortDescriptor.column as keyof PropertyWithContacts];
      const second = b[sortDescriptor.column as keyof PropertyWithContacts];
      let cmp = 0;

      if (first === null || first === undefined) cmp = -1;
      else if (second === null || second === undefined) cmp = 1;
      // Check for number type for numeric comparison, otherwise string
      else if (typeof first === 'number' && typeof second === 'number') {
        cmp = first - second;
      } else {
        cmp = String(first).localeCompare(String(second));
      }
      
      return sortDescriptor.direction === 'descending' ? -cmp : cmp;
    });
  }, [filteredLeads, sortDescriptor]);

  // Pagination logic
  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedLeads.slice(start, end);
  }, [sortedLeads, page, rowsPerPage]);

  const totalPages = Math.ceil(sortedLeads.length / rowsPerPage);

  // Visible columns based on columnVisibility state
  const visibleColumns = useMemo(() => {
    return staticColumns.filter(col => columnVisibility[col.key as keyof ColumnVisibility] !== false);
  }, [columnVisibility]);
  

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Initial fetch order can be simple, sorting will be client-side for now
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

  // The `table` instance (useReactTable) is removed.
  // Data processing (filtering, sorting, pagination) will be handled by useMemo hooks.

  // HeroUI table styles are inferred or use Tailwind defaults
  // Based on typical HeroUI structure, Card might be a good container

  const tableRowStyles = {
    selected: "relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-primary-100 before:to-primary-200 before:animate-gradient-x before:opacity-0 group-data-[selected=true]:before:opacity-100 before:transition-opacity before:duration-500",
    default: "cursor-pointer transition-all duration-300"
  };

  return (
    <Card className="shadow-lg rounded-lg">
      <CardHeader className="p-4 sm:p-6"> {/* Adjusted padding */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <Input
            type="text"
            placeholder="Search leads..."
            className="w-full sm:max-w-xs" // Removed input-bordered, relying on HeroUI Input styling
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            // onClear={() => setSearchTerm('')} // Optional: if HeroUI Input supports it
          />
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsColumnModalOpen(true)}>
                  <Icon icon="lucide:eye" className="mr-2 h-4 w-4" />
                  Columns
              </Button>
              <Button color="primary" onPress={() => handleOpenModal()}> {/* onPress is typical for HeroUI buttons */}
                Add Lead
              </Button>
          </div>
        </div>
      </CardHeader>

      <CardBody className="overflow-x-auto p-0">
        <Table 
          aria-label="Leads Table"
          sortDescriptor={sortDescriptor}
          onSortChange={(descriptor) => setSortDescriptor(descriptor)}
          onRowAction={(key) => { // key is property_id from TableRow
            const property = leads.find(p => p.property_id === key);
            if (property) handleOpenModal(property); // Retain row click for modal even with selection
          }}
          selectionMode="multiple" // Changed from "none"
          selectedKeys={selectedKeys as any} // Cast to any due to potential Set<React.Key> vs Iterable<React.Key> type mismatch
          onSelectionChange={setSelectedKeys as any} // Cast to any
          classNames={{
            tr: `${tableRowStyles.default} ${tableRowStyles.selected}`,
            td: "transition-colors duration-300",
            // base: "min-h-[400px]", // Optional
            // wrapper: "min-h-[400px]", // Optional
          }}
        >
          <TableHeader columns={visibleColumns}>
            {(column: HeroTableColumn) => (
              <TableColumn key={column.key as string} allowsSorting={column.sortable}>
                {column.label}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody 
            items={paginatedLeads} 
            isLoading={isLoading}
            loadingContent={<Spinner size="lg" />}
            emptyContent={"No leads found."}
          >
            {(item: PropertyWithContacts) => (
              <TableRow 
                key={item.property_id}
                columns={visibleColumns} // Provide columns for the row rendering context
              >
                {(columnKey) => {
                  const columnDef = visibleColumns.find(c => c.key === columnKey);
                  let cellContent: React.ReactNode;
                  if (columnDef?.renderCell) {
                    cellContent = columnDef.renderCell(item);
                  } else {
                    // @ts-ignore
                    const val = item[columnKey as keyof PropertyWithContacts];
                    cellContent = val === null || val === undefined ? '-' : String(val);
                  }
                  return <TableCell>{cellContent}</TableCell>;
                }}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardBody>

      <CardFooter className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
            Rows per page:
            <Select 
                className="inline-flex ml-2 w-20"
                selectedKey={String(rowsPerPage)}
                onSelectionChange={(selected) => { // selected is of type Key | null
                    const newRowsPerPage = Number(selected);
                    if (!isNaN(newRowsPerPage) && newRowsPerPage > 0) {
                      setRowsPerPage(newRowsPerPage);
                      setPage(1); 
                    }
                }}
                aria-label="Rows per page"
            >
                {[10, 25, 50, 100].map(num => <SelectItem key={num} textValue={String(num)}>{String(num)}</SelectItem>)}
            </Select>
        </div>
        <Pagination 
            page={page} 
            total={totalPages} 
            onChange={(newPage) => setPage(newPage)}
            color="primary"
            size="sm"
            showControls
            className="ml-auto" // Push pagination to the right if space allows
        />
      </CardFooter>

      {isModalOpen && (
          <LeadFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} property={selectedProperty || undefined} />
      )}

      <ColumnSelectorModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        allColumns={staticColumns.map(col => ({ 
            key: col.key as string, 
            label: col.label 
        }))}
        currentVisibility={columnVisibility}
        onSave={(newVisibility) => {
          setColumnVisibility(newVisibility);
        }}
      />
    </Card>
  );
};

export default OmegaTable;