/**
 * Flight search tools for Google Flights MCP
 */
import { createPrivateTool } from "@decocms/runtime/tools";
import {
  searchFlightsInputSchema,
  searchFlightsOutputSchema,
  airportSearchInputSchema,
  airportSearchOutputSchema,
  getTravelDatesInputSchema,
  getTravelDatesOutputSchema,
} from "../lib/types.ts";
import {
  searchAirports,
  airportExists,
  getAirportName,
  fetchAirports,
} from "../lib/airports.ts";
import {
  searchFlights,
  validateDates,
  buildGoogleFlightsUrl,
} from "../lib/flights-client.ts";

/**
 * SEARCH_FLIGHTS - Search for flights between two airports
 */
export const createSearchFlightsTool = (_env: unknown) =>
  createPrivateTool({
    id: "SEARCH_FLIGHTS",
    description: `Search for flights between two airports using Google Flights data.

Provide departure and arrival airport codes (3-letter IATA codes like LAX, JFK, LHR), 
dates in YYYY-MM-DD format, and optionally passenger counts and seat class.

Returns flight options with prices, airlines, duration, and stops.
For round-trip searches, provide both departure and return dates.`,
    inputSchema: searchFlightsInputSchema,
    outputSchema: searchFlightsOutputSchema,
    execute: async ({ context }) => {
      const {
        fromAirport,
        toAirport,
        departureDate,
        returnDate,
        adults,
        children,
        infantsInSeat,
        infantsOnLap,
        seatClass,
      } = context;

      // Normalize airport codes
      const from = fromAirport.toUpperCase();
      const to = toAirport.toUpperCase();

      // Validate airport codes
      const [fromExists, toExists] = await Promise.all([
        airportExists(from),
        airportExists(to),
      ]);

      if (!fromExists) {
        return {
          success: false,
          message: `Departure airport code '${from}' not found. Use the SEARCH_AIRPORTS tool to find valid airport codes.`,
        };
      }

      if (!toExists) {
        return {
          success: false,
          message: `Arrival airport code '${to}' not found. Use the SEARCH_AIRPORTS tool to find valid airport codes.`,
        };
      }

      // Validate dates
      const dateValidation = validateDates(departureDate, returnDate);
      if (!dateValidation.valid) {
        return {
          success: false,
          message: dateValidation.error ?? "Invalid dates",
        };
      }

      // Validate passenger count
      const totalPassengers = adults + children + infantsInSeat + infantsOnLap;
      if (totalPassengers > 9) {
        return {
          success: false,
          message: "Total passengers cannot exceed 9",
        };
      }

      if (adults < 1) {
        return {
          success: false,
          message: "At least one adult passenger is required",
        };
      }

      // Get airport names for display
      const [fromName, toName] = await Promise.all([
        getAirportName(from),
        getAirportName(to),
      ]);

      // Search for flights
      const result = await searchFlights({
        fromAirport: from,
        toAirport: to,
        departureDate,
        returnDate,
        adults,
        children,
        infantsInSeat,
        infantsOnLap,
        seatClass,
      });

      // Build the Google Flights URL
      const searchUrl = buildGoogleFlightsUrl({
        fromAirport: from,
        toAirport: to,
        departureDate,
        returnDate,
        adults,
        children,
        infantsInSeat,
        infantsOnLap,
        seatClass,
      });

      const tripType = returnDate ? "round-trip" : "one-way";

      return {
        success: true,
        message: `Flight search from ${from} (${fromName}) to ${to} (${toName}). View results on Google Flights: ${searchUrl}`,
        tripType,
        fromAirport: `${from} - ${fromName}`,
        toAirport: `${to} - ${toName}`,
        departureDate,
        returnDate,
        flightsFound: result.flights.length,
        flights: result.flights.map((f) => ({
          price: f.price,
          airline: f.airline,
          departure: f.departure,
          arrival: f.arrival,
          duration: f.duration,
          stops: f.stops,
          stopDetails: f.stopDetails,
          isBest: f.isBest,
        })),
        priceAssessment: result.currentPrice,
      };
    },
  });

/**
 * SEARCH_AIRPORTS - Search for airport codes by name or city
 */
export const createSearchAirportsTool = (_env: unknown) =>
  createPrivateTool({
    id: "SEARCH_AIRPORTS",
    description: `Search for airport codes by name, city, or partial IATA code.

Use this tool to find the 3-letter IATA airport code needed for flight searches.
Provide at least 2 characters to search.

Examples:
- "los angeles" → LAX - Los Angeles International Airport
- "london" → LHR, LGW, STN, LTN, etc.
- "JFK" → JFK - John F Kennedy International Airport`,
    inputSchema: airportSearchInputSchema,
    outputSchema: airportSearchOutputSchema,
    execute: async ({ context }) => {
      const { query } = context;

      if (query.length < 2) {
        return {
          success: false,
          message: "Please provide at least 2 characters to search",
        };
      }

      const results = await searchAirports(query);

      if (results.length === 0) {
        return {
          success: false,
          message: `No airports found matching '${query}'`,
          matchCount: 0,
          airports: [],
        };
      }

      // Limit to 20 results
      const limited = results.slice(0, 20);
      const hasMore = results.length > 20;

      return {
        success: true,
        message: hasMore
          ? `Found ${results.length} airports matching '${query}' (showing first 20). Refine your search for more specific results.`
          : `Found ${results.length} airport(s) matching '${query}'`,
        matchCount: results.length,
        airports: limited,
      };
    },
  });

/**
 * GET_TRAVEL_DATES - Get suggested travel dates
 */
export const createGetTravelDatesTool = (_env: unknown) =>
  createPrivateTool({
    id: "GET_TRAVEL_DATES",
    description: `Get suggested travel dates based on days from now and trip length.

Use this to quickly calculate departure and return dates for flight searches.
Defaults to departing in 30 days with a 7-day trip length.`,
    inputSchema: getTravelDatesInputSchema,
    outputSchema: getTravelDatesOutputSchema,
    execute: async ({ context }) => {
      const { daysFromNow, tripLength } = context;

      const today = new Date();
      const departureDate = new Date(today);
      departureDate.setDate(today.getDate() + daysFromNow);

      const returnDate = new Date(departureDate);
      returnDate.setDate(departureDate.getDate() + tripLength);

      const formatDate = (date: Date) => {
        return date.toISOString().split("T")[0] ?? "";
      };

      return {
        departureDate: formatDate(departureDate),
        returnDate: formatDate(returnDate),
        tripLength,
        daysFromNow,
      };
    },
  });

/**
 * UPDATE_AIRPORTS_DATABASE - Force refresh of airports database
 */
export const createUpdateAirportsDatabaseTool = (_env: unknown) =>
  createPrivateTool({
    id: "UPDATE_AIRPORTS_DATABASE",
    description: `Force refresh the airports database from the source CSV.

The airports database is cached for 24 hours. Use this tool to force a refresh
if you need the latest airport data.`,
    inputSchema: getTravelDatesInputSchema.pick({}), // Empty schema
    outputSchema: airportSearchOutputSchema,
    execute: async () => {
      try {
        const airports = await fetchAirports();
        return {
          success: true,
          message: `Successfully updated airports database with ${airports.size} airports`,
          matchCount: airports.size,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Failed to update airports database: ${message}`,
        };
      }
    },
  });
