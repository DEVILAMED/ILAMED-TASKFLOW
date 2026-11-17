"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string };

export default function PasswordInput({ id, className = "", disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={`soft-input h-12 w-full rounded-2xl pl-4 pr-12 text-sm ${className}`}
      />
      <button
        type="button"
        aria-label={toggleLabel}
        aria-controls={id}
        title={toggleLabel}
        disabled={disabled}
        className="absolute inset-y-0 right-1 my-auto flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  );
}
