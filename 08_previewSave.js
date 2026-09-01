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
      
      data.details.forEach((item, itemIndex) => {
        // カテゴリ（新しいグループ）が変わったら空行を挿入
        if (itemIndex > 0 && item.itemCategory) {
          detailRows += `
            <tr style="height: 6px;">
              <td colspan="7" style="border: none; padding: 0;"></td>
            </tr>
          `;
        }
        
        const displayCategory = item.itemCategory ? htmlEscape(item.itemCategory) : '';
        
        // 品名または備考の表示
        let displayName = htmlEscape(item.itemName || '');
        if (!item.itemName && item.itemRemarks) {
          displayName = htmlEscape(item.itemRemarks);
        }
        
        const displayQty = item.itemQty !== "" ? item.itemQty : '';
        const displayUnit = htmlEscape(item.itemUnit || '');
        
        //  単位が「式」であっても関係なく、データにある数値をそのまま100%出力する
        const displayPrice = item.itemPrice !== "" ? ('¥' + Number(item.itemPrice).toLocaleString()) : '';
        const displayAmount = item.itemAmount !== "" ? ('¥' + Number(item.itemAmount).toLocaleString()) : '';
        
        // データ側で1箇所だけに絞り込まれたフラグをそのまま判定に使用
        let displayRemarks = item.isSubtotal ? '小計' : '';
        
        detailRows += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 4px;">${displayCategory}</td>
            <td style="border: 1px solid #ddd; padding: 4px;">${displayName}</td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayQty}</td>
            <td style="border: 1px solid #ddd; padding: 4px;">${displayUnit}</td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayPrice}</td>
            <td style="border: 1px solid #ddd; padding: 4px; text-align: right;">${displayAmount}</td>
            <td style="border: 1px solid #ddd; padding: 4px; font-size: 11px; color: #666; font-weight: bold;">${displayRemarks}</td>
          </tr>
        `;
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
      const loaderMsg = isDraft ? '下書きを保存中...' : '見積書を確定保存中...';
      const successTitle = isDraft ? '下書き保存完了！' : '見積書データ保存完了！';
      
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = loaderMsg;
      
      try {
        // ========== 1回目: データ保存 ==========
        const response = await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: actionType,
            payload: {
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
              layout: data.layout || ''
            }
          })
        });
        
        // HTTP ステータスチェック
        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.status !== 'success') {
          throw new Error(result.message || 'Save failed with unknown error');
        }
        
        const generatedId = isDraft ? result.data?.draftId : result.data?.estimateNo;
        if (!generatedId) {
          throw new Error('No ID returned from server');
        }
     
        // 下書きの場合は終了
        if (isDraft) {
          document.getElementById('loader').style.display = 'none';
          Swal.fire({
            icon: 'success',
            title: successTitle,
            html: `下書きID: <strong>${generatedId}</strong>`,
            confirmButtonText: '閉じる'
          });

          if (isDesignB) {
            resetFormB_();
          } else {
            document.getElementById('estimateForm').reset();
            document.getElementById('detailsContainer').innerHTML = '';
          }
          showMenuScreen();
          return;
        }
        // 確定保存が成功したので、下書きから編集していた場合は元の下書きを削除する
        handlePostSaveAction(actionType);
     
        // ========== 2回目: PDF生成（見積の場合のみ） ==========
        document.getElementById('loaderText').innerHTML = 
          `データ処理完了（${generatedId}）<br><span style="color: #cff5ff; font-weight: bold;">続けて見積書PDFを生成しています... (約5～10秒)</span>`;
        
        // タイムアウト処理（60秒で打ち切り）
        // ⚠️修正：以前は setTimeout 内で throw していたため、
        //   呼び出し元の try/catch に届かず「Uncaught Error」がコンソールに出るだけで
        //   実際には fetch も中断されていなかった。
        //   AbortController を使い、実際に fetch を中断してエラーを正しく catch できるようにする。
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 60000);
        
        let pdfResponse;
        try {
          pdfResponse = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            signal: abortController.signal,
            body: JSON.stringify({
              action: 'savePdfToDriveBackground',
              payload: {
                estimateNo: generatedId,
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
                totalAmount: data.total,
                details: data.details,
                currentUserName: userName,
                designType: currentDesignType,
                estimator: data.estimator || '',
                deptNo: data.deptNo || '',
                layout: data.layout || ''
              }
            })
          });
        } catch (fetchError) {
          if (fetchError.name === 'AbortError') {
            throw new Error('PDF生成が60秒以内に完了しませんでした（タイムアウト）。データ量が多い場合は時間がかかることがあります。しばらくしてから「見積書を確認」メニューでPDFが作成されているかご確認ください。');
          }
          throw fetchError;
        } finally {
          clearTimeout(timeoutId);
        }
        
        // HTTP ステータスチェック
        if (!pdfResponse.ok) {
          throw new Error(`PDF API HTTP Error: ${pdfResponse.status} ${pdfResponse.statusText}`);
        }
        
        // JSONパース
        let pdfResult;
        try {
          pdfResult = await pdfResponse.json();
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          const responseText = await pdfResponse.text();
          console.error('Response text:', responseText);
          throw new Error(`PDF response was not valid JSON: ${parseError.message}`);
        }
        
        // レスポンス構造チェック
        if (pdfResult.status !== 'success') {
          throw new Error(`PDF generation failed: ${pdfResult.message || 'Unknown error'}`);
        }
        
        if (!pdfResult.data?.pdfUrl) {
          throw new Error('PDF URL missing in response');
        }
        
        const pdfUrl = pdfResult.data.pdfUrl;
        
        // ローダーを非表示
        document.getElementById('loader').style.display = 'none';
        
        // ========== 確認ダイアログの表示（URLリンクボタン化） ==========
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
        
        // フォーム初期化
        if (isDesignB) {
          resetFormB_();
        } else {
          document.getElementById('estimateForm').reset();
          document.getElementById('detailsContainer').innerHTML = '';
        }
        showMenuScreen();
        
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
