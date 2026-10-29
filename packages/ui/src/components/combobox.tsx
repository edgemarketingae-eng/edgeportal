"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type AriaAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";
import { controlClass, controlSize } from "../lib/control";
import { PHONE_QUERY, useMediaQuery } from "../lib/use-media-query";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";

export interface ComboboxOption {
  value: string;
  /** Shown in the list, and what the search box and typing match. */
  label: string;
  disabled?: boolean;
  /** Heading shown above the first option of its group (an <optgroup>). */
  group?: string;
}

/** Text folded for matching: no case, accents or apostrophes. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").toLowerCase();

/** Options matching a search, best first: the label starts with it, then a word in it does, then it appears anywhere. */
function matchOptions(options: readonly ComboboxOption[], query: string) {
  const q = fold(query.trim());
  const rank = (o: ComboboxOption) => {
    const label = fold(o.label);
    if (label.startsWith(q)) return 0;
    if (label.includes(` ${q}`)) return 1;
    return label.includes(q) ? 2 : -1;
  };
  return options
    .map((o) => [o, rank(o)] as const)
    .filter(([, r]) => r >= 0)
    .sort((a, b) => a[1] - b[1])
    .map(([o]) => o);
}

/** Typed letters within this long of each other make one word to jump to. */
const TYPEAHEAD_MS = 700;

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly ComboboxOption[];
  /** What the closed button shows. */
  children: ReactNode;
  /** A search box above the list. Without one, typing jumps to the next option starting with the typed text. */
  searchable?: boolean;
  /** Values matching a search, best first; replaces the built-in label match. */
  filter?: (query: string) => readonly string[];
  /** The search box's accessible name; "Search <the field's label>" by default. */
  searchLabel?: string;
  searchPlaceholder?: string;
  /** The list's accessible name; "<the field's label> options" by default (not the label itself, which names the button). */
  listLabel?: string;
  emptyText?: string;
  /** A list row's content; the label by default. */
  renderOption?: (option: ComboboxOption) => ReactNode;
  /** Classes of the desktop popover, e.g. a fixed width. */
  popupClassName?: string;
  id?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

/**
 * A button that opens a list to pick one value from: a popover on desktop, a bottom sheet on phones. Arrows, Home,
 * End and Enter pick; Escape closes. `Select` builds on it for forms, the country pickers for countries.
 */
export function Combobox({
  value,
  onChange,
  options,
  children,
  searchable,
  filter,
  searchLabel,
  searchPlaceholder = "Search…",
  listLabel,
  emptyText = "Nothing matches.",
  renderOption,
  popupClassName,
  id,
  disabled,
  size = "md",
  className,
  ...aria
}: ComboboxProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [title, setTitle] = useState("");
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const rows = !query.trim() ? options : filter ? byValues(options, filter(query)) : matchOptions(options, query);
  const enabled = (i: number) => !!rows[i] && !rows[i].disabled;
  /** The next enabled row from `from` in a direction, or `from` when there is none. */
  function move(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < rows.length; i += step) if (enabled(i)) return i;
    return from;
  }
  /** The row to jump to for a typed key; a repeated letter cycles through the rows starting with it. */
  function typeahead(key: string, from: number) {
    const t = typed.current;
    const now = Date.now();
    t.text = now - t.at > TYPEAHEAD_MS ? key : t.text + key;
    t.at = now;
    const cycling = [...t.text].every((c) => c === t.text[0]);
    const needle = fold(cycling ? t.text[0] : t.text);
    const start = cycling ? from + 1 : Math.max(0, from);
    for (let k = 0; k < rows.length; k++) {
      const i = (start + k) % rows.length;
      if (enabled(i) && fold(rows[i].label).startsWith(needle)) return i;
    }
    return from;
  }

  function openChange(next: boolean, seed = "") {
    setOpen(next);
    if (!next) return;
    setTitle(trigger.current?.labels?.[0]?.textContent?.trim() || aria["aria-label"] || listLabel || "Choose an option");
    // Opens on the full list with the current value highlighted, or on what was typed on the closed button.
    const at = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    setQuery(searchable ? seed : "");
    setActive(!seed ? at : searchable ? 0 : typeahead(seed, at));
  }
  function choose(i: number) {
    const row = rows[i];
    if (!row || row.disabled) return;
    onChange(row.value);
    setOpen(false);
  }
  function onListKeyDown(e: KeyboardEvent<HTMLElement>, typeToJump: boolean) {
    if (e.key === "ArrowDown") setActive((i) => move(i, 1));
    else if (e.key === "ArrowUp") setActive((i) => move(i, -1));
    else if (e.key === "Home") setActive(move(-1, 1));
    else if (e.key === "End") setActive(move(rows.length, -1));
    else if (e.key === "Enter") choose(active);
    else if (e.key === "Tab") setOpen(false);
    else if (typeToJump && e.key === " " && Date.now() - typed.current.at > TYPEAHEAD_MS) choose(active);
    else if (typeToJump && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) setActive(typeahead(e.key, active));
    else return;
    e.preventDefault();
  }
  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") openChange(true);
    else if (e.key.length === 1 && e.key !== " ") openChange(true, e.key);
    else return;
    e.preventDefault();
  }
  /** Where focus goes on opening: the search box, or the list itself (also on phones, so the keyboard stays down). */
  function focusPanel(e: Event) {
    e.preventDefault();
    (searchable && !phone ? input.current : list.current)?.focus();
  }

  // Keep the highlighted row in view: on opening (the current value) and while moving with the arrows. Scrolls the
  // list itself, a frame later, once the popup is placed.
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

  const activeId = enabled(active) ? `${listId}-${active}` : undefined;
  const panel = (
    <>
      {searchable ? (
        <div className="relative">
          <Search aria-hidden className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <input
            ref={input}
            role="combobox"
            aria-label={searchLabel ?? `Search ${title.toLowerCase()}`}
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => onListKeyDown(e, false)}
            className={cn(controlClass, controlSize.sm, "pl-8")}
          />
        </div>
      ) : null}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-label={listLabel ?? `${title} options`}
        aria-activedescendant={activeId}
        onKeyDown={(e) => onListKeyDown(e, true)}
        className={cn("relative overflow-y-auto overscroll-contain outline-none", phone ? "max-h-[min(60dvh,30rem)]" : "max-h-72")}
      >
        {rows.length === 0 ? <li className="text-muted-foreground px-2 py-3 text-center text-sm">{emptyText}</li> : null}
        {rows.map((o, i) => (
          <Fragment key={i}>
            {o.group && o.group !== rows[i - 1]?.group ? (
              <li role="presentation" className="text-muted-foreground px-2 pt-2.5 pb-1 text-xs font-semibold tracking-wide uppercase">
                {o.group}
              </li>
            ) : null}
            <li
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseMove={() => {
                if (i !== active && !o.disabled) setActive(i);
              }}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the search box
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2",
                phone ? "min-h-11 py-2 text-base" : "py-1.5 text-sm",
                i === active && "bg-edge-mint/50",
                o.value === value && "font-semibold",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {renderOption ? renderOption(o) : <span className="min-w-0 flex-1">{o.label}</span>}
              {o.value === value ? <Check aria-hidden className="text-edge-emerald size-4 shrink-0" /> : null}
            </li>
          </Fragment>
        ))}
      </ul>
    </>
  );

  const button = (
    <button
      ref={trigger}
      type="button"
      id={id}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      {...aria}
      onKeyDown={onTriggerKeyDown}
      onClick={phone ? () => openChange(true) : undefined}
      className={cn(controlClass, controlSize[size], "relative flex cursor-pointer items-center gap-2 pr-9 text-left", className)}
    >
      {children}
      <ChevronDown
        aria-hidden
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
  );

  if (phone)
    return (
      <>
        {button}
        <Sheet open={open} onOpenChange={openChange}>
          <SheetContent
            side="bottom"
            aria-describedby={undefined}
            onOpenAutoFocus={focusPanel}
            className="max-h-[85dvh] gap-3 rounded-t-2xl px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="px-1 pt-3 pr-10 pb-0">
              <SheetTitle className="font-semibold">{title}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  return (
    // Modal, so the list scrolls and takes focus inside dialogs too.
    <Popover open={open} onOpenChange={openChange} modal>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="start"
        onOpenAutoFocus={focusPanel}
        className={cn("w-max max-w-[min(26rem,calc(100vw-2rem))] min-w-(--radix-popover-trigger-width) gap-1.5 p-1.5", popupClassName)}
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

/** The options with these values, in this order. */
function byValues(options: readonly ComboboxOption[], values: readonly string[]) {
  const byValue = new Map(options.map((o) => [o.value, o]));
  return values.flatMap((v) => byValue.get(v) ?? []);
}
