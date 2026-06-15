import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
  const mergedEnv = env === process.env ? mergeDotEnv(env) : env;
  const delayMinMs = readInteger(mergedEnv.RESPONSE_DELAY_MIN_MS, DEFAULT_CONFIG.delayMinMs, "RESPONSE_DELAY_MIN_MS");
  const delayMaxMs = readInteger(mergedEnv.RESPONSE_DELAY_MAX_MS, DEFAULT_CONFIG.delayMaxMs, "RESPONSE_DELAY_MAX_MS");

  if (delayMaxMs < delayMinMs) {
    throw new Error("RESPONSE_DELAY_MAX_MS must be greater than or equal to RESPONSE_DELAY_MIN_MS");
  }

  return {
    port: readInteger(mergedEnv.PORT, DEFAULT_CONFIG.port, "PORT"),
    host: mergedEnv.HOST ?? DEFAULT_CONFIG.host,
    jwtSecret: mergedEnv.JWT_SECRET ?? DEFAULT_CONFIG.jwtSecret,
    tokenExpiresInSeconds: readInteger(
      mergedEnv.TOKEN_EXPIRES_IN_SECONDS,
      DEFAULT_CONFIG.tokenExpiresInSeconds,
      "TOKEN_EXPIRES_IN_SECONDS"
    ),
    transientFailureRate: readRate(mergedEnv.TRANSIENT_FAILURE_RATE, DEFAULT_CONFIG.transientFailureRate),
    delayMinMs,
    delayMaxMs
  };
}

function mergeDotEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...readDotEnvFile(path.resolve(process.cwd(), ".env")),
    ...env
  };
}

function readDotEnvFile(filePath: string): NodeJS.ProcessEnv {
  if (!existsSync(filePath)) {
    return {};
  }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce<NodeJS.ProcessEnv>((values, line) => {
      const trimmed = line.trim();

      if (trimmed === "" || trimmed.startsWith("#")) {
        return values;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        return values;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      values[key] = unquoteEnvValue(rawValue);
      return values;
    }, {});
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
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
