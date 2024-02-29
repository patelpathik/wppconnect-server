#!/bin/bash

# * project dir
cd /home/ec2-user/wpp-server
echo "cwd::$(pwd)"
# * install deps
yarn install
# * build
yarn build
# * run
pm2 start -f dist/server.js
pm2 list
# yarn start
# node dist/server.js