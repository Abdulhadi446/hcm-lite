"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LockIcon, ArrowRightIcon, MailIcon, CheckCircle2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface ChangePasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<ChangePasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (serverError) setServerError(null)
  }, [serverError])

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.currentPassword) next.currentPassword = "Current password is required"
    if (!form.newPassword) next.newPassword = "New password is required"
    else if (form.newPassword.length < 8) next.newPassword = "At least 8 characters"
    if (!form.confirmPassword) next.confirmPassword = "Confirm your new password"
    else if (form.confirmPassword !== form.newPassword) next.confirmPassword = "Passwords do not match"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setServerError(null)

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setServerError(data.error || "Could not change password.")
        return
      }

      setCompleted(true)
      toast.success("Password changed")
      setTimeout(() => router.push("/dashboard"), 900)
    } catch {
      setServerError("Unable to reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md border-background shadow-xl text-center">
          <CardHeader className="pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 mx-auto mb-4">
              <CheckCircle2Icon className="size-7" />
            </div>
            <CardTitle className="text-xl font-semibold">Password changed</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              You can now continue to your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => router.push("/dashboard")}>
              Go to dashboard
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 md:p-12">
      <Card className="w-full max-w-md border-background shadow-xl">
        <CardHeader className="text-center pb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground mx-auto mb-4">
            <LockIcon className="size-5" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">Change password</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Set a new password for your account.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-0">
          {serverError && (
            <Alert variant="destructive" className="border-destructive/50">
              <AlertTitle>Change failed</AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={form.currentPassword}
                onChange={(e) => {
                  setForm({ ...form, currentPassword: e.target.value })
                  clearError("currentPassword")
                }}
                placeholder="••••••••"
                disabled={submitting}
                aria-invalid={!!errors.currentPassword}
              />
              {errors.currentPassword && (
                <p className="text-destructive text-xs">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={form.newPassword}
                onChange={(e) => {
                  setForm({ ...form, newPassword: e.target.value })
                  clearError("newPassword")
                }}
                placeholder="••••••••"
                disabled={submitting}
                aria-invalid={!!errors.newPassword}
              />
              {errors.newPassword && <p className="text-destructive text-xs">{errors.newPassword}</p>}
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => {
                  setForm({ ...form, confirmPassword: e.target.value })
                  clearError("confirmPassword")
                }}
                placeholder="••••••••"
                disabled={submitting}
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <p className="text-destructive text-xs">{errors.confirmPassword}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Changing…" : "Change password"}
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
