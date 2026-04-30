(function () {
  function ensureStyles() {
    if (document.getElementById("imageViewerStyles")) return;
    const style = document.createElement("style");
    style.id = "imageViewerStyles";
    style.textContent = `
      .image-viewer-mask{position:fixed;inset:0;z-index:85;display:flex;align-items:center;justify-content:center;background:rgba(7,19,18,.78);padding:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
      .image-viewer-panel{position:relative;max-width:min(920px,100%);max-height:100%;display:grid;place-items:center}
      .image-viewer-panel img{max-width:100%;max-height:calc(100dvh - 42px);object-fit:contain;border-radius:12px;background:#fff;box-shadow:0 18px 38px rgba(0,0,0,.25)}
      .image-viewer-close{position:absolute;top:8px;right:8px;width:38px;height:38px;border:0;border-radius:999px;background:rgba(31,42,43,.72);color:#fff;font-size:22px;line-height:38px;cursor:pointer}
      .image-action-mask{position:fixed;inset:0;z-index:84;display:flex;align-items:flex-end;justify-content:center;background:rgba(7,19,18,.46);padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
      .image-action-panel{width:min(420px,100%);border-radius:18px;background:#fff;border:1px solid #dceae6;box-shadow:0 18px 38px rgba(8,46,40,.22);padding:10px;display:grid;gap:8px}
      .image-action-panel button{height:46px;border:0;border-radius:12px;background:#edf6f3;color:#185d52;font-weight:800;cursor:pointer}
      .image-action-panel button.primary{background:#0d9a7d;color:#fff}
    `;
    document.head.appendChild(style);
  }

  window.openImageViewer = function openImageViewer(src) {
    if (!src) return;
    ensureStyles();
    const mask = document.createElement("div");
    mask.className = "image-viewer-mask";
    mask.innerHTML = `
      <div class="image-viewer-panel" role="dialog" aria-modal="true" aria-label="查看大图">
        <img src="${String(src).replaceAll('"', "&quot;")}" alt="商品大图" />
        <button class="image-viewer-close" type="button" aria-label="关闭">×</button>
      </div>
    `;
    const close = () => mask.remove();
    mask.onclick = (event) => {
      if (event.target === mask) close();
    };
    mask.querySelector(".image-viewer-close").onclick = close;
    document.addEventListener("keydown", function onKey(event) {
      if (event.key !== "Escape") return;
      close();
      document.removeEventListener("keydown", onKey);
    });
    document.body.appendChild(mask);
  };

  window.openImageActionSheet = function openImageActionSheet(src, onReplace) {
    ensureStyles();
    const mask = document.createElement("div");
    mask.className = "image-action-mask";
    mask.innerHTML = `
      <div class="image-action-panel" role="dialog" aria-modal="true" aria-label="图片操作">
        <button class="primary" type="button" data-action="view">查看大图</button>
        <button type="button" data-action="replace">更换图片</button>
        <button type="button" data-action="cancel">取消</button>
      </div>
    `;
    const close = () => mask.remove();
    mask.onclick = (event) => {
      if (event.target === mask) close();
    };
    mask.querySelector("[data-action='view']").onclick = () => {
      close();
      window.openImageViewer(src);
    };
    mask.querySelector("[data-action='replace']").onclick = () => {
      close();
      onReplace?.();
    };
    mask.querySelector("[data-action='cancel']").onclick = close;
    document.body.appendChild(mask);
  };
}());
