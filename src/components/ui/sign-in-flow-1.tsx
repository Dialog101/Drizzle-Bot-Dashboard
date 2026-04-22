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

const ShaderMaterial = ({ source, uniforms }: { source: string; maxFps?: number; uniforms: Uniforms }) => {
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

// ─── Mini Navbar ──────────────────────────────────────────────────────────────

function MiniNavbar({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const dotCls = dark ? "bg-gray-200" : "bg-slate-500";
  return (
    <header className={cn(
      "fixed right-6 top-6 z-20 flex items-center gap-3 rounded-full border px-4 py-2.5 backdrop-blur-sm transition-colors duration-300",
      dark ? "border-[#333] bg-[#1f1f1f57]" : "border-slate-200 bg-white/80 shadow-sm"
    )}>
      {/* 4-dot logo */}
      <div className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <span className={cn("absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full opacity-80", dotCls)} />
        <span className={cn("absolute left-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full opacity-80", dotCls)} />
        <span className={cn("absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full opacity-80", dotCls)} />
        <span className={cn("absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full opacity-80", dotCls)} />
      </div>

      {/* Theme toggle */}
      <button
        onClick={onToggleDark}
        aria-label="Toggle theme"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
          dark
            ? "border-[#444] bg-[rgba(31,31,31,0.8)] text-gray-300 hover:border-white/50 hover:text-white"
            : "border-slate-200 bg-slate-100 text-slate-500 hover:border-slate-400 hover:text-slate-900"
        )}
      >
        {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>
    </header>
  );
}

// ─── Sign-In Page ─────────────────────────────────────────────────────────────

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts — please wait a minute before trying again.";
  if (m.includes("invalid") || m.includes("expired"))
    return "That code is invalid or has expired. Request a new one.";
  if (m.includes("not found") || m.includes("no user"))
    return "No account found for that email address.";
  if (m.includes("network") || m.includes("fetch"))
    return "Network error — check your connection and try again.";
  return msg;
}

const COOLDOWN_SECS = 60;

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
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECS);
    cooldownRef.current = setInterval(() => {
      setCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // ── Email step: send Supabase OTP ──
  const handleEmailSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || submitting || cooldown > 0) return;
    setError(""); setSubmitting(true);
    const { error: err } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setSubmitting(false);
    if (err) { setError(friendlyError(err.message)); startCooldown(); return; }
    startCooldown();
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
      setError(friendlyError(err?.message ?? "Invalid code."));
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

  // Shorthand theme helpers
  const bg        = dark ? "bg-black"           : "bg-slate-50";
  const canvasBg  = dark ? "bg-black"           : "bg-slate-50";
  const dotColors: [number,number,number][] = dark ? [[255,255,255],[255,255,255]] : [[109,40,217],[139,92,246]];
  const radial    = dark
    ? "bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.85)_0%,_transparent_70%)]"
    : "bg-[radial-gradient(circle_at_center,_rgba(248,250,252,0.85)_0%,_transparent_70%)]";
  const topFade   = dark ? "from-black" : "from-slate-50";
  const h1        = dark ? "text-white"          : "text-slate-900";
  const sub       = dark ? "text-white/60"       : "text-slate-500";
  const muted     = dark ? "text-white/40"       : "text-slate-400";
  const divider   = dark ? "bg-white/10"         : "bg-slate-200";
  const inputCls  = dark
    ? "border-white/10 text-white placeholder-white/30 focus:border-white/30"
    : "border-slate-300 text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 bg-white shadow-sm";
  const arrowBtn  = dark
    ? "bg-white/10 text-white hover:bg-white/20"
    : "bg-slate-800 text-white hover:bg-slate-700";
  const codeBorder = dark ? "border-white/10" : "border-slate-300 shadow-sm";
  const codeText   = dark ? "text-white"         : "text-slate-900";
  const codeGhost  = dark ? "text-white/20"      : "text-slate-300";
  const codeSep    = dark ? "text-white/20"      : "text-slate-300";
  const resendCls  = dark ? "text-white/50 hover:text-white/70" : "text-slate-400 hover:text-slate-600";
  const backBtn    = dark ? "bg-white text-black hover:bg-white/90" : "bg-slate-900 text-white hover:bg-slate-700";
  const contActive = dark ? "bg-white text-black hover:bg-white/90" : "bg-slate-900 text-white hover:bg-slate-700";
  const contInactive = dark ? "border-white/10 bg-[#111] text-white/30" : "border-slate-300 bg-slate-100 text-slate-400";
  const legalCls  = dark ? "text-white/40" : "text-slate-400";
  const legalLink = dark ? "text-white/40 hover:text-white/60" : "text-slate-400 hover:text-slate-600";
  const successBtn = dark ? "bg-white text-black hover:bg-white/90" : "bg-slate-900 text-white hover:bg-slate-700";

  return (
    <div className={cn("relative flex min-h-screen w-full flex-col transition-colors duration-300", bg, className)}>
      {/* WebGL dot-matrix background */}
      <div className="absolute inset-0 z-0">
        {initialCanvas && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={3} containerClassName={canvasBg}
              colors={dotColors} dotSize={6} reverse={false} showGradient={false} />
          </div>
        )}
        {reverseCanvas && (
          <div className="absolute inset-0">
            <CanvasRevealEffect animationSpeed={4} containerClassName={canvasBg}
              colors={dotColors} dotSize={6} reverse={true} showGradient={false} />
          </div>
        )}
        {/* Radial vignette — clears the centre so text is readable */}
        <div className={cn("absolute inset-0", radial)} />
        {/* Top fade */}
        <div className={cn("absolute left-0 right-0 top-0 h-1/3 bg-gradient-to-b to-transparent", topFade)} />
        {/* Bottom fade — matches bg so dots don't bleed into black */}
        <div className={cn("absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t to-transparent", topFade)} />
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
                    <h1 className={cn("text-[2.5rem] font-bold leading-[1.1] tracking-tight", h1)}>Welcome back</h1>
                    <p className={cn("text-[1.4rem] font-light", sub)}>Sign in to DrizzleBot</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className={cn("h-px flex-1", divider)} />
                      <span className={cn("text-sm", muted)}>enter your email</span>
                      <div className={cn("h-px flex-1", divider)} />
                    </div>

                    <form onSubmit={handleEmailSubmit}>
                      <div className="relative">
                        <input
                          type="email" required placeholder="you@company.com" value={email}
                          onChange={e => { setEmail(e.target.value); setError(""); }}
                          className={cn("w-full rounded-full border py-3 px-4 text-center backdrop-blur-sm outline-none transition-colors", inputCls)}
                        />
                        <button type="submit" disabled={submitting || cooldown > 0}
                          className={cn("absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition-colors disabled:opacity-40 group", arrowBtn)}>
                          {cooldown > 0
                            ? <span className="text-[10px] font-semibold tabular-nums">{cooldown}s</span>
                            : <span className="relative block h-full w-full overflow-hidden">
                                <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-full">→</span>
                                <span className="absolute inset-0 flex -translate-x-full items-center justify-center transition-transform duration-300 group-hover:translate-x-0">→</span>
                              </span>
                          }
                        </button>
                      </div>
                      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                    </form>
                  </div>

                  <p className={cn("pt-10 text-xs", legalCls)}>
                    By signing in you agree to the{" "}
                    <Link href="#" className={cn("underline transition-colors", legalLink)}>Privacy Policy</Link>{" "}and{" "}
                    <Link href="#" className={cn("underline transition-colors", legalLink)}>Terms of Service</Link>.
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
                    <h1 className={cn("text-[2.5rem] font-bold leading-[1.1] tracking-tight", h1)}>Check your email</h1>
                    <p className={cn("text-[1.1rem] font-light", sub)}>
                      Enter the 6-digit code sent to<br />
                      <span className={dark ? "text-white/70" : "text-slate-700"}>{email}</span>
                    </p>
                  </div>

                  <div className="w-full">
                    <div className={cn("relative rounded-full border bg-transparent px-5 py-4", codeBorder)}>
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
                                className={cn("w-8 appearance-none border-none bg-transparent text-center text-xl outline-none focus:ring-0", codeText)}
                                style={{ caretColor: "transparent" }}
                              />
                              {!digit && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                  <span className={cn("text-xl", codeGhost)}>0</span>
                                </div>
                              )}
                            </div>
                            {i < 5 && <span className={cn("text-xl", codeSep)}>|</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <motion.p
                      className={cn(
                        "text-sm transition-colors",
                        cooldown > 0 ? "cursor-not-allowed opacity-40 " + resendCls : "cursor-pointer " + resendCls
                      )}
                      whileHover={cooldown > 0 ? {} : { scale: 1.02 }}
                      transition={{ duration: 0.2 }}
                      onClick={async () => {
                        if (cooldown > 0) return;
                        const { error: err } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
                        if (err) { setError(friendlyError(err.message)); return; }
                        setResendKey(k => k + 1);
                        startCooldown();
                      }}>
                      {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
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
                      className={cn("w-[30%] rounded-full px-8 py-3 font-medium transition-colors", backBtn)}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2 }}>
                      Back
                    </motion.button>
                    <motion.button
                      disabled={!code.every(d => d !== "") || submitting}
                      className={cn(
                        "flex-1 rounded-full py-3 font-medium transition-all duration-300 border",
                        code.every(d => d !== "") && !submitting ? contActive : contInactive
                      )}>
                      {submitting ? "Verifying…" : "Continue"}
                    </motion.button>
                  </div>

                  <p className={cn("pt-10 text-xs", legalCls)}>
                    By signing in you agree to the{" "}
                    <Link href="#" className={cn("underline transition-colors", legalLink)}>Privacy Policy</Link>{" "}and{" "}
                    <Link href="#" className={cn("underline transition-colors", legalLink)}>Terms of Service</Link>.
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
                    <h1 className={cn("text-[2.5rem] font-bold leading-[1.1] tracking-tight", h1)}>You're in!</h1>
                    <p className={cn("text-[1.25rem] font-light", sub)}>Welcome to DrizzleBot</p>
                  </div>
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }} className="py-10">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </motion.div>
                  <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                    className={cn("w-full rounded-full py-3 font-medium transition-colors", successBtn)}>
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
