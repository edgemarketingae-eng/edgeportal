"use client";

import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "cn";
import { Combobox, type ComboboxOption } from "./combobox";

/** Lists longer than this get a search box. */
const SEARCH_ABOVE = 8;

export type SelectProps = Omit<ComponentProps<"select">, "size" | "multiple"> & {
  size?: "sm" | "md";
  wrapperClassName?: string;
  /** A search box above the list; on by default for lists of more than 8 options. */
  searchable?: boolean;
  /** Values matching a search, best first; the option labels are matched by default. */
  filter?: (query: string) => readonly string[];
  searchLabel?: string;
  searchPlaceholder?: string;
  /** What the closed button shows for the selected option; its label by default. */
  renderValue?: (option: ComboboxOption) => ReactNode;
};

/**
 * A custom dropdown written like a native <select>: the same props, with <option> and <optgroup> children. A hidden
 * native select underneath holds the value, so it posts with FormData, goes back to `defaultValue` when its form
 * resets, and `onChange` gets a real change event that bubbles (filter bars listen for those).
 */
function Select({
  className,
  size = "md",
  wrapperClassName,
  children,
  value,
  defaultValue,
  onChange,
  id,
  disabled,
  required,
  searchable,
  filter,
  searchLabel,
  searchPlaceholder,
  renderValue,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SelectProps) {
  const options = collectOptions(children);
  const native = useRef<HTMLSelectElement>(null);
  const controlled = value !== undefined;
  const [initial] = useState(defaultValue === undefined ? undefined : String(defaultValue));
  const [own, setOwn] = useState(initial);
  const [, setResets] = useState(0);
  const wanted = controlled ? String(value) : own;
  // Like a native select, a value that is not among the options shows (and posts) the first enabled option.
  const selected = options.find((o) => o.value === wanted) ?? options.find((o) => !o.disabled) ?? options[0];
  const current = selected?.value ?? "";

  useEffect(() => {
    const form = native.current?.form;
    if (!form) return;
    // The reset event comes before the form resets. Afterwards the hidden select (controlled, so the browser just
    // picked its first option) is rendered again, back on the default value or the parent's value.
    const onReset = () =>
      setTimeout(() => {
        if (!controlled) setOwn(initial);
        setResets((n) => n + 1);
      });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled, initial]);

  /** Sets the hidden select as a person would, so React and the form both see a change event. */
  function pick(next: string) {
    const el = native.current;
    if (!el || el.value === next) return;
    el.value = next;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div data-slot="select" className={cn("relative w-full", wrapperClassName)}>
      {/* Under the button, so the browser's "please select" bubble points at it. */}
      <select
        ref={native}
        aria-hidden
        tabIndex={-1}
        value={current}
        disabled={disabled}
        required={required}
        onChange={(e) => {
          if (!controlled) setOwn(e.target.value);
          onChange?.(e);
        }}
        className="pointer-events-none absolute inset-0 size-full opacity-0"
        {...props}
      >
        {children}
      </select>
      <Combobox
        id={id}
        value={current}
        onChange={pick}
        options={options}
        searchable={searchable ?? options.length > SEARCH_ABOVE}
        filter={filter}
        searchLabel={searchLabel}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled}
        size={size}
        className={className}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
      >
        <span className={cn("min-w-0 truncate", !current && "text-muted-foreground")}>
          {selected ? (renderValue ? renderValue(selected) : selected.label) : null}
        </span>
      </Combobox>
    </div>
  );
}

interface OptionProps {
  value?: string | number | readonly string[];
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
}

/** The <option>s among the children, through arrays, fragments and <optgroup>s. */
function collectOptions(children: ReactNode, group?: string, out: ComboboxOption[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment) collectOptions(child.props.children, group, out);
    else if (child.type === "optgroup") collectOptions(child.props.children, child.props.label, out);
    else if (child.type === "option") {
      const label = child.props.label ?? textOf(child.props.children);
      out.push({ value: String(child.props.value ?? label), label, disabled: child.props.disabled, group });
    }
  });
  return out;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

export { Select };
