"use client";

import { COUNTRIES, countryByCode, type Country } from "@edge/domain/countries";
import { Check, ChevronDown, Search } from "lucide-react";
import { createContext, use, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";
import { controlClass, controlSize } from "../lib/control";

const Searchable = createContext(false);

/**
 * Inside it, the country pickers (the phone dial code and `CountrySelect`) open a searchable list instead of the native
 * select. The CRM uses it; the public pages keep the native select, which phones show as their own picker.
 */
export function SearchableCountryPickers({ children }: { children: ReactNode }) {
  return <Searchable value>{children}</Searchable>;
}

export const useSearchableCountries = () => use(Searchable);

/** Names people type that are not the English name. */
const ALIASES: Record<string, string[]> = {
  AE: ["uae", "emirates", "dubai"],
  GB: ["uk", "britain", "great britain", "england"],
  US: ["usa", "america"],
  SA: ["ksa", "saudi"],
  KR: ["south korea"],
  KP: ["north korea"],
  RU: ["russia"],
  CZ: ["czechia", "czech republic"],
  NL: ["holland"],
};

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase();

/** Shared dial codes list their main country first (+1 is the US, not American Samoa). */
const MAIN_FOR_DIAL = new Set(["US", "GB", "RU", "AU", "NO", "FI", "IT"]);

/** The country's name and aliases, folded for matching. */
const NAMES = new Map(COUNTRIES.map((c) => [c.code, [fold(c.name), ...(ALIASES[c.code] ?? [])]]));

/**
 * Countries matching a search, best first: an exact code, name or alias (or dial code), then names starting with the
 * text, then a word in the name starting with it, then names containing it.
 */
export function searchCountries(query: string): readonly Country[] {
  const q = fold(query.trim());
  if (!q) return COUNTRIES;
  const digits = q.replace(/^\+/, "");
  const dial = /^\d+$/.test(digits);
  const rank = (c: Country) => {
    if (dial) return c.dialCode === digits ? 0 : c.dialCode.startsWith(digits) ? 1 : -1;
    const names = NAMES.get(c.code)!;
    if (c.code.toLowerCase() === q || names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.includes(` ${q}`))) return 2;
    return names.some((n) => n.includes(q)) ? 3 : -1;
  };
  return COUNTRIES.map((c) => [c, rank(c)] as const)
    .filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1] || (dial ? Number(MAIN_FOR_DIAL.has(b[0].code)) - Number(MAIN_FOR_DIAL.has(a[0].code)) : 0))
    .map(([c]) => c);
}

export interface CountryComboboxProps {
  /** Country code, or "" for none. */
  value: string;
  onChange: (code: string) => void;
  /** Adds a "not set" first option with this label. */
  emptyLabel?: string;
  /** List rows show the dial code (the phone picker). */
  dialCodes?: boolean;
  /** What the closed button shows; flag and name by default. */
  display?: (country: Country | undefined) => ReactNode;
  id?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** A country picker with a search box: type a name, a 2-letter code or a dial code; arrows and Enter pick. */
export function CountryCombobox({
  value,
  onChange,
  emptyLabel,
  dialCodes,
  display,
  id,
  disabled,
  size = "md",
  className,
  ...aria
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const current = countryByCode(value);
  const matches = searchCountries(query);
  // The "not set" row only shows while nothing is typed.
  const rows: { code: string; country?: Country }[] = [
    ...(emptyLabel !== undefined && !query.trim() ? [{ code: "" }] : []),
    ...matches.map((c) => ({ code: c.code, country: c })),
  ];

  function openChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Opens on the full list with the current country highlighted.
    setQuery("");
    const at = COUNTRIES.findIndex((c) => c.code === value);
    const offset = emptyLabel !== undefined ? 1 : 0;
    setActive(at >= 0 ? at + offset : 0);
  }
  function choose(code: string) {
    onChange(code);
    setOpen(false);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = rows.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter") {
      if (rows[active]) choose(rows[active].code);
    } else return;
    e.preventDefault();
  }

  // Keep the highlighted row in view: on opening (the current country) and while moving with the arrows. Scrolls the
  // list itself, a frame later, once the popover is placed.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const ul = list.current;
      const li = ul?.querySelector<HTMLElement>(`[data-index="${active}"]`);
      if (!ul || !li) return;
      if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight)
        ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, active]);

  return (
    // Modal, so the list scrolls and takes focus inside dialogs too.
    <Popover open={open} onOpenChange={openChange} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          {...aria}
          className={cn(controlClass, controlSize[size], "relative flex cursor-pointer items-center gap-2 pr-8 text-left", className)}
        >
          {display ? (
            display(current)
          ) : current ? (
            <>
              <span className="text-base leading-none">{current.flag}</span>
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">{emptyLabel ?? "Choose a country"}</span>
          )}
          <ChevronDown aria-hidden className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-2 p-2">
        <div className="relative">
          <Search aria-hidden className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          {/* Radix focuses this, the first focusable element, when the list opens. */}
          <input
            role="combobox"
            aria-label="Search countries"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
            value={query}
            placeholder={dialCodes ? "Country or code, e.g. India or 91" : "Search countries"}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className={cn(controlClass, controlSize.sm, "pl-8")}
          />
        </div>
        <ul ref={list} id={listId} role="listbox" aria-label="Countries" className="relative max-h-64 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? <li className="text-muted-foreground px-2 py-3 text-center text-sm">No country matches.</li> : null}
          {rows.map((r, i) => (
            <li
              key={r.code || "none"}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={r.code === value}
              onMouseMove={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
              onClick={() => choose(r.code)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                i === active && "bg-edge-mint/50",
                r.code === value && "font-semibold",
              )}
            >
              {r.country ? (
                <>
                  <span className="text-base leading-none">{r.country.flag}</span>
                  <span className="flex-1 truncate">{r.country.name}</span>
                  {dialCodes ? <span className="text-muted-foreground tabular-nums">+{r.country.dialCode}</span> : null}
                </>
              ) : (
                <span className="text-muted-foreground flex-1">{emptyLabel}</span>
              )}
              {r.code === value ? <Check aria-hidden className="text-edge-emerald size-4" /> : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
