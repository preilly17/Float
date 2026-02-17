import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("DatabaseStorage.updateHotelProposalStatus", () => {
  let queryMock: jest.Mock;
  let storage: typeof import("../storage").storage;

  beforeEach(async () => {
    jest.resetModules();
    queryMock = jest.fn();

    jest.doMock("../db", () => ({
      query: queryMock,
      pool: {
        connect: jest.fn(),
        query: jest.fn(),
        end: jest.fn(),
      },
    }));

    ({ storage } = await import("../storage"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it("writes hotel proposal schedule links with scheduled_table metadata during conversion", async () => {
    const now = new Date("2024-01-01T00:00:00.000Z");

    const proposal = {
      id: 77,
      tripId: 12,
      proposedBy: "owner@example.com",
      hotelName: "Skyline Suites",
      location: "Austin, TX, USA",
      price: "320.00",
      pricePerNight: "160.00",
      currency: "USD",
      rating: "4.7",
      amenities: ["wifi"],
      platform: "Booking",
      bookingUrl: "https://example.com/hotel",
      status: "active",
      checkInDate: now,
      checkOutDate: now,
    };

    jest.spyOn(storage, "getHotelProposalById").mockResolvedValue(proposal as any);
    jest.spyOn(storage, "createHotel").mockResolvedValue({ id: 900 } as any);
    jest.spyOn(storage, "createHotelRsvpsForTripMembers").mockResolvedValue(undefined);
    jest.spyOn(storage as any, "fetchHotelProposals").mockResolvedValue([
      {
        id: 77,
        tripId: 12,
        hotelName: "Skyline Suites",
        status: "scheduled",
      },
    ]);

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 77,
            trip_id: 12,
            proposed_by: "owner@example.com",
            hotel_name: "Skyline Suites",
            location: "Austin, TX, USA",
            price: "320.00",
            price_per_night: "160.00",
            rating: "4.7",
            amenities: ["wifi"],
            platform: "Booking",
            booking_url: "https://example.com/hotel",
            status: "scheduled",
            average_ranking: null,
            created_at: now,
            updated_at: now,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ user_id: "teammate@example.com" }] })
      .mockResolvedValueOnce({ rows: [] });

    await storage.updateHotelProposalStatus(77, "scheduled", "owner@example.com");

    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("scheduled_table"),
      [77, 900, 12],
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("VALUES ('hotel', $1, 'hotels', $2, $3)"),
      [77, 900, 12],
    );
  });
});
