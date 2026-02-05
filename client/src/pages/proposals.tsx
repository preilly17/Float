import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useTripRealtime } from "@/hooks/use-trip-realtime";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { cn, formatCurrency } from "@/lib/utils";
import { isUnauthorizedError } from "@/lib/authUtils";
import { differenceInCalendarDays, differenceInMinutes, format, formatDistanceToNow } from "date-fns";
import { filterActiveProposals, isCanceledStatus, normalizeProposalStatus } from "./proposalStatusFilters";
import {
  scheduledActivitiesQueryKey as buildScheduledActivitiesKey,
  proposalActivitiesQueryKey as buildProposalActivitiesKey,
} from "@/lib/activities/queryKeys";
import {
  ArrowLeft,
  Hotel,
  Plane,
  MapPin,
  Utensils,
  Users,
  Star,
  Clock,
  DollarSign,
  ExternalLink,
  Vote,
  AlertCircle,
  TrendingUp,
  Eye,
  Crown,
  Calendar,
  CheckCircle,
  XCircle,
  User as UserIcon,
  Activity,
  ThumbsUp,
  ThumbsDown,
  Pencil,
} from "lucide-react";
import { TravelLoading } from "@/components/LoadingSpinners";
import { AddActivityModal, type EditableActivity } from "@/components/add-activity-modal";
import { PageHeader } from "@/components/page-header";
import { LiveCountdown } from "@/components/live-countdown";
import { RestaurantProposalModal } from "@/components/restaurant-proposal-modal";
import type {
  HotelProposalWithDetails,
  FlightProposalWithDetails,
  ActivityWithDetails,
  RestaurantProposalWithDetails,
  TripWithDetails,
  ActivityInviteStatus,
  ProposalPermissions,
  User,
} from "@shared/schema";
import { sortActivitiesByStartTime } from "@/lib/activities/activityCreation";
import { updateActivityInviteStatus } from "@/lib/activities/updateInviteStatus";

type CancelableProposalType = "hotel" | "flight" | "restaurant" | "activity";

type ParsedApiError = {
  status?: number;
  message: string;
};

type RankingBase = {
  id: number;
  proposalId: number;
  userId: string;
  ranking: number;
  notes: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

type ProposalWithRankings<TRanking extends RankingBase> = {
  id: number;
  rankings: Array<TRanking & { user: User }>;
  currentUserRanking?: TRanking;
};

type RankingMutationContext<T> = {
  previousData: Array<{ key: readonly unknown[]; data: T | undefined }>;
};

const createOptimisticRankingId = (proposalId: number, ranking: number) =>
  -Math.abs(proposalId * 100 + ranking);

function applyOptimisticRankingUpdate<
  TRanking extends RankingBase,
  TProposal extends ProposalWithRankings<TRanking>,
>(
  proposal: TProposal,
  user: User,
  targetProposalId: number,
  rankingValue: number,
  now: string,
): TProposal {
  const existingRankingEntry = proposal.rankings.find(
    (entry) => entry.userId === user.id,
  );

  if (proposal.id === targetProposalId) {
    const rankingId =
      proposal.currentUserRanking?.id ??
      existingRankingEntry?.id ??
      createOptimisticRankingId(proposal.id, rankingValue);
    const createdAt =
      proposal.currentUserRanking?.createdAt ??
      existingRankingEntry?.createdAt ??
      now;
    const notes =
      proposal.currentUserRanking?.notes ?? existingRankingEntry?.notes ?? null;
    const rankingUser = existingRankingEntry?.user ?? user;

    const updatedRanking = {
      id: rankingId,
      proposalId: proposal.id,
      userId: user.id,
      ranking: rankingValue,
      notes,
      createdAt,
      updatedAt: now,
    } as TRanking;

    const rankingWithUser = {
      ...updatedRanking,
      user: rankingUser,
    } as TRanking & { user: User };

    const updatedRankings = proposal.rankings
      .filter((entry) => entry.userId !== user.id)
      .concat(rankingWithUser);

    return {
      ...proposal,
      rankings: updatedRankings,
      currentUserRanking: updatedRanking,
    };
  }

  if (
    proposal.currentUserRanking?.ranking === rankingValue ||
    existingRankingEntry?.ranking === rankingValue
  ) {
    const updatedRankings = proposal.rankings.filter(
      (entry) => entry.userId !== user.id,
    );

    return {
      ...proposal,
      rankings: updatedRankings,
      currentUserRanking: undefined,
    };
  }

  return proposal;
}

const parseApiError = (error: unknown): ParsedApiError => {
  if (error instanceof ApiError) {
    let message: string | undefined;
    if (error.data && typeof error.data === "object" && "message" in error.data) {
      const dataMessage = (error.data as { message?: unknown }).message;
      if (typeof dataMessage === "string") {
        message = dataMessage;
      } else if (dataMessage != null) {
        message = String(dataMessage);
      }
    }

    return { status: error.status, message: message ?? error.message };
  }

  if (error instanceof Error) {
    const match = error.message.match(/^(\d{3}):\s*(.*)$/);
    if (match) {
      const status = Number(match[1]);
      const body = match[2]?.trim();
      if (body) {
        const tryParse = (value: string) => {
          try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && "message" in parsed) {
              const parsedMessage = parsed.message;
              if (typeof parsedMessage === "string") {
                return parsedMessage;
              }
              if (parsedMessage != null) {
                return String(parsedMessage);
              }
            }
          } catch {
            return null;
          }
          return null;
        };

        const directParse = tryParse(body);
        if (directParse) {
          return { status, message: directParse };
        }

        const sanitized = body
          .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"');
        const sanitizedParse = tryParse(sanitized);
        if (sanitizedParse) {
          return { status, message: sanitizedParse };
        }

        return { status, message: body };
      }

      return { status, message: `Request failed with status ${status}` };
    }

    return { message: error.message };
  }

  return { message: "Something went wrong. Please try again." };
};

interface ProposalsPageProps {
  tripId?: number;
  embedded?: boolean;
  includeUserProposalsInCategories?: boolean;
  formatFlightDateTime?: (value?: string | Date | null) => string;
}

type ProposalTab = "my-proposals" | "hotels" | "flights" | "activities" | "restaurants";

const normalizeArrayData = <T,>(value: unknown): { items: T[]; isInvalid: boolean } => {
  if (Array.isArray(value)) {
    return { items: value as T[], isInvalid: false };
  }

  return { items: [], isInvalid: value !== undefined && value !== null };
};

const getInlineErrorMessage = (error: unknown, invalid: boolean, fallback: string) => {
  if (invalid) {
    return fallback;
  }

  if (error) {
    const parsed = parseApiError(error);
    return parsed.message || fallback;
  }

  return fallback;
};

type ActivityRsvpAction = "ACCEPT" | "DECLINE" | "WAITLIST" | "MAYBE";

const inviteStatusBadgeClasses: Record<ActivityInviteStatus, string> = {
  accepted: "bg-green-100 text-green-800 border-green-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  declined: "bg-red-100 text-red-800 border-red-200",
  waitlisted: "bg-blue-100 text-blue-800 border-blue-200",
};

const inviteStatusLabels: Record<ActivityInviteStatus, string> = {
  accepted: "Going",
  pending: "No response yet",
  declined: "Not going",
  waitlisted: "Waitlisted",
};

const actionToStatusMap: Record<ActivityRsvpAction, ActivityInviteStatus | null> = {
  ACCEPT: "accepted",
  DECLINE: "declined",
  WAITLIST: "waitlisted",
  MAYBE: "pending",
};

const normalizeTripId = (value?: string | number | null): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
};

function ProposalsPage({
  tripId: initialTripId,
  embedded = false,
  includeUserProposalsInCategories = false,
  formatFlightDateTime,
}: ProposalsPageProps = {}) {
  const { tripId: routeTripId } = useParams<{ tripId?: string }>();
  const tripId = useMemo(() => {
    if (initialTripId !== undefined && initialTripId !== null) {
      return normalizeTripId(initialTripId);
    }

    return normalizeTripId(routeTripId ?? null);
  }, [initialTripId, routeTripId]);

  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProposalTab>("hotels");
  const [editActivityModalOpen, setEditActivityModalOpen] = useState(false);
  const [activityToEdit, setActivityToEdit] = useState<EditableActivity | null>(null);
  const [editRestaurantModalOpen, setEditRestaurantModalOpen] = useState(false);
  const [restaurantToEdit, setRestaurantToEdit] = useState<RestaurantProposalWithDetails | null>(null);

  useTripRealtime(tripId, { enabled: !!tripId && isAuthenticated, userId: user?.id ?? null });

  const scheduledActivitiesQueryKey = useMemo(
    () => buildScheduledActivitiesKey(tripId ?? 0),
    [tripId],
  );
  const activityProposalsQueryKey = useMemo(
    () => buildProposalActivitiesKey(tripId ?? 0),
    [tripId],
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
    }
  }, [authLoading, isAuthenticated, toast]);

  // Fetch trip data
  const {
    data: trip,
    isLoading: tripLoading,
    error: tripError,
  } = useQuery<TripWithDetails>({
    queryKey: [`/api/trips/${tripId}`],
    enabled: !!tripId && isAuthenticated,
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/login";
        return false;
      }
      return failureCount < 3;
    },
  });

  // Fetch hotel proposals
  const {
    data: hotelProposalsData,
    isLoading: hotelProposalsLoading,
    error: hotelProposalsError,
    refetch: refetchHotelProposals,
  } = useQuery<unknown>({
    queryKey: [`/api/trips/${tripId}/hotel-proposals`],
    enabled: !!tripId && isAuthenticated,
  });

  const {
    data: myHotelProposalsData,
    isLoading: myHotelProposalsLoading,
    error: myHotelProposalsError,
  } = useQuery<unknown>({
    queryKey: [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
    enabled: !!tripId && isAuthenticated,
  });

  // Fetch flight proposals
  const {
    data: flightProposalsData,
    isLoading: flightProposalsLoading,
    error: flightProposalsError,
    refetch: refetchFlightProposals,
  } = useQuery<unknown>({
    queryKey: [`/api/trips/${tripId}/proposals/flights`],
    enabled: !!tripId && isAuthenticated,
  });

  const {
    data: myFlightProposalsData,
    isLoading: myFlightProposalsLoading,
    error: myFlightProposalsError,
  } = useQuery<unknown>({
    queryKey: [`/api/trips/${tripId}/proposals/flights?mineOnly=true`],
    enabled: !!tripId && isAuthenticated,
  });

  // Fetch activity and restaurant proposals
  const {
    data: rawActivityProposalsData,
    isLoading: activityProposalsLoading,
    error: activityProposalsError,
    refetch: refetchActivityProposals,
  } = useQuery<unknown>({
    queryKey: activityProposalsQueryKey,
    enabled: !!tripId && isAuthenticated,
  });

  const {
    data: restaurantProposalsData,
    isLoading: restaurantProposalsLoading,
    error: restaurantProposalsError,
    refetch: refetchRestaurantProposals,
  } = useQuery<unknown>({
    queryKey: ["/api/trips", tripId, "restaurant-proposals"],
    enabled: !!tripId && isAuthenticated,
  });

  type HotelRsvpInvite = {
    rsvp: {
      id: number;
      hotelId: number;
      userId: string;
      status: 'pending' | 'accepted' | 'declined';
      respondedAt: string | null;
      createdAt: string | null;
    };
    hotel: {
      id: number;
      name: string;
      address: string | null;
      city: string | null;
      country: string | null;
      checkInDate: string | null;
      checkOutDate: string | null;
      pricePerNight: string | null;
      totalPrice: string | null;
      status: string | null;
    };
    inviterName: string;
  };

  type FlightRsvpInvite = {
    rsvp: {
      id: number;
      flightId: number;
      userId: string;
      status: 'pending' | 'accepted' | 'declined';
      respondedAt: string | null;
      createdAt: string | null;
    };
    flight: {
      id: number;
      tripId: number;
      flightNumber: string;
      airline: string;
      airlineCode: string | null;
      departureAirport: string | null;
      departureCode: string | null;
      departureTime: string | null;
      arrivalAirport: string | null;
      arrivalCode: string | null;
      arrivalTime: string | null;
      price: string | null;
      currency: string | null;
      status: string | null;
    };
    inviterName: string;
  };

  const {
    data: hotelRsvpInvitesData,
    isLoading: hotelRsvpInvitesLoading,
    refetch: refetchHotelRsvpInvites,
  } = useQuery<HotelRsvpInvite[]>({
    queryKey: [`/api/trips/${tripId}/hotel-rsvp-invites`],
    enabled: !!tripId && isAuthenticated,
  });

  const {
    data: flightRsvpInvitesData,
    isLoading: flightRsvpInvitesLoading,
    refetch: refetchFlightRsvpInvites,
  } = useQuery<FlightRsvpInvite[]>({
    queryKey: [`/api/trips/${tripId}/flight-rsvp-invites`],
    enabled: !!tripId && isAuthenticated,
  });

  const hotelRsvpInvites = hotelRsvpInvitesData ?? [];
  const flightRsvpInvites = flightRsvpInvitesData ?? [];

  const respondToHotelRsvpMutation = useMutation({
    mutationFn: async ({ hotelId, status }: { hotelId: number; status: 'accepted' | 'declined' }) => {
      return await apiRequest(`/api/hotels/${hotelId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      void refetchHotelRsvpInvites();
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotels`] });
      toast({
        title: "Response recorded",
        description: "Your RSVP has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to respond to RSVP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const respondToFlightRsvpMutation = useMutation({
    mutationFn: async ({ flightId, status }: { flightId: number; status: 'accepted' | 'declined' }) => {
      return await apiRequest(`/api/flights/${flightId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      void refetchFlightRsvpInvites();
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/flights`] });
      toast({
        title: "Response recorded",
        description: "Your flight RSVP has been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to respond to flight RSVP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { items: hotelProposals, isInvalid: hotelProposalsInvalid } = normalizeArrayData<HotelProposalWithDetails>(
    hotelProposalsData,
  );
  const { items: myHotelProposalsFromApi, isInvalid: myHotelProposalsInvalid } = normalizeArrayData<HotelProposalWithDetails>(
    myHotelProposalsData,
  );
  const { items: flightProposals, isInvalid: flightProposalsInvalid } = normalizeArrayData<FlightProposalWithDetails>(
    flightProposalsData,
  );
  const { items: myFlightProposalsFromApi, isInvalid: myFlightProposalsInvalid } = normalizeArrayData<FlightProposalWithDetails>(
    myFlightProposalsData,
  );
  const { items: rawActivityProposals, isInvalid: activityProposalsInvalid } = normalizeArrayData<ActivityWithDetails>(
    rawActivityProposalsData,
  );
  const { items: restaurantProposals, isInvalid: restaurantProposalsInvalid } = normalizeArrayData<
    RestaurantProposalWithDetails
  >(restaurantProposalsData);

  const userId = user?.id ?? null;

  const hotelRankingsUsed = useMemo(() => {
    if (!userId) {
      return new Set<number>();
    }

    return new Set(
      filterActiveProposals(hotelProposals)
        .map((proposal) => proposal.currentUserRanking?.ranking)
        .filter((value): value is number => typeof value === "number"),
    );
  }, [hotelProposals, userId]);

  const flightRankingsUsed = useMemo(() => {
    if (!userId) {
      return new Set<number>();
    }

    return new Set(
      filterActiveProposals(flightProposals)
        .map((proposal) => proposal.currentUserRanking?.ranking)
        .filter((value): value is number => typeof value === "number"),
    );
  }, [flightProposals, userId]);

  const restaurantRankingsUsed = useMemo(() => {
    if (!userId) {
      return new Set<number>();
    }

    return new Set(
      filterActiveProposals(restaurantProposals)
        .map((proposal) => proposal.currentUserRanking?.ranking)
        .filter((value): value is number => typeof value === "number"),
    );
  }, [restaurantProposals, userId]);

  const hotelProposalsHasError = Boolean(hotelProposalsError) || hotelProposalsInvalid;
  const flightProposalsHasError = Boolean(flightProposalsError) || flightProposalsInvalid;
  const activityProposalsHasError = Boolean(activityProposalsError) || activityProposalsInvalid;
  const restaurantProposalsHasError = Boolean(restaurantProposalsError) || restaurantProposalsInvalid;

  const hotelProposalsErrorMessage = getInlineErrorMessage(
    hotelProposalsError,
    hotelProposalsInvalid,
    "We couldn't load the hotel proposals. Please try again.",
  );
  const flightProposalsErrorMessage = getInlineErrorMessage(
    flightProposalsError,
    flightProposalsInvalid,
    "We couldn't load the flight proposals. Please try again.",
  );
  const activityProposalsErrorMessage = getInlineErrorMessage(
    activityProposalsError,
    activityProposalsInvalid,
    "We couldn't load the activity proposals. Please try again.",
  );
  const restaurantProposalsErrorMessage = getInlineErrorMessage(
    restaurantProposalsError,
    restaurantProposalsInvalid,
    "We couldn't load the restaurant proposals. Please try again.",
  );

  // Hotel ranking mutation
  const rankHotelMutation = useMutation<
    unknown,
    unknown,
    { proposalId: number; ranking: number },
    RankingMutationContext<HotelProposalWithDetails[]>
  >({
    mutationFn: ({ proposalId, ranking }: { proposalId: number; ranking: number }) => {
      return apiRequest(`/api/hotel-proposals/${proposalId}/rank`, {
        method: "POST",
        body: { ranking },
      });
    },
    onMutate: async ({ proposalId, ranking }) => {
      const context: RankingMutationContext<HotelProposalWithDetails[]> = {
        previousData: [],
      };

      if (!tripId || !user) {
        return context;
      }

      const now = new Date().toISOString();
      const queryKeys: Array<readonly unknown[]> = [
        [`/api/trips/${tripId}/hotel-proposals`],
        [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
      ];

      context.previousData = queryKeys.map((key) => ({
        key,
        data: queryClient.getQueryData<HotelProposalWithDetails[] | undefined>(key),
      }));

      for (const key of queryKeys) {
        queryClient.setQueryData<HotelProposalWithDetails[] | undefined>(key, (previous) => {
          if (!previous) {
            return previous;
          }

          return previous.map((proposal) =>
            applyOptimisticRankingUpdate(proposal, user, proposalId, ranking, now),
          );
        });
      }

      return context;
    },
    onSuccess: () => {
      if (!tripId) {
        return;
      }
      // PROPOSALS FEATURE: refresh hotel proposals so saved-hotel votes appear immediately.
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
      });
      toast({
        title: "Vote Recorded",
        description: "Your hotel preference has been saved.",
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        for (const { key, data } of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }

      if (isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Error",
        description: "Failed to record your vote. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Flight ranking mutation
  const rankFlightMutation = useMutation<
    unknown,
    unknown,
    { proposalId: number; ranking: number },
    RankingMutationContext<FlightProposalWithDetails[]>
  >({
    mutationFn: ({ proposalId, ranking }: { proposalId: number; ranking: number }) => {
      return apiRequest(`/api/flight-proposals/${proposalId}/rank`, {
        method: "POST",
        body: { ranking },
      });
    },
    onMutate: async ({ proposalId, ranking }) => {
      const context: RankingMutationContext<FlightProposalWithDetails[]> = {
        previousData: [],
      };

      if (!tripId || !user) {
        return context;
      }

      const now = new Date().toISOString();
      const queryKeys: Array<readonly unknown[]> = [
        [`/api/trips/${tripId}/proposals/flights`],
        [`/api/trips/${tripId}/proposals/flights?mineOnly=true`],
      ];

      context.previousData = queryKeys.map((key) => ({
        key,
        data: queryClient.getQueryData<FlightProposalWithDetails[] | undefined>(key),
      }));

      for (const key of queryKeys) {
        queryClient.setQueryData<FlightProposalWithDetails[] | undefined>(key, (previous) => {
          if (!previous) {
            return previous;
          }

          return previous.map((proposal) =>
            applyOptimisticRankingUpdate(proposal, user, proposalId, ranking, now),
          );
        });
      }

      return context;
    },
    onSuccess: () => {
      if (!tripId) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals/flights`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/trips/${tripId}/proposals/flights?mineOnly=true`],
      });
      toast({
        title: "Vote Recorded",
        description: "Your flight preference has been saved.",
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        for (const { key, data } of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }

      if (isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Error",
        description: "Failed to record your vote. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Restaurant ranking mutation
  const rankRestaurantMutation = useMutation<
    unknown,
    unknown,
    { proposalId: number; ranking: number },
    RankingMutationContext<RestaurantProposalWithDetails[]>
  >({
    mutationFn: ({ proposalId, ranking }: { proposalId: number; ranking: number }) => {
      return apiRequest(`/api/restaurant-proposals/${proposalId}/rank`, {
        method: "POST",
        body: { ranking },
      });
    },
    onMutate: async ({ proposalId, ranking }) => {
      const context: RankingMutationContext<RestaurantProposalWithDetails[]> = {
        previousData: [],
      };

      if (!tripId || !user) {
        return context;
      }

      const now = new Date().toISOString();
      const key: readonly unknown[] = ["/api/trips", tripId, "restaurant-proposals"];

      context.previousData = [
        {
          key,
          data: queryClient.getQueryData<RestaurantProposalWithDetails[] | undefined>(key),
        },
      ];

      queryClient.setQueryData<RestaurantProposalWithDetails[] | undefined>(key, (previous) => {
        if (!previous) {
          return previous;
        }

        return previous.map((proposal) =>
          applyOptimisticRankingUpdate(proposal, user, proposalId, ranking, now),
        );
      });

      return context;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "restaurant-proposals"] });
      toast({
        title: "Vote Recorded",
        description: "Your restaurant preference has been saved.",
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousData) {
        for (const { key, data } of context.previousData) {
          queryClient.setQueryData(key, data);
        }
      }

      if (isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Error",
        description: "Failed to record your vote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelProposalMutation = useMutation({
    mutationFn: async ({
      type,
      proposalId,
    }: {
      type: CancelableProposalType;
      proposalId: number;
    }) => {
      const endpointMap = {
        hotel: `/api/hotel-proposals/${proposalId}/cancel`,
        flight: `/api/flight-proposals/${proposalId}/cancel`,
        restaurant: `/api/restaurant-proposals/${proposalId}/cancel`,
        activity: `/api/activities/${proposalId}/cancel`,
      } as const;

      const res = await apiRequest(endpointMap[type], { method: "POST" });
      try {
        return await res.json();
      } catch {
        return null;
      }
    },
    onSuccess: (_data, variables) => {
      if (!tripId) {
        return;
      }

      const { proposalId, type } = variables;

      if (type === "hotel") {
        queryClient.setQueryData<HotelProposalWithDetails[] | undefined>(
          [`/api/trips/${tripId}/hotel-proposals`],
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.setQueryData<HotelProposalWithDetails[] | undefined>(
          [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
        queryClient.invalidateQueries({
          queryKey: [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
        });
      } else if (type === "flight") {
        queryClient.setQueryData<FlightProposalWithDetails[] | undefined>(
          [`/api/trips/${tripId}/proposals/flights`],
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.setQueryData<FlightProposalWithDetails[] | undefined>(
          [`/api/trips/${tripId}/proposals/flights?mineOnly=true`],
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals/flights`] });
        queryClient.invalidateQueries({
          queryKey: [`/api/trips/${tripId}/proposals/flights?mineOnly=true`],
        });
      } else if (type === "restaurant") {
        queryClient.setQueryData<RestaurantProposalWithDetails[] | undefined>(
          ["/api/trips", tripId, "restaurant-proposals"],
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "restaurant-proposals"] });
      } else if (type === "activity") {
        queryClient.setQueryData<ActivityWithDetails[] | undefined>(
          activityProposalsQueryKey,
          (previous) => previous?.filter((proposal) => proposal.id !== proposalId),
        );
        queryClient.invalidateQueries({ queryKey: activityProposalsQueryKey });
      }

      toast({
        title: "Float canceled",
        description: "We’ve let everyone know this float is no longer happening.",
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error);

      if (parsedError.status === 401 || isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }

      let title = "Unable to cancel proposal";
      let description = parsedError.message || "Failed to cancel proposal. Please try again.";

      if (parsedError.status === 403) {
        title = "You can't cancel this float";
        if (!parsedError.message) {
          description = "Only the person who created it can cancel.";
        }
      } else if (parsedError.status === 404) {
        title = "Float not found";
        if (!parsedError.message) {
          description = "This float may have already been removed.";
        }
      }

      toast({
        title,
        description,
        variant: "destructive",
      });
    },
  });

  const convertActivityProposalMutation = useMutation<
    ActivityWithDetails,
    unknown,
    { activityId: number }
  >({
    mutationFn: async ({ activityId }) => {
      const res = await apiRequest(`/api/activities/${activityId}/convert`, { method: "POST" });
      return (await res.json()) as ActivityWithDetails;
    },
    onSuccess: (activity) => {
      if (!tripId) {
        return;
      }

      queryClient.setQueryData<ActivityWithDetails[] | undefined>(
        activityProposalsQueryKey,
        (previous) => previous?.filter((proposal) => proposal.id !== activity.id),
      );

      const updateActivitiesList = (existing: ActivityWithDetails[] | undefined) => {
        const base = existing ?? [];
        const filtered = base.filter((item) => item.id !== activity.id);
        return sortActivitiesByStartTime([...filtered, activity]);
      };

      queryClient.setQueryData<ActivityWithDetails[] | undefined>(
        scheduledActivitiesQueryKey,
        (previous) => updateActivitiesList(previous),
      );

      queryClient.invalidateQueries({ queryKey: activityProposalsQueryKey });
      queryClient.invalidateQueries({ queryKey: scheduledActivitiesQueryKey });

      const startTime = activity.startTime ? new Date(activity.startTime) : null;
      const hasValidStart = !!(startTime && !Number.isNaN(startTime.getTime()));
      const description =
        hasValidStart && startTime
          ? `We added this plan for ${format(startTime, "EEE, MMM d 'at' h:mm a")}. Everyone has been notified.`
          : "We added this plan to the calendar and notified the group.";

      toast({
        title: "Activity scheduled!",
        description,
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error);

      if (parsedError.status === 401 || isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }

      toast({
        title: "Unable to schedule activity",
        description: parsedError.message || "We couldn't schedule this activity. Please try again.",
        variant: "destructive",
      });
    },
  });

  const convertHotelProposalMutation = useMutation<
    HotelProposalWithDetails,
    unknown,
    { proposalId: number }
  >({
    mutationFn: async ({ proposalId }) => {
      const res = await apiRequest(`/api/hotel-proposals/${proposalId}/convert`, { method: "POST" });
      return (await res.json()) as HotelProposalWithDetails;
    },
    onSuccess: (proposal) => {
      if (!tripId) return;
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`] });
      toast({
        title: "Hotel scheduled!",
        description: `${proposal.hotelName} has been added to the calendar.`,
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error);
      if (parsedError.status === 401 || isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Unable to schedule hotel",
        description: parsedError.message || "We couldn't schedule this hotel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const convertFlightProposalMutation = useMutation<
    FlightProposalWithDetails,
    unknown,
    { proposalId: number }
  >({
    mutationFn: async ({ proposalId }) => {
      const res = await apiRequest(`/api/flight-proposals/${proposalId}/convert`, { method: "POST" });
      return (await res.json()) as FlightProposalWithDetails;
    },
    onSuccess: (proposal) => {
      if (!tripId) return;
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals/flights`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/proposals/flights?mineOnly=true`] });
      queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/flights`] });
      toast({
        title: "Flight scheduled!",
        description: `${proposal.airline} flight has been added to the calendar.`,
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error);
      if (parsedError.status === 401 || isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Unable to schedule flight",
        description: parsedError.message || "We couldn't schedule this flight. Please try again.",
        variant: "destructive",
      });
    },
  });

  const convertRestaurantProposalMutation = useMutation<
    RestaurantProposalWithDetails,
    unknown,
    { proposalId: number }
  >({
    mutationFn: async ({ proposalId }) => {
      const res = await apiRequest(`/api/restaurant-proposals/${proposalId}/convert`, { method: "POST" });
      return (await res.json()) as RestaurantProposalWithDetails;
    },
    onSuccess: (proposal) => {
      if (!tripId) return;
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "restaurant-proposals"] });
      toast({
        title: "Restaurant scheduled!",
        description: `${proposal.restaurantName} has been added to the calendar.`,
      });
    },
    onError: (error) => {
      const parsedError = parseApiError(error);
      if (parsedError.status === 401 || isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }
      toast({
        title: "Unable to schedule restaurant",
        description: parsedError.message || "We couldn't schedule this restaurant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const respondToInviteMutation = useMutation({
    mutationFn: async ({
      activityId,
      action,
    }: {
      activityId: number;
      action: ActivityRsvpAction;
    }) => {
      const response = await apiRequest(`/api/activities/${activityId}/responses`, {
        method: "POST",
        body: { rsvp: action },
      });
      return (await response.json()) as {
        invite: unknown;
        activity: ActivityWithDetails | null;
        promotedUserId?: string | null;
      };
    },
    onMutate: async ({ activityId, action }) => {
      const nextStatus = actionToStatusMap[action];
      if (!tripId || !nextStatus) {
        return {};
      }

      await Promise.all([
        queryClient.cancelQueries({ queryKey: activityProposalsQueryKey }),
        queryClient.cancelQueries({ queryKey: scheduledActivitiesQueryKey }),
      ]);

      const previousProposals =
        queryClient.getQueryData<ActivityWithDetails[]>(activityProposalsQueryKey) ?? null;
      const previousCalendarActivities =
        queryClient.getQueryData<ActivityWithDetails[]>(scheduledActivitiesQueryKey) ?? null;

      const applyUpdate = (list: ActivityWithDetails[] | null) =>
        list?.map((activity) =>
          activity.id === activityId ? applyOptimisticActivityInviteUpdate(activity, nextStatus) : activity,
        ) ?? null;

      const updatedProposals = applyUpdate(previousProposals);
      if (updatedProposals) {
        queryClient.setQueryData(activityProposalsQueryKey, updatedProposals);
      }

      const updatedCalendarActivities = applyUpdate(previousCalendarActivities);
      if (updatedCalendarActivities) {
        queryClient.setQueryData(scheduledActivitiesQueryKey, updatedCalendarActivities);
      }

      return {
        previousProposals,
        previousCalendarActivities,
      } as const;
    },
    onError: (error, _variables, context) => {
      if (isUnauthorizedError(error)) {
        window.location.href = "/login";
        return;
      }

      if (context) {
        if (context.previousProposals) {
          queryClient.setQueryData(activityProposalsQueryKey, context.previousProposals);
        }
        if (context.previousCalendarActivities) {
          queryClient.setQueryData(
            scheduledActivitiesQueryKey,
            context.previousCalendarActivities,
          );
        }
      }

      const parsedError = parseApiError(error);
      let description = parsedError.message || "We couldn’t save your RSVP. Please try again.";
      if (parsedError.status === 404 || parsedError.status === 409 || parsedError.status === 410) {
        description = "This item is no longer available to RSVP.";
      }

      toast({
        title: "Unable to update RSVP",
        description,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      if (tripId) {
        queryClient.invalidateQueries({ queryKey: activityProposalsQueryKey });
        queryClient.invalidateQueries({ queryKey: scheduledActivitiesQueryKey });
      }
    },
  });

  const CancelProposalButton = ({
    type,
    proposalId,
    proposalName,
    isCancelling,
    triggerTestId,
    disabled,
  }: {
    type: CancelableProposalType;
    proposalId: number;
    proposalName?: string | null;
    isCancelling: boolean;
    triggerTestId: string;
    disabled?: boolean;
  }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const typeLabelMap: Record<CancelableProposalType, string> = {
      hotel: "hotel",
      flight: "flight",
      restaurant: "restaurant",
      activity: "activity",
    };

    const proposalDisplayName = proposalName?.trim();
    const formattedName = proposalDisplayName ? `"${proposalDisplayName}"` : "this proposal";

    const handleConfirm = async () => {
      try {
        await cancelProposalMutation.mutateAsync({ type, proposalId });
        setIsDialogOpen(false);
      } catch {
        // Errors are handled via the mutation's onError callback.
      }
    };

    return (
      <AlertDialog
        open={isDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!isCancelling) {
            setIsDialogOpen(nextOpen);
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            disabled={disabled || isCancelling}
            data-testid={triggerTestId}
          >
            <XCircle className="w-4 h-4 mr-1" />
            {isCancelling ? "Canceling..." : "Cancel"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Cancel ${typeLabelMap[type]} proposal?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Canceling will remove ${formattedName} from everyone's proposals, clear it from calendars, and send a cancellation notice.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep proposal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isCancelling}>
              {isCancelling ? "Canceling..." : "Yes, cancel it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  type BaseProposal = {
    id: number;
    tripId: number;
    status?: string | null;
    proposedBy?: string | null;
    proposer?: { id?: string | null } | null;
    permissions?: ProposalPermissions | null;
  };

  type NormalizedActivityProposal = ActivityWithDetails & {
    tripId: number;
    proposedBy: string;
    proposer: ActivityWithDetails["poster"];
    status: string;
    activityName: string;
    rankings: [];
    averageRanking: number | null;
  };

  const getActivityProposalStatus = useCallback((activity: ActivityWithDetails) => {
    const normalizedStatus = normalizeProposalStatus(activity.status);

    if (normalizedStatus && normalizedStatus !== "active") {
      return normalizedStatus;
    }

    const normalizedType = typeof activity.type === "string" ? activity.type.toUpperCase() : "";
    if (normalizedType === "PROPOSE") {
      return "proposed";
    }

    if (normalizedType === "SCHEDULED") {
      return "scheduled";
    }

    const now = new Date();
    const startTime = activity.startTime ? new Date(activity.startTime) : null;
    const endTime = activity.endTime ? new Date(activity.endTime) : null;

    if (!startTime) {
      return "proposed";
    }

    if (endTime && endTime < now) {
      return "completed";
    }

    if (startTime <= now && (!endTime || endTime >= now)) {
      return "in-progress";
    }

    return "scheduled";
  }, []);

  const isMyProposal = useCallback(
    (proposal: BaseProposal): boolean => {
      if (proposal.permissions?.canCancel) {
        return true;
      }

      const viewerId = user?.id?.trim();
      if (!viewerId) {
        return false;
      }

      const proposedById =
        typeof proposal.proposedBy === "string" && proposal.proposedBy.trim().length > 0
          ? proposal.proposedBy.trim()
          : undefined;
      const proposerFallbackId =
        typeof proposal.proposer?.id === "string" && proposal.proposer.id.trim().length > 0
          ? proposal.proposer.id.trim()
          : undefined;

      const proposerId = proposedById ?? proposerFallbackId ?? null;
      return proposerId === viewerId;
    },
    [user?.id],
  );

  const applyOptimisticActivityInviteUpdate = useCallback(
    (activity: ActivityWithDetails, nextStatus: ActivityInviteStatus): ActivityWithDetails =>
      updateActivityInviteStatus(activity, {
        nextStatus,
        user: user ?? null,
        targetUserId: user?.id ?? activity.currentUserInvite?.userId ?? null,
      }),
    [user],
  );

  const applyActivityResponseFilter = useCallback(
    (items: NormalizedActivityProposal[]): NormalizedActivityProposal[] => {
      // Show all active proposals - accepted ones go to calendar, pending ones need response
      return filterActiveProposals(items);
    },
    [],
  );

  const getUserRanking = (
    rankings: Array<{ userId: string; ranking: number }>,
    userId: string,
  ) => {
    if (!userId) {
      return undefined;
    }

    return rankings.find((ranking) => ranking.userId === userId)?.ranking;
  };

  const getRankingColor = (ranking: number) => {
    switch (ranking) {
      case 1:
        return "text-green-600 bg-green-100";
      case 2:
        return "text-blue-600 bg-blue-100";
      case 3:
        return "text-orange-600 bg-orange-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  const calculateRoomsNeeded = (groupSize: number): number => {
    return Math.ceil(groupSize / 2);
  };

  const parsePrice = (priceStr: string | number): number => {
    if (typeof priceStr === "number") {
      return priceStr;
    }

    const cleanPrice = priceStr
      .toString()
      .replace(/[\$,\s]/g, "")
      .replace(/\/night|\/day|per night|per day/gi, "")
      .trim();

    const parsed = parseFloat(cleanPrice);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };

  const calculateGroupBudget = (pricePerNight: string | number, groupSize: number) => {
    const parsedPrice = parsePrice(pricePerNight);

    if (!groupSize || groupSize <= 0) {
      return {
        roomsNeeded: 0,
        totalCost: 0,
        perPersonCost: 0,
        pricePerRoom: parsedPrice,
        hasError: true,
        errorMessage: "Group size not available",
      } as const;
    }

    if (parsedPrice <= 0) {
      return {
        roomsNeeded: calculateRoomsNeeded(groupSize),
        totalCost: 0,
        perPersonCost: 0,
        pricePerRoom: 0,
        hasError: true,
        errorMessage: "Price information not available",
      } as const;
    }

    const roomsNeeded = calculateRoomsNeeded(groupSize);
    const totalCost = parsedPrice * roomsNeeded;
    const perPersonCost = totalCost / groupSize;

    return {
      roomsNeeded,
      totalCost,
      perPersonCost,
      pricePerRoom: parsedPrice,
      hasError: false,
    } as const;
  };

  const getUserInitials = (
    participant?: {
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      username?: string | null;
    } | null,
  ) => {
    if (!participant) {
      return "?";
    }

    const first = participant.firstName?.trim()?.charAt(0);
    const last = participant.lastName?.trim()?.charAt(0);
    if (first || last) {
      return `${first ?? ""}${last ?? ""}` || (first ?? last) || "?";
    }

    const usernameInitial = participant.username?.trim()?.charAt(0);
    if (usernameInitial) {
      return usernameInitial.toUpperCase();
    }

    const emailInitial = participant.email?.trim()?.charAt(0);
    return emailInitial ? emailInitial.toUpperCase() : "?";
  };

  const renderRankingPreview = (
    rankings: Array<{ id: number; user: { firstName?: string | null; lastName?: string | null; email?: string | null; username?: string | null; profileImageUrl?: string | null } }>,
  ) => {
    if (!rankings || rankings.length === 0) {
      return (
        <div className="flex items-center gap-2 text-xs text-neutral-500" data-testid="preview-no-votes">
          <Users className="w-4 h-4" />
          <span>No votes yet</span>
        </div>
      );
    }

    const visibleRankings = rankings.slice(0, 3);
    const remaining = rankings.length - visibleRankings.length;

    return (
      <div className="flex items-center gap-3 text-xs text-neutral-600" data-testid="preview-votes">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <div className="flex -space-x-2">
            {visibleRankings.map((ranking) => (
              <Avatar key={ranking.id} className="h-7 w-7 border border-white shadow-sm">
                {ranking.user.profileImageUrl ? (
                  <AvatarImage src={ranking.user.profileImageUrl ?? undefined} alt={ranking.user.firstName ?? ranking.user.username ?? "Group member"} />
                ) : null}
                <AvatarFallback>{getUserInitials(ranking.user)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
        <span className="font-medium">
          {rankings.length} {rankings.length === 1 ? "vote" : "votes"}
        </span>
        {remaining > 0 && <span className="text-neutral-400">+{remaining} more</span>}
      </div>
    );
  };

  const renderStatusBadge = (status: string, averageRanking?: number, type: "activity" | "proposal" | "hotel" | "flight" | "restaurant" = "proposal") => {
    const normalizedStatus = isCanceledStatus(status) ? "canceled" : (status || "active");
    return (
      <StatusBadge
        status={normalizedStatus}
        type={type}
        averageRanking={averageRanking}
      />
    );
  };

  const ProposalDateTimeSection = ({ 
    dateLabel, 
    timeLabel, 
    endDateLabel,
    testIdPrefix 
  }: { 
    dateLabel: string | null; 
    timeLabel?: string | null;
    endDateLabel?: string | null;
    testIdPrefix: string;
  }) => (
    <div className="flex flex-wrap items-center gap-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/50 dark:to-slate-700/50 rounded-lg border border-blue-100 dark:border-slate-600/50 mb-4">
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Date</div>
          <div className="font-semibold text-neutral-900 dark:text-white" data-testid={`${testIdPrefix}-date`}>
            {dateLabel || "To be decided"}
          </div>
        </div>
      </div>
      {timeLabel && (
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">Time</div>
            <div className="font-semibold text-neutral-900 dark:text-white" data-testid={`${testIdPrefix}-time`}>
              {timeLabel}
            </div>
          </div>
        </div>
      )}
      {endDateLabel && (
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">End Date</div>
            <div className="font-semibold text-neutral-900 dark:text-white" data-testid={`${testIdPrefix}-end-date`}>
              {endDateLabel}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const ActivityProposalCard = ({ proposal }: { proposal: NormalizedActivityProposal }) => {
    const startTime = proposal.startTime ? new Date(proposal.startTime) : null;
    const endTime = proposal.endTime ? new Date(proposal.endTime) : null;
    const createdAt = proposal.createdAt ? new Date(proposal.createdAt) : null;
    const votingDeadline = proposal.votingDeadline ? new Date(proposal.votingDeadline) : null;
    const isCanceled = isCanceledStatus(proposal.status);
    const isProposalActivity = proposal.type === "PROPOSE";
    const canCancel = isMyProposal(proposal) && !isCanceled;
    const canConvert = isMyProposal(proposal) && !isCanceled && isProposalActivity;
    const hasStartTime = Boolean(proposal.startTime);
    const isConverting =
      convertActivityProposalMutation.isPending
      && convertActivityProposalMutation.variables?.activityId === proposal.id;
    const isCancelling =
      cancelProposalMutation.isPending &&
      cancelProposalMutation.variables?.proposalId === proposal.id &&
      cancelProposalMutation.variables?.type === "activity";

    const durationMinutes =
      startTime && endTime ? Math.max(differenceInMinutes(endTime, startTime), 0) : null;

    const formattedDuration = (() => {
      if (durationMinutes === null) {
        return null;
      }

      if (durationMinutes === 0) {
        return "Less than 1 minute";
      }

      if (durationMinutes < 60) {
        return `${durationMinutes} min`;
      }

      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    })();

    const acceptedCount =
      typeof proposal.acceptedCount === "number"
        ? proposal.acceptedCount
        : proposal.acceptances?.length ?? 0;

    const pendingCount = proposal.pendingCount ?? 0;
    const declinedCount = proposal.declinedCount ?? 0;

    const proposerName =
      proposal.proposer?.firstName?.trim() ||
      proposal.proposer?.username?.trim() ||
      proposal.proposer?.email?.trim() ||
      "Group member";

    const currentInvite =
      proposal.currentUserInvite
        ?? proposal.invites?.find((invite) => invite.userId === user?.id)
        ?? null;

    const derivedStatus: ActivityInviteStatus = currentInvite?.status
      ?? (proposal.isAccepted ? "accepted" : "pending");
    const statusLabel = inviteStatusLabels[derivedStatus];
    const badgeClasses = inviteStatusBadgeClasses[derivedStatus];
    const isResponding =
      respondToInviteMutation.isPending &&
      respondToInviteMutation.variables?.activityId === proposal.id;

    const viewerCanRespond = !isMyProposal(proposal);
    const isAcceptedVote = derivedStatus === "accepted";
    const isDeclinedVote = derivedStatus === "declined";
    const responseHeading = isProposalActivity ? "Your vote" : "Your RSVP";

    const submitAction = (action: ActivityRsvpAction) => {
      const targetStatus = actionToStatusMap[action];
      if (targetStatus && targetStatus === derivedStatus) {
        return;
      }

      respondToInviteMutation.mutate({ activityId: proposal.id, action });
    };

    const handleThumbsUp = () => {
      if (isAcceptedVote) {
        submitAction("MAYBE");
        return;
      }
      submitAction("ACCEPT");
    };

    const handleThumbsDown = () => {
      if (isDeclinedVote) {
        submitAction("MAYBE");
        return;
      }
      submitAction("DECLINE");
    };

    return (
      <Card className="mb-4 hover:shadow-md transition-shadow border-dashed border-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20" data-testid={`card-activity-proposal-${proposal.id}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-activity-name-${proposal.id}`}>
                <MapPin className="w-5 h-5 text-purple-600" />
                {proposal.activityName}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-2 mt-1 text-neutral-600">
                {proposal.category ? (
                  <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs" data-testid={`text-activity-category-${proposal.id}`}>
                    {proposal.category}
                  </span>
                ) : null}
                {startTime ? (
                  <span className="flex items-center gap-1" data-testid={`text-activity-start-${proposal.id}`}>
                    <Calendar className="w-3 h-3" />
                    {format(startTime, "EEE, MMM d • h:mm a")}
                  </span>
                ) : (
                  <span className="flex items-center gap-1" data-testid={`text-activity-start-${proposal.id}`}>
                    <Calendar className="w-3 h-3" />
                    Date to be decided
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {renderStatusBadge(proposal.status || "scheduled", undefined, "activity")}
              {votingDeadline && isProposalActivity ? (
                <div data-testid={`text-activity-deadline-${proposal.id}`}>
                  <LiveCountdown deadline={votingDeadline} />
                </div>
              ) : null}
              {canConvert ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => convertActivityProposalMutation.mutate({ activityId: proposal.id })}
                    disabled={!hasStartTime || isConverting}
                    title={!hasStartTime ? "Add a date and time before scheduling this activity." : undefined}
                    data-testid={`button-convert-activity-proposal-${proposal.id}`}
                  >
                    {isConverting ? "Confirming..." : "Confirm Selection"}
                  </Button>
                  {!hasStartTime ? (
                    <span className="text-xs text-neutral-500 text-right max-w-[12rem]">
                      Add a date &amp; time to enable scheduling.
                    </span>
                  ) : null}
                </>
              ) : null}
              {canCancel ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActivityToEdit({
                        id: proposal.id,
                        name: proposal.activityName ?? proposal.name,
                        description: proposal.description,
                        startTime: proposal.startTime,
                        endTime: proposal.endTime,
                        location: proposal.location,
                        cost: proposal.cost,
                        maxCapacity: proposal.maxCapacity,
                        category: proposal.category,
                        type: proposal.type as "PROPOSE" | "SCHEDULED",
                        votingDeadline: proposal.votingDeadline,
                      });
                      setEditActivityModalOpen(true);
                    }}
                    data-testid={`button-edit-activity-proposal-${proposal.id}`}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <CancelProposalButton
                    type="activity"
                    proposalId={proposal.id}
                    proposalName={proposal.activityName ?? proposal.name}
                    isCancelling={isCancelling}
                    triggerTestId={`button-cancel-activity-proposal-${proposal.id}`}
                  />
                </div>
              ) : null}
              {createdAt ? (
                <span className="text-xs text-neutral-500" data-testid={`text-activity-created-${proposal.id}`}>
                  Added {formatDistanceToNow(createdAt, { addSuffix: true })}
                </span>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProposalDateTimeSection
            dateLabel={startTime ? format(startTime, "EEE, MMM d, yyyy") : null}
            timeLabel={startTime ? `${format(startTime, "h:mm a")}${formattedDuration ? ` (${formattedDuration})` : ""}` : null}
            testIdPrefix={`activity-proposal-${proposal.id}`}
          />
          <div className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-600">
            <div className="flex items-center gap-2" data-testid={`text-activity-location-${proposal.id}`}>
              <MapPin className="w-4 h-4 text-neutral-400" />
              {proposal.location ? proposal.location : "Location TBD"}
            </div>
            <div className="flex items-center gap-2" data-testid={`text-activity-attendance-${proposal.id}`}>
              <Users className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-neutral-700">{acceptedCount}</span> going
              {pendingCount > 0 ? (
                <span className="text-neutral-400">• {pendingCount} pending</span>
              ) : null}
              {declinedCount > 0 ? (
                <span className="text-neutral-400">• {declinedCount} declined</span>
              ) : null}
            </div>
          </div>

          {proposal.description ? (
            <p className="text-sm text-neutral-600" data-testid={`text-activity-description-${proposal.id}`}>
              {proposal.description}
            </p>
          ) : null}

          <div className="flex items-center justify-between text-sm text-neutral-600">
            <div className="flex items-center gap-2" data-testid={`text-activity-proposer-${proposal.id}`}>
              <UserIcon className="w-4 h-4 text-neutral-400" />
              Proposed by {proposerName}
            </div>
            <Link
              href={`/trip/${proposal.tripId}`}
              className="text-primary hover:underline flex items-center gap-1"
              data-testid={`link-view-activity-${proposal.id}`}
            >
              <ExternalLink className="w-4 h-4" /> View in trip
            </Link>
          </div>

          {viewerCanRespond ? (
            <div className="mt-4 border-t pt-4 space-y-3" data-testid={`activity-response-actions-${proposal.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                <Badge
                  variant="secondary"
                  className={`border ${badgeClasses}`}
                  data-testid={`badge-activity-response-${proposal.id}`}
                >
                  {statusLabel}
                </Badge>
                <span>{responseHeading}</span>
              </div>
              {isProposalActivity ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleThumbsUp}
                    disabled={isResponding}
                    aria-label={isAcceptedVote ? "Remove thumbs up" : "Give thumbs up"}
                    aria-pressed={isAcceptedVote}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center p-0 text-neutral-600",
                      isAcceptedVote
                        ? "border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90"
                        : "border-neutral-300 hover:border-emerald-500 hover:text-emerald-600",
                    )}
                    data-testid={`button-thumbs-up-activity-proposal-${proposal.id}`}
                  >
                    <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Thumbs up</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleThumbsDown}
                    disabled={isResponding}
                    aria-label={isDeclinedVote ? "Remove thumbs down" : "Give thumbs down"}
                    aria-pressed={isDeclinedVote}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center p-0 text-neutral-600",
                      isDeclinedVote
                        ? "border-transparent bg-red-600 text-white hover:bg-red-600/90"
                        : "border-neutral-300 hover:border-red-500 hover:text-red-600",
                    )}
                    data-testid={`button-thumbs-down-activity-proposal-${proposal.id}`}
                  >
                    <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Thumbs down</span>
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => submitAction("ACCEPT")}
                    disabled={isResponding}
                    data-testid={`button-accept-activity-proposal-${proposal.id}`}
                  >
                    {isResponding && respondToInviteMutation.variables?.action === "ACCEPT"
                      ? "Updating..."
                      : "Accept"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => submitAction("DECLINE")}
                    disabled={isResponding}
                    data-testid={`button-decline-activity-proposal-${proposal.id}`}
                  >
                    {isResponding && respondToInviteMutation.variables?.action === "DECLINE"
                      ? "Updating..."
                      : "Decline"}
                  </Button>
                </div>
              )}
              {isResponding ? (
                <div
                  className="text-xs text-neutral-500"
                  data-testid={`text-activity-rsvp-updating-${proposal.id}`}
                >
                  Updating response…
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  // Restaurant proposal card component
  const RestaurantProposalCard = ({ proposal }: { proposal: RestaurantProposalWithDetails }) => {
    const userRanking =
      proposal.currentUserRanking?.ranking ??
      getUserRanking(proposal.rankings || [], user?.id || "");
    
    const isCanceled = isCanceledStatus(proposal.status);
    const isScheduled = proposal.status === "scheduled";
    const canCancel = isMyProposal(proposal) && !isCanceled;
    const canConvert = isMyProposal(proposal) && !isCanceled && !isScheduled && (proposal.status === "active" || proposal.status === "proposed");
    const isCancelling =
      cancelProposalMutation.isPending &&
      cancelProposalMutation.variables?.proposalId === proposal.id &&
      cancelProposalMutation.variables?.type === "restaurant";
    const isConverting =
      convertRestaurantProposalMutation.isPending &&
      convertRestaurantProposalMutation.variables?.proposalId === proposal.id;
    const votingDeadline = proposal.votingDeadline ? new Date(proposal.votingDeadline) : null;

    return (
      <Card className="mb-4 hover:shadow-md transition-shadow border-dashed border-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20" data-testid={`card-restaurant-proposal-${proposal.id}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-restaurant-name-${proposal.id}`}>
                <Utensils className="w-5 h-5 text-green-600" />
                {proposal.restaurantName}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <span className="bg-gray-100 px-2 py-1 rounded text-xs" data-testid={`text-restaurant-cuisine-${proposal.id}`}>
                  {proposal.cuisineType || 'Restaurant'}
                </span>
                <span className="text-gray-600" data-testid={`text-restaurant-price-range-${proposal.id}`}>
                  {proposal.priceRange}
                </span>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {renderStatusBadge(proposal.status || "active", proposal.averageRanking ?? undefined, "restaurant")}
              {votingDeadline && !isCanceled && (
                <div data-testid={`text-restaurant-deadline-${proposal.id}`}>
                  <LiveCountdown deadline={votingDeadline} />
                </div>
              )}
              {isMyProposal(proposal) && !isCanceled && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRestaurantToEdit(proposal);
                    setEditRestaurantModalOpen(true);
                  }}
                  data-testid={`button-edit-restaurant-proposal-${proposal.id}`}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              )}
              {canConvert && (
                <Button
                  size="sm"
                  onClick={() => convertRestaurantProposalMutation.mutate({ proposalId: proposal.id })}
                  disabled={isConverting}
                  data-testid={`button-convert-restaurant-proposal-${proposal.id}`}
                >
                  {isConverting ? "Confirming..." : "Confirm Selection"}
                </Button>
              )}
              {canCancel && (
                <CancelProposalButton
                  type="restaurant"
                  proposalId={proposal.id}
                  proposalName={proposal.restaurantName}
                  isCancelling={isCancelling}
                  triggerTestId={`button-cancel-restaurant-proposal-${proposal.id}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProposalDateTimeSection
            dateLabel={
              Array.isArray(proposal.preferredDates) && proposal.preferredDates.length > 0 && typeof proposal.preferredDates[0] === "string"
                ? `${format(new Date(proposal.preferredDates[0]), "EEE, MMM d, yyyy")}${proposal.preferredDates.length > 1 ? ` (+${proposal.preferredDates.length - 1} more)` : ""}`
                : null
            }
            timeLabel={proposal.preferredMealTime ? proposal.preferredMealTime.charAt(0).toUpperCase() + proposal.preferredMealTime.slice(1) : null}
            testIdPrefix={`restaurant-proposal-${proposal.id}`}
          />

          <div className="mb-4">
            {(!proposal.rankings || proposal.rankings.length === 0) ? (
              <div className="flex items-center gap-2 text-xs text-neutral-500" data-testid="preview-no-votes">
                <Users className="w-4 h-4" />
                <span>No votes yet</span>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-xs text-neutral-600" data-testid="preview-votes">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-green-600" />
                  <div className="flex -space-x-2">
                    {proposal.rankings.filter(r => r.ranking === 1).slice(0, 3).map((ranking) => (
                      <Avatar key={ranking.id} className="h-6 w-6 border-2 border-green-500 shadow-sm">
                        {ranking.user?.profileImageUrl ? (
                          <AvatarImage src={ranking.user.profileImageUrl ?? undefined} alt={ranking.user.firstName ?? ranking.user.username ?? "Member"} />
                        ) : null}
                        <AvatarFallback className="text-[10px]">{getUserInitials(ranking.user)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {proposal.rankings.filter(r => r.ranking === 1).length > 3 && (
                    <span className="text-green-600">+{proposal.rankings.filter(r => r.ranking === 1).length - 3}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4 text-red-600" />
                  <div className="flex -space-x-2">
                    {proposal.rankings.filter(r => r.ranking === -1).slice(0, 3).map((ranking) => (
                      <Avatar key={ranking.id} className="h-6 w-6 border-2 border-red-500 shadow-sm">
                        {ranking.user?.profileImageUrl ? (
                          <AvatarImage src={ranking.user.profileImageUrl ?? undefined} alt={ranking.user.firstName ?? ranking.user.username ?? "Member"} />
                        ) : null}
                        <AvatarFallback className="text-[10px]">{getUserInitials(ranking.user)}</AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  {proposal.rankings.filter(r => r.ranking === -1).length > 3 && (
                    <span className="text-red-600">+{proposal.rankings.filter(r => r.ranking === -1).length - 3}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm" data-testid={`text-restaurant-address-${proposal.id}`}>
                {proposal.address}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="font-medium" data-testid={`text-restaurant-rating-${proposal.id}`}>
                {proposal.rating ? parseFloat(proposal.rating.toString()).toFixed(1) : 'N/A'} rating
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <UserIcon className="w-4 h-4" />
              <span>Proposed by {proposal.proposer?.firstName || 'Unknown'}</span>
              <Clock className="w-4 h-4 ml-2" />
              <span data-testid={`text-restaurant-created-${proposal.id}`}>
                {proposal.createdAt ? formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true }) : 'Unknown'}
              </span>
            </div>
            {(proposal.rankings?.length ?? 0) > 0 && (() => {
              const thumbsUp = proposal.rankings?.filter(r => r.ranking === 1).length ?? 0;
              const thumbsDown = proposal.rankings?.filter(r => r.ranking === -1).length ?? 0;
              return (
                <div className="flex items-center gap-3 text-sm" data-testid={`text-restaurant-votes-${proposal.id}`}>
                  <span className="flex items-center gap-1 text-green-600">
                    <ThumbsUp className="w-4 h-4" /> {thumbsUp}
                  </span>
                  <span className="flex items-center gap-1 text-red-600">
                    <ThumbsDown className="w-4 h-4" /> {thumbsDown}
                  </span>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-3 items-center">
            {(() => {
              const proposerId = proposal.proposedBy || proposal.proposer?.id;
              const isActuallyMyProposal = proposerId === user?.id;
              return !isActuallyMyProposal && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={userRanking === 1 ? "default" : "outline"}
                    className={userRanking === 1 ? "bg-green-600 hover:bg-green-700" : ""}
                    onClick={() => {
                      if (userRanking === 1) {
                        rankRestaurantMutation.mutate({ proposalId: proposal.id, ranking: 0 });
                      } else {
                        rankRestaurantMutation.mutate({ proposalId: proposal.id, ranking: 1 });
                      }
                    }}
                    data-testid={`button-thumbs-up-${proposal.id}`}
                  >
                    <ThumbsUp className="w-4 h-4 mr-1" />
                    I'm in
                  </Button>
                  <Button
                    size="sm"
                    variant={userRanking === -1 ? "default" : "outline"}
                    className={userRanking === -1 ? "bg-red-600 hover:bg-red-700" : ""}
                    onClick={() => {
                      if (userRanking === -1) {
                        rankRestaurantMutation.mutate({ proposalId: proposal.id, ranking: 0 });
                      } else {
                        rankRestaurantMutation.mutate({ proposalId: proposal.id, ranking: -1 });
                      }
                    }}
                    data-testid={`button-thumbs-down-${proposal.id}`}
                  >
                    <ThumbsDown className="w-4 h-4 mr-1" />
                    Not for me
                  </Button>
                </div>
              );
            })()}
            
            {proposal.website && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(proposal.website ?? undefined, '_blank')}
                data-testid={`button-view-restaurant-${proposal.id}`}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                View Restaurant
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Hotel proposal card component
  const HotelProposalCard = ({ proposal }: { proposal: HotelProposalWithDetails }) => {
    const userRanking =
      proposal.currentUserRanking?.ranking ??
      getUserRanking(proposal.rankings || [], user?.id || "");
    const groupSize = trip?.members?.length || 0;
    const budgetBreakdown = calculateGroupBudget(proposal.price, groupSize);

    const checkInDate = proposal.checkInDate ? new Date(proposal.checkInDate) : null;
    const checkOutDate = proposal.checkOutDate ? new Date(proposal.checkOutDate) : null;

    const stayDateLabel = (() => {
      if (!checkInDate || !checkOutDate) {
        return null;
      }

      if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
        return null;
      }

      try {
        const checkInLabel = format(checkInDate, "MMM d, yyyy");
        const checkOutLabel = format(checkOutDate, "MMM d, yyyy");
        return `${checkInLabel} → ${checkOutLabel}`;
      } catch {
        return null;
      }
    })();

    const stayNights = (() => {
      if (!checkInDate || !checkOutDate) {
        return null;
      }

      const diff = differenceInCalendarDays(checkOutDate, checkInDate);
      if (!Number.isFinite(diff) || diff <= 0) {
        return null;
      }

      return diff;
    })();

    const addressLine = proposal.address?.trim().length ? proposal.address : proposal.location;

    const normalizePriceString = (value: string | null | undefined) => {
      if (!value) {
        return null;
      }

      const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(numeric) ? numeric : null;
    };

    const totalPriceNumber = normalizePriceString(proposal.price ?? null);
    const totalPriceDisplay = totalPriceNumber !== null
      ? formatCurrency(totalPriceNumber, {
          currency: proposal.currency ?? "USD",
          fallback: proposal.price ?? "Price TBD",
        })
      : proposal.price ?? "Price TBD";

    const nightlyPriceNumber = normalizePriceString(proposal.pricePerNight ?? null);
    const nightlyPriceDisplay = nightlyPriceNumber !== null
      ? formatCurrency(nightlyPriceNumber, {
          currency: proposal.currency ?? "USD",
          fallback: proposal.pricePerNight ?? undefined,
        })
      : proposal.pricePerNight;

    const isCanceled = isCanceledStatus(proposal.status);
    const isScheduled = proposal.status === "scheduled";
    const canCancel = isMyProposal(proposal) && !isCanceled;
    const canConvert = isMyProposal(proposal) && !isCanceled && !isScheduled && (proposal.status === "active" || proposal.status === "proposed");
    const isCancelling =
      cancelProposalMutation.isPending &&
      cancelProposalMutation.variables?.proposalId === proposal.id &&
      cancelProposalMutation.variables?.type === "hotel";
    const isConverting =
      convertHotelProposalMutation.isPending &&
      convertHotelProposalMutation.variables?.proposalId === proposal.id;
    const votingDeadline = proposal.votingDeadline ? new Date(proposal.votingDeadline) : null;

    return (
      <Card className="mb-4 hover:shadow-md transition-shadow border-dashed border-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20" data-testid={`card-hotel-proposal-${proposal.id}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-hotel-name-${proposal.id}`}>
                <Hotel className="w-5 h-5 text-blue-600" />
                {proposal.hotelName}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <MapPin className="w-4 h-4" />
                <span data-testid={`text-hotel-location-${proposal.id}`}>{proposal.location}</span>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {renderStatusBadge(proposal.status || "active", proposal.averageRanking ?? undefined, "hotel")}
              {votingDeadline && !isCanceled && (
                <div data-testid={`text-hotel-deadline-${proposal.id}`}>
                  <LiveCountdown deadline={votingDeadline} />
                </div>
              )}
              {canConvert && (
                <Button
                  size="sm"
                  onClick={() => convertHotelProposalMutation.mutate({ proposalId: proposal.id })}
                  disabled={isConverting}
                  data-testid={`button-convert-hotel-proposal-${proposal.id}`}
                >
                  {isConverting ? "Confirming..." : "Confirm Selection"}
                </Button>
              )}
              {canCancel && (
                <CancelProposalButton
                  type="hotel"
                  proposalId={proposal.id}
                  proposalName={proposal.hotelName}
                  isCancelling={isCancelling}
                  triggerTestId={`button-cancel-hotel-proposal-${proposal.id}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProposalDateTimeSection
            dateLabel={checkInDate && !Number.isNaN(checkInDate.getTime()) ? format(checkInDate, "EEE, MMM d, yyyy") : null}
            timeLabel={stayNights ? `${stayNights} night${stayNights > 1 ? "s" : ""}` : null}
            endDateLabel={checkOutDate && !Number.isNaN(checkOutDate.getTime()) ? format(checkOutDate, "EEE, MMM d, yyyy") : null}
            testIdPrefix={`hotel-proposal-${proposal.id}`}
          />

          <div className="mb-4">
            {renderRankingPreview(proposal.rankings ?? [])}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="font-medium" data-testid={`text-hotel-rating-${proposal.id}`}>
                {proposal.rating} stars
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="font-medium" data-testid={`text-hotel-price-${proposal.id}`}>
                {totalPriceDisplay}
                {stayNights ? (
                  <span className="ml-1 text-xs text-neutral-600">for {stayNights} night{stayNights > 1 ? "s" : ""}</span>
                ) : null}
              </span>
            </div>
            {nightlyPriceDisplay ? (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="font-medium" data-testid={`text-hotel-nightly-${proposal.id}`}>
                  {nightlyPriceDisplay} / night
                </span>
              </div>
            ) : null}
          </div>

          {/* Group Budget Section */}
          {groupSize > 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200" data-testid={`group-budget-${proposal.id}`}>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-blue-900">Group Budget Breakdown</h4>
              </div>
              
              {budgetBreakdown.hasError ? (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded border border-amber-200" data-testid={`error-message-${proposal.id}`}>
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{budgetBreakdown.errorMessage}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex flex-col" data-testid={`text-group-size-${proposal.id}`}>
                    <span className="text-neutral-600">For your group</span>
                    <span className="font-semibold text-blue-900">
                      {groupSize} people, {budgetBreakdown.roomsNeeded} room{budgetBreakdown.roomsNeeded > 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-neutral-500">
                      Assuming 2 people per room
                    </span>
                  </div>
                  <div className="flex flex-col" data-testid={`text-total-cost-${proposal.id}`}>
                    <span className="text-neutral-600">Total per night</span>
                    <span className="font-semibold text-green-700">
                      ${budgetBreakdown.totalCost.toFixed(2)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {budgetBreakdown.roomsNeeded} × ${budgetBreakdown.pricePerRoom}
                    </span>
                  </div>
                  <div className="flex flex-col" data-testid={`text-per-person-cost-${proposal.id}`}>
                    <span className="text-neutral-600">Per person/night</span>
                    <span className="font-semibold text-purple-700">
                      ${budgetBreakdown.perPersonCost.toFixed(2)}
                    </span>
                    <span className="text-xs text-neutral-500">
                      Split {groupSize} ways
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {proposal.amenities && (
            <div className="mb-4">
              <p className="text-sm text-neutral-600" data-testid={`text-hotel-amenities-${proposal.id}`}>
                <strong>Amenities:</strong> {proposal.amenities}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <UserIcon className="w-4 h-4" />
              <span>Proposed by {proposal.proposer?.firstName || 'Unknown'}</span>
              <Clock className="w-4 h-4 ml-2" />
              <span data-testid={`text-hotel-created-${proposal.id}`}>
                {proposal.createdAt ? formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true }) : 'Unknown'}
              </span>
            </div>
            {proposal.averageRanking != null && (
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span data-testid={`text-hotel-avg-ranking-${proposal.id}`}>
                  Avg: {proposal.averageRanking.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <Select
              value={userRanking?.toString() || ""}
              onValueChange={(value) => {
                rankHotelMutation.mutate({ 
                  proposalId: proposal.id, 
                  ranking: parseInt(value) 
                });
              }}
              data-testid={`select-hotel-ranking-${proposal.id}`}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Rank this option" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="1"
                  data-testid={`option-ranking-1-${proposal.id}`}
                  disabled={hotelRankingsUsed.has(1) && userRanking !== 1}
                >
                  🥇 1st Choice
                </SelectItem>
                <SelectItem
                  value="2"
                  data-testid={`option-ranking-2-${proposal.id}`}
                  disabled={hotelRankingsUsed.has(2) && userRanking !== 2}
                >
                  🥈 2nd Choice
                </SelectItem>
                <SelectItem
                  value="3"
                  data-testid={`option-ranking-3-${proposal.id}`}
                  disabled={hotelRankingsUsed.has(3) && userRanking !== 3}
                >
                  🥉 3rd Choice
                </SelectItem>
                <SelectItem
                  value="4"
                  data-testid={`option-ranking-4-${proposal.id}`}
                  disabled={hotelRankingsUsed.has(4) && userRanking !== 4}
                >
                  4th Choice
                </SelectItem>
                <SelectItem
                  value="5"
                  data-testid={`option-ranking-5-${proposal.id}`}
                  disabled={hotelRankingsUsed.has(5) && userRanking !== 5}
                >
                  5th Choice
                </SelectItem>
              </SelectContent>
            </Select>
            
            {userRanking && (
              <Badge className={getRankingColor(userRanking)} data-testid={`badge-user-ranking-${proposal.id}`}>
                Your choice: #{userRanking}
              </Badge>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(proposal.bookingUrl, '_blank')}
              data-testid={`button-view-hotel-${proposal.id}`}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              View Hotel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const getFlightDateLabel = useCallback(
    (value?: string | Date | null) => {
      if (formatFlightDateTime) {
        return formatFlightDateTime(value);
      }

      if (!value) {
        return "TBD";
      }

      const date = value instanceof Date ? value : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return "TBD";
      }

      try {
        return format(date, "MMM d, yyyy, h:mm a");
      } catch {
        return "TBD";
      }
    },
    [formatFlightDateTime],
  );

  // Flight proposal card component
  const FlightProposalCard = ({ proposal }: { proposal: FlightProposalWithDetails }) => {
    const userRanking =
      proposal.currentUserRanking?.ranking ??
      getUserRanking(proposal.rankings || [], user?.id || "");
    const isCanceled = isCanceledStatus(proposal.status);
    const isScheduled = proposal.status === "scheduled" || proposal.status === "confirmed";
    const canCancel = Boolean(proposal.permissions?.canCancel && !isCanceled);
    const canConvert = Boolean(proposal.permissions?.canCancel && !isCanceled && !isScheduled && (proposal.status === "active" || proposal.status === "proposed"));
    const isCancelling =
      cancelProposalMutation.isPending &&
      cancelProposalMutation.variables?.proposalId === proposal.id &&
      cancelProposalMutation.variables?.type === "flight";
    const isConverting =
      convertFlightProposalMutation.isPending &&
      convertFlightProposalMutation.variables?.proposalId === proposal.id;
    const votingDeadline = proposal.votingDeadline ? new Date(proposal.votingDeadline) : null;

    return (
      <Card className="mb-4 hover:shadow-md transition-shadow border-dashed border-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20" data-testid={`card-flight-proposal-${proposal.id}`}>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2" data-testid={`text-flight-number-${proposal.id}`}>
                <Plane className="w-5 h-5 text-blue-600" />
                {proposal.airline} {proposal.flightNumber}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <span data-testid={`text-flight-route-${proposal.id}`}>
                  {proposal.departureAirport} → {proposal.arrivalAirport}
                </span>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {renderStatusBadge(proposal.status || "active", proposal.averageRanking ?? undefined, "flight")}
              {votingDeadline && !isCanceled && (
                <div data-testid={`text-flight-deadline-${proposal.id}`}>
                  <LiveCountdown deadline={votingDeadline} />
                </div>
              )}
              {canConvert && (
                <Button
                  size="sm"
                  onClick={() => convertFlightProposalMutation.mutate({ proposalId: proposal.id })}
                  disabled={isConverting}
                  data-testid={`button-convert-flight-proposal-${proposal.id}`}
                >
                  {isConverting ? "Confirming..." : "Confirm Selection"}
                </Button>
              )}
              {canCancel && (
                <CancelProposalButton
                  type="flight"
                  proposalId={proposal.id}
                  proposalName={[proposal.airline, proposal.flightNumber].filter(Boolean).join(" ")}
                  isCancelling={isCancelling}
                  triggerTestId={`button-cancel-flight-proposal-${proposal.id}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProposalDateTimeSection
            dateLabel={proposal.departureTime ? format(new Date(proposal.departureTime), "EEE, MMM d, yyyy") : null}
            timeLabel={proposal.departureTime ? format(new Date(proposal.departureTime), "h:mm a") : null}
            testIdPrefix={`flight-proposal-${proposal.id}`}
          />

          <div className="mb-4">{renderRankingPreview(proposal.rankings ?? [])}</div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Plane className="w-4 h-4 text-blue-600" />
              <div>
                <div className="font-medium" data-testid={`text-flight-departure-${proposal.id}`}>
                  Departs: {getFlightDateLabel(proposal.departureTime)}
                </div>
                <div className="text-sm text-neutral-600" data-testid={`text-flight-arrival-${proposal.id}`}>
                  Arrives: {getFlightDateLabel(proposal.arrivalTime)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="font-medium" data-testid={`text-flight-price-${proposal.id}`}>
                ${parseFloat(proposal.price.toString()).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="font-medium" data-testid={`text-flight-duration-${proposal.id}`}>
                {proposal.duration}
                {proposal.stops > 0 && (
                  <span className="text-sm text-neutral-600 ml-1">
                    ({proposal.stops} stop{proposal.stops > 1 ? 's' : ''})
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <UserIcon className="w-4 h-4" />
              <span>Proposed by {proposal.proposer?.firstName || 'Unknown'}</span>
              <Clock className="w-4 h-4 ml-2" />
              <span data-testid={`text-flight-created-${proposal.id}`}>
                {proposal.createdAt ? formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true }) : 'Unknown'}
              </span>
            </div>
            {proposal.averageRanking != null && (
              <div className="flex items-center gap-1 text-sm">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span data-testid={`text-flight-avg-ranking-${proposal.id}`}>
                  Avg: {proposal.averageRanking.toFixed(1)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <Select
              value={userRanking?.toString() || ""}
              onValueChange={(value) => {
                rankFlightMutation.mutate({ 
                  proposalId: proposal.id, 
                  ranking: parseInt(value) 
                });
              }}
              data-testid={`select-flight-ranking-${proposal.id}`}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Rank this option" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: Math.max(5, filterActiveProposals(flightProposals).length) }, (_, i) => i + 1).map((rank) => (
                  <SelectItem
                    key={rank}
                    value={rank.toString()}
                    data-testid={`option-ranking-${rank}-${proposal.id}`}
                    disabled={flightRankingsUsed.has(rank) && userRanking !== rank}
                  >
                    {rank === 1 ? "🥇 1st Choice" : rank === 2 ? "🥈 2nd Choice" : rank === 3 ? "🥉 3rd Choice" : `${rank}${rank === 4 ? "th" : rank === 5 ? "th" : rank % 10 === 1 && rank !== 11 ? "st" : rank % 10 === 2 && rank !== 12 ? "nd" : rank % 10 === 3 && rank !== 13 ? "rd" : "th"} Choice`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {userRanking && (
              <Badge className={getRankingColor(userRanking)} data-testid={`badge-user-ranking-${proposal.id}`}>
                Your choice: #{userRanking}
              </Badge>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(proposal.bookingUrl, '_blank')}
              data-testid={`button-view-flight-${proposal.id}`}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              View Flight
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const InlineErrorState = ({
    message,
    onRetry,
    testId,
  }: {
    message: string;
    onRetry: () => void;
    testId: string;
  }) => (
    <div className="text-center py-12 space-y-4" data-testid={testId}>
      <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-neutral-700">We hit a snag</h3>
        <p className="text-neutral-500 max-w-md mx-auto">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>
        Try again
      </Button>
    </div>
  );

  // Empty state component
  const proposalTypeRouteMap: Record<string, string> = {
    Activity: "activities",
    Hotel: "hotels",
    Flight: "flights",
    Restaurant: "restaurants",
  };

  const EmptyState = ({ type, icon: Icon }: { type: string; icon: any }) => {
    const showGlobalEmpty = noProposalsAtAll;
    const routeSegment = proposalTypeRouteMap[type] ?? type.toLowerCase();

    return (
      <div className="text-center py-12">
        <Icon className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-600 mb-2">
          {showGlobalEmpty ? "No proposals yet for this trip." : `No ${type} Proposals Yet`}
        </h3>
        <p className="text-neutral-500 mb-6">
          {showGlobalEmpty
            ? "Suggest an activity, restaurant, hotel, or flight to get started."
            : `Group members can propose ${type.toLowerCase()} options for voting. Check the ${type} page to add proposals!`}
        </p>
        <Link href={`/trip/${tripId}/${routeSegment}`}>
          <Button data-testid={`button-add-${type.toLowerCase()}-proposal`}>
            <Icon className="w-4 h-4 mr-2" />
            Browse {type}
          </Button>
        </Link>
      </div>
    );
  };

  const MyProposalsEmptyState = ({ hasAny }: { hasAny: boolean }) => (
    <div className="text-center py-12" data-testid="empty-my-proposals">
      <UserIcon className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-neutral-600 mb-2">
        {hasAny ? "No floaters match these filters." : "You haven’t proposed anything yet."}
      </h3>
      <p className="text-neutral-500">
        {hasAny
          ? "Try adjusting the filters to see your floaters."
          : "Suggest an activity, restaurant, hotel, or flight to get started."}
      </p>
    </div>
  );

  const FilteredEmptyState = ({ type }: { type: string }) => (
    <div className="text-center py-12" data-testid={`empty-filtered-${type.toLowerCase()}-proposals`}>
      <Eye className="w-10 h-10 text-neutral-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-neutral-600 mb-2">No {type.toLowerCase()} match these filters.</h3>
      <p className="text-neutral-500">Try adjusting the filters to see more options.</p>
    </div>
  );

  const activityProposals = useMemo<NormalizedActivityProposal[]>(() => {
    const viewerId = user?.id ?? null;

    return rawActivityProposals
      .filter((activity) => {
        if (!viewerId) {
          return false;
        }

        const proposerId = activity.postedBy ?? activity.poster?.id ?? null;
        if (proposerId === viewerId) {
          return true;
        }

        return (activity.invites ?? []).some((invite) => invite.userId === viewerId);
      })
      .map((activity) => {
        const isCanceled = isCanceledStatus(activity.status);

        return {
          ...activity,
          tripId: activity.tripCalendarId,
          proposedBy: activity.postedBy,
          proposer: activity.poster,
          status: isCanceled
            ? activity.status ?? "canceled"
            : getActivityProposalStatus(activity),
          activityName: activity.name,
          rankings: [],
          averageRanking: null,
          permissions: {
            canCancel: Boolean(viewerId && activity.postedBy === viewerId),
          },
        };
      });
  }, [getActivityProposalStatus, rawActivityProposals, user?.id]);

  const hotelProposalsForCategories = useMemo(
    () =>
      includeUserProposalsInCategories
        ? hotelProposals
        : hotelProposals.filter((proposal) => !isMyProposal(proposal)),
    [hotelProposals, includeUserProposalsInCategories, isMyProposal],
  );
  const activeHotelProposalsForCategories = useMemo(
    () => filterActiveProposals(hotelProposalsForCategories),
    [hotelProposalsForCategories],
  );
  const flightProposalsForCategories = useMemo(
    () =>
      includeUserProposalsInCategories
        ? flightProposals
        : flightProposals.filter((proposal) => !isMyProposal(proposal)),
    [flightProposals, includeUserProposalsInCategories, isMyProposal],
  );
  const activeFlightProposalsForCategories = useMemo(
    () => filterActiveProposals(flightProposalsForCategories),
    [flightProposalsForCategories],
  );
  const activityProposalsForCategories = useMemo(
    () =>
      includeUserProposalsInCategories
        ? activityProposals
        : activityProposals.filter((proposal) => !isMyProposal(proposal)),
    [activityProposals, includeUserProposalsInCategories, isMyProposal],
  );
  const activeActivityProposalsForCategories = useMemo(
    () => filterActiveProposals(activityProposalsForCategories),
    [activityProposalsForCategories],
  );
  const restaurantProposalsForCategories = useMemo(
    () =>
      includeUserProposalsInCategories
        ? restaurantProposals
        : restaurantProposals.filter((proposal) => !isMyProposal(proposal)),
    [restaurantProposals, includeUserProposalsInCategories, isMyProposal],
  );
  const activeRestaurantProposalsForCategories = useMemo(
    () => filterActiveProposals(restaurantProposalsForCategories),
    [restaurantProposalsForCategories],
  );

  const filteredHotelProposals = useMemo(
    () => filterActiveProposals(hotelProposalsForCategories),
    [hotelProposalsForCategories],
  );
  const filteredFlightProposals = useMemo(
    () => filterActiveProposals(flightProposalsForCategories),
    [flightProposalsForCategories],
  );
  const filteredActivityProposals = useMemo(
    () => applyActivityResponseFilter(activityProposalsForCategories),
    [applyActivityResponseFilter, activityProposalsForCategories],
  );
  const filteredRestaurantProposals = useMemo(
    () => filterActiveProposals(restaurantProposalsForCategories),
    [restaurantProposalsForCategories],
  );

  const myHotelProposals = useMemo(() => {
    if (myHotelProposalsLoading || myHotelProposalsInvalid || myHotelProposalsError) {
      return hotelProposals.filter((proposal) => isMyProposal(proposal));
    }

    return myHotelProposalsFromApi;
  }, [
    hotelProposals,
    isMyProposal,
    myHotelProposalsError,
    myHotelProposalsFromApi,
    myHotelProposalsInvalid,
    myHotelProposalsLoading,
  ]);
  const myFlightProposals = useMemo(() => {
    if (myFlightProposalsLoading || myFlightProposalsInvalid || myFlightProposalsError) {
      return flightProposals.filter((proposal) => isMyProposal(proposal));
    }

    return myFlightProposalsFromApi;
  }, [
    flightProposals,
    isMyProposal,
    myFlightProposalsError,
    myFlightProposalsFromApi,
    myFlightProposalsInvalid,
    myFlightProposalsLoading,
  ]);
  const myActivityProposals = useMemo(
    () => activityProposals.filter((proposal) => isMyProposal(proposal)),
    [activityProposals, isMyProposal],
  );
  const myRestaurantProposals = useMemo(
    () => restaurantProposals.filter((proposal) => isMyProposal(proposal)),
    [restaurantProposals, isMyProposal],
  );

  const activeMyHotelProposals = useMemo(
    () => filterActiveProposals(myHotelProposals),
    [myHotelProposals],
  );
  const activeMyFlightProposals = useMemo(
    () => filterActiveProposals(myFlightProposals),
    [myFlightProposals],
  );
  const activeMyActivityProposals = useMemo(
    () => filterActiveProposals(myActivityProposals),
    [myActivityProposals],
  );
  const activeMyRestaurantProposals = useMemo(
    () => filterActiveProposals(myRestaurantProposals),
    [myRestaurantProposals],
  );

  const filteredMyHotelProposals = useMemo(
    () => filterActiveProposals(myHotelProposals),
    [myHotelProposals],
  );
  const filteredMyFlightProposals = useMemo(
    () => filterActiveProposals(myFlightProposals),
    [myFlightProposals],
  );
  const filteredMyActivityProposals = useMemo(
    () => applyActivityResponseFilter(myActivityProposals),
    [applyActivityResponseFilter, myActivityProposals],
  );
  const filteredMyRestaurantProposals = useMemo(
    () => filterActiveProposals(myRestaurantProposals),
    [myRestaurantProposals],
  );

  const totalMyProposals =
    filteredMyHotelProposals.length +
    filteredMyFlightProposals.length +
    filteredMyActivityProposals.length +
    filteredMyRestaurantProposals.length +
    hotelRsvpInvites.length +
    flightRsvpInvites.length;

  const totalActiveMyProposals =
    activeMyHotelProposals.length +
    activeMyFlightProposals.length +
    activeMyActivityProposals.length +
    activeMyRestaurantProposals.length;

  const hasAnyMyProposals = totalActiveMyProposals > 0;

  const totalActiveProposals =
    activeHotelProposalsForCategories.length +
    activeFlightProposalsForCategories.length +
    activeActivityProposalsForCategories.length +
    activeRestaurantProposalsForCategories.length;
  const hasProposalDataIssues =
    hotelProposalsHasError ||
    flightProposalsHasError ||
    activityProposalsHasError ||
    restaurantProposalsHasError;

  const noProposalsAtAll = !hasProposalDataIssues && totalActiveProposals === 0;

  const boundaryWrapperClass = embedded
    ? "py-12 flex items-center justify-center"
    : "min-h-screen bg-neutral-50 flex items-center justify-center";

  if (!tripId) {
    return (
      <div className={boundaryWrapperClass}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Trip not specified</h2>
            <p className="text-neutral-600 mb-4">
              We couldn't determine which trip to load proposals for. Please go back and pick a trip first.
            </p>
            <Link href="/">
              <Button data-testid="button-trip-missing-back-home">Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authLoading || tripLoading) {
    return (
      <div className={boundaryWrapperClass}>
        <TravelLoading variant="journey" size="lg" text="Loading your floaters..." />
      </div>
    );
  }

  if (tripError) {
    const parsedError = parseApiError(tripError);

    return (
      <div className={boundaryWrapperClass}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to load trip</h2>
            <p className="text-neutral-600 mb-4">
              {parsedError.message || "Something went wrong while loading this trip. Please try again."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}`] })}>
                Try again
              </Button>
              <Link href="/">
                <Button variant="outline" data-testid="button-trip-error-back-home">
                  Back to Home
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className={boundaryWrapperClass}>
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Trip Not Found</h2>
            <p className="text-neutral-600 mb-4">
              The trip you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link href="/">
              <Button data-testid="button-back-home">Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const mainContent = (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Manage Floaters</h2>
        <p className="text-neutral-600">
          View detailed vote breakdowns, edit your floaters, or cancel floaters you've created.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ProposalTab)}
        className="space-y-6"
      >
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger
              value="my-proposals"
              className="flex items-center gap-2"
              data-testid="tab-my-proposals"
            >
              <UserIcon className="w-4 h-4" />
              My Floaters {totalMyProposals > 0 && `(${totalMyProposals})`}
            </TabsTrigger>
            <TabsTrigger value="hotels" className="flex items-center gap-2" data-testid="tab-hotels">
              <Hotel className="w-4 h-4" />
              Hotels {filteredHotelProposals.length > 0 && `(${filteredHotelProposals.length})`}
            </TabsTrigger>
            <TabsTrigger value="flights" className="flex items-center gap-2" data-testid="tab-flights">
              <Plane className="w-4 h-4" />
              Flights {filteredFlightProposals.length > 0 && `(${filteredFlightProposals.length})`}
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex items-center gap-2" data-testid="tab-activities">
              <MapPin className="w-4 h-4" />
              Activities {filteredActivityProposals.length > 0 && `(${filteredActivityProposals.length})`}
            </TabsTrigger>
            <TabsTrigger value="restaurants" className="flex items-center gap-2" data-testid="tab-restaurants">
              <Utensils className="w-4 h-4" />
              Restaurants {filteredRestaurantProposals.length > 0 && `(${filteredRestaurantProposals.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-proposals" className="space-y-6">
            {(hotelRsvpInvitesLoading || flightRsvpInvitesLoading) && totalMyProposals === 0 ? (
              <div className="flex justify-center py-8">
                <TravelLoading text="Loading invites..." />
              </div>
            ) : totalMyProposals > 0 ? (
              <div className="space-y-8" data-testid="list-my-proposals">
                {flightRsvpInvites.length > 0 && (
                  <section className="space-y-4" data-testid="section-flight-rsvp-invites">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Plane className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Flight Invites ({flightRsvpInvites.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {flightRsvpInvites.map((invite) => (
                        <Card key={invite.rsvp.id} className="border-cyan-200 bg-cyan-50/50">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-lg font-semibold">
                                  {invite.flight.airline} {invite.flight.flightNumber}
                                </CardTitle>
                                <CardDescription className="text-sm text-muted-foreground">
                                  {invite.inviterName} invited you to join this flight
                                </CardDescription>
                              </div>
                              <Badge variant="outline" className="bg-cyan-100 text-cyan-700 border-cyan-300">
                                RSVP Required
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <div className="space-y-2 text-sm text-muted-foreground mb-4">
                              <div className="flex items-center gap-2">
                                <Plane className="w-4 h-4" />
                                <span>
                                  {invite.flight.departureCode || invite.flight.departureAirport} → {invite.flight.arrivalCode || invite.flight.arrivalAirport}
                                </span>
                              </div>
                              {invite.flight.departureTime && (
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    {format(new Date(invite.flight.departureTime), "MMM d, yyyy 'at' h:mm a")}
                                  </span>
                                </div>
                              )}
                              {invite.flight.price && (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4" />
                                  <span>${invite.flight.price} {invite.flight.currency || 'USD'}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => respondToFlightRsvpMutation.mutate({ flightId: invite.flight.id, status: 'accepted' })}
                                disabled={respondToFlightRsvpMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => respondToFlightRsvpMutation.mutate({ flightId: invite.flight.id, status: 'declined' })}
                                disabled={respondToFlightRsvpMutation.isPending}
                                className="border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Decline
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}

                {hotelRsvpInvites.length > 0 && (
                  <section className="space-y-4" data-testid="section-hotel-rsvp-invites">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Hotel className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Hotel Invites ({hotelRsvpInvites.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {hotelRsvpInvites.map((invite) => (
                        <Card key={invite.rsvp.id} className="border-blue-200 bg-blue-50/50">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-lg font-semibold">{invite.hotel.name}</CardTitle>
                                <CardDescription className="text-sm text-muted-foreground">
                                  {invite.inviterName} invited you to stay
                                </CardDescription>
                              </div>
                              <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                                RSVP Required
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-2">
                            <div className="space-y-2 text-sm text-muted-foreground mb-4">
                              {invite.hotel.address && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>
                                    {invite.hotel.address}
                                    {invite.hotel.city && `, ${invite.hotel.city}`}
                                    {invite.hotel.country && `, ${invite.hotel.country}`}
                                  </span>
                                </div>
                              )}
                              {invite.hotel.checkInDate && invite.hotel.checkOutDate && (
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    {format(new Date(invite.hotel.checkInDate), "MMM d, yyyy")} - {format(new Date(invite.hotel.checkOutDate), "MMM d, yyyy")}
                                  </span>
                                </div>
                              )}
                              {invite.hotel.pricePerNight && (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-4 h-4" />
                                  <span>${invite.hotel.pricePerNight}/night</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => respondToHotelRsvpMutation.mutate({ hotelId: invite.hotel.id, status: 'accepted' })}
                                disabled={respondToHotelRsvpMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => respondToHotelRsvpMutation.mutate({ hotelId: invite.hotel.id, status: 'declined' })}
                                disabled={respondToHotelRsvpMutation.isPending}
                                className="border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Decline
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}

                {filteredMyHotelProposals.length > 0 && (
                  <section className="space-y-4" data-testid="section-my-hotel-proposals">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Hotel className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Hotel floaters ({filteredMyHotelProposals.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {filteredMyHotelProposals.map((proposal) => (
                        <HotelProposalCard key={proposal.id} proposal={proposal} />
                      ))}
                    </div>
                  </section>
                )}

                {filteredMyFlightProposals.length > 0 && (
                  <section className="space-y-4" data-testid="section-my-flight-proposals">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Plane className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Flight floaters ({filteredMyFlightProposals.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {filteredMyFlightProposals.map((proposal) => (
                        <FlightProposalCard key={proposal.id} proposal={proposal} />
                      ))}
                    </div>
                  </section>
                )}

                {filteredMyActivityProposals.length > 0 && (
                  <section className="space-y-4" data-testid="section-my-activity-proposals">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <MapPin className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Activity floaters ({filteredMyActivityProposals.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {filteredMyActivityProposals.map((proposal) => (
                        <ActivityProposalCard key={proposal.id} proposal={proposal} />
                      ))}
                    </div>
                  </section>
                )}

                {filteredMyRestaurantProposals.length > 0 && (
                  <section className="space-y-4" data-testid="section-my-restaurant-proposals">
                    <div className="flex items-center gap-2 text-neutral-700">
                      <Utensils className="w-4 h-4" />
                      <h3 className="text-lg font-semibold">
                        Restaurant floaters ({filteredMyRestaurantProposals.length})
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {filteredMyRestaurantProposals.map((proposal) => (
                        <RestaurantProposalCard key={proposal.id} proposal={proposal} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : (
              <MyProposalsEmptyState hasAny={hasAnyMyProposals} />
            )}
          </TabsContent>

          <TabsContent value="hotels" className="space-y-6">
            {hotelProposalsLoading ? (
              <div className="flex justify-center py-8">
                <TravelLoading text="Loading hotel proposals..." />
              </div>
            ) : hotelProposalsHasError ? (
              <InlineErrorState
                message={hotelProposalsErrorMessage}
                onRetry={() => void refetchHotelProposals()}
                testId="error-hotel-proposals"
              />
            ) : filteredHotelProposals.length > 0 ? (
              <div data-testid="list-hotel-proposals">
                {filteredHotelProposals.map((proposal) => (
                  <HotelProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            ) : activeHotelProposalsForCategories.length > 0 ? (
              <FilteredEmptyState type="Hotel" />
            ) : (
              <EmptyState type="Hotel" icon={Hotel} />
            )}
          </TabsContent>

          <TabsContent value="flights" className="space-y-6">
            {flightProposalsLoading ? (
              <div className="flex justify-center py-8">
                <TravelLoading text="Loading flight proposals..." />
              </div>
            ) : flightProposalsHasError ? (
              <InlineErrorState
                message={flightProposalsErrorMessage}
                onRetry={() => void refetchFlightProposals()}
                testId="error-flight-proposals"
              />
            ) : filteredFlightProposals.length > 0 ? (
              <div data-testid="list-flight-proposals">
                {filteredFlightProposals.map((proposal) => (
                  <FlightProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            ) : activeFlightProposalsForCategories.length > 0 ? (
              <FilteredEmptyState type="Flight" />
            ) : (
              <EmptyState type="Flight" icon={Plane} />
            )}
          </TabsContent>

          <TabsContent value="activities" className="space-y-6">
            {activityProposalsLoading ? (
              <div className="flex justify-center py-8">
                <TravelLoading text="Loading activity proposals..." />
              </div>
            ) : activityProposalsHasError ? (
              <InlineErrorState
                message={activityProposalsErrorMessage}
                onRetry={() => void refetchActivityProposals()}
                testId="error-activity-proposals"
              />
            ) : filteredActivityProposals.length > 0 ? (
              <div data-testid="list-activity-proposals">
                {filteredActivityProposals.map((proposal) => (
                  <ActivityProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            ) : activeActivityProposalsForCategories.length > 0 ? (
              <FilteredEmptyState type="Activity" />
            ) : (
              <EmptyState type="Activity" icon={MapPin} />
            )}
          </TabsContent>

          <TabsContent value="restaurants" className="space-y-6">
            {restaurantProposalsLoading ? (
              <div className="flex justify-center py-8">
                <TravelLoading text="Loading restaurant proposals..." />
              </div>
            ) : restaurantProposalsHasError ? (
              <InlineErrorState
                message={restaurantProposalsErrorMessage}
                onRetry={() => void refetchRestaurantProposals()}
                testId="error-restaurant-proposals"
              />
            ) : filteredRestaurantProposals.length > 0 ? (
              <div data-testid="list-restaurant-proposals">
                {filteredRestaurantProposals.map((proposal) => (
                  <RestaurantProposalCard key={proposal.id} proposal={proposal} />
                ))}
              </div>
            ) : activeRestaurantProposalsForCategories.length > 0 ? (
              <FilteredEmptyState type="Restaurant" />
            ) : (
              <EmptyState type="Restaurant" icon={Utensils} />
            )}
          </TabsContent>
        </Tabs>
      </div>
  );

  const editActivityModal = tripId ? (
    <AddActivityModal
      open={editActivityModalOpen}
      onOpenChange={(open) => {
        setEditActivityModalOpen(open);
        if (!open) {
          setActivityToEdit(null);
        }
      }}
      tripId={tripId}
      members={trip?.members ?? []}
      currentUserId={user?.id}
      tripStartDate={trip?.startDate}
      tripEndDate={trip?.endDate}
      tripTimezone={(trip as (TripWithDetails & { timezone?: string | null }) | null | undefined)?.timezone}
      editActivity={activityToEdit}
      defaultMode={activityToEdit?.type ?? "PROPOSE"}
      allowModeToggle={false}
      scheduledActivitiesQueryKey={scheduledActivitiesQueryKey}
      proposalActivitiesQueryKey={activityProposalsQueryKey}
      onActivityUpdated={() => {
        queryClient.invalidateQueries({ queryKey: activityProposalsQueryKey });
        queryClient.invalidateQueries({ queryKey: scheduledActivitiesQueryKey });
        queryClient.invalidateQueries({ queryKey: ["/api/my-proposals"] });
      }}
    />
  ) : null;

  const editRestaurantModal = tripId ? (
    <RestaurantProposalModal
      open={editRestaurantModalOpen}
      onOpenChange={(open) => {
        setEditRestaurantModalOpen(open);
        if (!open) {
          setRestaurantToEdit(null);
        }
      }}
      restaurant={{
        name: restaurantToEdit?.restaurantName,
        address: restaurantToEdit?.address,
        cuisine: restaurantToEdit?.cuisineType,
        priceRange: restaurantToEdit?.priceRange,
        rating: restaurantToEdit?.rating,
      }}
      tripId={tripId}
      existingProposal={restaurantToEdit}
      mode="edit"
    />
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">{mainContent}</div>
        {editActivityModal}
        {editRestaurantModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <PageHeader
        title="Group Floats"
        tripName={trip.name}
        tripId={tripId}
        icon={<Vote className="h-5 w-5" />}
        badge={totalActiveProposals > 0 ? { label: `${totalActiveProposals} active`, variant: "secondary" } : undefined}
        sticky
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{mainContent}</div>
      {editActivityModal}
      {editRestaurantModal}
    </div>
  );
}

// Route wrapper component for standalone routes
function ProposalsRoute() {
  const { tripId } = useParams<{ tripId?: string }>();
  return <ProposalsPage tripId={normalizeTripId(tripId ?? null)} />;
}

// Export both components
export default ProposalsPage;
export { ProposalsRoute };