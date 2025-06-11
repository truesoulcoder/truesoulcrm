import React from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem } from "@heroui/react";
import { Lead } from "./LeadsTable";
import { Icon } from "@iconify/react";

interface LeadModalProps { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; lead: Lead | null; isNew: boolean; onSave: (lead: Lead) => void; onDelete: (id: string) => void; }

export const LeadModal: React.FC<LeadModalProps> = ({ isOpen, onOpenChange, lead, isNew, onSave, onDelete }) => {
  const [formData, setFormData] = React.useState<Partial<Lead>>({});

  React.useEffect(() => {
    setFormData(lead ? { ...lead } : { name: "", email: "", phone: "", company: "", status: "new", source: "" });
  }, [lead, isOpen]);

  const handleChange = (field: keyof Lead, value: string) => { setFormData({ ...formData, [field]: value }); };
  const handleSave = () => { onSave(formData as Lead); };
  const handleDelete = () => { if (lead?.id) onDelete(lead.id); };

  const statusOptions = [ { key: "new", label: "New" }, { key: "contacted", label: "Contacted" }, { key: "qualified", label: "Qualified" }, { key: "proposal", label: "Proposal" }, { key: "closed", label: "Closed Won" }, { key: "lost", label: "Closed Lost" }, ];
  const sourceOptions = [ { key: "Website", label: "Website" }, { key: "LinkedIn", label: "LinkedIn" }, { key: "Referral", label: "Referral" }, { key: "Other", label: "Other" }, ];

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>{isNew ? "Add New Lead" : "Edit Lead"}</ModalHeader>
            <ModalBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input autoFocus label="Name" value={formData.name} onValueChange={(v) => handleChange("name", v)} isRequired />
                <Input label="Email" value={formData.email} onValueChange={(v) => handleChange("email", v)} isRequired />
                <Input label="Phone" value={formData.phone} onValueChange={(v) => handleChange("phone", v)} />
                <Input label="Company" value={formData.company} onValueChange={(v) => handleChange("company", v)} isRequired />
                <Select label="Status" selectedKeys={[formData.status || ""]} onChange={(e) => handleChange("status", e.target.value)}>{statusOptions.map((s) => (<SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>))}</Select>
                <Select label="Source" selectedKeys={[formData.source || ""]} onChange={(e) => handleChange("source", e.target.value)}>{sourceOptions.map((s) => (<SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>))}</Select>
              </div>
            </ModalBody>
            <ModalFooter>
              <div className="flex w-full justify-between">
                {!isNew && (<Button color="danger" variant="light" onPress={handleDelete} startContent={<Icon icon="lucide:trash-2" />}>Delete</Button>)}
                <div className="flex gap-2 ml-auto"><Button variant="flat" onPress={onClose}>Cancel</Button><Button color="primary" onPress={handleSave}>Save</Button></div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};