/**
 * 【このファイルの役割】
 * 過去データ一覧モーダル（過去の見積書／下書き編集）の
 * 表示と、選択したデータの画面への復元処理。
 */

    // 現在表示中の一覧タイプ（検索実行時に使用）
    let currentListType = null;

    // =====================================
    // 見積書リストモーダル（複数用途対応版）
    // =====================================
    async function openEstimateListModal(listType) {
      currentListType = listType;
      try {
        // ここはまだローダーが表示された状態
        const resultData = await fetchWithRetry_({
          action: 'loadRecentList',
          payload: {}
        });
        
        window.cachedListData = resultData;
        
        // モーダルのタイトルを動的に変更
        const modalTitle = document.getElementById('listModalTitle');
        const container = document.getElementById('modalListContainer');
        const searchBar = document.getElementById('estimateSearchBar');
        
        // 初期化
        container.innerHTML = '<div style="text-align:center; color:var(--text-secondary);">読み込み中...</div>';
        
        if (listType === 'estimate') {
          modalTitle.textContent = '過去の見積書（PDF表示／コピーして作成）';
          searchBar.style.display = 'flex';
          clearEstimateSearch(); // 検索欄をクリアした状態で開く
          displayEstimateList(resultData.estimates);
        } else if (listType === 'draft') {
          modalTitle.textContent = '下書きを選択';
          searchBar.style.display = 'none';
          displayDraftList(resultData.drafts);
        }
        
        // リスト表示完了後にモーダルを表示
        document.getElementById('listModal').style.display = 'flex';
        
        // 最後にローダーを消す
        document.getElementById('loader').style.display = 'none';
        
      } catch (error) {
        console.error('リスト取得エラー:', error);
        document.getElementById('loader').style.display = 'none';
        Swal.fire({
          icon: 'error',
          title: 'エラー',
          text: error.message,
          confirmButtonText: '了解'
        });
        showMenuScreen();
      }
    }

    // =====================================
    // 見積書検索の実行
    // ✅ 新設：取引先名・見積番号・見積日の範囲で絞り込み検索する。
    //   直近一覧（loadRecentList）とは別に、全件を対象に検索する専用API
    //   （searchEstimates）を呼び出す。
    // =====================================
    async function executeEstimateSearch() {
      const keyword = document.getElementById('searchKeyword').value.trim();
      const estimateNo = document.getElementById('searchEstimateNo').value.trim();
      const dateFrom = document.getElementById('searchDateFrom').value;
      const dateTo = document.getElementById('searchDateTo').value;

      // 何も条件が入力されていない場合は、通常の直近一覧をそのまま表示する
      if (!keyword && !estimateNo && !dateFrom && !dateTo) {
        displayEstimateList(window.cachedListData.estimates);
        return;
      }

      const container = document.getElementById('modalListContainer');
      container.innerHTML = '<div style="text-align:center; color:var(--text-secondary);">検索中...</div>';

      try {
        const resultData = await fetchWithRetry_({
          action: 'searchEstimates',
          payload: { keyword, estimateNo, dateFrom, dateTo }
        });
        displayEstimateList(resultData);
      } catch (error) {
        console.error('検索エラー:', error);
        Swal.fire({ icon: 'error', title: '検索エラー', text: error.message, confirmButtonText: '了解' });
        displayEstimateList(window.cachedListData.estimates);
      }
    }

    // =====================================
    // 見積書検索欄のクリア（直近一覧の表示に戻す）
    // =====================================
    function clearEstimateSearch() {
      document.getElementById('searchKeyword').value = '';
      document.getElementById('searchEstimateNo').value = '';
      document.getElementById('searchDateFrom').value = '';
      document.getElementById('searchDateTo').value = '';
      if (window.cachedListData) {
        displayEstimateList(window.cachedListData.estimates);
      }
    }
     
    // =====================================
    // 過去の見積書一覧の表示
    // ・「見積書PDFを表示」「コピーして作成」の両方を各行に並べて表示する
    //   （旧：displayViewEstimateList／displayCopyEstimateList を統合）
    // ・管理者でログインしている場合のみ「削除」ボタンも表示する
    // =====================================
    function displayEstimateList(estimates) {
      const container = document.getElementById('modalListContainer');
      container.innerHTML = '';
      
      if (estimates.length === 0) {
        container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-secondary);">見積書データはありません。</div>';
        return;
      }
      
      const isAdmin = isCurrentUserAdmin();

      estimates.forEach(item => {
        const row = document.createElement('div');
        row.style = 'background:white; padding:12px; margin-bottom:8px; border-radius:6px; border:1px solid var(--gray-border); display:flex; flex-direction:column; gap:6px;';
        
        // PDFが存在する場合のみ「見積書PDFを表示」ボタンを表示（未作成の場合はボタンなしでその旨のみ表示）
        const fileUrlSection = item.fileUrl 
          ? `<a href="${item.fileUrl}" target="_blank" class="btn btn-secondary" style="padding:6px 12px; font-size:13px; width:auto; text-decoration:none;">
               <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle;">description</span>
               見積書PDFを表示
             </a>`
          : '<span style="color:#999; font-size:13px;">（PDFはまだ作成されていません）</span>';

        // ✅ 新設：管理者のみ削除ボタンを表示
        const deleteButtonSection = isAdmin
          ? `<button type="button" class="btn btn-secondary" 
                     style="padding:6px 12px; font-size:13px; width:auto; color:#ef4444; border-color:#fca5a5;" 
                     onclick="handleDeleteEstimate('${item.id}')">
                <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle;">delete</span>
                削除
             </button>`
          : '';
        
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary);">
            <span>ID: <b>${htmlEscape(String(item.id))}</b></span>
            <span>作成日: ${formatDateToInput(item.date)}</span>
          </div>
          <div style="font-weight:600; color:var(--text-primary); font-size:14px;">${htmlEscape(item.client || '取引先名なし')} — <span style="font-weight:500; font-size:13px;">${htmlEscape(item.subject || '（件名なし）')}</span></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; flex-wrap:wrap; gap:8px;">
            <span style="color:var(--primary); font-weight:bold;">¥${Number(item.amount).toLocaleString()}</span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${fileUrlSection}
              <button type="button" class="btn btn-primary" 
                      style="padding:6px 12px; font-size:13px; width:auto;" 
                      onclick="fetchAndReflectFields('${item.id}', 'COPY_CREATE')">
                  <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle;">assignment</span>
                  コピーして作成
              </button>
              ${deleteButtonSection}
            </div>
          </div>
        `;
        container.appendChild(row);
      });
    }

    // =====================================
    // 見積書削除の実行（管理者専用）
    // ✅ 新設：確認ダイアログを2段階（通常確認＋見積番号の入力確認）にし、
    //   誤操作による削除を防止する。削除後は一覧を再読み込みする。
    // =====================================
    async function handleDeleteEstimate(estimateNo) {
      const confirmResult = await Swal.fire({
        icon: 'warning',
        title: '見積書を削除しますか？',
        html: `見積番号 <strong>${htmlEscape(estimateNo)}</strong> を削除します。<br>
               この操作は取り消せません。関連するPDFファイルも削除されます。<br><br>
               確認のため、見積番号を入力してください。`,
        input: 'text',
        inputPlaceholder: estimateNo,
        showCancelButton: true,
        confirmButtonText: '削除する',
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'キャンセル',
        inputValidator: (value) => {
          if (value !== estimateNo) {
            return '見積番号が一致しません。';
          }
        }
      });

      if (!confirmResult.isConfirmed) return;

      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = '見積書を削除中...';

      try {
        await fetchWithRetry_({
          action: 'deleteEstimate',
          payload: {
            estimateNo: estimateNo,
            currentUserName: getCurrentUserName(),
            isAdmin: isCurrentUserAdmin()
          }
        });

        document.getElementById('loader').style.display = 'none';
        Swal.fire({ icon: 'success', title: '削除しました', confirmButtonText: '了解' });

        // 一覧を再読み込みして表示を更新
        openEstimateListModal('estimate');
      } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('見積書削除エラー:', error);
        Swal.fire({ icon: 'error', title: '削除に失敗しました', text: error.message, confirmButtonText: '了解' });
      }
    }
     
    // =====================================
    // 下書き編集リストの表示
    // =====================================
    function displayDraftList(drafts) {
      const container = document.getElementById('modalListContainer');
      container.innerHTML = '';
      
      if (drafts.length === 0) {
        container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-secondary);">下書きデータはありません。</div>';
        return;
      }
      
      drafts.forEach(item => {
        const row = document.createElement('div');
        row.style = 'background:white; padding:12px; margin-bottom:8px; border-radius:6px; border:1px solid var(--gray-border); display:flex; flex-direction:column; gap:6px;';
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary);">
            <span>ID: <b>${htmlEscape(String(item.id))}</b></span>
            <span>作成日: ${formatDateToInput(item.date)}</span>
          </div>
          <div style="font-weight:600; color:var(--text-primary); font-size:14px;">${htmlEscape(item.client || '取引先名なし')} — <span style="font-weight:500; font-size:13px;">${htmlEscape(item.subject || '（件名なし）')}</span></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <span style="color:var(--primary); font-weight:bold;">¥${Number(item.amount).toLocaleString()}</span>
            <button type="button" class="btn btn-primary" style="padding:6px 12px; font-size:13px; width:auto;" onclick="fetchAndReflectFields('${item.id}', 'DRAFT_EDIT')">[この下書きを編集]</button>
          </div>
        `;
        container.appendChild(row);
      });
    }
     
    // =====================================
    // データ読み込みと画面反映（エラーハンドリング強化）
    // =====================================
    async function fetchAndReflectFields(id, mode) {
      document.getElementById('listModal').style.display = 'none';
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = 'データを復元中...';
     
      try {
        // ステップ1: データ取得
        const formData = await fetchWithRetry_({
          action: 'loadFormData',
          payload: { targetId: id }
        });

        const targetDesignType = (formData.main && formData.main.designType) || 'A';

        // ---- デザインBのデータの場合は専用の復元処理へ分岐 ----
        if (targetDesignType === 'B') {
          currentMode = mode;
          currentOriginId = id;
          currentDesignType = 'B';
          appMode = 'NEW_ESTIMATE';

          reflectFieldsDesignB_(formData, mode);

          document.getElementById('loader').style.display = 'none';
          Swal.fire({
            icon: 'success',
            title: 'データ読み込み完了',
            text: mode === 'DRAFT_EDIT' ? '下書きを読み込みました。' : '見積書をコピーしました。',
            confirmButtonText: '了解'
          });
          showMainAppB();
          return;
        }

        currentDesignType = 'A';
        // ステップ2: フォーム状態を設定
        currentMode = mode;
        currentOriginId = id;
        appMode = 'NEW_ESTIMATE';
     
        // ステップ3: フォーム初期化
        document.getElementById('estimateForm').reset();
        document.getElementById('detailsContainer').innerHTML = '';
     
        // ステップ4: マスターデータ読み込み
        document.getElementById('loaderText').textContent = 'マスターデータを読み込んでいます...';
        await loadMasterLists();
     
        // マスター読み込み後に検証を追加
        if (!MASTER_CLIENTS || MASTER_CLIENTS.length === 0) {
          console.warn('⚠️ Master data might not have loaded completely');
        }
     
        // ステップ5: 日付設定
        const targetDate = mode === 'COPY_CREATE' ? new Date() : new Date(formData.main.estimateDate);
        document.getElementById('estimateDate').value = formatDateToInput(targetDate);
     
        // ========== ステップ6: クライアント情報設定 ==========
        document.getElementById('loaderText').textContent = 'クライアント情報を設定しています...';
        
        //  clientSelect をここで定義
        const clientSelect = document.getElementById('clientSelect');
        const currentClientName = formData.main.clientSelect || formData.main.clientName;
        
        if (clientSelect) {
          const clientExists = Array.from(clientSelect.options).some(
            opt => opt.value === currentClientName
          );
          
          if (clientExists) {
            clientSelect.value = currentClientName;
          } else {
            clientSelect.value = '__NEW__';
            const clientNameInput = document.getElementById('clientName');
            if (clientNameInput) {
              clientNameInput.value = currentClientName;
            }
            const newClientContainer = document.getElementById('newClientContainer');
            if (newClientContainer) {
              newClientContainer.style.display = 'block';
            }
          }
        }
        
        // 反映漏れ対策
        const clientNameInput = document.getElementById('clientName');
        if (clientNameInput && !clientNameInput.value) {
          clientNameInput.value = currentClientName || '';
        }
     
        // ========== ステップ7: 担当者情報設定 ==========
        const contactPersonSelect = document.getElementById('contactPersonSelect');
        
        if (contactPersonSelect && currentClientName) {
          // マスターから担当者リストを更新
          if (typeof updateContactPersonList === 'function') {
            updateContactPersonList(currentClientName);
          }
          
          if (formData.main.contactPerson) {
            const personExists = Array.from(contactPersonSelect.options).some(
              opt => opt.value === formData.main.contactPerson
            );
            
            if (personExists) {
              contactPersonSelect.value = formData.main.contactPerson;
            } else {
              contactPersonSelect.value = '__NEW__';
              const contactPersonNameInput = document.getElementById('contactPersonName');
              if (contactPersonNameInput) {
                contactPersonNameInput.value = formData.main.contactPerson;
              }
              const newContactPersonContainer = document.getElementById('newContactPersonContainer');
              if (newContactPersonContainer) {
                newContactPersonContainer.style.display = 'block';
              }
            }
          }
        }
     
        // ========== ステップ8: その他の入力欄を設定 ==========
        document.getElementById('loaderText').textContent = 'フォーム詳細を設定しています...';
        
        const addressInput = document.getElementById('clientAddress');
        if (addressInput) {
          addressInput.value = formData.main.clientAddress || '';
        }
        
        const subjectInput = document.getElementById('subject');
        if (subjectInput) {
          subjectInput.value = formData.main.subject || '';
        }
        
        const paymentTermsInput = document.getElementById('paymentTerms');
        if (paymentTermsInput) {
          paymentTermsInput.value = formData.main.paymentTerms || '';
        }
        
        const validityInput = document.getElementById('validity');
        if (validityInput) {
          validityInput.value = formData.main.validity || '';
        }
        
        const remarksInput = document.getElementById('remarks');
        if (remarksInput) {
          remarksInput.value = formData.main.remarks || '';
        }
     
        // ========== ステップ9: 明細行の復存（同名親項目＆備考統合 完全対応版） ==========
        document.getElementById('loaderText').textContent = '明細データを復存しています...';

        const detailsContainer = document.getElementById('detailsContainer');
        detailsContainer.innerHTML = ''; // 一旦完全にクリア

        if (detailsContainer && formData.details && formData.details.length > 0) {
          // --- ステップ9-A: 親項目の空白埋め ＆ 備考のみの行の統合 ---
          const cleanedDetails = [];
          let lastValidCategory = ''; 
          let pendingCardStart = false; // 💡直前に「項目行」があった場合、次の実データ行をカード開始として扱うためのフラグ
          
          formData.details.forEach((item) => {
            // 元データの時点で親項目が明記されているか（空白・空文字でないか）を厳密に判定
            const isExplicitCategory = item.itemCategory && String(item.itemCategory).trim() !== '';
            const hasName = item.itemName && String(item.itemName).trim() !== '';
            
            if (isExplicitCategory) {
              lastValidCategory = String(item.itemCategory).trim();
            }

            // ✅ 修正：見積管理シートの保存形式変更（項目を独立行に分離）に対応。
            //   「カテゴリ名はあるが品名が空」の行＝カテゴリ合計金額だけを運ぶ「項目行」。
            //   画面側の合計金額は内訳から動的に再計算されるため、この行自体は
            //   内訳データとして使わず読み飛ばし、カード開始の目印だけ次の行に引き継ぐ。
            if (isExplicitCategory && !hasName) {
              pendingCardStart = true;
              return; // この行はcleanedDetailsに含めない
            }

            if (isExplicitCategory || pendingCardStart) {
              item.isCardStart = true; // 💡新しいカードの開始という目印を付ける
              pendingCardStart = false;
            } else {
              item.isCardStart = false;
            }
            
            // 空白だった行には直前のカテゴリ名を引き継ぐ
            item.itemCategory = lastValidCategory || '（カテゴリなし）';

            const hasRemarks = item.itemRemarks && String(item.itemRemarks).trim() !== '';
            
            // 【品名が空】かつ【備考がある】かつ【すでに1件以上データがある】場合は直前の行に統合
            if (!hasName && hasRemarks && cleanedDetails.length > 0) {
              const lastItem = cleanedDetails[cleanedDetails.length - 1];
              if (!lastItem.itemRemarksList) {
                lastItem.itemRemarksList = lastItem.itemRemarks ? [lastItem.itemRemarks] : [];
              }
              lastItem.itemRemarksList.push(String(item.itemRemarks).trim());
            } else {
              // 通常の明細行（または最初の行）
              item.itemRemarksList = item.itemRemarks ? [String(item.itemRemarks).trim()] : [];
              cleanedDetails.push(item);
            }
          });

          // --- ステップ9-B: 明記されていた箇所を基準にカードを分割 ---
          const groups = [];
          let currentGroup = [];
          
          cleanedDetails.forEach((item, index) => {
            // 💡 1行目、または「元データに親項目が明記されていた（isCardStart が true）」の場合、
            // たとえ前の行と全く同じカテゴリ名であっても、強制的に新しい別のカード（グループ）として開始する！
            if (index === 0 || item.isCardStart) {
              if (currentGroup.length > 0) {
                groups.push(currentGroup);
              }
              currentGroup = [item];
            } else {
              // 親項目が空欄だった行は、同じカードの内訳（明細行）として素直に追加
              currentGroup.push(item);
            }
          });
          if (currentGroup.length > 0) {
            groups.push(currentGroup);
          }
          
          // --- ステップ9-C: カードの生成とデータ流し込み ---
          groups.forEach((groupItems) => {
            addTableRow(groupItems);
          });

          // --- ステップ9-D: すべて配置し終わった後に一括計算 ---
          const allCards = detailsContainer.querySelectorAll('.detail-card');
          allCards.forEach(card => {
            if (typeof checkUnitConstraint === 'function') checkUnitConstraint(card);
            if (typeof updateCardTotal === 'function') updateCardTotal(card);
          });

        } else {
          addTableRow();
        }
        
        // ========== ステップ10: 全体合計を最後に1回だけ再計算 ==========
        if (typeof updateTotalSummary === 'function') {
          updateTotalSummary();
        }
        // ローダーを消す
        document.getElementById('loader').style.display = 'none';
        
        // 成功メッセージ
        const successMsg = mode === 'DRAFT_EDIT' ? '下書きを読み込みました。' : '見積書をコピーしました。';
        Swal.fire({
          icon: 'success',
          title: 'データ読み込み完了',
          text: successMsg,
          confirmButtonText: '了解'
        });
     
        //  メイン画面を表示（必須）
        showMainApp();
     
      } catch (error) {
        //  エラー時も必ずローダーを消す
        document.getElementById('loader').style.display = 'none';
        
        console.error('❌ データ読み込みエラー:', error);
        console.error('Error stack:', error.stack);
        
        Swal.fire({
          icon: 'error',
          title: 'エラーが発生しました',
          html: `<strong>${error.message}</strong><br><br><small>詳細はコンソール（F12）を確認してください</small>`,
          confirmButtonText: '了解'
        });
        
        showMenuScreen();
      }
    }

    function handlePostSaveAction(actionType) {
      if (actionType === 'saveEstimate' && currentMode === 'DRAFT_EDIT' && currentOriginId.startsWith('DRAFT-')) {
        // 確定保存が成功したため、古い下書きの消去をGASへ非同期命令
        fetchWithRetry_({ action: 'deleteDraft', payload: { draftId: currentOriginId } })
          .catch(err => console.error('下書き削除リクエスト失敗:', err));
      }
      // 保存完了後は状態を新規に戻す
      currentMode = 'NEW';
      currentOriginId = '';
    }
