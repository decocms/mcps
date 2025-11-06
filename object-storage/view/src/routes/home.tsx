import { createRoute, type RootRoute, Link } from "@tanstack/react-router";
import { UserButton } from "@/components/user-button";
import { Button } from "@/components/ui/button";
import { Folder, Upload, Download, Trash2, Database } from "lucide-react";

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
                Object Storage MCP
              </h1>
              <p className="text-sm text-slate-400">
                S3-compatible object storage management
              </p>
            </div>
          </div>

          <UserButton />
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Database className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-white mb-2">
                  Welcome to Object Storage
                </h2>
                <p className="text-sm text-slate-400 mb-4">
                  Manage your S3-compatible object storage with an intuitive
                  file browser interface. Upload, download, and organize your
                  files with ease.
                </p>
                <Link to="/files">
                  <Button>
                    <Folder className="w-4 h-4" />
                    Open File Browser
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="p-2 bg-green-500/10 rounded-lg w-fit mb-4">
                <Upload className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-base font-medium text-white mb-2">
                Upload Files
              </h3>
              <p className="text-sm text-slate-400">
                Upload files directly to your S3 bucket using presigned URLs for
                secure, efficient transfers.
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="p-2 bg-blue-500/10 rounded-lg w-fit mb-4">
                <Download className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-base font-medium text-white mb-2">
                Download Files
              </h3>
              <p className="text-sm text-slate-400">
                Generate temporary download links for your files without
                exposing credentials.
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="p-2 bg-red-500/10 rounded-lg w-fit mb-4">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-base font-medium text-white mb-2">
                Manage Files
              </h3>
              <p className="text-sm text-slate-400">
                Delete individual files or batch operations for efficient file
                management.
              </p>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-base font-medium text-white mb-3">
              Compatible Storage Providers
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "AWS S3",
                "Cloudflare R2",
                "MinIO",
                "DigitalOcean Spaces",
                "Wasabi",
                "Backblaze B2",
                "Google Cloud Storage",
              ].map((provider: string) => (
                <span
                  key={provider}
                  className="px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-full"
                >
                  {provider}
                </span>
              ))}
            </div>
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
