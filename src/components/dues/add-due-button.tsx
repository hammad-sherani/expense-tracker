"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AddDueDialog } from "@/components/dues/add-due-dialog";
import { Button } from "@/components/ui/button";

export function AddDueButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add due
      </Button>
      <AddDueDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
