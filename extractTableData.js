window.extractTableData = function(procItem, forbiddenWords = []) {
    const tdElements = document.querySelectorAll("table.appli-basic td");
    const tdArray = Array.from(tdElements).map(td =>
        td.innerHTML.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean)
    );

    const bulletPartsArray = tdArray.flatMap(tdLines =>
        tdLines
            .map(line => line.replace(/[\n\t]/g,'').trim())
            .filter(line => /^\s*・\d{4}-\d{2}-\d{2}/.test(line))
            .map(line => line.split("/").map(s => s.trim()))
    );

    // forbiddenWords チェック
    if (forbiddenWords.length > 0) {
        const found = bulletPartsArray.some(arr =>
            arr.some(field =>
                forbiddenWords.some(word => field.includes(word))
            )
        );
        if (found) {
            return null; // memo_text 書き込み・ボタンクリックしない
        }
    }

    const indexMap = { "区間1":0,"区間2":1,"区間3":2,"区間4":3 };
    const idx = indexMap[procItem];

    if (idx === undefined || !bulletPartsArray[idx]) return null;
    return bulletPartsArray[idx]; // ["・2025-09-26", "東京", "羽田"]
}
