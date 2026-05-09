// FILE: client/src/pages/hubs/WaiverLab.tsx
import AppLayout from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StartSit from "@/pages/StartSit";
import WaiverWire from "@/pages/WaiverWire";
import PlayerProfiles from "@/pages/PlayerProfiles";
import StrengthOfSchedule from "@/pages/StrengthOfSchedule";

export default function WaiverLab() {
  return (
    <AppLayout title="Waiver Lab" subtitle="Weekly decisions powered by real usage data">
      <Tabs defaultValue="start-sit" className="w-full">
        <div className="px-6 pt-4 border-b border-border">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
        <TabsTrigger value="start-sit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Start/Sit
        </TabsTrigger>
        <TabsTrigger value="waiver-wire" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Waiver Wire
        </TabsTrigger>
        <TabsTrigger value="player-profiles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Player Profiles
        </TabsTrigger>
        <TabsTrigger value="schedule-strength" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 pb-3 text-sm font-medium">
          Schedule Strength
        </TabsTrigger>
          </TabsList>
        </div>
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
