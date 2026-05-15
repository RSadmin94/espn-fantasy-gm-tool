// FILE: client/src/pages/hubs/OpponentIntel.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OwnerStats from "@/pages/OwnerStats";
import ManagerBehavior from "@/pages/ManagerBehavior";
import LeagueAnalytics from "@/pages/LeagueAnalytics";

export default function OpponentIntel() {
  return (
    <AppLayout title="Opponent Intel" subtitle="Know who you're playing before they know themselves">
      <Tabs defaultValue="owner-career-stats" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="owner-career-stats" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Owner Career Stats
        </TabsTrigger>
        <TabsTrigger value="manager-behavior" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Manager Behavior
        </TabsTrigger>
        <TabsTrigger value="league-analytics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          League Analytics
        </TabsTrigger>
          </TabsList>
        </div>
    <TabsContent value="owner-career-stats" className="mt-0">
      <OwnerStats />
    </TabsContent>
    <TabsContent value="manager-behavior" className="mt-0">
      <ManagerBehavior />
    </TabsContent>
    <TabsContent value="league-analytics" className="mt-0">
      <LeagueAnalytics />
    </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
