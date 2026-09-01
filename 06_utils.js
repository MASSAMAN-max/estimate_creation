/**
 * 【このファイルの役割】
 * 複数のファイルから使われる小さな汎用関数（HTMLエスケープ、日付フォーマット、
 * 音声入力）をまとめている。
 */

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
        button.classList.remove('recording');
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
