/**
 * 【このファイルの役割】
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
        
        // マスターデータ取得（await で完了を待つ）
        await loadMasterLists();
        
        // 今日の日付をセット
        document.getElementById('estimateDate').value = new Date().toISOString().split('T')[0];
        
        // 初期行を1行追加
        //for(let i = 0; i < 1; i++) addTableRow();
        
        updateTotalSummary();
        
      } catch (error) {
        console.error('フォーム初期化エラー:', error);
        throw error;  // エラーを上位に渡す
      }
    }
     
    // =====================================
    // 明細行（親項目カード）を追加している関数
    // =====================================
    function addTableRow(itemData = null) {
      const container = document.getElementById('detailsContainer');
      const card = document.createElement('div');
      card.className = 'detail-card';
      
      const categoryOptions = MASTER_CATEGORIES.map(cat => `<option value="${htmlEscape(cat)}">${htmlEscape(cat)}</option>`).join('') + '<option value="__NEW__">＋新規項目</option>';

      card.innerHTML = `
        <div style="display: flex; gap: 6px; align-items: flex-start; margin-bottom: 12px; background: #fff; padding: 12px; border-radius: 4px; border: 1px solid #e9ecef; width: 100%; box-sizing: border-box;">
          <div class="form-group" style="margin-bottom: 0; flex: 1; min-width: 0;">
            <label style="font-weight: bold; color: #495057; display: block; margin-bottom: 4px;">親項目 <span class="badge-required">必須</span></label>
            <select class="item-category-select" style="width: 100%; box-sizing: border-box;" onchange="toggleNewCategory(this)">
              <option value="">-- 選択 --</option>
              ${categoryOptions}
            </select>
            <div class="dynamic-input-container" style="display:none; margin-top: 5px;">
              <input type="text" class="item-category-input" style="width: 100%; box-sizing: border-box;" placeholder="新規項目名">
            </div>
          </div>
        </div>
        
        <div class="breakdown-container"></div>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 10px; border-top: 1px dashed #dee2e6; padding-top: 10px; width: 100%; box-sizing: border-box;">           
          <div style="flex: 1; text-align: left;">
            <button type="button" class="btn" style="background-color: #e8f5e9; color: #2e7d32; padding: 6px 12px; font-size: 14px; font-weight: bold;" onclick="addBreakdownRow(this.closest('.detail-card'), this.closest('.detail-card').querySelector('.breakdown-container'), false)">
              <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">add</span> 内訳を追加
            </button>
          </div> 
          <div style="flex: 1; max-width: 50%; min-width: 0; text-align: right;">
            <label style="font-weight: bold; display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">項目合計金額</label>
            <div class="amount-display-box" style="background: #e3f2fd; padding: 6px 12px; border-radius: 4px; border: 1px solid #b3e5fc; font-weight: bold; font-size: 15px; color: #0d47a1; text-align: right; width: 100%; box-sizing: border-box; display: flex; justify-content: space-between; align-items: center;">
              <span>¥</span>
              <span class="card-total-amount" data-value="0">0</span>
            </div>
          </div>
        </div>
        
        <div style="text-align: right; margin-top: 12px;">
          <button type="button" class="btn btn-danger" style="padding: 6px 12px; font-size: 14px;" onclick="deleteTableRow(this)">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">delete</span> 項目ごと削除
          </button>
        </div>
      `;
      
      container.appendChild(card);
      
      // ========== データがある場合は値を埋め込む（完全に条件分岐） ==========
      if (itemData) {
        try {
          const isGroupData = Array.isArray(itemData);
          if (isGroupData) {
            // グループ（複数行）の場合 ➔ 内部でHTMLを直接 appendChild する（addBreakdownRowは呼ばない）
            populateDetailCardWithGroup(card, itemData);
          } else {
            // 単一行の場合
            populateDetailCard(card, itemData);
          }
        } catch (error) {
          console.error('❌ Error populating card with data:', error);
          throw error;
        }
      } else {
        // 💡 データが本当にない（新規作成ボタンを押した）時だけ、空の初期行を追加する
        const breakdownContainer = card.querySelector('.breakdown-container');
        if (typeof addBreakdownRow === 'function') {
          addBreakdownRow(card, breakdownContainer, true);
        }
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
          const category = firstItem.itemCategory || '';
          categorySelect.value = category;
          
          if (!category) {
            categorySelect.value = '__NEW__';
            const inputContainer = card.querySelector('.dynamic-input-container');
            const input = card.querySelector('.item-category-input');
            if (inputContainer && input) {
              inputContainer.style.display = 'block';
              input.value = '';
              input.required = true;
            }
          }
        }
        
        // ========== ステップ2: 内訳コンテナを取得 ==========
        const breakdownContainer = card.querySelector('.breakdown-container');
        if (!breakdownContainer) {
          throw new Error('breakdown-container が見つかりません');
        }
        
        // ========== ステップ3: 各行の生成 ==========
        itemDataArray.forEach((item, rowIndex) => {
          const breakdownRow = document.createElement('div');
          breakdownRow.className = 'breakdown-row';
          breakdownRow.style = 'border: 1px solid #f1f3f5; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: #fff;';
          
          const displayQty = item.itemQty || 1;
          const displayUnit = item.itemUnit ? String(item.itemUnit).trim() : '式';
          const displayPrice = Number(item.itemPrice || 0);
          const displayAmount = Number(item.itemAmount || 0);
          
          // 数量・単位セレクトの生成
          const qtyOptions = Array.from({length: 99}, (_, i) => 
            `<option value="${i+1}" ${(i+1) === displayQty ? 'selected' : ''}>${i+1}</option>`
          ).join('');
          
          const unitOptions = (!MASTER_UNITS.includes('式') ? '<option value="式">式</option>' : '') + 
                              MASTER_UNITS.filter(u => u && u.trim()).map(u => 
                                `<option value="${htmlEscape(u.trim())}" ${u === displayUnit ? 'selected' : ''}>${htmlEscape(u.trim())}</option>`
                              ).join('');
          
          // 📝 備考のHTMLを事前に組み立てる（配列内のすべての備考をループで回す）
          let remarksHtml = '';
          const remarksArray = item.itemRemarksList || (item.itemRemarks ? [item.itemRemarks] : []);
          
          if (remarksArray.length > 0) {
            remarksHtml = remarksArray.map(remarkVal => `
              <div class="remark-row" style="display: flex; gap: 6px; align-items: center;">
                <div class="voice-input-wrapper" style="flex: 1; display: flex; gap: 6px;">
                  <input type="text" class="remark-input" value="${htmlEscape(String(remarkVal).trim())}" style="flex: 1;">
                  <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)" style="padding: 4px 8px;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">mic</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.remark-row').remove()" style="padding: 4px 8px;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
                  </button>
                </div>
              </div>
            `).join('');
          } else {
            // 備考が1件もない場合は空の入力欄を1つだけ用意しておく
            remarksHtml = `
              <div class="remark-row" style="display: flex; gap: 6px; align-items: center;">
                <div class="voice-input-wrapper" style="flex: 1; display: flex; gap: 6px;">
                  <input type="text" class="remark-input" value="" style="flex: 1;">
                  <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)" style="padding: 4px 8px;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">mic</span>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.remark-row').remove()" style="padding: 4px 8px;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
                  </button>
                </div>
              </div>
            `;
          }

          // メインHTMLの流し込み
          breakdownRow.innerHTML = `
            <div class="form-group" style="margin-top: 5px;">
              <label>仕様・摘要 <span class="badge-required">必須</span></label>
              <div class="voice-input-wrapper">
                <input type="text" class="item-name" placeholder="品名・内容など" value="${htmlEscape(String(item.itemName || ''))}">
                <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)"><span class="material-symbols-outlined">mic</span></button>
              </div>
            </div>
      
            <div class="card-row-lower" style="margin-bottom: 4px;">
              <div class="item-grid-row-3col">
                <div class="form-group">
                  <label>数量</label>
                  <select class="item-qty" onchange="calculateBreakdownAmount(this)">${qtyOptions}</select>
                </div>
                <div class="form-group">
                  <label>単位</label>
                  <select class="item-unit" onchange="checkUnitConstraint(this.closest('.detail-card'))">${unitOptions}</select>
                </div>
                <div class="form-group">
                  <label>単価</label>
                  <input type="number" class="item-price" min="0" value="${displayPrice}" oninput="calculateBreakdownAmount(this)">
                </div>
                <div class="form-group">
                  <label>金額</label>
                  <div class="amount-display-box"><span>¥</span><span class="item-amount" data-value="${displayAmount}">${displayAmount.toLocaleString()}</span></div>
                </div>
              </div>
            </div>
      
            <div class="remarks-container" style="background: #f9f9f9; border: 1px dashed #e0e0e0; border-radius: 4px; padding: 8px; margin: 8px 0;">
              <label style="font-size: 12px; color: #666; display: block; margin-bottom: 6px; font-weight: bold;">📝 備考（複数追加可）</label>
              <div class="remarks-list" style="display: flex; flex-direction: column; gap: 6px;">
                ${remarksHtml}
              </div>
              <button type="button" class="btn btn-sm" style="background-color: #e8f5e9; color: #2e7d32; padding: 4px 8px; font-size: 12px; margin-top: 6px;" onclick="addRemarkRow(this)">
                <span class="material-symbols-outlined" style="font-size: 14px;">add</span> 備考を追加
              </button>
            </div>
      
            ${rowIndex > 0 ? `
            <div style="text-align: left; margin-top: 2px; margin-bottom: 2px;">
              <button type="button" class="btn btn-sm btn-danger" onclick="deleteBreakdownRow(this)" style="padding: 6px 12px; font-size: 14px; height: auto; line-height: 1; border-radius: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">delete</span> 内訳を削除
              </button>
            </div>
            ` : ''}
          `;
          
          // DOMに追加
          breakdownContainer.appendChild(breakdownRow);
        });
        
        // ========== ステップ4: 全体の更新 ==========
        checkUnitConstraint(card);
        updateCardTotal(card);
        
      } catch (error) {
        console.error('❌ Error in populateDetailCardWithGroup:', error);
        throw error;
      }
    }

    // =====================================
    // 子行（内訳）を追加する関数
    // =====================================
    function addBreakdownRow(card, breakdownContainer, isFirst = false) {
      const row = document.createElement('div');
      row.className = 'breakdown-row';
      row.style = 'border: 1px solid #f1f3f5; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: #fff;';
      
      const qtyOptions = Array.from({length: 99}, (_, i) => `<option value="${i+1}">${i+1}</option>`).join('');
      const unitOptions = (!MASTER_UNITS.includes('式') ? '<option value="式">式</option>' : '') + 
                          MASTER_UNITS.filter(u => u && u.trim()).map(u => `<option value="${htmlEscape(u.trim())}">${htmlEscape(u.trim())}</option>`).join('');
    
      row.innerHTML = `
        <div class="form-group" style="margin-top: 5px;">
          <label>仕様・摘要 <span class="badge-required">必須</span></label>
          <div class="voice-input-wrapper">
            <input type="text" class="item-name" placeholder="品名・内容など">
            <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)"><span class="material-symbols-outlined">mic</span></button>
          </div>
        </div>
    
        <div class="card-row-lower" style="margin-bottom: 4px;">
          <div class="item-grid-row-3col">
            <div class="form-group">
              <label>数量</label>
              <select class="item-qty" onchange="calculateBreakdownAmount(this)">${qtyOptions}</select>
            </div>
            <div class="form-group">
              <label>単位</label>
              <select class="item-unit" onchange="checkUnitConstraint(this.closest('.detail-card'))">${unitOptions}</select>
            </div>
            <div class="form-group">
              <label>単価</label>
              <input type="number" class="item-price" min="0" value="0" oninput="calculateBreakdownAmount(this)">
            </div>
            <div class="form-group">
              <label>金額</label>
              <div class="amount-display-box"><span>¥</span><span class="item-amount" data-value="0">0</span></div>
            </div>
          </div>
        </div>
    
        <!-- 複数備考コンテナ -->
        <div class="remarks-container" style="background: #f9f9f9; border: 1px dashed #e0e0e0; border-radius: 4px; padding: 8px; margin: 8px 0;">
          <label style="font-size: 12px; color: #666; display: block; margin-bottom: 6px; font-weight: bold;">📝 備考（複数追加可）</label>
          <div class="remarks-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
          <button type="button" class="btn btn-sm" style="background-color: #e8f5e9; color: #2e7d32; padding: 4px 8px; font-size: 12px; margin-top: 6px;" onclick="addRemarkRow(this)">
            <span class="material-symbols-outlined" style="font-size: 14px;">add</span> 備考を追加
          </button>
        </div>
    
        ${!isFirst ? `
        <div style="text-align: left; margin-top: 2px; margin-bottom: 2px;">
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteBreakdownRow(this)" style="padding: 6px 12px; font-size: 14px; height: auto; line-height: 1; border-radius: 4px;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle;">delete</span> 内訳を削除
          </button>
        </div>
        ` : ''}
      `;
    
      breakdownContainer.appendChild(row);
      
      const unitSelect = row.querySelector('.item-unit');
      unitSelect.value = '';
      
      // 最初の1行には初期備考行を1つ追加
      const remarksList = row.querySelector('.remarks-list');
      if (isFirst) {
        addRemarkRow(row.querySelector('.remarks-container button'));
      }
      
      // 状態チェック後に金額計算を実行
      checkUnitConstraint(card);
      calculateBreakdownAmount(row.querySelector('.item-qty'));
    }
    
    // =====================================
    // 備考行を追加する関数
    // =====================================
    function addRemarkRow(addButton) {
      const remarksList = addButton.closest('.remarks-container').querySelector('.remarks-list');
      
      const remarkRow = document.createElement('div');
      remarkRow.className = 'remark-row';
      remarkRow.style = 'display: flex; gap: 6px; align-items: center;';
      
      remarkRow.innerHTML = `
        <div class="voice-input-wrapper" style="flex: 1; display: flex; gap: 6px;">
          <input type="text" class="remark-input" placeholder="仕様・摘要（備考）を追加" style="flex: 1;">
          <button type="button" class="btn btn-sm" onclick="startVoiceInput(this)" style="padding: 4px 8px;">
            <span class="material-symbols-outlined" style="font-size: 14px;">mic</span>
          </button>
          <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.remark-row').remove()" style="padding: 4px 8px;">
            <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
          </button>
        </div>
      `;
      
      remarksList.appendChild(remarkRow);
      
      // 新規追加した入力欄にフォーカス
      remarkRow.querySelector('.remark-input').focus();
    }

    
    // =====================================
    // 内訳の数による単位制限ルールを制御する関数
    // =====================================
    function checkUnitConstraint(card) {
      const rows = card.querySelectorAll('.breakdown-row');
      if (rows.length === 0) return;
      
      const firstRow = rows[0];
      const firstQty = firstRow.querySelector('.item-qty');
      const firstUnit = firstRow.querySelector('.item-unit');
      const firstPrice = firstRow.querySelector('.item-price');
      
      // 「2行目（内容2）以降が存在するか」で判定
      if (rows.length >= 2) {
        // 内訳2以上がある場合：内容1（1行目）を「数量:1」「単位:式」「単価:なし」に固定
        firstQty.value = '1';
        firstQty.disabled = true;
        
        // 元々ある「式」をそのまま選択させてロック（動的なオプション追加を廃止）
        firstUnit.value = '式'; 
        firstUnit.disabled = true;
        
        firstPrice.value = '';
        firstPrice.disabled = true;
        
      } else {
        // 有効な内訳が1つ以下（内容1のみ）になったらロックを解除して通常に戻す
        firstQty.disabled = false;
        firstUnit.disabled = false;
        firstPrice.disabled = false;
        
        if (firstPrice.value === '') {
          firstPrice.value = '0';
        }
      }
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
        checkUnitConstraint(card);
        updateCardTotal(card);
      });
    }

    // =====================================
    // 内訳の金額計算 ＆ 親カード合計の連動関数
    // =====================================
    function calculateBreakdownAmount(element) {
      const card = element.closest('.detail-card');
      const row = element.closest('.breakdown-row');
      
      if (row) {
        const rows = card.querySelectorAll('.breakdown-row');
        // 行数ではなく「1行目がロックされているか」を基準にスキップを判定
        const isLocked = rows[0].querySelector('.item-qty').disabled;
        
        if (!(isLocked && row === rows[0])) {
          const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
          const price = parseFloat(row.querySelector('.item-price').value) || 0;
          
          const amount = Math.floor(qty * price); 
          
          const amountSpan = row.querySelector('.item-amount');
          amountSpan.textContent = amount.toLocaleString();
          amountSpan.dataset.value = amount; 
        }
      }
      
      // 金額が入力・計算されたので、その場で制限ルールをリアルタイムチェック
      checkUnitConstraint(card);
      
      // 親カードの合計を更新
      updateCardTotal(card);
    }

    // =====================================
    // カード内の合計金額を計算・同期する関数
    // =====================================
    function updateCardTotal(card) {
      const rows = card.querySelectorAll('.breakdown-row');
      if (rows.length === 0) return;
      
      let cardSubtotal = 0;
      const firstRow = rows[0];
      // 1行目がロックされているかどうかを判定フラグにする
      const isLocked = firstRow.querySelector('.item-qty').disabled;
      
      if (isLocked) {
        // 2行目以上ある場合：2行目以降（内容2〜）の金額だけを合計する（金額倍増バグを防ぐ）
        for (let i = 1; i < rows.length; i++) {
          const span = rows[i].querySelector('.item-amount');
          cardSubtotal += parseFloat(span.dataset.value) || 0;
        }
        
        // 内容1（1行目）の金額欄に、計算した合計額をリアルタイムに同期
        const firstAmountSpan = rows[0].querySelector('.item-amount');
        firstAmountSpan.textContent = cardSubtotal.toLocaleString();
        firstAmountSpan.dataset.value = cardSubtotal;
        
      } else {
        // 通常モード（ロックなし）の時は、1行目も含めた全行の金額を単純合計する
        for (let i = 0; i < rows.length; i++) {
          const span = rows[i].querySelector('.item-amount');
          cardSubtotal += parseFloat(span.dataset.value) || 0;
        }
      }
      
      const totalSpan = card.querySelector('.card-total-amount');
      if (totalSpan) {
        totalSpan.textContent = cardSubtotal.toLocaleString();
        totalSpan.dataset.value = cardSubtotal;
      }
      
      updateTotalSummary();
    }
    
    // =====================================
    // 全体の合計や消費税を計算している関数
    // =====================================
    function updateTotalSummary() {
      let subtotal = 0;
      // 各親項目の「合計金額ボックス」から値を集計します
      document.querySelectorAll('.card-total-amount').forEach(span => {
        subtotal += parseFloat(span.dataset.value) || 0;
      });
      
      const tax = Math.floor(subtotal * 0.1);
      const total = subtotal + tax;
      
      document.getElementById('subtotalLabel').textContent = subtotal.toLocaleString();
      document.getElementById('taxLabel').textContent = tax.toLocaleString();
      document.getElementById('totalLabel').textContent = total.toLocaleString();
      document.getElementById('totalLabel').dataset.value = total;
    }

    // =====================================
    // 画面入力値を集める関数
    // =====================================
    function getFormData() {
      const clientSelect = document.getElementById('clientSelect');
      let finalClientName = clientSelect.value;
      if(finalClientName === '__NEW__') {
        finalClientName = document.getElementById('clientName').value.trim();
      }
      
      const contactPersonSelect = document.getElementById('contactPersonSelect');
      let finalContactPerson = contactPersonSelect.value;
      if(finalContactPerson === '__NEW__') {
        finalContactPerson = document.getElementById('contactPersonName').value.trim();
      } else if (!finalContactPerson) {
        finalContactPerson = '';
      }
      
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

        // このカードの「内容1」が固定モード（ロック）に入っているかを確実に判定
        const isCardLocked = rows[0].querySelector('.item-qty').disabled;
        
        // 先に「内容2」以降の内訳の合計金額を計算しておく
        let breakdownSubtotal = 0;
        rows.forEach((row, index) => {
          if (index > 0) {
            const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
            const priceVal = row.querySelector('.item-price').value.trim();
            const price = priceVal === '' ? 0 : (parseFloat(priceVal) || 0);
            breakdownSubtotal += Math.floor(qty * price);
          }
        });
        
        // 各行（内容1、内容2、内容3...）のデータ生成
        rows.forEach((row, index) => {
          const name = row.querySelector('.item-name').value.trim();
          const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
          const unit = row.querySelector('.item-unit').value.trim();
          const priceVal = row.querySelector('.item-price').value.trim();
          const price = priceVal === '' ? 0 : (parseFloat(priceVal) || 0);
          
          let amount = Math.floor(qty * price);
          
          // 値のクレンジング（空なら「式」）
          let finalUnit = unit || '式';
          
          // 変数の初期化
          let finalQty = qty;
          let finalPrice = price;
          let finalAmount = amount;
          let isSubtotalLine = false;
          
          // 「ロックモード」かつ「内容1（index === 0）」の品名行だけの特別処理
          if (isCardLocked && index === 0) {
            finalQty = qty;                   // 画面上の固定値をそのまま使用
            finalPrice = price;               // 画面上の固定値をそのまま使用
            finalAmount = breakdownSubtotal;  // 金額だけ内訳の合計値に差し替える
            isSubtotalLine = true;            // この行だけに小計マークの権利を与える
          }
          
          // 品名がある、または内容1でカテゴリがある場合は行を追加
          if(name !== "" || (index === 0 && finalCategory !== "")) {
            
            // 1. 品名行の追加
            details.push({
              isSubtotal: isSubtotalLine, // 内容1の品名行だけが true になる
              itemCategory: (index === 0) ? finalCategory : "",
              itemName: name,
              itemQty: finalQty,
              itemUnit: finalUnit,
              itemPrice: finalPrice,
              itemAmount: finalAmount,
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
                  isSubtotal: false, // 備考行には小計を入れない
                  itemCategory: "",  
                  itemName: "",
                  itemQty: "",
                  itemUnit: "",
                  itemPrice: "",
                  itemAmount: "",
                  itemRemarks: remark  
                });
              });
            }
          }
        });
      });
      
      const getValueFromDisplay = (elementId) => {
        const el = document.getElementById(elementId);
        if (!el) return 0;
        // input要素なら.value、divやspanなどのパーツなら.textContentを取得
        const rawText = el.tagName === 'INPUT' ? el.value : el.textContent;
        // 「¥」や「,」や空白など、数字とマイナス・ピリオド以外の文字をすべて綺麗に消去して数値化
        return Math.floor(Number(rawText.replace(/[^0-9.-]/g, ''))) || 0;
      };

      const currentSubtotal = getValueFromDisplay('subtotalLabel'); 
      const currentTax      = getValueFromDisplay('taxLabel');      
      const currentTotal    = getValueFromDisplay('totalLabel');    

      return {
        clientName: finalClientName,
        contactPerson: finalContactPerson,
        clientAddress: document.getElementById('clientAddress').value.trim(),
        estimateDate: document.getElementById('estimateDate').value,
        subject: document.getElementById('subject').value.trim(),
        validity: document.getElementById('validity').value.trim(),
        paymentTerms: document.getElementById('paymentTerms').value.trim(),
        remarks: document.getElementById('remarks').value.trim(),
        details: details,
        // すでに画面で正しく計算・表示されている値をそのまま使い回す
        subtotal: currentSubtotal,
        tax: currentTax,
        total: currentTotal
      };
    }
