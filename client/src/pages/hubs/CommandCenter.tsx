// FILE: client/src/pages/hubs/CommandCenter.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Dashboard from "@/pages/Dashboard";
import Standings from "@/pages/Standings";
import Matchups from "@/pages/Matchups";

export default function CommandCenter() {
  return (
    <AppLayout title="Command Center" subtitle="Your league at a glance">
      <Tabs defaultValue="war-room" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="war-room" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          War Room
        </TabsTrigger>
        <TabsTrigger value="standings" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Standings
        </TabsTrigger>
        <TabsTrigger value="matchups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Matchups
        </TabsTrigger>
          </TabsList>
        </div>
    <TabsContent value="war-room" className="mt-0">
      <Dashboard />
    </TabsContent>
    <TabsContent value="standings" className="mt-0">
      <Standings />
    </TabsContent>
    <TabsContent value="matchups" className="mt-0">
      <Matchups />
    </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
