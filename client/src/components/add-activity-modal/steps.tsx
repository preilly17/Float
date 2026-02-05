import type { UseFormReturn } from "react-hook-form";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveProposeToggle } from "@/components/save-propose-toggle";
import type { ActivityType } from "@shared/schema";

export type MemberOption = {
  id: string;
  name: string;
  isCurrentUser: boolean;
};

export type MemberConflict = {
  activityName: string;
  startTime?: string | null;
  endTime?: string | null;
};

const categories = [
  { value: "food", label: "Food & Dining" },
  { value: "sightseeing", label: "Sightseeing" },
  { value: "transport", label: "Transportation" },
  { value: "entertainment", label: "Entertainment" },
  { value: "shopping", label: "Shopping" },
  { value: "culture", label: "Culture" },
  { value: "outdoor", label: "Outdoor" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Other" },
] as const;

interface BasicInfoStepProps {
  form: UseFormReturn<any>;
  formErrors: Record<string, any>;
}

export function BasicInfoStep({ form, formErrors }: BasicInfoStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="Add where everyone should meet"
          {...form.register("location")}
          data-testid="input-location"
        />
        {formErrors.location && <p className="mt-1 text-sm text-red-600">{formErrors.location.message}</p>}
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select
          value={form.watch("category")}
          onValueChange={(value) => form.setValue("category", value, { shouldDirty: true, shouldValidate: true })}
        >
          <SelectTrigger data-testid="select-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.category && <p className="mt-1 text-sm text-red-600">{formErrors.category.message}</p>}
      </div>
    </div>
  );
}

interface TimingStepProps {
  form: UseFormReturn<any>;
  formErrors: Record<string, any>;
  mode: ActivityType;
  allowModeToggle: boolean;
  onModeChange: (mode: ActivityType) => void;
  startDateMin?: string | null;
  startDateMax?: string | null;
  dateRangeHint?: string | null;
  isStartDateOutsideTrip: boolean;
}

export function TimingStep({
  form,
  formErrors,
  mode,
  allowModeToggle,
  onModeChange,
  startDateMin,
  startDateMax,
  dateRangeHint,
  isStartDateOutsideTrip,
}: TimingStepProps) {
  return (
    <div className="space-y-4">
      {allowModeToggle ? (
        <SaveProposeToggle
          mode={mode}
          onModeChange={(newMode) => onModeChange(newMode as ActivityType)}
          saveMode="SCHEDULED"
          proposeMode="PROPOSE"
          saveLabel="Schedule & Invite"
          proposeLabel="Float to Group"
          saveDescription="Add to calendar now and send RSVP invites to selected members."
          proposeDescription="Share with your group for voting and ranking."
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">
            {mode === "PROPOSE"
              ? "This activity will be proposed to the group."
              : "This activity will be added directly to the schedule."}
          </p>
          <p className="text-xs text-muted-foreground">
            {mode === "PROPOSE"
              ? "Share with your group for voting and ranking."
              : "This will be added directly to the calendar and RSVPs sent."}
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="name">Activity name</Label>
        <Input
          id="name"
          placeholder="e.g., Tokyo Skytree visit"
          {...form.register("name")}
          data-testid="input-activity-name"
        />
        {formErrors.name && <p className="mt-1 text-sm text-red-600">{formErrors.name.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="startDate">Date</Label>
          <Input
            id="startDate"
            type="date"
            min={startDateMin || undefined}
            max={startDateMax || undefined}
            {...form.register("startDate")}
            data-testid="input-start-date"
          />
          {dateRangeHint && <p className="mt-1 text-xs text-neutral-500">{dateRangeHint}</p>}
          {isStartDateOutsideTrip && !formErrors.startDate && (
            <p className="mt-1 text-xs text-amber-600">This date is outside the trip dates.</p>
          )}
          {formErrors.startDate && <p className="mt-1 text-sm text-red-600">{formErrors.startDate.message}</p>}
        </div>
        <div>
          <Label htmlFor="startTime">
            Start time
            {mode === "SCHEDULED" && (
              <>
                <span aria-hidden="true" className="ml-1 text-red-500">
                  *
                </span>{" "}
                <span className="sr-only">Required field</span>
              </>
            )}
          </Label>
          <Input id="startTime" type="time" {...form.register("startTime")} data-testid="input-start-time" />
          {formErrors.startTime && <p className="mt-1 text-sm text-red-600">{formErrors.startTime.message}</p>}
        </div>
      </div>

      <div>
        <Label htmlFor="endTime">End time (optional)</Label>
        <Input id="endTime" type="time" {...form.register("endTime")} data-testid="input-end-time" />
        {formErrors.endTime && <p className="mt-1 text-sm text-red-600">{formErrors.endTime.message}</p>}
      </div>
    </div>
  );
}

interface AttendeesStepProps {
  form: UseFormReturn<any>;
  formErrors: Record<string, any>;
  mode: ActivityType;
  memberOptions: MemberOption[];
  selectedAttendeeIds: string[];
  memberConflicts: Record<string, MemberConflict[]>;
  onToggleAttendee: (memberId: string, checked: boolean | "indeterminate") => void;
  onSelectAll: () => void;
  onClearAttendees: () => void;
  creatorMemberId: string | null;
  defaultAttendeeIds: string[];
}

export function AttendeesStep({
  form,
  formErrors,
  mode,
  memberOptions,
  selectedAttendeeIds,
  memberConflicts,
  onToggleAttendee,
  onSelectAll,
  onClearAttendees,
  creatorMemberId,
  defaultAttendeeIds,
}: AttendeesStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="attendees">Who&apos;s going?</Label>
          <span className="text-xs text-neutral-500">{selectedAttendeeIds.length} selected</span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {mode === "PROPOSE"
            ? "We'll ask everyone selected to vote on this idea."
            : "We'll send RSVP requests so calendars stay in sync."}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={memberOptions.length === 0 || selectedAttendeeIds.length === defaultAttendeeIds.length}
            data-testid="button-select-all"
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAttendees}
            disabled={
              selectedAttendeeIds.length === 0 ||
              (mode === "SCHEDULED" && creatorMemberId !== null && selectedAttendeeIds.length === 1)
            }
            data-testid="button-clear-attendees"
          >
            Clear
          </Button>
        </div>
        <ScrollArea className="mt-3 max-h-40 rounded-lg border border-neutral-200">
          <div className="space-y-2 p-3">
            {memberOptions.length === 0 ? (
              <p className="text-sm text-neutral-500">Invite friends to your trip to choose attendees.</p>
            ) : (
              memberOptions.map((member) => {
                const checked = selectedAttendeeIds.includes(member.id);
                const conflicts = memberConflicts[member.id] || [];
                const hasConflicts = conflicts.length > 0;

                return (
                  <div key={member.id} className="flex items-center space-x-3">
                    <Checkbox
                      id={`attendee-${member.id}`}
                      checked={checked}
                      onCheckedChange={(checkedState) => onToggleAttendee(member.id, checkedState)}
                      disabled={mode === "SCHEDULED" && member.isCurrentUser}
                      data-testid={`checkbox-attendee-${member.id}`}
                    />
                    <Label htmlFor={`attendee-${member.id}`} className="flex-1 text-sm text-neutral-700">
                      {member.name}
                    </Label>
                    {hasConflicts && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-4 w-4 text-amber-500" data-testid={`icon-conflict-${member.id}`} />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold mb-1">
                              Scheduling conflict{conflicts.length > 1 ? "s" : ""}:
                            </p>
                            {conflicts.map((conflict, idx) => (
                              <p key={idx} className="text-xs">
                                • {conflict.activityName}
                                {conflict.startTime &&
                                  ` (${format(new Date(conflict.startTime), "h:mm a")}${conflict.endTime ? `-${format(new Date(conflict.endTime), "h:mm a")}` : ""})`}
                              </p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        {formErrors.attendeeIds && <p className="mt-2 text-sm text-red-600">{formErrors.attendeeIds.message}</p>}
      </div>
    </div>
  );
}

interface ExtrasStepProps {
  form: UseFormReturn<any>;
  formErrors: Record<string, any>;
  mode: ActivityType;
  enableVotingDeadline: boolean;
  onToggleVotingDeadline: (enabled: boolean) => void;
}

export function ExtrasStep({ form, formErrors, mode, enableVotingDeadline, onToggleVotingDeadline }: ExtrasStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          placeholder="Share any important details or notes"
          rows={3}
          {...form.register("description")}
          data-testid="textarea-description"
        />
        {formErrors.description && <p className="mt-1 text-sm text-red-600">{formErrors.description.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cost">Cost per person (optional)</Label>
          <Input id="cost" placeholder="$50" {...form.register("cost")} data-testid="input-cost" />
          {formErrors.cost && <p className="mt-1 text-sm text-red-600">{formErrors.cost.message}</p>}
        </div>
        <div>
          <Label htmlFor="maxCapacity">Max participants (optional)</Label>
          <Input
            id="maxCapacity"
            placeholder="Leave blank for unlimited"
            {...form.register("maxCapacity")}
            data-testid="input-max-capacity"
          />
          {formErrors.maxCapacity && <p className="mt-1 text-sm text-red-600">{formErrors.maxCapacity.message}</p>}
        </div>
      </div>

      <div>
        <Label htmlFor="bookingUrl">Booking link (optional)</Label>
        <Input
          id="bookingUrl"
          type="url"
          placeholder="https://..."
          {...form.register("bookingUrl")}
          data-testid="input-booking-url"
        />
        {formErrors.bookingUrl && <p className="mt-1 text-sm text-red-600">{formErrors.bookingUrl.message}</p>}
      </div>

      {mode === "PROPOSE" && (
        <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableVotingDeadline"
              checked={enableVotingDeadline}
              onCheckedChange={(checked) => {
                onToggleVotingDeadline(checked === true);
                if (!checked) {
                  form.setValue("votingDeadlineDate", "");
                  form.setValue("votingDeadlineTime", "");
                }
              }}
              data-testid="checkbox-enable-voting-deadline"
            />
            <Label htmlFor="enableVotingDeadline" className="text-sm font-medium cursor-pointer">
              Set voting deadline (optional)
            </Label>
          </div>
          <p className="text-xs text-neutral-500">Add a time limit for team members to vote on this float</p>

          {enableVotingDeadline && (
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div>
                <Label htmlFor="votingDeadlineDate">Deadline date</Label>
                <Input
                  id="votingDeadlineDate"
                  type="date"
                  {...form.register("votingDeadlineDate")}
                  data-testid="input-voting-deadline-date"
                />
                {formErrors.votingDeadlineDate && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.votingDeadlineDate.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="votingDeadlineTime">Deadline time (optional)</Label>
                <Input
                  id="votingDeadlineTime"
                  type="time"
                  placeholder="23:59"
                  {...form.register("votingDeadlineTime")}
                  data-testid="input-voting-deadline-time"
                />
                {formErrors.votingDeadlineTime && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.votingDeadlineTime.message}</p>
                )}
                <p className="mt-1 text-xs text-neutral-500">Defaults to 11:59 PM if not set</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
