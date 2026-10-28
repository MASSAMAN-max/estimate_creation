/**
 * 10_project_picker.js
 * 案件選択部品（デザインA・Bの作成画面）と、案件マスタ・発注元マスタの裏読込。
 * 案件を選ぶと「取引先・取引先担当・件名・現場住所（Aのみ）」へ自動反映し、
 * 案件を選ぶまでは、この入力欄を入力不可にする。
 * 依存：01_config.js、05_masterData.js（resetClientFieldsUi_ / restoreClientSelection_）、06_utils.js（fetchWithRetry_ / htmlEscape）
 */

const PROJECT_PICKER_MAX_ROWS = 100;      // 絞り込み結果として一度に表示する最大件数
const PROJECT_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 案件リストを取り直す間隔
const CASE_NONE = 'NONE';                 // サーバーの CASE_NO_NONE と同じ値
const CASE_NONE_LABEL = '紐付け案件無し';

// 検索用の文字の正規化（全角半角・英大小・カタカナ/ひらがなの違いを無視する）
function normalizeText(text) {
  return String(text == null ? '' : text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}

// =================================================================
// 発注元の表示・並び（あいうえお順）
// =================================================================
const GYOU_ORDER = ["あ行", "か行", "さ行", "た行", "な行", "は行", "ま行", "や行", "ら行", "わ行", "その他"];

/** 文字の先頭から50音の「行」を判定する（ひらがな・カタカナ以外は「その他」） */
function getGyou(text) {
  const char = String(text || '').trim().charAt(0);
  if (!char) return "その他";
  if (/^[あ-おア-オぁ-ぉァ-ォヴゔ]/.test(char)) return "あ行";
  if (/^[か-ごカ-ゴヵヶ]/.test(char)) return "か行";
  if (/^[さ-ぞサ-ゾ]/.test(char)) return "さ行";
  if (/^[た-どタ-ドっッ]/.test(char)) return "た行";
  if (/^[な-のナ-ノ]/.test(char)) return "な行";
  if (/^[は-ぽハ-ポ]/.test(char)) return "は行";
  if (/^[ま-もマ-モ]/.test(char)) return "ま行";
  if (/^[や-よヤ-ヨゃ-ょャ-ョ]/.test(char)) return "や行";
  if (/^[ら-ろラ-ロ]/.test(char)) return "ら行";
  if (/^[わ-んワ-ンゎヮ]/.test(char)) return "わ行";
  return "その他";
}

/** 表示名から「株式会社」「有限会社」「合同会社」と（株）（有）を除く（括弧なしの「株」「有」は社名を壊すため消さない） */
function formatClientDisplayName(name) {
  return String(name || "").replace(/株式会社|有限会社|合同会社|[（(\[【][株有][）)\]】]/g, "").trim();
}

/** ログインマスターの行から、発注元の選択肢（行→ヨミ順）と、発注元ごとの担当者一覧を作る */
function buildClientIndex(masterRows) {
  const yomiByClient = new Map();
  const contactMap = new Map();
  masterRows.forEach(row => {
    if (!row.client) return;
    if (!yomiByClient.has(row.client) || (!yomiByClient.get(row.client) && row.yomi)) {
      yomiByClient.set(row.client, row.yomi || "");
    }
    if (!contactMap.has(row.client)) contactMap.set(row.client, []);
    const contacts = contactMap.get(row.client);
    if (row.contact && !contacts.includes(row.contact)) contacts.push(row.contact);
  });

  const clients = [...yomiByClient].map(([name, yomi]) => {
    const sortKey = yomi || formatClientDisplayName(name);
    return { name: name, sortKey: sortKey, gyou: getGyou(sortKey) };
  });
  clients.sort((a, b) =>
    GYOU_ORDER.indexOf(a.gyou) - GYOU_ORDER.indexOf(b.gyou) || a.sortKey.localeCompare(b.sortKey, "ja"));

  return { clients: clients.map(({ name, gyou }) => ({ name, gyou })), contactsByClient: contactMap };
}

// =================================================================
// マスタの読込
// =================================================================

/** 案件マスタ・発注元マスタを取得する。画面の操作を止めないよう、呼び出し側は待たなくてよい */
async function loadProjectsInBackground() {
  const hadData = projectListStatus === "ready";
  if (!hadData) projectListStatus = "loading"; // すでに表示できるデータがある間は、読込中表示にしない
  refreshAllProjectPickers();
  try {
    const data = await fetchWithRetry_({ action: 'loadProjects', payload: {} });
    const projects = (data && data.projects) || [];
    projects.forEach(project => { project.__searchText = normalizeText(`${project.no} ${project.name}`); });
    projectListCache = projects;
    projectMapByNo = new Map(projects.map(project => [project.no, project]));

    const clientIndex = buildClientIndex((data && data.clientMaster) || []);
    clientListCache = clientIndex.clients;
    contactsByClient = clientIndex.contactsByClient;
    projectListStatus = "ready";
    projectListFetchedAt = Date.now();
  } catch (err) {
    console.error("案件マスタの読み込みに失敗しました:", err);
    if (!hadData) { // 古いデータが残っているなら、それを使い続ける
      projectListErrorMessage = (err && err.message) || "原因不明のエラー";
      projectListStatus = "error";
    }
  }
  refreshAllProjectPickers();
}

/** メニュー表示時に呼ぶ。未取得・失敗・一定時間が過ぎた場合だけ取り直す */
function loadProjectsIfNeeded_() {
  const isStale = projectListStatus === "ready" && (Date.now() - projectListFetchedAt) > PROJECT_REFRESH_INTERVAL_MS;
  if (projectListStatus === "idle" || projectListStatus === "error" || isStale) {
    loadProjectsInBackground();
  }
}

/** ログアウト・ログイン期限切れのとき、前の人の案件リストを使い回さないよう捨てる */
function resetProjectCache_() {
  projectListCache = [];
  projectMapByNo = new Map();
  clientListCache = [];
  contactsByClient = new Map();
  projectListStatus = "idle";
  projectListErrorMessage = "";
  projectListFetchedAt = 0;
  refreshAllProjectPickers();
}

/** 案件No → チップに表示する文字列。「番号＋案件名」、案件名が分からなければ「案件No.番号」 */
function getProjectChipLabel(caseNo) {
  if (caseNo === CASE_NONE) return CASE_NONE_LABEL;
  const project = projectMapByNo.get(caseNo);
  return project && project.name ? `${caseNo} ${project.name}` : `案件No.${caseNo}`;
}

async function confirmRemoveProject(label) {
  const result = await Swal.fire({
    title: "紐付けを解除しますか？",
    text: label,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "解除する",
    cancelButtonText: "キャンセル"
  });
  return result.isConfirmed;
}

/** 発注元・担当者・検索語で案件を絞り込む（発注元・担当者は完全一致、検索語は案件No・案件名に全て含まれること） */
function filterProjects(filters) {
  const tokens = normalizeText(filters.keyword).split(/\s+/).filter(Boolean);
  return projectListCache.filter(project => {
    if (filters.client && project.client !== filters.client) return false;
    if (filters.contact && project.contact !== filters.contact) return false;
    return tokens.every(token => project.__searchText.includes(token));
  });
}

// =================================================================
// 案件選択部品
// =================================================================
/**
 * 案件選択部品を、指定した要素の中に作る。
 * @param {string} containerId 部品を表示する要素のid
 * @param {string[]} selectedList 選択中の案件No（呼び出し元と同じ配列を直接書き換える）
 * @param {{title: string, onChange: function(string[])}} options
 *        onChange：ユーザーが案件を追加・解除したときに呼ぶ（4項目の自動反映に使う）
 * @return {{render: function, reset: function}}
 */
function createProjectPicker(containerId, selectedList, options) {
  const container = document.getElementById(containerId);
  const filters = { client: "", contact: "", keyword: "" };
  let isOpen = false;

  container.innerHTML = `
    <div class="project-picker">
      <button type="button" class="project-picker-toggle" data-role="toggle" aria-expanded="false">
        <span>${htmlEscape(options.title)}</span>
        <span class="material-symbols-outlined project-picker-toggle-icon" data-role="icon">expand_more</span>
      </button>
      <div class="project-picker-selected" data-role="chips"></div>
      <div class="project-picker-body" data-role="body" style="display:none;">
        <div class="project-picker-row">
          <div class="project-picker-col">
            <label class="project-picker-label">発注元</label>
            <select data-role="client"></select>
          </div>
          <div class="project-picker-col">
            <label class="project-picker-label">担当者</label>
            <select data-role="contact"></select>
          </div>
        </div>
        <input type="text" data-role="keyword" placeholder="案件No・案件名で絞り込み">
        <div class="project-picker-status" data-role="status"></div>
      </div>
      <div class="project-picker-list" data-role="list"></div>
    </div>
  `;
  const pickerEl = container.querySelector('.project-picker');
  const toggleBtn = container.querySelector('[data-role="toggle"]');
  const iconEl = container.querySelector('[data-role="icon"]');
  const bodyEl = container.querySelector('[data-role="body"]');
  const clientSelect = container.querySelector('[data-role="client"]');
  const contactSelect = container.querySelector('[data-role="contact"]');
  const keywordInput = container.querySelector('[data-role="keyword"]');
  const statusEl = container.querySelector('[data-role="status"]');
  const listEl = container.querySelector('[data-role="list"]');
  const chipsEl = container.querySelector('[data-role="chips"]');

  function setOpen(open) {
    isOpen = open;
    bodyEl.style.display = open ? "block" : "none";
    listEl.style.display = open ? "" : "none"; // 候補一覧も、タブと一緒に開閉する
    pickerEl.classList.toggle("is-open", open);
    iconEl.style.transform = open ? "rotate(180deg)" : "";
    toggleBtn.setAttribute("aria-expanded", String(open));
  }

  function buildClientOptionsHtml() {
    let html = `<option value="">すべて</option>`;
    let currentGyou = null;
    clientListCache.forEach(client => {
      if (client.gyou !== currentGyou) {
        if (currentGyou !== null) html += `</optgroup>`;
        html += `<optgroup label="${htmlEscape(client.gyou)}">`;
        currentGyou = client.gyou;
      }
      html += `<option value="${htmlEscape(client.name)}">${htmlEscape(formatClientDisplayName(client.name))}</option>`;
    });
    if (currentGyou !== null) html += `</optgroup>`;
    return html;
  }

  function renderClientOptions() {
    if (filters.client && !clientListCache.some(client => client.name === filters.client)) filters.client = "";
    clientSelect.innerHTML = buildClientOptionsHtml();
    clientSelect.value = filters.client;
  }

  /** 担当者は、選んだ発注元の担当者だけを表示する。発注元が未選択の間は選べない */
  function renderContactOptions() {
    contactSelect.disabled = !filters.client;
    const contacts = filters.client ? (contactsByClient.get(filters.client) || []) : [];
    if (filters.contact && !contacts.includes(filters.contact)) filters.contact = "";
    contactSelect.innerHTML = `<option value="">${filters.client ? "すべて" : "（発注元を先に選択）"}</option>` +
      contacts.map(contact => `<option value="${htmlEscape(contact)}">${htmlEscape(contact)}</option>`).join("");
    contactSelect.value = filters.contact;
  }

  /** 候補1件分のボタンHTML */
  function buildItemHtml(no, label, sub, isSelected) {
    return `
      <button type="button" class="project-picker-item" data-no="${htmlEscape(no)}" ${isSelected ? "disabled" : ""}>
        <span class="project-picker-item-no">${htmlEscape(no === CASE_NONE ? "－" : no)}</span>
        <span>${htmlEscape(label)}</span>
        <span class="project-picker-item-sub">${htmlEscape(isSelected ? "選択済み" : sub)}</span>
      </button>`;
  }

  function renderList(keepScroll) {
    const scrollTop = keepScroll ? listEl.scrollTop : 0;
    // 「紐付け案件無し」は、案件リストの読み込み状況に関係なく、常に先頭へ表示する（読み込み失敗でも保存できるように）
    // ※ allowNone: false の部品（後から案件を紐付けるモーダル）では表示しない
    const noneHtml = options.allowNone === false
      ? ""
      : buildItemHtml(CASE_NONE, CASE_NONE_LABEL, "案件に関係しない見積", selectedList.includes(CASE_NONE));
    if (projectListStatus === "error") {
      statusEl.className = "project-picker-status is-error";
      statusEl.innerHTML = `案件リストを読み込めませんでした（${htmlEscape(projectListErrorMessage)}）
        <button type="button" class="project-picker-retry" data-action="retry">再読み込み</button>`;
      listEl.innerHTML = noneHtml;
      return;
    }
    if (projectListStatus !== "ready") {
      statusEl.className = "project-picker-status";
      statusEl.textContent = "案件リストを読み込み中です…";
      listEl.innerHTML = noneHtml;
      return;
    }

    const matched = filterProjects(filters);
    statusEl.className = "project-picker-status";
    if (matched.length === 0) statusEl.textContent = "該当する案件がありません。";
    else if (matched.length > PROJECT_PICKER_MAX_ROWS) statusEl.textContent = `該当案件の先頭 ${PROJECT_PICKER_MAX_ROWS} 件を表示しています。発注元や検索語でさらに絞り込んでください。`;
    else statusEl.textContent = `該当 ${matched.length} 件`;

    listEl.innerHTML = noneHtml + matched.slice(0, PROJECT_PICKER_MAX_ROWS).map(project =>
      buildItemHtml(project.no, project.name,
        [formatClientDisplayName(project.client), project.contact].filter(Boolean).join(" / "),
        selectedList.includes(project.no))
    ).join("");
    listEl.scrollTop = scrollTop;
  }

  /** 選択済みの案件を「番号＋案件名」のチップで表示する。タブが閉じていても表示する */
  function renderChips() {
    chipsEl.innerHTML = selectedList.map(caseNo => `
      <span class="link-chip">${htmlEscape(getProjectChipLabel(caseNo))} <span class="remove" data-id="${htmlEscape(caseNo)}">×</span></span>
    `).join("");
  }

  function notifyChange() {
    container.dispatchEvent(new Event("change", { bubbles: true }));
    options.onChange(selectedList);
  }

  function render() {
    renderClientOptions();
    renderContactOptions();
    renderList(false);
    renderChips();
  }

  function reset() {
    filters.client = "";
    filters.contact = "";
    filters.keyword = "";
    keywordInput.value = "";
    setOpen(selectedList.length === 0); // 必須項目のため、未選択の間はタブを開いておく
    render();
  }

  // --- 操作 ---
  toggleBtn.addEventListener("click", () => setOpen(!isOpen));
  clientSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    filters.client = clientSelect.value;
    filters.contact = "";
    renderContactOptions();
    renderList(false);
  });
  contactSelect.addEventListener("change", (e) => {
    e.stopPropagation();
    filters.contact = contactSelect.value;
    renderList(false);
  });
  keywordInput.addEventListener("input", (e) => {
    e.stopPropagation();
    filters.keyword = keywordInput.value;
    renderList(false);
  });
  keywordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.preventDefault();
  });
  listEl.addEventListener("click", (e) => {
    const item = e.target.closest("[data-no]");
    if (!item || item.disabled) return;
    const caseNo = item.dataset.no;

    if (caseNo === CASE_NONE) {
      // 「紐付け案件無し」は他の案件と同時に選べない（排他）
      selectedList.length = 0;
      selectedList.push(CASE_NONE);
    } else {
      const noneIndex = selectedList.indexOf(CASE_NONE);
      if (noneIndex >= 0) selectedList.splice(noneIndex, 1);
      if (!selectedList.includes(caseNo)) selectedList.push(caseNo);
    }
    renderChips();
    renderList(true);
    notifyChange();
  });
  chipsEl.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-id]");
    if (!target) return;
    const caseNo = target.dataset.id;
    if (!(await confirmRemoveProject(getProjectChipLabel(caseNo)))) return;
    const index = selectedList.indexOf(caseNo);
    if (index >= 0) selectedList.splice(index, 1);
    renderChips();
    renderList(true);
    notifyChange();
  });
  statusEl.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="retry"]')) loadProjectsInBackground();
  });

  setOpen(true);
  render();
  return { render, reset };
}

// =================================================================
// 案件の選択 ⇔ 見積書の入力欄（取引先・取引先担当・件名・現場住所）の連動
// =================================================================
// 【ルール】
//  ・案件を選ぶまでは、4項目を入力不可にする
//  ・案件を選ぶたびに、最後に選んだ案件の内容で4項目を上書きする（その後の手修正は可能）
//  ・「紐付け案件無し」を選ぶと、入力欄を手入力できる（入力済みの内容は残す）
//  ・案件を全部外したら、4項目を空にして再びロックする
//  ・現場住所は、デザインAのみ（デザインBに入力欄がないため）
const CASE_FORM_BINDINGS_ = {
  A: {
    suffix: '', list: caseNosA,
    subjectId: 'subject', addressId: 'clientAddress',
    lockIds: ['clientSelect', 'clientName', 'contactPersonSelect', 'contactPersonName', 'subject', 'clientAddress']
  },
  B: {
    suffix: 'B', list: caseNosB,
    subjectId: 'infoSubject', addressId: null,
    lockIds: ['infoClientSelect', 'infoClient', 'infoClientContactSelect', 'infoClientContact', 'infoSubject']
  }
};

/** 4項目（と、その音声入力ボタン）の入力可否を切り替える */
function setCaseFieldsLocked_(design, locked) {
  CASE_FORM_BINDINGS_[design].lockIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = locked;
    const wrapper = el.closest('.voice-input-wrapper');
    if (wrapper) wrapper.querySelectorAll('button').forEach(btn => { btn.disabled = locked; });
  });
}

/** 4項目の入力内容を空にする */
function clearCaseFields_(design) {
  const binding = CASE_FORM_BINDINGS_[design];
  resetClientFieldsUi_(binding.suffix);
  document.getElementById(binding.subjectId).value = '';
  if (binding.addressId) document.getElementById(binding.addressId).value = '';
}

/** 案件の内容を4項目へ上書きする（取引先がマスタに無ければ、新規取引先として入力欄へ入れる） */
function fillCaseFields_(design, project) {
  const binding = CASE_FORM_BINDINGS_[design];
  resetClientFieldsUi_(binding.suffix); // 前回の「新規入力欄」の表示などを初期状態に戻してから入れる
  restoreClientSelection_(project.client, project.contact, binding.suffix);
  document.getElementById(binding.subjectId).value = project.name || '';
  if (binding.addressId) document.getElementById(binding.addressId).value = project.address || '';
}

/** ロックの状態だけを、選択状態に合わせる（入力内容は触らない。下書き・コピーの復元時に使う） */
function syncCaseFormLock_(design) {
  setCaseFieldsLocked_(design, CASE_FORM_BINDINGS_[design].list.length === 0);
}

/** ユーザーが案件を追加・解除したときの反映（部品の onChange から呼ばれる） */
function applyCaseSelectionToForm_(design, selectedList) {
  const lastCaseNo = selectedList[selectedList.length - 1];
  if (!lastCaseNo) {
    clearCaseFields_(design);
  } else if (lastCaseNo !== CASE_NONE) {
    const project = projectMapByNo.get(lastCaseNo);
    if (project) fillCaseFields_(design, project);
  }
  syncCaseFormLock_(design);
}

/** 案件の選択状態を指定した内容にして、部品とロックを更新する（新規作成・復元用。入力内容は触らない） */
function setCaseSelection_(design, caseNos) {
  const binding = CASE_FORM_BINDINGS_[design];
  binding.list.length = 0;
  caseNos.forEach(caseNo => binding.list.push(caseNo));
  projectPickers[design].reset();
  syncCaseFormLock_(design);
}

function resetCaseSelection_(design) {
  setCaseSelection_(design, []);
}

// デザインA・Bの案件選択部品（読み込み時に1回だけ作る）
const projectPickers = {
  A: createProjectPicker('projectPickerA', caseNosA, { title: '案件の選択（必須）', onChange: list => applyCaseSelectionToForm_('A', list) }),
  B: createProjectPicker('projectPickerB', caseNosB, { title: '案件の選択（必須）', onChange: list => applyCaseSelectionToForm_('B', list) })
};

function refreshAllProjectPickers() {
  Object.values(projectPickers).forEach(picker => picker.render());
}

// 初期状態（案件未選択）では4項目をロックしておく
syncCaseFormLock_('A');
syncCaseFormLock_('B');
