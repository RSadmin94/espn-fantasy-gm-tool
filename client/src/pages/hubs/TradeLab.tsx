// FILE: client/src/pages/hubs/TradeLab.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TradeAnalyzer from "@/pages/TradeAnalyzer";
import TradeOfferGenerator from "@/pages/TradeOfferGenerator";
import PickValueCalculator from "@/pages/PickValueCalculator";
import DraftPickTracker from "@/pages/DraftPickTracker";
import TradeAging from "@/pages/TradeAging";

export default function TradeLab() {
  return (
    <AppLayout title="Trade Lab" subtitle="Win every trade before you make it">
      <Tabs defaultValue="trade-analyzer" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger value="trade-analyzer" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Trade Analyzer
            </TabsTrigger>
            <TabsTrigger value="trade-offer-gen" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Trade Offer Gen
            </TabsTrigger>
            <TabsTrigger value="pick-value" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Pick Value
            </TabsTrigger>
            <TabsTrigger value="pick-tracker" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Pick Tracker
            </TabsTrigger>
            <TabsTrigger value="trade-aging" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
              Trade Aging
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="trade-analyzer" className="mt-0">
          <TradeAnalyzer />
        </TabsContent>
        <TabsContent value="trade-offer-gen" className="mt-0">
          <TradeOfferGenerator />
        </TabsContent>
        <TabsContent value="pick-value" className="mt-0">
          <PickValueCalculator />
        </TabsContent>
        <TabsContent value="pick-tracker" className="mt-0">
          <DraftPickTracker />
        </TabsContent>
        <TabsContent value="trade-aging" className="mt-0">
          <TradeAging />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
