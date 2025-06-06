import React, { useState, useMemo } from 'react';

type DataRow = Record<string, unknown> & { id: string };

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
            <table className="table w-full">
              <thead>
                <tr>
                  <th>#</th>
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
                  <tr key={row.id}>
                    <td>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                    {headers.map(header => (
                      <td key={`${row.id}-${header.key}`}>{String(row[header.key] || '-')}</td>
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
    </div>
  );
};

export default OmegaTable;
