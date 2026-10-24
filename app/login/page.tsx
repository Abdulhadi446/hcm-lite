"use client"

import { Suspense, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { MailIcon, LockIcon, ArrowRightIcon, LockOpenIcon, InfoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginFormView />
    </Suspense>
  )
}

function LoginSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="h-96 w-full max-w-md animate-pulse rounded-xl border border-border bg-muted/40" />
    </div>
  )
}

function LoginFormView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitting, setSubmitting] = useState(false)
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
    <div className="min-h-screen bg-background flex items-center justify-center p-6 md:p-12">
      <Card className="w-full max-w-md border-background shadow-xl">
        <CardHeader className="text-center pb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground mx-auto mb-4">
            <LockOpenIcon className="size-5" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">Sign in</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Enter your work email and password to access HCM Lite.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-0">
          {serverError && (
            <Alert variant="destructive" className="border-destructive/50">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value })
                  clearError("email")
                }}
                placeholder="jane@acme.com"
                disabled={submitting}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-destructive text-xs">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value })
                  clearError("password")
                }}
                placeholder="••••••••"
                disabled={submitting}
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-destructive text-xs">{errors.password}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground cursor-pointer select-none">
                Forgot your password?
              </label>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </form>
        </CardContent>

        <CardFooter className="border-t border-background pt-6 space-y-3">
          <p className="text-xs text-center text-muted-foreground">
            New to HCM Lite?{" "}
            <a
              href="/setup"
              className="text-primary font-medium hover:underline"
            >
              Set up your company
            </a>
          </p>
          {setupDone && (
            <Alert>
              <AlertTitle className="flex items-start gap-2">
                <InfoIcon className="size-4 shrink-0 mt-0.5" />
                Setup complete
              </AlertTitle>
              <AlertDescription className="text-xs">
                Your company has been created. Sign in with the admin account you just created.
              </AlertDescription>
            </Alert>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
