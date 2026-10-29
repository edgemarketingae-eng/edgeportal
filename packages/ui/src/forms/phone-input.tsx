"use client";

import { COUNTRIES, countryByCode, HOME_COUNTRY } from "@edge/domain/countries";
import { parsePhone } from "@edge/domain/phone";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "cn";
import { NativeSelect } from "../components/native-select";
import { controlClass, controlSize } from "../lib/control";
import { CountryCombobox, useSearchableCountries } from "./country-picker";

/** Splits a stored number into the country it belongs to and the national part shown in the box. */
function split(value: string | undefined, fallback: string) {
  const v = (value ?? "").trim();
  if (!v) return { country: fallback, text: "" };
  const p = v.startsWith("+") ? parsePhone(v) : null;
  const c = countryByCode(p?.country);
  if (p && c) return { country: c.code, text: p.e164.slice(c.dialCode.length + 1) };
  return { country: fallback, text: v };
}

/** What the form posts: typed international numbers as they are, local numbers with the chosen dial code. */
function toValue(text: string, country: string) {
  const t = text.trim();
  if (!t) return "";
  if (t.startsWith("+") || t.startsWith("00")) return `+${t.replace(/^00/, "").replace(/\D/g, "")}`;
  const digits = t.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? `+${countryByCode(country)?.dialCode ?? ""}${digits}` : "";
}

export interface PhoneInputProps {
  name: string;
  id?: string;
  defaultValue?: string;
  /** Dial code shown first; the academy's home country unless the person's country is known. */
  defaultCountry?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** Called when the dial-code country changes (picked, or detected from a typed +code). */
  onCountryChange?: (country: string) => void;
}

/**
 * Mobile number with a country dial-code picker, for any country. Posts one E.164 value (+919876543210) under
 * `name`; people can also type the full international number, and the picker follows it.
 */
export function PhoneInput({
  name,
  id,
  defaultValue,
  defaultCountry,
  required,
  disabled,
  placeholder,
  autoComplete = "tel",
  className,
  onCountryChange,
  ...aria
}: PhoneInputProps) {
  const initial = split(defaultValue, countryByCode(defaultCountry)?.code ?? HOME_COUNTRY);
  const [country, setCountry] = useState(initial.country);
  const [text, setText] = useState(initial.text);
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue);
    const next = split(defaultValue, country);
    setCountry(next.country);
    setText(next.text);
  }

  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const onReset = () => {
      const d = split(defaultValue, countryByCode(defaultCountry)?.code ?? HOME_COUNTRY);
      setCountry(d.country);
      setText(d.text);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, defaultCountry]);

  function pick(code: string) {
    setCountry(code);
    onCountryChange?.(code);
  }

  const searchable = useSearchableCountries();
  const current = countryByCode(country);
  return (
    <div data-slot="phone-input" className={cn("flex w-full min-w-[16rem] gap-2", className)}>
      <input ref={hidden} type="hidden" name={name} value={toValue(text, country)} />
      {searchable ? (
        <CountryCombobox
          value={country}
          onChange={pick}
          dialCodes
          disabled={disabled}
          aria-label="Country code"
          className="w-[7.5rem] shrink-0 gap-1.5 tabular-nums"
          display={(c) => (
            <>
              <span className="text-base leading-none">{c?.flag}</span>
              <span className="truncate">+{c?.dialCode}</span>
            </>
          )}
        />
      ) : (
        <div className="relative w-[7.5rem] shrink-0">
          {/* The native select keeps phones' own picker; the chip on top shows just flag and code. */}
          <div aria-hidden className={cn(controlClass, controlSize.md, "pointer-events-none flex items-center gap-1.5 pr-7 tabular-nums")}>
            <span className="text-base leading-none">{current?.flag}</span>
            <span className="truncate">+{current?.dialCode}</span>
            <ChevronDown className="text-muted-foreground absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
          </div>
          <select
            aria-label="Country code"
            value={country}
            disabled={disabled}
            onChange={(e) => pick(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} (+{c.dialCode})
              </option>
            ))}
          </select>
        </div>
      )}
      <input
        id={id ?? name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={text}
        required={required}
        disabled={disabled}
        placeholder={placeholder ?? "Mobile number"}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          // A typed international number moves the picker to its country.
          if (/^(\+|00)/.test(t.trim())) {
            const detected = parsePhone(t)?.country;
            if (detected && detected !== country && countryByCode(detected)) pick(detected);
          }
        }}
        className={cn(controlClass, controlSize.md, "min-w-[7rem] flex-1 tabular-nums")}
      />
    </div>
  );
}

type CountrySelectProps = ComponentProps<typeof NativeSelect> & { emptyLabel?: string };

/**
 * Country picker over every country; `emptyLabel` adds a "not set" first option. A native select, or a searchable list
 * inside `SearchableCountryPickers` (uncontrolled there: `name` and `defaultValue`).
 */
export function CountrySelect({ emptyLabel, ...props }: CountrySelectProps) {
  const searchable = useSearchableCountries();
  if (searchable) return <SearchableCountrySelect emptyLabel={emptyLabel} {...props} />;
  return (
    <NativeSelect {...props}>
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** The searchable `CountrySelect`: posts the code under `name` and goes back to `defaultValue` when its form resets. */
function SearchableCountrySelect({ name, id, defaultValue, emptyLabel, disabled, size, className, ...aria }: CountrySelectProps) {
  const initial = typeof defaultValue === "string" ? defaultValue : "";
  const [value, setValue] = useState(initial);
  const [prevDefault, setPrevDefault] = useState(initial);
  if (initial !== prevDefault) {
    setPrevDefault(initial);
    setValue(initial);
  }
  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const onReset = () => setValue(initial);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [initial]);
  const invalid = aria["aria-invalid"];
  return (
    <>
      <input ref={hidden} type="hidden" name={name} value={value} />
      <CountryCombobox
        id={id}
        value={value}
        onChange={setValue}
        emptyLabel={emptyLabel}
        disabled={disabled}
        size={size}
        className={className}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={invalid === true || invalid === "true" || undefined}
      />
    </>
  );
}
