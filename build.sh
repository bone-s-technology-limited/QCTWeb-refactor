#!/bin/sh

rm -rf node_modules/.cache platform/app/node_modules/.cache

yarn run build:dev
