// FILE: client/src/pages/hubs/WaiverLab.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StartSit from "@/pages/StartSit";
import WaiverWire from "@/pages/WaiverWire";
import PlayerProfiles from "@/pages/PlayerProfiles";
import StrengthOfSchedule from "@/pages/StrengthOfSchedule";
import WeeklyProjections from "@/pages/WeeklyProjections";
import WaiverIntelligence from "@/pages/WaiverIntelligence";

const TAB_CLASS = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium whitespace-nowrap";

export default function WaiverLab() {
  return (
    <AppLayout title="Waiver Lab" subtitle="The wire is where championships are won. Move first.">
      <Tabs defaultValue="waiver-intel" className="w-full">
        <div className="px-6 pt-4 border-b border-border overflow-x-auto">
          <TabsList className="bg-transparent p-0 h-auto gap-1 flex-nowrap min-w-max">
            <TabsTrigger value="waiver-intel" className={TAB_CLASS}>
              Waiver Intelligence
            </TabsTrigger>
            <TabsTrigger value="projections" className={TAB_CLASS}>
              Projections
            </TabsTrigger>
            <TabsTrigger value="start-sit" className={TAB_CLASS}>
              Start/Sit AI
            </TabsTrigger>
            <TabsTrigger value="waiver-wire" className={TAB_CLASS}>
              Waiver Wire
            </TabsTrigger>
            <TabsTrigger value="player-profiles" className={TAB_CLASS}>
              Player Profiles
            </TabsTrigger>
            <TabsTrigger value="schedule-strength" className={TAB_CLASS}>
              Schedule Strength
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="waiver-intel" className="mt-0">
          <WaiverIntelligence />
        </TabsContent>
        <TabsContent value="projections" className="mt-0">
          <WeeklyProjections />
        </TabsContent>
        <TabsContent value="start-sit" className="mt-0">
          <StartSit />
        </TabsContent>
        <TabsContent value="waiver-wire" className="mt-0">
          <WaiverWire />
        </TabsContent>
        <TabsContent value="player-profiles" className="mt-0">
          <PlayerProfiles />
        </TabsContent>
        <TabsContent value="schedule-strength" className="mt-0">
          <StrengthOfSchedule />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
