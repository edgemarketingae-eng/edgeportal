"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Input } from "../components/input";
import { NativeSelect } from "../components/native-select";
import { cn } from "../lib/utils";

/**
 * List filters live in the URL so lists are shareable, exportable and work with Back. Changing them is a
 * client-side navigation inside a React transition: the shell stays put, the current results stay on
 * screen (dimmed by <FilterResults>) until the new ones arrive, and the page never reloads.
 */
interface Navigator {
  pending: boolean;
  navigate: (href: string, opts?: { replace?: boolean }) => void;
}

const FilterContext = createContext<Navigator | null>(null);

function useTransitionNavigator(): Navigator {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    navigate: (href, opts) =>
      startTransition(() => {
        if (opts?.replace) router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      }),
  };
}

/** The surrounding <FilterScope>, or a transition of its own when a filter is used on its own. */
function useNavigator(): Navigator {
  const scope = useContext(FilterContext);
  const own = useTransitionNavigator();
  return scope ?? own;
}

/** Navigate within the list's scope (results dim while the next page loads), e.g. from a page-size select. */
export function useListNavigate() {
  return useNavigator().navigate;
}

/** Shares one pending state between the filters, the view links and the results of a list page. */
export function FilterScope({ children }: { children: ReactNode }) {
  const nav = useTransitionNavigator();
  return <FilterContext.Provider value={nav}>{children}</FilterContext.Provider>;
}

/** The part of the page that changes with the filters: dimmed while the next results load. */
export function FilterResults({ children, className }: { children: ReactNode; className?: string }) {
  const pending = useContext(FilterContext)?.pending ?? false;
  return (
    <div
      aria-busy={pending || undefined}
      className={cn("transition-opacity duration-150", pending && "pointer-events-none opacity-60", className)}
    >
      {children}
    </div>
  );
}

/** Same-page link that changes the query (view chips, Board/List): navigates through the scope so results dim. */
export function FilterLink({ href, onClick, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { navigate } = useNavigator();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        // Leave new-tab / new-window clicks to the browser.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
}

const DEBOUNCE_MS = 350;

/**
 * Search box that applies itself shortly after typing stops. When the URL's `q` changes from elsewhere
 * (a view link, Back) it shows that value, but never overwrites text typed while a search is loading.
 */
function SearchInput({ q, placeholder, onSearch }: { q: string; placeholder: string; onSearch: () => void }) {
  const [value, setValue] = useState(q);
  const [seen, setSeen] = useState(q); // last `q` received from the server
  const [sent, setSent] = useState(q); // last value this box applied
  if (q !== seen) {
    setSeen(q);
    if (q !== sent) setValue(q);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const t = timer;
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, []);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <Input
      name="q"
      type="search"
      value={value}
      placeholder={placeholder}
      aria-label="Search"
      autoComplete="off"
      className="bg-card h-9 w-full sm:w-72"
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          setSent(next.trim());
          onSearch();
        }, DEBOUNCE_MS);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        cancel(); // the form submits right away
        setSent(value.trim());
      }}
    />
  );
}

/**
 * Filter form: selects apply as soon as they change, the search box shortly after typing stops, Enter at
 * once. Still a real GET form, so it works before JavaScript loads.
 */
export function FilterBar({
  children,
  q,
  placeholder = "Search name, email, mobile…",
  extra,
  search = true,
  className,
}: {
  children?: ReactNode;
  q?: string;
  placeholder?: string;
  extra?: ReactNode;
  /** Set to false for lists that have no free-text search, only selects. */
  search?: boolean;
  className?: string;
}) {
  const { pending, navigate } = useNavigator();
  const pathname = usePathname();
  const form = useRef<HTMLFormElement>(null);

  function apply(el: HTMLFormElement, replace = false) {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(el)) {
      if (typeof v === "string" && v.trim()) params.append(k, v.trim());
    }
    const qs = params.toString();
    if (qs === window.location.search.replace(/^\?/, "")) return;
    navigate(qs ? `${pathname}?${qs}` : pathname, { replace });
  }

  return (
    <form
      ref={form}
      method="get"
      className={cn("mb-4 flex flex-wrap items-center gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        const t = e.target;
        // Text typing is handled (debounced) by the search box itself.
        if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio")))
          apply(e.currentTarget);
      }}
    >
      {search ? <SearchInput q={q ?? ""} placeholder={placeholder} onSearch={() => form.current && apply(form.current, true)} /> : null}
      {children}
      <button type="submit" className="sr-only">
        Apply filters
      </button>
      <Loader2
        aria-hidden
        className={cn("text-muted-foreground size-4 animate-spin transition-opacity", pending ? "opacity-100" : "opacity-0")}
      />
      <span role="status" className="sr-only">
        {pending ? "Loading results" : ""}
      </span>
      {extra}
    </form>
  );
}

export function FilterSelect({
  name,
  value,
  options,
  label,
  allLabel,
}: {
  name: string;
  value?: string;
  options: [string, string][];
  label: string;
  /** Text of the "no filter" option; defaults to "<label>: all". */
  allLabel?: string;
}) {
  return (
    // Keyed by the value so it shows the new one when the URL changes without this select (a link, Back).
    <NativeSelect size="sm" wrapperClassName="w-auto" key={value ?? ""} name={name} defaultValue={value ?? ""} aria-label={label}>
      <option value="">{allLabel ?? `${label}: all`}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </NativeSelect>
  );
}
