import fs from 'node:fs';
import {validateConfig} from '../cloud-store.js';
const config={url:process.env.NAMECARD_API_URL||''};
if(config.url)validateConfig(config);
fs.writeFileSync('public/backend-config.js',`// Public backend URL only.\nexport default ${JSON.stringify(config)};\n`);
