let myProfile = null;

// ============================================================
// PROTEÇÃO CONTRA LOOP DE REDIRECIONAMENTO
// Se a página tentar redirecionar demais em pouco tempo
// (sinal de sessão bugada / ping-pong entre páginas), para
// tudo e mostra uma saída manual, em vez de ficar recarregando.
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
// GUARDA DE ACESSO — roda antes de qualquer outra coisa
// ============================================================
async function guardAndLoadProfile() {
  const { data: sessionData } = await supabaseClient.auth.getSession();

  if (!sessionData.session) {
    safeRedirect("index.html");
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, email, approved, role, owner_section")
    .eq("id", sessionData.session.user.id)
    .single();

  if (error || !profile) {
    safeRedirect("index.html");
    return null;
  }

  if (!profile.approved) {
    safeRedirect("pending.html");
    return null;
  }

  sessionStorage.removeItem("redirect_guard"); // chegou certo, zera o contador
  return profile;
}

// ============================================================
// CARTEIRA DE MOEDAS
// ============================================================
async function loadWallet() {
  const { data, error } = await supabaseClient
    .from("wallet")
    .select("balance, streak, last_claim_date")
    .eq("user_id", myProfile.id)
    .single();

  if (error || !data) return;
  renderWallet(data);
}

function renderWallet({ balance, streak, last_claim_date }) {
  document.getElementById("wallet-balance").textContent = balance;
  document.getElementById("wallet-streak").textContent = `🔥 ${streak} dia${streak === 1 ? "" : "s"}`;

  const today = new Date().toISOString().slice(0, 10);
  const claimBtn = document.getElementById("claim-btn");

  if (last_claim_date === today) {
    claimBtn.disabled = true;
    claimBtn.textContent = "Resgatado hoje ✓";
  } else {
    claimBtn.disabled = false;
    claimBtn.textContent = "Resgatar recompensa diária";
  }
}

async function claimDailyReward() {
  const btn = document.getElementById("claim-btn");
  btn.disabled = true;
  btn.textContent = "Resgatando...";

  const { data, error } = await supabaseClient.rpc("claim_daily_reward");

  if (error || !data || !data[0]) {
    btn.disabled = false;
    btn.textContent = "Resgatar recompensa diária";
    alert("Não foi possível resgatar agora. Tenta de novo em um instante.");
    return;
  }

  const result = data[0];
  const today = new Date().toISOString().slice(0, 10);
  renderWallet({ balance: result.balance, streak: result.streak, last_claim_date: today });
}

// ============================================================
// GALERIA POR TERRITÓRIO (pinguim / urso-polar)
// ============================================================
const SECTIONS = ["pinguim", "urso-polar"];
const BUCKET = "photos";

async function loadAllGalleries() {
  for (const section of SECTIONS) {
    await loadGallery(section);
  }
}

async function loadGallery(section) {
  const grid = document.getElementById(`grid-${section}`);
  if (!grid) return;

  const { data: photos, error } = await supabaseClient
    .from("photos")
    .select("id, url, storage_path")
    .eq("section", section)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="photo-empty">Não foi possível carregar as fotos.</p>`;
    return;
  }

  if (!photos || photos.length === 0) {
    grid.innerHTML = `<p class="photo-empty">Nenhuma foto por aqui ainda.</p>`;
    return;
  }

  // Fotos enviadas por upload (storage_path) precisam de um link assinado
  // temporário, já que o bucket é privado. As antigas (campo url) continuam
  // funcionando direto.
  const withUrls = await Promise.all(
    photos.map(async (p) => {
      if (p.storage_path) {
        const { data: signed } = await supabaseClient.storage
          .from(BUCKET)
          .createSignedUrl(p.storage_path, 60 * 60); // 1h
        return { ...p, displayUrl: signed?.signedUrl || "" };
      }
      return { ...p, displayUrl: p.url || "" };
    })
  );

  const isOwner = myProfile.owner_section === section;

  grid.innerHTML = withUrls
    .map(
      (p) => `
      <div class="photo-thumb" data-id="${p.id}">
        <img src="${escapeHtml(p.displayUrl)}" alt="" loading="lazy" />
        ${isOwner ? `<button class="del-btn" data-id="${p.id}" data-storage="${p.storage_path || ""}" data-section="${section}">✕</button>` : ""}
      </div>`
    )
    .join("");

  grid.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      deletePhoto(btn.dataset.id, btn.dataset.storage, btn.dataset.section)
    );
  });
}

// ------------------------------------------------------------
// Upload de arquivo (com compressão pra não pesar no celular)
// ------------------------------------------------------------
function compressImage(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    };

    reader.readAsDataURL(file);
  });
}

function triggerFileSelect(section) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (file) uploadPhoto(section, file);
  });
  input.click();
}

async function uploadPhoto(section, file) {
  const btn = document.querySelector(`[data-add-photo="${section}"]`);
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    const compressed = await compressImage(file);
    const ext = "jpg";
    const path = `${section}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from(BUCKET)
      .upload(path, compressed, { contentType: "image/jpeg" });

    if (uploadError) throw uploadError;

    const { error: insertError } = await supabaseClient
      .from("photos")
      .insert({ section, storage_path: path, uploaded_by: myProfile.id });

    if (insertError) throw insertError;

    await loadGallery(section);
  } catch (err) {
  console.error("Erro no upload:", err);
  alert(err.message || JSON.stringify(err));
} finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function deletePhoto(id, storagePath, section) {
  if (!window.confirm("Apagar essa foto?")) return;

  if (storagePath) {
    await supabaseClient.storage.from(BUCKET).remove([storagePath]);
  }

  const { error } = await supabaseClient.from("photos").delete().eq("id", id);
  if (error) {
    alert("Não foi possível apagar essa foto.");
    return;
  }
  loadGallery(section);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
// Se a página voltar do cache do navegador (botão voltar, etc),
// força um carregamento novo em vez de mostrar um estado antigo
// travado — uma das causas mais comuns de tela "piscando".
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

(async function init() {
  myProfile = await guardAndLoadProfile();
  if (!myProfile) return;

  document.getElementById("user-email").textContent = myProfile.email;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    sessionStorage.removeItem("redirect_guard");
    window.location.replace("index.html");
  });

  document.getElementById("claim-btn").addEventListener("click", claimDailyReward);

  document.querySelectorAll("[data-add-photo]").forEach((btn) => {
    btn.addEventListener("click", () => triggerFileSelect(btn.dataset.addPhoto));
  });

  loadWallet();
  loadAllGalleries();
})();
