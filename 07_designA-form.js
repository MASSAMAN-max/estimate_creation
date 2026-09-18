// =====================================================================
// 07_PDFデザインA
// =====================================================================

/**
 * 【このファイルの役割】
 * デザインA（従来フォーマット）専用のPDF生成処理。
 * テンプレートシートへのデータ流し込み〜PDFエクスポートまでを1関数で行う。
 * デザインBのロジックとは完全に独立している（08のファイルとは無関係）。
 * 結合セル対応の安全なセル書き込みヘルパー（setCellSafeA1_ / buildMergeMap_）は
 * デザインBとの共通処理のため 06_PDF共通.js に定義されている。
 */

// =====================================
// テンプレートシートにデータを流し込み、PDF生成保存（デザインA用）
// =====================================
function saveToDriveAsPdf_DesignA_(folder, estimateNo, data, loginUserName) {
  const processLog = [];
  let blob = null;
  let pdfUrl = "";
  let copySs = null;       
  let mitsumoriSheet = null; 
  let copyFile = null;     

  try {
    processLog.push(`【PDF 処理開始】作成者: ${loginUserName}`);

    processLog.push("【1. テンプレート SS 取得】");
    const templateSs = SS.TEMPLATE;
    if (!templateSs) throw new Error("SS.TEMPLATE が定義されていません。");

    const ssId = templateSs.getId();
    const templateFile = DriveApp.getFileById(ssId);
    processLog.push(`✓ テンプレート SS: ${templateFile.getName()}`);

    processLog.push("【2. コピーファイル作成】");
    const copyFileName = `御見積書_${estimateNo}_${data.clientName || "見積"}_作成者：${loginUserName}`;
    copyFile = templateFile.makeCopy(copyFileName, folder); 
    processLog.push(`✓ 作成: ${copyFile.getName()}`);

    processLog.push("【3. スプレッドシートを開く】");
    try {
      copySs = SpreadsheetApp.open(copyFile); 
      mitsumoriSheet = copySs.getSheets()[0]; 
      processLog.push(`✓ SS を開きました: ${mitsumoriSheet.getName()}`);
    } catch (openError) {
      throw new Error(`スプレッドシートを開けません。エラー: ${openError.message}`);
    }

    processLog.push("【4. データ流し込み】");

    // ✅ 修正：A1・A2・A3・K3・K4・L11・L12は結合セルのため、結合を考慮した
    //   setCellSafeA1_ に統一（デザインBと共通の仕組み）。
    //   結合セル情報は1回だけ取得して使い回すことで、書き込みごとに
    //   getMergedRanges() を呼ぶより処理を高速化している。
    const mergeMap = buildMergeMap_(mitsumoriSheet);

    // 基本情報の書き込み
    const clientName = (data.clientName || "お客様").trim();
    const contactPerson = (data.contactPerson || "").trim();
    
    if (contactPerson) {
      setCellSafeA1_(mitsumoriSheet, "A1", clientName, mergeMap);
      setCellSafeA1_(mitsumoriSheet, "A2", contactPerson + " 様", mergeMap);
    } else {
      setCellSafeA1_(mitsumoriSheet, "A1", clientName + " 御中", mergeMap);
      setCellSafeA1_(mitsumoriSheet, "A2", "", mergeMap);
    }
    
    setCellSafeA1_(mitsumoriSheet, "A3", data.clientAddress || "", mergeMap);
    setCellSafeA1_(mitsumoriSheet, "K3", "作成日：" + (data.estimateDate || ""), mergeMap);
    setCellSafeA1_(mitsumoriSheet, "K4", "見積No. " + estimateNo, mergeMap);
    setCellSafeA1_(mitsumoriSheet, "A5", data.subject || "", mergeMap);
    setCellSafeA1_(mitsumoriSheet, "L11", data.paymentTerms || "", mergeMap); // 支払条件
    setCellSafeA1_(mitsumoriSheet, "L12", data.validity || "", mergeMap);     // 有効期限
    setCellSafeA1_(mitsumoriSheet, "A33", data.remarks || "", mergeMap);

    // 明細データの条件分岐・流し込みロジック
    if (data.details && data.details.length > 0) {
      // 事前にユニークなカテゴリ数を正確にカウント
      const uniqueCats = [...new Set(data.details.map(r => String(r.itemCategory || r.category || "").trim()).filter(Boolean))];
      
      let groupedItems = [];
      let currentItem = null;
      
      data.details.forEach(row => {
        let cat = (row.itemCategory || row.category || "").toString().trim();
        const unit = String(row.itemUnit || row.unit || "").trim();
        const qty = Number(row.itemQty ?? row.qty) || 0;
        const price = Number(row.itemPrice ?? row.price) || 0;
        const rowAmount = row.itemAmount ?? row.amount;
        // ✅ 修正：itemAmountは「項目（カテゴリ）の合計金額」、itemIndividualAmountは
        //   「この内容自身の金額」。カテゴリ先頭行では両者の値が異なる（itemAmount=カード全体の合計）
        //   ため、明細に表示する金額はitemIndividualAmount（なければitemAmountにフォールバック）を使う
        const rowIndividualAmount = row.itemIndividualAmount ?? rowAmount;
        const rowName = row.itemName || row.name || "";
        const rowRemarks = row.itemRemarks || row.remarks;
        
        const displayAmount = Number(rowAmount ?? 0);               // 項目（カテゴリ）の合計金額
        const displayIndividualAmount = Number(rowIndividualAmount ?? 0); // この内容自身の金額（明細表示用）
        const isShiki = unit === "式";
        const displayPrice = isShiki ? "" : price;
      
        let remarks;
        if (Array.isArray(rowRemarks)) {
          remarks = rowRemarks.filter(r => r && String(r).trim());
        } else {
          remarks = String(rowRemarks || "").split('\n').filter(r => r.trim());
        }
      
        // =====================================
        // 📦 項目（カテゴリ）が存在するかどうかで完全判定
        // =====================================
        if (cat !== "") {
          // 💡 項目が存在する行 ＝ 内容が合計された金額が存在する行
          currentItem = {
            category: cat,
            contents: [{
              name: rowName,
              qty: qty,
              unit: unit,
              price: displayPrice,   
              amount: displayIndividualAmount, 
              remarks: remarks  
            }],
            totalAmount: displayAmount // フロントの合計金額をそのままメインシート用に採用（足し算は一切しない）
          };
          groupedItems.push(currentItem);
        } else {
          // 💡 項目が存在しない行 ＝ 内訳明細行（直前の項目グループにぶら下げる）
          if (currentItem) {
            currentItem.contents.push({
              name: rowName,
              qty: qty,
              unit: unit,
              price: displayPrice,
              amount: displayIndividualAmount,
              remarks: remarks  
            });
            // ※ メインシート用の金額（totalAmount）への足し算（+=）は絶対に行いません
          }
        }
      });
      
      // ✅ 変更：内容1が「グループの小計」ではなく自分自身の金額を持つ形になったため、
      //   従来あった「内容1の備考に"小計"を追加する」処理は廃止（意味を失ったため）

      const isGroupedCountLarge = uniqueCats.length >= 9;

      // =====================================
      // 「通常展開（フルデータ）」の二次元配列を作成（※明細シート用）
      // =====================================
      let fullRowsData = [];
      groupedItems.forEach((item, itemIndex) => {
        item.contents.forEach((content, index) => {
          let rowArray = ["", "", "", "", "", "", "", "", "", "", "", ""];
          
          let displayName = content.name || "";
          
          if (index === 0) {
            rowArray[0] = item.category;
            rowArray[2] = displayName;
            rowArray[7] = content.qty || "";
            rowArray[8] = content.unit;
            rowArray[9] = content.price;      
            rowArray[10] = content.amount;    
            rowArray[11] = "";
          } else {
            rowArray[2] = displayName;
            rowArray[7] = content.qty || "";
            rowArray[8] = content.unit || "";
            rowArray[9] = content.price || "";
            rowArray[10] = content.amount || "";
            rowArray[11] = ""; 
          }

          const isRowEmpty = !displayName && 
                             (!content.qty || content.qty === 0) && 
                             !content.unit && 
                             (!content.price || content.price === 0) && 
                             (!content.amount || content.amount === 0);

          if (!(index > 0 && isRowEmpty)) { fullRowsData.push(rowArray); }
          
          if (content.remarks && content.remarks.length > 0) {
            content.remarks.forEach(remark => {
              let remarkRow = ["", "", "", "", "", "", "", "", "", "", "", ""];
              remarkRow[2] = remark; 
              fullRowsData.push(remarkRow);
            });
          }
        });
      
        // ✅ 修正：カテゴリ数が多い場合（isGroupedCountLarge）は空行を挿入しない。
        //   これにより、実際に書き込まれる行数（totalFullRows）が「空行を挿入しない条件」を
        //   正しく反映した数になる（16行判定とズレないようにするため）
        if (!isGroupedCountLarge && itemIndex < groupedItems.length - 1) {
          fullRowsData.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
        }
      });
      
      let totalFullRows = fullRowsData.length;
      
      // =====================================
      // 「見積書用ダイジェスト」の二次元配列を作成（※メインシート用）
      // =====================================
      let estimateRowsData = [];

      groupedItems.forEach((item, index) => {
        let rowArray = ["", "", "", "", "", "", "", "", "", "", "", ""];
        let firstContent = item.contents[0];
        
        let displayName = firstContent ? (firstContent.name || "") : "";
        
        rowArray[0] = item.category;
        rowArray[2] = displayName;
        rowArray[7] = firstContent ? (firstContent.qty || "") : "";
        rowArray[8] = firstContent ? firstContent.unit : "";
        rowArray[9] = firstContent ? firstContent.price : "";
        rowArray[10] = item.totalAmount;     // 💡 項目行から直接取得した合計金額をそのまま100%信頼して流し込み
        rowArray[11] = ""; 
        
        estimateRowsData.push(rowArray);
        
        if (!isGroupedCountLarge && index < groupedItems.length - 1) {
          estimateRowsData.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
        }
      });

      // =====================================
      // 末尾に追加するサマリー3行（小計・消費税・合計）の定義
      // =====================================
      const subtotalAmount = data.subtotal ?? 0;
      const taxAmount = data.tax ?? data.taxAmount ?? 0;
      const finalTotal = data.totalAmount ?? data.total ?? 0;

      const summaryRows = [
        ["", "", "", "", "", "", "", "", "", "                                        小 計  （税抜）", subtotalAmount, ""],
        ["", "", "", "", "", "", "", "", "", "                                        消 費 税 10%", taxAmount, ""],
        ["", "", "", "", "", "", "", "", "", "                                        合 計  （税込）", finalTotal, ""]
      ];

      let maxMeisaiUsed = 0;

      // =====================================
      // 4. 【条件分岐】合計行数および親項目数に応じた書き込み処理
      // =====================================
      if (totalFullRows <= 16) {
        let finalRows = [...fullRowsData];
        while (finalRows.length < 16) {
          finalRows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
        }
        if (finalRows.length > 16) finalRows = finalRows.slice(0, 16);
        mitsumoriSheet.getRange(15, 2, 16, 12).setValues(finalRows); 
        maxMeisaiUsed = 0; 
        processLog.push(`✓ パターン1: 見積書シートに明細データを16行書き込み（明細シートなし）`);
      } else {
        estimateRowsData.forEach(row => { row[9] = ""; }); 
        while (estimateRowsData.length < 16) {
          estimateRowsData.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
        }
        if (estimateRowsData.length > 16) estimateRowsData = estimateRowsData.slice(0, 16);
        mitsumoriSheet.getRange(15, 2, 16, 12).setValues(estimateRowsData);

        let sheetIndex = 1;
        let currentSheetRows = [];
        let k = 0;
        
        while (true) {
          let remainingDataRows = fullRowsData.length - k;
          if (remainingDataRows <= 21) {
            while (k < fullRowsData.length) {
              currentSheetRows.push(fullRowsData[k]);
              k++;
            }
            while (currentSheetRows.length < 21) {
              currentSheetRows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
            }
            currentSheetRows = currentSheetRows.concat(summaryRows);
            // 「最終シート」書き込み部分
            let meisaiSheet = copySs.getSheetByName("明細" + sheetIndex);
            if (!meisaiSheet) {
              meisaiSheet = createAdditionalMeisaiSheet_(copySs, sheetIndex);
            }
            meisaiSheet.getRange(4, 2, 24, 12).setValues(currentSheetRows);
            maxMeisaiUsed = sheetIndex;
            processLog.push(`✓ 明細${sheetIndex}（最終シート）の末尾に小計・税・合計を書き込み`);
            break; 
          } else {
            for (let i = 0; i < 23; i++) {
              if (k < fullRowsData.length) {
                currentSheetRows.push(fullRowsData[k]);
                k++;
              }
            }
            while (currentSheetRows.length < 23) {
              currentSheetRows.push(["", "", "", "", "", "", "", "", "", "", "", ""]);
            }
            currentSheetRows.push(["", "", "", "", "", "", "", "", "", "", "", "次のページへ"]);
            // 「最終シート」書き込み部分
            let meisaiSheet = copySs.getSheetByName("明細" + sheetIndex);
            if (!meisaiSheet) {
              meisaiSheet = createAdditionalMeisaiSheet_(copySs, sheetIndex);
            }
            meisaiSheet.getRange(4, 2, 24, 12).setValues(currentSheetRows);
            maxMeisaiUsed = sheetIndex;
            processLog.push(`✓ 明細${sheetIndex}（最終シート）の末尾に小計・税・合計を書き込み`);
            sheetIndex++;
            currentSheetRows = [];
          }
        }
      }

      // =====================================
      // ページ番号設定
      // =====================================
      const totalPages = maxMeisaiUsed + 1;

      mitsumoriSheet.getRange("M36").setValue(`P. 1/${totalPages}`);
      for (let i = 1; i <= maxMeisaiUsed; i++) {
        const meisaiSheet = copySs.getSheetByName(`明細${i}`);
        if (meisaiSheet) {
          meisaiSheet.getRange("M29").setValue(`P. ${i + 1}/${totalPages}`);
        }
      }

      // =====================================
      // 不要な明細シート削除（自動増設にも対応：全シートを走査して判定）
      // =====================================
      copySs.getSheets().forEach(sh => {
        const match = sh.getName().match(/^明細(\d+)$/);
        if (match) {
          const idx = parseInt(match[1], 10);
          if (idx > maxMeisaiUsed) {
            copySs.deleteSheet(sh);
          }
        }
      });
    }

    SpreadsheetApp.flush();
    processLog.push(`✓ スプレッドシート保存を確定`);
    Utilities.sleep(1000);  

  } catch (dataError) {
    throw new Error(`データ流し込み失敗。エラー: ${dataError.message}`);
  }

  processLog.push("【5. PDF エクスポート】");
  try {
    blob = exportSpreadsheetToPdfBlob_(copySs.getId());
  } catch (exportError) {
    throw new Error(`PDF エクスポート失敗。エラー: ${exportError.message}`);
  }

  processLog.push("【6. PDF をフォルダに保存 / 7. クリーンアップ】");
  let fileName = `御見積書_${estimateNo}_${data.clientName || "見積"}_（${loginUserName}）.pdf`;
  try {
    pdfUrl = saveBlobToFolderAndCleanup_(blob, folder, fileName, copyFile);
  } catch (saveError) {
    throw new Error(`フォルダへの保存失敗。エラー: ${saveError.message}`);
  }

  return {
    success: true,
    pdfUrl: pdfUrl,
    fileName: fileName,
    log: processLog.join("\n")
  };
}
