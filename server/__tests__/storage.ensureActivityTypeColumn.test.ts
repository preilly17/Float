import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("ensureActivityTypeColumn", () => {
  let queryMock: jest.Mock;
  let DatabaseStorage: typeof import("../storage").DatabaseStorage;
  const ORIGINAL_DB_URL = process.env.DATABASE_URL;
  let restoreQuery: (() => void) | null = null;

  beforeEach(async () => {
    jest.resetModules();
    queryMock = jest.fn();
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/test";

    const dbModule = await import("../db");
    const querySpy = jest.spyOn(dbModule, "query").mockImplementation(queryMock);
    restoreQuery = () => querySpy.mockRestore();

    ({ DatabaseStorage } = await import("../storage"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
    restoreQuery?.();
    restoreQuery = null;
  });

  it("sets enum defaults when the column uses a user-defined type", async () => {
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT data_type, udt_name")) {
        return { rows: [{ data_type: "USER-DEFINED", udt_name: "activity_type" }] };
      }

      return { rows: [] };
    });

    const storage = new DatabaseStorage();
    await (storage as any).ensureActivityTypeColumn();

    const defaultCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" && sql.includes("ALTER TABLE activities ALTER COLUMN type SET DEFAULT"),
    );
    expect(defaultCall?.[0]).toContain("'SCHEDULED'::activity_type");

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" && sql.includes("UPDATE activities SET type"),
    );
    expect(updateCall?.[0]).toContain("'SCHEDULED'::activity_type");
  });

  it("cleans blank string values for text columns", async () => {
    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql === "string" && sql.includes("SELECT data_type, udt_name")) {
        return { rows: [{ data_type: "text", udt_name: null }] };
      }

      return { rows: [] };
    });

    const storage = new DatabaseStorage();
    await (storage as any).ensureActivityTypeColumn();

    const updateCall = queryMock.mock.calls.find(([sql]) =>
      typeof sql === "string" && sql.includes("UPDATE activities SET type"),
    );
    expect(updateCall?.[0]).toContain("TRIM(type) = ''");
  });
});



describe("addFlight schema compatibility", () => {
  let queryMock: jest.Mock;
  let DatabaseStorage: typeof import("../storage").DatabaseStorage;
  const ORIGINAL_DB_URL = process.env.DATABASE_URL;
  let restoreQuery: (() => void) | null = null;

  beforeEach(async () => {
    jest.resetModules();
    queryMock = jest.fn();
    process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/test";

    const dbModule = await import("../db");
    const querySpy = jest.spyOn(dbModule, "query").mockImplementation(queryMock);
    restoreQuery = () => querySpy.mockRestore();

    ({ DatabaseStorage } = await import("../storage"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
    restoreQuery?.();
    restoreQuery = null;
  });

  it("adds modern flight columns and backfills from legacy columns", async () => {
    const insertedRow = {
      id: 1,
      trip_id: 10,
      user_id: "traveler-1",
      flight_number: "AA123",
      airline: "American Airlines",
      airline_code: "AA",
      departure_airport: "John F Kennedy International",
      departure_code: "JFK",
      departure_time: new Date("2026-01-01T10:00:00.000Z"),
      departure_terminal: null,
      departure_gate: null,
      arrival_airport: "Los Angeles International",
      arrival_code: "LAX",
      arrival_time: new Date("2026-01-01T14:00:00.000Z"),
      arrival_terminal: null,
      arrival_gate: null,
      booking_reference: null,
      seat_number: null,
      seat_class: null,
      price: null,
      currency: "USD",
      flight_type: null,
      status: "confirmed",
      layovers: null,
      booking_source: "manual",
      purchase_url: null,
      aircraft: null,
      flight_duration: null,
      baggage: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    queryMock.mockImplementation(async (sql: unknown) => {
      if (typeof sql === "string" && sql.includes("FROM information_schema.columns") && sql.includes("table_name = 'flights'")) {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "trip_id" },
            { column_name: "created_by" },
            { column_name: "origin" },
            { column_name: "destination" },
            { column_name: "departure_time" },
            { column_name: "arrival_time" },
            { column_name: "airline" },
            { column_name: "flight_number" },
            { column_name: "confirmation_number" },
            { column_name: "data" },
          ],
        };
      }

      if (typeof sql === "string" && sql.includes("INSERT INTO flights")) {
        return { rows: [insertedRow] };
      }

      return { rows: [] };
    });

    const storage = new DatabaseStorage();
    await storage.addFlight(
      {
        tripId: 10,
        flightNumber: "AA123",
        airline: "American Airlines",
        airlineCode: "AA",
        departureAirport: "John F Kennedy International",
        departureCode: "JFK",
        departureTime: "2026-01-01T10:00:00.000Z",
        arrivalAirport: "Los Angeles International",
        arrivalCode: "LAX",
        arrivalTime: "2026-01-01T14:00:00.000Z",
      } as any,
      "traveler-1",
    );

    const executedSql = queryMock.mock.calls.map(([sql]) => String(sql));

    expect(executedSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ALTER TABLE flights ADD COLUMN IF NOT EXISTS user_id TEXT"),
        expect.stringContaining("ALTER TABLE flights ADD COLUMN IF NOT EXISTS departure_airport TEXT"),
        expect.stringContaining("ALTER TABLE flights ADD COLUMN IF NOT EXISTS arrival_airport TEXT"),
        expect.stringContaining(`UPDATE flights
          SET user_id = created_by`),
        expect.stringContaining(`UPDATE flights
          SET departure_airport = origin`),
        expect.stringContaining(`UPDATE flights
          SET arrival_airport = destination`),
      ]),
    );
  });
});
