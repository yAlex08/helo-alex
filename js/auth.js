// ============================================================
// PROTEÇÃO CONTRA LOOP DE REDIRECIONAMENTO
// ============================================================
function safeRedirect(url) {
  const key = "redirect_guard";
  const now = Date.now();
  let last;
  try {
    last = JSON.parse(sessionStorage.getItem(key) || "{}");
  } catch {
    last = {};
  }
  if (!last.time || now - last.time > 4000) {
    last = { count: 0, time: now };
  }
  last.count = (last.count || 0) + 1;
  last.time = now;
  sessionStorage.setItem(key, JSON.stringify(last));

  if (last.count > 4) {
    sessionStorage.removeItem(key);
    document.body.innerHTML = `
      <div style="max-width:420px;margin:80px auto;text-align:center;font-family:Inter,sans-serif;color:#f1f5ff;padding:0 20px">
        <p style="font-size:15px;line-height:1.6">Algo travou na sessão. Isso costuma resolver limpando os dados salvos do site.</p>
        <a href="index.html" style="color:#a78bfa">Voltar para o login</a>
      </div>`;
    return;
  }

  window.location.replace(url);
}

// ============================================================
// Troca de abas (Entrar / Cadastrar)
// ============================================================
const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".form-panel");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.target).classList.add("active");
  });
});

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = `msg show ${type}`;
}

function setLoading(btn, loading, labelIdle) {
  btn.disabled = loading;
  btn.textContent = loading ? "Aguarde..." : labelIdle;
}

// ============================================================
// CADASTRO
// ============================================================
const signupForm = document.getElementById("signup-form");
const signupMsg = document.getElementById("signup-msg");

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const btn = signupForm.querySelector(".submit-btn");

  setLoading(btn, true, "Criar conta");

  const { error } = await supabaseClient.auth.signUp({ email, password });

  setLoading(btn, false, "Criar conta");

  if (error) {
    showMsg(signupMsg, traduzErro(error.message), "error");
    return;
  }

  showMsg(
    signupMsg,
    "Conta criada! Assim que for aprovada, você já vai poder entrar por aqui.",
    "success"
  );
  signupForm.reset();
});

// ============================================================
// LOGIN
// ============================================================
const loginForm = document.getElementById("login-form");
const loginMsg = document.getElementById("login-msg");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const btn = loginForm.querySelector(".submit-btn");

  setLoading(btn, true, "Entrar");

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setLoading(btn, false, "Entrar");
    showMsg(loginMsg, traduzErro(error.message), "error");
    return;
  }

  // Login ok no Auth — agora checa se já foi aprovado
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("approved, role, owner_section")
    .eq("id", data.user.id)
    .single();

  setLoading(btn, false, "Entrar");

  if (profileError || !profile) {
    showMsg(loginMsg, "Não achamos seu perfil. Tente novamente em instantes.", "error");
    return;
  }

  if (!profile.approved) {
    safeRedirect("pending.html");
    return;
  }

  // Aprovado -> segue para a área principal do site
  safeRedirect("home.html");
});

// ============================================================
// Mensagens de erro mais amigáveis
// ============================================================
function traduzErro(msg) {
  const mapa = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "User already registered": "Esse e-mail já tem uma conta.",
    "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
  };
  return mapa[msg] || msg;
}

// ============================================================
// Se já estiver logado, redireciona direto
// ============================================================
(async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("approved")
    .eq("id", data.session.user.id)
    .single();

  if (profile?.approved) {
    safeRedirect("home.html");
  } else if (profile) {
    safeRedirect("pending.html");
  }
})();
