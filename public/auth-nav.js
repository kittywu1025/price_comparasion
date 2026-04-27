(async () => {
  const style = document.createElement("style");
  style.textContent = `
    .login-mask{position:fixed;inset:0;background:rgba(7,19,18,.48);display:flex;align-items:center;justify-content:center;z-index:80;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
    .login-panel{width:min(360px,calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 20px));max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px);overflow-y:auto;border-radius:18px;background:#fff;border:1px solid #dbe7e3;box-shadow:0 14px 28px rgba(14,63,56,.18);padding:16px;display:grid;gap:10px;color:#1f2a2b}
    .login-panel h2{margin:0;font-size:18px}.login-panel p{margin:0;color:#607270;font-size:13px;line-height:1.55}
    .login-panel label{display:grid;gap:6px;color:#425956;font-size:13px;font-weight:700}.login-panel input{height:40px;border:1px solid #dbe7e3;border-radius:12px;padding:0 10px;font:inherit;color:#1f2a2b;background:#f8fbfa;outline:none}
    .login-msg{min-height:18px;color:#607270;font-size:12px;line-height:1.4}
    .dev-login-box{border-top:1px solid #edf3f1;padding-top:10px;display:grid;gap:8px}
    .login-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}.login-actions a,.login-actions button{height:40px;border-radius:12px;border:0;font:inherit;font-weight:700;text-decoration:none;display:grid;place-items:center;cursor:pointer}
    .login-primary{background:#0d9a7d;color:#fff}.login-secondary{background:#edf6f3;color:#1a5950}
    .login-actions.single{grid-template-columns:1fr}
  `;
  document.head.append(style);

  const requiresAuth = document.body?.dataset.requireAuth === "true";
  const shouldCheckAuth = requiresAuth || Boolean(document.querySelector("nav"));
  if (!shouldCheckAuth) return;

  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const session = await checkLogin(isLocal);

  if (session.loggedIn) {
    if (session.user && !String(session.user.displayName || "").trim()) {
      showUsernameModal(session.user);
    }
    return;
  }

  if (requiresAuth) showLoginModal();
})();

async function checkLogin(isLocal) {
  try {
    const res = await fetch("/api/me/stats", { headers: { accept: "application/json" } });
    const data = res.ok ? await res.json() : null;
    const email = String(data?.user?.email || "");
    return {
      loggedIn: isLocal || Boolean(res.ok && email && email !== "未登录"),
      user: data?.user || null
    };
  } catch {
    return { loggedIn: isLocal, user: null };
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
      <div class="dev-login-box">
        <p>开发测试可以使用口令登录。这个入口只有后端配置了开发口令时才可用。</p>
        <label>
          开发口令
          <input id="devLoginPassword" type="password" autocomplete="current-password" />
        </label>
        <button id="devLoginSubmit" class="login-secondary" type="button">使用口令登录</button>
        <p id="devLoginMsg" class="login-msg"></p>
      </div>
    </section>
  `;
  document.body.append(mask);
  mask.querySelector("#loginBack").onclick = () => {
    if (history.length > 1) history.back();
    else location.href = "products";
  };
  mask.querySelector("#devLoginSubmit").onclick = async () => {
    const password = mask.querySelector("#devLoginPassword").value;
    const msg = mask.querySelector("#devLoginMsg");
    const button = mask.querySelector("#devLoginSubmit");
    if (!password) {
      msg.textContent = "请输入开发口令。";
      return;
    }
    button.disabled = true;
    msg.textContent = "正在登录...";
    try {
      const res = await fetch("/api/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败");
      location.reload();
    } catch (err) {
      msg.textContent = err.message || "登录失败";
      button.disabled = false;
    }
  };
}

function showUsernameModal(user) {
  if (document.querySelector("[data-username-mask]")) return;
  const mask = document.createElement("div");
  mask.className = "login-mask";
  mask.dataset.usernameMask = "true";
  mask.innerHTML = `
    <section class="login-panel" role="dialog" aria-modal="true" aria-labelledby="usernameTitle">
      <h2 id="usernameTitle">设置用户名</h2>
      <p>第一次登录需要设置一个用户名。之后你的建议、创建记录和修改记录会优先显示用户名，同时仍会保留绑定邮箱用于追溯。</p>
      <label>
        用户名
        <input id="firstDisplayName" maxlength="40" placeholder="例如：Kitty" autocomplete="nickname" />
      </label>
      <p>绑定邮箱：${escapeHtml(user.email || "未登录")}</p>
      <p id="firstDisplayNameMsg" class="login-msg"></p>
      <div class="login-actions single">
        <button id="saveFirstDisplayName" class="login-primary" type="button">保存用户名</button>
      </div>
    </section>
  `;
  document.body.append(mask);
  const input = mask.querySelector("#firstDisplayName");
  const button = mask.querySelector("#saveFirstDisplayName");
  const msg = mask.querySelector("#firstDisplayNameMsg");
  input.focus();
  button.onclick = async () => {
    const displayName = input.value.trim();
    if (!displayName) {
      msg.textContent = "请先输入用户名。";
      return;
    }
    button.disabled = true;
    msg.textContent = "正在保存...";
    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      window.dispatchEvent(new CustomEvent("profile-updated", { detail: data }));
      mask.remove();
    } catch (err) {
      msg.textContent = err.message || "保存失败";
      button.disabled = false;
    }
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
