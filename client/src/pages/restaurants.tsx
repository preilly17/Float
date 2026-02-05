import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarIcon,
  MapPin,
  Phone,
  Clock,
  Star,
  Users,
  ExternalLink,
  Utensils,
  Globe,
  Search,
  NotebookPen,
  ChefHat,
} from "lucide-react";
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
import type { TripWithDetails, RestaurantWithDetails } from "@shared/schema";
import { TravelLoading } from "@/components/LoadingSpinners";
import { RestaurantRsvpSection } from "@/components/restaurant-rsvp-section";
import { AttributionLabel } from "@/components/attribution-label";
import { CollapsibleDetails } from "@/components/collapsible-details";
import { useBookingConfirmation } from "@/hooks/useBookingConfirmation";
import { BookingConfirmationModal } from "@/components/booking-confirmation-modal";
import { RestaurantSearchPanel } from "@/components/restaurant-search-panel";
import { RestaurantManualDialog } from "@/components/restaurant-manual-dialog";
import { scheduledActivitiesQueryKey as buildScheduledActivitiesKey } from "@/lib/activities/queryKeys";
import { EmptyState } from "@/components/empty-state";

export default function RestaurantsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const numericTripId = tripId ? Number.parseInt(tripId, 10) : null;

  // Booking confirmation system
  const {
    showModal: showBookingModal,
    bookingData,
    storeBookingIntent,
    closeModal: closeBookingModal,
    confirmBooking,
    markBookingAsAsked
  } = useBookingConfirmation();

  const [showBooking, setShowBooking] = useState(false);
  const [restaurantToDelete, setRestaurantToDelete] = useState<RestaurantWithDetails | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [proposingRestaurantId, setProposingRestaurantId] = useState<number | null>(null);
  const searchSectionRef = useRef<HTMLDivElement | null>(null);

  // Delete restaurant mutation
  const deleteRestaurantMutation = useMutation({
    mutationFn: async (restaurantId: number) => {
      await apiRequest(`/api/restaurants/${restaurantId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Restaurant deleted",
        description: "The restaurant reservation has been removed.",
      });
      if (tripId) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "restaurants"] });
      }
      setShowDeleteConfirm(false);
      setRestaurantToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete restaurant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteRestaurant = (restaurant: RestaurantWithDetails) => {
    setRestaurantToDelete(restaurant);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (restaurantToDelete) {
      deleteRestaurantMutation.mutate(restaurantToDelete.id);
    }
  };

  // Get trip details (only if tripId exists)
  const { data: trip } = useQuery<TripWithDetails>({
    queryKey: ["/api/trips", tripId],
    enabled: !!tripId,
  });

  // Get current trip restaurants (only if tripId exists)
  const { data: tripRestaurants = [], isLoading: restaurantsLoading } = useQuery<RestaurantWithDetails[]>({
    queryKey: ["/api/trips", tripId, "restaurants"],
    enabled: !!tripId,
  });

  const focusSearchSection = useCallback(() => {
    if (!searchSectionRef.current) {
      return;
    }

    searchSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstFocusable = searchSectionRef.current.querySelector<HTMLElement>(
      "input, button, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    firstFocusable?.focus();
  }, []);

  const handleOpenManualDialog = useCallback(() => {
    setShowBooking(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("panel") === "search") {
      focusSearchSection();
    }

    const manualParam = params.get("manual");
    if (manualParam === "1" || manualParam === "true") {
      setShowBooking(true);
    }
  }, [focusSearchSection]);

  // Handle booking link clicks with tracking
  const handleBookingLinkClick = (restaurant: any, link: { text: string; url: string; type: string }) => {
    if (!tripId) {
      // If not in trip context, just open the link
      window.open(link.url, '_blank', 'noopener,noreferrer');
      return;
    }
    
    console.log('Tracking booking link click:', { restaurant: restaurant.name, link: link.text, url: link.url });
    
    // Store booking intent before user leaves
    storeBookingIntent('restaurant', {
      id: restaurant.id,
      name: restaurant.name,
      address: restaurant.address,
      phone: restaurant.phone,
      cuisine: restaurant.cuisine,
      rating: restaurant.rating,
      priceRange: restaurant.priceRange,
      website: restaurant.website,
      bookingLinks: restaurant.bookingLinks,
      tripId: parseInt(tripId)
    }, parseInt(tripId), link.url);
    
    // Open the booking link
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };
  
  // Propose restaurant mutation
  const proposeRestaurantMutation = useMutation({
    mutationFn: async (restaurant: RestaurantWithDetails) => {
      if (!numericTripId) throw new Error("No trip selected");
      
      const payload = {
        restaurantName: restaurant.name,
        address: restaurant.address || "Unknown Address",
        cuisineType: restaurant.cuisineType || (restaurant as any).cuisine,
        priceRange: restaurant.priceRange || "$$",
        rating: restaurant.rating,
        phoneNumber: restaurant.phoneNumber || (restaurant as any).phone,
        website: restaurant.website,
        reservationUrl: restaurant.openTableUrl,
        platform: "Manual",
        preferredMealTime: "dinner",
        preferredDates: [],
        dietaryOptions: [],
        features: [],
        status: "active",
      };

      return apiRequest(`/api/trips/${numericTripId}/restaurant-proposals`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      toast({
        title: "Restaurant proposed",
        description: "The restaurant has been proposed to your group.",
      });
      if (numericTripId) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", numericTripId, "restaurant-proposals"] });
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${numericTripId}/restaurant-proposals`] });
      }
      setProposingRestaurantId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to propose restaurant. Please try again.",
        variant: "destructive",
      });
      setProposingRestaurantId(null);
    },
  });

  // Handle propose restaurant to group
  const handleProposeToGroup = (restaurant: RestaurantWithDetails) => {
    setProposingRestaurantId(restaurant.id);
    proposeRestaurantMutation.mutate(restaurant);
  };

  // Handle unauthorized access
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
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <TravelLoading size="lg" text="Preparing your travel experience..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-primary/5 to-emerald-50/60 text-slate-900" style={{ colorScheme: 'light' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => window.location.href = tripId ? `/trip/${tripId}` : '/dashboard'}
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">
                  Restaurant Reservations
                  {trip && (trip as TripWithDetails).destination && (
                    <span className="text-lg font-normal text-neutral-500 ml-2">
                      in {(trip as TripWithDetails).destination}
                    </span>
                  )}
                </h1>
                <p className="text-neutral-600">
                  Find and book restaurants for your trip
                </p>
              </div>
            </div>
            <Button
              onClick={handleOpenManualDialog}
              disabled={!tripId}
              title={tripId ? undefined : "Open a trip to log restaurants manually"}
            >
              <NotebookPen className="h-4 w-4 mr-2" />
              Log Restaurant Manually
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
        <RestaurantSearchPanel
        ref={searchSectionRef}
        tripId={tripId}
        trip={trip as TripWithDetails | undefined}
        user={user}
        onLogRestaurantManually={handleOpenManualDialog}
        onProposeRestaurant={handleProposeToGroup}
        onBookingLinkClick={handleBookingLinkClick}
      />

      {/* Current Trip Restaurants */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Your Restaurant Reservations</h2>
        
        {restaurantsLoading ? (
          <div className="flex items-center justify-center py-12">
            <TravelLoading variant="luggage" size="lg" text="Loading your restaurant reservations..." />
          </div>
        ) : tripRestaurants.length === 0 ? (
          <EmptyState
            icon={Utensils}
            title="No restaurant reservations yet"
            description="Search for restaurants above or log your own reservations to start planning your dining experiences."
            actionLabel="Search Restaurants"
            onAction={focusSearchSection}
            secondaryActionLabel="Log Manually"
            onSecondaryAction={handleOpenManualDialog}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tripRestaurants.map((restaurant: RestaurantWithDetails) => (
              <Card key={restaurant.id} className="hover:shadow-lg transition-shadow" data-testid={`card-restaurant-${restaurant.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <ChefHat className="h-4 w-4" />
                        {restaurant.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="secondary">{restaurant.cuisineType || (restaurant as any).cuisine || 'Restaurant'}</Badge>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {restaurant.priceRange}
                        </span>
                      </CardDescription>
                      {restaurant.user && (
                        <AttributionLabel
                          name={restaurant.user.firstName || restaurant.user.username || "Unknown"}
                          isCurrentUser={restaurant.user.id === user?.id}
                          variant="booked"
                          className="mt-1"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      {restaurant.rating}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CalendarIcon className="h-4 w-4" />
                    {restaurant.reservationDate ? format(new Date(restaurant.reservationDate), "PPP") : 'No date set'}
                    <span className="mx-1">·</span>
                    <Clock className="h-4 w-4" />
                    {restaurant.reservationTime}
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Users className="h-4 w-4" />
                    {restaurant.partySize} people
                  </div>

                  {user?.id && (
                    <RestaurantRsvpSection restaurantId={restaurant.id} currentUserId={user.id} />
                  )}
                  
                  {(restaurant.address || restaurant.phoneNumber || restaurant.specialRequests) && (
                    <CollapsibleDetails label="More details">
                      {restaurant.address && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="h-4 w-4" />
                          {restaurant.address}
                        </div>
                      )}
                      {restaurant.phoneNumber && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <Phone className="h-4 w-4" />
                          {restaurant.phoneNumber}
                        </div>
                      )}
                      {restaurant.specialRequests && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          <strong>Special Requests:</strong> {restaurant.specialRequests}
                        </p>
                      )}
                    </CollapsibleDetails>
                  )}
                  
                  <div className="flex gap-2 pt-2">
                    {restaurant.openTableUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBookingLinkClick(restaurant, {
                          text: 'OpenTable',
                          url: restaurant.openTableUrl ?? '',
                          type: 'opentable'
                        })}
                        data-testid="button-opentable"
                        className="flex-1"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        OpenTable
                      </Button>
                    )}

                    {restaurant.website && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleBookingLinkClick(restaurant, {
                          text: 'Restaurant Website',
                          url: restaurant.website ?? '',
                          type: 'website'
                        })}
                        data-testid="button-restaurant-website"
                        className="flex-1"
                      >
                        <Globe className="h-4 w-4 mr-2" />
                        Website
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          data-testid={`button-delete-restaurant-${restaurant.id}`}
                        >
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Restaurant Reservation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the reservation at "{restaurant.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              deleteRestaurantMutation.mutate(restaurant.id);
                            }}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      </div>
      </div>

      {/* Booking Dialog */}
      <RestaurantManualDialog tripId={tripId} open={showBooking} onOpenChange={setShowBooking} />

      {/* Booking Confirmation Modal */}
      <BookingConfirmationModal
        isOpen={showBookingModal}
        onClose={closeBookingModal}
        bookingType="restaurant"
        bookingData={bookingData}
        tripId={numericTripId ?? 0}
        onConfirm={confirmBooking}
        markBookingAsAsked={markBookingAsAsked}
        onSuccess={() => {
          // Refresh activities if booking was confirmed
          if (numericTripId) {
            const scheduledKey = buildScheduledActivitiesKey(numericTripId);
            queryClient.invalidateQueries({ queryKey: scheduledKey });
          }
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Restaurant Reservation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the reservation at "{restaurantToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteRestaurantMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}