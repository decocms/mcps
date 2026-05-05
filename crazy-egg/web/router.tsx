import { createHashHistory } from "@tanstack/history";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useMcpHostContext, useMcpState } from "./context.tsx";
import SnapshotDetailPage from "./tools/get-snapshot/index.tsx";
import TrafficPage from "./tools/get-traffic/index.tsx";
import AbTestsPage from "./tools/list-ab-tests/index.tsx";
import FunnelsPage from "./tools/list-funnels/index.tsx";
import RecordingsPage from "./tools/list-recordings/index.tsx";
import SnapshotsPage from "./tools/list-snapshots/index.tsx";
import SurveysPage from "./tools/list-surveys/index.tsx";
import TrackConversionPage from "./tools/track-conversion/index.tsx";
import VerifyCredentialsPage from "./tools/verify-credentials/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
  crazy_egg_track_conversion: TrackConversionPage,
  crazy_egg_verify_credentials: VerifyCredentialsPage,
  crazy_egg_list_snapshots: SnapshotsPage,
  crazy_egg_get_snapshot: SnapshotDetailPage,
  crazy_egg_list_recordings: RecordingsPage,
  crazy_egg_list_ab_tests: AbTestsPage,
  crazy_egg_list_funnels: FunnelsPage,
  crazy_egg_list_surveys: SurveysPage,
  crazy_egg_get_traffic: TrafficPage,
};

function ToolRouter() {
  const { toolName } = useMcpState();

  if (!toolName) {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Connecting to host...</span>
        </div>
      </div>
    );
  }

  const Page = TOOL_PAGES[toolName];

  if (!Page) {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <p className="text-sm text-destructive">Unknown tool: {toolName}</p>
      </div>
    );
  }

  return <Page />;
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ToolRouter,
});

const routeTree = rootRoute.addChildren([indexRoute]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}

function RootLayout() {
  const hostContext = useMcpHostContext();
  const insets = hostContext?.safeAreaInsets;

  return (
    <div
      style={
        insets
          ? {
              paddingTop: `${insets.top}px`,
              paddingRight: `${insets.right}px`,
              paddingBottom: `${insets.bottom}px`,
              paddingLeft: `${insets.left}px`,
            }
          : undefined
      }
    >
      <Outlet />
    </div>
  );
}
