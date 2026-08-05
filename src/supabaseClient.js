import { createClient } from "@supabase/supabase-js";

// La clave "anon"/publishable está pensada para exponerse en el cliente;
// el acceso real se controla con las políticas de RLS en Supabase.
const url = "https://arapzuoqfgezupttuxbe.supabase.co";
const key = "sb_publishable_8hSPJ0UpERG_hlLFC4RcqA_pHPtmr0I";

export const supabase = createClient(url, key);
