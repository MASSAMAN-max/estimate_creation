/**
 * 13_saveJob.js
 * 確定保存（見積番号の発行後）の「未完了ジョブ」を端末に記録し、
 * アプリに戻ったときに、残りの工程を自動で再開する。
 *
 * 【なぜ必要か】
 * 確定保存は、見積番号の発行 → PDF作成 → 明細保存 → 案件フォルダ保存、と数十秒かかる。
 * その間に他のアプリへ切り替えたり、画面をロックしたりすると通信が止まり、
 * アプリが終了すると、残りの工程が実行されないまま見積番号だけが残ってしまう。
 *
 * 【ジョブの工程（step）】
 *   'pdf'     … PDF作成（再開時：サーバーにPDFのURLが記録済みなら、作り直さない）
 *   'details' … 明細保存＋マスタ自動登録＋元の下書きの削除
 *   'folder'  … 案件フォルダへのショートカット作成（「紐付け案件無し」だけなら何もしない）
 *   すべて終わったらジョブを削除する
 *
 * 【再開の対象外】
 * ・見積番号の発行そのもの（再送すると二重発行になるため）。
 *   発行の応答が届く前に終了した場合は、ジョブが作られない（入力内容は 12_autosave.js が残している）
 *
 * 【再開のきっかけ】起動時／再ログイン後／画面に戻ったとき／通信が復旧したとき
 *
 * 依存：12_autosave.js（IndexedDB）、06_utils.js、02_auth.js、05_masterData.js
 */

    // PDF作成中に中断された場合、サーバー側の処理がまだ続いている可能性があるため、
    // 最後の試行からこの時間が過ぎるまで待ってから、PDFの有無を確認する
    const SAVE_JOB_PDF_WAIT_MS_ = 90 * 1000;

    // 現在、この画面（確定保存の本流）が実行中のジョブ。再開の処理が二重に動かないようにする
    const activeSaveJobIds_ = new Set();
    let isResumingSaveJobs_ = false;

    // =====================================
    // ジョブの保存・更新・削除・一覧（失敗しても、保存処理自体は止めない）
    // =====================================
    function getSaveJobKey_(estimateNo) {
      return `job:${estimateNo}`;
    }

    // 戻り値：記録できたか
    async function createSaveJob_(job) {
      try {
        await runIdbOperation_(SAVE_JOB_STORE_, 'put', getSaveJobKey_(job.estimateNo), job);
        return true;
      } catch (error) {
        console.error('保存ジョブの記録に失敗しました:', error);
        return false;
      }
    }

    // ジョブの一部の項目だけを更新する（ジョブが記録されていなければ何もしない）
    async function updateSaveJob_(estimateNo, patch) {
      try {
        const key = getSaveJobKey_(estimateNo);
        const current = await runIdbOperation_(SAVE_JOB_STORE_, 'get', key);
        if (!current) return;
        await runIdbOperation_(SAVE_JOB_STORE_, 'put', key, { ...current, ...patch });
      } catch (error) {
        console.error('保存ジョブの更新に失敗しました:', error);
      }
    }

    async function deleteSaveJob_(estimateNo) {
      try {
        await runIdbOperation_(SAVE_JOB_STORE_, 'delete', getSaveJobKey_(estimateNo));
      } catch (error) {
        console.error('保存ジョブの削除に失敗しました:', error);
      }
    }

    // 本人（ログイン中のユーザー）のジョブだけを、古い順に返す
    async function listSaveJobs_() {
      const userName = getCurrentUserName();
      const allJobs = await runIdbOperation_(SAVE_JOB_STORE_, 'getAll');
      return allJobs
        .filter(job => job.userName === userName)
        .sort((a, b) => a.createdAt - b.createdAt);
    }

    // PDF作成を中止したときなど、ジョブを破棄する（確定保存の本流から呼ぶ）
    function abandonSaveJob_(estimateNo) {
      activeSaveJobIds_.delete(estimateNo);
      return deleteSaveJob_(estimateNo);
    }

    // =====================================
    // 工程の実行（確定保存の本流と、再開の両方がこの関数を使う）
    // ・job.step の工程から最後まで実行する。工程が終わるたびにジョブの記録を進める
    // ・失敗したら、失敗した工程名を error.saveJobStep に付けて投げる（ジョブは残る）
    // 戻り値：{ pdfUrl, warnings }
    // =====================================
    async function runSaveJobSteps_(job) {
      const estimateNo = job.estimateNo;
      const result = { pdfUrl: job.pdfUrl || '', warnings: [] };

      // 次の工程へ進め、端末の記録にも反映する
      const advance = async (nextStep, patch = {}) => {
        const progress = { ...patch, step: nextStep, stepStartedAt: Date.now() };
        job = { ...job, ...progress };
        await updateSaveJob_(estimateNo, progress);
      };

      try {
        // ---- PDF作成（再開時のみ。本流は、画面の案内付きで別に実行済み） ----
        if (job.step === 'pdf') {
          result.pdfUrl = await ensureJobPdf_(job);
          await advance('details', { pdfUrl: result.pdfUrl });
        }

        // ---- 明細保存＋マスタ自動登録、元の下書きの削除 ----
        if (job.step === 'details') {
          await fetchWithRetry_({
            action: 'saveEstimateDetailsBackground',
            payload: { ...job.payload, estimateNo: estimateNo }
          });

          // 新しい取引先・項目がマスターへ自動追加されている可能性があるため、取り直しておく
          invalidateMasterListsCache_();
          preloadMasterLists_();

          // 明細まで保存できたので、ここで初めて元の下書きを削除する（失敗しても確定保存は成功済み）
          if (job.originDraftId) {
            await fetchWithRetry_({ action: 'deleteDraft', payload: { draftId: job.originDraftId } })
              .catch(error => console.error('下書き削除リクエスト失敗:', error));
          }
          await advance('folder');
        }

        // ---- 案件フォルダへのショートカット作成 ----
        if (job.step === 'folder') {
          const needsCaseFolder = (job.caseNos || []).some(caseNo => caseNo !== CASE_NONE);
          if (needsCaseFolder) {
            // サーバー側は作成済みの案件をスキップするため、再実行しても二重にならない
            const folderResult = await fetchWithRetry_(
              { action: 'saveCaseFolderShortcutsBackground', payload: { estimateNo: estimateNo, caseNos: job.caseNos } },
              120000
            );
            result.warnings = (folderResult && folderResult.warnings) || [];
          }
          await deleteSaveJob_(estimateNo); // すべての工程が終わった
        }
      } catch (error) {
        error.saveJobStep = job.step;
        throw error;
      }

      return result;
    }

    // 再開時のPDF工程：サーバーにPDFのURLが記録済みならそれを使い、無ければ作成する
    async function ensureJobPdf_(job) {
      // 中断した時点でサーバーがまだPDFを作成中の可能性があるため、少し待ってから確認する
      const waitMs = job.stepStartedAt + SAVE_JOB_PDF_WAIT_MS_ - Date.now();
      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));

      const saved = await fetchWithRetry_({ action: 'loadFormData', payload: { targetId: job.estimateNo } });
      if (saved && saved.main && saved.main.fileUrl) return saved.main.fileUrl;

      const pdfResult = await fetchWithRetry_(
        { action: 'savePdfToDriveBackground', payload: { ...job.payload, estimateNo: job.estimateNo } },
        60000
      );
      if (!pdfResult || !pdfResult.pdfUrl) throw new Error('PDF URL missing in response');
      return pdfResult.pdfUrl;
    }

    // =====================================
    // 未完了ジョブの自動再開
    // ・ログイン中で、他のダイアログが開いておらず、本流が実行中でないジョブだけを対象にする
    // ・ログイン期限切れ（AUTH_EXPIRED）の場合は、ログイン画面の案内に任せて中止する。
    //   ジョブは残るので、再ログイン後に再開される
    // =====================================
    async function resumePendingSaveJobs_() {
      if (isResumingSaveJobs_) return;
      if (!getCurrentUserName() || !getAuthToken_()) return;
      if (Swal.isVisible()) return; // 表示中のダイアログ（SweetAlert2は同時に1つだけ）を押し流さない

      isResumingSaveJobs_ = true;
      try {
        const jobs = (await listSaveJobs_()).filter(job => !activeSaveJobIds_.has(job.estimateNo));
        if (jobs.length === 0) return;

        Swal.fire({
          title: '未完了の保存を再開しています',
          html: `見積番号：${jobs.map(job => htmlEscape(job.estimateNo)).join('、')}<br>しばらくお待ちください。`,
          allowOutsideClick: false,
          showConfirmButton: false,
          didOpen: () => Swal.showLoading()
        });

        const results = [];
        for (const job of jobs) {
          activeSaveJobIds_.add(job.estimateNo);
          try {
            const runResult = await runSaveJobSteps_(job);
            results.push({ job: job, ok: true, pdfUrl: runResult.pdfUrl, warnings: runResult.warnings });
          } catch (error) {
            console.error(`保存の再開に失敗しました（${job.estimateNo}）:`, error);
            if (error.code === 'AUTH_EXPIRED') return;
            results.push({ job: job, ok: false, error: error });
          } finally {
            activeSaveJobIds_.delete(job.estimateNo);
          }
        }

        showResumeResult_(results);
      } catch (error) {
        console.error('保存の再開処理でエラーが発生しました:', error);
        if (Swal.isVisible()) Swal.close();
      } finally {
        isResumingSaveJobs_ = false;
      }
    }

    // 再開の結果を1つのダイアログで知らせる
    function showResumeResult_(results) {
      const doneList = results.filter(r => r.ok);
      const failedList = results.filter(r => !r.ok);
      const hasWarning = doneList.some(r => r.warnings.length > 0);

      let html = '';
      doneList.forEach(r => {
        html += `<p>見積番号 <strong>${htmlEscape(r.job.estimateNo)}</strong> の保存を完了しました。`;
        if (r.pdfUrl) html += `<br><a href="${htmlEscape(r.pdfUrl)}" target="_blank" rel="noopener">見積書PDFを開く</a>`;
        if (r.warnings.length > 0) {
          html += `<br><span style="font-size:12px;">案件フォルダへの保存が一部できませんでした。担当者にご連絡ください。<br>${r.warnings.map(w => htmlEscape(w)).join('<br>')}</span>`;
        }
        html += '</p>';
      });
      failedList.forEach(r => {
        html += `<p>見積番号 <strong>${htmlEscape(r.job.estimateNo)}</strong> は、まだ完了できていません。通信状況が回復したときや、アプリを開き直したときに、自動で続きを実行します。<br>` +
                `<code style="font-size:11px;">${htmlEscape(r.error.message)}</code></p>`;
      });

      Swal.fire({
        icon: (failedList.length > 0 || hasWarning) ? 'warning' : 'success',
        title: failedList.length > 0 ? '保存の再開（一部未完了）' : '未完了だった保存を完了しました',
        html: html,
        confirmButtonText: '了解'
      });
    }

    // =====================================
    // 起動時・再ログイン後の復旧処理
    // ・先に、未完了の保存を再開し、その後に、入力途中のデータの復元を確認する
    //   （確認ダイアログが同時に重ならないよう、順番に行う）
    // =====================================
    async function runStartupRecovery_() {
      await resumePendingSaveJobs_();
      await offerAutosaveRestore_();
    }

    // 画面に戻ったとき・通信が復旧したときに、未完了の保存を再開する
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumePendingSaveJobs_();
    });
    window.addEventListener('online', () => { resumePendingSaveJobs_(); });
