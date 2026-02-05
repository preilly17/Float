import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface MemberOption {
  id: string;
  name: string;
  isCurrentUser: boolean;
}

interface MemberSelectorProps {
  members: MemberOption[];
  selectedMemberIds: string[];
  onToggleMember: (memberId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  currentUserId?: string;
  disabled?: boolean;
  title?: string;
  description?: string;
}

export function MemberSelector({
  members,
  selectedMemberIds,
  onToggleMember,
  onSelectAll,
  onClear,
  currentUserId,
  disabled = false,
  title = "Who's going?",
  description = "We'll send RSVP requests so calendars stay in sync.",
}: MemberSelectorProps) {
  const canClear = selectedMemberIds.length > 0 && 
    !(currentUserId && selectedMemberIds.length === 1 && selectedMemberIds.includes(currentUserId));
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{title}</Label>
        <span className="text-xs text-neutral-500">{selectedMemberIds.length} selected</span>
      </div>
      <p className="text-xs text-neutral-500">{description}</p>
      
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSelectAll}
          disabled={disabled || members.length === 0 || selectedMemberIds.length === members.length}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={disabled || !canClear}
        >
          Clear
        </Button>
      </div>
      
      <ScrollArea className="max-h-40 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <div className="space-y-2 p-3">
          {members.length === 0 ? (
            <p className="text-sm text-neutral-500">No members available.</p>
          ) : (
            members.map((member) => {
              const checked = selectedMemberIds.includes(member.id);
              const isCreator = member.id === currentUserId;
              
              return (
                <div key={member.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`member-${member.id}`}
                    checked={checked}
                    onCheckedChange={(checkedState) => onToggleMember(member.id, Boolean(checkedState))}
                    disabled={disabled || isCreator}
                  />
                  <Label 
                    htmlFor={`member-${member.id}`} 
                    className="flex-1 text-sm text-neutral-700 dark:text-neutral-300"
                  >
                    {member.name}{member.isCurrentUser ? " (You)" : ""}
                  </Label>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
