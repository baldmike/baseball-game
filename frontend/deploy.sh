#!/bin/bash
npm run build
cd dist
git add .
git commit -m "Deploy updates"
git push origin gh-pages
cd ../..
echo "Deployed! Live in 1-2 minutes at https://baldmike.github.io/baseball-game/"
