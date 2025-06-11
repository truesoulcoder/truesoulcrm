import React from "react";
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
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Checkbox,
  Tooltip,
  Chip,
} from "@heroui/react";
import { LeadModal } from "./lead-modal";

// Define the Lead type
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: "new" | "contacted" | "qualified" | "proposal" | "closed" | "lost";
  source: string;
  dateAdded: string;
}

// Sample data for leads
const initialLeads: Lead[] = [
  {
    id: "1",
    name: "John Smith",
    email: "john.smith@example.com",
    phone: "(555) 123-4567",
    company: "Acme Inc.",
    status: "new",
    source: "Website",
    dateAdded: "2023-06-15",
  },
  {
    id: "2",
    name: "Sarah Johnson",
    email: "sarah.j@techcorp.com",
    phone: "(555) 987-6543",
    company: "Tech Corp",
    status: "contacted",
    source: "LinkedIn",
    dateAdded: "2023-06-18",
  },
  {
    id: "3",
    name: "Michael Brown",
    email: "mbrown@globalfirm.com",
    phone: "(555) 456-7890",
    company: "Global Firm",
    status: "qualified",
    source: "Referral",
    dateAdded: "2023-06-20",
  },
  {
    id: "4",
    name: "Emily Davis",
    email: "emily.davis@innovate.co",
    phone: "(555) 234-5678",
    company: "Innovate Co",
    status: "proposal",
    source: "Trade Show",
    dateAdded: "2023-06-22",
  },
  {
    id: "5",
    name: "Robert Wilson",
    email: "rwilson@megacorp.com",
    phone: "(555) 876-5432",
    company: "Mega Corp",
    status: "closed",
    source: "Email Campaign",
    dateAdded: "2023-06-25",
  },
  {
    id: "6",
    name: "Jennifer Lee",
    email: "jlee@startupinc.com",
    phone: "(555) 345-6789",
    company: "Startup Inc",
    status: "lost",
    source: "Cold Call",
    dateAdded: "2023-06-28",
  },
  {
    id: "7",
    name: "David Martinez",
    email: "dmartinez@enterprise.com",
    phone: "(555) 654-3210",
    company: "Enterprise LLC",
    status: "new",
    source: "Website",
    dateAdded: "2023-07-01",
  },
  {
    id: "8",
    name: "Lisa Thompson",
    email: "lisa.t@growthco.com",
    phone: "(555) 789-0123",
    company: "Growth Co",
    status: "contacted",
    source: "LinkedIn",
    dateAdded: "2023-07-03",
  },
  {
    id: "9",
    name: "Kevin Anderson",
    email: "kevin.a@bigbusiness.com",
    phone: "(555) 321-0987",
    company: "Big Business",
    status: "qualified",
    source: "Webinar",
    dateAdded: "2023-07-05",
  },
  {
    id: "10",
    name: "Amanda White",
    email: "awhite@techstart.com",
    phone: "(555) 210-9876",
    company: "TechStart",
    status: "proposal",
    source: "Conference",
    dateAdded: "2023-07-08",
  },
  {
    id: "11",
    name: "Thomas Clark",
    email: "tclark@industrygroup.com",
    phone: "(555) 432-1098",
    company: "Industry Group",
    status: "closed",
    source: "Partner Referral",
    dateAdded: "2023-07-10",
  },
  {
    id: "12",
    name: "Olivia Rodriguez",
    email: "orodriguez@newventure.com",
    phone: "(555) 567-8901",
    company: "New Venture",
    status: "lost",
    source: "Social Media",
    dateAdded: "2023-07-12",
  },
];

// Status color mapping
const statusColorMap = {
  new: "primary",
  contacted: "secondary",
  qualified: "success",
  proposal: "warning",
  closed: "success",
  lost: "danger",
};

// Status name mapping
const statusNameMap = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  closed: "Closed Won",
  lost: "Closed Lost",
};

// Column definitions for sorting
const columns = [
  { name: "NAME", uid: "name", sortable: true },
  { name: "EMAIL", uid: "email", sortable: true },
  { name: "COMPANY", uid: "company", sortable: true },
  { name: "STATUS", uid: "status", sortable: true },
  { name: "SOURCE", uid: "source", sortable: true },
  { name: "DATE ADDED", uid: "dateAdded", sortable: true },
  { name: "ACTIONS", uid: "actions" },
];

export const LeadsTable: React.FC = () => {
  // State for leads data
  const [leads, setLeads] = React.useState<Lead[]>(initialLeads);
  
  // State for pagination
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  
  // State for sorting
  const [sortDescriptor, setSortDescriptor] = React.useState({
    column: "dateAdded",
    direction: "descending",
  });
  
  // State for selected rows
  const [selectedKeys, setSelectedKeys] = React.useState(new Set<string>([]));
  
  // Modal states
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
  const [currentLead, setCurrentLead] = React.useState<Lead | null>(null);
  const [isNewLead, setIsNewLead] = React.useState(false);

  // Handlers with proper dependencies
  const handleRowClick = React.useCallback((lead: Lead) => {
    setCurrentLead(lead);
    setIsNewLead(false);
    onOpen();
  }, [onOpen]);

  const handleAddLead = React.useCallback(() => {
    setCurrentLead({
      id: '',
      name: '',
      email: '',
      phone: '',
      company: '',
      status: 'new',
      source: '',
      dateAdded: new Date().toISOString().split('T')[0],
    });
    setIsNewLead(true);
    onOpen();
  }, [onOpen]);

  const handleDeleteLead = React.useCallback((id: string) => {
    setLeads(prevLeads => prevLeads.filter(lead => lead.id !== id));
    onClose();
  }, [onClose]);

  const handleDeleteSelected = React.useCallback(() => {
    setLeads(prevLeads => prevLeads.filter(lead => !selectedKeys.has(lead.id)));
    setSelectedKeys(new Set());
    onClose();
  }, [onClose, selectedKeys]);

  // Handle save lead (new or edit)
  const handleSaveLead = (lead: Lead) => {
    if (isNewLead) {
      // Add new lead with generated ID
      const newLead = {
        ...lead,
        id: (Math.max(...leads.map(l => parseInt(l.id))) + 1).toString(),
        dateAdded: new Date().toISOString().split('T')[0],
      };
      setLeads([...leads, newLead]);
    } else {
      // Update existing lead
      setLeads(leads.map(l => l.id === lead.id ? lead : l));
    }
    onClose();
  };

  // Render cell content based on column
  const renderCell = React.useCallback((lead: Lead, columnKey: React.Key) => {
    const cellValue = lead[columnKey as keyof Lead];

    switch (columnKey) {
      case "status":
        return (
          <Chip
            className="capitalize"
            color={statusColorMap[lead.status as keyof typeof statusColorMap] as any}
            size="sm"
            variant="flat"
          >
            {statusNameMap[lead.status as keyof typeof statusNameMap]}
          </Chip>
        );
      case "actions":
        return (
          <div className="relative flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Tooltip content="Edit lead">
              <Button 
                isIconOnly 
                size="sm" 
                variant="light"
                onPress={() => handleRowClick(lead)}
              >
                <Icon icon="lucide:edit" className="text-default-500" width={18} />
              </Button>
            </Tooltip>
            <Tooltip color="danger" content="Delete lead">
              <Button 
                isIconOnly 
                size="sm" 
                variant="light" 
                color="danger"
                onPress={() => handleDeleteLead(lead.id)}
              >
                <Icon icon="lucide:trash-2" width={18} />
              </Button>
            </Tooltip>
          </div>
        );
      default:
        return cellValue;
    }
  }, [handleDeleteLead, handleRowClick]);

  // Fix RowProps type error
  const renderRow = React.useCallback((item: Lead) => {
    return (
      <TableRow key={item.id}>
        {(columnKey) => (
          <TableCell>
            {renderCell(item, columnKey)}
          </TableCell>
        )}
      </TableRow>
    );
  }, [renderCell]);

  // Top content with add button and delete selected
  const topContent = React.useMemo(() => {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex gap-3">
            <Button 
              color="primary" 
              startContent={<Icon icon="lucide:plus" />}
              onPress={handleAddLead}
            >
              Add Lead
            </Button>
            {selectedKeys.size > 0 && (
              <Button 
                color="danger" 
                variant="flat"
                startContent={<Icon icon="lucide:trash-2" />}
                onPress={handleDeleteSelected}
              >
                Delete Selected
              </Button>
            )}
          </div>
          <span className="text-default-500 text-small">
            Total {leads.length} leads
          </span>
        </div>
      </div>
    );
  }, [handleAddLead, handleDeleteSelected, selectedKeys.size, leads.length]);

  // Bottom content with pagination
  const bottomContent = React.useMemo(() => {
    return (
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-default-500 text-small whitespace-nowrap">Rows per page:</span>
          <Dropdown>
            <DropdownTrigger>
              <Button variant="flat" size="sm" className="text-default-500">
                {rowsPerPage}
                <Icon icon="lucide:chevron-down" className="text-small ml-2" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Rows per page"
              selectionMode="single"
              selectedKeys={new Set([rowsPerPage.toString()])}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                setRowsPerPage(Number(value));
                setPage(1);
              }}
            >
              <DropdownItem key="5">5</DropdownItem>
              <DropdownItem key="10">10</DropdownItem>
              <DropdownItem key="15">15</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
        <Pagination
          isCompact
          showControls
          showShadow
          color="primary"
          page={page}
          total={Math.ceil(leads.length / rowsPerPage)}
          onChange={setPage}
        />
        <div className="hidden sm:flex w-[30%] justify-end gap-2">
          <Button
            isDisabled={page === 1}
            size="sm"
            variant="flat"
            onPress={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            isDisabled={page === Math.ceil(leads.length / rowsPerPage)}
            size="sm"
            variant="flat"
            onPress={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }, [page, leads.length, rowsPerPage]);

  // Calculate pagination
  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    // Apply sorting
    const sortedLeads = [...leads].sort((a: any, b: any) => {
      const first = a[sortDescriptor.column];
      const second = b[sortDescriptor.column];
      const cmp = first < second ? -1 : first > second ? 1 : 0;
      
      return sortDescriptor.direction === "descending" ? -cmp : cmp;
    });

    return sortedLeads.slice(start, end);
  }, [page, leads, rowsPerPage, sortDescriptor]);

  return (
    <div className="w-full h-full flex flex-col">
      <Table
        aria-label="Leads table"
        isHeaderSticky
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys as any}
        onSortChange={setSortDescriptor as any}
        sortDescriptor={sortDescriptor as any}
        topContent={topContent}
        bottomContent={bottomContent}
        classNames={{
          wrapper: "flex-grow min-h-[500px]", // Increased minimum height
          base: "h-full", // Ensure table takes full height
          table: "min-w-full", // Ensure table takes full width
        }}
        removeWrapper
      >
        <TableHeader columns={columns}>
          {(column) => (
            <TableColumn
              key={column.uid}
              align={column.uid === "actions" ? "center" : "start"}
              allowsSorting={column.sortable}
            >
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={items} emptyContent="No leads found">
          {(item) => (
            renderRow(item)
          )}
        </TableBody>
      </Table>

      <LeadModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        lead={currentLead}
        isNew={isNewLead}
        onSave={handleSaveLead}
        onDelete={handleDeleteLead}
      />
    </div>
  );
};