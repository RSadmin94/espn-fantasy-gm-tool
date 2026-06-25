/**
 * UI layout primitives — authoritative surfaces for Phase 2B+ page migrations.
 * Import from here when migrating consumers off duplicated PANEL / PAGEBG constants.
 */
export { IntelPanel, type IntelPanelAccent, type IntelPanelProps, type IntelPanelVariant } from "./IntelPanel";
export {
  IntelPageShell,
  type IntelPageBackground,
  type IntelPageShellProps,
  type IntelPageWidth,
} from "./IntelPageShell";
export {
  CinematicMetaPill,
  CinematicPageHeader,
  type CinematicPageHeaderProps,
} from "./CinematicPageHeader";
export {
  EmptyState,
  PageError,
  PageLoading,
  ProGate,
  SectionLoading,
} from "./PageStates";
export { TabBar, type TabBarItem, type TabBarLayout, type TabBarProps, type TabBarTone } from "./TabBar";
