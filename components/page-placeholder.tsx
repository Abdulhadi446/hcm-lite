import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function PagePlaceholder({ title, purpose, capabilities }: {
  title: string
  purpose: string
  capabilities: string[]
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{purpose}</p>
        </div>
        <Separator orientation="vertical" className="hidden lg:block" />
      </div>
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Coming in the next milestone</CardTitle>
          <CardDescription>This module is planned for an upcoming milestone. The capabilities below will be built here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {capabilities.map((cap, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 shrink-0 items-center rounded-full border border-primary bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-medium">
                {i + 1}
              </span>
              <p className="text-muted-foreground leading-relaxed">{cap}</p>
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <span className="text-xs text-muted-foreground">Placeholder panel — no data shown in M0.</span>
        </CardFooter>
      </Card>
    </div>
  )
}
