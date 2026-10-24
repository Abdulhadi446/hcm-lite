"use client"

import { Suspense, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowRightIcon,
  CircleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  MailIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BrandMark, BrandPanel } from "@/components/brand/brand-panel"

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background lg:flex-row">
      {/* The brand panel is outside Suspense so it paints straight from the
          static HTML — only the form waits for the client. */}
      <BrandPanel className="hidden shrink-0 lg:flex lg:w-[46%]" />

      <div className="flex flex-1 flex-col">
        {/* Mobile brand bar — the split layout collapses into one column. */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 lg:hidden">
          <BrandMark />
          <a
            href="/setup"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Set up company
          </a>
        </div>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-14 lg:py-16">
          <Suspense fallback={<LoginFormSkeleton />}>
            <LoginFormView />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="w-full max-w-[22.5rem] animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="mt-3 h-7 w-28 rounded bg-muted" />
      <div className="mt-2.5 h-4 w-full rounded bg-muted" />
      <div className="mt-7 space-y-5">
        <div className="space-y-2">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-10 w-full rounded-lg bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-muted" />
          <div className="h-10 w-full rounded-lg bg-muted" />
        </div>
        <div className="h-10 w-full rounded-lg bg-primary/15" />
      </div>
      <div className="mt-8 border-t border-border pt-5">
        <div className="h-3 w-52 rounded bg-muted" />
      </div>
    </div>
  )
}

function LoginFormView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const setupDone = searchParams.get("setup") === "success"

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (serverError) setServerError(null)
  }, [serverError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const next: Record<string, string> = {}
    if (!form.email.trim()) next.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email"
    if (!form.password) next.password = "Password is required"
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    setServerError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 403) {
          setServerError("This account is inactive. Contact your administrator.")
        } else {
          setServerError(data.error || "Invalid email or password.")
        }
        return
      }

      const user = data.user as { role?: string; mustChangePassword?: boolean } | undefined

      if (user?.mustChangePassword) {
        router.push("/change-password")
        return
      }

      toast.success("Welcome back")
      router.push("/dashboard")
    } catch {
      setServerError("Unable to reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[22.5rem]">
      <div className="animate-rise">
        <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Welcome back
        </p>
        <h1 className="mt-2.5 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Use the work email your administrator set up for you.
        </p>
      </div>

      {setupDone && (
        <Alert className="animate-rise mt-6 border-primary/25 bg-primary/5">
          <CircleCheckIcon className="text-primary" />
          <AlertTitle>Setup complete</AlertTitle>
          <AlertDescription className="text-xs">
            Your company is ready. Sign in with the admin account you just created.
          </AlertDescription>
        </Alert>
      )}

      {serverError && (
        <Alert variant="destructive" className="animate-rise mt-6 border-destructive/40">
          <AlertTitle>Sign in failed</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit}
        className="animate-rise mt-7 space-y-5"
        style={{ animationDelay: "80ms" }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <MailIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value })
                clearError("email")
              }}
              placeholder="jane@acme.com"
              disabled={submitting}
              aria-invalid={!!errors.email}
              className="h-10 pl-9 text-sm"
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value })
                clearError("password")
              }}
              placeholder="••••••••"
              disabled={submitting}
              aria-invalid={!!errors.password}
              className="h-10 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide characters" : "Show characters"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" />
              ) : (
                <EyeIcon className="size-4" />
              )}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
        </div>

        <Button type="submit" size="lg" className="h-10 w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
          <ArrowRightIcon data-icon="inline-end" className="ml-1 size-4" />
        </Button>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Locked out? Ask your administrator to reset your password.
        </p>
      </form>

      <div
        className="animate-rise mt-8 flex items-center gap-2.5 border-t border-border pt-5"
        style={{ animationDelay: "140ms" }}
      >
        <InfoIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          New to HCM Lite?{" "}
          <a
            href="/setup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Set up your company
          </a>
        </p>
      </div>
    </div>
  )
}
