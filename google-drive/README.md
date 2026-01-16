# Google Drive MCP 
 
MCP Server for Google Drive API. Manage files, folders, and permissions.

## Features

### File Operations
- **list_files** - List files with query filtering
- **get_file** - Get file metadata
- **create_file** - Create new files (empty)
- **update_file** - Update metadata, move files
- **delete_file** - Permanently delete files
- **copy_file** - Create file copies
- **search_files** - Search with Drive query syntax

### Folder Operations
- **create_folder** - Create new folders
- **list_folder_contents** - List folder contents

### Permissions & Sharing
- **list_permissions** - List file permissions
- **create_permission** - Share with users/groups
- **delete_permission** - Remove sharing
- **share_file** - Quick share by email
- **get_sharing_link** - Get/create sharing links

## Setup

### 1. Enable Google Drive API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Drive API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### List recent files

```json
{
  "tool": "list_files",
  "input": {
    "orderBy": "modifiedTime desc",
    "pageSize": 10
  }
}
```

### Search for PDFs

```json
{
  "tool": "search_files",
  "input": {
    "query": "mimeType='application/pdf' and name contains 'report'"
  }
}
```

### Create a folder

```json
{
  "tool": "create_folder",
  "input": {
    "name": "Project Documents",
    "parentId": "1abc123xyz"
  }
}
```

### Share a file

```json
{
  "tool": "share_file",
  "input": {
    "fileId": "1abc123xyz",
    "email": "colleague@company.com",
    "role": "writer",
    "message": "Here's the document you requested"
  }
}
```

### Get public link

```json
{
  "tool": "get_sharing_link",
  "input": {
    "fileId": "1abc123xyz",
    "makePublic": true
  }
}
```

## Drive Query Syntax

| Query | Description |
|-------|-------------|
| `name contains 'report'` | Files with 'report' in name |
| `mimeType='application/pdf'` | PDF files |
| `'folderId' in parents` | Files in folder |
| `trashed=true` | Trashed files |
| `starred=true` | Starred files |
| `fullText contains 'budget'` | Content search |

## License

MIT

