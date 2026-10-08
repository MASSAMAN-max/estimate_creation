/**
 * 【このファイルの役割】
 * デザインB（新フォーマット）専用のロジック一式。
 * マスターデータ定義、フォーム状態管理、画面描画、
 * フォームデータの取得（getFormDataB）、保存データの復元（reflectFieldsDesignB_）まで。
 */

    // =====================================================================
    // ここから デザインB（新フォーマット）専用ロジック
    // 共通機能（ログイン／メニュー／プレビュー／下書き保存／確定保存／一覧取得）は
    // 上記デザインAと同じ関数（showPDFPreview / executeSaveProcess / showPreviewDialog 等）を
    // そのまま共有し、データの取得・復元部分だけをデザインB用に用意しています。
    // =====================================================================

    // マスターデータ（カテゴリ・内容の一覧）
    const MASTER_DATA_B = [
      { category: "ガラス・サッシ", items: ["大", "中", "小"] },
      { category: "和室", items: ["照明", "押入", "畳", "床間", "建具", "ワク"] },
      { category: "洋室", items: ["照明", "収納", "ｶｰﾃﾝﾚｰﾙ", "ドア", "ワク"] },
      { category: "リビング", items: ["照明", "収納", "カーテンレール"] },
      { category: "キッチン", items: ["換気扇", "フード", "壁", "水切棚", "シンク", "排水口", "手元燈", "ｽﾃﾝﾚｽ回り", "ドア", "照明", "収納", "ｸｯｷﾝｸﾞﾋｰﾀｰ"] },
      { category: "浴室", items: ["ドア", "排水口", "浴槽", "鏡", "床", "換気扇", "照明", "カラン", "金具回り", "壁", "天井"] },
      { category: "洗面室", items: ["洗面台", "洗濯パン", "照明", "換気扇", "ドア"] },
      { category: "トイレ", items: ["ドア", "便器", "照明", "換気扇"] },
      { category: "玄関周り", items: ["ドア", "土間", "下駄箱", "照明"] },
      { category: "クロス（天井・壁）", items: ["全面洗浄", "拾い洗い"] },
      { category: "床クリーン・ワックス", items: ["既ワックス剥離"] },
      { category: "エアコン", items: ["フィルター", "表面", "内部"] },
      { category: "その他", items: ["ベランダ", "土間", "壁", "手すり", "木枠", "ｻﾝﾙｰﾑ", "ｺﾝｾﾝﾄ", "配電盤", "倉庫"] },
      { category: "補修工事", items: ["塗装", "キズ補修"] }
    ];

    // =====================================
    // 全カテゴリ共通で、内容チップの末尾に必ず追加するデフォルトの内容名
    // ※MASTER_DATA_B側へ各カテゴリごとに書き足さず、描画時にここから補う
    //   （カテゴリ追加・内容追加のたびに「その他」を書き忘れないようにするため）
    // =====================================
    const DEFAULT_ITEM_NAME_B = 'その他';

    // カテゴリの内容チップ一覧（マスター定義＋デフォルトの「その他」）を返す
    // ※マスター側に同名の内容がすでにある場合は重複して追加しない
    function getChipItemNamesB_(cat) {
      return cat.items.includes(DEFAULT_ITEM_NAME_B)
        ? cat.items
        : [...cat.items, DEFAULT_ITEM_NAME_B];
    }

    // =====================================
    // 見積担当（ホワイトリスト＝ログインマスターの「ユーザー名」列）
    // ・GASの loadEstimatorList から取得して保持する（ページを開いている間は使い回す）
    // ・取得に失敗／0件の場合は保持せず、次回のフォーム表示時にもう一度取得する
    // =====================================
    let ESTIMATOR_LIST_B = [];

    async function ensureEstimatorListB_() {
      if (ESTIMATOR_LIST_B.length > 0) return;

      try {
        // 他の通信と同じ fetchWithRetry_ を使う（成功時は GAS の data 部分がそのまま返る）
        const names = await fetchWithRetry_({
          action: 'loadEstimatorList',
          payload: { currentUserName: getCurrentUserName() || '' }
        });
        ESTIMATOR_LIST_B = names || [];
      } catch (e) {
        console.error('見積担当リストの取得に失敗', e);
        Swal.fire({
          icon: 'warning',
          title: '見積担当リストの取得に失敗',
          text: '見積担当を選択できません。通信状況を確認し、メニューに戻ってもう一度開いてください。',
          confirmButtonText: '了解'
        });
      }
    }

    // 見積担当プルダウンを描画し、selectedName が一覧にあれば選択状態にする
    // 戻り値：selectedName が指定されたのに一覧に無く、未選択に戻した場合は true
    function setEstimatorSelectB_(selectedName) {
      const select = document.getElementById('infoEstimator');
      if (!select) return false;

      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '-- 選択してください --';
      select.appendChild(placeholder);

      ESTIMATOR_LIST_B.forEach(userName => {
        const option = document.createElement('option');
        option.value = userName;
        option.textContent = userName;
        select.appendChild(option);
      });

      const name = (selectedName || '').toString().trim();
      if (name !== '' && ESTIMATOR_LIST_B.includes(name)) {
        select.value = name;
        return false;
      }
      select.value = '';
      return name !== '';  // 一覧に無い担当者名は復元せず、選び直してもらう
    }

    // =====================================
    // カテゴリ名へ括弧書きで付記する「項目数量」を持つカテゴリと、その単位のマップ
    // 例：「和室」なら室数 → 「和室（2室）」、「エアコン」なら台数 → 「エアコン（2台）」
    // ※ここでの数量はあくまでカテゴリ名に付記する表示用ラベルであり、金額計算には使用しない
    // カテゴリを追加したい場合はここに1行追加するだけでよい
    // =====================================
    const CATEGORY_COUNT_UNIT_MAP_B = {
      '和室': '室',
      '洋室': '室',
      'エアコン': '台'
    };

    // =====================================
    // 各カテゴリのチップ末尾に表示する「その他」チップ
    // ・押すたびに「その他」という名前のカードが1枚追加され、品名はカード上で編集する
    // ・MASTER_DATA_B には含めない（表示時に末尾へ付け足すだけ）ため、
    //   PDF出力・保存・復元の処理には影響しない
    // =====================================
    const OTHER_ITEM_NAME_B = 'その他';

    // =====================================
    // 内容カード（有効化された内容1件分）の初期データを作る共通関数
    // =====================================
    function createItemB_(name) {
      return {
        id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        names: [name],
        qty: 1,
        amount: '',
        remark: '',
        showRemark: false
      };
    }

    // =====================================
    // 品名を自由に編集できるカードかどうかを判定する
    // ・結合されていない（名前が1つ）かつ、そのカテゴリのチップ名にない名前
    // ・「その他」チップ／「＋自由な内容を追加」で作ったカードが該当する
    // ・名前で判定するため、保存→復元後も同じ判定になる
    // =====================================
    function isFreeTextItemB_(catIdx, item) {
      return item.names.length === 1 && !MASTER_DATA_B[catIdx].items.includes(item.names[0]);
    }

    // デザインBのフォーム状態（カテゴリindexごとに { manualTotal, items:[...], categoryCount } ）
    let appStateB = {};

    // =====================================
    // デザインBのフォーム状態を初期値で生成する共通関数
    // （新規作成時・リセット時の両方から呼び出す）
    // =====================================
    function createEmptyAppStateB_() {
      const state = {};
      MASTER_DATA_B.forEach((cat, idx) => {
        state[idx] = {
          manualTotal: null,  // カテゴリ合計金額の手動上書き値
          items: [],           // 有効化された内容のリスト
          categoryCount: null   // カテゴリ名へ付記する数量（室数・台数など。CATEGORY_COUNT_UNIT_MAP_Bで対象カテゴリを定義）
        };
      });
      return state;
    }

    // 新規作成時の初期化
    async function initializeEstimateFormB() {
      currentMode = 'NEW';
      currentOriginId = '';
      currentDesignType = 'B';

      appStateB = createEmptyAppStateB_();

      try {
        document.getElementById('infoDate').valueAsDate = new Date();
      } catch (e) {}
      document.getElementById('infoClient').value = '';
      document.getElementById('infoClientContact').value = '';
      document.getElementById('infoSubject').value = '';
      document.getElementById('infoDeptNo').value = '';
      document.getElementById('infoLayout').value = '';
      document.getElementById('globalRemark').value = '';

      // 取引先・担当者のマスターと、見積担当の一覧を同時に取得して待つ（表示までの時間を短くするため）
      await Promise.all([loadMasterLists(), ensureEstimatorListB_()]);
      // 見積担当は「未選択」で描画する
      setEstimatorSelectB_('');
      // 取引先が空（未選択）なので、担当者プルダウンは「取引先を先に選択してください」状態にする
      document.getElementById('infoClientContactSelect').innerHTML = '<option value="">-- 取引先を先に選択してください --</option>';
      document.getElementById('newClientContainerB').style.display = 'none';
      document.getElementById('newContactPersonContainerB').style.display = 'none';
      renderB();
    }

    // フォームを完全にリセット（ログアウト・メニューに戻る時）
    function resetFormB_() {
      appStateB = createEmptyAppStateB_();
      const ids = ['infoDate','infoEstimator','infoClient','infoClientContact','infoSubject','infoDeptNo','infoLayout','globalRemark'];
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      // 取引先・担当者は選択式のため、選択状態と新規入力欄もリセットする
      const clientSelect = document.getElementById('infoClientSelect');
      if (clientSelect) clientSelect.value = '';
      const contactSelect = document.getElementById('infoClientContactSelect');
      if (contactSelect) contactSelect.innerHTML = '<option value="">-- 取引先を先に選択してください --</option>';
      const newClientContainer = document.getElementById('newClientContainerB');
      if (newClientContainer) newClientContainer.style.display = 'none';
      const newContactPersonContainer = document.getElementById('newContactPersonContainerB');
      if (newContactPersonContainer) newContactPersonContainer.style.display = 'none';
      const container = document.getElementById('categoryContainer');
      if (container) container.innerHTML = '';
    }

    // 画面描画
    function renderB() {
      const container = document.getElementById('categoryContainer');
      if (!container) return;
      container.innerHTML = '';

      MASTER_DATA_B.forEach((cat, catIdx) => {
        const catState = appStateB[catIdx];
        const activeList = catState.items || [];
        const activeNames = activeList.flatMap(item => item.names);

        const autoTotal = activeList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const isManual = catState.manualTotal !== null && catState.manualTotal !== '';
        const displayTotal = isManual ? catState.manualTotal : (autoTotal > 0 ? autoTotal : '');

        const catCard = document.createElement('div');
        catCard.className = 'category-card';

        catCard.innerHTML = `
          <div class="category-header">
            <span>${cat.category}</span>
            <div class="category-total-wrap">
              <span style="color:var(--text-muted);">合計:</span>
              <input type="number"
                class="category-total-input ${isManual ? 'manual-override' : ''}"
                value="${displayTotal}"
                placeholder="0"
                onchange="updateCategoryTotalB(${catIdx}, this.value)">
              <span>円</span>
              ${isManual ? `<button class="btn-reset-manual" onclick="resetCategoryTotalB(${catIdx})" title="自動計算に戻す">自動</button>` : ''}
            </div>
          </div>

          <div class="category-body">
            ${CATEGORY_COUNT_UNIT_MAP_B[cat.category] ? `
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">
                <label style="font-size:12px; font-weight:bold; color:var(--text-muted);">数量:</label>
                <input type="number" min="1"
                  value="${catState.categoryCount || ''}"
                  placeholder="例: 2"
                  style="width:60px; padding:6px; border:1px solid var(--border); border-radius:6px; font-size:14px; text-align:center;"
                  onchange="updateCategoryCountB(${catIdx}, this.value)">
                <span style="font-size:12px; color:var(--text-muted);">${CATEGORY_COUNT_UNIT_MAP_B[cat.category]}</span>
              </div>
            ` : ''}
            <div class="chip-section-title">内容を選択（タップで有効化）</div>
            <div class="chip-group">
              ${cat.items.map(itemName => {
                const isSelected = activeNames.includes(itemName);
                return `
                  <div class="chip ${isSelected ? 'selected' : ''}" onclick="toggleItemB(${catIdx}, '${itemName}')">
                    ${isSelected ? '✓ ' : ''}${itemName}
                  </div>
                `;
              }).join('')}
              <div class="chip chip-add" onclick="addOtherItemB(${catIdx})">${OTHER_ITEM_NAME_B}</div>
            </div>

            <div class="active-items-list" id="activeListB_${catIdx}">
              ${activeList.map(item => renderActiveCardB(catIdx, item)).join('')}
            </div>

            <button class="btn-add-custom" onclick="addCustomItemB(${catIdx})">＋ 自由な内容を追加</button>
          </div>
        `;

        container.appendChild(catCard);
        setupDragAndDropB(catIdx);
      });

      calculateTotalsB();
    }

    function renderActiveCardB(catIdx, item) {
      const isGrouped = item.names.length > 1;
      const hasRemark = item.remark && item.remark.trim() !== '';

      // 自由入力の内容は品名をその場で編集できる入力欄にし、それ以外は従来どおり固定表示
      // ※ 品名は利用者が入力した文字列なので、必ずエスケープして埋め込む
      const nameHtml = isFreeTextItemB_(catIdx, item)
        ? `<input type="text" class="item-name-input" value="${htmlEscape(item.names[0])}"
             placeholder="内容を入力"
             onchange="updateItemNameB(${catIdx}, '${item.id}', this.value)">`
        : `<span>${htmlEscape(item.names.join(' ＋ '))}</span>`;

      return `
        <div class="active-item-card" data-cat="${catIdx}" data-id="${item.id}" draggable="true">
          <div class="item-main">
            <div class="item-handle">
              <span class="drag-icon">☰</span>
              ${nameHtml}
            </div>
            <div class="item-actions">
              ${isGrouped ? `<button class="btn-ungroup" onclick="ungroupItemB(${catIdx}, '${item.id}')">解散</button>` : ''}
              <button class="btn-delete-item" onclick="deleteItemB(${catIdx}, '${item.id}')">削除</button>
            </div>
          </div>

          <div class="controls-row">
            <div class="quantity-control">
              <span class="quantity-label">数量</span>
              <button class="btn-qty" onclick="changeQtyB(${catIdx}, '${item.id}', -1)">-</button>
              <input type="number" class="qty-input" value="${item.qty || 1}" min="1"
                onchange="updateQtyB(${catIdx}, '${item.id}', this.value)">
              <button class="btn-qty" onclick="changeQtyB(${catIdx}, '${item.id}', 1)">+</button>
            </div>

            <div class="amount-wrap">
              <span style="font-size:11px; color:var(--text-muted);">金額:</span>
              <input type="number" class="amount-input" value="${item.amount || ''}" placeholder="0"
                onchange="updateAmountB(${catIdx}, '${item.id}', this.value)">
              <span style="font-size:12px; font-weight:bold;">円</span>
            </div>

            <button class="btn-remark-toggle ${hasRemark || item.showRemark ? 'active' : ''}"
              onclick="toggleRemarkInputB(${catIdx}, '${item.id}')">
              ${hasRemark ? '備考あり' : '+備考'}
            </button>
          </div>

          ${(item.showRemark || hasRemark) ? `
            <div class="remark-field">
              <input type="text" class="remark-input" value="${item.remark || ''}"
                placeholder="この項目に関する備考・特記事項..."
                onchange="updateRemarkB(${catIdx}, '${item.id}', this.value)">
            </div>
          ` : ''}
        </div>
      `;
    }

    function toggleItemB(catIdx, itemName) {
      let list = appStateB[catIdx].items;
      const existingIndex = list.findIndex(item => item.names.includes(itemName));

      if (existingIndex > -1) {
        const target = list[existingIndex];
        if (target.names.length > 1) {
          target.names = target.names.filter(n => n !== itemName);
        } else {
          list.splice(existingIndex, 1);
        }
      } else {
        list.push(createItemB_(itemName));
      }

      renderB();
    }

    // =====================================
    // 自由な内容をカテゴリへ追加する
    // ネイティブのprompt()ではなく、他の画面と統一してSweetAlert2の入力ダイアログを使う
    // =====================================
    async function addCustomItemB(catIdx) {
      const { value: customName } = await Swal.fire({
        title: '内容を追加',
        input: 'text',
        inputLabel: '追加する内容を入力してください',
        inputPlaceholder: '例: 特注補修',
        showCancelButton: true,
        confirmButtonText: '追加',
        cancelButtonText: 'キャンセル',
        inputValidator: (value) => {
          if (!value || value.trim() === '') {
            return '内容を入力してください。';
          }
        }
      });
      if (!customName || customName.trim() === "") return;

      appStateB[catIdx].items.push(createItemB_(customName.trim()));

      renderB();
    }

    // 有効化されている内容（カード）を1件削除する
    // ・マスターのチップ由来／自由追加のどちらでも削除できる
    // ・誤操作防止のため確認ダイアログを挟む
    // ・グループ化（「A ＋ B」）されたカードは、まとめて削除される
    async function removeItemB(catIdx, itemId) {
      const list = appStateB[catIdx].items;
      const target = list.find(i => i.id === itemId);
      if (!target) return;

      const result = await Swal.fire({
        icon: 'question',
        title: '内容を削除しますか？',
        text: `「${target.names.join(' ＋ ')}」を削除します。`,
        showCancelButton: true,
        confirmButtonText: '削除',
        cancelButtonText: 'キャンセル'
      });
      if (!result.isConfirmed) return;

      appStateB[catIdx].items = list.filter(i => i.id !== itemId);
      renderB();  // 合計金額もここで再計算される
    }

    function changeQtyB(catIdx, itemId, delta) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (item) {
        const currentQty = Number(item.qty) || 1;
        const newQty = Math.max(1, currentQty + delta);

        if (item.amount && currentQty > 0) {
          const unitPrice = item.amount / currentQty;
          item.amount = Math.round(unitPrice * newQty);
        }

        item.qty = newQty;
        renderB();
      }
    }

    function updateQtyB(catIdx, itemId, val) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (item) {
        item.qty = Math.max(1, Number(val) || 1);
        renderB();
      }
    }

    function updateAmountB(catIdx, itemId, val) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (item) {
        item.amount = val !== '' ? Number(val) : '';
        renderB();
      }
    }

    function toggleRemarkInputB(catIdx, itemId) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (item) {
        item.showRemark = !item.showRemark;
        renderB();
      }
    }

    function updateRemarkB(catIdx, itemId, val) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (item) {
        item.remark = val;
      }
    }

    function updateCategoryTotalB(catIdx, val) {
      appStateB[catIdx].manualTotal = val !== '' ? Number(val) : null;
      renderB();
    }

    function resetCategoryTotalB(catIdx) {
      appStateB[catIdx].manualTotal = null;
      renderB();
    }

    // カテゴリ名へ付記する「項目数量」を更新する（表示名にのみ反映。金額計算には影響しない）
    function updateCategoryCountB(catIdx, val) {
      appStateB[catIdx].categoryCount = val !== '' ? Number(val) : null;
      renderB();
    }

    // =====================================
    // 結合された内容を個別に分割する（結合の逆操作）
    // 金額は元の合計を割り算して配分せず、分割後の全項目を金額未入力（空欄）にリセットする。
    // 割り算だと端数が消えて合計金額がズレることがあったため、
    // 金額はユーザーに個別入力し直してもらう方針にした。
    // =====================================
    function ungroupItemB(catIdx, itemId) {
      const list = appStateB[catIdx].items;
      const targetIdx = list.findIndex(i => i.id === itemId);
      if (targetIdx === -1) return;

      const target = list[targetIdx];
      const names = [...target.names];

      target.names = [names[0]];
      target.amount = '';

      for (let i = 1; i < names.length; i++) {
        list.push({
          id: 'item_' + Date.now() + '_' + i,
          names: [names[i]],
          qty: 1,
          amount: '',
          remark: '',
          showRemark: false
        });
      }

      renderB();
    }

    // 集計計算（基本クリーニング／エアコン／補修 の3分類＋消費税）
    function calculateTotalsB() {
      let airconTotal = 0;
      let repairTotal = 0;
      let cleaningTotal = 0;

      MASTER_DATA_B.forEach((cat, catIdx) => {
        const catState = appStateB[catIdx];
        const activeList = (catState && catState.items) || [];

        let catAmount = 0;
        if (catState && catState.manualTotal !== null && catState.manualTotal !== '') {
          catAmount = Number(catState.manualTotal);
        } else {
          catAmount = activeList.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        }

        if (cat.category === "エアコン") {
          airconTotal += catAmount;
        } else if (cat.category === "補修工事") {
          repairTotal += catAmount;
        } else {
          cleaningTotal += catAmount;
        }
      });

      const subtotal = cleaningTotal + airconTotal + repairTotal;
      const tax = Math.floor(subtotal * 0.10);
      const grandTotalWithTax = subtotal + tax;

      const elCleaning = document.getElementById('summaryCleaning');
      const elAircon = document.getElementById('summaryAircon');
      const elRepair = document.getElementById('summaryRepair');
      const elTax = document.getElementById('summaryTax');
      const elGrand = document.getElementById('grandTotalTax');
      if (elCleaning) elCleaning.textContent = '¥' + cleaningTotal.toLocaleString();
      if (elAircon) elAircon.textContent = '¥' + airconTotal.toLocaleString();
      if (elRepair) elRepair.textContent = '¥' + repairTotal.toLocaleString();
      if (elTax) elTax.textContent = '¥' + tax.toLocaleString();
      if (elGrand) elGrand.textContent = '¥' + grandTotalWithTax.toLocaleString();

      return { cleaningTotal, airconTotal, repairTotal, subtotal, tax, grandTotalWithTax };
    }

    function setupDragAndDropB(catIdx) {
      const cards = document.querySelectorAll(`#activeListB_${catIdx} .active-item-card`);
      let draggedId = null;

      cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
          draggedId = card.dataset.id;
          e.dataTransfer.setData('text/plain', draggedId);
        });

        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          card.classList.add('drag-over');
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over');
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('drag-over');
          const targetId = card.dataset.id;

          if (draggedId && draggedId !== targetId) {
            mergeActiveItemsB(catIdx, draggedId, targetId);
          }
        });
      });
    }

    function mergeActiveItemsB(catIdx, sourceId, targetId) {
      const list = appStateB[catIdx].items;
      const sourceObj = list.find(i => i.id === sourceId);
      const targetObj = list.find(i => i.id === targetId);

      if (sourceObj && targetObj) {
        targetObj.names = [...targetObj.names, ...sourceObj.names];
        const sumAmount = (Number(sourceObj.amount) || 0) + (Number(targetObj.amount) || 0);
        targetObj.amount = sumAmount > 0 ? sumAmount : '';
        if (sourceObj.remark) {
          targetObj.remark = (targetObj.remark ? targetObj.remark + ' / ' : '') + sourceObj.remark;
        }

        appStateB[catIdx].items = list.filter(i => i.id !== sourceId);
        renderB();
      }
    }

    // =====================================================================
    // デザインBのフォーム内容 → 共通GAS保存フォーマット（details配列）への変換
    // ルール：各カテゴリの1件目＝itemCategoryにカテゴリ名＋確定金額（手動上書きがあればそれを採用）
    //         2件目以降＝itemCategoryは空、個別の金額をそのまま内訳として保持
    //         和室・洋室は室数が入力されていれば「和室（2室）」のようにカテゴリ名へ付記する
    //         （室数は表示ラベルのみに使用。金額計算には影響しない）
    // =====================================================================
    function getFormDataB() {
      const details = [];

      MASTER_DATA_B.forEach((cat, catIdx) => {
        const catState = appStateB[catIdx];
        const items = (catState && catState.items) || [];
        if (items.length === 0) return;

        const isManual = catState.manualTotal !== null && catState.manualTotal !== '';
        const autoTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const catTotalAmount = isManual ? Number(catState.manualTotal) : autoTotal;

        // 対象カテゴリ（CATEGORY_COUNT_UNIT_MAP_Bで定義）のみ、数量が入力されていればカテゴリ名に反映する
        // 例：「和室（2室）」「エアコン（2台）」
        const countUnit = CATEGORY_COUNT_UNIT_MAP_B[cat.category];
        const categoryDisplayName = (countUnit && catState.categoryCount)
          ? `${cat.category}（${catState.categoryCount}${countUnit}）`
          : cat.category;

        items.forEach((item, idx) => {
          details.push({
            itemCategory: idx === 0 ? categoryDisplayName : '',
            itemName: item.names.join(' ＋ '),
            itemQty: Number(item.qty) || 1,
            itemUnit: '式',
            itemPrice: '',
            // itemAmount：先頭行のみカテゴリ合計金額、2件目以降は各内容自身の金額（既存の他カテゴリと同じ挙動）
            itemAmount: idx === 0 ? catTotalAmount : (Number(item.amount) || 0),
            // itemIndividualAmount：idx（0件目含む）にかかわらず、その内容自身の金額を常に保持
            // （PDF出力時、各内容を「品名 金額 （備考）」の形でF列に連結表示する際に使用。08_PDFデザインB.js参照）
            itemIndividualAmount: Number(item.amount) || 0,
            itemRemarks: item.remark || ''
          });
        });
      });

      const totals = calculateTotalsB();
      const { clientName: finalClientNameB, contactPerson: finalContactPersonB } = getClientSelectionValues_('B');

      return {
        clientName: finalClientNameB,
        contactPerson: finalContactPersonB,
        clientAddress: '', // デザインBには入力欄なし
        estimateDate: document.getElementById('infoDate').value,
        subject: document.getElementById('infoSubject').value.trim(),
        validity: '',      // デザインBには入力欄なし
        paymentTerms: '',  // デザインBには入力欄なし
        remarks: document.getElementById('globalRemark').value.trim(),
        estimator: document.getElementById('infoEstimator').value.trim(),
        deptNo: document.getElementById('infoDeptNo').value.trim(),
        layout: document.getElementById('infoLayout').value.trim(),
        details: details,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.grandTotalWithTax
      };
    }

    // =====================================================================
    // GASから取得した共通フォーマット（下書き／確定見積）→ デザインBのフォーム状態へ復元
    // 注意：カテゴリ確定金額は「手動入力値」として復元します（保存時点で手動上書きだったか
    //       自動計算だったかは区別できないため）。自動計算に戻したい場合は各カテゴリの
    //       「自動」ボタンで再計算してください。
    //       和室・洋室は「和室（2室）」のような表記から室数を分離して復元します。
    // =====================================================================
    function reflectFieldsDesignB_(formData, mode) {
      const main = formData.main || {};

      document.getElementById('infoDate').value =
        mode === 'COPY_CREATE' ? new Date().toISOString().split('T')[0] : formatDateToInput(main.estimateDate);
      // 見積担当：保存されていた名前がリスト（現在のユーザー名一覧）に無い場合は未選択に戻す
      // （呼び出し元で ensureEstimatorListB_() を済ませてから呼ぶこと）
      const estimatorCleared = setEstimatorSelectB_(main.estimator);
      document.getElementById('infoSubject').value = main.subject || '';
      document.getElementById('infoDeptNo').value = main.deptNo || '';
      document.getElementById('infoLayout').value = main.layout || '';
      document.getElementById('globalRemark').value = main.remarks || '';

      // 見積担当。一覧にない名前は未選択に戻し、通知用のメッセージを集める
      const restoreWarnings = [];
      const missingEstimator = restoreEstimatorSelection_('infoEstimator', main.estimator);
      if (missingEstimator) {
        restoreWarnings.push(`見積担当「${missingEstimator}」は一覧にないため、未選択に戻しました。選び直してください。`);
      }

      // 取引先・取引先担当者は選択式のため、マスタに存在すれば選択、
      // 存在しなければ新規入力欄へ反映する共通関数を使う（デザインAと同じ処理）
      restoreClientSelection_(main.clientName, main.contactPerson, 'B');
      appStateB = createEmptyAppStateB_();

      const details = formData.details || [];
      let currentCatIdx = -1;
      let currentItem = null;

      details.forEach(row => {
        const catName = (row.itemCategory || '').toString().trim();
        const hasNameInRow = row.itemName && String(row.itemName).trim() !== '';

        if (catName !== '') {
          // 「和室（2室）」「エアコン（2台）」のような表記から、基本カテゴリ名と数量を分離する
          // （単位は「室」「台」など可変のため、括弧内の数字だけを抽出する汎用パターンにしている）
          const countMatch = catName.match(/^(.+?)（(\d+)[^）]*）$/);
          const baseCatName = countMatch ? countMatch[1] : catName;
          const parsedCount = countMatch ? Number(countMatch[2]) : null;

          // 新しいカテゴリの開始行（＝カテゴリ確定金額を持つ行）
          const idx = MASTER_DATA_B.findIndex(c => c.category === baseCatName);
          if (idx === -1) {
            console.warn(`デザインBのマスターに存在しないカテゴリ「${catName}」の明細はスキップされました。`);
            currentCatIdx = -1;
            currentItem = null;
            return;
          }
          currentCatIdx = idx;

          // 数量が含まれていた場合は復元する（対象カテゴリ以外では通常nullのまま）
          if (parsedCount !== null) {
            appStateB[idx].categoryCount = parsedCount;
          }

          // ✅ 修正：見積管理シートの保存形式変更（項目を独立行に分離）に対応。
          //   カテゴリ名はあるが品名が空の行＝カテゴリ合計金額だけを運ぶ「項目行」。
          //   カテゴリ判定・カテゴリ合計金額の復元だけ行い、内訳（items）には登録しない。
          if (!hasNameInRow) {
            const categoryAmount = (row.itemAmount === '' || row.itemAmount === undefined) ? null : Number(row.itemAmount);
            appStateB[currentCatIdx].manualTotal = categoryAmount;
            currentItem = null;
            return;
          }

          const names = (row.itemName || '').toString().split(' ＋ ').filter(Boolean);
          currentItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            names: names.length > 0 ? names : ['（項目名なし）'],
            qty: Number(row.itemQty) || 1,
            amount: (row.itemAmount === '' || row.itemAmount === undefined) ? '' : Number(row.itemAmount),
            remark: row.itemRemarks || '',
            showRemark: !!row.itemRemarks
          };
          appStateB[currentCatIdx].items.push(currentItem);

        } else if (currentCatIdx !== -1) {
          const hasName = hasNameInRow;

          if (hasName) {
            // 内訳の個別項目行
            const names = (row.itemName || '').toString().split(' ＋ ').filter(Boolean);
            const newItem = {
              id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              names: names.length > 0 ? names : ['（項目名なし）'],
              qty: Number(row.itemQty) || 1,
              amount: (row.itemAmount === '' || row.itemAmount === undefined) ? '' : Number(row.itemAmount),
              remark: row.itemRemarks || '',
              showRemark: !!row.itemRemarks
            };
            appStateB[currentCatIdx].items.push(newItem);
            currentItem = newItem;
          } else if (row.itemRemarks && currentItem) {
            // 品名のない備考のみの行は直前の項目の備考へ追記
            currentItem.remark = currentItem.remark ? (currentItem.remark + ' / ' + row.itemRemarks) : row.itemRemarks;
            currentItem.showRemark = true;
          }
        }
      });

      renderB();
      // 呼び出し元（04_listModal.js）が通知に使う
      return restoreWarnings;
      // 呼び出し元が「見積担当を選び直してください」と案内できるよう結果を返す
      return { estimatorCleared: estimatorCleared, savedEstimator: (main.estimator || '').toString().trim() };
    }

    // =====================================
    // 「その他」チップ：「その他」という名前のカードを1枚追加する（何度でも追加可）
    // ・追加直後に品名欄へフォーカスし全選択するので、そのまま上書き入力できる
    // =====================================
    function addOtherItemB(catIdx) {
      const newItem = createItemB_(OTHER_ITEM_NAME_B);
      appStateB[catIdx].items.push(newItem);
      renderB();

      const nameInput = document.querySelector(`.active-item-card[data-id="${newItem.id}"] .item-name-input`);
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
    }

    // 自由入力カードの品名を更新する
    function updateItemNameB(catIdx, itemId, val) {
      const item = appStateB[catIdx].items.find(i => i.id === itemId);
      if (!item) return;

      // 空欄にされた場合は、品名なしで保存されないよう「その他」に戻す
      const newName = val.trim();
      item.names = [newName !== '' ? newName : OTHER_ITEM_NAME_B];
      renderB();
    }

    // =====================================
    // 内容カードを削除する（全カード共通。結合中のカードは結合ごと削除）
    // ・チップのタップによる取り消しと同じく、確認ダイアログなしで即削除
    // =====================================
    function deleteItemB(catIdx, itemId) {
      const catState = appStateB[catIdx];
      catState.items = catState.items.filter(i => i.id !== itemId);

      // 内容が1件もなくなったら、手動で上書きしたカテゴリ合計金額も解除する
      // （残すと、内容がないのに画面の合計にだけ加算され、PDFと金額がズレるため）
      if (catState.items.length === 0) catState.manualTotal = null;

      renderB();
    }
