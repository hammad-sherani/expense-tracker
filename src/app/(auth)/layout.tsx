import { BarChart3, CalendarRange, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";

const POINTS = [
  { icon: BarChart3, title: "See where your money goes", text: "Category breakdowns, daily and monthly trends." },
  { icon: CalendarRange, title: "Month-by-month clarity", text: "Jump to any month and compare it with the last." },
  { icon: ShieldCheck, title: "Private by default", text: "Your expenses are visible only to you." },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div className="[&_a>span:first-child]:bg-primary-foreground [&_a>span:first-child]:text-primary [&_a_span]:text-primary-foreground">
          <Brand />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Take control of your spending, one expense at a time.
          </h2>
          <ul className="mt-10 flex flex-col gap-6">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-primary-foreground/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/60">Amounts shown in Pakistani Rupees (Rs.)</p>
        <div aria-hidden className="pointer-events-none absolute -right-32 -bottom-32 size-96 rounded-full bg-primary-foreground/5" />
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-10 size-64 rounded-full bg-primary-foreground/5" />
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
