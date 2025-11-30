import { StrictMode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import {
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
  Link,
} from "@tanstack/react-router";
import HomePage from "./routes/home.tsx";
import WorkflowsPage from "./routes/workflows.tsx";
import { workflowRoute } from "./routes/workflow.tsx";
import { executionsRoute } from "./routes/executions.tsx";
import { Toaster } from "sonner";
import { Icon } from "@decocms/ui/components/icon.tsx";

import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Spinner } from "@decocms/ui/components/spinner.tsx";

const Layout = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-6xl mx-auto w-full px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-white hover:text-slate-200 transition-colors"
          >
            <Icon name="account_tree" size={24} />
            <h1 className="text-xl font-semibold">Workflow Engine</h1>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/workflows"
              className="text-sm text-slate-300 hover:text-white transition-colors"
            >
              Workflows
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-slate-900 border-t border-slate-800">
        <div className="max-w-6xl mx-auto w-full px-4 py-3">
          <p className="text-sm text-slate-400">© 2025 Workflow Engine</p>
        </div>
      </footer>
    </div>
  );
};

const rootRoute = createRootRoute({
  component: Layout,
});

const workflowsRoute = WorkflowsPage(rootRoute);
const workflowRouteInstance = workflowRoute(rootRoute);
const executionsRouteInstance = executionsRoute(rootRoute);
const routeTree = rootRoute.addChildren([
  HomePage(rootRoute),
  workflowsRoute,
  workflowRouteInstance,
  executionsRouteInstance,
]);

const queryClient = new QueryClient();

type LazyComp<P> = Promise<{
  default: React.ComponentType<P>;
}>;
export const wrapWithUILoadingFallback = <P,>(
  lazyComp: LazyComp<P>,
): LazyComp<P> =>
  lazyComp.then(({ default: Comp }) => ({
    default: (p: P) => (
      <Suspense
        fallback={
          <div className="h-[calc(100vh-48px)] w-full grid place-items-center">
            <Spinner size="sm" />
          </div>
        }
      >
        <Comp {...(p as JSX.IntrinsicAttributes & P)} />
      </Suspense>
    ),
  }));

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
}
