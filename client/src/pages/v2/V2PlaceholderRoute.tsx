import { getV2DestinationByRoute } from "@/lib/v2Navigation";
import { V2PlaceholderPage } from "@/components/V2PlaceholderPage";
import { V2 } from "@/lib/v2Copy";

type V2PlaceholderRouteProps = {
  route: string;
};

export function V2PlaceholderRoute({ route }: V2PlaceholderRouteProps) {
  const destination =
    getV2DestinationByRoute(route) ??
    getV2DestinationByRoute(route.replace(/\/:[^/]+$/g, "")) ??
    getV2DestinationByRoute(route.replace(/\/[^/]+$/, ""));
  if (!destination) {
    return <V2PlaceholderPage title="Destination" domain="unknown" />;
  }
  return (
    <V2PlaceholderPage
      title={destination.label}
      icon={destination.icon}
      domain={V2.navGroups[destination.navCategory]}
    />
  );
}
