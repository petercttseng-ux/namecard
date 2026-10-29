# Firebase JS SDK（隨專案提供）

`firebase-sdk.js` 由 npm `firebase@13.1.0` 以 esbuild 打包，只包含本站需要的 App、Auth 與 Firestore Lite 函式，不從第三方 CDN 載入。

重新產生：

```sh
npm i firebase@13.1.0 esbuild
cat > entry.js <<'X'
export {initializeApp} from 'firebase/app';
export {getAuth,signInWithEmailAndPassword,signOut,browserLocalPersistence,setPersistence} from 'firebase/auth';
export {getFirestore,doc,getDoc,getDocs,collection,query,orderBy,runTransaction,writeBatch} from 'firebase/firestore/lite';
X
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=firebase-sdk.js
```

授權：Apache License 2.0（見檔案末尾授權註記）。
