import { z } from "zod";

/**
 * Seat class options for flight search
 */
export const SeatClassSchema = z.enum([
  "economy",
  "premium_economy",
  "business",
  "first",
]);
export type SeatClass = z.infer<typeof SeatClassSchema>;

/**
 * Airport information from the CSV database
 */
export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
}

/**
 * Parsed airport data stored in cache
 * Maps IATA code to full name (e.g., "LAX" -> "Los Angeles International Airport, Los Angeles, United States")
 */
export type AirportsMap = Map<string, string>;

/**
 * Flight leg information
 */
export interface FlightLeg {
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
}

/**
 * Flight option returned from search
 */
export interface FlightOption {
  price: string;
  airline: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: number;
  stopDetails?: string;
  legs: FlightLeg[];
  isBest?: boolean;
  arrivalTimeAhead?: string;
  delay?: string;
}

/**
 * Flight search result
 */
export interface FlightSearchResult {
  flights: FlightOption[];
  currentPrice?: string;
  searchedAt: string;
}

/**
 * Input schema for search_flights tool
 */
export const searchFlightsInputSchema = z.object({
  fromAirport: z
    .string()
    .length(3)
    .describe("Departure airport IATA code (3 letters, e.g., 'LAX')"),
  toAirport: z
    .string()
    .length(3)
    .describe("Arrival airport IATA code (3 letters, e.g., 'JFK')"),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Departure date in YYYY-MM-DD format"),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Return date in YYYY-MM-DD format (optional, for round trips)"),
  adults: z
    .number()
    .int()
    .min(1)
    .max(9)
    .default(1)
    .describe("Number of adult passengers (1-9)"),
  children: z
    .number()
    .int()
    .min(0)
    .max(9)
    .default(0)
    .describe("Number of children (0-9)"),
  infantsInSeat: z
    .number()
    .int()
    .min(0)
    .max(9)
    .default(0)
    .describe("Number of infants in seat (0-9)"),
  infantsOnLap: z
    .number()
    .int()
    .min(0)
    .max(9)
    .default(0)
    .describe("Number of infants on lap (0-9)"),
  seatClass: SeatClassSchema.default("economy").describe(
    "Seat class preference",
  ),
});
export type SearchFlightsInput = z.infer<typeof searchFlightsInputSchema>;

/**
 * Output schema for search_flights tool
 */
export const searchFlightsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  tripType: z.enum(["one-way", "round-trip"]).optional(),
  fromAirport: z.string().optional(),
  toAirport: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  flightsFound: z.number().optional(),
  flights: z
    .array(
      z.object({
        price: z.string(),
        airline: z.string(),
        departure: z.string(),
        arrival: z.string(),
        duration: z.string(),
        stops: z.number(),
        stopDetails: z.string().optional(),
        isBest: z.boolean().optional(),
      }),
    )
    .optional(),
  priceAssessment: z.string().optional(),
});
export type SearchFlightsOutput = z.infer<typeof searchFlightsOutputSchema>;

/**
 * Input schema for airport_search tool
 */
export const airportSearchInputSchema = z.object({
  query: z
    .string()
    .min(2)
    .describe("Search term (city name, airport name, or partial IATA code)"),
});
export type AirportSearchInput = z.infer<typeof airportSearchInputSchema>;

/**
 * Output schema for airport_search tool
 */
export const airportSearchOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  matchCount: z.number().optional(),
  airports: z
    .array(
      z.object({
        code: z.string(),
        name: z.string(),
      }),
    )
    .optional(),
});
export type AirportSearchOutput = z.infer<typeof airportSearchOutputSchema>;

/**
 * Input schema for get_travel_dates tool
 */
export const getTravelDatesInputSchema = z.object({
  daysFromNow: z
    .number()
    .int()
    .min(1)
    .default(30)
    .describe("Number of days from today for departure (default: 30)"),
  tripLength: z
    .number()
    .int()
    .min(1)
    .default(7)
    .describe("Length of trip in days (default: 7)"),
});
export type GetTravelDatesInput = z.infer<typeof getTravelDatesInputSchema>;

/**
 * Output schema for get_travel_dates tool
 */
export const getTravelDatesOutputSchema = z.object({
  departureDate: z.string(),
  returnDate: z.string(),
  tripLength: z.number(),
  daysFromNow: z.number(),
});
export type GetTravelDatesOutput = z.infer<typeof getTravelDatesOutputSchema>;
