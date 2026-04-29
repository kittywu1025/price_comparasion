(function () {
  const state = {
    stores: [],
    importRows: []
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function notify(message, type = "info", options = {}) {
    if (window.showToast) window.showToast(message, { type, ...options });
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function ensureStyles() {
    if (document.getElementById("priceImportStyles")) return;
    const style = document.createElement("style");
    style.id = "priceImportStyles";
    style.textContent = `
      .price-import-card{display:grid;gap:10px}
      .price-import-title{margin:0;color:#607270;font-size:12px;font-weight:700}
      .price-import-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .price-import-action{height:48px;border:0;border-radius:14px;background:#fff;box-shadow:0 8px 16px rgba(12,48,42,.07);color:#166659;cursor:pointer;font-weight:800}
      .price-import-action:first-child{color:#b86c12}
      .price-import-help{margin:0;color:#607270;font-size:12px;line-height:1.45}
      .price-import-mask{position:fixed;inset:0;background:rgba(7,19,18,.45);display:none;align-items:flex-end;justify-content:center;z-index:39;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
      .price-import-mask.show{display:flex}
      .price-import-panel{width:min(1080px,calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right) - 20px));max-height:min(760px,calc(100dvh - 40px));border-radius:18px;background:#fff;border:1px solid #dceae6;box-shadow:0 14px 28px rgba(14,63,56,.1);display:grid;grid-template-rows:auto auto 1fr auto;overflow:hidden}
      .price-import-head,.price-import-foot{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e6efec}
      .price-import-head h2{margin:0;font-size:16px}
      .price-import-close{width:34px;height:34px;border:0;border-radius:999px;background:#edf6f3;color:#1a5950;cursor:pointer;font-size:18px}
      .price-import-summary{margin:0;padding:10px 12px;color:#607270;font-size:12px;line-height:1.45;border-bottom:1px solid #e6efec}
      .price-import-table-wrap{overflow:auto;background:#f8fcfb}
      .price-import-table{width:100%;min-width:1180px;border-collapse:collapse;font-size:12px}
      .price-import-table th,.price-import-table td{border-bottom:1px solid #e2ece9;padding:7px;text-align:left;vertical-align:top}
      .price-import-table th{position:sticky;top:0;z-index:1;background:#eef7f4;color:#465f5c;font-weight:800}
      .price-import-table input,.price-import-table select{width:100%;height:34px;min-width:80px;border:1px solid #dbe7e3;border-radius:9px;background:#fff;padding:0 8px;color:#1f2a2b;font:inherit;font-size:12px}
      .price-import-row-error{margin-top:4px;color:#ca3f3f;font-size:11px;line-height:1.35}
      .price-import-foot{border-top:1px solid #e6efec;border-bottom:0;background:#fff}
      .price-import-foot-actions{display:flex;gap:8px;align-items:center}
    `;
    document.head.appendChild(style);
  }

  async function loadStores() {
    if (state.stores.length) return state.stores;
    const res = await fetch("/api/stores");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "店铺读取失败");
    state.stores = data;
    return state.stores;
  }

  function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        cells.push(cell);
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells.map((x) => x.trim());
  }

  function parseDelimitedText(text) {
    const cleanText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    if (!cleanText) throw new Error("文件里没有可导入的数据");
    const lines = cleanText.split("\n").filter((line) => line.trim());
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const rawRows = lines.map((line) => splitDelimitedLine(line, delimiter));
    const headers = rawRows[0].map((x) => x.trim());
    const aliases = {
      nameZh: ["中文名", "商品中文名", "nameZh", "name_zh"],
      nameJa: ["日文名", "商品日文名", "nameJa", "name_ja"],
      barcode: ["条码", "barcode", "JAN"],
      storeName: ["店铺", "店铺名", "购买店铺", "store", "storeName"],
      priceTaxIn: ["税后价", "税后价格", "含税价格", "priceTaxIn"],
      priceTaxEx: ["税前价", "税前价格", "不含税价格", "priceTaxEx"],
      taxRate: ["税率", "taxRate"],
      specValue: ["规格", "规格数值", "spec", "specValue"],
      unit: ["单位", "规格单位", "unit"],
      recordDate: ["日期", "记录日期", "recordDate"],
      isPromo: ["限时优惠", "是否限时优惠", "isPromo"],
      promoUntil: ["优惠截止日期", "限时优惠截止日期", "promoUntil"],
      note: ["备注", "note"]
    };
    const indexOf = (keys) => headers.findIndex((header) => keys.some((key) => header.toLowerCase() === String(key).toLowerCase()));
    const indexes = Object.fromEntries(Object.entries(aliases).map(([key, keys]) => [key, indexOf(keys)]));
    return rawRows.slice(1).map((row, index) => ({
      selected: true,
      sourceIndex: index + 2,
      nameZh: row[indexes.nameZh] || "",
      nameJa: row[indexes.nameJa] || "",
      barcode: row[indexes.barcode] || "",
      storeName: row[indexes.storeName] || "",
      priceTaxIn: row[indexes.priceTaxIn] || "",
      priceTaxEx: row[indexes.priceTaxEx] || "",
      taxRate: row[indexes.taxRate] || "8",
      specValue: row[indexes.specValue] || "",
      unit: row[indexes.unit] || "g",
      recordDate: row[indexes.recordDate] || today(),
      isPromo: row[indexes.isPromo] || "否",
      promoUntil: row[indexes.promoUntil] || "",
      note: row[indexes.note] || ""
    })).filter((row) => Object.values(row).some((value) => typeof value === "string" && value.trim()));
  }

  function findStoreByName(name) {
    const keyword = String(name || "").trim().toLowerCase();
    if (!keyword) return null;
    const exact = state.stores.find((store) => String(store.name || "").toLowerCase() === keyword);
    return exact || state.stores.find((store) => String(store.name || "").toLowerCase().includes(keyword));
  }

  function toNumberOrNull(value) {
    const cleaned = String(value ?? "").replace(/[¥￥円,\s]/g, "");
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : null;
  }

  function isPromoValue(value) {
    return /^(是|yes|y|true|1|限时|优惠)$/i.test(String(value || "").trim());
  }

  function validateImportRow(row) {
    const errors = [];
    if (!String(row.nameZh || "").trim() && !String(row.nameJa || "").trim()) errors.push("商品名必填");
    const store = findStoreByName(row.storeName);
    if (!store) errors.push("店铺未匹配");
    const priceTaxIn = toNumberOrNull(row.priceTaxIn);
    const priceTaxEx = toNumberOrNull(row.priceTaxEx);
    if ((!priceTaxIn || priceTaxIn <= 0) && (!priceTaxEx || priceTaxEx <= 0)) errors.push("价格必填");
    const specValue = toNumberOrNull(row.specValue);
    if (!specValue || specValue <= 0) errors.push("规格必填");
    if (!["g", "ml", "个"].includes(String(row.unit || "").trim())) errors.push("单位需为 g/ml/个");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.recordDate || ""))) errors.push("日期格式 YYYY-MM-DD");
    if (isPromoValue(row.isPromo) && row.promoUntil && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.promoUntil))) {
      errors.push("优惠截止日期格式 YYYY-MM-DD");
    }
    return { errors, store };
  }

  function buildPromoNote(row) {
    const plain = String(row.note || "").trim().replace(/^\[\[promo(?::\d{4}-\d{2}-\d{2})?\]\]\s*/i, "");
    if (!isPromoValue(row.isPromo)) return plain;
    const prefix = row.promoUntil ? `[[promo:${row.promoUntil}]]` : "[[promo]]";
    return plain ? `${prefix} ${plain}` : prefix;
  }

  function buildImportPayload(row, store) {
    const taxRate = Number(toNumberOrNull(row.taxRate) ?? 8);
    const priceTaxIn = toNumberOrNull(row.priceTaxIn);
    const priceTaxEx = toNumberOrNull(row.priceTaxEx);
    const factor = taxRate === 0 ? 1 : 1 + taxRate / 100;
    const after = priceTaxIn || (priceTaxEx ? Math.round(priceTaxEx * factor * 10) / 10 : null);
    const before = priceTaxEx || (priceTaxIn ? Math.round((priceTaxIn / factor) * 10) / 10 : null);
    return {
      product: {
        nameZh: String(row.nameZh || "").trim(),
        nameJa: String(row.nameJa || "").trim(),
        barcode: String(row.barcode || "").trim()
      },
      storeId: Number(store.id),
      priceTaxEx: before,
      taxRate,
      priceTaxIn: after,
      specValue: Number(toNumberOrNull(row.specValue)),
      unit: String(row.unit || "g").trim(),
      imageUrls: [],
      recordDate: row.recordDate,
      note: buildPromoNote(row)
    };
  }

  function renderImportPreview() {
    const body = document.getElementById("importPreviewBody");
    body.innerHTML = state.importRows.map((row, index) => {
      const { errors } = validateImportRow(row);
      return `
        <tr data-index="${index}">
          <td><input type="checkbox" data-field="selected" ${row.selected ? "checked" : ""} /></td>
          <td><input data-field="nameZh" value="${escapeHtml(row.nameZh)}" /></td>
          <td><input data-field="nameJa" value="${escapeHtml(row.nameJa)}" /></td>
          <td><input data-field="barcode" value="${escapeHtml(row.barcode)}" /></td>
          <td><input data-field="storeName" list="storeOptions" value="${escapeHtml(row.storeName)}" /></td>
          <td><input data-field="priceTaxIn" inputmode="decimal" value="${escapeHtml(row.priceTaxIn)}" /></td>
          <td><input data-field="priceTaxEx" inputmode="decimal" value="${escapeHtml(row.priceTaxEx)}" /></td>
          <td><input data-field="taxRate" inputmode="decimal" value="${escapeHtml(row.taxRate)}" /></td>
          <td><input data-field="specValue" inputmode="decimal" value="${escapeHtml(row.specValue)}" /></td>
          <td><select data-field="unit">${["g", "ml", "个"].map((unit) => `<option value="${unit}" ${row.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></td>
          <td><input data-field="recordDate" type="date" value="${escapeHtml(row.recordDate)}" /></td>
          <td><select data-field="isPromo"><option value="否" ${!isPromoValue(row.isPromo) ? "selected" : ""}>否</option><option value="是" ${isPromoValue(row.isPromo) ? "selected" : ""}>是</option></select></td>
          <td><input data-field="promoUntil" type="date" value="${escapeHtml(row.promoUntil)}" /></td>
          <td><input data-field="note" value="${escapeHtml(row.note)}" /></td>
          <td>${errors.length ? `<div class="price-import-row-error">${escapeHtml(errors.join("；"))}</div>` : "可导入"}</td>
        </tr>
      `;
    }).join("");
    updateImportCount();
  }

  function updateImportCount() {
    const selected = state.importRows.filter((row) => row.selected).length;
    const invalid = state.importRows.filter((row) => row.selected && validateImportRow(row).errors.length).length;
    document.getElementById("importCountText").textContent = `已选择 ${selected} 条${invalid ? `，其中 ${invalid} 条需要修改` : ""}`;
    document.getElementById("selectAllImportRows").checked = selected > 0 && selected === state.importRows.length;
  }

  function openImportPreview(rows, fileName) {
    state.importRows = rows;
    document.getElementById("importSummary").textContent = `已解析 ${rows.length} 条记录：${fileName || "导入文件"}。请检查店铺、价格、规格、优惠和日期，确认无误后再导入。`;
    renderImportPreview();
    document.getElementById("importMask").classList.add("show");
  }

  function closeImportPreview() {
    document.getElementById("importMask").classList.remove("show");
  }

  function downloadImportTemplate() {
    const rows = [
      ["中文名", "日文名", "条码", "店铺", "税后价", "税前价", "税率", "规格", "单位", "日期", "限时优惠", "优惠截止日期", "备注"],
      ["牛奶", "牛乳", "4900000000000", state.stores[0]?.name || "请填写已有店铺名", "198", "", "8", "1000", "ml", today(), "是", today(), "可选"]
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "price-import-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify("模板文件已下载。", "success");
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      notify("当前浏览器端导入请把 Excel 另存为 CSV 后再上传。模板会下载为 CSV。", "error", { sticky: true });
      return;
    }
    try {
      await loadStores();
      const rows = parseDelimitedText(await file.text());
      if (!rows.length) throw new Error("没有解析到有效记录");
      openImportPreview(rows, file.name);
      notify("解析完成，请先预览确认。", "success");
    } catch (err) {
      notify(`导入解析失败：${err.message || "请检查模板格式"}`, "error");
    }
  }

  async function commitImportRows() {
    const selected = state.importRows.filter((row) => row.selected);
    if (!selected.length) {
      notify("请至少选择一条记录。", "error");
      return;
    }
    const checks = selected.map((row) => ({ row, ...validateImportRow(row) }));
    const invalid = checks.filter((item) => item.errors.length);
    if (invalid.length) {
      renderImportPreview();
      notify(`还有 ${invalid.length} 条记录需要修改后才能导入。`, "error");
      return;
    }

    const button = document.getElementById("commitImportRows");
    button.disabled = true;
    let success = 0;
    try {
      for (const item of checks) {
        const res = await fetch("/api/price-records", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildImportPayload(item.row, item.store))
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`第 ${item.row.sourceIndex} 行导入失败：${data.error || "未知错误"}`);
        success += 1;
      }
      closeImportPreview();
      notify(`已导入 ${success} 条价格记录。`, "success", { duration: 3600 });
    } catch (err) {
      notify(err.message || "导入失败", "error", { sticky: true });
    } finally {
      button.disabled = false;
    }
  }

  function renderImportUi(mount) {
    mount.innerHTML = `
      <section class="panel price-import-card" aria-label="记录与模板">
        <p class="price-import-title">记录与模板</p>
        <div class="price-import-actions">
          <button id="importRecordsBtn" class="price-import-action" type="button">导入记录</button>
          <button id="downloadTemplateBtn" class="price-import-action" type="button">下载模板文件</button>
        </div>
        <p class="price-import-help">先下载模板填写价格数据，再导入预览；确认列表里可以单选、批量选择并手动修正。</p>
        <input id="importFile" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,text/tab-separated-values" style="display:none" />
      </section>
      <datalist id="storeOptions"></datalist>
    `;
    document.body.insertAdjacentHTML("beforeend", `
      <div id="importMask" class="price-import-mask">
        <div class="price-import-panel">
          <div class="price-import-head">
            <h2>导入数据确认</h2>
            <button id="closeImportPreview" class="price-import-close" type="button" aria-label="关闭">×</button>
          </div>
          <p id="importSummary" class="price-import-summary"></p>
          <div class="price-import-table-wrap">
            <table class="price-import-table">
              <thead>
                <tr>
                  <th><input id="selectAllImportRows" type="checkbox" checked aria-label="全选" /></th>
                  <th>中文名</th><th>日文名</th><th>条码</th><th>店铺</th><th>税后价</th><th>税前价</th><th>税率</th><th>规格</th><th>单位</th><th>日期</th><th>限时优惠</th><th>优惠截止</th><th>备注</th><th>校验</th>
                </tr>
              </thead>
              <tbody id="importPreviewBody"></tbody>
            </table>
          </div>
          <div class="price-import-foot">
            <span id="importCountText" class="price-import-help"></span>
            <div class="price-import-foot-actions">
              <button id="cancelImportPreview" type="button">取消</button>
              <button id="commitImportRows" class="primary" type="button">确认导入</button>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  function bindImportUi() {
    document.getElementById("downloadTemplateBtn").onclick = async () => {
      try {
        await loadStores();
        document.getElementById("storeOptions").innerHTML = state.stores.map((s) => `<option value="${escapeHtml(s.name)}"></option>`).join("");
        downloadImportTemplate();
      } catch (err) {
        notify(err.message || "模板生成失败", "error");
      }
    };
    document.getElementById("importRecordsBtn").onclick = () => {
      const input = document.getElementById("importFile");
      input.value = "";
      input.click();
    };
    document.getElementById("importFile").onchange = (event) => handleImportFile((event.target.files || [])[0]);
    document.getElementById("closeImportPreview").onclick = closeImportPreview;
    document.getElementById("cancelImportPreview").onclick = closeImportPreview;
    document.getElementById("importMask").addEventListener("click", (event) => {
      if (event.target === document.getElementById("importMask")) closeImportPreview();
    });
    document.getElementById("selectAllImportRows").onchange = (event) => {
      state.importRows.forEach((row) => {
        row.selected = event.target.checked;
      });
      renderImportPreview();
    };
    document.getElementById("importPreviewBody").addEventListener("input", (event) => {
      const rowEl = event.target.closest("tr[data-index]");
      if (!rowEl) return;
      const row = state.importRows[Number(rowEl.dataset.index)];
      const field = event.target.dataset.field;
      if (!row || !field) return;
      row[field] = field === "selected" ? event.target.checked : event.target.value;
      updateImportCount();
    });
    document.getElementById("importPreviewBody").addEventListener("change", (event) => {
      const rowEl = event.target.closest("tr[data-index]");
      if (!rowEl) return;
      const row = state.importRows[Number(rowEl.dataset.index)];
      const field = event.target.dataset.field;
      if (!row || !field) return;
      row[field] = field === "selected" ? event.target.checked : event.target.value;
      renderImportPreview();
    });
    document.getElementById("commitImportRows").onclick = commitImportRows;
  }

  window.setupPriceImport = function setupPriceImport(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    ensureStyles();
    renderImportUi(mount);
    bindImportUi();
    loadStores().then((stores) => {
      document.getElementById("storeOptions").innerHTML = stores.map((s) => `<option value="${escapeHtml(s.name)}"></option>`).join("");
    }).catch(() => {
      // Loading stores is retried when the user downloads a template or imports a file.
    });
  };
}());
