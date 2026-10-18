import fs from 'node:fs';
import {validateConfig} from '../cloud-store.js';
const config={url:process.env.SUPABASE_URL||'',publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY||''};
if(!!config.url!==!!config.publishableKey)throw Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must both be configured.');
if(config.url)validateConfig(config);
fs.writeFileSync('public/supabase-config.js',`// Public Supabase client configuration.\nexport default ${JSON.stringify(config)};\n`);
