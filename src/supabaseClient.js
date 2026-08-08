import { createClient } from "@supabase/supabase-js";

// La clave "anon"/publishable está pensada para exponerse en el cliente;
// el acceso real se controla con las políticas de RLS en Supabase.
const url = "https://mucojuauxsywwmalcufe.supabase.co";
const key = "sb_publishable_shlIEaiY2bGYelmy3ALQfA_HnwS1UQW";

export const supabase = createClient(url, key);
