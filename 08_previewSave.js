/**
 * 【このファイルの役割】
 * プレビュー表示・下書き保存・確定保存＆PDF生成のリクエスト処理。
 * デザインA・デザインBどちらのフォームからも共通で使われる。
 */

    function showPDFPreview() {
      const data = currentDesignType === 'B' ? getFormDataB() : getFormData();
      
      if(!data.clientName) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '取引先を選択してください。', confirmButtonText: '了解' });
        return;
      }
      if(data.details.length === 0) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '明細を1件以上入力してください。', confirmButtonText: '了解' });
        return;
      }
      showPreviewDialog(data);
    }

    function showPreviewDialog(data) {
      let detailRows = '';

      // ✅ 変更：見積管理シートの保存形式と同じ「項目行（カテゴリ合計金額のみ）→
      //   各品名・仕様行」の構造でプレビュー表示する。
      //   金額表示は "¥#,###" 形式に統一し、金額が0または空欄の場合は表示しない。
      const formatYen_ = (value) => {
        const num = Number(value);
        if (!num) return ''; // 0・NaN・空文字はすべて空欄扱い
        return '¥' + num.toLocaleString();
      };

      // ---- カテゴリごとにグループ化（05_データ保存.jsのsaveFormDataToSheets_と同じ考え方） ----
      const groups = [];
      let currentGroup = null;
      data.details.forEach(item => {
        const categoryDisplay = (item.itemCategory || '').toString().trim();
        if (categoryDisplay !== '') {
          currentGroup = { categoryDisplay: categoryDisplay, items: [] };
          groups.push(currentGroup);
        }
        if (currentGroup) {
          currentGroup.items.push(item);
        } else {
          currentGroup = { categoryDisplay: '', items: [item] };
          groups.push(currentGroup);
        }
      });

      groups.forEach((group, groupIndex) => {
        // カテゴリの区切りとして空行を挿入（先頭グループの前には不要）
        if (groupIndex > 0) {
          detailRows += `
            <tr style="height: 6px;">
              <td colspan="7" style="border: none; padding: 0;"></td>
            </tr>
          `;
        }

        // カテゴリ合計金額（先頭itemのitemAmountに入っている）
        const categoryTotalAmount = Number(group.items[0]?.itemAmount ?? 0);

        // ---- 項目行：品名・数量・単位・単価は空欄、金額欄にカテゴリ合計、備考欄に「小計」 ----
        detailRows += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 4px;">${htmlEscape(group.categoryDisplay)}</td>
            <td style="border: 1px solid #ddd; padding: 4px;"></td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;"></td>
            <td style="border: 1px solid #ddd; padding: 4px;"></td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;"></td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${formatYen_(categoryTotalAmount)}</td>
            <td style="border: 1px solid #ddd; padding: 4px; font-size: 11px; color: #666; font-weight: bold;">小計</td>
          </tr>
        `;

        // ---- 各品名・仕様の行 ----
        // ✅ 修正：デザインAも各内容が独立した自分の金額を持つ形になったため、
        //   デザインBと同じシンプルなロジックで表示する（特別扱いの行はない）
        group.items.forEach(item => {
          // 品名または備考の表示
          let displayName = htmlEscape(item.itemName || '');
          if (!item.itemName && item.itemRemarks) {
            displayName = htmlEscape(item.itemRemarks);
          }

          const displayQty = item.itemQty !== '' ? item.itemQty : '';
          const displayUnit = htmlEscape(item.itemUnit || '');
          const displayPrice = formatYen_(item.itemPrice);
          // 各内容の個別金額：デザインBはitemIndividualAmount、デザインAはitemAmountに各内容自身の金額が入る
          const displayAmount = formatYen_(item.itemIndividualAmount ?? item.itemAmount);

          detailRows += `
            <tr>
              <td style="border: 1px solid #ddd; padding: 4px;"></td>
              <td style="border: 1px solid #ddd; padding: 4px;">${displayName}</td>
              <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayQty}</td>
              <td style="border: 1px solid #ddd; padding: 4px;">${displayUnit}</td>
              <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayPrice}</td>
              <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayAmount}</td>
              <td style="border: 1px solid #ddd; padding: 4px; font-size: 11px; color: #666; font-weight: bold;"></td>
            </tr>
          `;
        });
      });

      const previewHtml = `
        <div style="text-align: left; font-size: 12px; max-height: 500px; overflow-y: auto; background: white; padding: 16px; border-radius: 8px;">
          <h3 style="margin-bottom: 8px; border-bottom: 2px solid #1976D2; padding-bottom: 8px;">御見積書</h3>
          <p style="margin: 4px 0;"><strong>見積日:</strong> ${data.estimateDate}</p>
          <p style="margin: 4px 0;"><strong>取引先:</strong> ${htmlEscape(data.clientName)}</p>
          ${data.contactPerson ? `<p style="margin: 4px 0;"><strong>担当者:</strong> ${htmlEscape(data.contactPerson)}</p>` : ''}
          ${data.clientAddress ? `<p style="margin: 4px 0;"><strong>住所:</strong> ${htmlEscape(data.clientAddress)}</p>` : ''}
          <p style="margin: 4px 0;"><strong>件名:</strong> ${htmlEscape(data.subject)}</p>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
          <table style="width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px;">
            <tr style="background: #E3F2FD;">
              <th style="border: 1px solid #ddd; padding: 4px;">項目</th>
              <th style="border: 1px solid #ddd; padding: 4px;">品名</th>
              <th style="border: 1px solid #ddd; padding: 4px; text-align: right;">数量</th>
              <th style="border: 1px solid #ddd; padding: 4px;">単位</th>
              <th style="border: 1px solid #ddd; padding: 4px; text-align: right;">単価</th>
              <th style="border: 1px solid #ddd; padding: 4px; text-align: right;">金額</th>
              <th style="border: 1px solid #ddd; padding: 4px;">備考</th>
            </tr>
            ${detailRows}
          </table>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #ddd;">
          <div style="text-align: right; margin: 8px 0;">
            <p style="margin: 4px 0;">小計: ¥${data.subtotal.toLocaleString()}</p>
            <p style="margin: 4px 0;">消費税(10%): ¥${data.tax.toLocaleString()}</p>
            <p style="font-weight: 600; font-size: 13px; margin: 4px 0;">合計: ¥${data.total.toLocaleString()}</p>
          </div>
          ${data.remarks ? `<p style="margin: 8px 0;"><strong>備考:</strong> ${htmlEscape(data.remarks).replace(/\n/g, '<br>')}</p>` : ''}
        </div>
      `;

      Swal.fire({
        title: '見積書 簡易プレビュー',
        html: previewHtml,
        showCancelButton: true,
        confirmButtonText: '確定して保存',
        cancelButtonText: 'キャンセル',
        confirmButtonColor: '#1976D2',
        width: '95%'
      }).then((result) => {
        if (result.isConfirmed) {
          executeSaveProcess('saveEstimate');
        }
      });
    }

    // =====================================
    // 【共通】見積・下書きデータ送信関数
    // ・下書き保存（saveDraft）：従来通り、1回のリクエストで完結
    // ・確定保存（saveEstimate）：✅ 変更：以下の順序で実行する
    //     1. 採番＋メイン行保存（軽量・高速。失敗時は自動で1回リトライ）
    //     2. PDF生成（失敗時は自動で1回リトライ）
    //     3. PDF完成後、すぐ完了画面を表示
    //     4. 完了画面表示と並行して、明細行の保存を背景で実行（失敗時は自動で1回リトライ、
    //        それでも失敗した場合はエラーが確定した時点で、画面にかかわらず割り込みで通知する）
    //   こうすることで、時間のかかる明細行の書き込みを待たずにPDFを先に見せられる。
    //   採番の安全性は、メイン行が先に（同期で）書き込まれることで確保している。
    // =====================================
    async function executeSaveProcess(actionType) {
      const userName = getCurrentUserName();
      if (!userName) {
        Swal.fire({ icon: 'error', title: '認証エラー', text: 'ログイン情報が確認できません。再度ログインしてください。', confirmButtonText: '了解' });
        return;
      }
      
      const isDesignB = currentDesignType === 'B';
      const data = isDesignB ? getFormDataB() : getFormData();
      
      if (!isDesignB) {
        // ★ここで画面のカンマ付き文字列を数値に変換し、dataオブジェクトに覚えさせる（これで他と統一できます）
        data.subtotal = parseFloat(document.getElementById('subtotalLabel').textContent.replace(/,/g, '')) || 0;
        data.tax = parseFloat(document.getElementById('taxLabel').textContent.replace(/,/g, '')) || 0;
      }
      // デザインBの場合、getFormDataB() が subtotal/tax/total を計算済みのため変換不要
      
      if (!data.clientName) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '取引先を選択してください。', confirmButtonText: '了解' });
        return;
      }
      if (data.details.length === 0) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '明細を1件以上入力してください。', confirmButtonText: '了解' });
        return;
      }
      
      const isDraft = actionType === 'saveDraft';
      const loaderMsg = isDraft ? '下書きを保存中...' : '見積番号を発行中...';
      const successTitle = isDraft ? '下書き保存完了！' : '見積書データ保存完了！';
      
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = loaderMsg;

      // GASへ送る共通のペイロード（見積番号(estimateNo)は呼び出し側で追加する）
      const buildPayload = (extra = {}) => ({
        clientName: data.clientName,
        contactPerson: data.contactPerson,
        clientAddress: data.clientAddress,
        estimateDate: data.estimateDate,
        subject: data.subject,
        paymentTerms: data.paymentTerms,
        validity: data.validity,
        remarks: data.remarks,
        subtotal: data.subtotal,
        tax: data.tax,
        totalAmount: data.total, // 税込合計
        details: data.details,
        currentUserName: userName,
        designType: currentDesignType,
        estimator: data.estimator || '',
        deptNo: data.deptNo || '',
        layout: data.layout || '',
        ...extra
      });

      try {
        // ========== 下書き保存：従来通り1回のリクエストで完結 ==========
        if (isDraft) {
          // ✅ 変更：編集元が下書き（DRAFT_EDIT）であれば、元の下書きIDを一緒に送信し、
          //   サーバー側で新規採番せず上書き更新してもらう（重複下書きの発生を防止）
          const isEditingExistingDraft = currentMode === 'DRAFT_EDIT' && currentOriginId.startsWith('DRAFT-');
          const draftPayload = buildPayload(isEditingExistingDraft ? { originDraftId: currentOriginId } : {});

          const draftResult = await fetchWithRetry_({ action: actionType, payload: draftPayload });
          const generatedId = draftResult?.draftId;
          if (!generatedId) throw new Error('No ID returned from server');

          // ✅ 注：currentMode/currentOriginIdはここではリセットしない。
          //   リセットしてしまうと、同じ編集セッション中に2回目の下書き保存をした際に
          //   「編集元なし＝新規」と判定され、別の下書きが重複作成されてしまうため。
          //   これらは新規作成開始時（initializeEstimateForm等）や、確定保存後の
          //   下書き削除処理（handlePostSaveAction）でリセットされる。

          document.getElementById('loader').style.display = 'none';
          Swal.fire({
            icon: 'success',
            title: successTitle,
            html: `下書きID: <strong>${generatedId}</strong>`,
            confirmButtonText: '閉じる'
          });

          resetAllForms_();
          showMenuScreen();
          return;
        }

        // ========== 確定保存 1. 採番＋メイン行保存 ==========
        const mainResult = await fetchWithRetry_({ action: 'saveEstimateMainOnly', payload: buildPayload() });
        const generatedId = mainResult?.estimateNo;
        if (!generatedId) throw new Error('No estimate number returned from server');

        // 確定保存が成功したので、下書きから編集していた場合は元の下書きを削除する
        handlePostSaveAction(actionType);

        // ========== 確定保存 2. PDF生成 ==========
        document.getElementById('loaderText').innerHTML = 
          `見積番号発行完了（${generatedId}）<br><span style="color: #cff5ff; font-weight: bold;">続けて見積書PDFを生成しています... (約5～10秒)</span>`;

        const pdfPayload = buildPayload({ estimateNo: generatedId });
        const pdfResultData = await fetchWithRetry_({ action: 'savePdfToDriveBackground', payload: pdfPayload }, 60000);

        if (!pdfResultData?.pdfUrl) {
          throw new Error('PDF URL missing in response');
        }
        const pdfUrl = pdfResultData.pdfUrl;

        // ========== 確定保存 3. PDF完成後、すぐ完了画面を表示 ==========
        document.getElementById('loader').style.display = 'none';

        await Swal.fire({
          icon: 'success',
          title: successTitle,
          html: `
            見積番号: <strong>${generatedId}</strong><br><br>
            <p style="margin-bottom: 20px; color: var(--text-secondary);">見積書PDFが正常に保存されました。</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${pdfUrl}" target="_blank" style="
                display: inline-flex;
                align-items: center;
                gap: 8px;
                text-decoration: none;
                background-color: var(--primary);
                color: white;
                padding: 14px 28px;
                border-radius: var(--radius);
                font-weight: bold;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              ">
                <span class="material-symbols-outlined">open_in_new</span>
                作成した見積書PDFを開く
              </a>
            </div>
          `,
          confirmButtonText: '閉じる',
          confirmButtonColor: '#666',
          allowOutsideClick: false
        });
        
        resetAllForms_();
        showMenuScreen();

        // ========== 確定保存 4. 明細行の保存を背景で実行（完了画面は待たない） ==========
        // ⚠️ 完了画面より後ろで await せずに呼ぶことで、ユーザーの画面遷移をブロックしない。
        //   失敗（自動リトライ後も失敗）した場合のみ、エラーが確定した時点で
        //   その時どの画面にいても割り込みでアラートを表示する。
        fetchWithRetry_({
          action: 'saveEstimateDetailsBackground',
          payload: buildPayload({ estimateNo: generatedId })
        }).catch(bgError => {
          console.error('❌ 明細データの背景保存に失敗:', bgError);
          Swal.fire({
            icon: 'error',
            title: '明細データの保存に失敗しました',
            html: `見積番号 <strong>${generatedId}</strong> の明細データ保存でエラーが発生しました。<br><br>
                   <code style="font-size:11px;">${htmlEscape(bgError.message)}</code><br><br>
                   お手数ですが、担当者にご連絡いただくか、後ほど再度ご確認ください。`,
            confirmButtonText: '了解'
          });
        });
        
      } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('❌ Error in executeSaveProcess:', error);
        Swal.fire({
          icon: 'error',
          title: 'エラーが発生しました',
          html: `<strong>${error.name}</strong><br><br><code style="font-size:11px; text-align:left;">${error.message}</code>`,
          confirmButtonText: '了解'
        });
      }
    }
