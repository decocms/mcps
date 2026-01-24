/**
 * Utility functions for Google Sheets operations
 */

/**
 * Convert a column number to letter notation (1 -> "A", 27 -> "AA")
 */
export function columnNumberToLetter(num: number): string {
  let letter = "";
  let n = num;

  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - 1) / 26);
  }

  return letter;
}

/**
 * Convert a column letter to number ("A" -> 1, "AA" -> 27)
 */
export function columnLetterToNumber(letters: string): number {
  return letters
    .toUpperCase()
    .split("")
    .reduce((r, c) => r * 26 + c.charCodeAt(0) - 64, 0);
}

/**
 * Check if a cell value is considered "filled" (non-empty)
 */
function isCellFilled(cell: unknown): boolean {
  if (cell === null || cell === undefined) return false;
  if (typeof cell === "string") return cell.trim() !== "";
  return true;
}

/**
 * Calculate the actual data range from a 2D array of values
 * Returns the range string and filled cell count
 */
export function calculateDataRange(
  values: unknown[][],
  sheetTitle: string,
): { range: string; filledCells: number } | null {
  if (!values || values.length === 0) return null;

  let maxRow = 0;
  let maxCol = 0;
  let filledCount = 0;

  for (let rowIndex = 0; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex];
    if (!row) continue;

    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const cell = row[colIndex];
      if (isCellFilled(cell)) {
        maxRow = Math.max(maxRow, rowIndex + 1);
        maxCol = Math.max(maxCol, colIndex + 1);
        filledCount++;
      }
    }
  }

  if (maxRow === 0 || maxCol === 0) return null;

  const endColumn = columnNumberToLetter(maxCol);
  const range = `${sheetTitle}!A1:${endColumn}${maxRow}`;

  return {
    range,
    filledCells: filledCount,
  };
}

/**
 * Process header row and return structured header information
 */
export function processHeaders(headerRow: unknown[]): {
  labels: Record<string, string>;
  headerMap: Record<string, number>;
  headerValues: string[];
} {
  const labels: Record<string, string> = {};
  const headerMap: Record<string, number> = {};
  const headerValues: string[] = [];

  if (!headerRow || headerRow.length === 0) {
    return { labels, headerMap, headerValues };
  }

  headerRow.forEach((cell, index) => {
    if (cell !== null && cell !== undefined && String(cell).trim() !== "") {
      const colNum = index + 1;
      const headerName = String(cell);
      labels[`Col${colNum}`] = headerName;
      headerMap[headerName] = index;
      headerValues.push(headerName);
    }
  });

  return { labels, headerMap, headerValues };
}
