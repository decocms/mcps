# Google Sheets MCP 

MCP Server for Google Sheets API. Read, write, and manage spreadsheet data programmatically.

## Features

### Spreadsheet Management
- **create_spreadsheet** - Create a new spreadsheet
- **get_spreadsheet** - Get spreadsheet metadata and sheet list
- **add_sheet** - Add a new sheet/tab
- **delete_sheet** - Delete a sheet
- **rename_sheet** - Rename a sheet

### Value Operations
- **read_range** - Read values from a range
- **write_range** - Write values to a range
- **append_rows** - Append rows to a table
- **clear_range** - Clear values from a range
- **batch_read** - Read multiple ranges at once
- **batch_write** - Write to multiple ranges at once

### Formatting & Data
- **format_cells** - Apply formatting (bold, colors, font size)
- **auto_resize_columns** - Auto-fit column widths
- **sort_range** - Sort data by column
- **find_replace** - Find and replace text

## Setup

### 1. Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google Sheets API**
3. Configure OAuth 2.0 credentials

### 2. Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Usage Examples

### Read data from a range

```json
{
  "tool": "read_range",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "range": "Sheet1!A1:D10"
  }
}
```

### Write data to cells

```json
{
  "tool": "write_range",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "range": "Sheet1!A1",
    "values": [
      ["Name", "Age", "City"],
      ["John", 30, "NYC"],
      ["Jane", 25, "LA"]
    ]
  }
}
```

### Append rows to a table

```json
{
  "tool": "append_rows",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "range": "Sheet1",
    "values": [
      ["Bob", 35, "Chicago"],
      ["Alice", 28, "Boston"]
    ]
  }
}
```

### Format header row

```json
{
  "tool": "format_cells",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "startRow": 0,
    "endRow": 1,
    "startColumn": 0,
    "endColumn": 3,
    "bold": true,
    "backgroundColor": { "red": 0.2, "green": 0.5, "blue": 0.8 },
    "textColor": { "red": 1, "green": 1, "blue": 1 }
  }
}
```

## A1 Notation

| Notation | Description |
|----------|-------------|
| `A1` | Single cell A1 |
| `A1:B2` | Range from A1 to B2 |
| `A:A` | Entire column A |
| `1:1` | Entire row 1 |
| `A1:A` | Column A starting from row 1 |
| `Sheet1!A1:B2` | Range in specific sheet |

## License

MIT

