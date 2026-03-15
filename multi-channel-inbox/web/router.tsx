import { createHashHistory } from "@tanstack/history";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useMcpHostContext, useMcpState } from "./context.tsx";
import InboxPage from "./tools/inbox/index.tsx";

const TOOL_PAGES: Record<string, React.ComponentType> = {
  inbox_list_conversations: InboxPage,
  inbox_get_conversation: InboxPage,
  inbox_update_conversation: InboxPage,
  inbox_stats: InboxPage,
  inbox_add_source: InboxPage,
  inbox_list_sources: InboxPage,
  inbox_remove_source: InboxPage,
  inbox_archive: InboxPage,
  inbox_reply: InboxPage,
  inbox_classify: InboxPage,
  inbox_summarize: InboxPage,
  inbox_suggest_reply: InboxPage,
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
