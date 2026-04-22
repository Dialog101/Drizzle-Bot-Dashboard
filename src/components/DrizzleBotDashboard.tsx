'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SignInPage } from '@/components/ui/sign-in-flow-1'
import {
  LayoutDashboard, CalendarDays, Calendar, Phone, Users, MessageSquare,
  Settings2, Bell, Search, LogOut, ChevronDown, Moon, Sun, TrendingUp,
  TrendingDown, MoreHorizontal, X, Menu, ChevronRight, Building2, AlertCircle,
  Download, Clock, PhoneMissed, Globe, Save, Play, RefreshCw, CheckCircle2,
  Mail, Link2, ChevronLeft, ArrowDownLeft, ArrowUpRight, Trash2, Pause,
  PhoneCall, Send, RotateCcw,
} from 'lucide-react'

// ─── Supabase ─────────────────────────────────────────────────────────────────

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://omrcddyrpbjsnvqwpsjq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_3zfHtNM_g3sIym0Gzgyj9A_MLfdTkaa',
)

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = 'overview' | 'appointments' | 'calendar' | 'calls' | 'contacts' | 'messages' | 'controls'
type Role = 'admin' | 'client'

interface AppUser { id: string; email: string; role: Role; client_id: string | null; name: string }
interface NavEntry { id: Page; label: string; Icon: React.ElementType; adminOnly?: boolean }
interface Client { id: string; name: string }

interface Appointment {
  id: string; email: string; contact_phone: string; appointment_type: string
  date: string; status: 'confirmed' | 'pending' | 'cancelled'; client_id: string
}
interface Call {
  id: string; date: string; caller_number: string; summary: string
  outcome: 'completed' | 'missed' | 'voicemail'; duration_seconds: number; client_id: string
}
interface Contact {
  id: string; name: string; email: string; phone_number: string
  phone?: string; status: string; client_id: string
}
interface Message {
  id: string; created_at: string; channel: string; direction: 'inbound' | 'outbound'
  sender_phone: string; sender_name?: string; body: string; client_id: string
}
interface OverviewStats { todayAppointments: number; totalCalls: number; totalContacts: number; totalMessages: number }
interface Notification { id: string; type: 'call' | 'appointment' | 'message'; text: string; time: string; read: boolean }
interface ToastItem { id: string; msg: string; type: 'success' | 'error' | 'info' }

type PageProps = { user: AppUser; activeClientId: string | null }

// ─── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavEntry[] = [
  { id: 'overview',     label: 'Overview',     Icon: LayoutDashboard },
  { id: 'appointments', label: 'Appointments', Icon: CalendarDays },
  { id: 'calendar',     label: 'Calendar',     Icon: Calendar },
  { id: 'calls',        label: 'Call Logs',    Icon: Phone },
  { id: 'contacts',     label: 'Contacts',     Icon: Users },
  { id: 'messages',     label: 'Messages',     Icon: MessageSquare },
  { id: 'controls',     label: 'Controls',     Icon: Settings2, adminOnly: true },
]

const WEBHOOK_KEYS: Record<string, string> = {
  pause:    'wh-pause',
  resume:   'wh-resume',
  testCall: 'wh-test-call',
  followup: 'wh-followup',
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...c: (string | undefined | false | null)[]) { return c.filter(Boolean).join(' ') }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatDuration(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}
function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: filename })
  a.click()
}

// ─── Toast System ─────────────────────────────────────────────────────────────

let _setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>> | null = null

function showToast(msg: string, type: ToastItem['type'] = 'info') {
  if (!_setToasts) return
  const id = Math.random().toString(36).slice(2)
  _setToasts(ts => [...ts, { id, msg, type }])
  setTimeout(() => _setToasts?.(ts => ts.filter(t => t.id !== id)), 3500)
}

function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  useEffect(() => { _setToasts = setToasts; return () => { _setToasts = null } }, [])
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-xl pointer-events-auto',
          t.type === 'success' && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
          t.type === 'error'   && 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20',
          t.type === 'info'    && 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20',
        )}>
          {t.type === 'success' && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
          {t.type === 'error'   && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {t.type === 'info'    && <Bell className="h-4 w-4 flex-shrink-0" />}
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ target, onClose, onConfirm, busy }: {
  target: { id: string; label: string } | null
  onClose: () => void; onConfirm: () => void; busy: boolean
}) {
  if (!target) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/[0.1] dark:bg-[#111827]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/10">
          <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Delete appointment?</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          <strong className="text-slate-700 dark:text-slate-300">{target.label}</strong> will be soft-deleted and hidden from all views. It can be restored later.
        </p>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.05]">Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-500 disabled:opacity-50">
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function MechawareLogo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex flex-shrink-0 items-center justify-center rounded-xl font-bold text-white" style={{
      width: size, height: size,
      background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 55%, #4f46e5 100%)',
      fontSize: Math.round(size * 0.46), fontFamily: "'Space Grotesk',sans-serif",
      letterSpacing: '-0.04em', boxShadow: '0 0 20px rgba(124,58,237,0.4)',
    }}>M</div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    pending:   'bg-amber-500/10   text-amber-600   dark:text-amber-400   ring-amber-500/20',
    cancelled: 'bg-red-500/10     text-red-600     dark:text-red-400     ring-red-500/20',
    active:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    inactive:  'bg-slate-500/10   text-slate-600   dark:text-slate-400   ring-slate-500/20',
    lead:      'bg-blue-500/10    text-blue-600    dark:text-blue-400    ring-blue-500/20',
  }
  const dot: Record<string, string> = {
    confirmed: 'bg-emerald-500', pending: 'bg-amber-500', cancelled: 'bg-red-500',
    active: 'bg-emerald-500', inactive: 'bg-slate-400', lead: 'bg-blue-500',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', map[status] ?? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-slate-500/20')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[status] ?? 'bg-slate-400')} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    completed: { cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20', icon: <CheckCircle2 className="h-3 w-3" /> },
    missed:    { cls: 'bg-red-500/10     text-red-600     dark:text-red-400     ring-red-500/20',     icon: <PhoneMissed  className="h-3 w-3" /> },
    voicemail: { cls: 'bg-amber-500/10   text-amber-600   dark:text-amber-400   ring-amber-500/20',   icon: <Mail         className="h-3 w-3" /> },
  }
  const { cls, icon } = map[outcome] ?? map.missed
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', cls)}>
      {icon}{outcome.charAt(0).toUpperCase() + outcome.slice(1)}
    </span>
  )
}

function DirectionBadge({ direction }: { direction: string }) {
  const isIn = direction === 'inbound'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
      isIn ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20'
           : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20')}>
      {isIn ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
      {isIn ? 'Inbound' : 'Outbound'}
    </span>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    sms:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    email: 'bg-blue-500/10   text-blue-600    dark:text-blue-400',
    voice: 'bg-purple-500/10 text-purple-600  dark:text-purple-400',
    chat:  'bg-amber-500/10  text-amber-600   dark:text-amber-400',
  }
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', map[channel.toLowerCase()] ?? 'bg-slate-500/10 text-slate-600 dark:text-slate-400')}>{channel.toUpperCase()}</span>
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead><tr className="border-b border-slate-200 dark:border-white/[0.05]">
      {cols.map(h => <th key={h} className="px-6 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{h}</th>)}
    </tr></thead>
  )
}

function TableSkeleton({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="space-y-2.5 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-white/[0.04]" style={{ flex: j === 0 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ icon: Icon, label, sub }: { icon: React.ElementType; label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <Icon className="h-6 w-6 text-slate-400 dark:text-slate-600" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.03] dark:backdrop-blur-sm', className)}>
      {children}
    </div>
  )
}

function StatCard({ label, value, icon, accent, trend, loading }: {
  label: string; value: number | string; icon: React.ReactNode
  accent: string; trend?: { value: number; up: boolean }; loading?: boolean
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/[0.14] dark:hover:shadow-black/30">
      <div className={cn('pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20', accent)} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</p>
          {loading
            ? <div className="mt-2.5 h-8 w-20 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
            : <p className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{value}</p>}
          {trend && !loading && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', trend.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {trend.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {Math.abs(trend.value)}% vs last week
            </div>
          )}
        </div>
        <div className={cn('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl', accent)}>{icon}</div>
      </div>
    </div>
  )
}

function ToolbarSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-colors hover:border-slate-300 dark:border-white/[0.08] dark:bg-slate-900 dark:text-slate-300 dark:hover:border-white/[0.14]">
      {children}
    </select>
  )
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="ml-auto flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white">
      <Download className="h-3.5 w-3.5" />Export CSV
    </button>
  )
}

// ─── Notifications Panel ──────────────────────────────────────────────────────

function NotificationsPanel({ notifications, onClose, onMarkRead }: {
  notifications: Notification[]; onClose: () => void; onMarkRead: (id: string) => void
}) {
  const typeIcon = { call: <Phone className="h-3.5 w-3.5" />, appointment: <CalendarDays className="h-3.5 w-3.5" />, message: <MessageSquare className="h-3.5 w-3.5" /> }
  const typeColor = { call: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', appointment: 'bg-violet-500/20 text-violet-600 dark:text-violet-400', message: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' }
  const unread = notifications.filter(n => !n.read).length
  return (
    <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-slate-950/95 dark:shadow-black/50 dark:backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Notifications</span>
          {unread > 0 && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[340px] overflow-y-auto py-1">
        {notifications.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-400">No notifications</p> :
          notifications.map(n => (
            <button key={n.id} onClick={() => onMarkRead(n.id)}
              className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]', !n.read && 'bg-violet-50/50 dark:bg-white/[0.02]')}>
              <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', typeColor[n.type])}>{typeIcon[n.type]}</div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm leading-snug', n.read ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200')}>{n.text}</p>
                <p className="mt-0.5 text-xs text-slate-400">{n.time}</p>
              </div>
              {!n.read && <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-500" />}
            </button>
          ))}
      </div>
    </div>
  )
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({ clientId: _clientId }: { clientId: string | null; isAdmin: boolean }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<{ category: string; items: { id: string; label: string; sub: string }[] }[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    const t = setTimeout(async () => {
      setBusy(true); setOpen(true)
      const [appts, contacts] = await Promise.all([
        sb.from('appointments').select('id,email,appointment_type,date').ilike('email', `%${query}%`).limit(5),
        sb.from('contacts').select('id,name,phone_number,email').ilike('name', `%${query}%`).limit(5),
      ])
      const built = []
      if (appts.data?.length) built.push({ category: 'Appointments', items: appts.data.map(a => ({ id: a.id, label: a.email, sub: `${a.appointment_type} · ${formatDate(a.date)}` })) })
      if (contacts.data?.length) built.push({ category: 'Contacts', items: contacts.data.map(c => ({ id: c.id, label: c.name, sub: c.email ?? c.phone_number ?? '' })) })
      setResults(built); setBusy(false)
    }, 260)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition-colors focus-within:border-violet-400 focus-within:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:focus-within:border-violet-500/40 dark:focus-within:bg-white/[0.07]">
        <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <input type="text" placeholder="Search appointments, contacts…" value={query} onChange={e => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-slate-500" />
        {query && <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
      </div>
      {open && (
        <div className="absolute top-full mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 dark:border-white/10 dark:bg-slate-950/95 dark:shadow-black/40 dark:backdrop-blur-xl">
          {busy ? <p className="px-4 py-6 text-center text-sm text-slate-400">Searching…</p> :
           results.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">No results for "{query}"</p> : (
            <div className="py-2">
              {results.map(g => (
                <div key={g.category}>
                  <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{g.category}</p>
                  {g.items.map(item => (
                    <button key={item.id} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]">
                      <div>
                        <p className="text-sm text-slate-900 dark:text-white">{item.label}</p>
                        <p className="text-xs text-slate-400">{item.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ user, clients, activePage, activeClientId, onNavigate, onClientChange, onSignOut, onToggleDark, dark, collapsed, onToggleCollapse }: {
  user: AppUser; clients: Client[]; activePage: Page; activeClientId: string | null
  onNavigate: (p: Page) => void; onClientChange: (id: string) => void; onSignOut: () => void
  onToggleDark: () => void; dark: boolean; collapsed: boolean; onToggleCollapse: () => void
}) {
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const activeClient = clients.find(c => c.id === activeClientId)
  const visibleNav = NAV_ITEMS.filter(n => !n.adminOnly || user.role === 'admin')

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 flex h-full flex-col border-r transition-[width] duration-300',
      'border-slate-200 bg-white dark:border-white/[0.07] dark:bg-[#080b12]',
      collapsed ? 'w-[64px]' : 'w-64',
    )}>
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b border-slate-200 px-4 dark:border-white/[0.07]', collapsed ? 'justify-center px-0' : 'gap-3')}>
        <MechawareLogo size={36} />
        {!collapsed && <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>DrizzleBot</p>
            <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">AI Receptionist Portal</p>
          </div>
          <button onClick={onToggleCollapse} className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><Menu className="h-4 w-4" /></button>
        </>}
      </div>
      {collapsed && <button onClick={onToggleCollapse} className="mx-auto mt-2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><ChevronRight className="h-4 w-4" /></button>}

      {/* Admin client switcher */}
      {user.role === 'admin' && !collapsed && (
        <div className="px-3 pt-3">
          <button onClick={() => setClientDropOpen(v => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]">
            <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{activeClient?.name ?? 'Select client'}</span>
            <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200', clientDropOpen && 'rotate-180')} />
          </button>
          {clientDropOpen && (
            <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-slate-900 dark:shadow-black/40">
              {clients.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">No clients found</p> :
                clients.map(c => (
                  <button key={c.id} onClick={() => { onClientChange(c.id); setClientDropOpen(false) }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                      c.id === activeClientId ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-slate-300')}>
                    {c.id === activeClientId && <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />}{c.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-1.5' : 'px-3')}>
        <div className="space-y-0.5">
          {visibleNav.map(item => {
            const active = activePage === item.id
            return (
              <button key={item.id} onClick={() => onNavigate(item.id)} title={collapsed ? item.label : undefined}
                className={cn('group flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150',
                  collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5',
                  active
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200')}>
                <item.Icon className={cn('flex-shrink-0', collapsed ? 'h-5 w-5' : 'h-[18px] w-[18px]')} />
                {!collapsed && <>
                  <span>{item.label}</span>
                  {item.adminOnly && <span className="ml-auto rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-violet-600 dark:text-violet-400">ADMIN</span>}
                </>}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className={cn('space-y-0.5 border-t border-slate-200 py-3 dark:border-white/[0.07]', collapsed ? 'px-1.5' : 'px-3')}>
        <button onClick={onToggleDark} title={dark ? 'Light mode' : 'Dark mode'}
          className={cn('flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white',
            collapsed ? 'justify-center px-0' : 'px-3')}>
          {dark ? <Sun className="h-[18px] w-[18px] flex-shrink-0" /> : <Moon className="h-[18px] w-[18px] flex-shrink-0" />}
          {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
        </button>
        <button onClick={onSignOut}
          className={cn('flex w-full items-center gap-3 rounded-xl py-2.5 text-sm text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400',
            collapsed ? 'justify-center px-0' : 'px-3')}>
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
        <div className={cn('mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]', collapsed ? 'justify-center px-0' : 'px-3')}>
          <div className="relative flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-sm font-bold text-white">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-[#080b12]" />
          </div>
          {!collapsed && <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user.name || 'User'}</p>
            <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{user.email}</p>
          </div>}
        </div>
      </div>
    </aside>
  )
}

// ─── Overview Page ────────────────────────────────────────────────────────────

function OverviewPage({ user, activeClientId }: PageProps) {
  const [stats, setStats] = useState<OverviewStats>({ todayAppointments: 0, totalCalls: 0, totalContacts: 0, totalMessages: 0 })
  const [statsLoading, setStatsLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [apptLoading, setApptLoading] = useState(true)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  const loadData = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10)
    setStatsLoading(true)
    Promise.all([
      addFilter(sb.from('appointments').select('id', { count: 'exact', head: true }).gte('date', `${today}T00:00:00`).lte('date', `${today}T23:59:59`).is('deleted_at', null)),
      addFilter(sb.from('calls').select('id', { count: 'exact', head: true })),
      addFilter(sb.from('contacts').select('id', { count: 'exact', head: true })),
      addFilter(sb.from('messages').select('id', { count: 'exact', head: true })),
    ]).then(([a, c, co, m]) => {
      setStats({ todayAppointments: a.count ?? 0, totalCalls: c.count ?? 0, totalContacts: co.count ?? 0, totalMessages: m.count ?? 0 })
      setStatsLoading(false)
    })
    setApptLoading(true)
    addFilter(sb.from('appointments').select('*').is('deleted_at', null).order('date', { ascending: false }).limit(8))
      .then(({ data }: any) => { setAppointments((data as Appointment[]) ?? []); setApptLoading(false) })
  }, [addFilter])

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 60000)
    return () => clearInterval(timer)
  }, [loadData])

  const cards = [
    { label: "Today's Appointments", value: stats.todayAppointments, accent: 'bg-violet-600', icon: <CalendarDays className="h-5 w-5 text-white" />, trend: { value: 12, up: true } },
    { label: 'Total Calls',          value: stats.totalCalls,        accent: 'bg-blue-600',   icon: <Phone         className="h-5 w-5 text-white" />, trend: { value: 8,  up: true } },
    { label: 'Contacts',             value: stats.totalContacts,     accent: 'bg-emerald-600',icon: <Users         className="h-5 w-5 text-white" />, trend: { value: 3,  up: true } },
    { label: 'Messages',             value: stats.totalMessages,     accent: 'bg-amber-600',  icon: <MessageSquare className="h-5 w-5 text-white" />, trend: { value: 5,  up: false } },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Overview</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(c => <StatCard key={c.label} {...c} loading={statsLoading} />)}
      </div>
      <GlassCard>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Recent Appointments</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">Latest AI-booked sessions</p>
          </div>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white">View all</button>
        </div>
        {apptLoading ? <TableSkeleton cols={5} rows={5} /> :
         appointments.length === 0 ? <EmptyState icon={CalendarDays} label="No appointments yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Contact', 'Type', 'Phone', 'Date & Time', 'Status', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {appointments.map(r => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.appointment_type}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.contact_phone}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4"><button className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── Appointments Page ────────────────────────────────────────────────────────

function AppointmentsPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [deletedRows, setDeletedRows] = useState<Appointment[]>([])
  const [deletedLoading, setDeletedLoading] = useState(false)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    setLoading(true)
    let q = addFilter(sb.from('appointments').select('*').is('deleted_at', null).order('date', { ascending: false }).limit(100))
    if (status !== 'all') q = q.eq('status', status)
    if (dateFrom) q = q.gte('date', `${dateFrom}T00:00:00`)
    if (dateTo)   q = q.lte('date', `${dateTo}T23:59:59`)
    q.then(({ data }: any) => { setRows((data as Appointment[]) ?? []); setLoading(false) })
  }, [addFilter, status, dateFrom, dateTo])

  async function loadDeleted() {
    setDeletedLoading(true)
    const q = addFilter(sb.from('appointments').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(30))
    const { data } = await q
    setDeletedRows((data as Appointment[]) ?? [])
    setDeletedLoading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const { error } = await sb.from('appointments').update({ deleted_at: new Date().toISOString() }).eq('id', deleteTarget.id)
    if (error) { showToast('Delete failed: ' + error.message, 'error') }
    else {
      setRows(r => r.filter(x => x.id !== deleteTarget.id))
      showToast('Appointment deleted', 'success')
      if (showDeleted) loadDeleted()
    }
    setDeleteBusy(false)
    setDeleteTarget(null)
  }

  async function restoreAppointment(id: string) {
    const { error } = await sb.from('appointments').update({ deleted_at: null }).eq('id', id)
    if (error) { showToast('Restore failed: ' + error.message, 'error'); return }
    showToast('Appointment restored', 'success')
    setDeletedRows(r => r.filter(x => x.id !== id))
  }

  function toggleDeleted() {
    const next = !showDeleted
    setShowDeleted(next)
    if (next) loadDeleted()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Appointments" subtitle="AI-booked sessions managed by DrizzleBot" />
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
            <span className="text-slate-300 dark:text-slate-600">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
          </div>
          <ToolbarSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </ToolbarSelect>
          {(status !== 'all' || dateFrom || dateTo) && (
            <button onClick={() => { setStatus('all'); setDateFrom(''); setDateTo('') }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white">Clear</button>
          )}
          <ExportButton onClick={() => exportCSV('appointments.csv', ['Email','Type','Phone','Date','Status'], rows.map(r => [r.email, r.appointment_type, r.contact_phone, r.date, r.status]))} />
        </div>
        {loading ? <TableSkeleton cols={6} /> :
         rows.length === 0 ? <EmptyState icon={CalendarDays} label="No appointments found" sub="Try adjusting your filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Contact', 'Type', 'Phone', 'Date & Time', 'Status', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.appointment_type}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.contact_phone}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4">
                      <button onClick={() => setDeleteTarget({ id: r.id, label: `${r.appointment_type} for ${r.email || r.contact_phone}` })}
                        className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Recently Deleted */}
      <GlassCard>
        <button onClick={toggleDeleted} className="flex w-full items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Recently Deleted</span>
            {deletedRows.length > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-white/[0.08] dark:text-slate-400">{deletedRows.length}</span>}
          </div>
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform duration-200', showDeleted && 'rotate-180')} />
        </button>
        {showDeleted && (
          deletedLoading ? <TableSkeleton cols={5} rows={3} /> :
          deletedRows.length === 0 ? <EmptyState icon={Trash2} label="No deleted appointments" /> : (
            <div className="overflow-x-auto border-t border-slate-100 dark:border-white/[0.05]">
              <table className="w-full">
                <TableHead cols={['Contact', 'Type', 'Date', 'Status', '']} />
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {deletedRows.map(r => (
                    <tr key={r.id} className="opacity-60 transition-opacity hover:opacity-100">
                      <td className="px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{r.email}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.appointment_type}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                      <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                      <td className="px-6 py-4">
                        <button onClick={() => restoreAppointment(r.id)}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">
                          <RotateCcw className="h-3 w-3" />Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </GlassCard>

      <DeleteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} busy={deleteBusy} />
    </div>
  )
}

// ─── Call Logs Page ───────────────────────────────────────────────────────────

function CallLogsPage({ user, activeClientId }: PageProps) {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [outcome, setOutcome] = useState('all')

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    setLoading(true)
    let q = addFilter(sb.from('calls').select('*').order('date', { ascending: false }).limit(100))
    if (outcome !== 'all') q = q.eq('outcome', outcome)
    q.then(({ data }: any) => { setCalls((data as Call[]) ?? []); setLoading(false) })
  }, [addFilter, outcome])

  const toggle = (id: string) => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  return (
    <div className="space-y-6">
      <PageHeader title="Call Logs" subtitle="AI end-of-call reports and full summaries" />
      <GlassCard>
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <ToolbarSelect value={outcome} onChange={setOutcome}>
            <option value="all">All outcomes</option>
            <option value="completed">Completed</option>
            <option value="missed">Missed</option>
            <option value="voicemail">Voicemail</option>
          </ToolbarSelect>
          <ExportButton onClick={() => exportCSV('calls.csv', ['Date','Caller','Duration','Outcome','Summary'], calls.map(c => [c.date, c.caller_number, formatDuration(c.duration_seconds), c.outcome, c.summary]))} />
        </div>
        {loading ? <TableSkeleton cols={4} /> :
         calls.length === 0 ? <EmptyState icon={Phone} label="No call logs found" /> : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {calls.map(call => {
              const isOpen = expanded.has(call.id)
              const iconBg = call.outcome === 'completed' ? 'bg-emerald-500/10' : call.outcome === 'missed' ? 'bg-red-500/10' : 'bg-amber-500/10'
              const outcomeIcon = call.outcome === 'completed' ? <Phone className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> :
                                  call.outcome === 'missed'    ? <PhoneMissed className="h-4 w-4 text-red-500 dark:text-red-400" /> :
                                                                 <Mail className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              return (
                <div key={call.id}>
                  <button onClick={() => toggle(call.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl', iconBg)}>{outcomeIcon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{call.caller_number}</p>
                        <OutcomeBadge outcome={call.outcome} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{call.summary?.slice(0, 90)}{call.summary?.length > 90 ? '…' : ''}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-5 text-xs text-slate-400">
                      <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{formatDuration(call.duration_seconds)}</span>
                      <span>{formatDate(call.date)}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')} />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-5 dark:border-white/[0.05] dark:bg-white/[0.015]">
                      <div className="mx-auto max-w-3xl">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/20">
                            <Phone className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                          </div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">AI Call Summary</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{call.summary || 'No summary available for this call.'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── Calendar Page ────────────────────────────────────────────────────────────

function CalendarPage({ user, activeClientId }: PageProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [current, setCurrent] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    const start = new Date(current.getFullYear(), current.getMonth(), 1)
    const end   = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59)
    setLoading(true)
    addFilter(sb.from('appointments').select('*').gte('date', start.toISOString()).lte('date', end.toISOString()).is('deleted_at', null))
      .then(({ data }: any) => { setAppointments((data as Appointment[]) ?? []); setLoading(false) })
  }, [addFilter, current])

  const byDate = useMemo(() => {
    const m: Record<string, Appointment[]> = {}
    appointments.forEach(a => { const d = a.date.slice(0, 10); if (!m[d]) m[d] = []; m[d].push(a) })
    return m
  }, [appointments])

  const grid = useMemo(() => {
    const y = current.getFullYear(), mo = current.getMonth()
    const firstDay = new Date(y, mo, 1).getDay()
    const daysInMonth = new Date(y, mo + 1, 0).getDate()
    const daysInPrev  = new Date(y, mo, 0).getDate()
    const cells: { date: Date; current: boolean }[] = []
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ date: new Date(y, mo - 1, daysInPrev - i), current: false })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(y, mo, d), current: true })
    while (cells.length < 42) cells.push({ date: new Date(y, mo + 1, cells.length - daysInMonth - firstDay + 1), current: false })
    return cells
  }, [current])

  const weekDays = useMemo(() => {
    const d = new Date(current); d.setDate(d.getDate() - d.getDay())
    return Array.from({ length: 7 }, (_, i) => { const day = new Date(d); day.setDate(d.getDate() + i); return day })
  }, [current])

  const todayStr = new Date().toISOString().slice(0, 10)
  const HOURS = Array.from({ length: 13 }, (_, i) => i + 7)

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar" subtitle="Appointments and scheduled events" />
      <GlassCard>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.08] dark:hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <h2 className="min-w-[160px] text-center text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
              {MONTHS[current.getMonth()]} {current.getFullYear()}
            </h2>
            <button onClick={() => setCurrent(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.08] dark:hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => setCurrent(new Date())}
              className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white">Today</button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            {(['month', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                  view === v ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-sm'
                             : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' && <>
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/[0.07]">
            {DAYS.map(d => <div key={d} className="py-3 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-400">{d}</div>)}
          </div>
          {loading ? (
            <div className="grid grid-cols-7 gap-px p-1">
              {Array.from({ length: 35 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.03]" />)}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {grid.map((cell, i) => {
                const ds = cell.date.toISOString().slice(0, 10)
                const cellAppts = byDate[ds] ?? []
                const isToday = ds === todayStr
                return (
                  <div key={i} className={cn('min-h-[110px] border-b border-r border-slate-100 p-2 transition-colors hover:bg-slate-50 dark:border-white/[0.04] dark:hover:bg-white/[0.02]',
                    !cell.current && 'opacity-30', isToday && 'bg-violet-50 dark:bg-violet-500/[0.07]',
                    i % 7 === 6 && 'border-r-0')}>
                    <div className={cn('mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      isToday ? 'bg-violet-600 text-white font-bold' : 'text-slate-500 dark:text-slate-400')}>
                      {cell.date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {cellAppts.slice(0, 3).map(a => (
                        <div key={a.id} title={`${a.email} — ${a.appointment_type}`}
                          className={cn('truncate rounded-md px-1.5 py-0.5 text-[10px] leading-4',
                            a.status === 'confirmed' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' :
                            a.status === 'pending'   ? 'bg-amber-100  text-amber-700  dark:bg-amber-500/20  dark:text-amber-300' :
                                                       'bg-slate-100  text-slate-500  dark:bg-slate-500/20  dark:text-slate-400')}>
                          {new Date(a.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} {a.appointment_type}
                        </div>
                      ))}
                      {cellAppts.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{cellAppts.length - 3} more</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>}

        {view === 'week' && (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-8 border-b border-slate-200 dark:border-white/[0.07]">
                <div className="py-3 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-slate-400">Time</div>
                {weekDays.map(d => {
                  const ds = d.toISOString().slice(0, 10)
                  return (
                    <div key={ds} className={cn('py-3 text-center', ds === todayStr && 'bg-violet-50 dark:bg-violet-500/[0.06]')}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{DAYS[d.getDay()]}</p>
                      <p className={cn('mt-0.5 text-lg font-bold', ds === todayStr ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-slate-300')} style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{d.getDate()}</p>
                    </div>
                  )
                })}
              </div>
              {HOURS.map(hour => (
                <div key={hour} className="grid grid-cols-8 border-b border-slate-100 dark:border-white/[0.04]">
                  <div className="py-3 pr-4 text-right text-xs text-slate-400">{hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}</div>
                  {weekDays.map(d => {
                    const ds = d.toISOString().slice(0, 10)
                    const slotAppts = (byDate[ds] ?? []).filter(a => new Date(a.date).getHours() === hour)
                    return (
                      <div key={ds} className={cn('min-h-[52px] border-l border-slate-100 p-1 dark:border-white/[0.04]', ds === todayStr && 'bg-violet-50/50 dark:bg-violet-500/[0.03]')}>
                        {slotAppts.map(a => (
                          <div key={a.id} title={a.email}
                            className="mb-0.5 rounded-md bg-violet-100 px-1.5 py-1 text-[10px] text-violet-700 transition-colors dark:bg-violet-500/20 dark:text-violet-300">
                            <p className="truncate font-medium">{a.appointment_type}</p>
                            <p className="truncate opacity-70">{a.email}</p>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── Contacts Page ────────────────────────────────────────────────────────────

function ContactsPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      let q = addFilter(sb.from('contacts').select('*').order('name').limit(100))
      if (status !== 'all') q = q.eq('status', status)
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`)
      q.then(({ data }: any) => { setRows((data as Contact[]) ?? []); setLoading(false) })
    }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [addFilter, status, search])

  return (
    <div className="space-y-6">
      <PageHeader title="Contacts" subtitle="CRM — contacts captured by the AI receptionist" />
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input type="text" placeholder="Search name, email, phone…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-44 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
            {search && <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <ToolbarSelect value={status} onChange={setStatus}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="lead">Lead</option>
          </ToolbarSelect>
          <ExportButton onClick={() => exportCSV('contacts.csv', ['Name','Email','Phone','Status'], rows.map(r => [r.name, r.email, r.phone_number ?? r.phone ?? '', r.status]))} />
        </div>
        {loading ? <TableSkeleton cols={4} /> :
         rows.length === 0 ? <EmptyState icon={Users} label="No contacts found" sub="Try adjusting your search or filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Name', 'Email', 'Phone', 'Status', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                          {r.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{r.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.email ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.phone_number ?? r.phone ?? '—'}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status ?? 'active'} /></td>
                    <td className="px-6 py-4"><button className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── Messages Page ────────────────────────────────────────────────────────────

function MessagesPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [dir, setDir] = useState('all')
  const [chan, setChan] = useState('all')

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    setLoading(true)
    let q = addFilter(sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100))
    if (dir  !== 'all') q = q.eq('direction', dir)
    if (chan !== 'all') q = q.eq('channel', chan)
    q.then(({ data }: any) => { setRows((data as Message[]) ?? []); setLoading(false) })
  }, [addFilter, dir, chan])

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" subtitle="All AI-managed communications" />
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <ToolbarSelect value={dir} onChange={setDir}>
            <option value="all">All directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </ToolbarSelect>
          <ToolbarSelect value={chan} onChange={setChan}>
            <option value="all">All channels</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="voice">Voice</option>
          </ToolbarSelect>
          <ExportButton onClick={() => exportCSV('messages.csv', ['Date','Channel','Direction','Sender','Body'], rows.map(r => [r.created_at, r.channel, r.direction, r.sender_phone ?? r.sender_name ?? '', r.body]))} />
        </div>
        {loading ? <TableSkeleton cols={5} /> :
         rows.length === 0 ? <EmptyState icon={MessageSquare} label="No messages found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['From', 'Channel', 'Direction', 'Message', 'Date', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.sender_phone ?? r.sender_name ?? '—'}</td>
                    <td className="px-6 py-4"><ChannelBadge channel={r.channel} /></td>
                    <td className="px-6 py-4"><DirectionBadge direction={r.direction} /></td>
                    <td className="max-w-xs px-6 py-4"><p className="truncate text-sm text-slate-500 dark:text-slate-400">{r.body}</p></td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-6 py-4"><button className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ─── Controls Page ────────────────────────────────────────────────────────────

interface CalClient { id: string; name: string; calendar_webhook_url: string | null }
type LogEntry = { time: string; msg: string; ok: boolean }

function ControlsPage({ user, activeClientId }: PageProps) {
  const [paused, setPaused]       = useState(false)
  const [actionLog, setActionLog] = useState<LogEntry[]>([])
  const [testPhone, setTestPhone] = useState('')
  const [fuPhone, setFuPhone]     = useState('')
  const [fuChannel, setFuChannel] = useState('sms')
  const [busy, setBusy]           = useState<Record<string, boolean>>({})
  const [calClients, setCalClients] = useState<CalClient[]>([])
  const [calUrls, setCalUrls]     = useState<Record<string, string>>({})
  const [wh, setWh]               = useState<Record<string, string>>(() =>
    typeof window === 'undefined' ? {} :
    Object.fromEntries(Object.entries(WEBHOOK_KEYS).map(([k, v]) => [k, localStorage.getItem(v) ?? '']))
  )
  const [whSaved, setWhSaved]     = useState(false)

  const effectiveClient = activeClientId ?? user.client_id

  useEffect(() => {
    if (user.role !== 'admin') return
    sb.from('clients').select('id,name,calendar_webhook_url').order('id')
      .then(({ data }) => {
        const rows = (data as CalClient[]) ?? []
        setCalClients(rows)
        setCalUrls(Object.fromEntries(rows.map(r => [r.id, r.calendar_webhook_url ?? ''])))
      })
  }, [user.role])

  function addLog(msg: string, ok: boolean) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setActionLog(l => [{ time, msg, ok }, ...l].slice(0, 20))
  }

  async function fireWebhook(action: keyof typeof WEBHOOK_KEYS, payload: Record<string, unknown>) {
    const url = localStorage.getItem(WEBHOOK_KEYS[action]) ?? ''
    if (!url) { addLog(`No URL set for "${action}" — add it in Webhook URLs below.`, false); return false }
    setBusy(b => ({ ...b, [action]: true }))
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, triggered_by: user.email, client_id: effectiveClient, timestamp: new Date().toISOString(), ...payload }) })
      const ok = res.ok
      addLog(ok ? `✓ ${action} triggered successfully` : `HTTP ${res.status} — check webhook URL`, ok)
      showToast(ok ? `${action} triggered` : `Webhook error ${res.status}`, ok ? 'success' : 'error')
      return ok
    } catch (e: any) {
      addLog(`Failed: ${e.message}`, false)
      showToast('Could not reach webhook', 'error')
      return false
    } finally { setBusy(b => ({ ...b, [action]: false })) }
  }

  async function handlePause() {
    const ok = await fireWebhook('pause', {})
    if (ok) setPaused(true)
  }
  async function handleResume() {
    const ok = await fireWebhook('resume', {})
    if (ok) setPaused(false)
  }
  async function handleTestCall() {
    if (!testPhone.trim()) { addLog('Enter a phone number first.', false); return }
    await fireWebhook('testCall', { phone: testPhone.trim() })
  }
  async function handleFollowup() {
    if (!fuPhone.trim()) { addLog('Enter a phone number first.', false); return }
    await fireWebhook('followup', { phone: fuPhone.trim(), channel: fuChannel })
  }

  function saveWebhooks() {
    Object.entries(WEBHOOK_KEYS).forEach(([k, v]) => localStorage.setItem(v, wh[k] ?? ''))
    setWhSaved(true); setTimeout(() => setWhSaved(false), 2000)
    showToast('Webhook URLs saved', 'success')
  }

  async function saveCalUrl(clientId: string) {
    const { error } = await sb.from('clients').update({ calendar_webhook_url: calUrls[clientId] || null }).eq('id', clientId)
    if (error) { showToast('Save failed: ' + error.message, 'error'); return }
    showToast('Calendar URL saved', 'success')
    setCalClients(cs => cs.map(c => c.id === clientId ? { ...c, calendar_webhook_url: calUrls[clientId] || null } : c))
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Controls" subtitle="Manage your AI receptionist"
        action={<div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/5"><Settings2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /><span className="text-xs font-medium text-amber-700 dark:text-amber-400">Admin Access Only</span></div>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Receptionist Status */}
        <GlassCard>
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', paused ? 'bg-amber-500/10' : 'bg-emerald-500/10')}>
                {paused ? <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Receptionist Status</h3>
                <p className="mt-0.5 text-xs text-slate-400">Pause or resume the AI from answering calls</p>
              </div>
            </div>
            <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-3', paused ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/5' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/5')}>
              <div className={cn('h-2.5 w-2.5 rounded-full', paused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse')} />
              <span className={cn('text-sm font-medium', paused ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{paused ? 'Paused — not answering calls' : 'Active — answering calls'}</span>
            </div>
            {paused
              ? <button onClick={handleResume} disabled={busy.resume} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500 disabled:opacity-50">{busy.resume ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Resume receptionist</button>
              : <button onClick={handlePause} disabled={busy.pause} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-500 disabled:opacity-50">{busy.pause ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}Pause receptionist</button>
            }
          </div>
        </GlassCard>

        {/* Test Call */}
        <GlassCard>
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <PhoneCall className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Trigger Test Call</h3>
                <p className="mt-0.5 text-xs text-slate-400">Send a test call to verify the AI is working</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <input type="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+1 555 000 0000"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
            </div>
            <button onClick={handleTestCall} disabled={busy.testCall} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-500 disabled:opacity-50">{busy.testCall ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}Trigger test call</button>
          </div>
        </GlassCard>

        {/* Follow-up */}
        <GlassCard>
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                <Send className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Send Follow-up</h3>
                <p className="mt-0.5 text-xs text-slate-400">Trigger a follow-up message to a contact</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <input type="tel" value={fuPhone} onChange={e => setFuPhone(e.target.value)} placeholder="+1 555 000 0000"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
            </div>
            <ToolbarSelect value={fuChannel} onChange={setFuChannel}>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </ToolbarSelect>
            <button onClick={handleFollowup} disabled={busy.followup} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/20 transition-all hover:bg-violet-500 disabled:opacity-50">{busy.followup ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send follow-up</button>
          </div>
        </GlassCard>

        {/* Action Log */}
        <GlassCard>
          <div className="space-y-3 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Action Log</h3>
            {actionLog.length === 0
              ? <p className="text-xs text-slate-400">No actions yet — use the controls to trigger webhooks.</p>
              : <div className="max-h-52 space-y-1 overflow-y-auto">
                  {actionLog.map((l, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 font-mono text-slate-400">{l.time}</span>
                      <span className={l.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{l.msg}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
        </GlassCard>

        {/* Calendar Webhooks (admin only) */}
        {user.role === 'admin' && (
          <GlassCard className="lg:col-span-2">
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Calendar Webhooks</h3>
                  <p className="mt-0.5 text-xs text-slate-400">Per-client Google Calendar webhook URLs (stored in Supabase)</p>
                </div>
              </div>
              {calClients.length === 0
                ? <p className="text-xs text-slate-400">No clients found in the clients table.</p>
                : calClients.map(c => (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-32 shrink-0">
                        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">{c.name || c.id}</p>
                        <p className={cn('text-xs', c.calendar_webhook_url ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                          {c.calendar_webhook_url ? '● Connected' : '○ No URL'}
                        </p>
                      </div>
                      <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <input type="url" value={calUrls[c.id] ?? ''} onChange={e => setCalUrls(u => ({ ...u, [c.id]: e.target.value }))}
                          placeholder="https://…/webhook/get-calendar-events"
                          className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
                      </div>
                      <button onClick={() => saveCalUrl(c.id)} className="shrink-0 rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-violet-500"><Save className="h-3.5 w-3.5" /></button>
                    </div>
                  ))
              }
            </div>
          </GlassCard>
        )}

        {/* Webhook URLs */}
        <GlassCard className="lg:col-span-2">
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-500/10">
                <Link2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Webhook URLs</h3>
                <p className="mt-0.5 text-xs text-slate-400">Configure endpoints for each control action — stored locally in your browser</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['pause','resume','testCall','followup'] as const).map(k => (
                <div key={k}>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">{k === 'testCall' ? 'Test Call' : k.charAt(0).toUpperCase() + k.slice(1)}</label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input type="url" value={wh[k] ?? ''} onChange={e => setWh(u => ({ ...u, [k]: e.target.value }))}
                      placeholder="https://…"
                      className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={saveWebhooks}
              className={cn('flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
                whSaved ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400' : 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20')}>
              {whSaved ? <><CheckCircle2 className="h-4 w-4" />Saved</> : <><Save className="h-4 w-4" />Save URLs</>}
            </button>
          </div>
        </GlassCard>

      </div>
    </div>
  )
}

// ─── Root Dashboard ───────────────────────────────────────────────────────────

export default function DrizzleBotDashboard() {
  const [user, setUser]                       = useState<AppUser | null>(null)
  const [authLoading, setAuthLoading]         = useState(true)
  const [page, setPage]                       = useState<Page>('overview')
  const [dark, setDark]                       = useState(() =>
    typeof window === 'undefined' ? true : !window.matchMedia('(prefers-color-scheme: light)').matches
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [clients, setClients]                 = useState<Client[]>([])
  const [activeClientId, setActiveClientId]   = useState<string | null>(null)
  const [notifOpen, setNotifOpen]             = useState(false)
  const [notifications, setNotifications]     = useState<Notification[]>([
    { id: '1', type: 'call',        text: 'New call from +1 (555) 012-3456',               time: '2m ago',  read: false },
    { id: '2', type: 'appointment', text: 'Appointment booked: John Smith — Consultation', time: '14m ago', read: false },
    { id: '3', type: 'message',     text: 'New message from Sarah Johnson via SMS',        time: '1h ago',  read: true  },
    { id: '4', type: 'call',        text: 'Missed call from +1 (555) 987-6543 · 3 min',   time: '2h ago',  read: true  },
  ])
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const meta = data.session.user.user_metadata as any
        setUser({ id: data.session.user.id, email: data.session.user.email ?? '', role: meta?.role ?? 'client', client_id: meta?.client_id ?? null, name: meta?.full_name ?? '' })
      }
      setAuthLoading(false)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => { if (!session) setUser(null) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user || user.role !== 'admin') return
    sb.from('clients').select('id,name').then(({ data }) => {
      if (data) { setClients(data as Client[]); if (!activeClientId && data.length > 0) setActiveClientId(data[0].id) }
    })
  }, [user])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => { if (user && user.role !== 'admin' && page === 'controls') setPage('overview') }, [page, user])

  useEffect(() => {
    if (!user) return
    const channel = sb.channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, ({ new: r }: any) => {
        const n: Notification = { id: String(Date.now()), type: 'call', text: `New call from ${r.caller_number || 'Unknown'}`, time: 'just now', read: false }
        setNotifications(ns => [n, ...ns.slice(0, 49)])
        showToast(n.text, 'info')
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, ({ new: r }: any) => {
        const n: Notification = { id: String(Date.now()), type: 'appointment', text: `New appointment: ${r.appointment_type || 'Appointment'} for ${r.email || r.contact_phone || 'Unknown'}`, time: 'just now', read: false }
        setNotifications(ns => [n, ...ns.slice(0, 49)])
        showToast(n.text, 'info')
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, ({ new: r }: any) => {
        const n: Notification = { id: String(Date.now()), type: 'message', text: `New contact registered: ${r.name || r.phone_number || 'Unknown'}`, time: 'just now', read: false }
        setNotifications(ns => [n, ...ns.slice(0, 49)])
        showToast(n.text, 'info')
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [user])

  const handleSignOut = async () => { await sb.auth.signOut(); setUser(null) }
  const unreadCount = notifications.filter(n => !n.read).length
  const shift = sidebarCollapsed ? 'ml-[64px]' : 'ml-64'

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-[#060910]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <SignInPage onLogin={setUser} dark={dark} onToggleDark={() => setDark(d => !d)} />

  return (
    // Apply the `dark` class here — Tailwind v4 picks it up via @variant dark
    <div className={cn('min-h-screen bg-slate-50 dark:bg-[#0a0d14]', dark && 'dark')}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600&display=swap');
        *{font-family:'DM Sans',system-ui,sans-serif}
        h1,h2,h3,h4{font-family:'Space Grotesk',system-ui,sans-serif}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(139,92,246,.25);border-radius:4px}
        ::-webkit-scrollbar-thumb:hover{background:rgba(139,92,246,.4)}
        .dark input[type="date"]::-webkit-calendar-picker-indicator{filter:invert(0.5)}
      `}</style>

      <Sidebar user={user} clients={clients} activePage={page} activeClientId={activeClientId}
        onNavigate={setPage} onClientChange={setActiveClientId} onSignOut={handleSignOut}
        dark={dark} onToggleDark={() => setDark(d => !d)}
        collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />

      <div className={cn('flex min-h-screen flex-col transition-[margin] duration-300', shift)}>
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-4 border-b border-slate-200 bg-white/90 px-6 backdrop-blur-md dark:border-white/[0.07] dark:bg-[#0a0d14]/90">
          <div className="flex-1">
            <GlobalSearch clientId={activeClientId ?? user.client_id} isAdmin={user.role === 'admin'} />
          </div>
          <div ref={notifRef} className="relative">
            <button onClick={() => setNotifOpen(v => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white">
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">{unreadCount}</span>}
            </button>
            {notifOpen && <NotificationsPanel notifications={notifications} onClose={() => setNotifOpen(false)}
              onMarkRead={id => setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))} />}
          </div>
        </header>

        <main className="flex-1 p-6">
          {page === 'overview'     && <OverviewPage     user={user} activeClientId={activeClientId} />}
          {page === 'appointments' && <AppointmentsPage user={user} activeClientId={activeClientId} />}
          {page === 'calendar'     && <CalendarPage     user={user} activeClientId={activeClientId} />}
          {page === 'calls'        && <CallLogsPage     user={user} activeClientId={activeClientId} />}
          {page === 'contacts'     && <ContactsPage     user={user} activeClientId={activeClientId} />}
          {page === 'messages'     && <MessagesPage     user={user} activeClientId={activeClientId} />}
          {page === 'controls' && user.role === 'admin' && <ControlsPage user={user} activeClientId={activeClientId} />}
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
