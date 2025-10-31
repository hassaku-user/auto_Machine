window.addEventListener("load", () => {
  console.log("ページロード完了。要素を探します...");

  chrome.storage.local.get({ excludeWords: [], insertText: "" }, (data) => {
    let excludeWords = data.excludeWords.map(w => w.toUpperCase());
    excludeWords.push("重複");
    const insertText = (data.insertText || "").trim();

    console.log("除外ワード:", excludeWords);
    console.log("挿入名:", insertText || "(未設定)");

    let processed = false; // ページ単位で一度だけ処理

    const tryClick = () => {
      if (processed) return true; // すでに処理済みなら終了

      const trs = document.querySelectorAll("tr.header");
      for (const tr of trs) {
        if (processed) break; // 最初の1件だけ処理して終了

        const statusTd = tr.querySelector("td.header.status-1");

        // 条件1: ステータスに「◆◆AIRTRIP◆◆」
        if (statusTd && statusTd.textContent.includes("◆◆AIRTRIP◆◆")) {
          const memoDiv = tr.querySelector("div[id^='memo_html_']");
          const trstack = tr.textContent;

          // 条件2: 幼児チェック
          if (!trstack.includes("(幼:0)") && excludeWords.includes("幼児")) {
            console.log("幼児いるので飛ばす");
            continue;
          }

          if (memoDiv) {
            const text = memoDiv.textContent.trim().toUpperCase();
            console.log("memoDiv:", memoDiv.id, "=>", text);

            // 条件3: SKY が含まれていて、除外ワードは含まれない
            if (text.includes("SKY") && !excludeWords.some(word => text.includes(word))) {
              // ダブルクリック発火
              const dblClickEvent = new MouseEvent("dblclick", { bubbles: true, cancelable: true });
              memoDiv.dispatchEvent(dblClickEvent);
              console.log("dblclick 発火:", memoDiv.id);

              // textarea 出現チェック
              const observer = new MutationObserver(() => {
                if (processed) {
                  observer.disconnect();
                  return;
                }
                const memotext = document.querySelector("#memo_text"); 
                if (memotext) {
                  observer.disconnect();

                  if (!insertText) {
                    console.log("人名が未設定のため挿入しません");
                    processed = true;
                    return;
                  }

                  if (memotext.value.startsWith(insertText + "\n")) {
                    console.log("すでに人名が挿入済みなのでスキップ");
                    processed = true;
                    return;
                  }

                  //ここmemotextクリックしないと名前はいらない不具合あるけど逆にmemotextクリックすれば自動行けるんじゃね？
                  //明日の自分任せたぜ
                  
                  memotext.value = insertText + "\n" + memotext.value;
                  memotext.dispatchEvent(new Event("input", { bubbles: true }));

                  console.log(`textarea(#memo_text) に "${insertText}" を挿入しました`);
                  processed = true; // ✅ ここで完全終了
                }
              });

              observer.observe(document.body, { childList: true, subtree: true });

              return true; // ✅ 最初の1件だけ処理して終了
            }
          }
        }
      }
      return false;
    };

    // 最大5秒リトライ（0.5秒間隔）
    let elapsed = 0;
    const interval = setInterval(() => {
      if (tryClick()) {
        clearInterval(interval);
      } else if (elapsed >= 5000) {
        console.log("対象要素が見つかりませんでした。");
        clearInterval(interval);
      }
      elapsed += 500;
    }, 500);
  });
});
