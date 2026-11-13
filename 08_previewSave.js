/**
 * 08_previewSave.js
 * プレビュー表示・下書き保存・確定保存＆PDF生成のリクエスト処理。
 * デザインA・デザインBどちらのフォームからも共通で使われる。
 */

    // =====================================
    // 必須項目（見積作成日・取引先・件名）の入力チェック（共通）
    // ✅ 新設：デザインA・B両方、プレビュー／確定保存／下書き保存の
    //   すべてでチェックする。不足があればアラートを出しfalseを返す。
    // =====================================
    function validateEstimateFormData_(data) {
      if (!data.estimateDate) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '見積作成日を入力してください。', confirmButtonText: '了解' });
        return false;
      }
      if (!data.caseNos || data.caseNos.length === 0) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '案件を選択してください。案件がない場合は「紐付け案件無し」を選択してください。', confirmButtonText: '了解' });
        return false;
      }
      if (!data.clientName) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '取引先を選択してください。', confirmButtonText: '了解' });
        return false;
      }
      if (!data.subject) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '件名を入力してください。', confirmButtonText: '了解' });
        return false;
      }
      if (data.details.length === 0) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: '明細を1件以上入力してください。', confirmButtonText: '了解' });
        return false;
      }
      // デザインAのみ：親項目の未選択・上限超過を、画面のカードを直接見てチェックする
      if (currentDesignType === 'A' && !validateDetailCardsA_()) {
        return false;
      }
      return true;
    }

    function showPDFPreview() {
      const data = currentDesignType === 'B' ? getFormDataB() : getFormData();
      
      if (!validateEstimateFormData_(data)) return;
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
          if (item.isCategoryOnly) return; // 金額のみの項目は項目行だけ表示する

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
    // ・確定保存（saveEstimate）：以下の順序で実行する
    //     1. 採番＋メイン行保存（軽量・高速。失敗時は自動で1回リトライ）
    //     2. PDF生成（失敗時は、同じ見積番号でやり直すか中止するかを選べる）
    //     3. PDF完成後、すぐ完了画面を表示
    //     4. 完了画面表示と並行して、残りの工程（明細保存・マスタ自動登録・元の下書きの削除・
    //        案件フォルダへの保存）を背景で実行する
    //   こうすることで、時間のかかる明細行の書き込みを待たずにPDFを先に見せられる。
    //   採番の安全性は、メイン行が先に（同期で）書き込まれることで確保している。
    //
    // ✅ 変更：見積番号の発行後は、残りの工程を端末に「保存ジョブ」として記録する（13_saveJob.js）。
    //   他のアプリへ切り替えたり、画面をロックしたり、アプリが終了したりして工程が止まっても、
    //   アプリに戻ったときに、残りの工程が自動で再開される。
    //   ・工程の実行は runSaveJobSteps_（13_saveJob.js）に一本化し、本流と再開で同じ処理を使う
    //   ・見積番号の発行後は、入力途中の自動保存（12_autosave.js）を削除する
    //     （以後は、保存ジョブが記録を持つため。二重に保存し直して別の見積番号が発行されるのを防ぐ）
    // =====================================
    async function executeSaveProcess(actionType) {
      const userName = getCurrentUserName();
      if (!userName) {
        Swal.fire({ icon: 'error', title: '認証エラー', text: 'ログイン情報が確認できません。再度ログインしてください。', confirmButtonText: '了解' });
        return;
      }
      
      const isDesignB = currentDesignType === 'B';
      const data = isDesignB ? getFormDataB() : getFormData();
      
      // 小計・消費税・合計は、getFormData() / getFormDataB() がすでに計算済みの値を返すため、
      // ここで画面の表示から読み直す必要はない（以前はデザインAだけ二重に読み取っていた）
      
      if (!validateEstimateFormData_(data)) return;
      
      const isDraft = actionType === 'saveDraft';
      const loaderMsg = isDraft ? '下書きを保存中...' : '見積番号を発行中...';
      const successTitle = isDraft ? '下書き保存完了！' : '見積書データ保存完了！';
      
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = loaderMsg;

      // 下書きから編集していた場合の「元の下書きID」。
      //   下書きの削除は、確定保存（明細まで）が成功した後に行う。
      //   画面の状態（currentMode等）が変わる前のここで控えておく。
      const originDraftIdToDelete = (currentMode === 'DRAFT_EDIT' && currentOriginId.startsWith('DRAFT-')) ? currentOriginId : '';

      // 見積番号を発行済みかどうか（途中で失敗したとき、エラーメッセージで案内するために使う）
      let issuedEstimateNo = '';
      // PDFの工程を終えたか。終えるまでに失敗・中止した場合は、保存ジョブを破棄して入力画面に戻す
      let pdfStepFinished = false;

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
        designType: currentDesignType, // ユーザー名は、サーバーがログイントークンから確定する
        estimator: data.estimator || '',
        deptNo: data.deptNo || '',
        layout: data.layout || '',
        caseNos: data.caseNos || [],
        ...extra
      });

      try {
        // ========== 下書き保存：従来通り1回のリクエストで完結 ==========
        if (isDraft) {
          // 編集元が下書き（DRAFT_EDIT）であれば、元の下書きIDを一緒に送信し、
          //   サーバー側で新規採番せず上書き更新してもらう（重複下書きの発生を防止）
          const draftPayload = buildPayload(originDraftIdToDelete ? { originDraftId: originDraftIdToDelete } : {});

          const draftResult = await fetchWithRetry_({ action: actionType, payload: draftPayload });
          const generatedId = draftResult?.draftId;
          if (!generatedId) throw new Error('No ID returned from server');

          // ✅ 注：currentMode/currentOriginIdはここではリセットしない。
          //   リセットしてしまうと、同じ編集セッション中に2回目の下書き保存をした際に
          //   「編集元なし＝新規」と判定され、別の下書きが重複作成されてしまうため。
          //   これらは新規作成開始時（initializeEstimateForm等）や、確定保存の完了後
          //   （resetEditOriginState_）でリセットされる。

          document.getElementById('loader').style.display = 'none';
          Swal.fire({
            icon: 'success',
            title: successTitle,
            html: `下書きID: <strong>${generatedId}</strong>`,
            confirmButtonText: '閉じる'
          });

          clearAutosave_(); // 下書きとして保存できたので、入力途中の自動保存は不要
          resetAllForms_();
          showMenuScreen();
          return;
        }

        // ========== 確定保存 1. 採番＋メイン行保存 ==========
        const mainResult = await fetchWithRetry_({ action: 'saveEstimateMainOnly', payload: buildPayload() });
        const generatedId = mainResult?.estimateNo;
        if (!generatedId) throw new Error('No estimate number returned from server');
        issuedEstimateNo = generatedId;

        // 見積番号を発行できた時点で、残りの工程を端末に「保存ジョブ」として記録する。
        //   記録できた場合のみ、入力途中の自動保存を削除する（記録できなければ、入力内容を残しておく）
        const saveJob = {
          estimateNo: generatedId,
          userName: userName,
          step: 'pdf',
          stepStartedAt: Date.now(),
          createdAt: Date.now(),
          payload: buildPayload(),      // 見積番号以外の送信内容（再開時に見積番号を足して送る）
          caseNos: data.caseNos || [],
          originDraftId: originDraftIdToDelete,
          pdfUrl: ''
        };
        activeSaveJobIds_.add(generatedId); // この画面が実行中のため、再開処理が重ねて動かないようにする
        if (await createSaveJob_(saveJob)) clearAutosave_();

        // ✅ 元の下書きの削除は、ここでは行わない。
        //   以前はここで削除していたため、この後のPDF生成や明細保存に失敗すると、
        //   下書きだけが先に消えてしまっていた。明細保存の成功後（保存ジョブの 'details' 工程）に削除する。

        // ========== 確定保存 2. PDF生成 ==========
        document.getElementById('loaderText').innerHTML = 
          `見積番号発行完了（${generatedId}）<br><span style="color: #cff5ff; font-weight: bold;">続けて見積書PDFを生成しています... (約5～10秒)</span>`;

        // PDF生成に失敗した場合、同じ見積番号のままPDFだけを作り直せるようにする。
        //   （そのまま再保存すると別の見積番号が発行され、番号だけが残ってしまうため）
        //   ・採番とメイン行の保存は済んでいるので、やり直すのはPDF生成だけ
        //   ・「中止」を選ぶと、下の catch で「未完了である旨」を案内して終了する
        const pdfPayload = buildPayload({ estimateNo: generatedId });
        let pdfUrl = '';
        while (!pdfUrl) {
          try {
            // 再開側が「PDF作成中かどうか」を判断するための目印（最後にPDF作成を始めた時刻）
            await updateSaveJob_(generatedId, { stepStartedAt: Date.now() });

            const pdfResultData = await fetchWithRetry_({ action: 'savePdfToDriveBackground', payload: pdfPayload }, 60000);
            if (!pdfResultData?.pdfUrl) {
              throw new Error('PDF URL missing in response');
            }
            pdfUrl = pdfResultData.pdfUrl;
          } catch (pdfError) {
            console.error('❌ PDF生成に失敗:', pdfError);
            document.getElementById('loader').style.display = 'none';

            const retryAnswer = await Swal.fire({
              icon: 'error',
              title: 'PDFの作成に失敗しました',
              html: `見積番号 <strong>${htmlEscape(generatedId)}</strong> は発行済みです。<br>同じ見積番号でPDFだけ作り直しますか？<br><br><code style="font-size:11px;">${htmlEscape(pdfError.message)}</code>`,
              showCancelButton: true,
              confirmButtonText: 'もう一度PDFを作成',
              cancelButtonText: '中止',
              allowOutsideClick: false
            });

            if (!retryAnswer.isConfirmed) {
              throw pdfError; // 中止 → 外側の catch で、未完了の案内を表示する
            }

            document.getElementById('loader').style.display = 'flex';
            document.getElementById('loaderText').innerHTML =
              `見積番号 ${htmlEscape(generatedId)} のPDFを作り直しています... (約5～10秒)`;
          }
        }
        pdfStepFinished = true;
        await updateSaveJob_(generatedId, { step: 'details', pdfUrl: pdfUrl, stepStartedAt: Date.now() });

        // ========== 確定保存 3. 残りの工程を、背景で起動する（ここでは待たない） ==========
        // 明細保存・マスタ自動登録・元の下書きの削除・案件フォルダへの保存を、保存ジョブとして順に実行する。
        //   完了画面を出す「前」に起動することで、画面操作に関係なく保存が進む。
        //   途中で止まっても、ジョブは端末に残り、アプリに戻ったときに続きから自動で再開される。
        const backgroundJobPromise = runSaveJobSteps_({ ...saveJob, step: 'details', pdfUrl: pdfUrl })
          .finally(() => activeSaveJobIds_.delete(generatedId));

        // ========== 確定保存 4. PDF完成後、すぐ完了画面を表示 ==========
        document.getElementById('loader').style.display = 'none';

        const successDialogPromise = Swal.fire({
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

        // 背景工程の結果は、完了画面（PDFリンク）が閉じられてから通知する（PDF自体は保存済み）
        backgroundJobPromise.then(async result => {
          // 案件フォルダ側の一部失敗（案件ごとの警告）
          if (!result.warnings || result.warnings.length === 0) return;
          await successDialogPromise;
          Swal.fire({
            icon: 'warning',
            title: '案件フォルダへの保存が一部できませんでした',
            html: `見積書PDF自体は保存されています。<br>案件フォルダへのショートカットが作成できなかった案件があります。<br><br>
                   <code style="font-size:11px; text-align:left; display:block;">${result.warnings.map(w => htmlEscape(w)).join('<br>')}</code><br>
                   お手数ですが、担当者にご連絡ください。`,
            confirmButtonText: '了解'
          });
        }).catch(async backgroundError => {
          console.error('❌ 背景工程（明細・案件フォルダ）の保存に失敗:', backgroundError);
          // ログイン期限切れは、ログイン画面の案内が出ており、再ログイン後に自動で再開される
          if (backgroundError.code === 'AUTH_EXPIRED') return;

          await successDialogPromise;
          const isFolderStep = backgroundError.saveJobStep === 'folder';
          Swal.fire({
            icon: 'warning',
            title: isFolderStep ? '案件フォルダへの保存が未完了です' : '明細データの保存が未完了です',
            html: `見積番号 <strong>${htmlEscape(generatedId)}</strong> は発行済みで、見積書PDFは保存されています。<br>
                   通信状況が回復したときや、アプリを開き直したときに、残りの保存を自動で続けます。<br><br>
                   <code style="font-size:11px;">${htmlEscape(backgroundError.message)}</code>`,
            confirmButtonText: '了解'
          });
        });

        await successDialogPromise;

        // 確定保存が完了したので、編集元の状態を新規に戻して画面を初期化する
        resetEditOriginState_();
        resetAllForms_();
        showMenuScreen();
        
      } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('❌ Error in executeSaveProcess:', error);

        // PDFの工程を終える前に失敗・中止した場合は、保存ジョブを破棄する（番号の扱いは下の案内のとおり）。
        //   見積番号の発行時に消した自動保存は、画面に残っている入力内容から保存し直す
        if (issuedEstimateNo && !pdfStepFinished) {
          abandonSaveJob_(issuedEstimateNo);
          scheduleAutosave_();
        }

        // 見積番号を発行した後に失敗した場合は、番号だけが残っていることを案内する
        // （入力内容と下書きは残っているが、再度保存すると別の見積番号が発行されるため）
        const issuedNote = issuedEstimateNo
          ? `<br><br>※ 見積番号 <strong>${htmlEscape(issuedEstimateNo)}</strong> は発行済みですが、PDFの作成が完了していません。この番号の登録は未完了のまま残るため、管理者に連絡して削除を依頼してください。入力内容はこの画面に残っているので、保存し直すこともできます（その場合は別の見積番号が発行されます）。`
          : '';

        Swal.fire({
          icon: 'error',
          title: 'エラーが発生しました',
          html: `<strong>${htmlEscape(error.name)}</strong><br><br><code style="font-size:11px; text-align:left;">${htmlEscape(error.message)}</code>${issuedNote}`,
          confirmButtonText: '閉じる'
        });
      }
    }
