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
    function initializeEstimateFormB() {
      currentMode = 'NEW';
      currentOriginId = '';
      currentDesignType = 'B';

      appStateB = createEmptyAppStateB_();

      try {
        document.getElementById('infoDate').valueAsDate = new Date();
      } catch (e) {}
      document.getElementById('infoEstimator').value = '';
      document.getElementById('infoClient').value = '';
      document.getElementById('infoClientContact').value = '';
      document.getElementById('infoSubject').value = '';
      document.getElementById('infoDeptNo').value = '';
      document.getElementById('infoLayout').value = '';
      document.getElementById('globalRemark').value = '';

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
      const nameText = item.names.join(' ＋ ');
      const isGrouped = item.names.length > 1;
      const hasRemark = item.remark && item.remark.trim() !== '';

      return `
        <div class="active-item-card" data-cat="${catIdx}" data-id="${item.id}" draggable="true">
          <div class="item-main">
            <div class="item-handle">
              <span class="drag-icon">☰</span>
              <span>${nameText}</span>
            </div>
            ${isGrouped ? `<button class="btn-ungroup" onclick="ungroupItemB(${catIdx}, '${item.id}')">解散</button>` : ''}
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
        list.push({
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          names: [itemName],
          qty: 1,
          amount: '',
          remark: '',
          showRemark: false
        });
      }

      renderB();
    }

    function addCustomItemB(catIdx) {
      const customName = prompt("追加する内容を入力してください (例: 特注補修):");
      if (!customName || customName.trim() === "") return;

      appStateB[catIdx].items.push({
        id: 'custom_' + Date.now(),
        names: [customName.trim()],
        qty: 1,
        amount: '',
        remark: '',
        showRemark: false
      });

      renderB();
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

    function ungroupItemB(catIdx, itemId) {
      const list = appStateB[catIdx].items;
      const targetIdx = list.findIndex(i => i.id === itemId);
      if (targetIdx === -1) return;

      const target = list[targetIdx];
      const names = [...target.names];
      const splitAmount = target.amount ? Math.floor(target.amount / names.length) : '';

      target.names = [names[0]];
      target.amount = splitAmount;

      for (let i = 1; i < names.length; i++) {
        list.push({
          id: 'item_' + Date.now() + '_' + i,
          names: [names[i]],
          qty: 1,
          amount: splitAmount,
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
            // （ガラス・サッシの「大・中・小」個別金額をPDFの20行目へ書き込む際に使用）
            itemIndividualAmount: Number(item.amount) || 0,
            itemRemarks: item.remark || ''
          });
        });
      });

      const totals = calculateTotalsB();

      return {
        clientName: document.getElementById('infoClient').value.trim(),
        contactPerson: document.getElementById('infoClientContact').value.trim(),
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
      document.getElementById('infoEstimator').value = main.estimator || '';
      document.getElementById('infoClient').value = main.clientName || '';
      document.getElementById('infoClientContact').value = main.contactPerson || '';
      document.getElementById('infoSubject').value = main.subject || '';
      document.getElementById('infoDeptNo').value = main.deptNo || '';
      document.getElementById('infoLayout').value = main.layout || '';
      document.getElementById('globalRemark').value = main.remarks || '';

      appStateB = createEmptyAppStateB_();

      const details = formData.details || [];
      let currentCatIdx = -1;
      let currentItem = null;

      details.forEach(row => {
        const catName = (row.itemCategory || '').toString().trim();

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

          const names = (row.itemName || '').toString().split(' ＋ ').filter(Boolean);
          currentItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            names: names.length > 0 ? names : ['（項目名なし）'],
            qty: Number(row.itemQty) || 1,
            amount: (row.itemAmount === '' || row.itemAmount === undefined) ? '' : Number(row.itemAmount),
            remark: row.itemRemarks || '',
            showRemark: !!row.itemRemarks
          };
          appStateB[currentCatIdx].manualTotal = currentItem.amount === '' ? null : currentItem.amount;
          appStateB[currentCatIdx].items.push(currentItem);

        } else if (currentCatIdx !== -1) {
          const hasName = row.itemName && String(row.itemName).trim() !== '';

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
    }
