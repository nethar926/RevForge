import {createClient} from '@supabase/supabase-js';
/** Account sign-in (Sign in with Apple / Google, cloud sync). Off until Wilson decides on accounts:
 *  while false the sign-in UI is not rendered and no auth client is created. Flip to true to restore. */
export const ACCOUNTS_ENABLED:boolean=false;
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const accountClient=ACCOUNTS_ENABLED&&url&&key?createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
