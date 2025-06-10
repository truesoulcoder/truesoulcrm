import {Spinner} from "@heroui/react";
import { CampaignDashboard } from "./components/campaign-dashboard";

export default function App() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <CampaignDashboard />
    </div>
  );
}