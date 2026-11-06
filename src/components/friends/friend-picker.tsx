"use client";

import { Check, ChevronsUpDown, Loader2, Plus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { createFriend, listMyFriends } from "@/server/actions/friends";
import type { FriendDTO } from "@/types";

/** Loads the signed-in user's saved friends & family once `enabled` becomes true. */
export function useFriends(enabled: boolean, initial: FriendDTO[] = []) {
  const [friends, setFriends] = useState<FriendDTO[]>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    listMyFriends()
      .then((list) => !cancelled && setFriends(list))
      .catch(() => toast.error("Couldn't load your friends & family."))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  const addFriend = useCallback((f: FriendDTO) => {
    setFriends((list) =>
      list.some((x) => x.id === f.id) ? list : [...list, f].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }, []);

  return { friends, loaded, addFriend };
}

/**
 * Searchable picker over saved friends & family, with inline "Add 'name'".
 * `multi`: toggles people on/off and stays open. `single`: picks one and closes.
 */
export function FriendPicker({
  mode,
  friends,
  selectedIds,
  onToggle,
  onCreated,
  loading,
  id,
  invalid,
}: {
  mode: "multi" | "single";
  friends: FriendDTO[];
  selectedIds: string[];
  onToggle: (friend: FriendDTO) => void;
  onCreated: (friend: FriendDTO) => void;
  loading: boolean;
  id?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isCreating, startCreate] = useTransition();
  const trimmed = query.trim().replace(/\s+/g, " ");
  const exactMatch = friends.some((f) => f.name.toLowerCase() === trimmed.toLowerCase());
  const selectedName = mode === "single" ? friends.find((f) => f.id === selectedIds[0])?.name : undefined;

  const create = () => {
    if (!trimmed) return;
    startCreate(async () => {
      const result = await createFriend(trimmed);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCreated(result.data);
      setQuery("");
      if (mode === "single") setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {mode === "multi" ? (
          <Button id={id} type="button" variant="outline" size="sm" className="w-fit">
            <UserPlus />
            Add friends
          </Button>
        ) : (
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={invalid}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
              {selectedName ?? "Choose or add a person"}
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Search or type a new name…" value={query} onValueChange={setQuery} maxLength={40} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : (
              <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                {trimmed ? "Nobody saved with that name." : "Nobody saved yet. Type a name to add them."}
              </CommandEmpty>
            )}
            {friends.length > 0 && (
              <CommandGroup heading="Friends & family">
                {friends.map((f) => {
                  const selected = selectedIds.includes(f.id);
                  return (
                    <CommandItem
                      key={f.id}
                      value={f.name}
                      onSelect={() => {
                        onToggle(f);
                        if (mode === "single") setOpen(false);
                      }}
                    >
                      <span
                        aria-hidden
                        className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                      >
                        {initials(f.name)}
                      </span>
                      <span className="flex-1 truncate">{f.name}</span>
                      <Check className={cn("size-4 text-primary", !selected && "invisible")} />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {trimmed && !exactMatch && (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`__create__${trimmed}`} onSelect={create} disabled={isCreating}>
                  {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add &ldquo;{trimmed}&rdquo;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
