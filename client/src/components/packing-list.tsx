import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Package, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { PackingItem, User as UserType } from "@shared/schema";

interface PackingListProps {
  tripId: number;
}

type PackingListItem = PackingItem & { 
  user: UserType;
  groupStatus?: { checkedCount: number; memberCount: number };
};
type PackingListData = PackingListItem[];

const categories = [
  { value: "general", label: "General", pillClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "clothing", label: "Clothing", pillClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "electronics", label: "Electronics", pillClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "toiletries", label: "Toiletries", pillClass: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "documents", label: "Documents", pillClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "medication", label: "Medication", pillClass: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { value: "food", label: "Food & Snacks", pillClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "activities", label: "Activities", pillClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
];

export function PackingList({ tripId }: PackingListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const packingQueryKey = [`/api/trips/${tripId}/packing`] as const;

  const [newItem, setNewItem] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("general");
  const [selectedItemType, setSelectedItemType] = useState<"personal" | "group">("personal");
  const [hideCompleted, setHideCompleted] = useState(false);

  const { data: packingItems = [], isLoading } = useQuery<PackingListData>({
    queryKey: packingQueryKey,
    retry: false,
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { item: string; category: string; itemType: "personal" | "group" }) => {
      await apiRequest(`/api/trips/${tripId}/packing`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packingQueryKey });
      setNewItem("");
      toast({
        title: "Item added!",
        description: "The packing item has been added to the list.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
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
        description: "Failed to add packing item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const togglePersonalItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest(`/api/packing/${itemId}/toggle`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packingQueryKey });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
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
        description: "Failed to update item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateGroupItemStatusMutation = useMutation<
    PackingListItem,
    Error,
    { itemId: number; handled: boolean },
    { previousItems?: PackingListData }
  >({
    mutationFn: async ({ itemId, handled }) => {
      const method = handled ? 'POST' : 'DELETE';
      const res = await apiRequest(
        `/api/trips/${tripId}/packing/group-items/${itemId}/handled`,
        { method },
      );
      const data = (await res.json()) as PackingListItem;
      return data;
    },
    onMutate: async ({ itemId, handled }) => {
      await queryClient.cancelQueries({ queryKey: packingQueryKey });
      const previousItems = queryClient.getQueryData<PackingListData>(packingQueryKey);
      if (previousItems) {
        const updatedItems = previousItems.map(item => {
          if (item.id !== itemId || item.itemType !== "group") return item;
          const nextIsChecked = handled;
          const delta = nextIsChecked === item.isChecked ? 0 : nextIsChecked ? 1 : -1;
          const currentGroupStatus = item.groupStatus;
          return {
            ...item,
            isChecked: nextIsChecked,
            groupStatus: currentGroupStatus
              ? {
                  ...currentGroupStatus,
                  checkedCount: Math.max(0, Math.min(currentGroupStatus.memberCount, (currentGroupStatus.checkedCount ?? 0) + delta)),
                }
              : currentGroupStatus,
          };
        });
        queryClient.setQueryData<PackingListData>(packingQueryKey, updatedItems);
      }
      return { previousItems };
    },
    onError: (error, _variables, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData<PackingListData>(packingQueryKey, context.previousItems);
      }
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/login"; }, 500);
        return;
      }
      toast({
        title: "Status not updated",
        description: "Couldn't update your status. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (updatedItem) => {
      queryClient.setQueryData<PackingListData>(packingQueryKey, current => {
        if (!current) return current;
        return current.map(item => item.id === updatedItem.id ? updatedItem : item);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: packingQueryKey });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest(`/api/packing/${itemId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packingQueryKey });
      toast({ title: "Item deleted", description: "The packing item has been removed." });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => { window.location.href = "/login"; }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    addItemMutation.mutate({
      item: newItem.trim(),
      category: selectedCategory,
      itemType: selectedItemType,
    });
  };

  const handlePersonalToggle = (itemId: number) => {
    togglePersonalItemMutation.mutate(itemId);
  };

  const handleGroupItemToggle = (item: PackingListItem) => {
    updateGroupItemStatusMutation.mutate({ itemId: item.id, handled: !item.isChecked });
  };

  const personalItems = packingItems.filter(item => item.itemType === "personal" && item.userId === user?.id);
  const groupItems = packingItems.filter(item => item.itemType === "group");

  const groupedPersonalItems = personalItems.reduce((acc, item) => {
    const cat = item.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, PackingListItem[]>);

  const groupedGroupItems = groupItems.reduce((acc, item) => {
    const cat = item.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, PackingListItem[]>);

  const getCategoryInfo = (categoryValue: string) => {
    return categories.find(cat => cat.value === categoryValue) || categories[0];
  };

  const totalPersonalPacked = personalItems.filter(item => item.isChecked).length;
  const totalGroupHandled = groupItems.filter(item => item.isChecked).length;
  const totalPacked = totalPersonalPacked + totalGroupHandled;
  const totalItems = personalItems.length + groupItems.length;
  const progressPercent = totalItems > 0 ? Math.round((totalPacked / totalItems) * 100) : 0;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl shadow-lg dark:shadow-[0_30px_60px_-40px_rgba(0,0,0,0.5)] border border-slate-200/60 dark:border-white/10 p-6">
        <div className="mb-4 flex items-center space-x-2">
          <Package className="h-5 w-5 text-violet-500 dark:text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Packing Essentials</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-slate-100 dark:bg-slate-700/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const renderPersonalItem = (item: PackingListItem) => {
    const isChecked = item.isChecked;
    if (hideCompleted && isChecked) return null;
    
    return (
      <div
        key={item.id}
        data-testid={`packing-item-${item.id}`}
        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
          isChecked
            ? 'bg-emerald-50 dark:bg-cyan-900/30 border-emerald-200 dark:border-cyan-500/30'
            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:bg-slate-700/50'
        }`}
      >
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={() => handlePersonalToggle(item.id)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              isChecked
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-slate-300 dark:border-slate-500 hover:border-violet-400'
            }`}
          >
            {isChecked && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <span className={`font-medium block ${isChecked ? 'line-through text-emerald-600 dark:text-cyan-400' : 'text-slate-800 dark:text-white'}`}>
              {item.item}
            </span>
            {isChecked && (
              <span className="text-sm text-emerald-600 dark:text-cyan-400 font-medium">✓ Packed</span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-sm text-slate-500 dark:text-slate-400">
            <User className="w-3.5 h-3.5" />
            <span>{item.user.firstName || item.user.username || 'User'}</span>
          </div>
          {user?.id === item.userId && (
            <button
              onClick={() => deleteItemMutation.mutate(item.id)}
              disabled={deleteItemMutation.isPending}
              className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGroupItem = (item: PackingListItem) => {
    const isChecked = item.isChecked;
    if (hideCompleted && isChecked) return null;

    return (
      <div
        key={item.id}
        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
          isChecked
            ? 'bg-emerald-50 dark:bg-cyan-900/30 border-emerald-200 dark:border-cyan-500/30'
            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:bg-slate-700/50'
        }`}
      >
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={() => handleGroupItemToggle(item)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              isChecked
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-slate-300 dark:border-slate-500 hover:border-violet-400'
            }`}
          >
            {isChecked && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
          <div className="flex-1">
            <span className={`font-medium block ${isChecked ? 'line-through text-emerald-600 dark:text-cyan-400' : 'text-slate-800 dark:text-white'}`}>
              {item.item}
            </span>
            <div className="flex items-center gap-2 mt-1">
              {isChecked && (
                <span className="text-sm text-emerald-600 dark:text-cyan-400 font-medium">✓ Handled</span>
              )}
              {item.groupStatus && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.groupStatus.checkedCount === item.groupStatus.memberCount
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                }`}>
                  Group: {item.groupStatus.checkedCount}/{item.groupStatus.memberCount} handled
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-sm text-slate-500 dark:text-slate-400">
            <User className="w-3.5 h-3.5" />
            <span>Suggested by {item.user.firstName || item.user.username || 'User'}</span>
          </div>
          {user?.id === item.userId && (
            <button
              onClick={() => deleteItemMutation.mutate(item.id)}
              disabled={deleteItemMutation.isPending}
              className="p-1.5 text-rose-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-800/60 rounded-2xl shadow-lg dark:shadow-[0_30px_60px_-40px_rgba(0,0,0,0.5)] border border-slate-200/60 dark:border-white/10 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <Package className="h-5 w-5 text-violet-500 dark:text-cyan-400" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Packing Essentials</h2>
          <span className="px-2.5 py-1 text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
            {totalPacked}/{totalItems} packed
          </span>
        </div>
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className="text-sm font-medium text-violet-600 dark:text-cyan-400 hover:text-violet-700 dark:hover:text-cyan-300 transition-colors"
        >
          {hideCompleted ? "Show Completed" : "Hide Completed"}
        </button>
      </div>

      {/* Progress Bar */}
      {totalItems > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500 dark:text-slate-400">Progress</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Item Form */}
      <form onSubmit={handleAddItem} className="mb-8">
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Add a packing item..."
            className="flex-1 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10"
          />
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-32 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedItemType} onValueChange={(v: "personal" | "group") => setSelectedItemType(v)}>
            <SelectTrigger className="w-28 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">Personal</SelectItem>
              <SelectItem value="group">Group</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={!newItem.trim() || addItemMutation.isPending}
            className="bg-violet-500 hover:bg-violet-600 dark:bg-cyan-600 dark:hover:bg-cyan-700"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </form>

      {totalItems === 0 ? (
        <div className="py-12 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mb-2 text-lg font-medium text-slate-700 dark:text-white">No packing items yet</h3>
          <p className="text-slate-500 dark:text-slate-400">
            Start adding essential items that you need to pack for this trip.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Personal Items Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <User className="h-5 w-5 text-violet-500 dark:text-cyan-400" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Personal Items</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                You: {totalPersonalPacked}/{personalItems.length} packed
              </span>
            </div>

            {personalItems.length === 0 ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 py-6 text-center border border-dashed border-slate-200 dark:border-white/10">
                <p className="text-slate-500 dark:text-slate-400">No personal items added yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map(category => {
                  const items = groupedPersonalItems[category.value] || [];
                  const visibleItems = hideCompleted ? items.filter(item => !item.isChecked) : items;
                  if (items.length === 0) return null;
                  if (visibleItems.length === 0 && hideCompleted) return null;

                  const catPacked = items.filter(i => i.isChecked).length;

                  return (
                    <div key={category.value}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${category.pillClass}`}>
                          {category.label}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          You: {catPacked}/{items.length} packed
                        </span>
                      </div>
                      <div className="space-y-2">
                        {visibleItems.map(renderPersonalItem)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group Items Section */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Package className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-white">Group Items</h3>
              <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                You: {totalGroupHandled}/{groupItems.length} handled
              </span>
            </div>

            {groupItems.length === 0 ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 py-6 text-center border border-dashed border-slate-200 dark:border-white/10">
                <p className="text-slate-500 dark:text-slate-400">No group items added yet</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Add shared reminders like passports, cash, or group gear
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {categories.map(category => {
                  const items = groupedGroupItems[category.value] || [];
                  const visibleItems = hideCompleted ? items.filter(item => !item.isChecked) : items;
                  if (items.length === 0) return null;
                  if (visibleItems.length === 0 && hideCompleted) return null;

                  const catHandled = items.filter(i => i.isChecked).length;

                  return (
                    <div key={category.value}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${category.pillClass}`}>
                          {category.label}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          You: {catHandled}/{items.length} handled
                        </span>
                      </div>
                      <div className="space-y-2">
                        {visibleItems.map(renderGroupItem)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
