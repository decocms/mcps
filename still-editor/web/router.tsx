import { createMemoryHistory } from "@tanstack/history";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useMcpApp, useMcpHostContext, useMcpState } from "./context.tsx";
import HelloPage from "./tools/hello/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
  hello_world: HelloPage,
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

const history = createMemoryHistory();
const router = createRouter({ routeTree, history });

export function AppRouter() {
  const app = useMcpApp();
  const { toolInput } = useMcpState<{ _route?: string }>();
  const route = toolInput?._route;

  useEffect(() => {
    if (route) history.replace(route);
  }, [route]);

  useEffect(() => {
    if (app?.getHostVersion()?.name !== "Studio") return;
    return router.subscribe("onResolved", ({ fromLocation, toLocation }) => {
      if (!fromLocation) return;
      const args = encodeURIComponent(
        JSON.stringify({ _route: toLocation.href }),
      );
      app.sendMessage({
        role: "user",
        content: [
          {
            type: "resource_link",
            name: "navigate",
            uri: `studio://navigate?args=${args}`,
          },
        ],
      });
    });
  }, [app]);

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
