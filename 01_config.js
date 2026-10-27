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
    let MASTER_ESTIMATORS = [];  // ★追加：見積担当（デザインB）の選択肢。ユーザー名の配列
        // ===== 案件マスタ（案件選択部品の選択肢。10_project_picker.js で裏読込する） =====
    let projectListCache = [];          // [{no, name, client, contact, address, __searchText}]
    let projectMapByNo = new Map();     // 案件No → 案件（チップ表示・4項目の自動反映用）
    let clientListCache = [];           // 発注元の選択肢（あいうえお順）：[{name, gyou}]
    let contactsByClient = new Map();   // 発注元 → 担当者の一覧
    let projectListStatus = "idle";     // idle／loading／ready／error
    let projectListErrorMessage = "";
    let projectListFetchedAt = 0;       // 最後に取得できた時刻（一定時間ごとの取り直し用）

    // 選択中の案件No。部品が同じ配列を直接書き換えるため、空にするときは .length = 0 を使う（再代入しない）
    const caseNosA = [];  // デザインA
    const caseNosB = [];  // デザインB
    // 現在のフォームの状態を追跡する管理変数
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

      // 旧バージョン（トークン導入前）のログイン情報にはトークンが無く、サーバーに認証されない。
      // そのため破棄して、再ログインしてもらう（利用者は1回だけ再ログインが必要になる）
      let needsReloginNotice = false;
      if (parsedUser && !parsedUser.token) {
        localStorage.removeItem('currentUser');
        parsedUser = null;
        needsReloginNotice = true;
      }

      if (parsedUser) {
        currentUser = parsedUser;
        // 今日の日付を自動セット（重要な処理なので残します）
        document.getElementById('estimateDate').value = getTodayInputValue();
        showMenuScreen();  // メニュー画面を表示
      } else {
        showLoginScreen();
        if (needsReloginNotice) {
          Swal.fire({
            icon: 'info',
            title: '再ログインをお願いします',
            text: 'セキュリティ強化のため、お手数ですが、もう一度ログインしてください。',
            confirmButtonText: '了解'
          });
        }
      }
    });
