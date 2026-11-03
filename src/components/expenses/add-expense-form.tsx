"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExpenseForm } from "@/components/expenses/expense-form";

/** Full-page add form: stays on the page for quick entry and offers a jump to the list. */
export function AddExpenseForm() {
  const router = useRouter();
  return (
    <ExpenseForm
      resetOnSuccess
      submitLabel="Add expense"
      onCancel={() => router.back()}
      onSuccess={(expense) => {
        const period = expense.date.slice(0, 7);
        toast.message("Add another, or view it in your list", {
          action: { label: "View", onClick: () => router.push(`/expenses?period=${period}`) },
        });
      }}
    />
  );
}
