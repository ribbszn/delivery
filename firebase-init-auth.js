// ================================================================
// FIREBASE INITIALIZATION WITH AUTHENTICATION (KDS)
// ================================================================

const firebaseConfig = {
  apiKey: "AIzaSyDFFbaZmX80QezLfozPAIaIGEhIJm9z43E",
  authDomain: "ribbsznmesas.firebaseapp.com",
  databaseURL: "https://ribbsznmesas-default-rtdb.firebaseio.com",
  projectId: "ribbsznmesas",
  storageBucket: "ribbsznmesas.firebasestorage.app",
  messagingSenderId: "970185571294",
  appId: "1:970185571294:web:25e8552bd72d852283bb4f",
};

// ================================================================
// INIT FIREBASE
// ================================================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log("✅ Firebase inicializado");
}

const auth = firebase.auth();
const database = firebase.database();

// ================================================================
// CONFIGURA PERSISTÊNCIA (APENAS NA ABA)
// ================================================================

auth
  .setPersistence(firebase.auth.Auth.Persistence.SESSION)
  .then(() => {
    console.log("✅ Persistência: SESSION (fecha aba = logout)");
  })
  .catch((error) => {
    console.error("❌ Erro ao configurar persistência:", error);
  });

// ================================================================
// LOGOUT AO FECHAR ABA
// ================================================================
// REMOVIDO: beforeunload com auth.signOut() é assíncrono e o browser
// não espera a Promise resolver. A persistência SESSION já garante
// que fechar a aba/browser invalida a sessão automaticamente.

// ================================================================
// CONTROLE DE AUTENTICAÇÃO
// ================================================================

let isAuthenticated = false;

const loginScreen = document.getElementById("login-screen");
const mainHeader = document.querySelector(".kds-header");
const mainContent = document.querySelector(".kds-main");
const mainSidebar = document.querySelector(".kds-sidebar");

// Sempre começa mostrando login
if (loginScreen) loginScreen.style.display = "flex";
if (mainHeader) mainHeader.style.display = "none";
if (mainContent) mainContent.style.display = "none";
if (mainSidebar) mainSidebar.style.display = "none";

// Listener oficial do Firebase
auth.onAuthStateChanged((user) => {
  console.log("🔄 Auth state:", user ? "LOGADO" : "DESLOGADO");

  if (user) {
    isAuthenticated = true;

    if (loginScreen) loginScreen.style.display = "none";
    if (mainHeader) mainHeader.style.display = "flex";
    if (mainContent) mainContent.style.display = "grid"; // FIX: era "flex", quebrava o layout de 2 colunas
    if (mainSidebar) mainSidebar.style.display = "flex";

    if (typeof window.initKDS === "function") {
      window.initKDS();
    }
  } else {
    isAuthenticated = false;

    if (loginScreen) loginScreen.style.display = "flex";
    if (mainHeader) mainHeader.style.display = "none";
    if (mainContent) mainContent.style.display = "none";
    if (mainSidebar) mainSidebar.style.display = "none";
  }
});

// ================================================================
// LOGIN COM PIN (EMAIL FIXO)
// ================================================================

window.loginWithPin = async function (pin) {
  try {
    if (!/^\d{6}$/.test(pin)) {
      throw new Error("PIN deve ter 6 dígitos");
    }

    const email = "rbnacena@gmail.com";
    const password = pin;

    await auth.signInWithEmailAndPassword(email, password);
    console.log("✅ Login realizado");

    return { success: true };
  } catch (error) {
    console.error("❌ Erro no login:", error);

    let msg = "PIN inválido";

    switch (error.code) {
      case "auth/wrong-password":
        msg = "PIN incorreto";
        break;
      case "auth/too-many-requests":
        msg = "Muitas tentativas. Aguarde.";
        break;
      case "auth/network-request-failed":
        msg = "Sem conexão";
        break;
      default:
        msg = "Erro ao autenticar";
    }

    return { success: false, error: msg };
  }
};

// ================================================================
// LOGOUT MANUAL
// ================================================================

window.logoutKDS = async function () {
  try {
    await auth.signOut();
    location.reload();
  } catch (err) {
    console.error("Erro logout:", err);
  }
};

// ================================================================
// EXPORTS
// ================================================================

window.firebaseAuth = auth;
window.firebaseDatabase = database;
window.isAuthenticated = () => isAuthenticated;
