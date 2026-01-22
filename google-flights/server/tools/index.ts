/**
 * Central export point for all flight-related tools.
 */
import {
  createSearchFlightsTool,
  createSearchAirportsTool,
  createGetTravelDatesTool,
  createUpdateAirportsDatabaseTool,
} from "./flights.ts";

// Export tools as array of tool creator functions
// The runtime will call each function with env
export const tools = [
  createSearchFlightsTool,
  createSearchAirportsTool,
  createGetTravelDatesTool,
  createUpdateAirportsDatabaseTool,
];
