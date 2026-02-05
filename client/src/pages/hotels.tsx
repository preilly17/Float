import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  MapPin,
  Users,
  Star,
  Edit,
  Trash2,
  ExternalLink,
  Bed,
  Search,
  ArrowLeft,
  Calculator,
  ArrowUpDown,
  AlertCircle,
  Loader2,
  CalendarCheck,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { HotelRsvpSection } from "@/components/hotel-rsvp-section";
import {
  buildHotelProposalPayload,
  HOTEL_PROPOSAL_AMENITIES_FALLBACK,
  type ProposableHotel,
} from "@/lib/hotel-proposals";
import {
  type InsertHotel,
  type HotelWithDetails,
  type TripWithDates,
  type TripWithDetails,
  type HotelSearchResult,
  type HotelProposalWithDetails,
} from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TravelLoading } from "@/components/LoadingSpinners";
import { BookingConfirmationModal } from "@/components/booking-confirmation-modal";
import { useBookingConfirmation } from "@/hooks/useBookingConfirmation";
import {
  createHotelFormDefaults,
  hotelFormSchema,
  parseAmenitiesInput,
  parseJsonInput,
  stringifyJsonValue,
  transformHotelFormValues,
  type HotelFormValues,
} from "@/lib/hotel-form";
import { HotelFormFields } from "@/components/hotels/hotel-form-fields";
import { HotelSearchPanel, type HotelSearchPanelRef } from "@/components/hotels/hotel-search-panel";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SaveProposeToggle, type SaveProposeMode } from "@/components/save-propose-toggle";
import { MemberSelector, type MemberOption } from "@/components/member-selector";
import { AttributionLabel } from "@/components/attribution-label";
import { CollapsibleDetails } from "@/components/collapsible-details";

export default function HotelsPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const tripIdParam = (params.tripId ?? (params as { id?: string }).id) ?? "";
  const parsedTripId = tripIdParam ? Number.parseInt(tripIdParam, 10) : Number.NaN;
  const hasValidRouteTripId = Number.isFinite(parsedTripId) && parsedTripId > 0;
  const [selectedTripId, setSelectedTripId] = useState<number | null>(
    hasValidRouteTripId ? parsedTripId : null,
  );
  const normalizedSelectedTripId = selectedTripId ?? 0;
  const hasSelectedTrip = Number.isFinite(normalizedSelectedTripId) && normalizedSelectedTripId > 0;
  const tripId = hasSelectedTrip ? normalizedSelectedTripId : 0;
  useEffect(() => {
    if (hasValidRouteTripId && parsedTripId !== selectedTripId) {
      setSelectedTripId(parsedTripId);
    }
  }, [hasValidRouteTripId, parsedTripId, selectedTripId]);

  const { toast } = useToast();
  const { user } = useAuth();
  const reactQueryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHotel, setEditingHotel] = useState<HotelWithDetails | null>(null);
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const searchPanelRef = useRef<HotelSearchPanelRef>(null);
  const [proposingHotelId, setProposingHotelId] = useState<number | null>(null);
  const [hotelMode, setHotelMode] = useState<SaveProposeMode>('SAVE');
  const [votingDeadline, setVotingDeadline] = useState<string>('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const {
    data: availableTrips = [],
    isLoading: tripsLoading,
  } = useQuery<TripWithDetails[]>({
    queryKey: ["/api/trips"],
    enabled: !hasSelectedTrip,
  });

  // Currency conversion state
  const [currencyAmount, setCurrencyAmount] = useState('100');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [conversionResult, setConversionResult] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Booking confirmation system
  const { showModal, bookingData, storeBookingIntent, closeModal } = useBookingConfirmation();

  const { data: trip } = useQuery<TripWithDetails>({
    queryKey: [`/api/trips/${tripId}`],
    enabled: hasSelectedTrip,
  });

  const currentUserId = user?.id ?? null;

  const memberOptions: MemberOption[] = useMemo(() => {
    if (!trip?.members) return [];
    return trip.members.map((member) => ({
      id: member.userId,
      name: member.user?.firstName || member.user?.username || member.userId,
      isCurrentUser: member.userId === currentUserId,
    }));
  }, [trip?.members, currentUserId]);

  const handleToggleMember = useCallback((memberId: string, checked: boolean) => {
    setSelectedMemberIds((prev) => {
      if (checked && !prev.includes(memberId)) {
        return [...prev, memberId];
      } else if (!checked && prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return prev;
    });
  }, []);

  const handleSelectAllMembers = useCallback(() => {
    setSelectedMemberIds(memberOptions.map((m) => m.id));
  }, [memberOptions]);

  const handleClearMembers = useCallback(() => {
    setSelectedMemberIds(currentUserId ? [currentUserId] : []);
  }, [currentUserId]);

  useEffect(() => {
    if (hotelMode === 'SAVE' && selectedMemberIds.length === 0 && currentUserId) {
      setSelectedMemberIds([currentUserId]);
    }
  }, [hotelMode, selectedMemberIds.length, currentUserId]);

  const { data: hotels = [], isLoading: hotelsLoading } = useQuery<HotelWithDetails[]>({
    queryKey: [`/api/trips/${tripId}/hotels`],
    enabled: hasSelectedTrip,
  });

  // Hotel proposals for group voting
  const { data: hotelProposals = [], isLoading: proposalsLoading } = useQuery<HotelProposalWithDetails[]>({
    queryKey: [`/api/trips/${tripId}/hotel-proposals`],
    enabled: hasSelectedTrip,
  });

  const focusSearchPanel = useCallback(() => {
    searchPanelRef.current?.focusForm();
  }, []);

  const handleSearchResultsChange = useCallback((results: HotelSearchResult[]) => {
    setHasSearchResults(results.length > 0);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("panel") === "search") {
      window.setTimeout(() => {
        focusSearchPanel();
      }, 150);
    }
  }, [focusSearchPanel]);

  // Currency conversion function
  const convertCurrency = async () => {
    if (!currencyAmount || !fromCurrency || !toCurrency) {
      toast({
        title: "Currency Conversion Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (fromCurrency === toCurrency) {
      setConversionResult(`${currencyAmount} ${fromCurrency}`);
      return;
    }

    setIsConverting(true);
    try {
      const amount = parseFloat(currencyAmount);
      if (isNaN(amount)) {
        throw new Error("Invalid amount");
      }

      // Use the @fawazahmed0/currency-api for real exchange rates
      const response = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromCurrency.toLowerCase()}.json`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch exchange rates");
      }
      
      const data = await response.json();
      const rate = data[fromCurrency.toLowerCase()][toCurrency.toLowerCase()];
      
      if (!rate) {
        throw new Error("Exchange rate not available");
      }
      
      const convertedAmount = (amount * rate).toFixed(2);
      setConversionResult(`${convertedAmount} ${toCurrency}`);
      
      toast({
        title: "Currency Converted",
        description: `${amount} ${fromCurrency} = ${convertedAmount} ${toCurrency}`,
      });
      
    } catch (error) {
      console.error("Currency conversion error:", error);
      toast({
        title: "Conversion Error",
        description: "Unable to convert currency. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  // Share hotel with group as a proposal
  const shareHotelWithGroup = async (hotel: ProposableHotel) => {
    if (!hasSelectedTrip) {
      toast({
        title: "Trip required",
        description: "Select a trip before sharing hotel proposals.",
        variant: "destructive",
      });
      return;
    }

    const manualHotelId = typeof hotel.id === "number" ? hotel.id : null;
    if (manualHotelId != null) {
      setProposingHotelId(manualHotelId);
    }

    try {
      const payload = buildHotelProposalPayload(hotel);

      await apiRequest(`/api/trips/${tripId}/proposals/hotels`, {
        method: "POST",
        body: JSON.stringify({
          tripId,
          ...(manualHotelId != null ? { hotelId: manualHotelId } : {}),
          hotelName: payload.hotelName,
          location: payload.location,
          price: payload.price,
          pricePerNight: payload.pricePerNight,
          rating: payload.rating ?? 4,
          amenities: payload.amenities ?? HOTEL_PROPOSAL_AMENITIES_FALLBACK,
          platform: payload.platform,
          bookingUrl: payload.bookingUrl,
        }),
      });

      toast({
        title: "Added to Group Hotels!",
        description: `${payload.displayName} is now ready for everyone to review and rank.`,
      });

      // PROPOSALS FEATURE: refresh proposals so manual saves stay in sync.
      await Promise.all([
        reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] }),
        reactQueryClient.invalidateQueries({
          queryKey: [`/api/trips/${tripId}/hotel-proposals?mineOnly=true`],
        }),
      ]);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      if (isUnauthorizedError(errorObj)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to propose hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to propose hotel. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (manualHotelId != null) {
        setProposingHotelId(null);
      }
    }
  };

  // Hotel ranking functionality
  const submitRanking = async (proposalId: number, ranking: number, notes?: string) => {
    try {
      // PROPOSALS FEATURE: reuse the shared ranking endpoint for proposal votes.
      await apiRequest(`/api/hotel-proposals/${proposalId}/rank`, {
        method: "POST",
        body: JSON.stringify({ ranking, notes }),
      });
      
      toast({
        title: "Ranking Submitted!",
        description: "Your hotel preference has been recorded.",
      });
      
      // PROPOSALS FEATURE: keep rankings consistent across tabs.
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      if (isUnauthorizedError(errorObj)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to rank hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to submit ranking. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formDefaults = useCallback(
    () => createHotelFormDefaults(tripId, { startDate: trip?.startDate, endDate: trip?.endDate }),
    [tripId, trip?.startDate, trip?.endDate],
  );

  const form = useForm<HotelFormValues>({
    resolver: zodResolver(hotelFormSchema),
    defaultValues: formDefaults(),
  });

  const handleDialogClose = useCallback(() => {
    setIsDialogOpen(false);
    setEditingHotel(null);
    setHotelMode('SAVE');
    setVotingDeadline('');
    form.reset(formDefaults());
  }, [form, formDefaults]);

  const openCreateDialog = useCallback(() => {
    if (!hasSelectedTrip) {
      toast({
        title: "Choose a trip to save hotels",
        description: "Open a specific trip to add manual hotel bookings.",
        variant: "destructive",
      });
      return;
    }
    setEditingHotel(null);
    setHotelMode('SAVE');
    setVotingDeadline('');
    form.reset(formDefaults());
    setIsDialogOpen(true);
  }, [form, formDefaults, hasSelectedTrip, toast]);

  useEffect(() => {
    if (!isDialogOpen && !editingHotel) {
      form.reset(formDefaults());
    }
  }, [editingHotel, form, formDefaults, isDialogOpen]);

  const createHotelMutation = useMutation({
    mutationFn: async (payload: InsertHotel) => {
      return await apiRequest(`/api/trips/${tripId}/hotels`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotels`] });
      // PROPOSALS FEATURE: sync manual hotel saves with the proposals tab.
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      toast({
        title: "Hotel added successfully",
        description: "Your hotel booking has been saved to the trip.",
      });
      handleDialogClose();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to add hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to add hotel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateHotelMutation = useMutation({
    mutationFn: async (payload: InsertHotel) => {
      return await apiRequest(`/api/hotels/${editingHotel?.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotels`] });
      // PROPOSALS FEATURE: ensure proposal details reflect the latest hotel edits.
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      toast({
        title: "Hotel updated successfully",
        description: "Your hotel booking has been updated.",
      });
      handleDialogClose();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to update hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update hotel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteHotelMutation = useMutation({
    mutationFn: async (hotelId: number) => {
      return await apiRequest(`/api/hotels/${hotelId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotels`] });
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      toast({
        title: "Hotel deleted successfully",
        description: "Your hotel booking has been removed.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to delete hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete hotel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const proposeHotelMutation = useMutation({
    mutationFn: async (payload: InsertHotel) => {
      const proposalPayload = {
        tripId,
        hotelName: payload.hotelName,
        location: [payload.city, payload.country].filter(Boolean).join(', ') || payload.address || 'Unknown Location',
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        price: payload.totalPrice?.toString() || payload.pricePerNight?.toString() || '0',
        pricePerNight: payload.pricePerNight?.toString() || payload.totalPrice?.toString() || '0',
        rating: payload.hotelRating || null,
        amenities: typeof payload.amenities === 'string' ? payload.amenities : null,
        platform: 'Manual',
        bookingUrl: payload.bookingUrl || payload.purchaseUrl || '',
        votingDeadline: votingDeadline ? new Date(votingDeadline).toISOString() : null,
        status: 'proposed',
      };
      return await apiRequest(`/api/trips/${tripId}/hotel-proposals`, {
        method: "POST",
        body: JSON.stringify(proposalPayload),
      });
    },
    onSuccess: () => {
      reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
      toast({
        title: "Hotel proposed to group",
        description: "Your group can now vote on this hotel.",
      });
      handleDialogClose();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You need to be logged in to propose hotels.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to propose hotel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (hotel: HotelWithDetails) => {
    setEditingHotel(hotel);
    const defaults = formDefaults();
    form.reset({
      ...defaults,
      tripId,
      hotelName: hotel.hotelName,
      hotelChain: hotel.hotelChain,
      address: hotel.address,
      city: hotel.city,
      country: hotel.country,
      zipCode: hotel.zipCode ?? null,
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
      checkInDate: new Date(hotel.checkInDate),
      checkOutDate: new Date(hotel.checkOutDate),
      totalPrice: hotel.totalPrice ?? null,
      pricePerNight: hotel.pricePerNight ?? null,
      roomType: hotel.roomType ?? null,
      roomCount: hotel.roomCount ?? null,
      guestCount: hotel.guestCount ?? null,
      hotelRating: hotel.hotelRating ?? null,
      bookingReference: hotel.bookingReference ?? null,
      bookingSource: hotel.bookingSource ?? null,
      purchaseUrl: hotel.purchaseUrl ?? null,
      currency: hotel.currency ?? defaults.currency,
      status: hotel.status ?? defaults.status,
      amenities:
        typeof hotel.amenities === "string"
          ? hotel.amenities
          : Array.isArray(hotel.amenities)
            ? hotel.amenities.join(", ")
            : stringifyJsonValue(hotel.amenities),
      images: stringifyJsonValue(hotel.images),
      policies: stringifyJsonValue(hotel.policies),
      contactInfo: stringifyJsonValue(hotel.contactInfo),
      bookingPlatform: hotel.bookingPlatform ?? null,
      bookingUrl: hotel.bookingUrl ?? null,
      cancellationPolicy: hotel.cancellationPolicy ?? null,
      notes: hotel.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (hotelId: number) => {
    if (window.confirm("Are you sure you want to delete this hotel booking?")) {
      deleteHotelMutation.mutate(hotelId);
    }
  };

  const onSubmit = (values: HotelFormValues) => {
    if (!hasSelectedTrip) {
      toast({
        title: "Trip required",
        description: "Select a trip before saving hotel details.",
        variant: "destructive",
      });
      return;
    }
    const payload = transformHotelFormValues(values);
    if (editingHotel) {
      updateHotelMutation.mutate(payload);
    } else if (hotelMode === 'PROPOSE') {
      proposeHotelMutation.mutate(payload);
    } else {
      createHotelMutation.mutate({ ...payload, status: 'scheduled', selectedMemberIds });
    }
  };

  const getStarRating = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={cn(
          "w-4 h-4",
          i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
        )}
      />
    ));
  };

  const formatDateRange = (checkIn: string, checkOut: string) => {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${format(checkInDate, "MMM d")} - ${format(checkOutDate, "MMM d")} (${nights} nights)`;
  };

  if (!hasSelectedTrip) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Select a trip to manage hotels</CardTitle>
            <p className="text-sm text-muted-foreground">
              Choose one of your trips so we know where to save proposed stays and manual reservations.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {tripsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            ) : availableTrips.length > 0 ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="trip-picker">Trip</Label>
                  <Select
                    value={selectedTripId ? String(selectedTripId) : ""}
                    onValueChange={(value) => {
                      const numericValue = Number.parseInt(value, 10);
                      if (Number.isFinite(numericValue)) {
                        setSelectedTripId(numericValue);
                        setLocation(`/trip/${numericValue}/hotels`);
                      }
                    }}
                  >
                    <SelectTrigger id="trip-picker" className="w-full">
                      <SelectValue placeholder="Select a trip" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTrips.map((tripOption) => {
                        const startLabel = format(new Date(tripOption.startDate), "MMM d");
                        const endLabel = format(new Date(tripOption.endDate), "MMM d");
                        const displayName = tripOption.name?.trim().length
                          ? tripOption.name
                          : tripOption.destination;
                        return (
                          <SelectItem key={tripOption.id} value={String(tripOption.id)}>
                            {`${displayName} (${startLabel} – ${endLabel})`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  We&apos;ll load the hotel search experience once you pick a trip.
                </p>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No trips available</AlertTitle>
                <AlertDescription>
                  Manual hotel saves need to be associated with a trip. Create a trip from your dashboard to start planning.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link href="/">
            <Button variant="outline">View all trips</Button>
          </Link>
          <Link href="/trips/new">
            <Button>Add a new trip</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (hotelsLoading) {
    return (
      <div className="space-y-4 min-h-screen flex items-center justify-center">
        <TravelLoading variant="luggage" size="lg" text="Loading your hotel coordination..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <PageHeader
        title="Hotel Coordination"
        tripName={trip?.name || "Your Trip"}
        tripId={tripId}
        icon={<Bed className="h-5 w-5" />}
        primaryAction={
          <Button
            onClick={openCreateDialog}
            data-testid="button-add-hotel-manually"
          >
            <Bed className="h-4 w-4 mr-2" />
            Add Hotel Manually
          </Button>
        }
        badge={hotelProposals.length > 0 ? { label: `${hotelProposals.length} floats`, variant: "secondary" } : undefined}
        sticky
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <HotelSearchPanel
        ref={searchPanelRef}
        tripId={tripId}
        trip={trip}
        onLogHotelManually={openCreateDialog}
        onShareHotelWithGroup={shareHotelWithGroup}
        storeBookingIntent={storeBookingIntent}
        hotelProposalsCount={hotelProposals.length}
        toast={toast}
        onResultsChange={handleSearchResultsChange}
      />

      {/* Tabs for Search vs Group Voting vs Currency Converter */}
      <Tabs defaultValue="search" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="search">Search & Float Hotels</TabsTrigger>
          <TabsTrigger value="voting" className="relative">
            Group Voting
            {hotelProposals.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {hotelProposals.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="currency">Currency Converter</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6 mt-6">
          {/* Add Hotel Dialog */}
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              if (open) {
                setIsDialogOpen(true);
              } else {
                handleDialogClose();
              }
            }}
          >
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingHotel ? "Edit Hotel" : hotelMode === 'PROPOSE' ? "Propose Hotel to Group" : "Add Hotel"}
                </DialogTitle>
                <DialogDescription>
                  {hotelMode === 'PROPOSE' 
                    ? "Share this hotel with your group for voting. They can rank it against other options."
                    : "Provide the hotel details exactly as defined in the booking schema. Fields marked with an asterisk (*) are required."}
                </DialogDescription>
              </DialogHeader>
              
              {!editingHotel && (
                <SaveProposeToggle
                  mode={hotelMode}
                  onModeChange={setHotelMode}
                  saveLabel="Schedule & Invite"
                  proposeLabel="Float to Group"
                  className="mb-4"
                />
              )}
              
              {hotelMode === 'PROPOSE' && !editingHotel && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">Voting Options</span>
                  </div>
                  <div>
                    <Label htmlFor="hotel-voting-deadline" className="text-sm text-blue-800">
                      Voting Deadline (optional)
                    </Label>
                    <p className="text-xs text-blue-600 mb-2">
                      Set a deadline for group members to vote on this hotel option.
                    </p>
                    <Input
                      id="hotel-voting-deadline"
                      type="datetime-local"
                      value={votingDeadline}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setVotingDeadline(e.target.value)}
                      className="bg-white"
                    />
                  </div>
                </div>
              )}
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <HotelFormFields
                    form={form}
                    isSubmitting={createHotelMutation.isPending || updateHotelMutation.isPending || proposeHotelMutation.isPending}
                    submitLabel={editingHotel ? "Save Changes" : hotelMode === 'PROPOSE' ? "Float to Group" : "Add Hotel"}
                    onCancel={handleDialogClose}
                    showCancelButton
                  >
                    {hotelMode === 'SAVE' && !editingHotel && (
                      <MemberSelector
                        members={memberOptions}
                        selectedMemberIds={selectedMemberIds}
                        onToggleMember={handleToggleMember}
                        onSelectAll={handleSelectAllMembers}
                        onClear={handleClearMembers}
                        currentUserId={currentUserId ?? undefined}
                      />
                    )}
                  </HotelFormFields>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Search tab intentionally has no snapshot card to keep the focus on the search form */}
        </TabsContent>

        <TabsContent value="voting" className="space-y-6 mt-6">
          {/* Group Hotel Floats */}
          {hotelProposals.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Group Hotel Floats ({hotelProposals.length})
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Rank these hotels from 1 (most preferred) to help your group decide
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {hotelProposals.map((proposal) => (
                    <Card key={proposal.id} className="relative border-dashed border-2 border-blue-300 bg-blue-50/30 dark:bg-blue-950/20">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs border-blue-400 text-blue-600 dark:text-blue-400">Floated</Badge>
                            </div>
                            <CardTitle className="text-lg font-semibold">{proposal.hotelName}</CardTitle>
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-4 w-4" />
                              {proposal.location}
                            </p>
                            <AttributionLabel
                              name={proposal.proposer.firstName || proposal.proposer.username || 'Group Member'}
                              isCurrentUser={proposal.proposer.id === user?.id}
                              variant="proposed"
                              className="mt-1"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="flex items-center gap-1">
                              {getStarRating(Number(proposal.rating))}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Price:</span>
                            <span className="text-lg font-bold text-blue-600">{proposal.price}</span>
                          </div>
                          {proposal.averageRanking != null && (
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-muted-foreground">Group Average:</span>
                              <span className="text-sm font-medium text-blue-600">#{proposal.averageRanking}</span>
                            </div>
                          )}
                        </div>
                        
                        {proposal.amenities && (
                          <div className="space-y-2">
                            <span className="text-sm font-medium text-muted-foreground">Amenities:</span>
                            <p className="text-sm text-gray-600 leading-relaxed">{proposal.amenities}</p>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between pt-2">
                          <Badge variant="outline" className="text-xs">
                            {proposal.platform}
                          </Badge>
                          {proposal.currentUserRanking && (
                            <Badge variant="secondary" className="text-xs">
                              Your Rank: #{proposal.currentUserRanking.ranking}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Ranking Interface */}
                        <div className="space-y-3 border-t pt-3">
                          <span className="text-sm font-medium">Rank this hotel:</span>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((rank) => (
                              <Button
                                key={rank}
                                size="sm"
                                variant={proposal.currentUserRanking?.ranking === rank ? "default" : "outline"}
                                onClick={() => submitRanking(proposal.id, rank)}
                                className="text-xs px-3"
                              >
                                #{rank}
                              </Button>
                            ))}
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(proposal.bookingUrl, '_blank')}
                              className="flex-1"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Hotel
                            </Button>
                          </div>
                        </div>
                        
                        {/* Show other members' rankings */}
                        {proposal.rankings.length > 0 && (
                          <div className="space-y-2 border-t pt-3">
                            <span className="text-sm font-medium">Group Rankings:</span>
                            <div className="space-y-1">
                              {proposal.rankings.map((ranking) => (
                                <div key={ranking.id} className="flex items-center justify-between text-sm">
                                  <span>{ranking.user.firstName || 'Group Member'}</span>
                                  <Badge variant="outline" className="text-xs">
                                    #{ranking.ranking}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={Users}
              title="No hotel proposals yet"
              description="Propose hotels to your group so everyone can vote on the best option. Search for hotels above or add one manually!"
              actionLabel="Search Hotels"
              onAction={focusSearchPanel}
              secondaryActionLabel="Add Manually"
              onSecondaryAction={() => setIsDialogOpen(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="currency" className="space-y-6 mt-6">
          {/* Currency Converter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Currency Converter
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Convert currencies for your travel budget planning with live exchange rates
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="100"
                    value={currencyAmount}
                    onChange={(e) => setCurrencyAmount(e.target.value)}
                    className="text-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>From Currency</Label>
                  <Select value={fromCurrency} onValueChange={setFromCurrency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">🇺🇸 USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">🇪🇺 EUR - Euro</SelectItem>
                      <SelectItem value="GBP">🇬🇧 GBP - British Pound</SelectItem>
                      <SelectItem value="JPY">🇯🇵 JPY - Japanese Yen</SelectItem>
                      <SelectItem value="AUD">🇦🇺 AUD - Australian Dollar</SelectItem>
                      <SelectItem value="CAD">🇨🇦 CAD - Canadian Dollar</SelectItem>
                      <SelectItem value="CHF">🇨🇭 CHF - Swiss Franc</SelectItem>
                      <SelectItem value="CNY">🇨🇳 CNY - Chinese Yuan</SelectItem>
                      <SelectItem value="SEK">🇸🇪 SEK - Swedish Krona</SelectItem>
                      <SelectItem value="NZD">🇳🇿 NZD - New Zealand Dollar</SelectItem>
                      <SelectItem value="MXN">🇲🇽 MXN - Mexican Peso</SelectItem>
                      <SelectItem value="SGD">🇸🇬 SGD - Singapore Dollar</SelectItem>
                      <SelectItem value="HKD">🇭🇰 HKD - Hong Kong Dollar</SelectItem>
                      <SelectItem value="NOK">🇳🇴 NOK - Norwegian Krone</SelectItem>
                      <SelectItem value="KRW">🇰🇷 KRW - South Korean Won</SelectItem>
                      <SelectItem value="TRY">🇹🇷 TRY - Turkish Lira</SelectItem>
                      <SelectItem value="RUB">🇷🇺 RUB - Russian Ruble</SelectItem>
                      <SelectItem value="INR">🇮🇳 INR - Indian Rupee</SelectItem>
                      <SelectItem value="BRL">🇧🇷 BRL - Brazilian Real</SelectItem>
                      <SelectItem value="ZAR">🇿🇦 ZAR - South African Rand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>To Currency</Label>
                  <Select value={toCurrency} onValueChange={setToCurrency}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">🇺🇸 USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">🇪🇺 EUR - Euro</SelectItem>
                      <SelectItem value="GBP">🇬🇧 GBP - British Pound</SelectItem>
                      <SelectItem value="JPY">🇯🇵 JPY - Japanese Yen</SelectItem>
                      <SelectItem value="AUD">🇦🇺 AUD - Australian Dollar</SelectItem>
                      <SelectItem value="CAD">🇨🇦 CAD - Canadian Dollar</SelectItem>
                      <SelectItem value="CHF">🇨🇭 CHF - Swiss Franc</SelectItem>
                      <SelectItem value="CNY">🇨🇳 CNY - Chinese Yuan</SelectItem>
                      <SelectItem value="SEK">🇸🇪 SEK - Swedish Krona</SelectItem>
                      <SelectItem value="NZD">🇳🇿 NZD - New Zealand Dollar</SelectItem>
                      <SelectItem value="MXN">🇲🇽 MXN - Mexican Peso</SelectItem>
                      <SelectItem value="SGD">🇸🇬 SGD - Singapore Dollar</SelectItem>
                      <SelectItem value="HKD">🇭🇰 HKD - Hong Kong Dollar</SelectItem>
                      <SelectItem value="NOK">🇳🇴 NOK - Norwegian Krone</SelectItem>
                      <SelectItem value="KRW">🇰🇷 KRW - South Korean Won</SelectItem>
                      <SelectItem value="TRY">🇹🇷 TRY - Turkish Lira</SelectItem>
                      <SelectItem value="RUB">🇷🇺 RUB - Russian Ruble</SelectItem>
                      <SelectItem value="INR">🇮🇳 INR - Indian Rupee</SelectItem>
                      <SelectItem value="BRL">🇧🇷 BRL - Brazilian Real</SelectItem>
                      <SelectItem value="ZAR">🇿🇦 ZAR - South African Rand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <Button
                  onClick={() => {
                    const temp = fromCurrency;
                    setFromCurrency(toCurrency);
                    setToCurrency(temp);
                  }}
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex justify-center">
                <Button 
                  onClick={convertCurrency}
                  disabled={isConverting}
                  className="w-full md:w-auto"
                  size="lg"
                >
                  {isConverting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Converting...
                    </div>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Convert Currency
                    </>
                  )}
                </Button>
              </div>

              {conversionResult && (
                <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
                  <CardContent className="pt-6">
                    <div className="text-center space-y-2">
                      <div className="text-sm text-muted-foreground">Conversion Result</div>
                      <div className="text-2xl font-bold text-green-600">
                        {currencyAmount} {fromCurrency} = {conversionResult}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Exchange rates provided by @fawazahmed0/currency-api
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">💡 Travel Budget Tips</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Exchange rates fluctuate daily - check before your trip</li>
                  <li>• Consider using cards with no foreign transaction fees</li>
                  <li>• Keep some local currency for small vendors and tips</li>
                  <li>• Airport exchanges often have higher fees than banks</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* User's Personal Hotels (Existing Bookings) */}
      {hotels.length === 0 && !hasSearchResults ? (
        <EmptyState
          icon={Bed}
          title="No saved hotels yet"
          description="Already booked a hotel? Add it here to keep your group in sync. You can also search and propose options above."
          actionLabel="Add Hotel Manually"
          onAction={() => setIsDialogOpen(true)}
          secondaryActionLabel="Search Hotels"
          onSecondaryAction={focusSearchPanel}
        />
      ) : hotels.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {hotels.map((hotel) => (
            <Card key={hotel.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{hotel.name}</CardTitle>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {hotel.location}
                    </p>
                    {hotel.user && (
                      <AttributionLabel
                        name={hotel.user.firstName || hotel.user.username || "Unknown"}
                        isCurrentUser={hotel.user.id === user?.id}
                        variant="booked"
                        className="mt-1"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1">
                      {getStarRating(hotel.rating || 5)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Check-in/out:</span>
                  <span className="font-medium">
                    {formatDateRange(String(hotel.checkInDate), String(hotel.checkOutDate))}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Guests:</span>
                  <span className="font-medium flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {hotel.guests}
                  </span>
                </div>

                {hotel.totalPrice != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(hotel.totalPrice, {
                        currency: hotel.currency ?? "USD",
                      })}
                    </span>
                  </div>
                )}

                {user?.id && (
                  <HotelRsvpSection hotelId={hotel.id} currentUserId={user.id} />
                )}

                {(hotel.roomType || hotel.pricePerNight || hotel.bookingPlatform || hotel.amenities || hotel.description || hotel.totalPrice) && (
                  <CollapsibleDetails label="More details">
                    {hotel.totalPrice != null && (
                      <div className="text-xs text-orange-600 bg-orange-50 dark:bg-orange-950/30 px-2 py-1 rounded border border-orange-200 dark:border-orange-800 mb-2">
                        Prices are estimates - may differ from booking sites
                      </div>
                    )}
                    {hotel.roomType && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Room:</span>
                        <span className="font-medium">{hotel.roomType}</span>
                      </div>
                    )}
                    {hotel.pricePerNight != null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Per Night:</span>
                        <span className="font-medium">
                          {formatCurrency(hotel.pricePerNight, {
                            currency: hotel.currency ?? "USD",
                          })}
                        </span>
                      </div>
                    )}
                    {hotel.bookingPlatform && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Platform:</span>
                        <Badge variant="secondary">{hotel.bookingPlatform}</Badge>
                      </div>
                    )}
                    {hotel.amenities && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Amenities:</span>
                        <p className="text-xs text-muted-foreground mt-1">{String(hotel.amenities)}</p>
                      </div>
                    )}
                    {hotel.description && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Notes:</span>
                        <p className="text-xs text-muted-foreground mt-1">{String(hotel.description)}</p>
                      </div>
                    )}
                  </CollapsibleDetails>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(hotel)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(hotel.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Only show Propose button if hotel is not already proposed or scheduled */}
                    {!hotelProposals.some(p => p.stayId === hotel.id) && hotel.status !== 'scheduled' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void shareHotelWithGroup(hotel);
                        }}
                        data-testid={`button-propose-saved-hotel-${hotel.id}`}
                        disabled={proposingHotelId === hotel.id}
                      >
                        {proposingHotelId === hotel.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Proposing...
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3 mr-1" />
                            Propose
                          </>
                        )}
                      </Button>
                    )}
                    {hotel.bookingUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => hotel.bookingUrl && window.open(hotel.bookingUrl, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View Booking
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Booking Confirmation Modal */}
      <BookingConfirmationModal
        isOpen={showModal}
        onClose={closeModal}
        bookingType={bookingData?.type || 'hotel'}
        bookingData={bookingData?.data}
        tripId={tripId}
        onSuccess={() => {
          // Refetch hotels data
          reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotels`] });
          // PROPOSALS FEATURE: reflect scheduled hotels in the proposals tab immediately.
          reactQueryClient.invalidateQueries({ queryKey: [`/api/trips/${tripId}/hotel-proposals`] });
        }}
      />
      </div>
    </div>
  );
}
