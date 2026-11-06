"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/expenses/category-badge";
import { ColorPicker } from "@/components/shared/color-picker";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_ICONS, COLOR_PRESETS } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryArchived,
  updateCategory,
} from "@/server/actions/categories";
import type { CategoryDTO } from "@/types";

export type ManagedCategory = CategoryDTO & { count: number };

function CategoryForm({ category, onDone }: { category?: CategoryDTO; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "utensils");
  const [color, setColor] = useState(category?.color ?? COLOR_PRESETS[0]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const values = { name, icon, color };
      const r = category ? await updateCategory(category.id, values) : await createCategory(values);
      if (!r.ok) {
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onDone();
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
      <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <CategoryIcon category={{ name, icon, color }} />
        <span className="truncate font-medium">{name || "Category name"}</span>
      </div>
      <FieldGroup className="gap-4">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="category-name">Name</FieldLabel>
          <Input
            id="category-name"
            value={name}
            maxLength={30}
            placeholder="e.g. Fuel, Kids, Committee"
            onChange={(e) => {
              setName(e.target.value);
              setErrors((x) => ({ ...x, name: undefined }));
            }}
            aria-invalid={Boolean(errors.name)}
            autoFocus
          />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field>
          <FieldLabel id="category-icon-label">Icon</FieldLabel>
          <div
            role="radiogroup"
            aria-labelledby="category-icon-label"
            className="grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-9"
          >
            {Object.entries(CATEGORY_ICONS).map(([key, { icon: Icon, label }]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={icon === key}
                aria-label={label}
                title={label}
                onClick={() => setIcon(key)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md transition-colors hover:bg-muted",
                  icon === key && "bg-primary/10 text-primary ring-1 ring-primary",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel>Colour</FieldLabel>
          <ColorPicker value={color} onChange={setColor} label="Category colour" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          {category ? "Save changes" : "Add category"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryDTO;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : "New category"}</DialogTitle>
          <DialogDescription>Pick a name, an icon and a colour.</DialogDescription>
        </DialogHeader>
        {open && <CategoryForm category={category} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function AddCategoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New category
      </Button>
      <CategoryDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeleteCategoryDialog({
  category,
  others,
  open,
  onOpenChange,
}: {
  category: ManagedCategory;
  others: ManagedCategory[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [moveTo, setMoveTo] = useState(others.find((o) => o.name === "Other")?.id ?? others[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const target = others.find((o) => o.id === moveTo);
  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {category.name}?</DialogTitle>
          <DialogDescription>
            {category.count > 0
              ? `${category.count} expense${category.count === 1 ? " uses" : "s use"} this category. They'll be moved to the category you choose.`
              : "No expenses use this category."}
          </DialogDescription>
        </DialogHeader>
        {category.count > 0 && (
          <Field>
            <FieldLabel htmlFor="move-to">Move expenses to</FieldLabel>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="move-to" className="w-full">
                <SelectValue>{target?.name ?? "Choose a category"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || (category.count > 0 && !moveTo)}
            onClick={() =>
              startTransition(async () => {
                const r = await deleteCategory(category.id, category.count > 0 ? moveTo : undefined);
                if (r.ok) {
                  toast.success(r.message);
                  onOpenChange(false);
                } else toast.error(r.error);
              })
            }
          >
            {isPending && <Loader2 className="animate-spin" />}
            {category.count > 0 ? "Move & delete" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryRow({
  category,
  others,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  category: ManagedCategory;
  others: ManagedCategory[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const toggleArchive = () =>
    startTransition(async () => {
      const r = await setCategoryArchived(category.id, !category.archived);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    });

  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5 sm:px-5", category.archived && "opacity-60")}>
      <CategoryIcon category={category} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          {category.count} expense{category.count === 1 ? "" : "s"}
          {category.archived && " · archived"}
        </p>
      </div>
      {!category.archived && (
        <div className="hidden items-center sm:flex">
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} up`} disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${category.name} down`}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${category.name}`} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <MoreVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleArchive}>
            {category.archived ? <ArchiveRestore /> : <Archive />}
            {category.archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryDialog open={editing} onOpenChange={setEditing} category={category} />
      {deleting && <DeleteCategoryDialog category={category} others={others} open={deleting} onOpenChange={setDeleting} />}
    </li>
  );
}

export function CategoryList({ categories }: { categories: ManagedCategory[] }) {
  const [order, setOrder] = useOptimistic(categories);
  const [, startTransition] = useTransition();
  const active = order.filter((c) => !c.archived);
  const archived = order.filter((c) => c.archived);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...active];
    const j = index + dir;
    [next[index], next[j]] = [next[j], next[index]];
    startTransition(async () => {
      setOrder([...next, ...archived]);
      const r = await reorderCategories(next.map((c) => c.id));
      if (!r.ok) toast.error(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-xl border bg-card">
        {active.map((c, i) => (
          <CategoryRow
            key={c.id}
            category={c}
            others={order.filter((o) => o.id !== c.id)}
            canMoveUp={i > 0}
            canMoveDown={i < active.length - 1}
            onMove={(dir) => move(i, dir)}
          />
        ))}
      </ul>
      {archived.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Archived</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {archived.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                others={order.filter((o) => o.id !== c.id)}
                canMoveUp={false}
                canMoveDown={false}
                onMove={() => {}}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
