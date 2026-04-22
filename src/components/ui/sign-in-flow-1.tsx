"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sun, Moon } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import * as THREE from "three";

// ─── Supabase ─────────────────────────────────────────────────────────────────

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://omrcddyrpbjsnvqwpsjq.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_3zfHtNM_g3sIym0Gzgyj9A_MLfdTkaa"
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "admin" | "client";

interface AppUser {
  id: string;
  email: string;
  role: Role;
  client_id: string | null;
  name: string;
}

interface SignInPageProps {
  className?: string;
  onLogin: (u: AppUser) => void;
  dark: boolean;
  onToggleDark: () => void;
}

type Uniforms = {
  [key: string]: { value: number[] | number[][] | number; type: string };
};

interface ShaderProps {
  source: string;
  uniforms: Uniforms;
  maxFps?: number;
}

// ─── WebGL Shader ─────────────────────────────────────────────────────────────

const ShaderMaterial = ({ source, uniforms, maxFps = 60 }: { source: string; maxFps?: number; uniforms: Uniforms }) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const material: any = ref.current.material;
    material.uniforms.u_time.value = clock.getElapsedTime();
  });

  const preparedUniforms = useMemo(() => {
    const out: any = {};
    for (const name in uniforms) {
      const u: any = uniforms[name];
      switch (u.type) {
        case "uniform1f":  out[name] = { value: u.value }; break;
        case "uniform1i":  out[name] = { value: u.value }; break;
        case "uniform1fv": out[name] = { value: u.value }; break;
        case "uniform3fv":
          out[name] = { value: (u.value as number[][]).map((v: number[]) => new THREE.Vector3().fromArray(v)) };
          break;
        default: out[name] = { value: u.value };
      }
    }
    out["u_time"] = { value: 0 };
    out["u_resolution"] = { value: new THREE.Vector2(size.width * 2, size.height * 2) };
    return out;
  }, [size.width, size.height, uniforms]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: `
          precision mediump float;
          uniform vec2 u_resolution;
          out vec2 fragCoord;
          void main(){
            gl_Position = vec4(position.xy, 0.0, 1.0);
            fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
            fragCoord.y = u_resolution.y - fragCoord.y;
          }`,
        fragmentShader: source,
        uniforms: preparedUniforms,
        glslVersion: THREE.GLSL3,
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
      }),
    [source, preparedUniforms]
  );

  return (
    <mesh ref={ref as any}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => (
  <Canvas className="absolute inset-0 h-full w-full">
    <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
  </Canvas>
);

// ─── Dot Matrix ───────────────────────────────────────────────────────────────

interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[0, 0, 0]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = useMemo(() => {
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
    if (colors.length === 2) colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    else if (colors.length === 3) colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    return {
      u_colors:     { value: colorsArray.map(c => [c[0]/255, c[1]/255, c[2]/255]), type: "uniform3fv" },
      u_opacities:  { value: opacities, type: "uniform1fv" },
      u_total_size: { value: totalSize, type: "uniform1f" },
      u_dot_size:   { value: dotSize,   type: "uniform1f" },
      u_reverse:    { value: shader.includes("u_reverse_active") ? 1 : 0, type: "uniform1i" },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;
        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;
        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy){ return fract(tan(distance(xy*PHI,xy)*0.5)*xy.x); }
        float map(float v,float a,float b,float c,float d){ return c+(v-a)*(d-c)/(b-a); }

        void main(){
          vec2 st = fragCoord.xy;
          ${center.includes("x") ? "st.x -= abs(floor((mod(u_resolution.x,u_total_size)-u_dot_size)*0.5));" : ""}
          ${center.includes("y") ? "st.y -= abs(floor((mod(u_resolution.y,u_total_size)-u_dot_size)*0.5));" : ""}

          float opacity = step(0.0,st.x)*step(0.0,st.y);
          vec2 st2 = vec2(int(st.x/u_total_size),int(st.y/u_total_size));
          float show_offset = random(st2);
          float rand = random(st2*floor((u_time/5.0)+show_offset+5.0));
          opacity *= u_opacities[int(rand*10.0)];
          opacity *= 1.0-step(u_dot_size/u_total_size,fract(st.x/u_total_size));
          opacity *= 1.0-step(u_dot_size/u_total_size,fract(st.y/u_total_size));

          vec3 color = u_colors[int(show_offset*6.0)];
          float speed = 0.5;
          vec2 cg = u_resolution/2.0/u_total_size;
          float dist = distance(cg,st2);
          float maxDist = distance(cg,vec2(0.0));

          float offsetIntro = dist*0.01+random(st2)*0.15;
          float offsetOutro = (maxDist-dist)*0.02+random(st2+42.0)*0.2;

          if(u_reverse==1){
            opacity *= 1.0-step(offsetOutro, u_time*speed);
            opacity *= clamp(step(offsetOutro+0.1,u_time*speed)*1.25,1.0,1.25);
          } else {
            opacity *= step(offsetIntro, u_time*speed);
            opacity *= clamp((1.0-step(offsetIntro+0.1,u_time*speed))*1.25,1.0,1.25);
          }

          fragColor = vec4(color,opacity);
          fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  );
};

// ─── Canvas Reveal Effect ─────────────────────────────────────────────────────

export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => (
  <div className={cn("h-full relative w-full", containerClassName)}>
    <div className="h-full w-full">
      <DotMatrix
        colors={colors}
        dotSize={dotSize ?? 3}
        opacities={opacities}
        shader={`${reverse ? "u_reverse_active" : "false"}_; animation_speed_factor_${animationSpeed.toFixed(1)}_;`}
        center={["x", "y"]}
      />
    </div>
    {showGradient && <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />}
  </div>
);

// ─── Animated Nav Link ────────────────────────────────────────────────────────

const AnimatedNavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="group relative inline-flex h-5 items-center overflow-hidden text-sm">
    <div className="flex flex-col transition-transform duration-300 ease-out group-hover:-translate-y-1/2">
      <span className="text-gray-300">{children}</span>
      <span className="text-white">{children}</span>
    </div>
  </a>
);

// ─── Mini Navbar ──────────────────────────────────────────────────────────────

function MiniNavbar({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [shape, setShape] = useState("rounded-full");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isOpen) {
      setShape("rounded-xl");
    } else {
      timerRef.current = setTimeout(() => setShape("rounded-full"), 300);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isOpen]);

  const navLinks = [
    { label: "Manifesto", href: "#" },
    { label: "Careers",   href: "#" },
    { label: "Discover",  href: "#" },
  ];

  return (
    <header className={cn(
      "fixed top-6 left-1/2 z-20 flex w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center border border-[#333] bg-[#1f1f1f57] px-6 py-3 backdrop-blur-sm transition-[border-radius] sm:w-auto",
      shape
    )}>
      <div className="flex w-full items-center justify-between gap-x-6 sm:gap-x-8">
        {/* Logo */}
        <div className="relative flex h-5 w-5 items-center justify-center">
          {[["top-0 left-1/2 -translate-x-1/2"], ["left-0 top-1/2 -translate-y-1/2"], ["right-0 top-1/2 -translate-y-1/2"], ["bottom-0 left-1/2 -translate-x-1/2"]].map((pos, i) => (
            <span key={i} className={cn("absolute h-1.5 w-1.5 rounded-full bg-gray-200 opacity-80", ...pos)} />
          ))}
        </div>

        <nav className="hidden items-center space-x-6 text-sm sm:flex">
          {navLinks.map(l => <AnimatedNavLink key={l.href} href={l.href}>{l.label}</AnimatedNavLink>)}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          {/* Dark/light toggle */}
          <button
            onClick={onToggleDark}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#333] bg-[rgba(31,31,31,0.62)] text-gray-300 transition-colors hover:border-white/50 hover:text-white"
          >
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <button className="flex h-8 w-8 items-center justify-center text-gray-300 focus:outline-none sm:hidden" onClick={() => setIsOpen(v => !v)}>
          {isOpen
            ? <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
            : <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>}
        </button>
      </div>

      <div className={cn("flex w-full flex-col items-center overflow-hidden transition-all duration-300 ease-in-out sm:hidden",
        isOpen ? "max-h-[1000px] pt-4 opacity-100" : "pointer-events-none max-h-0 pt-0 opacity-0")}>
        <nav className="flex w-full flex-col items-center space-y-4 text-base">
          {navLinks.map(l => <a key={l.href} href={l.href} className="w-full text-center text-gray-300 transition-colors hover:text-white">{l.label}</a>)}
        </nav>
        <div className="mt-4 flex w-full flex-col items-center space-y-4">
          <button onClick={onToggleDark} className="w-full rounded-full border border-[#333] bg-[rgba(31,31,31,0.62)] px-4 py-2 text-sm text-gray-300 transition-colors hover:border-white/50 hover:text-white">
            {dark ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Sign-In Page ─────────────────────────────────────────────────────────────

export const SignInPage = ({ className, onLogin, dark, onToggleDark }: SignInPageProps) => {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [initialCanvas, setInitialCanvas] = useState(true);
  const [reverseCanvas, setReverseCanvas] = useState(false);
  const [resendKey, setResendKey] = useState(0);

  // ── Email step: send Supabase OTP ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || submitting) return;
    setError(""); setSubmitting(true);
    const { error: err } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setStep("code");
  };

  useEffect(() => {
    if (step === "code") setTimeout(() => codeRefs.current[0]?.focus(), 500);
  }, [step]);

  // ── Shared verify logic ──
  const triggerVerify = async (digits: string[]) => {
    setReverseCanvas(true);
    setTimeout(() => setInitialCanvas(false), 50);
    const token = digits.join("");
    setError(""); setSubmitting(true);
    const { data, error: err } = await sb.auth.verifyOtp({ email, token, type: "email" });
    setSubmitting(false);
    if (err || !data.user) {
      setError(err?.message ?? "Invalid code.");
      setReverseCanvas(false); setInitialCanvas(true);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
      return;
    }
    const meta = data.user.user_metadata as { role?: string; client_id?: string; full_name?: string };
    setTimeout(() => {
      setStep("success");
      setTimeout(() => {
        onLogin({
          id: data.user!.id,
          email: data.user!.email ?? "",
          role: (meta.role as Role) ?? "client",
          client_id: meta.client_id ?? null,
          name: meta.full_name ?? "",
        });
      }, 1400);
    }, 2000);
  };

  // ── Code digit input handling ──
  const handleCodeChange = async (index: number, value: string) => {
    if (value.length > 1) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    if (value && index < 5) codeRefs.current[index + 1]?.focus();
    if (index === 5 && value && next.every(d => d.length === 1)) triggerVerify(next);
  };

  // ── Paste: fill all 6 digits at once ──
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!digits) return;
    const next = Array.from({ length: 6 }, (_, i) => digits[i] ?? "");
    setCode(next);
    const lastIndex = Math.min(digits.length - 1, 5);
    codeRefs.current[lastIndex]?.focus();
    if (digits.length === 6) triggerVerify(next);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) codeRefs.current[index - 1]?.focus();
  };

  const handleBack = () => {
    setStep("email"); setCode(["", "", "", "", "", ""]); setError("");
    setReverseCanvas(false); setInitialCanvas(true);
  };

  return (
    <div className={cn("relative flex min-h-screen w-full flex-col bg-black", className)}>
      {/* WebGL dot-matrix background */}
      <div className="absolute inset-0 z-0">
        {initialCanvas && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={3} containerClassName="bg-black"
              colors={[[255,255,255],[255,255,255]]} dotSize={6} reverse={false} />
          </div>
        )}
        {reverseCanvas && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={4} containerClassName="bg-black"
              colors={[[255,255,255],[255,255,255]]} dotSize={6} reverse={true} />
          </div>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,1)_0%,_transparent_100%)]" />
        <div className="absolute left-0 right-0 top-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col">
        <MiniNavbar dark={dark} onToggleDark={onToggleDark} />

        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="mt-[150px] w-full max-w-sm px-4">
            <AnimatePresence mode="wait">

              {/* ── Step 1: Email ── */}
              {step === "email" && (
                <motion.div key="email"
                  initial={{ opacity: 0, x: -100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-6 text-center">
                  <div className="space-y-1">
                    <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">Welcome back</h1>
                    <p className="text-[1.4rem] font-light text-white/70">Sign in to DrizzleBot</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-sm text-white/40">enter your email</span>
                      <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <form onSubmit={handleEmailSubmit}>
                      <div className="relative">
                        <input
                          type="email" required placeholder="you@company.com" value={email}
                          onChange={e => { setEmail(e.target.value); setError(""); }}
                          className="w-full rounded-full border border-white/10 bg-transparent py-3 px-4 text-center text-white placeholder-white/30 backdrop-blur-sm outline-none transition-colors focus:border-white/30"
                        />
                        <button type="submit" disabled={submitting}
                          className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-50 group">
                          <span className="relative block h-full w-full overflow-hidden">
                            <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">→</span>
                            <span className="absolute inset-0 flex -translate-x-full items-center justify-center transition-transform duration-300 group-hover:translate-x-0">→</span>
                          </span>
                        </button>
                      </div>
                      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                    </form>
                  </div>

                  <p className="pt-10 text-xs text-white/40">
                    By signing in you agree to the{" "}
                    <Link href="#" className="underline hover:text-white/60 transition-colors">Privacy Policy</Link>{" "}and{" "}
                    <Link href="#" className="underline hover:text-white/60 transition-colors">Terms of Service</Link>.
                  </p>
                </motion.div>
              )}

              {/* ── Step 2: OTP Code ── */}
              {step === "code" && (
                <motion.div key="code"
                  initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="space-y-6 text-center">
                  <div className="space-y-1">
                    <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">Check your email</h1>
                    <p className="text-[1.1rem] font-light text-white/50">Enter the 6-digit code sent to<br /><span className="text-white/70">{email}</span></p>
                  </div>

                  <div className="w-full">
                    <div className="relative rounded-full border border-white/10 bg-transparent px-5 py-4">
                      <div className="flex items-center justify-center">
                        {code.map((digit, i) => (
                          <div key={i} className="flex items-center">
                            <div className="relative">
                              <input
                                ref={el => { codeRefs.current[i] = el; }}
                                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                                value={digit}
                                onChange={e => handleCodeChange(i, e.target.value)}
                                onKeyDown={e => handleKeyDown(i, e)}
                                onPaste={handlePaste}
                                className="w-8 appearance-none border-none bg-transparent text-center text-xl text-white outline-none focus:ring-0"
                                style={{ caretColor: "transparent" }}
                              />
                              {!digit && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                  <span className="text-xl text-white/20">0</span>
                                </div>
                              )}
                            </div>
                            {i < 5 && <span className="text-xl text-white/20">|</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <motion.p className="cursor-pointer text-sm text-white/50 transition-colors hover:text-white/70"
                      whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}
                      onClick={async () => {
                        await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
                        setResendKey(k => k + 1);
                      }}>
                      Resend code
                    </motion.p>
                    {resendKey > 0 && (
                      <motion.span
                        key={resendKey}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                      >
                        <svg className="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </motion.span>
                    )}
                  </div>

                  <div className="flex w-full gap-3">
                    <motion.button onClick={handleBack}
                      className="w-[30%] rounded-full bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-white/90"
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
                      Back
                    </motion.button>
                    <motion.button
                      disabled={!code.every(d => d !== "") || submitting}
                      className={cn(
                        "flex-1 rounded-full py-3 font-medium transition-all duration-300 border",
                        code.every(d => d !== "") && !submitting
                          ? "cursor-pointer border-transparent bg-white text-black hover:bg-white/90"
                          : "cursor-not-allowed border-white/10 bg-[#111] text-white/50"
                      )}>
                      {submitting ? "Verifying…" : "Continue"}
                    </motion.button>
                  </div>

                  <p className="pt-10 text-xs text-white/40">
                    By signing in you agree to the{" "}
                    <Link href="#" className="underline hover:text-white/60 transition-colors">Privacy Policy</Link>{" "}and{" "}
                    <Link href="#" className="underline hover:text-white/60 transition-colors">Terms of Service</Link>.
                  </p>
                </motion.div>
              )}

              {/* ── Step 3: Success ── */}
              {step === "success" && (
                <motion.div key="success"
                  initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.3 }}
                  className="space-y-6 text-center">
                  <div className="space-y-1">
                    <h1 className="text-[2.5rem] font-bold leading-[1.1] tracking-tight text-white">You're in!</h1>
                    <p className="text-[1.25rem] font-light text-white/50">Welcome to DrizzleBot</p>
                  </div>
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }} className="py-10">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white to-white/70">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-black" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </motion.div>
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                    className="w-full rounded-full bg-white py-3 font-medium text-black transition-colors hover:bg-white/90">
                    Redirecting to dashboard…
                  </motion.button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
