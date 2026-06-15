# Partner Integration SDK

A TypeScript SDK and mock API server for insurance partners that need to submit claims, upload supporting documents, and track claim status from their own applications.

## Overview

Insurance partners such as hospitals, brokers, and corporate benefit platforms often need to embed claim submission in their existing systems. This project provides a typed SDK that hides authentication, validation, retry behavior, token refresh, document upload, and status polling behind a small developer-facing API.

The repository also includes a mock HTTP API server so integrations can be tested locally without a database or external service.

## Features

- Mock insurance claims API with JWT authentication.
- In-memory claims and document storage.
- Request body validation with field-level errors.
- Realistic response delay and configurable transient failures.
- TypeScript SDK with full public types.
- Claims create, get, list, and status polling.
- Document upload and document listing.
- Client-side claim validation before API calls.
- Automatic token refresh before token expiry.
- Retry with exponential backoff for transient failures.
- Typed errors: `ValidationError`, `AuthError`, `NetworkError`, `ApiError`.
- Upload progress callback simulation.
- Runnable example integrations.
- Vitest test coverage for core success and error paths.

## Tech Stack

- Node.js 18.18+
- TypeScript
- Express
- JSON Web Tokens via `jsonwebtoken`
- Multer for multipart document upload
- Vitest
- Supertest
- tsx

## Repository Structure

```text
src/
  sdk/              TypeScript SDK entrypoint, clients, auth, HTTP, errors
  server/           Mock API server, middleware, routes, in-memory store
  shared/           Shared public domain types
examples/           Runnable integration scripts
tests/              Unit and integration-style tests
README.md           Project documentation
.env.example        Local server configuration template
```

## Installation

```bash
npm install
```

Copy `.env.example` to `.env` if needed. The repository includes these local server settings:

```env
PORT=3000
HOST=127.0.0.1
JWT_SECRET=partner-integration-sdk-mock-secret
TOKEN_EXPIRES_IN_SECONDS=3600
TRANSIENT_FAILURE_RATE=0
RESPONSE_DELAY_MIN_MS=0
RESPONSE_DELAY_MAX_MS=0
```

For realistic local behavior, set:

```env
TRANSIENT_FAILURE_RATE=0.1
RESPONSE_DELAY_MIN_MS=200
RESPONSE_DELAY_MAX_MS=500
```

## Running the Mock API Server

```bash
npm run dev:server
```

The server starts at:

```text
http://localhost:3000
```

Health check:

```bash
curl --location 'http://localhost:3000/health'
```

## Running Tests

```bash
npm test
```

Build:

```bash
npm run build
```

Audit:

```bash
npm audit
```

Search for accidental `any` usage:

```bash
rg "\bany\b" src examples tests
```

## Running Examples

Start the server first:

```bash
npm run dev:server
```

Then run the examples in another terminal:

```bash
npm run example:simple
npm run example:upload
npm run example:status
```

The examples use:

```text
SDK_API_KEY=pk_test_xxx
SDK_BASE_URL=http://localhost:3000/api/v1
```

You can override those environment variables when needed.

## SDK Quickstart

```ts
import { InsuranceSDK, ValidationError, AuthError, NetworkError } from "./src/sdk";

const sdk = new InsuranceSDK({
  apiKey: "pk_test_xxx",
  environment: "sandbox",
  timeout: 30_000
});

try {
  const claim = await sdk.claims.create({
    policyId: "POL-123",
    claimType: "OUTPATIENT",
    diagnosisCode: "J06.9",
    treatmentDate: "2024-03-15",
    amount: 15000,
    currency: "THB"
  });

  console.log(claim.id);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.fields);
  } else if (error instanceof AuthError) {
    console.log("Authentication failed");
  } else if (error instanceof NetworkError) {
    console.log("Retry later");
  }
}
```

## Mock API Server Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/auth/token` | Exchange API key for JWT |
| `POST` | `/api/v1/claims` | Create a claim |
| `GET` | `/api/v1/claims/:id` | Get claim details and status |
| `GET` | `/api/v1/claims` | List claims with pagination and optional status filter |
| `POST` | `/api/v1/claims/:id/documents` | Upload a document |
| `GET` | `/api/v1/claims/:id/documents` | List claim documents |

### Authentication

```bash
curl --location 'http://localhost:3000/api/v1/auth/token' \
--header 'Content-Type: application/json' \
--data '{"apiKey":"pk_test_xxx"}'
```

Use the returned token:

```text
Authorization: Bearer <token>
```

## SDK Public API Reference

### `new InsuranceSDK(config)`

```ts
const sdk = new InsuranceSDK({
  apiKey: "pk_test_xxx",
  environment: "sandbox",
  timeout: 30_000,
  baseUrl: "http://localhost:3000/api/v1",
  retry: {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1000
  }
});
```

Configuration:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `apiKey` | `string` | Yes | Partner API key. Mock keys use `pk_test_...` or `pk_live_...`. |
| `environment` | `"sandbox"` or `"production"` | Yes | Selects default base URL. |
| `timeout` | `number` | No | Request timeout in milliseconds. Default is `30000`. |
| `baseUrl` | `string` | No | Overrides environment base URL, useful for local tests. |
| `retry` | `RetryOptions` | No | Retry configuration for transient failures. |

### `sdk.claims.create(request)`

Creates a claim. Client-side validation runs before the API call.

```ts
const claim = await sdk.claims.create({
  policyId: "POL-123",
  claimType: "OUTPATIENT",
  diagnosisCode: "J06.9",
  treatmentDate: "2024-03-15",
  amount: 15000,
  currency: "THB"
});
```

New claims start as `PENDING`.

### `sdk.claims.get(claimId)`

Gets one claim by ID.

```ts
const claim = await sdk.claims.get("CLM-001");
```

### `sdk.claims.list(params)`

Lists claims with pagination and optional status filtering.

```ts
const claims = await sdk.claims.list({
  status: "PENDING",
  page: 1,
  pageSize: 20
});
```

Returns:

```ts
{
  data: Claim[],
  pagination: {
    page: number,
    pageSize: number,
    total: number,
    totalPages: number
  }
}
```

### `sdk.claims.onStatusChange(claimId, callback, options?)`

Polls a claim and calls the callback when status changes.

```ts
const unsubscribe = sdk.claims.onStatusChange(
  "CLM-001",
  (newStatus, claim) => {
    console.log(`Claim ${claim.id} is now ${newStatus}`);
  },
  {
    intervalMs: 2000,
    onError: (error) => console.error(error)
  }
);

unsubscribe();
```

The mock server progresses claim status over time so polling can be observed locally.

### `sdk.documents.upload(claimId, file, options)`

Uploads a document with multipart form data.

```ts
const document = await sdk.documents.upload("CLM-001", "receipt text", {
  type: "medical_receipt",
  fileName: "receipt.txt",
  contentType: "text/plain",
  onProgress: (percent) => console.log(`${percent}% uploaded`)
});
```

Supported file inputs:

- `Blob`
- `Buffer`
- `Uint8Array`
- `ArrayBuffer`
- `string`

### `sdk.documents.list(claimId)`

Lists documents for a claim.

```ts
const documents = await sdk.documents.list("CLM-001");
```

## Error Handling

The SDK maps API and network failures into typed errors.

```ts
import { ApiError, AuthError, NetworkError, ValidationError } from "./src/sdk";

try {
  await sdk.claims.create({
    policyId: "",
    claimType: "OUTPATIENT",
    diagnosisCode: "bad",
    treatmentDate: "2024-03-15",
    amount: -1,
    currency: "THB"
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.fields);
  } else if (error instanceof AuthError) {
    console.log("Re-authenticate or check API key");
  } else if (error instanceof NetworkError) {
    console.log("Transient network problem or timeout");
  } else if (error instanceof ApiError) {
    console.log(error.statusCode, error.code, error.message);
  }
}
```

### `ValidationError`

Used for client-side validation errors and server `400` validation responses. Includes:

```ts
error.fields
```

Example:

```ts
{
  policyId: "required",
  amount: "must be positive"
}
```

### `AuthError`

Used for authentication failures such as missing, invalid, or expired tokens.

### `NetworkError`

Used for network failures, timeouts, and transient `503` responses.

### `ApiError`

Used for other non-2xx API responses.

## Client-Side Validation

`sdk.claims.create` validates required fields and formats before making a network request:

- `policyId` is required.
- `claimType` must be one of `OUTPATIENT`, `INPATIENT`, `EMERGENCY`, `DENTAL`, `OTHER`.
- `diagnosisCode` must look like an ICD-style diagnosis code.
- `treatmentDate` must be a valid `YYYY-MM-DD` date.
- `amount` must be positive.
- `currency` must be a 3-letter uppercase currency code.

Validation failures throw `ValidationError` and are not retried.

## Authentication and Token Refresh

The SDK exchanges the API key for a JWT using:

```text
POST /api/v1/auth/token
```

The token expires after 1 hour by default. The SDK caches the token, refreshes before expiry, and refreshes once if a request receives a refreshable `TOKEN_EXPIRED` response.

Normal non-refreshable auth failures are surfaced as `AuthError`.

## Retry and Exponential Backoff

The SDK retries:

- `503` transient API failures
- network failures
- timeout failures

The SDK does not retry:

- `400` validation errors
- normal or non-refreshable `401` auth errors
- other non-transient API errors

Default retry settings:

```ts
{
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000
}
```

## Upload Progress

Document upload accepts an `onProgress` callback:

```ts
await sdk.documents.upload(claimId, "receipt", {
  type: "medical_receipt",
  onProgress: (percent) => console.log(percent)
});
```

The mock SDK simulates progress values and ends at `100`.

## Status Tracking

Status tracking uses polling over `GET /api/v1/claims/:id`.

```ts
const unsubscribe = sdk.claims.onStatusChange(claimId, (status, claim) => {
  console.log(status, claim.id);
});
```

The returned unsubscribe function stops future polling.

## Example Integration Flow

1. Start the mock server:

   ```bash
   npm run dev:server
   ```

2. Create a claim:

   ```bash
   npm run example:simple
   ```

3. Submit a claim with a document:

   ```bash
   npm run example:upload
   ```

4. Track claim status:

   ```bash
   npm run example:status
   ```

## Postman and cURL Smoke Test

Create a token:

```bash
curl --location 'http://localhost:3000/api/v1/auth/token' \
--header 'Content-Type: application/json' \
--data '{"apiKey":"pk_test_xxx"}'
```

Create a claim:

```bash
curl --location 'http://localhost:3000/api/v1/claims' \
--header 'Authorization: Bearer {{token}}' \
--header 'Content-Type: application/json' \
--data '{"policyId":"POL-123","claimType":"OUTPATIENT","diagnosisCode":"J06.9","treatmentDate":"2024-03-15","amount":15000,"currency":"THB"}'
```

Upload a document:

```bash
curl --location 'http://localhost:3000/api/v1/claims/{{claimId}}/documents' \
--header 'Authorization: Bearer {{token}}' \
--form 'type="medical_receipt"' \
--form 'file=@"C:/Users/Public/repos/partner-integration-sdk/receipt.txt"'
```

## Design Decisions

- Express was used for a small, readable mock API server.
- Data is stored in memory to match the challenge requirement and keep setup simple.
- SDK and server code are separated under `src/sdk` and `src/server`.
- Shared TypeScript types live in `src/shared` to keep API contracts consistent.
- The SDK validates claim creation before network calls to give partners fast feedback.
- Retry is limited to transient failures so invalid submissions and auth problems do not create noisy repeated requests.
- Status tracking uses polling because the challenge asks for status tracking without requiring webhooks or WebSockets.
- Document upload uses multipart form data with Multer on the mock server.

## Estimated Timeline

| Task                                                                       |   Estimate |
| -------------------------------------------------------------------------- | ---------: |
| Understand requirements and design SDK API                                 | 45 minutes |
| Build mock API server with auth, validation, delay, and transient failures |  1.5 hours |
| Implement SDK HTTP client, auth manager, and typed errors                  |  1.5 hours |
| Implement claims and documents modules                                     |     1 hour |
| Implement retry, token refresh, upload progress, and status polling        |     1 hour |
| Add 20+ tests                                                              |  1.5 hours |
| Write README and example scripts                                           | 45 minutes |

## Known Limitations

- The mock server stores data in memory, so data resets when the process restarts.
- Production environment URL is a placeholder because this is a challenge mock SDK.
- Upload progress is simulated by the SDK rather than measured from real socket-level upload progress.
- Status changes are simulated by the mock server over time.
- The mock API key format is intentionally simple: `pk_test_...` or `pk_live_...`.

## Final Challenge Checklist

| AI Challenge 13 requirement | Status |
| --------------------------- | ------ |
| Mock API server included | Complete |
| `POST /api/v1/auth/token` exchanges API key for JWT | Complete |
| `POST /api/v1/claims` creates a claim | Complete |
| `GET /api/v1/claims/:id` gets claim details and status | Complete |
| `GET /api/v1/claims` lists claims with pagination and status filter | Complete |
| `POST /api/v1/claims/:id/documents` uploads a document | Complete |
| `GET /api/v1/claims/:id/documents` lists documents | Complete |
| Authentication rejects missing, invalid, and expired tokens | Complete |
| Request validation returns `400` with field-level errors | Complete |
| Realistic response delay is configurable | Complete |
| Transient `503` failures are configurable | Complete |
| In-memory storage with no database | Complete |
| SDK initialization with API key, environment, and timeout | Complete |
| `sdk.claims.create` | Complete |
| `sdk.claims.get` | Complete |
| `sdk.claims.list` | Complete |
| `sdk.documents.upload` with progress callback | Complete |
| `sdk.claims.onStatusChange` | Complete |
| Client-side validation before API call | Complete |
| Automatic token refresh | Complete |
| Retry with exponential backoff | Complete |
| Typed errors | Complete |
| Full TypeScript types without `any` in source | Complete |
| README quickstart and API reference | Complete |
| 3 runnable example integrations | Complete |
| At least 20 tests | Complete |

## Submission Commands

Run these before pushing:

```bash
npm install
npm run build
npm test
npm audit
rg "\bany\b" src examples tests
```

Then verify examples against a running server:

```bash
npm run dev:server
npm run example:simple
npm run example:upload
npm run example:status
```
