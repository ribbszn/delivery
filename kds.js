// ================================
// CONFIGURATION
// ================================
const CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyDFFbaZmX80QezLfozPAIaIGEhIJm9z43E",
    authDomain: "ribbsznmesas.firebaseapp.com",
    databaseURL: "https://ribbsznmesas-default-rtdb.firebaseio.com",
    projectId: "ribbsznmesas",
    storageBucket: "ribbsznmesas.firebasestorage.app",
    messagingSenderId: "970185571294",
    appId: "1:970185571294:web:25e8552bd72d852283bb4f",
  },
  menuDataUrl: "cardapio.json",
};

// ================================
// UTILITY FUNCTIONS
// ================================
// Função auxiliar para gerar estilos de impressão inline
function getPrintStyles(type) {
  const baseStyles = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      size: 58mm auto;
      margin: 0;
    }
    
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      font-family: "Courier New", monospace;
      font-size: ${type === "kitchen" ? "14px" : "12px"};
      color: #000;
      background: #fff;
    }
    
    body {
      padding: 10px;
      width: 100%;
      max-width: 80mm;
    }
    
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 15px;
      ${type === "kitchen" ? "font-weight: bold;" : ""}
    }
    
    .logo {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .order-number {
      font-size: ${type === "kitchen" ? "24px" : "20px"};
      font-weight: bold;
      margin: ${type === "kitchen" ? "10px 0" : "8px 0"};
    }
    
    .section {
      margin: ${type === "kitchen" ? "15px 0" : "12px 0"};
      ${type === "kitchen" ? "border-bottom: 1px dashed #000;" : ""}
      padding-bottom: 10px;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-weight: bold;
      margin-bottom: 8px;
      font-size: 14px;
    }
    
    .item-header {
      font-weight: bold;
      margin: 12px 0 6px 0;
      font-size: 13px;
      border-bottom: 1px solid #333;
      padding-bottom: 3px;
    }
    
    .item-detail {
      margin: 4px 0 4px 10px;
      font-size: ${type === "kitchen" ? "13px" : "12px"};
      line-height: 1.4;
    }
    
    .item-detail strong {
      display: inline-block;
      min-width: 70px;
    }
    
    .total-section {
      border-top: 2px dashed #000;
      padding-top: 10px;
      margin-top: 10px;
      page-break-inside: avoid;
    }
    
    /* 🔽 CORREÇÃO AQUI */
    .total {
      display: flex;
      ${
        type === "customer"
          ? "flex-direction: column; align-items: center; text-align: center;"
          : "justify-content: space-between;"
      }
      font-size: 16px;
      font-weight: bold;
      margin-top: 8px;
    }
    
    .footer {
      text-align: center;
      margin-top: 20px;
      margin-bottom: 20px;
      font-size: ${type === "kitchen" ? "12px" : "11px"};
      ${type === "customer" ? "border-top: 1px dashed #000; padding-top: 10px;" : ""}
      page-break-inside: avoid;
    }
  `;

  return baseStyles;
}

// ================================
// STATE MANAGEMENT
// ================================
const State = {
  database: null,
  orders: {},
  history: [],
  menuData: null,
  menuAvailability: {},
  ingredientsAvailability: {},
  paidExtrasAvailability: {},
  soundEnabled: true,
  activeFilter: "all",
  beepIntervals: {},
  acceptedOrders: {},

  // ADD ITEM MODAL
  addItem: {
    orderId: null,
    steps: [],
    currentStep: 0,
    tempItem: {},
    isCombo: false,
    isFullCombo: false,
    comboData: null,
    comboItems: [],
    currentBurgerIndex: 0,
    isProcessingUpgrades: false,
  },

  // DISCOUNT MODAL
  discount: {
    orderId: null,
    itemIndex: null,
  },
};

// ================================
// FIREBASE INITIALIZATION
// ================================
function initFirebase() {
  try {
    if (typeof firebase === "undefined") {
      showToast("⚠️ Firebase não disponível", "error");
      updateStatus(false);
      return;
    }

    // Use database from firebase-init-auth.js
    State.database = window.firebaseDatabase;

    if (!State.database) {
      showToast("⚠️ Firebase Database não inicializado", "error");
      updateStatus(false);
      return;
    }

    updateStatus(true);
    console.log("✅ Firebase inicializado");

    listenToOrders();
    loadMenuAvailability();
    loadIngredientsAvailability();
  } catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
    updateStatus(false);
    showToast("Erro ao conectar com Firebase", "error");
  }
}

// ================================
// STATUS INDICATOR
// ================================
function updateStatus(connected) {
  const statusDot = document.getElementById("firebase-status");
  const statusText = document.getElementById("status-text");

  if (connected) {
    statusDot.classList.add("connected");
    statusText.textContent = "Conectado";
  } else {
    statusDot.classList.remove("connected");
    statusText.textContent = "Desconectado";
  }
}

// ================================
// ORDERS LISTENER
// ================================
function listenToOrders() {
  if (!State.database) return;

  const ordersRef = State.database.ref("pedidos");

  // FIX: marca o momento da conexão para ignorar pedidos já existentes
  const connectedAt = Date.now();
  let initialLoadComplete = false;

  ordersRef.once("value", () => {
    initialLoadComplete = true;
  });

  ordersRef.on("child_added", (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;

    if (order.status === "pending") {
      State.orders[orderId] = { ...order, id: orderId };
      const isReallyNew =
        initialLoadComplete ||
        (order.timestamp && order.timestamp > connectedAt);
      renderOrder(orderId, order, isReallyNew);
      if (isReallyNew) {
        playNotificationSound();
        showToast(
          `🔔 Novo pedido: ${order.cliente || order.nomeCliente}`,
          "success",
        );
      }
    } else if (order.status === "preparing") {
      // FIX: recupera pedidos em preparo ao reconectar
      State.orders[orderId] = { ...order, id: orderId };
      State.acceptedOrders[orderId] = true;
      renderOrder(orderId, order, false);
    }
  });

  ordersRef.on("child_changed", (snapshot) => {
    const order = snapshot.val();
    const orderId = snapshot.key;

    if (order.status === "pending" || order.status === "preparing") {
      // FIX: "preparing" também deve permanecer no KDS
      State.orders[orderId] = { ...order, id: orderId };
      if (order.status === "preparing") {
        State.acceptedOrders[orderId] = true;
      }
      renderOrder(orderId, order, false);
    } else {
      removeOrderFromKDS(orderId);
      addToHistory(orderId, order);
    }
  });

  ordersRef.on("child_removed", (snapshot) => {
    const orderId = snapshot.key;
    removeOrderFromKDS(orderId);
  });
}

// ================================
// PARSE ORDER ITEMS - NOVA FUNÇÃO
// ================================
function parseOrderItem(item) {
  const qty = item.quantidade || item.qtd || 1;
  const name = item.nome || "Item";
  const obs = item.observacao || "";
  const ponto = item.ponto || "";
  const adicionais = item.adicionais || [];
  const retiradas = item.retiradas || [];

  // Se a observação contém "---" significa que é um combo com múltiplos itens
  if (obs.includes("---") && obs.includes("|")) {
    return parseComboItems(qty, name, obs);
  }

  // Estrutura organizada do item simples
  const parsed = {
    qty,
    name,
    tamanho: "",
    ponto: "",
    sem: [],
    adicionais: [],
    obs: [],
  };

  // Processar observação se existir
  if (obs) {
    const lines = obs
      .split(/\n|\|/)
      .map((l) => l.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      // Detectar ponto
      if (line.match(/^ponto:/i)) {
        parsed.ponto = line.replace(/^ponto:/i, "").trim();
      }
      // Detectar tamanho/variante (ex: "Tamanho: Duplo")
      else if (line.match(/^tamanho:/i)) {
        parsed.tamanho = line.replace(/^tamanho:/i, "").trim();
      }
      // Detectar retiradas
      else if (line.match(/^sem:/i)) {
        const items = line.replace(/^sem:/i, "").trim();
        parsed.sem = items.split(",").map((i) => i.trim());
      }
      // Detectar adicionais
      else if (line.match(/^adicionais?:/i)) {
        const items = line.replace(/^adicionais?:/i, "").trim();
        parsed.adicionais = items
          .split(",")
          .map((i) => ({ nome: i.trim(), preco: null }));
      }
      // Outras observações (ignora Nome: e Tamanho: que já foram capturados)
      else if (!line.match(/^nome:/i) && !line.match(/^tamanho:/i)) {
        parsed.obs.push(line);
      }
    });
  }

  // Adicionar campos separados se existirem
  if (ponto && !parsed.ponto) {
    parsed.ponto = ponto;
  }

  // FIX: normaliza retiradas — pode vir como array de strings ou de objetos {nome, ...}
  if (retiradas.length > 0 && parsed.sem.length === 0) {
    parsed.sem = retiradas.map((r) =>
      typeof r === "object" && r !== null
        ? r.nome || JSON.stringify(r)
        : String(r),
    );
  }

  // FIX: normaliza adicionais — pode vir como array de strings ou de objetos {nome, preco}
  if (adicionais.length > 0 && parsed.adicionais.length === 0) {
    parsed.adicionais = adicionais.map((a) =>
      typeof a === "object" && a !== null
        ? { nome: a.nome || JSON.stringify(a), preco: a.preco || null }
        : { nome: String(a), preco: null },
    );
  } else {
    // adicionais que vieram da observação (texto) não têm preco
    parsed.adicionais = parsed.adicionais.map((a) =>
      typeof a === "object" ? a : { nome: a, preco: null },
    );
  }

  return parsed;
}

// ================================
// PARSE COMBO ITEMS
// ================================
function parseComboItems(qty, comboName, obs) {
  // Dividir a observação pelos separadores "---"
  const parts = obs
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  const comboItems = [];
  let currentItem = null;
  // Batata e Bebida são dados do combo inteiro, não de um burger específico
  let comboBatata = null;
  let comboBebida = null;

  parts.forEach((part) => {
    // Detectar início de um novo item
    if (part.startsWith("---") && part.endsWith("---")) {
      // Se já existe um item sendo processado, adicionar à lista
      if (currentItem) {
        comboItems.push(currentItem);
      }

      // Iniciar novo item
      const itemName = part.replace(/---/g, "").trim();
      currentItem = {
        name: itemName,
        ponto: "",
        sem: [],
        adicionais: [],
        obs: [],
      };
    }
    // Processar detalhes do item atual
    else if (currentItem) {
      if (part.match(/^ponto:/i)) {
        currentItem.ponto = part.replace(/^ponto:/i, "").trim();
      } else if (part.match(/^sem:/i)) {
        const items = part.replace(/^sem:/i, "").trim();
        currentItem.sem = items
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean);
      } else if (part.match(/^adicionais?:/i)) {
        const items = part.replace(/^adicionais?:/i, "").trim();
        currentItem.adicionais = items
          .split(",")
          .map((i) => ({ nome: i.trim(), preco: null }))
          .filter((a) => a.nome);
      } else if (part.match(/^batata:/i)) {
        // Batata pertence ao combo, não ao burger — guarda no nível certo
        comboBatata = part.replace(/^batata:/i, "").trim();
      } else if (part.match(/^bebida:/i)) {
        // Bebida pertence ao combo, não ao burger — guarda no nível certo
        comboBebida = part.replace(/^bebida:/i, "").trim();
      } else if (!part.match(/^nome:/i) && part.length > 0) {
        currentItem.obs.push(part);
      }
    }
    // Batata e Bebida que vierem FORA de qualquer bloco de burger
    else if (part.match(/^batata:/i)) {
      comboBatata = part.replace(/^batata:/i, "").trim();
    } else if (part.match(/^bebida:/i)) {
      comboBebida = part.replace(/^bebida:/i, "").trim();
    }
  });

  // Adicionar o último item
  if (currentItem) {
    comboItems.push(currentItem);
  }

  // Segurança: se Batata/Bebida caíram em obs de algum burger (edge case),
  // move para o nível do combo
  comboItems.forEach((burger) => {
    burger.obs = burger.obs.filter((o) => {
      if (o.match(/^batata:/i)) {
        comboBatata = comboBatata || o.replace(/^batata:/i, "").trim();
        return false;
      }
      if (o.match(/^bebida:/i)) {
        comboBebida = comboBebida || o.replace(/^bebida:/i, "").trim();
        return false;
      }
      return true;
    });
  });

  return {
    qty,
    name: comboName,
    isCombo: true,
    items: comboItems,
    batata: comboBatata,
    bebida: comboBebida,
  };
}

// ================================
// FORMAT ORDER ITEMS - PADRÃO DELIVERY
// ================================
function formatOrderItemsForCard(items) {
  if (!items || items.length === 0) {
    return '<div class="empty-state">Nenhum item no pedido</div>';
  }

  return items
    .map((item) => {
      const parsed = parseOrderItem(item);

      // função para limpar observações redundantes
      const cleanObs = (text) => {
        if (!text) return "";

        return text
          .replace(/Tamanho:\s*[^|]+/gi, "")
          .replace(/Sem:\s*[^|]+/gi, "")
          .replace(/Adicionais:\s*[^|]+/gi, "")
          .replace(/\|\s*\|/g, "|")
          .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
          .trim();
      };

      // ===== COMBO =====
      if (parsed.isCombo) {
        const category = _resolveItemCategory(item, parsed);
        const badge = _getCategoryBadgeHtml(category);

        let html = `<div class="order-item-combo">`;

        // Cabeçalho do combo com nome + badge
        html += `<div class="combo-header-kds">${badge}<span class="combo-header-name">${parsed.qty}x ${parsed.name}</span></div>`;

        parsed.items.forEach((subItem) => {
          html += `<div class="order-item-block">`;
          html += `<div class="item-header">${subItem.qty || 1}x ${subItem.name}</div>`;

          if (subItem.ponto) {
            html += `<div class="item-detail">Ponto: ${subItem.ponto}</div>`;
          }

          if (subItem.sem && subItem.sem.length > 0) {
            html += `<div class="item-detail"><span class="item-detail-label retirar">Retirar:</span> ${subItem.sem.join(", ")}</div>`;
          }

          if (subItem.adicionais && subItem.adicionais.length > 0) {
            html += `<div class="item-detail"><span class="item-detail-label adicionais">Adicionais:</span> ${formatAdicionais(subItem.adicionais, true)}</div>`;
          }

          if (subItem.obs && subItem.obs.length > 0) {
            subItem.obs.forEach((o) => {
              const cleaned = cleanObs(o);
              if (cleaned) {
                html += `<div class="item-detail">Obs: ${cleaned}</div>`;
              }
            });
          }

          html += `</div>`;
        });

        if (parsed.batata) {
          html += `<div class="combo-upgrade">🍟 Batata: ${parsed.batata}</div>`;
        }

        if (parsed.bebida) {
          html += `<div class="combo-upgrade">🥤 Bebida: ${parsed.bebida}</div>`;
        }

        html += `</div>`;
        return html;
      }

      // ===== ITEM SIMPLES =====
      let html = `<div class="order-item-block">`;
      // Categoria + badge
      const _itemCategory = _resolveItemCategory(item, parsed);
      const _itemBadge = _getCategoryBadgeHtml(_itemCategory);
      // Preço e desconto do item (campos opcionais adicionados pelo KDS)
      const itemPrecoOriginal = item._precoOriginal;
      const itemPrecoDesconto = item._precoDesconto;
      const itemDesconto = item._desconto;
      // Preço base do item vindo do pedido
      const itemPreco = item.preco != null ? item.preco : null;

      let precoHtml = "";
      if (itemDesconto) {
        precoHtml = ` <span class="item-preco-original">R$ ${Number(itemPrecoOriginal).toFixed(2).replace(".", ",")}</span> <span class="item-preco-desconto">R$ ${Number(itemPrecoDesconto).toFixed(2).replace(".", ",")}</span>`;
      } else if (itemPreco != null) {
        precoHtml = ` <span class="item-preco">R$ ${Number(itemPreco).toFixed(2).replace(".", ",")}</span>`;
      }
      html += `<div class="item-header">${_itemBadge}${parsed.qty}x ${parsed.name}${parsed.tamanho ? " (" + parsed.tamanho + ")" : ""}${precoHtml}</div>`;

      if (parsed.ponto) {
        html += `<div class="item-detail">Ponto: ${parsed.ponto}</div>`;
      }

      if (parsed.sem && parsed.sem.length > 0) {
        html += `<div class="item-detail"><span class="item-detail-label retirar">Retirar:</span> ${parsed.sem.join(", ")}</div>`;
      }

      if (parsed.adicionais && parsed.adicionais.length > 0) {
        html += `<div class="item-detail"><span class="item-detail-label adicionais">Adicionais:</span> ${formatAdicionais(parsed.adicionais, true)}</div>`;
      }

      if (parsed.obs && parsed.obs.length > 0) {
        parsed.obs.forEach((o) => {
          const cleaned = cleanObs(o);
          if (cleaned) {
            html += `<div class="item-detail">Obs: ${cleaned}</div>`;
          }
        });
      }

      html += `</div>`;
      return html;
    })
    .join("");
}

// ================================
// RENDER ORDER - FORMATAÇÃO PADRÃO DELIVERY
// ================================
function renderOrder(orderId, order, isNew = false) {
  const tipo = order.tipo || order.tipoOrigem || "delivery";
  const containerId =
    tipo === "mesa" || tipo === "totem"
      ? "mesas-container"
      : "delivery-container";
  const container = document.getElementById(containerId);

  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  let orderCard = document.getElementById(`order-${orderId}`);
  const isAccepted = State.acceptedOrders[orderId] === true;

  if (!orderCard) {
    orderCard = document.createElement("div");
    orderCard.className = `order-card ${
      isNew && !isAccepted
        ? "new-order pending-accept"
        : isAccepted
          ? "accepted"
          : ""
    }`;
    orderCard.id = `order-${orderId}`;
    container.appendChild(orderCard);

    if (isNew && !isAccepted) startBeep(orderId);
  }

  const time =
    order.dataHora || new Date(order.timestamp).toLocaleString("pt-BR");
  const cliente = order.cliente || order.nomeCliente || order.nome || "Cliente";

  const acceptButton = !isAccepted
    ? `<button class="btn-order btn-accept" onclick="acceptOrder('${orderId}')">
         ✅ Aceitar Pedido
       </button>`
    : "";

  orderCard.innerHTML = `
    <div class="order-header">
      <span class="order-number">#${orderId.slice(-6).toUpperCase()}</span>
      <span class="order-time">${time}</span>
    </div>

    <div class="order-customer">
      👤 <strong>${cliente}</strong>
    </div>

    <div class="order-items-detailed">
      ${formatOrderItemsForCard(order.itens || [])}
    </div>

    <div class="order-details">
      ${order.modoConsumo ? `<div class="order-detail-row">🍽️ Modo: <strong>${order.modoConsumo}</strong></div>` : ""}
      ${order.endereco ? `<div class="order-detail-row">📍 Endereço: ${order.endereco}</div>` : ""}
      ${order.bairro ? `<div class="order-detail-row">🏘️ Bairro: ${order.bairro}</div>` : ""}
      ${order.taxaEntrega ? `<div class="order-detail-row">🛵 Taxa: ${formatPrice(order.taxaEntrega)}</div>` : ""}
      ${order.pagamento ? `<div class="order-detail-row">💳 Pagamento: ${formatPayment(order.pagamento)}</div>` : ""}
      ${order.troco ? `<div class="order-detail-row">💵 Troco: ${order.troco}</div>` : ""}
    </div>

    <div class="order-total">
      TOTAL: ${formatPrice(order.total || 0)}
    </div>

    <div class="order-actions">
      ${acceptButton}
      ${
        isAccepted
          ? `
        <div class="order-actions-row">
          <button class="btn-order btn-print-kitchen btn-small" onclick="printKitchen('${orderId}')">
            🖨️ Cozinha
          </button>
          <button class="btn-order btn-print-customer btn-small" onclick="printCustomer('${orderId}')">
            🧾 Cliente
          </button>
        </div>
        <div class="order-actions-row">
          <button class="btn-order btn-add-item btn-small" onclick="openAddItemModal('${orderId}')">
            ➕ Add Item
          </button>
          <button class="btn-order btn-discount btn-small" onclick="openDiscountModal('${orderId}')">
            🏷️ Desconto
          </button>
        </div>
        <div class="order-actions-row">
          <button class="btn-order btn-ready" onclick="completeOrder('${orderId}')">
            ✅ Concluir
          </button>
          <button class="btn-order btn-cancel" onclick="cancelOrder('${orderId}')">
            ❌ Cancelar
          </button>
        </div>
      `
          : ""
      }
    </div>
  `;

  updateOrderCount();
}

// ================================
// GET ITEMS SUMMARY
// ================================
function getItemsSummary(items) {
  if (!items || items.length === 0) return "";

  const summary = items
    .map((item) => {
      const qty = item.quantidade || item.qtd || 1;
      const name = item.nome || "Item";
      return `${qty}x ${name}`;
    })
    .join(" + ");

  return `<div class="order-items-summary">${summary}</div>`;
}

// ================================
// FORMAT PRICE
// ================================
function formatPrice(value) {
  const num = parseFloat(value) || 0;
  return `R$ ${num.toFixed(2).replace(".", ",")}`;
}

// ================================
// FORMAT ADICIONAIS (global helper)
// Converte array de strings ou objetos {nome, preco} para texto legível
// showPrice=true mostra preço, false só o nome
// ================================
// Mapa lazy de preços: { "bacon": 4, "ovo": 2, ... }
function buildAdicionaisMap() {
  if (buildAdicionaisMap._cache) return buildAdicionaisMap._cache;
  const map = {};
  if (!State.menuData) return map;
  Object.values(State.menuData).forEach((category) => {
    if (!Array.isArray(category)) return;
    category.forEach((item) => {
      [...(item.adicionais || []), ...(item.paidExtras || [])].forEach((a) => {
        if (a && a.nome && a.preco != null) {
          map[a.nome.trim().toLowerCase()] = a.preco;
        }
      });
    });
  });
  buildAdicionaisMap._cache = map;
  return map;
}

window.invalidateAdicionaisCache = function () {
  buildAdicionaisMap._cache = null;
};

function formatAdicionais(adicionais, showPrice) {
  if (!adicionais || !adicionais.length) return "";
  const map = showPrice ? buildAdicionaisMap() : {};
  return adicionais
    .map((a) => {
      const nome =
        typeof a === "object" && a !== null ? a.nome || "" : String(a);
      let preco = typeof a === "object" && a !== null ? a.preco : null;
      if (showPrice && preco == null)
        preco = map[nome.trim().toLowerCase()] ?? null;
      if (showPrice && preco != null) {
        return (
          nome +
          ' <span class="item-adicional-preco">(+R$ ' +
          Number(preco).toFixed(2).replace(".", ",") +
          ")</span>"
        );
      }
      return nome;
    })
    .filter(Boolean)
    .join(", ");
}

// ================================
// CATEGORY BADGE HELPERS
// ================================

/**
 * Resolve a categoria de um item:
 * 1. Campo explícito item.categoria (adicionado pelo KDS)
 * 2. Busca pelo nome no menuData
 * 3. Fallback por parsed.isCombo
 */
function _resolveItemCategory(item, parsed) {
  if (item.categoria) return item.categoria;
  const nome = item.nome || (parsed && parsed.name) || "";
  if (State.menuData && nome) {
    for (const [cat, items] of Object.entries(State.menuData)) {
      if (items.some((i) => i.nome === nome)) return cat;
    }
  }
  if (parsed && parsed.isCombo) return "Combos";
  return null;
}

/**
 * Retorna HTML do badge colorido para Combos, Clones e Promoções.
 * Demais categorias retornam string vazia.
 */
function _getCategoryBadgeHtml(category) {
  const map = {
    Combos: { icon: "🍔", label: "COMBO", cls: "badge-combo" },
    Clones: { icon: "👥", label: "CLONE", cls: "badge-clone" },
    Promoções: { icon: "🎉", label: "PROMO", cls: "badge-promo" },
  };
  const b = map[category];
  if (!b) return "";
  return `<span class="item-category-badge ${b.cls}">${b.icon} ${b.label}</span>`;
}

// ================================
// FORMAT PAYMENT
// FIX: pagamento pode chegar como string, array ou objeto
// ================================
function formatPayment(pagamento) {
  if (!pagamento) return "";
  if (typeof pagamento === "string") return pagamento;
  if (Array.isArray(pagamento)) {
    return pagamento
      .map((p) => {
        if (typeof p === "string") return p;
        // FIX: script.js usa "method", não "metodo"
        if (typeof p === "object" && p !== null)
          return p.method || p.metodo || p.nome || p.tipo || JSON.stringify(p);
        return String(p);
      })
      .join(", ");
  }
  if (typeof pagamento === "object") {
    return (
      pagamento.method ||
      pagamento.metodo ||
      pagamento.nome ||
      pagamento.tipo ||
      JSON.stringify(pagamento)
    );
  }
  return String(pagamento);
}

// ================================
// ACCEPT ORDER
// ================================
async function acceptOrder(orderId) {
  if (!State.database) return;

  try {
    // FIX: persiste o status no Firebase para sobreviver a recarregamentos
    await State.database.ref(`pedidos/${orderId}`).update({
      status: "preparing",
      acceptedAt: Date.now(),
      acceptedTime: new Date().toLocaleString("pt-BR"),
    });

    State.acceptedOrders[orderId] = true;
    stopBeep(orderId);

    const order = State.orders[orderId];
    if (order) {
      renderOrder(orderId, order, false);
    }

    showToast("✅ Pedido aceito e em preparo", "success");
  } catch (error) {
    console.error("Erro ao aceitar pedido:", error);
    showToast("Erro ao aceitar pedido", "error");
  }
}

// ================================
// COMPLETE ORDER
// ================================
async function completeOrder(orderId) {
  if (!State.database) return;

  try {
    await State.database.ref(`pedidos/${orderId}`).update({
      status: "completed",
      completedAt: Date.now(),
      completedTime: new Date().toLocaleString("pt-BR"),
    });

    showToast("✅ Pedido concluído", "success");
  } catch (error) {
    console.error("Erro ao finalizar pedido:", error);
    showToast("Erro ao finalizar pedido", "error");
  }
}

// ================================
// PRINT KITCHEN - PADRÃO DELIVERY
// ================================
async function printKitchen(orderId) {
  const order = State.orders[orderId];
  if (!order) {
    showToast("Pedido não encontrado", "error");
    return;
  }

  const cliente = order.cliente || order.nomeCliente || order.nome || "Cliente";

  function extractSizeFromObs(obsArray) {
    let size = "";
    if (!obsArray) return size;

    obsArray.forEach((o) => {
      const match = o.match(/Tamanho:\s*([^|]+)/i);
      if (match) size = match[1].trim();
    });

    return size;
  }

  function cleanObs(text) {
    if (!text) return "";
    return text
      .replace(/Tamanho:\s*[^|]+/gi, "")
      .replace(/Sem:\s*[^|]+/gi, "")
      .replace(/Adicionais:\s*[^|]+/gi, "")
      .replace(/\|+/g, "")
      .trim();
  }

  let printContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Pedido Cozinha</title>
<style>
${getPrintStyles("kitchen")}
</style>
</head>
<body>

<div class="header">
  RIBBS ZN - COZINHA<br>
  PEDIDO #${orderId.slice(-6).toUpperCase()}<br>
  ${order.dataHora || new Date().toLocaleString("pt-BR")}
</div>

<div class="section">
  CLIENTE: ${cliente}
</div>

${
  order.modoConsumo
    ? `
<div class="section">
  MODO: ${order.modoConsumo}
</div>
`
    : ""
}

<div class="section">
  ITENS:
</div>
`;

  order.itens.forEach((item) => {
    const parsed = parseOrderItem(item);

    // ===== COMBO =====
    if (parsed.isCombo) {
      parsed.items.forEach((subItem) => {
        const itemName = `${subItem.name}${subItem.tamanho ? " (" + subItem.tamanho + ")" : ""}`;

        printContent += `
<div class="item-header">
${subItem.qty || 1}x ${itemName}
</div>
`;

        if (subItem.sem?.length) {
          printContent += `<div class="item-detail">Retirar: ${subItem.sem.join(", ")}</div>`;
        }

        if (subItem.adicionais?.length) {
          const addStr = formatAdicionais(subItem.adicionais, false);
          if (addStr)
            printContent += `<div class="item-detail">Adicionais: ${addStr}</div>`;
        }

        if (subItem.obs?.length) {
          subItem.obs.forEach((o) => {
            const cleaned = cleanObs(o);
            if (cleaned)
              printContent += `<div class="item-detail">Obs: ${cleaned}</div>`;
          });
        }
      });

      if (parsed.batata)
        printContent += `<div class="item-detail">Batata: ${parsed.batata}</div>`;
      if (parsed.bebida)
        printContent += `<div class="item-detail">Bebida: ${parsed.bebida}</div>`;
    }
    // ===== ITEM SIMPLES =====
    else {
      const itemName = `${parsed.name}${parsed.tamanho ? " (" + parsed.tamanho + ")" : ""}`;

      printContent += `
<div class="item-header">
${parsed.qty}x ${itemName}
</div>
`;

      if (parsed.sem?.length) {
        printContent += `<div class="item-detail">Retirar: ${parsed.sem.join(", ")}</div>`;
      }

      if (parsed.adicionais?.length) {
        const addStr = formatAdicionais(parsed.adicionais, false);
        if (addStr)
          printContent += `<div class="item-detail">Adicionais: ${addStr}</div>`;
      }

      if (parsed.obs?.length) {
        parsed.obs.forEach((o) => {
          const cleaned = cleanObs(o);
          if (cleaned)
            printContent += `<div class="item-detail">Obs: ${cleaned}</div>`;
        });
      }
    }
  });

  printContent += `
<div class="footer">
--------------------------------
${new Date().toLocaleString("pt-BR")}
</div>

<script>
window.onload = function() {
  setTimeout(() => {
    window.print();
    setTimeout(() => window.close(), 500);
  }, 250);
};
</script>

</body>
</html>
`;

  const printWindow = window.open("", "_blank", "width=350,height=600");
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
  }

  showToast("Imprimindo pedido da cozinha", "success");
}

// ================================
// PRINT CUSTOMER - PADRÃO DELIVERY
// ================================
async function printCustomer(orderId) {
  const order = State.orders[orderId];
  if (!order) {
    showToast("Pedido não encontrado", "error");
    return;
  }

  const cliente = order.cliente || order.nomeCliente || order.nome || "Cliente";

  function extractSizeFromObs(obsArray) {
    let size = "";
    if (!obsArray) return size;

    obsArray.forEach((o) => {
      const match = o.match(/Tamanho:\s*([^|]+)/i);
      if (match) size = match[1].trim();
    });

    return size;
  }

  function cleanObs(text) {
    if (!text) return "";
    return text
      .replace(/Tamanho:\s*[^|]+/gi, "")
      .replace(/Sem:\s*[^|]+/gi, "")
      .replace(/Adicionais:\s*[^|]+/gi, "")
      .replace(/\|+/g, "")
      .trim();
  }

  let printContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Comprovante</title>
<style>
${getPrintStyles("customer")}
</style>
</head>
<body>

<div class="header">
  RIBBS ZN<br>
  COMPROVANTE DE PEDIDO<br>
  PEDIDO #${orderId.slice(-6).toUpperCase()}<br>
  ${order.dataHora || new Date().toLocaleString("pt-BR")}
</div>

<div class="section">
CLIENTE: ${cliente}
</div>

<div class="section">
ITENS:
</div>
`;

  order.itens.forEach((item) => {
    const parsed = parseOrderItem(item);

    // COMBO
    if (parsed.isCombo) {
      parsed.items.forEach((subItem) => {
        const itemName = `${subItem.name}${subItem.tamanho ? " (" + subItem.tamanho + ")" : ""}`;

        printContent += `
<div class="item-header">
${subItem.qty || 1}x ${itemName}
</div>
`;

        if (subItem.sem?.length) {
          printContent += `<div class="item-detail">Retirar: ${subItem.sem.join(", ")}</div>`;
        }

        if (subItem.adicionais?.length) {
          const addStr = formatAdicionais(subItem.adicionais, true);
          if (addStr)
            printContent += `<div class="item-detail">Adicionais: ${addStr}</div>`;
        }

        if (subItem.obs?.length) {
          subItem.obs.forEach((o) => {
            const cleaned = cleanObs(o);
            if (cleaned)
              printContent += `<div class="item-detail">Obs: ${cleaned}</div>`;
          });
        }
      });

      if (parsed.batata)
        printContent += `<div class="item-detail">Batata: ${parsed.batata}</div>`;
      if (parsed.bebida)
        printContent += `<div class="item-detail">Bebida: ${parsed.bebida}</div>`;
    }
    // ITEM SIMPLES
    else {
      const itemName = `${parsed.name}${parsed.tamanho ? " (" + parsed.tamanho + ")" : ""}`;
      // Preço do item (com ou sem desconto)
      let precoLine = "";
      if (item._desconto) {
        precoLine = `<div class="item-detail-discount"><span class="print-preco-original">De: R$ ${Number(item._precoOriginal).toFixed(2).replace(".", ",")}</span> &rarr; <strong>Por: R$ ${Number(item._precoDesconto).toFixed(2).replace(".", ",")}</strong> <em>(${item._desconto})</em></div>`;
      } else if (item.preco != null) {
        precoLine = `<div class="item-detail">Preço: R$ ${Number(item.preco).toFixed(2).replace(".", ",")}</div>`;
      }

      printContent += `
<div class="item-header">
${parsed.qty}x ${itemName}
</div>
${precoLine}
`;

      if (parsed.sem?.length) {
        printContent += `<div class="item-detail">Retirar: ${parsed.sem.join(", ")}</div>`;
      }

      if (parsed.adicionais?.length) {
        const addStr = formatAdicionais(parsed.adicionais, true);
        if (addStr)
          printContent += `<div class="item-detail">Adicionais: ${addStr}</div>`;
      }

      if (parsed.obs?.length) {
        parsed.obs.forEach((o) => {
          const cleaned = cleanObs(o);
          if (cleaned)
            printContent += `<div class="item-detail">Obs: ${cleaned}</div>`;
        });
      }
    }
  });

  printContent += `
<div class="section">
${order.modoConsumo ? `MODO: ${order.modoConsumo}<br>` : ""}
${order.endereco ? `ENDEREÇO: ${order.endereco}<br>` : ""}
${order.bairro ? `BAIRRO: ${order.bairro}<br>` : ""}
${order.pagamento ? `PAGAMENTO: ${order.pagamento}<br>` : ""}
</div>

<div class="total-section">
TOTAL: ${formatPrice(order.total || 0)}
</div>

<div class="footer">
--------------------------------
${new Date().toLocaleString("pt-BR")}
</div>

<script>
window.onload = function() {
  setTimeout(() => {
    window.print();
    setTimeout(() => window.close(), 500);
  }, 250);
};
</script>

</body>
</html>
`;

  const win = window.open("", "_blank", "width=350,height=600");
  if (win) {
    win.document.write(printContent);
    win.document.close();
  }

  showToast("Imprimindo comprovante do cliente", "success");
}

// ================================
// BEEP CONTROL — Web Audio API (sem dependência de beep.mp3)
// ================================
function _beepOnce() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    // fecha contexto após tocar para não vazar recursos
    osc.onended = () => ctx.close();
  } catch (e) {
    console.warn("Web Audio não disponível:", e);
  }
}

function startBeep(orderId) {
  if (!State.soundEnabled) return;
  stopBeep(orderId); // garante que não duplica
  _beepOnce();
  State.beepIntervals[orderId] = setInterval(_beepOnce, 1800);
}

function stopBeep(orderId) {
  if (!State.beepIntervals[orderId]) return;
  clearInterval(State.beepIntervals[orderId]);
  delete State.beepIntervals[orderId];
}

// ================================
// CANCEL ORDER
// ================================
async function cancelOrder(orderId) {
  if (!State.database) return;

  if (!confirm("Tem certeza que deseja cancelar este pedido?")) {
    return;
  }

  try {
    await State.database.ref(`pedidos/${orderId}`).update({
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledTime: new Date().toLocaleString("pt-BR"),
    });

    showToast("❌ Pedido cancelado", "warning");
  } catch (error) {
    console.error("Erro ao cancelar pedido:", error);
    showToast("Erro ao cancelar pedido", "error");
  }
}

// ================================
// REMOVE ORDER FROM KDS
// ================================
function removeOrderFromKDS(orderId) {
  stopBeep(orderId);

  delete State.acceptedOrders[orderId];

  const orderCard = document.getElementById(`order-${orderId}`);
  if (orderCard) {
    orderCard.classList.add("fade-out-animation");
    setTimeout(() => {
      orderCard.remove();
      delete State.orders[orderId];
      updateOrderCount();
      checkEmptyStates();
      updateInProgressWidget();
    }, 300);
  }
}

// ================================
// UPDATE ORDER COUNT
// ================================
function updateOrderCount() {
  // FIX: considera tipoOrigem como fallback para ambas as colunas
  const mesasOrders = Object.values(State.orders).filter((o) => {
    const tipo = o.tipo || o.tipoOrigem || "";
    return tipo === "mesa" || tipo === "totem";
  });
  const deliveryOrders = Object.values(State.orders).filter((o) => {
    const tipo = o.tipo || o.tipoOrigem || "delivery";
    return tipo !== "mesa" && tipo !== "totem";
  });

  document.getElementById("mesas-count").textContent = mesasOrders.length;
  document.getElementById("delivery-count").textContent = deliveryOrders.length;
}

// ================================
// CHECK EMPTY STATES
// ================================
function checkEmptyStates() {
  const mesasContainer = document.getElementById("mesas-container");
  const deliveryContainer = document.getElementById("delivery-container");

  // FIX: ignora cards que estão em animação de saída
  const mesasCards = mesasContainer.querySelectorAll(
    ".order-card:not(.fade-out-animation)",
  );
  const deliveryCards = deliveryContainer.querySelectorAll(
    ".order-card:not(.fade-out-animation)",
  );

  if (mesasCards.length === 0) {
    mesasContainer.innerHTML =
      '<div class="empty-state"><p>Nenhum pedido de mesa/totem no momento</p></div>';
  }

  if (deliveryCards.length === 0) {
    deliveryContainer.innerHTML =
      '<div class="empty-state"><p>Nenhum pedido de delivery no momento</p></div>';
  }
}

// ================================
// HISTORY
// ================================
function addToHistory(orderId, order) {
  State.history.unshift({ ...order, id: orderId });

  if (State.history.length > 100) {
    State.history = State.history.slice(0, 100);
  }
}

function loadHistoryFromFirebase() {
  if (!State.database) return;

  State.database
    .ref("pedidos")
    .orderByChild("status")
    .once("value")
    .then((snapshot) => {
      const allOrders = [];
      snapshot.forEach((childSnapshot) => {
        const order = childSnapshot.val();
        if (order.status === "completed" || order.status === "cancelled") {
          allOrders.push({ ...order, id: childSnapshot.key });
        }
      });

      State.history = allOrders
        .sort(
          (a, b) =>
            (b.completedAt || b.cancelledAt || 0) -
            (a.completedAt || a.cancelledAt || 0),
        )
        .slice(0, 100);

      renderHistory();
    })
    .catch((error) => {
      console.error("Erro ao carregar histórico:", error);
      showToast("Erro ao carregar histórico", "error");
    });
}

function renderHistory() {
  const container = document.getElementById("history-content");
  if (!container) return;

  let filtered = State.history;

  if (State.activeFilter === "today") {
    const today = new Date().toDateString();
    filtered = State.history.filter((order) => {
      const orderDate = new Date(
        order.completedAt || order.cancelledAt || 0,
      ).toDateString();
      return orderDate === today;
    });
  } else if (State.activeFilter === "week") {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    filtered = State.history.filter(
      (order) => (order.completedAt || order.cancelledAt || 0) > weekAgo,
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Nenhum pedido encontrado</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered
    .map((order) => {
      const isCompleted = order.status === "completed";
      const statusBadge = isCompleted
        ? '<span class="hc-status completed">✅ Concluído</span>'
        : '<span class="hc-status cancelled">❌ Cancelado</span>';

      const cliente =
        order.cliente || order.nomeCliente || order.nome || "Cliente";
      const tipo = order.tipo || order.tipoOrigem || "delivery";
      const tipoIcon = tipo === "mesa" || tipo === "totem" ? "🪑" : "🛵";
      const tipoLabel =
        order.modoConsumo || (tipo === "mesa" ? "Mesa" : "Delivery");

      const pedidoEm = order.dataHora || "";
      const finalizadoEm = order.completedTime || order.cancelledTime || "";

      // Itens detalhados
      const itensHtml = (order.itens || [])
        .map((item) => {
          const parsed = parseOrderItem(item);

          if (parsed.isCombo) {
            const subItensHtml = parsed.items
              .map(
                (sub) => `
            <div class="hc-subitem">
              <div class="hc-subitem-name">↳ ${sub.name}</div>
              ${sub.ponto ? `<div class="hc-detail-row"><span class="hc-tag ponto">Ponto</span>${sub.ponto}</div>` : ""}
              ${sub.sem.length ? `<div class="hc-detail-row"><span class="hc-tag sem">Sem</span>${sub.sem.join(", ")}</div>` : ""}
              ${sub.adicionais.length ? `<div class="hc-detail-row"><span class="hc-tag add">+</span>${formatAdicionais(sub.adicionais, false)}</div>` : ""}
              ${sub.obs.length ? `<div class="hc-detail-row"><span class="hc-tag obs">Obs</span>${sub.obs.join(" | ")}</div>` : ""}
            </div>
          `,
              )
              .join("");

            return `
            <div class="hc-item">
              <div class="hc-item-header">
                <span class="hc-item-qty">${parsed.qty}x</span>
                <span class="hc-item-name">${parsed.name}</span>
              </div>
              ${subItensHtml}
            </div>`;
          }

          return `
          <div class="hc-item">
            <div class="hc-item-header">
              <span class="hc-item-qty">${parsed.qty}x</span>
              <span class="hc-item-name">${parsed.name}</span>
            </div>
            ${parsed.ponto ? `<div class="hc-detail-row"><span class="hc-tag ponto">Ponto</span>${parsed.ponto}</div>` : ""}
            ${parsed.sem.length ? `<div class="hc-detail-row"><span class="hc-tag sem">Sem</span>${parsed.sem.join(", ")}</div>` : ""}
            ${parsed.adicionais.length ? `<div class="hc-detail-row"><span class="hc-tag add">+</span>${formatAdicionais(parsed.adicionais, false)}</div>` : ""}
            ${parsed.obs.length ? `<div class="hc-detail-row"><span class="hc-tag obs">Obs</span>${parsed.obs.join(" | ")}</div>` : ""}
          </div>`;
        })
        .join("");

      // Rodapé com pagamento/endereço/totais
      const pagamento = formatPayment(order.pagamento);

      return `
      <div class="history-card ${isCompleted ? "completed" : "cancelled"}">

        <!-- Topo: número + status -->
        <div class="hc-top">
          <div class="hc-id-block">
            <span class="hc-number">#${order.id.slice(-6).toUpperCase()}</span>
            <span class="hc-tipo">${tipoIcon} ${tipoLabel}</span>
          </div>
          ${statusBadge}
        </div>

        <!-- Cliente -->
        <div class="hc-customer">
          <span class="hc-customer-icon">👤</span>
          <span class="hc-customer-name">${cliente}</span>
        </div>

        <!-- Horários -->
        <div class="hc-times">
          ${pedidoEm ? `<span class="hc-time-item">🕐 Pedido: ${pedidoEm}</span>` : ""}
          ${finalizadoEm ? `<span class="hc-time-item">${isCompleted ? "✅" : "❌"} Finalizado: ${finalizadoEm}</span>` : ""}
        </div>

        <!-- Divisor -->
        <div class="hc-divider"></div>

        <!-- Itens -->
        <div class="hc-items-section">
          <div class="hc-section-label">📋 ITENS</div>
          <div class="hc-items-list">${itensHtml || '<span class="hc-empty">Sem itens registrados</span>'}</div>
        </div>

        <!-- Divisor -->
        <div class="hc-divider"></div>

        <!-- Entrega/endereço -->
        ${
          order.endereco
            ? `
        <div class="hc-info-row">
          <span class="hc-info-icon">📍</span>
          <span class="hc-info-text">${order.endereco}${order.bairro ? ` — ${order.bairro}` : ""}</span>
        </div>`
            : ""
        }

        ${
          order.taxaEntrega
            ? `
        <div class="hc-info-row">
          <span class="hc-info-icon">🛵</span>
          <span class="hc-info-text">Taxa de entrega: ${formatPrice(order.taxaEntrega)}</span>
        </div>`
            : ""
        }

        ${
          pagamento
            ? `
        <div class="hc-info-row">
          <span class="hc-info-icon">💳</span>
          <span class="hc-info-text">${pagamento}</span>
        </div>`
            : ""
        }

        ${
          order.troco
            ? `
        <div class="hc-info-row">
          <span class="hc-info-icon">💵</span>
          <span class="hc-info-text">${order.troco}</span>
        </div>`
            : ""
        }

        <!-- Total -->
        <div class="hc-total-row">
          <span>Total</span>
          <span class="hc-total-value">${formatPrice(order.total || 0)}</span>
        </div>

      </div>`;
    })
    .join("");
}

// ================================
// IN PROGRESS WIDGET
// ================================
function initInProgressWidget() {
  const widget = document.getElementById("in-progress-widget");
  const header = document.getElementById("in-progress-header");
  const dropdown = document.getElementById("in-progress-dropdown");

  if (!widget || !header || !dropdown) {
    console.error("❌ Elementos do widget não encontrados");
    return;
  }

  header.addEventListener("click", () => {
    dropdown.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!widget.contains(e.target)) {
      dropdown.classList.remove("show");
    }
  });

  updateInProgressWidget();
  console.log("✅ Widget de pedidos em preparo inicializado");
}

function updateInProgressWidget() {
  const countEl = document.getElementById("in-progress-count");
  const listEl = document.getElementById("in-progress-list");

  if (!countEl || !listEl) return;

  const inProgressOrders = Object.entries(State.orders)
    .filter(([id, order]) => State.acceptedOrders[id] === true)
    .map(([id, order]) => ({ ...order, id }));

  countEl.textContent = inProgressOrders.length;

  if (inProgressOrders.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state-inline">
        <p>Nenhum pedido em preparo</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = inProgressOrders
    .map((order) => renderInProgressOrder(order))
    .join("");
}

function renderInProgressOrder(order) {
  const orderNumber = order.id.slice(-6).toUpperCase();
  const customer =
    order.cliente || order.nomeCliente || order.nome || "Cliente";
  const time =
    order.dataHora ||
    new Date(order.timestamp).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const itemsHTML = (order.itens || [])
    .map((item) => {
      const parsed = parseOrderItem(item);

      // Se for combo, processar cada sub-item
      if (parsed.isCombo) {
        let comboHTML = parsed.items
          .map((subItem) => {
            let modsParts = [];

            if (subItem.ponto) {
              modsParts.push(
                `<div class="in-progress-mod in-progress-mod-obs">🔥 ${subItem.ponto}</div>`,
              );
            }

            if (subItem.sem.length > 0) {
              modsParts.push(
                `<div class="in-progress-mod in-progress-mod-remove">➖ Sem: ${subItem.sem.join(", ")}</div>`,
              );
            }

            if (subItem.adicionais.length > 0) {
              modsParts.push(
                `<div class="in-progress-mod in-progress-mod-add">➕ ${formatAdicionais(subItem.adicionais, false)}</div>`,
              );
            }

            const modsHTML =
              modsParts.length > 0
                ? `<div class="in-progress-item-mods">${modsParts.join("")}</div>`
                : "";

            return `
          <div class="in-progress-item">
            <span class="in-progress-item-name">${subItem.name}</span>
            ${modsHTML}
          </div>
        `;
          })
          .join("");

        // Batata e Bebida do combo no widget
        if (parsed.batata) {
          comboHTML += `<div class="in-progress-item in-progress-item--upgrade">
            <span class="in-progress-item-name">🍟 ${parsed.batata}</span>
          </div>`;
        }
        if (parsed.bebida) {
          comboHTML += `<div class="in-progress-item in-progress-item--upgrade">
            <span class="in-progress-item-name">🥤 ${parsed.bebida}</span>
          </div>`;
        }

        return comboHTML;
      }

      // Item simples
      let modsParts = [];

      if (parsed.ponto) {
        modsParts.push(
          `<div class="in-progress-mod in-progress-mod-obs">🔥 ${parsed.ponto}</div>`,
        );
      }

      if (parsed.sem.length > 0) {
        modsParts.push(
          `<div class="in-progress-mod in-progress-mod-remove">➖ Sem: ${parsed.sem.join(", ")}</div>`,
        );
      }

      if (parsed.adicionais.length > 0) {
        modsParts.push(
          `<div class="in-progress-mod in-progress-mod-add">➕ ${formatAdicionais(parsed.adicionais, false)}</div>`,
        );
      }

      const modsHTML =
        modsParts.length > 0
          ? `<div class="in-progress-item-mods">${modsParts.join("")}</div>`
          : "";

      return `
      <div class="in-progress-item">
        <span class="in-progress-item-qty">${parsed.qty}x</span>
        <span class="in-progress-item-name">${parsed.name}</span>
        ${modsHTML}
      </div>
    `;
    })
    .join("");

  return `
    <div class="in-progress-order">
      <div class="in-progress-order-header">
        <span class="in-progress-order-number">#${orderNumber}</span>
        <span class="in-progress-order-time">${time}</span>
      </div>
      <div class="in-progress-order-customer">${customer}</div>
      <div class="in-progress-order-items">
        ${itemsHTML}
      </div>
    </div>
  `;
}

// Sobrescrever funções originais para atualizar widget
(function () {
  const _acceptOrder = window.acceptOrder;
  const _completeOrder = window.completeOrder;
  const _cancelOrder = window.cancelOrder;

  window.acceptOrder = async function (orderId) {
    await _acceptOrder.call(this, orderId);
    setTimeout(() => {
      updateInProgressWidget();
    }, 200);
  };

  window.completeOrder = async function (orderId) {
    await _completeOrder.call(this, orderId);
    setTimeout(() => {
      updateInProgressWidget();
    }, 200);
  };

  window.cancelOrder = async function (orderId) {
    await _cancelOrder.call(this, orderId);
    setTimeout(() => {
      updateInProgressWidget();
    }, 200);
  };
})();

// ================================
// SOUND & NOTIFICATIONS
// ================================
function playNotificationSound() {
  if (!State.soundEnabled) return;

  const audio = document.getElementById("notification-sound");
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch((error) => {
      console.log("Não foi possível reproduzir som:", error);
    });
  }
}

function toggleSound() {
  State.soundEnabled = !State.soundEnabled;
  const statusEl = document.getElementById("sound-status");
  if (statusEl) {
    statusEl.textContent = `Som: ${State.soundEnabled ? "ON" : "OFF"}`;
  }

  if (!State.soundEnabled) {
    Object.keys(State.beepIntervals).forEach((orderId) => {
      stopBeep(orderId);
    });
  }
}

// ================================
// TOAST NOTIFICATIONS
// ================================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ================================
// UI INITIALIZATION
// ================================
function initUI() {
  const btnMenuManagement = document.getElementById("btn-menu-management");
  if (btnMenuManagement) {
    btnMenuManagement.addEventListener("click", () => {
      const modal = document.getElementById("menu-modal");
      const overlay = document.getElementById("overlay");
      if (modal && overlay) {
        modal.classList.add("show");
        overlay.classList.add("show");
        loadMenuData();
      }
    });
  }

  const btnIngredientsManagement = document.getElementById(
    "btn-ingredients-management",
  );
  if (btnIngredientsManagement) {
    btnIngredientsManagement.addEventListener("click", () => {
      const modal = document.getElementById("ingredients-modal");
      const overlay = document.getElementById("overlay");
      if (modal && overlay) {
        modal.classList.add("show");
        overlay.classList.add("show");
        loadIngredientsData();
      }
    });
  }

  const btnHistory = document.getElementById("btn-history");
  if (btnHistory) {
    btnHistory.addEventListener("click", () => {
      const sidebar = document.getElementById("history-sidebar");
      const overlay = document.getElementById("overlay");
      if (sidebar && overlay) {
        sidebar.classList.add("show");
        overlay.classList.add("show");
        loadHistoryFromFirebase();
      }
    });
  }

  const btnNewOrder = document.getElementById("btn-new-order");
  if (btnNewOrder) {
    btnNewOrder.addEventListener("click", () => newOrderOpen());
  }

  const btnSound = document.getElementById("btn-sound");
  if (btnSound) {
    btnSound.addEventListener("click", toggleSound);
  }

  const closeButtons = document.querySelectorAll(".btn-close");
  closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".modal, .sidebar, .overlay").forEach((el) => {
        el.classList.remove("show");
      });
    });
  });

  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.addEventListener("click", () => {
      _aiCloseModal();
      _discountCloseModal();
      document.querySelectorAll(".modal, .sidebar, .overlay").forEach((el) => {
        el.classList.remove("show");
      });
      // Reset new-order state so overlay doesn't stay locked
      if (typeof _newOrderReset === "function") _newOrderReset();
    });
  }

  const filterButtons = document.querySelectorAll(".filter-btn");
  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      State.activeFilter = btn.dataset.filter;
      renderHistory();
    });
  });

  const searchInput = document.getElementById("menu-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll(".menu-item");

      items.forEach((item) => {
        const name = item
          .querySelector(".menu-item-name")
          ?.textContent.toLowerCase();
        if (name && name.includes(query)) {
          item.style.display = "";
        } else {
          item.style.display = "none";
        }
      });
    });
  }
}

// ================================
// MENU MANAGEMENT
// ================================
function loadMenuAvailability() {
  if (!State.database) return;

  State.database.ref("menuAvailability").on("value", (snapshot) => {
    State.menuAvailability = snapshot.val() || {};
    console.log(
      "📋 Disponibilidade do cardápio carregada:",
      State.menuAvailability,
    );
  });
}

async function loadMenuData() {
  try {
    const response = await fetch(CONFIG.menuDataUrl);
    State.menuData = await response.json();
    if (window.invalidateAdicionaisCache) window.invalidateAdicionaisCache();
    invalidateAdicionaisCache();
    renderMenuCategories();
    // FIX: listeners são configurados após renderizar, usando delegação de eventos
    setupMenuListeners();
  } catch (error) {
    console.error("Erro ao carregar cardápio:", error);
    showToast("Erro ao carregar cardápio", "error");
  }
}

function renderMenuCategories() {
  const container = document.getElementById("menu-categories");
  if (!container || !State.menuData) return;

  let availableCount = 0;
  let unavailableCount = 0;

  const categoriesHTML = Object.entries(State.menuData)
    .map(([category, items]) => {
      const itemsHTML = items
        .map((item) => {
          const itemKey = `${category}:${item.nome}`;
          const isAvailable = State.menuAvailability[itemKey] !== false;

          if (isAvailable) {
            availableCount++;
          } else {
            unavailableCount++;
          }

          // Renderizar opções com toggles individuais se houver
          let opcoesHTML = "";
          if (item.opcoes && item.opcoes.length > 0) {
            const opcoesWithToggles = item.opcoes
              .map((opcao, index) => {
                const opcaoKey = `${category}:${item.nome}:${opcao}`;
                const isOpcaoAvailable =
                  State.menuAvailability[opcaoKey] !== false;

                return `
                <div class="menu-option-item ${!isOpcaoAvailable ? "unavailable" : ""}">
                  <span class="menu-option-name">${opcao}</span>
                  <div class="menu-option-toggle ${isOpcaoAvailable ? "active" : ""}" 
                       data-category="${category}" 
                       data-name="${item.nome}"
                       data-option="${opcao}">
                  </div>
                </div>
              `;
              })
              .join("");

            opcoesHTML = `
              <div class="menu-item-options-container">
                <div class="menu-options-label">Opções:</div>
                ${opcoesWithToggles}
              </div>
            `;
          }

          return `
            <div class="menu-item ${!isAvailable ? "unavailable" : ""}" data-item="${itemKey}">
              <div class="menu-item-header">
                <div class="menu-item-info">
                  <div class="menu-item-name">${item.nome}</div>
                  ${item.descricao ? `<div class="menu-item-desc">${item.descricao}</div>` : ""}
                </div>
                <div class="menu-item-controls">
                  <span class="menu-item-status ${isAvailable ? "available" : "unavailable"}">
                    ${isAvailable ? "✅ Disponível" : "❌ Indisponível"}
                  </span>
                  <div class="menu-item-toggle ${isAvailable ? "active" : ""}" 
                       data-category="${category}" 
                       data-name="${item.nome}">
                  </div>
                </div>
              </div>
              ${opcoesHTML}
            </div>
          `;
        })
        .join("");

      return `
        <div class="menu-category">
          <div class="menu-category-title">
            ${getCategoryIcon(category)} ${category}
            <span class="menu-category-count">(${items.length} itens)</span>
          </div>
          <div class="menu-category-items">
            ${itemsHTML}
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = categoriesHTML;

  document.getElementById("available-count").textContent = availableCount;
  document.getElementById("unavailable-count").textContent = unavailableCount;
}

function getCategoryIcon(category) {
  const icons = {
    Promoções: "🎉",
    Clones: "👥",
    Combos: "🍔",
    Artesanais: "🥩",
    "Batata Frita": "🍟",
    Bebidas: "🥤",
  };
  return icons[category] || "📦";
}

function setupMenuListeners() {
  const menuCategories = document.getElementById("menu-categories");
  if (!menuCategories) return;

  // FIX: usa delegação de evento no container pai, evitando listeners duplicados a cada abertura
  menuCategories.replaceWith(menuCategories.cloneNode(true)); // remove listeners antigos
  const freshContainer = document.getElementById("menu-categories");

  freshContainer.addEventListener("click", async (e) => {
    const toggle = e.target.closest(".menu-item-toggle, .menu-option-toggle");
    if (!toggle) return;

    const category = toggle.dataset.category;
    const name = toggle.dataset.name;
    const option = toggle.dataset.option;
    const isActive = toggle.classList.contains("active");
    const newStatus = !isActive;

    try {
      if (option) {
        await toggleMenuOptionAvailability(category, name, option, newStatus);
        toggle.classList.toggle("active");
        const optionItem = toggle.closest(".menu-option-item");
        if (newStatus) {
          optionItem.classList.remove("unavailable");
          showToast(`✅ ${name} - ${option} disponível`, "success");
        } else {
          optionItem.classList.add("unavailable");
          showToast(`❌ ${name} - ${option} indisponível`, "info");
        }
      } else {
        await toggleMenuItemAvailability(category, name, newStatus);
        toggle.classList.toggle("active");
        const item = toggle.closest(".menu-item");
        const status = item.querySelector(".menu-item-status");
        if (newStatus) {
          item.classList.remove("unavailable");
          status.classList.remove("unavailable");
          status.classList.add("available");
          status.textContent = "✅ Disponível";
          showToast(`✅ ${name} disponível`, "success");
        } else {
          item.classList.add("unavailable");
          status.classList.add("unavailable");
          status.classList.remove("available");
          status.textContent = "❌ Indisponível";
          showToast(`❌ ${name} indisponível`, "info");
        }
      }
      updateMenuStats();
    } catch (error) {
      console.error("Erro ao alterar disponibilidade:", error);
      showToast("Erro ao atualizar disponibilidade", "error");
    }
  });
}

function updateMenuStats() {
  let availableCount = 0;
  let unavailableCount = 0;

  document.querySelectorAll(".menu-item").forEach((item) => {
    if (item.classList.contains("unavailable")) {
      unavailableCount++;
    } else {
      availableCount++;
    }
  });

  document.getElementById("available-count").textContent = availableCount;
  document.getElementById("unavailable-count").textContent = unavailableCount;
}

async function toggleMenuItemAvailability(category, name, isAvailable) {
  if (!State.database) {
    throw new Error("Firebase não conectado");
  }

  const itemKey = `${category}:${name}`;
  await State.database.ref(`menuAvailability/${itemKey}`).set(isAvailable);

  State.menuAvailability[itemKey] = isAvailable;
  console.log(`📋 ${itemKey}: ${isAvailable ? "disponível" : "indisponível"}`);
}

async function toggleMenuOptionAvailability(
  category,
  name,
  option,
  isAvailable,
) {
  if (!State.database) {
    throw new Error("Firebase não conectado");
  }

  const optionKey = `${category}:${name}:${option}`;
  await State.database.ref(`menuAvailability/${optionKey}`).set(isAvailable);

  State.menuAvailability[optionKey] = isAvailable;
  console.log(
    `📋 ${optionKey}: ${isAvailable ? "disponível" : "indisponível"}`,
  );
}

// ================================
// INGREDIENTS MANAGEMENT
// ================================
function loadIngredientsAvailability() {
  if (!State.database) return;

  State.database.ref("ingredientsAvailability").on("value", (snapshot) => {
    State.ingredientsAvailability = snapshot.val() || {};
    console.log(
      "📦 Disponibilidade de ingredientes carregada:",
      State.ingredientsAvailability,
    );
  });

  State.database.ref("paidExtrasAvailability").on("value", (snapshot) => {
    State.paidExtrasAvailability = snapshot.val() || {};
    console.log(
      "💰 Disponibilidade de adicionais pagos carregada:",
      State.paidExtrasAvailability,
    );
  });
}

function extractIngredientsAndExtras() {
  const ingredients = new Set();
  const paidExtras = new Map(); // chave: nome (deduplicação por nome — um toggle controla todos os preços)

  if (!State.menuData) return { ingredients: [], paidExtras: [] };

  Object.values(State.menuData).forEach((category) => {
    category.forEach((item) => {
      if (item.ingredientesPadrao) {
        item.ingredientesPadrao.forEach((ing) => ingredients.add(ing));
      }

      if (item.ingredientesPorOpcao) {
        Object.values(item.ingredientesPorOpcao).forEach((ings) => {
          ings.forEach((ing) => ingredients.add(ing));
        });
      }

      if (item.simplesIngredients) {
        item.simplesIngredients.forEach((ing) => ingredients.add(ing));
      }

      if (item.duploIngredients) {
        item.duploIngredients.forEach((ing) => ingredients.add(ing));
      }

      if (item.PromoIngredients) {
        item.PromoIngredients.forEach((ing) => ingredients.add(ing));
      }

      if (item.adicionais) {
        item.adicionais.forEach((add) => {
          if (typeof add === "object" && add.nome && add.preco != null) {
            // Deduplicar por chave composta nome_preco (ignora campo "disponivel")
            // Usa o menor preço como referência; a chave é o nome para um toggle controlar tudo
            if (!paidExtras.has(add.nome))
              paidExtras.set(add.nome, { nome: add.nome, preco: add.preco });
          }
        });
      }

      if (item.paidExtras) {
        item.paidExtras.forEach((extra) => {
          if (extra.nome && extra.preco != null) {
            if (!paidExtras.has(extra.nome))
              paidExtras.set(extra.nome, {
                nome: extra.nome,
                preco: extra.preco,
              });
          }
        });
      }
    });
  });

  const paidExtrasArray = Array.from(paidExtras.values());

  return {
    ingredients: Array.from(ingredients).sort(),
    paidExtras: paidExtrasArray.sort(
      (a, b) => a.nome.localeCompare(b.nome) || a.preco - b.preco,
    ),
  };
}

async function loadIngredientsData() {
  if (!State.menuData) {
    // Só busca os dados sem renderizar o modal de cardápio
    try {
      const response = await fetch(CONFIG.menuDataUrl);
      State.menuData = await response.json();
      if (window.invalidateAdicionaisCache) window.invalidateAdicionaisCache();
      invalidateAdicionaisCache();
    } catch (error) {
      console.error("Erro ao carregar cardápio para insumos:", error);
      showToast("Erro ao carregar dados do cardápio", "error");
      return;
    }
  }

  renderIngredientsTab();
  setupIngredientsListeners();
}

function renderIngredientsTab() {
  const activeTab =
    document.querySelector("#ingredients-modal .tab-btn.active")?.dataset.tab ||
    "ingredients";

  const { ingredients, paidExtras } = extractIngredientsAndExtras();

  if (activeTab === "ingredients") {
    renderIngredientsList(ingredients);
  } else {
    renderPaidExtrasList(paidExtras);
  }

  updateIngredientsStats(ingredients, paidExtras);

  // FIX: re-attach toggle listeners sempre que o HTML é re-renderizado
  setupIngredientToggles();
}

function renderIngredientsList(ingredients) {
  const container = document.getElementById("ingredients-content");
  if (!container) return;

  if (ingredients.length === 0) {
    container.innerHTML = `
      <div class="empty-ingredients">
        <p>Nenhum ingrediente encontrado</p>
      </div>
    `;
    return;
  }

  const html = `
    <div class="ingredient-group">
      <div class="ingredient-group-title">
        🥬 Ingredientes
        <span class="ingredient-group-count">(${ingredients.length} itens)</span>
      </div>
      ${ingredients
        .map((ingredient) => {
          const isAvailable =
            State.ingredientsAvailability[ingredient] !== false;
          return `
            <div class="ingredient-item ${!isAvailable ? "unavailable" : ""}" data-ingredient="${ingredient}">
              <div class="ingredient-info">
                <div class="ingredient-icon">🥬</div>
                <div class="ingredient-details">
                  <div class="ingredient-name">${ingredient}</div>
                  <div class="ingredient-type">Ingrediente padrão</div>
                </div>
              </div>
              <span class="ingredient-status ${isAvailable ? "available" : "unavailable"}">
                ${isAvailable ? "✅ Disponível" : "❌ Indisponível"}
              </span>
              <div class="ingredient-toggle ${isAvailable ? "active" : ""}" 
                   data-type="ingredient" 
                   data-name="${ingredient}">
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  container.innerHTML = html;
}

function renderPaidExtrasList(paidExtras) {
  const container = document.getElementById("ingredients-content");
  if (!container) return;

  if (paidExtras.length === 0) {
    container.innerHTML = `
      <div class="empty-ingredients">
        <p>Nenhum adicional pago encontrado</p>
      </div>
    `;
    return;
  }

  const html = `
    <div class="ingredient-group">
      <div class="ingredient-group-title">
        💰 Adicionais Pagos
        <span class="ingredient-group-count">(${paidExtras.length} itens)</span>
      </div>
      ${paidExtras
        .map((extra) => {
          const isAvailable =
            State.paidExtrasAvailability[extra.nome] !== false;
          return `
            <div class="ingredient-item ${!isAvailable ? "unavailable" : ""}" data-extra="${extra.nome}">
              <div class="ingredient-info">
                <div class="ingredient-icon">💰</div>
                <div class="ingredient-details">
                  <div class="ingredient-name">${extra.nome}</div>
                </div>
              </div>
              <span class="ingredient-status ${isAvailable ? "available" : "unavailable"}">
                ${isAvailable ? "✅ Disponível" : "❌ Indisponível"}
              </span>
              <div class="ingredient-toggle ${isAvailable ? "active" : ""}" 
                   data-type="paid-extra" 
                   data-name="${extra.nome}">
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  container.innerHTML = html;
}

function updateIngredientsStats(ingredients, paidExtras) {
  const activeTab =
    document.querySelector(".tab-btn.active")?.dataset.tab || "ingredients";

  let available = 0;
  let unavailable = 0;

  if (activeTab === "ingredients") {
    ingredients.forEach((ing) => {
      if (State.ingredientsAvailability[ing] !== false) {
        available++;
      } else {
        unavailable++;
      }
    });
  } else {
    paidExtras.forEach((extra) => {
      if (State.paidExtrasAvailability[extra.nome] !== false) {
        available++;
      } else {
        unavailable++;
      }
    });
  }

  const availableEl = document.getElementById("ingredients-available-count");
  const unavailableEl = document.getElementById(
    "ingredients-unavailable-count",
  );

  if (availableEl) availableEl.textContent = available;
  if (unavailableEl) unavailableEl.textContent = unavailable;
}

function setupIngredientsListeners() {
  const tabButtons = document.querySelectorAll("#ingredients-modal .tab-btn");
  tabButtons.forEach((btn) => {
    // FIX: clona para remover listeners anteriores antes de reanexar
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
  });
  document.querySelectorAll("#ingredients-modal .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll("#ingredients-modal .tab-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderIngredientsTab();
    });
  });

  const searchInput = document.getElementById("ingredients-search-input");
  if (searchInput) {
    const freshSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(freshSearch, searchInput);
    freshSearch.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll(".ingredient-item").forEach((item) => {
        const name = item
          .querySelector(".ingredient-name")
          ?.textContent.toLowerCase();
        item.style.display = name && name.includes(query) ? "" : "none";
      });
    });
  }

  setupIngredientToggles();

  const closeBtn = document.getElementById("close-ingredients-modal");
  if (closeBtn) {
    const freshClose = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(freshClose, closeBtn);
    freshClose.addEventListener("click", () => {
      const modal = document.getElementById("ingredients-modal");
      const overlay = document.getElementById("overlay");
      if (modal) modal.classList.remove("show");
      if (overlay) overlay.classList.remove("show");
    });
  }
}

function setupIngredientToggles() {
  const toggles = document.querySelectorAll(".ingredient-toggle");

  toggles.forEach((toggle) => {
    toggle.addEventListener("click", async () => {
      const type = toggle.dataset.type;
      const name = toggle.dataset.name;
      const isActive = toggle.classList.contains("active");
      const newStatus = !isActive;

      try {
        if (type === "ingredient") {
          await toggleIngredientAvailability(name, newStatus);
        } else if (type === "paid-extra") {
          await togglePaidExtraAvailability(name, newStatus);
        }

        toggle.classList.toggle("active");
        const item = toggle.closest(".ingredient-item");
        const status = item.querySelector(".ingredient-status");
        // Nome legível para o toast: remove sufixo _preco se for adicional pago
        const displayName =
          type === "paid-extra"
            ? item.querySelector(".ingredient-name")?.textContent?.trim() ||
              name
            : name;

        if (newStatus) {
          item.classList.remove("unavailable");
          status.classList.remove("unavailable");
          status.classList.add("available");
          status.textContent = "✅ Disponível";
          showToast(`✅ ${displayName} disponível`, "success");
        } else {
          item.classList.add("unavailable");
          status.classList.add("unavailable");
          status.classList.remove("available");
          status.textContent = "❌ Indisponível";
          showToast(`❌ ${displayName} indisponível`, "info");
        }

        const { ingredients, paidExtras } = extractIngredientsAndExtras();
        updateIngredientsStats(ingredients, paidExtras);
      } catch (error) {
        console.error("Erro ao alterar disponibilidade:", error);
        showToast("Erro ao atualizar disponibilidade", "error");
      }
    });
  });
}

async function toggleIngredientAvailability(ingredient, isAvailable) {
  if (!State.database) {
    throw new Error("Firebase não conectado");
  }

  await State.database
    .ref(`ingredientsAvailability/${ingredient}`)
    .set(isAvailable);

  State.ingredientsAvailability[ingredient] = isAvailable;
  console.log(
    `🥬 ${ingredient}: ${isAvailable ? "disponível" : "indisponível"}`,
  );
}

async function togglePaidExtraAvailability(extra, isAvailable) {
  if (!State.database) {
    throw new Error("Firebase não conectado");
  }

  await State.database.ref(`paidExtrasAvailability/${extra}`).set(isAvailable);

  State.paidExtrasAvailability[extra] = isAvailable;
  console.log(`💰 ${extra}: ${isAvailable ? "disponível" : "indisponível"}`);
}

// ================================================================
// ADD ITEM MODAL — replica fiel do OrderFlow do app.js
// ================================================================

// ── Helpers internos ─────────────────────────────────────────────

function _aiGetExtras(item) {
  return item.paidExtras || item.adicionais || item.extras || [];
}

function _aiFormatPrice(v) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

function _aiGetIngredientsForBurger(item, burgerName) {
  const n = burgerName.toLowerCase();
  if (n.includes("simples"))
    return item.simplesIngredients || item.ingredientesPadrao || [];
  if (n.includes("duplo"))
    return (
      item.duploIngredients ||
      item.DuploIngredients ||
      item.ingredientesPadrao ||
      []
    );
  if (n.includes("triplo"))
    return item.triploIngredients || item.ingredientesPadrao || [];
  if (n.includes("cremoso"))
    return item.PromoIngredients || item.ingredientesPadrao || [];
  if (n.includes("calabreso"))
    return item.duploIngredients || item.ingredientesPadrao || [];
  return (
    item.ingredientesPadrao ||
    item.duploIngredients ||
    item.simplesIngredients ||
    []
  );
}

function _aiBuildStepsForItem(item, selectedSize) {
  const steps = [];
  if (item.pontoCarne) steps.push({ type: "meatPoint", data: item.pontoCarne });
  if (item.caldas && Array.isArray(item.caldas))
    steps.push({ type: "caldas", data: item.caldas });

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
  const uniq = [...new Set(ingredients)].filter((i) => i && i.trim() !== "");
  if (uniq.length) steps.push({ type: "retiradas", data: uniq });

  const extras = _aiGetExtras(item).filter(
    (e) => State.paidExtrasAvailability[e.nome] !== false,
  );
  if (extras.length) steps.push({ type: "extras", data: extras });

  steps.push({ type: "observacoes" });
  return steps;
}

function _aiBuildStepsForBurger(item, burgerName, ingredients) {
  const steps = [];
  steps.push({
    type: "meatPoint",
    data: ["Mal passado", "Ao ponto", "Bem passado"],
    burgerName,
  });
  if (item.caldas && Array.isArray(item.caldas))
    steps.push({ type: "caldas", data: item.caldas, burgerName });
  if (ingredients && ingredients.length)
    steps.push({ type: "retiradas", data: ingredients, burgerName });
  const extras = _aiGetExtras(item).filter(
    (e) => State.paidExtrasAvailability[e.nome] !== false,
  );
  if (extras.length) steps.push({ type: "extras", data: extras, burgerName });
  steps.push({ type: "observacoes", burgerName });
  return steps;
}

// ── Abre o modal de adicionar item ───────────────────────────────

window.openAddItemModal = async function (orderId) {
  if (!State.menuData) {
    try {
      const r = await fetch(CONFIG.menuDataUrl);
      State.menuData = await r.json();
      if (window.invalidateAdicionaisCache) window.invalidateAdicionaisCache();
    } catch (e) {
      showToast("Erro ao carregar cardápio", "error");
      return;
    }
  }

  State.addItem.orderId = orderId;

  const modal = document.getElementById("kds-add-item-modal");
  const overlay = document.getElementById("overlay");
  modal.classList.add("show");
  overlay.classList.add("show");

  _aiRenderCatalog();
};

function _aiRenderCatalog() {
  const body = document.getElementById("ai-modal-body");
  const title = document.getElementById("ai-modal-title");
  const footer = document.getElementById("ai-modal-footer");

  title.textContent = "➕ Adicionar Item ao Pedido";
  footer.innerHTML = "";

  if (!State.menuData) {
    body.innerHTML = "<p>Carregando...</p>";
    return;
  }

  let html = "";
  Object.entries(State.menuData).forEach(([category, items]) => {
    html += `<div class="ai-category">
      <div class="ai-category-title">${_aiCategoryIcon(category)} ${category}</div>
      <div class="ai-items-grid">`;
    items.forEach((item, itemIdx) => {
      const itemKey = `${category}:${item.nome}`;
      const avail = State.menuAvailability[itemKey] !== false;
      if (item.opcoes && item.opcoes.length > 0) {
        item.opcoes.forEach((opcao, opIdx) => {
          const price = item.precoBase?.[opIdx] || 0;
          const optKey = `${category}:${item.nome}:${opcao}`;
          const optAvail = avail && State.menuAvailability[optKey] !== false;
          html += `<button class="ai-item-btn${optAvail ? "" : " ai-unavailable"}"
            ${optAvail ? `onclick="_aiSelectItem('${category}', ${itemIdx}, '${opcao}', ${price})"` : "disabled"}>
            <span class="ai-item-name">${item.nome}</span>
            <span class="ai-item-sub">${opcao}</span>
            <span class="ai-item-price">${optAvail ? _aiFormatPrice(price) : "Indisponível"}</span>
          </button>`;
        });
      } else {
        const price = Array.isArray(item.precoBase)
          ? item.precoBase[0]
          : item.precoBase || 0;
        html += `<button class="ai-item-btn${avail ? "" : " ai-unavailable"}"
          ${avail ? `onclick="_aiSelectItem('${category}', ${itemIdx}, null, ${price})"` : "disabled"}>
          <span class="ai-item-name">${item.nome}</span>
          <span class="ai-item-price">${avail ? _aiFormatPrice(price) : "Indisponível"}</span>
        </button>`;
      }
    });
    html += `</div></div>`;
  });
  body.innerHTML = html;
}

function _aiCategoryIcon(cat) {
  const icons = {
    Promoções: "🎉",
    Clones: "👥",
    Combos: "🍔",
    Artesanais: "🥩",
    "Batata Frita": "🍟",
    Bebidas: "🥤",
  };
  return icons[cat] || "📦";
}

// ── Usuário clicou num item do catálogo ──────────────────────────

window._aiSelectItem = function (
  category,
  itemIdx,
  selectedSize,
  selectedPrice,
) {
  const item = State.menuData[category][itemIdx];

  // Combo completo (Combos com upgrades)
  if (item.combo && category === "Combos" && item.upgrades) {
    State.addItem.isCombo = true;
    State.addItem.isFullCombo = true;
    State.addItem.comboData = {
      nomeCombo: item.nome,
      categoria: category,
      selectedSize,
      basePrice: selectedPrice,
      itemRef: item,
      upgrades: item.upgrades,
      selectedBatata: null,
      selectedBebida: null,
      batataPriceAdjust: 0,
      bebidaPriceAdjust: 0,
    };
  }
  // Combo simples (Promoções/Clones)
  else if (item.combo && item.burgers && item.burgers.length > 0) {
    State.addItem.isCombo = true;
    State.addItem.isFullCombo = false;
    State.addItem.comboData = {
      nomeCombo: item.nome,
      categoria: category,
      selectedSize,
      basePrice: selectedPrice,
      itemRef: item,
    };
  }
  // Item único
  else {
    State.addItem.isCombo = false;
    State.addItem.isFullCombo = false;
    State.addItem.comboData = null;
    State.addItem.tempItem = {
      nome: item.nome,
      img: item.img,
      categoria: category,
      selectedSize,
      selectedPrice,
      meatPoint: null,
      selectedCaldas: [],
      removed: [],
      added: [],
      obs: "",
      finalPrice: selectedPrice,
    };
    State.addItem.steps = _aiBuildStepsForItem(item, selectedSize);
    State.addItem.currentStep = 0;
    if (State.addItem.steps.length === 0) {
      _aiFinalizeSingleItem();
      return;
    }
    _aiRenderStep();
    return;
  }

  // Combo: começa pelo primeiro burger
  State.addItem.currentBurgerIndex = 0;
  State.addItem.comboItems = [];
  State.addItem.isProcessingUpgrades = false;
  _aiStartNextBurger();
};

function _aiStartNextBurger() {
  const { itemRef } = State.addItem.comboData;
  const burgerName = itemRef.burgers[State.addItem.currentBurgerIndex];
  const ingredients = _aiGetIngredientsForBurger(itemRef, burgerName);
  State.addItem.tempItem = {
    nome: burgerName,
    isPartOfCombo: true,
    comboName: State.addItem.comboData.nomeCombo,
    meatPoint: null,
    selectedCaldas: [],
    removed: [],
    added: [],
    obs: "",
    finalPrice: 0,
  };
  State.addItem.steps = _aiBuildStepsForBurger(
    itemRef,
    burgerName,
    ingredients,
  );
  State.addItem.currentStep = 0;
  _aiRenderStep();
}

// ── Renderiza o step atual ────────────────────────────────────────

function _aiRenderStep() {
  const step = State.addItem.steps[State.addItem.currentStep];
  const body = document.getElementById("ai-modal-body");
  const title = document.getElementById("ai-modal-title");
  const footer = document.getElementById("ai-modal-footer");

  // Dots de progresso
  const dotsHtml = State.addItem.steps
    .map(
      (_, i) =>
        `<div class="ai-dot${i === State.addItem.currentStep ? " active" : ""}"></div>`,
    )
    .join("");

  // Botões de navegação
  const isLast = State.addItem.currentStep === State.addItem.steps.length - 1;
  let nextLabel = "PRÓXIMO";
  if (State.addItem.isProcessingUpgrades && isLast)
    nextLabel = "ADICIONAR COMBO";
  else if (State.addItem.isCombo) {
    const isLastBurger =
      State.addItem.currentBurgerIndex ===
      State.addItem.comboData.itemRef.burgers.length - 1;
    if (isLast && isLastBurger)
      nextLabel = State.addItem.isFullCombo ? "PRÓXIMO" : "ADICIONAR COMBO";
    else if (isLast) nextLabel = "PRÓXIMO ITEM";
  } else if (isLast) nextLabel = "ADICIONAR AO PEDIDO";

  const backBtn =
    State.addItem.currentStep > 0
      ? `<button class="btn-order btn-small" onclick="_aiPrevStep()" style="background:#333;color:#fff;">← Voltar</button>`
      : `<button class="btn-order btn-small" onclick="_aiBackToCatalog()" style="background:#333;color:#fff;">📋 Catálogo</button>`;

  footer.innerHTML = `
    <div class="ai-progress-dots">${dotsHtml}</div>
    <div class="ai-footer-btns">
      ${backBtn}
      <button class="btn-order btn-accept" onclick="_aiNextStep()">${nextLabel}</button>
    </div>`;

  // Renderiza o conteúdo do step
  switch (step.type) {
    case "meatPoint":
      _aiRenderMeatPoint(title, body, step);
      break;
    case "caldas":
      _aiRenderCaldas(title, body, step);
      break;
    case "retiradas":
      _aiRenderRetiradas(title, body, step);
      break;
    case "extras":
      _aiRenderExtras(title, body, step);
      break;
    case "observacoes":
      _aiRenderObs(title, body, step);
      break;
    case "batataUpgrade":
      _aiRenderBatataUpgrade(title, body, step);
      break;
    case "bebidaUpgrade":
      _aiRenderBebidaUpgrade(title, body, step);
      break;
  }
}

// ── Renders de cada step ─────────────────────────────────────────

function _aiRenderMeatPoint(title, body, step) {
  title.textContent = `${step.burgerName || State.addItem.tempItem.nome} — Ponto da Carne 🥩`;
  body.innerHTML = step.data
    .map(
      (opt, i) => `
    <div class="ai-option-row">
      <label for="ai-meat-${i}" style="flex:1;cursor:pointer;">${opt}</label>
      <input type="radio" id="ai-meat-${i}" name="ai-meatPoint" value="${opt}"
        ${State.addItem.tempItem.meatPoint === opt ? "checked" : ""}>
    </div>`,
    )
    .join("");
  body
    .querySelectorAll("input")
    .forEach(
      (inp) =>
        (inp.onchange = (e) =>
          (State.addItem.tempItem.meatPoint = e.target.value)),
    );
}

function _aiRenderCaldas(title, body, step) {
  title.textContent = `${step.burgerName || State.addItem.tempItem.nome} — Escolha a Calda 🍯`;
  if (!State.addItem.tempItem.selectedCaldas)
    State.addItem.tempItem.selectedCaldas = [];
  body.innerHTML = step.data
    .map(
      (opt, i) => `
    <div class="ai-option-row">
      <label for="ai-calda-${i}" style="flex:1;cursor:pointer;">${opt}</label>
      <input type="radio" name="ai-calda" id="ai-calda-${i}" value="${opt}"
        ${State.addItem.tempItem.selectedCaldas.includes(opt) ? "checked" : ""}>
    </div>`,
    )
    .join("");
  body
    .querySelectorAll("input")
    .forEach(
      (inp) =>
        (inp.onchange = (e) =>
          (State.addItem.tempItem.selectedCaldas = [e.target.value])),
    );
}

function _aiRenderRetiradas(title, body, step) {
  title.textContent = `${step.burgerName || State.addItem.tempItem.nome} — Retirar Ingredientes ❌`;
  if (!State.addItem.tempItem.removed) State.addItem.tempItem.removed = [];
  const avail = step.data.filter(
    (ing) => State.ingredientsAvailability[ing] !== false,
  );
  if (!avail.length) {
    body.innerHTML = `<p style="color:var(--text-muted);padding:20px;text-align:center;">Nenhum ingrediente disponível.</p>`;
    return;
  }
  body.innerHTML = avail
    .map(
      (ing, i) => `
    <div class="ai-option-row">
      <label for="ai-rem-${i}" style="flex:1;cursor:pointer;">${ing}</label>
      <input type="checkbox" id="ai-rem-${i}" value="${ing}"
        ${State.addItem.tempItem.removed.includes(ing) ? "checked" : ""}>
    </div>`,
    )
    .join("");
  body.querySelectorAll("input").forEach(
    (inp) =>
      (inp.onchange = (e) => {
        const v = e.target.value;
        if (e.target.checked) {
          if (!State.addItem.tempItem.removed.includes(v))
            State.addItem.tempItem.removed.push(v);
        } else {
          const idx = State.addItem.tempItem.removed.indexOf(v);
          if (idx > -1) State.addItem.tempItem.removed.splice(idx, 1);
        }
      }),
  );
}

function _aiRenderExtras(title, body, step) {
  title.textContent = `${step.burgerName || State.addItem.tempItem.nome} — Adicionais Pagos 💰`;
  if (!State.addItem.tempItem.added) State.addItem.tempItem.added = [];
  const avail = step.data.filter(
    (e) => State.paidExtrasAvailability[e.nome] !== false,
  );
  if (!avail.length) {
    body.innerHTML = `<p style="color:var(--text-muted);padding:20px;text-align:center;">Nenhum adicional disponível.</p>`;
    return;
  }
  body.innerHTML = avail
    .map(
      (extra, i) => `
    <div class="ai-option-row">
      <label for="ai-ext-${i}" style="flex:1;cursor:pointer;">
        ${extra.nome} <span style="color:var(--primary);">+ ${_aiFormatPrice(extra.preco)}</span>
      </label>
      <input type="checkbox" id="ai-ext-${i}" value="${i}"
        ${State.addItem.tempItem.added.some((a) => a.nome === extra.nome) ? "checked" : ""}>
    </div>`,
    )
    .join("");
  body.querySelectorAll("input").forEach(
    (inp) =>
      (inp.onchange = (e) => {
        const extra = avail[parseInt(e.target.value)];
        if (e.target.checked) {
          if (!State.addItem.tempItem.added.some((a) => a.nome === extra.nome))
            State.addItem.tempItem.added.push({
              nome: extra.nome,
              preco: extra.preco,
            });
        } else {
          const idx = State.addItem.tempItem.added.findIndex(
            (a) => a.nome === extra.nome,
          );
          if (idx > -1) State.addItem.tempItem.added.splice(idx, 1);
        }
      }),
  );
}

function _aiRenderObs(title, body, step) {
  title.textContent = `${step.burgerName || State.addItem.tempItem.nome} — Observações 💬`;
  body.innerHTML = `<textarea id="ai-obs-input" placeholder="Observação especial..." style="width:100%;min-height:110px;padding:14px;background:#111;border:1px solid var(--border);border-radius:10px;color:#fff;font-size:0.95rem;resize:vertical;outline:none;">${State.addItem.tempItem.obs || ""}</textarea>`;
  body.querySelector("#ai-obs-input").oninput = (e) =>
    (State.addItem.tempItem.obs = e.target.value);
}

function _aiRenderBatataUpgrade(title, body, step) {
  title.textContent = "Escolha a Batata 🍟";
  const upgrades = step.data;
  if (!State.addItem.comboData.selectedBatata) {
    State.addItem.comboData.selectedBatata = upgrades[0].nome;
    State.addItem.comboData.batataPriceAdjust = upgrades[0].adicional || 0;
  }
  body.innerHTML = upgrades
    .map((opt, i) => {
      const priceText =
        opt.adicional > 0
          ? `+${_aiFormatPrice(opt.adicional)}`
          : opt.adicional < 0
            ? _aiFormatPrice(opt.adicional)
            : "Inclusa";
      return `<div class="ai-option-row">
      <label for="ai-bat-${i}" style="flex:1;cursor:pointer;">${opt.nome} <span style="color:var(--primary);">${priceText}</span></label>
      <input type="radio" id="ai-bat-${i}" name="ai-batata" value="${i}" ${State.addItem.comboData.selectedBatata === opt.nome ? "checked" : ""}>
    </div>`;
    })
    .join("");
  body.querySelectorAll("input").forEach(
    (inp) =>
      (inp.onchange = (e) => {
        const sel = upgrades[parseInt(e.target.value)];
        State.addItem.comboData.selectedBatata = sel.nome;
        State.addItem.comboData.batataPriceAdjust = sel.adicional || 0;
      }),
  );
}

function _aiRenderBebidaUpgrade(title, body, step) {
  title.textContent = "Escolha a Bebida 🥤";
  const upgrades = step.data;
  if (!State.addItem.comboData.selectedBebida) {
    State.addItem.comboData.selectedBebida = upgrades[0].nome;
    State.addItem.comboData.bebidaPriceAdjust = upgrades[0].adicional || 0;
  }
  body.innerHTML = upgrades
    .map((opt, i) => {
      const priceText =
        opt.adicional > 0
          ? `+${_aiFormatPrice(opt.adicional)}`
          : opt.adicional < 0
            ? _aiFormatPrice(opt.adicional)
            : "Inclusa";
      return `<div class="ai-option-row">
      <label for="ai-beb-${i}" style="flex:1;cursor:pointer;">${opt.nome} <span style="color:var(--primary);">${priceText}</span></label>
      <input type="radio" id="ai-beb-${i}" name="ai-bebida" value="${i}" ${State.addItem.comboData.selectedBebida === opt.nome ? "checked" : ""}>
    </div>`;
    })
    .join("");
  body.querySelectorAll("input").forEach(
    (inp) =>
      (inp.onchange = (e) => {
        const sel = upgrades[parseInt(e.target.value)];
        State.addItem.comboData.selectedBebida = sel.nome;
        State.addItem.comboData.bebidaPriceAdjust = sel.adicional || 0;
      }),
  );
}

// ── Navegação entre steps ────────────────────────────────────────

window._aiNextStep = function () {
  const step = State.addItem.steps[State.addItem.currentStep];

  // Validar calda obrigatória
  if (
    step.type === "caldas" &&
    (!State.addItem.tempItem.selectedCaldas ||
      !State.addItem.tempItem.selectedCaldas.length)
  ) {
    showToast("⚠️ Escolha uma calda para continuar", "warning");
    return;
  }

  if (State.addItem.currentStep < State.addItem.steps.length - 1) {
    State.addItem.currentStep++;
    _aiRenderStep();
  } else {
    _aiCompleteCurrentItem();
  }
};

window._aiPrevStep = function () {
  if (State.addItem.currentStep > 0) {
    State.addItem.currentStep--;
    _aiRenderStep();
  }
};

window._aiBackToCatalog = function () {
  _aiRenderCatalog();
  document.getElementById("ai-modal-footer").innerHTML = "";
  document.getElementById("ai-modal-title").textContent =
    "➕ Adicionar Item ao Pedido";
};

function _aiCompleteCurrentItem() {
  if (State.addItem.isProcessingUpgrades) {
    State.addItem.isProcessingUpgrades = false;
    _aiFinalizeCombo();
    return;
  }

  if (State.addItem.isCombo) {
    // Salva burger atual
    const extrasTotal = (State.addItem.tempItem.added || []).reduce(
      (s, a) => s + a.preco,
      0,
    );
    State.addItem.tempItem.finalPrice = extrasTotal;
    State.addItem.comboItems.push({ ...State.addItem.tempItem });
    State.addItem.currentBurgerIndex++;

    if (
      State.addItem.currentBurgerIndex <
      State.addItem.comboData.itemRef.burgers.length
    ) {
      _aiStartNextBurger();
    } else if (State.addItem.isFullCombo) {
      // Upgrades de batata/bebida
      State.addItem.steps = [
        {
          type: "batataUpgrade",
          data: State.addItem.comboData.upgrades.batata,
        },
        {
          type: "bebidaUpgrade",
          data: State.addItem.comboData.upgrades.bebida,
        },
      ];
      State.addItem.currentStep = 0;
      State.addItem.isProcessingUpgrades = true;
      _aiRenderStep();
    } else {
      _aiFinalizeCombo();
    }
  } else {
    _aiFinalizeSingleItem();
  }
}

function _aiFinalizeSingleItem() {
  const extrasTotal = (State.addItem.tempItem.added || []).reduce(
    (s, a) => s + a.preco,
    0,
  );
  State.addItem.tempItem.finalPrice =
    (State.addItem.tempItem.selectedPrice || 0) + extrasTotal;
  _aiAddItemToOrder(State.addItem.tempItem);
}

function _aiFinalizeCombo() {
  const totalExtras = State.addItem.comboItems.reduce(
    (s, it) => s + it.finalPrice,
    0,
  );
  const finalPrice =
    State.addItem.comboData.basePrice +
    totalExtras +
    (State.addItem.comboData.batataPriceAdjust || 0) +
    (State.addItem.comboData.bebidaPriceAdjust || 0);

  const comboItem = {
    nome: State.addItem.comboData.nomeCombo,
    img: State.addItem.comboData.itemRef.img,
    categoria: State.addItem.comboData.categoria,
    selectedSize: State.addItem.comboData.selectedSize,
    selectedPrice: State.addItem.comboData.basePrice,
    isCombo: true,
    burgers: State.addItem.comboItems,
    selectedBatata: State.addItem.comboData.selectedBatata || null,
    selectedBebida: State.addItem.comboData.selectedBebida || null,
    finalPrice,
  };
  _aiAddItemToOrder(comboItem);
}

// ── Persiste o novo item no Firebase ────────────────────────────

async function _aiAddItemToOrder(newItem) {
  // ── New-order mode: redirect to local cart ───────────────────────
  if (State.addItem.orderId === "__new_order__") {
    _newOrderReceiveItem(newItem);
    return;
  }

  const orderId = State.addItem.orderId;
  const order = State.orders[orderId];
  if (!order || !State.database) return;

  // Monta objeto no formato do cardápio (compatível com parseOrderItem)
  const observacoes = [];
  if (newItem.isCombo && newItem.burgers) {
    newItem.burgers.forEach((b) => {
      observacoes.push(`---${b.nome}---`);
      if (b.meatPoint) observacoes.push(`Ponto: ${b.meatPoint}`);
      if (b.removed && b.removed.length)
        observacoes.push(`Sem: ${b.removed.join(", ")}`);
      if (b.added && b.added.length)
        observacoes.push(
          `Adicionais: ${b.added.map((a) => a.nome).join(", ")}`,
        );
      if (b.obs) observacoes.push(b.obs);
    });
    if (newItem.selectedBatata)
      observacoes.push(`Batata: ${newItem.selectedBatata}`);
    if (newItem.selectedBebida)
      observacoes.push(`Bebida: ${newItem.selectedBebida}`);
  } else {
    if (newItem.selectedSize)
      observacoes.push(`Tamanho: ${newItem.selectedSize}`);
    if (newItem.meatPoint) observacoes.push(`Ponto: ${newItem.meatPoint}`);
    if (newItem.selectedCaldas && newItem.selectedCaldas.length)
      observacoes.push(`Caldas: ${newItem.selectedCaldas.join(", ")}`);
    if (newItem.removed && newItem.removed.length)
      observacoes.push(`Sem: ${newItem.removed.join(", ")}`);
    if (newItem.added && newItem.added.length)
      observacoes.push(
        `Adicionais: ${newItem.added.map((a) => a.nome).join(", ")}`,
      );
    if (newItem.obs) observacoes.push(newItem.obs);
  }

  const itemFormatado = {
    nome: newItem.nome,
    quantidade: 1,
    observacao: observacoes.join(
      observacoes.some((o) => o.startsWith("---")) ? "|" : " | ",
    ),
    _kdsAdded: true, // marca que foi adicionado pelo KDS
  };
  if (newItem.finalPrice) itemFormatado._precoOriginal = newItem.finalPrice;
  if (newItem.meatPoint) itemFormatado.ponto = newItem.meatPoint;
  if (newItem.removed && newItem.removed.length)
    itemFormatado.retiradas = newItem.removed;
  if (newItem.added && newItem.added.length)
    itemFormatado.adicionais = newItem.added.map((a) => ({
      nome: a.nome,
      preco: a.preco,
    }));

  const updatedItens = [...(order.itens || []), itemFormatado];
  const newTotal = (order.total || 0) + (newItem.finalPrice || 0);

  try {
    await State.database.ref(`pedidos/${orderId}`).update({
      itens: updatedItens,
      total: newTotal,
    });
    showToast(`✅ ${newItem.nome} adicionado ao pedido!`, "success");
    _aiCloseModal();
  } catch (e) {
    console.error("Erro ao adicionar item:", e);
    showToast("Erro ao adicionar item", "error");
  }
}

function _aiCloseModal() {
  document.getElementById("kds-add-item-modal").classList.remove("show");
  // In new-order mode keep the overlay so the new-order modal stays visible
  if (State.addItem.orderId === "__new_order__") return;
  document.getElementById("overlay").classList.remove("show");
}

// ================================================================
// DISCOUNT MODAL
// ================================================================

window.openDiscountModal = function (orderId) {
  const order = State.orders[orderId];
  if (!order || !order.itens || !order.itens.length) {
    showToast("Pedido sem itens para descontar", "warning");
    return;
  }

  State.discount.orderId = orderId;
  State.discount.itemIndex = null;

  const modal = document.getElementById("kds-discount-modal");
  const overlay = document.getElementById("overlay");
  modal.classList.add("show");
  overlay.classList.add("show");

  _discountRenderItemSelect(order);
};

function _discountRenderItemSelect(order) {
  const body = document.getElementById("disc-modal-body");
  const title = document.getElementById("disc-modal-title");
  title.textContent = "🏷️ Aplicar Desconto";

  body.innerHTML = `
    <p style="color:var(--text-muted);margin-bottom:14px;font-size:0.9rem;">Selecione o item e informe o desconto:</p>
    <div id="disc-item-list">
      ${order.itens
        .map((item, idx) => {
          const nome = item.nome || "Item";
          const precoAtual =
            item._precoDesconto || item._precoOriginal || item.preco || null;
          const precoLabel = precoAtual
            ? ` — <span style="color:var(--primary)">${_aiFormatPrice(precoAtual)}</span>`
            : "";
          const temDesc = item._desconto
            ? ` <span style="color:var(--secondary);font-size:0.8rem;">(desc. ${item._desconto})</span>`
            : "";
          return `<button class="disc-item-btn" onclick="_discountSelectItem(${idx})" id="disc-btn-${idx}">
          <span>${item.quantidade || 1}x ${nome}${precoLabel}${temDesc}</span>
          <span class="disc-item-arrow">›</span>
        </button>`;
        })
        .join("")}
    </div>

    <div id="disc-form" style="display:none;margin-top:20px;">
      <div id="disc-item-name" style="font-weight:700;color:var(--primary);margin-bottom:12px;font-size:1rem;"></div>
      <div style="margin-bottom:14px;">
        <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);">Tipo de desconto</label>
        <div style="display:flex;gap:10px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="disc-type" value="percent" checked onchange="_discountSwitchType()"> Percentual (%)
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="radio" name="disc-type" value="fixed" onchange="_discountSwitchType()"> Valor fixo (R$)
          </label>
        </div>
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);" id="disc-input-label">Percentual de desconto</label>
        <input type="number" id="disc-value-input" min="0" step="0.01" placeholder="Ex: 10"
          oninput="_discountUpdatePreview()"
          style="width:100%;padding:12px;background:#1a1a1a;border:2px solid var(--border);border-radius:8px;color:#fff;font-size:1.1rem;outline:none;">
      </div>
      <div id="disc-preview" style="padding:14px;background:rgba(255,193,7,0.07);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;text-align:center;transition:border-color 0.2s;">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px;">Preço atual</div>
        <div id="disc-current-price" style="font-size:2rem;font-weight:800;color:var(--primary);line-height:1.1;"></div>
        <div id="disc-original-row" style="display:none;margin-top:6px;">
          <div style="font-size:0.78rem;color:var(--text-muted);">Preço original</div>
          <div id="disc-original-price" style="font-size:0.95rem;text-decoration:line-through;color:#777;"></div>
        </div>
        <div id="disc-saving" style="font-size:0.82rem;color:var(--secondary);margin-top:6px;min-height:1.2em;"></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-order" onclick="_discountBack()" style="background:#333;flex:1;">← Voltar</button>
        <button class="btn-order btn-accept" onclick="_discountApply()" style="flex:2;">✅ Aplicar Desconto</button>
      </div>
    </div>`;
}

window._discountSelectItem = function (idx) {
  const order = State.orders[State.discount.orderId];
  const item = order.itens[idx];
  State.discount.itemIndex = idx;

  // Destaca o selecionado
  document
    .querySelectorAll(".disc-item-btn")
    .forEach((b) => b.classList.remove("selected"));
  const btn = document.getElementById(`disc-btn-${idx}`);
  if (btn) btn.classList.add("selected");

  // Mostra o formulário
  const form = document.getElementById("disc-form");
  form.style.display = "block";
  // Monta nome com tamanho se disponível (ex: "Smash (Duplo)")
  const parsed_disc = parseOrderItem(item);
  const nomeDisc = parsed_disc.tamanho
    ? `${item.nome} (${parsed_disc.tamanho})`
    : item.nome;
  document.getElementById("disc-item-name").textContent =
    `${item.quantidade || 1}x ${nomeDisc}`;

  // Preço base do item — tenta todas as fontes possíveis
  const precoBase =
    item._precoOriginal || item.preco || item.precoTotal || null;
  form.dataset.precoBase = precoBase != null ? precoBase : "";

  // Limpa input e reseta o tipo para percentual
  document.getElementById("disc-value-input").value = "";
  document.querySelector('input[name="disc-type"][value="percent"]').checked =
    true;
  document.getElementById("disc-input-label").textContent =
    "Percentual de desconto";
  document.getElementById("disc-value-input").placeholder = "Ex: 10";
  document.getElementById("disc-value-input").setAttribute("max", "100");

  // Mostra preço atual imediatamente
  _discountRefreshPriceDisplay();
};

// Chamada ao trocar o tipo: reseta o input e atualiza label/placeholder imediatamente
window._discountSwitchType = function () {
  const inputEl = document.getElementById("disc-value-input");
  const labelEl = document.getElementById("disc-input-label");
  const type =
    document.querySelector('input[name="disc-type"]:checked')?.value ||
    "percent";
  const form = document.getElementById("disc-form");
  const precoBase = parseFloat(form.dataset.precoBase);

  // Resetar valor e atualizar display com preço atual
  inputEl.value = "";
  _discountRefreshPriceDisplay();

  if (type === "percent") {
    labelEl.textContent = "Percentual de desconto";
    inputEl.placeholder = "Ex: 10";
    inputEl.setAttribute("max", "100");
  } else {
    labelEl.textContent = "Novo valor do item (R$)";
    inputEl.placeholder =
      precoBase && !isNaN(precoBase)
        ? `Ex: ${(precoBase * 0.8).toFixed(2).replace(".", ",")}`
        : "Ex: 15,00";
    inputEl.removeAttribute("max");
  }

  // Foco imediato no input para agilizar digitação
  inputEl.focus();
};

// Atualiza o display de preço em tempo real (chamado ao digitar)
window._discountUpdatePreview = function () {
  _discountRefreshPriceDisplay();
};

// Núcleo do display — sempre visível, atualiza conforme input
function _discountRefreshPriceDisplay() {
  const form = document.getElementById("disc-form");
  const precoBase = parseFloat(form.dataset.precoBase);
  const type =
    document.querySelector('input[name="disc-type"]:checked')?.value ||
    "percent";
  const rawVal = document.getElementById("disc-value-input").value;
  const val = parseFloat(rawVal);
  const previewEl = document.getElementById("disc-preview");
  const currentEl = document.getElementById("disc-current-price");
  const originalRow = document.getElementById("disc-original-row");
  const originalEl = document.getElementById("disc-original-price");
  const savingEl = document.getElementById("disc-saving");

  // Sem preço registrado
  if (!precoBase || isNaN(precoBase)) {
    currentEl.textContent = "—";
    currentEl.style.color = "var(--text-muted)";
    originalRow.style.display = "none";
    savingEl.textContent = "ℹ️ Sem preço registrado — desconto será anotado";
    previewEl.style.borderColor = "var(--border)";
    return;
  }

  // Sem valor digitado ainda → mostra preço atual sem modificação
  if (rawVal === "" || isNaN(val) || val <= 0) {
    currentEl.textContent = _aiFormatPrice(precoBase);
    currentEl.style.color = "var(--primary)";
    originalRow.style.display = "none";
    savingEl.textContent = "";
    previewEl.style.borderColor = "var(--border)";
    return;
  }

  // Calcula novo preço
  let novoPreco;
  if (type === "percent") {
    novoPreco = precoBase * (1 - val / 100);
  } else {
    novoPreco = val; // valor fixo = novo preço final
  }
  novoPreco = Math.max(0, novoPreco);

  const economia = precoBase - novoPreco;

  // Atualiza display
  currentEl.textContent = _aiFormatPrice(novoPreco);
  currentEl.style.color = economia > 0 ? "var(--secondary)" : "var(--primary)";

  if (economia > 0) {
    originalRow.style.display = "block";
    originalEl.textContent = _aiFormatPrice(precoBase);
    savingEl.textContent =
      type === "percent"
        ? `↓ ${val}% de desconto — economia de ${_aiFormatPrice(economia)}`
        : `↓ economia de ${_aiFormatPrice(economia)}`;
    previewEl.style.borderColor = "var(--secondary)";
  } else {
    originalRow.style.display = "none";
    savingEl.textContent = "";
    previewEl.style.borderColor = "var(--border)";
  }
}

window._discountBack = function () {
  document.getElementById("disc-form").style.display = "none";
  document
    .querySelectorAll(".disc-item-btn")
    .forEach((b) => b.classList.remove("selected"));
  State.discount.itemIndex = null;
};

window._discountApply = async function () {
  const { orderId, itemIndex } = State.discount;
  const order = State.orders[orderId];
  if (!order || itemIndex === null) return;

  const item = order.itens[itemIndex];
  const form = document.getElementById("disc-form");
  const precoBase = parseFloat(form.dataset.precoBase);
  const type =
    document.querySelector('input[name="disc-type"]:checked')?.value ||
    "percent";
  const val = parseFloat(document.getElementById("disc-value-input").value);

  if (isNaN(val) || val <= 0) {
    showToast("⚠️ Informe um valor de desconto válido", "warning");
    return;
  }

  let novoPreco = null;
  let descontoLabel = "";

  if (precoBase && !isNaN(precoBase)) {
    if (type === "percent") {
      novoPreco = Math.max(0, precoBase * (1 - val / 100));
      descontoLabel = `${val}%`;
    } else {
      // "fixed": val é o novo preço final informado pelo usuário
      novoPreco = Math.max(0, val);
      const economia = precoBase - novoPreco;
      descontoLabel = `R$ ${Number(novoPreco).toFixed(2).replace(".", ",")} (ec. ${_aiFormatPrice(economia)})`;
    }
  } else {
    descontoLabel =
      type === "percent"
        ? `${val}%`
        : `- R$ ${Number(val).toFixed(2).replace(".", ",")}`;
  }

  // Atualiza item localmente
  const updatedItens = [...order.itens];
  const precoOriginalFinal =
    precoBase && !isNaN(precoBase)
      ? precoBase
      : updatedItens[itemIndex]._precoOriginal || null;

  updatedItens[itemIndex] = {
    ...updatedItens[itemIndex],
    _precoOriginal: precoOriginalFinal,
    _precoDesconto: novoPreco !== null && !isNaN(novoPreco) ? novoPreco : null,
    _desconto: descontoLabel || null,
  };

  // Remove campos null/NaN para não quebrar o Firebase
  Object.keys(updatedItens[itemIndex]).forEach((k) => {
    if (
      updatedItens[itemIndex][k] === null ||
      updatedItens[itemIndex][k] === undefined ||
      (typeof updatedItens[itemIndex][k] === "number" &&
        isNaN(updatedItens[itemIndex][k]))
    ) {
      delete updatedItens[itemIndex][k];
    }
  });

  // Recalcula total do pedido
  let newTotal = order.total || 0;
  if (
    novoPreco !== null &&
    !isNaN(novoPreco) &&
    precoOriginalFinal &&
    !isNaN(precoOriginalFinal)
  ) {
    const diff = novoPreco - precoOriginalFinal;
    newTotal = Math.max(0, newTotal + diff);
  }

  try {
    await State.database.ref(`pedidos/${orderId}`).update({
      itens: updatedItens,
      total: newTotal,
    });
    showToast(`🏷️ Desconto aplicado: ${descontoLabel}`, "success");
    _discountCloseModal();
  } catch (e) {
    console.error("Erro ao aplicar desconto:", e);
    showToast("Erro ao aplicar desconto", "error");
  }
};

function _discountCloseModal() {
  document.getElementById("kds-discount-modal").classList.remove("show");
  document.getElementById("overlay").classList.remove("show");
}

// Fechar modais ao clicar no overlay — lógica centralizada em initUI()

// ================================
// INITIALIZATION
// ================================

// Expose initKDS to be called after authentication
window.initKDS = function () {
  initFirebase();
  initUI();
  setTimeout(initInProgressWidget, 1500);
  console.log("✅ KDS inicializado após autenticação");
};

// initKDS é chamado exclusivamente pelo firebase-init-auth.js após autenticação confirmada.
console.log("🔐 KDS aguardando autenticação...");

// ================================================================
// CRIAR PEDIDO — NEW ORDER FROM KDS
// ================================================================

// ── State ─────────────────────────────────────────────────────────
const _NO = {
  step: "tipo", // "tipo" | "info" | "cart" | "pagto"
  tipo: null, // "totem" | "delivery"
  info: {},
  cart: [],
};

// Bairros com taxas (espelha o app de delivery)
const _NO_BAIRROS = [
  { v: "cajueiro", t: "Cajueiro", fee: 6 },
  { v: "barros-filho", t: "Barros Filho", fee: 6 },
  { v: "vicente-carvalho", t: "Vicente Carvalho", fee: 6 },
  { v: "coelho-neto", t: "Coelho Neto", fee: 6 },
  { v: "cosmos", t: "Cosmos", fee: 8 },
  { v: "pavuna", t: "Pavuna", fee: 8 },
  { v: "campo-grande", t: "Campo Grande", fee: 0 },
  { v: "outro", t: "Outro / Combinar taxa", fee: 0 },
];

function _fmt(n) {
  return `R$ ${Number(n).toFixed(2).replace(".", ",")}`;
}

// ── Open / close ──────────────────────────────────────────────────
window.newOrderOpen = async function () {
  if (!State.menuData) {
    try {
      const r = await fetch(CONFIG.menuDataUrl);
      State.menuData = await r.json();
      if (window.invalidateAdicionaisCache) window.invalidateAdicionaisCache();
    } catch {
      showToast("Erro ao carregar cardápio", "error");
      return;
    }
  }
  _NO.step = "tipo";
  _NO.tipo = null;
  _NO.info = {};
  _NO.cart = [];
  document.getElementById("new-order-modal").classList.add("show");
  document.getElementById("overlay").classList.add("show");
  _noRender();
};

window.newOrderClose = function () {
  document.getElementById("new-order-modal").classList.remove("show");
  document.getElementById("overlay").classList.remove("show");
  // Reset addItem orderId so subsequent normal adds aren't broken
  State.addItem.orderId = null;
};

window._newOrderReset = function () {
  State.addItem.orderId = null;
};

// ── Step router ───────────────────────────────────────────────────
function _noRender() {
  if (_NO.step === "tipo") _noRenderTipo();
  else if (_NO.step === "info") _noRenderInfo();
  else if (_NO.step === "cart") _noRenderCart();
  else if (_NO.step === "pagto") _noRenderPagto();
}

// ── STEP 1 — Tipo ─────────────────────────────────────────────────
function _noRenderTipo() {
  document.getElementById("no-title").textContent = "🧾 Criar Pedido";
  document.getElementById("no-footer").innerHTML = "";
  document.getElementById("no-body").innerHTML = `
    <p class="no-desc">Selecione a origem do pedido:</p>
    <div class="no-tipo-grid">
      <button class="no-tipo-btn" onclick="_noPickTipo('totem')">
        <span class="no-tipo-icon">🪑</span>
        <strong>Totem / Mesa</strong>
        <span class="no-tipo-sub">Consumo no local</span>
      </button>
      <button class="no-tipo-btn" onclick="_noPickTipo('delivery')">
        <span class="no-tipo-icon">🛵</span>
        <strong>Delivery</strong>
        <span class="no-tipo-sub">Entrega ou retirada</span>
      </button>
    </div>`;
}

window._noPickTipo = function (tipo) {
  _NO.tipo = tipo;
  _NO.step = "info";
  _noRender();
};

// ── STEP 2 — Info (nome + endereço/bairro apenas) ─────────────────
function _noRenderInfo() {
  const isD = _NO.tipo === "delivery";
  document.getElementById("no-title").textContent = isD
    ? "🛵 Identificação — Delivery"
    : "🪑 Identificação — Mesa/Totem";

  const bairroOpts = _NO_BAIRROS
    .map(
      (b) =>
        `<option value="${b.v}" data-fee="${b.fee}">${b.t}${b.fee > 0 ? " (+R$ " + b.fee.toFixed(2).replace(".", ",") + ")" : b.v !== "outro" ? " (grátis)" : ""}</option>`,
    )
    .join("");

  const endBlock = isD
    ? `
    <div class="no-field">
      <label class="no-label">Endereço</label>
      <input class="no-input" id="no-endereco" type="text" placeholder="Rua, número...">
    </div>
    <div class="no-field">
      <label class="no-label">Bairro</label>
      <select class="no-input" id="no-bairro" onchange="_noOnBairro()">
        <option value="">— Selecione —</option>${bairroOpts}
      </select>
      <span class="no-taxa-tag" id="no-taxa-tag"></span>
    </div>`
    : "";

  document.getElementById("no-body").innerHTML = `
    <div class="no-form">
      <div class="no-field">
        <label class="no-label">Nome do Cliente *</label>
        <input class="no-input" id="no-nome" type="text" placeholder="Ex: João...">
      </div>
      ${endBlock}
    </div>`;

  // Restore saved values
  if (_NO.info.nome) document.getElementById("no-nome").value = _NO.info.nome;
  if (isD && _NO.info.endereco)
    document.getElementById("no-endereco").value = _NO.info.endereco;
  if (isD && _NO.info.bairroV) {
    document.getElementById("no-bairro").value = _NO.info.bairroV;
    _noOnBairro();
  }

  document.getElementById("no-footer").innerHTML = `
    <div class="no-footer-row">
      <button class="btn-order" style="background:#333" onclick="_noBack()">← Voltar</button>
      <button class="btn-order btn-accept" onclick="_noToCart()" style="flex:2">🛒 Montar Pedido →</button>
    </div>`;
}

window._noOnBairro = function () {
  const sel = document.getElementById("no-bairro");
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const fee = parseFloat(opt?.dataset.fee) || 0;
  _NO.info.taxaEntrega = fee;
  _NO.info.bairroV = sel.value;
  _NO.info.bairroT = (opt?.text || "").replace(/\s*\(.*\)/, "").trim();
  const tag = document.getElementById("no-taxa-tag");
  if (tag) tag.textContent = fee > 0 ? `🛵 Taxa: ${_fmt(fee)}` : "";
};

window._noOnPag = function () {
  const sel = document.getElementById("no-pag");
  if (!sel) return;
  const f = document.getElementById("no-troco-field");
  if (f) f.style.display = sel.value === "Dinheiro" ? "block" : "none";
};

window._noBack = function () {
  if (_NO.step === "pagto") _NO.step = "cart";
  else if (_NO.step === "cart") _NO.step = "info";
  else _NO.step = "tipo";
  _noRender();
};

window._noToCart = function () {
  const nome = (document.getElementById("no-nome")?.value || "").trim();
  if (!nome) {
    showToast("⚠️ Informe o nome do cliente", "warning");
    return;
  }

  _NO.info.nome = nome;
  if (_NO.tipo === "delivery") {
    _NO.info.endereco = (
      document.getElementById("no-endereco")?.value || ""
    ).trim();
    _noOnBairro();
  }

  _NO.step = "cart";
  _noRender();
};

// ── STEP 3 — Cart + Catálogo ──────────────────────────────────────
function _noRenderCart() {
  document.getElementById("no-title").textContent =
    `🛒 Pedido — ${_NO.info.nome}`;

  const taxa = _NO.info.taxaEntrega || 0;
  const sub = _NO.cart.reduce((s, e) => s + (e.finalPrice || 0), 0);
  const total = sub + taxa;

  // Cart list
  let cartHtml = "";
  if (_NO.cart.length === 0) {
    cartHtml = `<div class="no-cart-empty">Carrinho vazio — adicione itens abaixo</div>`;
  } else {
    cartHtml = _NO.cart
      .map((entry, i) => {
        const details = [];
        if (entry.isCombo && entry.burgers) {
          entry.burgers.forEach((b) => {
            let s = b.nome;
            if (b.meatPoint) s += ` · ${b.meatPoint}`;
            if (b.removed?.length) s += ` · Sem: ${b.removed.join(", ")}`;
            if (b.added?.length)
              s += ` · Add: ${b.added.map((a) => a.nome).join(", ")}`;
            details.push(s);
          });
          if (entry.selectedBatata)
            details.push(`🍟 Batata: ${entry.selectedBatata}`);
          if (entry.selectedBebida)
            details.push(`🥤 Bebida: ${entry.selectedBebida}`);
        } else {
          if (entry.selectedSize) details.push(entry.selectedSize);
          if (entry.meatPoint) details.push(`Ponto: ${entry.meatPoint}`);
          if (entry.removed?.length)
            details.push(`Sem: ${entry.removed.join(", ")}`);
          if (entry.added?.length)
            details.push(`Add: ${entry.added.map((a) => a.nome).join(", ")}`);
          if (entry.obs) details.push(entry.obs);
        }
        return `
        <div class="no-cart-row">
          <div class="no-cart-info">
            <span class="no-cart-name">${entry.nome}</span>
            ${details.map((d) => `<span class="no-cart-detail">${d}</span>`).join("")}
          </div>
          <div class="no-cart-right">
            <span class="no-cart-price">${_fmt(entry.finalPrice)}</span>
            <button class="no-cart-del" onclick="_noRemove(${i})" title="Remover">✕</button>
          </div>
        </div>`;
      })
      .join("");
  }

  const taxaRow =
    taxa > 0
      ? `<div class="no-cart-taxa">Taxa de entrega: ${_fmt(taxa)}</div>`
      : "";

  // Catalogue
  let catHtml = "";
  Object.entries(State.menuData).forEach(([cat, items]) => {
    catHtml += `<div class="ai-category">
      <div class="ai-category-title">${_aiCategoryIcon(cat)} ${cat}</div>
      <div class="ai-items-grid">`;
    items.forEach((item, idx) => {
      const key = `${cat}:${item.nome}`;
      const avail = State.menuAvailability[key] !== false;
      if (item.opcoes?.length) {
        item.opcoes.forEach((op, oi) => {
          const price = item.precoBase?.[oi] || 0;
          const optKey = `${cat}:${item.nome}:${op}`;
          const ok = avail && State.menuAvailability[optKey] !== false;
          catHtml += `<button class="ai-item-btn${ok ? "" : " ai-unavailable"}"
            ${ok ? `onclick="_noAddFromCatalog('${cat}',${idx},'${op}',${price})"` : "disabled"}>
            <span class="ai-item-name">${item.nome}</span>
            <span class="ai-item-sub">${op}</span>
            <span class="ai-item-price">${ok ? _aiFormatPrice(price) : "Indisponível"}</span>
          </button>`;
        });
      } else {
        const price = Array.isArray(item.precoBase)
          ? item.precoBase[0]
          : item.precoBase || 0;
        catHtml += `<button class="ai-item-btn${avail ? "" : " ai-unavailable"}"
          ${avail ? `onclick="_noAddFromCatalog('${cat}',${idx},null,${price})"` : "disabled"}>
          <span class="ai-item-name">${item.nome}</span>
          <span class="ai-item-price">${avail ? _aiFormatPrice(price) : "Indisponível"}</span>
        </button>`;
      }
    });
    catHtml += `</div></div>`;
  });

  document.getElementById("no-body").innerHTML = `
    <div class="no-cart-box">
      <div class="no-section-title">🛒 Carrinho</div>
      <div class="no-cart-list">${cartHtml}</div>
      ${taxaRow}
      <div class="no-cart-total">TOTAL: ${_fmt(total)}</div>
    </div>
    <div class="no-catalog-box">
      <div class="no-section-title">➕ Adicionar Itens</div>
      ${catHtml}
    </div>`;

  document.getElementById("no-footer").innerHTML = `
    <div class="no-footer-row">
      <button class="btn-order" style="background:#333" onclick="_noBack()">← Dados</button>
      <button class="btn-order btn-accept" onclick="_noGoToPagto()"
        style="flex:2" ${_NO.cart.length === 0 ? "disabled" : ""}>
        💳 Pagamento → (${_fmt(total)})
      </button>
    </div>`;
}

window._noRemove = function (i) {
  _NO.cart.splice(i, 1);
  _noRenderCart();
};

window._noGoToPagto = function () {
  if (_NO.cart.length === 0) {
    showToast("⚠️ Carrinho vazio", "warning");
    return;
  }
  _NO.step = "pagto";
  _noRender();
};

// ── STEP 4 — Pagamento ────────────────────────────────────────────
function _noRenderPagto() {
  const isD = _NO.tipo === "delivery";
  const taxa = _NO.info.taxaEntrega || 0;
  const sub = _NO.cart.reduce((s, e) => s + (e.finalPrice || 0), 0);
  const total = sub + taxa;

  document.getElementById("no-title").textContent = "💳 Finalizar Pedido";

  const modoOpts = isD
    ? `<option value="🛵 ENTREGA">🛵 Entrega</option>
       <option value="🏪 RETIRADA">🏪 Retirada no Local</option>`
    : `<option value="🍽️ MESA">🍽️ Mesa</option>
       <option value="🥡 VIAGEM">🥡 Viagem</option>`;

  // Resumo do carrinho
  const resumo = _NO.cart
    .map(
      (e) =>
        `<div class="no-resumo-row">
      <span>${e.nome}${e.selectedSize ? " (" + e.selectedSize + ")" : ""}</span>
      <span>${_fmt(e.finalPrice)}</span>
    </div>`,
    )
    .join("");

  const taxaRow =
    taxa > 0
      ? `<div class="no-resumo-row no-resumo-taxa"><span>Taxa de entrega</span><span>${_fmt(taxa)}</span></div>`
      : "";

  document.getElementById("no-body").innerHTML = `
    <div class="no-resumo-box">
      <div class="no-section-title">📋 Resumo</div>
      ${resumo}
      ${taxaRow}
      <div class="no-resumo-total">TOTAL: ${_fmt(total)}</div>
    </div>
    <div class="no-form" style="margin-top:16px">
      <div class="no-field">
        <label class="no-label">Modo de Consumo</label>
        <select class="no-input" id="no-modo">${modoOpts}</select>
      </div>
      <div class="no-field">
        <label class="no-label">Pagamento</label>
        <select class="no-input" id="no-pag" onchange="_noOnPag()">
          <option value="Dinheiro">💵 Dinheiro</option>
          <option value="PIX">💠 PIX</option>
          <option value="Débito">💳 Débito</option>
          <option value="Crédito">💳 Crédito</option>
        </select>
      </div>
      <div class="no-field" id="no-troco-field" style="display:none">
        <label class="no-label">Troco para (R$)</label>
        <input class="no-input" id="no-troco" type="number" min="0" step="0.5" placeholder="Ex: 50.00">
      </div>
    </div>`;

  // Restore saved values
  if (_NO.info.modo) document.getElementById("no-modo").value = _NO.info.modo;
  if (_NO.info.pag) document.getElementById("no-pag").value = _NO.info.pag;
  if (_NO.info.troco)
    document.getElementById("no-troco").value = _NO.info.troco;
  _noOnPag();

  document.getElementById("no-footer").innerHTML = `
    <div class="no-footer-row">
      <button class="btn-order" style="background:#333" onclick="_noBack()">← Carrinho</button>
      <button class="btn-order btn-ready" onclick="_noFinalize()" style="flex:2">
        ✅ Criar Pedido — ${_fmt(total)}
      </button>
    </div>`;
}

// Called when user clicks an item in the catalogue panel
window._noAddFromCatalog = function (cat, idx, size, price) {
  // Set the special orderId so _aiAddItemToOrder redirects to us
  State.addItem.orderId = "__new_order__";
  // Open the existing add-item modal (it handles all customization steps)
  const addModal = document.getElementById("kds-add-item-modal");
  addModal.classList.add("show");
  // Don't show/hide overlay here – it's already shown by the new-order modal
  _aiSelectItem(cat, idx, size, price);
};

// Called by patched _aiAddItemToOrder when orderId === "__new_order__"
function _newOrderReceiveItem(newItem) {
  _NO.cart.push(newItem);
  // Close the add-item overlay (already patched to skip overlay removal)
  document.getElementById("kds-add-item-modal").classList.remove("show");
  // Reset orderId only after we've captured the item
  State.addItem.orderId = "__new_order__"; // keep it so next add still works
  showToast(`✅ ${newItem.nome} adicionado ao carrinho!`, "success");
  _noRenderCart();
}

// ── Finalizar pedido ──────────────────────────────────────────────
window._noFinalize = async function () {
  if (_NO.cart.length === 0) {
    showToast("⚠️ Carrinho vazio", "warning");
    return;
  }
  if (!State.database) {
    showToast("⚠️ Sem conexão", "error");
    return;
  }

  // Capture pagto step values
  _NO.info.modo =
    document.getElementById("no-modo")?.value || _NO.info.modo || "";
  _NO.info.pag =
    document.getElementById("no-pag")?.value || _NO.info.pag || "Dinheiro";
  _NO.info.troco =
    document.getElementById("no-troco")?.value || _NO.info.troco || "";

  // Build itens array in the same format app.js uses
  const itens = _NO.cart.map((entry) => {
    const obs = [];
    if (entry.isCombo && entry.burgers) {
      entry.burgers.forEach((b) => {
        obs.push(`---${b.nome}---`);
        if (b.meatPoint) obs.push(`Ponto: ${b.meatPoint}`);
        if (b.selectedCaldas?.length)
          obs.push(`Caldas: ${b.selectedCaldas.join(", ")}`);
        if (b.removed?.length) obs.push(`Sem: ${b.removed.join(", ")}`);
        if (b.added?.length)
          obs.push(`Adicionais: ${b.added.map((a) => a.nome).join(", ")}`);
        if (b.obs) obs.push(b.obs);
      });
      if (entry.selectedBatata) obs.push(`Batata: ${entry.selectedBatata}`);
      if (entry.selectedBebida) obs.push(`Bebida: ${entry.selectedBebida}`);
    } else {
      if (entry.selectedSize) obs.push(`Tamanho: ${entry.selectedSize}`);
      if (entry.meatPoint) obs.push(`Ponto: ${entry.meatPoint}`);
      if (entry.selectedCaldas?.length)
        obs.push(`Caldas: ${entry.selectedCaldas.join(", ")}`);
      if (entry.removed?.length) obs.push(`Sem: ${entry.removed.join(", ")}`);
      if (entry.added?.length)
        obs.push(`Adicionais: ${entry.added.map((a) => a.nome).join(", ")}`);
      if (entry.obs) obs.push(entry.obs);
    }

    const item = {
      nome: entry.nome,
      preco: entry.selectedPrice || 0,
      quantidade: 1,
      qtd: 1,
      observacao: obs.join(" | "),
      _kdsCreated: true,
    };
    if (entry.finalPrice) item._precoOriginal = entry.finalPrice;
    if (entry.meatPoint) item.ponto = entry.meatPoint;
    if (entry.removed?.length) item.retiradas = entry.removed;
    if (entry.added?.length)
      item.adicionais = entry.added.map((a) => ({
        nome: a.nome,
        preco: a.preco,
      }));
    return item;
  });

  const taxa = _NO.info.taxaEntrega || 0;
  const total = _NO.cart.reduce((s, e) => s + (e.finalPrice || 0), 0) + taxa;
  const isD = _NO.tipo === "delivery";

  const pedido = {
    tipo: isD ? "delivery" : "mesa",
    tipoOrigem: isD ? "delivery" : "mesa",
    status: "pending",
    nomeCliente: _NO.info.nome,
    cliente: _NO.info.nome,
    nome: _NO.info.nome,
    modoConsumo: _NO.info.modo,
    pagamento: _NO.info.pag,
    itens,
    total,
    timestamp: Date.now(),
    dataHora: new Date().toLocaleString("pt-BR"),
    _kdsCreated: true,
  };

  if (isD) {
    if (_NO.info.endereco) pedido.endereco = _NO.info.endereco;
    if (_NO.info.bairroT) pedido.bairro = _NO.info.bairroT;
    if (taxa > 0) pedido.taxaEntrega = taxa;
  }

  if (_NO.info.troco) {
    pedido.troco = `Troco para R$ ${_NO.info.troco}`;
  }

  try {
    const ref = State.database.ref("pedidos").push();
    await ref.set(pedido);
    showToast(`✅ Pedido criado para ${_NO.info.nome}!`, "success");
    newOrderClose();
  } catch (e) {
    console.error("Erro ao criar pedido:", e);
    showToast("Erro ao criar pedido", "error");
  }
};
