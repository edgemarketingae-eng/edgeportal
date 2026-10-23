import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Input } from "../components/input";

const select = "h-9 rounded-lg border border-input bg-card px-2.5 text-sm";

/** GET form: filters live in the URL so lists are shareable and exportable. */
export function FilterBar({
  children,
  q,
  placeholder = "Search name, email, mobile…",
  extra,
  search = true,
}: {
  children?: ReactNode;
  q?: string;
  placeholder?: string;
  extra?: ReactNode;
  /** Set to false for lists that have no free-text search, only selects. */
  search?: boolean;
}) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2" method="get">
      {search ? <Input name="q" defaultValue={q} placeholder={placeholder} className="bg-card h-9 w-full sm:w-72" /> : null}
      {children}
      <Button type="submit" size="sm" variant="outline">
        Apply
      </Button>
      {extra}
    </form>
  );
}

export function FilterSelect({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value?: string;
  options: [string, string][];
  label: string;
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className={select} aria-label={label}>
      <option value="">{label}: all</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
