// FILE: client/src/pages/hubs/KeeperLab.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Keepers from "@/pages/Keepers";
import KeeperROI from "@/pages/KeeperROI";
import KeeperFutureValue from "@/pages/KeeperFutureValue";

export default function KeeperLab() {
  return (
    <AppLayout title="Keeper Lab" subtitle="2-year ROI scoring and keeper decision engine">
      <Tabs defaultValue="keeper-tracker" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="keeper-tracker" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Keeper Tracker
        </TabsTrigger>
        <TabsTrigger value="keeper-roi" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Keeper ROI
        </TabsTrigger>
        <TabsTrigger value="future-value" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Future Value
        </TabsTrigger>
          </TabsList>
        </div>
    <TabsContent value="keeper-tracker" className="mt-0">
      <Keepers />
    </TabsContent>
    <TabsContent value="keeper-roi" className="mt-0">
      <KeeperROI />
    </TabsContent>
    <TabsContent value="future-value" className="mt-0">
      <KeeperFutureValue />
    </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
