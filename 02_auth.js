/**
 * 【このファイルの役割】
 * ログイン・ログアウトまわりの処理。
 */

    function togglePasswordVisibility() {
      const input = document.getElementById('loginPasswordInput');
      const icon = document.getElementById('eyeIcon');
      
      if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility';
      } else {
        input.type = 'password';
        icon.textContent = 'visibility_off';
      }
    }
      
    async function handleLoginSubmit() {
      const loginId = document.getElementById('loginIdInput').value.trim();
      const password = document.getElementById('loginPasswordInput').value.trim();
      
      if (!loginId || !password) {
        Swal.fire({ icon: 'warning', title: '入力不足', text: 'IDとパスワードを入力してください。', confirmButtonText: '了解' });
        return;
      }
      
      const loginBtn = document.getElementById('loginBtn');
      loginBtn.disabled = true;
      loginBtn.textContent = '認証中...';
      
      try {
        const response = await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'login',
            payload: { loginId: loginId, password: password }
          })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
          currentUser = result.data;
          localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
          // ログイン成功後はメニュー画面へ（ページ再読み込み時と遷移を統一）
          showMenuScreen();
        } else {
          Swal.fire({ icon: 'error', title: 'ログイン失敗', text: result.message });
        }
      } catch (error) {
        Swal.fire({ icon: 'error', title: '通信エラー', text: error.message, confirmButtonText: '了解' });
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'ログイン';
      }
    }

    // =====================================
    // ログアウト後メニュー画面に戻る
    // =====================================
    function handleLogout() {
      Swal.fire({
        icon: 'question',
        title: 'ログアウト',
        text: 'ログアウトしてもよろしいですか？',
        showCancelButton: true,
        confirmButtonText: '実行',
        cancelButtonText: 'キャンセル'
      }).then((result) => {
        if (result.isConfirmed) {
          localStorage.removeItem('currentUser');
          currentUser = null;
          
          document.getElementById('estimateForm').reset();
          document.getElementById('detailsContainer').innerHTML = '';
          document.getElementById('loginIdInput').value = '';
          document.getElementById('loginPasswordInput').value = '';
          resetFormB_();
          showLoginScreen();
        }
      });
    }
     
    //いつでも安全にユーザー名を取得・自動復元する共通関数
    function getCurrentUserName() {
      if (currentUser && currentUser.userName) {
        return currentUser.userName;
      }
      // 変数が消えていたらローカルストレージから復元を試みる
      const saved = localStorage.getItem('currentUser');
      if (saved) {
        currentUser = JSON.parse(saved);
        return currentUser.userName;
      }
      return null;
    }
    
    /**
     * 既存の保存・確定処理完了時のコールバックに組み込む処理
     * 下書きから編集して確定保存（本番保存）が成功した際、古い下書きデータを消去する
     */
