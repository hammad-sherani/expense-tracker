import "server-only";
import { refresh, revalidatePath } from "next/cache";

/** Make every page show fresh data after a mutation. Call from Server Actions only. */
export function revalidateAll() {
  revalidatePath("/", "layout");
  refresh();
}
