// FILE: client/src/pages/hubs/DraftWarRoom.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DraftHistory from "@/pages/DraftHistory";
import KeeperCalculator from "@/pages/KeeperCalculator";
import DraftOptimizer from "@/pages/DraftOptimizer";

export default function DraftWarRoom() {
  return (
    <AppLayout title="Draft War Room" subtitle="Keeper decisions, draft board, and pick strategy">
      <Tabs defaultValue="draft-history" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="draft-history" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Draft History
        </TabsTrigger>
        <TabsTrigger value="keeper-calculator" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Keeper Calculator
        </TabsTrigger>
        <TabsTrigger value="draft-optimizer" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Draft Optimizer
        </TabsTrigger>
          </TabsList>
        </div>
    <TabsContent value="draft-history" className="mt-0">
      <DraftHistory />
    </TabsContent>
    <TabsContent value="keeper-calculator" className="mt-0">
      <KeeperCalculator />
    </TabsContent>
    <TabsContent value="draft-optimizer" className="mt-0">
      <DraftOptimizer />
    </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
