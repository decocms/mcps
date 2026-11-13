import { createMemoryHistory } from "@tanstack/history";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Spinner } from "@decocms/ui/components/spinner.tsx";
import { useEffect } from "react";
import { useMcpApp, useMcpHostContext, useMcpState } from "./context.tsx";
import StillEditorPage from "./tools/still-editor/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
  still_editor: StillEditorPage,
};

function ToolRouter() {
  const { toolName } = useMcpState();

  if (!toolName) {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <Spinner size="sm" label="Conectando" />
      </div>
    );
  }

  const Page = TOOL_PAGES[toolName];

  if (!Page) {
    return (
      <div className="flex items-center justify-center min-h-dvh p-6">
        <p className="text-sm text-destructive">
          Ferramenta desconhecida: {toolName}
        </p>
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
  validateSearch: (search: Record<string, unknown>): { link?: string } =>
    typeof search.link === "string" ? { link: search.link } : {},
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
