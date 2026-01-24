"use strict";

// --- Variáveis Globais ---
let cardapioData = {};
let cart = [];
let currentCategory = "Promoções";
let currentItem = null;
let pendingMilkShake = null;
let modoEntrega = "";
let taxaEntregaAtual = 0;
let desconto = 0;

// --- Configurações ---
const whatsappNumber = "5581996469626";
const CHAVE_PIX_TEXTO = "81996469626"; // Número para cópia

let comboCustomization = {
  item: null,
  currentStep: -1,
  totalCustomizations: [],
  basePrice: 0,
  isPromo: false,
  totalSteps: 0,
  upgrades: {},
};

const sounds = {
  click: document.getElementById("soundClick"),
  add: document.getElementById("soundAdd"),
};

// --- Inicialização ---
document.addEventListener("DOMContentLoaded", () => {
  loadMenuData();

  const inputCupom = document.getElementById("inputCupom");
  if (inputCupom) {
    inputCupom.addEventListener("input", aplicarCupom);
  }

  // Adicionar suporte a swipe down para minimizar carrinho em mobile
  setupCartSwipe();
});

async function loadMenuData() {
  try {
    const response = await fetch("cardapio.json");
    cardapioData = await response.json();
    // Inicia na categoria Promoções
    const firstBtn = document.querySelector(".sessao-topo button");
    showCategory("Promoções", firstBtn);
  } catch (e) {
    console.error(
      "Erro ao carregar cardápio. Verifique se o arquivo cardapio.json existe.",
    );
  }
}

// Função para configurar swipe down no carrinho
function setupCartSwipe() {
  const footerCart = document.getElementById("footerCart");
  if (!footerCart) return;

  let touchStartY = 0;
  let touchEndY = 0;
  const minSwipeDistance = 50; // Distância mínima para considerar swipe down

  footerCart.addEventListener("touchstart", (e) => {
    if (footerCart.classList.contains("open")) {
      touchStartY = e.touches[0].clientY;
    }
  });

  footerCart.addEventListener("touchmove", (e) => {
    if (footerCart.classList.contains("open")) {
      touchEndY = e.touches[0].clientY;
    }
  });

  footerCart.addEventListener("touchend", () => {
    if (footerCart.classList.contains("open")) {
      const deltaY = touchEndY - touchStartY;
      if (deltaY > minSwipeDistance) {
        toggleCart(); // Minimiza o carrinho se deslizar para baixo
      }
      touchStartY = 0;
      touchEndY = 0;
    }
  });
}

// --- Funções de Cupom e Resumo ---
function aplicarCupom() {
  const codigo = document.getElementById("inputCupom").value.toUpperCase();
  const sub = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  desconto = 0;

  if (codigo === "DESCONTO10") {
    desconto = sub * 0.1;
  }
  atualizarResumo();
}

function atualizarResumo() {
  const sub = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const totalFinal = Math.max(0, sub + taxaEntregaAtual - desconto);

  document.getElementById("resumoSubtotal").textContent = `R$ ${sub.toFixed(
    2,
  )}`;

  const resumoTaxa = document.getElementById("resumoTaxa");
  const selectBairro = document.getElementById("selectBairro");
  const bairro = selectBairro ? selectBairro.value : "";

  if (modoEntrega === "entrega" && bairro === "Campo Grande") {
    resumoTaxa.innerHTML = `<span class="taxa-pending">A definir (No WhatsApp)</span>`;
  } else {
    resumoTaxa.textContent = `R$ ${taxaEntregaAtual.toFixed(2)}`;
  }

  document.getElementById("resumoDesconto").textContent =
    `R$ ${desconto.toFixed(2)}`;
  document.getElementById("resumoTotal").textContent = `R$ ${totalFinal.toFixed(
    2,
  )}`;
}

// --- Lógica de Pagamento e Pix ---
function gerenciarExibicaoPix() {
  const pag = document.getElementById("selectPagamento").value;
  const areaPix = document.getElementById("areaPixCopiaCola");
  if (areaPix) {
    areaPix.style.display = pag === "Pix" ? "block" : "none";
  }
}

function copiarChavePix() {
  navigator.clipboard
    .writeText(CHAVE_PIX_TEXTO)
    .then(() => {
      alert("Chave PIX copiada: " + CHAVE_PIX_TEXTO);
    })
    .catch((err) => {
      console.error("Erro ao copiar: ", err);
    });
}

function verificarTroco() {
  const metodo = document.getElementById("selectPagamento").value;
  const areaTroco = document.getElementById("areaTroco");
  const inputTroco = document.getElementById("inputTroco");

  if (metodo === "Dinheiro") {
    areaTroco.classList.remove("hidden");
    inputTroco.required = true; // Torna obrigatório apenas se for dinheiro
  } else {
    areaTroco.classList.add("hidden");
    inputTroco.required = false; // Remove a obrigatoriedade para não travar o formulário
    inputTroco.value = "";
  }
}
// --- Checkout e Entrega ---
function selecionarModo(modo) {
  modoEntrega = modo;
  const areaEntrega = document.getElementById("areaEntrega");
  const secaoPagamento = document.getElementById("secaoPagamento");

  if (modo === "retirada") {
    areaEntrega.classList.add("hidden"); // Usa classes em vez de .style.display
    areaEntrega.classList.remove("show");
    inputEndereco.required = false;
    selectBairro.required = false;
    taxaEntregaAtual = 0;
    secaoPagamento.style.display = "block";
  } else {
    areaEntrega.classList.remove("hidden"); // Remove a classe que esconde
    areaEntrega.classList.add("show"); // Adiciona a classe que mostra (com animação)
  }
  closeModal("modalModoEntrega");
  openPopup("modalDados");
  atualizarResumo();
}

function atualizarTaxaEntrega() {
  const selectBairro = document.getElementById("selectBairro");
  const secaoPagamento = document.getElementById("secaoPagamento");
  const areaPixCopiaCola = document.getElementById("areaPixCopiaCola");

  if (!selectBairro || !secaoPagamento) return; // Segurança contra erro de elemento nulo

  const bairro = selectBairro.value;

  // Garante que a seção de pagamento sempre esteja visível por padrão
  secaoPagamento.style.display = "block";

  if (modoEntrega === "retirada") {
    taxaEntregaAtual = 0;
  } else {
    if (bairro === "Campo Grande") {
      taxaEntregaAtual = 0;
      // Removida a linha que escondia a seção de pagamento aqui
      alert(
        "Para Campo Grande, a taxa de entrega é sob consulta (calculada por distância). O valor será informado no WhatsApp.",
      );
    } else {
      const option = selectBairro.selectedOptions[0];
      taxaEntregaAtual = parseFloat(option.getAttribute("data-taxa") || 0);
    }
  }

  if (areaPixCopiaCola) areaPixCopiaCola.style.display = "none";
  atualizarResumo();
}

// --- Exibição do Cardápio ---
function showCategory(cat, btn) {
  currentCategory = cat;
  if (btn) {
    document
      .querySelectorAll(".sessao-topo button")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    btn.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  const container = document.getElementById("cardapio");
  if (!container) return;
  container.innerHTML = "";
  const items = cardapioData[cat] || [];

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "card";

    if (item.img) {
      const img = document.createElement("img");
      img.src = item.img;
      img.onclick = () => openImagePopup(item.img);
      card.appendChild(img);
    }

    card.innerHTML += `<h3>${item.nome}</h3>`;
    if (item.descricao)
      card.innerHTML += `<div class="descricao">${item.descricao}</div>`;

    const optionsRow = document.createElement("div");
    optionsRow.className = "options-row";
    const opcoes = item.opcoes || [""];
    const precos = Array.isArray(item.precoBase)
      ? item.precoBase
      : [item.precoBase];

    opcoes.forEach((op, opIndex) => {
      const price = precos[opIndex] !== undefined ? precos[opIndex] : precos[0];
      const btnOp = document.createElement("button");
      btnOp.innerHTML = `<span>${
        op || "Adicionar"
      }</span> <span>R$ ${parseFloat(price).toFixed(2)}</span>`;

      const isMilkShake = item.nome.toLowerCase().includes("milk shake");
      const temPersonalizacao = !!(
        item.ingredientesPadrao ||
        item.paidExtras ||
        item.adicionais ||
        item.combo
      );

      if (isMilkShake) {
        btnOp.className = "btn-add";
        btnOp.onclick = () => {
          pendingMilkShake = {
            name: item.nome + (op ? " " + op : ""),
            price: parseFloat(price),
          };
          openPopup("popupCalda");
        };
      } else if (temPersonalizacao) {
        btnOp.className = "btn-personalizar";
        btnOp.onclick = () => openPopupCustom(cat, index, opIndex);
      } else {
        btnOp.className = "btn-add";
        btnOp.onclick = () =>
          addToCart(item.nome + (op ? " " + op : ""), parseFloat(price));
      }
      optionsRow.appendChild(btnOp);
    });
    card.appendChild(optionsRow);
    container.appendChild(card);
  });
}

// --- Auxiliar de Renderização de UI ---
function renderUIElements(container, config) {
  container.innerHTML = "";
  config.forEach((section) => {
    if (section.title) {
      container.innerHTML += `<h4>${section.title}</h4>`;
    }
    section.elements.forEach((el) => {
      if (el.type === "checkboxes") {
        el.items.forEach((item) => {
          container.innerHTML += `<label><input type="checkbox" data-type="${el.dataType}" value="${item.value}" ${item.price ? `data-price="${item.price}"` : ""}><span>${item.label}</span></label>`;
        });
      } else if (el.type === "select") {
        let options = el.options
          .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
          .join("");
        container.innerHTML += `<select id="${el.id}"><option value="">${el.placeholder}</option>${options}</select>`;
      } else if (el.type === "textareas") {
        container.innerHTML += `<textarea id="${el.id}" placeholder="${el.placeholder}"></textarea>`;
      }
    });
  });
}

// --- Customização Unificada ---
function startCustomization(item, opIdx, isPromo) {
  comboCustomization = {
    item,
    currentStep: 0,
    totalCustomizations: { burgers: Array(item.burgers.length).fill({}) },
    basePrice: Array.isArray(item.precoBase)
      ? item.precoBase[opIdx]
      : item.precoBase,
    isPromo,
    totalSteps: item.burgers.length + (isPromo ? 0 : 2), // Burgers + batatas + bebida se não promo
    upgrades: isPromo ? {} : item.upgrades || {},
  };

  renderCustomizationStep();
}

function openPopupCustom(cat, itemIdx, opIdx) {
  currentItem = { cat, itemIdx, opIdx };
  const item = cardapioData[cat][itemIdx];
  const opNome = (item.opcoes && item.opcoes[opIdx]) || "";

  document.getElementById("popupCustomTitle").textContent =
    `Personalizar: ${item.nome}`;

  // Se for Combo (Promoções), mantém o fluxo de passos.
  // Se for Clone, forçamos a personalização manual aqui.
  if (item.combo && cat !== "Clones") {
    startCustomization(item, opIdx, cat === "Promoções");
    return;
  }

  const container = document.getElementById("popupQuestion");
  const config = [];

  // --- LÓGICA PARA CLONES (Múltiplos Burgers) ---
  if (cat === "Clones" && item.burgers) {
    item.burgers.forEach((burgerNome, index) => {
      // Pega ingredientes específicos (simples ou duplo) definidos no seu JSON
      const ings =
        (index === 0 ? item.simplesIngredients : item.duploIngredients) ||
        item.ingredientesPadrao ||
        [];
      const extras = item.paidExtras || [];

      // Seção de Remoção por Burger
      if (ings.length > 0) {
        config.push({
          title: `Remover de: ${burgerNome}`,
          elements: [
            {
              type: "checkboxes",
              dataType: `remove-b${index}`, // ID Único: remove-b0, remove-b1...
              items: ings.map((ing) => ({ value: ing, label: `Sem ${ing}` })),
            },
          ],
        });
      }

      // Seção de Adicionais por Burger
      if (extras.length > 0) {
        config.push({
          title: `Adicionais para: ${burgerNome}`,
          elements: [
            {
              type: "checkboxes",
              dataType: `extra-b${index}`, // ID Único: extra-b0, extra-b1...
              items: extras.map((ext) => ({
                value: ext.nome,
                label: `${ext.nome} (+R$ ${ext.preco.toFixed(2)})`,
                price: ext.preco,
              })),
            },
          ],
        });
      }
    });
  } else {
    // --- LÓGICA NORMAL (Artesanais, etc) ---
    const ings =
      (item.ingredientesPorOpcao && item.ingredientesPorOpcao[opNome]) ||
      item.ingredientesPadrao ||
      item.ingredientes ||
      [];
    const extras = item.paidExtras || item.adicionais || [];

    if (ings.length > 0) {
      config.push({
        title: "Remover ingredientes:",
        elements: [
          {
            type: "checkboxes",
            dataType: "remove",
            items: ings.map((ing) => ({ value: ing, label: `Sem ${ing}` })),
          },
        ],
      });
    }

    if (extras.length > 0) {
      config.push({
        title: "Adicionais pagos:",
        elements: [
          {
            type: "checkboxes",
            dataType: "extra",
            items: extras.map((ext) => ({
              value: ext.nome,
              label: `${ext.nome} (+R$ ${ext.preco.toFixed(2)})`,
              price: ext.preco,
            })),
          },
        ],
      });
    }
  }

  // Ponto da Carne e Obs (Comum a todos)
  if (cat !== "Batata Frita") {
    config.push({
      title: "Selecione o ponto:",
      elements: [
        {
          type: "select",
          id: "pontoCarne",
          placeholder: "Selecione",
          options: [
            { value: "mal passado", label: "Mal passado" },
            { value: "no ponto", label: "No ponto" },
            { value: "bem passado", label: "Bem passado" },
          ],
        },
      ],
    });
  }

  config.push({
    title: "Observações:",
    elements: [
      {
        type: "textareas",
        id: "obsText",
        placeholder: "Ex: Tirar cebola de um, caprichar no molho...",
      },
    ],
  });

  renderUIElements(container, config);
  const btnConfirm = document.querySelector("#popupCustom .btn-primary");
  btnConfirm.onclick = confirmSimpleCustom;
  openPopup("popupCustom");
}
function addValidationListeners(container) {
  const selects = container.querySelectorAll("select");
  selects.forEach((select) => {
    select.addEventListener("change", () => select.classList.remove("error"));
  });
}

function renderCustomizationStep() {
  const { item, currentStep, isPromo, totalSteps, upgrades } =
    comboCustomization;
  const container = document.getElementById("popupQuestion");
  const burgersLength = item.burgers ? item.burgers.length : 0;

  // --- GARANTE O SCROLL PARA O TOPO SEMPRE ---
  const popup = document.getElementById("popupCustom");
  if (popup) popup.scrollTop = 0;
  if (container) container.scrollTop = 0;

  // Define o título do modal baseado no passo atual
  document.getElementById("popupCustomTitle").textContent =
    currentStep < burgersLength
      ? `Personalizar ${item.burgers[currentStep]}`
      : isPromo
        ? "Finalizar Combo"
        : currentStep === burgersLength
          ? "Personalizar Batatas"
          : "Personalizar Bebida";

  const config = [];

  if (currentStep < burgersLength) {
    const burgerName = item.burgers[currentStep];

    // LÓGICA DE INGREDIENTES: Verifica se o burger atual é Duplo ou Simples
    let ingredients = [];
    if (burgerName.toLowerCase().includes("duplo")) {
      ingredients = item.duploIngredients || [];
    } else {
      ingredients = item.simplesIngredients || [];
    }

    if (ingredients.length > 0) {
      config.push({
        title: "Remover:",
        elements: [
          {
            type: "checkboxes",
            dataType: "remove",
            items: ingredients.map((ing) => ({
              value: ing,
              label: `Sem ${ing}`,
            })),
          },
        ],
      });
    }

    const extras = item.paidExtras || [];
    if (extras.length > 0) {
      config.push({
        title: "Adicionais:",
        elements: [
          {
            type: "checkboxes",
            dataType: "extra",
            items: extras.map((ext) => ({
              value: ext.nome,
              label: `${ext.nome} (+R$ ${ext.preco.toFixed(2)})`,
              price: ext.preco,
            })),
          },
        ],
      });
    }

    config.push({
      title: "Ponto da Carne:",
      elements: [
        {
          type: "select",
          id: "pontoCarne",
          placeholder: "Selecione",
          options: [
            { value: "mal passado", label: "Mal passado" },
            { value: "no ponto", label: "No ponto" },
            { value: "bem passado", label: "Bem passado" },
          ],
        },
      ],
    });
  } else if (!isPromo && currentStep === burgersLength) {
    // Configuração de Batatas para combos artesanais
    const batataUpgrades = upgrades.batata || [];
    if (batataUpgrades.length > 0) {
      config.push({
        title: "Tamanho da Batata:",
        elements: [
          {
            type: "select",
            id: "batataTamanho",
            placeholder: "Selecione",
            options: batataUpgrades.map((opt) => ({
              value: opt.nome,
              label: `${opt.nome}${opt.adicional > 0 ? ` (+R$ ${opt.adicional})` : ""}`,
            })),
          },
        ],
      });
    }

    config.push({
      title: "Adicionais para Batata:",
      elements: [
        { nome: "Cheddar", preco: 2 },
        { nome: "Bacon", preco: 2 },
        { nome: "Calabresa", preco: 3 },
      ].map((ext) => ({
        type: "select",
        id: `batataAdicional-${ext.nome}`,
        placeholder: `Adicionar ${ext.nome}?`,
        options: [
          { value: "", label: "Não adicionar" },
          { value: "Incluso", label: `Incluso (+R$ ${ext.preco.toFixed(2)})` },
          {
            value: "Separado",
            label: `Separado (+R$ ${(ext.preco + 1).toFixed(2)})`,
          },
        ],
      })),
    });
  } else if (!isPromo && currentStep === burgersLength + 1) {
    // Configuração de Bebidas
    const bebidaUpgrades = upgrades.bebida || [];
    if (bebidaUpgrades.length > 0) {
      config.push({
        title: "Bebida:",
        elements: [
          {
            type: "select",
            id: "bebidaType",
            placeholder: "Selecione",
            options: bebidaUpgrades.map((opt) => ({
              value: opt.nome,
              label: `${opt.nome}${opt.adicional > 0 ? ` (+R$ ${opt.adicional})` : ""}`,
            })),
          },
        ],
      });
    }
  }

  config.push({
    title: "Observações:",
    elements: [
      { type: "textareas", id: "obsText", placeholder: "Ex: Sem cebola..." },
    ],
  });

  renderUIElements(container, config);
  addValidationListeners(container);

  // REATRIBUI O BOTÃO DE CONFIRMAR
  const btnConfirm = document.querySelector("#popupCustom .btn-primary");
  if (btnConfirm) btnConfirm.onclick = nextCustomizationStep;

  openPopup("popupCustom");
}

// --- Gerenciamento de Estado Centralizado ---
function collectFormData(container) {
  const data = {};
  data.removed = Array.from(
    container.querySelectorAll('input[data-type="remove"]:checked'),
  ).map((i) => i.value);
  data.extras = Array.from(
    container.querySelectorAll('input[data-type="extra"]:checked'),
  ).map((i) => ({
    nome: i.value,
    preco: parseFloat(i.dataset.price),
  }));
  data.ponto = container.querySelector("#pontoCarne")?.value || "";
  data.obs = container.querySelector("#obsText")?.value.trim() || undefined;

  // Para batatas
  const batataSelect = container.querySelector("#batataTamanho");
  if (batataSelect) {
    const selectedNome = batataSelect.value;
    const batataOpt = comboCustomization.upgrades.batata.find(
      (opt) => opt.nome === selectedNome,
    );
    if (batataOpt) {
      const tamanhoMatch =
        batataOpt.nome.match(/Batata (P|M|G)/) ||
        batataOpt.nome.match(/para Batata (P|M|G)/);
      data.batataTamanho = tamanhoMatch ? tamanhoMatch[1] : "";
      data.batataAdicional = batataOpt.adicional;
    }
  }

  data.batataAdicionais = [];
  data.batataAdicionaisPosicao = {};
  ["Cheddar", "Bacon", "Calabresa"].forEach((nome) => {
    const select = container.querySelector(`#batataAdicional-${nome}`);
    if (select && select.value) {
      let preco = { Cheddar: 2, Bacon: 2, Calabresa: 3 }[nome];
      if (select.value === "Separado") preco += 1;
      data.batataAdicionais.push({ nome, preco });
      data.batataAdicionaisPosicao[nome] = select.value;
    }
  });

  // Para bebida
  const bebidaSelect = container.querySelector("#bebidaType");
  if (bebidaSelect) {
    const selectedNome = bebidaSelect.value;
    const bebidaOpt = comboCustomization.upgrades.bebida.find(
      (opt) => opt.nome === selectedNome,
    );
    data.bebidaType = selectedNome;
    data.bebidaAdicional = bebidaOpt ? bebidaOpt.adicional : 0;
  }

  // Para batata não combo
  data.adicionaisPosicao = {};
  if (currentItem && currentItem.cat === "Batata Frita") {
    ["Bacon", "Cheddar"].forEach((nome) => {
      const select = container.querySelector(`#adicional-${nome}`);
      if (select && select.value) {
        let preco = { Bacon: 2, Cheddar: 2 }[nome];
        if (select.value === "Separado") preco += 1;
        data.extras.push({ nome, preco });
        data.adicionaisPosicao[nome] = select.value;
      }
    });
  }

  return data;
}

function validateStep(
  formData,
  currentStep,
  burgersLength,
  isPromo,
  container,
) {
  let valid = true;
  let selectId = null;
  let alertMsg = "";

  if (currentStep < burgersLength) {
    if (!formData.ponto) {
      valid = false;
      selectId = "pontoCarne";
      alertMsg = "Por favor, selecione o ponto da carne.";
    }
  } else if (!isPromo && currentStep === burgersLength) {
    if (!formData.batataTamanho) {
      valid = false;
      selectId = "batataTamanho";
      alertMsg = "Por favor, selecione o tamanho da batata.";
    }
  } else if (!isPromo && currentStep === burgersLength + 1) {
    if (!formData.bebidaType) {
      valid = false;
      selectId = "bebidaType";
      alertMsg = "Por favor, selecione a bebida.";
    }
  }

  if (!valid && selectId) {
    const select = container.querySelector(`#${selectId}`);
    if (select) {
      select.classList.add("error");
    }
    alert(alertMsg);
  }

  return valid;
}

function saveCustomizationStep() {
  const { currentStep, item, totalCustomizations, isPromo } =
    comboCustomization;
  const burgersLength = item.burgers.length;
  const container = document.getElementById("popupQuestion");
  const formData = collectFormData(container);

  if (currentStep < burgersLength) {
    totalCustomizations.burgers[currentStep] = {
      burgerName: item.burgers[currentStep],
      removed: formData.removed,
      extras: formData.extras,
      ponto: formData.ponto || undefined,
      obs: formData.obs,
    };
  } else if (!isPromo && currentStep === burgersLength) {
    totalCustomizations.batatas = {
      tamanho: formData.batataTamanho,
      adicional: formData.batataAdicional || 0,
      adicionais: formData.batataAdicionais,
      adicionaisPosicao: formData.batataAdicionaisPosicao,
      obs: formData.obs,
    };
  } else if (!isPromo && currentStep === burgersLength + 1) {
    totalCustomizations.bebida = {
      type: formData.bebidaType,
      adicional: formData.bebidaAdicional || 0,
      obs: formData.obs,
    };
  }
}

function nextCustomizationStep() {
  const container = document.getElementById("popupQuestion");
  const formData = collectFormData(container);
  const { currentStep, totalSteps, item, isPromo } = comboCustomization;
  const burgersLength = item.burgers ? item.burgers.length : 0;

  // Validação do passo atual (ponto da carne, etc)
  if (!validateStep(formData, currentStep, burgersLength, isPromo, container)) {
    return;
  }

  // Salva o que foi escolhido no passo atual
  saveCustomizationStep();

  // Avança o contador de passos
  comboCustomization.currentStep++;

  // Se ainda houverem passos (burgers, batatas ou bebidas), renderiza o próximo
  if (comboCustomization.currentStep < totalSteps) {
    renderCustomizationStep();

    // Força o scroll do modal para o topo ao mudar de passo
    const popup = document.getElementById("popupCustom");
    if (popup) popup.scrollTop = 0;
  } else {
    // Se chegou ao fim, calcula os totais e adiciona ao carrinho
    const { totalCustomizations, basePrice } = comboCustomization;

    // Soma extras dos burgers
    let extrasTotal = totalCustomizations.burgers.reduce(
      (acc, b) => acc + b.extras.reduce((s, e) => s + e.preco, 0),
      0,
    );

    // Se não for promoção (Combo Artesanal), soma extras de batata e bebida
    if (!isPromo) {
      if (
        totalCustomizations.batatas &&
        totalCustomizations.batatas.adicionais
      ) {
        extrasTotal += totalCustomizations.batatas.adicionais.reduce(
          (s, e) => s + e.preco,
          0,
        );
      }
      extrasTotal += totalCustomizations.batatas
        ? totalCustomizations.batatas.adicional || 0
        : 0;
      extrasTotal += totalCustomizations.bebida
        ? totalCustomizations.bebida.adicional || 0
        : 0;
    }

    // Adiciona o item finalizado ao carrinho
    addToCart(`${item.nome}`, basePrice + extrasTotal, totalCustomizations);

    // Fecha o modal
    closeModal("popupCustom");
  }
}

function previousCustomizationStep() {
  saveCustomizationStep();
  if (comboCustomization.currentStep > 0) {
    comboCustomization.currentStep--;
    renderCustomizationStep();
  }
}

function confirmSimpleCustom() {
  const item = cardapioData[currentItem.cat][currentItem.itemIdx];
  const opNome = item.opcoes[currentItem.opIdx];
  const precoBase = Array.isArray(item.precoBase)
    ? item.precoBase[currentItem.opIdx]
    : item.precoBase;

  const container = document.getElementById("popupQuestion");
  const formData = collectFormData(container);

  // VALIDAÇÃO CONDICIONAL: Ignora o ponto se for Batata Frita
  if (currentItem.cat !== "Batata Frita" && !formData.ponto) {
    const select = container.querySelector("#pontoCarne");
    if (select) {
      select.classList.add("error");
    }
    alert("Por favor, selecione o ponto da carne.");
    return;
  }

  const extrasTotal = formData.extras.reduce((acc, e) => acc + e.preco, 0);

  addToCart(`${item.nome} ${opNome || ""}`, precoBase + extrasTotal, formData);
  closeModal("popupCustom");
}

// --- Carrinho ---
function addToCart(name, price, custom = {}) {
  if (sounds.add) sounds.add.play().catch(() => {});
  const customKey = JSON.stringify(custom);
  const existing = cart.findIndex(
    (c) => c.item === name.trim() && JSON.stringify(c.custom) === customKey,
  );

  if (existing !== -1) cart[existing].quantity += 1;
  else cart.push({ item: name.trim(), price, quantity: 1, custom });

  updateCartDisplay();
}

function updateCartDisplay() {
  const sub = cart.reduce((acc, i) => acc + i.price * i.quantity, 0);
  const count = cart.reduce((acc, i) => acc + i.quantity, 0);

  document.getElementById("cartCount").textContent = count;
  document.getElementById("cartTotalDisplay").textContent = `R$ ${sub.toFixed(
    2,
  )}`;

  const itemsEl = document.getElementById("cartItems");
  if (itemsEl) {
    itemsEl.innerHTML = "";
    cart.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "cart-item";
      div.innerHTML = `
        <div class="cart-item-content">
          <strong>${item.item}</strong><br>
          <small>${generateDetails(item.custom, true)}</small>
          <div class="cart-item-price">
  R$ ${(item.price * item.quantity).toFixed(2)}
</div>
        </div>
        <div class="cart-controls">
          <button onclick="changeQuantity(${idx},-1)">-</button>
          <span>${item.quantity}</span>
          <button onclick="changeQuantity(${idx},1)">+</button>
        </div>`;
      itemsEl.appendChild(div);
    });
  }
}

function groupRemoved(removed) {
  let grouped = [];
  let remaining = [...removed];

  const veggies = ["Alface", "Tomate", "Cebola caramelizada"];
  const salad = ["Alface", "Tomate"];
  const molhoVariants = ["Molho artesanal", "Molho"];
  const queijo = "Cheddar fatiado";

  if (veggies.every((v) => remaining.includes(v))) {
    grouped.push("sem verduras");
    remaining = remaining.filter((r) => !veggies.includes(r));
  } else if (salad.every((v) => remaining.includes(v))) {
    grouped.push("sem salada");
    remaining = remaining.filter((r) => !salad.includes(r));
  }

  if (molhoVariants.some((m) => remaining.includes(m))) {
    grouped.push("sem molho");
    remaining = remaining.filter((r) => !molhoVariants.includes(r));
  }

  if (remaining.includes(queijo)) {
    grouped.push("sem queijo");
    remaining = remaining.filter((r) => r !== queijo);
  }

  const singles = remaining.map((r) => `sem ${r.toLowerCase()}`);

  return [...grouped, ...singles].join(", ");
}

function generateDetails(c, isHTML = false) {
  if (!c) return "";
  const p = [];
  const sep = isHTML ? "<br>" : "\n";

  if (c.removed?.length) {
    const removedStr = groupRemoved(c.removed);
    if (removedStr) p.push(`Sem: ${removedStr}`);
  }
  if (c.extras?.length)
    p.push(
      `Adicional: ${c.extras.map((e) => `${e.nome}${c.adicionaisPosicao && c.adicionaisPosicao[e.nome] ? ` (${c.adicionaisPosicao[e.nome]})` : ""}`).join(", ")}`,
    );
  if (c.ponto) p.push(`Ponto: ${c.ponto}`);
  if (c.obs) p.push(`Obs: ${c.obs}`);

  if (c.burgers) {
    c.burgers.forEach((b) => {
      let bDetails = `${b.burgerName}: `;
      if (b.extras.length)
        bDetails += `+${b.extras.map((e) => e.nome).join(", ")} `;
      if (b.removed.length) {
        const removedStr = groupRemoved(b.removed);
        if (removedStr) bDetails += `Sem ${removedStr} `;
      }
      if (b.ponto) bDetails += `Ponto: ${b.ponto} `;
      if (b.obs) bDetails += `Obs: ${b.obs}`;
      p.push(bDetails.trim());
    });
  }

  if (c.batatas) {
    let bDetails = `Batatas (${c.batatas.tamanho})`;
    if (c.batatas.adicionais.length) {
      const adicionaisStr = c.batatas.adicionais
        .map((e) => `${e.nome} (${c.batatas.adicionaisPosicao[e.nome]})`)
        .join(", ");
      bDetails += `: +${adicionaisStr}`;
    }
    if (c.batatas.obs) bDetails += ` | Obs: ${c.batatas.obs}`;
    p.push(bDetails.trim());
  }

  if (c.bebida) {
    let bDetails = `Bebida: ${c.bebida.type} `;
    if (c.bebida.obs) bDetails += `Obs: ${c.bebida.obs}`;
    p.push(bDetails.trim());
  }

  return p.join(sep);
}

function changeQuantity(idx, d) {
  cart[idx].quantity += d;
  if (cart[idx].quantity <= 0) cart.splice(idx, 1);
  updateCartDisplay();
}

// Função de Validação Melhorada (Chame antes de enviarZap)
function validarFormulario() {
  const errors = [];
  const nome = document.getElementById("inputNome").value.trim();
  if (!nome) errors.push({ field: "inputNome", msg: "Nome é obrigatório." });

  if (modoEntrega === "entrega") {
    const endereco = document.getElementById("inputEndereco").value.trim();
    const bairro = document.getElementById("selectBairro").value;
    if (!endereco)
      errors.push({ field: "inputEndereco", msg: "Endereço é obrigatório." });
    if (!bairro)
      errors.push({ field: "selectBairro", msg: "Bairro é obrigatório." });
  }

  const pag = document.getElementById("selectPagamento").value;
  if (modoEntrega === "entrega" && bairro !== "Campo Grande" && !pag) {
    errors.push({
      field: "selectPagamento",
      msg: "Forma de pagamento é obrigatória.",
    });
  }

  if (pag === "Dinheiro") {
    const troco = parseFloat(
      document.getElementById("inputTroco").value.trim(),
    );
    const total = parseFloat(
      document
        .getElementById("resumoTotal")
        .textContent.replace("R$ ", "")
        .replace(",", "."),
    );
    if (isNaN(troco) || troco < total) {
      errors.push({
        field: "inputTroco",
        msg: "Troco deve ser maior ou igual ao total.",
      });
    }
  }

  // Limpa erros anteriores
  document
    .querySelectorAll(".input-error")
    .forEach((el) => el.classList.remove("input-error"));
  document.querySelectorAll(".error-message").forEach((el) => el.remove());

  // Adiciona erros
  errors.forEach((err) => {
    const field = document.getElementById(err.field);
    field.classList.add("input-error");
    const msg = document.createElement("span");
    msg.className = "error-message";
    msg.textContent = err.msg;
    field.parentNode.appendChild(msg);
  });

  return errors.length === 0;
}

// Atualize exibições condicionais para adicionar classe 'show'
function gerenciarExibicaoPix() {
  const areaPix = document.getElementById("areaPixCopiaCola");
  areaPix.classList.toggle(
    "hidden",
    document.getElementById("selectPagamento").value !== "Pix",
  );
  if (!areaPix.classList.contains("hidden")) areaPix.classList.add("show");
}

// --- Finalização e WhatsApp ---
function enviarZap(e) {
  if (e) e.preventDefault();

  // 1. Captura de elementos com fallback para evitar erros de 'null'
  const elNome = document.getElementById("inputNome");
  const elPagamento = document.getElementById("selectPagamento");
  const elEndereco = document.getElementById("inputEndereco");
  const elBairro = document.getElementById("selectBairro");
  const elTroco = document.getElementById("inputTroco");
  const elTotal = document.getElementById("resumoTotal");

  const nome = elNome ? elNome.value.trim() : "";
  const pag = elPagamento ? elPagamento.value : "";
  const endereco = elEndereco ? elEndereco.value.trim() : "";
  const bairro = elBairro ? elBairro.value : "";
  const total = elTotal
    ? parseFloat(elTotal.textContent.replace("R$ ", "").replace(",", "."))
    : 0;

  // 2. Validação Unificada
  if (!nome) {
    alert("Por favor, informe seu nome.");
    return;
  }

  if (modoEntrega === "entrega") {
    if (!endereco || endereco.length < 5) {
      alert("Por favor, informe o endereço completo.");
      return;
    }
    if (!bairro) {
      alert("Por favor, selecione o bairro.");
      return;
    }
    // Pagamento só é obrigatório se NÃO for Campo Grande (onde é combinado no Zap)
    if (bairro !== "Campo Grande" && !pag) {
      alert("Por favor, selecione a forma de pagamento.");
      return;
    }
  }

  // 3. Validação de Troco
  let trocoTexto = "";
  if (pag === "Dinheiro") {
    const valorTroco = elTroco ? parseFloat(elTroco.value) : 0;
    if (isNaN(valorTroco) || valorTroco < total) {
      alert("O valor do troco deve ser maior ou igual ao total do pedido.");
      return;
    }
    trocoTexto = `%0a*Troco para:* R$ ${valorTroco.toFixed(2)}`;
  }

  // 4. Montagem da Mensagem (Melhorada)
  let msg = `*PEDIDO RIBBSZN*%0a`;
  msg += `*Cliente:* ${nome}%0a`;
  msg += `*Modo:* ${modoEntrega === "entrega" ? "Delivery 🛵" : "Retirada 🛍️"}%0a`;

  if (modoEntrega === "entrega") {
    msg += `*Endereço:* ${endereco}%0a`;
    msg += `*Bairro:* ${bairro}%0a`;
  }

  msg += `%0a*ITENS:*%0a`;
  cart.forEach((c) => {
    msg += `• ${c.quantity}x ${c.item}%0a`;
    let details = generateDetails(c.custom);
    if (details) {
      msg += `  _${details.replace(/<br>/g, "%0a  ").replace(/\n/g, "%0a  ")}_%0a`;
    }
  });

  const formaPagamentoTexto =
    modoEntrega === "entrega" && bairro === "Campo Grande"
      ? "A combinar (Distância)"
      : pag || "Não selecionado";

  msg += `%0a*Pagamento:* ${formaPagamentoTexto}`;
  msg += trocoTexto;

  if (modoEntrega === "entrega" && bairro === "Campo Grande") {
    msg += `%0a*Taxa:* A DEFINIR%0a*TOTAL (Pendente Taxa):* R$ ${total.toFixed(2)}`;
  } else {
    msg += `%0a*Taxa:* R$ ${taxaEntregaAtual.toFixed(2)}%0a*TOTAL:* R$ ${total.toFixed(2)}`;
  }

  // 5. Envio Final
  const url = `https://wa.me/${whatsappNumber}?text=${msg}`;
  window.open(url, "_blank");

  finalizarPedido();
}

function finalizarPedido() {
  localStorage.removeItem("ribbs_cart");
  alert("Pedido enviado com sucesso!");
  location.reload();
}

// --- Helpers de UI ---
function openPopup(id) {
  document.getElementById("backdrop").classList.add("show");
  const popup = document.getElementById(id);
  if (popup) {
    popup.classList.add("show");
    // Força scroll para o topo sempre que qualquer popup for aberto
    popup.scrollTop = 0;
  }
}

function closeModal(id) {
  document.getElementById("backdrop").classList.remove("show");
  const el = document.getElementById(id);
  if (el) el.classList.remove("show");
}

// --- Exposição para o HTML (window) ---
Object.assign(window, {
  showCategory,
  toggleCart: () =>
    document.getElementById("footerCart").classList.toggle("open"),
  changeQuantity,
  iniciarCheckout: () => {
    if (cart.length) {
      document.getElementById("footerCart").classList.remove("open");
      openPopup("modalModoEntrega");
    }
  },
  selecionarModo,
  atualizarTaxaEntrega,
  gerenciarExibicaoPix,
  copiarChavePix,
  verificarTroco,
  enviarZap,
  closeModal,
  openPopupCustom,
  selectCalda: (c) => {
    addToCart(`${pendingMilkShake.name} (Calda ${c})`, pendingMilkShake.price);
    closeModal("popupCalda");
  },
  openImagePopup: (src) => {
    document.getElementById("enlargedImage").src = src;
    openPopup("popupImage");
  },
  closeImagePopup: () => closeModal("popupImage"),
  closeCaldaPopup: () => closeModal("popupCalda"),
  clearCart: () => {
    if (confirm("Deseja limpar o carrinho?")) {
      cart = [];
      updateCartDisplay();
    }
  },
});
