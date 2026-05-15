// FILE: client/src/pages/hubs/DraftWarRoom.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DraftHistory from "@/pages/DraftHistory";
import KeeperCalculator from "@/pages/KeeperCalculator";
import DraftOptimizer from "@/pages/DraftOptimizer";
import DraftBoard from "@/pages/DraftBoard";
import PlayerComparison from "@/pages/PlayerComparison";
import MockDraftSimulator from "@/pages/MockDraftSimulator";
import SavedDrafts from "@/pages/SavedDrafts";
import AIDraftHelper from "@/pages/AIDraftHelper";

const TAB_CLASS = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium whitespace-nowrap";

export default function DraftWarRoom() {
  return (
    <AppLayout title="Draft War Room" subtitle="Draft day is decided before you sit down">
      <Tabs defaultValue="ai-helper" className="w-full">
        <div className="px-6 pt-4 border-b border-border overflow-x-auto">
          <TabsList className="bg-transparent p-0 h-auto gap-1 flex-nowrap min-w-max">
            <TabsTrigger value="ai-helper" className={TAB_CLASS}>
              🤖 AI Draft Helper
            </TabsTrigger>
            <TabsTrigger value="draft-board" className={TAB_CLASS}>
              2026 Draft Board
            </TabsTrigger>
            <TabsTrigger value="player-comparison" className={TAB_CLASS}>
              Who Should I Draft?
            </TabsTrigger>
            <TabsTrigger value="mock-draft" className={TAB_CLASS}>
              Mock Draft Sim
            </TabsTrigger>
            <TabsTrigger value="saved-mocks" className={TAB_CLASS}>
              Saved Mocks
            </TabsTrigger>
            <TabsTrigger value="draft-history" className={TAB_CLASS}>
              Draft History
            </TabsTrigger>
            <TabsTrigger value="keeper-calculator" className={TAB_CLASS}>
              Keeper Calculator
            </TabsTrigger>
            <TabsTrigger value="draft-optimizer" className={TAB_CLASS}>
              Draft Optimizer
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="ai-helper" className="mt-0">
          <AIDraftHelper />
        </TabsContent>
        <TabsContent value="draft-board" className="mt-0">
          <DraftBoard />
        </TabsContent>
        <TabsContent value="player-comparison" className="mt-0">
          <PlayerComparison />
        </TabsContent>
        <TabsContent value="mock-draft" className="mt-0">
          <MockDraftSimulator />
        </TabsContent>
        <TabsContent value="saved-mocks" className="mt-0">
          <SavedDrafts />
        </TabsContent>
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
