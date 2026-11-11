export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store", // financial data: never cache
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export async function readBody(request, maxBytes = 200_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw Object.assign(new Error("Body too large"), { status: 413 });
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}
