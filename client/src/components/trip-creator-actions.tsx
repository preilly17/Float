import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, UserCog } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { TripWithDetails, User } from "@shared/schema";

interface TripCreatorActionsProps {
  trip: TripWithDetails;
  user?: User;
}

export function TripCreatorActions({ trip, user }: TripCreatorActionsProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>("");

  const isCreator = trip.createdBy === user?.id;

  const deleteTripMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(`/api/trips/${trip.id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Trip Deleted",
        description: `"${trip.name}" has been permanently deleted for all members.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete trip",
        variant: "destructive",
      });
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: async (newOwnerId: string) => {
      await apiRequest(`/api/trips/${trip.id}/transfer-ownership`, {
        method: "POST",
        body: JSON.stringify({ newOwnerId }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Ownership Transferred",
        description: "You are no longer the trip creator. The new owner can now manage this trip.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips", trip.id] });
      setTransferOpen(false);
      setLocation("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to transfer ownership",
        variant: "destructive",
      });
    },
  });

  if (!isCreator) {
    return null;
  }

  const otherMembers = trip.members?.filter(m => m.userId !== user?.id) || [];
  const hasOtherMembers = otherMembers.length > 0;

  const handleTransfer = () => {
    if (selectedNewOwner) {
      transferOwnershipMutation.mutate(selectedNewOwner);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
            disabled={!hasOtherMembers}
          >
            <UserCog className="w-4 h-4 mr-2" />
            Transfer Ownership
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Trip Ownership</DialogTitle>
            <DialogDescription>
              Choose a member to become the new trip owner. You will remain as a regular member but lose admin privileges.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedNewOwner} onValueChange={setSelectedNewOwner}>
              <SelectTrigger>
                <SelectValue placeholder="Select new owner" />
              </SelectTrigger>
              <SelectContent>
                {otherMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.user?.firstName && member.user?.lastName
                      ? `${member.user.firstName} ${member.user.lastName}`
                      : member.user?.username || member.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={!selectedNewOwner || transferOwnershipMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {transferOwnershipMutation.isPending ? "Transferring..." : "Transfer Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Trip
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{trip.name}"? This action:
              <br /><br />
              <span className="text-red-600 dark:text-red-400 font-medium">
                • Permanently deletes this trip for ALL {trip.members?.length || 0} members
              </span>
              <br />
              • Removes all activities, flights, hotels, and restaurants
              <br />
              • Deletes all expenses and packing lists
              <br />
              • Cannot be undone
              <br /><br />
              Consider transferring ownership instead if you just want to leave.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTripMutation.mutate()}
              disabled={deleteTripMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteTripMutation.isPending ? "Deleting..." : "Yes, delete for everyone"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
