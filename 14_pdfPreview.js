/**
 * 14_pdfPreview.js
 * 「プレビュー」で作ったPDFの表示と、仮発行した見積番号の取り消しを担当する。
 *
 * 【PDFの表示】
 * ・Android の Chrome は、PDFを画面内に埋め込んで表示できないため、PDF.js（index.html で読み込む）で
 *   1ページずつ canvas に描画する。PDFはDriveへのリンクではなく、サーバーから受け取った中身を直接表示する
 * ・PDF.js が読み込めない・描画に失敗した場合は、「PDFを別タブで開く」リンクを出す（確定は、そのまま押せる）
 *
 * 【仮発行した見積番号の扱い】
 * ・プレビューを押すと、サーバーで見積番号が仮発行される。確定されなければ取り消す
 * ・手元の番号は heldPreviewEstimateNo_ に持つ。再プレビュー時は、この番号を送って同じ番号でPDFを作り直す
 * ・アプリが強制終了しても取り消せるよう、番号を端末（IndexedDB）にも控える。次回起動時に取り消す
 *   （12_autosave.js の forms ストアの、別のキー。入力途中の自動保存とは別の記録）
 * ・取り消しは、メニューに戻る／ログアウト／下書き保存／次回起動時に行う。それでも残った場合は、
 *   サーバーが24時間後に自動削除する
 *
 * 依存：12_autosave.js（IndexedDB）、13_saveJob.js（保存ジョブの有無の確認）、06_utils.js、02_auth.js
 */

    // PDF.js の読み込み元。index.html で読み込むバージョンと、必ず同じにすること
    const PDF_JS_WORKER_URL_ = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // 現在の入力内容で、仮発行している見積番号（なければ空文字）
    let heldPreviewEstimateNo_ = '';

    // =====================================
    // テンプレートのコピーの事前作成を、サーバーへ依頼する（待たない。失敗しても何も起きない）
    // ・プレビューは、事前に作ったコピーがあれば速い（サーバーの 13_テンプレート事前コピー.js）
    // ・作成画面を開いたとき（03_navigation.js）と、プレビューを表示したとき（再プレビュー用）に呼ぶ
    // ・短時間に何度も呼ばないよう、同じデザインへの依頼は PREWARM_MIN_INTERVAL_MS_ の間隔をあける
    //   （force を指定した場合を除く。サーバー側でも、十分な数があれば何もしない）
    // =====================================
    const PREWARM_MIN_INTERVAL_MS_ = 60 * 1000;
    const lastPrewarmAt_ = { A: 0, B: 0 };

    function prewarmPdfTemplate_(designType, force = false) {
      const design = designType === 'B' ? 'B' : 'A';
      if (!force && Date.now() - lastPrewarmAt_[design] < PREWARM_MIN_INTERVAL_MS_) return;
      lastPrewarmAt_[design] = Date.now();

      fetchWithRetry_({ action: 'prepareTemplateCopy', payload: { designType: design } }, 60000)
        .catch(error => console.warn('テンプレートの事前コピーの依頼に失敗しました（プレビューは、その場でコピーを作るため問題ありません）:', error.message));
    }

    // =====================================
    // 仮発行した見積番号の記録（端末）と、取り消し
    // =====================================
    function getPendingPreviewKey_() {
      const userName = getCurrentUserName();
      return userName ? `pendingPreview:${userName}` : null;
    }

    // 仮発行した番号を、端末に控える（失敗してもプレビューは続ける）
    async function rememberPendingPreview_(estimateNo) {
      const key = getPendingPreviewKey_();
      if (!key) return;
      try {
        await runAutosaveOperation_('put', key, { estimateNo: estimateNo, savedAt: Date.now() });
      } catch (error) {
        console.error('仮発行の記録に失敗しました:', error);
      }
    }

    // 端末の記録を消す
    // ※ キーは同期的に確定する（呼び出し直後にログイン情報が消えても、正しいキーを消せるように）
    function forgetPendingPreview_() {
      const key = getPendingPreviewKey_();
      if (!key) return Promise.resolve();
      return runAutosaveOperation_('delete', key)
        .catch(error => console.error('仮発行の記録の削除に失敗しました:', error));
    }

    // 仮発行した見積番号を、サーバーで取り消す（失敗しても処理は止めない）
    // ・省略すると、いま手元にある番号を取り消す。番号がなければ何もしない
    // ・取り消せなかった場合は、端末の記録を残す（次回起動時にやり直す）。サーバーでも24時間後に自動削除される
    // ・ログアウト直前に呼んでも、サーバーへの送信の時点でトークンが付くため問題ない
    async function cancelPendingPreview_(estimateNo = heldPreviewEstimateNo_) {
      if (!estimateNo) return;
      if (heldPreviewEstimateNo_ === estimateNo) heldPreviewEstimateNo_ = '';

      const key = getPendingPreviewKey_();
      try {
        await fetchWithRetry_({ action: 'cancelPendingEstimate', payload: { estimateNo: estimateNo } });
        if (key) await runAutosaveOperation_('delete', key);
      } catch (error) {
        console.error(`仮発行の取り消しに失敗しました（${estimateNo}）:`, error);
      }
    }

    // 起動時・再ログイン後：確定されずに残った仮発行を取り消す（13_saveJob.js の runStartupRecovery_ から呼ぶ）
    async function cleanupPendingPreviewOnStartup_() {
      const key = getPendingPreviewKey_();
      if (!key || isPdfPreviewModalOpen_()) return; // 確認画面を開いている間は、触らない

      let record;
      try {
        record = await runAutosaveOperation_('get', key);
      } catch (error) {
        console.error('仮発行の記録の読み込みに失敗しました:', error);
        return;
      }
      if (!record || !record.estimateNo) return;

      // すでに確定処理に進んでいる（保存ジョブがある）番号は、取り消さない
      try {
        const job = await runIdbOperation_(SAVE_JOB_STORE_, 'get', getSaveJobKey_(record.estimateNo));
        if (job) {
          await runAutosaveOperation_('delete', key);
          return;
        }
      } catch (error) {
        console.error('保存ジョブの確認に失敗しました:', error);
        return;
      }

      await cancelPendingPreview_(record.estimateNo);
    }

    // =====================================
    // PDFの確認画面（index.html の #pdfPreviewModal）
    // =====================================
    let closePdfPreviewHandler_ = null; // 開いている確認画面を、外から閉じるための関数

    function isPdfPreviewModalOpen_() {
      return document.getElementById('pdfPreviewModal').style.display === 'flex';
    }

    // ログイン期限切れなどで、確認画面を閉じる（待っている呼び出し元には「戻って修正」として返す）
    function closePdfPreviewModal_() {
      if (closePdfPreviewHandler_) closePdfPreviewHandler_('back');
    }

    function base64ToUint8Array_(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    // PDFの全ページを、canvas に描画して container へ並べる
    // ・拡大して見ても文字が読めるよう、表示サイズの2〜3倍の解像度で描画する（表示サイズはCSSで幅に合わせる）
    async function renderPdfPages_(bytes, container) {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js が読み込まれていません。');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL_;

      // getDocument にデータを渡すと、渡した配列は使えなくなるため、複製を渡す（別タブで開くときに元の配列を使う）
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const displayWidth = Math.min(container.clientWidth, 900);
      const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const baseWidth = page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: (displayWidth / baseWidth) * outputScale });

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-preview-page';
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        container.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
      }
    }

    // 戻り値：'confirm'（確定して保存）／ 'back'（戻って修正）
    function showPdfPreviewModal_(pdfBase64, estimateNo) {
      return new Promise(resolve => {
        const modal = document.getElementById('pdfPreviewModal');
        const pages = document.getElementById('pdfPreviewPages');
        const backButton = document.getElementById('pdfPreviewBackBtn');
        const confirmButton = document.getElementById('pdfPreviewConfirmBtn');
        let fallbackUrl = '';

        document.getElementById('pdfPreviewEstimateNo').textContent = `（見積番号 ${estimateNo}）`;
        pages.innerHTML = '';
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // 後ろの画面がスクロールしないようにする

        const finish = (choice) => {
          closePdfPreviewHandler_ = null;
          backButton.onclick = null;
          confirmButton.onclick = null;
          modal.style.display = 'none';
          document.body.style.overflow = '';
          pages.innerHTML = '';
          if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
          resolve(choice);
        };
        closePdfPreviewHandler_ = finish;
        backButton.onclick = () => finish('back');
        confirmButton.onclick = () => finish('confirm');

        // PDFを描画する。できなかった場合は、別タブで開くリンクを出す
        const bytes = base64ToUint8Array_(pdfBase64);
        renderPdfPages_(bytes, pages).catch(error => {
          console.error('PDFの画面表示に失敗しました:', error);
          if (!isPdfPreviewModalOpen_()) return; // すでに閉じている
          fallbackUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          pages.innerHTML = `
            <div class="pdf-preview-fallback">
              PDFを画面内に表示できませんでした。<br>
              下のボタンで内容を確認してから、「確定して保存」を押してください。<br><br>
              <a href="${fallbackUrl}" target="_blank" rel="noopener" class="btn btn-secondary">PDFを別タブで開く</a>
            </div>`;
        });
      });
    }
