// Only return to a path within this Chatbud origin after authentication.
export function safeAuthReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2048 || !value.startsWith("/")) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded))
      return "/";
    const url = new URL(value, "https://chatbud.invalid");
    if (
      url.origin !== "https://chatbud.invalid" ||
      url.pathname.startsWith("/auth/callback")
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
export const googleReturnKey = "chatbud.google.return-path";
