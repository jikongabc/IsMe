"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/admin/Field";

export function PasswordForm({ source }: { source: "database" | "env" }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSource, setActiveSource] = useState(source);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : data.error?.fieldErrors?.newPassword?.[0] ||
                data.error?.fieldErrors?.confirmPassword?.[0] ||
                data.error?.formErrors?.[0] ||
                "failed",
        );
      }
      setActiveSource("database");
      setCurrent("");
      setNew("");
      setConfirm("");
      setMessage("password updated · stored as current scrypt policy hash in sqlite");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="terminal-window max-w-md space-y-3 p-5">
      <p className="text-xs text-ink-faint">
        auth source: <span className="text-accent">{activeSource}</span>
        {activeSource === "env" ? " (ADMIN_PASSWORD)" : " (sqlite hash overrides env)"}
      </p>
      <div>
        <Label>current password</Label>
        <Input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <div>
        <Label>new password (≥15)</Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={15}
          autoComplete="new-password"
        />
      </div>
      <div>
        <Label>confirm new password</Label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={15}
          autoComplete="new-password"
        />
      </div>
      <p className="text-xs leading-5 text-ink-faint">
        Use a password manager or a long passphrase. Repeated, sequential, common, and template
        values are rejected; spaces and Unicode are allowed.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "updating…" : "change password"}
      </Button>
    </form>
  );
}
