(function () {
  function ensureToastRoot() {
    let root = document.getElementById("toastRoot");
    if (root) return root;

    const style = document.createElement("style");
    style.textContent = `
      .toast-root {
        position: fixed;
        top: calc(14px + env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        width: min(520px, calc(100vw - 24px - env(safe-area-inset-left) - env(safe-area-inset-right)));
        z-index: 1000;
        display: grid;
        gap: 8px;
        pointer-events: none;
      }
      .toast-item {
        pointer-events: auto;
        border: 1px solid rgba(17, 69, 60, 0.12);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.96);
        color: #1f2a2b;
        box-shadow: 0 14px 30px rgba(12, 48, 42, 0.18);
        padding: 10px 12px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: start;
        font: 13px/1.45 "Avenir Next", "SF Pro Text", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
        animation: toastIn 0.18s ease-out;
      }
      .toast-item.error { border-color: rgba(202, 63, 63, 0.28); }
      .toast-item.success { border-color: rgba(13, 154, 125, 0.28); }
      .toast-item button {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 999px;
        background: #f0f5f3;
        color: #405452;
        cursor: pointer;
        font: inherit;
      }
      @keyframes toastIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = "toastRoot";
    root.className = "toast-root";
    document.body.appendChild(root);
    return root;
  }

  window.showToast = function showToast(message, options = {}) {
    const root = ensureToastRoot();
    const toast = document.createElement("div");
    const type = options.type || "info";
    toast.className = `toast-item ${type}`;
    toast.innerHTML = `<div>${String(message || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]))}</div><button type="button" aria-label="关闭">×</button>`;
    const close = () => toast.remove();
    toast.querySelector("button").onclick = close;
    root.appendChild(toast);
    if (options.sticky !== true) {
      window.setTimeout(close, options.duration || (type === "error" ? 4200 : 2600));
    }
    return close;
  };
}());
