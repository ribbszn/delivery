// taxas.js

// ─── Constantes ───────────────────────────────────────────────────────────────
const ORIGIN_ADDRESS =
  "Rua Lauro de Souza, 465 - Campo Grande, Recife, CEP 52040-370";

// ─── Faixas de distância ──────────────────────────────────────────────────────
let distanceRanges = [
  { min: 0, max: 100, price: 5 },
  { min: 101, max: 500, price: 7 },
  { min: 501, max: 1000, price: 10 },
  { min: 1001, max: Infinity, price: 15 },
];

if (localStorage.getItem("distanceRanges")) {
  try {
    distanceRanges = JSON.parse(localStorage.getItem("distanceRanges"));
  } catch (e) {
    console.warn("Erro ao carregar distanceRanges:", e);
  }
}

function saveRanges() {
  localStorage.setItem("distanceRanges", JSON.stringify(distanceRanges));
}

// ─── Taxas por rua ────────────────────────────────────────────────────────────
let streetFees = [];

if (localStorage.getItem("streetFees")) {
  try {
    streetFees = JSON.parse(localStorage.getItem("streetFees"));
  } catch (e) {
    console.warn("Erro ao carregar streetFees:", e);
  }
}

function saveStreetFees() {
  localStorage.setItem("streetFees", JSON.stringify(streetFees));
}

function normalizeStreetName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getStreetFee(address) {
  if (!address || streetFees.length === 0) return 0;
  const norm = normalizeStreetName(address);
  for (const entry of streetFees) {
    if (norm.includes(entry.normalizedName)) return entry.fee;
  }
  return 0;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = "success", duration = 3200) {
  const icons = { success: "✓", error: "✕", info: "ℹ" };
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[type] ?? "•"}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    toast.addEventListener("animationend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const mainEl = document.getElementById("main");

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("active");
  mainEl.classList.add("blurred");
  sidebar.setAttribute("aria-hidden", "false");
  document.getElementById("sidebar-close").focus();
  document.body.style.overflow = "hidden";
  // Inicializar autocomplete de rua quando abrir pela primeira vez
  initStreetAdminAutocomplete();
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
  mainEl.classList.remove("blurred");
  sidebar.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  document.getElementById("sidebar-open").focus();
}

document.getElementById("sidebar-open").addEventListener("click", openSidebar);
document
  .getElementById("sidebar-close")
  .addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

// Fechar com Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebar.classList.contains("open")) closeSidebar();
});

// ─── Autocomplete: campo principal ────────────────────────────────────────────
let autocompleteElement;
let selectedPlace = null;

async function initAutocomplete() {
  try {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    autocompleteElement = new PlaceAutocompleteElement({
      componentRestrictions: { country: "BR" },
    });
    document
      .getElementById("autocomplete-container")
      .appendChild(autocompleteElement);

    autocompleteElement.addEventListener("gmp-placeselect", async (event) => {
      const { place } = event;
      selectedPlace = await place.fetchFields({
        fields: ["displayName", "formattedAddress", "addressComponents"],
      });
    });

    // Enter dispara o cálculo
    autocompleteElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // Pequeno delay para o gmp-placeselect processar se uma sugestão foi confirmada
        setTimeout(() => document.getElementById("calculate-btn").click(), 80);
      }
    });
  } catch (err) {
    console.error("Erro ao inicializar autocomplete:", err);
    showError("Erro ao carregar o Google Maps.");
  }
}

// ─── Autocomplete: campo admin (rua) ──────────────────────────────────────────
let streetAdminAutocomplete;
let selectedStreetPlace = null;
let streetAutocompleteReady = false;

async function initStreetAdminAutocomplete() {
  if (streetAutocompleteReady) return;
  try {
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");
    streetAdminAutocomplete = new PlaceAutocompleteElement({
      componentRestrictions: { country: "BR" },
    });
    document
      .getElementById("street-autocomplete-container")
      .appendChild(streetAdminAutocomplete);

    streetAdminAutocomplete.addEventListener(
      "gmp-placeselect",
      async (event) => {
        const { place } = event;
        selectedStreetPlace = await place.fetchFields({
          fields: ["displayName", "formattedAddress", "addressComponents"],
        });
      },
    );

    // Digitar manualmente invalida a seleção anterior
    streetAdminAutocomplete.addEventListener("input", () => {
      selectedStreetPlace = null;
    });

    streetAutocompleteReady = true;
  } catch (err) {
    console.error("Erro ao inicializar autocomplete de rua:", err);
  }
}

function resetStreetAutocomplete() {
  document.getElementById("street-autocomplete-container").innerHTML = "";
  streetAutocompleteReady = false;
  selectedStreetPlace = null;
  initStreetAdminAutocomplete();
}

// ─── Cálculo ──────────────────────────────────────────────────────────────────
function calculateFee(meters) {
  for (const range of distanceRanges) {
    if (meters >= range.min && (meters <= range.max || range.max === Infinity))
      return range.price;
  }
  return null;
}

function formatDistance(meters) {
  return meters >= 1000 ? (meters / 1000).toFixed(1) + " km" : meters + " m";
}

function isInAllowedCity(place) {
  if (!place?.addressComponents) return false;
  const city =
    place.addressComponents
      .find((c) => c.types.includes("administrative_area_level_2"))
      ?.longName.toLowerCase() ?? "";
  return city.includes("recife") || city.includes("olinda");
}

// ─── Botão calcular ───────────────────────────────────────────────────────────
document.getElementById("calculate-btn").addEventListener("click", async () => {
  if (!autocompleteElement) {
    showError("Autocomplete não inicializado.");
    return;
  }

  const input = autocompleteElement.value?.trim();
  if (!input) {
    showError("Por favor, digite um endereço de destino.");
    return;
  }

  showLoading(true);
  hideResult();
  hideError();

  if (selectedPlace) {
    if (!isInAllowedCity(selectedPlace)) {
      showError("Entregas disponíveis apenas em Recife e Olinda.");
      showLoading(false);
      return;
    }
    calculateDistance(selectedPlace.formattedAddress);
  } else {
    calculateDistance(input);
  }
});

async function calculateDistance(destination) {
  try {
    const { DistanceMatrixService } = await google.maps.importLibrary("routes");
    new DistanceMatrixService().getDistanceMatrix(
      {
        origins: [ORIGIN_ADDRESS],
        destinations: [destination],
        travelMode: "DRIVING",
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        showLoading(false);
        if (status !== "OK") {
          showError("Erro ao calcular distância. Tente novamente.");
          return;
        }

        const el = response.rows[0].elements[0];
        if (el.status !== "OK") {
          showError("Endereço não encontrado ou inválido.");
          return;
        }

        const meters = el.distance.value;
        const baseFee = calculateFee(meters);

        if (baseFee === null) {
          showError("Distância fora das faixas configuradas.");
          return;
        }

        const streetExtra = getStreetFee(destination);
        const total = baseFee + streetExtra;

        let html = `
          <span class="result-distance">Distância: ${formatDistance(meters)}</span>
          <span class="result-fee">R$ ${total.toFixed(2)}</span>
        `;
        if (streetExtra > 0) {
          html += `<span class="result-extra">Taxa base R$ ${baseFee.toFixed(2)} + R$ ${streetExtra.toFixed(2)} (taxa da rua)</span>`;
        }
        showResult(html);
      },
    );
  } catch (err) {
    showLoading(false);
    console.error(err);
    showError("Erro ao calcular distância.");
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById("loading").classList.toggle("hidden", !show);
}
function showResult(html) {
  const el = document.getElementById("result");
  el.innerHTML = html;
  el.classList.remove("hidden");
  el.focus();
}
function hideResult() {
  document.getElementById("result").classList.add("hidden");
}
function showError(msg) {
  const el = document.getElementById("error");
  document.getElementById("error-text").textContent = msg;
  el.classList.remove("hidden");
  el.focus();
}
function hideError() {
  document.getElementById("error").classList.add("hidden");
}

// ─── Render: faixas de distância ──────────────────────────────────────────────
function renderRanges() {
  const list = document.getElementById("ranges-list");
  list.innerHTML = "";

  if (distanceRanges.length === 0) {
    list.innerHTML = '<p class="no-items-msg">Nenhuma faixa cadastrada.</p>';
  }

  distanceRanges.forEach((range, index) => {
    const item = document.createElement("div");
    item.className = "range-item";
    item.setAttribute("role", "listitem");
    item.innerHTML = `
      <div class="range-field">
        <label>Mín (m)</label>
        <input type="number" class="min-input" value="${range.min}" placeholder="0">
      </div>
      <div class="range-field">
        <label>Máx (m)</label>
        <input type="number" class="max-input" value="${range.max === Infinity ? "" : range.max}" placeholder="∞">
      </div>
      <div class="range-field">
        <label>Preço R$</label>
        <input type="number" class="price-input" value="${range.price}" step="0.01" placeholder="0.00">
      </div>
      <div class="range-actions">
        <button class="btn-save">Salvar</button>
        <button class="btn-delete">Excluir</button>
      </div>
    `;

    item.querySelector(".btn-save").addEventListener("click", () => {
      const min = parseInt(item.querySelector(".min-input").value);
      const maxRaw = item.querySelector(".max-input").value;
      const max = maxRaw ? parseInt(maxRaw) : Infinity;
      const price = parseFloat(item.querySelector(".price-input").value);
      if (!isNaN(min) && !isNaN(price) && (max === Infinity || !isNaN(max))) {
        distanceRanges[index] = { min, max, price };
        saveRanges();
        renderRanges();
        showToast("Faixa salva!", "success");
      } else {
        showToast("Valores inválidos.", "error");
      }
    });

    item.querySelector(".btn-delete").addEventListener("click", () => {
      distanceRanges.splice(index, 1);
      saveRanges();
      renderRanges();
      showToast("Faixa removida.", "info");
    });

    list.appendChild(item);
  });
}

document.getElementById("add-range-btn").addEventListener("click", () => {
  distanceRanges.push({ min: 0, max: 0, price: 0 });
  saveRanges();
  renderRanges();
  document
    .getElementById("ranges-list")
    .lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

// ─── Render: taxas por rua ────────────────────────────────────────────────────
function renderStreetFees() {
  const list = document.getElementById("street-fees-list");
  list.innerHTML = "";

  if (streetFees.length === 0) {
    list.innerHTML =
      '<p class="no-items-msg">Nenhuma taxa por rua cadastrada.</p>';
    return;
  }

  streetFees.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "street-fee-item";
    item.setAttribute("role", "listitem");
    item.innerHTML = `
      <span class="street-name" title="${entry.streetName}">${entry.streetName}</span>
      <span class="street-price">+ R$ ${entry.fee.toFixed(2)}</span>
      <button class="btn-delete-street" aria-label="Excluir ${entry.streetName}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    item.querySelector(".btn-delete-street").addEventListener("click", () => {
      const name = entry.streetName;
      streetFees.splice(index, 1);
      saveStreetFees();
      renderStreetFees();
      showToast(`"${name}" removida.`, "info");
    });
    list.appendChild(item);
  });
}

// ─── Adicionar nova rua ───────────────────────────────────────────────────────
document.getElementById("add-street-btn").addEventListener("click", () => {
  const errEl = document.getElementById("street-error");
  errEl.classList.add("hidden");

  const feeVal = parseFloat(document.getElementById("street-fee-input").value);
  if (isNaN(feeVal) || feeVal < 0) {
    errEl.textContent = "Informe um valor de taxa válido (≥ 0).";
    errEl.classList.remove("hidden");
    return;
  }

  // Obter nome: prioriza place selecionado, fallback = texto digitado
  let streetName = "";

  if (selectedStreetPlace) {
    const routeComp = selectedStreetPlace.addressComponents?.find((c) =>
      c.types.includes("route"),
    );
    streetName =
      routeComp?.longName ||
      selectedStreetPlace.displayName ||
      selectedStreetPlace.formattedAddress ||
      "";
  }

  if (!streetName && streetAdminAutocomplete) {
    streetName = (streetAdminAutocomplete.value || "").trim();
  }

  if (!streetName) {
    errEl.textContent = "Digite ou selecione o nome de uma rua.";
    errEl.classList.remove("hidden");
    return;
  }

  const normalizedName = normalizeStreetName(streetName);

  if (streetFees.some((e) => e.normalizedName === normalizedName)) {
    errEl.textContent = `Já existe uma taxa para "${streetName}".`;
    errEl.classList.remove("hidden");
    return;
  }

  streetFees.push({ streetName, normalizedName, fee: feeVal });
  saveStreetFees();
  renderStreetFees();

  document.getElementById("street-fee-input").value = "";
  resetStreetAutocomplete();

  showToast(
    `R$ ${feeVal.toFixed(2)} adicionado para "${streetName}"!`,
    "success",
  );
});

// ─── Inicialização ────────────────────────────────────────────────────────────
initAutocomplete();
renderRanges();
renderStreetFees();
