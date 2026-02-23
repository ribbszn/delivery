// ================================
// WELCOME MODAL
// ================================
const WelcomeModal = {
  init() {
    const modal = document.getElementById("welcome-modal");
    const closeBtn = document.getElementById("btn-welcome-close");

    // SEMPRE mostrar o modal ao abrir o site
    modal.classList.remove("hidden");
    // Bloquear scroll do body
    document.body.style.overflow = "hidden";

    // Fechar modal ao clicar no botão
    closeBtn.addEventListener("click", () => {
      // Adicionar classe de animação de saída
      modal.classList.add("closing");

      // Aguardar a animação terminar antes de esconder
      setTimeout(() => {
        modal.classList.add("hidden");
        modal.classList.remove("closing");
        document.body.style.overflow = "auto";
      }, 800); // Tempo da animação (0.8s)
    });
  },
};

// ================================
// CONFIGURATION
// ================================
const CONFIG = {
  whatsappNumber: "5581996469626",
  menuDataUrl: "cardapio.json",
  firebaseConfig: {
    apiKey: "AIzaSyDFFbaZmX80QezLfozPAIaIGEhIJm9z43E",
    authDomain: "ribbsznmesas.firebaseapp.com",
    databaseURL: "https://ribbsznmesas-default-rtdb.firebaseio.com",
    projectId: "ribbsznmesas",
    storageBucket: "ribbsznmesas.firebasestorage.app",
    messagingSenderId: "970185571294",
    appId: "1:970185571294:web:25e8552bd72d852283bb4f",
  },
};

// ================================
// FIREBASE INITIALIZATION
// ================================
let database = null;

async function initFirebase() {
  try {
    if (typeof firebase === "undefined") {
      console.warn(
        "⚠️ Firebase não carregado - pedidos não serão enviados ao KDS",
      );
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(CONFIG.firebaseConfig);
    }

    database = firebase.database();

    // Reenviar fila offline automaticamente quando a conexão voltar
    database.ref(".info/connected").on("value", (snap) => {
      if (snap.val() === true) {
        console.log("🌐 Firebase reconectado — verificando fila offline...");
        setTimeout(() => OrderSender._flushOfflineQueue(), 1000);
      }
    });

    // FIX: As regras do Firebase exigem auth != null para criar pedidos.
    // Usamos autenticação anônima no app de delivery/cliente.
    const auth = firebase.auth();
    if (!auth.currentUser) {
      try {
        await auth.signInAnonymously();
        console.log("✅ Autenticação anônima realizada");
      } catch (authError) {
        console.warn("⚠️ Autenticação anônima falhou:", authError.message);
        // Continua mesmo assim — pedidos via WhatsApp ainda funcionam.
      }
    }

    console.log("✅ Firebase inicializado");
  } catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
  }
}

// ================================
// STATE MANAGEMENT
// ================================
const AppState = {
  cardapioData: null,
  cart: [],
  deliveryType: "pickup",
  deliveryFee: 0,
  selectedNeighborhood: null,

  // Disponibilidade de insumos
  ingredientsAvailability: {},
  paidExtrasAvailability: {},
  menuAvailability: {}, // NOVO: Disponibilidade de itens do menu

  // Controle de combos
  isCombo: false,
  isFullCombo: false, // true para Combos com batata+bebida
  comboData: null,
  currentBurgerIndex: 0,
  comboItems: [],
  isProcessingUpgrades: false, // ✅ NOVO: Flag para indicar que estamos processando upgrades

  // Controle de steps
  currentStep: 0,
  stepsData: [],
  tempItem: {},
};

// ================================
// UTILITY FUNCTIONS
// ================================
const Utils = {
  sanitizeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  formatPrice(value) {
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  },

  getExtras(item) {
    return item.paidExtras || item.adicionais || item.extras || [];
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },
};

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ================================
// DOM HELPERS
// ================================
const DOM = {
  get(selector) {
    return document.querySelector(selector);
  },

  getAll(selector) {
    return document.querySelectorAll(selector);
  },

  create(tag, className, attributes = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  },

  elements: {
    get menuContainer() {
      return DOM.get("[data-menu-container]");
    },
    get searchInput() {
      return DOM.get("[data-search-input]");
    },
    get categoriesContainer() {
      return DOM.get("[data-categories-container]");
    },
    get modal() {
      return DOM.get("[data-modal]");
    },
    get modalTitle() {
      return DOM.get("[data-modal-title]");
    },
    get modalBody() {
      return DOM.get("[data-modal-body]");
    },
    get progressDots() {
      return DOM.get("[data-progress-dots]");
    },
    get btnBack() {
      return DOM.get("[data-btn-back]");
    },
    get btnNext() {
      return DOM.get("[data-btn-next]");
    },
    get sidebar() {
      return DOM.get("[data-sidebar]");
    },
    get cartItems() {
      return DOM.get("[data-cart-items]");
    },
    get totalCart() {
      return DOM.get("[data-total-cart]");
    },
    get cartCount() {
      return DOM.get("[data-cart-count]");
    },
    get overlay() {
      return DOM.get("[data-overlay]");
    },
    get checkoutForm() {
      return DOM.get("[data-checkout-form]");
    },
    get deliveryFields() {
      return DOM.get("[data-delivery-fields]");
    },
    get changeField() {
      return DOM.get("[data-change-field]");
    },
  },
};

// ================================
// API SERVICE
// ================================
const MenuService = {
  async loadMenu() {
    try {
      const response = await fetch(CONFIG.menuDataUrl);
      if (!response.ok) throw new Error("Erro ao carregar cardápio");
      return await response.json();
    } catch (error) {
      console.error("Erro ao carregar cardápio:", error);
      throw error;
    }
  },

  async checkAvailability(category, itemName) {
    // Usar formato do KDS: categoria:nome
    const itemKey = `${category}:${itemName}`;

    // Primeiro verificar no estado local (mais rápido)
    if (AppState.menuAvailability.hasOwnProperty(itemKey)) {
      return AppState.menuAvailability[itemKey] !== false;
    }

    // Se não estiver no estado, buscar do Firebase
    if (!database) return true;

    try {
      const snapshot = await database
        .ref(`menuAvailability/${itemKey}`)
        .once("value");
      const isAvailable = snapshot.val();

      // Salvar no estado para próxima vez
      AppState.menuAvailability[itemKey] = isAvailable;

      return isAvailable !== false;
    } catch (error) {
      console.error("Erro ao verificar disponibilidade:", error);
      return true;
    }
  },

  listenToAvailability() {
    if (!database) return;

    database.ref("menuAvailability").on("value", (snapshot) => {
      console.log("🔄 Disponibilidade de menu atualizada");
      AppState.menuAvailability = snapshot.val() || {};

      // Remover itens indisponíveis do carrinho
      CartManager.checkAndRemoveUnavailableItems();

      // FIX: Re-renderizar o menu completo para garantir que todos os cards,
      // botões e event listeners reflitam o estado correto de disponibilidade.
      // A abordagem anterior de patch cirúrgico no DOM não re-adicionava
      // os event listeners de clique e não restaurava o innerHTML dos botões.
      if (AppState.cardapioData) {
        MenuUI.render(AppState.cardapioData);
      }

      console.log(
        "✅ Menu re-renderizado com disponibilidade:",
        AppState.menuAvailability,
      );
    });
  },

  // Carregar disponibilidade de ingredientes e adicionais
  listenToIngredientsAvailability() {
    if (!database) return;

    // Listener para ingredientes
    database.ref("ingredientsAvailability").on("value", (snapshot) => {
      AppState.ingredientsAvailability = snapshot.val() || {};
      console.log("📦 Disponibilidade de ingredientes atualizada");
    });

    // Listener para adicionais pagos
    database.ref("paidExtrasAvailability").on("value", (snapshot) => {
      AppState.paidExtrasAvailability = snapshot.val() || {};
      console.log("💰 Disponibilidade de adicionais pagos atualizada");

      // Se o modal de personalização estiver aberto num step de extras,
      // remove imediatamente adicionais bloqueados pelo KDS da tela do cliente.
      const modal = DOM.elements.modal;
      if (modal && modal.classList.contains("active")) {
        const step = AppState.stepsData[AppState.currentStep];
        if (step && step.type === "extras") {
          // Limpa do tempItem.added qualquer adicional que ficou indisponível
          // (pode ter sido selecionado antes do KDS bloquear)
          if (AppState.tempItem.added && AppState.tempItem.added.length > 0) {
            AppState.tempItem.added = AppState.tempItem.added.filter(
              (a) => AppState.paidExtrasAvailability[a.nome] !== false,
            );
          }
          // Re-renderiza o step com a lista filtrada de disponíveis
          const availableNow = step.data.filter(
            (e) => AppState.paidExtrasAvailability[e.nome] !== false,
          );
          OrderFlow.renderExtras(
            DOM.elements.modalTitle,
            DOM.elements.modalBody,
            availableNow,
            step.burgerName,
          );
        }
      }

      // Re-renderiza o menu para refletir a nova disponibilidade de adicionais
      // (os steps são reconstruídos na próxima abertura do modal, filtrando corretamente)
      if (AppState.cardapioData) {
        MenuUI.render(AppState.cardapioData);
      }
    });
  },

  // ================================
  // PRICE SYNC FROM FIREBASE - NEW ADDITION
  // ================================
  listenToPriceChanges() {
    if (!database) return;

    database.ref("cardapio").on("value", (snapshot) => {
      const firebaseMenu = snapshot.val();
      if (!firebaseMenu || !AppState.cardapioData) return;

      let pricesUpdated = false;

      // Atualizar preços do cardápio local com os preços do Firebase
      Object.entries(firebaseMenu).forEach(([category, items]) => {
        if (AppState.cardapioData[category]) {
          items.forEach((firebaseItem, index) => {
            const localItem = AppState.cardapioData[category][index];
            if (localItem && firebaseItem.precoBase !== undefined) {
              // Verificar se o preço realmente mudou
              const oldPrice = JSON.stringify(localItem.precoBase);
              const newPrice = JSON.stringify(firebaseItem.precoBase);

              if (oldPrice !== newPrice) {
                localItem.precoBase = firebaseItem.precoBase;
                pricesUpdated = true;
                console.log(
                  `💰 Preço atualizado: ${localItem.nome} = ${Array.isArray(firebaseItem.precoBase) ? firebaseItem.precoBase.join(", ") : firebaseItem.precoBase}`,
                );
              }
            }
          });
        }
      });

      // Re-renderizar o menu com os novos preços apenas se houve mudança
      if (pricesUpdated && AppState.cardapioData) {
        MenuUI.render(AppState.cardapioData);
        showToast("💰 Preços atualizados!");
      }
    });
  },

  async syncPricesFromFirebase() {
    if (!database) return;

    try {
      const snapshot = await database.ref("cardapio").once("value");
      const firebaseMenu = snapshot.val();

      if (!firebaseMenu || !AppState.cardapioData) return;

      // Atualizar preços do cardápio local
      Object.entries(firebaseMenu).forEach(([category, items]) => {
        if (AppState.cardapioData[category]) {
          items.forEach((firebaseItem, index) => {
            const localItem = AppState.cardapioData[category][index];
            if (localItem && firebaseItem.precoBase !== undefined) {
              localItem.precoBase = firebaseItem.precoBase;
            }
          });
        }
      });

      console.log("✅ Preços sincronizados do Firebase");
    } catch (error) {
      console.error("❌ Erro ao sincronizar preços:", error);
    }
  },
};

// ================================
// CART MANAGER
// ================================
const CartManager = {
  add(item) {
    // ✅ VALIDAÇÃO: Verificar se o item está disponível
    if (item.categoria && item.nome) {
      const itemKey = `${item.categoria}:${item.nome}`;

      if (AppState.menuAvailability[itemKey] === false) {
        showToast("❌ Item indisponível no momento");
        console.warn("⚠️ Tentativa de adicionar item indisponível:", item.nome);
        return;
      }
    }

    const existingItemIndex = AppState.cart.findIndex(
      (cartItem) =>
        cartItem.nome === item.nome &&
        cartItem.selectedSize === item.selectedSize &&
        JSON.stringify(cartItem.selectedCaldas) ===
          JSON.stringify(item.selectedCaldas) &&
        JSON.stringify(cartItem.removed) === JSON.stringify(item.removed),
    );

    if (existingItemIndex > -1) {
      AppState.cart[existingItemIndex].quantity =
        (AppState.cart[existingItemIndex].quantity || 1) + 1;
    } else {
      AppState.cart.push({ ...item, quantity: 1 });
    }

    showToast(`✅ ${item.nome} adicionado ao carrinho`);
    this.update();
  },

  updateQuantity(index, change) {
    const item = AppState.cart[index];
    if (!item) return;

    // ✅ VALIDAÇÃO: Se está aumentando, verificar disponibilidade
    if (change > 0 && item.categoria && item.nome) {
      const itemKey = `${item.categoria}:${item.nome}`;

      if (AppState.menuAvailability[itemKey] === false) {
        showToast("❌ Item indisponível no momento");
        console.warn("⚠️ Item ficou indisponível:", item.nome);
        // Remove o item do carrinho se ficou indisponível
        this.remove(index);
        return;
      }
    }

    item.quantity = (item.quantity || 1) + change;

    if (item.quantity < 1) {
      this.remove(index);
    } else {
      this.update();
    }
  },

  remove(index) {
    AppState.cart.splice(index, 1);
    this.update();
  },

  clear() {
    AppState.cart = [];
    this.update();
  },

  getTotal() {
    const cartTotal = AppState.cart.reduce((sum, item) => {
      const quantity = item.quantity || 1;
      return sum + item.finalPrice * quantity;
    }, 0);

    // Adiciona taxa de entrega se for delivery e não for Campo Grande
    const deliveryFee =
      AppState.deliveryType === "delivery" &&
      AppState.selectedNeighborhood?.value !== "campo-grande"
        ? AppState.deliveryFee
        : 0;

    return cartTotal + deliveryFee;
  },

  update() {
    CartUI.render();
  },

  // ✅ Verificar e remover itens indisponíveis do carrinho
  checkAndRemoveUnavailableItems() {
    let removedItems = [];

    AppState.cart = AppState.cart.filter((item) => {
      if (item.categoria && item.nome) {
        const itemKey = `${item.categoria}:${item.nome}`;

        if (AppState.menuAvailability[itemKey] === false) {
          removedItems.push(item.nome);
          return false; // Remove do carrinho
        }
      }
      return true; // Mantém no carrinho
    });

    // Notificar usuário se algum item foi removido
    if (removedItems.length > 0) {
      const itemsList = removedItems.join(", ");
      showToast(`⚠️ Itens removidos do carrinho (indisponíveis): ${itemsList}`);
      this.update();
    }
  },
};

// ================================
// CATEGORIES UI
// ================================
const CategoriesUI = {
  render(categories) {
    const container = DOM.elements.categoriesContainer;
    container.innerHTML = "";

    categories.forEach((category) => {
      const btn = DOM.create("button", "category-btn", {
        "data-category": category,
      });
      btn.textContent = category;
      btn.addEventListener("click", () => this.scrollToCategory(category));
      container.appendChild(btn);
    });

    setTimeout(() => {
      const firstBtn = container.querySelector(".category-btn");
      if (firstBtn) firstBtn.classList.add("active");
    }, 100);
  },

  scrollToCategory(categoryName) {
    const section = DOM.get(`[data-category-section="${categoryName}"]`);
    const carousel = DOM.get(".categories-carousel");
    const btn = DOM.get(`.category-btn[data-category="${categoryName}"]`);

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    DOM.getAll(".category-btn").forEach((b) => b.classList.remove("active"));
    if (btn) {
      btn.classList.add("active");

      const scrollPosition =
        btn.offsetLeft - carousel.offsetWidth / 2 + btn.offsetWidth / 2;
      carousel.scrollTo({ left: scrollPosition, behavior: "smooth" });
    }
  },

  updateActiveOnScroll: Utils.debounce(() => {
    const sections = DOM.getAll(".category-section");
    const scrollPos = window.scrollY + 250;

    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionBottom = sectionTop + section.offsetHeight;
      const categoryName = section.getAttribute("data-category-section");
      const btn = DOM.get(`.category-btn[data-category="${categoryName}"]`);

      if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
        DOM.getAll(".category-btn").forEach((b) =>
          b.classList.remove("active"),
        );
        if (btn) btn.classList.add("active");
      }
    });
  }, 100),
};

// ================================
// MENU UI
// ================================
const MenuUI = {
  render(data) {
    const container = DOM.elements.menuContainer;
    container.innerHTML = "";

    Object.entries(data).forEach(([category, items]) => {
      const section = this.createCategorySection(category, items);
      container.appendChild(section);
    });
  },

  createCategorySection(category, items) {
    const section = DOM.create("section", "category-section", {
      "data-category-section": category,
    });

    const title = DOM.create("h2", "category-title");
    title.textContent = category;
    section.appendChild(title);

    const grid = DOM.create("div", "grid");
    items.forEach((item) => {
      const card = this.createProductCard(item, category);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  },

  createProductCard(item, category) {
    const card = DOM.create("div", "card");
    card.dataset.category = category;
    card.dataset.itemName = item.nome;

    const img = DOM.create("img");
    img.src = item.img || this.getPlaceholderImage();
    img.onerror = () => (img.src = this.getPlaceholderImage());

    const info = DOM.create("div", "info");

    const textDiv = DOM.create("div");
    const h3 = DOM.create("h3");
    h3.textContent = item.nome;
    const p = DOM.create("p");
    p.textContent = item.descricao || "";

    textDiv.appendChild(h3);
    textDiv.appendChild(p);

    const optionsContainer = DOM.create("div", "options-container");

    // FIX: Verificar disponibilidade do item PRINCIPAL de forma SÍNCRONA,
    // usando o estado já carregado antes do render.
    const itemKey = `${category}:${item.nome}`;
    const isItemAvailable = AppState.menuAvailability[itemKey] !== false;

    if (item.opcoes && Array.isArray(item.opcoes)) {
      item.opcoes.forEach((size, index) => {
        const price =
          item.precoBase && item.precoBase[index] ? item.precoBase[index] : 0;

        const btn = DOM.create("button", "opt-btn");

        // Verificar disponibilidade da opção específica
        const optionKey = `${category}:${item.nome}:${size}`;
        const isOptionAvailable =
          isItemAvailable && AppState.menuAvailability[optionKey] !== false;

        if (!isOptionAvailable) {
          btn.disabled = true;
          btn.style.opacity = "0.5";
          btn.style.cursor = "not-allowed";
          btn.style.background = "#666";
          btn.innerHTML = `${size}<span class="price-tag">Indisponível</span>`;
        } else {
          btn.innerHTML = `${size}<span class="price-tag">${Utils.formatPrice(price)}</span>`;
          btn.addEventListener("click", () =>
            OrderFlow.start(item, category, size, price),
          );
        }

        optionsContainer.appendChild(btn);
      });
    }

    info.appendChild(textDiv);
    info.appendChild(optionsContainer);

    // FIX: Aplicar estado de indisponibilidade do item PRINCIPAL de forma SÍNCRONA.
    if (!isItemAvailable) {
      card.classList.add("unavailable");
      card.style.opacity = "0.5";
      card.style.pointerEvents = "none";
      card.style.filter = "grayscale(80%)";

      const unavailableTag = DOM.create("div", "unavailable-tag");
      unavailableTag.textContent = "⚠️ Indisponível";
      unavailableTag.style.cssText = `
        color: #f44336;
        font-weight: bold;
        font-size: 0.85rem;
        margin-top: 8px;
        background: rgba(244,67,54,0.1);
        padding: 4px 10px;
        border-radius: 5px;
        border: 1px solid #f44336;
      `;
      info.appendChild(unavailableTag);
    }

    card.appendChild(img);
    card.appendChild(info);

    return card;
  },

  getPlaceholderImage() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23333' width='100' height='100'/%3E%3Ctext fill='%23666' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-family='Arial' font-size='14'%3ESem imagem%3C/text%3E%3C/svg%3E";
  },

  renderError() {
    const container = DOM.elements.menuContainer;
    container.innerHTML = `
      <div class="error-message">
        <h3>Erro ao carregar o cardápio 😕</h3>
        <p>Não foi possível carregar os itens. Tente novamente.</p>
        <button onclick="location.reload()">Recarregar Página</button>
      </div>
    `;
  },
};

// ================================
// ORDER FLOW - GERENCIADOR PRINCIPAL
// ================================
const OrderFlow = {
  start(item, category, selectedSize, selectedPrice) {
    // ✅ VALIDAÇÃO: Verificar disponibilidade antes de iniciar o fluxo
    const itemKey = `${category}:${item.nome}`;

    if (AppState.menuAvailability[itemKey] === false) {
      showToast("❌ Este item está indisponível no momento");
      console.warn("⚠️ Tentativa de pedir item indisponível:", item.nome);
      return;
    }

    // ✅ Se tem uma opção selecionada, verificar disponibilidade da opção também
    if (selectedSize && selectedSize !== item.nome) {
      const optionKey = `${category}:${item.nome}:${selectedSize}`;
      console.log(
        `🔍 Verificando opção selecionada: ${optionKey} = ${AppState.menuAvailability[optionKey]}`,
      );

      if (AppState.menuAvailability[optionKey] === false) {
        showToast(`❌ A opção "${selectedSize}" está indisponível no momento`);
        console.warn("⚠️ Tentativa de pedir opção indisponível:", selectedSize);
        return;
      }
    }

    // Combos COMPLETOS (burger + batata + bebida) - Categoria "Combos"
    if (item.combo && category === "Combos" && item.upgrades) {
      this.startFullCombo(item, category, selectedSize, selectedPrice);
    }
    // Combos SIMPLES (apenas burgers) - Promoções e Clones
    else if (item.combo && item.burgers && item.burgers.length > 0) {
      this.startSimpleCombo(item, category, selectedSize, selectedPrice);
    }
    // Item único
    else {
      this.startSingleItem(item, category, selectedSize, selectedPrice);
    }
  },

  // Item único (Artesanais, Batata, Bebidas, etc)
  startSingleItem(item, category, selectedSize, selectedPrice) {
    AppState.isCombo = false;
    AppState.isFullCombo = false;
    AppState.tempItem = {
      nome: item.nome,
      img: item.img,
      categoria: category,
      selectedSize,
      selectedPrice,
      opcoes: item.opcoes,
      meatPoint: null,
      selectedCaldas: [],
      removed: [],
      added: [],
      obs: "",
      finalPrice: selectedPrice,
    };

    AppState.stepsData = this.buildStepsForItem(item, selectedSize);
    AppState.currentStep = 0;

    if (AppState.stepsData.length === 0) {
      CartManager.add(AppState.tempItem);
      return;
    }

    ModalUI.open();
    this.renderCurrentStep();
  },

  // Combo SIMPLES (apenas burgers) - Promoções e Clones
  startSimpleCombo(item, category, selectedSize, selectedPrice) {
    AppState.isCombo = true;
    AppState.isFullCombo = false;
    AppState.comboData = {
      nomeCombo: item.nome,
      categoria: category,
      selectedSize,
      basePrice: selectedPrice,
      itemRef: item,
    };
    AppState.currentBurgerIndex = 0;
    AppState.comboItems = [];

    this.startNextBurgerInCombo();
  },

  // Combo COMPLETO (burger + batata + bebida) - Categoria "Combos"
  startFullCombo(item, category, selectedSize, selectedPrice) {
    AppState.isCombo = true;
    AppState.isFullCombo = true;
    AppState.comboData = {
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
    AppState.currentBurgerIndex = 0;
    AppState.comboItems = [];

    this.startNextBurgerInCombo();
  },

  // Personalização do próximo burger do combo
  startNextBurgerInCombo() {
    const { burgers } = AppState.comboData.itemRef;
    const burgerName = burgers[AppState.currentBurgerIndex];

    const ingredients = this.getIngredientsForBurger(
      AppState.comboData.itemRef,
      burgerName,
    );

    AppState.tempItem = {
      nome: burgerName,
      isPartOfCombo: true,
      comboName: AppState.comboData.nomeCombo,
      meatPoint: null,
      selectedCaldas: [],
      removed: [],
      added: [],
      obs: "",
      finalPrice: 0,
    };

    AppState.stepsData = this.buildStepsForBurger(
      AppState.comboData.itemRef,
      burgerName,
      ingredients,
    );
    AppState.currentStep = 0;

    ModalUI.open();
    this.renderCurrentStep();
  },

  getIngredientsForBurger(item, burgerName) {
    const lowerName = burgerName.toLowerCase();

    if (lowerName.includes("simples")) {
      return item.simplesIngredients || item.ingredientesPadrao || [];
    } else if (lowerName.includes("duplo")) {
      // FIX: fallback para DuploIngredients com D maiúsculo (inconsistência no JSON)
      return (
        item.duploIngredients ||
        item.DuploIngredients ||
        item.ingredientesPadrao ||
        []
      );
    } else if (lowerName.includes("triplo")) {
      return item.triploIngredients || item.ingredientesPadrao || [];
    } else if (lowerName.includes("cremoso")) {
      return item.PromoIngredients || item.ingredientesPadrao || [];
    } else if (lowerName.includes("calabreso")) {
      return item.duploIngredients || item.ingredientesPadrao || [];
    }

    return (
      item.ingredientesPadrao ||
      item.duploIngredients ||
      item.simplesIngredients ||
      []
    );
  },

  buildStepsForBurger(item, burgerName, ingredients) {
    const steps = [];

    // SEMPRE adiciona o step de ponto da carne para burgers
    const pontosPadrao = ["Mal passado", "Ao ponto", "Bem passado"];
    steps.push({ type: "meatPoint", data: pontosPadrao, burgerName });

    if (item.caldas && Array.isArray(item.caldas)) {
      steps.push({ type: "caldas", data: item.caldas, burgerName });
    }

    if (ingredients && ingredients.length > 0) {
      steps.push({
        type: "retiradas",
        data: ingredients,
        burgerName: burgerName,
      });
    }

    const extras = Utils.getExtras(item);
    const availableExtrasForBurger = extras.filter(
      (e) => AppState.paidExtrasAvailability[e.nome] !== false,
    );
    if (availableExtrasForBurger.length > 0) {
      steps.push({
        type: "extras",
        data: availableExtrasForBurger,
        burgerName: burgerName,
      });
    }

    steps.push({
      type: "observacoes",
      burgerName: burgerName,
    });

    return steps;
  },

  buildStepsForItem(item, selectedSize) {
    const steps = [];

    // Adiciona ponto da carne se o item definir pontoCarne no JSON
    const pontosPadrao = ["Mal passado", "Ao ponto", "Bem passado"];
    if (item.pontoCarne) {
      steps.push({ type: "meatPoint", data: item.pontoCarne });
    }

    if (item.caldas && Array.isArray(item.caldas)) {
      steps.push({ type: "caldas", data: item.caldas });
    }

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

    const uniqueIngredients = [...new Set(ingredients)].filter(
      (i) => i && i.trim() !== "",
    );

    if (uniqueIngredients.length > 0) {
      steps.push({ type: "retiradas", data: uniqueIngredients });
    }

    const extras = Utils.getExtras(item);
    const availableExtrasForStep = extras.filter(
      (e) => AppState.paidExtrasAvailability[e.nome] !== false,
    );
    if (availableExtrasForStep.length > 0) {
      steps.push({ type: "extras", data: availableExtrasForStep });
    }

    steps.push({ type: "observacoes" });

    return steps;
  },

  renderCurrentStep() {
    const step = AppState.stepsData[AppState.currentStep];
    const { modalTitle, modalBody, progressDots, btnBack, btnNext } =
      DOM.elements;

    progressDots.innerHTML = AppState.stepsData
      .map(
        (_, i) =>
          `<div class="dot ${i === AppState.currentStep ? "active" : ""}"></div>`,
      )
      .join("");

    btnBack.style.display = AppState.currentStep > 0 ? "block" : "none";

    const isLastStep = AppState.currentStep === AppState.stepsData.length - 1;

    // ✅ Se estamos processando upgrades, ajustar texto do botão
    if (AppState.isProcessingUpgrades) {
      btnNext.textContent = isLastStep
        ? "ADICIONAR COMBO AO CARRINHO"
        : "PRÓXIMO";
    } else if (AppState.isCombo) {
      const isLastBurger =
        AppState.currentBurgerIndex ===
        AppState.comboData.itemRef.burgers.length - 1;

      if (isLastStep && isLastBurger) {
        btnNext.textContent = AppState.isFullCombo
          ? "PRÓXIMO"
          : "ADICIONAR COMBO AO CARRINHO";
      } else if (isLastStep) {
        btnNext.textContent = "PRÓXIMO ITEM DO COMBO";
      } else {
        btnNext.textContent = "PRÓXIMO";
      }
    } else {
      btnNext.textContent = isLastStep ? "ADICIONAR AO CARRINHO" : "PRÓXIMO";
    }

    switch (step.type) {
      case "meatPoint":
        this.renderMeatPoint(modalTitle, modalBody, step.data, step.burgerName);
        break;
      case "caldas":
        this.renderCaldas(modalTitle, modalBody, step.data, step.burgerName);
        break;
      case "retiradas":
        this.renderRetiradas(modalTitle, modalBody, step.data, step.burgerName);
        break;
      case "extras":
        this.renderExtras(modalTitle, modalBody, step.data, step.burgerName);
        break;
      case "observacoes":
        this.renderObservacoes(modalTitle, modalBody, step.burgerName);
        break;
      case "batataUpgrade":
        this.renderBatataUpgrade(modalTitle, modalBody, step.data);
        break;
      case "bebidaUpgrade":
        this.renderBebidaUpgrade(modalTitle, modalBody, step.data);
        break;
    }
  },

  renderMeatPoint(title, body, options, burgerName) {
    const displayName = burgerName || AppState.tempItem.nome;
    title.textContent = `${displayName} - Ponto da Carne 🥩`;

    body.innerHTML = options
      .map(
        (opt, i) => `
      <div class="option-row">
        <label for="meat-${i}" style="flex:1; cursor:pointer;">${opt}</label>
        <input type="radio" id="meat-${i}" name="meatPoint" value="${opt}" ${AppState.tempItem.meatPoint === opt ? "checked" : ""}>
      </div>
    `,
      )
      .join("");

    body.querySelectorAll("input").forEach((input) => {
      input.onchange = (e) => (AppState.tempItem.meatPoint = e.target.value);
    });
  },

  renderCaldas(title, body, options, burgerName) {
    const displayName = burgerName || AppState.tempItem.nome;
    title.textContent = `${displayName} - Escolha a Calda 🍯`;

    if (!AppState.tempItem.selectedCaldas)
      AppState.tempItem.selectedCaldas = [];

    // Usar radio button para seleção única obrigatória
    body.innerHTML = options
      .map((opt, index) => {
        const isChecked = AppState.tempItem.selectedCaldas.includes(opt);
        const id = `calda-${index}`;
        return `
          <div class="option-row">
            <label for="${id}" style="flex: 1; cursor: pointer;">${opt}</label>
            <input type="radio" name="calda-selection" id="${id}" value="${opt}" ${isChecked ? "checked" : ""}>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("input[type='radio']").forEach((input) => {
      input.onchange = (e) => {
        const value = e.target.value;
        // Como é radio, limpa e adiciona apenas a seleção atual
        AppState.tempItem.selectedCaldas = [value];
      };
    });
  },

  renderRetiradas(title, body, ingredients, burgerName) {
    const displayName = burgerName || AppState.tempItem.nome;
    title.textContent = `${displayName} - Retirar Ingredientes ❌`;

    if (!AppState.tempItem.removed) AppState.tempItem.removed = [];

    // Filtrar apenas ingredientes disponíveis
    const availableIngredients = ingredients.filter(
      (ing) => AppState.ingredientsAvailability[ing] !== false,
    );

    if (availableIngredients.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
          <p>Nenhum ingrediente disponível para retirar no momento.</p>
        </div>
      `;
      return;
    }

    body.innerHTML = availableIngredients
      .map((ing, index) => {
        const isChecked = AppState.tempItem.removed.includes(ing);
        const id = `remove-${index}`;
        return `
          <div class="option-row">
            <label for="${id}" style="flex: 1; cursor: pointer;">${ing}</label>
            <input type="checkbox" id="${id}" value="${ing}" ${isChecked ? "checked" : ""}>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.onchange = (e) => {
        const value = e.target.value;
        if (e.target.checked) {
          if (!AppState.tempItem.removed.includes(value)) {
            AppState.tempItem.removed.push(value);
          }
        } else {
          const idx = AppState.tempItem.removed.indexOf(value);
          if (idx > -1) AppState.tempItem.removed.splice(idx, 1);
        }
      };
    });
  },

  renderExtras(title, body, extras, burgerName) {
    const displayName = burgerName || AppState.tempItem.nome;
    title.textContent = `${displayName} - Adicionais Pagos 💰`;

    if (!AppState.tempItem.added) AppState.tempItem.added = [];

    // Filtrar apenas adicionais disponíveis
    const availableExtras = extras.filter(
      (extra) => AppState.paidExtrasAvailability[extra.nome] !== false,
    );

    if (availableExtras.length === 0) {
      body.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted);">
          <p>Nenhum adicional disponível no momento.</p>
        </div>
      `;
      return;
    }

    body.innerHTML = availableExtras
      .map((extra, index) => {
        const isChecked = AppState.tempItem.added.some(
          (a) => a.nome === extra.nome,
        );
        const id = `extra-${index}`;
        return `
          <div class="option-row">
            <label for="${id}" style="flex: 1; cursor: pointer;">
              ${extra.nome} <span style="color: var(--primary);">+ ${Utils.formatPrice(extra.preco)}</span>
            </label>
            <input type="checkbox" id="${id}" value="${index}" ${isChecked ? "checked" : ""}>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.onchange = (e) => {
        const extraIndex = parseInt(e.target.value);
        const extra = availableExtras[extraIndex]; // Usar availableExtras ao invés de extras

        if (e.target.checked) {
          const alreadyAdded = AppState.tempItem.added.some(
            (a) => a.nome === extra.nome,
          );
          if (!alreadyAdded) {
            AppState.tempItem.added.push({
              nome: extra.nome,
              preco: extra.preco,
            });
          }
        } else {
          const idx = AppState.tempItem.added.findIndex(
            (a) => a.nome === extra.nome,
          );
          if (idx > -1) AppState.tempItem.added.splice(idx, 1);
        }
      };
    });
  },

  renderObservacoes(title, body, burgerName) {
    const displayName = burgerName || AppState.tempItem.nome;
    title.textContent = `${displayName} - Observações 💬`;

    body.innerHTML = `
      <textarea
        id="obs-input"
        placeholder="Adicione alguma observação especial..."
        style="
          width: 100%;
          min-height: 120px;
          padding: 15px;
          background: #111;
          border: 1px solid var(--border);
          border-radius: 12px;
          color: white;
          font-size: 0.95rem;
          resize: vertical;
          outline: none;
        "
      >${AppState.tempItem.obs || ""}</textarea>
    `;

    const textarea = body.querySelector("#obs-input");
    textarea.oninput = (e) => (AppState.tempItem.obs = e.target.value);
  },

  renderBatataUpgrade(title, body, upgrades) {
    title.textContent = "Escolha a Batata 🍟";

    // ✅ Se não houver seleção prévia, selecionar a primeira opção automaticamente
    if (!AppState.comboData.selectedBatata) {
      AppState.comboData.selectedBatata = upgrades[0].nome;
      AppState.comboData.batataPriceAdjust = upgrades[0].adicional || 0;
    }

    const currentSelection = AppState.comboData.selectedBatata;

    body.innerHTML = upgrades
      .map((opt, i) => {
        const isSelected = currentSelection === opt.nome;
        const priceText =
          opt.adicional > 0
            ? `+${Utils.formatPrice(opt.adicional)}`
            : opt.adicional < 0
              ? Utils.formatPrice(opt.adicional)
              : "Inclusa";

        return `
          <div class="option-row">
            <label for="batata-${i}" style="flex:1; cursor:pointer;">
              ${opt.nome} <span style="color: var(--primary);">${priceText}</span>
            </label>
            <input type="radio" id="batata-${i}" name="batataUpgrade" value="${i}" ${isSelected ? "checked" : ""}>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("input").forEach((input) => {
      input.onchange = (e) => {
        const selectedIndex = parseInt(e.target.value);
        const selected = upgrades[selectedIndex];
        AppState.comboData.selectedBatata = selected.nome;
        AppState.comboData.batataPriceAdjust = selected.adicional || 0;
      };
    });
  },

  renderBebidaUpgrade(title, body, upgrades) {
    title.textContent = "Escolha a Bebida 🥤";

    // ✅ Se não houver seleção prévia, selecionar a primeira opção automaticamente
    if (!AppState.comboData.selectedBebida) {
      AppState.comboData.selectedBebida = upgrades[0].nome;
      AppState.comboData.bebidaPriceAdjust = upgrades[0].adicional || 0;
    }

    const currentSelection = AppState.comboData.selectedBebida;

    body.innerHTML = upgrades
      .map((opt, i) => {
        const isSelected = currentSelection === opt.nome;
        const priceText =
          opt.adicional > 0
            ? `+${Utils.formatPrice(opt.adicional)}`
            : opt.adicional < 0
              ? Utils.formatPrice(opt.adicional)
              : "Inclusa";

        return `
          <div class="option-row">
            <label for="bebida-${i}" style="flex:1; cursor:pointer;">
              ${opt.nome} <span style="color: var(--primary);">${priceText}</span>
            </label>
            <input type="radio" id="bebida-${i}" name="bebidaUpgrade" value="${i}" ${isSelected ? "checked" : ""}>
          </div>
        `;
      })
      .join("");

    body.querySelectorAll("input").forEach((input) => {
      input.onchange = (e) => {
        const selectedIndex = parseInt(e.target.value);
        const selected = upgrades[selectedIndex];
        AppState.comboData.selectedBebida = selected.nome;
        AppState.comboData.bebidaPriceAdjust = selected.adicional || 0;
      };
    });
  },

  nextStep() {
    // Validar se o passo atual é de caldas e se uma calda foi selecionada
    const currentStepData = AppState.stepsData[AppState.currentStep];

    if (currentStepData && currentStepData.type === "caldas") {
      if (
        !AppState.tempItem.selectedCaldas ||
        AppState.tempItem.selectedCaldas.length === 0
      ) {
        showToast("⚠️ Por favor, escolha uma calda");
        return;
      }
    }

    if (AppState.currentStep < AppState.stepsData.length - 1) {
      AppState.currentStep++;
      this.renderCurrentStep();
    } else {
      this.completeCurrentItem();
    }
  },

  prevStep() {
    if (AppState.currentStep > 0) {
      AppState.currentStep--;
      this.renderCurrentStep();
    }
  },

  completeCurrentItem() {
    // ✅ Se estamos processando upgrades, finalizar o combo
    if (AppState.isProcessingUpgrades) {
      AppState.isProcessingUpgrades = false; // Reset da flag
      this.finalizeCombo();
      return;
    }

    if (AppState.isCombo) {
      this.saveComboItem();

      AppState.currentBurgerIndex++;

      if (
        AppState.currentBurgerIndex < AppState.comboData.itemRef.burgers.length
      ) {
        this.startNextBurgerInCombo();
      } else if (AppState.isFullCombo) {
        this.showComboUpgrades();
      } else {
        this.finalizeCombo();
      }
    } else {
      this.finalizeSingleItem();
    }
  },

  saveComboItem() {
    const extrasTotal = (AppState.tempItem.added || []).reduce(
      (sum, extra) => sum + extra.preco,
      0,
    );
    AppState.tempItem.finalPrice = extrasTotal;

    AppState.comboItems.push({ ...AppState.tempItem });
  },

  showComboUpgrades() {
    const { upgrades } = AppState.comboData;

    AppState.stepsData = [
      { type: "batataUpgrade", data: upgrades.batata },
      { type: "bebidaUpgrade", data: upgrades.bebida },
    ];

    AppState.currentStep = 0;
    AppState.isProcessingUpgrades = true; // ✅ Flag para indicar que estamos nos upgrades
    this.renderCurrentStep();

    // ✅ NÃO sobrescrever onclick - deixar fluxo normal de nextStep() funcionar
  },

  finalizeCombo() {
    const totalExtras = AppState.comboItems.reduce(
      (sum, item) => sum + item.finalPrice,
      0,
    );

    const finalPrice =
      AppState.comboData.basePrice +
      totalExtras +
      (AppState.comboData.batataPriceAdjust || 0) +
      (AppState.comboData.bebidaPriceAdjust || 0);

    const comboItem = {
      nome: AppState.comboData.nomeCombo,
      img: AppState.comboData.itemRef.img,
      categoria: AppState.comboData.categoria,
      selectedSize: AppState.comboData.selectedSize,
      selectedPrice: AppState.comboData.basePrice,
      isCombo: true,
      burgers: AppState.comboItems,
      selectedBatata: AppState.comboData.selectedBatata || null,
      selectedBebida: AppState.comboData.selectedBebida || null,
      finalPrice: finalPrice,
    };

    CartManager.add(comboItem);
    ModalUI.close();
  },

  finalizeSingleItem() {
    const extrasTotal = (AppState.tempItem.added || []).reduce(
      (sum, extra) => sum + extra.preco,
      0,
    );

    AppState.tempItem.finalPrice =
      AppState.tempItem.selectedPrice + extrasTotal;

    CartManager.add(AppState.tempItem);
    ModalUI.close();
  },
};

// ================================
// CART UI
// ================================
const CartUI = {
  render() {
    const { cartItems, cartCount, totalCart } = DOM.elements;

    cartCount.textContent = AppState.cart.length;
    totalCart.textContent = Utils.formatPrice(CartManager.getTotal());

    cartItems.innerHTML = "";

    if (AppState.cart.length === 0) {
      cartItems.innerHTML = `
        <div style="text-align: center; padding: 40px 0; color: #666;">
          <p>Seu carrinho está vazio 🛒</p>
        </div>
      `;
      return;
    }

    AppState.cart.forEach((item, index) => {
      const itemElement = this.renderCartItem(item, index);
      cartItems.appendChild(itemElement);
    });
  },

  renderCartItem(item, index) {
    const div = DOM.create("div", "cart-item");
    div.style.display = "flex";
    div.style.gap = "15px";
    div.style.alignItems = "start";
    div.style.padding = "15px 0";
    div.style.borderBottom = "1px solid #222";

    const imgContainer = document.createElement("div");
    imgContainer.style.flexShrink = "0";
    imgContainer.innerHTML = `<img src="${item.img || "./img/placeholder.png"}" alt="${item.nome}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 10px; border: 2px solid var(--primary); box-shadow: 0 2px 8px rgba(255, 193, 7, 0.2);">`;
    div.appendChild(imgContainer);

    const contentContainer = DOM.create("div");
    contentContainer.style.flex = "1";

    const nomeComOpcao = item.selectedSize
      ? `${item.nome} - ${item.selectedSize}`
      : item.nome;

    const header = DOM.create("div", "cart-item-header");
    header.innerHTML = `
    <div style="font-weight: bold; font-size: 1.05rem; color: #fff;">${nomeComOpcao}</div>
    <div style="color: var(--primary); margin: 2px 0; font-weight: 600;">${Utils.formatPrice(item.finalPrice * (item.quantity || 1))}</div>
  `;
    contentContainer.appendChild(header);

    const detailsDiv = document.createElement("div");
    detailsDiv.style.fontSize = "0.85rem";
    detailsDiv.style.color = "#aaa";
    let detailsHtml = "";

    if (item.isCombo && item.burgers) {
      detailsHtml += `<div style="color: var(--primary); font-weight: bold; margin-top: 5px;">Itens do Combo:</div>`;
      item.burgers.forEach((burger) => {
        detailsHtml += `<div style="margin-left: 10px; margin-top: 5px;">• <strong>${burger.nome}</strong></div>`;

        // Mostrar ponto da carne
        if (burger.meatPoint) {
          detailsHtml += `<div style="margin-left: 20px; font-size: 0.8rem; color: #ccc;">Ponto: ${burger.meatPoint}</div>`;
        }

        // Mostrar ingredientes removidos
        if (burger.removed && burger.removed.length > 0) {
          detailsHtml += `<div style="margin-left: 20px; font-size: 0.8rem; color: #ff4444;">Sem: ${burger.removed.join(", ")}</div>`;
        }

        // Mostrar adicionais pagos
        if (burger.added && burger.added.length > 0) {
          const addedNames = burger.added.map((a) => a.nome).join(", ");
          detailsHtml += `<div style="margin-left: 20px; font-size: 0.8rem; color: #4CAF50;">➕ ${addedNames}</div>`;
        }

        // Mostrar observações
        if (burger.obs) {
          detailsHtml += `<div style="margin-left: 20px; font-size: 0.8rem; color: #aaa;">💬 ${burger.obs}</div>`;
        }
      });
      if (item.selectedBatata) {
        detailsHtml += `<div style="margin-top: 3px;">🍟 ${item.selectedBatata}</div>`;
      }
      if (item.selectedBebida) {
        detailsHtml += `<div>🥤 ${item.selectedBebida}</div>`;
      }
    } else {
      // Mostrar ponto da carne para itens individuais
      if (item.meatPoint) {
        detailsHtml += `<div style="margin-top: 3px;">🥩 Ponto: ${item.meatPoint}</div>`;
      }

      if (item.selectedCaldas?.length)
        detailsHtml += `<div>🍯 Calda: ${item.selectedCaldas.join(", ")}</div>`;

      if (item.removed?.length)
        detailsHtml += `<div style="color: #ff4444;">❌ Sem: ${item.removed.join(", ")}</div>`;

      if (item.added?.length) {
        const addedNames = item.added.map((a) => a.nome).join(", ");
        detailsHtml += `<div style="color: #4CAF50;">➕ Adicionais: ${addedNames}</div>`;
      }

      if (item.obs) {
        detailsHtml += `<div style="margin-top: 3px; color: #aaa;">💬 ${item.obs}</div>`;
      }
    }

    detailsDiv.innerHTML = detailsHtml;
    contentContainer.appendChild(detailsDiv);

    const controls = DOM.create("div", "cart-controls");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "12px";
    controls.style.marginTop = "10px";

    controls.innerHTML = `
    <div class="quantity-selector">
      <button onclick="CartManager.updateQuantity(${index}, -1)">-</button>
      <span>${item.quantity || 1}</span>
      <button onclick="CartManager.updateQuantity(${index}, 1)">+</button>
    </div>
    <button class="btn-remove-link" onclick="CartManager.remove(${index})">Remover</button>
  `;
    contentContainer.appendChild(controls);

    div.appendChild(contentContainer);
    return div;
  },
};

// ================================
// MODAL UI
// ================================
const ModalUI = {
  open() {
    DOM.elements.modal.classList.add("active");
    DOM.elements.overlay.classList.add("active");
  },

  close() {
    DOM.elements.modal.classList.remove("active");
    DOM.elements.overlay.classList.remove("active");
  },
};

// ================================
// SIDEBAR UI
// ================================
const SidebarUI = {
  open() {
    DOM.elements.sidebar.classList.add("active");
    DOM.elements.overlay.classList.add("active");
  },

  close() {
    DOM.elements.sidebar.classList.remove("active");
    DOM.elements.overlay.classList.remove("active");
  },

  toggle() {
    const isActive = DOM.elements.sidebar.classList.contains("active");
    isActive ? this.close() : this.open();
  },
};

// ================================
// CHECKOUT
// ================================
const CheckoutManager = {
  init() {
    const form = DOM.elements.checkoutForm;
    if (!form) return;

    DOM.getAll("[data-delivery-type]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const type = e.target.dataset.deliveryType;
        AppState.deliveryType = type;

        DOM.getAll("[data-delivery-type]").forEach((b) =>
          b.classList.remove("active"),
        );
        e.target.classList.add("active");

        const deliveryFields = DOM.elements.deliveryFields;
        if (type === "delivery") {
          deliveryFields.style.display = "block";
          // Apenas campos com data-delivery-required são obrigatórios
          deliveryFields
            .querySelectorAll("[data-delivery-required]")
            .forEach((input) => {
              input.required = true;
            });
          deliveryFields.querySelectorAll("select").forEach((select) => {
            select.required = true;
          });
        } else {
          deliveryFields.style.display = "none";
          deliveryFields.querySelectorAll("input").forEach((input) => {
            input.required = false;
          });
          deliveryFields.querySelectorAll("select").forEach((select) => {
            select.required = false;
          });
        }

        CartUI.render();
      });
    });

    const neighborhoodSelect = form.querySelector("[data-neighborhood-select]");
    if (neighborhoodSelect) {
      neighborhoodSelect.addEventListener("change", (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const fee = parseFloat(selectedOption.dataset.fee) || 0;
        const neighborhoodValue = e.target.value;
        const neighborhoodText =
          selectedOption.textContent.split(" - ")[0] || "";

        AppState.deliveryFee = fee;
        AppState.selectedNeighborhood = {
          value: neighborhoodValue,
          text: neighborhoodText,
        };

        const feeDisplay = DOM.get("[data-delivery-fee-display]");
        const feeValue = DOM.get("[data-delivery-fee-value]");

        if (neighborhoodValue === "campo-grande") {
          feeDisplay.style.display = "flex";
          feeDisplay.classList.add("campo-grande");
          feeValue.textContent = "A combinar";
        } else if (fee > 0) {
          feeDisplay.style.display = "flex";
          feeDisplay.classList.remove("campo-grande");
          feeValue.textContent = Utils.formatPrice(fee);
        } else {
          feeDisplay.style.display = "none";
        }

        CartUI.render();
      });
    }

    const paymentSelect = form.querySelector('[name="paymentMethod"]');
    if (paymentSelect) {
      paymentSelect.addEventListener("change", (e) => {
        const changeField = DOM.elements.changeField;
        if (e.target.value === "dinheiro") {
          changeField.style.display = "block";
          changeField.querySelector("input").required = false;
        } else {
          changeField.style.display = "none";
          changeField.querySelector("input").required = false;
        }
      });
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.processCheckout(new FormData(form));
    });
  },

  async processCheckout(formData) {
    const data = Object.fromEntries(formData.entries());

    if (AppState.cart.length === 0) {
      showToast("⚠️ Carrinho vazio");
      return;
    }

    // Verificar se a loja está aberta antes de enviar
    if (database) {
      try {
        const storeOpenSnapshot = await database.ref("storeOpen").once("value");
        const isStoreOpen = storeOpenSnapshot.val() !== false; // Default true

        if (!isStoreOpen) {
          showToast("🔴 Desculpe, a loja está fechada no momento!");
          return;
        }
      } catch (error) {
        console.warn("Erro ao verificar status da loja, prosseguindo:", error);
        // Em caso de erro, permite o pedido (fail-safe)
      }
    }

    if (AppState.deliveryType === "delivery") {
      if (!data.neighborhood) {
        showToast("⚠️ Selecione o bairro de entrega");
        return;
      }

      if (!data.street || data.street.trim() === "") {
        showToast("⚠️ Informe o endereço (Rua/Av)");
        return;
      }

      if (!data.houseNumber || data.houseNumber.trim() === "") {
        showToast("⚠️ Informe o número da casa");
        return;
      }

      const selectedOption = DOM.get(
        `[data-neighborhood-select] option[value="${data.neighborhood}"]`,
      );
      data.neighborhoodInfo = {
        value: data.neighborhood,
        text: selectedOption?.textContent.split(" - ")[0] || "",
      };

      // Montar o endereço completo a partir dos campos separados
      data.address = `${data.street.trim()}, ${data.houseNumber.trim()}`;
    }

    // ✅ Abre o WhatsApp IMEDIATAMENTE — antes de qualquer await.
    // Browsers bloqueiam window.open() após await (contexto de clique perdido).
    // O cliente já vê o WhatsApp abrir enquanto o pedido é enviado ao KDS em paralelo.
    const whatsappURL = OrderSender.buildWhatsAppURL(data);
    window.open(whatsappURL, "_blank");

    showToast("📤 Enviando pedido para a cozinha...");

    // Envia ao KDS em background — não bloqueia mais o cliente
    OrderSender.sendToKDSRobust(data).then((kdsOk) => {
      if (!kdsOk) {
        showToast(
          "⚠️ Pedido no WhatsApp, mas cozinha não confirmou. Ligue para a loja!",
        );
      } else {
        showToast("✅ Pedido enviado com sucesso!");
      }
    });

    // Limpa carrinho e fecha checkout imediatamente
    setTimeout(() => {
      CartManager.clear();
      this.closeCheckout();
      SidebarUI.close();
    }, 1500);
  },

  closeCheckout() {
    const checkoutSidebar = document.getElementById("sidebar-checkout");
    if (checkoutSidebar) {
      checkoutSidebar.classList.remove("active");
    }
    DOM.elements.overlay.classList.remove("active");
  },

  openCheckout() {
    // Fechar sidebar do carrinho
    SidebarUI.close();

    // Aguardar animação de fechamento
    setTimeout(() => {
      // Abrir sidebar de checkout
      const checkoutSidebar = document.getElementById("sidebar-checkout");
      if (checkoutSidebar) {
        checkoutSidebar.classList.add("active");
      }
      DOM.elements.overlay.classList.add("active");

      // Atualizar total no checkout
      const totalElements = document.querySelectorAll("[data-total-cart]");
      totalElements.forEach((el) => {
        el.textContent = Utils.formatPrice(CartManager.getTotal());
      });
    }, 300); // Tempo da animação de fechamento do carrinho
  },
};

// ================================
// ORDER SENDER
// ================================
const OrderSender = {
  // Constrói apenas a URL — sem abrir janela (permite chamar antes de await)
  buildWhatsAppURL(data) {
    const message = this._buildMessage(data);
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodedMessage}`;
  },

  // Mantido por compatibilidade, mas não usado no fluxo principal
  sendToWhatsApp(data) {
    window.open(this.buildWhatsAppURL(data), "_blank");
  },

  _buildMessage(data) {
    let message = `🔥 *PEDIDO RIBBS ZN* 🔥\n\n`;
    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `📦 *TIPO:* ${AppState.deliveryType === "delivery" ? "🛵 ENTREGA" : "🏪 RETIRADA"}\n`;

    if (AppState.deliveryType === "delivery") {
      message += `📍 *Bairro:* ${data.neighborhoodInfo.text}\n`;
      message += `📍 *Endereço:* ${data.address}\n`;
      if (data.complement) message += `   ${data.complement}\n`;
      if (
        AppState.deliveryFee > 0 &&
        AppState.selectedNeighborhood?.value !== "campo-grande"
      ) {
        message += `🛵 *Taxa de Entrega:* ${Utils.formatPrice(AppState.deliveryFee)}\n`;
      } else if (AppState.selectedNeighborhood?.value === "campo-grande") {
        message += `🛵 *Taxa de Entrega:* A combinar\n`;
      }
    }

    message += `👤 *Cliente:* ${data.customerName}\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;

    message += `🍔 *ITENS DO PEDIDO:*\n\n`;

    AppState.cart.forEach((item, idx) => {
      message += `${idx + 1}. *${item.nome}*\n`;

      if (item.isCombo && item.burgers) {
        item.burgers.forEach((burger) => {
          message += `   --- ${burger.nome} ---\n`;
          if (burger.meatPoint) message += `   🥩 Ponto: ${burger.meatPoint}\n`;
          if (burger.selectedCaldas && burger.selectedCaldas.length)
            message += `   🍯 Caldas: ${burger.selectedCaldas.join(", ")}\n`;
          if (burger.removed && burger.removed.length) {
            message += `   ❌ Sem: ${burger.removed.join(", ")}\n`;
          }
          if (burger.added && burger.added.length) {
            message += `   ➕ Adicionais: ${burger.added.map((a) => a.nome).join(", ")}\n`;
          }
          if (burger.obs) message += `   💬 Obs: ${burger.obs}\n`;
        });
        if (item.selectedBatata) {
          message += `   🍟 Batata: ${item.selectedBatata}\n`;
        }
        if (item.selectedBebida) {
          message += `   🥤 Bebida: ${item.selectedBebida}\n`;
        }
      } else {
        if (item.selectedSize) message += `   Tamanho: ${item.selectedSize}\n`;
        if (item.meatPoint) message += `   🥩 Ponto: ${item.meatPoint}\n`;
        if (item.selectedCaldas && item.selectedCaldas.length)
          message += `   🍯 Caldas: ${item.selectedCaldas.join(", ")}\n`;
        if (item.removed && item.removed.length) {
          message += `   ❌ Sem: ${item.removed.join(", ")}\n`;
        }
        if (item.added && item.added.length) {
          message += `   ➕ Adicionais: ${item.added.map((a) => a.nome).join(", ")}\n`;
        }
        if (item.obs) message += `   💬 Obs: ${item.obs}\n`;
      }

      message += `   💰 ${Utils.formatPrice(item.finalPrice)}\n`;
      if (item.quantity > 1) {
        message += `   Quantidade: ${item.quantity}x\n`;
      }
      message += `\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `💳 *Pagamento:* ${this.getPaymentName(data.paymentMethod)}\n`;

    if (data.paymentMethod === "dinheiro" && data.changeFor) {
      message += `💵 *Troco para:* R$ ${data.changeFor}\n`;
    }

    message += `\n💰 *TOTAL: ${Utils.formatPrice(CartManager.getTotal())}*`;

    return message;
  },

  getPaymentName(method) {
    const names = {
      pix: "💚 PIX",
      dinheiro: "💵 Dinheiro",
      debito: "💳 Cartão de Débito",
      credito: "💳 Cartão de Crédito",
    };
    return names[method] || method;
  },

  // Monta o objeto pedido pronto para o Firebase
  _buildPedido(data) {
    const paymentNames = {
      pix: "PIX",
      dinheiro: "Dinheiro",
      debito: "Débito",
      credito: "Crédito",
    };

    const itens = AppState.cart.map((item) => {
      const itemFormatado = {
        nome: item.nome,
        preco: item.selectedPrice || 0,
        quantidade: item.quantity || 1,
        qtd: item.quantity || 1,
      };

      const observacoes = [];

      if (item.isCombo && item.burgers) {
        item.burgers.forEach((burger) => {
          observacoes.push(`--- ${burger.nome} ---`);
          if (burger.meatPoint) observacoes.push(`Ponto: ${burger.meatPoint}`);
          if (burger.selectedCaldas && burger.selectedCaldas.length)
            observacoes.push(`Caldas: ${burger.selectedCaldas.join(", ")}`);
          if (burger.removed && burger.removed.length)
            observacoes.push(`Sem: ${burger.removed.join(", ")}`);
          if (burger.added && burger.added.length)
            observacoes.push(
              `Adicionais: ${burger.added.map((a) => a.nome).join(", ")}`,
            );
          if (burger.obs) observacoes.push(burger.obs);
        });
        if (item.selectedBatata)
          observacoes.push(`Batata: ${item.selectedBatata}`);
        if (item.selectedBebida)
          observacoes.push(`Bebida: ${item.selectedBebida}`);
      } else {
        if (item.selectedSize)
          observacoes.push(`Tamanho: ${item.selectedSize}`);
        if (item.meatPoint) {
          observacoes.push(`Ponto: ${item.meatPoint}`);
          itemFormatado.ponto = item.meatPoint;
        }
        if (item.selectedCaldas && item.selectedCaldas.length)
          observacoes.push(`Caldas: ${item.selectedCaldas.join(", ")}`);
        if (item.removed && item.removed.length) {
          observacoes.push(`Sem: ${item.removed.join(", ")}`);
          itemFormatado.retiradas = item.removed;
        }
        if (item.added && item.added.length) {
          observacoes.push(
            `Adicionais: ${item.added.map((a) => a.nome).join(", ")}`,
          );
          itemFormatado.adicionais = item.added.map((a) => ({
            nome: a.nome,
            preco: a.preco,
          }));
        }
        if (item.obs) observacoes.push(item.obs);
      }

      if (observacoes.length > 0) {
        itemFormatado.observacao = observacoes.join(" | ");
      }

      return itemFormatado;
    });

    const pedido = {
      tipo: "delivery",
      tipoOrigem: "delivery",
      status: "pending",
      nomeCliente: data.customerName,
      cliente: data.customerName,
      nome: data.customerName,
      pagamento: paymentNames[data.paymentMethod] || data.paymentMethod,
      itens: itens,
      total: CartManager.getTotal(),
      timestamp: Date.now(),
      dataHora: new Date().toLocaleString("pt-BR"),
    };

    if (AppState.deliveryType === "delivery") {
      pedido.modoConsumo = "🛵 ENTREGA";
      pedido.endereco = data.address || "";
      if (data.complement && data.complement.trim() !== "") {
        pedido.endereco += ` - ${data.complement.trim()}`;
      }
      if (data.neighborhoodInfo) pedido.bairro = data.neighborhoodInfo.text;
      if (AppState.deliveryFee > 0) pedido.taxaEntrega = AppState.deliveryFee;
    } else {
      pedido.modoConsumo = "🏪 RETIRADA";
      pedido.endereco = "RETIRADA NO LOCAL";
    }

    if (data.paymentMethod === "dinheiro" && data.changeFor) {
      pedido.troco = `Troco para R$ ${data.changeFor}`;
    }

    return pedido;
  },

  // Tenta enviar uma única vez ao Firebase
  async sendToKDS(data) {
    if (!database) throw new Error("Firebase não conectado");
    const pedido = this._buildPedido(data);
    const newOrderRef = database.ref("pedidos").push();
    await newOrderRef.set(pedido);
    console.log("✅ Pedido enviado ao KDS!");
  },

  // Envia com retry automático (3x) + fila offline se tudo falhar
  // Retorna true se conseguiu enviar, false se foi para a fila offline
  async sendToKDSRobust(data) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.sendToKDS(data);
        // Sucesso — tentar reenviar fila pendente (pedidos anteriores que falharam)
        this._flushOfflineQueue();
        return true;
      } catch (error) {
        console.warn(
          `⚠️ Tentativa ${attempt}/${MAX_RETRIES} falhou:`,
          error.message,
        );
        if (attempt < MAX_RETRIES) {
          showToast(`⏳ Tentando novamente... (${attempt}/${MAX_RETRIES})`);
          await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
        }
      }
    }

    // Todas as tentativas falharam — salvar na fila offline
    console.error("❌ Todas as tentativas falharam. Salvando na fila offline.");
    this._saveToOfflineQueue(data);
    return false;
  },

  // Salva pedido no localStorage para reenvio posterior
  _saveToOfflineQueue(data) {
    try {
      const queue = JSON.parse(
        localStorage.getItem("kds_offline_queue") || "[]",
      );
      queue.push({
        data: data,
        cart: JSON.parse(JSON.stringify(AppState.cart)), // snapshot do carrinho
        deliveryType: AppState.deliveryType,
        deliveryFee: AppState.deliveryFee,
        selectedNeighborhood: AppState.selectedNeighborhood,
        savedAt: Date.now(),
      });
      localStorage.setItem("kds_offline_queue", JSON.stringify(queue));
      console.log(
        `📦 Pedido salvo na fila offline. Total na fila: ${queue.length}`,
      );
    } catch (e) {
      console.error("❌ Erro ao salvar na fila offline:", e);
    }
  },

  // Tenta reenviar todos os pedidos da fila offline
  async _flushOfflineQueue() {
    try {
      const queue = JSON.parse(
        localStorage.getItem("kds_offline_queue") || "[]",
      );
      if (queue.length === 0) return;

      console.log(`🔄 Reenviando ${queue.length} pedido(s) da fila offline...`);
      const remaining = [];

      for (const entry of queue) {
        try {
          if (!database) {
            remaining.push(entry);
            continue;
          }
          // Restaurar estado temporariamente para montar o pedido
          const savedCart = AppState.cart;
          const savedDeliveryType = AppState.deliveryType;
          const savedDeliveryFee = AppState.deliveryFee;
          const savedNeighborhood = AppState.selectedNeighborhood;

          AppState.cart = entry.cart;
          AppState.deliveryType = entry.deliveryType;
          AppState.deliveryFee = entry.deliveryFee;
          AppState.selectedNeighborhood = entry.selectedNeighborhood;

          const pedido = this._buildPedido(entry.data);
          pedido.reenviado = true; // marca para rastreamento
          pedido.savedAt = entry.savedAt;

          const ref = database.ref("pedidos").push();
          await ref.set(pedido);

          // Restaurar estado original
          AppState.cart = savedCart;
          AppState.deliveryType = savedDeliveryType;
          AppState.deliveryFee = savedDeliveryFee;
          AppState.selectedNeighborhood = savedNeighborhood;

          console.log("✅ Pedido offline reenviado com sucesso!");
        } catch (e) {
          remaining.push(entry); // mantém na fila se ainda falhar
        }
      }

      localStorage.setItem("kds_offline_queue", JSON.stringify(remaining));
      if (remaining.length < queue.length) {
        showToast(
          `✅ ${queue.length - remaining.length} pedido(s) pendente(s) enviado(s) à cozinha!`,
        );
      }
    } catch (e) {
      console.error("❌ Erro ao processar fila offline:", e);
    }
  },
};

// ================================
// SEARCH
// ================================
const SearchManager = {
  init() {
    DOM.elements.searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        this.handleSearch(e.target.value);
      }, 300),
    );
  },

  handleSearch(query) {
    if (!AppState.cardapioData) return;

    const lowerQuery = query.toLowerCase();

    if (!lowerQuery.trim()) {
      MenuUI.render(AppState.cardapioData);
      return;
    }

    const filtered = {};

    Object.entries(AppState.cardapioData).forEach(([category, items]) => {
      const matches = items.filter(
        (item) =>
          item.nome.toLowerCase().includes(lowerQuery) ||
          item.descricao?.toLowerCase().includes(lowerQuery),
      );

      if (matches.length) {
        filtered[category] = matches;
      }
    });

    MenuUI.render(filtered);
  },
};

// ================================
// EVENT LISTENERS
// ================================
const EventListeners = {
  init() {
    DOM.get("[data-close-modal]")?.addEventListener("click", () =>
      ModalUI.close(),
    );
    DOM.get("[data-btn-next]")?.addEventListener("click", () =>
      OrderFlow.nextStep(),
    );
    DOM.get("[data-btn-back]")?.addEventListener("click", () =>
      OrderFlow.prevStep(),
    );

    DOM.get("[data-action='toggle-sidebar']")?.addEventListener("click", () =>
      SidebarUI.toggle(),
    );
    DOM.get("[data-close-sidebar]")?.addEventListener("click", () =>
      SidebarUI.close(),
    );

    DOM.elements.overlay?.addEventListener("click", () => {
      const modalActive = DOM.elements.modal.classList.contains("active");
      const sidebarActive = DOM.elements.sidebar.classList.contains("active");
      const checkoutActive = document
        .getElementById("sidebar-checkout")
        ?.classList.contains("active");

      if (modalActive) ModalUI.close();
      else if (checkoutActive) CheckoutManager.closeCheckout();
      else if (sidebarActive) SidebarUI.close();
    });

    // ✅ NOVO: Event listener do botão "Finalizar Pedido"
    const btnFinalizarPedido = document.getElementById("btn-finalizar-pedido");
    if (btnFinalizarPedido) {
      btnFinalizarPedido.addEventListener("click", () => {
        if (AppState.cart.length === 0) {
          showToast("⚠️ Seu carrinho está vazio");
          return;
        }
        CheckoutManager.openCheckout();
      });
    }

    // ✅ NOVO: Event listener do botão "Voltar" do checkout
    const btnBackToCart = document.getElementById("btn-back-to-cart");
    if (btnBackToCart) {
      btnBackToCart.addEventListener("click", () => {
        CheckoutManager.closeCheckout();
        SidebarUI.open();
      });
    }

    // ✅ NOVO: Event listener do botão "X" (fechar) do checkout
    const btnCloseCheckout = document.getElementById("btn-close-checkout");
    if (btnCloseCheckout) {
      btnCloseCheckout.addEventListener("click", () => {
        CheckoutManager.closeCheckout();
      });
    }

    window.addEventListener("scroll", CategoriesUI.updateActiveOnScroll);

    CheckoutManager.init();
    SearchManager.init();
  },
};

// ================================
// APP INITIALIZATION
// ================================
const App = {
  async init() {
    try {
      // Inicializar modal de boas-vindas PRIMEIRO
      WelcomeModal.init();

      await initFirebase(); // aguardar Firebase antes de configurar listeners
      AppState.cardapioData = await MenuService.loadMenu();

      // FIX 1: Sincronizar preços do Firebase ANTES de renderizar
      await MenuService.syncPricesFromFirebase();

      // FIX 2: Carregar disponibilidade do Firebase ANTES de renderizar o menu,
      // para que itens indisponíveis já apareçam corretos no primeiro carregamento.
      if (database) {
        const [menuSnap, ingredSnap, extrasSnap] = await Promise.all([
          database.ref("menuAvailability").once("value"),
          database.ref("ingredientsAvailability").once("value"),
          database.ref("paidExtrasAvailability").once("value"),
        ]);
        AppState.menuAvailability = menuSnap.val() || {};
        AppState.ingredientsAvailability = ingredSnap.val() || {};
        AppState.paidExtrasAvailability = extrasSnap.val() || {};
        console.log(
          "✅ Disponibilidade carregada antes do render:",
          AppState.menuAvailability,
          AppState.ingredientsAvailability,
          AppState.paidExtrasAvailability,
        );
      }

      CategoriesUI.render(Object.keys(AppState.cardapioData));
      MenuUI.render(AppState.cardapioData);
      CartUI.render();
      EventListeners.init();

      // Listener em tempo real de disponibilidade (on/off de itens/opcoes)
      // Faz re-render completo do menu ao receber atualizações do KDS
      MenuService.listenToAvailability();

      // Listener em tempo real de disponibilidade de insumos e adicionais
      MenuService.listenToIngredientsAvailability();

      // Listener em tempo real de mudanças de preço
      MenuService.listenToPriceChanges();

      console.log(
        "✅ Sistema de sincronização de preços e disponibilidade ativado",
      );
    } catch (error) {
      MenuUI.renderError();
    }
  },
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}
