#!/bin/bash
# usage: build.sh entry.tsx out.js
set -e
export NODE_PATH=/home/claude/.npm-global/lib/node_modules
ES=/home/claude/.npm-global/lib/node_modules/tsx/node_modules/esbuild/bin/esbuild
rm -rf /home/claude/h/web && cp -r /home/claude/out/web /home/claude/h/web
cp /home/claude/h/shadow/review.ts /home/claude/h/web/lib/review.ts
cp /home/claude/h/shadow/types.ts /home/claude/h/web/lib/types.ts
cp /home/claude/h/lib/api.ts /home/claude/h/web/lib/api.ts
cat > /home/claude/h/tsconfig.json <<'J'
{ "compilerOptions": { "jsx": "react-jsx", "baseUrl": ".", "paths": { "@/*": ["web/*"] }, "target": "es2022", "module": "esnext", "moduleResolution": "bundler", "strict": true, "skipLibCheck": true } }
J
cd /home/claude/h
$ES "$1" --bundle --outfile="$2" --loader:.css=css --jsx=automatic --sourcemap=inline \
  --define:process.env.NODE_ENV='"development"' --define:process.env.NEXT_PUBLIC_HELP_PATH='"/help"' --define:process.env.NEXT_PUBLIC_EMERGENCY_NUMBER='""' \
  --alias:next/link=/home/claude/h/shims/link.tsx --alias:next/navigation=/home/claude/h/shims/nav.ts --alias:framer-motion=/home/claude/h/shims/fm.tsx \
  --tsconfig=/home/claude/h/tsconfig.json --log-level=warning
