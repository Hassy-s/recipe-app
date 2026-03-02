import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    query,
    orderBy,
    onSnapshot,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDpdyrbLK1eykTU9Rsc7Vwnxl9wWiAQHyA",
    authDomain: "my-recipe-app-dc90a.firebaseapp.com",
    projectId: "my-recipe-app-dc90a",
    storageBucket: "my-recipe-app-dc90a.firebasestorage.app",
    messagingSenderId: "255488999104",
    appId: "1:255488999104:web:bb46d14f7c8435b002b725"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const recipeForm = document.getElementById('recipe-form');
const container = document.getElementById('container');
const submitBtn = document.querySelector('.submit-btn');

let tempIngredients = [];
let tempSteps = [];
let editingId = null;

/* ----------------------------
   一時リスト表示
---------------------------- */
function updateTempList(listId, dataArray, type) {
    const listElement = document.getElementById(listId);
    listElement.innerHTML = '';

    dataArray.forEach((item, index) => {
        const li = document.createElement('li');

        let text = type === 'ingredients'
            ? `${item.name} ${item.amount}${item.unit}`
            : item;

        li.innerHTML = `
            <span>${text}</span>
            <button type="button" class="remove-temp-btn" data-index="${index}">
                削除
            </button>
        `;
        listElement.appendChild(li);
    });
}

/* ----------------------------
   🔥 一時削除（完全版）
---------------------------- */
document.addEventListener('click', (e) => {

    if (!e.target.classList.contains('remove-temp-btn')) return;

    const index = Number(e.target.dataset.index);

    // 材料削除
    if (e.target.closest('#ingredient-list')) {
        tempIngredients.splice(index, 1);
        updateTempList('ingredient-list', tempIngredients, 'ingredients');
    }

    // 手順削除
    if (e.target.closest('#step-list')) {
        tempSteps.splice(index, 1);
        updateTempList('step-list', tempSteps, 'steps');
    }
});

/* ----------------------------
   材料追加
---------------------------- */
document.getElementById('add-ingredient-btn').addEventListener('click', () => {
    const name = document.getElementById('temp-ingredient').value;
    const amount = document.getElementById('temp-amount-num').value;
    const unit = document.getElementById('temp-unit').value;

    if (!name) return;

    tempIngredients.push({ name, amount, unit });
    updateTempList('ingredient-list', tempIngredients, 'ingredients');

    document.getElementById('temp-ingredient').value = '';
    document.getElementById('temp-amount-num').value = '';
});

/* ----------------------------
   手順追加
---------------------------- */
document.getElementById('add-step-btn').addEventListener('click', () => {
    const step = document.getElementById('temp-step').value;
    if (!step) return;

    tempSteps.push(step);
    updateTempList('step-list', tempSteps, 'steps');
    document.getElementById('temp-step').value = '';
});

/* ----------------------------
   投稿 / 更新
---------------------------- */
recipeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('title').value;
    const author = document.getElementById('author').value;
    const point = document.getElementById('point').value;

    if (tempIngredients.length === 0 || tempSteps.length === 0) {
        alert("材料と手順を追加してください");
        return;
    }

    if (editingId) {
        await updateDoc(doc(db, "recipes", editingId), {
            title,
            author,
            ingredients: tempIngredients,
            steps: tempSteps,
            point
        });

        editingId = null;
        submitBtn.textContent = "投稿する";
    } else {
        await addDoc(collection(db, "recipes"), {
            title,
            author,
            ingredients: tempIngredients,
            steps: tempSteps,
            point,
            createdAt: new Date()
        });
    }

    recipeForm.reset();
    tempIngredients = [];
    tempSteps = [];
    document.getElementById('ingredient-list').innerHTML = '';
    document.getElementById('step-list').innerHTML = '';
});

/* ----------------------------
   レシピ表示
---------------------------- */
onSnapshot(
    query(collection(db, "recipes"), orderBy("createdAt", "desc")),
    (snapshot) => {

        container.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            let currentServings = 1;

            const card = document.createElement('div');
            card.className = 'recipe-card';

            function renderIngredients(servings) {
                return data.ingredients.map(i => {

                    const name = (i.name || '').trim();
                    let unit = (i.unit || '').trim();
                    let baseAmount = parseFloat(i.amount) || 0;
                    let newAmount = baseAmount * servings;

                    if (unit === "小さじ" && newAmount % 3 === 0) {
                        unit = "大さじ";
                        newAmount = newAmount / 3;
                    }

                    const formatted = newAmount
                        .toFixed(2)
                        .replace(/\.00$/, '')
                        .replace(/(\.\d)0$/, '$1');

                    let amountText =
                        ['大さじ', '小さじ'].includes(unit)
                            ? `${unit}：${formatted}`
                            : `${formatted}${unit}`;

                    return `
                        <li class="ingredient-item">
                            <span>${name}</span>
                            <span>${amountText}</span>
                        </li>
                    `;
                }).join('');
            }

            const stepsHTML = data.steps.map(step => `<li>${step}</li>`).join('');

            card.innerHTML = `
                <button class="edit-btn">編集</button>
                <button class="delete-btn" data-id="${docSnap.id}">削除</button>
                <h3>${data.title}</h3>
                <small>投稿者: ${data.author}</small>

                <div class="recipe-details">
                    <div>
                        <strong>何人前：</strong>
                        <button class="minus-btn">−</button>
                        <span class="serving-count">1</span>
                        <button class="plus-btn">＋</button>
                    </div>

                    <p><strong>材料:</strong></p>
                    <ul>${renderIngredients(1)}</ul>

                    <p><strong>手順:</strong></p>
                    <ol>${stepsHTML}</ol>

                    <p><strong>ポイント:</strong> ${data.point}</p>
                </div>
            `;

            container.appendChild(card);
        });
    }
);
