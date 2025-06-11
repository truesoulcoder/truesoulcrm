import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import { Lead } from "./leads-table";
import { Icon } from "@iconify/react";

interface LeadModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  lead: Lead | null;
  isNew: boolean;
  onSave: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

export const LeadModal: React.FC<LeadModalProps> = ({
  isOpen,
  onOpenChange,
  lead,
  isNew,
  onSave,
  onDelete,
}) => {
  // Form state
  const [formData, setFormData] = React.useState<Partial<Lead>>({
    name: "",
    email: "",
    phone: "",
    company: "",
    status: "new",
    source: "",
  });

  // Reset form when lead changes
  React.useEffect(() => {
    if (lead) {
      setFormData({ ...lead });
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        status: "new",
        source: "",
      });
    }
  }, [lead, isOpen]);

  // Handle input change
  const handleChange = (field: keyof Lead, value: string) => {
    setFormData({
      ...formData,
      [field]: value,
    });
  };

  // Handle save
  const handleSave = () => {
    // Basic validation
    if (!formData.name || !formData.email || !formData.company) {
      return; // Don't save if required fields are missing
    }

    onSave(formData as Lead);
  };

  // Handle delete
  const handleDelete = () => {
    if (lead && lead.id) {
      onDelete(lead.id);
    }
  };

  // Status options
  const statusOptions = [
    { key: "new", label: "New" },
    { key: "contacted", label: "Contacted" },
    { key: "qualified", label: "Qualified" },
    { key: "proposal", label: "Proposal" },
    { key: "closed", label: "Closed Won" },
    { key: "lost", label: "Closed Lost" },
  ];

  // Source options
  const sourceOptions = [
    { key: "Website", label: "Website" },
    { key: "LinkedIn", label: "LinkedIn" },
    { key: "Referral", label: "Referral" },
    { key: "Trade Show", label: "Trade Show" },
    { key: "Email Campaign", label: "Email Campaign" },
    { key: "Cold Call", label: "Cold Call" },
    { key: "Webinar", label: "Webinar" },
    { key: "Conference", label: "Conference" },
    { key: "Partner Referral", label: "Partner Referral" },
    { key: "Social Media", label: "Social Media" },
    { key: "Other", label: "Other" },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      className="text-foreground"
    >
      <ModalContent as="div" className="bg-content1">
        {(onClose: () => void) => (
          <>
            <ModalHeader className="text-xl font-semibold border-b border-default-200 pb-2">
              {isNew ? "Add New" : "Edit"} Lead
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  autoFocus
                  label="Name"
                  placeholder="Enter lead name"
                  value={formData.name}
                  onValueChange={(value) => handleChange("name", value)}
                  isRequired
                />
                <Input
                  label="Email"
                  placeholder="Enter email address"
                  value={formData.email}
                  onValueChange={(value) => handleChange("email", value)}
                  isRequired
                />
                <Input
                  label="Phone"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onValueChange={(value) => handleChange("phone", value)}
                />
                <Input
                  label="Company"
                  placeholder="Enter company name"
                  value={formData.company}
                  onValueChange={(value) => handleChange("company", value)}
                  isRequired
                />
                <Select
                  label="Status"
                  placeholder="Select lead status"
                  selectedKeys={[formData.status || ""]}
                  onChange={(e) => handleChange("status", e.target.value)}
                >
                  {statusOptions.map((status) => (
                    <SelectItem key={status.key}>
                      {status.label}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Source"
                  placeholder="Select lead source"
                  selectedKeys={[formData.source || ""]}
                  onChange={(e) => handleChange("source", e.target.value)}
                >
                  {sourceOptions.map((source) => (
                    <SelectItem key={source.key}>
                      {source.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </ModalBody>
            <ModalFooter className="border-t border-default-200 pt-4">
              <div className="flex w-full justify-between">
                {!isNew && (
                  <Button
                    color="danger"
                    variant="light"
                    onPress={handleDelete}
                    startContent={<Icon icon="lucide:trash-2" />}
                  >
                    Delete Lead
                  </Button>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button variant="flat" onPress={onClose}>
                    Cancel
                  </Button>
                  <Button color="primary" onPress={handleSave}>
                    Save
                  </Button>
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};