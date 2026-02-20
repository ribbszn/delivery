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
    
    .total {
      display: flex;
      justify-content: space-between;
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
    ponto: "",
    sem: [],
    adicionais: [],
    obs: [],
  };

  // Processar observação se existir
  if (obs) {
    const lines = obs
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      // Detectar ponto (^ garante que só reconhece se a linha COMEÇA com "Ponto:")
      if (line.match(/^ponto:/i)) {
        parsed.ponto = line.replace(/^ponto:/i, "").trim();
      }
      // Detectar retiradas (^ garante que só reconhece se a linha COMEÇA com "Sem:")
      else if (line.match(/^sem:/i)) {
        const items = line.replace(/^sem:/i, "").trim();
        parsed.sem = items.split(",").map((i) => i.trim());
      }
      // Detectar adicionais
      else if (line.match(/^adicionais?:/i)) {
        const items = line.replace(/^adicionais?:/i, "").trim();
        parsed.adicionais = items.split(",").map((i) => i.trim());
      }
      // Outras observações
      else if (!line.match(/^nome:/i)) {
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
        ? a.nome || JSON.stringify(a)
        : String(a),
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
          .map((i) => i.trim())
          .filter(Boolean);
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

      // Se for um combo, formatar cada sub-item
      if (parsed.isCombo) {
        let html = `<div class="order-item-combo">`;

        parsed.items.forEach((subItem) => {
          html += `<div class="order-item-block">`;
          html += `<div class="item-header">| --- ${subItem.name} --- |</div>`;

          if (subItem.ponto) {
            html += `<div class="item-detail"><strong>Ponto:</strong> ${subItem.ponto}</div>`;
          }

          if (subItem.sem.length > 0) {
            html += `<div class="item-detail item-detail--remove"><strong>Sem:</strong> ${subItem.sem.join(", ")}</div>`;
          }

          if (subItem.adicionais.length > 0) {
            html += `<div class="item-detail item-detail--add"><strong>➕ Adicionais:</strong> ${subItem.adicionais.join(", ")}</div>`;
          }

          if (subItem.obs.length > 0) {
            subItem.obs.forEach((o) => {
              html += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
            });
          }

          html += `</div>`;
        });

        // Batata e Bebida do combo — exibidos com destaque após os burgers
        if (parsed.batata) {
          html += `<div class="combo-upgrade combo-upgrade--batata">🍟 <strong>Batata:</strong> ${parsed.batata}</div>`;
        }
        if (parsed.bebida) {
          html += `<div class="combo-upgrade combo-upgrade--bebida">🥤 <strong>Bebida:</strong> ${parsed.bebida}</div>`;
        }

        html += `</div>`;
        return html;
      }

      // Item simples
      let html = `<div class="order-item-block">`;
      html += `<div class="item-header">${parsed.qty}x ${parsed.name}</div>`;

      if (parsed.ponto) {
        html += `<div class="item-detail"><strong>Ponto:</strong> ${parsed.ponto}</div>`;
      }

      if (parsed.sem.length > 0) {
        html += `<div class="item-detail"><strong>Sem:</strong> ${parsed.sem.join(", ")}</div>`;
      }

      if (parsed.adicionais.length > 0) {
        html += `<div class="item-detail"><strong>Adicionais:</strong> ${parsed.adicionais.join(", ")}</div>`;
      }

      if (parsed.obs.length > 0) {
        parsed.obs.forEach((o) => {
          html += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
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
  if (emptyState) {
    emptyState.remove();
  }

  let orderCard = document.getElementById(`order-${orderId}`);
  const isAccepted = State.acceptedOrders[orderId] === true;

  if (!orderCard) {
    orderCard = document.createElement("div");
    orderCard.className = `order-card ${isNew && !isAccepted ? "new-order pending-accept" : isAccepted ? "accepted" : ""}`;
    orderCard.id = `order-${orderId}`;
    container.appendChild(orderCard);

    if (isNew && !isAccepted) {
      startBeep(orderId);
    }
  }

  const time =
    order.dataHora || new Date(order.timestamp).toLocaleString("pt-BR");
  const cliente = order.cliente || order.nomeCliente || order.nome || "Cliente";

  const acceptButton = !isAccepted
    ? `<button class="btn-order btn-accept" onclick="acceptOrder('${orderId}')">
         ✅ Aceitar Pedido
       </button>`
    : "";

  // FORMATAÇÃO PADRÃO DELIVERY
  orderCard.innerHTML = `
    <div class="order-header">
      <span class="order-number">#${orderId.slice(-6).toUpperCase()}</span>
      <span class="order-time">${time}</span>
    </div>
    
    <div class="order-customer">
      👤 ${cliente}
    </div>
    
    ${getItemsSummary(order.itens || [])}
    
    <div class="order-items-detailed">
      ${formatOrderItemsForCard(order.itens || [])}
    </div>
    
    <div class="order-details">
      ${order.modoConsumo ? `<div class="order-detail-row"><span>🍽️ Modo:</span><span>${order.modoConsumo}</span></div>` : ""}
      ${order.endereco ? `<div class="order-detail-row"><span>📍 Endereço:</span><span>${order.endereco}</span></div>` : ""}
      ${order.bairro ? `<div class="order-detail-row"><span>🏘️ Bairro:</span><span>${order.bairro}</span></div>` : ""}
      ${order.taxaEntrega ? `<div class="order-detail-row"><span>🛵 Taxa:</span><span>${formatPrice(order.taxaEntrega)}</span></div>` : ""}
      ${order.pagamento ? `<div class="order-detail-row"><span>💳 Pagamento:</span><span>${formatPayment(order.pagamento)}</span></div>` : ""}
      ${order.troco ? `<div class="order-detail-row"><span>💵 Troco:</span><span>${order.troco}</span></div>` : ""}
      <div class="order-total">Total: ${formatPrice(order.total || 0)}</div>
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

    updateInProgressWidget();
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

  let printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pedido Cozinha - #${orderId.slice(-6).toUpperCase()}</title>
      <style>
        ${getPrintStyles("kitchen")}
      </style>
    </head>
    <body>
      <div class="header">
        🔥 RIBBS ZN - COZINHA 🔥
        <div class="order-number">#${orderId.slice(-6).toUpperCase()}</div>
        <div>${order.dataHora || new Date().toLocaleString("pt-BR")}</div>
      </div>

      <div class="section">
        <div class="section-title">👤 ${cliente}</div>
      </div>

      ${
        order.modoConsumo
          ? `
      <div class="section">
        <div class="section-title">🍽️ Modo: ${order.modoConsumo}</div>
      </div>
      `
          : ""
      }

      <div class="section">
        <div class="section-title">📋 ITENS DO PEDIDO</div>
  `;

  if (order.itens && order.itens.length > 0) {
    order.itens.forEach((item) => {
      const parsed = parseOrderItem(item);

      // Se for combo, processar cada sub-item
      if (parsed.isCombo) {
        parsed.items.forEach((subItem) => {
          printContent += `<div class="item-header">| --- ${subItem.name} --- |</div>`;

          if (subItem.ponto) {
            printContent += `<div class="item-detail"><strong>Ponto:</strong> ${subItem.ponto}</div>`;
          }

          if (subItem.sem.length > 0) {
            printContent += `<div class="item-detail"><strong>Sem:</strong> ${subItem.sem.join(", ")}</div>`;
          }

          if (subItem.adicionais.length > 0) {
            printContent += `<div class="item-detail"><strong>Adicionais:</strong> ${subItem.adicionais.join(", ")}</div>`;
          }

          if (subItem.obs.length > 0) {
            subItem.obs.forEach((o) => {
              printContent += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
            });
          }
        });

        // Batata e Bebida do combo
        if (parsed.batata) {
          printContent += `<div class="item-detail"><strong>🍟 Batata:</strong> ${parsed.batata}</div>`;
        }
        if (parsed.bebida) {
          printContent += `<div class="item-detail"><strong>🥤 Bebida:</strong> ${parsed.bebida}</div>`;
        }
      } else {
        // Item simples
        printContent += `<div class="item-header">${parsed.qty}x ${parsed.name}</div>`;

        if (parsed.ponto) {
          printContent += `<div class="item-detail"><strong>Ponto:</strong> ${parsed.ponto}</div>`;
        }

        if (parsed.sem.length > 0) {
          printContent += `<div class="item-detail"><strong>Sem:</strong> ${parsed.sem.join(", ")}</div>`;
        }

        if (parsed.adicionais.length > 0) {
          printContent += `<div class="item-detail"><strong>Adicionais:</strong> ${parsed.adicionais.join(", ")}</div>`;
        }

        if (parsed.obs.length > 0) {
          parsed.obs.forEach((o) => {
            printContent += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
          });
        }
      }
    });
  }

  printContent += `
      </div>

      <div class="footer">
        ═══════════════════════<br>
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

  showToast("🖨️ Imprimindo pedido para cozinha", "success");
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

  // Gerar resumo
  const summary = (order.itens || [])
    .map((item) => {
      const qty = item.quantidade || item.qtd || 1;
      const name = item.nome || "Item";
      return `${qty}x ${name}`;
    })
    .join(" + ");

  let printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Comprovante - #${orderId.slice(-6).toUpperCase()}</title>
      <style>
        ${getPrintStyles("customer")}
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">🔥 RIBBS ZN 🔥</div>
        <div>Comprovante de Pedido</div>
        <div class="order-number">#${orderId.slice(-6).toUpperCase()}</div>
        <div>${order.dataHora || new Date().toLocaleString("pt-BR")}</div>
      </div>

      <div class="section">
        <div class="section-title">👤 ${cliente}</div>
        <div>${summary}</div>
      </div>

      <div class="section">
  `;

  if (order.itens && order.itens.length > 0) {
    order.itens.forEach((item) => {
      const parsed = parseOrderItem(item);

      // Se for combo, processar cada sub-item
      if (parsed.isCombo) {
        parsed.items.forEach((subItem) => {
          printContent += `<div class="item-header">| --- ${subItem.name} --- |</div>`;

          if (subItem.ponto) {
            printContent += `<div class="item-detail"><strong>Ponto:</strong> ${subItem.ponto}</div>`;
          }

          if (subItem.sem.length > 0) {
            printContent += `<div class="item-detail"><strong>Sem:</strong> ${subItem.sem.join(", ")}</div>`;
          }

          if (subItem.adicionais.length > 0) {
            printContent += `<div class="item-detail"><strong>Adicionais:</strong> ${subItem.adicionais.join(", ")}</div>`;
          }

          if (subItem.obs.length > 0) {
            subItem.obs.forEach((o) => {
              printContent += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
            });
          }
        });

        // Batata e Bebida do combo
        if (parsed.batata) {
          printContent += `<div class="item-detail"><strong>🍟 Batata:</strong> ${parsed.batata}</div>`;
        }
        if (parsed.bebida) {
          printContent += `<div class="item-detail"><strong>🥤 Bebida:</strong> ${parsed.bebida}</div>`;
        }
      } else {
        // Item simples
        printContent += `<div class="item-header">${parsed.qty}x ${parsed.name}</div>`;

        if (parsed.ponto) {
          printContent += `<div class="item-detail"><strong>Ponto:</strong> ${parsed.ponto}</div>`;
        }

        if (parsed.sem.length > 0) {
          printContent += `<div class="item-detail"><strong>Sem:</strong> ${parsed.sem.join(", ")}</div>`;
        }

        if (parsed.adicionais.length > 0) {
          printContent += `<div class="item-detail"><strong>Adicionais:</strong> ${parsed.adicionais.join(", ")}</div>`;
        }

        if (parsed.obs.length > 0) {
          parsed.obs.forEach((o) => {
            printContent += `<div class="item-detail"><strong>Obs:</strong> ${o}</div>`;
          });
        }
      }
    });
  }

  printContent += `
      </div>

      <div class="section">
        ${order.modoConsumo ? `<div><strong>🍽️ Modo:</strong> ${order.modoConsumo}</div>` : ""}
        ${order.endereco ? `<div><strong>📍 Endereço:</strong> ${order.endereco}</div>` : ""}
        ${order.pagamento ? `<div><strong>💳 Pagamento:</strong> ${order.pagamento}</div>` : ""}
      </div>

      <div class="total-section">
        <div class="total">
          <span>TOTAL:</span>
          <span>${formatPrice(order.total || 0)}</span>
        </div>
      </div>

      <div class="footer">
        ═══════════════════════<br>
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

  showToast("🧾 Imprimindo comprovante para cliente", "success");
}

// ================================
// BEEP CONTROL
// ================================
function startBeep(orderId) {
  if (!State.soundEnabled) return;

  stopBeep(orderId);

  const beepAudio = document.getElementById("beep-sound");

  beepAudio.currentTime = 0;
  beepAudio.play().catch((error) => {
    console.log("Não foi possível reproduzir beep:", error);
  });

  State.beepIntervals[orderId] = beepAudio;
}

function stopBeep(orderId) {
  if (!State.beepIntervals[orderId]) return;

  delete State.beepIntervals[orderId];

  // Só pausa o áudio se não houver mais nenhum pedido aguardando beep
  if (Object.keys(State.beepIntervals).length === 0) {
    const beepAudio = document.getElementById("beep-sound");
    beepAudio.pause();
    beepAudio.currentTime = 0;
  }
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
              ${sub.adicionais.length ? `<div class="hc-detail-row"><span class="hc-tag add">+</span>${sub.adicionais.join(", ")}</div>` : ""}
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
            ${parsed.adicionais.length ? `<div class="hc-detail-row"><span class="hc-tag add">+</span>${parsed.adicionais.join(", ")}</div>` : ""}
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
                `<div class="in-progress-mod in-progress-mod-add">➕ ${subItem.adicionais.join(", ")}</div>`,
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
          `<div class="in-progress-mod in-progress-mod-add">➕ ${parsed.adicionais.join(", ")}</div>`,
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
      document.querySelectorAll(".modal, .sidebar, .overlay").forEach((el) => {
        el.classList.remove("show");
      });
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
  const paidExtras = new Set();

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
          if (typeof add === "object" && add.nome) {
            paidExtras.add(JSON.stringify(add));
          }
        });
      }

      if (item.paidExtras) {
        item.paidExtras.forEach((extra) => {
          if (extra.nome) {
            paidExtras.add(JSON.stringify(extra));
          }
        });
      }
    });
  });

  const paidExtrasArray = Array.from(paidExtras).map((str) => JSON.parse(str));

  return {
    ingredients: Array.from(ingredients).sort(),
    paidExtras: paidExtrasArray.sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}

async function loadIngredientsData() {
  if (!State.menuData) {
    // Só busca os dados sem renderizar o modal de cardápio
    try {
      const response = await fetch(CONFIG.menuDataUrl);
      State.menuData = await response.json();
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
                  <div class="ingredient-price">+ R$ ${extra.preco.toFixed(2)}</div>
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
