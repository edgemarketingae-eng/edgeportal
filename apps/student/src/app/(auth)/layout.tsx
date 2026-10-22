import { Logo } from "@edge/ui/brand/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="bg-edge-ink text-edge-offwhite relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <Logo height={40} />
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-4xl leading-tight uppercase">
            Trade with an <span className="text-edge-green">edge</span>.
          </h1>
          <p className="text-edge-mint/90 mt-4">Live classes, recordings, mentorship and your progress, all in one place.</p>
        </div>
        <p className="text-edge-mint/60 relative z-10 text-xs">© Edge Trading Academy · Dubai</p>
        <div aria-hidden className="bg-edge-emerald/40 absolute -right-24 -bottom-24 size-96 rounded-full blur-3xl" />
        <div aria-hidden className="border-edge-green/25 absolute top-1/3 -right-10 size-56 rotate-12 rounded-3xl border-[18px]" />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="bg-edge-ink mb-8 rounded-xl px-5 py-3 lg:hidden">
          <Logo height={28} />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
