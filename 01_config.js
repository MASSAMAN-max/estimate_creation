/**
 * 【このファイルの役割】
 * アプリ全体の設定値とグローバル状態。GAS Web AppのURL、マスターデータの
 * 保持変数、現在の画面モード・ログインユーザーなど、他のすべてのJSファイルが
 * 参照する「共有の土台」をまとめている。
 */

    const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxQkNvNQblWXRtenGPoSaXbi99ftJ61j02s11rzCxwQZ4bDGddhzuDwrCRu0wYQxbNAow/exec"; 
    // ===== グローバル変数 =====
    let MASTER_CLIENTS = [];
    let MASTER_CONTACTPERSONS = {};  // { "取引先": ["担当者1", "担当者2"] }の形式
    let MASTER_CATEGORIES = [];
    let MASTER_UNITS = [];
    
    // 現在のフォームの状態を追跡する管理変数
    let appMode = 'NEW';      // 'MENU' | 'NEW_ESTIMATE' | 'PAST_ESTIMATE' | 'EDIT_DRAFT'
    let currentUser = null;   // ログインユーザー情報
    let currentMode = 'NEW';  // 'NEW'(新規), 'DRAFT_EDIT'(下書き編集), 'COPY_CREATE'(過去コピーから作成)
    let currentOriginId = ''; // 編集元・コピー元となったデータのIDを保持
    let currentDesignType = 'A'; // 'A'(従来デザイン) | 'B'(新デザイン) ─ 現在編集中のフォームのデザイン種別

    window.addEventListener('DOMContentLoaded', async () => {
      // sessionStorage から localStorage へ変更（ログイン状態をチェック）
      const savedUser = localStorage.getItem('currentUser');
      
      // ✅ 修正：localStorageの値が壊れている場合（手動編集・古い形式など）に
      //   JSON.parseが例外を投げてアプリ全体がクラッシュし、画面が真っ白のまま
      //   何も表示されなくなる不具合があったため、例外処理で保護する。
      //   壊れている場合は保存値を破棄し、ログイン画面に安全にフォールバックする。
      let parsedUser = null;
      if (savedUser) {
        try {
          parsedUser = JSON.parse(savedUser);
        } catch (e) {
          console.error('保存されたログイン情報の読み込みに失敗しました。ログイン情報をリセットします:', e);
          localStorage.removeItem('currentUser');
          parsedUser = null;
        }
      }

      if (parsedUser) {
        currentUser = parsedUser;
        // 今日の日付を自動セット（重要な処理なので残します）
        document.getElementById('estimateDate').value = new Date().toISOString().split('T')[0];
        showMenuScreen();  // メニュー画面を表示
      } else {
        showLoginScreen();
      }
    });
