/**
 * 【このファイルの役割】
 * 複数のファイルから使われる小さな汎用関数（HTMLエスケープ、日付フォーマット、
 * 音声入力、フォーム全体のリセット）をまとめている。
 */

    // =====================================
    // デザインA・デザインB両方のフォームをまとめてリセットする共通関数
    // ・ログアウト時／メニューに戻る時／保存完了時の3箇所で使用
    // ・ログイン欄（ID・パスワード）のクリアはこの関数の対象外（呼び出し元で個別に行う）
    // =====================================
    function resetAllForms_() {
      document.getElementById('estimateForm').reset();
      document.getElementById('detailsContainer').innerHTML = '';
      resetFormB_();
    }

    // =====================================
    // GAS APIへのリクエストを送り、失敗時に1回だけ自動リトライする共通関数
    // ・リトライの対象は「通信レベルの失敗」（HTTPエラー、fetch自体の失敗、
    //   レスポンスがJSONとして壊れている）のみ。
    // ・サーバーが正常に応答し、かつ明確に業務エラー（result.status !== 'success'）を
    //   返した場合はリトライしない（同じ入力を再送しても結果は変わらないため、
    //   無駄な通信と、状態変更処理の意図しない再実行を避ける）
    // ・2回目の通信も失敗したら、そのエラーをそのまま呼び出し元に投げる（呼び出し元でcatchすること）
    // ・timeoutMsを指定すると、リクエストがその時間内に終わらない場合は中断してタイムアウトエラーにする
    // 戻り値：成功時は { status: 'success', data: {...} } の data 部分（result.data）
    // =====================================
    async function fetchWithRetry_(body, timeoutMs = null) {
      // 通信レベルの失敗を示すマーカー（リトライしてよい失敗かどうかの目印）
      class TransportError_ extends Error {}

      const attemptFetch = async () => {
        let response;
        if (timeoutMs) {
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
          try {
            response = await fetch(GAS_WEB_APP_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              signal: abortController.signal,
              body: JSON.stringify(body)
            });
          } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
              throw new TransportError_(`通信がタイムアウトしました（${Math.floor(timeoutMs / 1000)}秒以内に完了しませんでした）。`);
            }
            throw new TransportError_(fetchError.message);
          } finally {
            clearTimeout(timeoutId);
          }
        } else {
          try {
            response = await fetch(GAS_WEB_APP_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: JSON.stringify(body)
            });
          } catch (fetchError) {
            throw new TransportError_(fetchError.message);
          }
        }

        if (!response.ok) {
          throw new TransportError_(`HTTP Error: ${response.status} ${response.statusText}`);
        }

        let result;
        try {
          result = await response.json();
        } catch (parseError) {
          throw new TransportError_(`レスポンスの解析に失敗しました: ${parseError.message}`);
        }

        if (result.status !== 'success') {
          // ✅ サーバーが明確に返した業務エラーは、通常のErrorとして投げる（リトライ対象外）
          throw new Error(result.message || '不明なエラーが発生しました');
        }

        return result.data;
      };

      try {
        return await attemptFetch();
      } catch (firstError) {
        if (!(firstError instanceof TransportError_)) {
          // 業務エラーはリトライせずそのまま投げる
          throw firstError;
        }
        console.warn(`通信に失敗しました。1回だけ自動で再試行します（action: ${body.action}）:`, firstError.message);
        // 通信レベルの失敗のみ、1回だけ自動リトライ
        return await attemptFetch();
      }
    }

    function htmlEscape(text) {
      const map = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'};
      return String(text).replace(/[&<>"']/g, c => map[c]);
    }

    // =====================================
    // 日付フォーマット関数
    // =====================================
    function formatDateToInput(dateVal) {
      if (!dateVal) return '';
      // 文字列の場合は Date オブジェクトに変換
      let date = dateVal instanceof Date ? dateVal : new Date(dateVal);
      if (isNaN(date.getTime())) return String(dateVal);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    // 音声入力関数
    function startVoiceInput(button) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        Swal.fire({
          icon: 'warning',
          title: '非対応',
          text: 'お使いのブラウザは音声入力に対応していません。',
          confirmButtonText: '了解'
        });
        return;
      }
     
      const input = button.closest('.voice-input-wrapper').querySelector('input');
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = true;
     
      button.classList.add('recording');
      button.innerHTML = '<span class="material-symbols-outlined" style="animation: blink 1s infinite;">mic</span> 聴取中...';
      button.disabled = true;
      input.style.backgroundColor = '#FFF3E0';
      input.style.borderColor = '#FF9800';
     
      recognition.onstart = () => {
        // 入力中のビジュアル変更
      };
     
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          input.value = (input.value + transcript).trim();
        }
      };
     
      recognition.onerror = (event) => {
        // ✅ 修正：ボタンの無効化解除・表示リセットが漏れていたため追加
        //   （このまま解除しないと、エラー発生後は音声入力ボタンが永久に押せなくなるバグがあった）
        button.classList.remove('recording');
        button.innerHTML = '<span class="material-symbols-outlined">mic</span>';
        button.disabled = false;
        input.style.backgroundColor = '';
        input.style.borderColor = '';
        Swal.fire({
          icon: 'error',
          title: '音声認識失敗',
          text: 'もう一度お試しください。',
          confirmButtonText: '了解'
        });
      };
     
      recognition.onend = () => {
        button.classList.remove('recording');
        button.innerHTML = '<span class="material-symbols-outlined">mic</span>';
        button.disabled = false;
        input.style.backgroundColor = '';
        input.style.borderColor = '';
      };
      recognition.start();
    }
