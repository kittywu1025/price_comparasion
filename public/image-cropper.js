(function () {
  const canvasSize = 280;
  const outputSize = 900;

  function ensureCropper() {
    if (document.getElementById("imageCropperStyles")) return;
    const style = document.createElement("style");
    style.id = "imageCropperStyles";
    style.textContent = `
      .image-cropper-mask{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;background:rgba(7,19,18,.55);padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
      .image-cropper-panel{width:min(430px,100%);border-radius:18px 18px 0 0;background:#fff;border:1px solid #dceae6;box-shadow:0 18px 38px rgba(8,46,40,.22);padding:14px;display:grid;gap:12px}
      .image-cropper-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .image-cropper-head h2{margin:0;font-size:16px;color:#1f2a2b}
      .image-cropper-close{width:34px;height:34px;border:0;border-radius:999px;background:#edf6f3;color:#185d52;font-size:18px;cursor:pointer}
      .image-cropper-stage{display:grid;place-items:center;background:#f4faf8;border:1px solid #dcebe6;border-radius:14px;padding:10px;touch-action:none}
      .image-cropper-stage canvas{width:min(280px,calc(100vw - 58px));height:min(280px,calc(100vw - 58px));display:block;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px rgba(13,94,78,.12);cursor:grab}
      .image-cropper-stage canvas:active{cursor:grabbing}
      .image-cropper-range{display:grid;gap:6px}
      .image-cropper-range label{font-size:12px;font-weight:700;color:#58706c}
      .image-cropper-range input{width:100%;accent-color:#0d9a7d}
      .image-cropper-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .image-cropper-actions button{height:42px;border:0;border-radius:12px;font-weight:800;cursor:pointer}
      .image-cropper-cancel{background:#edf5f2;color:#185d52}
      .image-cropper-apply{background:#0d9a7d;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function loadBitmap(file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("请选择图片文件");
    if (file.size > 8 * 1024 * 1024) throw new Error("原图超过 8MB，请先裁剪或压缩后再上传");
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  }

  function compressCanvas(canvas) {
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length < 900 * 1024) return dataUrl;
    }
    throw new Error("压缩后仍然太大，请缩小裁剪区域后再试");
  }

  window.cropAndCompressImageFile = async function cropAndCompressImageFile(file) {
    ensureCropper();
    const bitmap = await loadBitmap(file);

    return new Promise((resolve, reject) => {
      const mask = document.createElement("div");
      mask.className = "image-cropper-mask";
      mask.innerHTML = `
        <section class="image-cropper-panel" role="dialog" aria-modal="true" aria-label="裁剪图片">
          <div class="image-cropper-head">
            <h2>裁剪图片</h2>
            <button class="image-cropper-close" type="button" aria-label="关闭">×</button>
          </div>
          <div class="image-cropper-stage"><canvas width="${canvasSize}" height="${canvasSize}"></canvas></div>
          <div class="image-cropper-range">
            <label for="imageCropperZoom">缩放</label>
            <input id="imageCropperZoom" type="range" min="100" max="300" value="100" />
          </div>
          <div class="image-cropper-actions">
            <button class="image-cropper-cancel" type="button">取消</button>
            <button class="image-cropper-apply" type="button">使用裁剪图</button>
          </div>
        </section>
      `;
      document.body.appendChild(mask);

      const canvas = mask.querySelector("canvas");
      const ctx = canvas.getContext("2d");
      const zoom = mask.querySelector("#imageCropperZoom");
      const baseScale = Math.max(canvasSize / bitmap.width, canvasSize / bitmap.height);
      const state = {
        scale: baseScale,
        x: (canvasSize - bitmap.width * baseScale) / 2,
        y: (canvasSize - bitmap.height * baseScale) / 2,
        drag: null
      };

      function clamp() {
        const drawnW = bitmap.width * state.scale;
        const drawnH = bitmap.height * state.scale;
        state.x = Math.min(0, Math.max(canvasSize - drawnW, state.x));
        state.y = Math.min(0, Math.max(canvasSize - drawnH, state.y));
      }

      function render() {
        clamp();
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, state.x, state.y, bitmap.width * state.scale, bitmap.height * state.scale);
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canvasSize / 3, 0);
        ctx.lineTo(canvasSize / 3, canvasSize);
        ctx.moveTo((canvasSize * 2) / 3, 0);
        ctx.lineTo((canvasSize * 2) / 3, canvasSize);
        ctx.moveTo(0, canvasSize / 3);
        ctx.lineTo(canvasSize, canvasSize / 3);
        ctx.moveTo(0, (canvasSize * 2) / 3);
        ctx.lineTo(canvasSize, (canvasSize * 2) / 3);
        ctx.stroke();
      }

      function cleanup() {
        bitmap.close?.();
        mask.remove();
      }

      zoom.addEventListener("input", () => {
        const oldScale = state.scale;
        const nextScale = baseScale * (Number(zoom.value) / 100);
        const centerX = canvasSize / 2;
        const centerY = canvasSize / 2;
        state.x = centerX - ((centerX - state.x) / oldScale) * nextScale;
        state.y = centerY - ((centerY - state.y) / oldScale) * nextScale;
        state.scale = nextScale;
        render();
      });

      canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture(event.pointerId);
        state.drag = { x: event.clientX, y: event.clientY, ox: state.x, oy: state.y };
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!state.drag) return;
        state.x = state.drag.ox + event.clientX - state.drag.x;
        state.y = state.drag.oy + event.clientY - state.drag.y;
        render();
      });
      canvas.addEventListener("pointerup", () => { state.drag = null; });
      canvas.addEventListener("pointercancel", () => { state.drag = null; });

      mask.querySelector(".image-cropper-close").onclick = () => {
        cleanup();
        reject(new Error("已取消裁剪"));
      };
      mask.querySelector(".image-cropper-cancel").onclick = () => {
        cleanup();
        reject(new Error("已取消裁剪"));
      };
      mask.querySelector(".image-cropper-apply").onclick = () => {
        try {
          const output = document.createElement("canvas");
          output.width = outputSize;
          output.height = outputSize;
          const outputCtx = output.getContext("2d");
          outputCtx.fillStyle = "#fff";
          outputCtx.fillRect(0, 0, outputSize, outputSize);
          outputCtx.imageSmoothingQuality = "high";
          const ratio = outputSize / canvasSize;
          outputCtx.drawImage(
            bitmap,
            state.x * ratio,
            state.y * ratio,
            bitmap.width * state.scale * ratio,
            bitmap.height * state.scale * ratio
          );
          const dataUrl = compressCanvas(output);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      render();
    });
  };
}());
