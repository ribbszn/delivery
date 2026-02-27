// ================================================================
// ADMIN.JS - PAINEL ADMINISTRATIVO RIBBS ZN v2.0
// ================================================================

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

let menuData = null;
let currentEditingItem = null;
let allPedidos = [];
let filteredPedidos = [];
let dashboardData = null;

// ================================================================
// INICIALIZAÇÃO
// ================================================================

window.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Admin Panel carregado");

  // Inicializar áudio
  initBeepSound();

  // Listener de autenticação
  firebase.auth().onAuthStateChanged((user) => {
    if (user && user.email === "rbnacena@gmail.com") {
      showAdminPanel();
      initializeAdmin();
    } else {
      showLoginScreen();
    }
  });

  // Event listeners de navegação
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      // e.currentTarget garante que pegamos sempre o botão, não um filho (emoji/texto)
      const section = e.currentTarget.dataset.section;
      if (section) navigateToSection(section);
    });
  });

  // Fechar modais ao clicar fora
  document.getElementById("modal-edit-item").addEventListener("click", (e) => {
    if (e.target.id === "modal-edit-item") closeEditModal();
  });

  document.getElementById("modal-pedido").addEventListener("click", (e) => {
    if (e.target.id === "modal-pedido") closePedidoModal();
  });

  document
    .getElementById("modal-excluir-pedidos")
    .addEventListener("click", (e) => {
      if (e.target.id === "modal-excluir-pedidos") closeModalExcluirPedidos();
    });
});

// ================================================================
// AUTENTICAÇÃO
// ================================================================

function handleLogin(event) {
  event.preventDefault();

  const pin = document.getElementById("pin-input").value;
  const btnText = document.getElementById("login-btn-text");
  const spinner = document.getElementById("login-spinner");
  const errorMsg = document.getElementById("login-error");

  // UI Feedback
  btnText.style.display = "none";
  spinner.style.display = "inline";
  errorMsg.classList.remove("show");

  // Usar função do firebase-init-auth.js
  window.loginWithPin(pin).then((result) => {
    if (result.success) {
      console.log("✅ Login bem-sucedido");
      // O onAuthStateChanged vai lidar com a navegação
    } else {
      errorMsg.textContent = result.error;
      errorMsg.classList.add("show");
      btnText.style.display = "inline";
      spinner.style.display = "none";
    }
  });
}

function handleLogout() {
  if (confirm("Deseja realmente sair?")) {
    window.logoutKDS();
  }
}

function showLoginScreen() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("admin-panel").style.display = "none";
}

function showAdminPanel() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-panel").style.display = "flex";
}

// ================================================================
// NAVEGAÇÃO ENTRE SEÇÕES
// ================================================================

function navigateToSection(sectionName) {
  // Atualizar botões
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  document
    .querySelector(`[data-section="${sectionName}"]`)
    .classList.add("active");

  // Atualizar seções
  document.querySelectorAll(".content-section").forEach((section) => {
    section.classList.remove("active");
  });

  document.getElementById(`section-${sectionName}`).classList.add("active");

  // Carregar dados da seção
  switch (sectionName) {
    case "inicio":
      loadInicioData();
      break;
    case "cardapio":
      if (!menuData) loadMenuData();
      break;
    case "insumos":
      loadInsumosData();
      break;
    case "dashboard":
      loadDashboardData();
      break;
    case "pedidos":
      loadPedidos();
      break;
  }
}

// ================================================================
// STORE TOGGLE (ABRIR/FECHAR LOJA)
// ================================================================

function initStoreToggle() {
  const toggle = document.getElementById("store-toggle");
  const statusText = document.getElementById("store-status-text");
  const db = firebase.database();

  // Carregar status atual do Firebase
  db.ref("storeOpen").once("value", (snapshot) => {
    const isOpen = snapshot.val() !== false; // Default true se não existir
    toggle.checked = isOpen;
    updateStoreStatusUI(isOpen);
  });

  // Listener para mudanças no toggle
  toggle.addEventListener("change", async (e) => {
    const isOpen = e.target.checked;

    try {
      // Salvar no Firebase
      await db.ref("storeOpen").set(isOpen);
      updateStoreStatusUI(isOpen);

      console.log(`🏪 Loja ${isOpen ? "ABERTA" : "FECHADA"}`);
    } catch (error) {
      console.error("Erro ao atualizar status da loja:", error);
      alert("Erro ao atualizar status da loja");
      // Reverter o toggle em caso de erro
      toggle.checked = !isOpen;
    }
  });
}

function updateStoreStatusUI(isOpen) {
  const statusText = document.getElementById("store-status-text");
  if (isOpen) {
    statusText.textContent = "🟢 Loja Aberta";
    statusText.style.color = "#2ecc71";
  } else {
    statusText.textContent = "🔴 Loja Fechada";
    statusText.style.color = "#e74c3c";
  }
}

function initializeAdmin() {
  // Setar data de hoje no filtro do dashboard
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("filter-date").value = today;

  // Setar data de hoje no filtro do histórico
  if (document.getElementById("filter-historico-date")) {
    document.getElementById("filter-historico-date").value = today;
  }

  // Inicializar toggle de loja aberta/fechada
  initStoreToggle();

  // Carregar seção inicial (Início)
  navigateToSection("inicio");
}

// ================================================================
// FUNÇÃO CRÍTICA: FIREBASE OVERLAY PATTERN
// ================================================================

async function loadMenuData() {
  console.log("📦 Carregando cardápio com Firebase Overlay...");

  try {
    // 1. Fetch do cardapio.json (estrutura base)
    const response = await fetch("./cardapio.json");
    const jsonMenu = await response.json();

    // 2. Fetch dos dados do Firebase (com fallback)
    const db = firebase.database();

    let availFirebase = {};
    let extrasAvailFirebase = {};

    try {
      const [availSnap, extrasSnap] = await Promise.all([
        db.ref("menuAvailability").once("value"),
        db.ref("paidExtrasAvailability").once("value"),
      ]);
      availFirebase = availSnap.val() || {};
      extrasAvailFirebase = extrasSnap.val() || {};
    } catch (err) {
      console.warn("⚠️ Erro ao carregar disponibilidade do Firebase");
    }

    // 3. Mesclar dados
    menuData = mergeMenuData(jsonMenu, availFirebase, extrasAvailFirebase);

    console.log("✅ Cardápio mesclado:", menuData);

    // 4. Renderizar
    renderCardapio();
    populateCategoryFilter();
  } catch (error) {
    console.error("❌ Erro ao carregar cardápio:", error);
    document.getElementById("cardapio-container").innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Erro ao carregar cardápio</p>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 8px;">
          Verifique se o arquivo cardapio.json existe e se as regras do Firebase estão corretas.
        </p>
      </div>
    `;
  }
}

function mergeMenuData(jsonMenu, availability, extrasAvail) {
  const merged = {};

  Object.keys(jsonMenu).forEach((categoria) => {
    merged[categoria] = jsonMenu[categoria].map((item) => {
      // Usa a mesma chave que kds.js e app.js: "Categoria:Nome"
      const kdsKey = `${categoria}:${item.nome}`;
      const isAvailable =
        availability[kdsKey] !== undefined ? availability[kdsKey] : true;

      // Adicionais: chave é o nome direto do extra, igual ao kds.js e app.js
      const mergedExtras = (item.paidExtras || item.adicionais || []).map(
        (extra) => ({
          ...extra,
          disponivel: extrasAvail[extra.nome] !== false,
        }),
      );

      return {
        ...item,
        categoria,
        disponivel: isAvailable,
        paidExtras: mergedExtras,
        adicionais: mergedExtras,
      };
    });
  });

  return merged;
}

function sanitizeKey(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase();
}

// ================================================================
// NORMALIZAÇÃO DE INGREDIENTES
// ================================================================

/**
 * Normaliza nomes de ingredientes para tratar variações como o mesmo insumo
 * Exemplo: "Cheddar" e "Cheddar fatiado" → "Cheddar"
 */
function normalizeIngredientName(name) {
  const normalized = name.trim();

  // Mapeamento de variações para nome canônico
  const ingredientMapping = {
    "Cheddar fatiado": "Cheddar",
    "cheddar fatiado": "Cheddar",
    "Cheddar Fatiado": "Cheddar",
    // Normaliza variações de case do Cream Cheese
    "Cream cheese": "Cream Cheese",
    "cream cheese": "Cream Cheese",
    "cream Cheese": "Cream Cheese",
  };

  return ingredientMapping[normalized] || normalized;
}

// ================================================================
// RENDERIZAÇÃO DO CARDÁPIO
// ================================================================

function renderCardapio() {
  const container = document.getElementById("cardapio-container");

  if (!menuData || Object.keys(menuData).length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p class="empty-state-text">Nenhum item no cardápio</p>
      </div>
    `;
    return;
  }

  let html = "";

  Object.keys(menuData).forEach((categoria) => {
    menuData[categoria].forEach((item) => {
      html += createMenuCard(item);
    });
  });

  container.innerHTML = html;

  // Adicionar event listeners
  attachMenuCardListeners();
}

function createMenuCard(item) {
  const statusClass = item.disponivel ? "active" : "";
  const imgSrc = item.img || "./img/placeholder.png";

  let precosHtml = "";
  if (item.opcoes && item.opcoes.length > 0) {
    item.opcoes.forEach((opcao, idx) => {
      const preco = item.precoBase[idx] || 0;
      precosHtml += `
        <div class="price-option">
          <span class="price-option-label">${opcao}</span>
          <span class="price-badge">R$ ${preco.toFixed(2)}</span>
        </div>
      `;
    });
  } else {
    const preco = item.precoBase[0] || 0;
    precosHtml = `
      <div class="price-option">
        <span class="price-option-label">Preço</span>
        <span class="price-badge">R$ ${preco.toFixed(2)}</span>
      </div>
    `;
  }

  // Usa data-* para evitar problemas de escaping com aspas no nome
  const itemJson = JSON.stringify(item).replace(/'/g, "&apos;");
  return `
    <div class="menu-card" data-categoria="${item.categoria}">
      <div class="menu-card-image">
        <img src="${imgSrc}" alt="${item.nome}" onerror="this.src='./img/placeholder.png'" />
        <div class="menu-card-image-overlay ${statusClass ? "" : "esgotado"}">
          ${statusClass ? "" : '<span class="esgotado-badge">ESGOTADO</span>'}
        </div>
      </div>
      <div class="menu-card-content">
        <div class="menu-card-header">
          <div class="menu-card-title">
            <h3>${item.nome}</h3>
            <span class="menu-card-category">${item.categoria}</span>
          </div>
          <div class="availability-toggle">
            <div class="toggle-switch ${statusClass}"
                 onclick="toggleAvailability('${item.nome.replace(/'/g, "\'")}', ${item.disponivel}, '${item.categoria}')">
            </div>
          </div>
        </div>
        <div class="menu-card-prices">${precosHtml}</div>
        <div class="menu-card-actions">
          <button class="btn-edit" onclick='openEditModal(${itemJson})'>
            ✏️ Editar
          </button>
        </div>
      </div>
    </div>
  `;
}

function attachMenuCardListeners() {
  // Event listeners já estão inline no HTML
  console.log("✅ Listeners dos cards anexados");
}

// ================================================================
// FILTROS DO CARDÁPIO
// ================================================================

function populateCategoryFilter() {
  const select = document.getElementById("filter-categoria");
  const categorias = Object.keys(menuData || {});

  let html = '<option value="all">Todas as Categorias</option>';
  categorias.forEach((cat) => {
    html += `<option value="${cat}">${cat}</option>`;
  });

  select.innerHTML = html;
}

function filterMenuByCategory() {
  const selected = document.getElementById("filter-categoria").value;
  const cards = document.querySelectorAll(".menu-card");

  cards.forEach((card) => {
    const categoria = card.dataset.categoria;

    if (selected === "all" || categoria === selected) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

function searchMenuItems() {
  const query = document.getElementById("search-menu").value.toLowerCase();
  const cards = document.querySelectorAll(".menu-card");

  cards.forEach((card) => {
    const title = card.querySelector("h3").textContent.toLowerCase();

    if (title.includes(query)) {
      card.style.display = "block";
    } else {
      card.style.display = "none";
    }
  });
}

function refreshMenuData() {
  document.getElementById("cardapio-container").innerHTML =
    '<div class="loading">Atualizando</div>';
  loadMenuData();
}

// ================================================================
// TOGGLE DE DISPONIBILIDADE
// ================================================================

async function toggleAvailability(itemNome, currentStatus, categoria) {
  const newStatus = !currentStatus;
  // Chave no formato "Categoria:Nome" — igual ao kds.js e app.js
  const kdsKey = `${categoria}:${itemNome}`;

  try {
    await firebase.database().ref(`menuAvailability/${kdsKey}`).set(newStatus);
    console.log(`✅ ${kdsKey} → ${newStatus ? "Ativo" : "Esgotado"}`);

    // Atualizar localmente
    Object.keys(menuData).forEach((cat) => {
      menuData[cat].forEach((item) => {
        if (item.nome === itemNome && item.categoria === categoria) {
          item.disponivel = newStatus;
        }
      });
    });

    renderCardapio();
  } catch (error) {
    console.error("❌ Erro ao alterar disponibilidade:", error);
    alert("Erro ao alterar disponibilidade");
  }
}

// ================================================================
// MODAL DE EDIÇÃO (COM SUBITENS)
// ================================================================

function openEditModal(item) {
  currentEditingItem = item;

  const modal = document.getElementById("modal-edit-item");
  const title = document.getElementById("modal-item-title");
  const body = document.getElementById("modal-edit-body");

  title.textContent = `Editar: ${item.nome}`;

  let html = '<div style="display: flex; flex-direction: column; gap: 24px;">';

  // ============================================
  // DISPONIBILIDADE DO ITEM PRINCIPAL
  // ============================================
  const itemDisponivel = item.disponivel !== false;
  html += `
    <div style="background: var(--bg-dark); padding: 16px; border-radius: 12px; border: 2px solid var(--border);">
      <h3 style="color: var(--primary); margin-bottom: 16px;">📍 Status do Item</h3>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="color: var(--text-primary); font-weight: 600; margin-bottom: 4px;">Disponibilidade Geral</p>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">Controla se o item aparece no cardápio</p>
        </div>
        <div class="toggle-switch ${itemDisponivel ? "active" : ""}" 
             onclick="toggleItemInModal()"
             id="toggle-item-main"
             data-status="${itemDisponivel}">
        </div>
      </div>
    </div>
  `;

  // ============================================
  // PREÇOS (somente leitura — editar no cardapio.json)
  // ============================================
  html +=
    '<div style="background: var(--bg-dark); padding: 16px; border-radius: 12px; border: 2px solid var(--border);">';
  html +=
    '<h3 style="color: var(--primary); margin-bottom: 8px;">💰 Preços</h3>';
  html +=
    '<p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 12px;">Os preços são definidos no cardapio.json.</p>';

  if (item.opcoes && item.opcoes.length > 0) {
    item.opcoes.forEach((opcao, idx) => {
      const preco = item.precoBase[idx] || 0;
      html += `
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
          <span style="color: var(--text-primary);">${opcao}</span>
          <span style="color: var(--primary); font-weight: 600;">R$ ${preco.toFixed(2)}</span>
        </div>
      `;
    });
  } else {
    const preco = item.precoBase[0] || 0;
    html += `
      <div style="display: flex; justify-content: space-between; padding: 8px 0;">
        <span style="color: var(--text-secondary);">Preço Base</span>
        <span style="color: var(--primary); font-weight: 600;">R$ ${preco.toFixed(2)}</span>
      </div>
    `;
  }
  html += "</div>";

  // ============================================
  // ADICIONAIS PAGOS
  // ============================================
  if (item.paidExtras && item.paidExtras.length > 0) {
    html +=
      '<div style="background: var(--bg-dark); padding: 16px; border-radius: 12px; border: 2px solid var(--border);">';
    html +=
      '<h3 style="color: var(--primary); margin-bottom: 16px;">🍔 Adicionais Pagos</h3>';

    item.paidExtras.forEach((extra, idx) => {
      const disponivel = extra.disponivel !== false;
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 12px; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border);">
          <div style="flex: 1;">
            <span style="color: var(--text-primary); font-weight: 500;">${extra.nome}</span>
            <span style="color: var(--text-secondary); margin-left: 12px;">R$ ${extra.preco.toFixed(2)}</span>
          </div>
          <div class="toggle-switch ${disponivel ? "active" : ""}" 
               onclick="toggleExtraInModal(${idx})"
               data-extra-idx="${idx}"
               data-extra-status="${disponivel}">
          </div>
        </div>
      `;
    });

    html += "</div>";
  }

  html += "</div>";

  body.innerHTML = html;
  modal.classList.add("show");
}

// Toggle do item principal no modal
function toggleItemInModal() {
  const toggle = document.getElementById("toggle-item-main");
  const currentStatus = toggle.dataset.status === "true";
  const newStatus = !currentStatus;

  toggle.classList.toggle("active");
  toggle.dataset.status = newStatus;

  // Atualizar no objeto temporário
  currentEditingItem.disponivel = newStatus;
}

// toggleSubitemInModal removido — subitemsAvailability não existe nas regras Firebase

// Toggle de adicionais pagos no modal
function toggleExtraInModal(idx) {
  const toggle = document.querySelector(`[data-extra-idx="${idx}"]`);
  const currentStatus = toggle.dataset.extraStatus === "true";
  const newStatus = !currentStatus;

  toggle.classList.toggle("active");
  toggle.dataset.extraStatus = newStatus;

  // Atualizar no objeto temporário
  currentEditingItem.paidExtras[idx].disponivel = newStatus;
}

function closeEditModal() {
  document.getElementById("modal-edit-item").classList.remove("show");
  currentEditingItem = null;
}

async function saveItemChanges() {
  if (!currentEditingItem) return;

  const categoria = currentEditingItem.categoria;
  const nome = currentEditingItem.nome;

  try {
    const db = firebase.database();
    const updates = {};

    // 1. Disponibilidade do item — chave "Categoria:Nome" igual ao kds.js e app.js
    updates[`menuAvailability/${categoria}:${nome}`] =
      currentEditingItem.disponivel;

    // 2. Adicionais pagos — salvar cada extra com nome direto na raiz de paidExtrasAvailability
    //    igual ao formato que kds.js e app.js leem: paidExtrasAvailability["Bacon"] = true/false
    if (
      currentEditingItem.paidExtras &&
      currentEditingItem.paidExtras.length > 0
    ) {
      currentEditingItem.paidExtras.forEach((extra) => {
        updates[`paidExtrasAvailability/${extra.nome}`] =
          extra.disponivel !== false;
      });
    }

    await db.ref().update(updates);

    console.log("✅ Alterações salvas no Firebase:", Object.keys(updates));

    closeEditModal();
    refreshMenuData();
  } catch (error) {
    console.error("❌ Erro ao salvar:", error);
    alert(
      error.code === "PERMISSION_DENIED"
        ? "⚠️ Sem permissão para salvar. Verifique as regras do Firebase."
        : "Erro ao salvar alterações",
    );
  }
}

// ================================================================
// GESTÃO DE INSUMOS
// ================================================================

let insumosData = {
  paidExtras: [],
  ingredients: [],
  caldas: [],
};

async function loadInsumosData() {
  console.log("📦 Carregando insumos...");

  try {
    const db = firebase.database();

    // 1. Carregar cardapio.json para extrair listas de insumos
    const response = await fetch("./cardapio.json");
    const jsonMenu = await response.json();

    // 2. Extrair adicionais pagos únicos
    const paidExtrasSet = new Set();
    Object.values(jsonMenu).forEach((categoria) => {
      categoria.forEach((item) => {
        if (item.paidExtras) {
          item.paidExtras.forEach((extra) => {
            paidExtrasSet.add(extra.nome);
          });
        }
        if (item.adicionais) {
          item.adicionais.forEach((extra) => {
            paidExtrasSet.add(extra.nome);
          });
        }
      });
    });

    // 3. Extrair ingredientes únicos (com normalização)
    const ingredientsSet = new Set();
    Object.values(jsonMenu).forEach((categoria) => {
      categoria.forEach((item) => {
        if (item.ingredientesPadrao) {
          item.ingredientesPadrao.forEach((ing) =>
            ingredientsSet.add(normalizeIngredientName(ing)),
          );
        }
        if (item.simplesIngredients) {
          item.simplesIngredients.forEach((ing) =>
            ingredientsSet.add(normalizeIngredientName(ing)),
          );
        }
        if (item.duploIngredients) {
          item.duploIngredients.forEach((ing) =>
            ingredientsSet.add(normalizeIngredientName(ing)),
          );
        }
        if (item.ingredientesPorOpcao) {
          Object.values(item.ingredientesPorOpcao).forEach((list) => {
            list.forEach((ing) =>
              ingredientsSet.add(normalizeIngredientName(ing)),
            );
          });
        }
      });
    });

    // 4. Caldas dos milk shakes (exclui "Sem calda" que não é um insumo real)
    const caldasSet = new Set();
    Object.values(jsonMenu).forEach((categoria) => {
      categoria.forEach((item) => {
        if (item.caldas) {
          item.caldas
            .filter((c) => c.toLowerCase() !== "sem calda")
            .forEach((calda) => caldasSet.add(calda));
        }
      });
    });

    // 5. Buscar disponibilidade do Firebase com nome direto (mesmo formato do kds.js e app.js)
    let globalPaidExtrasAvail = {};
    let globalIngredientsAvail = {};

    try {
      const [paidExtrasSnap, ingredientsSnap] = await Promise.all([
        db.ref("paidExtrasAvailability").once("value"),
        db.ref("ingredientsAvailability").once("value"),
      ]);
      globalPaidExtrasAvail = paidExtrasSnap.val() || {};
      globalIngredientsAvail = ingredientsSnap.val() || {};
    } catch (err) {
      console.warn("⚠️ Erro ao carregar disponibilidade de insumos");
    }

    // 6. Montar estrutura — chave é o nome direto, igual ao kds.js e app.js
    insumosData = {
      paidExtras: Array.from(paidExtrasSet).map((nome) => ({
        nome,
        disponivel: globalPaidExtrasAvail[nome] !== false,
      })),
      ingredients: Array.from(ingredientsSet).map((nome) => ({
        nome,
        disponivel: globalIngredientsAvail[nome] !== false,
      })),
      caldas: Array.from(caldasSet).map((nome) => ({
        nome,
        disponivel: true, // caldas não têm controle via Firebase nesta versão
      })),
    };

    console.log("✅ Insumos carregados:", insumosData);

    // 7. Renderizar
    renderInsumos();
  } catch (error) {
    console.error("❌ Erro ao carregar insumos:", error);
  }
}

function renderInsumos() {
  // Renderizar Adicionais Pagos
  const paidExtrasContainer = document.getElementById(
    "global-paid-extras-container",
  );

  if (insumosData.paidExtras.length === 0) {
    paidExtrasContainer.innerHTML =
      '<p style="color: var(--text-secondary);">Nenhum adicional encontrado</p>';
  } else {
    let html = "";
    insumosData.paidExtras.forEach((extra) => {
      const statusClass = extra.disponivel ? "active" : "";
      const usageCount = countUsageInMenu(extra.nome, "paidExtra");

      html += `
        <div class="insumo-item">
          <div class="insumo-info">
            <div class="insumo-name">${extra.nome}</div>
            <div class="insumo-usage">Usado em ${usageCount} ${usageCount === 1 ? "item" : "itens"}</div>
          </div>
          <div class="insumo-toggle">
            <div class="toggle-switch ${statusClass}" 
                 onclick="toggleGlobalInsumo('paidExtra', '${extra.nome.replace(/'/g, "\'")}', ${extra.disponivel})">
            </div>
          </div>
        </div>
      `;
    });
    paidExtrasContainer.innerHTML = html;
  }

  // Renderizar Ingredientes
  const ingredientsContainer = document.getElementById(
    "global-ingredients-container",
  );

  if (insumosData.ingredients.length === 0) {
    ingredientsContainer.innerHTML =
      '<p style="color: var(--text-secondary);">Nenhum ingrediente encontrado</p>';
  } else {
    let html = "";
    insumosData.ingredients.forEach((ing) => {
      const statusClass = ing.disponivel ? "active" : "";
      const usageCount = countUsageInMenu(ing.nome, "ingredient");

      html += `
        <div class="insumo-item">
          <div class="insumo-info">
            <div class="insumo-name">${ing.nome}</div>
            <div class="insumo-usage">Usado em ${usageCount} ${usageCount === 1 ? "item" : "itens"}</div>
          </div>
          <div class="insumo-toggle">
            <div class="toggle-switch ${statusClass}" 
                 onclick="toggleGlobalInsumo('ingredient', '${ing.nome.replace(/'/g, "\'")}', ${ing.disponivel})">
            </div>
          </div>
        </div>
      `;
    });
    ingredientsContainer.innerHTML = html;
  }

  // Renderizar Caldas
  const caldasContainer = document.getElementById("caldas-container");

  if (insumosData.caldas.length === 0) {
    caldasContainer.innerHTML =
      '<p style="color: var(--text-secondary);">Nenhuma calda encontrada</p>';
  } else {
    let html = "";
    insumosData.caldas.forEach((calda) => {
      const statusClass = calda.disponivel ? "active" : "";

      html += `
        <div class="insumo-item">
          <div class="insumo-info">
            <div class="insumo-name">${calda.nome}</div>
            <div class="insumo-usage">Milk Shakes</div>
          </div>
          <div class="insumo-toggle">
            <div class="toggle-switch ${statusClass}" 
                 onclick="toggleGlobalInsumo('calda', '${calda.nome.replace(/'/g, "\'")}', ${calda.disponivel})">
            </div>
          </div>
        </div>
      `;
    });
    caldasContainer.innerHTML = html;
  }
}

function countUsageInMenu(insumoNome, type) {
  if (!menuData) return 0;

  let count = 0;

  Object.values(menuData).forEach((categoria) => {
    categoria.forEach((item) => {
      if (type === "paidExtra") {
        if (
          item.paidExtras &&
          item.paidExtras.some((e) => e.nome === insumoNome)
        )
          count++;
        if (
          item.adicionais &&
          item.adicionais.some((e) => e.nome === insumoNome)
        )
          count++;
      } else if (type === "ingredient") {
        const allIngredients = [
          ...(item.ingredientesPadrao || []),
          ...(item.simplesIngredients || []),
          ...(item.duploIngredients || []),
        ];

        if (item.ingredientesPorOpcao) {
          Object.values(item.ingredientesPorOpcao).forEach((list) => {
            allIngredients.push(...list);
          });
        }

        if (allIngredients.includes(insumoNome)) count++;
      }
    });
  });

  return count;
}

async function toggleGlobalInsumo(type, nome, currentStatus) {
  const newStatus = !currentStatus;

  try {
    const db = firebase.database();
    let path = "";

    switch (type) {
      case "paidExtra":
        // Salvar com nome direto — igual ao formato que kds.js e app.js leem
        path = `paidExtrasAvailability/${nome}`;
        break;
      case "ingredient":
        path = `ingredientsAvailability/${nome}`;
        break;
      case "calda":
        // caldas não têm nó Firebase nesta versão, apenas UI local
        console.warn("Caldas não têm controle via Firebase nesta versão");
        return;
    }

    await db.ref(path).set(newStatus);
    console.log(
      `✅ "${nome}" (${type}) → ${newStatus ? "Disponível" : "Indisponível"}`,
    );

    // Atualizar localmente pelo nome
    const arrays = {
      paidExtra: insumosData.paidExtras,
      ingredient: insumosData.ingredients,
    };
    const targetArray = arrays[type];
    if (targetArray) {
      const item = targetArray.find((i) => i.nome === nome);
      if (item) item.disponivel = newStatus;
    }

    renderInsumos();
  } catch (error) {
    console.error("❌ Erro ao alterar insumo:", error);
    alert("Erro ao alterar disponibilidade do insumo");
  }
}

function refreshInsumosData() {
  document.getElementById("global-paid-extras-container").innerHTML =
    '<div class="loading">Atualizando</div>';
  document.getElementById("global-ingredients-container").innerHTML =
    '<div class="loading">Atualizando</div>';
  document.getElementById("caldas-container").innerHTML =
    '<div class="loading">Atualizando</div>';
  loadInsumosData();
}

// ================================================================
// DASHBOARD FINANCEIRO
// ================================================================

// ================================================================
// DASHBOARD — FILTRO AVANÇADO DE PERÍODO
// ================================================================

let dashboardFilterStart = null;
let dashboardFilterEnd = null;

function _localDayStart(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
}
function _localDayEnd(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}
function _fmtDate(ts) {
  return new Date(ts).toLocaleDateString("pt-BR");
}

function applyShortcut(shortcut) {
  const today = new Date();
  let start, end;

  document
    .querySelectorAll(".filter-shortcut")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelector(`[data-shortcut="${shortcut}"]`)
    .classList.add("active");

  const customRange = document.getElementById("filter-custom-range");

  switch (shortcut) {
    case "hoje":
      start = _localDayStart(today);
      end = _localDayEnd(today);
      customRange.style.display = "none";
      document.getElementById("filter-period-text").textContent =
        `Hoje, ${_fmtDate(start)}`;
      break;

    case "ontem": {
      const ontem = new Date(today);
      ontem.setDate(today.getDate() - 1);
      start = _localDayStart(ontem);
      end = _localDayEnd(ontem);
      customRange.style.display = "none";
      document.getElementById("filter-period-text").textContent =
        `Ontem, ${_fmtDate(start)}`;
      break;
    }

    case "semana": {
      const semAgo = new Date(today);
      semAgo.setDate(today.getDate() - 6);
      start = _localDayStart(semAgo);
      end = _localDayEnd(today);
      customRange.style.display = "none";
      document.getElementById("filter-period-text").textContent =
        `${_fmtDate(start)} → ${_fmtDate(end)}`;
      break;
    }

    case "mes": {
      const mesStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start = _localDayStart(mesStart);
      end = _localDayEnd(today);
      customRange.style.display = "none";
      document.getElementById("filter-period-text").textContent =
        `${_fmtDate(start)} → ${_fmtDate(end)}`;
      break;
    }

    case "personalizado": {
      customRange.style.display = "flex";
      const startInput = document.getElementById("filter-date-start");
      const endInput = document.getElementById("filter-date-end");
      if (!startInput.value)
        startInput.value = today.toISOString().split("T")[0];
      if (!endInput.value) endInput.value = today.toISOString().split("T")[0];
      return;
    }
  }

  dashboardFilterStart = start;
  dashboardFilterEnd = end;
  loadDashboardData();
}

function _resolveCustomRange() {
  const startVal = document.getElementById("filter-date-start").value;
  const endVal = document.getElementById("filter-date-end").value;

  if (!startVal || !endVal) {
    alert("Selecione as duas datas do período.");
    return false;
  }

  const [sy, sm, sd] = startVal.split("-").map(Number);
  const [ey, em, ed] = endVal.split("-").map(Number);

  dashboardFilterStart = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
  dashboardFilterEnd = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();

  if (dashboardFilterStart > dashboardFilterEnd) {
    alert("A data inicial não pode ser maior que a final.");
    return false;
  }

  document.getElementById("filter-period-text").textContent =
    `${_fmtDate(dashboardFilterStart)} → ${_fmtDate(dashboardFilterEnd)}`;
  return true;
}

async function loadDashboardData() {
  console.log("📊 Carregando dashboard...");

  const activeShortcut = document.querySelector(".filter-shortcut.active")
    ?.dataset?.shortcut;
  if (activeShortcut === "personalizado") {
    if (!_resolveCustomRange()) return;
  }

  if (!dashboardFilterStart || !dashboardFilterEnd) {
    applyShortcut("hoje");
    return;
  }

  const dateStart = dashboardFilterStart;
  const dateEnd = dashboardFilterEnd;

  console.log(
    "📅 Filtro:",
    new Date(dateStart).toLocaleString("pt-BR"),
    "→",
    new Date(dateEnd).toLocaleString("pt-BR"),
  );

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Timeout: Firebase não respondeu em 10s")),
        10000,
      ),
    );
    const queryPromise = firebase.database().ref("pedidos").once("value");
    const pedidosSnap = await Promise.race([queryPromise, timeoutPromise]);

    const pedidos = [];
    pedidosSnap.forEach((child) => {
      const p = { id: child.key, ...child.val() };
      if (p.timestamp && p.timestamp >= dateStart && p.timestamp <= dateEnd) {
        pedidos.push(p);
      }
    });

    console.log(`📦 ${pedidos.length} pedido(s) encontrado(s) para o período`);

    dashboardData = calculateMetrics(pedidos);
    renderDashboard();
    renderCharts();
  } catch (error) {
    console.error("❌ Erro ao carregar dashboard:", error);
    const errorMsg =
      error.code === "PERMISSION_DENIED"
        ? "Sem permissão para ler pedidos. Verifique se está autenticado."
        : `Erro ao carregar dados: ${error.message}`;
    alert("⚠️ Dashboard: " + errorMsg);
  }
}

function calculateMetrics(pedidos) {
  let totalVendas = 0;
  let totalPedidos = pedidos.length;
  let totalTempo = 0;
  let countTempo = 0;

  const categorias = {};
  const pagamentos = {};
  const produtos = {};

  pedidos.forEach((p) => {
    totalVendas += p.total || 0;

    // Tempo médio
    if (p.tempoPreparacao) {
      totalTempo += p.tempoPreparacao;
      countTempo++;
    }

    // Método de pagamento
    const pag = p.pagamento || "Não informado";
    pagamentos[pag] = (pagamentos[pag] || 0) + 1;

    // Analisar itens
    if (p.itens) {
      p.itens.forEach((item) => {
        // Categoria
        const cat = item.categoria || "Outros";
        categorias[cat] =
          (categorias[cat] || 0) + (item.precoTotal || item.preco || 0);

        // Produto
        const nomeProduto = item.nome || "Desconhecido";
        if (!produtos[nomeProduto]) {
          produtos[nomeProduto] = { qtd: 0, valor: 0 };
        }
        produtos[nomeProduto].qtd += 1;
        produtos[nomeProduto].valor += item.precoTotal || item.preco || 0;
      });
    }
  });

  const ticketMedio = totalPedidos > 0 ? totalVendas / totalPedidos : 0;
  const tempoMedio = countTempo > 0 ? Math.round(totalTempo / countTempo) : 0;

  return {
    totalVendas,
    totalPedidos,
    ticketMedio,
    tempoMedio,
    categorias,
    pagamentos,
    produtos,
  };
}

function renderDashboard() {
  if (!dashboardData) return;

  document.getElementById("metric-vendas-hoje").textContent =
    `R$ ${dashboardData.totalVendas.toFixed(2)}`;

  document.getElementById("metric-pedidos-hoje").textContent =
    dashboardData.totalPedidos;

  document.getElementById("metric-ticket-medio").textContent =
    `R$ ${dashboardData.ticketMedio.toFixed(2)}`;

  document.getElementById("metric-tempo-medio").textContent =
    `${dashboardData.tempoMedio} min`;

  // Top produtos
  const topProdutosContainer = document.getElementById("top-produtos");
  const produtosArray = Object.entries(dashboardData.produtos)
    .map(([nome, data]) => ({ nome, ...data }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 10);

  if (produtosArray.length === 0) {
    topProdutosContainer.innerHTML =
      '<p style="color: var(--text-secondary); text-align: center;">Nenhum produto vendido hoje</p>';
  } else {
    let html = "";
    produtosArray.forEach((prod, idx) => {
      html += `
        <div class="top-produto-item">
          <div class="top-produto-info">
            <div class="top-produto-rank">${idx + 1}</div>
            <span class="top-produto-name">${prod.nome}</span>
          </div>
          <div class="top-produto-stats">
            <span class="top-produto-qtd">${prod.qtd}x</span>
            <span>R$ ${prod.valor.toFixed(2)}</span>
          </div>
        </div>
      `;
    });
    topProdutosContainer.innerHTML = html;
  }
}

function renderCharts() {
  if (!dashboardData) return;

  // Gráfico de Categorias
  const ctxCat = document.getElementById("chart-categorias");

  if (window.chartCategorias) window.chartCategorias.destroy();

  window.chartCategorias = new Chart(ctxCat, {
    type: "doughnut",
    data: {
      labels: Object.keys(dashboardData.categorias),
      datasets: [
        {
          data: Object.values(dashboardData.categorias),
          backgroundColor: [
            "#ffc107",
            "#ff9800",
            "#4caf50",
            "#2196f3",
            "#9c27b0",
            "#f44336",
            "#00bcd4",
          ],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#fff" },
        },
      },
    },
  });

  // Gráfico de Pagamento
  const ctxPag = document.getElementById("chart-pagamento");

  if (window.chartPagamento) window.chartPagamento.destroy();

  window.chartPagamento = new Chart(ctxPag, {
    type: "bar",
    data: {
      labels: Object.keys(dashboardData.pagamentos),
      datasets: [
        {
          label: "Pedidos",
          data: Object.values(dashboardData.pagamentos),
          backgroundColor: "#ffc107",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#fff" },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: "#fff" },
          grid: { color: "#333" },
        },
        x: {
          ticks: { color: "#fff" },
          grid: { color: "#333" },
        },
      },
    },
  });
}

// ================================================================
// GESTÃO DE PEDIDOS
// ================================================================

async function loadPedidos() {
  console.log("🛒 Carregando pedidos...");

  try {
    const snapshot = await firebase.database().ref("pedidos").once("value");

    allPedidos = [];

    snapshot.forEach((child) => {
      allPedidos.push({
        id: child.key,
        ...child.val(),
      });
    });

    // Ordenar por timestamp (mais recente primeiro)
    allPedidos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    filteredPedidos = [...allPedidos];

    renderPedidos();
  } catch (error) {
    console.error("❌ Erro ao carregar pedidos:", error);
  }
}

function renderPedidos() {
  const container = document.getElementById("pedidos-container");

  if (filteredPedidos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <p class="empty-state-text">Nenhum pedido encontrado</p>
      </div>
    `;
    return;
  }

  let html = "";

  filteredPedidos.forEach((pedido) => {
    html += createPedidoCard(pedido);
  });

  container.innerHTML = html;

  // Botão excluir todos abaixo dos cards
  const btnExcluirTodos = document.createElement("div");
  btnExcluirTodos.className = "pedidos-excluir-todos-wrapper";
  btnExcluirTodos.innerHTML = `
    <button class="btn-excluir-todos-pedidos" onclick="openModalExcluirPedidos()">
      🗑️ Excluir Todos os Pedidos
    </button>
  `;
  container.appendChild(btnExcluirTodos);
}

function createPedidoCard(pedido) {
  const status = pedido.status || "preparando";
  const nome = pedido.nomeCliente || pedido.nome || "Cliente";
  const mesa = pedido.mesa || "-";
  const total = pedido.total || 0;
  const timestamp = pedido.timestamp
    ? new Date(pedido.timestamp).toLocaleTimeString("pt-BR")
    : "-";

  const itensCount = pedido.itens ? pedido.itens.length : 0;

  return `
    <div class="pedido-card" data-pedido-id="${pedido.id}">
      <div class="pedido-header">
        <div class="pedido-info">
          <h3>${nome}</h3>
          <p class="pedido-meta">Mesa: ${mesa} • ${timestamp}</p>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="pedido-status ${status}">${status.toUpperCase()}</span>
          <button class="btn-delete-card" onclick="deletarPedido('${pedido.id}')" title="Excluir pedido">✕</button>
        </div>
      </div>
      
      <div class="pedido-items">
        <p style="color: var(--text-secondary);">${itensCount} ${itensCount === 1 ? "item" : "itens"}</p>
      </div>
      
      <div class="pedido-footer">
        <span class="pedido-total">R$ ${total.toFixed(2)}</span>
        <div class="pedido-actions">
          <button class="btn-icon view" onclick="openPedidoModal('${pedido.id}')" title="Ver Detalhes">
            👁️
          </button>
          <button class="btn-icon finish" onclick="finalizarPedidoRapido('${pedido.id}')" title="Finalizar">
            ✓
          </button>
        </div>
      </div>
    </div>
  `;
}

function filterPedidos() {
  const searchQuery = document
    .getElementById("search-pedidos")
    .value.toLowerCase();
  const statusFilter = document.getElementById("filter-status").value;

  filteredPedidos = allPedidos.filter((p) => {
    const matchSearch =
      !searchQuery ||
      (p.nomeCliente || p.nome || "").toLowerCase().includes(searchQuery) ||
      (p.mesa || "").toString().includes(searchQuery);

    const matchStatus =
      statusFilter === "all" || (p.status || "preparando") === statusFilter;

    return matchSearch && matchStatus;
  });

  renderPedidos();
}

// ================================================================
// EXCLUSÃO DE PEDIDOS
// ================================================================

async function deletarPedido(pedidoId) {
  if (!confirm("Excluir este pedido permanentemente?")) return;

  // Remove o card do DOM imediatamente (sem esperar Firebase)
  const card = document.querySelector(`[data-pedido-id="${pedidoId}"]`);
  if (card) card.remove();

  // Atualiza os arrays locais imediatamente
  allPedidos = allPedidos.filter((p) => p.id !== pedidoId);
  filteredPedidos = filteredPedidos.filter((p) => p.id !== pedidoId);

  // Se não sobrou nenhum card, mostra estado vazio
  const container = document.getElementById("pedidos-container");
  const cardsRestantes = container.querySelectorAll(".pedido-card");
  if (cardsRestantes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <p class="empty-state-text">Nenhum pedido encontrado</p>
      </div>
    `;
  }

  try {
    await firebase.database().ref(`pedidos/${pedidoId}`).remove();
  } catch (error) {
    console.error("❌ Erro ao excluir pedido:", error);
    alert("Erro ao excluir pedido. Recarregue a página.");
    loadPedidos(); // Re-sincroniza em caso de erro
  }
}

function openModalExcluirPedidos() {
  document.getElementById("modal-excluir-pedidos").classList.add("show");
}

function closeModalExcluirPedidos() {
  document.getElementById("modal-excluir-pedidos").classList.remove("show");
}

async function excluirPedidosPorPeriodo(periodo) {
  const labels = {
    hoje: "de hoje",
    ontem: "de ontem",
    semana1: "da última semana",
    semana2: "das últimas 2 semanas",
    semana3: "das últimas 3 semanas",
    mes1: "do último mês",
    mes2: "dos últimos 2 meses",
    tudo: "TODOS",
  };

  if (!confirm(`Excluir permanentemente os pedidos ${labels[periodo]}?`))
    return;

  closeModalExcluirPedidos();

  try {
    const db = firebase.database();
    const snapshot = await db.ref("pedidos").once("value");

    const agora = Date.now();
    const limites = {
      hoje: () => {
        const inicio = new Date();
        inicio.setHours(0, 0, 0, 0);
        return inicio.getTime();
      },
      ontem: () => {
        const inicio = new Date();
        inicio.setDate(inicio.getDate() - 1);
        inicio.setHours(0, 0, 0, 0);
        const fim = new Date();
        fim.setHours(0, 0, 0, 0);
        return { inicio: inicio.getTime(), fim: fim.getTime() };
      },
      semana1: () => agora - 7 * 24 * 60 * 60 * 1000,
      semana2: () => agora - 14 * 24 * 60 * 60 * 1000,
      semana3: () => agora - 21 * 24 * 60 * 60 * 1000,
      mes1: () => agora - 30 * 24 * 60 * 60 * 1000,
      mes2: () => agora - 60 * 24 * 60 * 60 * 1000,
      tudo: () => null,
    };

    const updates = {};
    let count = 0;

    snapshot.forEach((child) => {
      const ts = child.val().timestamp || 0;
      let excluir = false;

      if (periodo === "tudo") {
        excluir = true;
      } else if (periodo === "hoje") {
        // Deleta apenas pedidos de hoje (das 00:00 até agora)
        excluir = ts >= limites.hoje();
      } else if (periodo === "ontem") {
        // Deleta apenas pedidos de ontem (das 00:00 às 23:59 de ontem)
        const { inicio, fim } = limites.ontem();
        excluir = ts >= inicio && ts < fim;
      } else {
        // semana1/2/3, mes1/2: deleta pedidos MAIS ANTIGOS que o limite
        // Ex: semana1 → deleta pedidos com mais de 7 dias
        excluir = ts <= limites[periodo]();
      }

      if (excluir) {
        updates[`pedidos/${child.key}`] = null;
        count++;
      }
    });

    if (count === 0) {
      alert("Nenhum pedido encontrado no período selecionado.");
      return;
    }

    await db.ref().update(updates);
    alert(`${count} pedido(s) excluído(s) com sucesso.`);
    loadPedidos();
  } catch (error) {
    console.error("❌ Erro ao excluir pedidos:", error);
    alert("Erro ao excluir pedidos");
  }
}

// ================================================================
// MODAL DE PEDIDO
// ================================================================

let currentPedidoModal = null;

function openPedidoModal(pedidoId) {
  // Busca em allPedidos (aba Pedidos) e também em pedidosAtivos (aba Início)
  const pedido =
    allPedidos.find((p) => p.id === pedidoId) ||
    pedidosAtivos.find((p) => p.id === pedidoId) ||
    historicoPedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;

  currentPedidoModal = pedido;

  const modal = document.getElementById("modal-pedido");
  const title = document.getElementById("modal-pedido-title");
  const body = document.getElementById("modal-pedido-body");

  title.textContent = `Pedido #${pedido.id.substr(0, 8)}`;

  let html = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div>
        <p style="color: var(--text-secondary); margin-bottom: 4px;">Cliente</p>
        <p style="color: var(--text-primary); font-size: 1.1rem; font-weight: 600;">${pedido.nomeCliente || pedido.nome || "-"}</p>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <p style="color: var(--text-secondary); margin-bottom: 4px;">Mesa</p>
          <p style="color: var(--text-primary);">${pedido.mesa || "-"}</p>
        </div>
        <div>
          <p style="color: var(--text-secondary); margin-bottom: 4px;">Pagamento</p>
          <p style="color: var(--text-primary);">${pedido.pagamento || "-"}</p>
        </div>
      </div>
      
      <div>
        <p style="color: var(--text-secondary); margin-bottom: 4px;">Status</p>
        <span class="pedido-status ${pedido.status || "preparando"}">${(pedido.status || "preparando").toUpperCase()}</span>
      </div>
      
      <div>
        <h3 style="color: var(--primary); margin-bottom: 12px;">Itens do Pedido</h3>
        <div style="background: var(--bg-dark); border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto;">
  `;

  if (pedido.itens && pedido.itens.length > 0) {
    pedido.itens.forEach((item) => {
      html += `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: var(--text-primary); font-weight: 500;">${item.nome}</span>
            <span style="color: var(--primary);">R$ ${(item.precoTotal || item.preco || 0).toFixed(2)}</span>
          </div>
          ${item.opcao ? `<p style="color: var(--text-secondary); font-size: 0.85rem;">• ${item.opcao}</p>` : ""}
          ${item.observacoes ? `<p style="color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">Obs: ${item.observacoes}</p>` : ""}
        </div>
      `;
    });
  } else {
    html += '<p style="color: var(--text-secondary);">Nenhum item</p>';
  }

  html += `
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid var(--border);">
        <span style="color: var(--text-secondary); font-size: 1.1rem;">TOTAL</span>
        <span style="color: var(--primary); font-size: 1.5rem; font-weight: 700;">R$ ${(pedido.total || 0).toFixed(2)}</span>
      </div>
    </div>
  `;

  body.innerHTML = html;
  modal.classList.add("show");
}

function closePedidoModal() {
  document.getElementById("modal-pedido").classList.remove("show");
  currentPedidoModal = null;
}

async function cancelarPedido() {
  if (!currentPedidoModal) return;

  if (!confirm("Deseja realmente CANCELAR este pedido?")) return;

  try {
    await firebase.database().ref(`pedidos/${currentPedidoModal.id}`).remove();

    console.log("✅ Pedido cancelado");

    closePedidoModal();
    loadPedidos();
  } catch (error) {
    console.error("❌ Erro ao cancelar:", error);
    alert("Erro ao cancelar pedido");
  }
}

async function finalizarPedido() {
  if (!currentPedidoModal) return;

  await finalizarPedidoRapido(currentPedidoModal.id);
  closePedidoModal();
}

async function finalizarPedidoRapido(pedidoId) {
  const pedido = allPedidos.find((p) => p.id === pedidoId);
  if (!pedido) return;

  if (
    !confirm(
      `Finalizar pedido de ${pedido.nomeCliente || pedido.nome || "Cliente"}?`,
    )
  )
    return;

  try {
    // Atualizar status para "entregue" — pedido fica em "pedidos" com status entregue
    await firebase.database().ref(`pedidos/${pedidoId}`).update({
      status: "entregue",
      timestampFinalizacao: Date.now(),
    });

    const pedidoFinalizado = { ...pedido, status: "entregue" };
    console.log("✅ Pedido finalizado");

    // Imprimir cupom
    printReceipt(pedidoFinalizado);

    loadPedidos();
  } catch (error) {
    console.error("❌ Erro ao finalizar:", error);
    alert("Erro ao finalizar pedido");
  }
}

// ================================================================
// IMPRESSÃO DE CUPOM
// ================================================================

function printReceipt(pedido) {
  const printWindow = window.open("", "_blank", "width=300,height=600");

  let itensHtml = "";
  if (pedido.itens && pedido.itens.length > 0) {
    pedido.itens.forEach((item) => {
      itensHtml += `
        <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #333;">
          <div style="display: flex; justify-content: space-between;">
            <span>${item.nome}</span>
            <span>R$ ${(item.precoTotal || item.preco || 0).toFixed(2)}</span>
          </div>
          ${item.opcao ? `<div style="font-size: 0.85rem; color: #666;">• ${item.opcao}</div>` : ""}
        </div>
      `;
    });
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Cupom #${pedido.id.substr(0, 8)}</title>
      <style>
        body {
          font-family: 'Courier New', monospace;
          width: 300px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          border-bottom: 2px solid #000;
          padding-bottom: 10px;
        }
        .header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        .info {
          margin-bottom: 20px;
          font-size: 0.9rem;
        }
        .items {
          margin-bottom: 20px;
        }
        .total {
          border-top: 2px solid #000;
          padding-top: 10px;
          font-size: 1.2rem;
          font-weight: bold;
          text-align: center;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🍔 RIBBS ZN</h1>
        <p>Cupom Fiscal</p>
      </div>
      
      <div class="info">
        <p><strong>Pedido:</strong> #${pedido.id.substr(0, 8)}</p>
        <p><strong>Cliente:</strong> ${pedido.nomeCliente || pedido.nome || "-"}</p>
        <p><strong>Mesa:</strong> ${pedido.mesa || "-"}</p>
        <p><strong>Data:</strong> ${new Date(pedido.timestamp).toLocaleString("pt-BR")}</p>
        <p><strong>Pagamento:</strong> ${pedido.pagamento || "-"}</p>
      </div>
      
      <div class="items">
        <h3>Itens:</h3>
        ${itensHtml}
      </div>
      
      <div class="total">
        TOTAL: R$ ${(pedido.total || 0).toFixed(2)}
      </div>
      
      <div style="text-align: center; margin-top: 20px; font-size: 0.8rem;">
        <p>Obrigado pela preferência!</p>
      </div>
      
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 500);
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

// ================================================================
// SEÇÃO INÍCIO - PEDIDOS ATIVOS E HISTÓRICO
// ================================================================

let pedidosAtivos = [];
let historicoPedidos = [];
let filteredHistorico = [];
let currentWhatsAppPedido = null;
let beepSound = null;
let isBeepPlaying = false;
let pedidosAceitosNoKDS = new Set(); // Armazena IDs de pedidos aceitos no KDS

// ================================================================
// INICIALIZAR ÁUDIO
// ================================================================

function initBeepSound() {
  beepSound = document.getElementById("beep-sound");
  if (beepSound) {
    beepSound.volume = 0.5;
  }
}

// ================================================================
// CONTROLE DE SOM
// ================================================================

function playBeep() {
  if (!beepSound || isBeepPlaying) return;

  beepSound
    .play()
    .then(() => {
      isBeepPlaying = true;
      console.log("🔊 Beep iniciado");
    })
    .catch((err) => {
      console.warn("⚠️ Não foi possível tocar o beep:", err);
    });
}

function stopBeep() {
  if (!beepSound || !isBeepPlaying) return;

  beepSound.pause();
  beepSound.currentTime = 0;
  isBeepPlaying = false;
  console.log("🔇 Beep parado");
}

// ================================================================
// VERIFICAR ACEITAÇÃO NO KDS
// ================================================================

function setupKDSListener() {
  const db = firebase.database();

  // Listener para verificar quando pedidos são aceitos no KDS
  db.ref("pedidos").on("child_changed", (snapshot) => {
    const pedido = snapshot.val();
    const pedidoId = snapshot.key;

    // Se o pedido foi aceito no KDS
    if (pedido.aceito === true || pedido.status === "preparando") {
      pedidosAceitosNoKDS.add(pedidoId);
      console.log(`✅ Pedido ${pedidoId} aceito no KDS`);

      // Recarregar pedidos para atualizar UI
      loadPedidosAtivos();
    }
  });
}

// ================================================================
// CARREGAR DADOS DA SEÇÃO INÍCIO
// ================================================================

async function loadInicioData() {
  console.log("📦 Carregando dados da seção Início...");

  // Configurar listener do KDS apenas uma vez
  if (!window.kdsListenerSetup) {
    setupKDSListener();
    window.kdsListenerSetup = true;
  }

  await loadPedidosAtivos();
  await loadHistoricoData();
}

function refreshInicioData() {
  loadInicioData();
}

// ================================================================
// PEDIDOS ATIVOS
// ================================================================

async function loadPedidosAtivos() {
  console.log("📦 Carregando pedidos ativos...");

  try {
    const db = firebase.database();
    const snapshot = await db.ref("pedidos").once("value");

    pedidosAtivos = [];
    let hasPendingOrders = false;

    snapshot.forEach((child) => {
      const pedido = {
        id: child.key,
        ...child.val(),
      };

      // Filtrar apenas pedidos não finalizados
      if (pedido.status !== "entregue") {
        pedidosAtivos.push(pedido);

        // Verificar se há pedidos não aceitos
        if (!pedido.aceito && !pedidosAceitosNoKDS.has(pedido.id)) {
          hasPendingOrders = true;
        }
      }
    });

    console.log(`✅ ${pedidosAtivos.length} pedidos ativos carregados`);

    // Controlar beep baseado em pedidos pendentes
    const section = document.querySelector(".pedidos-ativos-section");
    const btnExcluirTodos = document.getElementById("btn-excluir-todos");

    if (hasPendingOrders) {
      section.classList.add("has-pending");
      if (btnExcluirTodos) btnExcluirTodos.classList.remove("hidden");
      playBeep();
    } else {
      section.classList.remove("has-pending");
      if (btnExcluirTodos) btnExcluirTodos.classList.add("hidden");
      stopBeep();
    }

    renderPedidosAtivos();
  } catch (error) {
    console.error("❌ Erro ao carregar pedidos ativos:", error);
    document.getElementById("pedidos-ativos-container").innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Erro ao carregar pedidos</p>
      </div>
    `;
  }
}

function renderPedidosAtivos() {
  const container = document.getElementById("pedidos-ativos-container");

  if (pedidosAtivos.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <p class="empty-state-text">Nenhum pedido ativo no momento</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  pedidosAtivos.forEach((pedido) => {
    const card = createPedidoAtivoCard(pedido);
    container.appendChild(card);
  });
}

function createPedidoAtivoCard(pedido) {
  const card = document.createElement("div");
  card.className = "pedido-card ativo";
  card.onclick = () => openPedidoModal(pedido.id);

  // Header
  const header = document.createElement("div");
  header.className = "pedido-header";

  const id = document.createElement("span");
  id.className = "pedido-id";
  id.textContent = `#${pedido.id.substr(0, 8)}`;
  header.appendChild(id);

  const status = document.createElement("span");
  status.className = `pedido-status ${pedido.status || "preparando"}`;
  status.textContent = (pedido.status || "preparando").toUpperCase();
  header.appendChild(status);

  card.appendChild(header);

  // Info
  const info = document.createElement("div");
  info.className = "pedido-info";

  const nome = document.createElement("p");
  nome.innerHTML = `<strong>Cliente:</strong> ${pedido.nomeCliente || pedido.nome || "-"}`;
  info.appendChild(nome);

  const mesa = document.createElement("p");
  mesa.innerHTML = `<strong>Mesa:</strong> ${pedido.mesa || "-"}`;
  info.appendChild(mesa);

  const total = document.createElement("p");
  total.innerHTML = `<strong>Total:</strong> <span style="color: var(--primary);">R$ ${(pedido.total || 0).toFixed(2)}</span>`;
  info.appendChild(total);

  card.appendChild(info);

  // Footer com botões
  const footer = document.createElement("div");
  footer.className = "pedido-footer";
  footer.style.flexDirection = "column";
  footer.style.gap = "8px";

  // Botão WhatsApp
  const btnWhatsApp = document.createElement("button");
  btnWhatsApp.className = "btn-whatsapp";
  btnWhatsApp.innerHTML = `📱 Enviar para Alex`;
  btnWhatsApp.onclick = (e) => {
    e.stopPropagation();
    openWhatsAppModal(pedido);
  };
  footer.appendChild(btnWhatsApp);

  // Container para botões na mesma linha
  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";

  // Botão Aceitar (para parar o beep)
  const btnAceitar = document.createElement("button");
  btnAceitar.className = "btn-success";
  btnAceitar.textContent = "✓ Aceitar";
  btnAceitar.style.flex = "1";
  btnAceitar.onclick = (e) => {
    e.stopPropagation();
    aceitarPedido(pedido.id);
  };
  btnRow.appendChild(btnAceitar);

  // Botão Excluir
  const btnExcluir = document.createElement("button");
  btnExcluir.className = "btn-delete-pedido";
  btnExcluir.innerHTML = `🗑️ Excluir`;
  btnExcluir.style.flex = "1";
  btnExcluir.onclick = (e) => {
    e.stopPropagation();
    excluirPedido(pedido.id);
  };
  btnRow.appendChild(btnExcluir);

  footer.appendChild(btnRow);
  card.appendChild(footer);

  return card;
}

// ================================================================
// TOGGLE PEDIDOS ATIVOS
// ================================================================

function togglePedidosAtivos() {
  const header = document.querySelector(".pedidos-ativos-header");
  const content = document.getElementById("pedidos-ativos-content");

  header.classList.toggle("expanded");
  content.classList.toggle("expanded");
}

// ================================================================
// ACEITAR PEDIDO (PARA O BEEP)
// ================================================================

async function aceitarPedido(pedidoId) {
  try {
    const db = firebase.database();

    // Marcar como aceito no Firebase
    await db.ref(`pedidos/${pedidoId}`).update({
      aceito: true,
      aceitoEm: Date.now(),
      aceitoPor: "admin",
    });

    // Adicionar aos pedidos aceitos localmente
    pedidosAceitosNoKDS.add(pedidoId);

    console.log(`✅ Pedido ${pedidoId} aceito`);

    // Recarregar para atualizar UI e parar beep se necessário
    await loadPedidosAtivos();
  } catch (error) {
    console.error("❌ Erro ao aceitar pedido:", error);
    alert("Erro ao aceitar pedido");
  }
}

// ================================================================
// EXCLUIR PEDIDO INDIVIDUAL
// ================================================================

async function excluirPedido(pedidoId) {
  if (
    !confirm(
      "Deseja realmente EXCLUIR este pedido?\n\nEsta ação não pode ser desfeita.",
    )
  ) {
    return;
  }

  try {
    const db = firebase.database();

    // Remover do Firebase
    await db.ref(`pedidos/${pedidoId}`).remove();

    // Remover do Set de aceitos
    pedidosAceitosNoKDS.delete(pedidoId);

    console.log(`✅ Pedido ${pedidoId} excluído`);

    // Recarregar
    await loadPedidosAtivos();
  } catch (error) {
    console.error("❌ Erro ao excluir pedido:", error);
    alert("Erro ao excluir pedido");
  }
}

// ================================================================
// EXCLUIR TODOS OS PEDIDOS ATIVOS
// ================================================================

async function excluirTodosPedidosAtivos() {
  if (
    !confirm(
      `Deseja realmente EXCLUIR TODOS os ${pedidosAtivos.length} pedidos ativos?\n\n⚠️ ATENÇÃO: Esta ação não pode ser desfeita!`,
    )
  ) {
    return;
  }

  if (!confirm("Tem certeza? Esta é sua última chance de cancelar.")) {
    return;
  }

  try {
    const db = firebase.database();

    // Criar array de promises para excluir todos
    const deletePromises = pedidosAtivos.map((pedido) =>
      db.ref(`pedidos/${pedido.id}`).remove(),
    );

    // Executar todas as exclusões
    await Promise.all(deletePromises);

    // Limpar Set de aceitos
    pedidosAceitosNoKDS.clear();

    // Parar beep
    stopBeep();

    console.log(`✅ ${pedidosAtivos.length} pedidos excluídos`);

    // Recarregar
    await loadPedidosAtivos();

    alert("Todos os pedidos ativos foram excluídos com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao excluir pedidos:", error);
    alert("Erro ao excluir pedidos");
  }
}

// ================================================================
// HISTÓRICO
// ================================================================

function toggleHistorico() {
  const header = document.querySelector(".historico-header");
  const content = document.getElementById("historico-content");

  header.classList.toggle("expanded");
  content.classList.toggle("expanded");

  // Carregar dados se ainda não foi carregado
  if (content.classList.contains("expanded") && historicoPedidos.length === 0) {
    loadHistoricoData();
  }
}

async function loadHistoricoData() {
  const filterDate = document.getElementById("filter-historico-date")?.value;

  if (!filterDate) {
    console.warn("⚠️ Data não selecionada");
    return;
  }

  console.log(`📦 Carregando histórico para ${filterDate}`);

  try {
    const db = firebase.database();

    // FIX: usar new Date(y,m,d) para garantir horário local sem ambiguidade de fuso
    const [hy, hm, hd] = filterDate.split("-").map(Number);
    const dateStart = new Date(hy, hm - 1, hd, 0, 0, 0, 0).getTime();
    const dateEnd = new Date(hy, hm - 1, hd, 23, 59, 59, 999).getTime();

    // FIX: buscar tudo e filtrar no cliente (evita travamento por índice)
    const snapshot = await db.ref("pedidos").once("value");

    historicoPedidos = [];
    snapshot.forEach((child) => {
      const pedido = { id: child.key, ...child.val() };
      // Filtrar por data e status finalizado
      if (
        pedido.timestamp >= dateStart &&
        pedido.timestamp <= dateEnd &&
        (pedido.status === "entregue" ||
          pedido.status === "completed" ||
          pedido.status === "cancelled")
      ) {
        historicoPedidos.push(pedido);
      }
    });

    console.log(`✅ ${historicoPedidos.length} pedidos no histórico`);

    filteredHistorico = [...historicoPedidos];
    renderHistorico();
  } catch (error) {
    console.error("❌ Erro ao carregar histórico:", error);
    document.getElementById("historico-container").innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p class="empty-state-text">Erro ao carregar histórico</p>
      </div>
    `;
  }
}

function filterHistorico() {
  const searchInput = document.getElementById("search-historico");
  const query = searchInput.value.toLowerCase().trim();

  if (!query) {
    filteredHistorico = [...historicoPedidos];
  } else {
    filteredHistorico = historicoPedidos.filter((pedido) => {
      return (
        (pedido.nomeCliente || pedido.nome || "")
          .toLowerCase()
          .includes(query) || (pedido.mesa || "").toLowerCase().includes(query)
      );
    });
  }

  renderHistorico();
}

function renderHistorico() {
  const container = document.getElementById("historico-container");

  if (filteredHistorico.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p class="empty-state-text">Nenhum pedido encontrado</p>
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  filteredHistorico.forEach((pedido) => {
    const card = createHistoricoCard(pedido);
    container.appendChild(card);
  });
}

function createHistoricoCard(pedido) {
  const card = document.createElement("div");
  card.className = "pedido-card";
  card.onclick = () => openPedidoModal(pedido.id);

  // Header
  const header = document.createElement("div");
  header.className = "pedido-header";

  const id = document.createElement("span");
  id.className = "pedido-id";
  id.textContent = `#${pedido.id.substr(0, 8)}`;
  header.appendChild(id);

  const status = document.createElement("span");
  status.className = `pedido-status ${pedido.status || "entregue"}`;
  status.textContent = (pedido.status || "entregue").toUpperCase();
  header.appendChild(status);

  card.appendChild(header);

  // Info
  const info = document.createElement("div");
  info.className = "pedido-info";

  const nome = document.createElement("p");
  nome.innerHTML = `<strong>Cliente:</strong> ${pedido.nomeCliente || pedido.nome || "-"}`;
  info.appendChild(nome);

  const total = document.createElement("p");
  total.innerHTML = `<strong>Total:</strong> <span style="color: var(--primary);">R$ ${(pedido.total || 0).toFixed(2)}</span>`;
  info.appendChild(total);

  const data = document.createElement("p");
  const timestamp = new Date(pedido.timestamp);
  data.innerHTML = `<strong>Data:</strong> ${timestamp.toLocaleString("pt-BR")}`;
  info.appendChild(data);

  card.appendChild(info);

  return card;
}

// ================================================================
// MODAL WHATSAPP
// ================================================================

function openWhatsAppModal(pedido) {
  currentWhatsAppPedido = pedido;

  const modal = document.getElementById("modal-whatsapp");
  const body = document.getElementById("modal-whatsapp-body");

  // Construir mensagem
  let mensagem = `🍔 *PEDIDO RIBBS ZN*\n\n`;
  mensagem += `📋 *Pedido:* #${pedido.id.substr(0, 8)}\n`;
  mensagem += `👤 *Cliente:* ${pedido.nomeCliente || pedido.nome || "-"}\n\n`;

  // Itens do pedido
  if (pedido.itens && pedido.itens.length > 0) {
    mensagem += `📦 *ITENS:*\n`;
    pedido.itens.forEach((item, index) => {
      mensagem += `${index + 1}. ${item.nome}`;
      if (item.opcao) mensagem += ` (${item.opcao})`;
      mensagem += ` - R$ ${(item.precoTotal || item.preco || 0).toFixed(2)}\n`;
      if (item.observacoes) {
        mensagem += `   ℹ️ ${item.observacoes}\n`;
      }
    });
    mensagem += `\n`;
  }

  // Endereço (se for delivery)
  if (pedido.tipoEntrega === "delivery" || pedido.endereco) {
    mensagem += `📍 *ENDEREÇO:*\n`;
    mensagem += `${pedido.endereco || ""}\n`;
    if (pedido.complemento) {
      mensagem += `${pedido.complemento}\n`;
    }
    if (pedido.bairro) {
      mensagem += `Bairro: ${pedido.bairro}\n`;
    }
    mensagem += `\n`;
  }

  // Pagamento e Total
  mensagem += `💳 *Pagamento:* ${pedido.pagamento || "-"}\n`;
  if (pedido.troco && pedido.pagamento === "dinheiro") {
    mensagem += `💵 *Troco para:* R$ ${parseFloat(pedido.troco).toFixed(2)}\n`;
  }
  mensagem += `💰 *TOTAL:* R$ ${(pedido.total || 0).toFixed(2)}`;

  // Preview da mensagem
  let html = `
    <div class="whatsapp-preview">
      <h4>📱 Preview da Mensagem</h4>
      <pre>${mensagem}</pre>
    </div>

    <div>
      <label class="whatsapp-obs-label">💬 Observação adicional (opcional):</label>
      <textarea 
        id="whatsapp-obs-input" 
        class="whatsapp-obs-input" 
        placeholder="Digite uma observação para adicionar à mensagem..."
      ></textarea>
    </div>
  `;

  body.innerHTML = html;
  modal.classList.add("show");
}

function closeWhatsAppModal() {
  document.getElementById("modal-whatsapp").classList.remove("show");
  currentWhatsAppPedido = null;
}

function sendWhatsApp() {
  if (!currentWhatsAppPedido) return;

  const pedido = currentWhatsAppPedido;
  const obsInput = document.getElementById("whatsapp-obs-input");
  const obsAdicional = obsInput ? obsInput.value.trim() : "";

  // Construir mensagem
  let mensagem = `🍔 *PEDIDO RIBBS ZN*\n\n`;
  mensagem += `📋 *Pedido:* #${pedido.id.substr(0, 8)}\n`;
  mensagem += `👤 *Cliente:* ${pedido.nomeCliente || pedido.nome || "-"}\n\n`;

  // Itens do pedido
  if (pedido.itens && pedido.itens.length > 0) {
    mensagem += `📦 *ITENS:*\n`;
    pedido.itens.forEach((item, index) => {
      mensagem += `${index + 1}. ${item.nome}`;
      if (item.opcao) mensagem += ` (${item.opcao})`;
      mensagem += ` - R$ ${(item.precoTotal || item.preco || 0).toFixed(2)}\n`;
      if (item.observacoes) {
        mensagem += `   ℹ️ ${item.observacoes}\n`;
      }
    });
    mensagem += `\n`;
  }

  // Endereço (se for delivery)
  if (pedido.tipoEntrega === "delivery" || pedido.endereco) {
    mensagem += `📍 *ENDEREÇO:*\n`;
    mensagem += `${pedido.endereco || ""}\n`;
    if (pedido.complemento) {
      mensagem += `${pedido.complemento}\n`;
    }
    if (pedido.bairro) {
      mensagem += `Bairro: ${pedido.bairro}\n`;
    }
    mensagem += `\n`;
  }

  // Pagamento e Total
  mensagem += `💳 *Pagamento:* ${pedido.pagamento || "-"}\n`;
  if (pedido.troco && pedido.pagamento === "dinheiro") {
    mensagem += `💵 *Troco para:* R$ ${parseFloat(pedido.troco).toFixed(2)}\n`;
  }
  mensagem += `💰 *TOTAL:* R$ ${(pedido.total || 0).toFixed(2)}`;

  // Adicionar observação se houver
  if (obsAdicional) {
    mensagem += `\n\n📝 *OBSERVAÇÃO:*\n${obsAdicional}`;
  }

  // Número do Alex (formato internacional sem espaços ou caracteres especiais)
  const numeroAlex = "558183048527"; // +55 81 8304-8527

  // Codificar mensagem para URL
  const mensagemCodificada = encodeURIComponent(mensagem);

  // Criar URL do WhatsApp
  const urlWhatsApp = `https://wa.me/${numeroAlex}?text=${mensagemCodificada}`;

  // Abrir WhatsApp
  window.open(urlWhatsApp, "_blank");

  // Fechar modal
  closeWhatsAppModal();

  console.log("✅ Mensagem enviada para WhatsApp");
}

// ================================================================
// CRIAR PEDIDO (ADMIN) - SISTEMA COMPLETO
// ================================================================

// Estado do criar pedido
const AdminPedido = {
  cardapioData: null, // cardapio.json mesclado
  menuAvailability: {},
  ingredientsAvailability: {},
  paidExtrasAvailability: {},
  cart: [],
  tipo: "retirada", // "retirada" | "delivery" | "mesa"
  deliveryFee: 0,

  // Steps flow
  stepsData: [],
  currentStep: 0,
  tempItem: null,
};

// ================================================================
// ABRIR / FECHAR CRIAR PEDIDO
// ================================================================

async function abrirCriarPedido() {
  document.getElementById("overlay-criar-pedido").classList.add("active");
  document.getElementById("sidebar-criar-pedido").classList.add("active");

  // Carregar cardápio e disponibilidade se ainda não carregou
  if (!AdminPedido.cardapioData) {
    await carregarCardapioAdmin();
  }

  renderCriarCardapio();
}

function fecharCriarPedido() {
  document.getElementById("overlay-criar-pedido").classList.remove("active");
  document.getElementById("sidebar-criar-pedido").classList.remove("active");
}

// ================================================================
// CARREGAR CARDÁPIO PARA O ADMIN PEDIDO
// ================================================================

async function carregarCardapioAdmin() {
  try {
    const db = firebase.database();
    const response = await fetch("./cardapio.json");
    const jsonMenu = await response.json();

    // Carregar disponibilidade
    const [menuSnap, ingredSnap, extrasSnap] = await Promise.all([
      db.ref("menuAvailability").once("value"),
      db.ref("ingredientsAvailability").once("value"),
      db.ref("paidExtrasAvailability").once("value"),
    ]);

    AdminPedido.menuAvailability = menuSnap.val() || {};
    AdminPedido.ingredientsAvailability = ingredSnap.val() || {};
    AdminPedido.paidExtrasAvailability = extrasSnap.val() || {};

    // Mesclar dados (similar ao mergeMenuData existente)
    AdminPedido.cardapioData = {};
    Object.entries(jsonMenu).forEach(([categoria, items]) => {
      AdminPedido.cardapioData[categoria] = items.map((item) => ({
        ...item,
        categoria,
      }));
    });

    // Popular filtro de categorias
    const select = document.getElementById("criar-filter-cat");
    let options = '<option value="all">Todas as categorias</option>';
    Object.keys(AdminPedido.cardapioData).forEach((cat) => {
      options += `<option value="${cat}">${cat}</option>`;
    });
    select.innerHTML = options;

    console.log("✅ Cardápio admin carregado");
  } catch (err) {
    console.error("❌ Erro ao carregar cardápio admin:", err);
    document.getElementById("criar-menu-list").innerHTML =
      '<div class="empty-state"><p class="empty-state-text">Erro ao carregar cardápio</p></div>';
  }
}

// ================================================================
// RENDERIZAR LISTA DO CARDÁPIO NO SIDEBAR
// ================================================================

function renderCriarCardapio() {
  if (!AdminPedido.cardapioData) return;

  const listEl = document.getElementById("criar-menu-list");
  const catFilter = document.getElementById("criar-filter-cat").value;
  const searchQuery = document
    .getElementById("criar-search")
    .value.toLowerCase()
    .trim();

  let html = "";

  Object.entries(AdminPedido.cardapioData).forEach(([categoria, items]) => {
    if (catFilter !== "all" && catFilter !== categoria) return;

    items.forEach((item) => {
      if (searchQuery && !item.nome.toLowerCase().includes(searchQuery)) return;

      const itemKey = `${categoria}:${item.nome}`;
      const isUnavailable = AdminPedido.menuAvailability[itemKey] === false;
      const imgSrc = item.img || "./img/placeholder.png";

      const precos = Array.isArray(item.precoBase)
        ? item.precoBase
        : [item.precoBase];
      const opcoes = item.opcoes && item.opcoes.length > 0 ? item.opcoes : null;

      if (opcoes) {
        // Múltiplas opções: renderizar botões por opção
        let botoesHtml = "";
        opcoes.forEach((opcao, idx) => {
          const preco = precos[idx] || precos[0] || 0;
          const optKey = `${categoria}:${item.nome}:${opcao}`;
          const optUnavail = AdminPedido.menuAvailability[optKey] === false;

          botoesHtml += `
            <button
              class="criar-opcao-btn ${optUnavail || isUnavailable ? "unavailable" : ""}"
              onclick="iniciarItemAdmin('${categoria}', ${items.indexOf(item)}, ${idx})"
            >
              ${opcao} — R$ ${preco.toFixed(2).replace(".", ",")}
            </button>
          `;
        });

        html += `
          <div class="criar-menu-item ${isUnavailable ? "unavailable" : ""}">
            <img src="${imgSrc}" alt="${item.nome}" onerror="this.src='./img/placeholder.png'" />
            <div class="criar-menu-item-info">
              <h4>${item.nome}</h4>
              <span class="cat-badge">${categoria}</span>
              <div class="criar-opcoes-btns" style="margin-top:4px;">${botoesHtml}</div>
            </div>
          </div>
        `;
      } else {
        // Item simples — clique direto
        const preco = precos[0] || 0;
        html += `
          <div class="criar-menu-item ${isUnavailable ? "unavailable" : ""}"
               onclick="iniciarItemAdmin('${categoria}', ${items.indexOf(item)}, 0)">
            <img src="${imgSrc}" alt="${item.nome}" onerror="this.src='./img/placeholder.png'" />
            <div class="criar-menu-item-info">
              <h4>${item.nome}</h4>
              <span class="cat-badge">${categoria}</span>
              <div class="preco-badge">R$ ${preco.toFixed(2).replace(".", ",")}</div>
            </div>
          </div>
        `;
      }
    });
  });

  listEl.innerHTML =
    html ||
    '<div class="empty-state"><p class="empty-state-text">Nenhum item encontrado</p></div>';
}

// ================================================================
// INICIAR FLOW DE PERSONALIZAÇÃO
// ================================================================

function iniciarItemAdmin(categoria, itemIdx, opcaoIdx) {
  const item = AdminPedido.cardapioData[categoria][itemIdx];
  if (!item) return;

  const opcoes = item.opcoes && item.opcoes.length > 0 ? item.opcoes : null;
  const precos = Array.isArray(item.precoBase)
    ? item.precoBase
    : [item.precoBase];

  const selectedSize = opcoes ? opcoes[opcaoIdx] : item.nome;
  const selectedPrice = precos[opcaoIdx] ?? precos[0] ?? 0;

  AdminPedido.tempItem = {
    nome: item.nome,
    img: item.img,
    categoria,
    selectedSize: opcoes ? selectedSize : null,
    selectedPrice,
    finalPrice: selectedPrice,
    meatPoint: null,
    selectedCaldas: [],
    removed: [],
    added: [],
    obs: "",
    quantity: 1,
  };

  // Construir steps (igual ao buildStepsForItem do app.js)
  AdminPedido.stepsData = buildAdminSteps(item, selectedSize);
  AdminPedido.currentStep = 0;

  if (AdminPedido.stepsData.length === 0) {
    adicionarAoCarrinhoAdmin();
    return;
  }

  abrirStepsModal();
  renderAdminStep();
}

// ================================================================
// BUILD STEPS (baseado em buildStepsForItem do app.js)
// ================================================================

function buildAdminSteps(item, selectedSize) {
  const steps = [];

  // Ponto da carne
  if (item.pontoCarne) {
    steps.push({ type: "meatPoint", data: item.pontoCarne });
  }

  // Caldas
  if (item.caldas && Array.isArray(item.caldas)) {
    steps.push({ type: "caldas", data: item.caldas });
  }

  // Ingredientes para retirar
  let ingredients = [];
  if (item.ingredientesPorOpcao && item.ingredientesPorOpcao[selectedSize]) {
    ingredients = item.ingredientesPorOpcao[selectedSize];
  } else if (item.ingredientesPadrao) {
    ingredients = item.ingredientesPadrao;
  } else {
    if (Array.isArray(item.retiradas)) ingredients.push(...item.retiradas);
    if (Array.isArray(item.ingredientes))
      ingredients.push(...item.ingredientes);
    if (Array.isArray(item.simplesIngredients))
      ingredients.push(...item.simplesIngredients);
    if (Array.isArray(item.duploIngredients))
      ingredients.push(...item.duploIngredients);
  }

  const uniqueIng = [...new Set(ingredients)].filter((i) => i && i.trim());
  if (uniqueIng.length > 0) {
    steps.push({ type: "retiradas", data: uniqueIng });
  }

  // Adicionais pagos (filtrar indisponíveis)
  const extras = item.paidExtras || item.adicionais || item.extras || [];
  const availExtras = extras.filter(
    (e) => AdminPedido.paidExtrasAvailability[e.nome] !== false,
  );
  if (availExtras.length > 0) {
    steps.push({ type: "extras", data: availExtras });
  }

  // Observações
  steps.push({ type: "observacoes" });

  return steps;
}

// ================================================================
// MODAL DE STEPS
// ================================================================

function abrirStepsModal() {
  document.getElementById("modal-criar-steps").classList.add("active");
}

function fecharStepsModal() {
  document.getElementById("modal-criar-steps").classList.remove("active");
  AdminPedido.tempItem = null;
  AdminPedido.stepsData = [];
}

function renderAdminStep() {
  const step = AdminPedido.stepsData[AdminPedido.currentStep];
  const title = document.getElementById("criar-step-title");
  const body = document.getElementById("criar-step-body");
  const dotsEl = document.getElementById("criar-progress-dots");
  const btnBack = document.getElementById("btn-criar-back");
  const btnNext = document.getElementById("btn-criar-next");

  // Dots de progresso
  dotsEl.innerHTML = AdminPedido.stepsData
    .map(
      (_, i) =>
        `<div class="dot ${i === AdminPedido.currentStep ? "active" : ""}"></div>`,
    )
    .join("");

  // Botão voltar
  btnBack.style.display = AdminPedido.currentStep > 0 ? "block" : "none";

  // Texto do botão próximo
  const isLast = AdminPedido.currentStep === AdminPedido.stepsData.length - 1;
  btnNext.textContent = isLast ? "✅ ADICIONAR AO CARRINHO" : "Próximo →";

  // Renderizar step
  const displayName = AdminPedido.tempItem.nome;

  switch (step.type) {
    case "meatPoint":
      title.textContent = `${displayName} – Ponto da Carne 🥩`;
      body.innerHTML = step.data
        .map(
          (opt, i) => `
          <div class="option-row">
            <label for="ap-meat-${i}">${opt}</label>
            <input type="radio" id="ap-meat-${i}" name="ap-meatPoint" value="${opt}"
              ${AdminPedido.tempItem.meatPoint === opt ? "checked" : ""}>
          </div>
        `,
        )
        .join("");
      body.querySelectorAll("input").forEach((inp) => {
        inp.onchange = (e) => (AdminPedido.tempItem.meatPoint = e.target.value);
      });
      break;

    case "caldas":
      title.textContent = `${displayName} – Calda 🍯`;
      body.innerHTML = step.data
        .map(
          (opt, i) => `
          <div class="option-row">
            <label for="ap-calda-${i}">${opt}</label>
            <input type="radio" id="ap-calda-${i}" name="ap-calda" value="${opt}"
              ${AdminPedido.tempItem.selectedCaldas.includes(opt) ? "checked" : ""}>
          </div>
        `,
        )
        .join("");
      body.querySelectorAll("input").forEach((inp) => {
        inp.onchange = (e) => {
          AdminPedido.tempItem.selectedCaldas = [e.target.value];
        };
      });
      break;

    case "retiradas":
      title.textContent = `${displayName} – Retirar Ingredientes ❌`;
      const availIng = step.data.filter(
        (ing) => AdminPedido.ingredientsAvailability[ing] !== false,
      );
      body.innerHTML =
        availIng.length === 0
          ? '<p style="color:var(--text-secondary);text-align:center;padding:20px 0;">Nenhum ingrediente disponível para retirar.</p>'
          : availIng
              .map(
                (ing, i) => `
            <div class="option-row">
              <label for="ap-ing-${i}">${ing}</label>
              <input type="checkbox" id="ap-ing-${i}" value="${ing}"
                ${AdminPedido.tempItem.removed.includes(ing) ? "checked" : ""}>
            </div>
          `,
              )
              .join("");
      body.querySelectorAll("input[type=checkbox]").forEach((inp) => {
        inp.onchange = (e) => {
          if (e.target.checked) {
            if (!AdminPedido.tempItem.removed.includes(e.target.value))
              AdminPedido.tempItem.removed.push(e.target.value);
          } else {
            AdminPedido.tempItem.removed = AdminPedido.tempItem.removed.filter(
              (v) => v !== e.target.value,
            );
          }
        };
      });
      break;

    case "extras":
      title.textContent = `${displayName} – Adicionais Pagos 💰`;
      const availExtras = step.data.filter(
        (e) => AdminPedido.paidExtrasAvailability[e.nome] !== false,
      );
      body.innerHTML =
        availExtras.length === 0
          ? '<p style="color:var(--text-secondary);text-align:center;padding:20px 0;">Nenhum adicional disponível.</p>'
          : availExtras
              .map((extra, i) => {
                const isChecked = AdminPedido.tempItem.added.some(
                  (a) => a.nome === extra.nome,
                );
                return `
              <div class="option-row">
                <label for="ap-extra-${i}">
                  ${extra.nome} <span style="color:var(--primary);">+R$ ${extra.preco.toFixed(2).replace(".", ",")}</span>
                </label>
                <input type="checkbox" id="ap-extra-${i}" value="${i}" ${isChecked ? "checked" : ""}>
              </div>
            `;
              })
              .join("");
      body.querySelectorAll("input[type=checkbox]").forEach((inp) => {
        inp.onchange = (e) => {
          const idx = parseInt(e.target.value);
          const extra = availExtras[idx];
          if (e.target.checked) {
            if (!AdminPedido.tempItem.added.some((a) => a.nome === extra.nome))
              AdminPedido.tempItem.added.push({
                nome: extra.nome,
                preco: extra.preco,
              });
          } else {
            AdminPedido.tempItem.added = AdminPedido.tempItem.added.filter(
              (a) => a.nome !== extra.nome,
            );
          }
        };
      });
      break;

    case "observacoes":
      title.textContent = `${displayName} – Observações 💬`;
      body.innerHTML = `
        <textarea id="ap-obs" placeholder="Observação especial...">${AdminPedido.tempItem.obs || ""}</textarea>
      `;
      body.querySelector("textarea").oninput = (e) => {
        AdminPedido.tempItem.obs = e.target.value;
      };
      break;
  }
}

function criarStepNext() {
  const step = AdminPedido.stepsData[AdminPedido.currentStep];

  // Validação de calda obrigatória
  if (
    step.type === "caldas" &&
    AdminPedido.tempItem.selectedCaldas.length === 0
  ) {
    adminToast("⚠️ Escolha uma calda antes de continuar");
    return;
  }

  if (AdminPedido.currentStep < AdminPedido.stepsData.length - 1) {
    AdminPedido.currentStep++;
    renderAdminStep();
  } else {
    // Finalizar item
    const extrasTotal = AdminPedido.tempItem.added.reduce(
      (s, a) => s + a.preco,
      0,
    );
    AdminPedido.tempItem.finalPrice =
      AdminPedido.tempItem.selectedPrice + extrasTotal;

    adicionarAoCarrinhoAdmin();
    fecharStepsModal();
  }
}

function criarStepBack() {
  if (AdminPedido.currentStep > 0) {
    AdminPedido.currentStep--;
    renderAdminStep();
  }
}

// ================================================================
// CARRINHO ADMIN
// ================================================================

function adicionarAoCarrinhoAdmin() {
  const item = { ...AdminPedido.tempItem };

  // Tentar agrupar se idêntico (sem personalização)
  const idx = AdminPedido.cart.findIndex(
    (c) =>
      c.nome === item.nome &&
      c.selectedSize === item.selectedSize &&
      JSON.stringify(c.removed) === JSON.stringify(item.removed) &&
      JSON.stringify(c.added) === JSON.stringify(item.added) &&
      c.meatPoint === item.meatPoint &&
      JSON.stringify(c.selectedCaldas) ===
        JSON.stringify(item.selectedCaldas) &&
      c.obs === item.obs,
  );

  if (idx > -1) {
    AdminPedido.cart[idx].quantity++;
  } else {
    AdminPedido.cart.push({ ...item, quantity: 1 });
  }

  adminToast(`✅ ${item.nome} adicionado!`);
  renderCarrinhoAdmin();
}

function limparCarrinhoAdmin() {
  if (!confirm("Limpar o carrinho?")) return;
  AdminPedido.cart = [];
  renderCarrinhoAdmin();
}

function alterarQtdAdmin(idx, delta) {
  AdminPedido.cart[idx].quantity += delta;
  if (AdminPedido.cart[idx].quantity <= 0) {
    AdminPedido.cart.splice(idx, 1);
  }
  renderCarrinhoAdmin();
}

function renderCarrinhoAdmin() {
  const cartSection = document.getElementById("criar-cart-section");
  const countEl = document.getElementById("criar-cart-count");
  const totalEl = document.getElementById("criar-cart-total");
  const itemsEl = document.getElementById("criar-cart-items");

  if (AdminPedido.cart.length === 0) {
    cartSection.style.display = "none";
    return;
  }

  cartSection.style.display = "block";
  countEl.textContent = AdminPedido.cart.reduce((s, i) => s + i.quantity, 0);

  let total = AdminPedido.cart.reduce(
    (s, i) => s + i.finalPrice * i.quantity,
    0,
  );
  total += AdminPedido.deliveryFee;
  totalEl.textContent = `R$ ${total.toFixed(2).replace(".", ",")}`;

  itemsEl.innerHTML = AdminPedido.cart
    .map((item, idx) => {
      const nomeComOpcao = item.selectedSize
        ? `${item.nome} (${item.selectedSize})`
        : item.nome;

      // Detalhes
      const detalhes = [];
      if (item.meatPoint) detalhes.push(`🥩 ${item.meatPoint}`);
      if (item.selectedCaldas && item.selectedCaldas.length)
        detalhes.push(`🍯 ${item.selectedCaldas.join(", ")}`);
      if (item.removed && item.removed.length)
        detalhes.push(`❌ Sem: ${item.removed.join(", ")}`);
      if (item.added && item.added.length)
        detalhes.push(`➕ ${item.added.map((a) => a.nome).join(", ")}`);
      if (item.obs) detalhes.push(`💬 ${item.obs}`);

      return `
        <div class="criar-cart-item">
          <div class="criar-cart-item-info">
            <div class="item-nome">${nomeComOpcao}</div>
            ${detalhes.length ? `<div class="item-detalhe">${detalhes.join(" • ")}</div>` : ""}
          </div>
          <div class="criar-cart-item-actions">
            <button class="btn-qtd" onclick="alterarQtdAdmin(${idx}, -1)">−</button>
            <span style="color:var(--text-secondary);font-size:0.82rem;">${item.quantity}x</span>
            <button class="btn-qtd" onclick="alterarQtdAdmin(${idx}, 1)">+</button>
            <span class="preco">R$ ${(item.finalPrice * item.quantity).toFixed(2).replace(".", ",")}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

// ================================================================
// TIPO DE PEDIDO (RETIRADA / DELIVERY / MESA)
// ================================================================

function selecionarTipoCriar(tipo) {
  AdminPedido.tipo = tipo;
  AdminPedido.deliveryFee = 0;

  document.querySelectorAll(".criar-tipo-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.criarTipo === tipo);
  });

  document.getElementById("criar-delivery-fields").style.display =
    tipo === "delivery" ? "flex" : "none";
  document.getElementById("criar-delivery-fields").style.flexDirection =
    "column";
  document.getElementById("criar-delivery-fields").style.gap = "8px";

  document.getElementById("criar-mesa-field").style.display =
    tipo === "mesa" ? "block" : "none";

  // Listener de taxa de entrega ao trocar bairro
  if (tipo === "delivery") {
    document.getElementById("criar-bairro").onchange = (e) => {
      const opt = e.target.selectedOptions[0];
      AdminPedido.deliveryFee = parseFloat(opt.dataset.fee || 0) || 0;
      renderCarrinhoAdmin();
    };
  }
}

// ================================================================
// ENVIAR PEDIDO ADMIN
// ================================================================

async function enviarPedidoAdmin() {
  if (AdminPedido.cart.length === 0) {
    adminToast("⚠️ Adicione ao menos um item ao carrinho");
    return;
  }

  const nome = document.getElementById("criar-nome-cliente").value.trim();
  if (!nome) {
    adminToast("⚠️ Informe o nome do cliente");
    return;
  }

  const pagamento = document.getElementById("criar-pagamento").value;
  if (!pagamento) {
    adminToast("⚠️ Selecione a forma de pagamento");
    return;
  }

  // Validações por tipo
  if (AdminPedido.tipo === "delivery") {
    const bairro = document.getElementById("criar-bairro").value;
    const rua = document.getElementById("criar-rua").value.trim();
    const numero = document.getElementById("criar-numero").value.trim();
    if (!bairro || !rua || !numero) {
      adminToast("⚠️ Preencha o bairro, rua e número");
      return;
    }
  }

  if (AdminPedido.tipo === "mesa") {
    const mesa = document.getElementById("criar-mesa").value.trim();
    if (!mesa) {
      adminToast("⚠️ Informe o número da mesa");
      return;
    }
  }

  // Montar itens no formato esperado pelo KDS
  const itens = AdminPedido.cart.map((item) => {
    const obs = [];
    if (item.meatPoint) obs.push(`Ponto: ${item.meatPoint}`);
    if (item.selectedCaldas && item.selectedCaldas.length)
      obs.push(`Caldas: ${item.selectedCaldas.join(", ")}`);
    if (item.removed && item.removed.length)
      obs.push(`Sem: ${item.removed.join(", ")}`);
    if (item.added && item.added.length)
      obs.push(`Adicionais: ${item.added.map((a) => a.nome).join(", ")}`);
    if (item.obs) obs.push(item.obs);

    const itemFormatado = {
      nome: item.nome,
      preco: item.selectedPrice || 0,
      precoTotal: item.finalPrice,
      quantidade: item.quantity || 1,
      qtd: item.quantity || 1,
    };

    if (item.selectedSize) itemFormatado.opcao = item.selectedSize;
    if (obs.length) itemFormatado.observacao = obs.join(" | ");
    if (item.meatPoint) itemFormatado.ponto = item.meatPoint;
    if (item.removed && item.removed.length)
      itemFormatado.retiradas = item.removed;
    if (item.added && item.added.length)
      itemFormatado.adicionais = item.added.map((a) => ({
        nome: a.nome,
        preco: a.preco,
      }));

    return itemFormatado;
  });

  const total =
    AdminPedido.cart.reduce((s, i) => s + i.finalPrice * i.quantity, 0) +
    AdminPedido.deliveryFee;

  const pedido = {
    tipo: "balcao",
    tipoOrigem: "admin",
    status: "pending",
    nomeCliente: nome,
    cliente: nome,
    nome: nome,
    pagamento,
    itens,
    total,
    timestamp: Date.now(),
    dataHora: new Date().toLocaleString("pt-BR"),
    aceito: true, // Pedido criado pelo admin já está aceito
  };

  // Modo de consumo
  if (AdminPedido.tipo === "delivery") {
    const bairro =
      document
        .getElementById("criar-bairro")
        .selectedOptions[0]?.textContent.split(" - ")[0] || "";
    const rua = document.getElementById("criar-rua").value.trim();
    const numero = document.getElementById("criar-numero").value.trim();
    const comp = document.getElementById("criar-complemento").value.trim();
    pedido.modoConsumo = "🛵 ENTREGA";
    pedido.bairro = bairro;
    pedido.endereco = `${rua}, ${numero}${comp ? " - " + comp : ""}`;
    if (AdminPedido.deliveryFee > 0)
      pedido.taxaEntrega = AdminPedido.deliveryFee;
  } else if (AdminPedido.tipo === "mesa") {
    const mesa = document.getElementById("criar-mesa").value.trim();
    pedido.modoConsumo = "🍽️ MESA";
    pedido.mesa = mesa;
    pedido.endereco = `Mesa ${mesa}`;
  } else {
    pedido.modoConsumo = "🏪 RETIRADA";
    pedido.endereco = "RETIRADA NO LOCAL";
  }

  // Troco
  const troco = document.getElementById("criar-troco")?.value.trim();
  if (pagamento === "Dinheiro" && troco) {
    pedido.troco = `Troco para R$ ${troco}`;
  }

  try {
    const db = firebase.database();
    const ref = db.ref("pedidos").push();
    await ref.set(pedido);

    adminToast("✅ Pedido criado com sucesso!");

    // Resetar formulário
    AdminPedido.cart = [];
    AdminPedido.deliveryFee = 0;
    document.getElementById("criar-nome-cliente").value = "";
    document.getElementById("criar-pagamento").value = "";
    document.getElementById("criar-troco").value = "";
    document.getElementById("criar-bairro").value = "";
    document.getElementById("criar-rua").value = "";
    document.getElementById("criar-numero").value = "";
    document.getElementById("criar-complemento").value = "";
    document.getElementById("criar-mesa").value = "";
    selecionarTipoCriar("retirada");
    renderCarrinhoAdmin();

    // Recarregar pedidos ativos se na seção início
    const secaoAtiva = document.querySelector(".content-section.active");
    if (secaoAtiva && secaoAtiva.id === "section-inicio") {
      setTimeout(() => loadPedidosAtivos(), 800);
    }

    // Fechar sidebar após sucesso
    setTimeout(() => fecharCriarPedido(), 1200);
  } catch (err) {
    console.error("❌ Erro ao criar pedido:", err);
    adminToast("❌ Erro ao criar pedido. Tente novamente.");
  }
}

// ================================================================
// TOAST DO ADMIN
// ================================================================

function adminToast(message) {
  let container = document.getElementById("admin-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "admin-toast-container";
    container.className = "admin-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "admin-toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ================================================================
// MOSTRAR/OCULTAR CAMPO TROCO
// ================================================================

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "criar-pagamento") {
    const trocoField = document.getElementById("criar-troco-field");
    if (trocoField) {
      trocoField.style.display =
        e.target.value === "Dinheiro" ? "block" : "none";
    }
  }
});
