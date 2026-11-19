import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "careloop:public";
export const IS_SESSION_ONLY = "careloop:session-only";

/** Reachable without a session (OTP request and verify, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Needs a live session, but no active organisation (org select, session, logout). */
export const SessionOnly = () => SetMetadata(IS_SESSION_ONLY, true);
