import {
  selectUpcomingTrips,
  selectPastTrips,
  selectNextTrip,
  selectUpcomingDestinationsUnique,
  isTripOngoing,
  getDaysUntilTrip,
  calculateTripPlanningProgress,
  countOpenDecisions,
  calculateGroupStatus,
  isTripInactive,
  type TripWithPlanningData,
} from "../dashboardSelectors";
import type { TripWithDetails } from "@shared/schema";

const createMockTrip = (overrides: Partial<TripWithDetails> = {}): TripWithDetails => ({
  id: 1,
  name: "Test Trip",
  destination: "Paris",
  startDate: "2026-02-01",
  endDate: "2026-02-10",
  creatorId: "user-1",
  shareCode: "ABC123",
  memberCount: 2,
  creator: {
    id: "user-1",
    username: "testuser",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    profileImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  members: [
    {
      id: 1,
      tripId: 1,
      userId: "user-1",
      role: "organizer",
      joinedAt: new Date(),
      user: {
        id: "user-1",
        username: "testuser",
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ],
  ...overrides,
} as TripWithDetails);

describe("dashboardSelectors", () => {
  describe("selectUpcomingTrips", () => {
    it("returns trips where endDate >= today (includes ongoing trips)", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-20", endDate: "2026-01-30" }),
        createMockTrip({ id: 2, startDate: "2026-02-01", endDate: "2026-02-10" }),
        createMockTrip({ id: 3, startDate: "2026-01-05", endDate: "2026-01-13" }),
      ];

      const result = selectUpcomingTrips(trips, today);

      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual([1, 2]);
    });

    it("excludes trips that have already ended", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-05", endDate: "2026-01-13" }),
      ];

      const result = selectUpcomingTrips(trips, today);

      expect(result).toHaveLength(0);
    });

    it("includes trips starting today", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-27", endDate: "2026-02-05" }),
      ];

      const result = selectUpcomingTrips(trips, today);

      expect(result).toHaveLength(1);
    });

    it("includes trips ending today", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-20", endDate: "2026-01-27" }),
      ];

      const result = selectUpcomingTrips(trips, today);

      expect(result).toHaveLength(1);
    });

    it("returns empty array for null/undefined input", () => {
      const today = new Date("2026-01-27");

      expect(selectUpcomingTrips(null, today)).toEqual([]);
      expect(selectUpcomingTrips(undefined, today)).toEqual([]);
      expect(selectUpcomingTrips([], today)).toEqual([]);
    });
  });

  describe("selectPastTrips", () => {
    it("returns trips where endDate < today", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-20", endDate: "2026-01-30" }),
        createMockTrip({ id: 2, startDate: "2026-01-05", endDate: "2026-01-13" }),
        createMockTrip({ id: 3, startDate: "2026-01-10", endDate: "2026-01-15" }),
      ];

      const result = selectPastTrips(trips, today);

      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual([3, 2]);
    });

    it("excludes ongoing and future trips", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-20", endDate: "2026-01-30" }),
        createMockTrip({ id: 2, startDate: "2026-02-01", endDate: "2026-02-10" }),
      ];

      const result = selectPastTrips(trips, today);

      expect(result).toHaveLength(0);
    });
  });

  describe("selectNextTrip", () => {
    it("returns the first upcoming trip sorted by startDate", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-03-01", endDate: "2026-03-10" }),
        createMockTrip({ id: 2, startDate: "2026-02-01", endDate: "2026-02-10" }),
        createMockTrip({ id: 3, startDate: "2026-04-01", endDate: "2026-04-10" }),
      ];

      const result = selectNextTrip(trips, today);

      expect(result?.id).toBe(2);
    });

    it("returns ongoing trip as next trip", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-20", endDate: "2026-01-30" }),
        createMockTrip({ id: 2, startDate: "2026-02-01", endDate: "2026-02-10" }),
      ];

      const result = selectNextTrip(trips, today);

      expect(result?.id).toBe(1);
    });

    it("returns null when no upcoming trips", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-05", endDate: "2026-01-13" }),
      ];

      const result = selectNextTrip(trips, today);

      expect(result).toBeNull();
    });
  });

  describe("selectUpcomingDestinationsUnique", () => {
    it("returns unique destinations from upcoming trips only", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-02-01", endDate: "2026-02-10", destination: "Paris" }),
        createMockTrip({ id: 2, startDate: "2026-03-01", endDate: "2026-03-10", destination: "Tokyo" }),
        createMockTrip({ id: 3, startDate: "2026-01-05", endDate: "2026-01-13", destination: "London" }),
        createMockTrip({ id: 4, startDate: "2026-04-01", endDate: "2026-04-10", destination: "Paris" }),
      ];

      const result = selectUpcomingDestinationsUnique(trips, today);

      expect(result.size).toBe(2);
      expect(result.has("paris")).toBe(true);
      expect(result.has("tokyo")).toBe(true);
      expect(result.has("london")).toBe(false);
    });

    it("returns 0 destinations when no upcoming trips", () => {
      const today = new Date("2026-01-27");
      const trips = [
        createMockTrip({ id: 1, startDate: "2026-01-05", endDate: "2026-01-13", destination: "London" }),
      ];

      const result = selectUpcomingDestinationsUnique(trips, today);

      expect(result.size).toBe(0);
    });
  });

  describe("isTripOngoing", () => {
    it("returns true when today is between start and end dates", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-20", endDate: "2026-01-30" });

      expect(isTripOngoing(trip, today)).toBe(true);
    });

    it("returns true when today equals start date", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-27", endDate: "2026-01-30" });

      expect(isTripOngoing(trip, today)).toBe(true);
    });

    it("returns true when today equals end date", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-20", endDate: "2026-01-27" });

      expect(isTripOngoing(trip, today)).toBe(true);
    });

    it("returns false for future trips", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-02-01", endDate: "2026-02-10" });

      expect(isTripOngoing(trip, today)).toBe(false);
    });

    it("returns false for past trips", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-05", endDate: "2026-01-13" });

      expect(isTripOngoing(trip, today)).toBe(false);
    });
  });

  describe("getDaysUntilTrip", () => {
    it("returns days until trip starts", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-02-01", endDate: "2026-02-10" });

      expect(getDaysUntilTrip(trip, today)).toBe(5);
    });

    it("returns 0 for ongoing trips", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-20", endDate: "2026-01-30" });

      expect(getDaysUntilTrip(trip, today)).toBe(0);
    });

    it("returns 0 for trips starting today", () => {
      const today = new Date("2026-01-27");
      const trip = createMockTrip({ startDate: "2026-01-27", endDate: "2026-02-05" });

      expect(getDaysUntilTrip(trip, today)).toBe(0);
    });

    it("returns null for null trip", () => {
      const today = new Date("2026-01-27");

      expect(getDaysUntilTrip(null, today)).toBeNull();
    });
  });

  describe("isTripInactive", () => {
    it("returns false for active trips", () => {
      const trip = createMockTrip({});

      expect(isTripInactive(trip)).toBe(false);
    });

    it("returns true for canceled trips", () => {
      const trip = createMockTrip({}) as TripWithDetails & { status: string };
      trip.status = "canceled";

      expect(isTripInactive(trip)).toBe(true);
    });

    it("returns true for cancelled trips (UK spelling)", () => {
      const trip = createMockTrip({}) as TripWithDetails & { status: string };
      trip.status = "cancelled";

      expect(isTripInactive(trip)).toBe(true);
    });

    it("returns true for archived trips", () => {
      const trip = createMockTrip({}) as TripWithDetails & { status: string };
      trip.status = "archived";

      expect(isTripInactive(trip)).toBe(true);
    });
  });

  describe("calculateTripPlanningProgress", () => {
    it("returns 0% for empty trip", () => {
      const trip = createMockTrip({}) as TripWithPlanningData;

      const result = calculateTripPlanningProgress(trip);

      expect(result.completedCount).toBe(0);
      expect(result.totalCount).toBe(5);
      expect(result.percentage).toBe(0);
    });

    it("counts confirmed flights", () => {
      const trip = createMockTrip({}) as TripWithPlanningData;
      trip.flights = [{ status: "confirmed" }];

      const result = calculateTripPlanningProgress(trip);

      expect(result.items.find(i => i.key === "flights")?.complete).toBe(true);
    });

    it("counts budget as set", () => {
      const trip = createMockTrip({}) as TripWithPlanningData;
      trip.budget = 5000;

      const result = calculateTripPlanningProgress(trip);

      expect(result.items.find(i => i.key === "budget")?.complete).toBe(true);
    });
  });

  describe("countOpenDecisions", () => {
    it("returns zeros for null trip", () => {
      const result = countOpenDecisions(null);

      expect(result.total).toBe(0);
      expect(result.flights).toBe(0);
      expect(result.hotels).toBe(0);
    });

    it("counts proposed items", () => {
      const trip = createMockTrip({}) as TripWithPlanningData;
      trip.flights = [{ status: "proposed" }, { status: "confirmed" }];
      trip.hotels = [{ status: "voting" }];
      trip.activities = [{ status: "pending" }, { status: "scheduled" }];

      const result = countOpenDecisions(trip);

      expect(result.flights).toBe(1);
      expect(result.hotels).toBe(1);
      expect(result.activities).toBe(1);
      expect(result.total).toBe(3);
    });
  });

  describe("calculateGroupStatus", () => {
    it("returns zeros for null trip", () => {
      const result = calculateGroupStatus(null);

      expect(result.memberCount).toBe(0);
      expect(result.pendingRsvps).toBe(0);
      expect(result.confirmedMembers).toBe(0);
    });

    it("counts members correctly", () => {
      const trip = createMockTrip({});
      trip.members = [
        { ...trip.members[0], id: 1 },
        { ...trip.members[0], id: 2 },
        { ...trip.members[0], id: 3 },
      ];

      const result = calculateGroupStatus(trip);

      expect(result.memberCount).toBe(3);
    });
  });
});
