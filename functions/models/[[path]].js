const DEFAULT_MODEL_BASE_URL = "https://pub-5cabcf5031d8b4e8ea59fb8543628e61f.r2.dev/models";

function buildTargetUrl(pathname, env) {
  const upstreamBaseUrl = (env.MODEL_PROXY_BASE_URL || DEFAULT_MODEL_BASE_URL).replace(/\/$/, "");
  const normalizedPath = Array.isArray(pathname)
    ? pathname.filter(Boolean).join("/")
    : String(pathname || "").replace(/^\/+/, "");

  return `${upstreamBaseUrl}/${normalizedPath}`;
}

function normalizeObjectKey(pathname) {
  return Array.isArray(pathname)
    ? pathname.filter(Boolean).join("/")
    : String(pathname || "").replace(/^\/+/, "");
}

function createProxyHeaders(upstreamHeaders) {
  const headers = new Headers();
  const passthroughHeaders = [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "accept-ranges",
  ];

  for (const name of passthroughHeaders) {
    const value = upstreamHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set("access-control-allow-headers", "*");

  return headers;
}

async function handleProxyRequest(context) {
  const { params, request, env } = context;
  const method = request.method === "HEAD" ? "HEAD" : "GET";
  const objectKey = normalizeObjectKey(params.path);

  if (env.MODEL_BUCKET?.get) {
    const object = await env.MODEL_BUCKET.get(objectKey);

    if (!object) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (object.size != null) {
      headers.set("content-length", String(object.size));
    }
    if (object.httpEtag) {
      headers.set("etag", object.httpEtag);
    }
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    headers.set("access-control-allow-headers", "*");

    return new Response(method === "HEAD" ? null : object.body, {
      status: 200,
      headers,
    });
  }

  const targetUrl = buildTargetUrl(params.path, env);

  const upstreamResponse = await fetch(targetUrl, {
    method,
    headers: {
      range: request.headers.get("range") || "",
    },
  });

  return new Response(method === "HEAD" ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: createProxyHeaders(upstreamResponse.headers),
  });
}

export async function onRequestGet(context) {
  return handleProxyRequest(context);
}

export async function onRequestHead(context) {
  return handleProxyRequest(context);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "*",
    },
  });
}
