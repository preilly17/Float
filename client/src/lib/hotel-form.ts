import { useMemo } from "react";
import { z } from "zod";
import { insertHotelProposalSchema, type InsertHotelProposal } from "@shared/schema";

type TripDates = {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

const parseTripDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const [, year, month, day] = dateMatch;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export const hotelFormSchema = insertHotelProposalSchema
  .extend({
    votingDeadline: z.date().optional().nullable(),
  })

export type HotelFormValues = z.infer<typeof hotelFormSchema>;

export const createHotelFormDefaults = (tripId: number, tripDates?: TripDates): HotelFormValues => ({
  tripId,
  hotelName: "",
  hotelRating: null,
  location: "",
  address: "",
  city: "",
  zipCode: "",
  country: "",
  checkInDate: parseTripDate(tripDates?.startDate) ?? new Date(),
  checkOutDate: parseTripDate(tripDates?.endDate) ?? new Date(),
  price: "",
  pricePerNight: null,
  guestCount: 1,
  roomCount: null,
  rating: null,
  amenities: null,
  platform: "",
  bookingUrl: "",
  bookingReference: "",
  bookingSource: "",
  bookingPlatform: "",
  purchaseUrl: "",
  hotelChain: "",
  roomType: "",
  totalPrice: null,
  currency: "USD",
  latitude: null,
  longitude: null,
  cancellationPolicy: "",
  contactInfo: "",
  policies: "",
  images: "",
  notes: "",
  status: "proposed",
  votingDeadline: null,
});

export const parseJsonInput = (value?: string | null) => {
  if (!value || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

export const parseAmenitiesInput = (value?: string | null) => {
  if (!value || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to comma parsing
    }
  }

  const items = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return trimmed;
  }

  return items.length === 1 ? items[0] : items;
};

export const stringifyJsonValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const transformHotelFormValues = (values: HotelFormValues): InsertHotelProposal => ({
  tripId: values.tripId,
  hotelName: values.hotelName.trim(),
  hotelRating: values.hotelRating ?? null,
  location: values.location?.trim() ?? "",
  address: values.address.trim(),
  city: values.city.trim(),
  zipCode: values.zipCode?.trim() ?? "",
  country: values.country.trim(),
  checkInDate: values.checkInDate,
  checkOutDate: values.checkOutDate,
  price: values.price?.trim() ?? "",
  pricePerNight: values.pricePerNight ?? null,
  guestCount: values.guestCount,
  roomCount: values.roomCount ?? null,
  rating: values.rating ?? null,
  amenities: values.amenities ?? null,
  platform: values.platform?.trim() ?? "",
  bookingUrl: values.bookingUrl?.trim() ?? "",
  bookingReference: values.bookingReference?.trim() ?? "",
  bookingSource: values.bookingSource?.trim() ?? "",
  bookingPlatform: values.bookingPlatform?.trim() ?? "",
  purchaseUrl: values.purchaseUrl?.trim() ?? "",
  hotelChain: values.hotelChain?.trim() ?? "",
  roomType: values.roomType?.trim() ?? "",
  totalPrice: values.totalPrice ?? null,
  currency: values.currency ?? "USD",
  latitude: values.latitude ?? null,
  longitude: values.longitude ?? null,
  cancellationPolicy: values.cancellationPolicy?.trim() ?? "",
  contactInfo: values.contactInfo?.trim() ?? "",
  policies: values.policies?.trim() ?? "",
  images: values.images?.trim() ?? "",
  notes: values.notes?.trim() ?? "",
  status: values.status ?? "proposed",
  votingDeadline: values.votingDeadline ? (values.votingDeadline instanceof Date ? values.votingDeadline.toISOString() : values.votingDeadline) : null,
});

export const HOTEL_FIELD_LABELS: Record<string, string> = {
  hotelName: "Hotel Name",
  hotelRating: "Rating",
  location: "Location",
  address: "Address",
  city: "City",
  zipCode: "Zip Code",
  country: "Country",
  checkInDate: "Check-in",
  checkOutDate: "Check-out",
  price: "Price",
  pricePerNight: "Price per Night",
  guestCount: "Guests",
  roomCount: "Rooms",
  rating: "Hotel Rating",
  amenities: "Amenities",
  platform: "Booking Platform",
  bookingUrl: "Booking Link",
  bookingReference: "Booking Reference",
  bookingSource: "Booking Source",
  bookingPlatform: "Platform",
  purchaseUrl: "Purchase URL",
  hotelChain: "Hotel Chain",
  roomType: "Room Type",
  totalPrice: "Total Price",
  currency: "Currency",
  status: "Status",
  latitude: "Latitude",
  longitude: "Longitude",
  cancellationPolicy: "Cancellation Policy",
  contactInfo: "Contact Info",
  policies: "Policies",
  images: "Images",
  notes: "Notes",
  votingDeadline: "Voting Deadline",
};

export const useHotelFieldLabel = (field: keyof typeof HOTEL_FIELD_LABELS) => {
  return useMemo(() => HOTEL_FIELD_LABELS[field] ?? field, [field]);
};
