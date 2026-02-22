let currentCategory = "Promoções"; // Categoria inicial

("use strict");

let cardapioData = {};
let cart = [];
let currentItem = null;
let splitPayments = [];
let currentPaymentIndex = null;
let pendingMilkShake = null;
let firstInteraction = false;
let inactivityTimeout;
let currentInput = null;
let tipoConsumo = ""; // ARMAZENA 'Para Comer no Local' OU 'Para Viagem'

// Estado de disponibilidade de ingredientes sincronizado com KDS
let ingredientsAvailability = {};
let paidExtrasAvailability = {};
let menuAvailability = {}; // ✅ NOVO: Disponibilidade de itens do menu

const firebaseConfig = {
  apiKey: "AIzaSyDFFbaZmX80QezLfozPAIaIGEhIJm9z43E",
  authDomain: "ribbsznmesas.firebaseapp.com",
  databaseURL: "https://ribbsznmesas-default-rtdb.firebaseio.com",
  projectId: "ribbsznmesas",
  storageBucket: "ribbsznmesas.firebasestorage.app",
  messagingSenderId: "970185571294",
  appId: "1:970185571294:web:25e8552bd72d852283bb4f",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// FIX: As regras do Firebase exigem auth != null para criar pedidos.
// Usamos autenticação anônima no totem.
(async () => {
  try {
    const auth = firebase.auth();
    if (!auth.currentUser) {
      await auth.signInAnonymously();
      console.log("✅ Autenticação anônima realizada (totem)");
    }
  } catch (e) {
    console.warn("⚠️ Autenticação anônima falhou:", e.message);
  }
})();

// NOVAS VARIÁVEIS PARA CUSTOMIZAÇÃO SEQUENCIAL DE COMBO
let comboCustomization = {
  item: null, // O item completo do cardápio (ex: "3 Duplos")
  currentBurgerIndex: -1, // Índice do burger sendo customizado (0, 1, 2...)
  totalCustomizations: [], // Array para armazenar as customizações de cada burger
  basePrice: 0, // Preço base do combo
};

const sounds = {
  click: document.getElementById("soundClick"),
  add: document.getElementById("soundAdd"),
  confirm: document.getElementById("soundConfirm"),
};

function playSound(type) {
  if (sounds[type]) {
    sounds[type].play().catch(() => {});
  }
}

// ===============================================
// Inicialização
// ===============================================

async function loadMenuData() {
  try {
    const response = await fetch("cardapio.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    cardapioData = await response.json();
    console.log("Cardápio carregado via JSON!");
  } catch (e) {
    console.warn(
      "Erro ao carregar cardapio.json (provavelmente CORS local). Usando menu de backup).",
      e,
    );
    cardapioData = {}; // Backup vazio para evitar quebra total
  }

  // FIX: Sincronizar preços do Firebase ANTES de exibir o cardápio,
  // para que preços editados no sistema apareçam desde o primeiro carregamento.
  await syncPricesFromFirebase();

  // Iniciar listeners de disponibilidade em tempo real (on/off de itens e insumos)
  initAvailabilityListeners();

  // Iniciar listener de preços em tempo real (via nó "cardapio" no Firebase)
  listenToPriceChanges();

  showStartScreen();
}

// ===============================================
// Sincronização de Preços com Firebase (KDS → Totem)
// ===============================================

async function syncPricesFromFirebase() {
  if (!db) {
    console.warn("⚠️ Firebase não disponível - preços do JSON serão usados");
    return;
  }

  try {
    const snapshot = await db.ref("cardapio").once("value");
    const firebaseMenu = snapshot.val();

    if (!firebaseMenu) {
      console.log("ℹ️ Nó 'cardapio' vazio no Firebase - usando preços do JSON");
      return;
    }

    let updated = 0;
    for (const [category, items] of Object.entries(firebaseMenu)) {
      if (cardapioData[category] && Array.isArray(items)) {
        items.forEach((firebaseItem, index) => {
          const localItem = cardapioData[category][index];
          if (
            localItem &&
            firebaseItem &&
            firebaseItem.precoBase !== undefined
          ) {
            localItem.precoBase = firebaseItem.precoBase;
            updated++;
          }
        });
      }
    }

    if (updated > 0) {
      console.log(
        `✅ Preços sincronizados do Firebase: ${updated} item(s) atualizado(s)`,
      );
    } else {
      console.log("ℹ️ Firebase não tem preços diferentes do JSON");
    }
  } catch (error) {
    console.error("❌ Erro ao sincronizar preços do Firebase:", error);
  }
}

function listenToPriceChanges() {
  if (!db) return;

  db.ref("cardapio").on("value", (snapshot) => {
    const firebaseMenu = snapshot.val();
    if (!firebaseMenu || !cardapioData) return;

    let pricesUpdated = false;

    for (const [category, items] of Object.entries(firebaseMenu)) {
      if (cardapioData[category] && Array.isArray(items)) {
        items.forEach((firebaseItem, index) => {
          const localItem = cardapioData[category][index];
          if (
            localItem &&
            firebaseItem &&
            firebaseItem.precoBase !== undefined
          ) {
            const oldPrice = JSON.stringify(localItem.precoBase);
            const newPrice = JSON.stringify(firebaseItem.precoBase);
            if (oldPrice !== newPrice) {
              localItem.precoBase = firebaseItem.precoBase;
              pricesUpdated = true;
            }
          }
        });
      }
    }

    if (pricesUpdated) {
      console.log(
        "🔄 Preços atualizados pelo KDS - re-renderizando cardápio...",
      );
      const activeBtn = document.querySelector(".sessao-topo button.active");
      if (currentCategory && cardapioData[currentCategory]) {
        showCategory(currentCategory, activeBtn);
      }
    }
  });
}

// ===============================================
// Sincronização de Disponibilidade com KDS
// ===============================================
function initAvailabilityListeners() {
  if (!db) {
    console.warn(
      "Firebase não conectado - sincronização de disponibilidade desabilitada",
    );
    return;
  }

  // Listener para ingredientes
  db.ref("ingredientsAvailability").on("value", (snapshot) => {
    ingredientsAvailability = snapshot.val() || {};
    console.log("🥬 Disponibilidade de ingredientes atualizada no totem");
  });

  // Listener para adicionais pagos
  db.ref("paidExtrasAvailability").on("value", (snapshot) => {
    paidExtrasAvailability = snapshot.val() || {};
    console.log("💰 Disponibilidade de adicionais pagos atualizada no totem");

    // Re-renderiza o popup de personalização se estiver aberto,
    // para remover imediatamente adicionais bloqueados pelo KDS.
    const popupCustomEl = document.getElementById("popupCustom");
    if (popupCustomEl && popupCustomEl.classList.contains("show")) {
      if (comboCustomization.currentBurgerIndex !== -1) {
        // Está personalizando um burger do combo
        renderComboBurgerModal();
      } else if (currentItem) {
        // Está personalizando item simples ou artesanal
        openPopupCustom(
          currentItem.cat,
          currentItem.itemIndex,
          currentItem.optionIndex,
        );
      }
    }

    // Re-renderiza o cardápio para refletir nova disponibilidade de adicionais
    // (ex: se todos os adicionais de um item ficam OFF, o botão muda de comportamento)
    if (currentCategory && cardapioData[currentCategory]) {
      const activeBtn = document.querySelector(".sessao-topo button.active");
      showCategory(currentCategory, activeBtn);
    }
  });

  // ✅ Listener para disponibilidade de menu - CORRIGIDO para usar mesmo formato do KDS
  db.ref("menuAvailability").on("value", (snapshot) => {
    menuAvailability = snapshot.val() || {};
    console.log(
      "📋 Disponibilidade de menu atualizada no totem",
      menuAvailability,
    );

    // Limpar carrinho de itens indisponíveis
    checkAndRemoveUnavailableItemsFromCart();

    // Recarregar a categoria atual para atualizar a interface
    if (currentCategory && cardapioData[currentCategory]) {
      const activeBtn = document.querySelector(".sessao-topo button.active");
      showCategory(currentCategory, activeBtn);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadMenuData();
  setInterval(() => {
    const now = new Date();
    const relogio = document.getElementById("relogio");
    if (relogio) {
      relogio.textContent = now.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }, 1000);
  document.addEventListener("keydown", handleEscapeKey);
});

function handleEscapeKey(e) {
  if (e.key === "Escape") {
    const openPopupEl = document.querySelector(".popup.show");
    if (openPopupEl) {
      const id = openPopupEl.id;
      switch (id) {
        case "popupCustom":
          closePopupCustom();
          break;
        case "popupResumoPedido":
          closeResumoPopup();
          break;
        case "popupPayment":
          closePaymentPopup();
          break;
        case "popupDividirPagamento":
          closePopupDividir();
          break;
        case "popupPix":
          closePix();
          break;
        case "popupCalda":
          closeCaldaPopup();
          break;
        case "popupNome":
          closeNome();
          break;
        case "popupTroco":
          closeTrocoPopup();
          break;
        case "customAlert":
          closeCustomAlert();
          break;
        case "customConfirm":
          closeCustomConfirm();
          break;
        case "popupImage":
          closeImagePopup();
          break;
        case "popupTipoConsumo":
          closePopup("popupTipoConsumo", () => closeBackdrop());
          break;
        default:
          closePopup(id);
      }
    }
  }
}

// ===============================================
// Controle de Tela e Inatividade
// ===============================================

function showStartScreen() {
  document.body.classList.add("start-active");
  const startScreen = document.getElementById("startScreen");
  if (startScreen) startScreen.classList.remove("hidden");
  resetInactivityTimer();
}

function hideStartScreen() {
  document.body.classList.remove("start-active");
  const startScreen = document.getElementById("startScreen");
  if (startScreen) startScreen.classList.add("hidden");
  tryEnterFullscreen();
  resetInactivityTimer();

  // Seleciona a primeira categoria automaticamente
  if (Object.keys(cardapioData).length > 0) {
    showCategory("Promoções", document.querySelector(".sessao-topo button"));
  }
}

// Tornar global para acesso do HTML
window.hideStartScreen = hideStartScreen;

const startScreenEl = document.getElementById("startScreen");
if (startScreenEl) {
  startScreenEl.addEventListener("click", () => {
    playSound("click");
    hideStartScreen();
  });
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    reiniciarPedido();
    showStartScreen();
  }, 120000); // 2 minutos
}

document.addEventListener("click", resetInactivityTimer);
document.addEventListener("touchstart", resetInactivityTimer);

function tryEnterFullscreen() {
  if (firstInteraction) return;
  firstInteraction = true;
  const el = document.documentElement;
  (el.requestFullscreen || el.webkitRequestFullscreen)
    ?.call(el)
    .catch(() => {});
}

// ===============================================
// Utilitários
// ===============================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getIngredientesParaOpcao(item, opcao) {
  return (
    item.ingredientesPorOpcao?.[opcao] ||
    item.ingredientesPadrao ||
    item.ingredientes ||
    []
  );
}

function getIngredsForComboCompat(item, burgerName) {
  const bName = burgerName ? burgerName.toLowerCase() : "";

  // Lista de vegetais conhecidos
  const knownVegetables = [
    "Alface",
    "Tomate",
    "Cebola caramelizada",
    "Cebola Caramelizada",
    "Cebola",
  ];

  let ingredientsList = [];

  // Detecta qual tipo de burger é
  if (
    item.simplesIngredients &&
    (bName.includes("simples") || bName.includes("smash simples"))
  ) {
    ingredientsList = item.simplesIngredients;
  } else if (
    (item.duploIngredients || item.DuploIngredients) &&
    (bName.includes("duplo") ||
      bName.includes("smash duplo") ||
      bName.includes("triplo"))
  ) {
    // FIX: fallback para DuploIngredients com D maiúsculo (inconsistência no JSON)
    ingredientsList = item.duploIngredients || item.DuploIngredients;
  } else if (item.PromoIngredients && bName.includes("cremoso")) {
    ingredientsList = item.PromoIngredients;
  } else {
    ingredientsList = item.ingredients || [];
  }

  // Separa vegetais dos outros ingredientes
  const vegetables = ingredientsList.filter((ing) =>
    knownVegetables.some((veg) =>
      ing.toLowerCase().includes(veg.toLowerCase()),
    ),
  );

  const otherIngredients = ingredientsList.filter(
    (ing) =>
      !knownVegetables.some((veg) =>
        ing.toLowerCase().includes(veg.toLowerCase()),
      ),
  );

  return {
    ingredients: ingredientsList,
    vegetables: vegetables,
    otherIngredients: otherIngredients,
  };
}

function hasCustomization(item) {
  // Verifica se o item tem adicionais pagos DISPONÍVEIS (filtra os bloqueados pelo KDS)
  const hasAvailablePaidExtras =
    ((item.paidExtras && item.paidExtras.length > 0) ||
      (item.adicionais && item.adicionais.length > 0)) &&
    (item.paidExtras || item.adicionais || []).some(
      (e) => !isPaidExtraUnavailable(e.nome),
    );

  return !!(
    item.combo ||
    hasAvailablePaidExtras ||
    item.ingredientesPorOpcao ||
    (item.ingredientesPadrao && item.ingredientesPadrao.length > 0) ||
    (item.ingredients && item.ingredients.length > 0) ||
    item.simplesIngredients ||
    item.duploIngredients
  );
}

function formatRemovedIngredients(removed) {
  if (!removed || removed.length === 0) return "";

  const removedSet = new Set(removed);
  const size = removed.length;

  const DISPLAY_NAMES = {
    "Cheddar fatiado": "queijo",
    "Molho artesanal": "molho",
    "Cebola caramelizada": "cebola",
    Alface: "alface",
    Tomate: "tomate",
  };

  const checkExact = (ingList) =>
    size === ingList.length && ingList.every((ing) => removedSet.has(ing));

  if (checkExact(["Alface", "Tomate", "Cebola caramelizada"]))
    return "sem verduras";
  if (checkExact(["Alface", "Tomate"])) return "sem salada";
  if (checkExact(["Cheddar fatiado"])) return "sem queijo";
  if (checkExact(["Cebola caramelizada"])) return "sem cebola";
  if (checkExact(["Alface"])) return "sem alface";
  if (checkExact(["Tomate"])) return "sem tomate";

  return removed
    .map((ing) => {
      const displayName = DISPLAY_NAMES[ing] || ing;
      return `sem ${displayName}`;
    })
    .join(", ");
}

function generateCustomDetails(custom) {
  if (!custom) return "";
  let details = [];

  if (custom.burgers && custom.burgers.length > 0) {
    let burgerDetails = custom.burgers.map((b) => {
      let parts = [];
      if (b.removed && b.removed.length > 0) {
        parts.push(formatRemovedIngredients(b.removed));
      }
      if (b.extras && b.extras.length > 0) {
        const extraNames = b.extras.map((e) => e.nome);
        parts.push(`Adicionar ${extraNames.join(", ")}`);
      }
      if (parts.length > 0) {
        return `${b.burgerName} (${parts.join(", ")})`;
      }
      return `${b.burgerName}`;
    });
    details.push(burgerDetails.join(" | "));

    if (custom.comboExtras && custom.comboExtras.length > 0) {
      const extraNames = custom.comboExtras.map((e) => e.nome);
      details.push(`Extras Combo: ${extraNames.join(", ")}`);
    }
  } else {
    if (custom.calda) {
      details.push(`Calda: ${custom.calda}`);
    }
    if (custom.removed && custom.removed.length > 0) {
      details.push(formatRemovedIngredients(custom.removed));
    }
    if (custom.extras && custom.extras.length > 0) {
      const extraNames = custom.extras.map((e) => e.nome);
      details.push(`Adicionais: ${extraNames.join(", ")}`);
    }
  }

  if (details.length === 0) return "";
  return `<span class="cart-details">(${details.join("; ")})</span>`;
}

function getCartTotal() {
  return cart.reduce((total, c) => total + c.price * c.quantity, 0);
}

function updateCart() {
  const cartItems = document.getElementById("cartItems");
  if (!cartItems) return;
  cartItems.innerHTML = "";

  cart.forEach((c, i) => {
    const p = document.createElement("p");
    const customDetails = generateCustomDetails(c.custom);

    p.innerHTML = `${escapeHtml(c.item)} ${customDetails} x ${
      c.quantity
    } - R$ ${(c.price * c.quantity).toFixed(2)}`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "removeBtn";
    removeBtn.textContent = "Remover";
    removeBtn.onclick = () => removeFromCart(i);
    p.appendChild(removeBtn);

    const qtyDiv = document.createElement("div");
    const minus = document.createElement("button");
    minus.className = "qtyBtn";
    minus.textContent = "-";
    minus.onclick = () => adjustQuantity(i, -1);

    const plus = document.createElement("button");
    plus.className = "qtyBtn";
    plus.textContent = "+";
    plus.onclick = () => adjustQuantity(i, 1);

    qtyDiv.appendChild(minus);
    qtyDiv.appendChild(plus);
    p.appendChild(qtyDiv);
    cartItems.appendChild(p);
  });

  document.getElementById("cartCount").textContent = cart.length;
  document.getElementById("cartTotal").textContent = getCartTotal().toFixed(2);
}

function addToCart(name, price, custom = {}) {
  // ✅ VALIDAÇÃO: Verificar disponibilidade antes de adicionar
  // Extrair categoria e nome do item para verificar disponibilidade
  const itemData = findItemInMenu(name);
  if (itemData && itemData.category) {
    // Usar formato do KDS: categoria:nome
    const itemKey = `${itemData.category}:${itemData.name}`;

    if (menuAvailability[itemKey] === false) {
      showToastFeedback(`❌ ${name} está indisponível no momento`);
      console.warn("⚠️ Tentativa de adicionar item indisponível:", name);
      return; // Bloqueia adição
    }
  }

  const hasCustom = Object.keys(custom).length > 0;

  let existing = null;
  if (!hasCustom) {
    existing = cart.find(
      (c) =>
        c.item === name && (!c.custom || Object.keys(c.custom).length === 0),
    );
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ item: name, price, quantity: 1, custom });
  }

  playSound("add");
  updateCart();

  showToastFeedback(`✅ ${name} adicionado!`);
}

// FUNÇÃO AUXILIAR PARA O FEEDBACK
function showToastFeedback(message) {
  let toast = document.getElementById("toast-cart");

  // Se o elemento não existir no HTML, ele cria agora
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-cart";
    toast.className = "toast-cart";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  // Remove a classe 'show' após 2 segundos para esconder
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCart();
}

function adjustQuantity(index, delta) {
  if (!cart[index]) return;

  // ✅ VALIDAÇÃO: Se está aumentando, verificar disponibilidade
  if (delta > 0) {
    const itemName = cart[index].item;
    const itemData = findItemInMenu(itemName);

    if (itemData && itemData.category) {
      const itemKey = `${itemData.category}-${itemData.name}`;

      if (menuAvailability[itemKey] === false) {
        showToastFeedback(`❌ ${itemName} está indisponível`);
        console.warn("⚠️ Item ficou indisponível:", itemName);
        // Remove o item do carrinho
        removeFromCart(index);
        return;
      }
    }
  }

  cart[index].quantity = cart[index].quantity + delta;
  if (cart[index].quantity < 1) cart[index].quantity = 1;
  updateCart();
}

// ✅ NOVA: Função para encontrar item no cardápio
function findItemInMenu(itemName) {
  if (!cardapioData) return null;

  for (const [category, items] of Object.entries(cardapioData)) {
    for (const item of items) {
      // Verificar se é o item exato ou se contém o nome base
      if (item.nome === itemName || itemName.includes(item.nome)) {
        return {
          category: category,
          name: item.nome,
          item: item,
        };
      }
    }
  }
  return null;
}

// ✅ Limpar carrinho de itens indisponíveis
function checkAndRemoveUnavailableItemsFromCart() {
  if (!cart || cart.length === 0) return;

  const originalLength = cart.length;
  const removedItems = [];

  cart = cart.filter((cartItem) => {
    const itemData = findItemInMenu(cartItem.item);

    if (itemData && itemData.category) {
      // Usar formato do KDS: categoria:nome
      const itemKey = `${itemData.category}:${itemData.name}`;

      if (menuAvailability[itemKey] === false) {
        removedItems.push(cartItem.item);
        return false; // Remove do carrinho
      }
    }
    return true; // Mantém no carrinho
  });

  // Notificar se algum item foi removido
  if (removedItems.length > 0) {
    const itemsList = removedItems.join(", ");
    showToastFeedback(`⚠️ Removidos (indisponíveis): ${itemsList}`);
    updateCart();
    console.log("🗑️ Itens removidos do carrinho:", removedItems);
  }
}

function clearCart() {
  showConfirm("Limpar o carrinho?", (yes) => {
    if (yes) {
      cart = [];
      updateCart();
      const footer = document.getElementById("footerCart");
      if (footer) footer.classList.remove("expanded");
    }
  });
}

window.removeFromCart = removeFromCart;
window.adjustQuantity = adjustQuantity;
window.clearCart = clearCart;

// ===============================================
// Navegação e Exibição do Cardápio
// ===============================================

function showCategory(cat, btn) {
  currentCategory = cat;
  tryEnterFullscreen();
  document
    .querySelectorAll(".sessao-topo button")
    .forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");

  const container = document.getElementById("cardapio");
  container.innerHTML = "";
  container.className =
    "cardapio" + (cat === "Artesanais" ? " artesanais-container" : "");

  const items = cardapioData[cat] || [];

  items.forEach((item, i) => {
    // 1. Verificação do Item Principal
    const itemPrincipalIndisponivel = isItemUnavailable(item.nome);

    const card = document.createElement("div");
    card.className = "card";

    if (itemPrincipalIndisponivel) {
      card.classList.add("unavailable");
      const unavailableOverlay = document.createElement("div");
      unavailableOverlay.className = "unavailable-overlay";
      unavailableOverlay.textContent = "Em falta";
      card.appendChild(unavailableOverlay);
      card.style.pointerEvents = "none";
    }

    if (item.img) {
      const img = document.createElement("img");
      img.src = item.img;
      img.alt = item.nome;
      img.loading = "lazy";
      img.onclick = () => openImagePopup(item.img);
      card.appendChild(img);
    }

    const title = document.createElement("h3");
    title.textContent = item.nome;
    card.appendChild(title);

    if (item.descricao) {
      const desc = document.createElement("p");
      desc.className = "descricao";
      desc.textContent = item.descricao;
      card.appendChild(desc);
    }

    const optionsRow = document.createElement("div");
    optionsRow.className = "options-row";

    const opcoes = item.opcoes || [""];
    opcoes.forEach((op, j) => {
      // 2. Verificação do Subitem (Opção)
      // Verifica se a combinação "Item - Opção" está marcada como indisponível no KDS
      const subItemIndisponivel = isItemUnavailable(item.nome, op);

      const price =
        item.precoBase && item.precoBase[j] !== undefined
          ? item.precoBase[j]
          : item.precoBase
            ? item.precoBase[0]
            : 0;

      const optionDiv = document.createElement("div");
      optionDiv.className = "small-option";

      // Se o subitem estiver indisponível, aplicamos estilo visual e bloqueio
      if (subItemIndisponivel) {
        optionDiv.classList.add("option-unavailable");
        optionDiv.style.opacity = "0.5";
      }

      optionDiv.innerHTML = `<p>${op || item.nome}</p><p>R$ ${Number(
        price,
      ).toFixed(2)}</p>`;

      const needsCustom = hasCustomization(item);
      const isMilkShake = item.nome.toLowerCase().includes("milk shake");

      if (needsCustom && !isMilkShake) {
        const customizeBtn = document.createElement("button");
        customizeBtn.className = "btn";
        customizeBtn.textContent = subItemIndisponivel
          ? "Indisponível"
          : "Personalizar";
        customizeBtn.disabled = subItemIndisponivel; // Bloqueia o botão se estiver OFF
        customizeBtn.onclick = () => {
          playSound("click");
          openPopupCustom(cat, i, j);
        };
        optionDiv.appendChild(customizeBtn);
      } else {
        const addBtn = document.createElement("button");
        addBtn.className = "btn";
        addBtn.textContent = subItemIndisponivel ? "Indisponível" : "Adicionar";
        addBtn.disabled = subItemIndisponivel; // Bloqueia o botão se estiver OFF
        addBtn.onclick = () => {
          const fullName = item.nome + (op && op !== item.nome ? " " + op : "");
          if (isMilkShake) {
            playSound("click");
            pendingMilkShake = { name: fullName, price };
            openCaldaPopup();
          } else {
            adicionarDireto(fullName, price);
          }
        };
        optionDiv.appendChild(addBtn);
      }
      optionsRow.appendChild(optionDiv);
    });

    card.appendChild(optionsRow);
    container.appendChild(card);
  });
}
window.showCategory = showCategory;
// ===============================================
// Popup Custom (Personalização de Itens)
// ===============================================

function openPopupCustom(cat, itemIndex, optionIndex) {
  const item = cardapioData[cat][itemIndex];
  const opcao = item.opcoes?.[optionIndex] || "";

  // Bloqueio de Segurança: Item ou Sabor/Opção OFF no KDS
  if (isItemUnavailable(item.nome, opcao)) {
    return;
  }

  currentItem = { cat, itemIndex, optionIndex };

  // Lógica para Combos (Promoções)
  if (item.combo && item.burgers && cat === "Promoções") {
    const preco =
      item.precoBase[optionIndex] !== undefined
        ? item.precoBase[optionIndex]
        : item.precoBase[0];
    comboCustomization.item = item;
    comboCustomization.currentBurgerIndex = 0;
    comboCustomization.totalCustomizations = [];
    comboCustomization.basePrice = preco;
    renderComboBurgerModal();
    return;
  }

  const title = document.getElementById("popupCustomTitle");
  title.textContent = `Personalize: ${item.nome} ${opcao}`;

  const questionDiv = document.getElementById("popupQuestion");
  questionDiv.innerHTML = "";

  // --- SEÇÃO DE VEGETAIS (Remoção) ---
  const veggies =
    item.vegetables ||
    item.ingredientesPadrao?.filter((ing) =>
      ["Alface", "Tomate"].includes(ing),
    ) ||
    [];

  if (veggies.length > 0) {
    const availableVeggies = veggies.filter(
      (veg) => !isIngredientUnavailable(veg),
    );
    if (availableVeggies.length > 0) {
      const veggieSection = document.createElement("div");
      veggieSection.innerHTML = "<h4>Remover vegetais:</h4>";
      availableVeggies.forEach((veg) => {
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" data-type="remove" value="${veg}" checked> ${veg}`;
        veggieSection.appendChild(label);
      });
      questionDiv.appendChild(veggieSection);
    }
  }

  // --- SEÇÃO DE OUTROS INGREDIENTES (Remoção) ---
  const ingredients = getIngredientesParaOpcao(item, opcao);
  const ingredientsForRemoval = ingredients.filter(
    (ing) => !veggies.includes(ing),
  );

  const availableIngredientsForRemoval = ingredientsForRemoval.filter(
    (ing) => !isIngredientUnavailable(ing),
  );
  if (availableIngredientsForRemoval.length > 0) {
    const ingSection = document.createElement("div");
    ingSection.innerHTML = "<h4>Remover outros ingredientes:</h4>";
    availableIngredientsForRemoval.forEach((ing) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" data-type="remove" value="${ing}" checked> ${ing}`;
      ingSection.appendChild(label);
    });
    questionDiv.appendChild(ingSection);
  }

  // --- SEÇÃO DE ADICIONAIS (Extras Pagos) ---
  const extras = item.paidExtras || item.adicionais || [];
  const availableExtras = extras.filter(
    (extra) => !isPaidExtraUnavailable(extra.nome),
  );
  if (availableExtras.length > 0) {
    const extraSection = document.createElement("div");
    extraSection.innerHTML = "<h4>Adicionais:</h4>";
    availableExtras.forEach((extra) => {
      const precoText =
        extra.preco > 0 ? `(+R$ ${extra.preco.toFixed(2)})` : "(Grátis)";
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" data-type="extra" data-preco="${extra.preco}" value="${extra.nome}"> ${extra.nome} ${precoText}`;
      extraSection.appendChild(label);
    });
    questionDiv.appendChild(extraSection);
  }

  const confirmBtn = document.querySelector("#popupCustom .btn");
  if (confirmBtn) {
    confirmBtn.textContent = "Adicionar ao carrinho";
    confirmBtn.onclick = confirmPopupCustom;
  }

  openPopup("popupCustom");
}

function renderComboBurgerModal() {
  const { item, currentBurgerIndex } = comboCustomization;
  const burgerName = item.burgers[currentBurgerIndex];

  const title = document.getElementById("popupCustomTitle");
  title.textContent = `Personalize: ${burgerName} (${
    currentBurgerIndex + 1
  } de ${item.burgers.length})`;

  const questionDiv = document.getElementById("popupQuestion");
  questionDiv.innerHTML = "";

  renderBurgerCustomizationSection(questionDiv, item, burgerName);

  const extras = item.paidExtras || [];
  if (extras.length > 0) {
    const extraSection = document.createElement("div");
    extraSection.innerHTML = "<h4>Adicionais Pagos (por item):</h4>";
    extras
      .filter((extra) => !isPaidExtraUnavailable(extra.nome))
      .forEach((extra) => {
        const precoText =
          extra.preco > 0 ? `(+R$ ${extra.preco.toFixed(2)})` : "(Grátis)";
        const label = document.createElement("label");
        label.innerHTML = `<input type="checkbox" data-type="extra-burger" data-preco="${extra.preco}" value="${extra.nome}"> ${extra.nome} ${precoText}`;
        extraSection.appendChild(label);
      });
    questionDiv.appendChild(extraSection);
  }

  const nextButton = document.querySelector("#popupCustom .btn");
  if (currentBurgerIndex < item.burgers.length - 1) {
    nextButton.textContent = "Próximo Lanche";
  } else {
    const availableAdicionais = (item.adicionais || []).filter(
      (add) => !isPaidExtraUnavailable(add.nome),
    );
    if (availableAdicionais.length > 0) {
      nextButton.textContent = "Próxima Etapa (Adicionais)";
    } else {
      nextButton.textContent = "Finalizar Personalização";
    }
  }
  nextButton.onclick = confirmPopupCustom;
  openPopup("popupCustom");
}

function renderBurgerCustomizationSection(container, item, burgerName) {
  const { ingredients, vegetables } = getIngredsForComboCompat(
    item,
    burgerName,
  );

  const availableVegetables = (vegetables || []).filter(
    (veg) => !isIngredientUnavailable(veg),
  );
  if (availableVegetables.length > 0) {
    const veggieSection = document.createElement("div");
    veggieSection.innerHTML = "<h4>Remover vegetais:</h4>";
    availableVegetables.forEach((veg) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" data-type="remove-veg" value="${veg}" checked> ${veg}`;
      veggieSection.appendChild(label);
    });
    container.appendChild(veggieSection);
  }

  const otherIngredients = ingredients.filter(
    (ing) => !vegetables.includes(ing),
  );

  const availableOtherIngredients = (otherIngredients || []).filter(
    (ing) => !isIngredientUnavailable(ing),
  );
  if (availableOtherIngredients.length > 0) {
    const ingSection = document.createElement("div");
    ingSection.innerHTML = "<h4>Remover outros ingredientes:</h4>";
    availableOtherIngredients.forEach((ing) => {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" data-type="remove-ing" value="${ing}" checked> ${ing}`;
      ingSection.appendChild(label);
    });
    container.appendChild(ingSection);
  }
}

function renderComboFinalAddsModal() {
  const { item } = comboCustomization;
  const title = document.getElementById("popupCustomTitle");
  title.textContent = `Adicionais Finais do Combo: ${item.nome}`;
  const questionDiv = document.getElementById("popupQuestion");
  questionDiv.innerHTML = "";

  const adds = (item.adicionais || []).filter(
    (add) => !isPaidExtraUnavailable(add.nome),
  );
  if (adds.length > 0) {
    const addSection = document.createElement("div");
    addSection.innerHTML = "<h4>Adicionais (Opcional/Geral):</h4>";
    adds.forEach((add) => {
      const precoText =
        add.preco > 0 ? `(+R$ ${add.preco.toFixed(2)})` : "(Grátis)";
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" data-type="extra-combo" data-preco="${add.preco}" value="${add.nome}"> ${add.nome} ${precoText}`;
      addSection.appendChild(label);
    });
    questionDiv.appendChild(addSection);
  }

  const nextButton = document.querySelector("#popupCustom .btn");
  nextButton.textContent = "Finalizar Pedido";
  nextButton.onclick = finalizeComboOrder;
  openPopup("popupCustom");
}

function finalizeComboOrder() {
  const { item, totalCustomizations, basePrice } = comboCustomization;
  let finalPrice = basePrice;
  const comboDetails = { burgers: [], comboExtras: [] };
  const questionDiv = document.getElementById("popupQuestion");
  const comboAdds = Array.from(
    questionDiv.querySelectorAll('input[data-type="extra-combo"]:checked'),
  ).map((input) => ({
    nome: input.value,
    preco: parseFloat(input.dataset.preco) || 0,
  }));

  comboAdds.forEach((add) => {
    finalPrice += add.preco;
    comboDetails.comboExtras.push(add);
  });

  totalCustomizations.forEach((burgerCustom) => {
    let burgerPrice = 0;
    burgerCustom.extras.forEach((extra) => {
      burgerPrice += extra.preco;
    });
    finalPrice += burgerPrice;
    comboDetails.burgers.push(burgerCustom);
  });

  const fullName = item.nome;
  addToCart(fullName, finalPrice, comboDetails);
  comboCustomization.currentBurgerIndex = -1;
  closePopupCustom();
}
window.openPopupCustom = openPopupCustom;

// ===============================================
// Confirmação do Popup Custom
// ===============================================

function confirmPopupCustom() {
  playSound("click");
  const questionDiv = document.getElementById("popupQuestion");

  if (comboCustomization.currentBurgerIndex !== -1) {
    const { item, currentBurgerIndex, totalCustomizations } =
      comboCustomization;
    const burgerName = item.burgers[currentBurgerIndex];

    const removed = Array.from(
      questionDiv.querySelectorAll('input[data-type^="remove"]:not(:checked)'),
    ).map((input) => input.value);

    const extras = Array.from(
      questionDiv.querySelectorAll('input[data-type="extra-burger"]:checked'),
    ).map((input) => ({
      nome: input.value,
      preco: parseFloat(input.dataset.preco) || 0,
    }));

    totalCustomizations[currentBurgerIndex] = {
      burgerName,
      removed,
      extras,
    };

    if (currentBurgerIndex < item.burgers.length - 1) {
      comboCustomization.currentBurgerIndex++;
      renderComboBurgerModal();
      return;
    }

    const availableAdicionais = (item.adicionais || []).filter(
      (add) => !isPaidExtraUnavailable(add.nome),
    );
    if (availableAdicionais.length > 0) {
      renderComboFinalAddsModal();
      return;
    }

    finalizeComboOrder();
    return;
  }

  const item = cardapioData[currentItem.cat][currentItem.itemIndex];
  let preco =
    item.precoBase[currentItem.optionIndex] !== undefined
      ? item.precoBase[currentItem.optionIndex]
      : item.precoBase[0];

  const removed = Array.from(
    questionDiv.querySelectorAll('input[data-type="remove"]:not(:checked)'),
  ).map((input) => input.value);

  const extras = Array.from(
    questionDiv.querySelectorAll('input[data-type="extra"]:checked'),
  ).map((input) => ({
    nome: input.value,
    preco: parseFloat(input.dataset.preco) || 0,
  }));

  let extraPrice = extras.reduce((sum, extra) => sum + extra.preco, 0);
  const opcao = item.opcoes?.[currentItem.optionIndex] || "";
  const fullName = `${item.nome} ${opcao}`.trim();
  const finalPrice = preco + extraPrice;

  addToCart(fullName, finalPrice, { removed, extras });
  closePopupCustom();
}
window.confirmPopupCustom = confirmPopupCustom;

function closePopupCustom() {
  comboCustomization.currentBurgerIndex = -1;
  closePopup("popupCustom", () => closeBackdrop());
  currentItem = null;
}
window.closePopupCustom = closePopupCustom;

function adicionarDireto(name, price) {
  playSound("add");
  addToCart(name, price);
}

// ===============================================
// Popup Calda para Milk Shake
// ===============================================

function openCaldaPopup() {
  closeAllPopups(() => {
    openPopup("popupCalda");
  });
}

function closeCaldaPopup() {
  closePopup("popupCalda", () => closeBackdrop());
}

function selectCalda(calda) {
  playSound("click");
  if (pendingMilkShake) {
    const fullName = `${pendingMilkShake.name} com calda de ${calda}`;
    addToCart(fullName, pendingMilkShake.price, { calda });
    pendingMilkShake = null;
  }
  closeCaldaPopup();
}
window.closeCaldaPopup = closeCaldaPopup;
window.selectCalda = selectCalda;

// ===============================================
// Resumo do Pedido
// ===============================================

function mostrarResumo() {
  if (cart.length === 0) return showAlert("Carrinho vazio!");
  playSound("click");
  const resumoItens = document.getElementById("resumoItens");
  resumoItens.innerHTML = "";

  cart.forEach((c) => {
    const p = document.createElement("p");
    const customDetails = generateCustomDetails(c.custom);
    p.innerHTML = `${escapeHtml(c.item)} ${customDetails} x ${
      c.quantity
    } - R$ ${(c.price * c.quantity).toFixed(2)}`;
    resumoItens.appendChild(p);
  });

  const totalP = document.createElement("p");
  totalP.innerHTML = `<strong>Total: R$ ${getCartTotal().toFixed(2)}</strong>`;
  resumoItens.appendChild(totalP);
  closeAllPopups(() => {
    openPopup("popupResumoPedido");
  });
}
window.mostrarResumo = mostrarResumo;

function closeResumoPopup() {
  closePopup("popupResumoPedido", () => closeBackdrop());
}
window.closeResumoPopup = closeResumoPopup;

function openPaymentPopup() {
  playSound("click");
  closeAllPopups(() => {
    const section = document.getElementById("splitPaymentSection");
    if (section) section.style.display = "none";
    openPopup("popupPayment");
  });
}
window.openPaymentPopup = openPaymentPopup;

function closePaymentPopup() {
  closePopup("popupPayment", () => closeBackdrop());
}
window.closePaymentPopup = closePaymentPopup;

// ===============================================
// Pagamento Simples
// ===============================================

function selectSinglePayment(method) {
  playSound("click");
  splitPayments = [{ value: getCartTotal(), method, troco: 0 }];
  if (method === "Dinheiro") {
    currentPaymentIndex = 0;
    openTrocoPopup(0);
  } else if (method === "Dinheiro Exato") {
    splitPayments[0].troco = 0;
    splitPayments[0].valorRecebido = splitPayments[0].value;
    openTipoConsumoModal(); // NOVO PASSO
  } else {
    openTipoConsumoModal(); // NOVO PASSO
  }
}
window.selectSinglePayment = selectSinglePayment;

// ===============================================
// Popup PIX
// ===============================================

function openPixPopup() {
  playSound("click");
  closeAllPopups(() => {
    document.getElementById("pixTotal").textContent =
      `Total: R$ ${getCartTotal().toFixed(2)}`;
    openPopup("popupPix");
  });
}
window.openPixPopup = openPixPopup;

function closePix() {
  closePopup("popupPix", () => closeBackdrop());
}
window.closePix = closePix;

function confirmPix() {
  playSound("confirm");
  // FIX: define splitPayments antes de prosseguir — sem isso o pagamento chegava como "Não definido"
  splitPayments = [{ value: getCartTotal(), method: "PIX", troco: 0 }];
  closePix();
  openTipoConsumoModal();
}
window.confirmPix = confirmPix;

// ===============================================
// Popup Dividir Pagamento
// ===============================================

function abrirPopupDividirPagamento() {
  playSound("click");
  closeAllPopups(() => {
    document.getElementById("valorTotalDivisao").textContent =
      `Total: R$ ${getCartTotal().toFixed(2)}`;
    document.getElementById("quantidadePessoas").value = "";
    document.getElementById("inputsDivisao").innerHTML = "";
    document.getElementById("dividirKeypad").style.display = "none";
    document.getElementById("faltandoValor").textContent = "Faltando R$ 0.00";
    document.getElementById("confirmarDivisao").disabled = true;
    openPopup("popupDividirPagamento");
  });
}
window.abrirPopupDividirPagamento = abrirPopupDividirPagamento;

function closePopupDividir() {
  closePopup("popupDividirPagamento", () => closeBackdrop());
}
window.closePopupDividir = closePopupDividir;

function setCurrentInput(input) {
  currentInput = input;
}
window.setCurrentInput = setCurrentInput;

function gerarCamposDivisao() {
  const num = parseInt(document.getElementById("quantidadePessoas").value) || 0;
  const div = document.getElementById("inputsDivisao");
  div.innerHTML = "";
  for (let i = 0; i < num; i++) {
    const row = document.createElement("div");
    row.className = "rowDiv";
    row.innerHTML = `
      <label>Pagamento ${i + 1}:</label>
      <input type="number" id="divValue${i}" placeholder="Valor" onclick="setCurrentInput(this)" readonly />
      <select id="divMethod${i}">
        <option>Crédito</option>
        <option>Débito</option>
        <option>PIX</option>
        <option>Dinheiro</option>
      </select>`;
    div.appendChild(row);
  }
  document.getElementById("dividirKeypad").style.display =
    num > 0 ? "grid" : "none";
  const keypad = document.getElementById("dividirKeypad");
  const newKeypad = keypad.cloneNode(true);
  keypad.parentNode.replaceChild(newKeypad, keypad);
  newKeypad.addEventListener("click", handleKeypadClick);
  updateFaltando();
}
window.gerarCamposDivisao = gerarCamposDivisao;

function handleKeypadClick(e) {
  if (!currentInput || e.target.tagName !== "BUTTON") return;
  const key = e.target.dataset.key;
  if (key === "⌫") {
    currentInput.value = currentInput.value.slice(0, -1);
  } else if (key === "." && currentInput.value.includes(".")) {
    // do nothing
  } else {
    currentInput.value += key;
  }
  updateFaltando();
}

function updateFaltando() {
  const num = parseInt(document.getElementById("quantidadePessoas").value) || 0;
  let sum = 0;
  for (let i = 0; i < num; i++) {
    sum += Number(document.getElementById(`divValue${i}`).value || 0);
  }
  const faltando = getCartTotal() - sum;
  document.getElementById("faltandoValor").textContent =
    "Faltando R$ " + faltando.toFixed(2);
  document.getElementById("confirmarDivisao").disabled =
    Math.abs(faltando) > 0.05;
}

function confirmarDivisao() {
  playSound("click");
  const num = parseInt(document.getElementById("quantidadePessoas").value);
  splitPayments = [];
  for (let i = 0; i < num; i++) {
    const value = Number(document.getElementById(`divValue${i}`).value);
    const method = document.getElementById(`divMethod${i}`).value;
    splitPayments.push({ value, method, troco: 0 });
  }
  closePopup("popupDividirPagamento", () => {
    const firstCash = splitPayments.findIndex((p) => p.method === "Dinheiro");
    if (firstCash !== -1) {
      currentPaymentIndex = firstCash;
      openTrocoPopup(firstCash);
    } else {
      openTipoConsumoModal(); // NOVO PASSO
    }
  });
}
window.confirmarDivisao = confirmarDivisao;

// ===============================================
// Popup Troco
// ===============================================

function openTrocoPopup(index) {
  closeAllPopups(() => {
    const payment = splitPayments[index];
    const h3 = document.getElementById("popupTroco").querySelector("h3");
    h3.textContent = `Pagamento ${
      index + 1
    } - Troco para R$ ${payment.value.toFixed(2)}?`;
    document.getElementById("inputTroco").value = "";
    populateTrocoKeyboard();
    openPopup("popupTroco");
  });
}

function closeTrocoPopup() {
  closePopup("popupTroco", () => closeBackdrop());
}
window.closeTrocoPopup = closeTrocoPopup;

function calculateTroco() {
  const valorPagar = splitPayments[currentPaymentIndex].value;
  const valorRecebido = Number(document.getElementById("inputTroco").value);
  return valorRecebido >= valorPagar ? valorRecebido - valorPagar : 0;
}

function confirmTroco() {
  const valorRecebido = Number(document.getElementById("inputTroco").value);
  const valorPagar = splitPayments[currentPaymentIndex].value;

  if (valorRecebido < valorPagar) {
    return showAlert("Valor insuficiente para o pagamento.");
  }

  playSound("confirm");
  const troco = calculateTroco();
  splitPayments[currentPaymentIndex].troco = troco;
  splitPayments[currentPaymentIndex].valorRecebido = valorRecebido;

  closeTrocoPopup();

  const nextCashIndex = splitPayments.findIndex(
    (p, i) => i > currentPaymentIndex && p.method === "Dinheiro",
  );
  if (nextCashIndex !== -1) {
    currentPaymentIndex = nextCashIndex;
    openTrocoPopup(nextCashIndex);
  } else {
    openTipoConsumoModal(); // NOVO PASSO
  }
}
window.confirmTroco = confirmTroco;

// ===============================================
// NOVO: Fluxo Tipo de Consumo (Local ou Viagem)
// ===============================================

function openTipoConsumoModal() {
  closeAllPopups(() => {
    openPopup("popupTipoConsumo");
  });
}
window.openTipoConsumoModal = openTipoConsumoModal;

function selectTipoConsumo(opcao) {
  tipoConsumo = opcao;
  playSound("confirm");
  closePopup("popupTipoConsumo", () => {
    proceedToNome();
  });
}
window.selectTipoConsumo = selectTipoConsumo;

// ===============================================
// Popup Nome
// ===============================================

function proceedToNome() {
  closeAllPopups(() => {
    document.getElementById("inputNome").value = "";
    populateKeyboard();
    openPopup("popupNome");
  });
}

function closeNome() {
  closePopup("popupNome", () => closeBackdrop());
}
window.closeNome = closeNome;

function confirmNome() {
  sendOrder();
}
window.confirmNome = confirmNome;

// Pedidos enviados ao KDS via Firebase
// Função para enviar o pedido ao KDS via Firebase
function enviarPedidoAoKDS(orderData) {
  if (!db) {
    console.error("Firebase não inicializado");
    alert("Erro: conexão com o servidor falhou");
    return;
  }

  console.log("📤 Enviando pedido:", orderData);

  // Envia para o nó /pedidos
  db.ref("pedidos")
    .push(orderData)
    .then((ref) => {
      console.log("✅ Pedido enviado com sucesso! ID:", ref.key);
    })
    .catch((error) => {
      console.error("❌ Erro ao enviar pedido:", error);
      alert("Erro ao enviar pedido. Verifique sua conexão e tente novamente.");
    });
}
// ===============================================
// Finalização do Pedido
// ===============================================

function sendOrder() {
  playSound("click");
  const nomeCliente = document.getElementById("inputNome").value.trim();
  if (nomeCliente === "")
    return showAlert("Por favor, digite seu nome para finalizar o pedido.");

  const dataHoraFormatada = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 🔥 CONVERTE OS ITENS DO CARRINHO PARA O FORMATO DO KDS
  const itensConvertidos = cart.map((cartItem) => {
    const itemFormatado = {
      nome: cartItem.item,
      preco: cartItem.price || 0,
      quantidade: cartItem.quantity || 1,
      qtd: cartItem.quantity || 1,
    };

    let observacoes = [];

    // Converte o objeto custom em observações
    if (cartItem.custom && typeof cartItem.custom === "object") {
      const custom = cartItem.custom;

      // Calda (para milk shakes)
      if (custom.calda) {
        observacoes.push(`Calda: ${custom.calda}`);
      }

      // Ingredientes removidos
      if (
        custom.removed &&
        Array.isArray(custom.removed) &&
        custom.removed.length > 0
      ) {
        observacoes.push(`Sem: ${custom.removed.join(", ")}`);
      }

      // Extras/Adicionais
      if (
        custom.extras &&
        Array.isArray(custom.extras) &&
        custom.extras.length > 0
      ) {
        const extrasNomes = custom.extras.map((e) => e.nome || e);
        observacoes.push(`Adicionais: ${extrasNomes.join(", ")}`);

        // Adiciona array de adicionais para compatibilidade
        itemFormatado.adicionais = custom.extras.map((e) => ({
          nome: e.nome || e,
          preco: e.preco || 0,
        }));
      }

      // Burgers (para combos)
      if (custom.burgers && Array.isArray(custom.burgers)) {
        custom.burgers.forEach((burger, idx) => {
          observacoes.push(
            `--- ${burger.burgerName || `Burger ${idx + 1}`} ---`,
          );

          if (burger.removed && burger.removed.length > 0) {
            observacoes.push(`Sem: ${burger.removed.join(", ")}`);
          }

          if (burger.extras && burger.extras.length > 0) {
            const extraNames = burger.extras.map((e) => e.nome || e);
            observacoes.push(`Adicionais: ${extraNames.join(", ")}`);
          }
        });
      }
    }

    if (observacoes.length > 0) {
      itemFormatado.observacao = observacoes.join(" | ");
    }

    return itemFormatado;
  });

  // FIX: normaliza nomes e garante que splitPayments vazio não produza "Não definido"
  const paymentLabels = {
    PIX: "PIX",
    Dinheiro: "Dinheiro",
    "Dinheiro Exato": "Dinheiro",
    Crédito: "Cartão de Crédito",
    Débito: "Cartão de Débito",
  };
  const pagamentosFormatados =
    splitPayments.length > 0
      ? splitPayments
          .map((p) => {
            const raw =
              p.method || p.metodo || (typeof p === "string" ? p : "");
            return paymentLabels[raw] || raw || "?";
          })
          .join(", ")
      : "Não informado";

  const orderData = {
    tipo: "mesa",
    tipoOrigem: "mesa",
    status: "pending",
    nomeCliente,
    cliente: nomeCliente,
    modoConsumo: tipoConsumo || "🍽️ MESA",
    dataHora: dataHoraFormatada,
    itens: itensConvertidos,
    total: getCartTotal(),
    pagamento: pagamentosFormatados,
    pagamentos: splitPayments,
    timestamp: Date.now(),
  };

  enviarPedidoAoKDS(orderData);

  closeNome();
  showAlert(`Obrigado, ${nomeCliente}! Pedido enviado!`);

  setTimeout(() => {
    closeCustomAlert();
    reiniciarPedido();
  }, 4000);
}

function reiniciarPedido() {
  cart = [];
  splitPayments = [];
  currentItem = null;
  pendingMilkShake = null;
  tipoConsumo = ""; // RESET
  updateCart();
  const footer = document.getElementById("footerCart");
  if (footer) footer.classList.remove("expanded");
  showStartScreen();
}
window.reiniciarPedido = reiniciarPedido;

// ===============================================
// Teclados Virtuais
// ===============================================

function populateKeyboard() {
  const keyboard = document.getElementById("keyboard");
  if (!keyboard) return;
  const newKeyboard = keyboard.cloneNode(false);
  keyboard.parentNode.replaceChild(newKeyboard, keyboard);

  const keys = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.dataset.key = key;
    newKeyboard.appendChild(btn);
  });

  const spaceBtn = document.createElement("button");
  spaceBtn.classList.add("space");
  spaceBtn.textContent = "ESPAÇO";
  spaceBtn.dataset.key = " ";
  newKeyboard.appendChild(spaceBtn);

  const backBtn = document.createElement("button");
  backBtn.classList.add("backspace");
  backBtn.textContent = "⌫";
  backBtn.dataset.key = "⌫";
  newKeyboard.appendChild(backBtn);

  newKeyboard.addEventListener("click", handleKeyboardClick);
}

function handleKeyboardClick(e) {
  if (e.target.tagName !== "BUTTON") return;
  const key = e.target.dataset.key;
  const input = document.getElementById("inputNome");
  if (key === "⌫") {
    input.value = input.value.slice(0, -1);
  } else {
    input.value += key;
  }
}

function populateTrocoKeyboard() {
  const trocoKeyboard = document.getElementById("trocoKeyboard");
  if (!trocoKeyboard) return;
  const newKeypad = trocoKeyboard.cloneNode(false);
  trocoKeyboard.parentNode.replaceChild(newKeypad, trocoKeyboard);
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"];
  keys.forEach((key) => {
    const btn = document.createElement("button");
    btn.className = "key-btn";
    btn.dataset.key = key;
    btn.textContent = key;
    newKeypad.appendChild(btn);
  });
  newKeypad.addEventListener("click", handleTrocoKeyboardClick);
}

function handleTrocoKeyboardClick(e) {
  if (e.target.tagName !== "BUTTON") return;
  const key = e.target.dataset.key;
  const input = document.getElementById("inputTroco");
  if (key === "⌫") {
    input.value = input.value.slice(0, -1);
  } else if (key === "." && input.value.includes(".")) {
    // do nothing
  } else {
    input.value += key;
  }
  calculateTroco();
}

// ===============================================
// Gerenciamento de Popups e Backdrop
// ===============================================

function openPopup(id) {
  const popup = document.getElementById(id);
  const backdrop = document.getElementById("backdrop");
  if (popup) popup.classList.add("show");
  if (backdrop) backdrop.classList.add("show");
}

function closeBackdrop(callback) {
  const backdrop = document.getElementById("backdrop");
  if (!backdrop) return callback?.();

  backdrop.classList.add("hiding");
  backdrop.classList.remove("show");

  const onEnd = () => {
    backdrop.classList.remove("hiding");
    callback?.();
  };

  const timer = setTimeout(onEnd, 300);
  backdrop.addEventListener(
    "transitionend",
    () => {
      clearTimeout(timer);
      onEnd();
    },
    { once: true },
  );
}

function closePopup(id, callback) {
  const popup = document.getElementById(id);
  if (!popup || !popup.classList.contains("show")) return callback?.();

  popup.classList.add("hiding");
  popup.classList.remove("show");

  const onEnd = () => {
    popup.classList.remove("hiding");
    callback?.();
  };

  const timer = setTimeout(onEnd, 300);
  popup.addEventListener(
    "transitionend",
    () => {
      clearTimeout(timer);
      onEnd();
    },
    { once: true },
  );
}

function closeAllPopups(callback) {
  const popups = document.querySelectorAll(".popup.show");
  if (popups.length === 0) return callback?.();

  let count = popups.length;
  popups.forEach((p) =>
    closePopup(p.id, () => {
      count--;
      if (count === 0) closeBackdrop(callback);
    }),
  );
}

// ===============================================
// Outros Popups (Alertas, Imagens)
// ===============================================

function showAlert(message) {
  closeAllPopups(() => {
    document.getElementById("alertMessage").textContent = message;
    openPopup("customAlert");
  });
}

function closeCustomAlert() {
  closePopup("customAlert", () => closeBackdrop());
}
window.closeCustomAlert = closeCustomAlert;

function showConfirm(message, onConfirm) {
  closeAllPopups(() => {
    document.getElementById("confirmMessage").textContent = message;
    const confirmBtn = document.querySelector(
      "#customConfirm button[aria-label='Sim']",
    );
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

    newConfirm.onclick = () => {
      onConfirm(true);
      closeCustomConfirm();
    };

    const cancelBtn = document.querySelector(
      "#customConfirm button[aria-label='Não']",
    );
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newCancel.onclick = () => {
      onConfirm(false);
      closeCustomConfirm();
    };

    openPopup("customConfirm");
  });
}

function closeCustomConfirm() {
  closePopup("customConfirm", () => closeBackdrop());
}
window.closeCustomConfirm = closeCustomConfirm;

function openImagePopup(src) {
  const img = document.getElementById("enlargedImage");
  if (img) img.src = src;
  openPopup("popupImage");
}

function closeImagePopup() {
  closePopup("popupImage", () => closeBackdrop());
}
window.closeImagePopup = closeImagePopup;

// ===============================================
// Carrinho Toggle
// ===============================================

const footer = document.getElementById("footerCart");
if (footer) {
  footer.addEventListener("click", (e) => {
    if (
      (e.target.tagName === "BUTTON" && e.target.id !== "toggleCart") ||
      e.target.tagName === "INPUT"
    ) {
      return;
    }
    if (
      footer.classList.contains("expanded") &&
      e.target.closest("#cartItems")
    ) {
      return;
    }
    footer.classList.toggle("expanded");
  });
}
// ✅ FUNÇÃO CORRIGIDA: Verifica disponibilidade usando o mesmo formato do KDS (categoria:nome)
function isItemUnavailable(itemName, subItem = null) {
  // Encontrar a categoria do item
  let category = currentCategory;

  if (!category) {
    // Buscar categoria se não estiver definida
    for (const [cat, items] of Object.entries(cardapioData)) {
      const found = items.some(
        (item) =>
          item.nome === itemName ||
          (item.opcoes && item.opcoes.includes(subItem)),
      );
      if (found) {
        category = cat;
        break;
      }
    }
  }

  if (!category) {
    console.warn("⚠️ Categoria não encontrada para:", itemName, subItem);
    return false;
  }

  // Verificar item principal primeiro
  const itemKey = `${category}:${itemName}`;
  if (menuAvailability[itemKey] === false) {
    console.log(`❌ Item principal indisponível: ${itemKey}`);
    return true;
  }

  // Se tem subitem (opção) válido, verificar também
  // Ignore se subItem é vazio, igual ao itemName, ou é um índice
  if (
    subItem &&
    subItem !== "" &&
    subItem !== itemName &&
    typeof subItem === "string"
  ) {
    const subItemKey = `${category}:${itemName}:${subItem}`;

    // Log detalhado para debug
    console.log(
      `🔍 Verificando subitem: "${subItemKey}" = ${menuAvailability[subItemKey]}`,
    );

    if (menuAvailability[subItemKey] === false) {
      console.log(`❌ Subitem indisponível: ${subItemKey}`);
      return true;
    }
  }

  return false;
}
function isIngredientUnavailable(name) {
  // Verifica se o ingrediente está marcado como indisponível no KDS
  return ingredientsAvailability[name] === false;
}

function isPaidExtraUnavailable(name) {
  // Verifica se o adicional pago está marcado como indisponível no KDS
  return paidExtrasAvailability[name] === false;
}
