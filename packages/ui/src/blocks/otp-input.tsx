"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/input-otp";

export function OtpInput({ name = "code", autoFocus = true }: { name?: string; autoFocus?: boolean }) {
  return (
    <InputOTP
      maxLength={6}
      name={name}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      containerClassName="justify-center"
    >
      <InputOTPGroup>
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
