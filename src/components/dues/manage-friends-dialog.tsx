"use client";

import { Check, Loader2, Pencil, Trash2, Users, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initials } from "@/lib/initials";
import { deleteFriend, renameFriend } from "@/server/actions/friends";
import type { FriendDTO } from "@/types";

function FriendRow({ friend }: { friend: FriendDTO }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(friend.name);
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await renameFriend(friend.id, name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message);
      setEditing(false);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteFriend(friend.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(friend.name)}</AvatarFallback>
      </Avatar>
      {editing ? (
        <form
          className="flex flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
            aria-label={`New name for ${friend.name}`}
            className="h-8"
          />
          <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Cancel"
            onClick={() => {
              setName(friend.name);
              setEditing(false);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 truncate text-sm font-medium">{friend.name}</span>
          <Button size="icon-sm" variant="ghost" aria-label={`Rename ${friend.name}`} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${friend.name}`}
            onClick={remove}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </>
      )}
    </li>
  );
}

export function ManageFriendsDialog({ friends }: { friends: FriendDTO[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users />
          Friends & family ({friends.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Friends & family</DialogTitle>
          <DialogDescription>
            Rename people or remove them once everything is settled. Add new people when you split a bill or add a due.
          </DialogDescription>
        </DialogHeader>
        {friends.length === 0 ? (
          <EmptyState icon={Users} title="Nobody saved yet" description="People are added when you split a bill or add a due." className="py-6" />
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {friends.map((f) => (
              <FriendRow key={f.id} friend={f} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
