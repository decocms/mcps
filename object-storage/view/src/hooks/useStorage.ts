/**
 * TanStack Query hooks for object storage operations.
 *
 * These hooks provide React Query wrappers around the storage MCP tools,
 * enabling efficient data fetching, caching, and mutation handling.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/rpc-logged";

/**
 * Hook to list objects in the bucket with pagination support
 */
export function useListObjects(params?: {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}) {
  return useQuery({
    queryKey: ["objects", params?.prefix, params?.continuationToken],
    queryFn: async () => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.LIST_OBJECTS({
        prefix: params?.prefix,
        maxKeys: params?.maxKeys,
        continuationToken: params?.continuationToken,
      });
    },
  });
}

/**
 * Hook to get object metadata (HEAD operation)
 */
export function useObjectMetadata(key: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["objectMetadata", key],
    queryFn: async () => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.GET_OBJECT_METADATA({ key });
    },
    enabled: enabled && !!key,
  });
}

/**
 * Hook to generate a presigned URL for downloading an object
 */
export function useGetPresignedUrl() {
  return useMutation({
    mutationFn: async (params: { key: string; expiresIn?: number }) => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.GET_PRESIGNED_URL(params);
    },
  });
}

/**
 * Hook to generate a presigned URL for uploading an object
 */
export function usePutPresignedUrl() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      key: string;
      expiresIn?: number;
      contentType?: string;
    }) => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.PUT_PRESIGNED_URL(params);
    },
    onSuccess: () => {
      // Invalidate objects list after successful upload URL generation
      // Note: The actual upload happens outside this hook via fetch
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    },
  });
}

/**
 * Hook to delete a single object
 */
export function useDeleteObject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (key: string) => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.DELETE_OBJECT({ key });
    },
    onSuccess: () => {
      // Invalidate objects list after successful deletion
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    },
  });
}

/**
 * Hook to delete multiple objects in batch
 */
export function useDeleteObjects() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keys: string[]) => {
      // @ts-expect-error - Types will be available after running `bun run gen`
      return await client.DELETE_OBJECTS({ keys });
    },
    onSuccess: () => {
      // Invalidate objects list after successful batch deletion
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    },
  });
}

/**
 * Helper hook to upload a file using presigned URL
 */
export function useUploadFile() {
  const queryClient = useQueryClient();
  const putPresignedUrl = usePutPresignedUrl();

  return useMutation({
    mutationFn: async (params: {
      key: string;
      file: File;
      contentType?: string;
    }) => {
      // Step 1: Get presigned URL
      const { url } = await putPresignedUrl.mutateAsync({
        key: params.key,
        contentType: params.contentType || params.file.type,
      });

      // Step 2: Upload file using presigned URL
      const response = await fetch(url, {
        method: "PUT",
        body: params.file,
        headers: {
          "Content-Type": params.contentType || params.file.type,
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      return { key: params.key };
    },
    onSuccess: () => {
      // Invalidate objects list after successful upload
      queryClient.invalidateQueries({ queryKey: ["objects"] });
    },
  });
}

/**
 * Helper hook to download a file using presigned URL
 */
export function useDownloadFile() {
  const getPresignedUrl = useGetPresignedUrl();

  return useMutation({
    mutationFn: async (params: { key: string; expiresIn?: number }) => {
      // Get presigned URL
      const { url } = await getPresignedUrl.mutateAsync(params);

      // Open URL in new tab for download
      window.open(url, "_blank");

      return { key: params.key, url };
    },
  });
}
