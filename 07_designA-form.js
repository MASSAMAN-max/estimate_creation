/**
 * 07_designA-form.js
 * デザインA（従来フォーマット）の入力フォーム専用ロジック。
 * 明細カードの追加・編集・削除・金額計算・フォームデータの取得までを担当。
 */

    // =====================================
    // 新規見積フォームの初期化（await で完了を待つ）
    // =====================================
    async function initializeEstimateForm() {
      try {
        // リセット
        currentMode = 'NEW';
        currentOriginId = '';
        document.getElementById('estimateForm').reset();
        document.getElementById('detailsContainer').innerHTML = '';
        // 共通の基本情報カードは form の外にあるため、reset() では戻らない。専用の関数で初期状態に戻す
        resetSharedInfoFields_();
        // マスターデータ取得（await で完了を待つ）
        await loadMasterLists();

        // 今日の日付をセット
        document.getElementById('infoDate').value = getTodayInputValue();
        
        // 初期行を1行追加（マスターの読み込み後なので、親項目の選択肢が入った状態で出る）
        addTableRow();
        updateTotalSummary();
        
      } catch (error) {
        console.error('フォーム初期化エラー:', error);
        throw error;  // エラーを上位に渡す
      }
    }
     
    // =====================================
    // 明細行（親項目カード）を追加している関数
    // ・カードの番号（項目 1、項目 2…）と色は、style.css が自動で付ける
    // =====================================
    function addTableRow(itemData = null) {
      const container = document.getElementById('detailsContainer');
      const card = document.createElement('div');
      card.className = 'detail-card';
      
      const categoryOptions = MASTER_CATEGORIES.map(cat => `<option value="${htmlEscape(cat)}">${htmlEscape(cat)}</option>`).join('') + '<option value="__NEW__">＋新規項目</option>';

      card.innerHTML = `
        <div class="card-top-row">
          <div class="card-category-box">
            <div class="card-title-line">
              <span class="card-number-badge"></span>
              <span class="badge-required">必須</span>
            </div>
            <select class="item-category-select" style="width: 100%; box-sizing: border-box;" onchange="toggleNewCategory(this)">
              <option value="">-- 親項目を選択 --</option>
              ${categoryOptions}
            </select>
            <div class="dynamic-input-container" style="display:none; margin-top: 5px;">
              <input type="text" class="item-category-input" style="width: 100%; box-sizing: border-box;" placeholder="新規項目名">
            </div>
          </div>

          <div class="card-total-box">
            <div class="card-total-label">項目合計金額</div>
            <div class="amount-display-box card-total-amount-box">
              <span>¥</span>
              <span class="card-total-amount" data-value="0">0</span>
            </div>
          </div>
        </div>

        <div class="breakdown-container"></div>

        <div class="card-action-row">
          <button type="button" class="btn btn-add-content" onclick="addBreakdownRow(this.closest('.detail-card'), this.closest('.detail-card').querySelector('.breakdown-container'), false)">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">add</span> 内容を追加
          </button>
          <button type="button" class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="deleteTableRow(this)">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">delete</span> 項目ごと削除
          </button>
        </div>
      `;
      
      container.appendChild(card);
      
      // ========== データがある場合は値を埋め込む（完全に条件分岐） ==========
      if (itemData) {
        try {
          // グループ（複数行）の場合 ➔ 内部でHTMLを直接 appendChild する（addBreakdownRowは呼ばない）
          // ✅ 修正：単一行の場合に呼んでいた populateDetailCard は存在しない関数（呼ぶとエラー）だった。
          //   単一行は「1行だけのグループ」として同じ処理で埋め込む
          populateDetailCardWithGroup(card, Array.isArray(itemData) ? itemData : [itemData]);
        } catch (error) {
          console.error('❌ Error populating card with data:', error);
          throw error;
        }
      } else {
        // 💡 データが本当にない（新規作成ボタンを押した）時だけ、空の初期行を追加する
        addBreakdownRow(card, card.querySelector('.breakdown-container'), true);
      }
    }

    // =====================================
    // グループ（複数行）データを埋め込む関数
    // =====================================
    function populateDetailCardWithGroup(card, itemDataArray) {
      if (!card || !itemDataArray || itemDataArray.length === 0) return;
      
      try {
        const firstItem = itemDataArray[0];
        
        // ========== ステップ1: 親項目（カテゴリ）をセット ==========
        const categorySelect = card.querySelector('.item-category-select');
        if (categorySelect) {
          // 復元時に補った仮の名前「（カテゴリなし）」は、未選択として扱う
          const rawCategory = firstItem.itemCategory || '';
          const category = rawCategory === '（カテゴリなし）' ? '' : rawCategory;

          categorySelect.value = category;
          // マスタの選択肢にない名前だと、value は空に戻る。その場合は新規項目として入力欄へ入れる
          const isNotInMaster = category !== '' && categorySelect.value !== category;

          if (category === '' || isNotInMaster) {
            categorySelect.value = '__NEW__';
            const inputContainer = card.querySelector('.dynamic-input-container');
            const input = card.querySelector('.item-category-input');
            if (inputContainer && input) {
              inputContainer.style.display = 'block';
              input.value = category; // 未選択のときは空、マスタにない名前のときはその名前
              input.required = true;
            }
          }
        }
        
        // ========== ステップ2: 内訳コンテナを取得 ==========
        const breakdownContainer = card.querySelector('.breakdown-container');
        if (!breakdownContainer) {
          throw new Error('breakdown-container が見つかりません');
        }
        
        // ========== ステップ3: 各行の生成（行の組み立ては共通関数 createBreakdownRowElement_ に任せる） ==========
        itemDataArray.forEach((item, rowIndex) => {
          // 備考は複数件。1件もない場合は、空の入力欄を1つだけ用意しておく
          const remarks = (item.itemRemarksList || (item.itemRemarks ? [item.itemRemarks] : []))
            .map(remark => String(remark).trim());

          const breakdownRow = createBreakdownRowElement_({
            name: item.itemName || '',
            qty: item.itemQty || 1,
            unit: item.itemUnit,
            price: Number(item.itemPrice || 0),
            amount: Number(item.itemAmount || 0),
            remarks: remarks.length > 0 ? remarks : ['']
          }, rowIndex > 0);

          breakdownContainer.appendChild(breakdownRow);
        });

        // ========== ステップ4: 全体の更新 ==========
        updateCardTotal(card);
        
      } catch (error) {
        console.error('❌ Error in populateDetailCardWithGroup:', error);
        throw error;
      }
    }

    // =====================================
    // 備考行（備考入力欄1件分）のHTMLを組み立てる共通関数
    // ・内訳の組み立て（createBreakdownRowElement_）と「備考を追加」ボタン（addRemarkRow）で共用
    // =====================================
    function buildRemarkRowHtml_(value) {
      return `
        <div class="remark-row" style="display: flex; gap: 6px; align-items: center;">
          <div class="voice-input-wrapper" style="flex: 1; display: flex; gap: 6px;">
            <input type="text" class="remark-input" placeholder="仕様・摘要（備考）を追加" value="${htmlEscape(value)}" style="flex: 1;">
            <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)" style="padding: 4px 8px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">mic</span>
            </button>
            <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.remark-row').remove()" style="padding: 4px 8px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
            </button>
          </div>
        </div>`;
    }

    // =====================================
    // 単位プルダウンの選択肢HTMLを組み立てる
    // ・「式」は、マスターになくても必ず先頭に入れる（初期値が「式」のため）
    // ・保存済みの単位がマスターにない場合も、選択肢に加える（別の単位に勝手に変わらないように）
    // =====================================
    function buildUnitOptionsHtml_(selectedUnit) {
      const units = MASTER_UNITS.map(unit => String(unit).trim()).filter(Boolean);
      if (!units.includes('式')) units.unshift('式');
      if (!units.includes(selectedUnit)) units.push(selectedUnit);
      return units.map(unit =>
        `<option value="${htmlEscape(unit)}" ${unit === selectedUnit ? 'selected' : ''}>${htmlEscape(unit)}</option>`
      ).join('');
    }

    // =====================================
    // 内訳の行（仕様・摘要1件分）を組み立てる共通関数
    // ・新規追加（addBreakdownRow）と、保存データの復元（populateDetailCardWithGroup）の両方から使う
    // ・rowData：{ name, qty, unit, price, amount, remarks: [文字列, ...] }
    // ・showDeleteButton：「内訳を削除」ボタンを付けるか（カード先頭の行には付けない）
    // ・見出し「仕様・摘要」の丸い番号は、style.css が自動で付ける（内訳の削除で自動的に詰まる）
    // =====================================
    function createBreakdownRowElement_(rowData, showDeleteButton) {
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.style = 'border: 1px solid #f1f3f5; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: #fff;';

      const unit = String(rowData.unit || '').trim() || '式'; // 単位の初期値は「式」
      const amount = Number(rowData.amount || 0);

      row.innerHTML = `
        <div class="form-group" style="margin-top: 5px;">
          <label class="breakdown-title"><span class="breakdown-number"></span>仕様・摘要</label>
          <div class="voice-input-wrapper">
            <input type="text" class="item-name" placeholder="品名・内容など" value="${htmlEscape(rowData.name)}">
            <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)"><span class="material-symbols-outlined">mic</span></button>
          </div>
        </div>

        <div class="card-row-lower" style="margin-bottom: 4px;">
          <div class="item-grid-row-3col">
            <div class="form-group">
              <label>数量</label>
              <input type="number" class="item-qty" min="1" step="1" value="${htmlEscape(rowData.qty)}" oninput="calculateBreakdownAmount(this)" onchange="normalizeQtyInput_(this)">
            </div>
            <div class="form-group">
              <label>単位</label>
              <select class="item-unit">${buildUnitOptionsHtml_(unit)}</select>
            </div>
            <div class="form-group">
              <label>単価</label>
              <input type="number" class="item-price" min="0" value="${Number(rowData.price || 0)}" oninput="calculateBreakdownAmount(this)">
            </div>
            <div class="form-group">
              <label>金額</label>
              <div class="amount-display-box"><span>¥</span><span class="item-amount" data-value="${amount}">${amount.toLocaleString()}</span></div>
            </div>
          </div>
        </div>

        <div class="remarks-container" style="background: #f9f9f9; border: 1px dashed #e0e0e0; border-radius: 4px; padding: 8px; margin: 8px 0;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 6px; font-weight: bold;">📝 備考（複数追加可）</label>
          <div class="remarks-list" style="display: flex; flex-direction: column; gap: 6px;">
            ${rowData.remarks.map(buildRemarkRowHtml_).join('')}
          </div>
          <button type="button" class="btn btn-sm" style="background-color: #e8f5e9; color: #2e7d32; padding: 4px 8px; font-size: 12px; margin-top: 6px;" onclick="addRemarkRow(this)">
            <span class="material-symbols-outlined" style="font-size: 14px;">add</span> 備考を追加
          </button>
        </div>

        ${showDeleteButton ? `
        <div style="text-align: left; margin-top: 2px; margin-bottom: 2px;">
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteBreakdownRow(this)" style="padding: 6px 12px; font-size: 14px; height: auto; line-height: 1; border-radius: 4px;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">delete</span> 内訳を削除
          </button>
        </div>
        ` : ''}
      `;
      return row;
    }

    // =====================================
    // 子行（内訳）を追加する関数
    // ・数量の初期値は1、単位の初期値は「式」
    // ・カード最初の行（isFirst）だけ、備考の入力欄を1つ最初から用意する（削除ボタンも付けない）
    // =====================================
    function addBreakdownRow(card, breakdownContainer, isFirst = false) {
      const row = createBreakdownRowElement_({ name: '', qty: 1, unit: '式', price: 0, amount: 0, remarks: [] }, !isFirst);
      breakdownContainer.appendChild(row);

      if (isFirst) {
        addRemarkRow(row.querySelector('.remarks-container > button'));
      }

      calculateBreakdownAmount(row.querySelector('.item-qty'));
    }

    // =====================================
    // 備考行を追加する関数
    // =====================================
    function addRemarkRow(addButton) {
      const remarksList = addButton.closest('.remarks-container').querySelector('.remarks-list');
      remarksList.insertAdjacentHTML('beforeend', buildRemarkRowHtml_(''));
      // 新規追加した入力欄にフォーカス
      remarksList.lastElementChild.querySelector('.remark-input').focus();
    }

    // =====================================
    // 項目行（親）を削除する関数
    // =====================================
    function deleteTableRow(button) {
      button.closest('.detail-card').remove();
      updateTotalSummary();
    }

    // =====================================
    // 内訳行（子）を削除する関数
    // =====================================
    function deleteBreakdownRow(button) {
      const card = button.closest('.detail-card');
      const row = button.closest('.breakdown-row');
      
      row.remove();
      
      requestAnimationFrame(() => {
        updateCardTotal(card);
      });
    }

    // =====================================
    // 数量欄の入力補正（デザインB「室数」欄と同じ入力欄方式）
    // ・空欄・0以下・数値でない場合は「1」に戻す（初期値も1）
    // ・入力欄を離れたとき（change）に呼ぶ。補正後に金額も再計算する
    // =====================================
    function normalizeQtyInput_(input) {
      const qty = Math.floor(Number(input.value));
      input.value = (Number.isFinite(qty) && qty >= 1) ? qty : 1;
      calculateBreakdownAmount(input);
    }

    // =====================================
    // 内訳の金額計算 ＆ 親カード合計の連動関数
    // =====================================
    function calculateBreakdownAmount(element) {
      const card = element.closest('.detail-card');
      const row = element.closest('.breakdown-row');
      
      if (row) {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        
        const amount = Math.floor(qty * price); 
        
        const amountSpan = row.querySelector('.item-amount');
        amountSpan.textContent = amount.toLocaleString();
        amountSpan.dataset.value = amount; 
      }
      
      // 親カードの合計を更新
      updateCardTotal(card);
    }

    // =====================================
    // カード内の合計金額を計算・同期する関数
    // ✅ 変更：内容1に他の内容の合計を代入する仕組みを廃止したため、
    //   ロック判定なしで、全内容（内容1含む）の金額を単純合計するだけのシンプルな処理にした
    // =====================================
    function updateCardTotal(card) {
      const rows = card.querySelectorAll('.breakdown-row');
      if (rows.length === 0) return;
      
      let cardSubtotal = 0;
      for (let i = 0; i < rows.length; i++) {
        const span = rows[i].querySelector('.item-amount');
        cardSubtotal += parseFloat(span.dataset.value) || 0;
      }
      
      const totalSpan = card.querySelector('.card-total-amount');
      if (totalSpan) {
        totalSpan.textContent = cardSubtotal.toLocaleString();
        totalSpan.dataset.value = cardSubtotal;
      }
      
      updateTotalSummary();
    }
    
    // =====================================
    // 全体の小計・消費税・税込合計を計算する（画面には触れない）
    // ・各親項目の「項目合計金額」の合計が小計。消費税は小計×10%の切り捨て
    // =====================================
    function calculateTotalsA_() {
      let subtotal = 0;
      document.querySelectorAll('.card-total-amount').forEach(span => {
        subtotal += parseFloat(span.dataset.value) || 0;
      });
      const tax = Math.floor(subtotal * 0.1);
      return { subtotal: subtotal, tax: tax, total: subtotal + tax };
    }

    // =====================================
    // 全体の合計や消費税を計算して、画面（ボトムバー）に表示する関数
    // =====================================
    function updateTotalSummary() {
      const { subtotal, tax, total } = calculateTotalsA_();

      document.getElementById('subtotalLabel').textContent = subtotal.toLocaleString();
      document.getElementById('taxLabel').textContent = tax.toLocaleString();
      // totalLabelはデザインBのgrand-total-amountと同じ「¥込みで丸ごと1要素」の構成のため、
      // 数値だけでなく¥記号も一緒に書き込む（他2つはHTML側に¥が固定で入っている）
      document.getElementById('totalLabel').textContent = '¥' + total.toLocaleString();
      document.getElementById('totalLabel').dataset.value = total;
    }

    // =====================================
    // 画面入力値を集める関数
    // =====================================
    function getFormData() {
      
      const details = [];
      
      // 各カード（グループ）ごとに処理
      document.querySelectorAll('.detail-card').forEach(card => {
        const catSelect = card.querySelector('.item-category-select');
        let finalCategory = catSelect.value;
        if(finalCategory === '__NEW__') {
          finalCategory = card.querySelector('.item-category-input').value.trim();
        }
        
        const rows = card.querySelectorAll('.breakdown-row');
        if (rows.length === 0) return;

        // ✅ 変更：内容1に他の内容の合計金額を持たせる仕組みを廃止。
        //   各内容（内容1含む）が常に自分自身の数量・単価・金額を独立して持つ。
        //   カード全体の合計金額（項目行の金額として使う）は、全内容の金額を単純合計して求める。
        let cardTotalAmount = 0;
        rows.forEach(row => {
          const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
          const priceVal = row.querySelector('.item-price').value.trim();
          const price = priceVal === '' ? 0 : (parseFloat(priceVal) || 0);
          cardTotalAmount += Math.floor(qty * price);
        });
        
        // 各行（内容1、内容2、内容3...）のデータ生成
        rows.forEach((row, index) => {
          const name = row.querySelector('.item-name').value.trim();
          const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
          const unit = row.querySelector('.item-unit').value.trim();
          const priceVal = row.querySelector('.item-price').value.trim();
          const price = priceVal === '' ? 0 : (parseFloat(priceVal) || 0);
          const amount = Math.floor(qty * price);
          
          // 値のクレンジング（空なら「式」）
          const finalUnit = unit || '式';
          
          // ✅ 変更：品名が空でも、金額（数量×単価）や備考があれば保存対象に含める
          //   （以前は品名が空だと行ごと捨てられ、画面の合計と保存内容がズレていた）
          const remarksListEl = row.querySelector('.remarks-list');
          const hasAnyRemark = remarksListEl
            ? Array.from(remarksListEl.querySelectorAll('.remark-input')).some(input => input.value.trim() !== '')
            : false;

          if (name !== "" || amount !== 0 || hasAnyRemark || (index === 0 && finalCategory !== "")) {
            
            // 1. 品名行の追加
            details.push({
              itemCategory: (index === 0) ? finalCategory : "",
              itemName: name,
              itemQty: qty,
              itemUnit: finalUnit,
              itemPrice: price,
              // itemAmount：先頭行のみカード全体の合計金額（05_データ保存.js側で項目行の金額として使用）、
              //   2件目以降は各内容自身の金額（既存の他カテゴリと同じ挙動）
              itemAmount: (index === 0) ? cardTotalAmount : amount,
              // itemIndividualAmount：idx（0件目含む）にかかわらず、その内容自身の金額を常に保持
              itemIndividualAmount: amount,
              itemRemarks: ""
            });
          
            // 2. 備考行の追加（ 空文字は完全に除外して行詰めする）
            const remarksList = row.querySelector('.remarks-list');
            if (remarksList) {
              const remarksArray = Array.from(remarksList.querySelectorAll('.remark-input'))
                .map(input => input.value.trim())
                .filter(r => r !== ''); // 文字が入っているものだけを抽出
                
              remarksArray.forEach(remark => {
                details.push({
                  itemCategory: "",  
                  itemName: "",
                  itemQty: "",
                  itemUnit: "",
                  itemPrice: "",
                  itemAmount: "",
                  itemIndividualAmount: "",
                  itemRemarks: remark  
                });
              });
            }
          }
        });
      });
      
      // 画面の表示文字列を読み直さず、計算関数から直接受け取る
      const totals = calculateTotalsA_();

      return {
        // 案件・取引先・日付・件名など、基本情報カードの値（デザインBと共通。11_sharedInfo.js）
        ...getSharedInfoValues_(),
        remarks: document.getElementById('remarks').value.trim(),
        details: details,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total
      };
    }

    // =====================================
    // 【上限】デザインAの親項目（明細カード）の最大数
    // ・見積書シート（PDF 1ページ目）の明細欄が16行で、親項目は1件につき1行使うため、
    //   最大16件までしか載せられない。超えると17件目以降がPDFに出なくなるので、
    //   入力の段階で追加・保存できないようにする
    // ・PDF側の16行（07_PDFデザインA.js）と必ず同じ値にすること
    // =====================================
    const MAX_DETAIL_CARDS_A = 16;

    // 「項目追加」ボタン用：上限に達していたら追加せず、理由を案内する
    // （過去データの復元は addTableRow を直接呼ぶため、この上限の対象外）
    function handleAddDetailCardClick() {
      const currentCount = document.querySelectorAll('#detailsContainer .detail-card').length;
      if (currentCount >= MAX_DETAIL_CARDS_A) {
        Swal.fire({
          icon: 'warning',
          title: '項目数の上限です',
          text: `親項目は最大${MAX_DETAIL_CARDS_A}件までです。内容をまとめるか、不要な項目を削除してください。`,
          confirmButtonText: '了解'
        });
        return;
      }
      addTableRow();
    }

    // =====================================
    // 保存・プレビュー前の入力チェック（デザインA専用）
    //  1. 親項目が未選択（新規入力も空）なのに、内容が入力されているカードがないか
    //     → 以前はチェックがなく、前のカードに合流したり、PDFから行が消えたりしていた
    //  2. 親項目の数が上限（MAX_DETAIL_CARDS_A）を超えていないか
    //     → 過去データの復元などで上限を超えて表示された場合の保険
    // 問題があれば案内を出して false を返す
    // =====================================
    function validateDetailCardsA_() {
      const cards = document.querySelectorAll('#detailsContainer .detail-card');
      let categoryCardCount = 0;

      for (const card of cards) {
        const select = card.querySelector('.item-category-select');
        let category = select ? select.value : '';
        if (category === '__NEW__') {
          category = card.querySelector('.item-category-input').value.trim();
        }

        if (category !== '') {
          categoryCardCount++;
          continue;
        }

        // 親項目が空のカード：内容（品名・金額・備考）が入っている場合だけ問題とする
        // （何も入力していない空のカードは、保存時に無視されるため問題にしない）
        const hasContent = Array.from(card.querySelectorAll('.breakdown-row')).some(row => {
          const name = row.querySelector('.item-name').value.trim();
          const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
          const price = parseFloat(row.querySelector('.item-price').value) || 0;
          const hasRemark = Array.from(row.querySelectorAll('.remark-input')).some(input => input.value.trim() !== '');
          return name !== '' || Math.floor(qty * price) !== 0 || hasRemark;
        });

        if (hasContent) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          Swal.fire({
            icon: 'warning',
            title: '入力不足',
            text: '親項目が未選択の項目があります。親項目を選択（または新規項目名を入力）してください。',
            confirmButtonText: '了解'
          });
          return false;
        }
      }

      if (categoryCardCount > MAX_DETAIL_CARDS_A) {
        Swal.fire({
          icon: 'warning',
          title: '項目数の上限を超えています',
          text: `親項目は最大${MAX_DETAIL_CARDS_A}件までです（現在${categoryCardCount}件）。内容をまとめるか、不要な項目を削除してください。`,
          confirmButtonText: '了解'
        });
        return false;
      }

      return true;
    }
