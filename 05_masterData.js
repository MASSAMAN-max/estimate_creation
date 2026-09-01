/**
 * 【このファイルの役割】
 * 取引先・担当者・項目・単位のマスターデータ取得と、
 * デザインAフォームの取引先／担当者プルダウンまわりの制御。
 */

    async function loadMasterLists() {
      try {
        const res = await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'loadMasterLists',
            payload: {
              currentUserName: currentUser?.userName || '',
              userId: currentUser?.userId || ''
            }
          })
        });
      
        const result = await res.json();
        if (result.status === 'error') throw new Error(result.message);
        
        const masterData = result.data || {};
        MASTER_CLIENTS = masterData.clients || [];
        MASTER_CONTACTPERSONS = masterData.contactPersons || {};  // 担当者マスター
        MASTER_CATEGORIES = masterData.categories || [];
        MASTER_UNITS = masterData.units || [];
      
        // 取引先プルダウンを構築
        const clientSelect = document.getElementById('clientSelect');
        if (clientSelect) {
          clientSelect.innerHTML = '<option value="">-- 取引先を選択してください --</option>';
          MASTER_CLIENTS.forEach(client => {
            const option = document.createElement('option');
            option.value = client;
            option.textContent = client;
            clientSelect.appendChild(option);
          });
          clientSelect.innerHTML += '<option value="__NEW__">（新規取引先を入力する）</option>';
        }
        // ※ 他に「担当者」や「品目」などのプルダウンをHTMLに組み立てる処理がこの下にあれば、その後に追記してください
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
    
    // ===== 取引先選択時のイベントハンドラ =====
    function toggleNewClient() {
      const select = document.getElementById('clientSelect');
      const container = document.getElementById('newClientContainer');
      const input = document.getElementById('clientName');
      const contactPersonSelect = document.getElementById('contactPersonSelect');
      const newContactPersonContainer = document.getElementById('newContactPersonContainer');
      
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
        updateContactPersonList(select.value);
      }
    }
    // ===== 取引先変更時の住所クリア処理 =====
    // 住所欄をクリアする処理
    function clearClientAddress() {
      const select = document.getElementById('clientSelect');
      const addressInput = document.getElementById('clientAddress');
      
      // 取引先が選択されていない、または新規の場合は住所をクリア
      if (!select.value || select.value === '__NEW__') {
        addressInput.value = '';
      }
      // 既存取引先を選択した場合も、住所はクリアする（パターンX要件）
      // （この項目は手動で入力するように）
    }
    
    // ===== 取引先に紐付く担当者リストを更新する関数 =====
    function updateContactPersonList(selectedClient) {
      const contactPersonSelect = document.getElementById('contactPersonSelect');
      const newContactPersonContainer = document.getElementById('newContactPersonContainer');
      const contactPersonInput = document.getElementById('contactPersonName');
      
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
     
    // ===== 担当者選択時のイベントハンドラ =====
    function toggleNewContactPerson() {
      const select = document.getElementById('contactPersonSelect');
      const container = document.getElementById('newContactPersonContainer');
      const input = document.getElementById('contactPersonName');
      
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
