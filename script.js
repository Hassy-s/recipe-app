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
const SECRET_WORD = "8484";

/* =============================
   合言葉チェック（無限ループ）
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

/* 追加：単位まわり */
const unitSelectEl = document.getElementById("temp-unit");
const customUnitRowEl = document.getElementById("custom-unit-row");
const customUnitInputEl = document.getElementById("temp-unit-custom");

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
   オートコンプリート（datalist）
   - クリックだけで全部出ない
   - 1文字から絞り込み
============================= */
const INGREDIENT_PRESETS = [
  "砂糖", "塩", "酢", "醤油", "味噌", "みりん", "酒", "水",
  "だし", "顆粒だし", "ほんだし", "白だし",
  "にんにく", "しょうが", "長ねぎ", "玉ねぎ",
  "ごま油", "サラダ油", "オリーブオイル",
  "こしょう", "ブラックペッパー", "一味", "七味",
  "ごま", "すりごま", "片栗粉", "小麦粉"
];

function updateIngredientDatalist(names = []) {
  const dl = document.getElementById("ingredient-suggestions");
  if (!dl) return;

  const set = new Set();
  names.forEach(n => {
    const s = (n || "").toString().trim();
    if (s) set.add(s);
  });

  const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  dl.innerHTML = sorted.map(n => `<option value="${n}"></option>`).join("");
}

// 初期は空
updateIngredientDatalist([]);

let cachedDocs = []; // [{id, data}...]

function rebuildIngredientSuggestions() {
  const input = document.getElementById("temp-ingredient");
  if (!input) return;

  const q = input.value.trim().toLowerCase();

  if (q.length === 0) {
    updateIngredientDatalist([]);
    return;
  }

  const presetFiltered = INGREDIENT_PRESETS.filter(n => n.toLowerCase().includes(q));
  const namesFromRecipes = cachedDocs.flatMap(x =>
    (x.data.ingredients || []).map(i => i.name)
  );

  const limit = (q.length === 1) ? 12 : 30;

  const historyFiltered = namesFromRecipes
    .map(s => (s || "").toString().trim())
    .filter(Boolean)
    .filter(n => n.toLowerCase().includes(q))
    .slice(0, limit);

  const combined = [...presetFiltered, ...historyFiltered].slice(0, limit);
  updateIngredientDatalist(combined);
}

const ingredientInputEl = document.getElementById("temp-ingredient");
if (ingredientInputEl) {
  ingredientInputEl.addEventListener("input", rebuildIngredientSuggestions);
  ingredientInputEl.addEventListener("focus", rebuildIngredientSuggestions);
}

/* =============================
   単位：その他入力の表示切替
============================= */
function setCustomUnitVisible(visible) {
  if (!customUnitRowEl || !customUnitInputEl) return;
  customUnitRowEl.style.display = visible ? "block" : "none";
  if (!visible) customUnitInputEl.value = "";
}

if (unitSelectEl) {
  unitSelectEl.addEventListener("change", () => {
    const isOther = unitSelectEl.value === "__other__";
    setCustomUnitVisible(isOther);
    if (isOther && customUnitInputEl) customUnitInputEl.focus();
  });
}

/* =============================
   神小技：最近使った単位をselectに一時追加
   （今あるレシピから集計 → レシピ削除で自然に消える）
============================= */
function updateRecentUnitOptions() {
  if (!unitSelectEl) return;

  // 既存<option>のうち、固定の単位一覧（__other__ と空は除外）
  const fixedUnits = new Set(
    Array.from(unitSelectEl.options)
      .map(o => o.value)
      .filter(v => v && v !== "__other__" && !String(v).startsWith("__recent__:"))
  );

  // まず前回の「最近」候補を消す
  Array.from(unitSelectEl.options).forEach(opt => {
    if (String(opt.value).startsWith("__recent__:")) opt.remove();
  });

  // レシピから unit を集計（固定以外 = カスタム単位扱い）
  const unitsFromRecipes = cachedDocs.flatMap(x =>
    (x.data.ingredients || []).map(i => (i.unit || "").toString().trim())
  ).filter(Boolean);

  const customUnits = Array.from(new Set(unitsFromRecipes))
    .filter(u => u !== "__other__")
    .filter(u => !fixedUnits.has(u))
    .slice(0, 10);

  if (customUnits.length === 0) return;

  // 「その他…」の直前に差し込む
  const otherIndex = Array.from(unitSelectEl.options).findIndex(o => o.value === "__other__");
  const insertIndex = otherIndex >= 0 ? otherIndex : unitSelectEl.options.length;

  customUnits.forEach(u => {
    const opt = document.createElement("option");
    opt.value = `__recent__:${u}`; // 内部用
    opt.textContent = `★ ${u}`;     // 表示は分かりやすく
    unitSelectEl.add(opt, insertIndex);
  });
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
   よく使う材料ボタン：材料名+単位
============================= */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".quick-ing");
  if (!btn) return;

  const name = btn.dataset.name || "";

  const ingredientInput = document.getElementById("temp-ingredient");
  const amountInput = document.getElementById("temp-amount-num");

  if (!ingredientInput || !unitSelectEl || !amountInput) return;

  ingredientInput.value = name;

  const defaultUnits = {
    "水": "ml",
    "砂糖": "g",
    "塩": "g",
    "醤油": "大さじ",
    "みりん": "大さじ",
    "酒": "大さじ",
    "酢": "大さじ",
    "味噌": "g"
  };

  unitSelectEl.value = defaultUnits[name] ?? "";
  amountInput.value = "";

  // その他入力は閉じる
  setCustomUnitVisible(false);

  rebuildIngredientSuggestions();
  ingredientInput.focus();
});

/* =============================
   材料追加（その他チェック付き）
============================= */
document.getElementById("add-ingredient-btn").addEventListener("click", () => {
  const name = document.getElementById("temp-ingredient").value.trim();
  const amountRaw = document.getElementById("temp-amount-num").value; // 空もあり
  const unitRaw = unitSelectEl ? unitSelectEl.value : "";

  if (!name) return;

  let unit = unitRaw;

  // ★ 最近単位（内部値）を実際の文字列へ戻す
  if (unit && unit.startsWith("__recent__:")) {
    unit = unit.replace("__recent__:", "");
  }

  // ★ その他の場合は入力必須
  if (unitRaw === "__other__") {
    const custom = (customUnitInputEl?.value || "").trim();
    if (!custom) {
      alert("その他を選んだ場合は手動で単位を入力してください");
      return;
    }
    unit = custom;
  }

  tempIngredients.push({
    name,
    amount: amountRaw,
    unit
  });

  updateTempList("ingredient-list", tempIngredients, "ingredients");

  document.getElementById("temp-ingredient").value = "";
  document.getElementById("temp-amount-num").value = "";

  // 単位は（なし）に戻す + その他入力も閉じる
  if (unitSelectEl) unitSelectEl.value = "";
  setCustomUnitVisible(false);

  updateIngredientDatalist([]);
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

  updateIngredientDatalist([]);
  setCustomUnitVisible(false);
});

/* =============================
   表示：検索対応
============================= */
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

        const amountNum = amountRaw === "" ? NaN : parseFloat(amountRaw);
        const canCalc = !Number.isNaN(amountNum);

        if (!canCalc) {
          if (amountRaw === "" && unit) return `<li>${name} ${unit}</li>`;
          if (amountRaw && !unit) return `<li>${name} ${amountRaw}</li>`;
          return `<li>${name} ${amountRaw}${unit}</li>`;
        }

        const newAmount = amountNum * servings;

        let amountText = "";
        if (unit === "小さじ") {
          const tablespoon = Math.floor(newAmount / 3);
          const teaspoon = Number((newAmount % 3).toFixed(2));

          const tbspText = tablespoon > 0 ? `大さじ${toFraction(tablespoon)}` : "";
          const tspText = teaspoon > 0 ? `小さじ${toFraction(teaspoon)}` : "";

          amountText = [tbspText, tspText].filter(Boolean).join(" ");
          if (!amountText) amountText = `小さじ0`;
        } else if (unit === "大さじ") {
          amountText = `大さじ${toFraction(newAmount)}`;
        } else {
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

    card.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("delete-btn") ||
        e.target.classList.contains("edit-btn") ||
        e.target.classList.contains("plus-btn") ||
        e.target.classList.contains("minus-btn")
      ) return;
      card.classList.toggle("open");
    });

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

      updateIngredientDatalist([]);
      setCustomUnitVisible(false);
    });

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

  // 最近単位を更新（レシピ削除で自然に消える）
  updateRecentUnitOptions();

  renderAll();
  rebuildIngredientSuggestions();
});

/* =============================
   検索入力 → 再描画
============================= */
if (searchBox) {
  searchBox.addEventListener("input", () => renderAll());
}

/* =============================
   ＋投稿ボタン（フォーム開閉）
============================= */
const floatingBtn = document.getElementById("floating-post-btn");
const uploadSection = document.getElementById("upload-section");

if (floatingBtn && uploadSection) {
  floatingBtn.addEventListener("click", () => {
    if (uploadSection.style.display === "none") {
      uploadSection.style.display = "block";
      window.scrollTo({ top: uploadSection.offsetTop - 20, behavior: "smooth" });
    } else {
      uploadSection.style.display = "none";
    }
  });
}
