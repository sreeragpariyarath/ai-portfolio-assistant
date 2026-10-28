export interface EnvVarSpec {
  name: string;
  required: boolean;
  /** Returns a problem description, or null when the value looks fine. */
  validate?: (value: string) => string | null;
}

export type EnvStatus = "ok" | "missing" | "invalid";

export interface EnvCheck {
  name: string;
  status: EnvStatus;
  problem?: string;
}

function isHttpsUrl(value: string): string | null {
  try {
    return new URL(value).protocol === "https:" ? null : "must start with https://";
  } catch {
    return "is not a valid URL";
  }
}

export const ENV_VARS: EnvVarSpec[] = [
  { name: "GEMINI_API_KEY", required: true },
  { name: "QDRANT_URL", required: true, validate: isHttpsUrl },
  { name: "QDRANT_API_KEY", required: true },
  { name: "QDRANT_COLLECTION", required: true },
];

// Reports presence and shape only. Values are never returned, so callers cannot log them.
export function checkEnv(
  env: Record<string, string | undefined>,
  specs: EnvVarSpec[] = ENV_VARS,
): EnvCheck[] {
  return specs.map((spec) => {
    const value = env[spec.name]?.trim();
    if (!value) {
      return spec.required
        ? { name: spec.name, status: "missing" }
        : { name: spec.name, status: "ok" };
    }
    const problem = spec.validate?.(value);
    return problem
      ? { name: spec.name, status: "invalid", problem }
      : { name: spec.name, status: "ok" };
  });
}
