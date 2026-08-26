#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, expectedCsp, hashSpec, validateHtml, validateSpec } from "./validate.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, "../assets/explainer-shell.html");

function isDirectCli(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

const STRINGS = {
  en: {
    mode: { concept: "Concept", module: "Module", tradeoff: "Tradeoff", incident: "Incident" },
    kind: { actor: "Actor", process: "Process", store: "Store", decision: "Decision", event: "Event" },
    status: { verified: "Verified", inferred: "Inferred", analogy: "Analogy" },
    truthKicker: "Truth ladder",
    truthTitle: "Simple first. Honest all the way down.",
    depthLabel: "Explanation depth",
    analogy: "Analogy",
    technical: "Technical truth",
    caveat: "Caveat",
    traceKicker: "Trace mode",
    traceTitle: "Follow one thing through the system",
    ready: "Ready to trace.",
    step: "Step",
    of: "of",
    play: "Play",
    pause: "Pause",
    previous: "Previous",
    next: "Next",
    reset: "Reset",
    failureLens: "Failure lens",
    inspectFailure: "Inspect failure",
    workspace: {
      menu: "Library",
      close: "Close",
      title: "Study library",
      favorites: "Favorites",
      noFavorites: "No favorites yet.",
      enableLibrary: "Enable local library",
      enableLibraryDetail: "Enable browser-local history, favorites, and annotations for explainers opened on this same site.",
      contents: "Contents",
      history: "Open history",
      annotations: "Annotations",
      favoriteDocument: "Favorite explainer",
      favoritedDocument: "Explainer favorited",
      playScene: "Play section",
      pauseScene: "Pause section",
      favoriteScene: "Favorite",
      favoritedScene: "Favorited",
      annotate: "Annotate",
      current: "Current",
      noHistory: "No previously opened explainers.",
      noAnnotations: "No annotations yet.",
      annotationScene: "Section",
      annotationPlaceholder: "Write a note about this section.",
      saveAnnotation: "Save annotation",
      cancelEdit: "Cancel edit",
      edit: "Edit",
      remove: "Delete",
      exportTitle: "Export",
      exportPdf: "Print / PDF",
      exportPptx: "Export all scenes to PPTX",
      exportImage: "Export current scene PNG",
      exportDocx: "Pages-compatible DOCX",
      exportPages: "Export native Pages (.pages)",
      exportSceneImage: "Export PNG",
      exporting: "Preparing export…",
      pagesConverting: "Converting with the local Pages helper…",
      pagesUnavailable: "Native Pages export needs this file to be opened through the bundled local helper on a Mac with Pages. The DOCX export remains available.",
      pagesBusy: "Pages is already converting another file. Try again when it finishes; the DOCX export remains available.",
      pagesTimedOut: "The browser stopped waiting, but Pages may still be finishing locally. Try again after it closes, or use the DOCX export.",
      pagesFailed: "Native Pages conversion failed safely. No .pages file was claimed; use the DOCX export or try the helper again.",
      exportReady: "Ready:",
      exportFailed: "Export failed in this browser.",
      storageLocal: "Favorites, history, and annotations stay in this browser for this site.",
      storageUnavailable: "Persistent storage is unavailable; changes last only until this tab closes.",
      libraryLimit: "The local library limit has been reached. Delete an existing favorite or annotation before adding another.",
      opened: "Opened",
      noteCount: "notes"
    },
    impact: "Impact",
    symptom: "Symptom",
    fallback: "Fallback",
    diagramSuffix: "diagram",
    stackedFlowSuffix: "stacked flow",
    glossaryKicker: "Glossary",
    glossaryTitle: "Words worth keeping",
    evidenceKicker: "Evidence map",
    evidenceTitle: "What each claim rests on",
    sceneEvidenceKicker: "Evidence in context",
    sceneEvidenceTitle: "What supports this section",
    sceneEvidenceDefault: "Section evidence is shown. Playback focuses the sources for the active step.",
    sceneEvidenceCurrent: "Current step evidence",
    evidenceCore: "Core basis",
    openSource: "Open source",
    localSource: "Local source",
    fullEvidence: "Full evidence record",
    supports: "Supports",
    noSourceLocator: "Teaching or synthesis boundary; no source link.",
    traceProgress: "Trace progress",
    teachKicker: "Teach back",
    teachTitle: "Can you explain it now?",
    reveal: "Reveal answer",
    hide: "Hide answer",
    grammarKicker: "Story grammar",
    conceptMapTitle: "Intuition → mechanism → boundary",
    intuition: "Intuition",
    mechanism: "Mechanism",
    boundary: "Boundary",
    moduleMapTitle: "Module contract",
    entry: "Entry",
    outputs: "Outputs",
    sourceAnchors: "Source anchors",
    tradeoffMapTitle: "Decision frame",
    sharedGoal: "Shared goal",
    decisionRule: "Decision rule",
    incidentMapTitle: "Incident timeline",
    firstBreak: "First break",
    recovery: "Recovery",
    rootCauseEvidence: "Root-cause evidence",
    fit: { strong: "Strong fit", mixed: "Mixed fit", weak: "Weak fit", depends: "Depends" }
  },
  "zh-CN": {
    mode: { concept: "概念", module: "模块", tradeoff: "权衡", incident: "故障" },
    kind: { actor: "参与者", process: "处理", store: "存储", decision: "决策", event: "事件" },
    status: { verified: "已验证", inferred: "推断", analogy: "类比" },
    truthKicker: "事实阶梯",
    truthTitle: "先说人话，再把事实讲到底。",
    depthLabel: "解释层级",
    analogy: "类比",
    technical: "技术事实",
    caveat: "边界与限制",
    traceKicker: "追踪模式",
    traceTitle: "跟着一个对象走完整条链路",
    ready: "准备开始追踪。",
    step: "步骤",
    of: "/",
    play: "播放",
    pause: "暂停",
    previous: "上一步",
    next: "下一步",
    reset: "重置",
    failureLens: "故障透镜",
    inspectFailure: "查看故障",
    workspace: {
      menu: "目录",
      close: "关闭",
      title: "讲解资料库",
      favorites: "我的收藏",
      noFavorites: "还没有收藏内容。",
      enableLibrary: "启用本地资料库",
      enableLibraryDetail: "启用后，当前站点打开过的讲解、收藏和批注会保存在这个浏览器中。",
      contents: "本页目录",
      history: "打开历史",
      annotations: "批注浏览",
      favoriteDocument: "收藏本文",
      favoritedDocument: "本文已收藏",
      playScene: "局部播放",
      pauseScene: "暂停局部播放",
      favoriteScene: "收藏",
      favoritedScene: "已收藏",
      annotate: "添加批注",
      current: "当前页面",
      noHistory: "还没有以前打开过的讲解。",
      noAnnotations: "还没有批注。",
      annotationScene: "批注位置",
      annotationPlaceholder: "写下对这一节的理解、疑问或补充。",
      saveAnnotation: "保存批注",
      cancelEdit: "取消编辑",
      edit: "编辑",
      remove: "删除",
      exportTitle: "一键导出",
      exportPdf: "打印 / 导出 PDF",
      exportPptx: "全部场景导出 PPTX",
      exportImage: "当前场景导出 PNG",
      exportDocx: "Pages 可打开（DOCX）",
      exportPages: "导出原生 Pages（.pages）",
      exportSceneImage: "导出 PNG",
      exporting: "正在生成导出文件…",
      pagesConverting: "正在通过本机 Pages Helper 转换…",
      pagesUnavailable: "原生 Pages 导出需要在安装了 Pages 的 Mac 上通过随附的本地 Helper 打开此文件；DOCX 导出仍可使用。",
      pagesBusy: "Pages 正在转换另一个文件。完成后可重试；DOCX 导出仍可使用。",
      pagesTimedOut: "浏览器已停止等待，但 Pages 可能仍在本机收尾。可等它关闭后重试，或直接导出 DOCX。",
      pagesFailed: "原生 Pages 转换已安全失败，没有冒充生成文件；可改用 DOCX，或重新运行 Helper 后再试。",
      exportReady: "文件已生成：",
      exportFailed: "当前浏览器未能完成导出。",
      storageLocal: "收藏、历史和批注只保存在本浏览器的当前站点，不会同步或写回 HTML。",
      storageUnavailable: "浏览器持久化存储不可用；本次修改只在当前标签页有效。",
      libraryLimit: "本地资料库已达到上限，请先删除一条收藏或批注再继续添加。",
      opened: "打开于",
      noteCount: "条批注"
    },
    impact: "影响",
    symptom: "表象",
    fallback: "兜底",
    diagramSuffix: "图解",
    stackedFlowSuffix: "堆叠流程",
    glossaryKicker: "术语表",
    glossaryTitle: "值得记住的词",
    evidenceKicker: "证据地图",
    evidenceTitle: "每个结论依据什么",
    sceneEvidenceKicker: "场景内证据",
    sceneEvidenceTitle: "这一节的结论依据",
    sceneEvidenceDefault: "默认显示本节依据；播放时会聚焦当前步骤对应的来源。",
    sceneEvidenceCurrent: "当前步骤依据",
    evidenceCore: "核心依据",
    openSource: "打开原文",
    localSource: "本地来源",
    fullEvidence: "查看完整证据记录",
    supports: "支持结论",
    noSourceLocator: "这是教学类比或跨来源归纳，没有外部定位链接。",
    traceProgress: "追踪进度",
    teachKicker: "复述检验",
    teachTitle: "现在能用自己的话讲清楚吗？",
    reveal: "查看答案",
    hide: "收起答案",
    grammarKicker: "故事语法",
    conceptMapTitle: "直觉 → 机制 → 边界",
    intuition: "直觉",
    mechanism: "机制",
    boundary: "边界",
    moduleMapTitle: "模块契约",
    entry: "入口",
    outputs: "输出",
    sourceAnchors: "源码锚点",
    tradeoffMapTitle: "决策框架",
    sharedGoal: "共同目标",
    decisionRule: "决策规则",
    incidentMapTitle: "故障时间线",
    firstBreak: "首次断点",
    recovery: "恢复",
    rootCauseEvidence: "根因证据",
    fit: { strong: "强匹配", mixed: "部分匹配", weak: "弱匹配", depends: "视情况" }
  },
  "zh-TW": {
    mode: { concept: "概念", module: "模組", tradeoff: "權衡", incident: "故障" },
    kind: { actor: "參與者", process: "處理", store: "儲存", decision: "決策", event: "事件" },
    status: { verified: "已驗證", inferred: "推論", analogy: "類比" },
    truthKicker: "事實階梯",
    truthTitle: "先說白話，再把事實講到底。",
    depthLabel: "解釋層級",
    analogy: "類比",
    technical: "技術事實",
    caveat: "邊界與限制",
    traceKicker: "追蹤模式",
    traceTitle: "跟著一個物件走完整條鏈路",
    ready: "準備開始追蹤。",
    step: "步驟",
    of: "/",
    play: "播放",
    pause: "暫停",
    previous: "上一步",
    next: "下一步",
    reset: "重設",
    failureLens: "故障透鏡",
    inspectFailure: "查看故障",
    workspace: {
      menu: "目錄",
      close: "關閉",
      title: "講解資料庫",
      favorites: "我的收藏",
      noFavorites: "還沒有收藏內容。",
      enableLibrary: "啟用本機資料庫",
      enableLibraryDetail: "啟用後，目前站點開啟過的講解、收藏和批註會保存在這個瀏覽器中。",
      contents: "本頁目錄",
      history: "開啟歷史",
      annotations: "批註瀏覽",
      favoriteDocument: "收藏本文",
      favoritedDocument: "本文已收藏",
      playScene: "局部播放",
      pauseScene: "暫停局部播放",
      favoriteScene: "收藏",
      favoritedScene: "已收藏",
      annotate: "新增批註",
      current: "目前頁面",
      noHistory: "還沒有以前開啟過的講解。",
      noAnnotations: "還沒有批註。",
      annotationScene: "批註位置",
      annotationPlaceholder: "寫下對這一節的理解、疑問或補充。",
      saveAnnotation: "儲存批註",
      cancelEdit: "取消編輯",
      edit: "編輯",
      remove: "刪除",
      exportTitle: "一鍵匯出",
      exportPdf: "列印 / 匯出 PDF",
      exportPptx: "全部場景匯出 PPTX",
      exportImage: "目前場景匯出 PNG",
      exportDocx: "Pages 可開啟（DOCX）",
      exportPages: "匯出原生 Pages（.pages）",
      exportSceneImage: "匯出 PNG",
      exporting: "正在產生匯出檔案…",
      pagesConverting: "正在透過本機 Pages Helper 轉換…",
      pagesUnavailable: "原生 Pages 匯出需要在已安裝 Pages 的 Mac 上透過隨附的本機 Helper 開啟此檔案；DOCX 匯出仍可使用。",
      pagesBusy: "Pages 正在轉換另一個檔案。完成後可重試；DOCX 匯出仍可使用。",
      pagesTimedOut: "瀏覽器已停止等待，但 Pages 可能仍在本機收尾。可等它關閉後重試，或直接匯出 DOCX。",
      pagesFailed: "原生 Pages 轉換已安全失敗，沒有冒充產生檔案；可改用 DOCX，或重新執行 Helper 後再試。",
      exportReady: "檔案已產生：",
      exportFailed: "目前瀏覽器未能完成匯出。",
      storageLocal: "收藏、歷史和批註只保存在本瀏覽器的目前站點，不會同步或寫回 HTML。",
      storageUnavailable: "瀏覽器持久化儲存不可用；本次修改只在目前分頁有效。",
      libraryLimit: "本機資料庫已達上限，請先刪除一則收藏或批註再繼續新增。",
      opened: "開啟於",
      noteCount: "則批註"
    },
    impact: "影響",
    symptom: "表象",
    fallback: "備援",
    diagramSuffix: "圖解",
    stackedFlowSuffix: "堆疊流程",
    glossaryKicker: "術語表",
    glossaryTitle: "值得記住的詞",
    evidenceKicker: "證據地圖",
    evidenceTitle: "每個結論依據什麼",
    sceneEvidenceKicker: "場景內證據",
    sceneEvidenceTitle: "這一節的結論依據",
    sceneEvidenceDefault: "預設顯示本節依據；播放時會聚焦目前步驟對應的來源。",
    sceneEvidenceCurrent: "目前步驟依據",
    evidenceCore: "核心依據",
    openSource: "開啟原文",
    localSource: "本機來源",
    fullEvidence: "查看完整證據記錄",
    supports: "支持結論",
    noSourceLocator: "這是教學類比或跨來源歸納，沒有外部定位連結。",
    traceProgress: "追蹤進度",
    teachKicker: "複述檢驗",
    teachTitle: "現在能用自己的話講清楚嗎？",
    reveal: "查看答案",
    hide: "收起答案",
    grammarKicker: "故事語法",
    conceptMapTitle: "直覺 → 機制 → 邊界",
    intuition: "直覺",
    mechanism: "機制",
    boundary: "邊界",
    moduleMapTitle: "模組契約",
    entry: "入口",
    outputs: "輸出",
    sourceAnchors: "原始碼錨點",
    tradeoffMapTitle: "決策框架",
    sharedGoal: "共同目標",
    decisionRule: "決策規則",
    incidentMapTitle: "故障時間線",
    firstBreak: "首次斷點",
    recovery: "恢復",
    rootCauseEvidence: "根因證據",
    fit: { strong: "強匹配", mixed: "部分匹配", weak: "弱匹配", depends: "視情況" }
  }
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function evidenceBadges(ids = [], evidence = new Map()) {
  return ids.map((id) => {
    const item = evidence.get(id);
    return `<a class="evidence-ref" data-evidence-ref="${esc(id)}" href="#evidence-${esc(id)}"${item ? ` title="${esc(item.label)}"` : ""}>${esc(id)}</a>`;
  }).join("");
}

function renderNode(node, ui, evidence) {
  const kind = node.kind ?? "process";
  const failure = node.failure
    ? `<button class="failure-button" type="button" data-failure-node="${esc(node.id)}" aria-expanded="false"><span aria-hidden="true">⚠</span> ${esc(ui.inspectFailure)}</button>
       <div class="failure-panel" id="failure-${esc(node.id)}" hidden>
         <dl><div><dt>${esc(ui.impact)}</dt><dd>${esc(node.failure.impact)}</dd></div><div><dt>${esc(ui.symptom)}</dt><dd>${esc(node.failure.symptom)}</dd></div><div><dt>${esc(ui.fallback)}</dt><dd>${esc(node.failure.fallback)}</dd></div></dl>
       </div>`
    : "";
  return `<article class="flow-node kind-${esc(kind)}" data-node-id="${esc(node.id)}" tabindex="0">
    <p class="node-kind">${esc(ui.kind[kind])}</p>
    <h3>${esc(node.label)}</h3>
    <p>${esc(node.detail)}</p>
    ${evidenceBadges(node.evidence, evidence)}
    ${failure}
  </article>`;
}

function evidenceSourceLabel(item) {
  if (item.url) return new URL(item.url).hostname.replace(/^www\./, "");
  if (item.path) return item.path;
  return "";
}

function renderSceneEvidence(scene, evidence, ui) {
  const ids = [...new Set([...(scene.evidence ?? []), ...scene.nodes.flatMap((node) => node.evidence ?? [])])];
  if (!ids.length) return "";
  const cards = ids.map((id) => {
    const item = evidence.get(id);
    const supports = scene.nodes.filter((node) => (node.evidence ?? []).includes(id));
    const supportIds = supports.map((node) => node.id).join(" ");
    const source = evidenceSourceLabel(item);
    const locator = item.url
      ? `<a class="evidence-source" href="${esc(item.url)}" rel="noreferrer noopener"><span>${esc(ui.openSource)}</span><strong>${esc(source)}</strong></a>`
      : item.path
        ? `<div class="evidence-source evidence-source-local"><span>${esc(ui.localSource)}</span><code>${esc(source)}</code></div>`
        : `<p class="evidence-boundary">${esc(ui.noSourceLocator)}</p>`;
    const supportText = supports.length
      ? `<p class="evidence-supports"><span>${esc(ui.supports)}</span>${supports.map((node) => `<strong>${esc(node.label)}</strong>`).join("")}</p>`
      : "";
    return `<article class="scene-evidence-card status-card-${esc(item.status)}" id="scene-evidence-${esc(scene.id)}-${esc(id)}" data-evidence-card="${esc(id)}" data-evidence-nodes="${esc(supportIds)}">
      <div class="scene-evidence-meta"><span class="status status-${esc(item.status)}">${esc(ui.status[item.status])}</span><strong>${esc(item.label)}</strong></div>
      <p class="evidence-core"><span>${esc(ui.evidenceCore)}</span>${esc(item.note)}</p>
      ${supportText}
      ${locator}
      <a class="evidence-audit-link" href="#evidence-${esc(id)}">${esc(ui.fullEvidence)}</a>
    </article>`;
  }).join("");
  return `<section class="scene-evidence" data-scene-evidence="${esc(scene.id)}" aria-labelledby="scene-evidence-title-${esc(scene.id)}">
    <header class="scene-evidence-heading">
      <div><div class="section-kicker">${esc(ui.sceneEvidenceKicker)}</div><h3 id="scene-evidence-title-${esc(scene.id)}">${esc(ui.sceneEvidenceTitle)}</h3></div>
      <p data-evidence-context="${esc(scene.id)}" aria-live="polite">${esc(ui.sceneEvidenceDefault)}</p>
    </header>
    <div class="scene-evidence-grid">${cards}</div>
  </section>`;
}

function renderScene(scene, index, ui, evidence) {
  const nodeLabels = new Map(scene.nodes.map((node) => [node.id, node.label]));
  const mobileNodes = scene.nodes.map((node) => {
    const routes = scene.edges.filter((edge) => edge.from === node.id);
    const mobileRoutes = routes.length
      ? `<div class="mobile-routes" role="list" aria-label="${esc(node.label)}">
          ${routes.map((edge) => `<div class="mobile-route" role="listitem" data-mobile-edge-id="${esc(edge.id)}" data-mobile-edge-key="${esc(`${scene.id}:${edge.id}`)}" data-mobile-edge-from="${esc(edge.from)}" data-mobile-edge-to="${esc(edge.to)}">
            <span>${edge.label ? esc(edge.label) : "→"}</span><strong aria-label="${esc(`${node.label} → ${nodeLabels.get(edge.to) ?? edge.to}`)}">→ ${esc(nodeLabels.get(edge.to) ?? edge.to)}</strong>
          </div>`).join("")}
        </div>`
      : "";
    return `${renderNode(node, ui, evidence)}${mobileRoutes}`;
  }).join("");
  return `<section class="scene" id="scene-${esc(scene.id)}" data-scene-id="${esc(scene.id)}" aria-labelledby="scene-title-${esc(scene.id)}">
    <header class="scene-heading"><span class="scene-number">${String(index + 1).padStart(2, "0")}</span><div><h2 id="scene-title-${esc(scene.id)}">${esc(scene.title)}</h2><p>${esc(scene.summary)}</p></div></header>
    <div class="scene-actions" aria-label="${esc(scene.title)}">
      <button type="button" data-scene-play="${esc(scene.id)}" aria-pressed="false">${esc(ui.workspace.playScene)}</button>
      <button type="button" data-scene-favorite="${esc(scene.id)}" aria-pressed="false">${esc(ui.workspace.favoriteScene)}</button>
      <button type="button" data-scene-annotate="${esc(scene.id)}">${esc(ui.workspace.annotate)}</button>
      <button type="button" data-scene-image="${esc(scene.id)}">${esc(ui.workspace.exportSceneImage)}</button>
      <span class="scene-note-count" data-scene-note-count="${esc(scene.id)}" hidden></span>
    </div>
    ${evidenceBadges(scene.evidence, evidence)}
    <div class="diagram" data-scene-diagram="${esc(scene.id)}" role="group" aria-label="${esc(scene.title)} ${esc(ui.diagramSuffix)}"></div>
    <div class="mobile-flow" aria-label="${esc(scene.title)} ${esc(ui.stackedFlowSuffix)}">${mobileNodes}</div>
    ${renderSceneEvidence(scene, evidence, ui)}
  </section>`;
}

function renderModePanel(spec, ui) {
  const scenes = new Map(spec.scenes.map((scene) => [scene.id, scene]));
  const nodes = new Map(spec.scenes.flatMap((scene) => scene.nodes).map((node) => [node.id, node]));
  const evidence = new Map(spec.evidence.map((item) => [item.id, item]));
  const data = spec.modeData;
  if (spec.mode === "concept") {
    const roles = [
      [ui.intuition, [data.intuitionSceneId]],
      [ui.mechanism, data.mechanismSceneIds],
      [ui.boundary, [data.boundarySceneId]]
    ];
    return `<section class="mode-panel mode-concept" aria-labelledby="mode-title">
      <div class="section-kicker">${esc(ui.grammarKicker)}</div><h2 id="mode-title">${esc(ui.conceptMapTitle)}</h2>
      <div class="mode-strip">${roles.map(([label, ids]) => `<article class="mode-card"><h3>${esc(label)}</h3>${ids.map((id) => `<p>${esc(scenes.get(id).title)}</p>`).join("")}</article>`).join("")}</div>
    </section>`;
  }
  if (spec.mode === "module") {
    const entry = nodes.get(data.entryNodeId);
    return `<section class="mode-panel mode-module" aria-labelledby="mode-title">
      <div class="section-kicker">${esc(ui.grammarKicker)}</div><h2 id="mode-title">${esc(ui.moduleMapTitle)}</h2>
      <div class="mode-strip">
        <article class="mode-card"><h3>${esc(ui.entry)}</h3><p>${esc(entry.label)}</p></article>
        <article class="mode-card"><h3>${esc(ui.outputs)}</h3>${data.outputNodeIds.map((id) => `<p>${esc(nodes.get(id).label)}</p>`).join("")}</article>
        <article class="mode-card"><h3>${esc(ui.sourceAnchors)}</h3>${data.sourceEvidenceIds.map((id) => `<code>${esc(evidence.get(id).path)}</code>`).join("")}</article>
      </div>
    </section>`;
  }
  if (spec.mode === "tradeoff") {
    return `<section class="mode-panel mode-tradeoff" aria-labelledby="mode-title">
      <div class="section-kicker">${esc(ui.grammarKicker)}</div><h2 id="mode-title">${esc(ui.tradeoffMapTitle)}</h2>
      <p class="mode-lede"><strong>${esc(ui.sharedGoal)}:</strong> ${esc(scenes.get(data.sharedGoalSceneId).summary)}</p>
      <div class="tradeoff-options">${data.options.map((option) => `<article class="option-card"><h3>${esc(option.label)}</h3><p>${esc(scenes.get(option.sceneId).summary)}</p><ul>${data.criteria.map((criterion) => {
        const rating = option.ratings.find((item) => item.criterionId === criterion.id);
        return `<li><div><strong>${esc(criterion.label)}</strong><span class="fit fit-${esc(rating.fit)}">${esc(ui.fit[rating.fit])}</span></div><p>${esc(rating.note)}</p></li>`;
      }).join("")}</ul></article>`).join("")}</div>
      <p class="decision-rule"><strong>${esc(ui.decisionRule)}:</strong> ${esc(data.decisionRule)}</p>
    </section>`;
  }
  return `<section class="mode-panel mode-incident" aria-labelledby="mode-title">
    <div class="section-kicker">${esc(ui.grammarKicker)}</div><h2 id="mode-title">${esc(ui.incidentMapTitle)}</h2>
    <ol class="incident-timeline">${data.timeline.map((event) => `<li><span>${esc(event.marker)}</span><strong>${esc(nodes.get(event.nodeId).label)}</strong></li>`).join("")}</ol>
    <div class="incident-summary">
      <p><strong>${esc(ui.firstBreak)}:</strong> ${esc(nodes.get(data.breakNodeId).label)}</p>
      <p><strong>${esc(ui.recovery)}:</strong> ${data.recoveryNodeIds.map((id) => esc(nodes.get(id).label)).join(" → ")}</p>
      <p><strong>${esc(ui.rootCauseEvidence)}:</strong> ${evidenceBadges(data.rootCauseEvidenceIds)}</p>
    </div>
  </section>`;
}

function buildContent(spec, ui) {
  const summary = spec.summary ?? spec.dek;
  const evidence = new Map(spec.evidence.map((item) => [item.id, item]));
  const outline = spec.scenes.map((scene, index) => `<li><a href="#scene-${esc(scene.id)}" data-outline-scene="${esc(scene.id)}"><span>${String(index + 1).padStart(2, "0")}</span>${esc(scene.title)}</a></li>`).join("");
  const sceneOptions = spec.scenes.map((scene) => `<option value="${esc(scene.id)}">${esc(scene.title)}</option>`).join("");
  const tabs = [
    ["analogy", ui.analogy, spec.truthLadder.analogy],
    ["technical", ui.technical, spec.truthLadder.technical],
    ["caveat", ui.caveat, spec.truthLadder.caveat]
  ];
  return `<button type="button" class="workspace-launcher" data-workspace-open aria-expanded="false" aria-controls="workspace-drawer">${esc(ui.workspace.menu)}</button>
    <div class="workspace-scrim" data-workspace-scrim hidden></div>
    <aside class="workspace-drawer" id="workspace-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-title" aria-hidden="true" inert>
      <header class="workspace-header"><div><div class="section-kicker">${esc(ui.workspace.menu)}</div><h2 id="workspace-title">${esc(ui.workspace.title)}</h2></div><button type="button" data-workspace-close>${esc(ui.workspace.close)}</button></header>
      <section class="workspace-consent" data-library-consent>
        <p>${esc(ui.workspace.enableLibraryDetail)}</p>
        <button type="button" data-library-enable>${esc(ui.workspace.enableLibrary)}</button>
      </section>
      <section class="workspace-favorites" aria-labelledby="workspace-favorites-title">
        <h3 id="workspace-favorites-title">${esc(ui.workspace.favorites)}</h3>
        <div id="workspace-favorites" class="workspace-list"></div>
      </section>
      <div class="workspace-tabs" role="tablist" aria-label="${esc(ui.workspace.title)}">
        <button type="button" role="tab" id="workspace-tab-contents" aria-controls="workspace-panel-contents" aria-selected="true">${esc(ui.workspace.contents)}</button>
        <button type="button" role="tab" id="workspace-tab-history" aria-controls="workspace-panel-history" aria-selected="false" tabindex="-1">${esc(ui.workspace.history)}</button>
        <button type="button" role="tab" id="workspace-tab-annotations" aria-controls="workspace-panel-annotations" aria-selected="false" tabindex="-1">${esc(ui.workspace.annotations)}</button>
      </div>
      <section class="workspace-panel" role="tabpanel" id="workspace-panel-contents" aria-labelledby="workspace-tab-contents">
        <button type="button" class="document-favorite" data-document-favorite aria-pressed="false">${esc(ui.workspace.favoriteDocument)}</button>
        <section class="workspace-export" aria-labelledby="workspace-export-title"><h3 id="workspace-export-title">${esc(ui.workspace.exportTitle)}</h3><div><button type="button" data-export-pdf>${esc(ui.workspace.exportPdf)}</button><button type="button" data-export-pptx>${esc(ui.workspace.exportPptx)}</button><button type="button" data-export-image>${esc(ui.workspace.exportImage)}</button><button type="button" data-export-docx>${esc(ui.workspace.exportDocx)}</button><button type="button" data-export-pages>${esc(ui.workspace.exportPages)}</button></div><p id="workspace-export-status" aria-live="polite"></p></section>
        <ol class="workspace-outline">${outline}</ol>
      </section>
      <section class="workspace-panel" role="tabpanel" id="workspace-panel-history" aria-labelledby="workspace-tab-history" hidden>
        <div id="workspace-history" class="workspace-list"></div>
      </section>
      <section class="workspace-panel" role="tabpanel" id="workspace-panel-annotations" aria-labelledby="workspace-tab-annotations" hidden>
        <div class="annotation-editor">
          <label for="annotation-scene">${esc(ui.workspace.annotationScene)}</label>
          <select id="annotation-scene">${sceneOptions}</select>
          <label for="annotation-text" class="sr-only">${esc(ui.workspace.annotationPlaceholder)}</label>
          <textarea id="annotation-text" maxlength="1200" rows="5" placeholder="${esc(ui.workspace.annotationPlaceholder)}"></textarea>
          <div class="annotation-editor-actions"><button type="button" data-annotation-save>${esc(ui.workspace.saveAnnotation)}</button><button type="button" data-annotation-cancel hidden>${esc(ui.workspace.cancelEdit)}</button></div>
        </div>
        <div id="workspace-annotations" class="workspace-list"></div>
      </section>
      <p class="workspace-storage-note" id="workspace-storage-note" tabindex="-1" aria-live="polite">${esc(ui.workspace.storageLocal)}</p>
    </aside>
    <div class="mini-player" aria-live="polite"><span id="mini-player-status">${esc(ui.ready)}</span><button type="button" data-mini-pause>${esc(ui.pause)}</button></div>
    <main id="explainer">
    <header class="hero">
      <p class="eyebrow">${esc(ui.mode[spec.mode])} · ${esc(spec.language)}</p>
      <h1>${esc(spec.title)}</h1>
      <p class="dek">${esc(summary)}</p>
    </header>
    <section class="truth-ladder" aria-labelledby="truth-title">
      <div class="section-kicker">${esc(ui.truthKicker)}</div><h2 id="truth-title">${esc(ui.truthTitle)}</h2>
      <div class="tab-list" role="tablist" aria-label="${esc(ui.depthLabel)}">
        ${tabs.map(([id, label], i) => `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join("")}
      </div>
      ${tabs.map(([id, , text], i) => `<div class="truth-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}"${i ? " hidden" : ""}><p>${esc(text)}</p></div>`).join("")}
    </section>
    ${renderModePanel(spec, ui)}
    <section class="trace-console" aria-labelledby="trace-title">
      <div><div class="section-kicker">${esc(ui.traceKicker)}</div><h2 id="trace-title">${esc(ui.traceTitle)}</h2><p id="trace-status" aria-live="polite">${esc(ui.ready)}</p><p class="trace-context" id="trace-context" hidden></p><div class="trace-progress" role="progressbar" aria-label="${esc(ui.traceProgress)}" aria-valuemin="0" aria-valuemax="${spec.trace.length}" aria-valuenow="0"><span></span></div></div>
      <div class="trace-controls"><button type="button" data-trace="play">${esc(ui.play)}</button><button type="button" data-trace="previous">${esc(ui.previous)}</button><button type="button" data-trace="next">${esc(ui.next)}</button><button type="button" data-trace="reset">${esc(ui.reset)}</button><button type="button" data-failure-toggle aria-pressed="false">${esc(ui.failureLens)}</button></div>
    </section>
    <div class="scenes">${spec.scenes.map((scene, index) => renderScene(scene, index, ui, evidence)).join("")}</div>
    <section class="reference-grid">
      <div><div class="section-kicker">${esc(ui.glossaryKicker)}</div><h2>${esc(ui.glossaryTitle)}</h2><dl class="glossary">${spec.glossary.map((item) => `<div><dt>${esc(item.term)}</dt><dd>${esc(item.definition)}</dd></div>`).join("")}</dl></div>
      <div><div class="section-kicker">${esc(ui.evidenceKicker)}</div><h2>${esc(ui.evidenceTitle)}</h2><ol class="evidence-list">${spec.evidence.map((item) => `<li id="evidence-${esc(item.id)}"><span class="status status-${esc(item.status)}">${esc(ui.status[item.status])}</span><strong>${esc(item.label)}</strong><p>${esc(item.note)}</p>${item.url ? `<a href="${esc(item.url)}" rel="noreferrer noopener">${esc(item.url)}</a>` : ""}${item.path ? `<code>${esc(item.path)}</code>` : ""}</li>`).join("")}</ol></div>
    </section>
    <section class="teach-back" aria-labelledby="teach-title"><div class="section-kicker">${esc(ui.teachKicker)}</div><h2 id="teach-title">${esc(ui.teachTitle)}</h2>
      ${spec.teachBack.map((item, i) => `<article><h3>${esc(item.question)}</h3><button type="button" class="reveal" aria-expanded="false" aria-controls="answer-${i}">${esc(ui.reveal)}</button><p id="answer-${i}" hidden>${esc(item.answer)}</p></article>`).join("")}
    </section>
  </main>`;
}

export async function render(spec, template) {
  const normalizedSpec = JSON.parse(canonicalJson(spec));
  const result = validateSpec(normalizedSpec);
  if (!result.ok) {
    const error = new Error("spec validation failed");
    error.validation = result;
    throw error;
  }
  const ui = STRINGS[normalizedSpec.language];
  const hash = hashSpec(normalizedSpec);
  const replacements = new Map([
    ["__ELI5_LANG__", esc(normalizedSpec.language)],
    ["__ELI5_TITLE__", esc(normalizedSpec.title)],
    ["__ELI5_SHA256__", hash],
    ["__ELI5_CSP__", expectedCsp()],
    ["__ELI5_CONTENT__", buildContent(normalizedSpec, ui)],
    ["__ELI5_DATA__", jsonForScript(normalizedSpec)],
    ["__ELI5_UI__", jsonForScript(ui)]
  ]);
  let html = template;
  for (const [token, value] of replacements) {
    if (!html.includes(token)) throw new Error(`template is missing ${token}`);
    html = html.replace(token, value);
  }
  if (/__ELI5_[A-Z0-9_]+__/.test(html)) throw new Error("template contains unresolved placeholders");
  const htmlResult = validateHtml(html, { expectedSpecHash: hash });
  if (!htmlResult.ok) {
    const error = new Error("rendered HTML validation failed");
    error.validation = htmlResult;
    throw error;
  }
  return { html, hash, validation: result };
}

async function cli() {
  const [inputPath, outputPath, ...flags] = process.argv.slice(2);
  if (!inputPath || !outputPath || flags.some((flag) => flag !== "--force") || flags.length > 1) {
    throw new Error("usage: node scripts/render.mjs spec.json output.html [--force]");
  }
  const force = flags.includes("--force");
  const spec = JSON.parse(await readFile(inputPath, "utf8"));
  const template = await readFile(templatePath, "utf8");
  const result = await render(spec, template);
  if (!force) {
    await writeFile(outputPath, result.html, { encoding: "utf8", flag: "wx" });
  } else {
    try {
      const current = await lstat(outputPath);
      if (current.isSymbolicLink()) throw new Error("refusing to replace a symbolic link");
      if (!current.isFile()) throw new Error("refusing to replace a non-file path");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const temporaryPath = `${outputPath}.fireworks-open-eli5.tmp`;
    await writeFile(temporaryPath, result.html, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporaryPath, outputPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, output: outputPath, forced: force, sha256: result.hash, stats: result.validation.stats })}\n`);
}

if (isDirectCli(import.meta.url)) {
  cli().catch((error) => {
    process.stdout.write(`${JSON.stringify({ ok: false, message: error.message, validation: error.validation })}\n`);
    process.exitCode = 1;
  });
}
