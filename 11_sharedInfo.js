/**
 * 11_sharedInfo.js
 * 共通の基本情報カード（デザインA・B共用。index.html の #sharedInfoCard）の
 * 「初期状態に戻す」「値を集める」「保存データから復元する」処理。
 * ・案件の選択と4項目のロックは 10_project_picker.js
 * ・取引先／担当者プルダウンの制御は 05_masterData.js
 * ・デザインA・Bそれぞれの明細・備考は、07_designA-form.js / 09_designB-form.js が扱う
 * 依存：01_config.js（caseNos）、05_masterData.js、06_utils.js（formatDateToInput / getTodayInputValue）
 */

    // 初期値が決まっている欄（それ以外は空に戻す）
    const SHARED_INFO_DEFAULTS_ = {
      infoValidity: '御見積作成から3ヵ月',
      infoPaymentTerms: '従来通り'
    };

    // 基本情報カードのうち、取引先・案件選択を除く入力欄のID
    const SHARED_INFO_FIELD_IDS_ = [
      'infoDate', 'infoEstimator', 'infoAddress', 'infoSubject',
      'infoDeptNo', 'infoLayout', 'infoValidity', 'infoPaymentTerms'
    ];

    // =====================================
    // 基本情報カードを初期状態（空・初期値・案件未選択）に戻す
    // ・カードは #estimateForm の外にあるため、form.reset() では戻らない。この関数で戻す
    // ・日付は呼び出し側で必要に応じてセットする（新規作成時は今日の日付）
    // =====================================
    function resetSharedInfoFields_() {
      SHARED_INFO_FIELD_IDS_.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = SHARED_INFO_DEFAULTS_[id] || '';
      });
      resetClientFieldsUi_();   // 取引先・担当者・新規入力欄
      resetCaseSelection_();    // 案件の選択を外し、4項目を再びロックする
    }

    // =====================================
    // 基本情報カードの値を集める（デザインA・Bの保存データに共通の項目）
    // ・getFormData() / getFormDataB() がこの結果を土台にして、明細や備考を足す
    // =====================================
    function getSharedInfoValues_() {
      const textValue = (id) => document.getElementById(id).value.trim();
      const { clientName, contactPerson } = getClientSelectionValues_();

      return {
        caseNos: caseNos.slice(),
        clientName: clientName,
        contactPerson: contactPerson,
        clientAddress: textValue('infoAddress'),
        estimateDate: document.getElementById('infoDate').value,
        estimator: textValue('infoEstimator'),
        subject: textValue('infoSubject'),
        deptNo: textValue('infoDeptNo'),
        layout: textValue('infoLayout'),
        validity: textValue('infoValidity'),
        paymentTerms: textValue('infoPaymentTerms')
      };
    }

    // =====================================
    // 保存済みデータ（下書き／確定見積）から、基本情報カードを復元する
    // ・事前に resetSharedInfoFields_() と loadMasterLists() を済ませておくこと
    // ・mode：'COPY_CREATE'（コピー作成）では、日付は今日にし、案件は引き継がず選び直してもらう
    // 戻り値：利用者へ通知すべきメッセージの配列（問題なければ空配列）
    // =====================================
    function reflectSharedInfoFields_(main, mode) {
      main = main || {};
      const warnings = [];
      const isCopy = mode === 'COPY_CREATE';

      document.getElementById('infoDate').value =
        isCopy ? getTodayInputValue() : formatDateToInput(main.estimateDate);

      // マスタに存在すれば選択、存在しなければ新規入力欄へ反映する
      restoreClientSelection_(main.clientName, main.contactPerson);

      // 見積担当者。一覧にない名前は未選択に戻し、通知用のメッセージを集める
      const missingEstimator = restoreEstimatorSelection_('infoEstimator', main.estimator);
      if (missingEstimator) {
        warnings.push(`見積担当者「${missingEstimator}」は一覧にないため、未選択に戻しました。選び直してください。`);
      }

      // 案件Noの復元（コピー作成では引き継がず、案件を選び直してもらう）
      const restoredCaseNos = isCopy ? [] : (main.caseNos || []);
      setCaseSelection_(restoredCaseNos);
      if (restoredCaseNos.length === 0) {
        warnings.push('案件が未選択です。案件を選択してください（選択すると、取引先・担当者・件名・現場住所が上書きされます）。');
      }

      document.getElementById('infoAddress').value = main.clientAddress || '';
      document.getElementById('infoSubject').value = main.subject || '';
      document.getElementById('infoDeptNo').value = main.deptNo || '';
      document.getElementById('infoLayout').value = main.layout || '';
      document.getElementById('infoValidity').value = main.validity || '';
      document.getElementById('infoPaymentTerms').value = main.paymentTerms || '';

      return warnings;
    }
