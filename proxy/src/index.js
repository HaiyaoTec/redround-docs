// Serves the Mintlify documentation at redround.com/docs.
// Runs on Worker routes, which take precedence over the redround Worker's Custom Domain on the same
// hostname; any path that is not documentation is passed on to that Worker unchanged.
// Mintlify also serves styles, scripts and API calls from /_mintlify and /mintlify-assets at the root,
// and verifies the domain through /.well-known/vercel.
const PROXIED = [/^\/docs(\/|$)/, /^\/_mintlify\//, /^\/mintlify-assets\//, /^\/\.well-known\/vercel\//];

// The main site's cookies (session, consent, locale) are not sent to Mintlify.
const SITE_COOKIE = /^(__Secure-|__Host-)?rr[._]/;

// Mintlify writes its own hostnames into these generated files; canonical, og:url and structured
// data in pages already follow seo.metatags.canonical in docs.json.
const GENERATED = /^\/docs\/(sitemap\.xml|robots\.txt|llms(-full)?\.txt|.+\.md)$/;

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (!PROXIED.some((pattern) => pattern.test(incoming.pathname))) return fetch(request);

    const url = new URL(incoming);
    url.protocol = "https:";
    url.hostname = env.MINTLIFY_HOST;
    url.port = "";
    const upstream = new Request(url, request);
    upstream.headers.set("X-Forwarded-Host", incoming.host);
    upstream.headers.set("X-Forwarded-Proto", "https");
    const cookies = (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part && !SITE_COOKIE.test(part));
    if (cookies.length) upstream.headers.set("Cookie", cookies.join("; "));
    else upstream.headers.delete("Cookie");
    if (GENERATED.test(incoming.pathname)) upstream.headers.delete("Accept-Encoding");

    const response = await fetch(upstream);
    const headers = new Headers(response.headers);
    // Same rule as the main site: nothing is indexed until ALLOW_INDEXING is "true".
    if (env.ALLOW_INDEXING !== "true") headers.set("X-Robots-Tag", "noindex");

    if (response.ok && GENERATED.test(incoming.pathname)) {
      const project = env.MINTLIFY_HOST.split(".")[0];
      const mintlify = new RegExp(`https://${project}\\.mintlify\\.(dev|app|site)`, "g");
      const body = (await response.text()).replace(mintlify, "https://redround.com");
      headers.delete("Content-Length");
      headers.delete("Content-Encoding");
      headers.delete("ETag");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    }
    if (env.ALLOW_INDEXING === "true") return response;
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
