import type { AirportsMap } from "./types";

/**
 * CSV source for airport data
 */
const AIRPORTS_CSV_URL =
  "https://raw.githubusercontent.com/mborsetti/airportsdata/refs/heads/main/airportsdata/airports.csv";

/**
 * In-memory cache for airports data
 */
let airportsCache: AirportsMap | null = null;
let lastFetchTime: number | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Parse CSV text into airport data
 */
function parseAirportsCsv(csvText: string): AirportsMap {
  const airports: AirportsMap = new Map();
  const lines = csvText.split("\n");

  // Find header indices - parse header with CSV parser to handle quotes
  const headerLine = lines[0] ?? "";
  const header = parseCSVLine(headerLine).map((h) => h.trim().toLowerCase());
  const iataIdx = header.indexOf("iata");
  const nameIdx = header.indexOf("name");
  const cityIdx = header.indexOf("city");
  const countryIdx = header.indexOf("country");

  if (iataIdx === -1 || nameIdx === -1) {
    console.error(
      "Could not find required columns in CSV. Headers found:",
      header.slice(0, 6),
    );
    return airports;
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;

    // Simple CSV parsing (handles quoted fields)
    const fields = parseCSVLine(line);
    const iata = fields[iataIdx]?.trim() ?? "";
    const name = fields[nameIdx]?.trim() ?? "";
    const city = cityIdx >= 0 ? (fields[cityIdx]?.trim() ?? "") : "";
    const country = countryIdx >= 0 ? (fields[countryIdx]?.trim() ?? "") : "";

    // Only store entries with valid IATA codes (3 uppercase letters)
    if (iata && iata.length === 3 && /^[A-Z]{3}$/.test(iata)) {
      const fullName = city
        ? `${name}, ${city}, ${country}`
        : `${name}, ${country}`;
      airports.set(iata, fullName);
    }
  }

  return airports;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Fetch airports data from CSV source
 */
export async function fetchAirports(): Promise<AirportsMap> {
  // Check cache
  if (
    airportsCache &&
    lastFetchTime &&
    Date.now() - lastFetchTime < CACHE_TTL_MS
  ) {
    return airportsCache;
  }

  try {
    const response = await fetch(AIRPORTS_CSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch airports: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    airportsCache = parseAirportsCsv(csvText);
    lastFetchTime = Date.now();

    console.log(`Loaded ${airportsCache.size} airports from CSV`);
    return airportsCache;
  } catch (error) {
    console.error("Error fetching airports:", error);

    // Return cached data if available, even if stale
    if (airportsCache) {
      return airportsCache;
    }

    // Return empty map if no cache available
    return new Map();
  }
}

/**
 * Get airports from cache or fetch if not available
 */
export async function getAirports(): Promise<AirportsMap> {
  if (airportsCache) {
    return airportsCache;
  }
  return fetchAirports();
}

/**
 * Search airports by query (code, name, or city)
 */
export async function searchAirports(
  query: string,
): Promise<Array<{ code: string; name: string }>> {
  const airports = await getAirports();
  const normalizedQuery = query.toUpperCase().trim();
  const results: Array<{ code: string; name: string }> = [];

  for (const [code, name] of airports) {
    if (
      code.includes(normalizedQuery) ||
      name.toUpperCase().includes(normalizedQuery)
    ) {
      results.push({ code, name });
    }
  }

  // Sort by code
  results.sort((a, b) => a.code.localeCompare(b.code));

  return results;
}

/**
 * Check if an airport code exists
 */
export async function airportExists(code: string): Promise<boolean> {
  const airports = await getAirports();
  return airports.has(code.toUpperCase());
}

/**
 * Get airport name by code
 */
export async function getAirportName(
  code: string,
): Promise<string | undefined> {
  const airports = await getAirports();
  return airports.get(code.toUpperCase());
}
