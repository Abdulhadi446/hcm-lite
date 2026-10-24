"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { ArrowRightIcon, Building2Icon, CheckCircle2Icon, ShieldCheckIcon, SparklesIcon, UsersIcon, MailIcon, LockIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"

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
    <Suspense fallback={<SetupSkeleton />}>
      <SetupWizard />
    </Suspense>
  )
}

function SetupSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="h-[28rem] w-full max-w-5xl animate-pulse rounded-xl border border-border bg-muted/40" />
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
    <div className="min-h-screen bg-background">
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <Card className="w-full max-w-sm p-8 text-center border-border shadow-xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 mx-auto mb-4">
              <CheckCircle2Icon className="size-7" />
            </div>
            <CardTitle className="text-xl">Company created</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your HCM Lite workspace is ready. Sign in with the admin account you just created.
            </CardDescription>
            <Button className="w-full mt-6" onClick={() => router.push("/login")}>
              Go to sign in
            </Button>
          </Card>
        </div>
      )}

      <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
        {/* Left: product panel */}
        <div className="hidden lg:flex lg:w-1/2 flex-col bg-primary text-primary-foreground p-10">
          <div className="flex items-center gap-2 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary-foreground text-primary text-xs font-medium">
              HCM
            </div>
            <span className="text-xl font-bold tracking-tight">HCM Lite</span>
          </div>
          <p className="text-primary-foreground/90 text-sm leading-relaxed mb-8 max-w-[420px]">
            An AI-assisted HR system built for real teams. Manage employees, attendance,
            leave, and payroll — from first-run setup to finalized payroll.
          </p>

          <div className="space-y-6 flex-1">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="size-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm">Three roles, one system</h3>
                <p className="text-primary-foreground/80 text-xs mt-0.5">
                  Admin, HR, and Employee — each with its own menu, data scope, and dashboard.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <UsersIcon className="size-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm">Everything HR needs</h3>
                <p className="text-primary-foreground/80 text-xs mt-0.5">
                  Employees, attendance, leave, payroll, organization, announcements, and audit.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <SparklesIcon className="size-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm">AI assistant</h3>
                <p className="text-primary-foreground/80 text-xs mt-0.5">
                  Answers only from your data via tool calling — dashboard summaries, smart leave,
                  and policy Q&A, with answers labelled AI-generated.
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-8 border-white/20" />
          <div className="text-xs text-primary-foreground/70 leading-relaxed">
            Fresh install starts empty. Admin sets up the company, then HR registers employees
            and everything flows from there.
          </div>
        </div>

        {/* Right: form */}
        <div className="flex flex-col lg:w-1/2">
          <div className="flex-1 flex items-center justify-center p-8 lg:p-12">
            <Card className="w-full max-w-md border-background shadow-lg">
              <CardHeader className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-6">
                <div>
                  <CardTitle className="text-xl font-semibold tracking-tight">
                    {step === 1 ? "Set up your company" : "Create admin account"}
                  </CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">
                    {step === 1
                      ? "Start by naming your organization."
                      : "Create the first administrator account."}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  {step === 1 && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-medium">1</div>
                  )}
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                    {step === 1 ? "2" : "2"}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-0 lg:pt-2">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {serverError && (
                    <Alert variant="destructive" className="border-destructive/50">
                      <AlertTitle>Setup failed</AlertTitle>
                      <AlertDescription>{serverError}</AlertDescription>
                    </Alert>
                  )}

                  {step === 1 ? (
                    <>
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
                          disabled={submitting}
                          aria-invalid={!!errors.companyName}
                        />
                        {errors.companyName && (
                          <p className="text-destructive text-xs">{errors.companyName}</p>
                        )}
                      </div>

                      <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="officeStart">Office hours (defaults)</Label>
                        <p className="text-xs text-muted-foreground">
                          When the working day starts — lateness is measured from here. Grace period,
                          half-day threshold and weekends are set later in Organization settings.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="officeStart">Starts at</Label>
                            <Input
                              id="officeStart"
                              type="time"
                              value={setup.officeStart}
                              onChange={(e) => setSetup({ ...setup, officeStart: e.target.value })}
                              disabled={submitting}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 flex justify-end">
                        <Button
                          type="submit"
                          variant="default"
                          className="w-full px-8"
                          disabled={submitting}
                        >
                          {submitting ? "Creating…" : "Continue"}
                          <ArrowRightIcon className="ml-2 size-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
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
                          disabled={submitting}
                          aria-invalid={!!errors.name}
                        />
                        {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label htmlFor="adminEmail">Work email</Label>
                        </div>
                        <Input
                          id="adminEmail"
                          type="email"
                          value={admin.email}
                          onChange={(e) => {
                            setAdmin({ ...admin, email: e.target.value })
                            clearError("email")
                          }}
                          placeholder="jane@acme.com"
                          disabled={submitting}
                          aria-invalid={!!errors.email}
                        />
                        {errors.email && <p className="text-destructive text-xs">{errors.email}</p>}
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
                          disabled={submitting}
                          aria-invalid={!!errors.password}
                        />
                        {errors.password && (
                          <p className="text-destructive text-xs">{errors.password}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          At least 8 characters.
                        </p>
                      </div>

                      <div className="mt-8 flex justify-end">
                        <Button
                          type="submit"
                          variant="default"
                          className="w-full px-8"
                          disabled={submitting}
                        >
                          {submitting ? "Creating account…" : "Create admin account"}
                          <ArrowRightIcon className="ml-2 size-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </form>
              </CardContent>
              <CardFooter className="border-t border-background pt-6">
                <p className="text-xs text-muted-foreground text-center">
                  Already set up?{" "}
                  <a
                    href="/login"
                    className="text-primary font-medium hover:underline"
                    onClick={(e) => {
                      e.preventDefault()
                      router.push("/login")
                    }}
                  >
                    Sign in
                  </a>
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
