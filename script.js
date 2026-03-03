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

/* =============================
   合言葉（ルールと一致させる）
============================= */
const SECRET_WORD = "8484"; // ← Firestoreルールの合言葉と同じ

/* =============================
   合言葉チェック（無限ループ）
   正しいまで閲覧できない運用
============================= */
function checkSecretAtStart() {
  const saved = localStorage.getItem("secretKey");
  if (saved === SECRET_WORD) return;

  let input = null;
  while (input !== SECRET_WORD) {
    input = prompt("閲覧・投稿するにはパスワードを入力してください");

    if (input === null) {
      alert("このページを利用するにはパスワードが必要です。");
      continue;
    }
    if (input !== SECRET_WORD) {
      alert("パスワードが違います。");
    }
  }

  localStorage.setItem("secretKey", SECRET_WORD);
  alert("認証成功");
}
checkSecretAtStart();

/* =============================
   Firebase設定
============================= */
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

const recipeForm = document.getElementById("recipe-form");
const container = document.getElementById("container");
const submitBtn = document.querySelector(".submit-btn");
const searchBox = document.getElementById("search-box");

let tempIngredients = [];
let tempSteps = [];
let editingId = null;

/* =============================
   分数変換（1と½形式）
============================= */
function toFraction(num) {
  const whole = Math.floor(num);
  const decimal = Number((num - whole).toFixed(2));

  const fractionMap = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

  if (decimal === 0) return whole.toString();

  if (fractionMap[decimal]) {
    if (whole > 0) return `${whole}と${fractionMap[decimal]}`;
    return fractionMap[decimal];
  }

  return num
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

/* =============================
   検索用：文字列正規化
============================= */
function normalizeText(s) {
  return (s || "").toString().toLowerCase().trim();
}

/* =============================
   一時リスト表示
============================= */
function updateTempList(listId, dataArray, type) {
  const listElement = document.getElementById(listId);
  listElement.innerHTML = "";

  dataArray.forEach((item, index) => {
    const li = document.createElement("li");

    const text =
      type === "ingredients"
        ? `${item.name || ""} ${item.amount || ""}${item.unit || ""}`
        : (item || "");

    li.innerHTML = `
      <span>${text}</span>
      <button type="button" class="remove-temp-btn" data-index="${index}">
        削除
      </button>
    `;
    listElement.appendChild(li);
  });
}

/* =============================
   一時削除（イベント委任）
============================= */
document.addEventListener("click", (e) => {
  if (!e.target.classList.contains("remove-temp-btn")) return;

  const index = Number(e.target.dataset.index);

  if (e.target.closest("#ingredient-list")) {
    tempIngredients.splice(index, 1);
    updateTempList("ingredient-list", tempIngredients, "ingredients");
  }

  if (e.target.closest("#step-list")) {
    tempSteps.splice(index, 1);
    updateTempList("step-list", tempSteps, "steps");
  }
});

/* =============================
   材料追加
   ✅ 単位なしOK / 少々・適量など（量なしでもOK）
============================= */
document.getElementById("add-ingredient-btn").addEventListener("click", () => {
  const name = document.getElementById("temp-ingredient").value.trim();
  const amountRaw = document.getElementById("temp-amount-num").value; // 空もあり
  const unit = document.getElementById("temp-unit").value; // ""もあり

  if (!name) return;

  // 量は空でもOK（少々・適量・単位なしの時など）
  tempIngredients.push({
    name,
    amount: amountRaw, // 文字列のまま持つ
    unit
  });

  updateTempList("ingredient-list", tempIngredients, "ingredients");

  document.getElementById("temp-ingredient").value = "";
  document.getElementById("temp-amount-num").value = "";
});

/* =============================
   手順追加
============================= */
document.getElementById("add-step-btn").addEventListener("click", () => {
  const step = document.getElementById("temp-step").value.trim();
  if (!step) return;

  tempSteps.push(step);
  updateTempList("step-list", tempSteps, "steps");
  document.getElementById("temp-step").value = "";
});

/* =============================
   投稿 / 更新（secret付与）
============================= */
recipeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const author = document.getElementById("author").value.trim();
  const point = document.getElementById("point").value.trim();
  const secret = localStorage.getItem("secretKey");

  if (!title || !author) {
    alert("投稿者名と料理名は必須です");
    return;
  }

  if (tempIngredients.length === 0 || tempSteps.length === 0) {
    alert("材料と手順を追加してください");
    return;
  }

  if (secret !== SECRET_WORD) {
    alert("投稿用パスワードが未認証です。再読み込みしてください。");
    return;
  }

  if (editingId) {
    await updateDoc(doc(db, "recipes", editingId), {
      title,
      author,
      ingredients: tempIngredients,
      steps: tempSteps,
      point,
      secret
    });

    editingId = null;
    submitBtn.textContent = "レシピを投稿する";
  } else {
    await addDoc(collection(db, "recipes"), {
      title,
      author,
      ingredients: tempIngredients,
      steps: tempSteps,
      point,
      createdAt: new Date(),
      secret
    });
  }

  recipeForm.reset();
  tempIngredients = [];
  tempSteps = [];
  document.getElementById("ingredient-list").innerHTML = "";
  document.getElementById("step-list").innerHTML = "";
});

/* =============================
   表示：検索対応のために
   snapshotの内容を保持して再描画する
============================= */
let cachedDocs = []; // [{id, data}...]

function buildSearchText(data) {
  const title = normalizeText(data.title);
  const author = normalizeText(data.author);
  const point = normalizeText(data.point);

  const ing = (data.ingredients || [])
    .map(i => `${i.name || ""} ${i.amount || ""} ${i.unit || ""}`)
    .join(" ");
  const steps = (data.steps || []).join(" ");

  return normalizeText(`${title} ${author} ${point} ${ing} ${steps}`);
}

function matchesSearch(data, rawQuery) {
  const q = normalizeText(rawQuery);
  if (!q) return true;

  // スペース区切りAND検索（例：「うどん だし」）
  const terms = q.split(/\s+/).filter(Boolean);
  const hay = buildSearchText(data);

  return terms.every(t => hay.includes(t));
}

function renderAll() {
  container.innerHTML = "";

  const q = searchBox ? searchBox.value : "";

  cachedDocs.forEach(({ id, data }) => {
    if (!matchesSearch(data, q)) return;

    let currentServings = 1;
    const card = document.createElement("div");
    card.className = "recipe-card";

    function renderIngredients(servings) {
      return (data.ingredients || []).map((i) => {
        const name = (i.name || "").trim();
        const unit = (i.unit || "").trim();
        const amountRaw = (i.amount ?? "").toString().trim();

        // ✅ 量が空でもOK（少々/適量/単位なし等）
        // 量が数値として読めるときだけ計算する
        const amountNum = amountRaw === "" ? NaN : parseFloat(amountRaw);
        const canCalc = !Number.isNaN(amountNum);

        // 量が数値でない/空の場合は、そのまま表示（単位があれば単位だけもOK）
        if (!canCalc) {
          // 単位だけ（少々/適量など）
          if (amountRaw === "" && unit) return `<li>${name} ${unit}</li>`;
          // 量だけ
          if (amountRaw && !unit) return `<li>${name} ${amountRaw}</li>`;
          // 量＋単位
          return `<li>${name} ${amountRaw}${unit}</li>`;
        }

        // ここから計算対象
        const newAmount = amountNum * servings;

        let amountText = "";
        if (unit === "小さじ") {
          const tablespoon = Math.floor(newAmount / 3);
          const teaspoon = Number((newAmount % 3).toFixed(2));

          const tbspText = tablespoon > 0 ? `大さじ${toFraction(tablespoon)}` : "";
          const tspText = teaspoon > 0 ? `小さじ${toFraction(teaspoon)}` : "";

          amountText = [tbspText, tspText].filter(Boolean).join(" ");
          if (!amountText) amountText = `小さじ0`; // 念のため
        } else if (unit === "大さじ") {
          amountText = `大さじ${toFraction(newAmount)}`;
        } else {
          // 単位なしOK
          amountText = unit ? `${toFraction(newAmount)}${unit}` : `${toFraction(newAmount)}`;
        }

        return `<li>${name} ${amountText}</li>`;
      }).join("");
    }

    const stepsHTML = data.steps
      ? data.steps.map((step) => `<li>${step}</li>`).join("")
      : "";

    card.innerHTML = `
      <h3>${data.title || ""}</h3>
      <small>投稿者: ${data.author || ""}</small>

      <div class="recipe-details">
        <div class="serving-row">
          <div>
            <strong>何人前：</strong>
            <button class="minus-btn">−</button>
            <span class="serving-count">1</span>
            <button class="plus-btn">＋</button>
          </div>

          <div class="card-actions">
            <button class="edit-btn">編集</button>
            <button class="delete-btn">削除</button>
          </div>
        </div>

        <p><strong>材料:</strong></p>
        <ul class="ingredient-list">
          ${renderIngredients(1)}
        </ul>

        <p><strong>手順:</strong></p>
        <ol>${stepsHTML}</ol>

        <p><strong>ポイント:</strong> ${data.point || ""}</p>
      </div>
    `;

    // カード開閉（ボタン類除外）
    card.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("delete-btn") ||
        e.target.classList.contains("edit-btn") ||
        e.target.classList.contains("plus-btn") ||
        e.target.classList.contains("minus-btn")
      ) return;
      card.classList.toggle("open");
    });

    // 人前
    const countSpan = card.querySelector(".serving-count");

    card.querySelector(".plus-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      currentServings++;
      countSpan.textContent = currentServings;
      card.querySelector(".ingredient-list").innerHTML = renderIngredients(currentServings);
    });

    card.querySelector(".minus-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentServings > 1) {
        currentServings--;
        countSpan.textContent = currentServings;
        card.querySelector(".ingredient-list").innerHTML = renderIngredients(currentServings);
      }
    });

    // 編集
    card.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();

      editingId = id;

      document.getElementById("title").value = data.title || "";
      document.getElementById("author").value = data.author || "";
      document.getElementById("point").value = data.point || "";

      tempIngredients = [...(data.ingredients || [])];
      tempSteps = [...(data.steps || [])];

      updateTempList("ingredient-list", tempIngredients, "ingredients");
      updateTempList("step-list", tempSteps, "steps");

      submitBtn.textContent = "更新する";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // 削除
    card.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("削除しますか？")) return;
      await deleteDoc(doc(db, "recipes", id));
    });

    container.appendChild(card);
  });
}

/* =============================
   Firestore購読 → キャッシュ → 描画
============================= */
onSnapshot(query(collection(db, "recipes"), orderBy("createdAt", "desc")), (snapshot) => {
  cachedDocs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
  renderAll();
});

/* =============================
   検索入力 → 再描画
============================= */
if (searchBox) {
  searchBox.addEventListener("input", () => {
    renderAll();
  });
}

