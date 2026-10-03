// ============================================================
// CLIENTE SUPABASE
// Lee URL y clave anónima desde variables de entorno Vite.
// NUNCA uses service_role ni secret keys en el frontend.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY deben estar en .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
