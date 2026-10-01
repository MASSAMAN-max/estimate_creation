/**
 * 【このファイルの役割】
 * 取引先・担当者・項目・単位のマスターデータ取得と、
 * デザインA・デザインB共通の取引先／担当者プルダウンまわりの制御。
 * ✅ 変更：デザインBも取引先・担当者を選択式にしたため、要素IDを引数で受け取る
 *   共通関数に整理し、A・B両方から呼べるようにした。
 */

    async function loadMasterLists() {
      try {
        const masterData = await fetchWithRetry_({
          action: 'loadMasterLists',
          payload: {
            currentUserName: currentUser?.userName || '',
            userId: currentUser?.userId || ''
          }
        }) || {};

        MASTER_CLIENTS = masterData.clients || [];
        MASTER_CONTACTPERSONS = masterData.contactPersons || {};  // 担当者マスター
        MASTER_CATEGORIES = masterData.categories || [];
        MASTER_UNITS = masterData.units || [];
      
        // 取引先プルダウンを構築（デザインA・デザインB共通の選択肢）
        buildClientOptions_('clientSelect');
        buildClientOptions_('infoClientSelect');
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
    
    // ===== 取引先選択時のイベントハンドラ（共通実装） =====
    // idSuffix：デザインAは ''（clientSelect等）、デザインBは 'B'（infoClientSelect等）
    function toggleNewClient_(idSuffix) {
      const selectId = idSuffix ? 'infoClientSelect' : 'clientSelect';
      const containerId = idSuffix ? 'newClientContainerB' : 'newClientContainer';
      const inputId = idSuffix ? 'infoClient' : 'clientName';
      const contactSelectId = idSuffix ? 'infoClientContactSelect' : 'contactPersonSelect';
      const newContactContainerId = idSuffix ? 'newContactPersonContainerB' : 'newContactPersonContainer';

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
      const contactSelectId = idSuffix ? 'infoClientContactSelect' : 'contactPersonSelect';
      const newContactContainerId = idSuffix ? 'newContactPersonContainerB' : 'newContactPersonContainer';
      const contactInputId = idSuffix ? 'infoClientContact' : 'contactPersonName';

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
    // 旧関数名（デザインAから直接呼ばれている）は共通実装への薄いラッパーとして残す
    function updateContactPersonList(selectedClient) { updateContactPersonList_(selectedClient, ''); }
     
    // ===== 担当者選択時のイベントハンドラ（共通実装） =====
    function toggleNewContactPerson_(idSuffix) {
      const selectId = idSuffix ? 'infoClientContactSelect' : 'contactPersonSelect';
      const containerId = idSuffix ? 'newContactPersonContainerB' : 'newContactPersonContainer';
      const inputId = idSuffix ? 'infoClientContact' : 'contactPersonName';

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
      const selectId = idSuffix ? 'infoClientSelect' : 'clientSelect';
      const inputId = idSuffix ? 'infoClient' : 'clientName';
      const contactSelectId = idSuffix ? 'infoClientContactSelect' : 'contactPersonSelect';
      const contactInputId = idSuffix ? 'infoClientContact' : 'contactPersonName';

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
      const selectId = idSuffix ? 'infoClientSelect' : 'clientSelect';
      const containerId = idSuffix ? 'newClientContainerB' : 'newClientContainer';
      const inputId = idSuffix ? 'infoClient' : 'clientName';
      const contactSelectId = idSuffix ? 'infoClientContactSelect' : 'contactPersonSelect';
      const newContactContainerId = idSuffix ? 'newContactPersonContainerB' : 'newContactPersonContainer';
      const contactInputId = idSuffix ? 'infoClientContact' : 'contactPersonName';

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
