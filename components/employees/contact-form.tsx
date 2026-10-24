"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Self-service contact editor — employees may only change phone + address. */
export function ContactForm({
  initial,
  submitting,
  onCancel,
  onSubmit,
}: {
  initial: { phone: string; address: string };
  submitting?: boolean;
  onCancel?: () => void;
  onSubmit: (values: { phone: string; address: string }) => void;
}) {
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ phone: phone.trim(), address: address.trim() });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="contact-phone">Phone</Label>
        <Input
          id="contact-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+92 300 1234567"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="contact-address">Address</Label>
        <Textarea
          id="contact-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, city"
          rows={3}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Employees can only update their own phone number and address. Ask HR for
        job or salary changes.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save contact details"}
        </Button>
      </div>
    </form>
  );
}
