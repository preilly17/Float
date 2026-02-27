import type { MouseEvent } from "react";
import { format, eachDayOfInterval, isSameDay, startOfDay, parseISO } from "date-fns";
import { Calendar, MapPin, Clock, Plane, Hotel, Utensils, Users, Check, X, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Edit, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { 
  ActivityWithDetails, 
  TripWithDetails, 
  FlightWithRsvps, 
  HotelWithRsvps, 
  RestaurantWithRsvps,
  FlightProposalWithDetails,
  HotelProposalWithDetails,
  RestaurantProposalWithDetails
} from "@shared/schema";

type CalendarItemType = "activity" | "flight" | "hotel" | "restaurant" | "flight-proposal" | "hotel-proposal" | "restaurant-proposal";

interface CalendarItem {
  id: string | number;
  type: CalendarItemType;
  subtype?: "departure" | "arrival";
  name: string;
  date: Date | null;
  endDate?: Date | null;
  location?: string | null;
  time?: string | null;
  status: "confirmed" | "pending-rsvp" | "proposal";
  rsvpStatus?: "pending" | "accepted" | "declined";
  category?: string | null;
  acceptedCount?: number;
  pendingCount?: number;
  isCreator?: boolean;
  currentUserRanking?: number | null;
  voteCount?: number;
  averageRanking?: number | null;
  rawData: unknown;
  conflictsWith?: { name: string; time: string }[];
}

interface TripDayListProps {
  trip: TripWithDetails;
  activities: ActivityWithDetails[];
  flights?: FlightWithRsvps[];
  hotels?: HotelWithRsvps[];
  restaurants?: RestaurantWithRsvps[];
  flightProposals?: FlightProposalWithDetails[];
  hotelProposals?: HotelProposalWithDetails[];
  restaurantProposals?: RestaurantProposalWithDetails[];
  onDayClick?: (date: Date) => void;
  onActivityClick?: (activity: ActivityWithDetails) => void;
  onFlightRsvp?: (flightId: number, status: "accepted" | "declined") => void;
  onHotelRsvp?: (hotelId: number, status: "accepted" | "declined") => void;
  onRestaurantRsvp?: (restaurantId: number, status: "accepted" | "declined") => void;
  onProposalRank?: (proposalType: string, proposalId: number, ranking: number) => void;
  currentUserId?: string;
  proposalFallbackDate?: Date | null;
  expandedItemKey?: string | null;
  onToggleExpand?: (itemKey: string) => void;
  onEditActivity?: (activity: ActivityWithDetails) => void;
  onDeleteActivity?: (activity: ActivityWithDetails) => void;
  onEditRestaurant?: (restaurant: RestaurantWithRsvps) => void;
  onDeleteRestaurant?: (restaurant: RestaurantWithRsvps) => void;
}

type ActivityWithSchedulingDetails = ActivityWithDetails & {
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  timeOptions?: (string | Date | null | undefined)[] | null;
};

const parseActivityDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const parseTripDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
};

const getActivityTimeOptions = (activity: ActivityWithSchedulingDetails): Date[] => {
  const rawOptions = activity.timeOptions;
  if (!Array.isArray(rawOptions)) return [];
  
  const seen = new Set<number>();
  return rawOptions
    .map(option => parseActivityDate(option))
    .filter((option): option is Date => Boolean(option))
    .filter(option => {
      const time = option.getTime();
      if (seen.has(time)) return false;
      seen.add(time);
      return true;
    });
};

const getActivityPrimaryDate = (activity: ActivityWithSchedulingDetails): Date | null => {
  const rawStart = activity.startTime ?? (activity as ActivityWithDetails).startTime ?? null;
  const start = parseActivityDate(rawStart);
  if (start) return start;
  
  const [firstOption] = getActivityTimeOptions(activity);
  return firstOption ?? null;
};

const getActivityDateCandidates = (activity: ActivityWithSchedulingDetails): Date[] => {
  const primary = getActivityPrimaryDate(activity);
  const candidates: Date[] = [];
  
  if (primary) candidates.push(primary);
  
  for (const option of getActivityTimeOptions(activity)) {
    if (!primary || option.getTime() !== primary.getTime()) {
      candidates.push(option);
    }
  }
  
  return candidates;
};

const activityMatchesDay = (
  activity: ActivityWithSchedulingDetails, 
  day: Date,
  proposalFallbackDate: Date | null
): boolean => {
  const candidates = getActivityDateCandidates(activity);
  if (candidates.some(candidate => isSameDay(candidate, day))) {
    return true;
  }
  
  if (proposalFallbackDate && activity.type === "PROPOSE") {
    return isSameDay(proposalFallbackDate, day);
  }
  
  return false;
};

const getCategoryIcon = (category: string | null | undefined, type?: CalendarItemType) => {
  if (type === "flight" || type === "flight-proposal") return <Plane className="w-4 h-4" />;
  if (type === "hotel" || type === "hotel-proposal") return <Hotel className="w-4 h-4" />;
  if (type === "restaurant" || type === "restaurant-proposal") return <Utensils className="w-4 h-4" />;
  
  const normalized = (category ?? "").toLowerCase();
  
  if (["flight", "flights", "air"].some(t => normalized.includes(t))) {
    return <Plane className="w-4 h-4" />;
  }
  if (["hotel", "stay", "lodging"].some(t => normalized.includes(t))) {
    return <Hotel className="w-4 h-4" />;
  }
  if (["restaurant", "food", "dining", "meal"].some(t => normalized.includes(t))) {
    return <Utensils className="w-4 h-4" />;
  }
  return <MapPin className="w-4 h-4" />;
};

const getCategoryColor = (category: string | null | undefined, type?: CalendarItemType) => {
  if (type === "flight" || type === "flight-proposal") return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  if (type === "hotel" || type === "hotel-proposal") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  if (type === "restaurant" || type === "restaurant-proposal") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  
  const normalized = (category ?? "").toLowerCase();
  
  if (["flight", "flights", "air"].some(t => normalized.includes(t))) {
    return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  }
  if (["hotel", "stay", "lodging"].some(t => normalized.includes(t))) {
    return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  }
  if (["restaurant", "food", "dining", "meal"].some(t => normalized.includes(t))) {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
};

const getStatusBadgeStyle = (status: CalendarItem["status"], rsvpStatus?: string) => {
  if (status === "confirmed") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
  }
  if (status === "pending-rsvp") {
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  }
  if (status === "proposal") {
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
};

interface DayCardItemProps {
  item: CalendarItem;
  onActivityClick?: (activity: ActivityWithDetails) => void;
  onFlightRsvp?: (flightId: number, status: "accepted" | "declined") => void;
  onHotelRsvp?: (hotelId: number, status: "accepted" | "declined") => void;
  onRestaurantRsvp?: (restaurantId: number, status: "accepted" | "declined") => void;
  onProposalRank?: (proposalType: string, proposalId: number, ranking: number) => void;
  usedRankings?: Set<number>;
  isExpanded?: boolean;
  onToggleExpand?: (itemKey: string) => void;
  onEditActivity?: (activity: ActivityWithDetails) => void;
  onDeleteActivity?: (activity: ActivityWithDetails) => void;
  onEditRestaurant?: (restaurant: RestaurantWithRsvps) => void;
  onDeleteRestaurant?: (restaurant: RestaurantWithRsvps) => void;
  currentUserId?: string;
}

function DayCardItem({ 
  item, 
  onActivityClick,
  onFlightRsvp,
  onHotelRsvp,
  onRestaurantRsvp,
  onProposalRank,
  usedRankings = new Set(),
  isExpanded = false,
  onToggleExpand,
  onEditActivity,
  onDeleteActivity,
  onEditRestaurant,
  onDeleteRestaurant,
  currentUserId
}: DayCardItemProps) {
  const timeLabel = item.date ? format(item.date, "h:mm a") : item.time ?? "Time TBD";
  const activity = item.type === "activity" ? (item.rawData as ActivityWithDetails) : null;
  const restaurant = item.type === "restaurant" ? (item.rawData as RestaurantWithRsvps) : null;
  const isCreator = activity && currentUserId && (activity.postedBy === currentUserId || activity.poster?.id === currentUserId);
  const isRestaurantCreator = restaurant && currentUserId && restaurant.userId === currentUserId;
  
  const itemKey = `${item.type}-${item.id}-${item.subtype || ''}`;
  
  const handleClick = () => {
    // Toggle inline expansion for all event types
    if (onToggleExpand) {
      onToggleExpand(itemKey);
    }
  };
  
  const handleRsvpAccept = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (item.type === "flight" && onFlightRsvp) {
      onFlightRsvp(item.id as number, "accepted");
    } else if (item.type === "hotel" && onHotelRsvp) {
      onHotelRsvp(item.id as number, "accepted");
    } else if (item.type === "restaurant" && onRestaurantRsvp) {
      onRestaurantRsvp(item.id as number, "accepted");
    }
  };
  
  const handleRsvpDecline = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (item.type === "flight" && onFlightRsvp) {
      onFlightRsvp(item.id as number, "declined");
    } else if (item.type === "hotel" && onHotelRsvp) {
      onHotelRsvp(item.id as number, "declined");
    } else if (item.type === "restaurant" && onRestaurantRsvp) {
      onRestaurantRsvp(item.id as number, "declined");
    }
  };
  
  const statusLabel = item.status === "confirmed" ? "Confirmed" : 
                     item.status === "pending-rsvp" ? "Needs Response" : 
                     "Proposal";
  
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all",
        "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
        "hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md",
        item.status === "pending-rsvp" && "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20",
        item.status === "proposal" && "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20"
      )}
      onClick={handleClick}
    >
      <div className={cn(
        "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
        getCategoryColor(item.category, item.type)
      )}>
        {getCategoryIcon(item.category, item.type)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate">
            {item.name}
          </h4>
          <div className="flex items-center gap-1.5 shrink-0">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs">
                <AlertTriangle className="w-3 h-3" />
                <span>Conflict</span>
              </div>
            )}
            <Badge 
              variant="outline" 
              className={cn("text-xs", getStatusBadgeStyle(item.status, item.rsvpStatus))}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {timeLabel}
          </span>
          
          {item.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              <span className="truncate max-w-[150px]">{item.location}</span>
            </span>
          )}
          
          {item.acceptedCount != null && item.acceptedCount > 0 && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {item.acceptedCount} going
            </span>
          )}
        </div>
        
        {item.status === "pending-rsvp" && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="default"
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleRsvpAccept}
            >
              <Check className="w-4 h-4 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950"
              onClick={handleRsvpDecline}
            >
              <X className="w-4 h-4 mr-1" />
              Decline
            </Button>
          </div>
        )}
        
        {item.conflictsWith && item.conflictsWith.length > 0 && !isExpanded && (
          <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Conflicts with {item.conflictsWith[0].name} at {item.conflictsWith[0].time}
            {item.conflictsWith.length > 1 && ` +${item.conflictsWith.length - 1} more`}
          </div>
        )}
        
        {item.status === "proposal" && item.type !== "activity" && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Select
                value={item.currentUserRanking?.toString() || ""}
                onValueChange={(value) => {
                  const proposalType = item.type.replace("-proposal", "");
                  onProposalRank?.(proposalType, item.id as number, parseInt(value));
                }}
              >
                <SelectTrigger className="w-36 h-9 text-sm bg-white dark:bg-slate-800">
                  <SelectValue placeholder="Rank this" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1" disabled={usedRankings.has(1) && item.currentUserRanking !== 1}>
                    🥇 1st Choice
                  </SelectItem>
                  <SelectItem value="2" disabled={usedRankings.has(2) && item.currentUserRanking !== 2}>
                    🥈 2nd Choice
                  </SelectItem>
                  <SelectItem value="3" disabled={usedRankings.has(3) && item.currentUserRanking !== 3}>
                    🥉 3rd Choice
                  </SelectItem>
                  <SelectItem value="4" disabled={usedRankings.has(4) && item.currentUserRanking !== 4}>
                    4th Choice
                  </SelectItem>
                  <SelectItem value="5" disabled={usedRankings.has(5) && item.currentUserRanking !== 5}>
                    5th Choice
                  </SelectItem>
                </SelectContent>
              </Select>
              {item.currentUserRanking && (
                <Badge className={cn(
                  "shrink-0",
                  item.currentUserRanking === 1 && "bg-amber-500 text-white",
                  item.currentUserRanking === 2 && "bg-slate-400 text-white",
                  item.currentUserRanking === 3 && "bg-amber-700 text-white",
                  item.currentUserRanking > 3 && "bg-slate-500 text-white"
                )}>
                  #{item.currentUserRanking}
                </Badge>
              )}
            </div>
            {(item.voteCount != null && item.voteCount > 0) && (
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {item.voteCount} {item.voteCount === 1 ? "vote" : "votes"}
                </span>
                {item.averageRanking != null && (
                  <span className="flex items-center gap-1">
                    Avg: {item.averageRanking.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        
        {item.status === "proposal" && item.type === "activity" && !isExpanded && (
          <div className="text-sm text-blue-600 dark:text-blue-400 mt-2">
            Tap to view details and respond
          </div>
        )}
        
        {isExpanded && activity && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium text-sm mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Schedule Conflict
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-300">
                  This overlaps with:
                  <ul className="mt-1 space-y-0.5">
                    {item.conflictsWith.map((conflict, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-orange-400">•</span>
                        <span className="font-medium">{conflict.name}</span>
                        <span className="text-orange-500 dark:text-orange-400">at {conflict.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  When
                </p>
                <p className="text-sm text-slate-900 dark:text-slate-100">
                  {item.date ? format(item.date, "EEEE, MMM d, yyyy") : "Date TBD"}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {timeLabel}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Where
                </p>
                <p className="text-sm text-slate-900 dark:text-slate-100">
                  {item.location || "Location TBD"}
                </p>
              </div>
            </div>
            
            {activity.invites && activity.invites.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Guests
                </p>
                <div className="space-y-1">
                  {activity.invites.filter(inv => inv.status !== "declined").map((invite) => (
                    <div key={invite.userId} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium">
                        {invite.user?.firstName?.[0] || invite.user?.username?.[0] || "?"}
                      </div>
                      <span className="text-slate-900 dark:text-slate-100">
                        {invite.user?.firstName || invite.user?.username || "Unknown"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {invite.status === "accepted" ? "Accepted" : invite.status === "pending" ? "Pending" : invite.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activity.description && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Notes
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {activity.description}
                </p>
              </div>
            )}
            
            {isCreator && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditActivity?.(activity);
                  }}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteActivity?.(activity);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        )}
        
        {isExpanded && item.type === "flight" && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium text-sm mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Schedule Conflict
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-300">
                  This overlaps with:
                  <ul className="mt-1 space-y-0.5">
                    {item.conflictsWith.map((conflict, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-orange-400">•</span>
                        <span className="font-medium">{conflict.name}</span>
                        <span className="text-orange-500 dark:text-orange-400">at {conflict.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {(() => {
              const flight = item.rawData as any;
              return (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Departure
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {flight.departureAirport || "Unknown"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {flight.departureDate ? format(new Date(flight.departureDate), "MMM d, yyyy") : ""} {flight.departureTime || ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Arrival
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {flight.arrivalAirport || "Unknown"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {flight.arrivalDate ? format(new Date(flight.arrivalDate), "MMM d, yyyy") : ""} {flight.arrivalTime || ""}
                      </p>
                    </div>
                  </div>
                  {(flight.airline || flight.flightNumber) && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Flight Details
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {flight.airline} {flight.flightNumber}
                      </p>
                    </div>
                  )}
                  {flight.bookingReference && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Booking Reference
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 font-mono">
                        {flight.bookingReference}
                      </p>
                    </div>
                  )}
                  {flight.notes && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Notes
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {flight.notes}
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        
        {isExpanded && item.type === "hotel" && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium text-sm mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Schedule Conflict
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-300">
                  This overlaps with:
                  <ul className="mt-1 space-y-0.5">
                    {item.conflictsWith.map((conflict, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-orange-400">•</span>
                        <span className="font-medium">{conflict.name}</span>
                        <span className="text-orange-500 dark:text-orange-400">at {conflict.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {(() => {
              const hotel = item.rawData as any;
              return (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Check-in
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {hotel.checkInDate ? format(new Date(hotel.checkInDate), "MMM d, yyyy") : "TBD"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {hotel.checkInTime || ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Check-out
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {hotel.checkOutDate ? format(new Date(hotel.checkOutDate), "MMM d, yyyy") : "TBD"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {hotel.checkOutTime || ""}
                      </p>
                    </div>
                  </div>
                  {hotel.address && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Address
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {hotel.address}
                      </p>
                    </div>
                  )}
                  {hotel.confirmationNumber && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Confirmation Number
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100 font-mono">
                        {hotel.confirmationNumber}
                      </p>
                    </div>
                  )}
                  {hotel.roomType && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Room Type
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {hotel.roomType}
                      </p>
                    </div>
                  )}
                  {hotel.notes && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Notes
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {hotel.notes}
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        
        {isExpanded && item.type === "restaurant" && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium text-sm mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Schedule Conflict
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-300">
                  This overlaps with:
                  <ul className="mt-1 space-y-0.5">
                    {item.conflictsWith.map((conflict, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-orange-400">•</span>
                        <span className="font-medium">{conflict.name}</span>
                        <span className="text-orange-500 dark:text-orange-400">at {conflict.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {(() => {
              const restaurant = item.rawData as any;
              return (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Reservation
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {restaurant.reservationDate ? format(new Date(restaurant.reservationDate), "MMM d, yyyy") : "TBD"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {restaurant.reservationTime || ""}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Party Size
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {restaurant.partySize ? `${restaurant.partySize} guests` : "TBD"}
                      </p>
                    </div>
                  </div>
                  {restaurant.address && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Address
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {restaurant.address}
                      </p>
                    </div>
                  )}
                  {restaurant.cuisine && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Cuisine
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {restaurant.cuisine}
                      </p>
                    </div>
                  )}
                  {restaurant.phone && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Phone
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {restaurant.phone}
                      </p>
                    </div>
                  )}
                  {restaurant.specialRequests && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Special Requests
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {restaurant.specialRequests}
                      </p>
                    </div>
                  )}
                  
                  {isRestaurantCreator && (
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-cyan-600 hover:bg-cyan-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (restaurant) onEditRestaurant?.(restaurant);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (restaurant) onDeleteRestaurant?.(restaurant);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        
        {isExpanded && (item.type === "flight-proposal" || item.type === "hotel-proposal" || item.type === "restaurant-proposal") && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
            {item.conflictsWith && item.conflictsWith.length > 0 && (
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-medium text-sm mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Schedule Conflict
                </div>
                <div className="text-sm text-orange-600 dark:text-orange-300">
                  This overlaps with:
                  <ul className="mt-1 space-y-0.5">
                    {item.conflictsWith.map((conflict, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-orange-400">•</span>
                        <span className="font-medium">{conflict.name}</span>
                        <span className="text-orange-500 dark:text-orange-400">at {conflict.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {(() => {
              const proposal = item.rawData as any;
              return (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        When
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {item.date ? format(item.date, "EEEE, MMM d, yyyy") : "Date TBD"}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {timeLabel}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Where
                      </p>
                      <p className="text-sm text-slate-900 dark:text-slate-100">
                        {item.location || "Location TBD"}
                      </p>
                    </div>
                  </div>
                  {proposal.notes && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Notes
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {proposal.notes}
                      </p>
                    </div>
                  )}
                  {proposal.description && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Description
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {proposal.description}
                      </p>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export function TripDayList({
  trip,
  activities,
  flights = [],
  hotels = [],
  restaurants = [],
  flightProposals = [],
  hotelProposals = [],
  restaurantProposals = [],
  onDayClick,
  onActivityClick,
  onFlightRsvp,
  onHotelRsvp,
  onRestaurantRsvp,
  onProposalRank,
  currentUserId,
  proposalFallbackDate = null,
  expandedItemKey = null,
  onToggleExpand,
  onEditActivity,
  onDeleteActivity,
  onEditRestaurant,
  onDeleteRestaurant,
}: TripDayListProps) {
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  
  const tripStart = parseTripDate(trip.startDate);
  const tripEnd = parseTripDate(trip.endDate);
  
  if (!tripStart || !tripEnd) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
        Trip dates are needed to show the itinerary.
      </div>
    );
  }
  
  const tripDays = eachDayOfInterval({ 
    start: startOfDay(tripStart), 
    end: startOfDay(tripEnd) 
  });
  
  // Compute used rankings for each proposal type (to disable already-used ranks)
  const flightRankingsUsed = useMemo(() => {
    return new Set(
      flightProposals
        .map(p => p.currentUserRanking?.ranking)
        .filter((r): r is number => typeof r === "number")
    );
  }, [flightProposals]);
  
  const hotelRankingsUsed = useMemo(() => {
    return new Set(
      hotelProposals
        .map(p => p.currentUserRanking?.ranking)
        .filter((r): r is number => typeof r === "number")
    );
  }, [hotelProposals]);
  
  const restaurantRankingsUsed = useMemo(() => {
    return new Set(
      restaurantProposals
        .map(p => p.currentUserRanking?.ranking)
        .filter((r): r is number => typeof r === "number")
    );
  }, [restaurantProposals]);
  
  const getUsedRankingsForType = (type: CalendarItemType): Set<number> => {
    if (type === "flight-proposal") return flightRankingsUsed;
    if (type === "hotel-proposal") return hotelRankingsUsed;
    if (type === "restaurant-proposal") return restaurantRankingsUsed;
    return new Set();
  };
  
  const isCanceled = (status: string | null | undefined): boolean => {
    const normalized = (status ?? "").toLowerCase();
    return normalized === "canceled" || normalized === "cancelled";
  };
  
  const buildCalendarItems = (day: Date): CalendarItem[] => {
    const items: CalendarItem[] = [];
    
    activities.forEach(activity => {
      if (isCanceled(activity.status)) return;
      
      // Skip proposals - they should only appear in the Proposals tab until confirmed
      if (activity.type === "PROPOSE") return;
      
      const activityWithScheduling = activity as ActivityWithSchedulingDetails;
      if (!activityMatchesDay(activityWithScheduling, day, proposalFallbackDate)) return;
      
      const userInvite = activity.invites?.find(inv => inv.userId === currentUserId);
      const isConfirmed = activity.type === "SCHEDULED" || userInvite?.status === "accepted";
      const isPendingRsvp = userInvite?.status === "pending";
      const isProposal = false; // Proposals are now filtered out above
      
      items.push({
        id: activity.id,
        type: "activity",
        name: activity.name,
        date: getActivityPrimaryDate(activityWithScheduling),
        location: activity.location,
        status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : isProposal ? "proposal" : "confirmed",
        rsvpStatus: userInvite?.status as "pending" | "accepted" | "declined" | undefined,
        category: activity.category,
        acceptedCount: activity.acceptedCount,
        pendingCount: activity.pendingCount,
        isCreator: currentUserId === activity.postedBy,
        rawData: activity,
      });
    });
    
    flights.forEach(flight => {
      const departureDate = parseActivityDate(flight.departureTime);
      const arrivalDate = parseActivityDate(flight.arrivalTime);

      const isCreator = flight.userId === currentUserId;
      const rsvpStatus = flight.currentUserRsvp?.status;

      // Declined flights should not appear on the invitee's calendar
      if (!isCreator && rsvpStatus === "declined") return;

      const isConfirmed = isCreator || rsvpStatus === "accepted";
      const isPendingRsvp = rsvpStatus === "pending";

      const isDepartureDay = departureDate && isSameDay(departureDate, day);
      const isArrivalDay = arrivalDate && isSameDay(arrivalDate, day);

      if (isDepartureDay) {
        items.push({
          id: flight.id,
          type: "flight",
          subtype: "departure",
          name: `Departure: ${flight.airline} ${flight.flightNumber} - ${flight.departureAirport} → ${flight.arrivalAirport}`,
          date: departureDate,
          time: flight.departureTime ? format(new Date(flight.departureTime), "h:mm a") : undefined,
          location: `${flight.departureAirport}`,
          status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : "confirmed",
          rsvpStatus: rsvpStatus as "pending" | "accepted" | "declined" | undefined,
          isCreator,
          rawData: flight,
        });
      }

      if (isArrivalDay && !isDepartureDay) {
        items.push({
          id: flight.id,
          type: "flight",
          subtype: "arrival",
          name: `Arrival: ${flight.airline} ${flight.flightNumber} - ${flight.departureAirport} → ${flight.arrivalAirport}`,
          date: arrivalDate,
          time: flight.arrivalTime ? format(new Date(flight.arrivalTime), "h:mm a") : undefined,
          location: `${flight.arrivalAirport}`,
          status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : "confirmed",
          rsvpStatus: rsvpStatus as "pending" | "accepted" | "declined" | undefined,
          isCreator,
          rawData: flight,
        });
      }
    });
    
    hotels.forEach(hotel => {
      const checkIn = parseActivityDate(hotel.checkInDate);
      const checkOut = parseActivityDate(hotel.checkOutDate);
      if (!checkIn) return;
      
      const isCreator = hotel.userId === currentUserId;
      const rsvpStatus = hotel.currentUserRsvp?.status;
      const isConfirmed = isCreator || rsvpStatus === "accepted";
      const isPendingRsvp = rsvpStatus === "pending";
      
      const isCheckInDay = isSameDay(checkIn, day);
      const isCheckOutDay = checkOut && isSameDay(checkOut, day);
      
      if (isCheckInDay) {
        items.push({
          id: hotel.id,
          type: "hotel",
          subtype: "departure",
          name: `${hotel.hotelName} (Check-in)`,
          date: checkIn,
          location: hotel.city ? `${hotel.city}, ${hotel.country}` : hotel.address,
          status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : "confirmed",
          rsvpStatus: rsvpStatus as "pending" | "accepted" | "declined" | undefined,
          isCreator,
          rawData: hotel,
        });
      }
      
      if (isCheckOutDay && !isCheckInDay) {
        items.push({
          id: hotel.id,
          type: "hotel",
          subtype: "arrival",
          name: `${hotel.hotelName} (Check-out)`,
          date: checkOut,
          location: hotel.city ? `${hotel.city}, ${hotel.country}` : hotel.address,
          status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : "confirmed",
          rsvpStatus: rsvpStatus as "pending" | "accepted" | "declined" | undefined,
          isCreator,
          rawData: hotel,
        });
      }
    });
    
    restaurants.forEach(restaurant => {
      const reservationDate = parseActivityDate(restaurant.reservationDate);
      if (!reservationDate || !isSameDay(reservationDate, day)) return;
      
      const isCreator = restaurant.userId === currentUserId;
      const rsvpStatus = restaurant.currentUserRsvp?.status;
      const isConfirmed = isCreator || rsvpStatus === "accepted";
      const isPendingRsvp = rsvpStatus === "pending";
      
      items.push({
        id: restaurant.id,
        type: "restaurant",
        name: restaurant.name,
        date: reservationDate,
        time: restaurant.reservationTime,
        location: restaurant.address,
        status: isConfirmed ? "confirmed" : isPendingRsvp ? "pending-rsvp" : "confirmed",
        rsvpStatus: rsvpStatus as "pending" | "accepted" | "declined" | undefined,
        isCreator,
        rawData: restaurant,
      });
    });
    
    flightProposals.forEach(proposal => {
      if (isCanceled(proposal.status)) return;
      const departureDate = parseActivityDate(proposal.departureTime);
      const arrivalDate = parseActivityDate(proposal.arrivalTime);
      
      const isDepartureDay = departureDate && isSameDay(departureDate, day);
      const isArrivalDay = arrivalDate && isSameDay(arrivalDate, day);
      
      if (isDepartureDay) {
        items.push({
          id: proposal.id,
          type: "flight-proposal",
          subtype: "departure",
          name: `Departure: ${proposal.airline} ${proposal.flightNumber} - ${proposal.departureAirport} → ${proposal.arrivalAirport}`,
          date: departureDate,
          time: proposal.departureTime ? format(new Date(proposal.departureTime), "h:mm a") : undefined,
          location: `${proposal.departureAirport}`,
          status: "proposal",
          isCreator: proposal.proposedBy === currentUserId,
          currentUserRanking: proposal.currentUserRanking?.ranking ?? null,
          voteCount: proposal.rankings?.length ?? 0,
          averageRanking: proposal.averageRanking ?? null,
          rawData: proposal,
        });
      }
      
      if (isArrivalDay && !isDepartureDay) {
        items.push({
          id: proposal.id,
          type: "flight-proposal",
          subtype: "arrival",
          name: `Arrival: ${proposal.airline} ${proposal.flightNumber} - ${proposal.departureAirport} → ${proposal.arrivalAirport}`,
          date: arrivalDate,
          time: proposal.arrivalTime ? format(new Date(proposal.arrivalTime), "h:mm a") : undefined,
          location: `${proposal.arrivalAirport}`,
          status: "proposal",
          isCreator: proposal.proposedBy === currentUserId,
          currentUserRanking: proposal.currentUserRanking?.ranking ?? null,
          voteCount: proposal.rankings?.length ?? 0,
          averageRanking: proposal.averageRanking ?? null,
          rawData: proposal,
        });
      }
    });
    
    hotelProposals.forEach(proposal => {
      if (isCanceled(proposal.status)) return;
      const checkIn = parseActivityDate(proposal.checkInDate);
      if (!checkIn || !isSameDay(checkIn, day)) return;
      
      items.push({
        id: proposal.id,
        type: "hotel-proposal",
        name: proposal.hotelName,
        date: checkIn,
        location: proposal.location,
        status: "proposal",
        isCreator: proposal.proposedBy === currentUserId,
        currentUserRanking: proposal.currentUserRanking?.ranking ?? null,
        voteCount: proposal.rankings?.length ?? 0,
        averageRanking: proposal.averageRanking ?? null,
        rawData: proposal,
      });
    });
    
    restaurantProposals.forEach(proposal => {
      if (isCanceled(proposal.status)) return;
      const preferredDates = proposal.preferredDates as string[] | null;
      const matchesDay = preferredDates?.some(d => {
        const date = parseActivityDate(d);
        return date && isSameDay(date, day);
      });
      if (!matchesDay && !isSameDay(proposalFallbackDate || tripStart, day)) return;
      
      items.push({
        id: proposal.id,
        type: "restaurant-proposal",
        name: proposal.restaurantName,
        date: null,
        location: proposal.address,
        status: "proposal",
        isCreator: proposal.proposedBy === currentUserId,
        currentUserRanking: proposal.currentUserRanking?.ranking ?? null,
        voteCount: proposal.rankings?.length ?? 0,
        averageRanking: proposal.averageRanking ?? null,
        rawData: proposal,
      });
    });
    
    return items.sort((a, b) => {
      const statusOrder = { confirmed: 0, "pending-rsvp": 1, proposal: 2 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      
      if (a.date && b.date) return a.date.getTime() - b.date.getTime();
      if (a.date) return -1;
      if (b.date) return 1;
      return a.name.localeCompare(b.name);
    });
  };
  
  const checkTimeConflict = (item1: CalendarItem, item2: CalendarItem): boolean => {
    if (!item1.date || !item2.date) return false;
    
    const getTimeMinutes = (d: Date, timeStr?: string | null): number => {
      if (timeStr) {
        const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (match) {
          let hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const period = match[3]?.toUpperCase();
          if (period === "PM" && hours < 12) hours += 12;
          if (period === "AM" && hours === 12) hours = 0;
          return hours * 60 + minutes;
        }
      }
      return d.getHours() * 60 + d.getMinutes();
    };
    
    const start1 = getTimeMinutes(item1.date, item1.time);
    const start2 = getTimeMinutes(item2.date, item2.time);
    
    const duration = 60;
    const end1 = start1 + duration;
    const end2 = start2 + duration;
    
    return start1 < end2 && start2 < end1;
  };
  
  const addConflictInfo = (items: CalendarItem[]): CalendarItem[] => {
    const confirmedItems = items.filter(item => item.status === "confirmed");
    
    return items.map(item => {
      if (item.status === "confirmed") return item;
      
      const conflicts = confirmedItems
        .filter(confirmed => checkTimeConflict(item, confirmed))
        .map(confirmed => ({
          name: confirmed.name,
          time: confirmed.date ? format(confirmed.date, "h:mm a") : confirmed.time || "TBD"
        }));
      
      return conflicts.length > 0 ? { ...item, conflictsWith: conflicts } : item;
    });
  };
  
  const isToday = (day: Date) => isSameDay(day, new Date());
  
  const toggleDayCollapse = (dayKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };
  
  return (
    <div className="space-y-4">
      {tripDays.map((day, index) => {
        const dayItems = addConflictInfo(buildCalendarItems(day));
        const dayNumber = index + 1;
        const today = isToday(day);
        const dayKey = day.toISOString();
        const isCollapsed = collapsedDays.has(dayKey);
        
        const confirmedItems = dayItems.filter(item => item.status === "confirmed");
        const pendingItems = dayItems.filter(item => item.status === "pending-rsvp");
        const proposalItems = dayItems.filter(item => item.status === "proposal");
        
        const needsAttention = pendingItems.length > 0 || proposalItems.length > 0;
        
        return (
          <Card
            key={dayKey}
            className={cn(
              "overflow-hidden transition-all duration-200",
              today && "ring-2 ring-cyan-500 dark:ring-cyan-400",
              needsAttention && !today && "ring-1 ring-amber-400 dark:ring-amber-600",
              "hover:shadow-lg dark:hover:shadow-slate-900/50"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between px-5 py-4 border-b cursor-pointer",
                today
                  ? "bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/40 dark:to-blue-950/40 border-cyan-200 dark:border-cyan-800"
                  : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
              )}
              onClick={() => toggleDayCollapse(dayKey)}
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-xl font-bold text-lg",
                    today
                      ? "bg-cyan-500 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  )}
                >
                  {dayNumber}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {format(day, "EEEE, MMMM d")}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <span>{format(day, "yyyy")}</span>
                    {today && (
                      <Badge className="bg-cyan-500 text-white text-xs">Today</Badge>
                    )}
                    {confirmedItems.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {confirmedItems.length} confirmed
                      </Badge>
                    )}
                    {pendingItems.length > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs">
                        {pendingItems.length} needs response
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick?.(day);
                  }}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Add
                </Button>
                {isCollapsed ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                )}
              </div>
            </div>
            
            {!isCollapsed && (
              <CardContent className="p-5">
                {dayItems.length === 0 ? (
                  <div
                    className="flex items-center justify-center py-8 text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    onClick={() => onDayClick?.(day)}
                  >
                    <div className="text-center">
                      <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No plans yet - tap to add something</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pendingItems.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                          Awaiting Your Response
                        </h5>
                        <div className="space-y-3">
                          {pendingItems.map(item => (
                            <DayCardItem
                              key={`${item.type}-${item.id}-${item.subtype || ''}`}
                              item={item}
                              onActivityClick={onActivityClick}
                              onFlightRsvp={onFlightRsvp}
                              onHotelRsvp={onHotelRsvp}
                              onRestaurantRsvp={onRestaurantRsvp}
                              isExpanded={`${item.type}-${item.id}-${item.subtype || ''}` === expandedItemKey}
                              onToggleExpand={onToggleExpand}
                              onEditActivity={onEditActivity}
                              onDeleteActivity={onDeleteActivity}
                              onEditRestaurant={onEditRestaurant}
                              onDeleteRestaurant={onDeleteRestaurant}
                              currentUserId={currentUserId}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {confirmedItems.length > 0 && (
                      <div>
                        {pendingItems.length > 0 && (
                          <h5 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                            Confirmed Plans
                          </h5>
                        )}
                        <div className="space-y-3">
                          {confirmedItems.map(item => (
                            <DayCardItem
                              key={`${item.type}-${item.id}-${item.subtype || ''}`}
                              item={item}
                              onActivityClick={onActivityClick}
                              isExpanded={`${item.type}-${item.id}-${item.subtype || ''}` === expandedItemKey}
                              onToggleExpand={onToggleExpand}
                              onEditActivity={onEditActivity}
                              onDeleteActivity={onDeleteActivity}
                              onEditRestaurant={onEditRestaurant}
                              onDeleteRestaurant={onDeleteRestaurant}
                              currentUserId={currentUserId}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
