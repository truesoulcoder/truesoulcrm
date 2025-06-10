import React from "react";
import { Icon } from "@iconify/react";
import { Checkbox, Input, Button, ScrollShadow } from "@heroui/react";

interface EmailList {
  id: string;
  name: string;
  count: number;
  selected: boolean;
}

export const EmailSelector: React.FC = () => {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [emailLists, setEmailLists] = React.useState<EmailList[]>([
    { id: "1", name: "Newsletter Subscribers", count: 5420, selected: true },
    { id: "2", name: "New Customers", count: 1250, selected: false },
    { id: "3", name: "Inactive Users", count: 3100, selected: false },
    { id: "4", name: "Product Updates", count: 4200, selected: true },
    { id: "5", name: "Event Attendees", count: 890, selected: false },
    { id: "6", name: "Trial Users", count: 1500, selected: false },
  ]);

  const filteredLists = emailLists.filter((list) =>
    list.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleList = (id: string) => {
    setEmailLists(
      emailLists.map((list) =>
        list.id === id ? { ...list, selected: !list.selected } : list
      )
    );
  };

  const selectedCount = emailLists.filter((list) => list.selected).reduce((sum, list) => sum + list.count, 0);

  return (
    <div className="flex h-full flex-col gap-3">
      <Input
        placeholder="Search lists..."
        size="sm"
        startContent={<Icon icon="lucide:search" className="text-default-400" />}
        value={searchQuery}
        onValueChange={setSearchQuery}
      />

      <ScrollShadow className="flex-grow">
        <div className="space-y-2">
          {filteredLists.map((list) => (
            <div
              key={list.id}
              className="flex items-center justify-between rounded-medium p-2 hover:bg-content2"
            >
              <Checkbox
                isSelected={list.selected}
                onValueChange={() => handleToggleList(list.id)}
                size="sm"
              >
                <div className="flex flex-col">
                  <span className="text-small">{list.name}</span>
                  <span className="text-tiny text-default-500">{list.count.toLocaleString()} contacts</span>
                </div>
              </Checkbox>
            </div>
          ))}
        </div>
      </ScrollShadow>

      <div className="mt-auto border-t border-divider pt-3 text-center">
        <p className="mb-2 text-small">
          <span className="font-medium">{selectedCount.toLocaleString()}</span> contacts selected
        </p>
        <Button size="sm" color="primary" fullWidth>
          Apply Selection
        </Button>
      </div>
    </div>
  );
};