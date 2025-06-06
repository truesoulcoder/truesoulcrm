import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import type { LeadFormData } from '@/components/leads/LeadFormModal'; // Import LeadFormData
import { createCrmLeadAction, updateCrmLeadAction, deleteCrmLeadAction } from '@/app/crm/actions';
import type { Database } from '@/db_types';

type DataRow = Record<string, unknown> & { id: string };

// Define a basic Lead interface (can be expanded later)
interface Lead { // This is for selectedLead, which might come from DataRow initially
  id: string;
  contact_name?: string; // Changed back from first_name/last_name
  email?: string;
  phone?: string;
  status?: string; // Already present
  street_address?: string; // Kept, as it's a form field, though not directly on DB lead
  // Add other relevant lead fields here, matching DataRow or crm_leads structure
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_postal_code?: string;
  contact_type?: string;
  assessed_total?: number | null;
  property_type?: string;
  square_footage?: number | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  lot_size_sqft?: number | null;
  notes?: string;
}

interface OmegaTableProps {
  data?: DataRow[];
  loading?: boolean;
  error?: string | null;
  marketFilter?: string;
  availableMarkets?: { name: string; associated_leads_table: string }[];
  onMarketFilterChange?: (market: string) => void;
}

const OmegaTable: React.FC<OmegaTableProps> = ({ 
  data = [], 
  loading = false, 
  error = null,
  marketFilter = 'all',
  availableMarkets = [],
  onMarketFilterChange = () => {}
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal and selection states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedLead, setSelectedLead] = useState<Partial<Lead> | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Filter and sort data
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey] as string | number;
      const valB = b[sortKey] as string | number;
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortKey, sortOrder]);

  // Pagination
  const currentRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, rowsPerPage]);
  
  // Update header checkbox indeterminate state
  useEffect(() => {
    if (headerCheckboxRef.current) {
      const safeCurrentRows = currentRows || []; // Defensive guard
      const numSelectedCurrentRows = safeCurrentRows.filter(row => selectedRows.includes(row.id)).length;
      if (numSelectedCurrentRows > 0 && numSelectedCurrentRows < safeCurrentRows.length) {
        headerCheckboxRef.current.indeterminate = true;
      } else {
        headerCheckboxRef.current.indeterminate = false;
      }
    }
  }, [selectedRows, currentRows]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);

  // Handlers
  const handleSort = (key: string) => {
    setSortOrder(sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  // Determine column headers dynamically
  const headers = useMemo(() => {
    if (data.length === 0) return [];
    return Object.keys(data[0])
      .filter(key => key !== 'id')
      .map(key => ({ key, label: key.replace(/_/g, ' ').toUpperCase(), sortable: true }));
  }, [data]);

  // Modal submit handler
  const handleModalSubmit = async (
    submittedLeadData: LeadFormData // Use imported LeadFormData type
  ) => {
    const currentMarketFilter = marketFilter; 

    if (!currentMarketFilter || currentMarketFilter === 'all') {
      console.error("Cannot submit lead: Market region is not specified. Please select a specific market from the table filter.");
      // Optionally, show a user-facing error message here
      return;
    }

    // Construct leadDataForAction, ensuring it aligns with what server actions expect.
    // Server actions currently expect CrmLead type which might not have all LeadFormData fields directly.
    // For now, pass all fields from submittedLeadData; server actions will pick what they need.
    // `contact_name` is removed from LeadFormData, so it won't be here.
    // New fields like first_name, last_name, status, street_address are now part of submittedLeadData.
    const leadDataForAction = { 
      ...submittedLeadData, // Spread all fields from the form
      market_region: currentMarketFilter,
      // Ensure numeric fields are correctly passed as numbers if actions expect them so.
      // LeadFormModal's onInputChange already converts these to numbers or null.
      assessed_total: submittedLeadData.assessed_total,
      square_footage: submittedLeadData.square_footage,
      beds: submittedLeadData.beds,
      baths: submittedLeadData.baths,
      year_built: submittedLeadData.year_built,
      lot_size_sqft: submittedLeadData.lot_size_sqft,
    };
    
    // Remove street_address if it's empty and not desired on the backend explicitly
    // For now, we pass it as is. The backend action should handle it.
    // if (leadDataForAction.street_address === '') {
    //   delete leadDataForAction.street_address;
    // }


    let response;
    if (selectedLead && selectedLead.id) {
      // Update existing lead
      response = await updateCrmLeadAction(Number(selectedLead.id), leadDataForAction);
    } else {
      // Create new lead
      response = await createCrmLeadAction(leadDataForAction);
    }

    if (response.success) {
      setIsModalOpen(false);
      console.log(response.message || (selectedLead?.id ? 'Lead updated successfully.' : 'Lead created successfully.'));
      // Data revalidation is handled by server action's revalidatePath
    } else {
      console.error('Failed to submit lead:', response.error);
      // Optionally, show a user-facing error message here
      // Modal remains open for corrections
    }
  };

  const handleDeleteLead = async (leadId: string | number) => {
    if (!selectedLead || !selectedLead.id) { // Safety check
      console.error("No lead selected for deletion or lead ID is missing.");
      return;
    }

    const currentMarketFilter = marketFilter; // Use the marketFilter state from component scope

    if (!currentMarketFilter || currentMarketFilter === 'all') {
      console.error("Cannot delete lead: Market region is not specified. Please select a specific market from the table filter.");
      // Optionally, show a user-facing error message here.
      // Consider if the modal should stay open or close if this error occurs.
      // For now, we'll prevent the action and the modal will remain as is.
      return;
    }

    const response = await deleteCrmLeadAction({ 
      leadId: Number(leadId), 
      marketRegion: currentMarketFilter 
    });

    if (response.success) {
      console.log(response.message || `Lead deleted successfully from ${currentMarketFilter}.`);
      setIsModalOpen(false);
      setSelectedLead(null); // Clear selected lead
      // Data revalidation is handled by server action's revalidatePath
    } else {
      console.error('Failed to delete lead:', response.error);
      // Optionally, show a user-facing error message
      // Modal could be kept open or closed based on UX decision
      setIsModalOpen(false); // Close modal even on error for now
    }
  };

  return (
    <div className="p-4">
      {/* Market Filter */}
      {availableMarkets.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Filter by Market:</label>
          <select
            className="select select-bordered w-full max-w-xs"
            value={marketFilter}
            onChange={(e) => onMarketFilterChange(e.target.value)}
          >
            <option value="all">All Markets</option>
            {availableMarkets.map(market => (
              <option key={market.name} value={market.name}>
                {market.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <select 
            className="select select-bordered"
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
          >
            {[10, 25, 50, 100].map(size => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
          <input 
            type="text" 
            placeholder="Search..." 
            className="input input-bordered w-full max-w-xs"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        <div>
          <button 
            className="btn btn-primary"
            onClick={() => {
              setSelectedLead(null);
              setIsModalOpen(true);
            }}
          >
            Add New Lead
          </button>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="text-center py-8">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-2">Loading leads...</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error mb-4">
          <div className="flex-1">
            <label>Error: {error}</label>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th className="w-12">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      ref={headerCheckboxRef}
                      checked={currentRows.length > 0 && currentRows.every(row => selectedRows.includes(row.id))}
                      onChange={(e) => {
                        const currentIds = currentRows.map(r => r.id);
                        if (e.target.checked) {
                          setSelectedRows(prev => [...new Set([...prev, ...currentIds])]);
                        } else {
                          setSelectedRows(prev => prev.filter(id => !currentIds.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th className="w-16">#</th>
                  {headers.map(header => (
                    <th 
                      key={header.key} 
                      onClick={() => handleSort(header.key)}
                      className="cursor-pointer"
                    >
                      {header.label}
                      {sortKey === header.key && (
                        <span>{sortOrder === 'asc' ? ' ▲' : ' ▼'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, index) => (
                  <tr 
                    key={`${row.id}-${index}`} // Append index to ensure key uniqueness
                    className="hover" // Removed cursor-pointer from entire row if modal only opens on cell click
                  >
                    <td onClick={(e) => e.stopPropagation()}> {/* Stop propagation to prevent row click */}
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary"
                        checked={selectedRows.includes(row.id)}
                        onChange={(e) => {
                          // e.stopPropagation(); // Already handled by td onClick
                          if (e.target.checked) {
                            setSelectedRows(prev => [...prev, row.id]);
                          } else {
                            setSelectedRows(prev => prev.filter(id => id !== row.id));
                          }
                        }}
                      />
                    </td>
                    <td>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                    {headers.map(header => (
                      <td 
                        key={`${row.id}-${header.key}`}
                        onClick={() => { // Allow modal opening by clicking on other cells
                           setSelectedLead(row as Partial<Lead>);
                           setIsModalOpen(true);
                        }}
                        className="cursor-pointer"
                      >
                        {String(row[header.key] || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <div className="btn-group">
                <button 
                  className="btn" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  «
                </button>
                <button className="btn">Page {currentPage} of {totalPages}</button>
                <button 
                  className="btn" 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  »
                </button>
              </div>
            </div>
          )}

          {currentRows.length === 0 && searchTerm && (
            <div className="text-center py-4">
              No results found for &quot;{searchTerm}&quot;
            </div>
          )}

          {currentRows.length === 0 && !searchTerm && (
            <div className="text-center py-4">
              No data available
            </div>
          )}
        </>
      )}

      <LeadFormModal
        isOpen={isModalOpen}
        lead={selectedLead as Partial<Database['public']['Tables']['crm_leads']['Row']>}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        onDelete={handleDeleteLead} // Pass the delete handler
        isEditMode={!!(selectedLead && selectedLead.id)} // Pass isEditMode
        isLoaded={true} // Assuming Google Maps API is handled internally or not critical for initial load
      />
    </div>
  );
};

export default OmegaTable;
