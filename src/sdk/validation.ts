import { CLAIM_TYPES, type CreateClaimRequest } from "../shared/types";
import { ValidationError } from "./errors";

const DIAGNOSIS_CODE_PATTERN = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidCreateClaimRequest(value: CreateClaimRequest): void {
  const fields: Record<string, string> = {};
  const record: Record<string, unknown> = isRecord(value) ? value : {};

  const policyId = readString(record.policyId, "policyId", fields);
  const claimType = readString(record.claimType, "claimType", fields);
  const diagnosisCode = readString(record.diagnosisCode, "diagnosisCode", fields);
  const treatmentDate = readString(record.treatmentDate, "treatmentDate", fields);
  const amount = record.amount;
  const currency = readString(record.currency, "currency", fields);

  if (claimType !== undefined && !CLAIM_TYPES.some((allowedClaimType) => allowedClaimType === claimType)) {
    fields.claimType = `must be one of: ${CLAIM_TYPES.join(", ")}`;
  }

  if (diagnosisCode !== undefined && !DIAGNOSIS_CODE_PATTERN.test(diagnosisCode)) {
    fields.diagnosisCode = "must be a valid diagnosis code";
  }

  if (treatmentDate !== undefined && !isValidDateOnly(treatmentDate)) {
    fields.treatmentDate = "must be a valid YYYY-MM-DD date";
  }

  if (typeof amount !== "number") {
    fields.amount = "required";
  } else if (!Number.isFinite(amount) || amount <= 0) {
    fields.amount = "must be positive";
  }

  if (currency !== undefined && !CURRENCY_PATTERN.test(currency)) {
    fields.currency = "must be a 3-letter uppercase ISO currency code";
  }

  if (Object.keys(fields).length > 0) {
    throw new ValidationError("Request body contains invalid fields.", fields);
  }

  void policyId;
}

function readString(value: unknown, fieldName: string, fields: Record<string, string>): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    fields[fieldName] = "required";
    return undefined;
  }

  return value;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parts = value.split("-");
  const year = Number.parseInt(parts[0] ?? "", 10);
  const month = Number.parseInt(parts[1] ?? "", 10);
  const day = Number.parseInt(parts[2] ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
