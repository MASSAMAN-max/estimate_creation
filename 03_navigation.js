/**
 * 【このファイルの役割】
 * 画面切り替え（ログイン画面／メニュー画面／デザインA・B作成画面）の制御。
 */

    // =====================================
    // メニュー画面の表示切り替え関数群（共通土台対応版）
    // =====================================
    function showMenuScreen() {
      document.getElementById('loginScreen').style.display = 'none';
      
      // 1. まず共通の土台（ヘッダー枠）を表示する
      document.getElementById('appWrapper').style.display = 'block';
      
      // 2. 土台のなかでメニュー画面を表示し、作成フォームは隠す（デザインA/B両方）
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('mainAppB').style.display = 'none';
      document.getElementById('menuScreen').style.display = 'flex';
      
      // 3. メニュー画面なので、ヘッダーの「メニューに戻る」ボタンは非表示
      document.getElementById('backToMenuBtn').style.display = 'none';
      
      // 4. ユーザー名を表示（IDが1つになったので確実に動作します）
      document.getElementById('userDisplayLabel').textContent = `ログイン: ${currentUser.userName}`;
    }
    
    function showMainApp() {
      currentDesignType = 'A';
      document.getElementById('loginScreen').style.display = 'none';
      
      // 1. まず共通の土台（ヘッダー枠）を表示する
      document.getElementById('appWrapper').style.display = 'block';
      
      // 2. 土台のなかでメニュー画面を隠し、作成フォーム（デザインA）を表示する
      document.getElementById('menuScreen').style.display = 'none';
      document.getElementById('mainAppB').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      
      // 3. 作成フォーム画面なので、ヘッダーの「メニューに戻る」ボタンを表示！
      document.getElementById('backToMenuBtn').style.display = 'inline-flex';
      
      // 4. ユーザー名を表示
      document.getElementById('userDisplayLabel').textContent = `ログイン: ${currentUser.userName}`;
    }

    // デザインB用フォーム画面を表示（デザインAと共通の土台・ヘッダーを利用）
    function showMainAppB() {
      currentDesignType = 'B';
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appWrapper').style.display = 'block';
      document.getElementById('menuScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('mainAppB').style.display = 'block';
      document.getElementById('backToMenuBtn').style.display = 'inline-flex';
      document.getElementById('userDisplayLabel').textContent = `ログイン: ${currentUser.userName}`;
    }
    
    function showLoginScreen() {
      // ログイン画面だけを表示し、アプリ全体の土台を非表示にする
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('appWrapper').style.display = 'none';
      document.getElementById('menuScreen').style.display = 'none';
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('mainAppB').style.display = 'none';
    }

    // =====================================
    // メニューボタンのハンドラ関数
    // =====================================
    async function handleMenuClick(menuType) {
      // 1. まずローダーを画面に表示
      const loader = document.getElementById('loader');
      const loaderText = document.getElementById('loaderText');
      
      loader.style.display = 'flex';
      loaderText.textContent = '読み込み中...';
      
      // 描画が完了するのを待つ
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));
      
      try {
        switch(menuType) {
          case 'NEW_ESTIMATE':
            loaderText.textContent = 'データを読み込んでいます...';
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));
            
            await initializeEstimateForm();
            loader.style.display = 'none'; // フォーム初期化完了後に消す
            showMainApp();
            break;

          case 'NEW_ESTIMATE_B':
            loaderText.textContent = 'データを読み込んでいます...';
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));

            initializeEstimateFormB();
            loader.style.display = 'none';
            showMainAppB();
            break;
            
          case 'PAST_ESTIMATE':
            appMode = 'PAST_ESTIMATE';
            loaderText.textContent = '過去の見積書を読み込んでいます...';
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));
            
            await openEstimateListModal('estimate');
            break;
            
          case 'VIEW_ESTIMATE':
            appMode = 'VIEW_ESTIMATE';
            loaderText.textContent = '見積書を読み込んでいます...';
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));
            
            await openEstimateListModal('view');
            break;
            
          case 'EDIT_DRAFT':
            appMode = 'EDIT_DRAFT';
            loaderText.textContent = '下書きデータを読み込んでいます...';
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));
            
            await openEstimateListModal('draft');
            break;
            
          default:
            throw new Error('不正なメニュータイプです。');
        }
      } catch (error) {
        console.error('メニュー処理エラー:', error);
        loader.style.display = 'none';
        Swal.fire({
          icon: 'error',
          title: 'エラー',
          text: error.message,
          confirmButtonText: '了解'
        });
      }
    }
     
    // =====================================
    // 戻るボタンハンドラ（作成画面からメニューへ）
    // =====================================
    function handleBackToMenu() {
      Swal.fire({
        icon: 'question',
        title: '確認',
        text: 'メニュー画面に戻ります。入力中のデータは失われます。',
        showCancelButton: true,
        confirmButtonText: '戻る',
        cancelButtonText: 'キャンセル'
      }).then((result) => {
        if (result.isConfirmed) {
          document.getElementById('estimateForm').reset();
          document.getElementById('detailsContainer').innerHTML = '';
          resetFormB_();
          showMenuScreen();
        }
      });
    }
