import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let tempIngredients = [];
let tempSteps = [];

// --- 一時リストの更新 ---
function updateTempList(listId, dataArray, type) {
    const listElement = document.getElementById(listId);
    listElement.innerHTML = '';
    dataArray.forEach((item, index) => {
        const li = document.createElement('li');
        let text = type === 'ingredients' ? `${item.name} ${item.amount}${item.unit}` : item;
        li.innerHTML = `<span>${text}</span> <button type="button" class="remove-temp-btn" data-index="${index}">削除</button>`;
        listElement.appendChild(li);
    });
}

// --- 材料・手順追加 ---
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

document.getElementById('add-step-btn').addEventListener('click', () => {
    const step = document.getElementById('temp-step').value;
    if (!step) return;
    tempSteps.push(step);
    updateTempList('step-list', tempSteps, 'steps');
    document.getElementById('temp-step').value = '';
});

// --- 投稿処理 ---
recipeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('title').value;
    const author = document.getElementById('author').value;
    const point = document.getElementById('point').value;
    
    if (tempIngredients.length === 0 || tempSteps.length === 0) {
        alert("材料と手順を追加してください");
        return;
    }
    
    await addDoc(collection(db, "recipes"), {
        title, author, ingredients: tempIngredients, steps: tempSteps, point, createdAt: new Date()
    });
    
    recipeForm.reset();
    tempIngredients = []; tempSteps = [];
    document.getElementById('ingredient-list').innerHTML = '';
    document.getElementById('step-list').innerHTML = '';
});

// --- リアルタイム表示とクリックイベント ---
onSnapshot(query(collection(db, "recipes"), orderBy("createdAt", "desc")), (snapshot) => {
    container.innerHTML = "";
    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <button class="delete-btn" data-id="${docSnap.id}">削除</button>
            <h3 class="card-title">${data.title}</h3>
            <small>投稿者: ${data.author}</small>
            <div class="recipe-details">
                <p><strong>材料:</strong> ${data.ingredients.map(i => i.name).join(', ')}</p>
                <p><strong>ポイント:</strong> ${data.point}</p>
            </div>
        `;
        
        // クリックで展開
        card.addEventListener('click', () => card.classList.toggle('open'));
        
        // 削除ボタン
        card.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation(); // 展開イベントを停止
            if(confirm('削除しますか？')) await deleteDoc(doc(db, "recipes", docSnap.id));
        });
        
        container.appendChild(card);
    });
});