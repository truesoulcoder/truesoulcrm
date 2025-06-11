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
  Tooltip,
  Chip,
} from "@heroui/react";
import { LeadModal } from "./lead-modal";

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

const initialLeads: Lead[] = [
  // Using only the first 6 for brevity
  { id: "1", name: "John Smith", email: "john.smith@example.com", phone: "(555) 123-4567", company: "Acme Inc.", status: "new", source: "Website", dateAdded: "2023-06-15" },
  { id: "2", name: "Sarah Johnson", email: "sarah.j@techcorp.com", phone: "(555) 987-6543", company: "Tech Corp", status: "contacted", source: "LinkedIn", dateAdded: "2023-06-18" },
  { id: "3", name: "Michael Brown", email: "mbrown@globalfirm.com", phone: "(555) 456-7890", company: "Global Firm", status: "qualified", source: "Referral", dateAdded: "2023-06-20" },
  { id: "4", name: "Emily Davis", email: "emily.davis@innovate.co", phone: "(555) 234-5678", company: "Innovate Co", status: "proposal", source: "Trade Show", dateAdded: "2023-06-22" },
  { id: "5", name: "Robert Wilson", email: "rwilson@megacorp.com", phone: "(555) 876-5432", company: "Mega Corp", status: "closed", source: "Email Campaign", dateAdded: "2023-06-25" },
  { id: "6", name: "Jennifer Lee", email: "jlee@startupinc.com", phone: "(555) 345-6789", company: "Startup Inc", status: "lost", source: "Cold Call", dateAdded: "2023-06-28" },
];

const statusColorMap: Record<string, "primary" | "secondary" | "success" | "warning" | "danger" | "default"> = { new: "primary", contacted: "secondary", qualified: "success", proposal: "warning", closed: "success", lost: "danger" };
const statusNameMap: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", closed: "Closed Won", lost: "Closed Lost" };

const columns = [ { name: "NAME", uid: "name", sortable: true }, { name: "EMAIL", uid: "email", sortable: true }, { name: "COMPANY", uid: "company", sortable: true }, { name: "STATUS", uid: "status", sortable: true }, { name: "ACTIONS", uid: "actions" } ];

export const LeadsTable: React.FC = () => {
  const [leads, setLeads] = React.useState<Lead[]>(initialLeads);
  const [page, setPage] = React.useState(1);
  const rowsPerPage = 5;
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
  const [currentLead, setCurrentLead] = React.useState<Lead | null>(null);
  const [isNewLead, setIsNewLead] = React.useState(false);

  const handleRowClick = React.useCallback((lead: Lead) => { setCurrentLead(lead); setIsNewLead(false); onOpen(); }, [onOpen]);
  const handleAddLead = () => { setCurrentLead(null); setIsNewLead(true); onOpen(); };
  const handleSaveLead = (lead: Lead) => {
    if (isNewLead) {
      setLeads([...leads, { ...lead, id: (leads.length + 1).toString(), dateAdded: new Date().toISOString().split('T')[0] }]);
    } else {
      setLeads(leads.map(l => l.id === lead.id ? lead : l));
    }
    onClose();
  };
  const handleDeleteLead = React.useCallback((id: string) => { setLeads(leads.filter(lead => lead.id !== id)); onClose(); }, [leads, onClose]);
  
  const pages = Math.ceil(leads.length / rowsPerPage);
  const items = React.useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return leads.slice(start, end);
  }, [page, leads, rowsPerPage]);

  const renderCell = React.useCallback((lead: Lead, columnKey: React.Key) => {
    const cellValue = lead[columnKey as keyof Lead];
    if (columnKey === "status") {
      return <Chip color={statusColorMap[lead.status]} size="sm" variant="flat">{statusNameMap[lead.status]}</Chip>;
    }
    if (columnKey === "actions") {
      return (
        <div className="relative flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Tooltip content="Edit lead"><Button isIconOnly size="sm" variant="light" onPress={() => handleRowClick(lead)}><Icon icon="lucide:edit" width={18} /></Button></Tooltip>
          <Tooltip color="danger" content="Delete lead"><Button isIconOnly size="sm" variant="light" color="danger" onPress={() => handleDeleteLead(lead.id)}><Icon icon="lucide:trash-2" width={18} /></Button></Tooltip>
        </div>
      );
    }
    return cellValue;
  }, [handleDeleteLead, handleRowClick]);

  return (
    <div className="w-full h-full flex flex-col">
      <Table aria-label="Leads table" topContent={<Button color="primary" startContent={<Icon icon="lucide:plus" />} onPress={handleAddLead}>Add Lead</Button>} bottomContent={<div className="flex w-full justify-center"><Pagination isCompact showControls page={page} total={pages} onChange={setPage} /></div>}>
        <TableHeader columns={columns}>{(column) => <TableColumn key={column.uid} allowsSorting={column.sortable}>{column.name}</TableColumn>}</TableHeader>
        <TableBody items={items} emptyContent="No leads found">{(item) => <TableRow key={item.id} onClick={() => handleRowClick(item)}>{(columnKey) => <TableCell>{renderCell(item, columnKey)}</TableCell>}</TableRow>}</TableBody>
      </Table>
      <LeadModal isOpen={isOpen} onOpenChange={onOpenChange} lead={currentLead} isNew={isNewLead} onSave={handleSaveLead} onDelete={handleDeleteLead} />
    </div>
  );
};  
export default LeadsTable;