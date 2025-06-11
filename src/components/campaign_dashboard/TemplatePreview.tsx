import React from "react";
import { Icon } from "@iconify/react";
import { Tabs, Tab, Button, ScrollShadow } from "@heroui/react";

export const TemplatePreview: React.FC = () => {
  const [activeTemplate, setActiveTemplate] = React.useState("template1");
  const templates = {
    template1: { name: "Summer Promotion", subject: "Summer Sale: 30% Off Everything!", preview: "https://img.heroui.chat/image/ai?w=800&h=600&u=email-template-1" },
    template2: { name: "Product Launch", subject: "Introducing Our New Collection", preview: "https://img.heroui.chat/image/ai?w=800&h=600&u=email-template-2" },
    template3: { name: "Newsletter", subject: "This Week's Top Stories", preview: "https://img.heroui.chat/image/ai?w=800&h=600&u=email-template-3" },
  };
  const currentTemplate = templates[activeTemplate as keyof typeof templates];

  return (
    <div className="flex h-full flex-col">
      <Tabs aria-label="Email templates" selectedKey={activeTemplate} onSelectionChange={(key) => setActiveTemplate(key as string)}>
        <Tab key="template1" title="Summer Promotion" />
        <Tab key="template2" title="Product Launch" />
        <Tab key="template3" title="Newsletter" />
      </Tabs>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="text-small font-medium">{currentTemplate.subject}</p>
          <p className="text-tiny text-default-500">From: marketing@example.com</p>
        </div>
        <Button size="sm" variant="flat" startContent={<Icon icon="lucide:edit-3" size={16} />}>Edit</Button>
      </div>
      <ScrollShadow className="mt-3 flex-grow rounded-medium border border-divider">
        <img src={currentTemplate.preview} alt="Email template preview" className="h-full w-full object-cover" />
      </ScrollShadow>
    </div>
  );
};