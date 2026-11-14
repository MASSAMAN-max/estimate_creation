/**
 * 12_autosave.js
 * 入力途中の見積データ（デザインA・B共通）を、IndexedDBへ自動保存・復元する。
 *
 * 【目的】
 * ・アプリが再読み込み・強制終了されても、入力内容を失わない
 * ・「終了直前のイベント」だけに頼らず、入力中から継続的に保存する
 *
 * 【仕組み】
 * ・入力・変更を検知 → 1秒後に保存（デバウンス）。画面が隠れた時・閉じる時は即保存
 * ・保存先は、ログインユーザー名ごとに1件（キー：form:ユーザー名）
 * ・次回のメニュー表示時に「続きから再開しますか？」と確認し、復元する
 * ・削除するのは、保存成功・メニューへ戻る（破棄）・ログアウトのときだけ
 *
 * 【既存コードとの関係】
 * ・既存の関数は書き換えない。変更の検知はイベントとMutationObserverで行う
 * ・値の取得・復元は既存関数を再利用する
 *     共通情報：getSharedInfoValues_ / reflectSharedInfoFields_（11_sharedInfo.js）
 *     デザインA：addTableRow / populateDetailCardWithGroup（07_designA-form.js）
 *     デザインB：appStateB / renderB（09_designB-form.js）
 *
 * 【制限】
 * ・保存に失敗しても、アプリの動作は止めない（ログのみ）
 * ・案件No・取引先は、復元時にマスターから選択肢を読み直して反映する
 */

    const AUTOSAVE_DB_NAME_ = 'estimateAutosave';
    const AUTOSAVE_STORE_ = 'forms';     // 入力途中のフォーム（このファイルが使う）
    const SAVE_JOB_STORE_ = 'saveJobs';  // 確定保存の未完了ジョブ（13_saveJob.js が使う）
    const AUTOSAVE_DEBOUNCE_MS_ = 1000;

    let autosaveDbPromise_ = null;
    let autosaveTimer_ = null;          // 保存待ちのタイマー（null＝保存待ちなし）
    let isRestoringAutosave_ = false;   // 復元中は、保存を行わない

    // =====================================
    // IndexedDBの基本操作（読み書きはすべてこの関数を通す）
    // =====================================
    function openAutosaveDb_() {
      if (!autosaveDbPromise_) {
        autosaveDbPromise_ = new Promise((resolve, reject) => {
          // ver1：forms を作成 ／ ver2：saveJobs を追加（既存の forms のデータはそのまま残る）
          const request = indexedDB.open(AUTOSAVE_DB_NAME_, 2);
          request.onupgradeneeded = () => {
            [AUTOSAVE_STORE_, SAVE_JOB_STORE_].forEach(storeName => {
              if (!request.result.objectStoreNames.contains(storeName)) {
                request.result.createObjectStore(storeName);
              }
            });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        // 開けなかった場合は、次回また開き直せるようにする
        autosaveDbPromise_.catch(() => { autosaveDbPromise_ = null; });
      }
      return autosaveDbPromise_;
    }

    // operation：'get' | 'getAll' | 'put' | 'delete'
    // ・storeName でストアを指定する（入力途中のフォームと、保存ジョブで共用）
    async function runIdbOperation_(storeName, operation, key, value) {
      const db = await openAutosaveDb_();
      return new Promise((resolve, reject) => {
        const isReadOnly = operation === 'get' || operation === 'getAll';
        const transaction = db.transaction(storeName, isReadOnly ? 'readonly' : 'readwrite');
        const store = transaction.objectStore(storeName);
        let request;
        if (operation === 'put') request = store.put(value, key);
        else if (operation === 'delete') request = store.delete(key);
        else if (operation === 'getAll') request = store.getAll();
        else request = store.get(key);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
    }

    // 入力途中のフォーム用（従来の呼び出しをそのまま使えるようにした入口）
    function runAutosaveOperation_(operation, key, value) {
      return runIdbOperation_(AUTOSAVE_STORE_, operation, key, value);
    }

    // 保存キー。ログインユーザーごとに分ける（ログインしていなければ null）
    function getAutosaveKey_() {
      const userName = getCurrentUserName();
      return userName ? `form:${userName}` : null;
    }

    // =====================================
    // 保存するタイミングの制御
    // =====================================
    function scheduleAutosave_() {
      if (isRestoringAutosave_) return;
      clearTimeout(autosaveTimer_);
      autosaveTimer_ = setTimeout(saveAutosaveNow_, AUTOSAVE_DEBOUNCE_MS_);
    }

    // 保存待ちがあれば、待たずに今すぐ保存する（画面が隠れる時・閉じる時・ログイン期限切れの時）
    function flushAutosave_() {
      if (autosaveTimer_ === null) return;
      clearTimeout(autosaveTimer_);
      saveAutosaveNow_();
    }

    // 自動保存を削除する。保存待ちも取り消す（保存成功・破棄・ログアウト時に呼ぶ）
    // ※ キーは同期的に確定する（呼び出し直後にログイン情報が消えても、正しいキーを消せるように）
    function clearAutosave_() {
      clearTimeout(autosaveTimer_);
      autosaveTimer_ = null;
      const key = getAutosaveKey_();
      if (!key) return;
      runAutosaveOperation_('delete', key).catch(error => console.error('自動保存の削除に失敗しました:', error));
    }

    // 作成画面（デザインA・B）が表示されているか。メニュー・ログイン画面では保存しない
    function isFormScreenVisible_() {
      const formId = currentDesignType === 'B' ? 'mainAppB' : 'mainApp';
      return document.getElementById(formId).style.display === 'block';
    }

    async function saveAutosaveNow_() {
      autosaveTimer_ = null;
      if (isRestoringAutosave_ || !isFormScreenVisible_()) return;
      const key = getAutosaveKey_();
      if (!key) return;

      try {
        const record = collectAutosaveRecord_();
        if (hasMeaningfulContent_(record)) {
          await runAutosaveOperation_('put', key, record);
        } else {
          // 何も入力されていない状態は、復元の確認を出さないよう、保存データを消す
          await runAutosaveOperation_('delete', key);
        }
      } catch (error) {
        console.error('自動保存に失敗しました:', error);
      }
    }

    // =====================================
    // 画面の入力内容を、保存用のデータにまとめる
    // =====================================
    function collectAutosaveRecord_() {
      const isDesignB = currentDesignType === 'B';
      const record = {
        savedAt: Date.now(),
        designType: isDesignB ? 'B' : 'A',
        mode: currentMode,            // 'NEW' / 'DRAFT_EDIT' / 'COPY_CREATE'
        originId: currentOriginId,    // 下書き編集のとき、上書き先の下書きIDを引き継ぐため
        shared: getSharedInfoValues_()
      };

      if (isDesignB) {
        record.stateB = captureStateB_();
        record.globalRemark = document.getElementById('globalRemark').value;
      } else {
        record.details = captureDetailsA_();
        record.remarks = document.getElementById('remarks').value;
      }
      return record;
    }

    // デザインA：親項目カードごとに、内訳行の配列にする
    // （形は populateDetailCardWithGroup が受け取る形式に合わせている）
    function captureDetailsA_() {
      return Array.from(document.querySelectorAll('#detailsContainer .detail-card')).map(card => {
        const categorySelect = card.querySelector('.item-category-select');
        let category = categorySelect.value;
        if (category === '__NEW__') {
          category = card.querySelector('.item-category-input').value.trim();
        }

        return Array.from(card.querySelectorAll('.breakdown-row')).map((row, index) => {
          const qty = roundQtyA_(row.querySelector('.item-qty').value) || 1;
          const price = Number(row.querySelector('.item-price').value) || 0;
          return {
            itemCategory: index === 0 ? category : '',
            itemName: row.querySelector('.item-name').value,
            itemQty: qty,
            itemUnit: row.querySelector('.item-unit').value,
            itemPrice: price,
            itemAmount: calcAmountA_(qty, price),
            itemRemarksList: Array.from(row.querySelectorAll('.remark-input')).map(input => input.value)
          };
        });
      });
    }

    // デザインB：内部状態（appStateB）の複製を取り、入力欄に打ち込み中の値を上乗せする
    // ・Bの入力欄は、欄を離れた時（change）に初めて内部状態へ反映される。
    //   入力途中で終了しても失わないよう、画面の入力欄の値を読み取って補う
    // ・内部状態そのものは書き換えない（複製に上乗せする）
    function captureStateB_() {
      const state = JSON.parse(JSON.stringify(appStateB));

      document.querySelectorAll('#categoryContainer .category-card').forEach((cardEl, catIdx) => {
        const catState = state[catIdx];
        if (!catState) return;

        const countInput = cardEl.querySelector('.category-count-input');
        if (countInput) {
          catState.categoryCount = countInput.value !== '' ? Number(countInput.value) : null;
        }

        cardEl.querySelectorAll('.active-item-card').forEach(itemEl => {
          const item = catState.items.find(i => i.id === itemEl.dataset.id);
          if (!item) return;

          const nameInput = itemEl.querySelector('.item-name-input');
          if (nameInput && nameInput.value.trim() !== '') item.names = [nameInput.value.trim()];

          const qtyInput = itemEl.querySelector('.qty-input');
          if (qtyInput) item.qty = Math.max(1, Math.floor(Number(qtyInput.value)) || 1);

          const amountInput = itemEl.querySelector('.amount-input');
          if (amountInput) item.amount = amountInput.value !== '' ? Number(amountInput.value) : '';

          const remarkInput = itemEl.querySelector('.remark-input');
          if (remarkInput) {
            item.remark = remarkInput.value;
            item.showRemark = true;
          }
        });
      });
      return state;
    }

    // 保存する価値のある入力があるか（日付・初期値だけの状態は、復元の確認を出さない）
    function hasMeaningfulContent_(record) {
      const shared = record.shared;
      if (shared.clientName || shared.subject || shared.clientAddress ||
          shared.deptNo || shared.layout || shared.caseNos.length > 0) {
        return true;
      }

      if (record.designType === 'B') {
        if (record.globalRemark.trim() !== '') return true;
        return Object.values(record.stateB).some(cat =>
          cat.items.length > 0 || (cat.manualTotal !== null && cat.manualTotal !== '') || cat.categoryCount);
      }

      if (record.remarks.trim() !== '') return true;
      return record.details.some(group => group.some(item =>
        item.itemCategory || item.itemName.trim() !== '' || item.itemPrice > 0 ||
        item.itemRemarksList.some(remark => remark.trim() !== '')));
    }

    // =====================================
    // 復元
    // =====================================

    // メニュー表示後に呼ぶ。保存データがあれば、再開するか破棄するかを確認する
    async function offerAutosaveRestore_() {
      const key = getAutosaveKey_();
      if (!key) return;

      let record;
      try {
        record = await runAutosaveOperation_('get', key);
      } catch (error) {
        console.error('自動保存の読み込みに失敗しました:', error);
        return;
      }
      if (!record) return;

      const savedAtText = new Date(record.savedAt).toLocaleString('ja-JP');
      const summary = [record.shared.clientName, record.shared.subject].filter(Boolean).map(htmlEscape).join(' ／ ');

      const answer = await Swal.fire({
        icon: 'question',
        title: '入力途中のデータがあります',
        html: `最終保存：${htmlEscape(savedAtText)}<br>${summary || '（取引先・件名は未入力）'}<br><br>続きから再開しますか？`,
        showDenyButton: true,
        confirmButtonText: '続きから再開',
        denyButtonText: '破棄する',
        allowOutsideClick: false
      });

      if (answer.isConfirmed) {
        await restoreAutosave_(record);
      } else if (answer.isDenied) {
        const sure = await Swal.fire({
          icon: 'warning',
          title: '入力途中のデータを破棄しますか？',
          text: '破棄すると元に戻せません。',
          showCancelButton: true,
          confirmButtonText: '破棄する',
          cancelButtonText: 'キャンセル'
        });
        // キャンセルした場合は残しておく（次回また確認する）
        if (sure.isConfirmed) clearAutosave_();
      }
    }

    // 保存データを画面へ戻して、作成画面を開く
    async function restoreAutosave_(record) {
      isRestoringAutosave_ = true;
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loaderText').textContent = '入力内容を復元しています...';

      try {
        currentMode = record.mode;
        currentOriginId = record.originId || '';
        currentDesignType = record.designType === 'B' ? 'B' : 'A';

        resetAllForms_();           // 前回の表示や選択を残さない
        await loadMasterLists();    // 取引先・担当者・項目の選択肢が必要なため、復元の前に読み込む

        // 共通の基本情報カード（警告メッセージは、復元の確認ですでに伝えているため使わない）
        reflectSharedInfoFields_(record.shared, 'DRAFT_EDIT');
        document.getElementById('infoDate').value = record.shared.estimateDate; // 日付はそのまま戻す
        if (!record.shared.clientName) resetClientFieldsUi_();                    // 未入力なら「新規取引先」欄を出さない

        if (currentDesignType === 'B') {
          appStateB = record.stateB;
          document.getElementById('globalRemark').value = record.globalRemark || '';
          renderB();
        } else {
          restoreDetailsA_(record);
        }

        document.getElementById('loader').style.display = 'none';
        if (currentDesignType === 'B') showMainAppB(); else showMainApp();
      } catch (error) {
        document.getElementById('loader').style.display = 'none';
        console.error('入力内容の復元に失敗しました:', error);
        Swal.fire({
          icon: 'error',
          title: '復元に失敗しました',
          text: '保存データは残してあります。もう一度アプリを開き直してください。\n' + error.message,
          confirmButtonText: '了解'
        });
        showMenuScreen();
      } finally {
        isRestoringAutosave_ = false;
      }
    }

    // デザインAの明細・全体備考を戻す
    function restoreDetailsA_(record) {
      const container = document.getElementById('detailsContainer');
      document.getElementById('remarks').value = record.remarks || '';

      if (!record.details || record.details.length === 0) {
        addTableRow();
      } else {
        record.details.forEach(group => {
          addTableRow(group);

          // 親項目が未選択だったカードは、populateDetailCardWithGroup が「新規項目」欄を開くため、未選択に戻す
          if (!group[0].itemCategory) {
            const card = container.lastElementChild;
            card.querySelector('.item-category-select').value = '';
            card.querySelector('.dynamic-input-container').style.display = 'none';
            const input = card.querySelector('.item-category-input');
            input.value = '';
            input.required = false;
          }
        });
      }
      updateTotalSummary();
    }

    // =====================================
    // 初期化（ファイル読み込み時に1回だけ）
    // =====================================
    function initAutosave_() {
      // 入力・選択の変更（音声入力・案件選択部品の変更も、change として届く）
      document.addEventListener('input', scheduleAutosave_);
      document.addEventListener('change', scheduleAutosave_);

      // カード・内訳・備考行の追加／削除、デザインBのチップ操作は、入力イベントが出ないため、画面の構造の変化で検知する
      const observer = new MutationObserver(scheduleAutosave_);
      ['detailsContainer', 'categoryContainer'].forEach(id => {
        const target = document.getElementById(id);
        if (target) observer.observe(target, { childList: true, subtree: true });
      });

      // 画面が隠れた時・閉じる時は、待たずに保存する（保存待ちがある場合のみ）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushAutosave_();
      });
      window.addEventListener('pagehide', flushAutosave_);

      // ストレージ逼迫時に、ブラウザが自動削除しにくくなるよう要求する（許可されなくても動作に影響はない）
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    }

    initAutosave_();
