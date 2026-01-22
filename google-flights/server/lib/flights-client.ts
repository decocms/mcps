import type { FlightOption, FlightSearchResult, SeatClass } from "./types";

/**
 * Google Flights search URL builder
 *
 * Google Flights uses a specific URL format for searches.
 * This client builds the URL and provides search functionality.
 */

/**
 * Build Google Flights search URL
 */
export function buildGoogleFlightsUrl(params: {
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infantsInSeat: number;
  infantsOnLap: number;
  seatClass: SeatClass;
}): string {
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
  } = params;

  // Build the search query with all relevant parameters
  const totalPassengers = adults + children + infantsInSeat + infantsOnLap;
  const classLabel =
    seatClass === "economy" ? "" : ` ${seatClass.replace("_", " ")}`;
  const searchQuery = `Flights to ${toAirport} from ${fromAirport} on ${departureDate}${returnDate ? ` returning ${returnDate}` : ""}${totalPassengers > 1 ? ` ${totalPassengers} passengers` : ""}${classLabel}`;

  // Build a simple Google Flights URL that users can click
  const baseUrl = "https://www.google.com/travel/flights";
  const queryParams = new URLSearchParams({
    q: searchQuery,
    curr: "USD",
    gl: "us",
    hl: "en",
  });

  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Search for flights
 *
 * Note: Google Flights doesn't have a public API. This implementation
 * provides structured search information and URLs for users to check
 * actual prices on Google Flights.
 *
 * For production use, consider integrating with:
 * - Amadeus API (https://developers.amadeus.com/)
 * - Skyscanner API (https://developers.skyscanner.net/)
 * - Kiwi.com Tequila API (https://tequila.kiwi.com/)
 */
export async function searchFlights(params: {
  fromAirport: string;
  toAirport: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infantsInSeat: number;
  infantsOnLap: number;
  seatClass: SeatClass;
}): Promise<FlightSearchResult> {
  const { fromAirport, toAirport, departureDate, returnDate } = params;

  // Build the Google Flights URL for the user
  const searchUrl = buildGoogleFlightsUrl(params);

  // Since Google Flights doesn't have a public API, we return a helpful response
  // with the search URL and instructions
  const result: FlightSearchResult = {
    flights: [],
    searchedAt: new Date().toISOString(),
    currentPrice: undefined,
  };

  // Create a placeholder flight option that directs users to Google Flights
  const placeholderFlight: FlightOption = {
    price: "Check Google Flights",
    airline: "Multiple Airlines",
    departure: `${fromAirport} → ${toAirport}`,
    arrival: departureDate,
    duration: "View on Google Flights",
    stops: -1,
    stopDetails: searchUrl,
    isBest: true,
    legs: [],
  };

  result.flights.push(placeholderFlight);

  if (returnDate) {
    const returnFlight: FlightOption = {
      price: "Check Google Flights",
      airline: "Multiple Airlines",
      departure: `${toAirport} → ${fromAirport}`,
      arrival: returnDate,
      duration: "View on Google Flights",
      stops: -1,
      stopDetails: searchUrl,
      legs: [],
    };
    result.flights.push(returnFlight);
  }

  return result;
}

/**
 * Validate flight search dates
 */
export function validateDates(
  departureDate: string,
  returnDate?: string,
): { valid: boolean; error?: string } {
  const departure = new Date(departureDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(departure.getTime())) {
    return { valid: false, error: "Invalid departure date format" };
  }

  if (departure < today) {
    return { valid: false, error: "Departure date cannot be in the past" };
  }

  if (returnDate) {
    const returnDt = new Date(returnDate);
    if (Number.isNaN(returnDt.getTime())) {
      return { valid: false, error: "Invalid return date format" };
    }
    if (returnDt < departure) {
      return {
        valid: false,
        error: "Return date cannot be before departure date",
      };
    }
  }

  return { valid: true };
}
