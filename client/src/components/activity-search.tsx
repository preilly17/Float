import { useState, useEffect, useMemo, useRef, useCallback, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import SmartLocationSearch from "@/components/SmartLocationSearch";
import { TravelLoading } from "@/components/LoadingSpinners";
import { AddActivityModal } from "@/components/add-activity-modal";
import {
  Search,
  Star,
  Clock,
  MapPin,
  DollarSign,
  ExternalLink,
  Loader2,
  CalendarIcon,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateActivity,
  type ActivityCreateFormValues,
  type ActivityValidationError,
} from "@/lib/activities/createActivity";
import { formatCurrency, cn } from "@/lib/utils";
import { markExternalRedirect, ACTIVITY_REDIRECT_STORAGE_KEY } from "@/lib/externalRedirects";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { ActivityWithDetails, ActivityType, TripMember, TripWithDetails, User } from "@shared/schema";
import { normalizeActivityTypeInput } from "@shared/activityValidation";
import {
  scheduledActivitiesQueryKey as buildScheduledActivitiesKey,
  proposalActivitiesQueryKey as buildProposalActivitiesKey,
  calendarActivitiesQueryKey as buildCalendarActivitiesKey,
} from "@/lib/activities/queryKeys";
import { buildManualMemberOptions } from "@/lib/activities/manualMemberOptions";

const MANUAL_ACTIVITY_CATEGORY = "manual";

const MANUAL_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
] as const;

type ManualStatusValue = (typeof MANUAL_STATUS_OPTIONS)[number]["value"];

const MANUAL_STATUS_LABELS: Record<ManualStatusValue, string> = MANUAL_STATUS_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label;
    return acc;
  },
  {} as Record<ManualStatusValue, string>,
);

const MANUAL_CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY"] as const;

type ManualFormErrors = {
  name?: string;
  location?: string;
  dateTime?: string;
  attendeeIds?: string;
  cost?: string;
};

const parseManualActivityDescription = (description?: string | null) => {
  const fallbackStatus: ManualStatusValue = "planned";
  const fallbackCurrency = "USD";

  if (!description) {
    return {
      statusValue: fallbackStatus,
      statusLabel: MANUAL_STATUS_LABELS[fallbackStatus],
      currency: fallbackCurrency,
    };
  }

  const statusMatch = description.match(/Status:\s*([A-Za-z ]+)/i);
  const currencyMatch = description.match(/Currency:\s*([A-Za-z]{3})/i);

  const matchedStatusLabel = statusMatch?.[1]?.trim() || MANUAL_STATUS_LABELS[fallbackStatus];
  const normalizedStatusValue = matchedStatusLabel.toLowerCase() as ManualStatusValue;
  const statusValue = MANUAL_STATUS_LABELS[normalizedStatusValue]
    ? normalizedStatusValue
    : fallbackStatus;

  return {
    statusValue,
    statusLabel: MANUAL_STATUS_LABELS[statusValue],
    currency: currencyMatch?.[1]?.trim().toUpperCase() || fallbackCurrency,
  };
};

const isManualActivity = (activity: ActivityWithDetails) => {
  const category = activity.category?.toLowerCase();
  if (category === MANUAL_ACTIVITY_CATEGORY) {
    return true;
  }

  const description = activity.description?.toLowerCase() ?? "";
  return description.includes("manual entry");
};

interface Activity {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  location: string;
  latitude?: number;
  longitude?: number;
  category: string;
  price: number;
  currency?: string;
  duration: string;
  rating: number;
  bookingUrl: string;
  provider?: string;
  images?: string[];
}

interface ActivitySearchProps {
  tripId: number;
  trip?: TripWithDetails | null;
  user?: User | null;
  manualFormOpenSignal?: number;
}

export default function ActivitySearch({ tripId, trip, user: _user, manualFormOpenSignal }: ActivitySearchProps) {
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [priceRange, setPriceRange] = useState("all");
  const [sortBy, setSortBy] = useState("popularity");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [submittedLocation, setSubmittedLocation] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [shouldAutoSearch, setShouldAutoSearch] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isAddActivityModalOpen, setIsAddActivityModalOpen] = useState(false);
  const currentUser = _user ?? null;
  const currentUserId = currentUser?.id ?? undefined;
  const [manualFormData, setManualFormData] = useState<{
    name: string;
    location: string;
    dateTime: string;
    price: string;
    currency: string;
    status: ManualStatusValue;
  }>({
    name: "",
    location: trip?.destination ?? "",
    dateTime: trip?.startDate ? format(new Date(trip.startDate), "yyyy-MM-dd'T'HH:mm") : "",
    price: "",
    currency: MANUAL_CURRENCY_OPTIONS[0],
    status: MANUAL_STATUS_OPTIONS[0].value,
  });
  const memberOptions = useMemo(
    () => buildManualMemberOptions(trip?.members ?? [], currentUser, currentUserId),
    [currentUser, currentUserId, trip?.members],
  );
  const defaultMemberIds = useMemo(() => memberOptions.map((member) => member.id), [memberOptions]);
  const [manualAttendeeIds, setManualAttendeeIds] = useState<string[]>(defaultMemberIds);
  const [manualFieldErrors, setManualFieldErrors] = useState<ManualFormErrors>({});
  const previousDefaultMemberIdsRef = useRef(defaultMemberIds);
  const [manualMode, setManualMode] = useState<ActivityType>("SCHEDULED");
  const locationInputRef = useRef<HTMLInputElement | null>(null);
  const manualSignalRef = useRef(manualFormOpenSignal ?? 0);
  
  const [searchDateRange, setSearchDateRange] = useState<DateRange | undefined>(() => {
    if (trip?.startDate) {
      const startDateStr = typeof trip.startDate === 'string' ? trip.startDate : trip.startDate.toISOString().split('T')[0];
      const endDateStr = trip?.endDate 
        ? (typeof trip.endDate === 'string' ? trip.endDate : trip.endDate.toISOString().split('T')[0])
        : startDateStr;
      return {
        from: parseISO(startDateStr),
        to: parseISO(endDateStr),
      };
    }
    return undefined;
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const focusLocationInput = useCallback(() => {
    if (typeof window === "undefined") {
      locationInputRef.current?.focus();
      return;
    }

    window.requestAnimationFrame(() => {
      locationInputRef.current?.focus();
    });
  }, []);

  const handleLocationSelect = (location: any) => {
    setSelectedLocation(location);
    const locationName = location?.city || location?.name || location?.code || location;
    setLocationSearch(locationName);
    focusLocationInput();
  };

  useEffect(() => {
    const previousDefaultMemberIds = previousDefaultMemberIdsRef.current;
    previousDefaultMemberIdsRef.current = defaultMemberIds;

    setManualAttendeeIds((prev) => {
      if (defaultMemberIds.length === 0) {
        return [];
      }

      const validSelection = prev.filter((id) => defaultMemberIds.includes(id));
      if (validSelection.length !== prev.length) {
        return validSelection.length > 0 ? validSelection : defaultMemberIds;
      }

      const defaultsBecameAvailable = previousDefaultMemberIds.length === 0 && defaultMemberIds.length > 0;
      if (defaultsBecameAvailable && prev.length === 0) {
        return defaultMemberIds;
      }

      return prev;
    });
  }, [defaultMemberIds]);

  const resetManualForm = useCallback(() => {
    setManualFormData({
      name: "",
      location: trip?.destination ?? "",
      dateTime: trip?.startDate ? format(new Date(trip.startDate), "yyyy-MM-dd'T'HH:mm") : "",
      price: "",
      currency: MANUAL_CURRENCY_OPTIONS[0],
      status: MANUAL_STATUS_OPTIONS[0].value,
    });
    setManualAttendeeIds(defaultMemberIds);
    setManualMode("SCHEDULED");
    setManualFieldErrors({});
  }, [defaultMemberIds, trip?.destination, trip?.startDate]);

  const openManualForm = useCallback(() => {
    resetManualForm();
    setIsManualModalOpen(true);
  }, [resetManualForm]);

  const closeManualForm = useCallback(() => {
    setIsManualModalOpen(false);
    resetManualForm();
  }, [resetManualForm]);

  const getSelectedDateRange = useCallback(() => {
    if (searchDateRange?.from) {
      const start = format(searchDateRange.from, "yyyy-MM-dd");
      const end = searchDateRange.to ? format(searchDateRange.to, "yyyy-MM-dd") : start;
      return { start, end };
    }
    
    if (trip?.startDate) {
      const start = format(new Date(trip.startDate), "yyyy-MM-dd");
      const end = trip?.endDate ? format(new Date(trip.endDate), "yyyy-MM-dd") : start;
      return { start, end };
    }
    
    return { start: "", end: "" };
  }, [searchDateRange, trip?.startDate, trip?.endDate]);

  const hasSelectedDates = Boolean(searchDateRange?.from);

  const clearSearchDates = useCallback(() => {
    setSearchDateRange(undefined);
  }, []);

  const resetToTripDates = useCallback(() => {
    if (trip?.startDate) {
      const startDateStr = typeof trip.startDate === 'string' ? trip.startDate : trip.startDate.toISOString().split('T')[0];
      const endDateStr = trip?.endDate 
        ? (typeof trip.endDate === 'string' ? trip.endDate : trip.endDate.toISOString().split('T')[0])
        : startDateStr;
      setSearchDateRange({
        from: parseISO(startDateStr),
        to: parseISO(endDateStr),
      });
    }
  }, [trip?.startDate, trip?.endDate]);

  const formatDateRangeLabel = useCallback(() => {
    if (!searchDateRange?.from) {
      return "Select dates";
    }
    
    const fromStr = format(searchDateRange.from, "MMM d");
    if (!searchDateRange.to || searchDateRange.from.getTime() === searchDateRange.to.getTime()) {
      return fromStr;
    }
    
    const toStr = format(searchDateRange.to, "MMM d");
    return `${fromStr} – ${toStr}`;
  }, [searchDateRange]);

  const getCategoryKeyword = useCallback((category: string) => {
    const categoryMap: Record<string, string> = {
      sightseeing: "tours sightseeing",
      food: "food tours cooking",
      adventure: "adventure outdoor",
      culture: "culture history",
      nature: "nature wildlife",
      entertainment: "entertainment shows",
      shopping: "shopping markets",
    };
    return categoryMap[category] || "";
  }, []);

  const handleViatorLink = useCallback(() => {
    const location = (locationSearch.trim() || trip?.destination || "").trim();
    if (!location) {
      toast({
        title: "Add a destination",
        description: "Enter a destination to search on Viator.",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const categoryKeyword = getCategoryKeyword(selectedCategory);
    const searchText = categoryKeyword ? `${location} ${categoryKeyword}` : location;

    const url = new URL("https://www.viator.com/searchResults/all");
    url.searchParams.set("text", searchText);
    
    const { start, end } = getSelectedDateRange();
    if (start) {
      url.searchParams.set("startDate", start);
    }
    if (end) {
      url.searchParams.set("endDate", end);
    }

    markExternalRedirect(ACTIVITY_REDIRECT_STORAGE_KEY);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [getCategoryKeyword, getSelectedDateRange, locationSearch, selectedCategory, toast, trip?.destination]);

  const handleAirbnbLink = useCallback(() => {
    const location = (locationSearch.trim() || trip?.destination || "").trim();
    if (!location) {
      toast({
        title: "Add a destination",
        description: "Enter a destination to search on Airbnb Experiences.",
        variant: "destructive",
      });
      return;
    }

    const { start, end } = getSelectedDateRange();
    if (!start) {
      toast({
        title: "Select dates",
        description: "Select dates to search on Airbnb Experiences.",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const categoryKeyword = getCategoryKeyword(selectedCategory);
    const searchQuery = categoryKeyword ? `${location} ${categoryKeyword}` : location;

    const url = new URL("https://www.airbnb.com/s/experiences");
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("checkin", start);
    if (end) {
      url.searchParams.set("checkout", end);
    }
    url.searchParams.set("adults", "1");

    markExternalRedirect(ACTIVITY_REDIRECT_STORAGE_KEY);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [getCategoryKeyword, getSelectedDateRange, locationSearch, selectedCategory, toast, trip?.destination]);

  const handleGetYourGuideLink = useCallback(() => {
    const location = (locationSearch.trim() || trip?.destination || "").trim();
    if (!location) {
      toast({
        title: "Add a destination",
        description: "Enter a destination to search on GetYourGuide.",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const categoryKeyword = getCategoryKeyword(selectedCategory);
    const searchQuery = categoryKeyword ? `${location} ${categoryKeyword}` : location;

    const url = new URL("https://www.getyourguide.com/s/");
    url.searchParams.set("q", searchQuery);
    
    const { start, end } = getSelectedDateRange();
    if (start) {
      url.searchParams.set("date_from", start);
    }
    if (end) {
      url.searchParams.set("date_to", end);
    }

    markExternalRedirect(ACTIVITY_REDIRECT_STORAGE_KEY);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [getCategoryKeyword, getSelectedDateRange, locationSearch, selectedCategory, toast, trip?.destination]);

  const handleKlookLink = useCallback(() => {
    const location = (locationSearch.trim() || trip?.destination || "").trim();
    if (!location) {
      toast({
        title: "Add a destination",
        description: "Enter a destination to search on Klook.",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const categoryKeyword = getCategoryKeyword(selectedCategory);
    const searchQuery = categoryKeyword ? `${location} ${categoryKeyword}` : location;

    const url = new URL("https://www.klook.com/search/");
    url.searchParams.set("query", searchQuery);

    markExternalRedirect(ACTIVITY_REDIRECT_STORAGE_KEY);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [getCategoryKeyword, locationSearch, selectedCategory, toast, trip?.destination]);

  const handleTripAdvisorLink = useCallback(() => {
    const location = (locationSearch.trim() || trip?.destination || "").trim();
    if (!location) {
      toast({
        title: "Add a destination",
        description: "Enter a destination to search on TripAdvisor.",
        variant: "destructive",
      });
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const categoryKeyword = getCategoryKeyword(selectedCategory);
    const searchQuery = categoryKeyword ? `${location} ${categoryKeyword} things to do` : `${location} things to do`;

    const url = new URL("https://www.tripadvisor.com/Search");
    url.searchParams.set("q", searchQuery);

    markExternalRedirect(ACTIVITY_REDIRECT_STORAGE_KEY);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }, [getCategoryKeyword, locationSearch, selectedCategory, toast, trip?.destination]);

  // Prefill destination from query params if provided
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const queryDestination = params.get("q");
    const autoParam = params.get("auto");

    if (queryDestination) {
      setLocationSearch(queryDestination);
      setSelectedLocation((prev: any) =>
        prev ?? {
          name: queryDestination,
          displayName: queryDestination,
          city: queryDestination
        }
      );

      if (autoParam === "1") {
        setShouldAutoSearch(true);
      }
    }
  }, []);

  useEffect(() => {
    if (shouldAutoSearch && locationSearch.trim()) {
      setSubmittedLocation(locationSearch.trim());
      setHasSearched(true);
      setShouldAutoSearch(false);
    }
  }, [shouldAutoSearch, locationSearch]);

  useEffect(() => {
    const currentSignal = manualFormOpenSignal ?? 0;
    if (currentSignal > manualSignalRef.current) {
      setIsAddActivityModalOpen(true);
    }
    manualSignalRef.current = currentSignal;
  }, [manualFormOpenSignal]);

  const handleSearch = () => {
    if (!locationSearch.trim()) {
      setHasSearched(false);
      setSubmittedLocation("");
      return;
    }

    setSubmittedLocation(locationSearch.trim());
    setHasSearched(true);
  };

  const trimmedLocation = useMemo(() => submittedLocation.trim(), [submittedLocation]);

  const { data: tripActivities = [], isLoading: tripActivitiesLoading } = useQuery<ActivityWithDetails[]>({
    queryKey: buildScheduledActivitiesKey(tripId),
    enabled: !!tripId,
  });

  const manualActivities = useMemo(
    () => tripActivities.filter((activity) => isManualActivity(activity)),
    [tripActivities],
  );

  const sortedManualActivities = useMemo(() => {
    return [...manualActivities].sort((a, b) => {
      const aTime = new Date(a.startTime as string).getTime();
      const bTime = new Date(b.startTime as string).getTime();
      return aTime - bTime;
    });
  }, [manualActivities]);

  const manualActivitiesLoading = tripActivitiesLoading;
  const hasManualActivities = sortedManualActivities.length > 0;
  const hasDestination = Boolean(locationSearch.trim() || trip?.destination);
  const canBuildAirbnbLink = hasDestination && hasSelectedDates;

  const tripMembers = useMemo(
    () => (trip?.members ?? []) as (TripMember & { user: User })[],
    [trip?.members],
  );
  const handleManualValidationError = useCallback(
    (error: ActivityValidationError) => {
      const next: ManualFormErrors = {};
      for (const fieldError of error.fieldErrors) {
        if (fieldError.field === "name") {
          next.name = fieldError.message;
        } else if (fieldError.field === "location") {
          next.location = fieldError.message;
        } else if (fieldError.field === "startDate" || fieldError.field === "startTime") {
          next.dateTime = fieldError.message;
        } else if (fieldError.field === "attendeeIds") {
          next.attendeeIds = fieldError.message;
        } else if (fieldError.field === "cost") {
          next.cost = fieldError.message;
        }
      }

      setManualFieldErrors(next);

      const firstMessage = error.formMessage ?? error.fieldErrors[0]?.message;
      if (firstMessage) {
        toast({
          title: "Please review the manual activity fields",
          description: firstMessage,
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const manualCreateActivity = useCreateActivity({
    tripId,
    scheduledActivitiesQueryKey: buildScheduledActivitiesKey(tripId),
    proposalActivitiesQueryKey: buildProposalActivitiesKey(tripId),
    calendarActivitiesQueryKey: buildCalendarActivitiesKey(tripId),
    members: tripMembers,
    currentUserId,
    enabled: tripId > 0 && memberOptions.length > 0,
    onValidationError: handleManualValidationError,
    onSuccess: () => {
      setManualFieldErrors({});
      closeManualForm();
    },
  });

  const isSavingManualActivity = manualCreateActivity.isPending;

  const clearManualFieldError = useCallback((field: keyof ManualFormErrors) => {
    setManualFieldErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleManualToggleAttendee = useCallback(
    (memberId: string, checked: boolean | "indeterminate") => {
      const normalizedId = String(memberId);
      setManualAttendeeIds((current) => {
        const next = new Set(current);
        if (checked === true) {
          next.add(normalizedId);
        } else if (checked === false) {
          next.delete(normalizedId);
        }
        return Array.from(next);
      });
      clearManualFieldError("attendeeIds");
    },
    [clearManualFieldError],
  );

  const handleManualSelectAll = useCallback(() => {
    setManualAttendeeIds(defaultMemberIds);
    clearManualFieldError("attendeeIds");
  }, [clearManualFieldError, defaultMemberIds]);

  const handleManualClearAttendees = useCallback(() => {
    setManualAttendeeIds([]);
    clearManualFieldError("attendeeIds");
  }, [clearManualFieldError]);

  const handleManualFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = manualFormData.name.trim();
    const trimmedLocation = manualFormData.location.trim();

    const nextErrors: ManualFormErrors = {};

    if (!trimmedName) {
      nextErrors.name = "Add a name so everyone recognizes this activity.";
    }

    if (!trimmedLocation) {
      nextErrors.location = "Add where this takes place.";
    }

    if (!manualFormData.dateTime) {
      nextErrors.dateTime = "Pick a date and time to schedule this activity.";
    }

    if (manualAttendeeIds.length === 0) {
      nextErrors.attendeeIds = "Select at least one attendee.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setManualFieldErrors(nextErrors);
      toast({
        title: "Please review the manual activity fields",
        description: "We need a name, location, date/time, and at least one attendee.",
        variant: "destructive",
      });
      return;
    }

    const parsedDate = new Date(manualFormData.dateTime);
    if (Number.isNaN(parsedDate.getTime())) {
      setManualFieldErrors((prev) => ({ ...prev, dateTime: "Choose a valid date and time." }));
      toast({
        title: "Invalid date",
        description: "Choose a valid date and time for the activity.",
        variant: "destructive",
      });
      return;
    }

    const manualType = normalizeActivityTypeInput(manualMode, "SCHEDULED");

    const manualValues: ActivityCreateFormValues = {
      name: trimmedName,
      description: `Manual entry · Status: ${MANUAL_STATUS_LABELS[manualFormData.status]} · Currency: ${manualFormData.currency}`,
      startDate: format(parsedDate, "yyyy-MM-dd"),
      startTime: format(parsedDate, "HH:mm"),
      endTime: undefined,
      location: trimmedLocation,
      cost: manualFormData.price,
      maxCapacity: undefined,
      attendeeIds: manualAttendeeIds,
      category: MANUAL_ACTIVITY_CATEGORY,
      type: manualType,
    };

    manualCreateActivity.submit(manualValues);
  };

  const { data: activities, isLoading: activitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities/discover", trimmedLocation, searchTerm, selectedCategory, priceRange, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams({
        location: trimmedLocation || trip?.destination || "",
        searchTerm,
        category: selectedCategory,
        priceRange,
        sortBy
      });
      
      const response = await apiFetch(`/api/activities/discover?${params}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please log in to search activities');
        }
        const errorText = await response.text();
        throw new Error(`Failed to fetch activities: ${errorText}`);
      }
      
      const data = await response.json();
      return data;
    },
    enabled: !!trimmedLocation && hasSearched,
    retry: 1,
  });

  return (
    <>
      {/* Modern Hero Card with Animated Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:via-violet-950 dark:to-slate-900 p-[1px] shadow-xl dark:shadow-2xl border border-slate-200 dark:border-transparent">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 dark:from-cyan-500/20 dark:via-violet-500/20 dark:to-fuchsia-500/20 blur-xl animate-pulse"></div>
        <div className="relative rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900/95 dark:via-violet-950/95 dark:to-slate-900/95 backdrop-blur-xl">
          {/* Header with Glowing Effect */}
          <div className="relative border-b border-slate-200 dark:border-white/10 px-4 py-4 sm:px-6 sm:py-5">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-violet-500/5 to-fuchsia-500/5 dark:from-cyan-500/5 dark:via-violet-500/10 dark:to-fuchsia-500/5"></div>
            <div className="relative flex items-center gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-violet-500/25 shrink-0">
                <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">Discover Activities</h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">Find unforgettable experiences at your destination</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
            {/* Search Input with Glow Effect */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm font-medium text-slate-700">Where are you exploring?</Label>
              <form
                className="flex flex-col sm:flex-row gap-2 sm:gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSearch();
                }}
              >
                <div className="relative flex-1 group">
                  <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 opacity-0 blur transition-opacity group-focus-within:opacity-50"></div>
                  <div className="relative">
                    <SmartLocationSearch
                      id="discover-activities-destination"
                      placeholder={`Search activities in ${trip?.destination || 'any destination'}`}
                      value={locationSearch}
                      onLocationSelect={handleLocationSelect}
                      ref={locationInputRef}
                    />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  disabled={!locationSearch.trim()}
                  className="w-full sm:w-auto shrink-0"
                >
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </form>
              {trip?.destination && !hasSearched && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLocationSearch(trip.destination);
                    setHasSearched(false);
                    focusLocationInput();
                  }}
                  className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Quick search: {trip.destination}
                </Button>
              )}
            </div>

            {/* Filters Grid - Glassmorphism Style */}
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
              {/* Date Range Picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-cyan-400" />
                  Activity Dates
                </Label>
                <div className="flex items-center gap-2">
                  <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-slate-100 border-slate-300 hover:bg-slate-200 hover:border-slate-400 text-slate-800 transition-all",
                          !searchDateRange?.from && "text-slate-400"
                        )}
                        data-testid="button-date-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-cyan-400" />
                        {formatDateRangeLabel()}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10" align="start">
                      <Calendar
                        mode="range"
                        selected={searchDateRange}
                        onSelect={(range) => {
                          setSearchDateRange(range);
                          if (range?.to) {
                            setIsDatePickerOpen(false);
                          }
                        }}
                        numberOfMonths={2}
                        initialFocus
                        className="bg-white dark:bg-slate-900"
                      />
                      <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={clearSearchDates}
                          disabled={!searchDateRange?.from}
                          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          Clear dates
                        </Button>
                        {trip?.startDate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              resetToTripDates();
                              setIsDatePickerOpen(false);
                            }}
                            className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                          >
                            Use trip dates
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {searchDateRange?.from && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
                      onClick={clearSearchDates}
                      data-testid="button-clear-dates"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Star className="h-4 w-4 text-violet-400" />
                  Category
                </Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full bg-slate-100 border-slate-300 hover:bg-slate-200 hover:border-slate-400 text-slate-800 transition-all" data-testid="select-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="sightseeing">Sightseeing & Tours</SelectItem>
                    <SelectItem value="food">Food & Cooking</SelectItem>
                    <SelectItem value="adventure">Adventure & Outdoor</SelectItem>
                    <SelectItem value="culture">Culture & History</SelectItem>
                    <SelectItem value="nature">Nature & Wildlife</SelectItem>
                    <SelectItem value="entertainment">Entertainment & Shows</SelectItem>
                    <SelectItem value="shopping">Shopping & Markets</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* External Booking Platforms */}
            <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-slate-800/50 p-3 sm:p-5">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-neutral-100 dark:bg-slate-700 ring-1 ring-neutral-200 dark:ring-white/10 shrink-0">
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-neutral-600 dark:text-neutral-300" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-medium text-slate-900 dark:text-white">Book on Trusted Platforms</h4>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                      Search with your criteria, then add to your calendar
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleViatorLink}
                    disabled={!hasDestination}
                    data-testid="button-search-viator"
                  >
                    Viator
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleAirbnbLink}
                    disabled={!canBuildAirbnbLink}
                    data-testid="button-search-airbnb"
                  >
                    Airbnb
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleGetYourGuideLink}
                    disabled={!hasDestination}
                    data-testid="button-search-getyourguide"
                  >
                    GetYourGuide
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleKlookLink}
                    disabled={!hasDestination}
                    data-testid="button-search-klook"
                  >
                    Klook
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleTripAdvisorLink}
                    disabled={!hasDestination}
                    data-testid="button-search-tripadvisor"
                  >
                    TripAdvisor
                  </Button>
                </div>
                
                {!hasDestination && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse"></div>
                    Enter a destination to unlock external search
                  </div>
                )}
                {hasDestination && !hasSelectedDates && (
                  <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400/80">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse"></div>
                    Select dates above to enable Airbnb Experiences
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activities Results */}
      {hasSearched ? (
        activitiesLoading ? (
          <Card className="relative overflow-hidden trip-themed-card mt-4">
            <CardContent className="text-center py-12">
              <TravelLoading variant="compass" size="lg" text="Discovering amazing activities..." />
            </CardContent>
          </Card>
        ) : activities && activities.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activities.map((activity) => (
              <Card
                key={activity.id}
                className="relative overflow-hidden trip-themed-card hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col"
                onClick={() => {
                  setSelectedActivity(activity);
                  setShowDetailsDialog(true);
                }}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base lg:text-lg leading-tight">
                    {activity.name}
                  </CardTitle>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-sm text-neutral-600">
                      <div className="flex items-center">
                        <Star className="w-4 h-4 text-yellow-400 mr-1" />
                        <span>{activity.rating}</span>
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        <span className="truncate">{activity.duration}</span>
                      </div>
                    </div>
                    {activity.provider && (
                      <Badge variant="outline" className="text-xs">
                        {activity.provider}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex-1 flex flex-col">
                  <p className="text-sm text-neutral-600 mb-4 line-clamp-3 flex-1">
                    {activity.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-lg font-semibold text-green-600">
                      <DollarSign className="w-4 h-4" />
                      <span>{activity.currency || '$'}{activity.price}</span>
                    </div>
                    <Button size="sm" variant="outline">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="relative overflow-hidden trip-themed-card mt-4">
            <CardContent className="text-center py-12">
              <h3 className="text-xl font-bold text-neutral-900 mb-2">No Activities Found</h3>
              <p className="text-neutral-600 mb-4">
                No activities were found for "{submittedLocation || locationSearch}". Try a different destination or broader search terms.
              </p>
              <Button variant="outline" onClick={() => setHasSearched(false)}>
                Try Different Location
              </Button>
            </CardContent>
          </Card>
        )
      ) : null}

      <Dialog
        open={isManualModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeManualForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Booked Activity</DialogTitle>
            <DialogDescription>
              Add an activity you booked on Viator, Airbnb Experiences, GetYourGuide, or another platform to sync it with your trip calendar.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleManualFormSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-activity-type">Activity type</Label>
              <ToggleGroup
                type="single"
                value={manualMode}
                onValueChange={(value) => {
                  if (value) {
                    setManualMode(normalizeActivityTypeInput(value, "SCHEDULED"));
                  }
                }}
                className="flex"
              >
                <ToggleGroupItem value="SCHEDULED" className="flex-1">
                  Add to schedule
                </ToggleGroupItem>
                <ToggleGroupItem value="PROPOSE" className="flex-1">
                  Propose to group
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-activity-name">Activity name</Label>
              <Input
                id="manual-activity-name"
                value={manualFormData.name}
                onChange={(event) => {
                  setManualFormData((prev) => ({ ...prev, name: event.target.value }));
                  clearManualFieldError("name");
                }}
                placeholder="Morning walking tour"
              />
              {manualFieldErrors.name && (
                <p className="text-sm text-red-600">{manualFieldErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-activity-location">Location</Label>
              <Input
                id="manual-activity-location"
                value={manualFormData.location}
                onChange={(event) => {
                  setManualFormData((prev) => ({ ...prev, location: event.target.value }));
                  clearManualFieldError("location");
                }}
                placeholder="Paris, France"
              />
              {manualFieldErrors.location && (
                <p className="text-sm text-red-600">{manualFieldErrors.location}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-activity-datetime">Date &amp; time</Label>
                <Input
                  id="manual-activity-datetime"
                  type="datetime-local"
                  value={manualFormData.dateTime}
                  onChange={(event) => {
                    setManualFormData((prev) => ({ ...prev, dateTime: event.target.value }));
                    clearManualFieldError("dateTime");
                  }}
                />
                {manualFieldErrors.dateTime && (
                  <p className="text-sm text-red-600">{manualFieldErrors.dateTime}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-activity-price">Price</Label>
                <Input
                  id="manual-activity-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualFormData.price}
                  onChange={(event) => {
                    setManualFormData((prev) => ({ ...prev, price: event.target.value }));
                    clearManualFieldError("cost");
                  }}
                  placeholder="150"
                />
                {manualFieldErrors.cost && (
                  <p className="text-sm text-red-600">{manualFieldErrors.cost}</p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="manual-attendees">Who's going?</Label>
                <span className="text-xs text-neutral-500">{manualAttendeeIds.length} selected</span>
              </div>
              <p className="text-xs text-neutral-500">
                We'll send invites to everyone you include. They can RSVP from their schedule.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleManualSelectAll}
                  disabled={memberOptions.length === 0 || manualAttendeeIds.length === defaultMemberIds.length}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleManualClearAttendees}
                  disabled={manualAttendeeIds.length === 0}
                >
                  Clear
                </Button>
              </div>
            <ScrollArea className="mt-3 max-h-40 rounded-lg border border-neutral-200">
              <div className="p-3 space-y-2">
                {memberOptions.length === 0 ? (
                  <p className="text-sm text-neutral-500">
                    Invite friends to your trip to pick attendees.
                  </p>
                ) : (
                  memberOptions.map((member) => {
                    const isChecked = manualAttendeeIds.includes(member.id);
                    return (
                      <div key={member.id} className="flex items-center space-x-3">
                        <Checkbox
                          id={`manual-attendee-${member.id}`}
                          checked={isChecked}
                          onCheckedChange={(checked) => handleManualToggleAttendee(member.id, checked)}
                        />
                        <Label htmlFor={`manual-attendee-${member.id}`} className="text-sm text-neutral-700">
                          {member.name}
                        </Label>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            {manualFieldErrors.attendeeIds && (
              <p className="text-sm text-red-600">{manualFieldErrors.attendeeIds}</p>
            )}
          </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-activity-currency">Currency</Label>
                <Select
                  value={manualFormData.currency}
                  onValueChange={(value) =>
                    setManualFormData((prev) => ({ ...prev, currency: value }))
                  }
                >
                  <SelectTrigger id="manual-activity-currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_CURRENCY_OPTIONS.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-activity-status">Status</Label>
                <Select
                  value={manualFormData.status}
                  onValueChange={(value) =>
                    setManualFormData((prev) => ({
                      ...prev,
                      status: value as ManualStatusValue,
                    }))
                  }
                >
                  <SelectTrigger id="manual-activity-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={closeManualForm}
                disabled={isSavingManualActivity}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingManualActivity}>
                {isSavingManualActivity ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save activity"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Activity Details Dialog */}
      {selectedActivity && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">
                {selectedActivity.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-4 text-sm text-neutral-600">
                <div className="flex items-center">
                  <Star className="w-4 h-4 text-yellow-400 mr-1" />
                  <span>{selectedActivity.rating} rating</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  <span>{selectedActivity.duration}</span>
                </div>
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>{selectedActivity.location}</span>
                </div>
              </div>
              
              <p className="text-neutral-700 leading-relaxed">
                {selectedActivity.longDescription || selectedActivity.description}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center text-xl font-bold text-green-600">
                  <DollarSign className="w-5 h-5" />
                  <span>{selectedActivity.currency || '$'}{selectedActivity.price}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                    Close
                  </Button>
                  <Button onClick={() => window.open(selectedActivity.bookingUrl, '_blank')}>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Book Now
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {tripId && (
        <AddActivityModal
          open={isAddActivityModalOpen}
          onOpenChange={setIsAddActivityModalOpen}
          tripId={tripId}
          tripStartDate={trip?.startDate ? (typeof trip.startDate === 'string' ? trip.startDate : format(trip.startDate, 'yyyy-MM-dd')) : undefined}
          tripEndDate={trip?.endDate ? (typeof trip.endDate === 'string' ? trip.endDate : format(trip.endDate, 'yyyy-MM-dd')) : undefined}
          members={trip?.members ?? []}
        />
      )}
    </>
  );
}