"use client";

import { COUNTRIES, countryByCode, type Country } from "@edge/domain/countries";
import type { ReactNode } from "react";
import { Combobox, fold, type ComboboxOption } from "../components/combobox";

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
  const current = countryByCode(value);
  const options: ComboboxOption[] = [
    ...(emptyLabel !== undefined ? [{ value: "", label: emptyLabel }] : []),
    ...COUNTRIES.map((c) => ({ value: c.code, label: c.name })),
  ];
  return (
    <Combobox
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      searchable
      // The "not set" row only shows while nothing is typed.
      filter={(q) => searchCountries(q).map((c) => c.code)}
      searchLabel="Search countries"
      searchPlaceholder={dialCodes ? "Country or code, e.g. India or 91" : "Search countries"}
      listLabel="Countries"
      emptyText="No country matches."
      renderOption={(o) => {
        const c = countryByCode(o.value);
        if (!c) return <span className="text-muted-foreground flex-1">{o.label}</span>;
        return (
          <>
            <span className="text-base leading-none">{c.flag}</span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {dialCodes ? <span className="text-muted-foreground tabular-nums">+{c.dialCode}</span> : null}
          </>
        );
      }}
      popupClassName="w-80"
      disabled={disabled}
      size={size}
      className={className}
      {...aria}
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
    </Combobox>
  );
}
