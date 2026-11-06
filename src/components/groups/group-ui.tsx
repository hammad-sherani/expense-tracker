"use client";

import { Archive, ArchiveRestore, Loader2, MoreVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useExpenseUI } from "@/components/expenses/expense-dialogs";
import { FriendPicker, useFriends } from "@/components/friends/friend-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createGroup, deleteGroup, setGroupArchived, updateGroup } from "@/server/actions/groups";
import type { FriendDTO } from "@/types";

const EMOJIS = ["✈️", "🏔️", "🏖️", "🍕", "🏠", "🎉", "🚗", "⚽", "🎓", "💼"];

export type GroupEditable = { id: string; name: string; emoji: string | null; memberIds: string[]; members: FriendDTO[] };

function GroupForm({ group, onDone }: { group?: GroupEditable; onDone: (id?: string) => void }) {
  const { friends, loaded, addFriend } = useFriends(true, group?.members ?? []);
  const [name, setName] = useState(group?.name ?? "");
  const [emoji, setEmoji] = useState(group?.emoji ?? EMOJIS[0]);
  const [memberIds, setMemberIds] = useState<string[]>(group?.memberIds ?? []);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPending, startTransition] = useTransition();
  const nameOf = (id: string) => friends.find((f) => f.id === id)?.name ?? "Friend";

  const toggle = (f: FriendDTO) => {
    setMemberIds((ids) => (ids.includes(f.id) ? ids.filter((x) => x !== f.id) : [...ids, f.id]));
    setErrors((e) => ({ ...e, memberIds: undefined }));
  };

  const submit = () =>
    startTransition(async () => {
      const values = { name, emoji, memberIds };
      const r = group ? await updateGroup(group.id, values) : await createGroup(values);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone(r.data && typeof r.data === "object" && "id" in r.data ? (r.data as { id: string }).id : undefined);
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="group-name">Name</FieldLabel>
          <div className="flex gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg" aria-hidden>
              {emoji}
            </span>
            <Input
              id="group-name"
              value={name}
              maxLength={40}
              placeholder="e.g. Murree trip, Flatmates"
              onChange={(e) => {
                setName(e.target.value);
                setErrors((x) => ({ ...x, name: undefined }));
              }}
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
          </div>
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field>
          <FieldLabel id="group-emoji-label">Icon</FieldLabel>
          <div role="radiogroup" aria-labelledby="group-emoji-label" className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                onClick={() => setEmoji(e)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-lg hover:bg-muted",
                  emoji === e && "bg-primary/10 ring-1 ring-primary",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field data-invalid={Boolean(errors.memberIds)}>
          <FieldLabel htmlFor="group-members">People (besides you)</FieldLabel>
          <FriendPicker
            id="group-members"
            mode="multi"
            friends={friends}
            loading={!loaded}
            selectedIds={memberIds}
            onToggle={toggle}
            onCreated={(f) => {
              addFriend(f);
              if (!memberIds.includes(f.id)) toggle(f);
            }}
            invalid={Boolean(errors.memberIds)}
          />
          {memberIds.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Group members">
              {memberIds.map((id) => (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs font-medium">
                  {nameOf(id)}
                  <button
                    type="button"
                    aria-label={`Remove ${nameOf(id)}`}
                    className="rounded-full p-0.5 hover:bg-background"
                    onClick={() => toggle({ id, name: nameOf(id) })}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.memberIds && <FieldError>{errors.memberIds}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onDone()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {group ? "Save changes" : "Create group"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GroupDialog({
  open,
  onOpenChange,
  group,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group?: GroupEditable;
  onCreated?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.name}` : "New group"}</DialogTitle>
          <DialogDescription>A trip or a set of people you often share bills with.</DialogDescription>
        </DialogHeader>
        {open && (
          <GroupForm
            group={group}
            onDone={(id) => {
              onOpenChange(false);
              if (id) onCreated?.(id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddGroupButton({ label = "New group" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <GroupDialog open={open} onOpenChange={setOpen} onCreated={(id) => router.push(`/groups/${id}`)} />
    </>
  );
}

/** Opens "Add expense" with this group selected and the bill split equally with its people. */
export function AddGroupExpenseButton({ groupId, memberIds, name }: { groupId: string; memberIds: string[]; name: string }) {
  const { openCreate } = useExpenseUI();
  return (
    <Button
      onClick={() =>
        openCreate({
          title: `Add to ${name}`,
          description: "Split equally with the group. Change who paid or the shares if needed.",
          defaults: {
            groupId,
            split: {
              enabled: true,
              paidBy: "me",
              myShare: "",
              participants: memberIds.map((friendId) => ({ friendId, share: "" })),
              dueDate: "",
            },
          },
        })
      }
    >
      <Plus />
      Add expense
    </Button>
  );
}

export function GroupMenu({ group, archived }: { group: GroupEditable; archived: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
      } else toast.error(r.error);
    });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={`Options for ${group.name}`} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit group
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setGroupArchived(group.id, !archived))}>
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <GroupDialog open={editing} onOpenChange={setEditing} group={group} />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {group.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The group is removed, but its expenses and dues are kept. They just won&apos;t be grouped anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => run(() => deleteGroup(group.id), () => router.push("/groups"))}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
