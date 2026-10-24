"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Building2Icon,
  CheckCircle2Icon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { BrandMark, BrandPanel } from "@/components/brand/brand-panel"
import { cn } from "@/lib/utils"

type SetupStep = 1 | 2

interface SetupForm {
  companyName: string
  officeStart: string
}

interface AdminForm {
  name: string
  email: string
  password: string
}

export default function SetupPage() {
  return (
    <div className="relative flex min-h-svh flex-col bg-background lg:h-svh lg:flex-row lg:overflow-hidden">
      {/* Product panel — same surface as the sign-in screen, painted from the
          static HTML so the first frame is already branded. */}
      <BrandPanel className="hidden h-full shrink-0 lg:flex lg:w-[46%]" />

      <div className="flex flex-1 flex-col lg:overflow-y-auto">
        {/* Mobile brand bar */}
        <div className="flex items-center border-b border-border px-5 py-4 lg:hidden">
          <BrandMark />
        </div>

        <main className="flex flex-1 items-start justify-center px-5 py-9 sm:px-8 lg:items-center lg:px-14 lg:py-14">
          <Suspense fallback={<SetupFormSkeleton />}>
            <SetupWizard />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function SetupFormSkeleton() {
  return (
    <div className="w-full max-w-[26rem] animate-pulse" aria-hidden="true">
      <div className="flex items-baseline justify-between gap-3">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <div className="h-1 flex-1 rounded-full bg-primary/30" />
        <div className="h-1 flex-1 rounded-full bg-muted" />
      </div>
      <div className="mt-6 h-7 w-56 rounded bg-muted" />
      <div className="mt-3 h-4 w-full rounded bg-muted" />
      <div className="mt-7 space-y-6">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-10 w-full rounded-lg bg-muted" />
        </div>
        <div className="space-y-3 border-t border-border pt-6">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-10 w-full rounded-lg bg-muted sm:max-w-[10.5rem]" />
          <div className="h-14 w-full rounded-lg bg-muted" />
        </div>
        <div className="h-10 w-full rounded-lg bg-primary/15" />
      </div>
    </div>
  )
}

function SetupWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<SetupStep>(1)
  const [initialized, setInitialized] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [setup, setSetup] = useState<SetupForm>({
    companyName: "",
    officeStart: "09:00",
  })
  const [admin, setAdmin] = useState<AdminForm>({
    name: "",
    email: "",
    password: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  // On mount, check if already initialized
  useEffect(() => {
    fetch("/api/setup/status", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ initialized: boolean }>)
      .then((data) => {
        if (data.initialized) {
          router.replace("/login")
        }
        setInitialized(data.initialized)
      })
      .catch(() => setInitialized(false))
  }, [router])

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (serverError) setServerError(null)
  }, [serverError])

  const validateStep = (): boolean => {
    const next: Record<string, string> = {}
    if (step === 1) {
      if (!setup.companyName.trim()) next.companyName = "Company name is required"
    } else {
      if (!admin.name.trim()) next.name = "Full name is required"
      if (!admin.email.trim()) next.email = "Email is required"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) next.email = "Enter a valid email"
      if (!admin.password) next.password = "Password is required"
      else if (admin.password.length < 8) next.password = "Password must be at least 8 characters"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateStep()) return

    setSubmitting(true)
    setServerError(null)

    try {
      if (step === 1) {
        setStep(2)
        return
      }

      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: setup.companyName.trim(),
          adminName: admin.name.trim(),
          adminEmail: admin.email.trim(),
          adminPassword: admin.password,
          officeStart: setup.officeStart,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) {
          toast.error("This company has already been set up")
          router.replace("/login")
          return
        }
        setServerError(data.error || "Setup failed. Please try again.")
        return
      }

      toast.success("Company created. Welcome to HCM Lite.", {
        description: "You can now sign in with your admin account.",
      })
      router.push("/login?setup=success")
    } catch {
      setServerError("Unable to reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Redirect if already initialized (defensive)
  if (initialized === true) {
    return null
  }

  const showSuccess = searchParams.get("setup") === "success"

  return (
    <>
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
          <Card className="animate-rise w-full max-w-sm items-center p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CheckCircle2Icon className="size-6" />
            </div>
            <CardTitle className="mt-4 text-xl">Company created</CardTitle>
            <CardDescription>
              Your HCM Lite workspace is ready. Sign in with the admin account you just created.
            </CardDescription>
            <Button className="mt-6 h-10 w-full" onClick={() => router.push("/login")}>
              Go to sign in
            </Button>
          </Card>
        </div>
      )}

      <div className="animate-rise w-full max-w-[26rem]">
        {/* Step progress */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
              Step {step} of 2
            </p>
            <p className="text-xs text-muted-foreground">
              {step === 1 ? "Company profile" : "Admin account"}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="h-1 flex-1 rounded-full bg-primary" />
            <span
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                step === 2 ? "bg-primary" : "bg-border",
              )}
            />
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {step === 1 ? "Set up your company" : "Create admin account"}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {step === 1
            ? "Name your organization and set the working day. This takes about a minute."
            : "The first Administrator gets full access to every module."}
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-7">
          {serverError && (
            <Alert variant="destructive" className="border-destructive/40">
              <AlertTitle>Setup failed</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {step === 1 ? (
            <>
              <section className="space-y-4">
                <div>
                  <h2 className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                    Organization
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Shown across the workspace and on every payslip.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Company name</Label>
                  <Input
                    id="companyName"
                    value={setup.companyName}
                    onChange={(e) => {
                      setSetup({ ...setup, companyName: e.target.value })
                      clearError("companyName")
                    }}
                    placeholder="e.g. Acme Corporation"
                    autoComplete="organization"
                    disabled={submitting}
                    aria-invalid={!!errors.companyName}
                    className="h-10 text-sm"
                  />
                  {errors.companyName && (
                    <p className="text-xs text-destructive">{errors.companyName}</p>
                  )}
                </div>
              </section>

              <section className="space-y-4 border-t border-border pt-6">
                <div>
                  <h2 className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                    Working hours
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Lateness is measured from the start of the day.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="officeStart">Day starts at</Label>
                  <Input
                    id="officeStart"
                    type="time"
                    value={setup.officeStart}
                    onChange={(e) => setSetup({ ...setup, officeStart: e.target.value })}
                    disabled={submitting}
                    className="h-10 w-full text-sm sm:max-w-[10.5rem]"
                  />
                </div>

                <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <SparklesIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                  />
                  <span>
                    A <span className="font-medium text-foreground">15-minute grace period</span> is
                    applied automatically. Weekends and the half-day threshold can be tuned later in
                    Organization.
                  </span>
                </p>
              </section>

              <div className="space-y-3">
                <Button type="submit" size="lg" className="h-10 w-full" disabled={submitting}>
                  {submitting ? "Creating…" : "Continue"}
                  <ArrowRightIcon className="ml-1 size-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Everything can be changed later.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
                <Building2Icon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="font-medium break-words text-foreground">
                  {setup.companyName || "Your company"}
                </span>
                <span aria-hidden="true" className="text-border">
                  |
                </span>
                <span className="text-muted-foreground">Day starts {setup.officeStart}</span>
              </div>

              <section className="space-y-4">
                <div>
                  <h2 className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                    Administrator
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Your name appears on approvals and announcements.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminName">Full name</Label>
                  <Input
                    id="adminName"
                    value={admin.name}
                    onChange={(e) => {
                      setAdmin({ ...admin, name: e.target.value })
                      clearError("name")
                    }}
                    placeholder="e.g. Jane Doe"
                    autoComplete="name"
                    disabled={submitting}
                    aria-invalid={!!errors.name}
                    className="h-10 text-sm"
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Work email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={admin.email}
                    onChange={(e) => {
                      setAdmin({ ...admin, email: e.target.value })
                      clearError("email")
                    }}
                    placeholder="jane@acme.com"
                    autoComplete="email"
                    disabled={submitting}
                    aria-invalid={!!errors.email}
                    className="h-10 text-sm"
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </section>

              <section className="space-y-4 border-t border-border pt-6">
                <div>
                  <h2 className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                    Sign-in credentials
                  </h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    You can change this from your profile at any time.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword">Password</Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    value={admin.password}
                    onChange={(e) => {
                      setAdmin({ ...admin, password: e.target.value })
                      clearError("password")
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={submitting}
                    aria-invalid={!!errors.password}
                    className="h-10 text-sm"
                  />
                  {errors.password ? (
                    <p className="text-xs text-destructive">{errors.password}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">At least 8 characters.</p>
                  )}
                </div>
              </section>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="h-10"
                  disabled={submitting}
                  onClick={() => {
                    setStep(1)
                    setErrors({})
                    setServerError(null)
                  }}
                >
                  <ArrowLeftIcon className="size-4" />
                  Back
                </Button>
                <Button type="submit" size="lg" className="h-10 flex-1" disabled={submitting}>
                  {submitting ? "Creating account…" : "Create admin account"}
                  <ArrowRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </>
          )}
        </form>

        <p className="mt-7 border-t border-border pt-5 text-xs text-muted-foreground">
          Already set up?{" "}
          <a
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={(e) => {
              e.preventDefault()
              router.push("/login")
            }}
          >
            Sign in
          </a>
        </p>
      </div>
    </>
  )
}
