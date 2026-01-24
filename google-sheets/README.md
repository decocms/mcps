# Google Sheets MCP

MCP Server for Google Sheets API. Full-featured integration for reading, writing, formatting, and managing spreadsheet data programmatically.

## Features Overview

This MCP provides **40+ tools** covering almost all Google Sheets API capabilities:

| Category | Tools |
|----------|-------|
| Spreadsheet Management | 8 |
| Value Operations | 7 |
| Formatting & Styling | 10 |
| Dimension Operations | 10 |
| Charts & Visualization | 2 |
| Data Validation | 2 |
| Conditional Formatting | 2 |
| Protection | 2 |
| Filters | 5 |
| Analysis (Pivot, Named Ranges) | 3 |

## Spreadsheet Management

| Tool | Description |
|------|-------------|
| `create_spreadsheet` | Create a new spreadsheet |
| `get_spreadsheet` | Get spreadsheet metadata and sheet list |
| `add_sheet` | Add a new sheet/tab |
| `delete_sheet` | Delete a sheet |
| `rename_sheet` | Rename a sheet |
| `duplicate_sheet` | Copy an existing sheet |
| `freeze_rows` | Freeze rows at top (keep headers visible) |
| `freeze_columns` | Freeze columns at left |

## Value Operations

| Tool | Description |
|------|-------------|
| `read_range` | Read values from a range |
| `write_range` | Write values to a range |
| `append_rows` | Append rows to a table |
| `clear_range` | Clear values from a range |
| `batch_read` | Read multiple ranges at once |
| `batch_write` | Write to multiple ranges at once |
| `read_formulas` | Read formulas (not calculated values) |

## Formatting & Styling

| Tool | Description |
|------|-------------|
| `format_cells` | Apply text formatting (bold, colors, font size) |
| `auto_resize_columns` | Auto-fit column widths |
| `sort_range` | Sort data by column |
| `find_replace` | Find and replace text |
| `merge_cells` | Merge multiple cells |
| `unmerge_cells` | Unmerge cells |
| `set_borders` | Add borders to cells |
| `add_banding` | Add alternating row colors |
| `set_number_format` | Format numbers (currency, %, date) |
| `add_note` | Add a note/comment to a cell |

## Dimension Operations (Rows & Columns)

| Tool | Description |
|------|-------------|
| `insert_rows` | Insert rows at position |
| `insert_columns` | Insert columns at position |
| `delete_rows` | Delete rows |
| `delete_columns` | Delete columns |
| `move_rows` | Move rows to new position |
| `move_columns` | Move columns to new position |
| `hide_rows` | Hide/show rows |
| `hide_columns` | Hide/show columns |
| `resize_rows` | Set row height |
| `resize_columns` | Set column width |

## Charts & Visualization

| Tool | Description |
|------|-------------|
| `create_chart` | Create chart (bar, line, pie, column, area) |
| `delete_chart` | Delete a chart |

## Data Validation

| Tool | Description |
|------|-------------|
| `add_data_validation` | Add dropdowns, checkboxes, or constraints |
| `clear_data_validation` | Remove validation rules |

## Conditional Formatting

| Tool | Description |
|------|-------------|
| `add_conditional_formatting` | Add auto-formatting rules |
| `clear_conditional_formatting` | Remove formatting rules |

## Protection

| Tool | Description |
|------|-------------|
| `protect_range` | Protect cells from editing |
| `unprotect_range` | Remove protection |

## Filters

| Tool | Description |
|------|-------------|
| `set_basic_filter` | Add filter dropdowns to columns |
| `clear_basic_filter` | Remove filters |
| `create_filter_view` | Create saved filter view |
| `delete_filter_view` | Delete filter view |
| `add_slicer` | Add visual filter control |

## Analysis

| Tool | Description |
|------|-------------|
| `create_named_range` | Create named range for formulas |
| `delete_named_range` | Delete named range |
| `create_pivot_table` | Create pivot table for data analysis |

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

### Create a dropdown list

```json
{
  "tool": "add_data_validation",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "startRow": 1,
    "endRow": 100,
    "startColumn": 2,
    "endColumn": 3,
    "validationType": "ONE_OF_LIST",
    "values": ["Pending", "In Progress", "Done"],
    "showDropdown": true
  }
}
```

### Add conditional formatting (highlight values > 100)

```json
{
  "tool": "add_conditional_formatting",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "startRow": 1,
    "endRow": 50,
    "startColumn": 3,
    "endColumn": 4,
    "conditionType": "NUMBER_GREATER",
    "conditionValues": ["100"],
    "backgroundColor": { "red": 0.9, "green": 1, "blue": 0.9 }
  }
}
```

### Create a bar chart

```json
{
  "tool": "create_chart",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "chartType": "BAR",
    "startRow": 0,
    "endRow": 10,
    "startColumn": 0,
    "endColumn": 2,
    "positionRow": 0,
    "positionColumn": 5,
    "title": "Sales by Region"
  }
}
```

### Protect formula cells

```json
{
  "tool": "protect_range",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "startRow": 0,
    "endRow": 1,
    "startColumn": 0,
    "endColumn": 10,
    "description": "Header row - do not edit",
    "warningOnly": false
  }
}
```

### Create pivot table

```json
{
  "tool": "create_pivot_table",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sourceSheetId": 0,
    "sourceStartRow": 0,
    "sourceEndRow": 100,
    "sourceStartColumn": 0,
    "sourceEndColumn": 5,
    "destinationSheetId": 0,
    "destinationRow": 0,
    "destinationColumn": 10,
    "rows": [{ "sourceColumnOffset": 0, "showTotals": true }],
    "values": [{ "sourceColumnOffset": 2, "summarizeFunction": "SUM" }]
  }
}
```

### Freeze header row

```json
{
  "tool": "freeze_rows",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "frozenRowCount": 1
  }
}
```

### Add alternating colors (banding)

```json
{
  "tool": "add_banding",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "sheetId": 0,
    "startRow": 0,
    "endRow": 50,
    "startColumn": 0,
    "endColumn": 5,
    "headerColor": { "red": 0.2, "green": 0.5, "blue": 0.8 },
    "firstBandColor": { "red": 1, "green": 1, "blue": 1 },
    "secondBandColor": { "red": 0.95, "green": 0.95, "blue": 0.95 }
  }
}
```

### Read formulas (not calculated values)

```json
{
  "tool": "read_formulas",
  "input": {
    "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
    "range": "Sheet1!A1:D10"
  }
}
```

## A1 Notation Reference

| Notation | Description |
|----------|-------------|
| `A1` | Single cell A1 |
| `A1:B2` | Range from A1 to B2 |
| `A:A` | Entire column A |
| `1:1` | Entire row 1 |
| `A1:A` | Column A starting from row 1 |
| `Sheet1!A1:B2` | Range in specific sheet |

## Index Reference

All row/column indexes are **0-based**:
- Row 1 = index 0
- Column A = index 0
- Column B = index 1
- etc.

## Color Format

Colors use RGB values from 0 to 1:
```json
{
  "red": 0.2,
  "green": 0.5,
  "blue": 0.8
}
```

Common colors:
- White: `{ "red": 1, "green": 1, "blue": 1 }`
- Black: `{ "red": 0, "green": 0, "blue": 0 }`
- Red: `{ "red": 1, "green": 0, "blue": 0 }`
- Green: `{ "red": 0, "green": 1, "blue": 0 }`
- Blue: `{ "red": 0, "green": 0, "blue": 1 }`

## License

MIT
