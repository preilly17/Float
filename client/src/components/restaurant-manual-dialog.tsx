import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarIcon } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { cn } from "@/lib/utils";
import { SaveProposeToggle, type SaveProposeMode } from "@/components/save-propose-toggle";
import { MemberSelector, type MemberOption } from "@/components/member-selector";
import { useAuth } from "@/hooks/useAuth";
import type { TripWithDetails } from "@shared/schema";

const optionalUrlField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .url({ message: "Invalid url" })
    .optional(),
);

const restaurantFormSchema = z.object({
  name: z.string().min(1, "Restaurant name is required"),
  cuisine: z.string().min(1, "Cuisine type is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().optional(),
  priceRange: z.string().min(1, "Price range is required"),
  rating: z.number().min(1).max(5),
  reservationDate: z.date(),
  reservationTime: z.string().min(1, "Reservation time is required"),
  partySize: z.number().min(1, "Party size must be at least 1"),
  specialRequests: z.string().optional(),
  website: optionalUrlField,
  openTableUrl: optionalUrlField,
});

export type RestaurantFormData = z.infer<typeof restaurantFormSchema>;

const defaultFormValues: RestaurantFormData = {
  name: "",
  cuisine: "",
  address: "",
  phone: "",
  priceRange: "$$",
  rating: 4.5,
  reservationDate: new Date(),
  reservationTime: "7:00 PM",
  partySize: 2,
  specialRequests: "",
  website: "",
  openTableUrl: "",
};

export interface RestaurantEditData {
  id: number;
  name: string;
  cuisine: string;
  address: string;
  phone?: string;
  priceRange: string;
  rating: number;
  reservationDate: Date;
  reservationTime: string;
  partySize: number;
  specialRequests?: string;
  website?: string;
  openTableUrl?: string;
}

export interface RestaurantManualDialogProps {
  tripId?: number | string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editingRestaurant?: RestaurantEditData | null;
}

export function RestaurantManualDialog({ tripId, open, onOpenChange, onSuccess, editingRestaurant }: RestaurantManualDialogProps) {
  const normalizedTripId = useMemo(() => {
    if (typeof tripId === "string") {
      const parsed = parseInt(tripId, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return tripId;
  }, [tripId]);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTripId, setSelectedTripId] = useState<number | null>(normalizedTripId ?? null);
  const [tripSelectionError, setTripSelectionError] = useState<string | null>(null);
  const [mode, setMode] = useState<SaveProposeMode>("SAVE");
  const [votingDeadline, setVotingDeadline] = useState<string>("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const isEditing = !!editingRestaurant;
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const { data: tripsData = [], isLoading: tripsLoading } = useQuery<TripWithDetails[]>({
    queryKey: ["/api/trips"],
    enabled: !normalizedTripId,
  });

  const availableTrips = tripsData ?? [];

  const effectiveTripId = normalizedTripId ?? selectedTripId ?? undefined;

  const tripContext = useMemo<TripWithDetails | undefined>(() => {
    if (!effectiveTripId) {
      return undefined;
    }

    const candidateKeys: Array<readonly unknown[]> = [
      [`/api/trips/${effectiveTripId}`],
      [`/api/trips/${String(effectiveTripId)}`],
      ["/api/trips", effectiveTripId],
      ["/api/trips", String(effectiveTripId)],
    ];

    for (const key of candidateKeys) {
      const data = queryClient.getQueryData<TripWithDetails>(key as any);
      if (data) {
        return data;
      }
    }

    if (!normalizedTripId) {
      return availableTrips.find((trip) => trip.id === effectiveTripId);
    }

    return undefined;
  }, [availableTrips, effectiveTripId, normalizedTripId, queryClient]);

  const memberOptions: MemberOption[] = useMemo(() => {
    if (!tripContext?.members) return [];
    return tripContext.members.map((member) => ({
      id: member.userId,
      name: member.user?.firstName || member.user?.username || member.userId,
      isCurrentUser: member.userId === currentUserId,
    }));
  }, [tripContext?.members, currentUserId]);

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
    if (mode === 'SAVE' && selectedMemberIds.length === 0 && currentUserId) {
      setSelectedMemberIds([currentUserId]);
    }
  }, [mode, selectedMemberIds.length, currentUserId]);

  const getCityAndCountry = (address: string) => {
    const parts = address
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    let city: string | null = null;
    let country: string | null = null;

    if (parts.length >= 2) {
      country = parts[parts.length - 1] || null;
      city = parts[parts.length - 2] || null;
    } else if (parts.length === 1) {
      city = parts[0] || null;
    }

    if (!city) {
      city = tripContext?.cityName || null;
    }

    if (!country) {
      country =
        tripContext?.countryName ||
        (() => {
          const destination = tripContext?.destination ?? "";
          const destinationParts = destination
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);

          if (destinationParts.length === 0) {
            return null;
          }

          return destinationParts[destinationParts.length - 1] || null;
        })();
    }

    return {
      city: city ?? "Unknown City",
      country: country ?? "Unknown Country",
    };
  };

  const getInitialValues = useMemo((): RestaurantFormData => {
    if (editingRestaurant) {
      return {
        name: editingRestaurant.name,
        cuisine: editingRestaurant.cuisine,
        address: editingRestaurant.address,
        phone: editingRestaurant.phone || "",
        priceRange: editingRestaurant.priceRange,
        rating: editingRestaurant.rating,
        reservationDate: editingRestaurant.reservationDate,
        reservationTime: editingRestaurant.reservationTime,
        partySize: editingRestaurant.partySize,
        specialRequests: editingRestaurant.specialRequests || "",
        website: editingRestaurant.website || "",
        openTableUrl: editingRestaurant.openTableUrl || "",
      };
    }
    return defaultFormValues;
  }, [editingRestaurant]);

  const form = useForm<RestaurantFormData>({
    resolver: zodResolver(restaurantFormSchema),
    defaultValues: getInitialValues,
  });

  useEffect(() => {
    if (open && editingRestaurant) {
      form.reset(getInitialValues);
    } else if (!open) {
      form.reset(defaultFormValues);
      setTripSelectionError(null);
      setSelectedTripId(normalizedTripId ?? null);
      setMode("SAVE");
      setVotingDeadline("");
    }
  }, [open, form, normalizedTripId, editingRestaurant, getInitialValues]);

  useEffect(() => {
    if (normalizedTripId) {
      setSelectedTripId(normalizedTripId);
      setTripSelectionError(null);
      return;
    }

    if (open && !selectedTripId && availableTrips.length > 0) {
      setSelectedTripId(availableTrips[0].id);
    }
  }, [availableTrips, normalizedTripId, open, selectedTripId]);

  useEffect(() => {
    if (selectedTripId) {
      setTripSelectionError(null);
    }
  }, [selectedTripId]);

  const createRestaurantMutation = useMutation({
    mutationFn: async ({ data, tripId: targetTripId, memberIds }: { data: RestaurantFormData; tripId: number; memberIds?: string[] }) => {
      const { city, country } = getCityAndCountry(data.address);
      const reservationDate = format(data.reservationDate, "yyyy-MM-dd");

      const payload = {
        tripId: Number(targetTripId),
        name: data.name,
        address: data.address,
        city,
        country,
        reservationDate,
        reservationTime: data.reservationTime,
        partySize: data.partySize,
        cuisineType: data.cuisine || null,
        zipCode: null,
        latitude: null,
        longitude: null,
        phoneNumber: data.phone?.trim() ? data.phone.trim() : null,
        website: data.website ?? null,
        openTableUrl: data.openTableUrl ?? null,
        priceRange: data.priceRange,
        rating: data.rating,
        confirmationNumber: null,
        specialRequests: data.specialRequests?.trim() ? data.specialRequests.trim() : null,
        notes: null,
        selectedMemberIds: memberIds,
      };

      return apiRequest(`/api/trips/${targetTripId}/restaurants`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (_, variables) => {
      const targetTripId = variables?.tripId;
      toast({
        title: "Restaurant Added",
        description: "Restaurant reservation has been added to your trip.",
      });
      if (targetTripId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", targetTripId, "restaurants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", String(targetTripId), "restaurants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", targetTripId, "restaurant-proposals"] });
      }
      form.reset(defaultFormValues);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: unknown) => {
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
        title: "Error",
        description: "Failed to add restaurant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateRestaurantMutation = useMutation({
    mutationFn: async ({ data, restaurantId }: { data: RestaurantFormData; restaurantId: number }) => {
      const { city, country } = getCityAndCountry(data.address);
      const reservationDate = format(data.reservationDate, "yyyy-MM-dd");

      const payload = {
        name: data.name,
        address: data.address,
        city,
        country,
        reservationDate,
        reservationTime: data.reservationTime,
        partySize: data.partySize,
        cuisineType: data.cuisine || null,
        phoneNumber: data.phone?.trim() ? data.phone.trim() : null,
        website: data.website ?? null,
        openTableUrl: data.openTableUrl ?? null,
        priceRange: data.priceRange,
        rating: data.rating,
        specialRequests: data.specialRequests?.trim() ? data.specialRequests.trim() : null,
      };

      return apiRequest(`/api/restaurants/${restaurantId}`, {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      toast({
        title: "Restaurant Updated",
        description: "Restaurant reservation has been updated.",
      });
      if (effectiveTripId) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", effectiveTripId, "restaurants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", String(effectiveTripId), "restaurants"] });
      }
      form.reset(defaultFormValues);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: unknown) => {
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
        title: "Error",
        description: "Failed to update restaurant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const proposeRestaurantMutation = useMutation({
    mutationFn: async ({ data, tripId: targetTripId }: { data: RestaurantFormData; tripId: number }) => {
      const { city, country } = getCityAndCountry(data.address);
      const reservationDate = format(data.reservationDate, "yyyy-MM-dd");

      const payload = {
        tripId: Number(targetTripId),
        restaurantName: data.name,
        name: data.name,
        address: data.address,
        city,
        country,
        reservationDate,
        reservationTime: data.reservationTime,
        partySize: data.partySize,
        cuisineType: data.cuisine || null,
        phoneNumber: data.phone?.trim() ? data.phone.trim() : null,
        website: data.website ?? null,
        priceRange: data.priceRange,
        rating: data.rating,
        specialRequests: data.specialRequests?.trim() ? data.specialRequests.trim() : null,
        notes: null,
        votingDeadline: votingDeadline || null,
        preferredDates: [reservationDate],
        preferredMealTime: data.reservationTime || 'dinner',
      };

      return apiRequest(`/api/trips/${targetTripId}/restaurant-proposals`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: (_, variables) => {
      const targetTripId = variables?.tripId;
      toast({
        title: "Restaurant Proposed",
        description: "Your restaurant suggestion has been shared with the group for voting.",
      });
      if (targetTripId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", targetTripId, "restaurant-proposals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", String(targetTripId), "restaurant-proposals"] });
      }
      form.reset(defaultFormValues);
      setMode("SAVE");
      setVotingDeadline("");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: unknown) => {
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
        title: "Error",
        description: "Failed to propose restaurant. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    if (isEditing && editingRestaurant) {
      updateRestaurantMutation.mutate({ data: values, restaurantId: editingRestaurant.id });
      return;
    }

    if (!effectiveTripId) {
      setTripSelectionError("Select a trip before saving this reservation.");
      return;
    }

    if (mode === "PROPOSE") {
      proposeRestaurantMutation.mutate({ data: values, tripId: effectiveTripId });
    } else {
      createRestaurantMutation.mutate({ data: values, tripId: effectiveTripId, memberIds: selectedMemberIds });
    }
  });

  const isMutating = createRestaurantMutation.isPending || updateRestaurantMutation.isPending || proposeRestaurantMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing 
              ? "Edit Restaurant Reservation" 
              : mode === "PROPOSE" 
                ? "Propose Restaurant to Group" 
                : "Add Restaurant Reservation"}
          </DialogTitle>
        </DialogHeader>

        {!isEditing && (
          <SaveProposeToggle
            mode={mode}
            onModeChange={setMode}
            saveLabel="Schedule & Invite"
            proposeLabel="Float to Group"
            saveDescription="Add to your calendar now and send RSVP invites to selected members."
            proposeDescription="Share this restaurant option with your group for voting."
          />
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!normalizedTripId && (
              <div className="space-y-2">
                <Label htmlFor="manual-restaurant-trip">Trip</Label>
                <Select
                  value={selectedTripId ? String(selectedTripId) : ""}
                  onValueChange={(value) => {
                    const parsed = Number.parseInt(value, 10);
                    setSelectedTripId(Number.isNaN(parsed) ? null : parsed);
                  }}
                  disabled={tripsLoading || availableTrips.length === 0}
                >
                  <SelectTrigger id="manual-restaurant-trip">
                    <SelectValue
                      placeholder={
                        tripsLoading
                          ? "Loading trips..."
                          : availableTrips.length === 0
                            ? "No trips available"
                            : "Select a trip"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTrips.map((trip) => (
                      <SelectItem key={trip.id} value={String(trip.id)}>
                        {trip.name || trip.destination}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tripSelectionError ? (
                  <p className="text-sm text-destructive">{tripSelectionError}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    We’ll save this reservation to the selected trip.
                  </p>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Restaurant Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Restaurant name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cuisine"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuisine</FormLabel>
                    <FormControl>
                      <Input placeholder="Cuisine type" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priceRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Range</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select price range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="$$">$$</SelectItem>
                        <SelectItem value="$$$">$$$</SelectItem>
                        <SelectItem value="$$$$">$$$$</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>Average price per person</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Street address, city, country" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact phone number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rating</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="1"
                        max="5"
                        placeholder="4.5"
                        value={field.value}
                        onChange={(event) => field.onChange(parseFloat(event.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Average rating between 1 and 5</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="reservationDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Reservation Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground",
                              !field.value && "text-muted-foreground",
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-background" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => field.onChange(date ?? new Date())}
                          disabled={(date) => date < new Date("1900-01-01")}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reservationTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="partySize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Party Size</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      placeholder="Number of people"
                      value={field.value}
                      onChange={(event) => field.onChange(parseInt(event.target.value, 10))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specialRequests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Requests (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any dietary restrictions, seating preferences, or special occasions..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://restaurant-website.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="openTableUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenTable URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://opentable.com/..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {mode === "PROPOSE" && !isEditing && (
              <div className="space-y-2">
                <Label htmlFor="voting-deadline">Voting Deadline (Optional)</Label>
                <Input
                  id="voting-deadline"
                  type="datetime-local"
                  value={votingDeadline}
                  onChange={(e) => setVotingDeadline(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Set a deadline for group members to vote on this restaurant option.
                </p>
              </div>
            )}

            {mode === "SAVE" && !isEditing && memberOptions.length > 0 && (
              <MemberSelector
                members={memberOptions}
                selectedMemberIds={selectedMemberIds}
                onToggleMember={handleToggleMember}
                onSelectAll={handleSelectAllMembers}
                onClear={handleClearMembers}
                currentUserId={currentUserId ?? undefined}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating 
                  ? (isEditing ? "Saving..." : mode === "PROPOSE" ? "Proposing..." : "Adding...") 
                  : (isEditing ? "Save Changes" : mode === "PROPOSE" ? "Propose Restaurant" : "Add Restaurant")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
