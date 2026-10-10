/**
 * 【このファイルの役割】
 * 取引先・担当者・項目・単位のマスターデータ取得と、
 * デザインA・デザインB共通の取引先／担当者プルダウンまわりの制御。
 * ✅ 変更：デザインBも取引先・担当者を選択式にしたため、要素IDを引数で受け取る
 *   共通関数に整理し、A・B両方から呼べるようにした。
 */

    // =====================================
    // マスターデータのキャッシュと先読み（速度改善）
    // ・フォームを開く・過去データを復元するたびにGASへ問い合わせていたため、毎回数秒待たされていた。
    //   取得結果を一定時間使い回すことで、2回目以降はほぼ待たずにフォームが開く
    // ・メニュー画面の表示時に先読みしておくと、1回目も「新規作成」を押す頃には取得が終わっている
    //   （取得中に押された場合は、その取得の完了を待つだけで、二重に問い合わせはしない）
    // ・保存後は、取引先・項目が自動でマスターへ追加されている可能性があるため、キャッシュを捨てて取り直す
    // ・シートのマスターを直接編集した場合は、最長 MASTER_CACHE_TTL_MS 後
    //   （または次の保存後・ページ再読み込み後）にフォームへ反映される
    // =====================================
    const MASTER_CACHE_TTL_MS = 5 * 60 * 1000; // キャッシュの有効時間（5分）
    let masterListsCache_ = null; // { fetchedAt: 取得開始時刻, promise: 取得結果のPromise }

    function fetchMasterListsCached_() {
      const now = Date.now();
      if (masterListsCache_ && (now - masterListsCache_.fetchedAt) < MASTER_CACHE_TTL_MS) {
        return masterListsCache_.promise;
      }

      const cacheEntry = { fetchedAt: now, promise: null };
      cacheEntry.promise = fetchWithRetry_({
        action: 'loadMasterLists',
        payload: {
          currentUserName: currentUser?.userName || '',
          userId: currentUser?.userId || ''
        }
      }).then(data => data || {}).catch(error => {
        // 失敗した結果は使い回さない（次に呼ばれたときに取り直す）
        if (masterListsCache_ === cacheEntry) masterListsCache_ = null;
        throw error;
      });
      masterListsCache_ = cacheEntry;
      return cacheEntry.promise;
    }

    // キャッシュを破棄する（保存後・ログイン／ログアウト時に使う）
    function invalidateMasterListsCache_() {
      masterListsCache_ = null;
    }

    // 画面に影響させず、裏でマスターを取得しておく（失敗しても何もしない。本番の取得時に改めてエラー表示される）
    function preloadMasterLists_() {
      fetchMasterListsCached_().catch(() => {});
    }

    async function loadMasterLists() {
      try {
        const masterData = await fetchMasterListsCached_();

        MASTER_CLIENTS = masterData.clients || [];
        MASTER_CONTACTPERSONS = masterData.contactPersons || {};  // 担当者マスター
        MASTER_CATEGORIES = masterData.categories || [];
        MASTER_UNITS = masterData.units || [];
        MASTER_ESTIMATORS = masterData.estimators || [];
      
        // 取引先プルダウンを構築（デザインA・デザインB共通の選択肢）
        buildClientOptions_('clientSelect');
        buildClientOptions_('infoClientSelect');
        buildEstimatorOptions_('infoEstimator');
      } catch (e) {
        console.error("マスタデータ取得失敗", e);
        Swal.fire({
          icon: 'warning',
          title: 'マスタデータの取得に失敗',
          text: '一部のマスタ情報が読み込めませんでした。',
          confirmButtonText: '了解'
        });
      } 
    }

    // ===== 取引先プルダウンの選択肢を構築する共通関数 =====
    function buildClientOptions_(selectId) {
      const clientSelect = document.getElementById(selectId);
      if (!clientSelect) return;
      clientSelect.innerHTML = '<option value="">-- 取引先を選択してください --</option>';
      MASTER_CLIENTS.forEach(client => {
        const option = document.createElement('option');
        option.value = client;
        option.textContent = client;
        clientSelect.appendChild(option);
      });
      clientSelect.innerHTML += '<option value="__NEW__">（新規取引先を入力する）</option>';
    }

    // ===== 見積担当（デザインB）のプルダウンの選択肢を構築する =====
    function buildEstimatorOptions_(selectId) {
      const select = document.getElementById(selectId);
      if (!select) return;
      select.innerHTML = '<option value="">-- 選択してください --</option>';
      MASTER_ESTIMATORS.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });
    }

    // ===== 見積担当の選択状態を復元する =====
    // ・一覧にある名前 → その担当者を選択
    // ・保存値が空 → 未選択
    // ・一覧にない名前 → 未選択に戻す
    // 戻り値：一覧になかった名前（呼び出し元で利用者への通知に使う）。問題なければ空文字
    function restoreEstimatorSelection_(selectId, estimatorName) {
      const select = document.getElementById(selectId);
      if (!select) return '';

      const name = (estimatorName || '').toString().trim();
      if (name === '') {
        select.value = '';
        return '';
      }

      const exists = Array.from(select.options).some(opt => opt.value === name);
      if (exists) {
        select.value = name;
        return '';
      }

      select.value = '';
      return name;
    }
    
    // ===== 取引先・担当者まわりの入力欄ID（デザインA/Bの対応表） =====
    // ・以前は各関数の冒頭で「idSuffix ? 'B用ID' : 'A用ID'」を何度も書いていたため、ここに集約した
    // ・IDを変更・追加するときはこの表だけを直せばよい
    // ・idSuffix：デザインAは ''、デザインBは 'B'
    const CLIENT_FIELD_IDS_ = {
      '': {
        select: 'clientSelect',            // 取引先プルダウン
        newContainer: 'newClientContainer', // 新規取引先の入力欄の枠
        input: 'clientName',               // 新規取引先名の入力欄
        contactSelect: 'contactPersonSelect',            // 担当者プルダウン
        newContactContainer: 'newContactPersonContainer', // 新規担当者の入力欄の枠
        contactInput: 'contactPersonName'                 // 新規担当者名の入力欄
      },
      'B': {
        select: 'infoClientSelect',
        newContainer: 'newClientContainerB',
        input: 'infoClient',
        contactSelect: 'infoClientContactSelect',
        newContactContainer: 'newContactPersonContainerB',
        contactInput: 'infoClientContact'
      }
    };
    function getClientFieldIds_(idSuffix) {
      return CLIENT_FIELD_IDS_[idSuffix ? 'B' : ''];
    }

    // ===== 取引先選択時のイベントハンドラ（共通実装） =====
    // idSuffix：デザインAは ''（clientSelect等）、デザインBは 'B'（infoClientSelect等）
    function toggleNewClient_(idSuffix) {
      const { select: selectId, newContainer: containerId, input: inputId,
              contactSelect: contactSelectId, newContactContainer: newContactContainerId } = getClientFieldIds_(idSuffix);

      const select = document.getElementById(selectId);
      const container = document.getElementById(containerId);
      const input = document.getElementById(inputId);
      const contactPersonSelect = document.getElementById(contactSelectId);
      const newContactPersonContainer = document.getElementById(newContactContainerId);
      
      if(select.value === '__NEW__') {
        container.style.display = 'block';
        input.required = true;
        input.focus();
        
        // 新規取引先の場合、担当者プルダウンをクリア
        contactPersonSelect.innerHTML = '<option value="">-- 新規取引先の担当者を選択/入力 --</option>';
        contactPersonSelect.innerHTML += '<option value="__NEW__">（新規担当者を入力する）</option>';
        newContactPersonContainer.style.display = 'none';
      } else {
        container.style.display = 'none';
        input.required = false;
        input.value = '';
        
        // 既存取引先を選択 → 該当する担当者をプルダウンに表示
        updateContactPersonList_(select.value, idSuffix);
      }
    }
    function toggleNewClient() { toggleNewClient_(''); }
    function toggleNewClientB() { toggleNewClient_('B'); }

    // ===== 取引先に紐付く担当者リストを更新する関数（共通実装） =====
    function updateContactPersonList_(selectedClient, idSuffix) {
      const { contactSelect: contactSelectId, newContactContainer: newContactContainerId,
              contactInput: contactInputId } = getClientFieldIds_(idSuffix);

      const contactPersonSelect = document.getElementById(contactSelectId);
      const newContactPersonContainer = document.getElementById(newContactContainerId);
      const contactPersonInput = document.getElementById(contactInputId);
      
      if (!selectedClient) {
        contactPersonSelect.innerHTML = '<option value="">-- 取引先を先に選択してください --</option>';
        newContactPersonContainer.style.display = 'none';
        return;
      }
      
      // マスターから該当する取引先の担当者一覧を取得
      const contactPersons = MASTER_CONTACTPERSONS[selectedClient] || [];
      
      contactPersonSelect.innerHTML = '<option value="">-- 担当者を選択してください --</option>';
      
      // 取引先に紐付く担当者を全て追加
      contactPersons.forEach(person => {
        const option = document.createElement('option');
        option.value = person;
        option.textContent = person;
        contactPersonSelect.appendChild(option);
      });
      
      // 「新規担当者を入力する」オプションを追加
      contactPersonSelect.innerHTML += '<option value="__NEW__">（新規担当者を入力する）</option>';
      
      // コンテナを非表示にして、入力欄をリセット
      newContactPersonContainer.style.display = 'none';
      contactPersonInput.required = false;
      contactPersonInput.value = '';
    }
     
    // ===== 担当者選択時のイベントハンドラ（共通実装） =====
    function toggleNewContactPerson_(idSuffix) {
      const { contactSelect: selectId, newContactContainer: containerId,
              contactInput: inputId } = getClientFieldIds_(idSuffix);

      const select = document.getElementById(selectId);
      const container = document.getElementById(containerId);
      const input = document.getElementById(inputId);
      
      if(select.value === '__NEW__') {
        container.style.display = 'block';
        input.required = true;
        input.focus();
      } else {
        container.style.display = 'none';
        input.required = false;
        input.value = '';
      }
    }
    function toggleNewContactPerson() { toggleNewContactPerson_(''); }
    function toggleNewContactPersonB() { toggleNewContactPerson_('B'); }

    // ===== 取引先・担当者の選択欄から、確定値（選択済み or 新規入力値）を取り出す共通関数 =====
    // idSuffix：デザインAは ''、デザインBは 'B'
    function getClientSelectionValues_(idSuffix) {
      const { select: selectId, input: inputId,
              contactSelect: contactSelectId, contactInput: contactInputId } = getClientFieldIds_(idSuffix);

      const clientSelect = document.getElementById(selectId);
      let finalClientName = clientSelect.value;
      if (finalClientName === '__NEW__') {
        finalClientName = document.getElementById(inputId).value.trim();
      }

      const contactPersonSelect = document.getElementById(contactSelectId);
      let finalContactPerson = contactPersonSelect.value;
      if (finalContactPerson === '__NEW__') {
        finalContactPerson = document.getElementById(contactInputId).value.trim();
      } else if (!finalContactPerson) {
        finalContactPerson = '';
      }

      return { clientName: finalClientName, contactPerson: finalContactPerson };
    }

    // ===== 取引先・担当者の選択状態を復元する共通関数 =====
    // idSuffix：デザインAは ''、デザインBは 'B'
    // マスタに存在する値なら選択式にセット、存在しなければ「新規」扱いで入力欄に反映する
    function restoreClientSelection_(clientName, contactPersonName, idSuffix) {
      const { select: selectId, newContainer: containerId, input: inputId,
              contactSelect: contactSelectId, newContactContainer: newContactContainerId,
              contactInput: contactInputId } = getClientFieldIds_(idSuffix);

      const clientSelect = document.getElementById(selectId);
      if (clientSelect) {
        const clientExists = Array.from(clientSelect.options).some(opt => opt.value === clientName);

        if (clientName && clientExists) {
          clientSelect.value = clientName;
        } else {
          clientSelect.value = '__NEW__';
          const clientNameInput = document.getElementById(inputId);
          if (clientNameInput) clientNameInput.value = clientName || '';
          const newClientContainer = document.getElementById(containerId);
          if (newClientContainer) newClientContainer.style.display = 'block';
        }
      }

      // 担当者リストを、選択（または新規入力）された取引先名で更新
      const contactPersonSelect = document.getElementById(contactSelectId);
      if (contactPersonSelect && clientName) {
        updateContactPersonList_(clientName, idSuffix);

        if (contactPersonName) {
          const personExists = Array.from(contactPersonSelect.options).some(opt => opt.value === contactPersonName);

          if (personExists) {
            contactPersonSelect.value = contactPersonName;
          } else {
            contactPersonSelect.value = '__NEW__';
            const contactPersonNameInput = document.getElementById(contactInputId);
            if (contactPersonNameInput) contactPersonNameInput.value = contactPersonName;
            const newContactPersonContainer = document.getElementById(newContactContainerId);
            if (newContactPersonContainer) newContactPersonContainer.style.display = 'block';
          }
        }
      }
    }

    function toggleNewCategory(select) {
      const container = select.parentNode.querySelector('.dynamic-input-container');
      const input = select.parentNode.querySelector('.item-category-input');
      if(select.value === '__NEW__') {
        container.style.display = 'block';
        input.required = true;
        input.focus();
      } else {
        container.style.display = 'none';
        input.required = false;
        input.value = '';
      }
    }
