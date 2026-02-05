import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, addDays } from "date-fns";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { SaveProposeToggle, type SaveProposeMode } from "@/components/save-propose-toggle";
import { MemberSelector, type MemberOption } from "@/components/member-selector";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import type { RestaurantManualAddPrefill } from "@/types/restaurants";
import type { TripWithDetails } from "@shared/schema";

type RestaurantMode = SaveProposeMode;

const optionalUrlField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().url({ message: "Invalid url" }).optional(),
);

const manualSchema = z.object({
  name: z.string().trim().min(1, "Restaurant name is required"),
  cuisineType: z.string().optional(),
  priceRange: z.string().optional(),
  address: z.string().trim().min(1, "Address is required"),
  phone: z.string().optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  reservationDate: z.date({ required_error: "Reservation date is required" }),
  reservationTime: z.string().min(1, "Reservation time is required"),
  partySize: z.coerce.number({ invalid_type_error: "Party size must be a number" }).int().min(1, "Party size must be at least 1"),
  specialRequests: z.string().optional(),
  website: optionalUrlField,
  openTableUrl: optionalUrlField,
  enableVotingDeadline: z.boolean().default(false),
  votingDeadlineDate: z.string().optional(),
  votingDeadlineTime: z.string().optional(),
});

export type RestaurantManualAddFormValues = z.infer<typeof manualSchema>;

export interface RestaurantManualAddModalProps {
  tripId?: number | string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: RestaurantManualAddPrefill | null;
  onSuccess?: () => void;
  defaultMode?: RestaurantMode;
}

const cuisineOptions = [
  { value: "american", label: "American" },
  { value: "italian", label: "Italian" },
  { value: "mexican", label: "Mexican" },
  { value: "chinese", label: "Chinese" },
  { value: "japanese", label: "Japanese" },
  { value: "indian", label: "Indian" },
  { value: "thai", label: "Thai" },
  { value: "french", label: "French" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "korean", label: "Korean" },
  { value: "vietnamese", label: "Vietnamese" },
  { value: "seafood", label: "Seafood" },
  { value: "steakhouse", label: "Steakhouse" },
  { value: "other", label: "Other" },
];

const priceRangeOptions = [
  { value: "$", label: "$" },
  { value: "$$", label: "$$" },
  { value: "$$$", label: "$$$" },
  { value: "$$$$", label: "$$$$" },
];

const timeOptions = [
  "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM", "9:00 PM", "9:30 PM", "10:00 PM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM",
];

export function RestaurantManualAddModal({ tripId, open, onOpenChange, prefill, onSuccess, defaultMode = "SAVE" }: RestaurantManualAddModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<RestaurantMode>(defaultMode);
  const [enableVotingDeadline, setEnableVotingDeadline] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const normalizedTripId = useMemo(() => {
    if (typeof tripId === "string") {
      const parsed = Number.parseInt(tripId, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
      return undefined;
    }

    if (typeof tripId === "number" && Number.isFinite(tripId) && tripId > 0) {
      return tripId;
    }

    return undefined;
  }, [tripId]);

  const { data: tripData } = useQuery<TripWithDetails>({
    queryKey: ["/api/trips", normalizedTripId],
    enabled: !!normalizedTripId,
  });

  const memberOptions: MemberOption[] = useMemo(() => {
    if (!tripData?.members) return [];
    return tripData.members.map((member) => ({
      id: member.userId,
      name: member.user?.firstName
        ? `${member.user.firstName}${member.user.lastName ? ` ${member.user.lastName}` : ""}`
        : member.user?.email ?? "Unknown",
      isCurrentUser: member.userId === currentUserId,
    }));
  }, [tripData?.members, currentUserId]);

  useEffect(() => {
    if (open && currentUserId) {
      setSelectedMemberIds([currentUserId]);
    }
  }, [open, currentUserId]);

  const defaultValues = useMemo<RestaurantManualAddFormValues>(() => {
    const today = new Date();
    const defaultDeadlineDate = format(addDays(new Date(), 3), "yyyy-MM-dd");
    
    let fullAddress = prefill?.address ?? "";
    if (prefill?.city) {
      fullAddress = fullAddress ? `${fullAddress}, ${prefill.city}` : prefill.city;
    }
    if (prefill?.country) {
      fullAddress = fullAddress ? `${fullAddress}, ${prefill.country}` : prefill.country;
    }

    return {
      name: prefill?.name ?? "",
      cuisineType: "",
      priceRange: "$$",
      address: fullAddress,
      phone: "",
      rating: 4.5,
      reservationDate: prefill?.date ? new Date(prefill.date) : today,
      reservationTime: prefill?.time ?? "7:00 PM",
      partySize: Math.max(1, prefill?.partySize ?? 2),
      specialRequests: "",
      website: "",
      openTableUrl: "",
      enableVotingDeadline: false,
      votingDeadlineDate: defaultDeadlineDate,
      votingDeadlineTime: "23:59",
    };
  }, [prefill]);

  const form = useForm<RestaurantManualAddFormValues>({
    resolver: zodResolver(manualSchema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setMode(defaultMode);
      setEnableVotingDeadline(false);
      if (currentUserId) {
        setSelectedMemberIds([currentUserId]);
      }
    }
  }, [open, defaultValues, form, defaultMode, currentUserId]);

  const saveReservationMutation = useMutation({
    mutationFn: async (values: RestaurantManualAddFormValues) => {
      if (normalizedTripId == null) {
        throw new Error("Trip details are still loading. Please try again in a moment.");
      }

      const sanitizedUrl = prefill?.url?.trim() ? prefill.url.trim() : null;

      const payload = {
        tripId: normalizedTripId,
        name: values.name.trim(),
        address: values.address.trim(),
        reservationDate: format(values.reservationDate, "yyyy-MM-dd"),
        reservationTime: values.reservationTime,
        partySize: values.partySize,
        priceRange: values.priceRange || "$$",
        cuisineType: values.cuisineType || null,
        phoneNumber: values.phone || null,
        rating: values.rating || null,
        specialRequests: values.specialRequests || null,
        reservationStatus: "pending",
        website: values.website || (prefill?.platform === "resy" ? sanitizedUrl : null),
        openTableUrl: values.openTableUrl || (prefill?.platform === "open_table" ? sanitizedUrl : null),
        notes: prefill?.platform
          ? `Saved from ${prefill.platform === "resy" ? "Resy" : "OpenTable"} link builder`
          : null,
        invitedMembers: selectedMemberIds,
      };

      await apiRequest(`/api/trips/${normalizedTripId}/restaurants`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: async () => {
      if (normalizedTripId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", normalizedTripId, "restaurants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", String(normalizedTripId), "restaurants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", normalizedTripId, "restaurant-proposals"] });
      }

      toast({
        title: "Restaurant saved",
        description: "We've added this reservation to your trip.",
      });
      onSuccess?.();
      form.reset(defaultValues);
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session expired",
          description: "Please log in again to save this restaurant.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }

      const description = error instanceof Error ? error.message : "Something went wrong";
      toast({
        title: "Could not save restaurant",
        description,
        variant: "destructive",
      });
    },
  });

  const proposeToGroupMutation = useMutation({
    mutationFn: async (values: RestaurantManualAddFormValues) => {
      if (normalizedTripId == null) {
        throw new Error("Trip details are still loading. Please try again in a moment.");
      }

      let votingDeadline: string | null = null;
      if (values.enableVotingDeadline && values.votingDeadlineDate) {
        const deadlineTime = values.votingDeadlineTime?.trim() || "23:59";
        const deadlineDateTime = new Date(`${values.votingDeadlineDate.trim()}T${deadlineTime}`);
        votingDeadline = deadlineDateTime.toISOString();
      }

      const payload = {
        tripId: normalizedTripId,
        restaurantName: values.name.trim(),
        address: values.address.trim(),
        cuisineType: values.cuisineType || null,
        priceRange: values.priceRange || "$$",
        preferredMealTime: "dinner",
        preferredDates: [format(values.reservationDate, "yyyy-MM-dd")],
        platform: "Manual",
        status: "active",
        votingDeadline,
        phoneNumber: values.phone || null,
        rating: values.rating ? values.rating.toString() : null,
        website: values.website || null,
        reservationUrl: values.openTableUrl || null,
      };

      await apiRequest(`/api/trips/${normalizedTripId}/restaurant-proposals`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: async () => {
      if (normalizedTripId != null) {
        queryClient.invalidateQueries({ queryKey: ["/api/trips", normalizedTripId, "restaurant-proposals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trips", String(normalizedTripId), "restaurant-proposals"] });
      }

      toast({
        title: "Restaurant proposed",
        description: "Your group can now vote on this restaurant.",
      });
      onSuccess?.();
      form.reset(defaultValues);
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Session expired",
          description: "Please log in again to propose this restaurant.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }

      const description = error instanceof Error ? error.message : "Something went wrong";
      toast({
        title: "Could not propose restaurant",
        description,
        variant: "destructive",
      });
    },
  });

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        form.reset(defaultValues);
        setEnableVotingDeadline(false);
      }
      onOpenChange(nextOpen);
    },
    [defaultValues, form, onOpenChange],
  );

  const isPending = saveReservationMutation.isPending || proposeToGroupMutation.isPending;

  const onSubmit = form.handleSubmit((values) => {
    if (mode === "SAVE") {
      saveReservationMutation.mutate(values);
    } else {
      proposeToGroupMutation.mutate(values);
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "SAVE" ? "Add Restaurant Reservation" : "Propose Restaurant to Group"}
          </DialogTitle>
          <DialogDescription>
            {mode === "SAVE"
              ? "Add to your calendar now and send RSVP invites to selected members."
              : "Share with your group for voting and ranking. Not added to calendars until confirmed."}
          </DialogDescription>
        </DialogHeader>

        <SaveProposeToggle
          mode={mode}
          onModeChange={setMode}
          saveLabel="Schedule & Invite"
          proposeLabel="Float to Group"
          className="mb-4"
        />

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Restaurant Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Restaurant name" data-testid="input-restaurant-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cuisineType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuisine</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Cuisine type" data-testid="input-cuisine-type" />
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
                    <Select onValueChange={field.onChange} value={field.value || "$$"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-price-range">
                          <SelectValue placeholder="Select price" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priceRangeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
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
                    <Input {...field} placeholder="Street address, city, country" data-testid="input-restaurant-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Contact phone number" data-testid="input-phone" />
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
                        min={1}
                        max={5}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        data-testid="input-rating"
                      />
                    </FormControl>
                    <FormDescription>Average rating between 1 and 5</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="button-reservation-date"
                          >
                            {field.value ? format(field.value, "MMMM do, yyyy") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
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
                    <Select onValueChange={field.onChange} value={field.value || "7:00 PM"}>
                      <FormControl>
                        <SelectTrigger data-testid="select-reservation-time">
                          <SelectValue placeholder="Select time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeOptions.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
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
                      min={1}
                      value={Number.isNaN(field.value) ? "" : field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      data-testid="input-party-size"
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
                      {...field}
                      placeholder="Any dietary restrictions, seating preferences, or special occasions..."
                      data-testid="input-special-requests"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://restaurant-website.com" data-testid="input-website" />
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
                      <Input {...field} placeholder="https://opentable.com/..." data-testid="input-opentable-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {mode === "SAVE" && memberOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Who's going?</Label>
                <p className="text-sm text-muted-foreground">We'll send RSVP requests so calendars stay in sync.</p>
                <MemberSelector
                  members={memberOptions}
                  selectedMemberIds={selectedMemberIds}
                  onToggleMember={(memberId, checked) => {
                    setSelectedMemberIds((prev) =>
                      checked ? [...prev, memberId] : prev.filter((id) => id !== memberId)
                    );
                  }}
                  onSelectAll={() => setSelectedMemberIds(memberOptions.map((m) => m.id))}
                  onClear={() => setSelectedMemberIds([])}
                  currentUserId={currentUserId ?? undefined}
                />
              </div>
            )}

            {mode === "PROPOSE" && (
              <div className="space-y-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="enableVotingDeadline"
                    checked={enableVotingDeadline}
                    onCheckedChange={(checked) => {
                      const value = checked === true;
                      setEnableVotingDeadline(value);
                      form.setValue("enableVotingDeadline", value);
                    }}
                    data-testid="checkbox-voting-deadline"
                  />
                  <Label htmlFor="enableVotingDeadline" className="text-sm font-medium cursor-pointer">
                    Set voting deadline
                  </Label>
                </div>

                {enableVotingDeadline && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <FormField
                      control={form.control}
                      name="votingDeadlineDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Deadline date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-voting-deadline-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="votingDeadlineTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Deadline time</FormLabel>
                          <FormControl>
                            <Input type="time" {...field} data-testid="input-voting-deadline-time" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!form.formState.isValid || isPending || normalizedTripId == null}
                data-testid="button-submit"
              >
                {isPending
                  ? "Saving..."
                  : mode === "SAVE"
                    ? "Add Restaurant"
                    : "Float to Group"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
