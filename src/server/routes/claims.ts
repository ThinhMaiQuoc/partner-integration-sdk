import express from "express";
import multer from "multer";
import { CLAIM_STATUSES, CLAIM_TYPES, type ClaimStatus, type CreateClaimRequest } from "../../shared/types";
import { sendError, type FieldErrors } from "../http";
import type { InMemoryStore } from "../store";

const DIAGNOSIS_CODE_PATTERN = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGE_SIZE = 100;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024
  }
});

export function createClaimsRouter(store: InMemoryStore): express.Router {
  const router = express.Router();

  router.post("/", (req, res) => {
    const validation = validateCreateClaimRequest(req.body);

    if (!validation.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "Request body contains invalid fields.", validation.fields);
      return;
    }

    const claim = store.createClaim(validation.value);
    res.status(201).json(claim);
  });

  router.get("/", (req, res) => {
    const validation = validateListClaimsQuery(req.query);

    if (!validation.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "Query parameters contain invalid fields.", validation.fields);
      return;
    }

    res.status(200).json(store.listClaims(validation.value));
  });

  router.post("/:id/documents", upload.single("file"), (req, res) => {
    const claimId = req.params.id;
    const uploadedFile = req.file;

    if (claimId === undefined || store.getClaim(claimId) === undefined) {
      sendError(res, 404, "CLAIM_NOT_FOUND", "Claim was not found.");
      return;
    }

    const validation = validateUploadDocumentRequest(req.body, uploadedFile);

    if (!validation.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "Request body contains invalid fields.", validation.fields);
      return;
    }

    if (uploadedFile === undefined) {
      sendError(res, 400, "VALIDATION_ERROR", "Request body contains invalid fields.", { file: "required" });
      return;
    }

    const document = store.createDocument({
      claimId,
      type: validation.type,
      fileName: uploadedFile.originalname,
      mimeType: uploadedFile.mimetype,
      size: uploadedFile.size
    });

    res.status(201).json(document);
  });

  router.get("/:id/documents", (req, res) => {
    const claimId = req.params.id;

    if (claimId === undefined || store.getClaim(claimId) === undefined) {
      sendError(res, 404, "CLAIM_NOT_FOUND", "Claim was not found.");
      return;
    }

    res.status(200).json({
      data: store.listDocuments(claimId)
    });
  });

  router.get("/:id", (req, res) => {
    const claimId = req.params.id;
    const claim = claimId === undefined ? undefined : store.getClaim(claimId);

    if (claim === undefined) {
      sendError(res, 404, "CLAIM_NOT_FOUND", "Claim was not found.");
      return;
    }

    res.status(200).json(claim);
  });

  return router;
}

function validateCreateClaimRequest(body: unknown): { ok: true; value: CreateClaimRequest } | { ok: false; fields: FieldErrors } {
  const fields: FieldErrors = {};

  if (!isRecord(body)) {
    return {
      ok: false,
      fields: {
        policyId: "required",
        claimType: "required",
        diagnosisCode: "required",
        treatmentDate: "required",
        amount: "required",
        currency: "required"
      }
    };
  }

  const policyId = readString(body.policyId, "policyId", fields);
  const claimType = readString(body.claimType, "claimType", fields);
  const diagnosisCode = readString(body.diagnosisCode, "diagnosisCode", fields);
  const treatmentDate = readString(body.treatmentDate, "treatmentDate", fields);
  const amount = body.amount;
  const currency = readString(body.currency, "currency", fields);

  if (claimType !== undefined && !isClaimType(claimType)) {
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
    return { ok: false, fields };
  }

  return {
    ok: true,
    value: {
      policyId: policyId as string,
      claimType: claimType as CreateClaimRequest["claimType"],
      diagnosisCode: diagnosisCode as string,
      treatmentDate: treatmentDate as string,
      amount: amount as number,
      currency: currency as string
    }
  };
}

function validateListClaimsQuery(
  query: express.Request["query"]
): { ok: true; value: { page: number; pageSize: number; status?: ClaimStatus } } | { ok: false; fields: FieldErrors } {
  const fields: FieldErrors = {};
  const page = readPositiveIntegerQuery(query.page, "page", 1, fields);
  const pageSize = readPositiveIntegerQuery(query.pageSize, "pageSize", 20, fields);
  const statusValue = readOptionalStringQuery(query.status);
  let status: ClaimStatus | undefined;

  if (statusValue !== undefined) {
    if (isClaimStatus(statusValue)) {
      status = statusValue;
    } else {
      fields.status = `must be one of: ${CLAIM_STATUSES.join(", ")}`;
    }
  }

  if (pageSize !== undefined && pageSize > MAX_PAGE_SIZE) {
    fields.pageSize = `must be less than or equal to ${MAX_PAGE_SIZE}`;
  }

  if (Object.keys(fields).length > 0 || page === undefined || pageSize === undefined) {
    return { ok: false, fields };
  }

  return { ok: true, value: { page, pageSize, status } };
}

function validateUploadDocumentRequest(
  body: unknown,
  file: Express.Multer.File | undefined
): { ok: true; type: string } | { ok: false; fields: FieldErrors } {
  const fields: FieldErrors = {};
  const type = isRecord(body) ? readString(body.type, "type", fields) : undefined;

  if (file === undefined) {
    fields.file = "required";
  }

  if (!isRecord(body)) {
    fields.type = "required";
  }

  if (Object.keys(fields).length > 0 || type === undefined) {
    return { ok: false, fields };
  }

  return { ok: true, type };
}

function readString(value: unknown, fieldName: string, fields: FieldErrors): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    fields[fieldName] = "required";
    return undefined;
  }

  return value;
}

function readPositiveIntegerQuery(
  value: unknown,
  fieldName: string,
  defaultValue: number,
  fields: FieldErrors
): number | undefined {
  const rawValue = readOptionalStringQuery(value);

  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed.toString() !== rawValue) {
    fields[fieldName] = "must be a positive integer";
    return undefined;
  }

  return parsed;
}

function readOptionalStringQuery(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  return undefined;
}

function isClaimType(value: string): value is CreateClaimRequest["claimType"] {
  return CLAIM_TYPES.some((claimType) => claimType === value);
}

function isClaimStatus(value: string): value is ClaimStatus {
  return CLAIM_STATUSES.some((status) => status === value);
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
