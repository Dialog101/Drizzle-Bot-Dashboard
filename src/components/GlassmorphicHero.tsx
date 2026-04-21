import React from "react";

export default function GlassmorphicHero() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-violet-950 via-indigo-900 to-blue-900 flex items-center justify-center px-4">

      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-purple-600/40 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-blue-500/40 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400/20 blur-[100px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Glass card */}
      <div className="relative z-10 w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl backdrop-blur-xl md:p-16">

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white/80 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Now in public beta
        </div>

        {/* Heading */}
        <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-white md:text-6xl">
          Design with{" "}
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
            clarity
          </span>{" "}
          and purpose
        </h1>

        {/* Subheading */}
        <p className="mb-8 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
          A modern design system advisor that analyzes your brand, suggests
          palettes, and generates accessible component libraries — instantly.
        </p>

        {/* CTA row */}
        <div className="flex flex-wrap items-center gap-4">
          <button className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-900 shadow-lg transition hover:bg-white/90 hover:shadow-white/20">
            Get started free
          </button>
          <button className="group flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20">
            Watch demo
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Social proof */}
        <div className="mt-10 flex items-center gap-3 border-t border-white/10 pt-8">
          <div className="flex -space-x-2">
            {["bg-pink-400", "bg-violet-400", "bg-blue-400", "bg-emerald-400"].map(
              (color, i) => (
                <div
                  key={i}
                  className={`h-8 w-8 rounded-full border-2 border-white/20 ${color}`}
                />
              )
            )}
          </div>
          <p className="text-sm text-white/50">
            <span className="font-semibold text-white/80">2,400+</span> designers already building
          </p>
        </div>
      </div>
    </section>
  );
}
