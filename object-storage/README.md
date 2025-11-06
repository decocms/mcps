# Object Storage MCP

A Model Context Protocol (MCP) server that provides S3-compatible object storage operations. This MCP works with any S3-compatible storage provider including AWS S3, Cloudflare R2, MinIO, and more.

## Features

- 🔐 **Private tools** requiring user authentication
- 📦 **S3-compatible** - Works with AWS S3, R2, MinIO, and other S3-compatible storage
- 🔗 **Presigned URLs** - Generate temporary URLs for upload/download without exposing credentials
- 📄 **Pagination** - Handle large buckets with continuation tokens
- 🗑️ **Batch operations** - Delete up to 1000 objects in a single request
- 🖥️ **File browser UI** - React-based file browser with upload/download capabilities

## Configuration

When installing this MCP, you'll need to configure the following state parameters:

### Required Configuration

- **`region`** (string) - AWS region (e.g., "us-east-1"). Use "auto" for R2 and GCS.
- **`accessKeyId`** (string) - AWS access key ID or equivalent for S3-compatible storage.
- **`secretAccessKey`** (string) - AWS secret access key or equivalent.
- **`bucketName`** (string) - Default bucket name for operations.

### Optional Configuration

- **`endpoint`** (string) - Custom S3 endpoint URL. Leave empty for AWS S3.
- **`defaultPresignedUrlExpiration`** (number) - Default expiration for presigned URLs in seconds (default: 3600).

## Storage Provider Examples

### AWS S3 (Default)

```json
{
  "region": "us-east-1",
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "bucketName": "my-bucket"
}
```

### Cloudflare R2

```json
{
  "endpoint": "https://<account-id>.r2.cloudflarestorage.com",
  "region": "auto",
  "accessKeyId": "your-r2-access-key-id",
  "secretAccessKey": "your-r2-secret-access-key",
  "bucketName": "my-r2-bucket"
}
```

### MinIO

```json
{
  "endpoint": "https://minio.example.com",
  "region": "us-east-1",
  "accessKeyId": "minioadmin",
  "secretAccessKey": "minioadmin",
  "bucketName": "my-bucket"
}
```

### DigitalOcean Spaces

```json
{
  "endpoint": "https://nyc3.digitaloceanspaces.com",
  "region": "nyc3",
  "accessKeyId": "your-spaces-key",
  "secretAccessKey": "your-spaces-secret",
  "bucketName": "my-space"
}
```

### Google Cloud Storage (Interoperability Mode)

**Note:** GCS requires HMAC keys (not default service account keys). Generate HMAC keys in the GCS console.

```json
{
  "endpoint": "https://storage.googleapis.com",
  "region": "auto",
  "accessKeyId": "GOOG1E...",
  "secretAccessKey": "your-gcs-secret",
  "bucketName": "my-gcs-bucket"
}
```

### Azure Blob Storage (S3-Compatible Endpoints Only)

**Note:** Azure Blob Storage requires S3-compatible endpoints. Native Azure Blob Storage API is not supported.

```json
{
  "endpoint": "https://<storage-account>.blob.core.windows.net",
  "region": "auto",
  "accessKeyId": "your-azure-access-key",
  "secretAccessKey": "your-azure-secret",
  "bucketName": "my-container"
}
```

## Available Tools

All tools require authentication and use the configured state settings.

### LIST_OBJECTS

List objects in the bucket with pagination support.

**Input:**
- `prefix` (optional string) - Filter objects by prefix (e.g., "folder/" for folder contents)
- `maxKeys` (optional number) - Maximum number of keys to return (default: 1000)
- `continuationToken` (optional string) - Token for pagination from previous response

**Output:**
- `objects` (array) - Array of objects with `key`, `size`, `lastModified`, `etag`
- `nextContinuationToken` (optional string) - Token for fetching next page
- `isTruncated` (boolean) - Whether there are more results available

### GET_OBJECT_METADATA

Get metadata for an object without downloading it (HEAD operation).

**Input:**
- `key` (string) - Object key/path to get metadata for

**Output:**
- `contentType` (optional string) - MIME type of the object
- `contentLength` (number) - Size of the object in bytes
- `lastModified` (string) - Last modified timestamp
- `etag` (string) - Entity tag for the object
- `metadata` (optional object) - Custom metadata key-value pairs

### GET_PRESIGNED_URL

Generate a presigned URL for downloading an object.

**Input:**
- `key` (string) - Object key/path to generate URL for
- `expiresIn` (optional number) - URL expiration time in seconds

**Output:**
- `url` (string) - Presigned URL for downloading the object
- `expiresIn` (number) - Expiration time in seconds that was used

### PUT_PRESIGNED_URL

Generate a presigned URL for uploading an object.

**Input:**
- `key` (string) - Object key/path for the upload
- `expiresIn` (optional number) - URL expiration time in seconds
- `contentType` (optional string) - MIME type for the object being uploaded

**Output:**
- `url` (string) - Presigned URL for uploading the object
- `expiresIn` (number) - Expiration time in seconds that was used

### DELETE_OBJECT

Delete a single object from the bucket.

**Input:**
- `key` (string) - Object key/path to delete

**Output:**
- `success` (boolean) - Whether the deletion was successful
- `key` (string) - The key that was deleted

### DELETE_OBJECTS

Delete multiple objects in a single batch operation (max 1000 objects).

**Input:**
- `keys` (array of strings) - Array of object keys/paths to delete (max 1000)

**Output:**
- `deleted` (array of strings) - Array of successfully deleted keys
- `errors` (array) - Array of errors for failed deletions with `key` and `message`

## Presigned URL Workflow

This MCP uses presigned URLs to avoid transferring large files through the MCP protocol:

1. **Upload Flow:**
   - Call `PUT_PRESIGNED_URL` to get a temporary upload URL
   - Use the URL to upload the file directly to storage (via HTTP PUT)
   - The URL expires after the configured time

2. **Download Flow:**
   - Call `GET_PRESIGNED_URL` to get a temporary download URL
   - Use the URL to download the file directly from storage
   - The URL expires after the configured time

This approach is more efficient than base64 encoding and provides better performance for large files.

## Development

```bash
# Install dependencies
bun install

# Generate types
bun run gen

# Run development server
bun run dev

# Build for production
bun run build

# Type check
bun run check

# Deploy
bun run deploy
```

## Compatibility Notes

### Fully Compatible Storage Providers

These providers work out-of-the-box with S3-compatible APIs:

- ✅ AWS S3
- ✅ Cloudflare R2
- ✅ MinIO
- ✅ DigitalOcean Spaces
- ✅ Wasabi
- ✅ Backblaze B2 (with S3-compatible API)
- ✅ Google Cloud Storage (with HMAC keys and interoperability mode)

### Partially Compatible

- ⚠️ Azure Blob Storage - Requires S3-compatible endpoints, not the native Azure Blob Storage API

### Not Compatible

- ❌ Native Azure Blob Storage API (requires Azure SDK)

## License

MIT
