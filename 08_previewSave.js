/**
 * 08_previewSave.js
 * プレビュー（PDF作成）・確定保存・下書き保存のリクエスト処理。
 * デザインA・デザインBどちらのフォームからも共通で使われる。
 *
 * 【確定保存までの流れ】
 *   1. 「プレビュー」を押す   … 見積番号を仮発行し、PDFを作って画面に表示する（showPDFPreview）
 *   2. 「戻って修正」         … 入力画面に戻る。再度プレビューすると、同じ番号でPDFを作り直す
 *   3. 「確定して保存」       … 明細保存 → 案件フォルダへのショートカット作成を、保存ジョブとして実行する
 *                               （executeConfirmSave_ ／ ジョブの工程は 13_saveJob.js）
 *   確定されなかった仮発行は、メニューに戻る・ログアウト・下書き保存・次回起動時に取り消す。
 *   サーバー側でも、24時間たつと自動削除される（14_pdfPreview.js ／ サーバーの 12_プレビュー仮発行.js）
 */

    // =====================================
    // 必須項目（見積作成日・取引先・件名）の入力チェック（共通）
    // ✅ 新設：デザインA・B両方、プレビュー／下書き保存の
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

    // =====================================
    // サーバーへ送る共通の内容（プレビュー・下書き保存・確定後の明細保存で共用）
    // ・見積番号など、呼び出し側で足したい項目は extra で渡す
    // ・ユーザー名は、サーバーがログイントークンから確定する
    // =====================================
    function buildEstimatePayload_(data, extra = {}) {
      return {
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
        designType: currentDesignType,
        estimator: data.estimator || '',
        deptNo: data.deptNo || '',
        layout: data.layout || '',
        caseNos: data.caseNos || [],
        ...extra
      };
    }

    // =====================================
    // 「プレビュー」ボタン：見積番号を仮発行し、PDFを作って画面に表示する
    // ・確認画面で「確定して保存」を選ぶと、そのまま確定処理（executeConfirmSave_）へ進む
    // ・「戻って修正」を選ぶと、番号は保持したまま入力画面に戻る（次のプレビューで同じ番号を使う）
    // =====================================
    async function showPDFPreview() {
      if (!getCurrentUserName()) {
        Swal.fire({ icon: 'error', title: '認証エラー', text: 'ログイン情報が確認できません。再度ログインしてください。', confirmButtonText: '了解' });
        return;
      }

      const data = currentDesignType === 'B' ? getFormDataB() : getFormData();
      if (!validateEstimateFormData_(data)) return;

      const loader = document.getElementById('loader');
      loader.style.display = 'flex';
      document.getElementById('loaderText').innerHTML = '見積書PDFを作成しています...<br>（約10秒）';

      let preview;
      try {
        preview = await fetchWithRetry_({
          action: 'previewEstimatePdf',
          payload: buildEstimatePayload_(data, { estimateNo: heldPreviewEstimateNo_ }) // 空なら新規に仮発行される
        }, 90000);
      } catch (error) {
        loader.style.display = 'none';
        console.error('❌ プレビューの作成に失敗:', error);

        // サーバー側で仮発行が取り消されている場合があるため、手元の番号は使い続けない
        // （まだ残っていれば、ここで取り消す。すでに無くても問題ない）
        const staleEstimateNo = heldPreviewEstimateNo_;
        heldPreviewEstimateNo_ = '';
        if (staleEstimateNo) cancelPendingPreview_(staleEstimateNo);

        if (error.code === 'AUTH_EXPIRED') return; // ログイン画面の案内がすでに出ている
        Swal.fire({
          icon: 'error',
          title: 'プレビューを作成できませんでした',
          html: `<code style="font-size:11px; text-align:left;">${htmlEscape(error.message)}</code><br><br>見積番号は、確定するまで保存されません。もう一度お試しください。`,
          confirmButtonText: '閉じる'
        });
        return;
      }

      // 仮発行した番号を、画面と端末に控える（確定されずに終わったときの取り消し用）
      heldPreviewEstimateNo_ = preview.estimateNo;
      await rememberPendingPreview_(preview.estimateNo);
      loader.style.display = 'none';
      prewarmPdfTemplate_(currentDesignType, true); // 確認画面を見ている間に、再プレビュー用のコピーを用意しておく

      const choice = await showPdfPreviewModal_(preview.pdfBase64, preview.estimateNo);
      preview.pdfBase64 = null; // 大きいデータなので、使い終わったら手放す
      if (choice !== 'confirm') return; // 「戻って修正」：番号は保持したまま、入力画面に戻る

      await executeConfirmSave_(data, preview);
    }

    // =====================================
    // 「確定して保存」：確認済みのPDFをそのまま使い、明細保存 → 案件フォルダへのショートカット作成を行う
    // ・見積番号の発行とPDF作成は、プレビューで済んでいる
    // ・残りの工程は、端末に「保存ジョブ」として記録してから実行する（13_saveJob.js）。
    //   他のアプリへ切り替えたり、アプリが終了したりして止まっても、アプリに戻ったときに自動で再開される
    // ・確認したPDFと保存される内容が食い違わないよう、プレビュー時点の入力内容（data）をそのまま使う
    // =====================================
    async function executeConfirmSave_(data, preview) {
      const estimateNo = preview.estimateNo;
      const loader = document.getElementById('loader');
      loader.style.display = 'flex';
      document.getElementById('loaderText').textContent = '保存しています...';

      try {
        // 下書きから編集していた場合の「元の下書きID」。確定保存（明細まで）が成功した後に削除する
        const originDraftId = (currentMode === 'DRAFT_EDIT' && currentOriginId.startsWith('DRAFT-')) ? currentOriginId : '';

        const saveJob = {
          estimateNo: estimateNo,
          userName: getCurrentUserName(),
          step: 'details',              // PDFは作成済みのため、明細保存から始める
          stepStartedAt: Date.now(),
          createdAt: Date.now(),
          payload: buildEstimatePayload_(data), // 見積番号以外の送信内容（実行時に見積番号を足して送る）
          caseNos: data.caseNos || [],
          originDraftId: originDraftId,
          pdfUrl: preview.pdfUrl
        };
        activeSaveJobIds_.add(estimateNo); // この画面が実行中のため、再開処理が重ねて動かないようにする

        // 記録できた場合のみ、入力途中の自動保存を削除する（記録できなければ、入力内容を残しておく）
        if (await createSaveJob_(saveJob)) clearAutosave_();

        // 仮発行の番号は、保存ジョブに引き継いだ。以後は取り消しの対象にしない
        heldPreviewEstimateNo_ = '';
        await forgetPendingPreview_();

        // 残りの工程を、背景で起動する（ここでは待たない）
        const backgroundJobPromise = runSaveJobSteps_({ ...saveJob })
          .finally(() => activeSaveJobIds_.delete(estimateNo));

        // PDFは作成済みのため、すぐ完了画面を表示する
        loader.style.display = 'none';
        const successDialogPromise = Swal.fire({
          icon: 'success',
          title: '見積書データ保存完了！',
          html: `
            見積番号: <strong>${htmlEscape(estimateNo)}</strong><br><br>
            <p style="margin-bottom: 20px; color: var(--text-secondary);">見積書PDFが正常に保存されました。</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${htmlEscape(preview.pdfUrl)}" target="_blank" rel="noopener" style="
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
            html: `見積番号 <strong>${htmlEscape(estimateNo)}</strong> は発行済みで、見積書PDFは保存されています。<br>
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
        loader.style.display = 'none';
        console.error('❌ Error in executeConfirmSave_:', error);
        Swal.fire({
          icon: 'error',
          title: 'エラーが発生しました',
          html: `<strong>${htmlEscape(error.name)}</strong><br><br><code style="font-size:11px; text-align:left;">${htmlEscape(error.message)}</code>`,
          confirmButtonText: '閉じる'
        });
      }
    }

    // =====================================
    // 「下書き保存」：1回のリクエストで完結する
    // ・編集元が下書き（DRAFT_EDIT）であれば、元の下書きIDを一緒に送信し、
    //   サーバー側で新規採番せず上書き更新してもらう（重複下書きの発生を防止）
    // ・プレビューで仮発行していた見積番号は、不要になるため取り消す
    // =====================================
    async function saveDraftProcess() {
      if (!getCurrentUserName()) {
        Swal.fire({ icon: 'error', title: '認証エラー', text: 'ログイン情報が確認できません。再度ログインしてください。', confirmButtonText: '了解' });
        return;
      }

      const data = currentDesignType === 'B' ? getFormDataB() : getFormData();
      if (!validateEstimateFormData_(data)) return;

      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = '下書きを保存中...';

      const originDraftId = (currentMode === 'DRAFT_EDIT' && currentOriginId.startsWith('DRAFT-')) ? currentOriginId : '';

      try {
        const draftResult = await fetchWithRetry_({
          action: 'saveDraft',
          payload: buildEstimatePayload_(data, originDraftId ? { originDraftId: originDraftId } : {})
        });
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
          title: '下書き保存完了！',
          html: `下書きID: <strong>${htmlEscape(generatedId)}</strong>`,
          confirmButtonText: '閉じる'
        });

        cancelPendingPreview_(); // プレビューで仮発行した見積番号があれば取り消す（待たない）
        clearAutosave_();        // 下書きとして保存できたので、入力途中の自動保存は不要
        resetAllForms_();
        showMenuScreen();

      } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('❌ Error in saveDraftProcess:', error);
        Swal.fire({
          icon: 'error',
          title: 'エラーが発生しました',
          html: `<strong>${htmlEscape(error.name)}</strong><br><br><code style="font-size:11px; text-align:left;">${htmlEscape(error.message)}</code>`,
          confirmButtonText: '閉じる'
        });
      }
    }
