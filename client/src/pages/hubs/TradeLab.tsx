// FILE: client/src/pages/hubs/TradeLab.tsx
import { useEffect } from "react";
import { trackEvent } from "@/lib/trackEvent";
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TradeAnalyzer from "@/pages/TradeAnalyzer";
import TradeOfferGenerator from "@/pages/TradeOfferGenerator";
import PickValueCalculator from "@/pages/PickValueCalculator";
import DraftPickTracker from "@/pages/DraftPickTracker";
import TradeAging from "@/pages/TradeAging";
import NotoriousTrades from "@/pages/NotoriousTrades";

const TAB_CLASS =
  "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium";

export default function TradeLab() {
  useEffect(() => { trackEvent("feature_open", "trade_lab"); }, []);
  return (
    <AppLayout title="Trade Lab" subtitle="Win every trade before you make it">
      <Tabs defaultValue="trade-analyzer" className="w-full">
        <div className="px-6 pt-4 border-b border-border overflow-x-auto">
          <TabsList className="bg-transparent p-0 h-auto gap-1 flex-nowrap">
            <TabsTrigger value="trade-analyzer" className={TAB_CLASS}>
              Trade Analyzer
            </TabsTrigger>
            <TabsTrigger value="trade-offer-gen" className={TAB_CLASS}>
              Trade Offer Gen
            </TabsTrigger>
            <TabsTrigger value="pick-value" className={TAB_CLASS}>
              Pick Value
            </TabsTrigger>
            <TabsTrigger value="pick-tracker" className={TAB_CLASS}>
              Pick Tracker
            </TabsTrigger>
            <TabsTrigger value="trade-aging" className={TAB_CLASS}>
              Trade Aging
            </TabsTrigger>
            <TabsTrigger value="notorious" className={TAB_CLASS}>
              ⚡ Notorious
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
        <TabsContent value="notorious" className="mt-0">
          <NotoriousTrades />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
