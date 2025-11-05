import { createRoute, type RootRoute } from "@tanstack/react-router";
import { UserButton } from "@/components/user-button";

function HomePage() {
  return (
    <div className="bg-slate-900 min-h-screen p-6">
      <div className="max-w-4xl mx-auto w-full">
        {/* Header with Login Button */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Deco"
              className="w-8 h-8 object-contain"
            />
            <div>
              <h1 className="text-xl font-semibold text-white">
                Deco MCP Template
              </h1>
              <p className="text-sm text-slate-400">
                React + Tailwind + Authentication
              </p>
            </div>
          </div>

          <UserButton />
        </div>

        {/* Main Content */}
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
            <h2 className="text-lg font-medium text-white mb-2">
              Welcome to Deco MCP
            </h2>
            <p className="text-sm text-slate-400">
              A simple template with authentication built-in
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/",
    component: HomePage,
    getParentRoute: () => parentRoute,
  });
