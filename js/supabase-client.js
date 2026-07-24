// ============================================================
// Configuração do Supabase
// Troque pelos valores do seu projeto em:
// Supabase Dashboard > Project Settings > API
// ============================================================
const SUPABASE_URL = "https://goyjbypoxumuwkawfxaf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QcZFbGRkFNH4QVN2HFvT1g_jsGvwDpx";

// A lib do Supabase é carregada via CDN no HTML (window.supabase)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
