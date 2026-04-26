(async () => {
  const style = document.createElement("style");
  style.textContent = "nav.no-profile{grid-template-columns:repeat(4,1fr)}nav.no-profile::before{width:25%}";
  document.head.append(style);

  const authOnlyLinks = Array.from(document.querySelectorAll("[data-auth-only='true']"));
  const requiresAuth = document.body?.dataset.requireAuth === "true";
  if (!authOnlyLinks.length && !requiresAuth) return;

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);

  try {
    const res = await fetch("/api/me/stats", { headers: { accept: "application/json" } });
    const data = res.ok ? await res.json() : null;
    const email = String(data?.user?.email || "");
    const loggedIn = isLocal || Boolean(res.ok && email && email !== "未登录");

    if (loggedIn) {
      document.querySelectorAll("nav").forEach((nav) => nav.classList.remove("no-profile"));
      authOnlyLinks.forEach((link) => { link.hidden = false; });
      return;
    }
  } catch {
    if (isLocal) {
      document.querySelectorAll("nav").forEach((nav) => nav.classList.remove("no-profile"));
      authOnlyLinks.forEach((link) => { link.hidden = false; });
      return;
    }
  }

  document.querySelectorAll("nav").forEach((nav) => nav.classList.add("no-profile"));
  authOnlyLinks.forEach((link) => link.remove());
  if (requiresAuth) {
    location.href = "add.html";
  }
})();
