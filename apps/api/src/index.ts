
interface Env {}

function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      if (request.method !== "GET") {
        return jsonResponse(
          {
            error: "Method not allowed",
            allowedMethods: ["GET"],
          },
          405,
        );
      }

      return jsonResponse({
        status: "ok",
        service: "ai-portfolio-assistant-api",
      });
    }

    return jsonResponse(
      {
        error: "Not found",
      },
      404,
    );
  },
} satisfies ExportedHandler<Env>;
