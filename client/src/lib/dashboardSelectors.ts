import { parseISO, startOfDay, startOfYear, endOfYear } from "date-fns";
import type { TripWithDetails } from "@shared/schema";

type IsoDate = TripWithDetails["startDate"];

type TripWithMeta = TripWithDetails & {
  status?: string | null;
  tripStatus?: string | null;
  deletedAt?: IsoDate | null;
  canceledAt?: IsoDate | null;
  cancelledAt?: IsoDate | null;
  isDeleted?: boolean | null;
  archivedAt?: IsoDate | null;
};

const normalizeDate = (value: IsoDate): Date => {
  if (value instanceof Date) {
    return startOfDay(value);
  }
  return startOfDay(parseISO(value));
};

export const isTripInactive = (trip: TripWithDetails): boolean => {
  const candidate = trip as TripWithMeta;
  const normalizedStatus =
    candidate.status || candidate.tripStatus || (candidate as { state?: string }).state || null;
  if (typeof normalizedStatus === "string") {
    const lowered = normalizedStatus.toLowerCase();
    if (lowered === "canceled" || lowered === "cancelled" || lowered === "archived") {
      return true;
    }
  }

  return Boolean(
    candidate.isDeleted ||
      candidate.deletedAt ||
      candidate.canceledAt ||
      candidate.cancelledAt ||
      candidate.archivedAt,
  );
};

export const selectUpcomingTrips = (
  trips: TripWithDetails[] | null | undefined,
  today: Date,
): TripWithDetails[] => {
  if (!trips || trips.length === 0) {
    return [];
  }

  const normalizedToday = startOfDay(today);

  return trips
    .filter((trip) => {
      if (isTripInactive(trip)) {
        return false;
      }

      const endDate = normalizeDate(trip.endDate);
      return endDate.getTime() >= normalizedToday.getTime();
    })
    .sort((a, b) => normalizeDate(a.startDate).getTime() - normalizeDate(b.startDate).getTime());
};

export const selectPastTrips = (
  trips: TripWithDetails[] | null | undefined,
  today: Date,
): TripWithDetails[] => {
  if (!trips || trips.length === 0) {
    return [];
  }

  const normalizedToday = startOfDay(today);

  return trips
    .filter((trip) => {
      if (isTripInactive(trip)) {
        return false;
      }

      const endDate = normalizeDate(trip.endDate);
      return endDate.getTime() < normalizedToday.getTime();
    })
    .sort((a, b) => normalizeDate(b.endDate).getTime() - normalizeDate(a.endDate).getTime());
};

export const selectUpcomingDestinationsUnique = (
  trips: TripWithDetails[] | null | undefined,
  today: Date,
): Set<string> => {
  const unique = new Set<string>();
  const upcomingTrips = selectUpcomingTrips(trips, today);
  
  for (const trip of upcomingTrips) {
    if (trip.destination?.trim()) {
      unique.add(trip.destination.trim().toLowerCase());
    }
  }
  
  return unique;
};

export const selectAllDestinationsUnique = (
  trips: TripWithDetails[] | null | undefined,
  referenceDate: Date,
): Set<string | number> => {
  const unique = new Set<string | number>();
  if (!trips || trips.length === 0) {
    return unique;
  }

  const normalizedToday = startOfDay(referenceDate);
  const currentYearStart = startOfYear(normalizedToday);
  const currentYearEnd = endOfYear(normalizedToday);

  const addDestination = (trip: TripWithDetails) => {
    const key =
      (trip.geonameId ?? null) !== null
        ? trip.geonameId!
        : trip.destination?.trim().toLowerCase() || `trip-${trip.id}`;
    unique.add(key);
  };

  let addedForYear = false;
  for (const trip of trips) {
    if (isTripInactive(trip)) {
      continue;
    }

    const tripStart = normalizeDate(trip.startDate);
    const tripEnd = normalizeDate(trip.endDate);
    const overlapsYear =
      tripStart.getTime() <= currentYearEnd.getTime() &&
      tripEnd.getTime() >= currentYearStart.getTime();

    if (!overlapsYear) {
      continue;
    }

    addDestination(trip);
    addedForYear = true;
  }

  if (!addedForYear) {
    for (const trip of trips) {
      if (isTripInactive(trip)) {
        continue;
      }
      addDestination(trip);
    }
  }

  return unique;
};

export const selectUniqueTravelersThisYear = (
  trips: TripWithDetails[] | null | undefined,
  referenceDate: Date,
): Set<string> => {
  const travelerIds = new Set<string>();
  if (!trips || trips.length === 0) {
    return travelerIds;
  }

  const startOfCurrentYear = startOfYear(referenceDate);
  const endOfCurrentYear = endOfYear(referenceDate);

  for (const trip of trips) {
    if (isTripInactive(trip)) {
      continue;
    }

    const tripStart = normalizeDate(trip.startDate);
    const tripEnd = normalizeDate(trip.endDate);
    const overlapsYear =
      tripStart.getTime() <= endOfCurrentYear.getTime() &&
      tripEnd.getTime() >= startOfCurrentYear.getTime();

    if (!overlapsYear) {
      continue;
    }

    for (const member of trip.members) {
      if (member.userId) {
        travelerIds.add(member.userId);
      }
    }
  }

  return travelerIds;
};

export const selectNextTrip = (
  trips: TripWithDetails[] | null | undefined,
  today: Date,
): TripWithDetails | null => {
  const upcoming = selectUpcomingTrips(trips, today);
  return upcoming.length > 0 ? upcoming[0] ?? null : null;
};

export const isTripOngoing = (trip: TripWithDetails, today: Date): boolean => {
  const normalizedToday = startOfDay(today);
  const startDate = normalizeDate(trip.startDate);
  const endDate = normalizeDate(trip.endDate);
  return startDate.getTime() <= normalizedToday.getTime() && endDate.getTime() >= normalizedToday.getTime();
};

export const getDaysUntilTrip = (trip: TripWithDetails | null, today: Date): number | null => {
  if (!trip) return null;
  const normalizedToday = startOfDay(today);
  const startDate = normalizeDate(trip.startDate);
  
  if (isTripOngoing(trip, today)) {
    return 0;
  }
  
  const diff = Math.ceil((startDate.getTime() - normalizedToday.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

export type PlanningProgressItem = {
  key: string;
  label: string;
  complete: boolean;
};

export type PlanningProgress = {
  items: PlanningProgressItem[];
  completedCount: number;
  totalCount: number;
  percentage: number;
};

export type TripWithPlanningData = TripWithDetails & {
  flights?: Array<{ status?: string | null }>;
  hotels?: Array<{ status?: string | null; checkInDate?: string | null; checkOutDate?: string | null }>;
  activities?: Array<{ status?: string | null; date?: string | null }>;
  restaurants?: Array<{ status?: string | null }>;
  budget?: number | null;
  packingItems?: Array<unknown>;
  proposals?: Array<{ status?: string | null; type?: string | null }>;
};

export const calculateTripPlanningProgress = (trip: TripWithPlanningData): PlanningProgress => {
  // Flights: confirmed/booked/scheduled are valid booking statuses
  const confirmedFlightStatuses = ["confirmed", "booked", "scheduled"];
  // Hotels: confirmed/booked for bookings, scheduled for Schedule & Invite mode
  const confirmedHotelStatuses = ["confirmed", "booked", "scheduled"];
  // Activities: "active" is the status used for confirmed activities in the DB
  const confirmedActivityStatuses = ["active", "confirmed", "scheduled"];
  
  // Calculate total trip days and nights
  const tripStart = normalizeDate(trip.startDate);
  const tripEnd = normalizeDate(trip.endDate);
  const tripDays = Math.max(1, Math.ceil((tripEnd.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const tripNights = Math.max(1, tripDays - 1); // Number of nights needing lodging
  
  // Coverage threshold: 50% of days/nights should be covered
  const coverageThreshold = 0.5;
  
  // === HOTEL COVERAGE ===
  const confirmedHotels = trip.hotels?.filter(
    (h: { status?: string | null }) => confirmedHotelStatuses.includes(h.status?.toLowerCase() ?? "")
  ) ?? [];
  
  // Calculate total nights covered by hotels
  let hotelNightsCovered = 0;
  for (const hotel of confirmedHotels) {
    const h = hotel as { checkInDate?: string | null; checkOutDate?: string | null };
    if (h.checkInDate && h.checkOutDate) {
      const checkIn = normalizeDate(h.checkInDate);
      const checkOut = normalizeDate(h.checkOutDate);
      const nights = Math.max(0, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
      hotelNightsCovered += nights;
    } else {
      // If no dates, assume at least 1 night per hotel
      hotelNightsCovered += 1;
    }
  }
  
  const hotelCoverage = tripNights > 0 ? Math.min(1, hotelNightsCovered / tripNights) : 0;
  const hasGoodHotelCoverage = hotelCoverage >= coverageThreshold;
  const hotelLabel = confirmedHotels.length === 0
    ? "Lodging confirmed (0 nights)"
    : `Lodging confirmed (${Math.min(hotelNightsCovered, tripNights)}/${tripNights} nights)`;
  
  // === ACTIVITY COVERAGE ===
  const confirmedActivities = trip.activities?.filter(
    (a: { status?: string | null; date?: string | null }) => 
      confirmedActivityStatuses.includes(a.status?.toLowerCase() ?? "")
  ) ?? [];
  
  // Get unique dates with activities
  const activityDates = new Set(
    confirmedActivities
      .map((a: { date?: string | null }) => a.date)
      .filter((d): d is string => Boolean(d))
  );
  
  const activityCoverage = activityDates.size / tripDays;
  const hasGoodActivityCoverage = activityCoverage >= coverageThreshold;
  const activityLabel = confirmedActivities.length === 0 
    ? "Activities planned (0 days)" 
    : `Activities planned (${activityDates.size}/${tripDays} days)`;
  
  const items: PlanningProgressItem[] = [
    {
      key: "flights",
      label: "Flights confirmed",
      complete: (trip.flights?.filter((f: { status?: string | null }) => confirmedFlightStatuses.includes(f.status?.toLowerCase() ?? "")).length ?? 0) > 0,
    },
    {
      key: "lodging",
      label: hotelLabel,
      complete: hasGoodHotelCoverage,
    },
    {
      key: "activity",
      label: activityLabel,
      complete: hasGoodActivityCoverage,
    },
    {
      key: "budget",
      label: "Budget set",
      complete: Boolean(trip.budget && trip.budget > 0),
    },
    {
      key: "packing",
      label: "Packing list started",
      complete: (trip.packingItems?.length ?? 0) > 0,
    },
  ];

  const completedCount = items.filter(i => i.complete).length;
  const totalCount = items.length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return { items, completedCount, totalCount, percentage };
};

export type OpenDecisions = {
  flights: number;
  hotels: number;
  activities: number;
  restaurants: number;
  total: number;
};

export const countOpenDecisions = (trip: TripWithPlanningData | null): OpenDecisions => {
  if (!trip) {
    return { flights: 0, hotels: 0, activities: 0, restaurants: 0, total: 0 };
  }

  const openStatuses = ["proposed", "voting", "pending"];
  
  const flights = trip.flights?.filter((f: { status?: string | null }) => openStatuses.includes(f.status?.toLowerCase() ?? "")).length ?? 0;
  const hotels = trip.hotels?.filter((h: { status?: string | null }) => openStatuses.includes(h.status?.toLowerCase() ?? "")).length ?? 0;
  const activities = trip.activities?.filter((a: { status?: string | null }) => openStatuses.includes(a.status?.toLowerCase() ?? "")).length ?? 0;
  const restaurants = trip.restaurants?.filter((r: { status?: string | null }) => openStatuses.includes(r.status?.toLowerCase() ?? "")).length ?? 0;

  return {
    flights,
    hotels,
    activities,
    restaurants,
    total: flights + hotels + activities + restaurants,
  };
};

export type GroupStatus = {
  memberCount: number;
  pendingRsvps: number;
  confirmedMembers: number;
};

export const calculateGroupStatus = (trip: TripWithDetails | null): GroupStatus => {
  if (!trip) {
    return { memberCount: 0, pendingRsvps: 0, confirmedMembers: 0 };
  }

  type MemberWithRsvp = TripWithDetails["members"][number] & { rsvpStatus?: string | null };
  const members = trip.members as MemberWithRsvp[] ?? [];
  const memberCount = members.length;
  const confirmedMembers = members.filter((m: MemberWithRsvp) => 
    m.rsvpStatus === "confirmed" || m.rsvpStatus === "accepted" || m.rsvpStatus === "going"
  ).length;
  const pendingRsvps = members.filter((m: MemberWithRsvp) => 
    !m.rsvpStatus || m.rsvpStatus === "pending" || m.rsvpStatus === "invited"
  ).length;

  return { memberCount, pendingRsvps, confirmedMembers };
};
