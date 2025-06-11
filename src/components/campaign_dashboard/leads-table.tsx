// src/components/campaign_dashboard/leads-table.tsx
import React, { useState, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Pagination,
  Button,
  useDisclosure,
  Chip,
  Spinner,
  Input,
  SortDescriptor,
  Selection,
} from "@heroui/react";
import useSWR from 'swr';
import { Tables, Enums } from "@/types/supabase";
import LeadFormModal from "@/components/leads/LeadFormModal";
import { fetcher } from "@/utils/fetcher";

type PropertyWithContacts = Tables<'properties_with_contacts'>;
type LeadStatus = Enums<'lead_status'>;

const statusColorMap: Record<LeadStatus, "primary" | "secondary" | "success" | "warning" | "danger" | "default"> = {
  "New Lead": "primary", "Attempted to Contact": "secondary", "Contacted": "secondary",
  "Working/In Progress": "warning", "Contract Sent": "warning", "Qualified": "success",
  "Unqualified/Disqualified": "danger", "Nurture": "default", "Meeting Set": "success",
  "Closed - Converted/Customer": "success", "Closed - Not Converted/Opportunity Lost": "danger",
};

const columns = [
  { name: "PROPERTY", uid: "property_address", sortable: true },
  { name: "OWNER", uid: "contact_names", sortable: true },
  { name: "STATUS", uid: "status", sortable: true },
  { name: "MARKET", uid: "market_region", sortable: true },
  { name: "DATE ADDED", uid: "created_at", sortable: true },
  { name: "ACTIONS", uid: "actions" },
];

export const LeadsTable: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: "created_at", direction: "descending" });
  const [filterValue, setFilterValue] = useState("");
  const [selectedLead, setSelectedLead] = useState<Tables<'properties'> | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));

  const swrKey = `/api/leads?page=${page}&pageSize=${rowsPerPage}&sort=${sortDescriptor.column}&order=${sortDescriptor.direction === 'ascending' ? 'asc' : 'desc'}&filter=${filterValue}`;
  const { data, error, mutate, isLoading } = useSWR<{ data: PropertyWithContacts[], count: number }>(swrKey, fetcher);

  const leads = data?.data ?? [];
  const totalLeads = data?.count ?? 0;
  const pages = Math.ceil(totalLeads / rowsPerPage);

  const handleRowClick = (lead: PropertyWithContacts) => {
    setSelectedLead(lead as Tables<'properties'>);
    onOpen();
  };
  
  const onSearchChange = useCallback((value?: string) => {
    setFilterValue(value || "");
    setPage(1);
  }, []);

  const topContent = useMemo(() => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3 items-center">
        <Input
          isClearable
          className="w-full sm:max-w-xs"
          placeholder="Search by address or owner..."
          startContent={<Icon icon="lucide:search" className="text-default-500" />}
          value={filterValue}
          onClear={() => setFilterValue("")}
          onValueChange={onSearchChange}
          size="md" // Increased input size
        />
        <Button color="primary" onPress={() => { setSelectedLead(null); onOpen(); }} startContent={<Icon icon="lucide:plus" />}>
          Add Lead
        </Button>
      </div>
      <span className="text-default-500 text-xs">Total {totalLeads} leads</span>
    </div>
  ), [filterValue, onSearchChange, totalLeads]);

  const bottomContent = useMemo(() => {
    return (
      <div className="py-2 px-2 flex justify-between items-center">
        <select
          className="bg-transparent outline-none text-default-500 text-xs"
          onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
          value={rowsPerPage}
        >
          <option value="5">5 rows</option>
          <option value="10">10 rows</option>
          <option value="25">25 rows</option>
        </select>
        <Pagination
          showControls
          color="primary"
          page={page}
          total={pages}
          onChange={setPage}
        />
      </div>
    );
  }, [page, pages, rowsPerPage]);

  const renderCell = useCallback((lead: PropertyWithContacts, columnKey: React.Key) => {
    const cellValue = lead[columnKey as keyof PropertyWithContacts];
    switch (columnKey) {
      case "property_address":
        return (
          <div>
            <p className="font-medium text-sm">{lead.property_address || "N/A"}</p>
            <p className="text-xs text-default-500">{`${lead.property_city || ''}, ${lead.property_state || ''}`}</p>
          </div>
        );
      case "created_at":
        return <p className="text-xs">{new Date(cellValue as string).toLocaleDateString()}</p>;
      case "status":
        return <Chip color={statusColorMap[lead.status!]} size="sm" variant="flat" className="capitalize text-xs">{lead.status}</Chip>;
      case "actions":
        return (
          <div className="relative flex items-center gap-2">
            <Button isIconOnly size="sm" variant="light" onPress={() => handleRowClick(lead)}>
              <Icon icon="lucide:edit" className="text-lg" />
            </Button>
          </div>
        );
      default:
        return <p className="text-sm">{String(cellValue ?? '')}</p>;
    }
  }, []);

  if (error) return <p className="text-danger-500 p-4">Failed to load leads: {error.message}</p>;

  return (
    <>
      <Table
        aria-label="Leads table"
        isHeaderSticky
        bottomContent={bottomContent}
        bottomContentPlacement="outside"
        classNames={{ wrapper: "max-h-[calc(100vh-28rem)]", th: "text-xs uppercase bg-default-100" }}
        selectedKeys={selectedKeys}
        selectionMode="multiple"
        sortDescriptor={sortDescriptor}
        topContent={topContent}
        topContentPlacement="outside"
        onSelectionChange={setSelectedKeys}
        onSortChange={setSortDescriptor}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn key={column.uid} align="start" allowsSorting={column.sortable}>
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          emptyContent={!isLoading ? "No leads found" : " "}
          items={leads}
          isLoading={isLoading}
          loadingContent={<Spinner label="Loading leads..." />}
        >
          {(item) => (
            <TableRow key={item.property_id} className="cursor-pointer" onPress={() => handleRowClick(item)}>
              {(columnKey) => <TableCell>{renderCell(item, columnKey)}</TableCell>}
            </TableRow>
          )}
        </TableBody>
      </Table>
      
      {isOpen && (
        <LeadFormModal isOpen={isOpen} onClose={() => { onClose(); mutate(); }} property={selectedLead || undefined} />
      )}
    </>
  );
};