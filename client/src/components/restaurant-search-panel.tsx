import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import {
  CalendarIcon,
  ChefHat,
  Clock,
  ExternalLink,
  MapPin,
  NotebookPen,
  Phone,
  Search,
  Star,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchFormCard } from "@/components/search/SearchFormCard";
import { FormGrid, FormRow, FormActions } from "@/components/search/FormGrid";
import { FieldLabel } from "@/components/search/FieldLabel";
import { SearchButton } from "@/components/search/SearchButton";
import { ExternalPlatformLinks, ExternalLinkButton } from "@/components/search/ExternalPlatformLinks";

import SmartLocationSearch, { type LocationResult as SmartLocationResult } from "@/components/SmartLocationSearch";
import { TravelLoading } from "@/components/LoadingSpinners";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { cn } from "@/lib/utils";
import { buildOpenTableUrl, buildResyUrl } from "@/utils/urlBuilders/restaurants";
import { markExternalRedirect, RESTAURANT_REDIRECT_STORAGE_KEY } from "@/lib/externalRedirects";

import type { TripWithDetails } from "@shared/schema";
import type { RestaurantPlatform } from "@/types/restaurants";

export interface RestaurantSearchPanelProps {
  tripId?: string | number;
  trip?: TripWithDetails;
  user?: { defaultCity?: string | null; defaultLocation?: string | null } | null;
  onLogRestaurantManually?: () => void;
  onProposeRestaurant?: (restaurant: any) => void;
  onBookingLinkClick?: (restaurant: any, link: { text: string; url: string; type: string }) => void;
  onExternalSearch?: (details: {
    platform: RestaurantPlatform;
    url: string;
    date: string;
    partySize: number;
    city: string;
    time?: string;
    stateCode?: string;
    latitude?: number;
    longitude?: number;
  }) => void;
  initialSearchDate?: Date;
  initialSearchTime?: string;
  initialPartySize?: number;
}

export const RestaurantSearchPanel = forwardRef<HTMLDivElement, RestaurantSearchPanelProps>(
  (
    {
      tripId,
      trip,
      user,
      onLogRestaurantManually,
      onProposeRestaurant,
      onBookingLinkClick,
      onExternalSearch,
      initialSearchDate,
      initialSearchTime,
      initialPartySize,
    },
    ref,
  ) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const normalizedTripId = typeof tripId === "string" ? parseInt(tripId, 10) : tripId;

    const [searchLocation, setSearchLocation] = useState("");
    const [selectedLocation, setSelectedLocation] = useState<SmartLocationResult | null>(null);
    const [searchCuisine, setSearchCuisine] = useState("all");
    const [searchPriceRange, setSearchPriceRange] = useState("all");
    const [searchDate, setSearchDate] = useState<Date | undefined>(initialSearchDate ?? new Date());
    const [searchTime, setSearchTime] = useState(initialSearchTime ?? "7:00 PM");
    const [searchPartySize, setSearchPartySize] = useState(initialPartySize ?? 2);
    const [hasSearched, setHasSearched] = useState(false);
    const lastSelectedLocationRef = useRef<string | null>(null);

    const { data: searchResults = [], isLoading: searchLoading, refetch } = useQuery({
      queryKey: [
        "/api/restaurants/search",
        searchLocation,
        searchCuisine,
        searchPriceRange,
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          location: searchLocation,
          limit: "20",
          radius: "5000",
        });

        if (searchCuisine && searchCuisine !== "all") {
          params.append("cuisine", searchCuisine);
        }

        if (searchPriceRange && searchPriceRange !== "all") {
          params.append("priceRange", searchPriceRange);
        }

        const response = await apiFetch(`/api/restaurants/search?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      },
      enabled: false,
    });

    const sortedSearchResults = useMemo(() => {
      const results = [...(searchResults as any[])];
      return results.sort((a, b) => (Number(b.rating ?? 0) || 0) - (Number(a.rating ?? 0) || 0));
    }, [searchResults]);

    useEffect(() => {
      if (trip && !searchLocation) {
        setSearchLocation((trip as any).destination);
      } else if (!normalizedTripId && !searchLocation) {
        if (user?.defaultCity) {
          setSearchLocation(user.defaultCity);
        } else if (user?.defaultLocation) {
          setSearchLocation(user.defaultLocation);
        } else {
          setSearchLocation("Paris");
        }
      }
    }, [trip, searchLocation, tripId, user]);

    const parseAddressForTrip = useCallback(
      (address: string) => {
        const parts = address.split(',').map((part) => part.trim()).filter(Boolean);

        let city = "";
        let country = "";

        if (parts.length >= 2) {
          country = parts[parts.length - 1];
          city = parts[parts.length - 2];
        } else if (parts.length === 1) {
          city = parts[0];
        }

        if (!city && searchLocation) {
          city = searchLocation;
        }

        if (!country && searchLocation) {
          country = searchLocation;
        }

        if (!city) {
          city = "Unknown City";
        }

        if (!country) {
          country = "Unknown Country";
        }

        return { city, country };
      },
      [searchLocation]
    );

    const addRestaurantFromSearchMutation = useMutation({
      mutationFn: async (restaurant: any) => {
        if (!normalizedTripId) {
          throw new Error("Trip context missing");
        }

        const addressValue = restaurant.address || searchLocation || "";
        const { city, country } = parseAddressForTrip(addressValue);
        const reservationDateValue = searchDate ?? new Date();
        const ratingValue = Number(restaurant.rating);
        const openTableLink = restaurant.bookingLinks?.find((link: any) => {
          const text = (link.text || "").toLowerCase();
          const url = (link.url || "").toLowerCase();
          return text.includes("opentable") || url.includes("opentable");
        });

        const payload = {
          tripId: Number(normalizedTripId),
          name: restaurant.name,
          address: addressValue,
          city,
          country,
          reservationDate: format(reservationDateValue, "yyyy-MM-dd"),
          reservationTime: searchTime,
          partySize: Number.isNaN(Number(searchPartySize)) ? 2 : Number(searchPartySize),
          cuisineType: restaurant.cuisineType || restaurant.cuisine || null,
          zipCode: null,
          latitude: restaurant.latitude ?? null,
          longitude: restaurant.longitude ?? null,
          phoneNumber: restaurant.phone || restaurant.phoneNumber || null,
          website: restaurant.website || null,
          openTableUrl: openTableLink?.url || null,
          priceRange: restaurant.priceRange || "$$",
          rating: Number.isFinite(ratingValue) ? ratingValue : null,
          confirmationNumber: null,
          specialRequests: null,
          notes: null,
        };

        return apiRequest(`/api/trips/${normalizedTripId}/restaurants`, {
          method: "POST",
          body: payload,
        });
      },
      onSuccess: () => {
        toast({
          title: "Restaurant Added",
          description: "This restaurant was added to your group reservations.",
        });
        if (normalizedTripId) {
          const queryKeyId = typeof tripId === "undefined" ? normalizedTripId : tripId;
          queryClient.invalidateQueries({ queryKey: ["/api/trips", queryKeyId, "restaurants"] });
          queryClient.invalidateQueries({ queryKey: ["/api/trips", queryKeyId, "restaurant-proposals"] });
        }
      },
      onError: (error) => {
        if (isUnauthorizedError(error)) {
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

        toast({
          title: "Unable to Add Restaurant",
          description: "We couldn't save this restaurant. Please try again.",
          variant: "destructive",
        });
      },
    });

    const runSearch = useCallback(() => {
      if (!searchLocation.trim()) {
        toast({
          title: "Location Required",
          description: "Please enter a location to search for restaurants.",
          variant: "destructive",
        });
        return;
      }

      setHasSearched(true);
      refetch();
    }, [refetch, searchLocation, toast]);

    const handleLocationSelect = useCallback((location: SmartLocationResult) => {
      const candidates: string[] = [];
      if (typeof location.cityName === "string") {
        candidates.push(location.cityName.trim());
      }
      if (typeof location.name === "string") {
        candidates.push(location.name.trim());
      }
      if (typeof location.displayName === "string") {
        const [firstPart] = location.displayName.split(",");
        if (firstPart) {
          candidates.push(firstPart.trim());
        }
      }

      const nextLocation = candidates.find((value) => value.length > 0) ?? "";
      const normalized = nextLocation.length > 0 ? nextLocation : searchLocation.trim();

      setSearchLocation(normalized);
      setSelectedLocation(location);
      lastSelectedLocationRef.current = normalized.length > 0 ? normalized : null;
    }, [searchLocation]);

    const handleLocationQueryChange = useCallback(
      (value: string) => {
        setSearchLocation(value);
        const trimmed = value.trim();

        if (!trimmed) {
          setSelectedLocation(null);
          lastSelectedLocationRef.current = null;
          return;
        }

        if (lastSelectedLocationRef.current && trimmed !== lastSelectedLocationRef.current.trim()) {
          setSelectedLocation(null);
        }
      },
      [],
    );

    const derivedLocation = useMemo(() => {
      const fallbackCity = searchLocation.trim();
      let city = fallbackCity;

      if (selectedLocation) {
        const candidateCityValues = [
          typeof selectedLocation.cityName === "string" ? selectedLocation.cityName.trim() : "",
          typeof selectedLocation.name === "string" ? selectedLocation.name.trim() : "",
        ];

        if (typeof selectedLocation.displayName === "string") {
          const [firstPart] = selectedLocation.displayName.split(",");
          if (firstPart) {
            candidateCityValues.push(firstPart.trim());
          }
        }

        city = candidateCityValues.find((value) => value.length > 0) ?? fallbackCity;
      }

      const rawState =
        selectedLocation && typeof selectedLocation.state === "string" ? selectedLocation.state : undefined;

      const trimmedState = rawState?.trim();
      const stateCode =
        trimmedState && /^[A-Za-z]{2}$/.test(trimmedState) ? trimmedState.toUpperCase() : undefined;

      const latitude =
        selectedLocation && typeof selectedLocation.latitude === "number" && Number.isFinite(selectedLocation.latitude)
          ? selectedLocation.latitude
          : undefined;
      const longitude =
        selectedLocation &&
        typeof selectedLocation.longitude === "number" && Number.isFinite(selectedLocation.longitude)
          ? selectedLocation.longitude
          : undefined;

      return {
        city,
        stateCode,
        latitude,
        longitude,
      };
    }, [searchLocation, selectedLocation]);

    const formatDateYYYYMMDD = useCallback((value?: Date) => {
      if (!value || Number.isNaN(value.getTime())) {
        return "";
      }

      return format(value, "yyyy-MM-dd");
    }, []);

    const formatTimeHHmm = useCallback((value?: string) => {
      if (!value) {
        return "";
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return "";
      }

      if (/^\d{2}:\d{2}$/.test(trimmed)) {
        return trimmed;
      }

      try {
        const parsedTime = parse(trimmed, "h:mm a", new Date());
        if (Number.isNaN(parsedTime.getTime())) {
          return "";
        }

        return format(parsedTime, "HH:mm");
      } catch (error) {
        return "";
      }
    }, []);

    const openInNewTab = useCallback((url: string) => {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }, []);

    const reservationDetails = useMemo(() => {
      const date = formatDateYYYYMMDD(searchDate);
      const time = formatTimeHHmm(searchTime);
      const partySize = Math.max(1, Number(searchPartySize) || 1);
      const hasCity = derivedLocation.city.trim().length > 0;
      const hasDate = Boolean(date);
      const hasPartySize = partySize >= 1;
      const resyDisabled = !(hasCity && hasDate && hasPartySize);
      const openTableDisabled = resyDisabled || !time;

      return {
        date,
        time,
        partySize,
        hasCity,
        resyDisabled,
        openTableDisabled,
      };
    }, [derivedLocation.city, formatDateYYYYMMDD, formatTimeHHmm, searchDate, searchPartySize, searchTime]);

    const handleSearchResy = useCallback(() => {
      if (reservationDetails.resyDisabled) {
        return;
      }

      const city = derivedLocation.city.trim();
      if (!city || !reservationDetails.date) {
        return;
      }

      const url = buildResyUrl({
        city,
        stateCode: derivedLocation.stateCode,
        date: reservationDetails.date,
        partySize: reservationDetails.partySize,
      });

      markExternalRedirect(RESTAURANT_REDIRECT_STORAGE_KEY);
      openInNewTab(url);
      onExternalSearch?.({
        platform: "resy",
        url,
        date: reservationDetails.date,
        partySize: reservationDetails.partySize,
        city,
        stateCode: derivedLocation.stateCode,
        latitude: derivedLocation.latitude,
        longitude: derivedLocation.longitude,
      });
    }, [derivedLocation, onExternalSearch, openInNewTab, reservationDetails]);

    const handleSearchOpenTable = useCallback(() => {
      if (reservationDetails.openTableDisabled) {
        return;
      }

      const city = derivedLocation.city.trim();
      if (!city || !reservationDetails.date || !reservationDetails.time) {
        return;
      }

      const url = buildOpenTableUrl({
        city,
        date: reservationDetails.date,
        time: reservationDetails.time,
        partySize: reservationDetails.partySize,
        latitude: derivedLocation.latitude,
        longitude: derivedLocation.longitude,
      });

      markExternalRedirect(RESTAURANT_REDIRECT_STORAGE_KEY);
      openInNewTab(url);
      onExternalSearch?.({
        platform: "open_table",
        url,
        date: reservationDetails.date,
        time: reservationDetails.time,
        partySize: reservationDetails.partySize,
        city,
        stateCode: derivedLocation.stateCode,
        latitude: derivedLocation.latitude,
        longitude: derivedLocation.longitude,
      });
    }, [derivedLocation, onExternalSearch, openInNewTab, reservationDetails]);

    const { resyDisabled, openTableDisabled } = reservationDetails;

    const handleAddFromSearch = (restaurant: any) => {
      if (!normalizedTripId) {
        toast({
          title: "Trip Required",
          description: "Open a trip to add restaurants to your group list.",
          variant: "destructive",
        });
        return;
      }

      if (!searchDate) {
        toast({
          title: "Select a Date",
          description: "Choose a reservation date before adding the restaurant.",
          variant: "destructive",
        });
        return;
      }

      if (!searchTime) {
        toast({
          title: "Select a Time",
          description: "Choose a reservation time before adding the restaurant.",
          variant: "destructive",
        });
        return;
      }

      addRestaurantFromSearchMutation.mutate(restaurant);
    };

    return (
      <section ref={ref} aria-labelledby="restaurant-search-heading">
        <SearchFormCard
          id="restaurant-search-panel"
          title="Search Restaurants"
          subtitle="Plan a reservation without leaving the page."
          icon={<Search className="h-5 w-5" />}
        >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                runSearch();
              }}
              className="space-y-6"
            >
              <FormGrid columns={4}>
                <FormRow>
                  <FieldLabel htmlFor="location">Location</FieldLabel>
                  <SmartLocationSearch
                    placeholder="Enter city, airport, or region..."
                    value={searchLocation}
                    onLocationSelect={handleLocationSelect}
                    onQueryChange={handleLocationQueryChange}
                    className="w-full"
                  />
                </FormRow>

                <FormRow>
                  <FieldLabel htmlFor="reservationDate">Date</FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !searchDate && "text-muted-foreground"
                        )}
                      >
                        {searchDate ? format(searchDate, "PPP") : "Pick a date"}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={searchDate}
                        onSelect={setSearchDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FormRow>

                <FormRow>
                  <FieldLabel htmlFor="reservationTime">Time</FieldLabel>
                  <Select value={searchTime} onValueChange={setSearchTime}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5:00 PM">5:00 PM</SelectItem>
                      <SelectItem value="5:30 PM">5:30 PM</SelectItem>
                      <SelectItem value="6:00 PM">6:00 PM</SelectItem>
                      <SelectItem value="6:30 PM">6:30 PM</SelectItem>
                      <SelectItem value="7:00 PM">7:00 PM</SelectItem>
                      <SelectItem value="7:30 PM">7:30 PM</SelectItem>
                      <SelectItem value="8:00 PM">8:00 PM</SelectItem>
                      <SelectItem value="8:30 PM">8:30 PM</SelectItem>
                      <SelectItem value="9:00 PM">9:00 PM</SelectItem>
                      <SelectItem value="9:30 PM">9:30 PM</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

                <FormRow>
                  <FieldLabel htmlFor="partySize">Party Size</FieldLabel>
                  <Select
                    value={searchPartySize.toString()}
                    onValueChange={(value) => setSearchPartySize(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select party size" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((size) => (
                        <SelectItem key={size} value={size.toString()}>
                          {size} {size === 1 ? "person" : "people"}
                        </SelectItem>
                      ))}
                      <SelectItem value="12">12 people</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
              </FormGrid>

              <FormGrid columns={3}>
                <FormRow>
                  <FieldLabel htmlFor="cuisine">Cuisine</FieldLabel>
                  <Select value={searchCuisine} onValueChange={setSearchCuisine}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any cuisine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any cuisine</SelectItem>
                      <SelectItem value="italian">Italian</SelectItem>
                      <SelectItem value="french">French</SelectItem>
                      <SelectItem value="japanese">Japanese</SelectItem>
                      <SelectItem value="mexican">Mexican</SelectItem>
                      <SelectItem value="indian">Indian</SelectItem>
                      <SelectItem value="thai">Thai</SelectItem>
                      <SelectItem value="chinese">Chinese</SelectItem>
                      <SelectItem value="mediterranean">Mediterranean</SelectItem>
                      <SelectItem value="seafood">Seafood</SelectItem>
                      <SelectItem value="steakhouse">Steakhouse</SelectItem>
                      <SelectItem value="vegan">Vegan</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

                <FormRow>
                  <FieldLabel htmlFor="priceRange">Price Range</FieldLabel>
                  <Select value={searchPriceRange} onValueChange={setSearchPriceRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Any price" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any price</SelectItem>
                      <SelectItem value="$">$ - Budget</SelectItem>
                      <SelectItem value="$$">$$ - Moderate</SelectItem>
                      <SelectItem value="$$$">$$$ - Upscale</SelectItem>
                      <SelectItem value="$$$$">$$$$ - Very Expensive</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>

              </FormGrid>

              <ExternalPlatformLinks>
                <ExternalLinkButton
                  onClick={handleSearchOpenTable}
                  disabled={openTableDisabled}
                  tooltip="Build link and search on OpenTable"
                  data-testid="button-search-open-table"
                >
                  Search OpenTable
                </ExternalLinkButton>
                <ExternalLinkButton
                  onClick={handleSearchResy}
                  disabled={resyDisabled}
                  tooltip="Build link and search on Resy"
                  data-testid="button-search-resy"
                >
                  Search Resy
                </ExternalLinkButton>
                <SearchButton isLoading={searchLoading} loadingText="Searching...">
                  Search Restaurants
                </SearchButton>
                {onLogRestaurantManually && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={onLogRestaurantManually}
                  >
                    <NotebookPen className="h-4 w-4 mr-2" />
                    Log Restaurant Manually
                  </Button>
                )}
              </ExternalPlatformLinks>
            </form>
        </SearchFormCard>

        {hasSearched && !searchLoading && sortedSearchResults.length === 0 && (
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center justify-center space-y-3 py-12 text-center">
              <Search className="h-8 w-8 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No restaurants found</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Try adjusting your filters or changing the location to discover more options.
              </p>
            </CardContent>
          </Card>
        )}

        {sortedSearchResults.length > 0 && (
          <div className="space-y-4 mt-6">
            <h2 className="text-xl font-semibold">
              Search Results ({sortedSearchResults.length} restaurants)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedSearchResults.map((restaurant: any) => (
                <Card key={restaurant.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <ChefHat className="h-4 w-4" />
                          {restaurant.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Badge variant="secondary">{restaurant.cuisine || restaurant.cuisineType || "Restaurant"}</Badge>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {restaurant.priceRange}
                          </span>
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        {restaurant.rating}/10
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <MapPin className="h-4 w-4" />
                      {restaurant.address}
                    </div>

                    {(restaurant.phoneNumber || restaurant.phone) && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone className="h-4 w-4" />
                        {restaurant.phoneNumber || restaurant.phone}
                      </div>
                    )}

                    {restaurant.distance && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="h-4 w-4" />
                        {Math.round((restaurant.distance / 1000) * 10) / 10} km away
                      </div>
                    )}

                    {restaurant.tips && restaurant.tips.length > 0 && (
                      <div className="space-y-1">
                        {restaurant.tips.slice(0, 1).map((tip: string, index: number) => (
                          <p key={index} className="text-sm text-gray-600 dark:text-gray-400 italic">
                            "{tip}" - Foursquare user
                          </p>
                        ))}
                      </div>
                    )}

                    {restaurant.bookingLinks && restaurant.bookingLinks.length > 0 && onBookingLinkClick && (
                      <div className="flex flex-wrap gap-1 pt-2">
                        {restaurant.bookingLinks.map((link: any, index: number) => (
                          <Button
                            key={index}
                            variant={link.type === "direct" ? "default" : "outline"}
                            size="sm"
                            onClick={() => onBookingLinkClick?.(restaurant, link)}
                            data-testid={`button-booking-link-${link.type}-${index}`}
                            className="text-xs"
                          >
                            {link.type === "phone" ? (
                              <Phone className="h-3 w-3 mr-1" />
                            ) : (
                              <ExternalLink className="h-3 w-3 mr-1" />
                            )}
                            {link.text}
                          </Button>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 border-t space-y-2">
                      <Button
                        onClick={() => handleAddFromSearch(restaurant)}
                        size="sm"
                        className="w-full"
                        data-testid={`button-add-restaurant-${restaurant.id}`}
                        disabled={addRestaurantFromSearchMutation.isPending}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        {addRestaurantFromSearchMutation.isPending ? "Adding..." : "Add & Float to Group"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  }
);

RestaurantSearchPanel.displayName = "RestaurantSearchPanel";

