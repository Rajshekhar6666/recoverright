#!/bin/bash
set -e
export NODE_PATH=/home/claude/.npm-global/lib/node_modules
ES=/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild/bin/esbuild
cd /home/claude/h2
rm -rf web && cp -r /home/claude/p2/web web
cat > tsconfig.json <<'J'
{ "compilerOptions": { "jsx": "react-jsx", "baseUrl": ".", "paths": { "@/*": ["web/*"] }, "target": "es2022", "module": "esnext", "moduleResolution": "bundler", "strict": true, "skipLibCheck": true } }
J
$ES staff-entry.tsx --bundle --outfile=staff.js --loader:.css=css --jsx=automatic --sourcemap=inline \
  --define:process.env.NODE_ENV='"development"' --define:process.env.NEXT_PUBLIC_API_URL='"http://localhost:4180"' \
  --alias:next/link=/home/claude/h2/shims/link.tsx --alias:next/navigation=/home/claude/h2/shims/nav.ts --alias:framer-motion=/home/claude/h2/shims/fm.tsx \
  --tsconfig=/home/claude/h2/tsconfig.json --log-level=warning
