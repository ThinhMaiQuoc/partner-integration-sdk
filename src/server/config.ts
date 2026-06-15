export interface ServerConfig {
  port: number;
  host: string;
  jwtSecret: string;
  tokenExpiresInSeconds: number;
  transientFailureRate: number;
  delayMinMs: number;
  delayMaxMs: number;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: 3000,
  host: "0.0.0.0",
  jwtSecret: "partner-integration-sdk-mock-secret",
  tokenExpiresInSeconds: 60 * 60,
  transientFailureRate: 0.1,
  delayMinMs: 200,
  delayMaxMs: 500
};

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const delayMinMs = readInteger(env.RESPONSE_DELAY_MIN_MS, DEFAULT_CONFIG.delayMinMs, "RESPONSE_DELAY_MIN_MS");
  const delayMaxMs = readInteger(env.RESPONSE_DELAY_MAX_MS, DEFAULT_CONFIG.delayMaxMs, "RESPONSE_DELAY_MAX_MS");

  if (delayMaxMs < delayMinMs) {
    throw new Error("RESPONSE_DELAY_MAX_MS must be greater than or equal to RESPONSE_DELAY_MIN_MS");
  }

  return {
    port: readInteger(env.PORT, DEFAULT_CONFIG.port, "PORT"),
    host: env.HOST ?? DEFAULT_CONFIG.host,
    jwtSecret: env.JWT_SECRET ?? DEFAULT_CONFIG.jwtSecret,
    tokenExpiresInSeconds: readInteger(
      env.TOKEN_EXPIRES_IN_SECONDS,
      DEFAULT_CONFIG.tokenExpiresInSeconds,
      "TOKEN_EXPIRES_IN_SECONDS"
    ),
    transientFailureRate: readRate(env.TRANSIENT_FAILURE_RATE, DEFAULT_CONFIG.transientFailureRate),
    delayMinMs,
    delayMaxMs
  };
}

function readInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid integer`);
  }

  return parsed;
}

function readRate(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("TRANSIENT_FAILURE_RATE must be a number between 0 and 1");
  }

  return parsed;
}
