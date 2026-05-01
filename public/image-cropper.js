(function () {
  const canvasSize = 280;
  const maxOutputSide = 900;
  const minCropSize = 72;
  const handleSize = 14;

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
      .image-cropper-stage canvas{width:min(280px,calc(100vw - 58px));height:min(280px,calc(100vw - 58px));display:block;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px rgba(13,94,78,.12);cursor:grab;touch-action:none}
      .image-cropper-stage canvas:active{cursor:grabbing}
      .image-cropper-range{display:grid;gap:6px}
      .image-cropper-range label{font-size:12px;font-weight:700;color:#58706c}
      .image-cropper-range input{width:100%;accent-color:#0d9a7d}
      .image-cropper-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .image-cropper-tools button{height:36px;border:0;border-radius:10px;background:#edf6f3;color:#185d52;font-weight:800;cursor:pointer}
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

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
          <div class="image-cropper-tools">
            <button class="image-cropper-flip-x" type="button">左右翻转</button>
            <button class="image-cropper-flip-y" type="button">上下翻转</button>
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
      const baseScale = Math.min(canvasSize / bitmap.width, canvasSize / bitmap.height);
      const imageW = bitmap.width * baseScale;
      const imageH = bitmap.height * baseScale;
      const imageX = (canvasSize - imageW) / 2;
      const imageY = (canvasSize - imageH) / 2;
      const state = {
        scale: baseScale,
        x: imageX,
        y: imageY,
        crop: { x: imageX, y: imageY, w: imageW, h: imageH },
        flipX: false,
        flipY: false,
        drag: null,
        cropDrag: null,
        pinch: null,
        pointers: new Map()
      };

      function imageBounds() {
        return {
          x: state.x,
          y: state.y,
          w: bitmap.width * state.scale,
          h: bitmap.height * state.scale
        };
      }

      function clampCrop() {
        const bounds = imageBounds();
        const maxW = Math.max(minCropSize, bounds.w);
        const maxH = Math.max(minCropSize, bounds.h);
        state.crop.w = clampNumber(state.crop.w, Math.min(minCropSize, maxW), maxW);
        state.crop.h = clampNumber(state.crop.h, Math.min(minCropSize, maxH), maxH);
        state.crop.x = clampNumber(state.crop.x, bounds.x, bounds.x + bounds.w - state.crop.w);
        state.crop.y = clampNumber(state.crop.y, bounds.y, bounds.y + bounds.h - state.crop.h);
      }

      function clampImageToCrop() {
        const drawnW = bitmap.width * state.scale;
        const drawnH = bitmap.height * state.scale;
        if (drawnW <= state.crop.w) {
          state.x = state.crop.x + (state.crop.w - drawnW) / 2;
        } else {
          state.x = clampNumber(state.x, state.crop.x + state.crop.w - drawnW, state.crop.x);
        }
        if (drawnH <= state.crop.h) {
          state.y = state.crop.y + (state.crop.h - drawnH) / 2;
        } else {
          state.y = clampNumber(state.y, state.crop.y + state.crop.h - drawnH, state.crop.y);
        }
        clampCrop();
      }

      function drawBitmap(targetCtx, ratio = 1, offsetX = 0, offsetY = 0) {
        const drawnW = bitmap.width * state.scale * ratio;
        const drawnH = bitmap.height * state.scale * ratio;
        targetCtx.save();
        targetCtx.translate((state.x - offsetX) * ratio + drawnW / 2, (state.y - offsetY) * ratio + drawnH / 2);
        targetCtx.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
        targetCtx.drawImage(bitmap, -drawnW / 2, -drawnH / 2, drawnW, drawnH);
        targetCtx.restore();
      }

      function drawCropOverlay() {
        const c = state.crop;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,.34)";
        ctx.fillRect(0, 0, canvasSize, c.y);
        ctx.fillRect(0, c.y + c.h, canvasSize, canvasSize - c.y - c.h);
        ctx.fillRect(0, c.y, c.x, c.h);
        ctx.fillRect(c.x + c.w, c.y, canvasSize - c.x - c.w, c.h);
        ctx.strokeStyle = "rgba(255,255,255,.96)";
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = "rgba(255,255,255,.72)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x + c.w / 3, c.y);
        ctx.lineTo(c.x + c.w / 3, c.y + c.h);
        ctx.moveTo(c.x + (c.w * 2) / 3, c.y);
        ctx.lineTo(c.x + (c.w * 2) / 3, c.y + c.h);
        ctx.moveTo(c.x, c.y + c.h / 3);
        ctx.lineTo(c.x + c.w, c.y + c.h / 3);
        ctx.moveTo(c.x, c.y + (c.h * 2) / 3);
        ctx.lineTo(c.x + c.w, c.y + (c.h * 2) / 3);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        for (const p of handlePoints()) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      function render() {
        clampImageToCrop();
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.imageSmoothingQuality = "high";
        drawBitmap(ctx);
        drawCropOverlay();
      }

      function cleanup() {
        bitmap.close?.();
        mask.remove();
      }

      function setScale(nextScale, centerX = state.crop.x + state.crop.w / 2, centerY = state.crop.y + state.crop.h / 2) {
        const oldScale = state.scale;
        nextScale = Math.max(baseScale, Math.min(baseScale * 3, nextScale));
        state.x = centerX - ((centerX - state.x) / oldScale) * nextScale;
        state.y = centerY - ((centerY - state.y) / oldScale) * nextScale;
        state.scale = nextScale;
        zoom.value = String(Math.round((state.scale / baseScale) * 100));
        render();
      }

      function pointFor(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (event.clientX - rect.left) * (canvasSize / rect.width),
          y: (event.clientY - rect.top) * (canvasSize / rect.height)
        };
      }

      function distance(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
      }

      function center(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }

      function handlePoints() {
        const c = state.crop;
        return [
          { key: "nw", x: c.x, y: c.y },
          { key: "ne", x: c.x + c.w, y: c.y },
          { key: "sw", x: c.x, y: c.y + c.h },
          { key: "se", x: c.x + c.w, y: c.y + c.h }
        ];
      }

      function hitCrop(point) {
        const c = state.crop;
        const handle = handlePoints().find((p) => Math.abs(point.x - p.x) <= handleSize && Math.abs(point.y - p.y) <= handleSize);
        if (handle) return handle.key;
        const nearLeft = Math.abs(point.x - c.x) <= handleSize && point.y >= c.y && point.y <= c.y + c.h;
        const nearRight = Math.abs(point.x - c.x - c.w) <= handleSize && point.y >= c.y && point.y <= c.y + c.h;
        const nearTop = Math.abs(point.y - c.y) <= handleSize && point.x >= c.x && point.x <= c.x + c.w;
        const nearBottom = Math.abs(point.y - c.y - c.h) <= handleSize && point.x >= c.x && point.x <= c.x + c.w;
        if (nearLeft) return "w";
        if (nearRight) return "e";
        if (nearTop) return "n";
        if (nearBottom) return "s";
        if (point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h) return "move";
        return "image";
      }

      function updateCropFromDrag(point) {
        if (!state.cropDrag) return;
        const bounds = imageBounds();
        const mode = state.cropDrag.mode;
        const dx = point.x - state.cropDrag.x;
        const dy = point.y - state.cropDrag.y;
        let { x, y, w, h } = state.cropDrag.crop;
        if (mode === "move") {
          state.crop.x = clampNumber(x + dx, bounds.x, bounds.x + bounds.w - w);
          state.crop.y = clampNumber(y + dy, bounds.y, bounds.y + bounds.h - h);
          return;
        }
        let left = x;
        let right = x + w;
        let top = y;
        let bottom = y + h;
        if (mode.includes("w")) left = clampNumber(left + dx, bounds.x, right - minCropSize);
        if (mode.includes("e")) right = clampNumber(right + dx, left + minCropSize, bounds.x + bounds.w);
        if (mode.includes("n")) top = clampNumber(top + dy, bounds.y, bottom - minCropSize);
        if (mode.includes("s")) bottom = clampNumber(bottom + dy, top + minCropSize, bounds.y + bounds.h);
        state.crop = { x: left, y: top, w: right - left, h: bottom - top };
      }

      function startPinch() {
        const points = Array.from(state.pointers.values());
        if (points.length < 2) return;
        const pinchCenter = center(points[0], points[1]);
        const pinchDistance = distance(points[0], points[1]) || 1;
        state.pinch = {
          distance: pinchDistance,
          centerX: pinchCenter.x,
          centerY: pinchCenter.y,
          scale: state.scale,
          x: state.x,
          y: state.y
        };
        state.drag = null;
        state.cropDrag = null;
      }

      zoom.addEventListener("input", () => {
        setScale(baseScale * (Number(zoom.value) / 100));
      });

      canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture(event.pointerId);
        const point = pointFor(event);
        state.pointers.set(event.pointerId, point);
        if (state.pointers.size === 1) {
          const mode = hitCrop(point);
          if (mode === "image") {
            state.drag = { x: point.x, y: point.y, ox: state.x, oy: state.y };
            state.cropDrag = null;
          } else {
            state.cropDrag = { mode, x: point.x, y: point.y, crop: { ...state.crop } };
            state.drag = null;
          }
        } else {
          startPinch();
        }
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!state.pointers.has(event.pointerId)) return;
        const point = pointFor(event);
        state.pointers.set(event.pointerId, point);
        if (state.pointers.size >= 2 && state.pinch) {
          const points = Array.from(state.pointers.values());
          const currentCenter = center(points[0], points[1]);
          const nextScale = state.pinch.scale * (distance(points[0], points[1]) / state.pinch.distance);
          const imageX = (state.pinch.centerX - state.pinch.x) / state.pinch.scale;
          const imageY = (state.pinch.centerY - state.pinch.y) / state.pinch.scale;
          state.scale = Math.max(baseScale, Math.min(baseScale * 3, nextScale));
          state.x = currentCenter.x - imageX * state.scale;
          state.y = currentCenter.y - imageY * state.scale;
          zoom.value = String(Math.round((state.scale / baseScale) * 100));
          render();
          return;
        }
        if (state.cropDrag) {
          updateCropFromDrag(point);
          render();
          return;
        }
        if (!state.drag) return;
        state.x = state.drag.ox + point.x - state.drag.x;
        state.y = state.drag.oy + point.y - state.drag.y;
        render();
      });

      function endPointer(event) {
        state.pointers.delete(event.pointerId);
        state.drag = null;
        state.cropDrag = null;
        state.pinch = null;
        if (state.pointers.size === 1) {
          const [point] = Array.from(state.pointers.values());
          state.drag = { x: point.x, y: point.y, ox: state.x, oy: state.y };
        }
      }
      canvas.addEventListener("pointerup", endPointer);
      canvas.addEventListener("pointercancel", endPointer);

      mask.querySelector(".image-cropper-flip-x").onclick = () => {
        state.flipX = !state.flipX;
        render();
      };
      mask.querySelector(".image-cropper-flip-y").onclick = () => {
        state.flipY = !state.flipY;
        render();
      };

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
          const ratio = maxOutputSide / Math.max(state.crop.w, state.crop.h);
          output.width = Math.max(1, Math.round(state.crop.w * ratio));
          output.height = Math.max(1, Math.round(state.crop.h * ratio));
          const outputCtx = output.getContext("2d");
          outputCtx.fillStyle = "#fff";
          outputCtx.fillRect(0, 0, output.width, output.height);
          outputCtx.imageSmoothingQuality = "high";
          drawBitmap(outputCtx, ratio, state.crop.x, state.crop.y);
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
