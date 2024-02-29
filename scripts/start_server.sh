#!/bin/bash

# * project dir
cd /home/ec2-user/wpp-server
echo "cwd::$(pwd)"
# * install deps
yarn install
# ? sharp dependency https://github.com/variantlabs-io/halo/issues/2508
npm install --arch=arm64 --platform=linuxmusl sharp
# * build
yarn build
# * run
pm2 kill
pm2 start -f dist/server.js
pm2 list
# yarn start
# node dist/server.js