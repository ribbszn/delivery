// taxas.js

// Endereço de origem fixo
const ORIGIN_ADDRESS =
  "Rua Lauro de Souza, 465 - Campo Grande, Recife, CEP 52040-370";

// Faixas de distância iniciais (em metros) e preços (em R$)
// Aqui você pode alterar as faixas diretamente no código.
// Formato: [{ min: número (m), max: número (m), price: número (R$) }]
// Certifique-se de que as faixas sejam contínuas e sem sobreposições.
// Para adicionar mais, basta incluir novos objetos no array.
// Exemplo: Adicione { min: 501, max: 1000, price: 10 } para próxima faixa.
let distanceRanges = [
  { min: 0, max: 100, price: 5 },
  { min: 101, max: 500, price: 7 },
  { min: 501, max: 1000, price: 10 },
  { min: 1001, max: Infinity, price: 15 }, // Faixa final para distâncias maiores
];

// Carregar faixas do localStorage se existirem (para persistência)
if (localStorage.getItem("distanceRanges")) {
  distanceRanges = JSON.parse(localStorage.getItem("distanceRanges"));
}

// Função para salvar faixas no localStorage
function saveRanges() {
  localStorage.setItem("distanceRanges", JSON.stringify(distanceRanges));
}

// Inicializar PlaceAutocompleteElement
let autocompleteElement;
let selectedPlace = null; // Armazenar o place selecionado
async function initAutocomplete() {
  try {
    // Importar a biblioteca places
    const { PlaceAutocompleteElement } =
      await google.maps.importLibrary("places");

    // Criar o elemento de autocomplete
    autocompleteElement = new PlaceAutocompleteElement({
      componentRestrictions: { country: "BR" }, // Restringir ao Brasil
    });

    // Anexar ao container
    document
      .getElementById("autocomplete-container")
      .appendChild(autocompleteElement);

    // Listener para quando um place é selecionado
    autocompleteElement.addEventListener("gmp-placeselect", async (event) => {
      const { place } = event;
      selectedPlace = await place.fetchFields({
        fields: ["displayName", "formattedAddress", "addressComponents"],
      });
    });

    // Adicionar listener para enter no elemento (para acessibilidade)
    autocompleteElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        document.getElementById("calculate-btn").click();
      }
    });
  } catch (error) {
    console.error("Erro ao inicializar autocomplete:", error);
    showError("Erro ao carregar o autocomplete do Google Maps.");
  }
}

// Calcular taxa baseada na distância
function calculateFee(distanceInMeters) {
  for (let range of distanceRanges) {
    if (
      distanceInMeters >= range.min &&
      (distanceInMeters <= range.max || range.max === Infinity)
    ) {
      return range.price;
    }
  }
  return null; // Se não encontrar faixa (erro)
}

// Formatar distância para exibição
function formatDistance(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1) + " km";
  }
  return meters + " m";
}

// Verificar se o endereço está em Recife ou Olinda
function isInAllowedCity(place) {
  if (!place || !place.addressComponents) return false;
  const cityComponent = place.addressComponents.find((comp) =>
    comp.types.includes("administrative_area_level_2"),
  );
  const city = cityComponent ? cityComponent.longName.toLowerCase() : "";
  return city.includes("recife") || city.includes("olinda");
}

// Evento do botão calcular
document.getElementById("calculate-btn").addEventListener("click", async () => {
  if (!autocompleteElement) {
    showError("Autocomplete não inicializado.");
    return;
  }

  const destinationInput = autocompleteElement.value; // Obter o valor digitado
  if (!destinationInput) {
    showError("Por favor, digite um endereço de destino.");
    return;
  }

  showLoading(true);
  hideResult();
  hideError();

  // Usar o place selecionado se disponível
  if (selectedPlace) {
    // Verificar cidade
    if (!isInAllowedCity(selectedPlace)) {
      showError("Entregas disponíveis apenas em Recife e Olinda.");
      showLoading(false);
      return;
    }
    calculateDistance(selectedPlace.formattedAddress);
  } else {
    // Se não selecionado, usar o texto como destino
    calculateDistance(destinationInput);
  }
});

// Função para calcular distância usando Distance Matrix API
async function calculateDistance(destinationAddress) {
  try {
    // Importar a biblioteca routes para DistanceMatrixService
    const { DistanceMatrixService } = await google.maps.importLibrary("routes");

    const service = new DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [ORIGIN_ADDRESS],
        destinations: [destinationAddress],
        travelMode: "DRIVING",
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (response, status) => {
        showLoading(false);
        if (status === "OK") {
          const result = response.rows[0].elements[0];
          if (result.status === "OK") {
            const distanceInMeters = result.distance.value;
            const fee = calculateFee(distanceInMeters);
            if (fee !== null) {
              showResult(
                `Distância: ${formatDistance(distanceInMeters)}<br>Taxa de Entrega: R$ ${fee.toFixed(2)}`,
              );
            } else {
              showError("Distância fora das faixas configuradas.");
            }
          } else {
            showError("Endereço de destino não encontrado ou inválido.");
          }
        } else {
          showError("Erro ao calcular distância. Tente novamente.");
        }
      },
    );
  } catch (error) {
    showLoading(false);
    console.error("Erro ao carregar DistanceMatrixService:", error);
    showError("Erro ao calcular distância.");
  }
}

// Funções de UI
function showLoading(show) {
  document.getElementById("loading").classList.toggle("hidden", !show);
}

function showResult(message) {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = message;
  resultDiv.classList.remove("hidden");
  resultDiv.focus(); // Focar no resultado para leitores de tela
}

function hideResult() {
  document.getElementById("result").classList.add("hidden");
}

function showError(message) {
  const errorDiv = document.getElementById("error");
  errorDiv.textContent = message;
  errorDiv.classList.remove("hidden");
  errorDiv.focus(); // Focar no erro para leitores de tela
}

function hideError() {
  document.getElementById("error").classList.add("hidden");
}

// Seção Administrativa
function renderRanges() {
  const list = document.getElementById("ranges-list");
  list.innerHTML = "";
  distanceRanges.forEach((range, index) => {
    const item = document.createElement("div");
    item.classList.add("range-item");
    item.setAttribute("role", "listitem");
    const uniqueId = `range-${index}`;
    item.innerHTML = `
            <label for="${uniqueId}-min">Mínimo (m):</label>
            <input type="number" id="${uniqueId}-min" value="${range.min}" class="min-input" placeholder="Min (m)" aria-required="true">
            
            <label for="${uniqueId}-max">Máximo (m):</label>
            <input type="number" id="${uniqueId}-max" value="${range.max === Infinity ? "" : range.max}" class="max-input" placeholder="Max (m) ou vazio para infinito">
            
            <label for="${uniqueId}-price">Preço (R$):</label>
            <input type="number" id="${uniqueId}-price" value="${range.price}" class="price-input" placeholder="Preço (R$)" step="0.01" aria-required="true">
            
            <button class="save-btn">Salvar</button>
            <button class="delete-btn">Excluir</button>
        `;
    // Evento salvar
    item.querySelector(".save-btn").addEventListener("click", () => {
      const min = parseInt(item.querySelector(".min-input").value);
      const maxInput = item.querySelector(".max-input").value;
      const max = maxInput ? parseInt(maxInput) : Infinity;
      const price = parseFloat(item.querySelector(".price-input").value);
      if (!isNaN(min) && !isNaN(price) && (max === Infinity || !isNaN(max))) {
        distanceRanges[index] = { min, max, price };
        saveRanges();
        renderRanges();
      } else {
        alert("Valores inválidos."); // Pode ser substituído por erro mais acessível
      }
    });
    // Evento excluir
    item.querySelector(".delete-btn").addEventListener("click", () => {
      distanceRanges.splice(index, 1);
      saveRanges();
      renderRanges();
    });
    list.appendChild(item);
  });
}

// Adicionar nova faixa
document.getElementById("add-range-btn").addEventListener("click", () => {
  distanceRanges.push({ min: 0, max: 0, price: 0 });
  saveRanges();
  renderRanges();
});

// Inicializar ao carregar a página
initAutocomplete();
renderRanges();
