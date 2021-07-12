#!/bin/bash

rm -rf bin && \
    ./node_modules/.bin/tsc && \
    cp package.json bin/ && \
    npm publish ./bin --access public
