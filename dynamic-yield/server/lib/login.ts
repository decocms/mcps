const ADMIN_URL = "https://adm.dynamicyield.com";

/**
 * Logs in to the DY console with email + password (Keycloak identifier-first form)
 * and returns the RefreshToken cookie. Accounts with 2FA or company SSO can't use
 * this; they paste the cookie into adminSession instead.
 */
export async function login(email: string, password: string): Promise<string> {
  const jar = new Map<string, Record<string, string>>(); // host -> cookies

  const request = async (url: string, init: RequestInit = {}) => {
    const host = new URL(url).host;
    const cookies = jar.get(host) ?? {};
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers as Record<string, string>),
        Cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      signal: AbortSignal.timeout(30_000),
    });
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0];
      const i = pair.indexOf("=");
      cookies[pair.slice(0, i)] = pair.slice(i + 1);
    }
    jar.set(host, cookies);
    return response;
  };

  const postForm = async (html: string, fields: Record<string, string>) => {
    const action = html.match(/<form[^>]*action="([^"]+)"/)?.[1];
    if (!action) throw new Error("DY login failed: login form not found.");
    return request(action.replaceAll("&amp;", "&"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  };

  const start = await request(`${ADMIN_URL}/r`);
  const loginPage = await request(start.headers.get("location") ?? "");
  const passwordPage = await postForm(await loginPage.text(), {
    username: email,
  });
  let response = await postForm(await passwordPage.text(), {
    username: email,
    password,
    credentialId: "",
  });

  // Follow the redirects back to the console, which sets the session cookies.
  for (
    let hop = 0;
    hop < 10 && response.status >= 300 && response.status < 400;
    hop++
  ) {
    const refreshToken = jar.get(new URL(ADMIN_URL).host)?.RefreshToken;
    if (refreshToken) return refreshToken;
    response = await request(
      new URL(response.headers.get("location") ?? "", response.url || ADMIN_URL)
        .href,
    );
  }
  const refreshToken = jar.get(new URL(ADMIN_URL).host)?.RefreshToken;
  if (refreshToken) return refreshToken;
  throw new Error(
    "DY login failed: check adminEmail and adminPassword. Accounts with 2FA or company SSO must paste the RefreshToken cookie into adminSession instead.",
  );
}
