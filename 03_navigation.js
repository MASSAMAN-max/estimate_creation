/**
 * 03_navigation.js
 * 画面切り替え（ログイン画面／メニュー画面／デザインA・B作成画面）の制御。
 */

    // =====================================
    // 画面の表示切り替え（ログイン／メニュー／デザインA作成／デザインB作成）
    // =====================================
    // 【考え方】
    // ・画面は「共通の土台（appWrapper）」の中で、メニュー・デザインA・デザインBの
    //   どれか1つを表示する作りになっている
    // ・各画面で「どの要素をどう表示するか」を、下の対応表（SCREEN_LAYOUTS_）にまとめた。
    //   以前は画面ごとの関数に同じ表示切り替えを手書きしていたため、要素を追加・変更するときに
    //   3〜4か所を直す必要があった。今後は、この表だけを直せばよい
    // ・値は、各要素に元から指定されている表示方法（flex／block／inline-flex）
    // ・表に書かれていない要素は変更しない（ログイン画面では「メニューに戻る」ボタンに触れない）
    const SCREEN_LAYOUTS_ = {
      // ログイン画面だけを表示し、アプリ全体の土台を隠す
      LOGIN: {
        loginScreen: 'flex', appWrapper: 'none',
        menuScreen: 'none', mainApp: 'none', mainAppB: 'none', bottomBarA: 'none'
      },
      // メニュー画面（作成フォームは隠す）。ヘッダーの「メニューに戻る」ボタンは不要
      MENU: {
        loginScreen: 'none', appWrapper: 'block',
        menuScreen: 'flex', mainApp: 'none', mainAppB: 'none', bottomBarA: 'none',
        backToMenuBtn: 'none'
      },
      // デザインAの作成フォーム。小計・消費税・税込合計の固定ボトムバーも表示する
      DESIGN_A: {
        loginScreen: 'none', appWrapper: 'block',
        menuScreen: 'none', mainApp: 'block', mainAppB: 'none', bottomBarA: 'flex',
        backToMenuBtn: 'inline-flex'
      },
      // デザインBの作成フォーム（デザインAと共通の土台・ヘッダーを利用）
      DESIGN_B: {
        loginScreen: 'none', appWrapper: 'block',
        menuScreen: 'none', mainApp: 'none', mainAppB: 'block', bottomBarA: 'none',
        backToMenuBtn: 'inline-flex'
      }
    };

    // 指定した画面を表示する（表示切り替えの共通処理）
    function showScreen_(screenName) {
      const layout = SCREEN_LAYOUTS_[screenName];
      if (!layout) throw new Error(`不正な画面名です: ${screenName}`);

      Object.entries(layout).forEach(([elementId, display]) => {
        document.getElementById(elementId).style.display = display;
      });

      // ログイン画面以外では、ヘッダーにログイン中のユーザー名を表示する
      if (screenName !== 'LOGIN') {
        document.getElementById('userDisplayLabel').textContent = `ログイン: ${currentUser.userName}`;
      }
    }

    // ---- 以下は、各画面へ切り替えるときの入口（呼び出し元の名前はそのまま使える） ----

    function showMenuScreen() {
      showScreen_('MENU');

      // 「新規作成」を押したときに待たされないよう、マスターデータを裏で先読みしておく
      preloadMasterLists_();
      // 案件マスタは件数が多く遅いため、メニュー表示後に裏で取得しておく（古ければ取り直す）
      loadProjectsIfNeeded_();
    }

    function showMainApp() {
      currentDesignType = 'A';
      showScreen_('DESIGN_A');
    }

    // デザインB用フォーム画面を表示（デザインAと共通の土台・ヘッダーを利用）
    function showMainAppB() {
      currentDesignType = 'B';
      showScreen_('DESIGN_B');
    }

    function showLoginScreen() {
      showScreen_('LOGIN');
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
      
      // ローダーが描画されるのを待つ
      await waitForNextPaint_();
      
      try {
        switch(menuType) {
          case 'NEW_ESTIMATE':
            loaderText.textContent = 'データを読み込んでいます...';
            await initializeEstimateForm();
            loader.style.display = 'none'; // フォーム初期化完了後に消す
            showMainApp();
            break;

          case 'NEW_ESTIMATE_B':
            loaderText.textContent = 'データを読み込んでいます...';
            await initializeEstimateFormB();
            loader.style.display = 'none';
            showMainAppB();
            break;
            
          case 'PAST_ESTIMATE':
            loaderText.textContent = '過去の見積書を読み込んでいます...';
            // ✅ 変更：「過去の見積書から作成」「見積書を確認」を統合したため、
            //   一覧では各行にPDF表示ボタンとコピー作成ボタンを両方表示する（04_listModal.js 参照）
            await openEstimateListModal('estimate');
            break;
            
          case 'EDIT_DRAFT':
            loaderText.textContent = '下書きデータを読み込んでいます...';
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
          resetAllForms_();
          showMenuScreen();
        }
      });
    }
