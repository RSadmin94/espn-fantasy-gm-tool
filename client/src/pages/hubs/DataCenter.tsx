// FILE: client/src/pages/hubs/DataCenter.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DataHealth from "@/pages/DataHealth";
import DataRefresh from "@/pages/DataRefresh";
import ScheduledRefresh from "@/pages/ScheduledRefresh";
import ScoringSettings from "@/pages/ScoringSettings";

export default function DataCenter() {
  return (
    <AppLayout title="Data Center" subtitle="Pipeline health, ESPN sync, and league configuration">
      <Tabs defaultValue="data-health" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="data-health" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Data Health
        </TabsTrigger>
        <TabsTrigger value="data-refresh" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Data Refresh
        </TabsTrigger>
        <TabsTrigger value="scheduled-refresh" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Auto-Refresh
        </TabsTrigger>
        <TabsTrigger value="scoring-settings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Scoring Settings
        </TabsTrigger>
          </TabsList>
        </div>
    <TabsContent value="data-health" className="mt-0">
      <DataHealth />
    </TabsContent>
    <TabsContent value="data-refresh" className="mt-0">
      <DataRefresh />
    </TabsContent>
    <TabsContent value="scheduled-refresh" className="mt-0">
      <ScheduledRefresh />
    </TabsContent>
    <TabsContent value="scoring-settings" className="mt-0">
      <ScoringSettings />
    </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
