'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SignInPage } from '@/components/ui/sign-in-flow-1'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  LayoutDashboard, CalendarDays, Calendar, Phone, Users, MessageSquare,
  Settings2, Bell, Search, LogOut, ChevronDown, Moon, Sun, TrendingUp,
  TrendingDown, MoreHorizontal, X, Menu, ChevronRight, Building2, AlertCircle,
  Download, Clock, PhoneMissed, Globe, Save, Play, RefreshCw, CheckCircle2,
  Mail, Link2, ChevronLeft, Trash2, Pause,
  PhoneCall, Send, RotateCcw, UserPlus, Shield,
  BarChart2, ClipboardList, User2, PlayCircle, Rocket,
} from 'lucide-react'

// ─── Supabase ─────────────────────────────────────────────────────────────────

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://omrcddyrpbjsnvqwpsjq.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_3zfHtNM_g3sIym0Gzgyj9A_MLfdTkaa',
)

// ─── Types ────────────────────────────────────────────────────────────────────

type Page = 'overview' | 'appointments' | 'calendar' | 'calls' | 'contacts' | 'messages' | 'controls' | 'users' | 'reports' | 'audit' | 'profile'
type Role = 'admin' | 'client'

interface AppUser { id: string; email: string; role: Role; client_id: string | null; name: string }
interface NavEntry { id: Page; label: string; Icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }
interface Client { id: string; name: string }

interface Appointment {
  id: string; email: string; contact_phone: string; appointment_type: string
  date: string; status: 'confirmed' | 'pending' | 'cancelled'; client_id: string
  notes?: string
}
interface Call {
  id: string; date: string; caller_number: string; summary: string
  outcome: 'completed' | 'missed' | 'voicemail'; duration_seconds: number; client_id: string
  recording_url?: string
}
interface AuditRow {
  id: string; created_at: string; user_email: string; action: string
  entity: string; entity_id?: string; details?: string
}
interface Contact {
  id: string; name: string; email: string; phone_number: string
  phone?: string; status: string; client_id: string
}
interface Message {
  id: string; created_at: string; channel: string; direction: 'inbound' | 'outbound'
  sender_phone: string; sender_name?: string; body: string; client_id: string
}
interface ProfileRow {
  id: string; email: string; name: string | null
  role: 'admin' | 'client'; client_id: string | null
  status: string; created_at: string
  clients?: { name: string } | null
}
interface OverviewStats { todayAppointments: number; totalCalls: number; totalContacts: number; totalMessages: number }
interface Notification { id: string; type: 'call' | 'appointment' | 'message'; text: string; timestamp: string; read: boolean }
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
  { id: 'reports',      label: 'Reports',      Icon: BarChart2 },
  { id: 'profile',      label: 'Profile',      Icon: User2 },
  { id: 'users',        label: 'Users',        Icon: UserPlus,      adminOnly: true },
  { id: 'audit',        label: 'Audit Log',    Icon: ClipboardList, adminOnly: true },
  { id: 'controls',     label: 'Controls',     Icon: Settings2,     adminOnly: true },
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
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)  return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
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

function EmptyState({ icon: Icon, label, sub, action }: { icon: React.ComponentType<{ className?: string }>; label: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <Icon className="h-6 w-6 text-slate-400 dark:text-slate-600" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
        {sub && <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
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

function buildDailyBuckets(dates: string[], days: number): { value: number }[] {
  const now = new Date()
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (days - 1 - i))
    const ds = d.toISOString().slice(0, 10)
    return { value: dates.filter(dt => dt.slice(0, 10) === ds).length }
  })
}

function calcTrend(dates: string[]): { value: number; up: boolean } {
  const now = new Date()
  let last7 = 0, prev7 = 0
  for (const dt of dates) {
    const daysAgo = Math.floor((now.getTime() - new Date(dt.slice(0, 10)).getTime()) / 86400000)
    if (daysAgo < 7) last7++
    else if (daysAgo < 14) prev7++
  }
  if (prev7 === 0) return { value: last7 > 0 ? 100 : 0, up: last7 >= prev7 }
  const pct = Math.round(((last7 - prev7) / prev7) * 100)
  return { value: Math.abs(pct), up: pct >= 0 }
}

function StatCard({ label, value, icon, color, gradientId, sparkData, trend, loading }: {
  label: string; value: number | string; icon: React.ReactNode
  color: string; gradientId: string; sparkData: { value: number }[]
  trend?: { value: number; up: boolean }; loading?: boolean
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:border-white/[0.08] dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/[0.14] dark:hover:shadow-black/30">
      {/* Header: icon + label */}
      <div className="mb-4 flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
      </div>

      {/* Bottom: value left, chart right */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">Last 28 days</p>
          {loading
            ? <div className="h-9 w-16 animate-pulse rounded-lg bg-slate-100 dark:bg-white/10" />
            : <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{value}</p>}
          {trend && !loading && (
            <div className={cn('mt-1.5 flex items-center gap-1 text-xs font-medium', trend.up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
              {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend.value)}% vs last week
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div className="h-16 w-36 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                </linearGradient>
                <filter id={`shadow-${gradientId}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.4)" />
                </filter>
              </defs>
              <Tooltip
                cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
                content={({ active, payload }) => active && payload?.length
                  ? <div className="rounded-lg border border-slate-200 bg-white/95 px-2 py-1 text-xs font-semibold shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/95" style={{ color }}>{payload[0].value}</div>
                  : null}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
                fill={`url(#${gradientId})`} dot={false}
                activeDot={{ r: 4, fill: color, stroke: 'white', strokeWidth: 2, filter: `url(#shadow-${gradientId})` }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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

function NotificationsPanel({ notifications, onClose, onMarkRead, onMarkAllRead, onClear }: {
  notifications: Notification[]
  onClose: () => void
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClear: () => void
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
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button onClick={onMarkAllRead} className="rounded-lg px-2 py-1 text-[11px] font-medium text-violet-600 transition-colors hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-500/10">
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={onClear} className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-300">
              Clear
            </button>
          )}
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto py-1">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12">
            <Bell className="h-7 w-7 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-400">You're all caught up</p>
          </div>
        ) : notifications.map(n => (
          <button key={n.id} onClick={() => onMarkRead(n.id)}
            className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]', !n.read && 'bg-violet-50/50 dark:bg-white/[0.02]')}>
            <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg', typeColor[n.type])}>{typeIcon[n.type]}</div>
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm leading-snug', n.read ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200')}>{n.text}</p>
              <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.timestamp)}</p>
            </div>
            {!n.read && <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-500" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({ clientId, isAdmin: _isAdmin, onNavigate }: { clientId: string | null; isAdmin: boolean; onNavigate: (p: Page) => void }) {
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
      const apptQ = sb.from('appointments').select('id,email,appointment_type,date').ilike('email', `%${query}%`)
      const contQ = sb.from('contacts').select('id,name,phone_number,email').ilike('name', `%${query}%`)
      const [appts, contacts] = await Promise.all([
        (clientId ? apptQ.eq('client_id', clientId) : apptQ).limit(5),
        (clientId ? contQ.eq('client_id', clientId) : contQ).limit(5),
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
                    <button key={item.id}
                      onClick={() => { onNavigate(g.category === 'Appointments' ? 'appointments' : 'contacts'); setOpen(false); setQuery('') }}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]">
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

function Sidebar({ user, clients, activePage, activeClientId, onNavigate, onClientChange, onSignOut, onToggleDark, dark, collapsed, onToggleCollapse, mobileOpen = false, onCloseMobile = () => {} }: {
  user: AppUser; clients: Client[]; activePage: Page; activeClientId: string | null
  onNavigate: (p: Page) => void; onClientChange: (id: string | null) => void; onSignOut: () => void
  onToggleDark: () => void; dark: boolean; collapsed: boolean; onToggleCollapse: () => void
  mobileOpen?: boolean; onCloseMobile?: () => void
}) {
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const activeClient = clients.find(c => c.id === activeClientId)
  const visibleNav = NAV_ITEMS.filter(n => !n.adminOnly || user.role === 'admin')

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCloseMobile} />}
    <aside className={cn(
      'fixed left-0 top-0 z-40 flex h-full flex-col border-r transition-all duration-300',
      'border-slate-200 bg-white dark:border-white/[0.07] dark:bg-[#080b12]',
      collapsed ? 'w-[64px]' : 'w-64',
      'max-md:w-64 max-md:shadow-2xl',
      mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
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
            <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
              {activeClientId === null ? 'All Clients' : (activeClient?.name ?? 'Select client')}
            </span>
            <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200', clientDropOpen && 'rotate-180')} />
          </button>
          {clientDropOpen && (
            <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-slate-900 dark:shadow-black/40">
              {/* All Clients option */}
              <button onClick={() => { onClientChange(null); setClientDropOpen(false) }}
                className={cn('flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.05]',
                  activeClientId === null ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400')}>
                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-medium">All Clients</span>
                {activeClientId === null && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500" />}
              </button>
              {clients.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">No clients found</p> :
                clients.map(c => (
                  <button key={c.id} onClick={() => { onClientChange(c.id); setClientDropOpen(false) }}
                    className={cn('flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                      c.id === activeClientId ? 'text-violet-600 dark:text-violet-400' : 'text-slate-700 dark:text-slate-300')}>
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.id === activeClientId && <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
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
        <button onClick={() => onNavigate('profile')}
          className={cn('mt-2 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-2.5 transition-colors hover:bg-slate-100 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06]', collapsed ? 'justify-center px-0' : 'px-3')}>
          <div className="relative flex-shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-700 text-sm font-bold text-white">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-[#080b12]" />
          </div>
          {!collapsed && <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user.name || 'User'}</p>
            <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{user.email}</p>
          </div>}
        </button>
      </div>
    </aside>
    </>
  )
}

// ─── Overview Page ────────────────────────────────────────────────────────────

function OverviewPage({ user, activeClientId, onNavigate }: PageProps & { onNavigate: (p: Page) => void }) {
  const [stats, setStats] = useState<OverviewStats>({ todayAppointments: 0, totalCalls: 0, totalContacts: 0, totalMessages: 0 })
  const [statsLoading, setStatsLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [apptLoading, setApptLoading] = useState(true)
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [sparkData, setSparkData] = useState<Record<string, { value: number }[]>>({
    appointments: Array.from({ length: 15 }, () => ({ value: 0 })),
    calls: Array.from({ length: 15 }, () => ({ value: 0 })),
    contacts: Array.from({ length: 15 }, () => ({ value: 0 })),
    messages: Array.from({ length: 15 }, () => ({ value: 0 })),
  })
  const [trends, setTrends] = useState<Record<string, { value: number; up: boolean }>>({
    appointments: { value: 0, up: true }, calls: { value: 0, up: true },
    contacts: { value: 0, up: true }, messages: { value: 0, up: true },
  })

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  const loadData = useCallback(() => {
    const since28 = new Date(); since28.setDate(since28.getDate() - 28)
    const since28Str = since28.toISOString()
    setStatsLoading(true)
    Promise.all([
      addFilter(sb.from('appointments').select('id', { count: 'exact', head: true }).gte('date', since28Str).is('deleted_at', null)),
      addFilter(sb.from('calls').select('id', { count: 'exact', head: true }).gte('date', since28Str)),
      addFilter(sb.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', since28Str)),
      addFilter(sb.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', since28Str)),
      addFilter(sb.from('appointments').select('date').gte('date', since28Str).is('deleted_at', null)),
      addFilter(sb.from('calls').select('date').gte('date', since28Str)),
      addFilter(sb.from('contacts').select('created_at').gte('created_at', since28Str)),
      addFilter(sb.from('messages').select('created_at').gte('created_at', since28Str)),
    ]).then(([a, c, co, m, aH, cH, coH, mH]) => {
      setStats({ todayAppointments: a.count ?? 0, totalCalls: c.count ?? 0, totalContacts: co.count ?? 0, totalMessages: m.count ?? 0 })
      setStatsLoading(false)
      const apptDates = ((aH.data  ?? []) as any[]).map(r => r.date as string)
      const callDates = ((cH.data  ?? []) as any[]).map(r => r.date as string)
      const contDates = ((coH.data ?? []) as any[]).map(r => r.created_at as string)
      const msgDates  = ((mH.data  ?? []) as any[]).map(r => r.created_at as string)
      setSparkData({
        appointments: buildDailyBuckets(apptDates, 15),
        calls:        buildDailyBuckets(callDates, 15),
        contacts:     buildDailyBuckets(contDates, 15),
        messages:     buildDailyBuckets(msgDates,  15),
      })
      setTrends({
        appointments: calcTrend(apptDates),
        calls:        calcTrend(callDates),
        contacts:     calcTrend(contDates),
        messages:     calcTrend(msgDates),
      })
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
    { label: 'Appointments',          value: stats.todayAppointments, color: '#7c3aed', gradientId: 'grad-appt',  sparkData: sparkData.appointments, icon: <CalendarDays className="h-5 w-5" />, trend: trends.appointments },
    { label: 'Calls',                value: stats.totalCalls,        color: '#2563eb', gradientId: 'grad-calls', sparkData: sparkData.calls,         icon: <Phone         className="h-5 w-5" />, trend: trends.calls        },
    { label: 'Contacts',             value: stats.totalContacts,     color: '#059669', gradientId: 'grad-cont',  sparkData: sparkData.contacts,      icon: <Users         className="h-5 w-5" />, trend: trends.contacts     },
    { label: 'Messages',             value: stats.totalMessages,     color: '#d97706', gradientId: 'grad-msg',   sparkData: sparkData.messages,      icon: <MessageSquare className="h-5 w-5" />, trend: trends.messages     },
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
          <button onClick={() => onNavigate('appointments')} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-white">View all</button>
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
                    <td className="px-6 py-4"><button onClick={e => { e.stopPropagation(); setSelectedAppt(r) }} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"><MoreHorizontal className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
      <AppointmentDrawer
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onSaved={updated => setAppointments(rs => rs.map(r => r.id === updated.id ? updated : r))}
        onDelete={() => setSelectedAppt(null)}
      />
    </div>
  )
}

// ─── Appointment Drawer ───────────────────────────────────────────────────────

function AppointmentDrawer({ appt, onClose, onSaved, onDelete }: {
  appt: Appointment | null
  onClose: () => void
  onSaved: (updated: Appointment) => void
  onDelete: (id: string, label: string) => void
}) {
  const [status, setStatus] = useState<Appointment['status']>('pending')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!appt) return
    setStatus(appt.status)
    const d = new Date(appt.date)
    setDate(d.toISOString().slice(0, 10))
    setTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`)
    setNotes(appt.notes ?? '')
  }, [appt])

  async function save() {
    if (!appt) return
    setSaving(true)
    const newDate = new Date(`${date}T${time}`).toISOString()
    const update: Partial<Appointment> = { status, date: newDate, notes }
    const { error } = await sb.from('appointments').update(update).eq('id', appt.id)
    if (error) { showToast('Save failed: ' + error.message, 'error') }
    else { showToast('Appointment updated', 'success'); onSaved({ ...appt, ...update }); onClose() }
    setSaving(false)
  }

  if (!appt) return null
  const initials = (appt.email?.[0] ?? appt.contact_phone?.replace(/^\+/, '')?.[0] ?? '?').toUpperCase()

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0e1117]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Appointment Details</h2>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">#{appt.id.slice(0, 8)}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">

          {/* Contact card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Contact</p>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-sm font-bold text-white">
                {initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{appt.email || '—'}</p>
                <p className="text-xs text-slate-400">{appt.contact_phone || '—'}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/[0.07]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Appointment type</p>
              <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{appt.appointment_type}</p>
            </div>
          </div>

          {/* Status toggle */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Status</p>
            <div className="flex gap-2">
              {(['confirmed', 'pending', 'cancelled'] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn('flex-1 rounded-xl border py-2.5 text-xs font-semibold capitalize transition-all',
                    status === s
                      ? s === 'confirmed' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : s === 'pending'   ? 'border-amber-400  bg-amber-50  text-amber-700  dark:bg-amber-500/10  dark:text-amber-400'
                        :                    'border-red-400    bg-red-50    text-red-700    dark:bg-red-500/10    dark:text-red-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20')}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Reschedule */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Date & Time</p>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-300" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 outline-none dark:text-slate-300" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Notes</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Add a note about this appointment…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:placeholder-slate-600 dark:focus:border-violet-500" />
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <button onClick={() => { onDelete(appt.id, `${appt.appointment_type} for ${appt.email || appt.contact_phone}`); onClose() }}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 dark:border-red-500/20 dark:hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" />Delete
          </button>
          <button onClick={save} disabled={saving}
            className="ml-auto flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save changes
          </button>
        </div>

      </div>
    </>
  )
}

// ─── Appointments Page ────────────────────────────────────────────────────────

function AppointmentsPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
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

  useEffect(() => { setSelectedAppt(null) }, [activeClientId])

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
         rows.length === 0 ? (
           status !== 'all' || dateFrom || dateTo
             ? <EmptyState icon={CalendarDays} label="No appointments match your filters"
                 sub="Try a different date range or status filter"
                 action={<button onClick={() => { setStatus('all'); setDateFrom(''); setDateTo('') }}
                   className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">Clear filters</button>} />
             : <EmptyState icon={CalendarDays} label="No appointments yet"
                 sub="DrizzleBot will automatically book and log appointments here as they come in" />
         ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Contact', 'Type', 'Phone', 'Date & Time', 'Status', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} onClick={() => setSelectedAppt(r)}
                    className="group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-white">{r.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.appointment_type}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.contact_phone}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                    <td className="px-6 py-4">
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget({ id: r.id, label: `${r.appointment_type} for ${r.email || r.contact_phone}` }) }}
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
      <AppointmentDrawer
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onSaved={updated => setRows(rs => rs.map(r => r.id === updated.id ? updated : r))}
        onDelete={(id, label) => { setSelectedAppt(null); setDeleteTarget({ id, label }) }}
      />
    </div>
  )
}

// ─── Call Logs Page ───────────────────────────────────────────────────────────

const CALLS_PAGE = 50

function CallLogsPage({ user, activeClientId }: PageProps) {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [outcome, setOutcome] = useState('all')
  const [limit, setLimit] = useState(CALLS_PAGE)
  const [hasMore, setHasMore] = useState(false)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    setLimit(CALLS_PAGE)
  }, [addFilter, outcome])

  useEffect(() => {
    const isInitial = limit === CALLS_PAGE
    if (isInitial) setLoading(true); else setLoadingMore(true)
    let q = addFilter(sb.from('calls').select('*').order('date', { ascending: false }).limit(limit + 1))
    if (outcome !== 'all') q = q.eq('outcome', outcome)
    q.then(({ data }: any) => {
      const rows = (data as Call[]) ?? []
      setHasMore(rows.length > limit)
      setCalls(rows.slice(0, limit))
      if (isInitial) setLoading(false); else setLoadingMore(false)
    })
  }, [addFilter, outcome, limit])

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
         calls.length === 0 ? (
           outcome !== 'all'
             ? <EmptyState icon={Phone} label="No calls match this filter"
                 action={<button onClick={() => setOutcome('all')}
                   className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">Clear filter</button>} />
             : <EmptyState icon={Phone} label="No calls yet"
                 sub="DrizzleBot logs every call automatically — completed, missed, and voicemail." />
         ) : (
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
                        {call.recording_url && (
                          <a href={call.recording_url} target="_blank" rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">
                            <PlayCircle className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            Play recording
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {hasMore && (
          <div className="border-t border-slate-100 px-6 py-4 dark:border-white/[0.04]">
            <button onClick={() => setLimit(l => l + CALLS_PAGE)} disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">
              {loadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
              {loadingMore ? 'Loading…' : `Load more (showing ${calls.length})`}
            </button>
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
  const [selectedDay, setSelectedDay] = useState<string>(() => new Date().toISOString().slice(0, 10))

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

  const agendaAppts = useMemo(() => {
    const appts = byDate[selectedDay] ?? []
    return [...appts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [byDate, selectedDay])

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
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_260px]">
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
                  <div key={i} onClick={() => cell.current && setSelectedDay(ds)}
                    className={cn('min-h-[110px] border-b border-r border-slate-100 p-2 transition-colors hover:bg-slate-50 dark:border-white/[0.04] dark:hover:bg-white/[0.02]',
                    !cell.current && 'opacity-30 cursor-default', cell.current && 'cursor-pointer',
                    isToday && 'bg-violet-50 dark:bg-violet-500/[0.07]',
                    selectedDay === ds && cell.current && 'ring-2 ring-inset ring-violet-500',
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

      {/* ── Daily Agenda Side Panel ── */}
      <div className="flex flex-col">
        <GlassCard className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-white/[0.07]">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>
              {selectedDay === todayStr
                ? "Today's agenda"
                : new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {agendaAppts.length} {agendaAppts.length === 1 ? 'event' : 'events'}
            </p>
          </div>
          <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto dark:divide-white/[0.05]">
            {agendaAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                <Calendar className="mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400 dark:text-slate-500">No events scheduled</p>
              </div>
            ) : (
              agendaAppts.map(a => (
                <div key={a.id} className="flex gap-3 px-4 py-3">
                  <div className="min-w-[52px] pt-0.5 text-right">
                    <span className="text-[11px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">
                      {new Date(a.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={cn('w-0.5 self-stretch rounded-full flex-shrink-0',
                    a.status === 'confirmed' ? 'bg-violet-500' :
                    a.status === 'pending'   ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{a.appointment_type}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{a.email}</p>
                    {a.contact_phone && <p className="truncate text-[11px] text-slate-400">{a.contact_phone}</p>}
                    <span className={cn('mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                      a.status === 'confirmed' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' :
                      a.status === 'pending'   ? 'bg-amber-100  text-amber-700  dark:bg-amber-500/20  dark:text-amber-300' :
                                                 'bg-slate-100  text-slate-500  dark:bg-slate-500/20  dark:text-slate-400')}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      </div>{/* end grid */}
    </div>
  )
}

// ─── Contact Profile Drawer ───────────────────────────────────────────────────

function ContactProfileDrawer({ contact, onClose, onSaved }: {
  contact: Contact | null
  onClose: () => void
  onSaved: (updated: Contact) => void
}) {
  const [tab, setTab] = useState<'appointments' | 'calls' | 'messages'>('appointments')
  const [appts, setAppts]       = useState<Appointment[]>([])
  const [callLog, setCallLog]   = useState<Call[]>([])
  const [msgs, setMsgs]         = useState<Message[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [name, setName]         = useState('')
  const [status, setStatus]     = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (!contact) return
    setName(contact.name ?? '')
    setStatus(contact.status ?? 'active')
    setTab('appointments')
    setHistLoading(true)
    const phone = contact.phone_number ?? contact.phone ?? ''
    const email = contact.email ?? ''
    const apptQ = email && phone
      ? sb.from('appointments').select('*').or(`email.eq.${email},contact_phone.eq.${phone}`)
      : email
        ? sb.from('appointments').select('*').eq('email', email)
        : sb.from('appointments').select('*').eq('contact_phone', phone)
    Promise.all([
      apptQ.order('date', { ascending: false }).limit(20),
      phone ? sb.from('calls').select('*').eq('caller_number', phone).order('date', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      phone ? sb.from('messages').select('*').eq('sender_phone', phone).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    ]).then(([a, c, m]) => {
      setAppts((a.data as Appointment[]) ?? [])
      setCallLog((c.data as Call[]) ?? [])
      setMsgs((m.data as Message[]) ?? [])
      setHistLoading(false)
    })
  }, [contact])

  async function save() {
    if (!contact) return
    setSaving(true)
    const { error } = await sb.from('contacts').update({ name, status }).eq('id', contact.id)
    if (error) { showToast('Save failed: ' + error.message, 'error') }
    else { showToast('Contact updated', 'success'); onSaved({ ...contact, name, status }); onClose() }
    setSaving(false)
  }

  if (!contact) return null

  const TABS = [
    { key: 'appointments' as const, label: 'Appointments', icon: CalendarDays, count: appts.length },
    { key: 'calls'        as const, label: 'Calls',        icon: Phone,        count: callLog.length },
    { key: 'messages'     as const, label: 'Messages',     icon: MessageSquare, count: msgs.length },
  ]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0e1117]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Contact Profile</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Profile section */}
          <div className="border-b border-slate-200 px-6 py-6 dark:border-white/[0.07]">
            <div className="mb-5 flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-xl font-bold text-white">
                {(contact.name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-400">{contact.email ?? '—'}</p>
                <p className="truncate text-xs text-slate-400">{contact.phone_number ?? contact.phone ?? '—'}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Name</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:focus:border-violet-500" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Status</label>
                <div className="mt-1 flex gap-2">
                  {(['active', 'lead', 'inactive'] as const).map(s => (
                    <button key={s} onClick={() => setStatus(s)}
                      className={cn('flex-1 rounded-xl border py-2 text-xs font-semibold capitalize transition-all',
                        status === s
                          ? s === 'active'   ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                            : s === 'lead'   ? 'border-violet-400  bg-violet-50  text-violet-700  dark:bg-violet-500/10  dark:text-violet-400'
                            :                  'border-slate-400   bg-slate-100  text-slate-600   dark:bg-white/[0.08]  dark:text-slate-400'
                          : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-white/20')}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </div>

          {/* History tabs */}
          <div className="flex border-b border-slate-200 px-6 dark:border-white/[0.07]">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('mr-5 flex items-center gap-1.5 border-b-2 pb-3 pt-4 text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                    : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-300')}>
                {t.label}
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  tab === t.key
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                    : 'bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-slate-500')}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {histLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.04]" />)}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">

              {tab === 'appointments' && (appts.length === 0
                ? <EmptyState icon={CalendarDays} label="No appointments found" />
                : appts.map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-500/20">
                      <CalendarDays className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.appointment_type}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(a.date)}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))
              )}

              {tab === 'calls' && (callLog.length === 0
                ? <EmptyState icon={Phone} label="No calls found" />
                : callLog.map(c => (
                  <div key={c.id} className="flex items-start gap-3 px-6 py-3.5">
                    <div className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg',
                      c.outcome === 'completed' ? 'bg-emerald-100 dark:bg-emerald-500/20'
                      : c.outcome === 'missed'  ? 'bg-red-100    dark:bg-red-500/20'
                      :                           'bg-slate-100  dark:bg-white/[0.06]')}>
                      <Phone className={cn('h-3.5 w-3.5',
                        c.outcome === 'completed' ? 'text-emerald-600 dark:text-emerald-400'
                        : c.outcome === 'missed'  ? 'text-red-500    dark:text-red-400'
                        :                           'text-slate-400')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize text-slate-800 dark:text-slate-200">{c.outcome}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{formatDate(c.date)} · {formatDuration(c.duration_seconds)}</p>
                      {c.summary && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{c.summary}</p>}
                    </div>
                  </div>
                ))
              )}

              {tab === 'messages' && (msgs.length === 0
                ? <EmptyState icon={MessageSquare} label="No messages found" />
                : msgs.map(m => (
                  <div key={m.id} className={cn('flex gap-3 px-6 py-3.5', m.direction === 'outbound' && 'flex-row-reverse')}>
                    <div className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg',
                      m.direction === 'inbound' ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-violet-100 dark:bg-violet-500/20')}>
                      <MessageSquare className={cn('h-3.5 w-3.5', m.direction === 'inbound' ? 'text-blue-500 dark:text-blue-400' : 'text-violet-500 dark:text-violet-400')} />
                    </div>
                    <div className={cn('min-w-0 flex-1', m.direction === 'outbound' && 'text-right')}>
                      <p className="text-[11px] text-slate-400">{formatDate(m.created_at)} · {m.channel.toUpperCase()}</p>
                      <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{m.body}</p>
                    </div>
                  </div>
                ))
              )}

            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Contacts Page ────────────────────────────────────────────────────────────

const CONTACTS_PAGE = 50

function ContactsPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [limit, setLimit] = useState(CONTACTS_PAGE)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => { setSelectedContact(null) }, [activeClientId])
  useEffect(() => { setLimit(CONTACTS_PAGE) }, [search, status, activeClientId])

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    const isInitial = limit === CONTACTS_PAGE
    const run = () => {
      if (isInitial) setLoading(true); else setLoadingMore(true)
      let q = addFilter(sb.from('contacts').select('*').order('name').limit(limit + 1))
      if (status !== 'all') q = q.eq('status', status)
      if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone_number.ilike.%${search}%`)
      q.then(({ data }: any) => {
        const fetched = (data as Contact[]) ?? []
        setHasMore(fetched.length > limit)
        setRows(fetched.slice(0, limit))
        if (isInitial) setLoading(false); else setLoadingMore(false)
      })
    }
    const t = search ? setTimeout(run, 300) : (run(), undefined)
    return () => clearTimeout(t)
  }, [addFilter, status, search, limit])

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
         rows.length === 0 ? (
           search || status !== 'all'
             ? <EmptyState icon={Users} label="No contacts match your search"
                 action={<button onClick={() => { setSearch(''); setStatus('all') }}
                   className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">Clear search</button>} />
             : <EmptyState icon={Users} label="No contacts yet"
                 sub="Contacts are created automatically from inbound calls, messages, and appointments." />
         ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Name', 'Email', 'Phone', 'Status', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} onClick={() => setSelectedContact(r)}
                    className="group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
                          {r.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{r.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.email ?? '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{r.phone_number ?? r.phone ?? '—'}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.status ?? 'active'} /></td>
                    <td className="px-6 py-4">
                      <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 transition-all group-hover:opacity-100 dark:text-slate-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div className="border-t border-slate-100 px-6 py-4 dark:border-white/[0.04]">
            <button onClick={() => setLimit(l => l + CONTACTS_PAGE)} disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06]">
              {loadingMore ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
              {loadingMore ? 'Loading…' : `Load more (showing ${rows.length})`}
            </button>
          </div>
        )}
      </GlassCard>
      <ContactProfileDrawer
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onSaved={updated => setRows(rs => rs.map(r => r.id === updated.id ? updated : r))}
      />
    </div>
  )
}

// ─── Messages Page ────────────────────────────────────────────────────────────

function MessagesPage({ user, activeClientId }: PageProps) {
  const [rows, setRows] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [chan, setChan] = useState('all')
  const [selectedThread, setSelectedThread] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  useEffect(() => {
    setLoading(true)
    let q = addFilter(sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200))
    if (chan !== 'all') q = q.eq('channel', chan)
    q.then(({ data }: any) => {
      const msgs = (data as Message[]) ?? []
      setRows(msgs)
      setLoading(false)
    })
  }, [addFilter, chan])

  const threads = useMemo(() => {
    const map = new Map<string, Message[]>()
    for (const msg of rows) {
      const key = msg.sender_phone || msg.sender_name || msg.id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(msg)
    }
    return Array.from(map.entries())
      .map(([key, msgs]) => ({
        key,
        latest: msgs[0],
        messages: [...msgs].reverse(),
      }))
      .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
  }, [rows])

  // Auto-select first thread
  useEffect(() => {
    if (threads.length > 0 && !selectedThread) setSelectedThread(threads[0].key)
  }, [threads, selectedThread])

  // Scroll to bottom when thread changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [selectedThread, threads])

  const threadMsgs = useMemo(
    () => threads.find(t => t.key === selectedThread)?.messages ?? [],
    [threads, selectedThread]
  )

  function avatarInitial(key: string) {
    const ch = key.replace(/^\+\d/, c => c.slice(1)).trim()[0]
    return (ch ?? '?').toUpperCase()
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Messages" subtitle="AI-managed conversations"
        action={
          <div className="flex items-center gap-2">
            <ToolbarSelect value={chan} onChange={setChan}>
              <option value="all">All channels</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="voice">Voice</option>
            </ToolbarSelect>
            <ExportButton onClick={() => exportCSV('messages.csv',
              ['Date', 'Channel', 'Direction', 'Sender', 'Body'],
              rows.map(r => [r.created_at, r.channel, r.direction, r.sender_phone ?? r.sender_name ?? '', r.body])
            )} />
          </div>
        }
      />

      <GlassCard className="overflow-hidden">
        <div className="flex h-[640px]">

          {/* ── Conversation list ── */}
          <div className="flex w-72 flex-shrink-0 flex-col border-r border-slate-200 dark:border-white/[0.07]">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.07]">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                {loading ? '…' : `${threads.length} conversation${threads.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-px p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-[68px] animate-pulse rounded-xl bg-slate-100 dark:bg-white/[0.04]" />
                  ))}
                </div>
              ) : threads.length === 0 ? (
                <EmptyState icon={MessageSquare} label="No messages yet"
                  sub="Conversations will appear here once DrizzleBot starts handling inbound messages." />
              ) : (
                threads.map(t => {
                  const isActive = t.key === selectedThread
                  const isOut = t.latest.direction === 'outbound'
                  return (
                    <button key={t.key} onClick={() => setSelectedThread(t.key)}
                      className={cn('w-full border-b border-slate-100 px-4 py-3 text-left transition-colors dark:border-white/[0.04]',
                        isActive ? 'bg-violet-50 dark:bg-violet-500/[0.1]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]')}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
                          {avatarInitial(t.key)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1">
                            <p className={cn('truncate text-xs font-semibold',
                              isActive ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-200')}>
                              {t.key}
                            </p>
                            <span className="flex-shrink-0 text-[10px] text-slate-400">
                              {new Date(t.latest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {isOut ? '↗ ' : ''}{t.latest.body}
                          </p>
                          <div className="mt-1">
                            <ChannelBadge channel={t.latest.channel} />
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Thread view ── */}
          <div className="flex flex-1 flex-col min-w-0">
            {!selectedThread ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2">
                <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-400">Select a conversation</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-white/[0.07]">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
                    {avatarInitial(selectedThread)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{selectedThread}</p>
                    <p className="text-xs text-slate-400">{threadMsgs.length} message{threadMsgs.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ChannelBadge channel={threadMsgs[0]?.channel ?? ''} />
                </div>

                {/* Bubbles */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {threadMsgs.map(msg => {
                    const isOut = msg.direction === 'outbound'
                    return (
                      <div key={msg.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm',
                          isOut
                            ? 'rounded-br-sm bg-gradient-to-br from-violet-600 to-purple-600 text-white'
                            : 'rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-white/[0.08] dark:text-slate-200')}>
                          <p className="text-sm leading-relaxed">{msg.body}</p>
                          <p className={cn('mt-1 text-[10px]', isOut ? 'text-violet-200' : 'text-slate-400')}>
                            {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>
              </>
            )}
          </div>

        </div>
      </GlassCard>
    </div>
  )
}

// ─── User Management ─────────────────────────────────────────────────────────

function InviteUserModal({ clients, onClose, onInvited }: {
  clients: Client[]; onClose: () => void; onInvited: (p: ProfileRow) => void
}) {
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [role, setRole]       = useState<'admin' | 'client'>('client')
  const [clientId, setClientId] = useState('')
  const [busy, setBusy]       = useState(false)

  async function submit() {
    if (!email.trim()) return
    setBusy(true)
    const { error: authErr } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
    if (authErr) { showToast(authErr.message, 'error'); setBusy(false); return }
    const row = { email: email.trim(), name: name.trim() || null, role, client_id: clientId || null, status: 'invited' }
    const { data } = await sb.from('profiles').upsert(row, { onConflict: 'email' }).select('*, clients(name)').single()
    showToast(`Invite sent to ${email.trim()}`, 'success')
    if (data) onInvited(data as ProfileRow)
    setBusy(false)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#0e1117]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Invite User</h2>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Email *</label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <Mail className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300 dark:placeholder-slate-600" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300" />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Role</label>
            <div className="mt-1 flex gap-2">
              {(['client', 'admin'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={cn('flex-1 rounded-xl border py-2.5 text-xs font-semibold capitalize transition-all',
                    role === r
                      ? r === 'admin' ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400'
                                      : 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/[0.08]')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {role === 'client' && clients.length > 0 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Assign to client</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none dark:border-white/[0.08] dark:bg-[#0e1117] dark:text-slate-300">
                <option value="">— None —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]">Cancel</button>
          <button onClick={submit} disabled={busy || !email.trim()}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Send Invite
          </button>
        </div>
      </div>
    </>
  )
}

function EditUserDrawer({ profile, clients, onClose, onSaved }: {
  profile: ProfileRow | null; clients: Client[]; onClose: () => void; onSaved: (u: ProfileRow) => void
}) {
  const [name, setName]       = useState('')
  const [role, setRole]       = useState<'admin' | 'client'>('client')
  const [clientId, setClientId] = useState('')
  const [status, setStatus]   = useState('active')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!profile) return
    setName(profile.name ?? '')
    setRole(profile.role)
    setClientId(profile.client_id ?? '')
    setStatus(profile.status)
  }, [profile])

  async function save() {
    if (!profile) return
    setSaving(true)
    const update = { name: name.trim() || null, role, client_id: clientId || null, status }
    const { error } = await sb.from('profiles').update(update).eq('id', profile.id)
    if (error) { showToast('Save failed: ' + error.message, 'error') }
    else {
      const clientName = clients.find(c => c.id === clientId)?.name
      showToast('User updated', 'success')
      onSaved({ ...profile, ...update, clients: clientName ? { name: clientName } : null })
      onClose()
    }
    setSaving(false)
  }

  if (!profile) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0e1117]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Edit User</h2>
            <p className="mt-0.5 text-xs text-slate-400">{profile.email}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:focus:border-violet-500" />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Role</label>
            <div className="mt-1 flex gap-2">
              {(['client', 'admin'] as const).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className={cn('flex-1 rounded-xl border py-2.5 text-xs font-semibold capitalize transition-all',
                    role === r
                      ? r === 'admin' ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400'
                                      : 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/[0.08]')}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {role === 'client' && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Client account</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)}
                className="mt-1 w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none dark:border-white/[0.08] dark:bg-[#0e1117] dark:text-slate-300">
                <option value="">— Unassigned —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Account Status</label>
            <div className="mt-1 flex gap-2">
              {(['active', 'inactive'] as const).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn('flex-1 rounded-xl border py-2.5 text-xs font-semibold capitalize transition-all',
                    status === s
                      ? s === 'active' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                       : 'border-red-400 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 dark:border-white/[0.08]')}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.07]">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Role and client changes take effect on the user's next login. Setting Inactive does not immediately end their session.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </>
  )
}

function UserManagementPage({ user: _user, activeClientId: _ac }: PageProps) {
  const [profiles, setProfiles]           = useState<ProfileRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [tableError, setTableError]       = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<ProfileRow | null>(null)
  const [showInvite, setShowInvite]       = useState(false)
  const [clients, setClients]             = useState<Client[]>([])

  useEffect(() => {
    sb.from('clients').select('id,name').then(({ data }) => { if (data) setClients(data as Client[]) })
    sb.from('profiles').select('*, clients(name)').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setTableError(true)
        else setProfiles((data as ProfileRow[]) ?? [])
        setLoading(false)
      })
  }, [])

  function roleBadge(role: string) {
    const isAdmin = role === 'admin'
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        isAdmin ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'bg-blue-100   text-blue-700   dark:bg-blue-500/20   dark:text-blue-400')}>
        {isAdmin ? <Shield className="h-3 w-3" /> : <Users className="h-3 w-3" />}
        {role}
      </span>
    )
  }

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
      inactive: 'bg-red-100     text-red-600     dark:bg-red-500/20     dark:text-red-400',
      invited:  'bg-amber-100   text-amber-700   dark:bg-amber-500/20   dark:text-amber-400',
    }
    return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', map[s] ?? map.active)}>{s}</span>
  }

  if (tableError) return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage portal access" />
      <GlassCard>
        <div className="px-6 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Profiles table not found</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs text-slate-400">Create it in your Supabase SQL editor to enable user management:</p>
          <pre className="mx-auto mt-4 max-w-xl overflow-x-auto rounded-xl bg-slate-900 p-4 text-left text-xs text-slate-300">{`create table profiles (
  id uuid references auth.users primary key,
  email text unique not null,
  name text,
  role text not null default 'client',
  client_id uuid references clients(id),
  status text not null default 'active',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "admins can manage profiles" on profiles
  for all using (
    (select raw_user_meta_data->>'role'
     from auth.users where id = auth.uid()) = 'admin'
  );`}</pre>
        </div>
      </GlassCard>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage portal access and permissions"
        action={
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500">
            <UserPlus className="h-4 w-4" />Invite User
          </button>
        }
      />
      <GlassCard>
        {loading ? <TableSkeleton cols={5} /> :
         profiles.length === 0
           ? <EmptyState icon={Users} label="No users yet"
               sub="Invite your first team member to grant them portal access."
               action={<button onClick={() => setShowInvite(true)}
                 className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500">
                 <UserPlus className="h-4 w-4" />Invite first user
               </button>} />
           : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['User', 'Role', 'Client', 'Status', 'Joined', '']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {profiles.map(p => (
                  <tr key={p.id} onClick={() => setSelectedProfile(p)}
                    className="group cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
                          {(p.name?.[0] ?? p.email?.[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name ?? '—'}</p>
                          <p className="text-xs text-slate-400">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{roleBadge(p.role)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400">{p.clients?.name ?? '—'}</td>
                    <td className="px-6 py-4">{statusBadge(p.status)}</td>
                    <td className="px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 transition-all group-hover:opacity-100 dark:text-slate-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {showInvite && (
        <InviteUserModal clients={clients} onClose={() => setShowInvite(false)}
          onInvited={p => setProfiles(ps => [p, ...ps])} />
      )}
      <EditUserDrawer profile={selectedProfile} clients={clients}
        onClose={() => setSelectedProfile(null)}
        onSaved={updated => setProfiles(ps => ps.map(p => p.id === updated.id ? updated : p))} />
    </div>
  )
}

// ─── Controls Page ────────────────────────────────────────────────────────────

interface CalClient { id: string; name: string; calendar_webhook_url: string | null }
type LogEntry = { time: string; msg: string; ok: boolean }

const BIZ_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

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
  const [bizHours, setBizHours]   = useState<{ enabled: boolean; open: string; close: string }[]>(() => {
    if (typeof window === 'undefined') return BIZ_DAYS.map((_, i) => ({ enabled: i >= 1 && i <= 5, open: '09:00', close: '17:00' }))
    const saved = localStorage.getItem('biz-hours')
    if (saved) try { return JSON.parse(saved) } catch {}
    return BIZ_DAYS.map((_, i) => ({ enabled: i >= 1 && i <= 5, open: '09:00', close: '17:00' }))
  })
  const [bizSaved, setBizSaved]   = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardClients, setOnboardClients] = useState<Client[]>([])

  const effectiveClient = activeClientId ?? user.client_id

  function saveBizHours() {
    localStorage.setItem('biz-hours', JSON.stringify(bizHours))
    setBizSaved(true); setTimeout(() => setBizSaved(false), 2000)
    showToast('Business hours saved', 'success')
  }

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

        {/* Business Hours */}
        <GlassCard className="lg:col-span-2">
          <div className="space-y-4 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Clock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Business Hours</h3>
                  <p className="mt-0.5 text-xs text-slate-400">DrizzleBot routes after-hours calls to voicemail</p>
                </div>
              </div>
              <button onClick={saveBizHours}
                className={cn('flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
                  bizSaved ? 'bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400' : 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20')}>
                {bizSaved ? <><CheckCircle2 className="h-4 w-4" />Saved</> : <><Save className="h-4 w-4" />Save</>}
              </button>
            </div>
            <div className="space-y-1.5">
              {BIZ_DAYS.map((day, i) => (
                <div key={day} className={cn('flex items-center gap-4 rounded-xl px-4 py-2.5 transition-colors', bizHours[i].enabled ? 'bg-slate-50 dark:bg-white/[0.03]' : 'opacity-50')}>
                  <button onClick={() => setBizHours(h => h.map((d, j) => j === i ? { ...d, enabled: !d.enabled } : d))}
                    className={cn('relative h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200', bizHours[i].enabled ? 'bg-violet-600' : 'bg-slate-200 dark:bg-white/[0.12]')}>
                    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', bizHours[i].enabled ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <span className="w-24 flex-shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">{day}</span>
                  <input type="time" disabled={!bizHours[i].enabled} value={bizHours[i].open}
                    onChange={e => setBizHours(h => h.map((d, j) => j === i ? { ...d, open: e.target.value } : d))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none disabled:opacity-40 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="time" disabled={!bizHours[i].enabled} value={bizHours[i].close}
                    onChange={e => setBizHours(h => h.map((d, j) => j === i ? { ...d, close: e.target.value } : d))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none disabled:opacity-40 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300" />
                  {!bizHours[i].enabled && <span className="text-xs text-slate-400">Closed</span>}
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Onboard New Client */}
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                <Rocket className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Onboard New Client</h3>
                <p className="mt-0.5 text-xs text-slate-400">Create a new client account and configure their DrizzleBot setup</p>
              </div>
            </div>
            <button onClick={() => { sb.from('clients').select('id,name').then(({ data }) => setOnboardClients((data as Client[]) ?? [])); setShowOnboarding(true) }}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500">
              <Rocket className="h-4 w-4" />Start onboarding
            </button>
          </div>
        </GlassCard>

      </div>
      {showOnboarding && (
        <OnboardingModal clients={onboardClients} onClose={() => setShowOnboarding(false)}
          onCreated={c => { setOnboardClients(cs => [...cs, c]); setShowOnboarding(false) }} />
      )}
    </div>
  )
}

// ─── Onboarding Modal ────────────────────────────────────────────────────────

function OnboardingModal({ clients: _clients, onClose, onCreated }: { clients: Client[]; onClose: () => void; onCreated: (c: Client) => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [calUrl, setCalUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const steps = ['Client details', 'Configuration', 'Review']

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    const { data, error } = await sb.from('clients').insert({
      name: name.trim(),
      phone_number: phone.trim() || null,
      calendar_webhook_url: calUrl.trim() || null,
    }).select('id,name').single()
    if (error) { showToast('Failed: ' + error.message, 'error'); setBusy(false); return }
    showToast(`Client "${name}" created`, 'success')
    onCreated(data as Client)
    setBusy(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0e1117]">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Onboard New Client</h2>
            <p className="mt-0.5 text-xs text-slate-400">Step {step + 1} of {steps.length} — {steps[step]}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-1.5 px-6 pt-4">
          {steps.map((s, i) => <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-violet-600' : 'bg-slate-100 dark:bg-white/[0.08]')} />)}
        </div>
        <div className="space-y-4 p-6">
          {step === 0 && <>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Business name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Dental"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Business phone</label>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300" />
              </div>
            </div>
          </>}
          {step === 1 && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Calendar webhook URL</label>
              <p className="mb-2 mt-0.5 text-xs text-slate-400">Syncs appointments with the client's calendar.</p>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Globe className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                <input type="url" value={calUrl} onChange={e => setCalUrl(e.target.value)} placeholder="https://…/webhook/calendar"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none dark:text-slate-300" />
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Review</p>
              {[['Business name', name || '—'], ['Phone', phone || '—'], ['Calendar URL', calUrl || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-slate-400">{k}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate ml-4">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]">
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < steps.length - 1
            ? <button onClick={() => setStep(s => s + 1)} disabled={step === 0 && !name.trim()}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            : <button onClick={create} disabled={busy || !name.trim()}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-500 disabled:opacity-50">
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Create client
              </button>
          }
        </div>
      </div>
    </>
  )
}

// ─── Reports Page ─────────────────────────────────────────────────────────────

function ReportsPage({ user, activeClientId }: PageProps) {
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 28); return d.toISOString().slice(0, 10) })
  const [dateTo, setDateTo]     = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData]         = useState<{ appointments: Appointment[]; calls: Call[]; contacts: Contact[]; messages: Message[] } | null>(null)
  const [loading, setLoading]   = useState(false)

  const addFilter = useCallback((q: any) => {
    if (user.role === 'admin' && activeClientId) return q.eq('client_id', activeClientId)
    if (user.role === 'client' && user.client_id) return q.eq('client_id', user.client_id)
    return q
  }, [user, activeClientId])

  const run = useCallback(() => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    const from = `${dateFrom}T00:00:00`, to = `${dateTo}T23:59:59`
    Promise.all([
      addFilter(sb.from('appointments').select('*').gte('date', from).lte('date', to).is('deleted_at', null).order('date', { ascending: false })),
      addFilter(sb.from('calls').select('*').gte('date', from).lte('date', to).order('date', { ascending: false })),
      addFilter(sb.from('contacts').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false })),
      addFilter(sb.from('messages').select('*').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false })),
    ]).then(([a, c, co, m]) => {
      setData({ appointments: (a.data as Appointment[]) ?? [], calls: (c.data as Call[]) ?? [], contacts: (co.data as Contact[]) ?? [], messages: (m.data as Message[]) ?? [] })
      setLoading(false)
    })
  }, [addFilter, dateFrom, dateTo])

  useEffect(() => { run() }, [run])

  const summary = data ? [
    { label: 'Appointments', value: data.appointments.length, icon: <CalendarDays className="h-5 w-5" />, color: '#7c3aed',
      breakdown: { Confirmed: data.appointments.filter(a => a.status === 'confirmed').length, Pending: data.appointments.filter(a => a.status === 'pending').length, Cancelled: data.appointments.filter(a => a.status === 'cancelled').length } },
    { label: 'Calls', value: data.calls.length, icon: <Phone className="h-5 w-5" />, color: '#2563eb',
      breakdown: { Completed: data.calls.filter(c => c.outcome === 'completed').length, Missed: data.calls.filter(c => c.outcome === 'missed').length, Voicemail: data.calls.filter(c => c.outcome === 'voicemail').length } },
    { label: 'New Contacts', value: data.contacts.length, icon: <Users className="h-5 w-5" />, color: '#059669',
      breakdown: { Active: data.contacts.filter(c => c.status === 'active').length, Lead: data.contacts.filter(c => c.status === 'lead').length, Inactive: data.contacts.filter(c => c.status === 'inactive').length } },
    { label: 'Messages', value: data.messages.length, icon: <MessageSquare className="h-5 w-5" />, color: '#d97706',
      breakdown: { Inbound: data.messages.filter(m => m.direction === 'inbound').length, Outbound: data.messages.filter(m => m.direction === 'outbound').length } },
  ] : []

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Activity summary for a custom date range" />
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
            <span className="text-slate-300 dark:text-slate-600">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
          </div>
          <button onClick={run} disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart2 className="h-3.5 w-3.5" />}
            {loading ? 'Loading…' : 'Run report'}
          </button>
          {data && (
            <div className="ml-auto flex flex-wrap gap-2">
              {[
                { label: 'Appts', rows: data.appointments.map(r => [r.email, r.appointment_type, r.date, r.status]), headers: ['Email','Type','Date','Status'], file: 'appointments.csv' },
                { label: 'Calls', rows: data.calls.map(c => [c.date, c.caller_number, formatDuration(c.duration_seconds), c.outcome]), headers: ['Date','Caller','Duration','Outcome'], file: 'calls.csv' },
                { label: 'Contacts', rows: data.contacts.map(r => [r.name, r.email ?? '', r.phone_number ?? '', r.status]), headers: ['Name','Email','Phone','Status'], file: 'contacts.csv' },
              ].map(e => (
                <button key={e.label} onClick={() => exportCSV(e.file, e.headers, e.rows)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-400 dark:hover:bg-white/[0.06]">
                  <Download className="h-3.5 w-3.5" />{e.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </GlassCard>
      {loading && <TableSkeleton cols={4} rows={3} />}
      {data && !loading && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map(s => (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="mb-3 flex items-center gap-2">
                  <span style={{ color: s.color }}>{s.icon}</span>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{s.label}</p>
                </div>
                <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>{s.value}</p>
                <div className="mt-3 space-y-1">
                  {Object.entries(s.breakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {data.appointments.length > 0 && (
            <GlassCard>
              <div className="border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Appointments ({data.appointments.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHead cols={['Contact', 'Type', 'Date', 'Status']} />
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {data.appointments.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                        <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300">{r.email}</td>
                        <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">{r.appointment_type}</td>
                        <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                        <td className="px-6 py-3"><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
          {data.calls.length > 0 && (
            <GlassCard>
              <div className="border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Call Logs ({data.calls.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <TableHead cols={['Caller', 'Date', 'Duration', 'Outcome']} />
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {data.calls.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                        <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300">{r.caller_number}</td>
                        <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDate(r.date)}</td>
                        <td className="px-6 py-3 text-sm text-slate-500 dark:text-slate-400">{formatDuration(r.duration_seconds)}</td>
                        <td className="px-6 py-3"><OutcomeBadge outcome={r.outcome} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}
          {data.appointments.length === 0 && data.calls.length === 0 && data.contacts.length === 0 && data.messages.length === 0 && (
            <EmptyState icon={BarChart2} label="No activity in this date range" sub="Try a wider date range to find data." />
          )}
        </>
      )}
    </div>
  )
}

// ─── Audit Log Page ───────────────────────────────────────────────────────────

function AuditLogPage({ user: _user }: PageProps) {
  const [rows, setRows]         = useState<AuditRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [tableError, setTableError] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => {
    setLoading(true)
    let q = sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100) as any
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`)
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`)
    q.then(({ data, error }: any) => {
      if (error?.code === '42P01') setTableError(true)
      else setRows((data as AuditRow[]) ?? [])
      setLoading(false)
    })
  }, [dateFrom, dateTo])

  const actionColor: Record<string, string> = {
    create: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    update: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    delete: 'bg-red-500/10 text-red-600 dark:text-red-400',
    login:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  }

  if (tableError) return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Admin activity history" />
      <GlassCard>
        <div className="px-6 py-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">audit_logs table not found</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs text-slate-400">Create it in Supabase to start tracking admin activity:</p>
          <pre className="mx-auto mt-4 max-w-xl overflow-x-auto rounded-xl bg-slate-900 p-4 text-left text-xs text-slate-300">{`create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_email text not null,
  action text not null,
  entity text not null,
  entity_id text,
  details text
);`}</pre>
        </div>
      </GlassCard>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Track every admin action across the portal" />
      <GlassCard>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
            <span className="text-slate-300 dark:text-slate-600">–</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-300" />
          </div>
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 transition-colors hover:text-slate-900 dark:border-white/[0.08] dark:text-slate-400">Clear</button>}
          <ExportButton onClick={() => exportCSV('audit_log.csv', ['Date','User','Action','Entity','ID','Details'],
            rows.map(r => [r.created_at, r.user_email, r.action, r.entity, r.entity_id ?? '', r.details ?? '']))} />
        </div>
        {loading ? <TableSkeleton cols={5} /> :
         rows.length === 0
           ? <EmptyState icon={ClipboardList} label="No audit entries yet" sub="Admin actions will be logged here automatically." />
           : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <TableHead cols={['Timestamp', 'User', 'Action', 'Entity', 'Details']} />
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-6 py-3 text-xs text-slate-400">{formatDate(r.created_at)}</td>
                    <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300">{r.user_email}</td>
                    <td className="px-6 py-3">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', actionColor[r.action.toLowerCase()] ?? actionColor.update)}>{r.action}</span>
                    </td>
                    <td className="px-6 py-3 text-sm capitalize text-slate-500 dark:text-slate-400">{r.entity}</td>
                    <td className="px-6 py-3 text-xs text-slate-400">{r.details ?? '—'}</td>
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

// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ user }: PageProps) {
  const [name, setName]     = useState(user.name ?? '')
  const [saving, setSaving] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return { calls: true, appointments: true, messages: true, contacts: true }
    return {
      calls:        localStorage.getItem('notif-calls')        !== 'false',
      appointments: localStorage.getItem('notif-appointments') !== 'false',
      messages:     localStorage.getItem('notif-messages')     !== 'false',
      contacts:     localStorage.getItem('notif-contacts')     !== 'false',
    }
  })

  async function saveName() {
    setSaving(true)
    const { error } = await sb.from('profiles').update({ name: name.trim() || null }).eq('id', user.id)
    if (error) showToast('Save failed: ' + error.message, 'error')
    else showToast('Name updated', 'success')
    setSaving(false)
  }

  function toggleNotif(key: string) {
    const next = !notifPrefs[key]
    setNotifPrefs(p => ({ ...p, [key]: next }))
    localStorage.setItem(`notif-${key}`, String(next))
  }

  const notifItems = [
    { key: 'calls',        label: 'New calls',        sub: 'Alert when DrizzleBot logs an inbound call',    icon: <Phone className="h-4 w-4" /> },
    { key: 'appointments', label: 'New appointments', sub: 'Alert when a booking is confirmed',             icon: <CalendarDays className="h-4 w-4" /> },
    { key: 'messages',     label: 'New messages',     sub: 'Alert on inbound message activity',             icon: <MessageSquare className="h-4 w-4" /> },
    { key: 'contacts',     label: 'New contacts',     sub: 'Alert when a new contact is created',           icon: <Users className="h-4 w-4" /> },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account and notification preferences" />
      <GlassCard>
        <div className="space-y-5 p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Account</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 text-xl font-bold text-white">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.email}</p>
              <p className="mt-0.5 text-xs capitalize text-slate-400">{user.role}</p>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Display name</label>
            <div className="mt-1 flex gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:focus:border-violet-500" />
              <button onClick={saveName} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 disabled:opacity-50">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
              </button>
            </div>
          </div>
        </div>
      </GlassCard>
      <GlassCard>
        <div className="p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Notification preferences</h2>
          <p className="mb-4 text-xs text-slate-400">Choose which real-time alerts appear in this browser session.</p>
          <div className="space-y-1">
            {notifItems.map(item => (
              <div key={item.key} className="flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">{item.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub}</p>
                  </div>
                </div>
                <button onClick={() => toggleNotif(item.key)}
                  className={cn('relative h-6 w-11 rounded-full transition-colors duration-200', notifPrefs[item.key] ? 'bg-violet-600' : 'bg-slate-200 dark:bg-white/[0.12]')}>
                  <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200', notifPrefs[item.key] ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>
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
  const [notifications, setNotifications]     = useState<Notification[]>([])
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
      if (data) setClients(data as Client[])
    })
  }, [user])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => { if (user && user.role !== 'admin' && page === 'controls') setPage('overview') }, [page, user])

  useEffect(() => {
    if (!user) return
    const push = (n: Notification) => { setNotifications(ns => [n, ...ns.slice(0, 49)]); showToast(n.text, 'info') }
    const channel = sb.channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls' }, ({ new: r }: any) => {
        push({ id: String(Date.now()), type: 'call', text: `New call from ${r.caller_number || 'Unknown'}`, timestamp: new Date().toISOString(), read: false })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, ({ new: r }: any) => {
        push({ id: String(Date.now()), type: 'appointment', text: `New appointment: ${r.appointment_type || 'Appointment'} for ${r.email || r.contact_phone || 'Unknown'}`, timestamp: new Date().toISOString(), read: false })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: r }: any) => {
        push({ id: String(Date.now()), type: 'message', text: `New message from ${r.sender_phone || r.sender_name || 'Unknown'} via ${r.channel || 'SMS'}`, timestamp: new Date().toISOString(), read: false })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, ({ new: r }: any) => {
        push({ id: String(Date.now()), type: 'message', text: `New contact: ${r.name || r.phone_number || 'Unknown'}`, timestamp: new Date().toISOString(), read: false })
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [user])

  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => { await sb.auth.signOut(); setUser(null) }
  const unreadCount = notifications.filter(n => !n.read).length
  const shift = sidebarCollapsed ? 'md:ml-[64px]' : 'md:ml-64'

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
        collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className={cn('flex min-h-screen flex-col transition-[margin] duration-300', shift)}>
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md dark:border-white/[0.07] dark:bg-[#0a0d14]/90 md:px-6">
          <button onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 md:hidden">
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <GlobalSearch clientId={activeClientId ?? user.client_id} isAdmin={user.role === 'admin'} onNavigate={setPage} />
          </div>
          <div ref={notifRef} className="relative">
            <button onClick={() => setNotifOpen(v => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-white">
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">{unreadCount}</span>}
            </button>
            {notifOpen && <NotificationsPanel notifications={notifications} onClose={() => setNotifOpen(false)}
              onMarkRead={id => setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))}
              onMarkAllRead={() => setNotifications(ns => ns.map(n => ({ ...n, read: true })))}
              onClear={() => setNotifications([])} />}
          </div>
        </header>

        <main className="flex-1 p-6">
          {page === 'overview'     && <OverviewPage     user={user} activeClientId={activeClientId} onNavigate={setPage} />}
          {page === 'appointments' && <AppointmentsPage user={user} activeClientId={activeClientId} />}
          {page === 'calendar'     && <CalendarPage     user={user} activeClientId={activeClientId} />}
          {page === 'calls'        && <CallLogsPage     user={user} activeClientId={activeClientId} />}
          {page === 'contacts'     && <ContactsPage     user={user} activeClientId={activeClientId} />}
          {page === 'messages'     && <MessagesPage     user={user} activeClientId={activeClientId} />}
          {page === 'reports'  && <ReportsPage  user={user} activeClientId={activeClientId} />}
          {page === 'profile'  && <ProfilePage  user={user} activeClientId={activeClientId} />}
          {page === 'users'    && user.role === 'admin' && <UserManagementPage user={user} activeClientId={activeClientId} />}
          {page === 'controls' && user.role === 'admin' && <ControlsPage      user={user} activeClientId={activeClientId} />}
          {page === 'audit'    && user.role === 'admin' && <AuditLogPage       user={user} activeClientId={activeClientId} />}
        </main>
      </div>
      <ToastContainer />
    </div>
  )
}
