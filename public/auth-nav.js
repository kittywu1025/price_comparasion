(async () => {
  const style = document.createElement("style");
  style.textContent = `
    nav.no-profile{grid-template-columns:repeat(4,1fr)}
    nav.no-profile::before{width:25%}
    .login-mask{position:fixed;inset:0;background:rgba(7,19,18,.48);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px}
    .login-panel{width:min(360px,100%);border-radius:18px;background:#fff;border:1px solid #dbe7e3;box-shadow:0 14px 28px rgba(14,63,56,.18);padding:16px;display:grid;gap:10px;color:#1f2a2b}
    .login-panel h2{margin:0;font-size:18px}.login-panel p{margin:0;color:#607270;font-size:13px;line-height:1.55}
    .login-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}.login-actions a,.login-actions button{height:40px;border-radius:12px;border:0;font:inherit;font-weight:700;text-decoration:none;display:grid;place-items:center;cursor:pointer}
    .login-primary{background:#0d9a7d;color:#fff}.login-secondary{background:#edf6f3;color:#1a5950}
  `;
  document.head.append(style);

  const authOnlyLinks = Array.from(document.querySelectorAll("[data-auth-only='true']"));
  const requiresAuth = document.body?.dataset.requireAuth === "true";
  if (!authOnlyLinks.length && !requiresAuth) return;

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const loggedIn = await checkLogin(isLocal);

  if (loggedIn) {
    document.querySelectorAll("nav").forEach((nav) => nav.classList.remove("no-profile"));
    authOnlyLinks.forEach((link) => { link.hidden = false; });
    return;
  }

  document.querySelectorAll("nav").forEach((nav) => nav.classList.add("no-profile"));
  authOnlyLinks.forEach((link) => link.remove());
  if (requiresAuth) showLoginModal();
})();

async function checkLogin(isLocal) {
  try {
    const res = await fetch("/api/me/stats", { headers: { accept: "application/json" } });
    const data = res.ok ? await res.json() : null;
    const email = String(data?.user?.email || "");
    return isLocal || Boolean(res.ok && email && email !== "未登录");
  } catch {
    return isLocal;
  }
}

function showLoginModal() {
  const returnTo = `${location.pathname}${location.search}` || "/products";
  const loginUrl = `/api/auth/login?return=${encodeURIComponent(returnTo)}`;
  const mask = document.createElement("div");
  mask.className = "login-mask";
  mask.innerHTML = `
    <section class="login-panel" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <h2 id="loginTitle">需要登录</h2>
      <p>录入数据和查看个人贡献需要登录。你可以返回继续浏览公开内容，或登录后继续操作。</p>
      <div class="login-actions">
        <button class="login-secondary" type="button" id="loginBack">返回</button>
        <a class="login-primary" href="${loginUrl}">去登录</a>
      </div>
    </section>
  `;
  document.body.append(mask);
  mask.querySelector("#loginBack").onclick = () => {
    if (history.length > 1) history.back();
    else location.href = "products";
  };
}
