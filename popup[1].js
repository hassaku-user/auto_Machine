document.addEventListener("DOMContentLoaded", () => {
    const idInput = document.getElementById("idInput");
    const processInput = document.getElementById("processInput");
    const nextBtn = document.getElementById("nextBtn");
    const resetBtn = document.getElementById("resetBtn");
    const statusText = document.getElementById("statusText");
    const progress = document.getElementById("progress");

    // 保存された入力値と進捗をロード
    chrome.storage.local.get(
        ["idInput", "processInput", "currentIndex", "statusText", "percent", "mode"],
        data => {
            if (data.idInput) idInput.value = data.idInput;
            if (data.processInput) processInput.value = data.processInput;
            if (data.statusText) statusText.textContent = data.statusText;
            if (data.percent !== undefined) {
                progress.style.width = data.percent + "%";
                progress.textContent = data.percent + "%";
            }
            if (data.mode) {
                const modeRadio = document.querySelector(`input[name=mode][value=${data.mode}]`);
                if (modeRadio) modeRadio.checked = true;
            }
        }
    );

    // IDと処理項目の件数チェック
    const validateLists = () => {
        const ids = idInput.value.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(s => s);
        const procs = processInput.value.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(s => s);

        if (ids.length !== procs.length) {
            alert(`IDリストと処理項目リストの件数が一致していません。\nID: ${ids.length} 件, 処理項目: ${procs.length} 件`);
            resetLists();
            return false;
        }
        return true;
    };

    // リセット処理
    const resetLists = () => {
        idInput.value = "";
        processInput.value = "";
        statusText.textContent = "未実行";
        progress.style.width = "0%";
        progress.textContent = "0%";

        chrome.runtime.sendMessage({ action: "reset" });

        chrome.storage.local.set({
            idInput: "",
            processInput: "",
            currentIndex: 0,
            statusText: "未実行",
            percent: 0,
            mode: "checkColor"
        });
    };

    // === 次へボタン ===
    nextBtn.addEventListener("click", () => {
        if (!validateLists()) return;

        // モードを取得
        const mode = document.querySelector("input[name=mode]:checked").value;

        // 入力値とモードを保存
        chrome.storage.local.set({
            idInput: idInput.value,
            processInput: processInput.value,
            mode: mode
        });

        if (mode === "checkColor") {
            runCheckColor();
        } else if (mode === "checkMail") {
            runCheckMail();
        }
    });

    // === リセットボタン ===
    resetBtn.addEventListener("click", resetLists);

    // 進捗を定期更新
    const updateProgress = () => {
        chrome.storage.local.get(["statusText", "percent"], data => {
            if (data.statusText) statusText.textContent = data.statusText;
            if (data.percent !== undefined) {
                progress.style.width = data.percent + "%";
                progress.textContent = data.percent + "%";
            }
        });
    };

    setInterval(updateProgress, 500);
});

// =============================
// 既存処理
// =============================
function runCheckColor() {
    console.log("checkColor モードで実行");
    chrome.runtime.sendMessage({ action: "next" });
}

// =============================
// 新規処理（仮実装）
// =============================
function runCheckMail() {
    console.log("checkMail モードで実行（popup → background へ送信）");

    chrome.storage.local.get(["idInput", "processInput", "currentIndex"], ({ idInput, processInput, currentIndex }) => {
        if (!idInput || !processInput) return;

        const idList = idInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);
        const procList = processInput.split(/\r?\n|\u2028|\u2029/).map(s => s.trim()).filter(Boolean);

        if (currentIndex >= idList.length) return;

        const rawID = idList[currentIndex];
        const procItem = procList[currentIndex];

        // ID と対応する処理項目を background に渡す
        chrome.runtime.sendMessage({ action: "checkMail", rawID, procItem });
    });
}

document.getElementById("differenceBtn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "processDifference" });
});



