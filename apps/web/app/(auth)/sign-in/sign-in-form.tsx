"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { apiRoutes, errorCodeOf } from "@careloop/shared/api";
import { ErrorCode } from "@careloop/shared/errors";
import { OTP_CODE_LENGTH, toIndianMobile } from "@careloop/shared/schemas";
import { Button } from "@careloop/ui/components/button";
import { FieldError, Input } from "@careloop/ui/components/input";
import { OtpInput } from "@careloop/ui/components/otp-input";
import { useApi } from "../../../lib/api/browser";

const RESEND_SECONDS = 30;

type Step = "phone" | "code";
type Busy = "idle" | "sending" | "verifying";
/** Every rate limit and lockout shares one message, so nothing hints at whether a number is registered. */
type Problem = "invalidPhone" | "wrongCode" | "locked" | ErrorCode;

function problemFrom(error: unknown, step: Step): Problem {
  const code = errorCodeOf(error);
  if (code === ErrorCode.rate_limited) return "locked";
  if (step === "phone" && code === ErrorCode.validation_failed) return "invalidPhone";
  if (step === "code" && code === ErrorCode.invalid_code) return "wrongCode";
  return code;
}

export function SignInForm() {
  const t = useTranslations("signIn");
  const tErrors = useTranslations("errors");
  const api = useApi();
  const phoneId = useId();
  const errorId = useId();

  const [step, setStep] = useState<Step>("phone");
  const [busy, setBusy] = useState<Busy>("idle");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const resendAt = useRef(0);

  useEffect(() => {
    if (step !== "code") return;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [step]);

  const sendCode = async () => {
    const national = toIndianMobile(phone);
    if (!national) {
      setProblem("invalidPhone");
      return;
    }
    setBusy("sending");
    setProblem(null);
    try {
      await api.request(apiRoutes.auth.requestOtp, { body: { phone: national } });
      resendAt.current = Date.now() + RESEND_SECONDS * 1000;
      setSecondsLeft(RESEND_SECONDS);
      setCode("");
      setStep("code");
    } catch (error) {
      setProblem(problemFrom(error, "phone"));
    } finally {
      setBusy("idle");
    }
  };

  const verify = async (value: string) => {
    const national = toIndianMobile(phone);
    if (!national || value.length !== OTP_CODE_LENGTH) return;
    setBusy("verifying");
    setProblem(null);
    try {
      const result = await api.request(apiRoutes.auth.verifyOtp, {
        body: { phone: national, code: value },
      });
      const [only, ...others] = result.organisations;
      if (!only) {
        window.location.assign("/no-clinic");
      } else if (others.length > 0) {
        window.location.assign("/choose-clinic");
      } else {
        await api.request(apiRoutes.auth.selectOrg, {
          body: { organisationId: only.organisationId },
        });
        window.location.assign("/");
      }
      // Stay busy while the browser navigates away.
    } catch (error) {
      setProblem(problemFrom(error, "code"));
      setCode("");
      setBusy("idle");
    }
  };

  const onPhoneSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendCode();
  };

  const onCodeSubmit = (event: FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  const problemText = problem
    ? problem === "invalidPhone" || problem === "wrongCode" || problem === "locked"
      ? t(problem)
      : tErrors(problem)
    : null;

  if (step === "phone") {
    return (
      <form onSubmit={onPhoneSubmit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor={phoneId} className="text-sm font-medium">
            {t("phoneLabel")}
          </label>
          <div className="flex items-stretch gap-2">
            <span
              aria-hidden="true"
              className="flex min-h-11 items-center rounded-md border border-input bg-muted px-3 text-sm font-medium text-muted-foreground"
            >
              {t("countryCode")}
            </span>
            <Input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t("phonePlaceholder")}
              invalid={problem === "invalidPhone"}
              errorId={errorId}
              aria-describedby={`${phoneId}-hint`}
              disabled={busy !== "idle"}
            />
          </div>
          <p id={`${phoneId}-hint`} className="text-sm text-muted-foreground">
            {t("phoneHint")}
          </p>
          {problemText ? <FieldError id={errorId}>{problemText}</FieldError> : null}
        </div>
        <Button type="submit" size="lg" loading={busy === "sending"}>
          {busy === "sending" ? t("sending") : t("sendCode")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onCodeSubmit} noValidate className="flex flex-col gap-5">
      <div
        role="status"
        className="flex items-start gap-3 rounded-lg border border-primary/20 bg-secondary/60 p-3 text-sm text-secondary-foreground"
      >
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{t("codeSent")}</span>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">{t("codeLabel")}</legend>
        <OtpInput
          value={code}
          onChange={(value) => {
            setCode(value);
            if (problem === "wrongCode") setProblem(null);
            if (value.length === OTP_CODE_LENGTH && busy === "idle") void verify(value);
          }}
          length={OTP_CODE_LENGTH}
          autoFocus
          disabled={busy !== "idle"}
          invalid={problem === "wrongCode"}
          errorId={errorId}
          className="justify-between sm:justify-start"
        />
        {problemText ? <FieldError id={errorId}>{problemText}</FieldError> : null}
      </fieldset>

      <Button
        type="submit"
        size="lg"
        loading={busy === "verifying"}
        disabled={code.length !== OTP_CODE_LENGTH}
      >
        {busy === "verifying" ? t("verifying") : t("verify")}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStep("phone");
            setProblem(null);
            setCode("");
          }}
          disabled={busy !== "idle"}
        >
          <ArrowLeft aria-hidden="true" />
          {t("changeNumber")}
        </Button>
        {secondsLeft > 0 ? (
          <span aria-live="polite" className="text-muted-foreground tabular-nums">
            {t("resendIn", { seconds: secondsLeft })}
          </span>
        ) : (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => void sendCode()}
            loading={busy === "sending"}
            disabled={busy !== "idle"}
          >
            {t("resend")}
          </Button>
        )}
      </div>
    </form>
  );
}
