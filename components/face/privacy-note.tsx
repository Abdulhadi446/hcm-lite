import { ShieldCheckIcon } from "lucide-react";

export function PrivacyNote({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          <ShieldCheckIcon className="size-3.5 text-muted-foreground" aria-hidden />
          What happens to your face data
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          The camera runs only while this page is open. Your browser computes a
          numeric 1024-value face template and sends only that template with a
          single-use challenge — no photos, video or image blobs ever leave this
          device. Your template is stored on the server and used solely to
          confirm it&apos;s you at check-in.
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Detection isn&apos;t verification, and anti-spoofing here isn&apos;t
          certified liveness detection — photos or replays can defeat it. Treat
          face check-in as a convenience factor on top of your password, not a
          biometric authenticator.
        </p>
      </div>
    </div>
  );
}
