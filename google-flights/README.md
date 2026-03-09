# Google Flights MCP

An MCP server that provides flight search capabilities using Google Flights data and a comprehensive airports database.

## Features

- **Search Flights**: Search for one-way or round-trip flights between airports
- **Airport Search**: Find airport codes by name, city, or partial IATA code
- **Travel Date Calculator**: Get suggested departure and return dates
- **Airports Database**: Comprehensive database of 10,000+ airports with IATA codes

## Tools

### SEARCH_FLIGHTS

Search for flights between two airports.

**Parameters:**
- `fromAirport` (required): Departure airport IATA code (3 letters, e.g., 'LAX')
- `toAirport` (required): Arrival airport IATA code (3 letters, e.g., 'JFK')
- `departureDate` (required): Departure date in YYYY-MM-DD format
- `returnDate` (optional): Return date for round-trip flights
- `adults` (default: 1): Number of adult passengers
- `children` (default: 0): Number of children
- `infantsInSeat` (default: 0): Number of infants in seat
- `infantsOnLap` (default: 0): Number of infants on lap
- `seatClass` (default: 'economy'): Seat class (economy, premium_economy, business, first)

### SEARCH_AIRPORTS

Search for airport codes by name, city, or partial IATA code.

**Parameters:**
- `query` (required): Search term (minimum 2 characters)

**Examples:**
- "los angeles" → LAX - Los Angeles International Airport
- "london" → LHR, LGW, STN, LTN, etc.
- "JFK" → JFK - John F Kennedy International Airport

### GET_TRAVEL_DATES

Get suggested travel dates based on days from now and trip length.

**Parameters:**
- `daysFromNow` (default: 30): Days from today for departure
- `tripLength` (default: 7): Trip length in days

### UPDATE_AIRPORTS_DATABASE

Force refresh the airports database from the source CSV.

## Development

```bash
# Install dependencies (from mcps root)
bun install

# Start development server
bun run dev

# Type check
bun run check

# Build for production
bun run build
```

## Architecture

The MCP uses:
- **Airports CSV**: Fetched from [airportsdata](https://github.com/mborsetti/airportsdata) (10,000+ airports)
- **Bun runtime**: Fast JavaScript runtime for the server
- **Deco Runtime**: For MCP protocol handling

## Note on Flight Data

Google Flights does not provide a public API. This MCP generates Google Flights search URLs
that users can visit to see actual flight prices and options.

For production use with real-time flight pricing, consider integrating with:
- [Amadeus API](https://developers.amadeus.com/)
- [Skyscanner API](https://developers.skyscanner.net/)
- [Kiwi.com Tequila API](https://tequila.kiwi.com/)

## License

Private - See LICENSE file for details.
