function toCleanString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function extractGeneratedUsername(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const response = payload as {
    generated_username?: unknown;
    username?: unknown;
    data?: {
      username?: unknown;
      user?: unknown;
      data?: {
        username?: unknown;
        user?: unknown;
      };
    };
  };

  const candidates = [
    response.generated_username,
    response.username,
    response.data?.username,
    response.data?.user,
    response.data?.data?.username,
    response.data?.data?.user,
  ];

  for (const candidate of candidates) {
    const value = toCleanString(candidate);
    if (value) return value;
  }

  return null;
}
