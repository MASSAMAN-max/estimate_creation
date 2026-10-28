    /**
    * 02_auth.js
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
        const resultData = await fetchWithRetry_({
          action: 'login',
          payload: { loginId: loginId, password: password }
        });
    
        currentUser = resultData; // サーバーが返した token（ログイントークン）も含まれる
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        isHandlingAuthExpired_ = false; // 再ログインできたので、期限切れ処理の抑止を解除する
        invalidateMasterListsCache_(); // 前のログイン時のマスターを使い回さない
    
        // ログイン成功後はメニュー画面へ（ページ再読み込み時と遷移を統一）
        showMenuScreen();
      } catch (error) {
        Swal.fire({ icon: 'error', title: 'ログイン失敗', text: error.message, confirmButtonText: '了解' });
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
          // サーバー側のトークンも失効させる（端末から消すだけでは、漏れたトークンが使えてしまうため）。
          // 画面の切り替えを待たせないよう、結果は待たない。失敗してもログアウト自体は続行する
          const tokenToRevoke = getAuthToken_();
          localStorage.removeItem('currentUser');
          currentUser = null;
          invalidateMasterListsCache_(); // 次にログインする人に、前の人のマスターを使い回さない
        　resetProjectCache_(); // 前のログイン者の案件リストを使い回さない    
          resetAllForms_();
          document.getElementById('loginIdInput').value = '';
          document.getElementById('loginPasswordInput').value = '';
          showLoginScreen();
    
          if (tokenToRevoke) {
            fetchWithRetry_({ action: 'logout', payload: { token: tokenToRevoke } }, 10000)
              .catch(error => console.error('サーバー側のトークン失効に失敗しました:', error));
          }
        }
      });
    }
    
    // =====================================
    // 保存しているログイントークンを取得する
    // ・fetchWithRetry_ が、通信のたびにこれを自動で付与する
    // ・保存値が壊れている場合は、空文字（＝未ログイン扱い）を返す
    // =====================================
    function getAuthToken_() {
      if (currentUser && currentUser.token) return currentUser.token;
      try {
        const saved = JSON.parse(localStorage.getItem('currentUser') || 'null');
        return (saved && saved.token) ? saved.token : '';
      } catch (e) {
        return '';
      }
    }
    
    // =====================================
    // ログインの有効期限切れ・無効なトークンを検知したときの処理（ログイン画面へ戻す）
    // ・fetchWithRetry_ が、サーバーから AUTH_EXPIRED を受け取ったときに呼ぶ
    // ・複数の通信が同時に失敗しても、案内が何度も出ないよう、再ログインするまで1回だけ実行する
    // ・呼び出し元（保存処理など）も、続けて自分のエラー表示を出すことがあるが、
    //   SweetAlert2は同時に1つしか表示されないため、後から出た同じ趣旨の表示に置き換わるだけで、重なることはない
    // =====================================
    let isHandlingAuthExpired_ = false;
    
    function handleAuthExpired_(message) {
      if (isHandlingAuthExpired_) return;
      isHandlingAuthExpired_ = true;
    
      localStorage.removeItem('currentUser');
      currentUser = null;
      invalidateMasterListsCache_();
    　invalidateMasterListsCache_(); // 次にログインする人に、前の人のマスターを使い回さない
      // 表示中のローダー・一覧モーダルを閉じてから、ログイン画面へ戻す
      ['loader', 'listModal', 'linkCaseModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      resetAllForms_();
      showLoginScreen();
    
      Swal.fire({
        icon: 'info',
        title: '再ログインが必要です',
        text: message || 'ログインの有効期限が切れました。再度ログインしてください。',
        confirmButtonText: '了解'
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
        // ✅ 修正：保存値が壊れている場合にJSON.parseが例外を投げ、
        //   呼び出し元（保存処理など）が丸ごと失敗することがあったため例外処理を追加
        try {
          currentUser = JSON.parse(saved);
          return currentUser.userName;
        } catch (e) {
          console.error('保存されたログイン情報の読み込みに失敗しました:', e);
          localStorage.removeItem('currentUser');
          currentUser = null;
          return null;
        }
      }
      return null;
    }
    
    // =====================================
    // 現在ログイン中のユーザーが管理者かどうかを判定する共通関数
    // ✅ 新設：見積書削除など、管理者専用の機能の「ボタンを表示するか」の判定で使用する
    // ※ 表示のためだけの判定。実際に実行できるかは、サーバーがトークンから確定した管理者権限で決まる
    // =====================================
    function isCurrentUserAdmin() {
      return !!(currentUser && currentUser.isAdmin);
    }
