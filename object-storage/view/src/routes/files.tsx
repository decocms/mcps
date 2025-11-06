/**
 * File Browser View
 *
 * A modern file browser interface for S3-compatible object storage.
 * Features include listing, uploading, downloading, and deleting files.
 */
import { createRoute, type RootRoute } from "@tanstack/react-router";
import { UserButton } from "@/components/user-button";
import { Button } from "@/components/ui/button";
import {
  useDeleteObject,
  useDeleteObjects,
  useDownloadFile,
  useListObjects,
  useUploadFile,
} from "@/hooks/useStorage";
import { useState, useRef } from "react";
import {
  Download,
  Upload,
  Trash2,
  File,
  Folder,
  ChevronRight,
  Home,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function FileBrowserPage() {
  const [prefix, setPrefix] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [continuationToken, setContinuationToken] = useState<
    string | undefined
  >();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useListObjects({
    prefix: prefix || undefined,
    continuationToken,
  });

  const uploadFile = useUploadFile();
  const downloadFile = useDownloadFile();
  const deleteObject = useDeleteObject();
  const deleteObjects = useDeleteObjects();

  // Extract folders and files from the current prefix
  const folders = new Set<string>();
  const files: typeof data.objects = [];

  if (data?.objects) {
    for (const obj of data.objects) {
      const relativePath = prefix ? obj.key.slice(prefix.length) : obj.key;
      const slashIndex = relativePath.indexOf("/");

      if (slashIndex !== -1) {
        // This is inside a folder
        const folderName = relativePath.slice(0, slashIndex);
        folders.add(folderName);
      } else if (relativePath) {
        // This is a file in current directory
        files.push(obj);
      }
    }
  }

  const handleNavigateFolder = (folderName: string) => {
    setPrefix(prefix + folderName + "/");
    setContinuationToken(undefined);
    setSelectedFiles(new Set());
  };

  const handleNavigateUp = () => {
    const parts = prefix.split("/").filter(Boolean);
    parts.pop();
    setPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
    setContinuationToken(undefined);
    setSelectedFiles(new Set());
  };

  const handleNavigateHome = () => {
    setPrefix("");
    setContinuationToken(undefined);
    setSelectedFiles(new Set());
  };

  const handleFileSelect = (key: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f: { key: string }) => f.key)));
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    for (const file of Array.from(uploadedFiles) as File[]) {
      const key = prefix + file.name;
      try {
        await uploadFile.mutateAsync({ key, file });
        toast.success(`Uploaded ${file.name}`);
      } catch (error) {
        toast.error(
          `Failed to upload ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (key: string, fileName: string) => {
    try {
      await downloadFile.mutateAsync({ key });
      toast.success(`Downloading ${fileName}`);
    } catch (error) {
      toast.error(
        `Failed to download ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleDelete = async (key: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) return;

    try {
      await deleteObject.mutateAsync(key);
      toast.success(`Deleted ${fileName}`);
      setSelectedFiles(new Set());
    } catch (error) {
      toast.error(
        `Failed to delete ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    if (
      !confirm(`Are you sure you want to delete ${selectedFiles.size} file(s)?`)
    )
      return;

    try {
      const result = await deleteObjects.mutateAsync(Array.from(selectedFiles));
      toast.success(`Deleted ${result.deleted.length} file(s)`);
      if (result.errors.length > 0) {
        toast.error(`Failed to delete ${result.errors.length} file(s)`);
      }
      setSelectedFiles(new Set());
    } catch (error) {
      toast.error(
        `Failed to delete files: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  const breadcrumbs = prefix
    .split("/")
    .filter(Boolean)
    .map((part, index, arr) => ({
      name: part,
      path: arr.slice(0, index + 1).join("/") + "/",
    }));

  return (
    <div className="bg-slate-900 min-h-screen">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Deco"
              className="w-8 h-8 object-contain"
            />
            <div>
              <h1 className="text-xl font-semibold text-white">
                Object Storage
              </h1>
              <p className="text-sm text-slate-400">
                S3-compatible file browser
              </p>
            </div>
          </div>
          <UserButton />
        </div>

        {/* Toolbar */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNavigateHome}
                className="text-slate-300 hover:text-white"
              >
                <Home className="w-4 h-4" />
              </Button>
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPrefix(crumb.path);
                      setContinuationToken(undefined);
                      setSelectedFiles(new Set());
                    }}
                    className="text-slate-300 hover:text-white"
                  >
                    {crumb.name}
                  </Button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="default"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadFile.isPending}
              >
                {uploadFile.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload
              </Button>
              {selectedFiles.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteObjects.isPending}
                >
                  {deleteObjects.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete ({selectedFiles.size})
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          {error ? (
            <div className="p-8 text-center text-red-400">
              Error loading files: {error.message}
            </div>
          ) : isLoading ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              Loading files...
            </div>
          ) : (
            <>
              {/* Table Header */}
              {(folders.size > 0 || files.length > 0) && (
                <div className="border-b border-slate-700">
                  <div className="grid grid-cols-[auto,1fr,120px,180px,100px] gap-4 px-4 py-3 text-sm font-medium text-slate-400">
                    <input
                      type="checkbox"
                      checked={
                        files.length > 0 && selectedFiles.size === files.length
                      }
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded"
                    />
                    <div>Name</div>
                    <div>Size</div>
                    <div>Modified</div>
                    <div>Actions</div>
                  </div>
                </div>
              )}

              {/* Table Body */}
              <div className="divide-y divide-slate-700">
                {/* Parent Directory Link */}
                {prefix && (
                  <div className="grid grid-cols-[auto,1fr,120px,180px,100px] gap-4 px-4 py-3 hover:bg-slate-700/50 transition-colors">
                    <div className="w-4" />
                    <button
                      onClick={handleNavigateUp}
                      className="flex items-center gap-2 text-slate-300 hover:text-white text-left"
                    >
                      <Folder className="w-5 h-5 text-blue-400" />
                      <span>..</span>
                    </button>
                    <div />
                    <div />
                    <div />
                  </div>
                )}

                {/* Folders */}
                {Array.from(folders).map((folder) => (
                  <div
                    key={folder}
                    className="grid grid-cols-[auto,1fr,120px,180px,100px] gap-4 px-4 py-3 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="w-4" />
                    <button
                      onClick={() => handleNavigateFolder(folder)}
                      className="flex items-center gap-2 text-slate-300 hover:text-white text-left"
                    >
                      <Folder className="w-5 h-5 text-blue-400" />
                      <span>{folder}</span>
                    </button>
                    <div className="text-slate-500 text-sm">—</div>
                    <div className="text-slate-500 text-sm">—</div>
                    <div />
                  </div>
                ))}

                {/* Files */}
                {files.map(
                  (file: {
                    key: string;
                    size: number;
                    lastModified: string;
                    etag: string;
                  }) => {
                    const fileName = file.key.split("/").pop() || file.key;
                    const isSelected = selectedFiles.has(file.key);

                    return (
                      <div
                        key={file.key}
                        className={`grid grid-cols-[auto,1fr,120px,180px,100px] gap-4 px-4 py-3 hover:bg-slate-700/50 transition-colors ${isSelected ? "bg-slate-700/30" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleFileSelect(file.key)}
                          className="w-4 h-4 rounded"
                        />
                        <div className="flex items-center gap-2 text-slate-300 min-w-0">
                          <File className="w-5 h-5 text-slate-400 shrink-0" />
                          <span className="truncate">{fileName}</span>
                        </div>
                        <div className="text-slate-400 text-sm">
                          {formatBytes(file.size)}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {formatDate(file.lastModified)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(file.key, fileName)}
                            disabled={downloadFile.isPending}
                            className="w-8 h-8"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(file.key, fileName)}
                            disabled={deleteObject.isPending}
                            className="w-8 h-8 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  },
                )}

                {/* Empty State */}
                {folders.size === 0 && files.length === 0 && (
                  <div className="p-12 text-center text-slate-400">
                    <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium mb-2">No files found</p>
                    <p className="text-sm">Upload files to get started</p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {data?.isTruncated && (
                <div className="border-t border-slate-700 px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setContinuationToken(data.nextContinuationToken)
                    }
                  >
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default (parentRoute: RootRoute<any>) =>
  createRoute({
    path: "/files",
    component: FileBrowserPage,
    getParentRoute: () => parentRoute,
  });
