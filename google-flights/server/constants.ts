/**
 * Constants for the Google Flights MCP
 */

/**
 * CSV source for airport data from airportsdata project
 */
export const AIRPORTS_CSV_URL =
  "https://raw.githubusercontent.com/mborsetti/airportsdata/refs/heads/main/airportsdata/airports.csv";

/**
 * Cache TTL for airports data (24 hours)
 */
export const AIRPORTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Default configuration for flight searches
 */
export const DEFAULT_CONFIG = {
  maxResults: 10,
  defaultTripDays: 7,
  defaultAdvanceDays: 30,
  seatClasses: ["economy", "premium_economy", "business", "first"] as const,
} as const;

/**
 * Maximum number of airport search results to return
 */
export const MAX_AIRPORT_RESULTS = 20;
