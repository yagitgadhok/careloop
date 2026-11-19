import type { Env } from "../config/env.js";
import { assertDevelopmentSender, type OtpSender } from "./otp-sender.js";

/** `+919876543210` → `+91******3210`. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}

/**
 * Local development only: prints the code to the API console. Written straight
 * to stdout, never through the logger, so it can't reach shared log storage.
 */
export class ConsoleOtpSender implements OtpSender {
  constructor(env: Pick<Env, "APP_ENV">) {
    assertDevelopmentSender(env, "The console OTP sender");
  }

  send(phone: string, code: string): Promise<void> {
    process.stdout.write(`[dev otp] ${maskPhone(phone)} code ${code}\n`);
    return Promise.resolve();
  }
}
