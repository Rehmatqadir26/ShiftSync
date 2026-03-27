export type ViolationCode =
  | "SKILL_MISMATCH"
  | "LOCATION_CERT_INACTIVE"
  | "LOCATION_CERT_MISSING"
  | "DOUBLE_BOOK"
  | "REST_WINDOW"
  | "AVAILABILITY"
  | "DAILY_HOURS_HARD"
  | "DAILY_HOURS_WARN"
  | "WEEKLY_HOURS_WARN"
  | "CONSECUTIVE_SIX_WARN"
  | "CONSECUTIVE_SEVEN_BLOCK";

export type Violation = {
  code: ViolationCode;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type AssignmentCheckResult =
  | { ok: true; warnings: Violation[] }
  | { ok: false; violations: Violation[]; warnings: Violation[] };
