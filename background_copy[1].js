let idList = [];
let processList = [];
let currentIndex = 0;

import {
    base_EK_URL,
    EK_sendMail_URL,
    EK_checkMail_URL,
    base_AG_URL,
    AG_sendMail_URL,
    AG_checkMail_URL,
    EK_mailtext_URL,
    AG_mailtext_URL,
    AX_mailtext_URL,
    base_AX_URL,
    AX_sendMail_URL,
    AX_checkMail_URL,
    subjectInsStr
} from './urlConfig.js';

import{
    AIRTRIP_title,
    AIRTRIP_message,
    AIRTRIP_overmessage,
    insertText,
    countWord
}from './message_text.js'


// --------------------------
// 進捗更新
// --------------------------
function updateProgress() {
    const percent = idList.length > 0 ? Math.round((currentIndex / idList.length) * 100) : 0;
    chrome.storage.local.set({
        currentIndex,
        statusText: `実行中: ${currentIndex} / ${idList.length}`,
        percent
    });
}

// --------------------------
// URL作成（rowIDとURLを用いてURLを生成）
// --------------------------
function getURL(rawID, URL) {
    console.log("getURL:" + rawID);
    if (rawID.startsWith("EK")) {
        console.log("EK:" + URL + rawID.replace(/^EK0/, ""));
        return URL + rawID.replace(/^EK0/, "");
    } else if (rawID.startsWith("AG")) {
        console.log("AG:" + URL + rawID.replace(/^AG0/, ""));
        return URL + rawID.replace(/^AG0/, "");
    } else if (rawID.startsWith("AX")) {
        console.log("AX:" + URL + rawID.replace(/^AX000/, ""));
        return URL + rawID.replace(/^AX000/, "");
    }
    return null;
}

// --------------------------
// タブを開く（ページロード完了待機）
// --------------------------
function openOrUpdateTab(targetURL) {
    return new Promise(resolve => {
        chrome.tabs.create({ url: targetURL, active: true }, tab => {
            const newTabId = tab.id;
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === newTabId && changeInfo.status === "complete") {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(newTabId);
                }
            });
        });
    });
}

function urlCreate(id) {
    let creURL = "";

    if (id.startsWith("EK")) {
        creURL = getURL(id, base_EK_URL)
    } else if (id.startsWith("AG")) {
        creURL = getURL(id, base_AG_URL)
    } else if (id.startsWith("AX")) {
        creURL = getURL(id, base_AX_URL)
    }

    return creURL;
}

// --------------------------
// リセット
// --------------------------
function resetProgress() {
    idList = [];
    processList = [];
    currentIndex = 0;
    chrome.storage.local.set({
        idInput: "",
        processInput: "",
        currentIndex: 0,
        statusText: "未実行",
        percent: 0
    });
}

// --------------------------
// メール送信画面前チェック
// --------------------------
async function handleMailConfirmPage(tabId, headDeleteRange, countWord) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (subjectInsStr, headRange, insertText, countWord) => {
                const headerArea = document.querySelector("textarea[name='mail[header]']");
                const contentArea = document.querySelector("textarea[name='mail[content]']");
                if (!headerArea || !contentArea) return;

                // --- ヘッダー加工 ---
                const headerLines = headerArea.value.split('\n');
                const filteredHeader = headerLines
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith("Subject"));
                filteredHeader.push(subjectInsStr);
                headerArea.value = filteredHeader.join('\n');

                // --- 本文加工 ---
                let lines = contentArea.value.split(/\r?\n/);

                // 1. headRange削除
                let insertPos = 0;
                if (headRange && typeof headRange.from === "number" && typeof headRange.to === "number") {
                    insertPos = headRange.from;  // 削除開始位置を保存
                    lines.splice(headRange.from, headRange.to - headRange.from + 1);
                }

                // 2. headRange削除位置に insertText を挿入
                lines.splice(insertPos, 0, insertText);

                // 3. countWord基準で削除（1行上から39行分）
                const countIndex = lines.findIndex(line => line.includes(countWord));
                if (countIndex !== -1) {
                    const deleteStart = Math.max(countIndex - 1, 0);
                    const deleteEnd = deleteStart + 39; // 39行分
                    const safeEnd = Math.min(deleteEnd, lines.length - 1);
                    lines.splice(deleteStart, safeEnd - deleteStart + 1);
                }

                // 4. 結果を反映
                contentArea.value = lines.join("\n");

            },
            args: [subjectInsStr, headDeleteRange, insertText, countWord]
        });
    } catch (err) {
        console.error("handleMailConfirmPage 実行エラー:", err);
    }
}


// --------------------------
// 色分け処理（1件だけ）
// --------------------------
async function runProcessSequentially(tabId, procItem) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            world: "MAIN",
            func: (procItem) => {
                const map = { "区間1": 0, "区間2": 1, "区間3": 2, "区間4": 3 };
                const idx = map[procItem] ?? -1;
                if (idx === -1) return { ok: false, message: "該当なし", procItem };
                const buttons = document.querySelectorAll("input.check_button[value='予約確認']");
                if (buttons && buttons[idx]) {
                    buttons[idx].click();
                    return new Promise(resolve => {
                        window.addEventListener("load", () => resolve({ ok: true, clickedIndex: idx, procItem }), { once: true });
                        setTimeout(() => resolve({ ok: true, clickedIndex: idx, procItem }), 1500);
                    });
                } else {
                    return { ok: false, message: "ボタンが見つからない", procItem };
                }
            },
            args: [procItem]
        });

        console.log("クリック結果:", results);
        return results[0]?.result?.clickedIndex ?? null;
    } catch (err) {
        console.error("executeScriptエラー:", err);
        return null;
    }
}

// --------------------------
// 次のID処理（色分けモード）
// --------------------------
async function proceedNext() {
    chrome.storage.local.get(["idInput", "processInput", "currentIndex"], async ({ idInput, processInput, currentIndex: savedIndex }) => {
        if (!idInput || !processInput) return;

        if (idList.length === 0) {
            idList = idInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);
        }
        if (processList.length === 0) {
            processList = processInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);
        }

        if (savedIndex !== undefined) currentIndex = savedIndex;
        if (currentIndex >= idList.length) {
            chrome.storage.local.set({ statusText: `実行完了`, percent: 100 });
            return;
        }

        const rawID = idList[currentIndex];
        const procItem = processList[currentIndex];

        if (!procItem || !["区間1", "区間2", "区間3", "区間4"].includes(procItem)) {
            console.warn("proceedNext: procItem が不正です", procItem);
            return;
        }

        let targetURL = "";
        targetURL = urlCreate(rawID);

        if (targetURL == "") {
            return;
        }

        currentIndex++;
        updateProgress();

        // タブを開く
        const tabId = await openOrUpdateTab(targetURL);

        // content_scripts を明示的に inject
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["content_scripts/extractTableData.js"]
            });
            console.log("extractTableData.js 注入完了");
        } catch (e) {
            console.error("content_scripts 注入エラー:", e);
            return;
        }

        await new Promise(r => setTimeout(r, 200));

        // extractTableData を取得（DOM生成待機リトライ）
        let extractedArray = null;
        const maxRetries = 10;
        for (let i = 0; i < maxRetries; i++) {
            const extractResults = await chrome.scripting.executeScript({
                target: { tabId },
                func: (procItem) => window.extractTableData?.(procItem) || null,
                args: [procItem]
            });
            extractedArray = extractResults[0]?.result;
            if (extractedArray) break;
            await new Promise(r => setTimeout(r, 300));
        }

        console.log("proceedNext: 抽出配列", extractedArray);

        // 既存の色分け処理
        await runProcessSequentially(tabId, procItem);
    });
}

// --------------------------
// タブ内特定URL判定 + thチェック
// --------------------------
async function checkTabPage(tabId, urlPrefix, thText) {
    const urlRes = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.location.href
    });
    const currentURL = urlRes[0]?.result || "";
    if (!currentURL.startsWith(urlPrefix)) return false;

    const thResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: (thText) => {
            const th = Array.from(document.querySelectorAll("th")).find(el => el.textContent.includes(thText));
            return !!th;
        },
        args: [thText]
    });

    return thResult[0]?.result || false;
}


// --------------------------
// SCメール処理（memo_text 書き込み条件付き）
// --------------------------
async function runCheckMailForID(rawID) {
    if (!rawID) return;

    chrome.storage.local.set({ currentRawID: rawID });


    // idList / processList が未取得なら取得
    if (idList.length === 0 || processList.length === 0) {
        const data = await chrome.storage.local.get(["idInput", "processInput"]);
        idList = data.idInput ? data.idInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean) : [];
        processList = data.processInput ? data.processInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean) : [];
    }

    const { currentIndex: savedIndex } = await chrome.storage.local.get("currentIndex");
    const idx = savedIndex ?? 0;
    const procItem = processList[idx];
    if (!procItem) return;

    // URL 作成
    let targetURL = "";
    targetURL = urlCreate(rawID);

    if (targetURL == "") {
        return;
    }

    // Aタブを開く
    const tabAId = await openOrUpdateTab(targetURL);

    // content_scripts 注入
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabAId },
            files: ["content_scripts/extractTableData.js"]
        });
    } catch (e) {
        console.error("content_scripts 注入エラー:", e);
        return;
    }

    await new Promise(r => setTimeout(r, 200));

    // 既存の色分け処理 → Bタブが開く
    const clickedIndex = await runProcessSequentially(tabAId, procItem);
    if (clickedIndex === null) return;

    // Bタブを取得（自動で開かれたタブ）
    const tabBId = await new Promise(resolve => {
        chrome.tabs.query({ active: true }, tabs => resolve(tabs[0].id));
    });

    // forbiddenWords 配列
    const forbiddenWords = ["APJ", "JJP", "IBX", "SFJ", "ADO", "SJF"];

    // extractTableData を取得
    const extractResults = await chrome.scripting.executeScript({
        target: { tabId: tabBId },
        func: (procItem, forbiddenWords) => {
            const data = window.extractTableData?.(procItem) || [];
            // forbiddenWords チェック（部分一致）
            const found = forbiddenWords.length > 0 && data.some(field =>
                forbiddenWords.some(word => field.includes(word))
            );
            return found ? null : data;
        },
        args: [procItem, forbiddenWords]
    });

    const extractedData = extractResults[0]?.result;
    if (!extractedData) {
        // タブ上で通知
        await chrome.scripting.executeScript({
            target: { tabId: tabBId },
            func: () => {
                const div = document.createElement("div");
                div.textContent = "対象が違います";
                div.style.position = "fixed";
                div.style.top = "10px";
                div.style.left = "10px";
                div.style.backgroundColor = "red";
                div.style.color = "white";
                div.style.padding = "5px 10px";
                div.style.zIndex = 9999;
                document.body.appendChild(div);
                setTimeout(() => div.remove(), 3000);
            }
        });
        console.warn("extractTableData: forbiddenWords に該当、処理中断");
        return; // memo_text 書き込みやボタンクリックは実行されない
    }

    // Bタブの URL & th 判定
    const isTargetPage = await checkTabPage(tabBId, "AAAAA", "判定用文言");

    if (isTargetPage) {
        // memo_text 書き込み & confirm_button は Aタブに対して実行
        await chrome.scripting.executeScript({
            target: { tabId: tabAId },
            func: (procItem, data) => {
                const memoText = document.getElementById("memo_text");
                if (!memoText) return;

                let newLine = `${procItem}元 ${data[1]} (${data[2]})`;
                newLine = newLine.replace(/\s+/g, "\n") + "\n\n";
                memoText.value = newLine + memoText.value;

                const btn = document.querySelector(".confirm_button");
                if (btn) btn.click();
            },
            args: [procItem, extractedData]
        });
    } else {
        console.log("memo_text 書き込みは行わない");
    }

    // メール送信・確認ページを開く
    let sendURL = "", checkURL = "";
    if (rawID.startsWith("EK")) {
        sendURL = getURL(rawID, EK_sendMail_URL);
        checkURL = getURL(rawID, EK_checkMail_URL);
    } else if (rawID.startsWith("AG")) {
        sendURL = getURL(rawID, AG_sendMail_URL);
        checkURL = getURL(rawID, AG_checkMail_URL);
    } else if (rawID.startsWith("AX")) {
        sendURL = getURL(rawID, AX_sendMail_URL);
        checkURL = getURL(rawID, AX_checkMail_URL);
    } else return;

    await openOrUpdateTab(sendURL);
    await openOrUpdateTab(checkURL);

    // currentIndex 更新
    currentIndex = idx + 1;
    const percent = Math.round((currentIndex / idList.length) * 100);
    let statusText = `checkMail: ${currentIndex} / ${idList.length} 件処理`;
    if (currentIndex >= idList.length) statusText = "checkMail: 全件処理完了";

    chrome.storage.local.set({ currentIndex, statusText, percent });
}


// --------------------------
// メール確認文面画面でチェック
// --------------------------
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete" && tab.url) {
        // 現在処理中の rawID を取得
        const { currentRawID } = await chrome.storage.local.get("currentRawID");
        if (!currentRawID) return;
        console.log(currentRawID);

        let expectedURL = "";

        if (currentRawID.startsWith("EK")) expectedURL = getURL(currentRawID, EK_mailtext_URL)
        else if (currentRawID.startsWith("AG")) expectedURL = getURL(currentRawID, AG_mailtext_URL)
        else if (currentRawID.startsWith("AX")) expectedURL = getURL(currentRawID, AX_mailtext_URL);

        console.log(expectedURL);
        if (!expectedURL) return;

        // タブURLが一致するか確認（完全一致 or startsWith）
        if (tab.url === expectedURL || tab.url.startsWith(expectedURL)) {
            // 一致したら処理開始
            const headDelete = { from: 3, to: 6 }; // 文書先頭から3〜5行目を削除
            handleMailConfirmPage(tabId,headDelete,countWord);
        }
    }
});


// --------------------------
// メッセージ受信
// --------------------------
chrome.runtime.onMessage.addListener((message) => {
    console.log("受信メッセージ:", message);
    if (message.action === "next") proceedNext();
    else if (message.action === "reset") resetProgress();
    else if (message.action === "checkMail") {
        if (!message.rawID) return;
        runCheckMailForID(message.rawID);
    }
});