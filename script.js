// --- script.js の リアルタイム表示 部分を修正 ---
// (onSnapshotの中)
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            const stepsListHTML = data.steps ? data.steps.map(step => `<li>${step}</li>`).join('') : '';
            
            // 🔥 【修正】単位によって並び順を変える条件分岐を追加（リスト形式に反映）
            const ingredientsHTML = data.ingredients ? data.ingredients.map(i => {
                let amountElement;
                if (i.unit === '大さじ' || i.unit === '小さじ') {
                    // 大さじ・小さじなら：[単位][量]
                    amountElement = `<span class="ing-amount">${i.unit} ${i.amount}</span>`;
                } else {
                    // それ以外なら：[量][単位]
                    amountElement = `<span class="ing-amount">${i.amount}${i.unit}</span>`;
                }
                // 材料名 + 量・単位
                return `<li class="ingredient-item"><span class="ing-name">${i.name}</span>${amountElement}</li>`;
            }).join('') : '';

            const card = document.createElement('div');
// (以下略)
